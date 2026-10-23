# 架构

kunlun-cli 是 AI Agent 与昆仑智联开放平台之间的**本机中间件**：Agent 通过 Shell 调用 CLI，CLI 负责凭证、HTTP 与办公语义，输出稳定 JSON。

```text
Cursor Agent
    │ 读取 .cursor/skills/kunlun-*
    ▼
kunlun CLI（src/cli → src/domain → src/client）
    │ user_access_token / tenant_access_token
    ▼
open.fklzl.cnpc.com.cn（及 accounts 域授权）
```

## 目录

| 路径 | 职责 |
| --- | --- |
| `src/cli` | 命令路由、参数解析、stdout 信封 |
| `src/auth` | 用户授权码登录、bot token、session |
| `src/config` | `~/.kunlun-cli` 配置与密钥存储 |
| `src/domain` | 办公语义（如 docx Markdown ↔ 块） |
| `src/client` | OpenAPI HTTP 调用 |
| `.cursor/skills` | Agent 使用说明（kunlun-shared、kunlun-doc） |
| `scripts` | 打包白名单检查、交付物生成、隔离安装验收 |
| `dist` / `release` | 编译后的 JavaScript / 可分发 npm 安装包；生成物不提交 Git |

## 扩展新能力

1. 在 `src/domain/<域>` 实现 API 组合与错误翻译。
2. 在 `src/cli/commands` 增加子命令并注册到 `src/cli/routes.ts`。
3. 新增或更新对应 `kunlun-*` Skill 的 reference。

未封装接口一律保留 `api` 子命令兜底。

## Agent 集成

- **主路径**：Skill + CLI（与飞书 lark-cli 相同）。
- **可选**：日后可增加薄 MCP 层，内部仍调用本 CLI，避免双份鉴权逻辑。

## 部门同事与“小惠”

当前是本机 Agent + 统一 CLI。所有使用者通过 config init 在本机配置应用，再接入 Skill 并以本人账号授权。应用可用范围、应用 API 权限、用户同意授权分别生效，按读者分开的入口见 [README](README.md)。

默认 ~/.kunlun-cli 保存一套本机应用配置与用户登录态，KUNLUN_CONFIG_DIR 可隔离多个应用。环境变量优先于本机文件；程序只提供端点默认值，没有默认应用或密钥。更换应用的 config init 会清除旧用户与 bot session。

未来“小惠”的聊天入口与多用户服务端尚未实现。若需要集中执行任务，必须设计按用户隔离的凭证存储、聊天身份与授权账号映射、访问控制及失败恢复，不能共享维护者的用户登录态来代替成员授权。

当前任务安排见[开发路线](docs/ROADMAP.md)，真实环境验证范围见[验收记录](docs/ACCEPTANCE.md)。

## 构建与分发

源码以 TypeScript 开发，`npm run build` 按 `tsconfig.build.json` 输出 JavaScript 并重写相对导入扩展名，排除测试文件。npm 的 `bin` 指向 `dist/main.js`，安装后的 `kunlun` 命令可在源码目录之外运行。

`npm run package` 只生成 release/kunlun-cli-0.1.0.tgz，不读取本机应用配置或凭证。构建前清理生成目录，避免旧内置凭证模块残留。配置只存在运行机器的配置目录，不参与打包。

安装包附带 SHA-256 与使用说明，无运行时 npm 依赖。test:package 在临时 prefix 与配置目录验证安装、模拟配置、Skill 和写入前拦截；sandbox 为人工真实试用保留独立 prefix、缓存、配置及工作目录。只换 cwd 不能隔离默认配置。

包仍设置 `private: true`，当前通过 tgz 分发；内部 npm 源仍需另行配置与发布。分发流程见 [MAINTAINER.md](docs/MAINTAINER.md)。
