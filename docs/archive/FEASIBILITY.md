# kunlun_cli 可行性分析与开发计划

- 文档状态：早期调研与历史方案；当前执行计划见 [开发路线](../ROADMAP.md)
- 编写日期：2026-10-13
- 状态更新：2026-10-21
- 对照对象：飞书官方 CLI [larksuite/cli](https://github.com/larksuite/cli)（本机已安装 `lark-cli` 1.0.97），以及内部说明 [飞书 CLI 知识库](https://bytedance.larkoffice.com/wiki/ILuTww7Xcimb6GkhH0mcK2f4nS7)
- 目标平台：昆仑智联私有化开放平台 [开发文档](https://open.fklzl.cnpc.com.cn/document/home/index)
- 当前结论：已用 TypeScript / Node.js 实现用户授权、通用 API、文档创建 / 追加 / 读取及 Agent Skill；近期优先完善操作文档能力和“小惠”成员试点，实测范围见 [验收记录](../ACCEPTANCE.md)。

下文保留 2026-10-13 的平台调研和初始估算。Go 单二进制、系统凭据库、写入确认门禁及跨办公域计划均为当时设想，不代表已实现；当前架构以 [ARCHITECTURE.md](../../ARCHITECTURE.md) 为准，使用步骤以 [README](../../README.md) 为准。

内部知识库页面位于字节跳动租户，当前环境无法读取正文。下文对飞书 CLI 的描述以公开仓库、本机 `lark-cli 1.0.97` 的帮助信息和源码为准，与该知识库介绍的是同一套程序。

---

## 1. 结论

自己开发 `kunlun_cli` 是可行的，也是让办公者用 AI 操作昆仑智联的正确路径。

飞书 CLI 卡在登录，不是二维码画错了，而是登录协议打到了公有云，并且依赖昆仑智联没有部署的新接口：

| 飞书 CLI 实际依赖 | 昆仑智联实测 |
| --- | --- |
| 应用自助创建 `POST https://accounts.feishu.cn/oauth/v1/app/registration` | `https://accounts.fklzl.cnpc.com.cn/oauth/v1/app/registration` 返回 **404** |
| Device Flow `POST {accounts}/oauth/v1/device_authorization` | 同路径返回 **404** |
| 当前版本换票 `POST {accounts}/oauth/v3/token` | 同路径返回 **404** |
| 授权页和二维码落在 `accounts.feishu.cn` | 昆仑智联 App 无法识别公有云二维码 |

昆仑智联仍提供飞书私有化常见的旧认证面，并且一批核心业务路由是通的：

- 机器人凭证：`POST https://open.fklzl.cnpc.com.cn/open-apis/auth/v3/tenant_access_token/internal` 存活（缺参数时返回 `code=10003 invalid param`，这是接口存在的正常表现）。
- 用户授权页：`GET https://accounts.fklzl.cnpc.com.cn/open-apis/authen/v1/authorize` 返回登录页（passport 构建时间 2025-10-16，版本 `1.0.0.5784`）。
- 用户换票：`/open-apis/authen/v1/access_token`、`/open-apis/authen/v1/oidc/access_token` 返回缺参错误；`/open-apis/authen/v2/oauth/token` 返回 HTTP 400。这三条都说明路由存在。
- 消息、云文档、日历、多维表格、审批、通讯录、任务、云空间、知识库、电子表格、考勤等路径返回 HTTP 400，而不是 404，说明网关认得这些路由。

因此第一期就能做出可登录、可代调用的 CLI。做不到、也不该承诺的是：与飞书 CLI 命令和 Skill 一一对应。幻灯片、邮箱、妙记、画板等路径本次探活为 404，应在差异清单确认后再排期。

官方维护者也表达过同一判断。社区曾尝试只用 `extraBrands` 把端点指到私有化域名，维护者在 [PR #1149](https://github.com/larksuite/cli/pull/1149) 中回复：只改 base URL 不够，认证、OpenAPI 命令面和上层能力与公有云没有对齐，私有化要作为整体来做。该 PR 随后关闭，没有进入当前的 `lark-cli 1.0.97`。本机源码里 `ParseBrand` 只接受 `feishu` / `lark`，其它值都会落回公有云 `open.feishu.cn` 与 `accounts.feishu.cn`。

---

## 2. 背景与要解决的问题

飞书 CLI 的价值是：人在终端里操作飞书，AI Agent 也可以用同一套命令和 Skill 操作飞书。昆仑智联是同一产品的私有化部署（开放平台页面仍使用飞书开放平台前端，静态资源域名 `sf1-lark-tos.fklzl.cnpc.com.cn`，Applink 环境标识 `idc=klszlark`），办公场景高度相似，但运行时不是公有云。

已经遇到的障碍有两层：

1. **登录认证不兼容。** `lark-cli config init` / `auth login` 走 OAuth 2.0 Device Flow，二维码和验证链接属于飞书公有云。昆仑智联 App 扫不了，流程停在第一步。同类反馈见 [larksuite/cli#73](https://github.com/larksuite/cli/issues/73)。
2. **API 版本不一致。** 公有云 CLI 已使用 accounts 域的 OAuth v3、DPoP、以及一批较新业务 API。昆仑智联开放平台文档在 [open.fklzl.cnpc.com.cn](https://open.fklzl.cnpc.com.cn/document/home/index)（文档站前端版本 `1.0.0.2957`），接口面更接近飞书私有化的较老版本。

目标用户是办公人员及其 AI 助手，不是开放平台开发者。成功标准是：在昆仑智联里完成「登录一次，然后让 AI 读文档、发消息、查日程、处理审批」这类日常操作，并且凭证留在本机。

---

## 3. 探活方法与范围

2026-10-13 从当前办公网络直接请求昆仑智联域名，未携带真实 `app_id` / `app_secret` / token。

判定规则：

- 返回飞书风格业务错误（如 `10003 invalid param`、`20001 empty grant_type`、`20003 missing code`）或 HTTP 400：视为**路由存在**。400 在缺 Authorization 时很常见，不能当成业务失败。
- HTTP 404：视为**该路径当前不可用**。只发了 POST 的路径，不能排除「只接受 GET」的情况，文中会单独注明。
- 连接失败：视为**该主机当前不可达**，不直接推断产品没有这个服务。

这次探活回答的是「登录能不能绕开、核心路由在不在」。字段级差异、scope 名称、频率限制和文档站里的版本说明，需要拿一个已审批的自建应用后再做第二轮对照。

---

## 4. 为什么飞书 CLI 会卡在第一步

`lark-cli 1.0.97` 的用户登录链路是：

1. `config init --new` 向 `accounts.feishu.cn/oauth/v1/app/registration` 申请一个「个人智能体」应用，并给出飞书二维码。
2. `auth login` 向 `{accounts}/oauth/v1/device_authorization` 申请 `device_code`。
3. 终端展示 `verification_url`。这个 URL 属于飞书账号域，二维码只能由飞书 App 或飞书网页识别。
4. CLI 轮询 `{accounts}/oauth/v3/token`，`grant_type` 为 Device Code，换取 `user_access_token`。
5. 端点由品牌解析写死：`feishu` → `open.feishu.cn` + `accounts.feishu.cn`；`lark` → 国际版对应域名。没有「昆仑智联」这个品牌。

昆仑智联上，第 1、2、4 步对应路径均为 404。即使用配置把账号域改成 `accounts.fklzl.cnpc.com.cn`，Device Flow 和 OAuth v3 仍然不存在。二维码打不开，是因为协议和域名都不是昆仑智联的，不是扫码客户端的问题。

同一主机上，旧版用户授权是存在的：

- 授权页：`GET https://accounts.fklzl.cnpc.com.cn/open-apis/authen/v1/authorize`
- 换票：`POST https://open.fklzl.cnpc.com.cn/open-apis/authen/v1/access_token`（以及 oidc / v2 token）

这正是飞书开放平台文档里的授权码模式，而不是 CLI 现在用的 Device Flow。授权码模式需要在开发者后台登记 `redirect_uri`。CLI 可以使用本机回环地址（例如 `http://127.0.0.1:<port>/callback`），由浏览器完成登录。用户如果已经在浏览器登录昆仑智联网页版，这一步通常不需要用 App 扫公有云二维码。

机器人身份更简单，不需要用户扫码：

```http
POST https://open.fklzl.cnpc.com.cn/open-apis/auth/v3/tenant_access_token/internal
Content-Type: application/json

{"app_id":"...","app_secret":"..."}
```

该路径已确认存在。只做应用身份的自动化（发通知、读应用自己有权限的资源）可以在拿到应用凭证后立刻打通。代表员工本人读文档、查日程、处理审批，则必须走用户授权。

---

## 5. 能力差异（基于本次探活）

下表是路由是否存在的初判，不是接口兼容性证明。字段、权限 scope、分页和错误码仍可能与公有云文档不一致，实现时以昆仑文档为准。

| 能力 | 探活路径 | 结果 | 对 CLI 的含义 |
| --- | --- | --- | --- |
| 应用 / 租户凭证 | `/open-apis/auth/v3/tenant_access_token/internal`、`/open-apis/auth/v3/app_access_token/internal` | 存在 | 第一期即可支持 bot |
| 用户授权页 | `accounts.../open-apis/authen/v1/authorize` | 存在 | 用户登录改走授权码 |
| 用户换票 v1 / oidc / v2 | `authen/v1/access_token`、`authen/v1/oidc/access_token`、`authen/v2/oauth/token` | 存在 | 实现时三选一，以文档和实测响应为准 |
| Device Flow、应用自注册、OAuth v3 | `accounts.../oauth/v1/device_authorization`、`.../app/registration`、`.../oauth/v3/token` | 404 | 不要移植飞书 CLI 的登录实现 |
| 消息 | `/open-apis/im/v1/messages` | 400，路由存在 | 第一批办公命令 |
| 云文档 | `/open-apis/docx/v1/documents/{id}` | 400，路由存在 | 第一批办公命令 |
| 日历 | `/open-apis/calendar/v4/calendars` | 400，路由存在 | 第一批办公命令 |
| 多维表格 | `/open-apis/bitable/v1/apps/{id}/tables` | 400，路由存在 | 第一批办公命令 |
| 审批 | `/open-apis/approval/v4/instances` | 400，路由存在 | 第一批办公命令 |
| 通讯录 | `/open-apis/contact/v3/users/{id}` | 400，路由存在 | 第一批办公命令 |
| 任务 | `/open-apis/task/v2/tasks` | 400，路由存在 | 第二批 |
| 云空间 / 知识库 / 表格 | `drive/v1`、`wiki/v2`、`sheets/v3` | 400，路由存在 | 第二批 |
| 考勤 | `POST /open-apis/attendance/v1/user_tasks/query` | 400，路由存在 | 按实际办公需求排期 |
| 幻灯片 | `GET /open-apis/slides/v1/presentations` | 404 | 不纳入首期 |
| 邮箱 | `GET /open-apis/mail/v1/user_mailboxes/me/messages` | 404 | 不纳入首期 |
| 妙记 / 画板 / OKR | 仅 POST 探活为 404 | 待用 GET 和文档复核 | 默认不做 |
| MCP | `mcp.fklzl.cnpc.com.cn` | 当前不可达 | 不依赖飞书 MCP |
| Applink | `applink.fklzl.cnpc.com.cn` | 存在，`idc=klszlark` | 可用于打开昆仑智联内的资源链接 |

飞书 CLI 里还有 DPoP（证明持有密钥）、事件长连接、技能市场同步、公有云应用市场注册。这些都绑定公有云，不应出现在 `kunlun_cli` 的首期范围里。

---

## 6. 方案比较

### 6.1 只改飞书 CLI 配置

把 `~/.lark-cli/config.json` 指到昆仑域名。当前 1.0.97 **做不到**：品牌解析没有自定义端点，登录仍请求公有云。即便未来合入端点覆盖，官方也已说明认证和命令面不会因此对齐。此方案否决。

### 6.2 Fork larksuite/cli 改端点

仓库是 MIT 协议，法律上可以 fork。工程上不合适作为主干：

- 上游按周演进，登录已经从 OAuth v2 迁到 accounts 域 v3，并默认尝试 DPoP。昆仑侧这两项都不存在，每个上游版本都会在认证层冲突。
- 命令表和 Skill 按公有云 API 生成。私有化缺接口时，Agent 会调用到 404，比没有这个命令更糟。
- 维护成本接近「持续重写上游」，收益却只在少数办公域。

可以阅读和摘取其中的输出契约、退出码、风险确认门禁等设计，保留 MIT 声明。不要把整个仓库当作 `kunlun_cli` 的代码基线。

### 6.3 自研 kunlun_cli（推荐）

新建一个小而稳的 CLI，只实现昆仑智联文档里真实存在、办公者真的会用的能力。通用 `api` 命令兜底未封装的接口，避免为了「对齐飞书」去封装 404。

这是推荐方案。工作量可控，认证模型与私有化现实一致，后续 API 升级时只改适配表，不跟公有云 CLI 绑定。

---

## 7. 推荐产品形态

命令名：`kunlun`。配置与凭证与 `lark-cli` 隔离，避免两套 CLI 互相覆盖登录态。

```text
kunlun
├── config init|show|use          应用凭证与环境，不在公有云创建应用
├── auth login|status|logout      用户授权码登录；bot 用 app 凭证自动换票
├── api <METHOD> <path>            任意开放平台接口
└── 业务命令（按期增加）
    ├── im
    ├── docs
    ├── calendar
    ├── approval
    ├── contact
    ├── bitable
    ├── drive / wiki / sheets
    └── task
```

两种身份，与飞书 CLI 的使用习惯对齐，便于以后写 Skill：

| 身份 | 凭证 | 获取方式 | 典型用途 |
| --- | --- | --- | --- |
| `bot` | `tenant_access_token` | `app_id` + `app_secret` 调用 internal 接口，CLI 自动刷新 | 应用名义发消息、访问已授权给应用的资源 |
| `user` | `user_access_token` | 浏览器打开昆仑授权页，本机接收 code 后换票 | 读本人文档、日程、审批、云空间 |

默认身份建议是 `user`。办公者说「帮我查今天的日程」时期望的是本人数据；bot 查不到用户日历时，飞书 API 常常返回空成功，Agent 会误以为今天没有会。

Agent 输出使用稳定 JSON，例如 `{"ok":true,"data":...}` 与 `{"ok":false,"error":{"type","message","hint"}}`。成功与否看 `ok` 和进程退出码。这样 Cursor / 其它 Agent 可以按契约调用，而不依赖终端表格。

安全底线：

- `app_secret`、access token、refresh token 不进命令行参数，不写进日志。Windows 使用凭据管理器或 DPAPI 保护的本地文件。
- 删除、发送、审批同意等写操作默认预览，执行前要求显式确认开关。
- 配置文件只存 `app_id`、品牌端点、当前用户 open_id 等非秘密字段。

---

## 8. 认证设计

### 8.1 应用从哪里来

昆仑智联没有飞书 CLI 的「扫码创建一个个人应用」。使用者需要在 [昆仑智联开放平台](https://open.fklzl.cnpc.com.cn/document/home/index) 的开发者后台手工创建自建应用，打开所需权限，并把 CLI 的回环地址配进重定向 URL。

`kunlun config init` 只收集：

- `app_id`
- `app_secret`（从 stdin 读取，避免出现在进程列表）
- 开放平台根地址，默认 `https://open.fklzl.cnpc.com.cn`
- 账号域，默认 `https://accounts.fklzl.cnpc.com.cn`
- 重定向 URL，默认 `http://127.0.0.1:19876/callback`

这些默认值来自本次探活，允许用配置覆盖，以便测试环境或域名调整。

### 8.2 用户登录

```text
kunlun auth login --scope "<文档中的 scope>"
        │
        ▼
本机监听 127.0.0.1 回调
        │
        ▼
打开浏览器
GET https://accounts.fklzl.cnpc.com.cn/open-apis/authen/v1/authorize
    ?client_id=...&redirect_uri=...&response_type=code&scope=...&state=...
        │
        ▼
用户在昆仑智联网页完成登录与授权
        │
        ▼
CLI 用 code 调用 open 域换票接口
        │
        ▼
保存 user_access_token；若返回 refresh_token 则到期前刷新
```

实现前用一个测试应用确认三件事，并写进适配表，不要三套同时上线：

1. 授权页参数名是 `client_id` 还是 `app_id`（飞书 v1 授权页两者都出现过，以昆仑文档为准）。
2. 换票应走 v1 `access_token`、oidc，还是 v2 `oauth/token`。优先选文档未标记废弃、且实测能返回 `refresh_token` 的那条。
3. 昆仑智联网页版是否已登录即可点授权。若办公电脑不能打开该账号域，再评估「把授权 URL 做成昆仑智联 App 可识别的 Applink」作为补充，而不是退回飞书二维码。

Device Flow 仅在后续版本于 `accounts.fklzl.cnpc.com.cn` 上出现 `/oauth/v1/device_authorization` 且换票成功时，才作为无浏览器环境（SSH、远程 Agent）的可选项。当前不要做。

### 8.3 机器人登录

不单独做交互登录。首次调用 `--as bot` 时用 `app_id` / `app_secret` 换 `tenant_access_token`，按返回的 `expire` 提前刷新。剩余有效期策略对齐飞书文档：不要把 7200 秒写死。

---

## 9. 技术架构

建议用 Go 单二进制。原因：分发简单、Windows 友好、和现有飞书 CLI 的部署方式一致，办公电脑不必安装运行时。团队若更熟悉 TypeScript，也可以用 Node 做第一期原型，但在进入 Agent 日常使用前应收敛到单个可分发的可执行文件。

```text
┌──────────────────────────────────────────┐
│ 命令层  cobra：config / auth / api / 业务 │
├──────────────────────────────────────────┤
│ 办公快捷命令  参数少、JSON 稳定、带确认门禁 │
├──────────────────────────────────────────┤
│ 兼容适配层  路径、scope、字段、错误码对照表 │
├──────────────────────────────────────────┤
│ 传输层  签名头、重试、分页、日志脱敏         │
├──────────────────────────────────────────┤
│ 凭证库  bot token 缓存 + user token 安全存储 │
└──────────────────────────────────────────┘
                    │
                    ▼
     open.fklzl.cnpc.com.cn / accounts.fklzl.cnpc.com.cn
```

适配层是这个项目和「再包一层 HTTP」的差别。每条被快捷命令使用的接口登记：

- 昆仑文档 URL 与公有云文档 URL（便于人工 diff）
- 实际路径和版本（如 `im/v1`、`calendar/v4`）
- 身份（user / bot / 两者）
- 必填 scope
- 已知字段差异
- 探活日期和结论（可用 / 缺失 / 未测）

`kunlun api` 不走这张表，原样转发。快捷命令必须走这张表，避免 Agent 调到私有化不存在的版本。

错误处理保持飞书习惯：HTTP 状态、业务 `code`、`msg`、`log_id`（若响应头或 body 里有）一并返回，`hint` 里给出下一步，例如缺少 scope 时指向开发者后台，而不是建议再跑一遍飞书登录。

---

## 10. 开发计划

估算按 1 名熟悉 Go 和飞书开放平台的开发者计算。权限审批、测试应用下发不计入开发人日，但是关键路径，需要并行启动。

### 阶段 0：差异清单与测试应用（3–5 天）

目标：把「路由存在」变成「这条接口能按文档调通」。

- 在昆仑开发者后台创建自建应用，登记回环重定向 URL。
- 开通一批最小权限：通讯录只读、云文档只读、日历只读、审批只读、消息只读或发送（以实际试点范围为准）。
- 用 curl 或临时脚本完成一次 bot 换票、一次用户授权码换票，记录真实请求和响应字段（脱敏后入库）。
- 对照 [昆仑文档首页](https://open.fklzl.cnpc.com.cn/document/home/index) 和飞书公有云文档，为阶段 1–2 的接口填写适配表。
- 复核本次标为 404 的幻灯片、邮箱，以及只做了 POST 的妙记、画板、OKR、会议。
- 产出：适配表、测试应用说明、登录时序图。未完成此阶段不开始封装快捷命令。

退出标准：本机脚本能打印当前用户姓名，并能以 bot 身份拿到 `tenant_access_token`。

### 阶段 1：可登录的通用 CLI（1.5–2 周）

目标：AI 和人都能对昆仑智联发任意已授权请求。

- 项目骨架、配置、Windows 凭证存储、日志脱敏。
- `config init|show`、`auth login|status|logout`、`auth` 的 bot 自动换票。
- `kunlun api`：方法、路径、query、JSON body、分页辅助、`--dry-run`。
- JSON 输出契约与非 0 退出码。
- 单元测试覆盖：端点拼装、授权 state 校验、token 过期刷新、密钥不落盘。
- 一篇 5 分钟上手说明：创建应用、配置重定向、登录、发第一条 `api`。

退出标准：在试点机器上，`auth login` 打开的是昆仑智联授权页而不是飞书二维码；登录后 `api GET /open-apis/authen/v1/user_info`（以阶段 0 确认的用户信息路径为准）返回本人身份。

### 阶段 2：高频办公命令（2–3 周）

目标：覆盖「让 AI 帮我处理今天的昆仑智联事务」里最高频的只读和少量写入。

建议第一批命令，全部以阶段 0 适配表为准，某接口不存在就删掉该命令，不留空壳：

| 域 | 命令意图 | 风险 |
| --- | --- | --- |
| contact | 按姓名或邮箱查人，得到 `open_id` | 只读 |
| docs | 按 URL / token 读取云文档正文 | 只读 |
| calendar | 查看今天或指定日期的日程 | 只读 |
| approval | 列出待办审批；同意 / 拒绝必须二次确认 | 写操作高风险 |
| im | 向指定人或群发送文本消息，发送前确认 | 写操作 |
| bitable | 按链接读取一张表的记录 | 只读 |

每条命令提供 `--help`、JSON 示例和缺失权限时的 hint。写操作支持 `--dry-run`。

退出标准：用自然语言驱动 Agent，能独立完成「查某人 open_id → 读一篇指定文档 → 列出今日日程 → 列出待审批」；发送消息和审批动作在未确认时不会真正执行。

### 阶段 3：Agent Skill 与第二批域（2 周）

- 为 Cursor 等 Agent 写一份 `kunlun` Skill：何时用 user / bot、如何读 JSON、写操作如何停下来问人。
- 补齐云空间、知识库、电子表格、任务中，阶段 0 证明可用的只读能力。
- 收集试点用户的失败调用，把真实 404 和字段差异回写适配表。

退出标准：不看源码的办公者能在 Cursor 里用中文完成阶段 2 的场景；Skill 不会引导 Agent 去调用飞书公有云。

### 阶段 4：按需扩展

只在业务出现具体需求时做：考勤、更多审批写接口、知识库整理、事件订阅（优先查昆仑是否提供回调，而不是假设存在飞书的长连接）。幻灯片、邮箱、妙记、画板在文档和探活都可用之前不做。

不在路线图内的事项：兼容 `lark-cli` 的全部命令名、公有云应用市场、DPoP、MCP、自动跟随飞书 CLI 发版。

### 里程碑一览

| 里程碑 | 周期 | 可见结果 |
| --- | --- | --- |
| M0 差异清单 | 第 1 周 | 测试应用 + 登录跑通的脚本 + 适配表 |
| M1 通用 CLI | 第 2–3 周 | `kunlun auth login` 与 `kunlun api` |
| M2 办公命令 | 第 4–6 周 | 文档、日程、审批、消息、通讯录、多维表格 |
| M3 Agent 可用 | 第 7–8 周 | Skill + 试点反馈回写 |

总开发量大约 **8 周**。若阶段 0 发现用户授权码也被策略禁用（例如禁止 localhost 回调、必须走统一身份 SSO 且不允许自建应用），M1 的登录设计要重做，后续里程碑顺延。这个风险应在 M0 结束时明确关闭或升级。

---

## 11. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 开发者后台不允许 `127.0.0.1` 重定向 | 用户登录无法在本机收 code | M0 就验证。备选是一次性粘贴回调 URL，或向平台方申请 CLI 专用重定向策略 |
| 自建应用权限审批慢 | 有 CLI 也调不通业务接口 | 与试点部门同时提交权限申请；bot 与 user 分开申请，先只读 |
| 私有化接口字段与公有云文档不一致 | 快捷命令解析失败 | 适配表以昆仑文档和真实响应为准；`api` 命令始终可用 |
| 文档站是前端渲染，难以自动全量 diff | 差异清单漏接口 | 先覆盖办公高频域，不追求和飞书 CLI 功能清单对齐 |
| 把 fork 当主线 | 每次上游认证改动都要解冲突 | 自研小 CLI；只借鉴 MIT 代码中的交互设计 |
| 凭证泄露 | 应用可代表用户操作办公数据 | 系统凭据存储、日志脱敏、仓库禁止提交 secret、写操作确认 |
| 办公网络或证书策略变化 | CLI 在部分电脑不可用 | 端点可配置；`kunlun doctor` 检查 open 域、accounts 域和本机回调端口 |
| Agent 误用 bot 身份 | 读到空数据仍报成功 | 默认 user；命令输出写明当前身份 |

---

## 12. 验收标准

M1 验收：

- 全新 Windows 电脑只配置昆仑自建应用，即可完成用户登录。
- 全过程不出现 `accounts.feishu.cn`、`open.feishu.cn` 或飞书 App 二维码。
- `auth status` 能显示登录用户和 token 是否仍有效。
- `api` 能调用至少 1 个 user 接口和 1 个 bot 接口。
- 进程列表、日志和配置文件中看不到 `app_secret` 和 token。

M2 验收：

- 阶段 2 表格中的只读命令在试点账号上返回真实业务数据。
- 发送消息、审批同意在没有确认参数时退出码非 0，且没有产生副作用。
- 权限不足时，错误信息指出缺哪个 scope，以及应去昆仑开发者后台开通。

M3 验收：

- Agent 仅凭 Skill 和 `--help` 完成一条跨「通讯录 + 文档 + 日历」的只读任务。
- Skill 文本中的示例域名是 `*.fklzl.cnpc.com.cn`。

---

## 13. 立即可以开始的事

本节已按 2026-10-21 的实际进展更新：

1. 按 README 邀请一位非维护者同事完成“小惠”应用接入试点，确认可用范围、用户身份权限、本机配置和本人授权。
2. 明确部门允许的 App Secret 管理方式；若不能在同事电脑上保存应用密钥，优先设计托管授权方案。
3. 完善列表和代码块的 Markdown 转换，用一篇真实操作手册验收。
4. 补齐网络中断后的结果核对与恢复，随后再做章节修改、表格和截图。
5. 其他办公域按实际需求扩展，详见 [开发路线](../ROADMAP.md)。

---

## 14. 参考

- 昆仑智联开放平台文档：https://open.fklzl.cnpc.com.cn/document/home/index
- 飞书 CLI 公开仓库：https://github.com/larksuite/cli
- 飞书 CLI 中文说明：https://github.com/larksuite/cli/blob/main/README.zh.md
- 私有化扫码失败的社区反馈：https://github.com/larksuite/cli/issues/73
- 私有化域名无法访问的社区反馈：https://github.com/larksuite/cli/issues/97
- 端点覆盖不足以支持私有化的维护者说明：https://github.com/larksuite/cli/pull/1149
- 飞书用户身份授权码说明（对照用，实施时以昆仑文档为准）：https://open.feishu.cn/document/authentication-management/access-token/obtain-oauth-code
- 飞书自建应用获取 tenant_access_token（对照用）：https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal
