# JSON 输出契约

kunlun-cli 的普通业务命令及 `version` / `--version` 向 **stdout** 写入一个带缩进的 JSON 对象，无论成功或失败。帮助输出文本；登录提示和授权 URL 输出到 stderr，调试栈信息在 `KUNLUN_DEBUG=1` 时也可能出现在 stderr。JSON 跨多行，脚本应整体解析 stdout，不能按单行 JSON 处理。

## 成功（退出码 0）

```json
{
  "ok": true,
  "data": { }
}
```

`data` 形状因命令而异。常见字段：

- `identity`: `"user"` | `"bot"`（docs、api 等）
- `dry_run`: `true`（仅预览，未调用写接口）
- `document_id`、`markdown`、`url`（docs 相关）

## 失败（退出码非 0，默认 1）

```json
{
  "ok": false,
  "error": {
    "type": "usage",
    "message": "...",
    "hint": "..."
  }
}
```

- `type` 常见值：`usage`、`config`、`auth`、`api` 等。
- 部分错误带 `data`（例如上游响应片段、已创建但未写完的 `document_id`）。
- 存在 `hint` 时，应原样展示给用户并按 hint 操作（如去昆仑开发者后台开权限）。

## 判断成功的规则

1. 进程退出码为 `0`。
2. 解析 stdout JSON 后 `ok === true`。

**不要**用 `data.response.code === 0`（`api` 命令的上游 body）替代 CLI 成功判断，除非你在显式处理 OpenAPI 原始响应。

## Agent 调用建议

- 只解析**最后一次**命令的 stdout 为 JSON；避免把多行日志与 JSON 混在一起。
- Windows 长中文正文：用 `docs` 的 `--file` 指向 UTF-8 文件，避免 PowerShell 内联字符串编码问题。
