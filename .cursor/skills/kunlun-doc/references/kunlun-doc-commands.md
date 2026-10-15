# docs 命令参考

## 正文输入（三选一）

| 方式 | 说明 |
| --- | --- |
| `--file <path>` | 推荐；文件 UTF-8 |
| `--content "<短文本>"` | 仅短句 |
| `--stdin` | 从标准输入读全文 |
| （都不传） | 空正文，仅创建标题（create）或无追加块（append） |

`--content`、`--file`、`--stdin` **只能选一个**。

## Markdown 支持（写入时）

当前解析支持：

```markdown
# 一级标题
## 二级标题
### 三级标题

普通段落
```

更复杂结构（列表、代码块、表格等）可能无法正确映射为块；需要时先用 `docs read` 验证，或通过 `api` 调块 API。

## docs create

```powershell
node src/main.ts docs create --title "项目周报" --file .\周报.md --dry-run
node src/main.ts docs create --title "项目周报" --file .\周报.md
node src/main.ts docs create --title "草稿" --as bot --content "一段说明"
```

可选：`--folder <folder_token>` 指定目录（需 API/权限支持）。

成功 `data` 常见字段：

- `document_id`
- `title`
- `block_count`
- `url`（配置了 `web_base_url` 时）

若创建成功但写入失败，错误 `data` 可能仍含 `document_id`，应向用户说明文档已创建但需补写。

## docs append

```powershell
node src/main.ts docs append --document <document_id> --file .\补充.md
node src/main.ts docs append --document "https://域名/docx/xxx" --dry-run --content "追加一段"
```

## docs read

```powershell
node src/main.ts docs read --document <document_id>
```

成功时 `data.markdown` 为 CLI 将块反序列化后的 Markdown 文本；`data.block_count` 为遍历到的块数量。

## 与 OpenAPI 的关系

`docs *` 在内部组合调用 docx 文档与块相关接口（创建文档、分页拉块、批量创建子块等）。Agent **应优先使用 `docs` 命令**，而不是手写块路径，除非用户明确要求块级操作。

未封装接口示例（需 [`kunlun-shared`](../../kunlun-shared/SKILL.md) 中的 `api` 与 token）：

```powershell
node src/main.ts api GET /open-apis/docx/v1/documents/<document_id>
node src/main.ts api GET /open-apis/docx/v1/documents/<document_id>/blocks
```
