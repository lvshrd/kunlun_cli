---
name: kunlun-shared
description: "昆仑智联 kunlun-cli 共享规则：config/auth/doctor、user 与 bot 身份、JSON 输出契约、--dry-run。Agent 调用昆仑开放平台或 kunlun 任意命令前应先遵循本 Skill；云文档正文操作见 kunlun-doc。"
metadata:
  requires:
    bins: ["node"]
---

# kunlun-cli 共享规则

所有 `kunlun-*` Skill 的底座。域名与端点一律使用昆仑智联私有化环境（`*.fklzl.cnpc.com.cn`），**禁止**使用 `feishu.cn` / `larkoffice.com` 或飞书公有云登录流程。

## 如何执行命令

在仓库根目录，优先使用下列之一（等价）：

```powershell
node src/main.ts <子命令> ...
npm start -- <子命令> ...
```

若已 `npm link` 或全局安装，可用 `kunlun <子命令> ...`。

配置目录默认 `~/.kunlun-cli`，可用环境变量 `KUNLUN_CONFIG_DIR` 覆盖。

## 通用准则

1. **先读帮助再调用**：不确定参数时运行 `node src/main.ts <命令> --help` 或 `node src/main.ts help`。
2. **默认身份是 user**：文档、日程等个人资源用用户 token；仅应用资源或明确需要应用身份时加 `--as bot`。bot 访问用户私有资源可能表现为空数据而非明确报错。
3. **成功看 `ok` 与退出码**：stdout 为 JSON 信封，`ok === true` 且进程退出码 `0` 表示 CLI 层成功。不要用上游 OpenAPI 的 `code: 0` 单独判断（见输出契约 reference）。
4. **密钥与 token 不得写入回复**：不输出 App Secret、access token、refresh token；`config show`、`auth status` 已脱敏。
5. **写入前先确认用户意图**：创建/追加文档、调用 `api` 写接口前，向用户确认目标与内容；支持 `--dry-run` 时先预览。

## 认证与配置

| 场景 | 命令 |
| --- | --- |
| 首次配置应用 | `config init --app-id <id> --app-secret-stdin`（Secret 从 stdin） |
| 查看配置 | `config show` |
| 文档读写授权 | `auth login --scope "docx:document"`（后台需开通用户身份权限） |
| 无图形界面 | `auth login --scope "docx:document" --no-browser`，把终端**整行**授权 URL 复制到浏览器 |
| 登录态 | `auth status` / `auth logout` |
| 环境自检 | `doctor` |

登录、身份与权限细节 → [`kunlun-shared-identity-and-auth.md`](references/kunlun-shared-identity-and-auth.md)

JSON 输出与错误处理 → [`kunlun-shared-output-contract.md`](references/kunlun-shared-output-contract.md)

## 通用 API 兜底

尚未封装为办公命令的接口：

```powershell
node src/main.ts api GET /open-apis/authen/v1/user_info
node src/main.ts api POST /open-apis/docx/v1/documents --data "{\"title\":\"草稿\"}" --dry-run
```

路径必须是相对开放平台根的路径（如 `/open-apis/...`），由配置中的 `open_base_url` 拼接。

## Reference 强触发

| 触发条件 | 必读 |
| --- | --- |
| 配置、登录、scope、身份、`--as`、doctor 失败 | [`kunlun-shared-identity-and-auth.md`](references/kunlun-shared-identity-and-auth.md) |
| 解析 stdout、脚本封装、判断成功/失败 | [`kunlun-shared-output-contract.md`](references/kunlun-shared-output-contract.md) |
