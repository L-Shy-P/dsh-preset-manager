#!/usr/bin/env node
// 生成可分发的离线压缩包：dist/dsh-preset-manager-<version>.zip
// 内容：插件包本体(package/) + 安装器(install.mjs) + Windows 双击脚本 + 使用说明 + npm tarball
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const name = manifest.name;
const version = manifest.version;
const outDir = path.join(ROOT, "dist");
const stage = path.join(outDir, `${name}-${version}`);
const zipPath = path.join(outDir, `${name}-${version}.zip`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, "package"), { recursive: true });

const PKG_FILES = ["package.json", "cordis.patch.yml", "index.json", "README.md", "LICENSE"];
for (const rel of PKG_FILES) fs.copyFileSync(path.join(ROOT, rel), path.join(stage, "package", rel));
for (const dir of ["lib", "presets"]) fs.cpSync(path.join(ROOT, dir), path.join(stage, "package", dir), { recursive: true });

fs.copyFileSync(path.join(ROOT, "install.mjs"), path.join(stage, "install.mjs"));
for (const rel of ["安装(双击这里).cmd", "卸载.cmd", "使用说明.md"]) {
  const src = path.join(ROOT, "dist-assets", rel);
  if (!fs.existsSync(src)) throw new Error(`缺少 dist-assets/${rel}`);
  fs.copyFileSync(src, path.join(stage, rel));
}

// npm 形状的 tarball（给 DSH「安装第三方插件」用）：package/ 作为根目录，和 npm pack 一致。
// 不用 npm pack，避免依赖 npm 与 shell 引号差异；package/ 里已经只放了该发布的文件。
const tarball = `${name}-${version}.tgz`;
execFileSync("tar", ["-czf", path.join(stage, tarball), "-C", stage, "package"], { stdio: "inherit" });

// 打 zip（Windows 用 PowerShell，其他平台用 zip 命令）
if (process.platform === "win32") {
  execFileSync("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -Path '${stage}' -DestinationPath '${zipPath}' -CompressionLevel Optimal -Force`], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-qr", zipPath, path.basename(stage)], { cwd: outDir, stdio: "inherit" });
}

console.log(`✅ ${zipPath}`);
console.log(`   package/ + install.mjs + 安装(双击这里).cmd + 卸载.cmd + 使用说明.md + ${tarball}`);