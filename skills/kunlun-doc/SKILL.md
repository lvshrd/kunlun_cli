---
name: kunlun-doc
description: "在本人昆仑智联云空间按名称或关键词搜索文档、电子表格、多维表格和文件，以及创建、读取、追加或修改 DocX 文档；也适用于昆仑 docx 链接或文档 ID。通过本机 kunlun-cli CLI 执行，不用于飞书公有云。"
---

# 用自然语言完成昆仑文档任务

先遵循 [kunlun-shared](../kunlun-shared/SKILL.md) 检查默认应用及本人登录。不要把一长串 CLI 命令交给用户自行执行；由你调用终端，用户只处理必要的浏览器授权和不明确的业务选择。

## 从需求到动作

- 创建：把用户提供的资料整理成 UTF-8 Markdown 草稿，再用 `docs create --title ... --file ... --dry-run` 预览，随后按授权创建，读回核对并返回 ID / 可用链接。
- 创建含表格的文档：先创建一次正文，再按 [kunlun-tables](../kunlun-tables/SKILL.md) 在返回的 document_id 中创建并嵌入表格。0.2.3 起三类均可用 JSON 一次初始化：native/sheet 用 values，bitable 用 fields 和 records；不要求先创建空资源再逐项填充。详见[三类表格创建流程](../kunlun-tables/references/create-with-tables.md)。Markdown 表格不会自动转换为云端表格。
- 搜索定位：用户只给名称或关键词时，先用 `docs search --query <关键词>` 查候选，默认覆盖 doc（含 docx）、sheet、bitable、file、slides、mindnote；已知类型用 `--type bitable` 等缩小范围，支持逗号分隔。`--exact` 只筛选当前页的完整标题，不改变上游 total 和翻页位置；items 为空但 has_more=true 时仍需翻页。依据标题、类型及所有者定位，有同名时消歧，不自动选择第一条。搜索范围是本人可见，不等于本人所有。翻页同时传 next_offset / next_limit；窗口耗尽不声称已经搜完。
- 搜索到表格：bitable 的 app_token 交给 `bitable tables --app`，sheet 的 spreadsheet_token 交给 `sheets info --spreadsheet`，随后按 [kunlun-tables](../kunlun-tables/SKILL.md) 操作。file 返回 file_token；文件、幻灯片和思维笔记目前仅支持发现，不能用 docs read 读取其正文。搜索结果仅 docx 在配置网页根地址后附 URL；未配置且返回候选含 docx 时给出 warning，其他类型不猜网页路由。
- 按完整标题读取：可用 `docs read --name <完整标题>`，固定搜索 doc 类（含 doc/docx）；仅在候选页已取全、完整标题唯一匹配且类型明确为 docx 时自动读正文。遇到 ambiguous / incomplete / not_found 时用 `docs search --query <关键词> --type doc` 查看候选，再缩小范围或消歧；unsupported 表示当前不能读取该候选类型。查找表格或文件应使用相应类型的 docs search。

- 读取：用 `docs read --document <docx链接或ID>`，先检查 `pagination_complete`、`content_complete` 和 `complete`。`complete: false` 时只总结已呈现的范围，说明 diagnostics 中省略的块或行内元素；不要断言未呈现的内容不存在。需要定位时使用 blocks 的 ID / 父子关系；仅在用户任务需要时加 `--raw` 查看原始块，不能据此声称已支持复杂内容保真导出。
- 追加：读原文确认目标，用 `docs append --file ...` 添加已授权的内容，再读回验证。
- 修改：读原文，使用 `docs edit --document ... --find <精确原文> --replace <新文> --dry-run` 预览；执行时携带预览返回的 `--revision`。版本变化、匹配不唯一或复杂富文本时停止修改，重新定位，不做猜测替换。
- 搜索结果保留 type/token；只把明确为 docx 的 document_id 交给现有读取和编辑命令，不把旧版 doc 或未知类型 token 当作 docx ID。找到目标后追加和修改仍使用 ID。不要用重新创建整篇文档代替未获授权的原文修改。

参数与格式边界见[命令参考](references/kunlun-doc-commands.md)。正文目前支持三级标题与普通段落；唯一文本修改保留所修改文本段的样式，不支持跨多个文本 run 或复杂块。

## 执行原则

默认用户身份。明确的创建、追加、修改请求就是对应范围的操作授权；用户要求“先给我看”时，给出预览后等用户确认再写入。避免重复要求已给出的同一授权。

搜索和按名称读取只支持 user。权限不足时保留诊断，不自动换 bot 或扩 scope；本地 auth scopes 清单不能证明后台和本人已授权。搜索异常不说成没有文档，零结果只表示本次查询未找到可见候选。

失败返回 document_id 时保留该 ID，先读回确认已有内容再恢复。完成后说明实际修改、读回核对结果和仍存在的限制，不将单元测试当作云端实测。

`error.type: incomplete` 需按阶段处理：名称定位时 data 为未取全的搜索候选，不能据此选择目标；正文读取时 data 包含 document_id、部分内容和 reason，不能据此删除、重建、自动重试写入或声称全文已读完。正文读取固定到返回的 revision；版本信息不可用时停止读取。

文档内嵌表格查看 resources，使用 [kunlun-tables](../kunlun-tables/SKILL.md) 创建、读取或编辑明确的表格资源。普通DocX表格支持简单单元格文字创建/读取/写入；合并单元格、行列结构调整、文档删除/移动/重命名、截图和复杂章节编辑未实现。画板仅发现引用，不支持内容操作。
