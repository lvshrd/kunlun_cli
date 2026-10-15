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

## 扩展新能力

1. 在 `src/domain/<域>` 实现 API 组合与错误翻译。
2. 在 `src/cli/commands` 增加子命令并注册到 `src/cli/routes.ts`。
3. 新增或更新对应 `kunlun-*` Skill 的 reference。

未封装接口一律保留 `api` 子命令兜底。

## Agent 集成

- **主路径**：Skill + CLI（与飞书 lark-cli 相同）。
- **可选**：日后可增加薄 MCP 层，内部仍调用本 CLI，避免双份鉴权逻辑。
