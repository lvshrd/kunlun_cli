# 创建包含三类表格的云文档

本流程要求kunlun-cli **0.2.2及以上**。0.2.1提供已有表格CRUD，不包含本页创建/嵌入命令；先检查实际版本，旧版本按用户授权更新后再执行。

**0.2.3起优先使用一次JSON初始化**：native/sheet输入values，bitable输入fields和records。CLI内部完成必要查询、字段配置、空白记录复用、写入和核对；Agent不必手工先调用records list。0.2.2仍使用下文分步流程。

```sh
kunlun-cli docs tables create --document <document_id> --type bitable --file base.json --dry-run
kunlun-cli docs tables create --document <document_id> --type bitable --file base.json
```

base.json：

```json
{"fields":[{"field_name":"任务","type":1},{"field_name":"进度","type":2}],"records":[{"fields":{"任务":"方案编写","进度":50}},{"fields":{"任务":"接口联调","进度":0}}]}
```

当前初始化支持1～20个字段（文字type=1、数字type=2），首列须文字主字段；最多100条记录。字段名必须唯一，记录只用声明的字段，未赋值字段省略而非传null。它只初始化本次新建的Base，不是对既有表格的整表覆盖；已有记录仍用record_id明确更新。

CLI完整查询初始记录，仅复用确认全部字段为空且写前仍为空的记录，不足才新增；0和false不算空。发现已有业务数据时停止，避免同一client-token重复执行造成重复新增。保留平台多余空行与未使用默认字段，不自动删除，返回records_reused、records_created、remaining_blank_records。remaining_blank_records不为0时须向用户说明。部分失败返回partial_write、资源ID、stage、progress及原错误，不自动重建或重试。

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

0.2.3可直接 `docs tables create --document <ID> --type sheet --file sheet.json`，自动按values推导初始尺寸并写入核对，返回content_initialized=true。初始行列1～9；若显式指定尺寸必须与values一致。不带JSON则仍创建空工作表、返回content_initialized=false，使用后续sheets命令填充；不要用DocX block_id代替sheet_id。

## 手工分步创建多维表格（0.2.2兼容流程）

```sh
kunlun-cli docs tables create --document <document_id> --type bitable --title "多维表格"
kunlun-cli bitable records list --app <返回的app_token> --table <返回的table_id> --all
```

创建返回 fields，其中包含实际字段名、field_id、type、is_primary；根据用户要求使用现有字段或用 bitable fields create/update 设置字段后再填记录。不要猜默认字段名，也不要给 bitable 创建传 --rows / --columns / values。

例如默认首列名称是 Multiline，用户未指定字段结构时，record.json 可用返回的实际名字：

```json
{"fields":{"Multiline":"示例任务"}}
```

若要叫“任务”，用 `bitable fields update --app ... --table ... --field <主字段ID> --file field.json`，field.json 为 `{"field_name":"任务","type":1}`；此后再用“任务”作为记录键。数字等类型用正式字段命令创建，沿用平台值格式。

以上分步流程用于0.2.2或有意创建空资源的情况；0.2.3带base.json即可一次初始化，无需Agent自行列出记录。content_initialized=false只表示CLI未填充数据，不保证平台没有生成空白记录，也不要假定其数量固定。

填充前先用 records list --all 查询新表已有记录，检查 complete / has_more，并保留 record_id。仅对本次新建且可确认所有字段均为空的初始化记录，优先用 records update --record <record_id> --file record.json 填入业务数据；不足的部分再用 records create 新增。不要覆盖已有业务数据或将此规则套用于既有表格。剩余空白记录不自动删除；如需删除，遵循明确删除授权要求。

填充后再次查询整张新表，核对业务记录内容、有效记录数和残留空白记录数。单条写入返回 verified=true 仅证明请求字段写入成功，不代表整表初始化完成；若有残留空白记录，应在交付时说明。未读取记录前，不断言平台生成了空白记录或其数量。

## 验收和恢复

全部创建均追加到指定文档末尾，--title 用于对应的小节。新建文档请求只需先执行一次 docs create，然后在其返回的 document_id 内逐项完成。用户已授权创建三类表格时，按该范围完成；不要因为 Markdown 正文不会自动转换表格就拒绝整个请求。

最后 docs read 检查 resources 中的 docx_table、sheets、bitable，再分别使用 docs tables read、sheets read 和 bitable records read/search 核对内容。docs read 的 content_complete=false 仍可能表示表格容器未自动展开，不能把它当成创建失败或整篇文档已读完。

create 支持 --client-token <UUIDv4>（默认生成），dry-run 离线返回计划；执行成功返回 creation_verified。创建或初始化中断时保留 document_id、block_id、client_token 和已成功的资源ID，先读取实际状态；不自动重建文档、重复创建表格或删除已完成内容。各类表格创建不是一个跨资源事务。
