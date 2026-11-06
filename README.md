# DSH 预设管理器（dsh-preset-manager）

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）桌面端用的 Agent 预设管理插件：在会话中途切换预设、按预设注入工具引导、管理子代理可用的预设，并支持预设包的导入导出。仓库同时附带一个开箱可用的预设 **「标准模式·加强版」**。

> 适用版本：DSH `0.2.1`（desktop profile，`~/.dsh/profiles/desktop`）。

## 功能

- **顶栏切换器**：会话标题旁显示「预设 + 当前预设名」，悬停展开预设面板，点击即切换。切换保留全部对话历史，从下一轮请求起生效。
- **设置 → 预设管理**（与内置配置面板同款表单）：
  - 总开关 + 逐预设的「工具/引导」开关；
  - 每个预设的「子代理可用」开关；
  - 「默认预设：与父代理相同」开关；关闭后为子代理指定默认预设；
  - 预设包导出 / 导入。
- **模型工具**（仅对开启引导的预设挂载）：`list_agent_presets`、`set_my_preset`、`set_subagent_preset`。
- **子代理预设策略**：限制子代理可选的预设、在省略 `agent_preset` 时注入默认预设、拒绝不在允许列表里的选择（孙代理及更深层级同样生效）。
- **斜杠命令**：`/preset [id]` 切换/列出预设，`/preset-export <id>`、`/preset-import <base64>` 导入导出预设包。
- **缓存提示**：切换预设时提示可能降低前缀缓存命中率。

## 自带预设：标准模式·加强版

`better-standard`，order 2。插件清单与内置「标准模式」完全一致（工具指导、计划策略、AGENTS.md 摘要、技能目录、运行时上下文都保留），差异只有两点：

1. persona 换成三段自定义专家提示词；
2. 委派工具允许通过 `agent_preset` 为子代理选择预设。

该预设只使用 DSH 自带插件，不需要额外安装任何插件。通过插件市场安装时，它会随包的 bundle patch 一起写入；手动安装时由 `install.mjs` 追加。

## 安装

> ⚠️ **不要只输入包名 `dsh-preset-manager`。**
> npm 上有一个同名但完全无关的包（他人的 "Preset doctor"，latest 0.6.0）。在 DSH 的安装框里
> 输入裸名字会从 npm 装到那个包，表现为「装完既没有『标准模式·加强版』预设，也没有预设选择器」。
> 本插件**没有发布到 npm**，请始终使用下面的完整地址（本地路径 / tgz URL / 仓库 URL）。
> 判断装对没有：看插件版本是不是 `1.0.0`。

### 方式一：插件市场（推荐）

在「插件 → 发现 → 索引源（Index sources）」里添加本仓库的索引：

```
https://cdn.jsdelivr.net/gh/L-Shy-P/dsh-preset-manager@main/index.json
```

如果访问不了 jsDelivr，可以换成 GitHub 原始地址：

```
https://raw.githubusercontent.com/L-Shy-P/dsh-preset-manager/main/index.json
```

之后在发现页搜索「预设管理器」或 `dsh-preset-manager`，点安装并重启 DSH 即可。索引里的版本固定到仓库 commit，安装的是这个仓库本身（不是 npm 包）。

### 方式二：离线压缩包（分享给别人用这个）

`dsh-preset-manager-1.0.0.zip` 解压后：

```
dsh-preset-manager-1.0.0/
├── 安装(双击这里).cmd       ← Windows 双击安装
├── 卸载.cmd                 ← Windows 双击卸载
├── 使用说明.md              ← 给完全没接触过的人看的步骤
├── install.mjs              ← 安装器本体（macOS/Linux 用 node install.mjs）
├── dsh-preset-manager-1.0.0.tgz  ← 也可以喂给 DSH 的「安装第三方插件」
└── package/                 ← 插件包本体（DSH 里填这个目录的绝对路径也能装）
```

**推荐做法**：解压到一个固定位置 → 完全退出 DSH → 双击 `安装(双击这里).cmd` → 重开 DSH。

安装器会找到 DSH 与 profile，把插件复制进 `<profile>/local/dsh-preset-manager`，再用 DSH 自带插件命令注册；找不到命令行时退化为直接写 `package.json` 的 `dependencies` 与 `dsh.profile.bundles`。两种方式都不需要手动编辑 YAML，升级/卸载也不会留下重复行。

> 用 DSH 界面安装（上表里的 tgz 或 `package` 目录）时，源文件不能删除或移动，否则插件失效；用 `安装.cmd` 会把文件复制进 profile，之后可以删掉解压目录。

### 方式三：手动安装（git clone）

要求：Node.js 18+，已启动过一次 DSH 桌面端（让 profile 目录生成）。

```bash
git clone https://github.com/L-Shy-P/dsh-preset-manager.git
cd dsh-preset-manager
node install.mjs
```

然后在系统托盘/任务栏完全退出并重新启动 DeepSeek Harness。

可选参数：

```bash
node install.mjs --dry-run          # 只打印计划，不写文件
node install.mjs --uninstall        # 卸载
node install.mjs --profile <name>   # 指定 profile（默认 desktop）
```

安装脚本会：

- 把插件包复制到 `<profile>/local/dsh-preset-manager`；
- 调 DSH 自带插件命令把它注册进 `dependencies` 与 `dsh.profile.bundles`；
- 找不到 DSH 时退化为直接改 `package.json` 并复制到 `node_modules`；
- 自带预设由包内的 `cordis.patch.yml` 自动插入，不需要单独导入；
- 写入前备份 `package.json`。

脚本不依赖 npm 包，也不需要联网。

## 使用

- **切换预设**：顶栏「预设 + 名称」→ 选目标预设。也可以直接发 `/preset <id>`。
- **配置工具与引导**：设置 → 预设管理。总开关关闭后所有预设都不挂载预设管理工具，逐预设设置会保留。
- **子代理预设**：在「子代理预设」区域勾选允许子代理使用的预设；关闭「默认预设：与父代理相同」后选择一个默认预设。
- **导入/导出预设包**：设置 → 预设管理 → 预设包。导出得到 JSON；导入时选择 JSON 文件，宿主会把预设声明写入 profile patch（无需安装新插件），并做可用性检测。

## 预设包与可用性检测

预设本质上是一份插件清单，**导入的预设只能使用当前部署已安装的插件**。DSH 发行版自带的 `@deepseek-ai/*` 插件、当前 profile 的 `node_modules` 里安装的插件、以及其他已注册预设用到的插件会被视为可用；缺失的依赖会导致导入被拒绝，并列出缺失项。

导入前会检查、导入后会等待挂载：如果预设挂载失败，脚本会自动把 profile patch 回滚到导入前的内容。需要强行导入时可以在命令里使用 `--force`：

```
/preset-import --force <base64>
```

**安全提示**：导入预设等同于往 profile 里写入并挂载任意插件声明。只导入可信来源的预设包；可用性检测只验证模块是否存在，不验证其安全性或兼容性。

## 卸载

1. 退出 DSH；
2. 编辑 `<profile>/cordis.patch.yml`，删除 id 为 `preset-manager` 与 `preset-better-standard` 的条目（以及设置生成的 `- id: preset-manager` 配置覆盖条目）；
3. 删除 `<profile>/node_modules/dsh-preset-manager`；
4. 重启 DSH。

若是通过 `install.mjs` 安装且从未保存过设置，也可以直接从备份 `cordis.patch.yml.bak-preset-manager-*` 恢复。

## 目录结构

```
lib/index.js                宿主插件（命令、模型工具、引导、子代理策略、导入导出）
lib/client.js               浏览器 UI bundle（顶栏切换器、设置页、命令卡片）
cordis.patch.yml            dsh bundle patch（插件行 + 自带预设）
presets/better-standard.yml 自带预设声明
index.json                  插件市场 format 1 索引（供「索引源」使用）
install.mjs                 手动安装脚本（git clone 用户）
```

## 已知限制

- profile patch 的配置写入依赖 DSH `0.2.1` 的 settings/config-editor 行为；升级 DSH 大版本后请先跑 `node install.mjs --check`。
- 预设切换在 Agent 空闲时进行；运行中的回合不能切。
- 极简模式使用 `complete` persona，会丢弃其他系统提示词段，因此预设管理引导不会出现在极简模式下（这是预期行为）。
- 插件市场的「精选列表」收录需要另外向 awesome-dsh-plugin 提 PR；在此之前用上面的自定义索引源即可安装。

## License

MIT
