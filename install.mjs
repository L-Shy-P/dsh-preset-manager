#!/usr/bin/env node
/**
 * DSH 预设管理器 — 一键安装脚本（Windows / macOS / Linux 通用，无第三方依赖）
 *
 * 做三件事：
 *   1. 把插件包复制到 <profile>/local/dsh-preset-manager；
 *   2. 用 DSH 自带的插件命令把它装进 profile（写 dependencies + dsh.profile.bundles）；
 *   3. 如果找不到 DSH 命令行，就退化为直接改 profile 的 package.json 并放入 node_modules。
 *
 * 用法：
 *   node install.mjs                 安装 / 更新
 *   node install.mjs --uninstall     卸载
 *   node install.mjs --dry-run       只打印计划
 *   node install.mjs --profile web   指定 profile（默认 desktop）
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const uninstall = argv.includes("--uninstall");
const profileArg = (() => {
	const i = argv.indexOf("--profile");
	if (i >= 0 && argv[i + 1]) return argv[i + 1];
	const inline = argv.find((a) => a.startsWith("--profile="));
	return inline ? inline.slice("--profile=".length) : "desktop";
})();

const PACKAGE_NAME = "dsh-preset-manager";
// dist 目录里包在 package/ 下；仓库根上文件就在根上。两处用同一份脚本。
const PKG_DIR = fs.existsSync(path.join(ROOT, "package", "package.json")) ? path.join(ROOT, "package") : ROOT;
const STAMP = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

function info(m) { console.log(m); }
function fail(m) { console.error("❌ " + m); process.exit(1); }
function ok(m) { console.log("✅ " + m); }

// ── 1. 定位 DSH 安装目录与 profile ──────────────────────────────────
function findDshDir() {
	const env = process.env.DSH_DESKTOP_DIR;
	if (env && fs.existsSync(env)) return env;
	const candidates = [];
	if (process.platform === "win32") {
		const ps = [
			"Get-ItemProperty",
			"'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
			"'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
			"'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
			"-ErrorAction SilentlyContinue |",
			"Where-Object { $_.DisplayName -like 'DeepSeek Harness*' } |",
			"Select-Object -First 1 -ExpandProperty InstallLocation"
		].join(" ");
		const res = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
		const found = (res.stdout ?? "").trim();
		if (found) candidates.push(found);
		candidates.push(
			path.join(process.env.ProgramFiles ?? "C:\\Program Files", "DeepSeek Harness"),
			path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "DeepSeek Harness"),
			path.join(process.env.LOCALAPPDATA ?? "", "Programs", "DeepSeek Harness")
		);
	} else if (process.platform === "darwin") {
		candidates.push("/Applications/DeepSeek Harness.app/Contents/Resources");
	} else {
		candidates.push("/opt/DeepSeek Harness/resources", "/usr/lib/deepseek-harness");
	}
	for (const dir of candidates) {
		if (dir && fs.existsSync(dir)) {
			if (fs.existsSync(path.join(dir, "resources", "runtime", "cli", "bin", "dsh.cmd"))) return dir;
			if (fs.existsSync(path.join(dir, "runtime", "cli", "bin", "dsh.cmd"))) return dir;
		}
	}
	return undefined;
}

const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const profileDir = path.join(dshHome, "profiles", profileArg);
const profileJson = path.join(profileDir, "package.json");

if (!fs.existsSync(profileDir)) {
	fail(`找不到 profile 目录：${profileDir}\n   请先启动一次 DeepSeek Harness 桌面端（让它生成 profile），再运行本脚本。`);
}
if (!fs.existsSync(profileJson)) {
	fail(`profile 缺少 package.json：${profileJson}\n   请先启动一次 DeepSeek Harness 桌面端。`);
}

// ── 2. 校验压缩包内的插件包 ────────────────────────────────────────
for (const rel of ["package.json", "lib/index.js", "lib/client.js", "cordis.patch.yml", "presets/better-standard.yml"]) {
	if (!fs.existsSync(path.join(PKG_DIR, rel))) fail(`压缩包不完整，缺少 package/${rel}。请重新解压后再运行。`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(PKG_DIR, "package.json"), "utf8"));
if (manifest.name !== PACKAGE_NAME) fail(`package/package.json 的 name 应为 ${PACKAGE_NAME}`);

const localTarget = path.join(profileDir, "local", PACKAGE_NAME);
const nmTarget = path.join(profileDir, "node_modules", PACKAGE_NAME);

function readProfile() {
	// 有的工具写 package.json 会带 UTF-8 BOM，JSON.parse 会直接报错，这里先去掉。
	const raw = fs.readFileSync(profileJson, "utf8").replace(/^\uFEFF/, "");
	return JSON.parse(raw);
}
function writeProfile(value) {
	const tmp = profileJson + ".tmp-" + process.pid;
	fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
	fs.renameSync(tmp, profileJson);
}
function fileSpec(target) {
	return "file:" + target.split(path.sep).join("/");
}

// ── 3. 卸载 ────────────────────────────────────────────────────────
if (uninstall) {
	const backup = `${profileJson}.bak-${STAMP}`;
	fs.copyFileSync(profileJson, backup);
	const profile = readProfile();
	if (profile.dependencies) delete profile.dependencies[PACKAGE_NAME];
	const bundles = profile.dsh?.profile?.bundles;
	if (Array.isArray(bundles)) {
		profile.dsh.profile.bundles = bundles.filter((name) => name !== PACKAGE_NAME);
	}
	writeProfile(profile);
	for (const dir of [nmTarget, localTarget]) {
		if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
	}
	ok(`已从 profile「${profileArg}」卸载 ${PACKAGE_NAME}`);
	info("请完全退出并重启 DeepSeek Harness 桌面端。");
	process.exit(0);
}

// ── 4. 安装 ────────────────────────────────────────────────────────
info(`profile : ${profileDir}`);
info(`插件包  : ${PACKAGE_NAME} v${manifest.version}`);

if (dryRun) {
	info("🧪 预检通过（未写入）");
	info(`   将复制到 ${localTarget}`);
	info(`   并注册到 dependencies / dsh.profile.bundles`);
	process.exit(0);
}

const dshDir = findDshDir();
const dshCmd = dshDir
	? fs.existsSync(path.join(dshDir, "resources", "runtime", "cli", "bin", "dsh.cmd"))
		? path.join(dshDir, "resources", "runtime", "cli", "bin", "dsh.cmd")
		: path.join(dshDir, "runtime", "cli", "bin", "dsh.cmd")
	: undefined;

// 4.1 先把包复制进 profile 的 local/，这样解压目录删掉也不影响
fs.mkdirSync(path.dirname(localTarget), { recursive: true });
fs.rmSync(localTarget, { recursive: true, force: true });
fs.cpSync(PKG_DIR, localTarget, { recursive: true });
info(`已复制插件文件到 ${localTarget}`);

// 4.2 优先用 DSH 自己的插件安装命令（会正确写 dependencies + bundles + lockfile）
let installedByCli = false;
if (dshCmd) {
	info("正在用 DSH 自带插件命令安装…");
	// 不要走 cmd.exe：dsh.cmd 的路径里有空格，cmd /c 的引号规则会把 "D:\Program Files..."
	// 拆成 D:\Program，报「找不到网络路径」。直接调 Electron 可执行文件 + cli.js 最稳。
	const cliArgs = ["plugin", "--profile", profileArg, "add", localTarget];
	const desktopExe = path.join(dshDir ?? "", "DeepSeek Harness.exe");
	const cliScript = path.join(dshDir ?? "", "resources", "app.asar", "dsh", "node_modules", "@deepseek-ai", "dsh-desktop-host", "lib", "cli.js");
	// cli.js 在 app.asar 内部，普通 Node 的 fs 看不到它（只有 Electron 的 asar 补丁能），
	// 所以只判断主程序是否存在。
	const canRunDirect = process.platform === "win32" && fs.existsSync(desktopExe);
	const command = canRunDirect ? desktopExe : dshCmd;
	const args = canRunDirect ? ["--expose-internals", cliScript, ...cliArgs] : cliArgs;
	const res = spawnSync(command, args, {
		cwd: profileDir,
		stdio: "inherit",
		shell: !canRunDirect && process.platform === "win32",
		env: canRunDirect ? { ...process.env, ELECTRON_RUN_AS_NODE: "1" } : process.env
	});
	installedByCli = res.status === 0;
	if (!installedByCli) info("· DSH 插件命令未成功，改用直接写入 profile 的方式。");
} else {
	info("· 未找到 DSH 安装目录，改用直接写入 profile 的方式。");
}

if (!installedByCli) {
	// 4.3 退路：直接写 profile 的 package.json，并把包放进 node_modules
	const backup = `${profileJson}.bak-${STAMP}`;
	fs.copyFileSync(profileJson, backup);
	const profile = readProfile();
	profile.dependencies ??= {};
	profile.dependencies[PACKAGE_NAME] = fileSpec(localTarget);
	profile.dsh ??= {};
	profile.dsh.profile ??= {};
	profile.dsh.profile.bundles ??= [];
	if (!profile.dsh.profile.bundles.includes(PACKAGE_NAME)) {
		profile.dsh.profile.bundles.push(PACKAGE_NAME);
	}
	writeProfile(profile);
	fs.rmSync(nmTarget, { recursive: true, force: true });
	fs.cpSync(PKG_DIR, nmTarget, { recursive: true });
	info(`已写入 ${path.basename(profileJson)}（备份 ${path.basename(backup)}）`);
}

// 4.4 校验结果
const after = readProfile();
const hasDep = Boolean(after.dependencies?.[PACKAGE_NAME]);
const hasBundle = Array.isArray(after.dsh?.profile?.bundles) && after.dsh.profile.bundles.includes(PACKAGE_NAME);
if (!hasDep || !hasBundle) {
	fail("安装后校验失败：profile 里没有 dsh-preset-manager 的依赖或 bundle 条目。");
}

ok(`安装完成：${PACKAGE_NAME} 已注册为 profile「${profileArg}」的插件 bundle`);
info("自带预设「标准模式·加强版」会随包一起出现，无需单独导入。");
info("");
info("下一步：完全退出并重启 DeepSeek Harness 桌面端。");
info("重启后：顶栏出现「预设 + 当前预设名」，设置 → 预设管理 里可配置。");
