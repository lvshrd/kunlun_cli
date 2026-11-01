# 验收记录与复验步骤

## 2026-11-01：搜索定位（文档核对与本地验证，真实业务待验收）

- 先通过昆仑官方接口目录定位“搜索云文档”，读取真实文档正文，确认 POST `/open-apis/suite/docs-api/search/object`、仅用户身份、请求类型 doc 包含 doc/docx，以及 offset + count < 200。权限为 drive:drive、drive:drive:readonly、search:docs:read 任选其一；沿用版本已有 drive:drive:readonly，没有扩 scope。来源与边界见 [SEARCH_API.md](SEARCH_API.md)。
- 新增 `docs search --query` 和 `docs read --name`。完整标题唯一匹配且明确为 docx 才自动读取；同名、分页未完、相近标题或旧版类型返回候选及明确错误，不读取猜测目标。
- 使用本机已有 Node.js 22.19.0，安装锁定开发依赖后，`npm test` 45 项及 `npm run check` 通过。新增模拟测试覆盖请求契约、分页上限与下一页尺寸、异常响应、权限错误、类型区分和搜索后读取的真实命令路由。
- `npm run test:package` 通过（macOS，使用临时 npm 缓存）：离线隔离安装、仓库外命令、帮助包含搜索入口、非法分页在配置前拒绝、Skill 包含搜索工作流。未运行 Windows 安装器实测，也没有更新真实用户 PATH 或现有程序安装。
- 本机无默认应用配置和本人登录态，未调用真实搜索业务接口。仍需验证实际授权、中文关键词、doc/docx 响应类型、分页、同名消歧和选定文档后的读回。以上本地验证不能代替真实平台验收，尚未作为新版本正式分发。

## 2026-10-29：Windows 安装与覆盖更新

- `npm run test:package` 通过。Windows 安装器使用中文临时目录、空 npm 缓存离线安装；哈希不符时拒绝安装。
- 同版本重装恢复被修改的程序文件并移除旧包残留，模拟 config、App Secret、用户 session 和 bot token 内容保持不变。
- 安装后的 `kunlun` 在仓库外通过 CMD 的 PATH 查找执行成功；自动化使用 `-NoPersistPath`，验证前后真实用户 PATH 不变。
- 打包新增 install.cmd / install.ps1、release.json；源码中的 `npm run install:local` 可一次打包并安装。版本继续使用 0.1.0 供本机迭代，正式分发应递增版本。
- 本机已通过交付目录的 install.cmd 安装到真实用户的 `%LOCALAPPDATA%\kunlun-cli`；用户 PATH 原有内容及注册表值类型保留，仅新增安装目录。按持久环境重建 PATH 后，在仓库外 CMD 中通过 `where kunlun` 和 `kunlun --version` 验证解析与执行。真实配置目录的 config、App Secret、用户 session、bot token 四个文件安装前后摘要一致。

已运行的终端和 Agent 仍需重启才能继承首次新增的 PATH；自动化子进程检查不等于实际 Agent 已完成重启验收。配置存储目录与安装目录相互独立。

## 2026-10-28：固定 scope 与授权前检查（待正式发布）

维护者确认 `docx:document`、`drive:drive.metadata:readonly`、`drive:drive:readonly`、`space:document:retrieve` 四项一起请求已能完成真实登录。本轮据此固定版本权限集合；未重复执行真实授权，未验证新增云空间 API。

维护者随后反馈：使用实际 Agent 已能初步完成登录与 `append`。这是用户反馈的真实使用结果，本轮自动化未独立复现；尚未提供追加内容读回对比、独立同事或其他电脑的验收证据。实际使用还暴露出命令不在 PATH、复杂内容读取不保真，以及原生标题自动编号、正文锚定评论的需求，已纳入开发路线。

- 33 项测试及类型检查通过。默认授权 URL 精确包含四项；显式子集去重并规范空白；空值、未知项、通配符、错误分隔和混合非法输入被拒绝。
- 使用模拟应用启动真实 CLI 子进程，验证拼错、重复及非法授权参数直接返回 usage 错误、stderr 无授权等待提示，原应用配置、密钥与用户 session 字节内容保持不变。
- `auth scopes` 无需应用配置即可查询版本默认和允许集合；权限错误提示不再拼接上游任意 scope 为登录命令。
- 隔离安装包验收通过：空缓存离线安装、仓库外命令运行，以及安装入口的固定权限查询和非法授权参数拦截；原有配置、Skill、模板和文档预览流程通过。
- shared Skill 的 frontmatter 与此前版本一致，相对引用已检查；官方格式校验器在当前运行环境缺少 PyYAML，未执行完成。

版本号仍为 0.1.0，以上是源码和临时构建包验证，尚未更新本机既有安装或生成新的正式 release。分发前需递增版本并重新打包、更新已安装 Skill。180 秒回调等待逻辑及通用 API 入口未在本步改动，后续计划见 [ROADMAP.md](ROADMAP.md)。

## 2026-10-23：统一发行 0.1.0

此前 0.1.1 / 0.1.2 为本地试验编号，以下历史记录只保留演进过程。本次统一为不含应用凭证的 0.1.0，不再提供部门内置密钥包。

- 30 项单元测试及类型检查通过；隐藏输入测试覆盖 Secret 不出现在程序回显和取消配置。
- 安装包隔离测试通过：空缓存离线安装、仓库外命令运行、全新配置为空、stdin 模拟配置、Skill 安装、模板、dry-run 及未登录写入拦截。
- 配置 init 支持真实终端交互与脚本 stdin 两种入口；在独立 prompt-check 目录完成模拟应用的终端交互验证。
- 保留用户调整的 kunlun-doc 目录命名，修正 frontmatter、安装器与引用；模板改为编译内置内容，不依赖已移除的 examples 目录。
- 清理旧试验发行包，构建前清理 dist，打包检查拒绝旧 bundled.js。
- 提供 npm run sandbox，在本机保留独立程序 prefix、npm 缓存、配置与工作目录供用户亲自完成真实授权和云端试用。

本次自动化不执行真实浏览器授权，不操作云端业务文档；仍沿用下文已完成的文档读写实测证据。新环境中的本人授权与真实试用步骤见 [TRYOUT.md](TRYOUT.md)。

## 2026-10-23：0.1.2 默认应用、Agent 接入与编辑

- `npm test`：29 项通过；类型检查通过。
- 两个 Agent Skill 通过 skill-creator 官方格式校验，新增按自然语言需求调用 CLI 的指导；未将格式校验描述为所有 Agent 的实际任务验收。
- 两种安装包通过隔离、离线安装测试：模拟部门包无需本机应用配置即可识别默认应用，Secret 不出现在 config show；通用包需要自行配置应用。
- 自定义应用覆盖后清除旧用户 / bot session，修改 App ID 或主机不会回退使用部门内置 Secret。
- Skill 安装命令完整复制两个 Skill，默认拒绝覆盖已有目录；模板和创建预览保持可用。
- 对保留的测试文档追加一段“0.1.2 编辑验证：每周检查一次。”，预览后携带 revision 4 修改为“每天检查一次。”，读回确认新文本存在、旧文本消失，最终共 10 个块。
- 版本冲突、重复匹配、不完整分页拒绝修改，以及文本样式保留由单元测试覆盖；本轮未实际制造云端并发冲突。

部门包将真实默认应用仅注入临时打包目录中的 JS，通用包、源码和仓库 dist 不含真实内置凭证。两类包均不包含维护者用户 token。内置 Secret 可提取，应用成员范围不能保证持包非成员完全无法使用应用凭证；未对非成员账号进行越权探测。

仍需选择真实部门同事，在独立电脑通过其 Agent 完成本人授权和文档任务。该多人环境验收不由本机安装与模拟凭证测试替代。用户入口分为 [成员](MEMBERS.md)、[维护者](MAINTAINER.md)、[外部使用者](EXTERNAL.md)。

## 2026-10-22：0.1.1 部门分发 MVP

新增 JavaScript 构建、npm 包文件白名单、全局 `kunlun` 入口、`--version`、分组帮助、本地 `docs template`、交付包 SHA-256 和同事快速指南。安装包未发布到 npm registry。

验证环境：Windows、Node.js 24.21.0、npm 11.19.0。`npm test` 25 项通过；`npm run check` 和 `npm run build` 通过。

`npm run test:package` 通过，在临时中文安装目录、工作目录与独立配置目录中验证：

| 项目 | 结果 |
| --- | --- |
| 编译、打包及文件白名单 | 包含运行 JS、模板、指南和 Skill；排除源码、测试、asset 和凭证 |
| 空 npm 缓存离线安装 | 使用全局 prefix 安装 tgz，禁用安装脚本，无需运行时依赖下载 |
| npm 命令入口 | 从仓库外通过 npm 生成的 Windows `kunlun.cmd` 运行成功 |
| 帮助与版本 | 返回安装版本 0.1.1，帮助使用 kunlun 命令 |
| 配置及未登录状态 | 模拟应用配置正常，config show 不输出模拟密钥，auth status 显示未登录 |
| 本地模板 | 中文路径、UTF-8 内容、拒绝覆盖已存在文件均通过 |
| 创建预览 | 从生成的模板读取并预览，返回正文块数量 |
| 未登录写入 | 在调用云端前返回 auth 错误 |

本轮未使用维护者真实凭证，也未访问昆仑。它证明安装与本地流程可用，不证明不同同事、不同电脑和网络环境已通过授权与业务验收。前一日的真实云端验证范围仍见下文；后续按本文“部门试点验收”执行。

## 2026-10-21：用户授权与文档读写

环境：Windows、PowerShell、Node.js 24、昆仑智联私有化开放平台；使用已配置的自建应用和真实用户账号。记录不包含 App Secret 或 token。

### 授权问题及修复

原登录态只有 `auth:user.id:read`。自动刷新后，以用户身份读取文档仍返回 `99991679`，要求 `docx:document` 或 `docx:document:readonly`；同一应用使用 bot 身份时通过该读取接口的权限检查，进入参数校验。该诊断不代表 bot 写入已验证。

根因是 CLI 拒绝 `--scope`，授权链接没有请求文档业务权限。已依据昆仑官方[获取授权码](https://open.fklzl.cnpc.com.cn/document/common-capabilities/sso/api/obtain-oauth-code)说明，支持将 scope 传入授权链接，并修正文档与 Agent Skill 中禁止使用该参数的说明。

用户执行 `auth login --scope "docx:document"` 并在浏览器同意后，登录态显示 `auth:user.id:read docx:document`，随后完成真实文档测试。

### 已验证结果

| 项目 | 结果 | 验证方式 |
| --- | --- | --- |
| 用户补充文档权限 | 通过 | 浏览器授权后检查 `auth status` |
| `docs create --dry-run` | 通过 | 预览返回 6 个正文块 |
| 用户身份创建文档 | 通过 | 云端创建成功并返回文档 ID |
| 初次创建中的正文写入 | 首次未完成 | 创建成功后，读取根块时发生网络中断；读回确认只有文档标题 |
| 在同一文档补写正文 | 通过 | 使用 `docs append` 写入 6 个正文块；读取返回 7 个块，包含文档根块 |
| 继续追加内容 | 通过 | 再次追加 2 个块，读取返回共 9 个块 |
| 中文、英文、数字、标点 | 通过 | 将每一行预期正文与读回文本比较 |
| 一级、二级、三级标题 | 通过 | 读回对应 Markdown 标题并核对 |
| 追加位置 | 通过 | 最终文本以追加段落结尾，初始内容仍保留 |
| 自动化测试 | 通过 | `npm test`：24 项通过 |
| TypeScript 检查 | 通过 | `node node_modules/typescript/bin/tsc --noEmit` |

测试文档标题为 `kunlun_cli 文档写入测试 2026-10-21 15:35:52`，已保留在测试账号云空间。本记录不将该账号或该文档作为其他同事的使用前提。

创建、追加和读取已分别验证。首次创建后立即写正文的整条连续流程因网络中断没有完整通过，后续需补一次无中断复验。测试恢复时先读回已有文档再补写，没有重复创建文档。

### 尚未验收

其他同事首次接入、不同账号之间的隔离、独立电脑安装、bot 文档写入、指定目录、超过 50 块的真实批次写入、大文档分页完整性、并发追加、复杂 Markdown，以及“小惠”聊天入口均未纳入本轮实测。单元测试中的分页和批次逻辑覆盖不等于这些场景已在真实环境通过。

## 如何复验

从项目根目录执行。安装、应用配置和本人授权步骤见 [README](../README.md)。

```powershell
npm test
node node_modules/typescript/bin/tsc --noEmit
node src/main.ts auth status
node src/main.ts docs template --output .\复验草稿.md
node src/main.ts docs create --title "CLI 复验文档" --file .\复验草稿.md --dry-run
node src/main.ts docs create --title "CLI 复验文档" --file .\复验草稿.md
```

确认创建成功后，复制返回的 `data.document_id`，替换下方的 `复验文档ID`：

```powershell
node src/main.ts docs read --document "复验文档ID"
node src/main.ts docs append --document "复验文档ID" --content "复验追加段落。" --dry-run
node src/main.ts docs append --document "复验文档ID" --content "复验追加段落。"
node src/main.ts docs read --document "复验文档ID"
```

人工核对：正文与示例文件一致；追加段落位于末尾且只出现一次；云空间可找到文档。读取的 `block_count` 含文档根块，不能直接等同于创建或追加结果中的正文块数量。

若失败，记录失败步骤、时间、脱敏错误 JSON，以及读回后确认的实际内容。保留已创建文档的 ID，先核对再恢复；不能盲目重跑写入。复验会真实创建文档，不属于离线自动化测试。

## 部门试点验收

后续至少选择一位非维护者同事，使用独立系统账号或电脑完成 README 同事指南。验收应确认：

1. 同事已在应用可用范围中，由维护者按批准方式完成应用配置。
2. 同事用本人浏览器账号授权，`auth status` 显示本人身份及文档 scope。
3. 用示例文件完成预览、创建、读取、追加，文档归属与访问范围符合预期。
4. 维护者和同事的登录态相互独立；分享文档仍通过云文档分享权限配置。
5. 同事能够凭 README 处理基础权限错误，并提供不含密钥的故障信息。

完成后在本文件另增日期、运行环境和结果；在此之前不将单人实测描述为部门推广验收通过。
