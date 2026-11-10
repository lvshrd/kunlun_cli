---
name: kunlun-tables
description: "通过本机 kunlun-cli 创建、读取和编辑昆仑智联表格：在云文档中创建并嵌入普通DocX表格、电子表格和多维表格，以及操作单元格、字段和记录；不用于飞书公有云或本地Excel文件。"
---

# 昆仑表格

身份与配置遵循 [kunlun-shared](../kunlun-shared/SKILL.md)。默认本人 user；不因权限不足自动切 bot。命令与输入格式见[参考](references/commands.md)。

创建带表格的文档时，先用 docs create 创建文档，再用 `docs tables create --document <ID> --type native|sheet|bitable` 分别创建并嵌入三类表格。native 可从二维 values 直接创建内容；sheet / bitable 创建为空资源，继续用返回的ID和现有命令填充。完整步骤与JSON样例见[创建含三类表格的文档](references/create-with-tables.md)，此类请求必须读取该参考；不要误报“未封装创建/嵌入”。

已有资源先确认类型：`/sheets/` 使用 sheets 命令，`/base/` 使用 bitable 命令。DocX 链接先 `docs read --document ...`，查看 resources：sheets 引用提供 spreadsheet_token / sheet_id，bitable 提供 app_token / table_id，docx_table 使用 `docs tables read/write --table <block_id>`。原生DocX表格只支持简单未合并单元格文字；board目前只有资源识别。不要从未知界面名称猜测接口，也不把wiki token直接用于表格命令。

电子表格先列工作表，确认 resource_type 为 sheet，再读取明确的有界区域。Base 先列数据表、字段，再读记录，保留字段名、类型及 record_id。只读指定业务所需范围；全量分页使用 --all，检查 complete / has_more。完整分页不代表跨页版本一致；高级权限下零记录也不证明全局没有数据。

按用户已明确授权的目标和内容修改。写前读取原值并用 --dry-run 查看请求；用户要求先预览时等其确认。电子表格 write 会覆盖区域；append 插入行可能移动后续数据；clear 只清空区域内容，不删行列。Base update 只发送需要更新的字段，复杂字段沿用平台 JSON 类型，不把人员、日期、关联记录一律转成字符串。变更字段类型可能影响已有数据，未获此授权时不要顺带转换类型。Base records delete / fields delete 仅在明确删除授权下使用指定 ID，主字段禁止删除；不要把删除字段用于清空单条记录的值。

创建检查 creation_verified；内容写入检查 verified 和 verification_scope（若返回），并报告实际范围或 record_id。没有原子版本保护；读回验证不等于并发冲突保护。字段写入只验证名称与类型，property / description 仍需人工或针对性复核。verification 错误表示写入已返回成功、核对未通过；write_unknown 表示执行结果可能不明。均先读回目标，保留错误中的结果、记录 ID、client_token，不自动重试或回滚。新建 Base 记录可复用同一个 UUIDv4 --client-token 处理同一次请求，但先核对实际结果，不生成新 key 重复创建。

0.2.1 已在指定文档的专用测试区完成 Sheets 和 Base 真实增删改查，覆盖公式、null、追加、字段与记录删除；Sheets 布尔值实测不支持，在请求前拒绝。Base 数字字段读回可能是字符串，CLI 根据字段 type=2 核对数值，原始值保留。复杂字段类型与其它账号仍需按场景验收。同步任务需先确定稳定源 ID、字段映射和冲突规则；这些原子命令尚未提供幂等的跨表同步工作流。
