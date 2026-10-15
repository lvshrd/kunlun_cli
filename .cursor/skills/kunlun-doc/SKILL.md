---
name: kunlun-doc
description: "昆仑智联云文档（Docx）：用 kunlun-cli 创建、追加、读取文档；Markdown 标题与段落写入块 API。用户提供 document_id 或含 /docx/ 的链接时使用。认证与 JSON 契约见 kunlun-shared。"
metadata:
  requires:
    bins: ["node"]
    skills: ["kunlun-shared"]
  cliHelp: "node src/main.ts docs create --help"
---

# kunlun 云文档

## 何时使用

- 用户要在昆仑智联**创建**云文档并写入正文
- **追加**已有文档内容
- **读取**文档为 Markdown 摘要或全文
- 用户提供昆仑 docx 链接或 `document_id`

执行前若未确认登录与配置，先按 [`kunlun-shared`](../kunlun-shared/SKILL.md) 运行 `auth status` 或 `doctor`；仅在失败时再走 `auth login`。

## 命令路由

| 意图 | 命令 |
| --- | --- |
| 新建文档 + 正文 | `docs create --title <标题> [--file <utf8.md>] [--content "..."]` |
| 预览块数量 | 上述命令加 `--dry-run` |
| 追加正文 | `docs append --document <id或url> [--file ...]` |
| 读回 Markdown | `docs read --document <id或url>` |

`--document` 接受文档 ID，或 URL 路径中含 `/docx/<document_id>` 的链接。

详细参数与 Markdown 支持范围 → [`kunlun-doc-commands.md`](references/kunlun-doc-commands.md)

## 身份与风险

- 默认 **`--as user`**，文档落在用户云空间。
- **`--as bot`**：文档归属应用，不一定出现在用户「我的空间」。
- **创建/追加**会修改云端数据：先确认标题、路径与正文来源；可用 `--dry-run` 查看将生成的块数量。
- 长正文优先 **`--file`**（UTF-8），不要用 `--content` 传大段中文（Windows 终端编码不稳定）。

## 未覆盖的能力

块级精细编辑、图片、评论、知识库节点、云空间文件管理：暂用 `kunlun-shared` 中的 `api` 子命令调用 OpenAPI，或等待后续 `kunlun-doc` 扩展。不要假设飞书 `lark-cli docs +update` 命令在 kunlun 上存在。
