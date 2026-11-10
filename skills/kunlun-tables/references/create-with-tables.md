# 创建包含三类表格的云文档

本流程要求kunlun-cli **0.2.2及以上**。0.2.1提供已有表格CRUD，不包含本页创建/嵌入命令；先检查实际版本，旧版本按用户授权更新后再执行。

适用请求示例：“创建一个云文档，包含普通表格、数字表格、 多维表格，内容随便。”这里普通表格为原生 DocX Table，数字/电子表格为 Sheets，多维表格为 Base。三类都可用正式命令创建并嵌入，不需要用原始 api 命令搭建。

## 创建文档和普通表格

```sh
kunlun-cli docs create --title "三类表格示例" --content "包含普通表格、电子表格和多维表格。"
kunlun-cli docs tables create --document <document_id> --type native --title "普通表格" --file native.json --dry-run
kunlun-cli docs tables create --document <document_id> --type native --title "普通表格" --file native.json
```

native.json：

```json
{"values":[["项目","状态"],["方案编写","进行中"],["接口联调","待开始"]]}
```

返回 block_id，并已将这些值写入原生单元格、读回核对。初始最多9行9列。支持字符串、数字、布尔值或null，保存为普通文字，null为空文字。要创建空表格可不用输入文件，改传 --rows / --columns（默认2×2）。--title 会在新表格前创建二级标题。

读取、修改该普通表格：

```sh
kunlun-cli docs tables read --document <document_id> --table <block_id>
kunlun-cli docs tables write --document <document_id> --table <block_id> --file native.json --dry-run
kunlun-cli docs tables write --document <document_id> --table <block_id> --file native.json --revision <读取所得revision>
```

write 替换整张表的普通单元格文字，矩阵须与表尺寸一致；最多50格，每格至多一个text run，保留其样式。写空字符串可清空文字，保留表格结构。read 最多81格，要求未合并、每格一个纯文本段落；遇复杂内容会拒绝，不丢弃后重建。--revision 检查写前读取的版本；平台未提供严格原子保护，仍需检查写后结果。

## 创建电子表格并填充

```sh
kunlun-cli docs tables create --document <document_id> --type sheet --title "电子表格" --rows 3 --columns 3
kunlun-cli sheets write --spreadsheet <返回的spreadsheet_token> --range '<返回的sheet_id>!A1:C3' --file sheet.json
```

sheet.json：

```json
{"values":[["项目","数量","金额"],["设备A",2,1200],["设备B",3,{"type":"formula","text":"=B3*500"}]]}
```

创建命令只新建并嵌入空工作表，返回 content_initialized=false；必须继续填充才能声称已完成带内容的表格。初始行列1～9，不接受 --file / --json / --stdin。之后使用 sheets read/write/append/clear，使用返回的真实ID，不用DocX block_id代替sheet_id。

## 创建多维表格并填充

```sh
kunlun-cli docs tables create --document <document_id> --type bitable --title "多维表格"
kunlun-cli bitable records create --app <返回的app_token> --table <返回的table_id> --file record.json
```

创建返回 fields，其中包含实际字段名、field_id、type、is_primary；根据用户要求使用现有字段或用 bitable fields create/update 设置字段后再填记录。不要猜默认字段名，也不要给 bitable 创建传 --rows / --columns / values。

例如默认首列名称是 Multiline，用户未指定字段结构时，record.json 可用返回的实际名字：

```json
{"fields":{"Multiline":"示例任务"}}
```

若要叫“任务”，用 `bitable fields update --app ... --table ... --field <主字段ID> --file field.json`，field.json 为 `{"field_name":"任务","type":1}`；此后再用“任务”作为记录键。数字等类型用正式字段命令创建，沿用平台值格式。

## 验收和恢复

全部创建均追加到指定文档末尾，--title 用于对应的小节。新建文档请求只需先执行一次 docs create，然后在其返回的 document_id 内逐项完成。用户已授权创建三类表格时，按该范围完成；不要因为 Markdown 正文不会自动转换表格就拒绝整个请求。

最后 docs read 检查 resources 中的 docx_table、sheets、bitable，再分别使用 docs tables read、sheets read 和 bitable records read/search 核对内容。docs read 的 content_complete=false 仍可能表示表格容器未自动展开，不能把它当成创建失败或整篇文档已读完。

create 支持 --client-token <UUIDv4>（默认生成），dry-run 离线返回计划；执行成功返回 creation_verified。创建或初始化中断时保留 document_id、block_id、client_token 和已成功的资源ID，先读取实际状态；不自动重建文档、重复创建表格或删除已完成内容。各类表格创建不是一个跨资源事务。
