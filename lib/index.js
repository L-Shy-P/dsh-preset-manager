/**
 * preset-manager — 会话中途切换 Agent 预设 + 模型侧预设管理 + 按预设注入工具引导。
 *
 * 三块能力：
 *
 * 1) 用户斜杠命令（原有）：
 *      /preset            列出全部预设（中文名），标记当前预设
 *      /preset <id>       把本会话切到 <id>
 *
 * 2) 模型工具（宿主级注册，按预设开关过滤可见性）：
 *      list_agent_presets                 列出全部预设与当前会话的预设
 *      set_my_preset                      切换“自己”的预设（仅当用户明确要求）
 *      set_subagent_preset                切换“自己创建的子代理”的预设
 *
 * 3) 工具引导提示词（系统提示词段）：
 *    只对“开启引导”的预设注入；开关来自本插件行 Config 的 volatile 字段，
 *    设置页可以逐预设编辑，并有一个总开关（关闭时保留逐预设状态）。
 *    默认：standard / ptc / cordis 开启，minimal 与自定义预设关闭。
 *
 * 切换机制：`agentPresets.recompose(agent.ctx, id)` 只重绑 Agent scope 的预设
 * 父节点；随后追加 `agent-preset/selected` 事件（客户端投影 / 重启恢复据此
 * 认出预设），再通过 `agent.inject()` 在下一次模型调用前插入变更说明。
 * 会话历史、工具结果、消息都不动。
 *
 * 说明：预设在宿主启动时已 eager mount，切换只是改 scope 父链；旧预设的
 * scope 不会被销毁（generation 未 retired），所以切回去时按会话记忆的状态还在。
 */

import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

/** Cordis 插件名（loader 诊断用）。 */
export const name = 'preset-manager'

/** 需要的宿主服务。 */
export const inject = ['commands', 'tools', 'systemPrompt', 'agents', 'agentPresets', 'sessionProjections']

const COMMAND_NAME = 'preset'
const NOTICE_SOURCE = 'preset-manager'
const USAGE_HINT = '用法：/preset <preset-id>；不带参数则列出全部可用预设'

/** 内置预设的中文显示名（声明未提供 name 时使用）。 */
const BUILTIN_NAMES = {
	standard: '标准模式',
	ptc: 'PTC 模式',
	minimal: '极简模式',
	cordis: '创造模式'
}

/** 内置预设的英文原名（展开详情里展示）。 */
const BUILTIN_EN = {
	standard: 'Standard mode',
	ptc: 'PTC mode',
	minimal: 'Minimal mode',
	cordis: 'Creator mode'
}

/** 默认开启工具引导的内置预设（minimal 不在其中；better-standard 视作标准类）。 */
const DEFAULT_GUIDANCE_ON = new Set(['standard', 'ptc', 'cordis', 'better-standard'])

/** 每次切换都会附带的上下文说明（不随缓存提示变化）。 */
const CONTEXT_LINE = '对话上下文保留，从下一轮起生效。'

/** 缓存命中率提示（只在真正切换到不同预设时出现）。 */
const CACHE_LINE = '切换预设可能导致缓存命中率大幅降低。'

/** 模型侧预设管理工具名（按预设开关过滤可见性时使用）。 */
const TOOL_NAMES = ['list_agent_presets', 'set_my_preset', 'set_subagent_preset']

/** 系统提示词里的工具引导段（子代理策略部分按设置动态追加）。 */
const GUIDANCE_HEAD = [
	'## 预设管理',
	'- 用 `list_agent_presets` 查看全部 Agent 预设（id、名称、说明）与当前会话的预设。',
	'- `set_my_preset` 只用于「用户明确要求你切换自己的预设」；除此之外的任何情况都不要主动修改自己的预设。',
	'- `set_subagent_preset` 可以修改你创建的子代理会话的预设；只有确有必要时才为它指定不同预设。',
	'- 创建子代理时，如果当前预设的委派工具提供 `agent_preset` 参数，可以直接在创建时指定；否则创建后用 `set_subagent_preset` 调整。',
	'- 切换预设会改变该代理的系统提示词与工具目录，并可能让下一次请求的前缀缓存失效；不要频繁切换，也不要用它来试探。'
]

// ── 宿主 schemastery（用于让本插件拥有可在设置页编辑的 volatile Config） ──
// 插件位于 profile 目录，静态 import 会解析到 profile 的旧依赖树；改从
// Electron 安装包内 require 宿主自己那份 schemastery。非 Electron 环境
// （例如安装脚本的普通 Node 校验）拿不到时降级为“无 Config”，插件本身照常工作。
let schema = undefined
function loadSchema() {
	const req = createRequire(import.meta.url)
	const resources = typeof process.resourcesPath === 'string' ? process.resourcesPath : undefined
	if (resources !== undefined) {
		try {
			return req(path.join(resources, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'schemastery'))
		} catch {
			// fall through to bare resolution
		}
	}
	try {
		return req('@deepseek-ai/schemastery')
	} catch {
		return undefined
	}
}
try {
	schema = loadSchema()
} catch {
	schema = undefined
}

/** 可编辑配置（设置页通过 settings 命名空间持久化到 profile patch）。 */
function buildConfig(z) {
	try {
		return z.object({
			guidanceMaster: z.boolean().default(true).volatile(),
			guidancePresets: z.array(z.object({ id: z.string(), enabled: z.boolean() })).default([]).volatile(),
			subagentInherit: z.boolean().default(true).volatile(),
			subagentDefault: z.string().default('').volatile(),
			subagentAllowed: z.array(z.string()).default([]).volatile()
		})
	} catch {
		// 旧版 schemastery（无 volatile）时退回“无设置表单”，插件工具与默认引导照常工作。
		try {
			return z.object({
				guidanceMaster: z.boolean().default(true),
				guidancePresets: z.array(z.object({ id: z.string(), enabled: z.boolean() })).default([]),
				subagentInherit: z.boolean().default(true),
				subagentDefault: z.string().default(''),
				subagentAllowed: z.array(z.string()).default([])
			})
		} catch {
			return undefined
		}
	}
}

export const Config = schema === undefined ? undefined : buildConfig(schema)

function readConfigValue(value, fallback) {
	if (value === undefined || value === null) return fallback
	if (typeof value === 'object' && typeof value.get === 'function') {
		try {
			return value.get()
		} catch {
			return fallback
		}
	}
	return value
}

/** 某个预设是否开启工具引导（总开关关闭时一律关闭，但保留逐预设配置）。 */
function guidanceEnabled(presetId, config) {
	if (typeof presetId !== 'string') return false
	if (!readConfigValue(config?.guidanceMaster, true)) return false
	const list = readConfigValue(config?.guidancePresets, [])
	if (Array.isArray(list)) {
		const entry = list.find((item) => item !== null && typeof item === 'object' && item.id === presetId)
		if (entry !== undefined && typeof entry.enabled === 'boolean') return entry.enabled
	}
	return DEFAULT_GUIDANCE_ON.has(presetId)
}

function errorText(error) {
	return error instanceof Error ? error.message : String(error)
}

/** 子代理预设策略（设置页可编辑；allowed 为空表示不限制）。 */
function policyOf(config) {
	const inherit = readConfigValue(config?.subagentInherit, true) !== false
	const fallbackRaw = readConfigValue(config?.subagentDefault, '')
	const fallback = typeof fallbackRaw === 'string' && fallbackRaw.trim() !== '' ? fallbackRaw.trim() : undefined
	const allowedRaw = readConfigValue(config?.subagentAllowed, [])
	const allowed = Array.isArray(allowedRaw) ? allowedRaw.filter((id) => typeof id === 'string' && id !== '') : []
	return { inherit, fallback, allowed }
}

/** 引导段里描述子代理策略的几行。 */
function policyGuidanceLines(policy) {
	const lines = []
	if (policy.allowed.length > 0) lines.push(`- 子代理可选的预设 id：${policy.allowed.join('、')}；只能从这些预设里为子代理选择。`)
	if (!policy.inherit) {
		lines.push(
			policy.fallback === undefined
				? '- 子代理不再默认继承父代理；创建子代理时必须显式选择 `agent_preset`，且只能选允许列表里的预设。'
				: `- 子代理默认预设是「${policy.fallback}」；创建子代理时省略 \`agent_preset\` 会自动使用它。`
		)
	} else {
		lines.push('- 子代理默认继承父代理当时的预设。')
	}
	return lines
}

/** js-yaml（导入预设包时解析内容；从安装包内取宿主那份）。 */
let yamlLib
try {
	const req = createRequire(import.meta.url)
	const resources = typeof process.resourcesPath === 'string' ? process.resourcesPath : undefined
	if (resources !== undefined) {
		try {
			yamlLib = req(path.join(resources, 'app.asar', 'dsh', 'node_modules', 'js-yaml'))
		} catch {
			yamlLib = undefined
		}
	}
	if (yamlLib === undefined) yamlLib = req('js-yaml')
} catch {
	yamlLib = undefined
}

// ── 预设可用性检测（导入预设包时用）─────────────────────────────────

/** 递归收集预设插件清单里的模块名（含 group 的 config 数组）。 */
function collectPluginNames(rows, out = []) {
	if (!Array.isArray(rows)) return out
	for (const row of rows) {
		if (row === null || typeof row !== 'object') continue
		if (typeof row.name === 'string' && row.name !== '') out.push(row.name)
		if (Array.isArray(row.config)) collectPluginNames(row.config, out)
	}
	return out
}

/** 模块名 → 包名（`@scope/pkg/sub` → `@scope/pkg`，`pkg/sub` → `pkg`）。 */
function packageNameOf(specifier) {
	if (specifier.startsWith('@')) {
		const parts = specifier.split('/')
		return parts.length >= 2 ? parts[0] + '/' + parts[1] : specifier
	}
	return specifier.split('/')[0]
}

/** 列出某个 node_modules 下的包名（含 @scope 一层）。 */
function scanNodeModules(root, out) {
	let entries
	try {
		entries = fs.readdirSync(root, { withFileTypes: true })
	} catch {
		return
	}
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith('.')) continue
		if (entry.name.startsWith('@')) {
			let scoped
			try {
				scoped = fs.readdirSync(path.join(root, entry.name), { withFileTypes: true })
			} catch {
				continue
			}
			for (const child of scoped) {
				if (child.isDirectory()) out.add(entry.name + '/' + child.name)
			}
			continue
		}
		out.add(entry.name)
	}
}

/**
 * 当前部署可用的插件包集合：宿主运行时包、profile 的 node_modules、
 * 以及所有已注册预设实际用到的模块名。
 */
async function availablePluginPackages(ctx, presets, profileDir) {
	const available = new Set(['cordis:group', 'cordis:include', 'cordis:plugin-group'])
	// 1) 宿主运行时自带的包
	const resources = typeof process.resourcesPath === 'string' ? process.resourcesPath : undefined
	if (resources !== undefined) {
		scanNodeModules(path.join(resources, 'app.asar', 'dsh', 'node_modules'), available)
	}
	// 2) profile / profiles 共享 node_modules 里安装的插件
	scanNodeModules(path.join(profileDir, 'node_modules'), available)
	scanNodeModules(path.join(profileDir, '..', 'node_modules'), available)
	// 3) 已注册预设实际引用的模块（某已装插件会出现在这里）
	try {
		for (const row of await presets.list()) {
			let document
			try {
				document = await presets.readDocument(row.id)
			} catch {
				continue
			}
			if (yamlLib === undefined || typeof document?.content !== 'string') continue
			const jsType = new yamlLib.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (data) => data })
			try {
				const plugins = yamlLib.load(document.content, { schema: yamlLib.DEFAULT_SCHEMA.extend([jsType]) })
				for (const name of collectPluginNames(plugins)) {
					available.add(name)
					available.add(packageNameOf(name))
				}
			} catch {
				// 解析失败的预设不影响集合构建。
			}
		}
	} catch {
		// roster 不可用时只依赖前两类来源。
	}
	return available
}

/** 判断一个模块名是否可用；返回 undefined 表示可用，否则返回原因。 */
function pluginAvailability(specifier, available, profileDir) {
	if (specifier.startsWith('cordis:')) return void 0
	if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) {
		try {
			const file = specifier.startsWith('file:') ? new URL(specifier) : new URL(specifier, pathToFileURL(profileDir + path.sep))
			const resolved = file.protocol === 'file:' ? fileURLToPath(file) : specifier
			return fs.existsSync(resolved) ? void 0 : '本地路径不存在'
		} catch {
			return '本地路径无法解析'
		}
	}
	const pkg = packageNameOf(specifier)
	if (available.has(specifier) || available.has(pkg)) return void 0
	if (pkg.startsWith('@deepseek-ai/')) return void 0
	return '未安装该插件包'
}


/** 预设的展示名：声明名优先，其次内置中文名，最后 id。 */
function labelOf(row, fallbackId) {
	if (row) return row.name ?? BUILTIN_NAMES[row.id] ?? row.id
	if (typeof fallbackId === 'string') return BUILTIN_NAMES[fallbackId] ?? fallbackId
	return '（未知）'
}

/** 内置预设的英文原名；自定义预设不臆造英文名。 */
function englishOf(row) {
	return row && row.name === undefined ? BUILTIN_EN[row.id] : undefined
}

/** 详情里的 “名称（id；英文名 …）” 形式。 */
function detailOf(row, fallbackId) {
	const id = row?.id ?? fallbackId
	if (id === undefined) return labelOf(row, fallbackId)
	const english = englishOf(row)
	return `${labelOf(row, fallbackId)}（${id}${english === undefined ? '' : `；英文名 ${english}`}）`
}

/**
 * 读取会话事件。0.2.1 的 Session 暴露 `log` 数组 / `snapshotEvents()`；
 * 没有旧的 `events` 字段。
 */
function sessionEvents(session) {
	if (Array.isArray(session?.log)) return session.log
	if (typeof session?.snapshotEvents === 'function') {
		try {
			return session.snapshotEvents(0)
		} catch {
			return []
		}
	}
	return []
}

/**
 * 上一次模型请求实际使用的预设：最近一次 `turn/start` 时刻生效的预设。
 * 没有跑过回合时返回 undefined（首次请求尚未发生，不存在缓存被破坏的问题）。
 */
function committedPreset(session) {
	const events = sessionEvents(session)
	let current = typeof session?.header?.agentPreset === 'string' ? session.header.agentPreset : undefined
	let committed
	for (const event of events) {
		if (event?.type === 'agent-preset/selected') {
			const next = event.data?.agentPreset
			if (typeof next === 'string') current = next
		} else if (event?.type === 'turn/start') {
			committed = current
		}
	}
	return committed
}

/** 模型下一轮看到的那段上下文说明。 */
function noticeText(fromRow, fromId, toRow) {
	const description = toRow.description ? `\n新预设说明：${toRow.description}` : ''
	return [
		'[Agent 预设已切换]',
		`本会话的 Agent 预设从「${labelOf(fromRow, fromId)}」切换为「${labelOf(toRow)}」。`,
		'此前全部对话历史与工具结果保持有效；从本轮开始，系统提示词、工具目录与行为规则按新预设执行。' + description,
		'请直接按新预设继续工作，不必向用户复述本提示。'
	].join('\n')
}

/** 命令 / 卡片结果：第一行摘要 + 固定上下文句 + 展开可见的详情。 */
function resultText(fromRow, fromId, toRow, cacheChanged) {
	const lines = [
		`切换预设：「${labelOf(fromRow, fromId)}」→「${labelOf(toRow)}」`,
		CONTEXT_LINE,
		'',
		`原预设：${detailOf(fromRow, fromId)}`,
		`新预设：${detailOf(toRow)}`
	]
	if (toRow.description) lines.push(`说明：${toRow.description}`)
	if (cacheChanged) {
		lines.push('')
		lines.push(`缓存：${CACHE_LINE}`)
	}
	return lines.join('\n')
}

/** 注册 `/preset` 命令、模型工具、引导段与工具过滤。 */
export function apply(ctx, config = {}) {
	const presets = () => ctx.agentPresets
	const rosterOf = async () => presets().list()
	const currentPresetOf = (agent) => {
		try {
			return presets().composedPreset(agent.ctx)
		} catch {
			return undefined
		}
	}

	/**
	 * 切换一个 Agent（自己或子代理）的预设。所有失败都返回结构化结果，
	 * 不把异常抛给命令 / 工具边界之外的调用方。
	 */
	async function switchAgent(agent, wanted) {
		if (!agent || typeof agent.inject !== 'function' || !agent.ctx || !agent.session) {
			return { ok: false, text: '拿不到目标 Agent 的上下文，无法切换预设。' }
		}
		const phaseKind = agent.phase?.kind
		if (agent.status !== 'idle' || (phaseKind !== undefined && phaseKind !== 'idle')) {
			return { ok: false, text: '目标 Agent 正在执行回合，等它空闲后再切换预设。' }
		}
		const roster = await rosterOf()
		const currentId = currentPresetOf(agent)
		const current = roster.find((row) => row.id === currentId)
		const target = roster.find((row) => row.id === wanted)
		if (target === undefined) {
			const available = roster.filter((row) => row.broken === undefined).map((row) => row.id).join('、')
			return { ok: false, text: `没有名为「${wanted}」的预设。可用：${available}` }
		}
		if (target.broken !== undefined) {
			return { ok: false, text: `预设「${wanted}」当前不可用：${target.broken}` }
		}
		if (wanted === currentId) {
			return { ok: true, text: `已经是「${labelOf(target)}」，无需切换。`, presetId: wanted }
		}

		// 重绑定：只换 Agent scope 的预设父节点，历史与工具结果不动。
		const committed = committedPreset(agent.session)
		await presets().recompose(agent.ctx, wanted)

		// 记录变更（客户端投影 / resume 都靠它）；失败则回滚重绑。
		try {
			agent.session.append('agent-preset/selected', { agentPreset: wanted })
		} catch (error) {
			if (currentId !== undefined) await presets().recompose(agent.ctx, currentId).catch(() => {})
			return { ok: false, text: `切换失败（记录预设变更时出错，已回滚）：${errorText(error)}` }
		}

		// 在下一次模型调用前插入一段“预设已变更”的上下文说明。
		try {
			agent.inject({
				id: `preset-manager-${Date.now().toString(36)}`,
				role: 'user',
				content: [{ type: 'text', text: noticeText(current, currentId, target) }],
				source: { kind: NOTICE_SOURCE }
			})
		} catch {
			// 说明注入失败不影响切换本身。
		}

		const cacheChanged = committed !== undefined && committed !== wanted
		return {
			ok: true,
			presetId: wanted,
			cacheChanged,
			text: resultText(current, currentId, target, cacheChanged)
		}
	}

	// ── 用户命令 ───────────────────────────────────────────────────────
	ctx.commands.register({
		name: COMMAND_NAME,
		description: '在当前会话中途切换 Agent 预设（保留上下文，下一轮起生效；不带参数则列出可用预设）',
		input: { hint: '<preset-id>' },
		async handler(invocation) {
			try {
				const agent = invocation?.agent
				const wanted = String(invocation?.rawInput ?? '').trim()
				if (!agent) return { kind: 'error', text: '当前环境不支持在会话中切换预设（拿不到 Agent 上下文）。' }
				const roster = await rosterOf()
				if (!wanted) {
					const currentId = currentPresetOf(agent)
					const lines = roster.map((row) => {
						const marks = []
						if (row.id === currentId) marks.push('当前')
						if (row.broken !== undefined) marks.push('不可用：' + row.broken.split('\n')[0])
						return `- ${labelOf(row)}（${row.id}）${marks.length > 0 ? '  [' + marks.join('；') + ']' : ''}`
					})
					return { kind: 'success', text: `可用预设：\n${lines.join('\n')}\n\n${USAGE_HINT}` }
				}
				const result = await switchAgent(agent, wanted)
				return { kind: result.ok ? 'success' : 'error', text: result.text }
			} catch (error) {
				return { kind: 'error', text: `切换预设失败：${errorText(error)}` }
			}
		}
	})

	// ── 预设包（导出 / 导入）：导入直接写 profile patch，无需新插件 ────
	ctx.commands.register({
		name: 'preset-export',
		description: '导出一个 Agent 预设为 JSON 包（含插件清单），可保存后在其他会话/机器导入',
		input: { hint: '<preset-id>' },
		async handler(invocation) {
			try {
				const id = String(invocation?.rawInput ?? '').trim()
				if (!id) return { kind: 'error', text: '用法：/preset-export <preset-id>' }
				const document = await presets().readDocument(id)
				let requires = []
				if (yamlLib !== undefined) {
					try {
						const jsType = new yamlLib.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (data) => data })
						const plugins = yamlLib.load(String(document.content ?? ''), { schema: yamlLib.DEFAULT_SCHEMA.extend([jsType]) })
						requires = [...new Set(collectPluginNames(plugins))]
					} catch {
						requires = []
					}
				}
				const pkg = {
					format: 'dsh-agent-preset/1',
					id: document.agentPreset,
					...(document.name === undefined ? {} : { name: document.name }),
					...(document.description === undefined ? {} : { description: document.description }),
					...(requires.length === 0 ? {} : { requires }),
					content: document.content
				}
				return { kind: 'success', text: JSON.stringify(pkg) }
			} catch (error) {
				return { kind: 'error', text: `导出失败：${errorText(error)}` }
			}
		}
	})

	ctx.commands.register({
		name: 'preset-import',
		description: '导入 Agent 预设包（base64 编码的 JSON），直接追加到 profile patch，无需新插件',
		input: { hint: '<base64>' },
		async handler(invocation) {
			try {
				const raw = String(invocation?.rawInput ?? '').trim()
				if (!raw) return { kind: 'error', text: '用法：/preset-import <base64>（或 /preset-import --force <base64> 跳过依赖检查）' }
				const force = raw.startsWith('--force ')
				const payload = force ? raw.slice('--force '.length).trim() : raw
				let pkg
				try {
					pkg = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
				} catch {
					return { kind: 'error', text: '预设包不是合法的 base64 JSON' }
				}
				if (pkg === null || typeof pkg !== 'object' || pkg.format !== 'dsh-agent-preset/1') {
					return { kind: 'error', text: '不支持的预设包格式（需要 dsh-agent-preset/1）' }
				}
				const id = typeof pkg.id === 'string' ? pkg.id.trim() : ''
				if (!/^[a-z0-9][a-z0-9_-]*$/u.test(id)) {
					return { kind: 'error', text: '预设 id 只能包含小写字母、数字、- 和 _，且不能以符号开头' }
				}
				const roster = await rosterOf()
				if (roster.some((row) => row.id === id)) return { kind: 'error', text: `预设「${id}」已存在，不能重复导入` }
				if (yamlLib === undefined) return { kind: 'error', text: '宿主缺少 YAML 解析器，无法导入' }
				const jsType = new yamlLib.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (data) => data })
				const yamlSchema = yamlLib.DEFAULT_SCHEMA.extend([jsType])
				const content = String(pkg.content ?? '').replace(/\s+$/, '')
				let plugins
				try {
					plugins = yamlLib.load(content, { schema: yamlSchema })
				} catch (error) {
					return { kind: 'error', text: `预设内容不是合法 YAML：${errorText(error)}` }
				}
				if (!Array.isArray(plugins) || plugins.length === 0) return { kind: 'error', text: '预设内容为空' }
				const patchPath = ctx.get('configEditor')?.documentPath
				if (typeof patchPath !== 'string' || patchPath === '') return { kind: 'error', text: '拿不到 profile patch 路径，无法导入' }
				const profileDir = path.dirname(patchPath)
				const names = [...new Set(collectPluginNames(plugins))]
				const available = await availablePluginPackages(ctx, presets(), profileDir)
				const missing = []
				for (const specifier of names) {
					const reason = pluginAvailability(specifier, available, profileDir)
					if (reason !== undefined) missing.push({ specifier, reason })
				}
				if (missing.length > 0 && !force) {
					const lines = missing.slice(0, 12).map((item) => `- ${item.specifier}：${item.reason}`)
					if (missing.length > 12) lines.push(`- …共 ${missing.length} 个`)
					return {
						kind: 'error',
						text: `导入被拒绝：该预设依赖当前部署未安装的插件。\n${lines.join('\n')}\n\n预设只能使用原版/当前 profile 已安装的插件；请先在「插件」页安装这些插件，或改用 /preset-import --force <base64> 强制导入（导入后该预设会显示为不可用）。`
					}
				}
				const name = typeof pkg.name === 'string' && pkg.name.trim() !== '' ? pkg.name.trim() : undefined
				const description = typeof pkg.description === 'string' && pkg.description.trim() !== '' ? pkg.description.trim() : undefined
				// 内容按原 YAML 文本缩进写入（`plugins:` 下 10 空格），保留 `!!js` 表达式。
				const block = [
					'- insert:',
					`    - id: preset-${id}`,
					"      name: '@deepseek-ai/dsh-agent-preset'",
					'      config:',
					`        id: ${id}`,
					...(name === undefined ? [] : [`        name: ${JSON.stringify(name)}`]),
					...(description === undefined ? [] : [`        description: ${JSON.stringify(description)}`]),
					'        plugins:',
					...content.split('\n').map((line) => (line === '' ? '' : '          ' + line))
				].join('\n')
				const before = fs.readFileSync(patchPath, 'utf8')
				const backupPath = patchPath + '.bak-preset-import-' + Date.now()
				fs.writeFileSync(backupPath, before, 'utf8')
				fs.appendFileSync(patchPath, (before.endsWith('\n') ? '\n' : '\n\n') + block + '\n', 'utf8')
				// 等 loader 重新加载，确认预设真的能挂载（而不是只写进 patch）。
				let registered
				const deadline = Date.now() + 5000
				while (Date.now() < deadline) {
					await new Promise((resolve) => setTimeout(resolve, 300))
					try {
						const list = await presets().list()
						registered = list.find((row) => row.id === id)
					} catch {
						registered = undefined
					}
					if (registered !== undefined) break
				}
				if (registered !== undefined && registered.broken !== undefined) {
					const reason = String(registered.broken).split('\n')[0]
					if (!force) {
						fs.copyFileSync(backupPath, patchPath)
						return { kind: 'error', text: `预设已写入但加载失败，已自动回滚：${reason}` }
					}
					return { kind: 'success', text: `已导入「${name ?? id}」，但当前不可用：${reason}` }
				}
				if (registered === undefined) {
					return { kind: 'success', text: `已导入「${name ?? id}」（${id}）；若预设列表里还没出现，请刷新页面或重启应用。` }
				}
				return { kind: 'success', text: `已导入预设「${name ?? id}」（${id}）：${names.length} 个插件模块均已安装，可用性检查通过。` }
			} catch (error) {
				return { kind: 'error', text: `导入失败：${errorText(error)}` }
			}
		}
	})

	// ── 模型工具 ───────────────────────────────────────────────────────
	const textOutput = {
		schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] },
		render: (_args, value) => [{ type: 'text', text: value.text }]
	}

	ctx.tools.register({
		name: 'list_agent_presets',
		description:
			'列出全部可用的 Agent 预设（id、中文名、说明）以及当前会话正在使用的预设。切换预设前先用它确认目标 id。',
		parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
		output: textOutput,
		isConcurrencySafe: () => true,
		async execute(_args, exec) {
			const roster = await rosterOf()
			const currentId = exec?.agent === undefined ? undefined : currentPresetOf(exec.agent)
			const lines = roster.map((row) => {
				const marks = []
				if (row.id === currentId) marks.push('当前')
				if (row.broken !== undefined) marks.push('不可用')
				const description = row.description ? ` — ${row.description.split('\n')[0].slice(0, 120)}` : ''
				return `- ${row.id}: ${labelOf(row)}${description}${marks.length > 0 ? '  [' + marks.join('；') + ']' : ''}`
			})
			return { text: `可用预设：\n${lines.join('\n')}` }
		}
	})

	ctx.tools.register({
		name: 'set_my_preset',
		description:
			'切换“你自己”的 Agent 预设。仅在用户明确要求你更换自己的预设时使用；其他任何时候都不要主动调用。切换会保留全部对话历史，从下一轮请求起生效，并可能使前缀缓存失效。',
		parameters: {
			type: 'object',
			properties: { preset: { type: 'string', description: '目标预设 id（先用 list_agent_presets 查询）' } },
			required: ['preset'],
			additionalProperties: false
		},
		output: textOutput,
		async execute(args, exec) {
			const agent = exec?.agent
			if (!agent) throw new Error('set_my_preset 需要 Agent 上下文')
			const result = await switchAgent(agent, String(args.preset ?? '').trim())
			if (!result.ok) throw new Error(result.text)
			return { text: result.text }
		}
	})

	ctx.tools.register({
		name: 'set_subagent_preset',
		description:
			'切换“你自己创建的子代理会话”的 Agent 预设。目标子代理必须存活且空闲；它会在下一次请求前收到预设变更说明。子代理创建时默认继承父代理当时的预设，仅在确有必要时修改。',
		parameters: {
			type: 'object',
			properties: {
				agent_id: { type: 'string', description: '子代理的会话 id（spawn 返回的 subagentId）' },
				preset: { type: 'string', description: '目标预设 id（先用 list_agent_presets 查询）' }
			},
			required: ['agent_id', 'preset'],
			additionalProperties: false
		},
		output: textOutput,
		async execute(args, exec) {
			const parent = exec?.agent
			if (!parent) throw new Error('set_subagent_preset 需要父 Agent 上下文')
			const childId = String(args.agent_id ?? '').trim()
			const child = ctx.agents.get(childId)
			if (child === undefined) throw new Error(`没有存活的子代理会话「${childId}」；已完成或未启动的子代理无法在中途切换预设。`)
			const parentSession = child.session?.header?.parentSession
			if (parentSession !== parent.session?.id) throw new Error('只能修改你自己创建的子代理的预设。')
			const result = await switchAgent(child, String(args.preset ?? '').trim())
			if (!result.ok) throw new Error(result.text)
			return { text: `子代理 ${childId}：${result.text}` }
		}
	})

	// ── 工具引导段（按预设开关 + 子代理策略） ───────────────────────────
	ctx.effect(
		() =>
			ctx.systemPrompt.section({
				name: 'preset-manager:guidance',
				order: 700,
				text: (context) => {
					const agent = context?.agent
					const presetId = agent === undefined ? undefined : currentPresetOf(agent)
					if (!guidanceEnabled(presetId, config)) return ''
					return [...GUIDANCE_HEAD, ...policyGuidanceLines(policyOf(config))].join('\n')
				}
			}),
		'preset-manager.guidance()'
	)

	// ── 委派工具的预设策略：枚举收窄 + 默认预设注入 ───────────────────
	const wrappedTools = new WeakSet()
	const decorateDelegationTool = (tool, policy) => {
		const parameters = tool?.parameters
		if (parameters === null || typeof parameters !== 'object') return tool
		const properties = parameters.properties
		if (properties === null || typeof properties !== 'object' || properties.agent_preset === undefined) return tool
		const property = { ...properties.agent_preset }
		if (policy.allowed.length > 0) property.enum = [...policy.allowed]
		const notes = policy.inherit
			? ['省略 agent_preset 时继承父代理当时的预设。']
			: [policy.fallback === undefined ? '必须显式选择 agent_preset（只能选允许列表里的预设）。' : `省略 agent_preset 时使用默认预设 ${policy.fallback}。`]
		const description = `${String(tool.description ?? '')} ${notes.join(' ')}`.trim()
		const required = Array.isArray(parameters.required) ? [...parameters.required] : []
		if (!policy.inherit && policy.fallback === undefined && !required.includes('agent_preset')) required.push('agent_preset')
		property.description = `${String(property.description ?? '')} ${notes.join(' ')}`.trim()
		return {
			...tool,
			description,
			parameters: { ...parameters, required, properties: { ...properties, agent_preset: property } }
		}
	}

	/** 在工具定义上包一层策略：收窄允许列表、省略时注入默认预设。 */
	const enforceDelegationPolicy = (context) => {
		const policy = policyOf(config)
		if (policy.inherit && policy.allowed.length === 0) return
		try {
			const scope = context?.scope
			for (const name of ['subagent', 'subagent_fork']) {
				let def
				try {
					def = ctx.tools.get(name, scope)
				} catch {
					def = undefined
				}
				if (def === undefined) {
					try {
						def = ctx.tools.get(name)
					} catch {
						def = undefined
					}
				}
				if (def === undefined || typeof def.execute !== 'function' || wrappedTools.has(def)) continue
				const original = def.execute
				def.execute = async function wrappedExecute(args, exec) {
					const live = policyOf(config)
					const callerPreset = exec?.agent === undefined ? undefined : currentPresetOf(exec.agent)
					let nextArgs = args
					if (guidanceEnabled(callerPreset, config) && args !== null && typeof args === 'object') {
						const chosen = args.agent_preset
						if (live.allowed.length > 0 && typeof chosen === 'string' && chosen !== '' && !live.allowed.includes(chosen)) {
							throw new Error(`agent_preset 必须是以下预设之一：${live.allowed.join('、')}`)
						}
						if (!live.inherit && (chosen === undefined || chosen === '') && live.fallback !== undefined) {
							nextArgs = { ...args, agent_preset: live.fallback }
						}
					}
					return original.call(this, nextArgs, exec)
				}
				wrappedTools.add(def)
			}
		} catch {
			// 工具定义不可改时只保留 schema 层描述，不影响插件其余功能。
		}
	}

	// ── 工具可见性 + 子代理策略（同一个按预设开关） ───────────────────
	ctx.on('system-prompt/assemble', async (assembly, context, next) => {
		const result = await next()
		try {
			const agent = context?.agent
			const presetId = agent === undefined ? undefined : currentPresetOf(agent)
			if (!guidanceEnabled(presetId, config)) {
				return { ...result, tools: result.tools.filter((tool) => !TOOL_NAMES.includes(tool.name)) }
			}
			const policy = policyOf(config)
			if (policy.allowed.length === 0 && policy.inherit) return result
			enforceDelegationPolicy(context)
			return { ...result, tools: result.tools.map((tool) => decorateDelegationTool(tool, policy)) }
		} catch {
			return result
		}
	})
}
