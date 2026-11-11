# 表格 API 适配依据

核对日期：2026-11-10。来源为昆仑私有化开放平台的接口目录、正文及用户应用后台，不以飞书公有云文档替代环境能力。真实验收与模拟验证分开记录于 [ACCEPTANCE](ACCEPTANCE.md)。

## 类型与适配边界

| 资源 | 识别 | 当前实现 |
| --- | --- | --- |
| 普通电子表格 | /sheets/ 链接，工作表 resource_type=sheet | 元数据、工作表列表、区域读取、写入、插入追加、清空内容、写后读回 |
| 文档内嵌电子表格 | DocX block_type=30，sheet.token | 拆分 SpreadsheetToken_SheetID，交给相同 Sheets 适配器 |
| 多维表格 | /base/ 链接，DocX block_type=18 | 元数据、数据表和字段列表、记录分页查询/读取/新增/更新/删除、字段新增/更新/删除 |
| 原生文档表格 | DocX block_type=31，单元格32 | 创建带内容表格、按矩阵读取/修改简单单元格文字；合并单元格与行列结构调整未实现 |
| 画板 | DocX block_type=43，board.token | 返回白板 ID；内容导出和编辑尚未实现 |

用户提供的“数据电子表格”样本实际是 DocX 中的 type30 嵌入表格，已验证 resource_type=sheet，3×4 区域读取成功。这只说明该样本对应 Sheets，不声称所有同名界面都属于同一资源。Sheets 元数据还可能返回 bitable / #UNSUPPORTED_TYPE，单元格动作遇到它们会停止，不猜测 token 转换。

资源字段依据：[DocX Block 数据结构](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/data-structure/block)。docs read 的 resources 只负责定位，不自动读取嵌入内容，原有 content_complete / diagnostics 继续报告省略。

## 文档内创建与嵌入

0.2.3新增JSON初始化编排，不是新增平台API：native/sheet输入values，Base输入fields与records。Base只面向本次新建数据表，先完整读取默认字段/记录，拒绝已有业务数据，复用确认空白的记录、不足才新增；每条写入读回核对，最后完整查询记录并返回残余空白数。不自动删除空行或默认字段。当前初始化限定文字/数字字段（首列文字主字段），20字段/100记录；既有资源仍用记录ID进行明确更新，不隐式覆盖整表。部分失败为partial_write，保留资源ID、阶段、进度和原错误，不自动重建。

0.2.2起，正式入口为 `docs tables create --document <ID> --type native|sheet|bitable`，均追加到文档末尾；可用--title同时创建二级标题。创建与操作已有资源是不同能力：0.2.1的CRUD验收使用原始API创建测试区，没有正式创建命令；本次补齐后，Agent可按[三类表格流程](../skills/kunlun-tables/references/create-with-tables.md)完成整个请求。

- native使用[创建嵌套块](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/document-block-descendant/create)：POST /open-apis/docx/v1/documents/:document_id/blocks/:document_id/descendant，children_id只包含顶层表格/标题，descendants包含Table、TableCell和每格Text。一次请求完成结构与内容创建，之后读回矩阵核对。
- sheet/bitable使用[创建块](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/document-block-children/create)：POST /open-apis/docx/v1/documents/:document_id/blocks/:document_id/children，分别创建type30的sheet行列、type18的bitable视图。平台创建实际资源并返回组合token，CLI再核对文档引用及资源元数据。返回content_initialized=false，需要接续Sheets/Base写入命令。
- 普通表格与Sheet初始化契约另见[文档常见问题](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/faq)。创建支持UUIDv4 client_token，写入不自动重试，结果不明保留document_id、block_id与key，不自动重建整篇文档。

CLI初始限制1～9行/列；native values支持标量并转为普通文字。docs tables read最多81个未合并单元格，每格一个普通段落；docs tables write最多50格，每格最多一个text run、保留其样式，矩阵须与表尺寸一致。复杂/嵌套/合并内容明确拒绝。写前可检查--revision，但没有严格原子并发保证，仍需写后核对。单元格文字清空可通过写空字符串完成，不等于删除表或行列。

## 电子表格

| 操作 | 方法与路径 | 官方说明 |
| --- | --- | --- |
| 元数据 | GET /open-apis/sheets/v3/spreadsheets/:token | [获取电子表格信息](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/sheets-v3/spreadsheet/get) |
| 工作表列表 | GET /open-apis/sheets/v3/spreadsheets/:token/sheets/query | [查询工作表](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/sheets-v3/spreadsheet-sheet/query) |
| 类型检查 | GET /open-apis/sheets/v3/spreadsheets/:token/sheets/:sheet_id | [获取工作表](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/sheets-v3/spreadsheet-sheet/get) |
| 区域读取 | GET /open-apis/sheets/v2/spreadsheets/:token/values/:range | [读取单个范围](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/ugTMzUjL4EzM14COxMTN) |
| 覆盖写入 | PUT /open-apis/sheets/v2/spreadsheets/:token/values | [向单个范围写入数据](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uAjMzUjLwIzM14CMyMTN) |
| 插入追加 | POST /open-apis/sheets/v2/spreadsheets/:token/values_append | [追加数据](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uMjMzUjLzIzM14yMyMTN) |

CLI 只接受有界 A1 区域，最多5000行、100列；不承诺全工作簿完整导出。写入体为 valueRange:{range,values}。先确认 sheet 类型，覆盖前读取原值，写后根据 updatedRange 读回核对；append 显式使用 insertDataOption=INSERT_ROWS，可能移动其它行。没有原子 revision 条件，返回 concurrency_protected=false，不把读回验证称为并发保护。

读取使用 valueRenderOption=Formula、user_id_type=open_id。公式写入采用 {type:"formula",text:"=..."}，按公式文本核对；其它富单元格暂拒绝，依据[支持写入的数据类型](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/ugjN1UjL4YTN14CO2UTN)。本环境已实测字符串、数字、公式对象、null 写入；null 可清空原值，空字符串读回也可能为 null。布尔值返回90204（invalid cell type, type is bool），CLI 在请求前拒绝。sheets clear 通过写入空字符串清空有界区域并核对，不删除工作表或行列。日期格式、图表、样式、行列操作和单元格图片尚未封装。

## 多维表格

统一前缀 /open-apis/bitable/v1/apps/:app_token。

| 操作 | 方法与后缀 | 官方说明 |
| --- | --- | --- |
| 元数据 | GET 根路径 | [获取多维表格元数据](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app/get) |
| 数据表 | GET /tables | [列出数据表](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table/list) |
| 字段 | GET /tables/:table_id/fields | [列出字段](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-field/list) |
| 条件查询 | POST /tables/:table_id/records/search | [查询记录](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/search) |
| 单条读取 | GET /tables/:table_id/records/:record_id | [检索记录（历史版本）](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/get) |
| 新增记录 | POST /tables/:table_id/records | [新增记录](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/create) |
| 更新记录 | PUT /tables/:table_id/records/:record_id | [更新记录](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/update) |
| 新增字段 | POST /tables/:table_id/fields | [新增字段](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-field/create) |
| 更新字段 | PUT /tables/:table_id/fields/:field_id | [更新字段](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-field/update) |
| 删除记录 | DELETE /tables/:table_id/records/:record_id | [删除记录](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/delete) |
| 删除字段 | DELETE /tables/:table_id/fields/:field_id | [删除字段](https://open.fklzl.cnpc.com.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-field/delete) |

单条读取暂沿用环境文档明确存在的历史接口；后续迁移 batch_get 时另行核实契约。query 的 user_id_type 固定 open_id。创建记录生成或接受 UUIDv4 client_token，并在结果不明时保留该 key；不自动重试。更新记录先读原值，只提交所给 fields，写后按请求字段检查（允许服务端对象增加描述字段、文本纯 text runs）。本环境数字字段单条读回为字符串：只有查询字段定义确认 type=2 后，才按数值核对；其它类型不强制转换，read_back 保留原始值。平台对只读字段、字段类型和复杂值做最终校验；规范化导致表示不同也可能核对失败，须检查实际结果。

字段写入接受 field_name、type、property、description，当前读回只验证名称与类型，返回 verification_scope=field_name_and_type，不承诺属性配置已完整核对。删除先读取指定目标；主字段禁止删除。DELETE 响应须明确返回 deleted=true 及匹配 ID；记录随后读取，只有1254043（RecordIdNotFound）可确认不存在；字段随后完整分页核对缺席。网络和权限错误不当作不存在。Base可通过DocX嵌入创建；尚未封装独立Base创建、向已有Base新增数据表、工作表/行列删除、批量修改、视图管理或附件上传。

表/字段每页最多100条，记录最多500条；默认100。--all 最多50页，游标重复、缺失、结构无效或后续网络失败以 incomplete 返回部分数据。complete 只表示从首到末分页结束，不提供事务一致快照。查询的 filter / sort 可覆盖视图的筛选和排序；高级权限可能令成功响应为空，不能据此断言没有记录。

## 身份与权限

上述接口文档允许 user_access_token 或 tenant_access_token。CLI 默认 user，bot 仅显式选择，不作自动降级。读取普通表格可沿用 drive:drive:readonly；写入普通表格选 sheets:spreadsheet；Base 选 bitable:app。两项覆盖本轮接口，无需额外开通 base:app:create/copy/update 或重复只读权限。bitable:app 是较宽的权限，包含删除 API；CLI 将删除限定为显式指定记录或字段 ID。

2026-11-10 维护者确认后台开通两项，并完成包含原四项及这两项的本人授权，返回 scope 已核对。随后在用户指定文档新建专用嵌入 Sheets、Base 测试区，完成写入、更新、追加、公式、清空及字段记录增删改查；保留可见样例和操作日志。白名单随 release 固定，未知 scope 仍在授权前拒绝。应用开通、本人同意、资源权限分别生效，token 刷新不增加权限。详细证据以验收记录为准。

## 后续画板

已查到[导出画板为图片](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/board-v1/whiteboard/download_as_image)，该接口返回二进制。现有 client 为 JSON/text 传输，不直接把图片当文本处理。下一步应增加同源二进制下载能力与独立 board 适配器，再核对环境是否开放节点编辑接口；本轮只保留资源发现入口。
