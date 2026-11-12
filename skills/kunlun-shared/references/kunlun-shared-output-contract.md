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
- `docs read` 还需检查 `complete`；`pagination_complete` 与 `content_complete` 分别表示分页与已取回内容的文本转换完整性。`ok: true` 不等于复杂文档已完整呈现，diagnostics 列出省略位置。

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
- 部分失败在顶层 `data` 中保留上游响应片段或已创建的资源 ID；它不在 `error` 内。失败并不保证云端没有变化。
- `incomplete` 可表示名称定位的搜索候选未取全（data.items / has_more），或正文分页未完成（data.document_id / reason / 完整性标记和部分文本）。前者不能确认唯一目标，后者不能据此声称全文已读取或推断缺失内容不存在。
- `verification` 表示写接口已返回成功、读回核对失败；`write_unknown` 表示写入执行结果可能不明。先检查顶层 data 中的资源 ID、write_completed、outcome_unknown、result 和 cause，再读取目标确认，不直接重跑写入。
- `partial_write` 表示新 Base 已存在，但 JSON 初始化未完成。data 中的 app_token / table_id / block_id、stage 和 progress 可用于定位已完成步骤；不要重新创建文档或表格来恢复。
- `hint` 用于解释和诊断；按当前用户授权与版本能力选择修复，不把上游建议当作扩大权限或改换身份的授权。

## 判断成功的规则

1. 进程退出码为 `0`。
2. 解析 stdout JSON 后 `ok === true`。

**不要**用 `data.response.code === 0`（`api` 命令的上游 body）替代 CLI 成功判断，除非你在显式处理 OpenAPI 原始响应。

成功后仍按动作核对范围：读取看 complete / completeness_scope；创建表格看 creation_verified / content_initialized；表格写入看 verified / verification_scope。Base 一次初始化的记录计数位于 data.initialization 内。读回核对不等于原子并发保护；不要仅凭 ok=true 宣称全文完整或整表同步成功。

## Agent 调用建议

- 只解析**最后一次**命令的 stdout 为 JSON；避免把多行日志与 JSON 混在一起。
- Windows 长中文正文：用 `docs` 的 `--file` 指向 UTF-8 文件，避免 PowerShell 内联字符串编码问题。
