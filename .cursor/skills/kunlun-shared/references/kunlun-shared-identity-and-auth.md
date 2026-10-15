# 身份与认证

## 两种身份

| 身份 | Flag | Token | 典型用途 |
| --- | --- | --- | --- |
| 用户 | 默认，或 `--as user` | `user_access_token`（浏览器授权后本机保存） | 我的云文档、个人可见资源 |
| 应用 | `--as bot` | `tenant_access_token`（app_id + secret 自动换取） | 应用名义、应用可见资源 |

办公场景（读/写「我的文档」）**默认 user**。只有用户明确说「用应用身份」或资源属于应用时再 `--as bot`。

## 应用配置

1. 在 [昆仑智联开放平台](https://open.fklzl.cnpc.com.cn/document/home/index) 创建自建应用。
2. 重定向 URL 包含 CLI 使用的地址（默认 `http://127.0.0.1:19876/callback`），与 `config show` 中 `redirect_url` 一致。
3. 开通业务权限（云文档等），以昆仑文档中的 scope/权限名为准。

```powershell
"你的AppSecret" | node src/main.ts config init --app-id cli_xxx --app-secret-stdin
node src/main.ts config show
```

可选：配置 `web_base_url` 以便结果里返回文档链接：

```powershell
"你的AppSecret" | node src/main.ts config init --app-id cli_xxx --web-base-url https://你的网页域名 --app-secret-stdin
```

## 用户登录

```powershell
node src/main.ts auth login
node src/main.ts auth status
```

- **不要**使用 `--scope`：当前昆仑授权页不支持该参数；文档能力依赖应用侧已开通的 docx 相关权限。
- 远程或无浏览器：`auth login --no-browser`，复制终端输出的**完整**授权 URL。
- 环境变量 `KUNLUN_NO_BROWSER=1` 等同不自动打开浏览器。

## 自检

```powershell
node src/main.ts doctor
```

检查 open 域、accounts 授权页、应用凭证能否换 bot token、用户 session 摘要（不含 token）。

## 权限不足时

- 错误 `type` 常为 `api` 或 `auth`，`hint` 可能提示重新登录或去开发者后台开通权限。
- 不要建议用户使用飞书 App 扫公有云二维码或 `lark-cli auth login`。
