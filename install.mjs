#!/usr/bin/env node
// DSH 预设管理器安装脚本（无第三方依赖）
//
// 把三样东西装进当前 DSH profile：
//   1. 宿主插件插件行（preset-manager）；
//   2. 浏览器 UI 包 dsh-preset-manager-ui；
//   3. 自带预设「标准模式·加强版」（better-standard，仅使用 DSH 自带插件）。
//
// 用法：
//   node install.mjs                 安装 / 更新
//   node install.mjs --dry-run       只打印计划，不写文件
//   node install.mjs --check         校验已安装内容与仓库源码一致
//   node install.mjs --profile <dir> 指定 profile 目录（默认 ~/.dsh/profiles/desktop）
//
// 注意：脚本会先备份 profile patch；写入后需要重启 DeepSeek Harness 桌面端。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const checkOnly = argv.includes("--check");
const profileIndex = argv.indexOf("--profile");
const profileFromArgs =
	profileIndex >= 0
		? argv[profileIndex + 1]
		: argv.find((arg) => arg.startsWith("--profile="))?.slice("--profile=".length);
const profileDir = path.resolve(
	profileFromArgs ?? process.env.DSH_PROFILE_DIR ?? path.join(os.homedir(), ".dsh", "profiles", "desktop")
);
const patchPath = path.join(profileDir, "cordis.patch.yml");

const PLUGIN_ID = "preset-manager";
const UI_ID = "preset-manager-ui";
const UI_PACKAGE = "dsh-preset-manager-ui";
const PRESET_ROW_ID = "preset-better-standard";
const STAMP = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

function fail(message) {
	console.error("❌ " + message);
	process.exit(1);
}
function info(message) {
	console.log(message);
}
function read(rel) {
	return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function sha8(text) {
	return crypto.createHash("sha256").update(text).digest("hex").slice(0, 8);
}

if (!fs.existsSync(patchPath)) {
	fail(`找不到 profile patch：${patchPath}\n   请先启动一次 DeepSeek Harness 桌面端，或用 --profile 指定正确的 profile 目录。`);
}

// ── 校验仓库源码 ───────────────────────────────────────────────────
const pluginSource = read(path.join("plugin", "index.mjs"));
const pluginSha = sha8(pluginSource);
const pluginFile = `${PLUGIN_ID}.${pluginSha}.mjs`;
const pluginDest = path.join(profileDir, pluginFile);
const pluginRowName = pathToFileURL(pluginDest).href;

const uiFiles = ["package.json", "lib/index.js", "lib/client.js"];
for (const rel of uiFiles) {
	if (!fs.existsSync(path.join(ROOT, "ui", rel))) fail(`仓库缺少 ui/${rel}`);
}
const uiHash = crypto.createHash("sha256");
for (const rel of uiFiles) uiHash.update(rel).update("\0").update(read(path.join("ui", rel))).update("\0");
const uiBuild = uiHash.digest("hex").slice(0, 8);
const uiDest = path.join(profileDir, "node_modules", UI_PACKAGE);

const packageJson = JSON.parse(read(path.join("ui", "package.json")));
if (packageJson.name !== UI_PACKAGE) fail(`ui/package.json name 应为 ${UI_PACKAGE}`);
if (packageJson.exports?.["./client"] !== "./lib/client.js") fail("ui/package.json 缺少 exports['./client']");
if (packageJson.dsh?.client?.platform !== "web") fail("ui/package.json 缺少 dsh.client.platform='web'");
const clientText = read(path.join("ui", "lib", "client.js"));
if (!clientText.includes("__ModuleLoader__.load") || !clientText.includes(`id: "${UI_PACKAGE}"`)) {
	fail("ui/lib/client.js 不是有效的浏览器 bundle（模块 id 不匹配）");
}
try {
	new Function(clientText);
} catch (error) {
	fail("ui/lib/client.js 存在语法错误：" + error.message);
}

const presetBlock = read(path.join("presets", "better-standard.yml")).replace(/\r\n/g, "\n").trimEnd();
if (!presetBlock.startsWith("- insert:") || !presetBlock.includes("id: preset-better-standard")) {
	fail("presets/better-standard.yml 不是有效的预设块");
}

const hostModule = await import(pathToFileURL(path.join(ROOT, "plugin", "index.mjs")).href);
if (hostModule.name !== PLUGIN_ID) fail(`plugin/index.mjs 导出的 name 应为 ${PLUGIN_ID}`);
if (typeof hostModule.apply !== "function") fail("plugin/index.mjs 缺少 apply()");

// ── profile patch 文本操作 ─────────────────────────────────────────
const originalPatch = fs.readFileSync(patchPath, "utf8");
const eol = originalPatch.includes("\r\n") ? "\r\n" : "\n";
let patch = originalPatch.replace(/\r\n/g, "\n");

function escapeId(id) {
	return id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 删除所有 insert 块（含紧邻其上的注释行），块内出现 `id: <id>` 才算匹配。 */
function removeInsertBlocks(text, id) {
	const lines = text.split("\n");
	const pattern = new RegExp("^\\s*-\\s*id: " + escapeId(id) + "\\s*$", "m");
	for (;;) {
		let start = -1;
		let end = -1;
		for (let i = 0; i < lines.length; i += 1) {
			if (lines[i] !== "- insert:") continue;
			let stop = i + 1;
			while (stop < lines.length && !/^- /.test(lines[stop])) stop += 1;
			if (pattern.test(lines.slice(i, stop).join("\n"))) {
				start = i;
				end = stop;
				break;
			}
		}
		if (start < 0) return lines.join("\n");
		let head = start;
		while (head > 0 && lines[head - 1].startsWith("#")) head -= 1;
		lines.splice(head, end - head);
	}
}

/** 删除顶层覆盖行（config-editor 写的 `- id: <id>`）。 */
function removeTopRow(text, id) {
	const lines = text.split("\n");
	const start = lines.findIndex((line) => line === "- id: " + id);
	if (start < 0) return text;
	let end = start + 1;
	while (end < lines.length && !/^- /.test(lines[end]) && !/^#/.test(lines[end])) end += 1;
	lines.splice(start, end - start);
	return lines.join("\n");
}

/** 把顶层覆盖行的 name 指向新的模块 URL（保留其 config）。 */
function retargetTopRowName(text, id, name) {
	const lines = text.split("\n");
	const start = lines.findIndex((line) => line === "- id: " + id);
	if (start < 0) return text;
	for (let i = start + 1; i < lines.length && !/^- /.test(lines[i]); i += 1) {
		if (/^\s{2}name:\s*/.test(lines[i])) {
			lines[i] = "  name: '" + name + "'";
			break;
		}
	}
	return lines.join("\n");
}

/** 把 insert 块放到顶层覆盖行之前（覆盖行必须能应用在新增行上）。 */
function placeInsertBlock(text, id, blockLines) {
	const cleaned = removeInsertBlocks(text, id);
	const lines = cleaned.split("\n");
	const override = lines.findIndex((line) => line === "- id: " + id);
	const before = (override < 0 ? lines : lines.slice(0, override)).join("\n").replace(/\s+$/, "");
	const after = override < 0 ? "" : lines.slice(override).join("\n").replace(/\s+$/, "");
	let result = before + "\n\n" + blockLines.join("\n") + "\n";
	if (after !== "") result += "\n" + after + "\n";
	return result;
}

function appendPresetBlock(text) {
	if (text.includes("id: " + PRESET_ROW_ID)) return text;
	const base = text.replace(/\s+$/, "");
	return base + "\n\n" + presetBlock + "\n";
}

// 1) 宿主插件行（保留已有设置覆盖行）
patch = placeInsertBlock(patch, PLUGIN_ID, [
	"# 预设管理器（宿主级：命令 / 模型工具 / 按预设引导 / 子代理预设策略）",
	"- insert:",
	"    - id: " + PLUGIN_ID,
	"      name: '" + pluginRowName + "'"
]);
patch = retargetTopRowName(patch, PLUGIN_ID, pluginRowName);

// 2) 浏览器 UI 行
patch = placeInsertBlock(patch, UI_ID, [
	"# 预设管理器（浏览器 UI：顶栏切换器 / 设置页 / 命令卡片）",
	"- insert:",
	"    - id: " + UI_ID,
	"      name: " + UI_PACKAGE,
	"      config:",
	"        build: '" + uiBuild + "'"
]);

// 3) 自带预设
patch = appendPresetBlock(patch);

// 可选的 YAML 校验：有 js-yaml 才做，没有就跳过（脚本不强制 npm install）
let yamlLib
try {
	yamlLib = createRequire(import.meta.url)("js-yaml");
} catch {
	yamlLib = undefined;
}
if (yamlLib !== undefined) {
	try {
		const jsType = new yamlLib.Type("tag:yaml.org,2002:js", { kind: "scalar", construct: (data) => data });
		const doc = yamlLib.load(patch, { schema: yamlLib.DEFAULT_SCHEMA.extend([jsType]) });
		if (!Array.isArray(doc)) throw new Error("patch 顶层不是数组");
	} catch (error) {
		fail("生成的 profile patch 不是合法 YAML：" + error.message);
	}
} else {
	info("· 跳过 YAML 校验（本机没有 js-yaml；DSH 会在启动时自行校验）");
}

// ── --check ────────────────────────────────────────────────────────
if (checkOnly) {
	if (!fs.existsSync(pluginDest)) fail(`未安装：${pluginDest} 不存在`);
	if (fs.readFileSync(pluginDest, "utf8") !== pluginSource) fail("已安装的宿主插件与仓库源码不一致");
	for (const rel of uiFiles) {
		const target = path.join(uiDest, rel);
		if (!fs.existsSync(target)) fail(`未安装：${target} 不存在`);
		if (fs.readFileSync(target, "utf8") !== read(path.join("ui", rel))) fail(`已安装的 ui/${rel} 与仓库源码不一致`);
	}
	if (!originalPatch.includes(pluginRowName)) fail("profile patch 未指向当前宿主插件版本");
	if (!originalPatch.includes("build: '" + uiBuild + "'")) fail("profile patch 未指向当前 UI 构建");
	if (!originalPatch.includes("id: " + PRESET_ROW_ID)) fail("profile patch 缺少自带预设");
	info(`✅ 已安装：${pluginFile} + ${UI_PACKAGE}（build ${uiBuild}）+ 预设 better-standard`);
	process.exit(0);
}

if (dryRun) {
	info("🧪 预检通过，计划写入：");
	info(`   profile : ${profileDir}`);
	info(`   宿主插件: ${pluginFile}`);
	info(`   UI 包   : ${UI_PACKAGE}（build ${uiBuild}）`);
	info(`   自带预设: better-standard`);
	process.exit(0);
}

// ── 写入 ───────────────────────────────────────────────────────────
const backup = `${patchPath}.bak-preset-manager-${STAMP}`;
fs.copyFileSync(patchPath, backup);

fs.mkdirSync(path.join(uiDest, "lib"), { recursive: true });
for (const rel of uiFiles) {
	const target = path.join(uiDest, rel);
	const tmp = target + ".tmp-" + crypto.randomBytes(4).toString("hex");
	fs.writeFileSync(tmp, read(path.join("ui", rel)));
	fs.renameSync(tmp, target);
}
const pluginTmp = pluginDest + ".tmp-" + crypto.randomBytes(4).toString("hex");
fs.writeFileSync(pluginTmp, pluginSource);
fs.renameSync(pluginTmp, pluginDest);

const out = eol === "\r\n" ? patch.replace(/\n/g, "\r\n") : patch;
const patchTmp = patchPath + ".tmp-" + crypto.randomBytes(4).toString("hex");
fs.writeFileSync(patchTmp, out, "utf8");
fs.renameSync(patchTmp, patchPath);

// 清理旧版本的插件文件（只清理本插件的哈希文件）
for (const name of fs.readdirSync(profileDir)) {
	if (name === pluginFile) continue;
	if (/^preset-manager\.[0-9a-f]{8}\.mjs$/.test(name)) {
		try {
			fs.rmSync(path.join(profileDir, name), { force: true });
		} catch {
			// 清理失败不影响安装。
		}
	}
}

info("✅ 已安装/更新：");
info(`   宿主插件 ${pluginFile}`);
info(`   UI 包 ${UI_PACKAGE}（build ${uiBuild}）`);
info(`   自带预设 better-standard（标准模式·加强版）`);
info(`   备份：${path.basename(backup)}`);
info("");
info("下一步：完全退出并重启 DeepSeek Harness 桌面端；");
info("顶栏会出现「预设 + 当前预设名」，设置 → 预设管理 里可配置。");
