# 开发指南

本文面向复刻项目、接入另一套昆仑部署、扩展业务命令和交付版本的开发者。日常安装与自然语言使用见 [README](../README.md)，模块关系见 [架构说明](ARCHITECTURE.md)。

## 1. 从源码运行

准备 Git、Node.js **22.18+** 和 npm。帮助、模板、创建预览及自动化测试可离线运行；首次安装开发依赖需要 npm 源可达，授权、编辑预览和云端操作需要能访问目标昆仑平台的办公网络。

```sh
git clone https://github.com/lvshrd/kunlun_cli.git
cd kunlun_cli
npm ci
node src/main.ts --version
node src/main.ts --help
npm test
npm run check
```

源码入口是 `node src/main.ts <命令>`，无需先全局安装；下文除安装产物外均使用这个入口。`npm start -- <命令>` 等价。Windows PowerShell 若拦截 npm 的 `.ps1` 入口，使用 `npm.cmd`；已安装 CLI 同理使用 `kunlun-cli.cmd`。

| 命令 | 用途 |
| --- | --- |
| `npm test` | Node 内置测试，覆盖 HTTP 模拟、鉴权、路由及业务逻辑；不调用真实平台 |
| `npm run check` | TypeScript 类型检查 |
| `npm run build` | 清理并生成 `dist/`，排除测试、重写相对导入扩展名 |
| `npm run test:package` | 临时目录、空 npm 缓存和模拟配置下的离线安装验收 |
| `npm run package` | 构建并生成 `release/` 中的 tgz、校验文件和安装器 |
| `npm run install:local` | 打包后真实安装到当前 Windows 用户环境，可能修改用户 PATH |

### 构建与本地目录

| 目录 | 用途与保留方式 |
| --- | --- |
| `dist/` | 编译输出，可随时通过 build 重建，不作为源码维护。 |
| `release/` | 当前版本的离线交付集，通过 package 重建；只分发 tgz、校验文件、manifest、安装器和生成的说明。历史包、研究记录与备份移到本地私有目录，不混入交付集。 |
| `.kunlun-sandbox/` | 设置 `KUNLUN_CONFIG_DIR` 后按需创建的隔离配置目录，不是程序依赖；可能含测试账号凭证，删除后需要重新配置或登录，不随程序分发。 |
| `.private/` | 本地维护证据、历史交付物与备份，Git 忽略；不属于可重建的源码，按需要另做受控备份。 |

公开文档分别维护使用方法、开发流程和架构；详细参数维护在 Skill 参考中。本机维护者的后续计划只维护在 Git 忽略的根目录 `TODO.md`，不在交付说明中重复维护。

## 2. 配置自己的应用与授权

### 应用后台准备

1. 在目标昆仑开放平台创建或取得获准使用的自建应用，记录 App ID 与 App Secret。不要复制他人的登录态。
2. 将测试账号加入应用可用范围，按该环境要求完成权限申请、审核和版本发布。
3. 登记本机浏览器授权回调 **`http://127.0.0.1:19876/callback`**，与 CLI 配置逐字一致。回调由本机进程监听，不需要部署公网服务；修改端口时后台和 CLI 都要同步。
4. 运行以下命令查看本版本支持的用户权限，在后台开通对应权限：

```sh
node src/main.ts auth scopes
```

当前固定权限为 `docx:document`、`drive:drive.metadata:readonly`、`drive:drive:readonly`、`space:document:retrieve`、`sheets:spreadsheet`、`bitable:app`，以 [scopes.ts](../src/auth/scopes.ts) 和命令输出为准。`auth login --scope "..."` 只能选择其中的非空子集，不接受临时猜测的新权限。

应用后台权限、用户本人同意和目标资源访问权限分别生效。后台新增权限或刷新 token 不会扩大旧授权；支持的权限开通后重新 `auth login`。扩展到新权限需按后文开发流程验证并随版本交付。

### 隔离配置并登录

不同工作目录默认共用 `~/.kunlun-cli`。开发时先在当前终端设置独立配置目录，避免改动日常应用或登录态。

PowerShell：

```powershell
$env:KUNLUN_CONFIG_DIR = Join-Path (Get-Location) '.kunlun-sandbox'
```

macOS / Linux：

```sh
export KUNLUN_CONFIG_DIR="$PWD/.kunlun-sandbox"
```

随后在同一终端运行：

```sh
node src/main.ts config init
node src/main.ts config show
node src/main.ts auth login
node src/main.ts auth status
```

`config init` 在交互终端隐藏输入 Secret；本人在浏览器确认账号和授权。无法自动打开浏览器时使用 `auth login --no-browser`，按终端提示在运行 CLI 的同一台电脑完成授权。

接入另一套私有化部署时，配置该部署的 HTTPS 根地址，不要带 API 路径：

```sh
node src/main.ts config init --open-base-url https://open.example.com --accounts-base-url https://accounts.example.com --web-base-url https://docs.example.com --redirect-url http://127.0.0.1:19876/callback
```

上例是占位地址，需替换为管理员确认的端点。`web-base-url` 只用于拼接文档网页链接，可不配置；未配置时业务结果仍有资源 ID。端点可配置不代表所有私有化版本兼容，需重新验证授权与业务接口。

| 环境变量 | 含义 |
| --- | --- |
| `KUNLUN_CONFIG_DIR` | 配置、Secret、用户 session 和 bot token 的目录 |
| `KUNLUN_APP_ID`、`KUNLUN_APP_SECRET` | 覆盖本地应用凭证 |
| `KUNLUN_OPEN_BASE_URL`、`KUNLUN_ACCOUNTS_BASE_URL` | 覆盖开放平台与账号服务根地址 |
| `KUNLUN_REDIRECT_URL`、`KUNLUN_WEB_BASE_URL` | 覆盖本机回调与文档网页根地址 |
| `KUNLUN_DEBUG=1` | 向 stderr 输出错误栈，分享前先脱敏 |

环境变量优先于配置文件；排障时先检查继承的覆盖项。通过 `config init` 更换 App ID、开放平台或账号端点会清除该配置目录的旧 session。Secret 和 token 当前以本地文件保存，尚未接入系统密钥链，隐藏输入不等于落盘加密。

自动化配置可从 stdin 读取 Secret，禁止放入命令参数、仓库或 Agent 对话。PowerShell 示例：

```powershell
$kunlunSecret = Read-Host 'App Secret' -AsSecureString
[System.Net.NetworkCredential]::new('', $kunlunSecret).Password | node src/main.ts config init --app-id cli_example --app-secret-stdin
Remove-Variable kunlunSecret
```

### 安装开发版 Skill

```sh
node src/main.ts skills install --dir .codex/skills --dry-run
node src/main.ts skills install --dir .codex/skills
```

`.codex/skills` 仅作目录示例，请改为当前 Agent 实际发现技能的目录。三个 Skill 必须同级安装，随后新开 Agent 对话，并让 Agent 继承开发配置目录、使用源码入口或对应安装产物。开发时不要让 Agent 误用 PATH 中的旧版命令。

`skills/` 是分发源码，安装目录是副本。修改后备份副本中的自定义内容，再用 `skills install --dir <目录> --force` 同步。CLI 升级不会自动更新副本。

## 3. 验证应用能力

以下 `<...>` 均为需替换的占位符。先在获准的测试区域跑通一个最小文档流程：

```sh
node src/main.ts docs template --output ./procedure.md
node src/main.ts docs create --title "CLI 开发测试" --file ./procedure.md --dry-run
node src/main.ts docs create --title "CLI 开发测试" --file ./procedure.md
node src/main.ts docs read --document <创建返回的document_id>
node src/main.ts docs search --query "CLI 开发测试"
```

创建、追加的预览离线运行，编辑预览读取云端；去掉 `--dry-run` 才提交写入。编辑执行时携带预览返回的 revision，冲突后重新预览。写入超时或结果不明时，保留资源 ID、`client_token` 和进度，先读回再恢复，避免重复创建或追加。

完整参数、JSON 及恢复步骤统一维护在 Skill 参考中。下列参考使用已安装的 `kunlun-cli`；源码调试时替换为 `node src/main.ts`。

| 验证范围 | 操作参考 | 验收要点 |
| --- | --- | --- |
| 文档搜索、读取、追加与修改 | [文档命令参考](../skills/kunlun-doc/references/kunlun-doc-commands.md) | 标题消歧、单一文本匹配、版本冲突与写后读回；搜索真实兼容性须在目标环境验收 |
| 在同一文档创建普通表格、Sheets、Base | [三类表格创建与初始化](../skills/kunlun-tables/references/create-with-tables.md) | JSON 初始化、返回资源 ID、字段和内容读回、残留空白记录数量 |
| 操作已有原生表格、Sheets、Base | [表格命令与 JSON 参考](../skills/kunlun-tables/references/commands.md) | 从 `resources` 定位正确类型，区域/记录/字段目标准确，写入、清空与删除后核对 |

读取时检查 `complete`、`pagination_complete`、`content_complete`、`diagnostics` 和 `resources`；需要排查转换时加 `--raw`。复杂内容未展开不能当作不存在，分页失败的部分结果也不能当作全文。Sheets 和 Base 写后读回不提供事务或原子并发保护；当前类型与规模限制以对应参考为准。

各命令组可用 `node src/main.ts <命令组> --help` 查询。自动化用例通过后仍需平台实测，记录方法见第 5 节。

## 4. 扩展一项应用能力

### 先确认目标环境的接口

| 参考入口 | 用法 |
| --- | --- |
| [昆仑开放平台文档](https://open.fklzl.cnpc.com.cn/document/home/index) | 从目标环境的官方文档查认证方式、请求与响应、权限、限额和错误码；通常需要办公网络 |
| [昆仑服务端 API 目录](https://open.fklzl.cnpc.com.cn/api/tools/server-side-api/list) | 按业务名或方法/路径定位文档；文档站路由失效时先核对目录，不猜业务 API 是否存在 |
| [飞书 DocX 创建文档参考](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/create) | 可辅助理解同类资源结构；不是昆仑私有化环境可用性的证据 |

以下页面来自项目适配时的官方接口调研，需在办公网络核对当前版本；个别链接保留旧路径，失效时从该环境 API 目录按方法与路径定位。另一套私有化部署使用其自己的文档与后台，不能把飞书公有云的新接口、scope 或响应格式直接搬到昆仑。

| 业务 | 官方 API 文档 | 对照源码 |
| --- | --- | --- |
| 关键词搜索 | [搜索云文档](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/ugDM4UjL4ADO14COwgTN) | `src/domain/docs/search.ts` |
| DocX 结构与嵌入资源 | [Block 数据结构](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/data-structure/block) | `src/domain/docs/read.ts` |
| 普通表格及嵌入表格创建 | [创建嵌套块](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/document-block-descendant/create)、[创建块](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/document-block-children/create) | `src/domain/docs/tables.ts` |
| Sheets 元数据与区域读写 | [查询工作表](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/sheets-v3/spreadsheet-sheet/query)、[读取范围](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/ugTMzUjL4EzM14COxMTN)、[写入范围](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uAjMzUjLwIzM14CMyMTN)、[支持写入的数据类型](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/ugjN1UjL4YTN14CO2UTN) | `src/domain/sheets/service.ts` |
| Base 字段与记录 | [列出字段](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-field/list)、[查询记录](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/search)、[新增记录](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/create)、[更新记录](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/update) | `src/domain/bitable/service.ts`、`initialize.ts` |

当前适配路径可从源码检索：文档位于 `/open-apis/docx/v1/documents`，搜索使用 `/open-apis/suite/docs-api/search/object`，Sheets 使用 v2 values / v3 元数据，Base 使用 `/open-apis/bitable/v1/apps`。这些是当前实现契约，扩展前仍需逐项核实目标环境。

未封装的接口可用 `api` 命令做开发探测，例如预览一个只读请求：

```sh
node src/main.ts api GET /open-apis/authen/v1/user_info --dry-run
```

去掉 `--dry-run` 才调用平台。`--params` 接受查询 JSON，`--data` 接受请求体 JSON；复杂内容优先写成正式业务命令，避免 shell 转义。该原始入口尚未由开发者模式开关隔离，支持 POST/PUT/PATCH/DELETE，**不提供业务命令的校验、读回核对与恢复编排**；普通 Agent 工作流应调用专用命令。默认 `--as user`；`--as bot` 是显式应用身份，不能用来绕过本人权限或搜索限制。

### 按现有分层实现

以已有的 `sheets clear` 或 `bitable records update` 为参照，从小而完整的能力开始：

1. **定义业务契约。** 明确目标资源、身份、参数、分页、预览内容和成功标准。写入还需定义失败后的部分结果与恢复方式；二进制接口要先补充传输能力，不能把图片当 JSON/text 处理。
2. **实现 domain。** 在 `src/domain/<业务>/` 中封装 API 调用与结果验证，依赖 [OpenApi](../src/client/http.ts) 接口便于模拟测试。可参考 [Sheets service](../src/domain/sheets/service.ts)、[Base service](../src/domain/bitable/service.ts) 和 [table-common](../src/domain/table-common.ts)。domain 返回数据或抛出 `CliError`，不打印 stdout、不自行读取全局 Secret。
3. **添加命令。** 在 `src/cli/commands/` 校验 flags、文件或 stdin 输入、选择身份、获取 token、调用 domain，再经 `printOk` 输出。新增命令组需加入 [routes.ts](../src/cli/routes.ts)；现有表格命令参考 [tables.ts](../src/cli/commands/tables.ts)，DocX 表格参考 [doc-tables.ts](../src/cli/commands/doc-tables.ts)。
4. **处理权限。** 先用官方文档与本人测试确认最小可用权限。需要新 scope 时更新 `src/auth/scopes.ts`、后台授权、相关测试和说明，不从上游报错直接自动扩大 scope；用新版本重新授权验证。
5. **补测试与实测。** 模拟正常请求、非法输入、分页不完整、权限错误、网络失败和写入结果不明；为预览断言无意外网络/写入。平台相关行为再在专用测试资源验证，保留可恢复的 ID，不能用模拟替代真实兼容性结论。
6. **同步 Skill 与版本。** 修改 `skills/<领域>/SKILL.md` 的路由与边界，复杂参数放对应 `references/`。新增 Skill 还需更新安装器的名称列表及打包必需项；核对 `src/cli/commands/skills.ts`、`scripts/package-lib.mjs` 和相关测试。命令/权限随版本交付，已安装副本另行同步。

stdout 的业务信封保持 `{"ok":true,"data":...}` 或 `{"ok":false,"error":...,"data":...}`；失败退出码非零，部分结果放 `data`。帮助为文本，CLI 自身提示和修复建议使用英文，原始平台错误与用户内容保留原语言。新增命令应沿用这些约定，不让 domain 承担传输输出。

## 5. 验证与打包交付

```sh
npm test
npm run check
npm run test:package
npm run package
```

`test:package` 在临时目录、空 npm 缓存、模拟配置下离线安装；Windows 额外验证多安装共存、覆盖更新和校验失败拒绝安装，结束自动清理。它不写入维护者凭证，不证明云端业务可用。

受限环境若无法写入默认 npm 缓存，可先将 `npm_config_cache` 指向可写的本地目录，例如 PowerShell：`$env:npm_config_cache = Join-Path (Get-Location) '.private/npm-cache'`。

`package` 通过暂存目录白名单打包：只有 `package.json`、README、LICENSE、编译后 JS 与 Markdown Skill，去掉交付包内开发依赖和 scripts。源码、测试、架构、开发指南、内部记录和凭证不进入 tgz。产物包括 `lvshrd-kunlun-cli-<版本>.tgz`、`.sha256`、`release.json`、Windows 安装器和使用说明；`dist/`、`release/` 均为忽略的生成物。

README 图片使用公开仓库的 GitHub raw 绝对链接，以便 GitHub 和 npm 页面引用；`asset/` 不随 tgz 分发。发布前先将引用的素材推送至对应仓库路径，并在未登录的环境检查浅色/深色 logo 与流程图可访问，避免私有资源或失效地址导致图片不可见。

### 隔离安装产物并实测

使用新终端，清除继承的 `KUNLUN_*` 覆盖项，再为试用指定独立 prefix、缓存和配置目录。PowerShell 示例：

```powershell
Get-ChildItem Env: | Where-Object Name -like 'KUNLUN_*' | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
$trialRoot = Join-Path $env:TEMP ('kunlun-trial-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $trialRoot | Out-Null
$env:KUNLUN_CONFIG_DIR = Join-Path $trialRoot 'config'
$env:npm_config_cache = Join-Path $trialRoot 'npm-cache'
$trialPackage = Join-Path (Get-Location) ('release/lvshrd-kunlun-cli-' + (Get-Content package.json -Raw | ConvertFrom-Json).version + '.tgz')
npm.cmd install --global --prefix $trialRoot $trialPackage --offline --ignore-scripts --no-audit --no-fund
& (Join-Path $trialRoot 'kunlun-cli.cmd') --version
& (Join-Path $trialRoot 'kunlun-cli.cmd') config show
```

macOS / Linux 使用相同的 npm prefix 与独立 `KUNLUN_CONFIG_DIR`，入口位于 `<prefix>/bin/kunlun-cli`。真实 Agent 必须继承试用环境或使用对应绝对入口。试用目录可能含真实凭证，不提交、不分发；结束关闭终端，清理前确认目录用途。

本人完成授权，在指定测试文档运行第 3 节流程，核对文本、追加次数、资源归属、完整性标记、表格读回与版本冲突。再由一位非维护者在独立电脑通过 Agent 验证。记录版本、目标部署、账号角色、操作、脱敏结果和未通过项；内部账号、资源 ID、原始响应和未公开计划放本地私有目录或有访问控制的私有仓库，公开文档只保留复现方法与已知边界。

### 离线交付与旧安装迁移

交付 `release/` 中 tgz、校验文件、manifest、`install.cmd`、`install.ps1` 和使用说明。Windows 安装器验证 SHA-256 后安装，`-InstallDir` 选择专属目录，`-NoPersistPath` 避免写入持久 PATH。首次 PATH 变更后完全重启终端与 Agent。

从旧版无 scope 的 `kunlun-cli` npm 包迁移时，先检查 `npm list --global --depth=0`，在**旧包实际安装的 prefix** 卸载旧包，再安装 `@lvshrd/kunlun-cli`：

```sh
npm uninstall --global --prefix <旧prefix> kunlun-cli
npm install --global --prefix <旧prefix> @lvshrd/kunlun-cli@latest
```

如果使用 npm 默认全局目录，两条命令都可省略 `--prefix`。若旧安装本来就是 `@lvshrd/kunlun-cli`，在同一 prefix 更新即可；npm 会更新其命令入口。旧的离线安装目录也要检查 PATH 顺序，Windows 用 `Get-Command kunlun-cli.cmd -All`，macOS / Linux 用 `type -a kunlun-cli` 确认实际入口。不要用 `--force` 跳过不同包之间的命令冲突，也不要删除 `~/.kunlun-cli` 来解决入口问题。

程序更新保留独立配置目录中的应用与登录态；新 scope 仍需重新授权，Skill 副本仍需单独同步。退出登录用 `auth logout`，卸载 npm 包不会自动删除全部凭证或云端资源。

## 6. 发布到 npm

公共包名为 `@lvshrd/kunlun-cli`，命令名为 `kunlun-cli`；`publishConfig` 指定公共 registry 与 public 访问。项目采用 [MIT 许可证](../LICENSE)，版权署名为 `lvshrd`；安装包保留许可声明和完整 LICENSE。

1. `npm login --registry=https://registry.npmjs.org/`，再用 `npm whoami --registry=https://registry.npmjs.org/` 确认身份；不要在对话或仓库保存 npm token。
2. 同步递增 `package.json`、lockfile、`src/version.ts` 与 README 中的版本信息，用 `npm view @lvshrd/kunlun-cli versions --json` 确认目标版本未被发布。
3. 完成第 5 节验证和实测，审查 tgz 清单及 SHA-256，确认没有凭证或内部记录。
4. 对验收过的**同一个 tgz** 执行 `npm publish ./release/lvshrd-kunlun-cli-<版本>.tgz --access public --tag latest --dry-run`，核验后去掉 `--dry-run` 发布。dry-run 不证明发布权限或账号验证已通过。
5. 在空目录从 registry 安装精确版本，验证版本、帮助及 Skill 安装，再更新 README 中实际发布状态。

`latest` 指向最新正式版，使用者重复 npm 安装命令即可更新；CLI 启动时不会自行下载或替换程序。

公开仓库保留上手方法、开发流程和能力边界；维护者笔记保存在 Git 忽略的 `.private/` 或独立私有仓库。`.gitignore` 仅阻止后续新增跟踪，移走当前文件不会清除既有 Git 历史，访问控制需由私有仓库或本机权限保证。
