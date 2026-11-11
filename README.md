# kunlun-cli

让本机 AI Agent 用自然语言搜索、创建、读取、追加和修改本人的昆仑智联文档，以及读取和编辑电子表格、多维表格。需要 Node.js 22.18+、npm，以及能访问昆仑平台的办公网络。

待发布版本 **0.2.3**。0.2.0为命令改名和英文化，0.2.1为已有表格CRUD，0.2.2为三类表格创建/嵌入，0.2.3增加Sheets和Base的JSON一次初始化（含默认空白记录复用）。发布前可用源码生成的tgz或 `npm run install:local` 试用。

npm 包名为 **[@lvshrd/kunlun-cli](https://www.npmjs.com/package/@lvshrd/kunlun-cli)**。公共 registry 中不带 scope 的同名包不是本项目。

查看版本用 `kunlun-cli -v` 或 `kunlun-cli --version`，也支持 `kunlun-cli version`。查看帮助用 `-h` / `--help`，也支持 `kunlun-cli help`；`kunlun-cli help docs` 与 `kunlun-cli docs --help` 查看同一组文档命令。版本输出为 JSON，帮助输出为文本。

CLI 自身生成的帮助、交互提示、错误消息及修复建议统一使用英文。平台返回的原始错误、用户文档内容和中文示例模板保留原语言；JSON 字段名及错误类型保持稳定。

## 安装与更新

Windows、macOS 和 Linux 均通过 npm 安装：

```sh
npm install --global @lvshrd/kunlun-cli@latest
kunlun-cli --version
```

以后更新时重复执行同一条安装命令，即可获取最新正式版：

```sh
npm install --global @lvshrd/kunlun-cli@latest
kunlun-cli --version
```

程序更新保留独立配置目录中的应用配置和登录态，无需重复 config init。新增权限时仍需重新 auth login；已复制到项目的 Skill 另行同步。更新由上述命令触发，不在启动时后台下载或替换程序。

包已编译，没有运行时 npm 依赖。帮助和版本可离线使用，云端业务需要办公网络。PowerShell 使用 `kunlun-cli.cmd --version` 等命令，避免 npm 的 ps1 入口被执行策略阻止；macOS / Linux 使用 `kunlun-cli`。首次安装后若找不到命令，确认 npm 全局目录在 PATH 中，并完全重启终端和 Agent。

### 从旧 tgz 安装迁移

已安装 @lvshrd/kunlun-cli@0.1.0 的用户，在同一 npm prefix 升级即可；npm 移除该包的旧 kunlun 入口，并生成 kunlun-cli。原配置目录仍为 ~/.kunlun-cli。随后备份自定义 Skill，再执行 `kunlun-cli skills install --dir <实际目录> --force`，让 Agent 使用新命令。

更早的无 scope tgz 包名为 kunlun-cli，需要先移除旧程序再安装 scoped 包。旧版 Windows 安装器使用专属目录，迁移并继续使用该目录：

```powershell
npm uninstall --global --prefix "$env:LOCALAPPDATA\kunlun-cli" kunlun-cli
npm install --global --prefix "$env:LOCALAPPDATA\kunlun-cli" @lvshrd/kunlun-cli@latest
```

此后更新也在 install 命令中保留同一个 --prefix。若以前是 npm 默认全局安装，则先 `npm uninstall --global kunlun-cli`，再用上方普通安装命令。多个安装位置共存时，Windows 用 `where.exe kunlun-cli`、macOS / Linux 用 `which -a kunlun-cli` 确认实际执行的新版本，不使用 --force 覆盖未知入口。

无法访问 registry 时，可从维护者获取完整离线交付目录，Windows 运行 install.cmd。其他平台使用 `npm install --global ./lvshrd-kunlun-cli-0.2.3.tgz`（版本以交付为准）。

## 首次配置

```sh
kunlun-cli config init
kunlun-cli skills install --dir .cursor/skills
kunlun-cli auth login
```

向维护者领取批准使用的 App ID 和 Secret，或配置自己的昆仑应用。`config init` 在终端隐藏输入 Secret，不要把密钥放进命令参数或 Agent 对话。应用需开通 `kunlun-cli auth scopes` 列出的用户身份权限，登记回调 `http://127.0.0.1:19876/callback`，并将使用者加入应用可用范围。

`auth login` 在本机浏览器请求当前版本固定权限，由本人确认账号并授权。`--scope` 只能选择本版本支持的非空子集；新增权限由维护者验证后随版本交付，升级后重新授权。

Skill 安装目录须是实际 Agent 的发现目录，`.cursor/skills` 是 Cursor 示例；源码统一保存在仓库根目录 `skills/`。kunlun-shared、kunlun-doc、kunlun-tables 三个技能须同级安装，安装后重开 Agent 对话。程序升级不会自动覆盖已复制的 Skill；备份自定义内容后，用 `skills install --dir <目录> --force` 同步。

## 使用

可以直接对具备本机终端工具的 Agent 说：

- “使用 kunlun-doc，找一下泵站巡检规程；有同名文档时先让我选。”
- “将这份草稿创建到我的昆仑云空间，读回核对，返回文档 ID 和可用链接。”
- “给这篇文档末尾追加以下内容。”
- “把‘每周检查一次’改成‘每天检查一次’，先给我看预览。”

也可以直接调用 CLI：

```sh
kunlun-cli docs search --query "巡检规程"
kunlun-cli docs read --name "泵站巡检规程"
kunlun-cli docs read --document <docx链接或ID>
kunlun-cli docs template --output ./草稿.md
kunlun-cli docs create --title "巡检规程" --file ./草稿.md --dry-run
```

要创建包含三类表格的文档，先创建正文，再调用专用命令：

```sh
kunlun-cli docs tables create --document <新文档ID> --type native --title "普通表格" --file native.json
kunlun-cli docs tables create --document <新文档ID> --type sheet --title "电子表格" --rows 3 --columns 3
kunlun-cli docs tables create --document <新文档ID> --type bitable --title "多维表格"
```

native.json为 `{"values":[["项目","状态"],["示例","进行中"]]}`，Sheet也可用同样的values JSON一次创建并填充。Base用 `{"fields":[{"field_name":"任务","type":1}],"records":[{"fields":{"任务":"示例"}}]}`，执行 `docs tables create --document <ID> --type bitable --file base.json` 即可配置字段、复用初始空白记录并写入核对；不需要Agent先手工records list。不带文件仍创建空资源。完整步骤见[三类表格创建流程](skills/kunlun-tables/references/create-with-tables.md)。

创建、追加、修改的完整参数见 `kunlun-cli docs --help` 和 [Skill 命令参考](skills/kunlun-doc/references/kunlun-doc-commands.md)。创建和追加去掉 `--dry-run` 才会写入；编辑预览会读取云端，执行时携带预览返回的 revision。

## 当前边界

表格入口为 `sheets` 和 `bitable`。文档中内嵌表格先用 `docs read` 查看 resources，再使用其中的资源 token / 工作表或数据表 ID。示例：

```sh
kunlun-cli sheets sheets --spreadsheet <sheets链接或token>
kunlun-cli sheets read --spreadsheet <token> --range 'sheet1!A1:C20'
kunlun-cli sheets write --spreadsheet <token> --range 'sheet1!A1:C1' --file cells.json --dry-run
kunlun-cli sheets clear --spreadsheet <token> --range 'sheet1!A3:C3' --dry-run
kunlun-cli bitable tables --app <base链接或token> --all
kunlun-cli bitable records list --app <token> --table <table_id> --all
kunlun-cli bitable records update --app <token> --table <table_id> --record <record_id> --file record.json --dry-run
kunlun-cli bitable records delete --app <token> --table <table_id> --record <record_id> --dry-run
```

cells.json 为 `{"values":[["Task",1,"Plan"]]}`；record.json 为 `{"fields":{"Task":"Plan"}}`。去掉 --dry-run 执行写入并读回核对。还支持表格 append、Base 记录新增/查询和字段新增/修改，完整格式见[表格 Skill 参考](skills/kunlun-tables/references/commands.md)，接口及限制见[表格 API 依据](docs/TABLE_API.md)。

本版新增 sheets:spreadsheet、bitable:app 两项固定权限，后台开通后需重新 `auth login`。已完成六项权限本人授权、指定文档内嵌 Sheets/Base 真实增删改查，以及新建文档中三类表格的正式命令创建/嵌入和内容核对。普通DocX表格支持未合并、每格一个普通段落的文字；创建最多9×9，读最多81格，写最多50格。Sheets clear只清空内容，Base可删除指定记录和非主字段。Sheets不接受原生布尔值；Base数字字符串仅依据数字字段类型核对。写入没有原子并发保护，字段属性只核对名称和类型。合并单元格、原生表格行列结构调整、跨表自动同步和画板内容操作尚未实现；画板当前仅发现资源ID。

- 搜索仅支持本人身份，按完整标题读取须唯一匹配且明确为 docx。同名、候选未取全、旧版或未知资源类型不自动读取；真实平台搜索仍待验收。
- 写入支持普通段落和一至三级标题；修改要求在单个文本 run 内唯一匹配。删除、移动、重命名、原生编号、正文评论和复杂格式编辑尚未实现。
- 读取先检查 `complete`、`pagination_complete`、`content_complete` 和 `diagnostics`。成功退出不等于复杂文档完整呈现；省略内容不能视为不存在。分页失败以非零退出保留部分结果；`--raw` 按需返回原始块。
- 网络写入失败后先读回确认，不盲目重复创建或追加。文档分享仍受资源权限控制。未配置 `--web-base-url` 时，结果可能只有 ID，没有网页链接。

这是本机 Agent 调用 CLI，不是在昆仑“小惠”聊天窗口发指令。

## 配置与报障

默认配置位于 `~/.kunlun-cli`，不同工作目录共用一套配置；独立试用或多应用使用 `KUNLUN_CONFIG_DIR`。环境变量优先于文件。更换应用或端点会清除该配置目录的旧登录态。Secret 和 token 当前是本地文件存储，隐藏输入不等于落盘加密。

用 `config show`、`auth status` 查看脱敏状态；`doctor` 会联网探测，并可能缓存 bot token。退出用 `auth logout`，卸载程序不会自动删除全部凭证或云端文档。报障提供版本、时间和脱敏错误，不发送密钥或 token。

开发和发布见[开发指南](https://github.com/lvshrd/kunlun_cli/blob/main/docs/DEVELOPMENT.md)；另有[架构](https://github.com/lvshrd/kunlun_cli/blob/main/ARCHITECTURE.md)、[路线](https://github.com/lvshrd/kunlun_cli/blob/main/docs/ROADMAP.md)、[搜索接口依据](https://github.com/lvshrd/kunlun_cli/blob/main/docs/SEARCH_API.md)和[验收记录](https://github.com/lvshrd/kunlun_cli/blob/main/docs/ACCEPTANCE.md)。
