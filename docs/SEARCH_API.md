# 文档搜索：接口依据与实现边界

核对日期：2026-11-01。先读取昆仑官方接口目录，再按目录中的真实路径读取正文；不以飞书公有云接口说明替代私有化契约。

## 官方依据

- [昆仑“搜索云文档”](https://open.fklzl.cnpc.com.cn/document/ukTMukTMukTM/ugDM4UjL4ADO14COwgTN)，文档 ID：`6907569523177439233`。
- [昆仑接口目录](https://open.fklzl.cnpc.com.cn/api/tools/server-side-api/list)包含上述文档及 `POST:/open-apis/suite/docs-api/search/object`。
- 正文可通过站点公开的 [文档详情](https://open.fklzl.cnpc.com.cn/document_portal/v1/document/get_detail?fullPath=%2FukTMukTMukTM%2FugDM4UjL4ADO14COwgTN&lang=zh-CN)读取。文档站常见的新路径在本次核对中返回“文档不存在”，不能据此判定业务接口不存在。

## 身份与权限

接口仅列出 `user_access_token`，用于搜索当前用户可见的云文档；没有列出机器人身份。搜索和按名称读取只接受 user，不自动切换 bot。

正文的权限要求是**任意一项即可**：

- `drive:drive`
- `drive:drive:readonly`
- `search:docs:read`

因此 `drive:drive` 是一种可用权限，并非唯一必选项。项目固定权限已包含 `drive:drive:readonly`，本次不增加 scope、不扩大到管理权限。应用后台权限、本人已同意授权和资源访问权限仍须分别生效；已有四项的登录验证不能代替搜索业务接口实测。

## 请求与分页

`POST /open-apis/suite/docs-api/search/object`，请求 JSON：

- `search_key`：必填关键词。本次不把它宣传为完整全文搜索，也不假设其排序稳定。
- `count`：服务端允许 0～50；CLI 使用 1～50，默认 20。
- `offset`：非负整数，且 **offset + count < 200**。本次 CLI 使用 `--limit` 映射 count。
- `docs_types`：本次固定 `["doc"]`。**请求枚举 doc 包含旧版 doc 和新版 docx，不能传 docx 作为请求过滤值。**
- `owner_ids`、`chat_ids`：文档列出的可选过滤，本次暂不暴露。

响应包含 `docs_entities`、`has_more`、`total`；候选提供 `docs_token`、`docs_type`、`title`、`owner_id`。CLI 保留类型和 token，只在响应类型明确为 docx 时提供可供现有读取接口使用的 document_id，不凭 token 前缀猜测类型。

CLI 返回 next_offset 与 next_limit；有下一页时应同时使用它们，最后一页的 limit 可能缩小。达到接口窗口上限仍有更多结果时，返回 has_more=true、search_window_exhausted=true，next_offset/next_limit 为 null；应缩小关键词，不能声称已经遍历全部结果。响应格式异常或分页无法前进返回错误，不当作零结果。

## 使用方式

```powershell
kunlun.cmd docs search --query "巡检规程"
kunlun.cmd docs search --query "巡检规程" --limit 20 --offset 20
kunlun.cmd docs read --name "泵站巡检规程"
kunlun.cmd docs read --document <选中的新版文档ID>
```

搜索只返回候选，不读取全部正文。按名称读取先搜索最多 50 条，只有 has_more=false、完整标题唯一匹配、类型明确为 docx 才继续读正文；同一资源的重复条目去重。相近标题、同名、还有更多结果、旧版或未知类型，均不自动读正文，并返回候选及处理提示。用户可据搜索结果进一步缩小范围，再由 Agent 用选定 ID 读取。

此策略避免自动选择第一条结果；它不承诺搜索索引绝无延迟，也不支持遍历接口窗口外的全部文档。名称定位成功后按固定 revision 读取正文，返回 complete / pagination_complete / content_complete 和诊断；--raw 可查看原始块。正文分页失败以非零退出保留部分结果；复杂文档转换仍不保真。

## 验证状态

已核对官方文档，并以模拟响应覆盖请求契约、参数边界、分页窗口、异常响应、权限错误、同名与旧版资源防误读，以及真实命令路由的“搜索后读取”流程。安装包检查另见 [ACCEPTANCE.md](ACCEPTANCE.md)。

本机没有应用配置和本人登录态，尚未调用真实搜索业务接口。待在已授权环境实测：现有 drive:drive:readonly 是否生效；doc/docx 响应类型实际值；中文关键词与分页；同名消歧；选定 docx 后正文读回。真实兼容性以这些结果为准，不将模拟测试当作平台验收。
