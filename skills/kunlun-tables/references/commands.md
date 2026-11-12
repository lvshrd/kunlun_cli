# 表格命令

以下 ID 均为占位符。默认 user；仅在任务明确需要应用身份时显式 `--as bot`，不得用于绕过本人权限。JSON 输入三选一：`--json '<JSON>'`、`--file <UTF-8.json>`、`--stdin`。PowerShell 推荐文件输入，避免引号转义。

创建新表格或“建云文档并放入三类表格”使用 `docs tables create --document <ID> --type native|sheet|bitable`，原生表格使用 docs tables read/write；完整参数、初始化及恢复见[创建含三类表格的文档](create-with-tables.md)。下文sheets/bitable命令接续操作已有或刚创建的实际资源。

## 电子表格

```sh
kunlun-cli sheets info --spreadsheet <sheets链接或token>
kunlun-cli sheets sheets --spreadsheet <token>
kunlun-cli sheets read --spreadsheet <token> --range 'sheet1!A1:C20'
kunlun-cli sheets write --spreadsheet <token> --range 'sheet1!A1:C1' --file cells.json --dry-run
kunlun-cli sheets append --spreadsheet <token> --range 'sheet1!A1:C100' --file cells.json --dry-run
kunlun-cli sheets clear --spreadsheet <token> --range 'sheet1!A3:C3' --dry-run
```

cells.json 示例：

```json
{"values":[["Task",3,{"type":"formula","text":"=B1*2"}]]}
```

去掉 --dry-run 才实际执行；该预览只验证本地输入，目标类型、权限和资源检查仍为 pending。write 矩阵必须与范围尺寸相同；append 的列数相同、行数不超过范围，使用 INSERT_ROWS，按返回的实际插入范围读回。clear 只清空内容，不删除行列。范围最多 5000 行、100 列；单字符串最多 50000 字符。支持字符串、有限数字、null、公式对象；null 用于清空，布尔值会被平台拒绝，CLI 提前拦截。公式使用上述对象格式，不把普通字符串自动推断为公式；跨表引用和富样式、人员提及、单元格图片未封装。read 使用 Formula 呈现，公式返回表达式，保留其它单元格原始 JSON；complete=true 仅针对 requested_range，不代表整个工作簿已读完。

## 多维表格

```sh
kunlun-cli bitable info --app <base链接或app_token>
kunlun-cli bitable tables --app <token> --all
kunlun-cli bitable fields list --app <token> --table <table_id> --all
kunlun-cli bitable records list --app <token> --table <table_id> --all
kunlun-cli bitable records search --app <token> --table <table_id> --file query.json --all
kunlun-cli bitable records read --app <token> --table <table_id> --record <record_id>
kunlun-cli bitable records create --app <token> --table <table_id> --file record.json --dry-run
kunlun-cli bitable records update --app <token> --table <table_id> --record <record_id> --file record.json --dry-run
kunlun-cli bitable fields create --app <token> --table <table_id> --file field.json --dry-run
kunlun-cli bitable fields update --app <token> --table <table_id> --field <field_id> --file field.json --dry-run
kunlun-cli bitable records delete --app <token> --table <table_id> --record <record_id> --dry-run
kunlun-cli bitable fields delete --app <token> --table <table_id> --field <field_id> --dry-run
```

record.json 为 `{"fields":{"Task":"Plan","Progress":0.5}}`。字段必须是精确字段名，保留 API 对应的值类型；公式等只读字段不能赋值。create 可传 `--client-token <UUIDv4>`，默认生成并在结果中返回；update 不接受此参数。

records delete 先读目标，删除后仅将明确的 RecordIdNotFound（1254043）当作不存在，不把权限或网络错误当作删除成功。fields delete 禁止主字段，删除后完整列出字段核对；删除字段会影响整列。两者支持离线 --dry-run，不自动重试。写入核对允许文本字段的 text runs；数字字符串只在字段 type=2 时按数值核对，输出 read_back 保留平台原始类型。

field.json 为 `{"field_name":"Task","type":1}`；可提供平台定义的 property 对象、description 对象（text / disable_sync）。type 为平台字段类型整数，不作自动迁移。property / description 发送给平台校验，但当前只读回验证名称与类型。

query.json 示例：

```json
{"field_names":["Task","Progress"],"filter":{"conjunction":"and","conditions":[{"field_name":"Task","operator":"is","value":["Plan"]}]},"sort":[{"field_name":"Task","desc":false}]}
```

search 还支持 view_id、automatic_fields；过滤器内部遵循昆仑平台格式。非空 filter / sort 可能覆盖视图原有过滤和排序，不将 view_id 当作访问控制边界。

分页默认 100 条；数据表/字段 --page-size 最大 100，记录最大 500。--page-token 读取后续页；--all 从第一页读取，不能与 --page-token 混用。最多 50 页，游标缺失、重复或中断返回 incomplete 并保留部分 items。complete 仅表示从第一页到末页的分页完成，不是事务快照。

## 权限

表格写入需要 sheets:spreadsheet，多维表格使用 bitable:app；两项均纳入本版 auth scopes。后台开通后仍需本人 `auth login`，单纯刷新旧 token 不扩权。既有 drive:drive:readonly 可用于普通表格读取。应用权限、本人授权、资源访问权限及 Base 高级权限分别生效；遇拒绝保留诊断，不临时追加未知 scope。
