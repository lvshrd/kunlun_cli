# 架构

本机 Agent 通过 Shell 调用 kunlun-cli，Skill 提供业务操作指引；CLI 管理身份、调用昆仑开放平台，并以 JSON 返回结果。当前是本机单用户工具，没有“小惠”聊天执行入口或多用户托管服务。

```text
Agent + Skill
    ↓ Shell / JSON
src/cli → src/domain → src/client → 昆仑开放平台
              ↘ src/auth + src/config
```

| 模块 | 职责 |
| --- | --- |
| `src/cli` | 路由、参数和文件输入校验、帮助、身份选择、stdout 信封 |
| `src/domain/docs` | 文档搜索、读取、块转换、创建编辑及三类表格嵌入 |
| `src/domain/sheets`、`src/domain/bitable` | Sheets 与 Base 适配；通过 `table-common` 复用分页和写入异常处理 |
| `src/client` | 同源 HTTP、超时、上游错误翻译，向业务层提供 `OpenApi` 接口 |
| `src/auth`、`src/config` | 应用配置、浏览器授权、token 存储与刷新、版本固定的 scope 集合 |
| `skills` | 随包分发的三个 Agent Skill 源码；安装后作为 Agent 的本地副本使用 |
| `scripts` | 编译、打包白名单、交付物生成及离线安装验收 |
| `docs` | 公开架构与开发指南；`dist/`、`release/` 为忽略的构建产物 |

CLI 层获取配置和 token，调用 domain 后统一输出 `ok/data/error` 信封；domain 返回数据或抛出 `CliError`，不直接打印传输结果。业务层依赖 `OpenApi`，便于模拟平台响应，也可供其他调用入口复用。

本人和 bot 身份分别管理，业务默认本人身份，不因权限不足自动切换 bot。登录 scope 由 `src/auth/scopes.ts` 随版本维护；应用权限、本人授权和资源权限分别生效。原始 `api` 入口可执行，但没有专用业务命令的校验、读回核对与恢复编排。

程序安装与配置目录独立，配置默认位于 `~/.kunlun-cli`，环境变量可覆盖；Secret 与 token 不进入交付包。源码使用 TypeScript，构建为 `dist/` 中的 JavaScript，npm bin 指向 `dist/main.js`。

复刻、配置、扩展、验证和发布流程见 [开发指南](DEVELOPMENT.md)；面向使用者的能力与限制见 [README](../README.md)。
