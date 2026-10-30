#!/usr/bin/env node
// DSH 预设管理器安装脚本（无第三方依赖）
//
// 把本仓库作为标准 DSH 插件包装进 profile：
//   1. 复制到 <profile>/node_modules/dsh-preset-manager；
//   2. 在 profile patch 里写一行 plugin 条目（id: preset-manager）；
//   3. 追加自带预设「标准模式·加强版」（仅使用 DSH 自带插件）。
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
const STAMP = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

const PACKAGE_NAME = "dsh-preset-manager";
const ENTRY_ID = "preset-manager";
const PRESET_ROW_ID = "preset-better-standard";
const INSTALL_FILES = [
	"package.json",
	"cordis.patch.yml",
	"lib/index.js",
	"lib/client.js",
	"presets/better-standard.yml",
	"README.md",
	"LICENSE",
	"index.json"
];

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

if (!fs.existsSync(patchPath)) {
	fail(`找不到 profile patch：${patchPath}\n   请先启动一次 DeepSeek Harness 桌面端，或用 --profile 指定正确的 profile 目录。`);
}

// ── 校验仓库内容 ───────────────────────────────────────────────────
const manifest = JSON.parse(read("package.json"));
if (manifest.name !== PACKAGE_NAME) fail(`package.json name 应为 ${PACKAGE_NAME}`);
if (manifest.dsh?.bundle?.patch !== "./cordis.patch.yml") fail("package.json 缺少 dsh.bundle.patch");
if (manifest.dsh?.client?.platform !== "web") fail("package.json 缺少 dsh.client.platform='web'");
if (manifest.exports?.["./client"]?.default !== "./lib/client.js") fail("package.json 缺少 exports['./client']");
const clientText = read("lib/client.js");
if (!clientText.includes("__ModuleLoader__.load") || !clientText.includes(`id: "${PACKAGE_NAME}"`)) {
	fail(`lib/client.js 不是有效的浏览器 bundle（模块 id 应为 ${PACKAGE_NAME}）`);
}
try {
	new Function(clientText);
} catch (error) {
	fail("lib/client.js 存在语法错误：" + error.message);
}
const presetBlock = read("presets/better-standard.yml").replace(/\r\n/g, "\n").trimEnd();
if (!presetBlock.startsWith("- insert:") || !presetBlock.includes("id: " + PRESET_ROW_ID)) {
	fail("presets/better-standard.yml 不是有效的预设块");
}

const hostModule = await import(new URL("./lib/index.js", import.meta.url).href);
if (hostModule.name !== ENTRY_ID) fail(`lib/index.js 导出的 name 应为 ${ENTRY_ID}`);
if (typeof hostModule.apply !== "function") fail("lib/index.js 缺少 apply()");

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

/** 把顶层覆盖行的 name 指向已安装的包名（保留其 config）。 */
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
	return text.replace(/\s+$/, "") + "\n\n" + presetBlock + "\n";
}

// 清理旧版安装方式（file URL 宿主行 + 独立 UI 包）
patch = removeInsertBlocks(patch, "preset-manager-ui");
patch = removeInsertBlocks(patch, "preset-manager");
patch = placeInsertBlock(patch, ENTRY_ID, [
	"# 预设管理器（宿主 + 浏览器 UI，npm 包形式安装）",
	"- insert:",
	"    - id: " + ENTRY_ID,
	"      name: '" + PACKAGE_NAME + "'"
]);
patch = retargetTopRowName(patch, ENTRY_ID, PACKAGE_NAME);
patch = appendPresetBlock(patch);

// 可选的 YAML 校验：有 js-yaml 才做，没有就跳过（脚本不强制 npm install）
let yamlLib;
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

const installDir = path.join(profileDir, "node_modules", PACKAGE_NAME);

if (checkOnly) {
	for (const rel of INSTALL_FILES) {
		const target = path.join(installDir, rel);
		if (!fs.existsSync(target)) fail(`未安装：${target} 不存在`);
		if (fs.readFileSync(target, "utf8") !== read(rel)) fail(`已安装的 ${rel} 与仓库源码不一致`);
	}
	if (!originalPatch.includes("name: '" + PACKAGE_NAME + "'")) fail("profile patch 未指向 dsh-preset-manager 包");
	if (!originalPatch.includes("id: " + PRESET_ROW_ID)) fail("profile patch 缺少自带预设");
	info(`✅ 已安装：${PACKAGE_NAME}（node_modules/${PACKAGE_NAME}）+ 预设 better-standard`);
	process.exit(0);
}

if (dryRun) {
	info("🧪 预检通过，计划写入：");
	info(`   profile : ${profileDir}`);
	info(`   插件包  : node_modules/${PACKAGE_NAME}`);
	info(`   插件行  : ${ENTRY_ID} → ${PACKAGE_NAME}`);
	info(`   自带预设: better-standard`);
	process.exit(0);
}

// ── 写入 ───────────────────────────────────────────────────────────
const backup = `${patchPath}.bak-preset-manager-${STAMP}`;
fs.copyFileSync(patchPath, backup);

for (const rel of INSTALL_FILES) {
	const target = path.join(installDir, rel);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	const tmp = target + ".tmp-" + crypto.randomBytes(4).toString("hex");
	fs.writeFileSync(tmp, read(rel));
	fs.renameSync(tmp, target);
}

const out = eol === "\r\n" ? patch.replace(/\n/g, "\r\n") : patch;
const patchTmp = patchPath + ".tmp-" + crypto.randomBytes(4).toString("hex");
fs.writeFileSync(patchTmp, out, "utf8");
fs.renameSync(patchTmp, patchPath);

// 清理旧版的独立文件与包：preset-manager.<hash>.mjs、dsh-preset-manager-ui、preset-switch 遗留
for (const name of fs.readdirSync(profileDir)) {
	if (/^preset-manager\.[0-9a-f]{8}\.mjs$/.test(name) || /^preset-switch(\.[0-9a-f]{8}\.mjs)?$/.test(name)) {
		fs.rmSync(path.join(profileDir, name), { force: true });
	}
}
for (const legacy of ["dsh-preset-manager-ui", "dsh-preset-switch-ui"]) {
	fs.rmSync(path.join(profileDir, "node_modules", legacy), { recursive: true, force: true });
}

info("✅ 已安装/更新：");
info(`   插件包 node_modules/${PACKAGE_NAME}`);
info(`   插件行 ${ENTRY_ID} → ${PACKAGE_NAME}`);
info(`   自带预设 better-standard（标准模式·加强版）`);
info(`   备份：${path.basename(backup)}`);
info("");
info("下一步：完全退出并重启 DeepSeek Harness 桌面端；");
info("顶栏会出现「预设 + 当前预设名」，设置 → 预设管理 里可配置。");
