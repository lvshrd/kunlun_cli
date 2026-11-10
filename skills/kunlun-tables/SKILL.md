---
name: kunlun-tables
description: "通过本机 kunlun-cli 读取和编辑昆仑智联电子表格及多维表格，支持 sheets/base 链接、文档内嵌表格引用、单元格与字段记录操作；不用于飞书公有云或本地 Excel 文件。"
---

# 昆仑表格

身份与配置遵循 [kunlun-shared](../kunlun-shared/SKILL.md)。默认本人 user；不因权限不足自动切 bot。命令与输入格式见[参考](references/commands.md)。

先确认资源类型：`/sheets/` 使用 sheets 命令，`/base/` 使用 bitable 命令。DocX 链接先 `docs read --document ...`，查看 resources：sheets 引用提供 spreadsheet_token / sheet_id，bitable 提供 app_token / table_id。原生 docx_table 不等于电子表格；board 目前只有资源识别。不要从“数据表格”等界面名称猜测接口，也不把 wiki token 直接用于表格命令。

电子表格先列工作表，确认 resource_type 为 sheet，再读取明确的有界区域。Base 先列数据表、字段，再读记录，保留字段名、类型及 record_id。只读指定业务所需范围；全量分页使用 --all，检查 complete / has_more。完整分页不代表跨页版本一致；高级权限下零记录也不证明全局没有数据。

按用户已明确授权的目标和内容修改。写前读取原值并用 --dry-run 查看请求；用户要求先预览时等其确认。电子表格 write 会覆盖区域；append 插入行可能移动后续数据。Base update 只发送需要更新的字段，复杂字段沿用平台 JSON 类型，不把人员、日期、关联记录一律转成字符串。变更字段类型可能影响已有数据，未获此授权时不要顺带转换类型。当前不提供删除命令。

成功写入检查 verified 和 verification_scope（若返回），并报告实际范围或 record_id。没有原子版本保护；读回验证不等于并发冲突保护。字段写入只验证名称与类型，property / description 仍需人工或针对性复核。verification 错误表示写入已返回成功、核对未通过；write_unknown 表示执行结果可能不明。均先读回目标，保留错误中的结果、记录 ID、client_token，不自动重试或回滚。新建 Base 记录可复用同一个 UUIDv4 --client-token 处理同一次请求，但先核对实际结果，不生成新 key 重复创建。

当前真实验收仅覆盖嵌入电子表格读取与新增 scope 授权；写入及 Base 云端业务仍待专用测试资源验收。不要把模拟测试称为云端实测。同步任务需先确定稳定源 ID、字段映射和冲突规则；这些原子命令尚未提供幂等的跨表同步工作流。
