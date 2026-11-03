# kunlun-cli

让本机 AI Agent 用自然语言搜索、创建、读取、追加和修改本人的昆仑智联文档。需要 Node.js 22.18+、npm，以及能访问昆仑平台的办公网络。

当前版本 0.1.0，npm 包名为 **[@lvshrd/kunlun-cli](https://www.npmjs.com/package/@lvshrd/kunlun-cli)**，命令名仍为 `kunlun`。公共 registry 中不带 scope 的 `kunlun-cli` 不是本项目。

## 安装与更新

Windows、macOS 和 Linux 均通过 npm 安装：

```sh
npm install --global @lvshrd/kunlun-cli@latest
kunlun --version
```

以后更新时重复执行同一条安装命令，即可获取最新正式版：

```sh
npm install --global @lvshrd/kunlun-cli@latest
kunlun --version
```

程序更新保留独立配置目录中的应用配置和登录态，无需重复 config init。新增权限时仍需重新 auth login；已复制到项目的 Skill 另行同步。更新由上述命令触发，不在启动时后台下载或替换程序。

包已编译，没有运行时 npm 依赖。帮助和版本可离线使用，云端业务需要办公网络。PowerShell 使用 `kunlun.cmd --version` 等命令，避免 npm 的 ps1 入口被执行策略阻止；macOS / Linux 使用 `kunlun`。首次安装后若找不到命令，确认 npm 全局目录在 PATH 中，并完全重启终端和 Agent。

### 从旧 tgz 安装迁移

旧包名为 kunlun-cli，新包名带 @lvshrd，两者命令名相同。先移除旧程序再安装新包，应用配置目录不会因此删除。旧版 Windows 安装器使用专属目录，迁移并继续使用该目录：

```powershell
npm uninstall --global --prefix "$env:LOCALAPPDATA\kunlun-cli" kunlun-cli
npm install --global --prefix "$env:LOCALAPPDATA\kunlun-cli" @lvshrd/kunlun-cli@latest
```

此后更新也在 install 命令中保留同一个 --prefix。若以前是 npm 默认全局安装，则先 `npm uninstall --global kunlun-cli`，再用上方普通安装命令。多个安装位置共存时，Windows 用 `where.exe kunlun`、macOS / Linux 用 `which -a kunlun` 确认实际执行的新版本，不使用 --force 覆盖未知入口。

无法访问 registry 时，可从维护者获取完整离线交付目录，Windows 运行 install.cmd。其他平台使用 `npm install --global ./lvshrd-kunlun-cli-0.1.0.tgz`（版本以交付为准）。

## 首次配置

```sh
kunlun config init
kunlun skills install --dir .cursor/skills
kunlun auth login
```

向维护者领取批准使用的 App ID 和 Secret，或配置自己的昆仑应用。`config init` 在终端隐藏输入 Secret，不要把密钥放进命令参数或 Agent 对话。应用需开通 `kunlun auth scopes` 列出的用户身份权限，登记回调 `http://127.0.0.1:19876/callback`，并将使用者加入应用可用范围。

`auth login` 在本机浏览器请求当前版本固定权限，由本人确认账号并授权。`--scope` 只能选择本版本支持的非空子集；新增权限由维护者验证后随版本交付，升级后重新授权。

Skill 安装目录须是实际 Agent 的发现目录，`.cursor/skills` 是 Cursor 示例；源码统一保存在仓库根目录 `skills/`。两个技能须同级安装，安装后重开 Agent 对话。程序升级不会自动覆盖已复制的 Skill；备份自定义内容后，用 `skills install --dir <目录> --force` 同步。

## 使用

可以直接对具备本机终端工具的 Agent 说：

- “使用 kunlun-doc，找一下泵站巡检规程；有同名文档时先让我选。”
- “将这份草稿创建到我的昆仑云空间，读回核对，返回文档 ID 和可用链接。”
- “给这篇文档末尾追加以下内容。”
- “把‘每周检查一次’改成‘每天检查一次’，先给我看预览。”

也可以直接调用 CLI：

```sh
kunlun docs search --query "巡检规程"
kunlun docs read --name "泵站巡检规程"
kunlun docs read --document <docx链接或ID>
kunlun docs template --output ./草稿.md
kunlun docs create --title "巡检规程" --file ./草稿.md --dry-run
```

创建、追加、修改的完整参数见 `kunlun docs --help` 和 [Skill 命令参考](skills/kunlun-doc/references/kunlun-doc-commands.md)。创建和追加去掉 `--dry-run` 才会写入；编辑预览会读取云端，执行时携带预览返回的 revision。

## 当前边界

- 搜索仅支持本人身份，按完整标题读取须唯一匹配且明确为 docx。同名、候选未取全、旧版或未知资源类型不自动读取；真实平台搜索仍待验收。
- 写入支持普通段落和一至三级标题；修改要求在单个文本 run 内唯一匹配。删除、移动、重命名、原生编号、正文评论和复杂格式编辑尚未实现。
- 读取先检查 `complete`、`pagination_complete`、`content_complete` 和 `diagnostics`。成功退出不等于复杂文档完整呈现；省略内容不能视为不存在。分页失败以非零退出保留部分结果；`--raw` 按需返回原始块。
- 网络写入失败后先读回确认，不盲目重复创建或追加。文档分享仍受资源权限控制。未配置 `--web-base-url` 时，结果可能只有 ID，没有网页链接。

这是本机 Agent 调用 CLI，不是在昆仑“小惠”聊天窗口发指令。

## 配置与报障

默认配置位于 `~/.kunlun-cli`，不同工作目录共用一套配置；独立试用或多应用使用 `KUNLUN_CONFIG_DIR`。环境变量优先于文件。更换应用或端点会清除该配置目录的旧登录态。Secret 和 token 当前是本地文件存储，隐藏输入不等于落盘加密。

用 `config show`、`auth status` 查看脱敏状态；`doctor` 会联网探测，并可能缓存 bot token。退出用 `auth logout`，卸载程序不会自动删除全部凭证或云端文档。报障提供版本、时间和脱敏错误，不发送密钥或 token。

开发和发布见[开发指南](https://github.com/lvshrd/kunlun_cli/blob/main/docs/DEVELOPMENT.md)；另有[架构](https://github.com/lvshrd/kunlun_cli/blob/main/ARCHITECTURE.md)、[路线](https://github.com/lvshrd/kunlun_cli/blob/main/docs/ROADMAP.md)、[搜索接口依据](https://github.com/lvshrd/kunlun_cli/blob/main/docs/SEARCH_API.md)和[验收记录](https://github.com/lvshrd/kunlun_cli/blob/main/docs/ACCEPTANCE.md)。
