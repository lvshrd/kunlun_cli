---
name: kunlun-tables
description: "通过本机 kunlun-cli 创建、读取和编辑昆仑智联表格：在云文档中创建并嵌入普通DocX表格、电子表格和多维表格，以及操作单元格、字段和记录；不用于飞书公有云或本地Excel文件。"
---

# 昆仑表格

身份与配置遵循 [kunlun-shared](../kunlun-shared/SKILL.md)。默认本人 user；不因权限不足自动切 bot。命令与输入格式见[参考](references/commands.md)。

## 选择入口

- 只有表格名称时先用 `docs search --query <名称> --type bitable --exact`；电子表格用 `--type sheet`，类型不明确用 `--type bitable,sheet`。检查 has_more / next_offset / next_limit，精确筛选后的空页不表示搜索结束。同名候选需消歧；搜索到的 app_token / spreadsheet_token 可直接交给后续表格命令，无需先让用户手贴链接。完整搜索参数见[文档命令参考](../kunlun-doc/references/kunlun-doc-commands.md)。
- 新建带表格文档：先用 docs create 创建一次正文，再用 docs tables create 选择 native/sheet/bitable；读取[创建流程](references/create-with-tables.md)并核对实际版本。0.2.3 起三类都可带 JSON 一次初始化：native/sheet 用 values，Base 用 fields 和 records。CLI 处理字段和默认空白记录，Agent 无需手工先 records list。
- 已有 `/sheets/` 资源用 sheets 命令，`/base/` 资源用 bitable 命令。DocX 先 docs read 查看 resources：sheets 提供 spreadsheet_token / sheet_id，bitable 提供 app_token / table_id，docx_table 使用 docs tables read/write --table <block_id>。文档块 ID 与表格资源 ID 不互换。
- 原生 DocX 表格只支持简单未合并单元格文字；board 仅识别引用。不要从界面名称猜接口，也不把 wiki token 直接传给文档或表格命令。

## 读写已有表格

电子表格先列工作表，确认 resource_type 为 sheet，再读取明确的有界区域。Base 先列数据表、字段，再读记录，保留字段名、类型及 record_id。只读指定业务所需范围；全量分页使用 --all，检查 complete / has_more。完整分页不代表跨页版本一致；高级权限下零记录也不证明全局没有数据。

按用户已明确授权的目标和内容修改，不重复索取同一授权；用户要求先预览时等其确认。写前读取原值，--dry-run 可离线核对输入计划，不验证目标存在、权限或实际表结构。电子表格 write 会覆盖区域；append 插入行可能移动后续数据；clear 只清空区域内容，不删行列。

Base update 只发送需要更新的字段，复杂字段沿用平台 JSON 类型，不把人员、日期、关联记录一律转成字符串。变更字段类型可能影响已有数据，未获此授权时不要顺带转换类型。Base records delete / fields delete 仅在明确删除授权下使用指定 ID，主字段禁止删除；不要把删除字段用于清空单条记录的值。

## 验证与恢复

创建检查 creation_verified；带内容创建还检查 content_initialized / verified。Base 初始化计数位于 initialization.records_reused / records_created / remaining_blank_records；交付时说明残留空行。写入检查 verified 和 verification_scope（若返回），报告实际范围或 record_id。没有原子版本保护；读回验证不等于并发冲突保护。字段写入只验证名称与类型，property / description 需针对性复核。

verification 表示写入已返回成功、核对未通过；write_unknown 表示执行结果可能不明；partial_write 表示新 Base 已存在但初始化未完成。均保留错误顶层 data 中的资源 ID、result、client_token 和 progress，先读回目标，不自动重试或回滚。新建 Base 记录的同一次请求如需恢复，保留同一个 UUIDv4 --client-token，但先核对实际结果，不生成新 key 重复创建。

Sheets 不支持原生布尔值，CLI 会提前拒绝；Base 数字字段读回可能是字符串，CLI 根据字段 type=2 核对数值，原始值保留。复杂字段按实际场景核对。跨表同步尚无专用工作流；用户提出此类任务时先确定稳定源 ID、字段映射和冲突规则，不能把一组单次写入当作幂等同步能力。
