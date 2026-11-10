# 文档命令参考

安装后用 `kunlun-cli`，源码开发才用 `node src/main.ts`。长正文使用 UTF-8 文件，`--file`、`--content`、`--stdin` 只能选一个。

| 任务 | 命令 |
| --- | --- |
| 本地模板 | `kunlun-cli docs template --output ./草稿.md`，不覆盖已有文件 |
| 创建预览 | `kunlun-cli docs create --title "标题" --file ./草稿.md --dry-run` |
| 创建 | 上述命令去掉 --dry-run |
| 搜索候选 | `kunlun-cli docs search --query "关键词" [--limit 20] [--offset 0]`，仅 user |
| 按完整标题读取 | `kunlun-cli docs read --name "完整标题"`，完整候选中唯一匹配 docx 才读取 |
| 读取 | `kunlun-cli docs read --document <ID或docx链接>` |
| 读取并查看原始块 | 上述命令加 `--raw`；默认仅返回文本、诊断和块关系 |
| 追加 | `kunlun-cli docs append --document <ID> --file ./补充.md`，支持 --dry-run |
| 精确修改预览 | `kunlun-cli docs edit --document <ID> --find "原文" --replace "新文" --dry-run` |
| 执行修改 | 去掉 --dry-run，并传入预览返回的 `--revision <版本>` |
| 创建并嵌入表格 | `kunlun-cli docs tables create --document <ID> --type native|sheet|bitable [--title <小节>]` |
| 读取原生普通表格 | `kunlun-cli docs tables read --document <ID> --table <block_id>` |
| 修改原生表格文字 | `kunlun-cli docs tables write --document <ID> --table <block_id> --file <values.json> [--revision <N>] [--dry-run]` |

创建和追加的预览只处理本地正文，不能证明权限可用。修改预览会读取云端定位文本，但不写入；修改执行用文档版本限制并发冲突。

编辑要求在单个纯文本 run 的普通段落或一至三级标题内唯一匹配，不能跨 run，不支持空替换或批量替换。无法完整读取时拒绝编辑。修改后读回核对；网络错误不盲目重试。

文档输入应为实际 docx ID / 链接，wiki 链接未解析。创建默认归属本人；分享仍由资源权限决定。

只有名称时先搜索；候选返回 token/type/title/owner_id，明确 docx 才附 document_id（配置网页根地址后附 URL）。相近名称或同名需消歧。`read --name` 与 `--document` 互斥，--name 不支持 bot；最多查询首批 50 条，has_more=true 时返回 incomplete 及候选，不自动选第一条。

搜索 limit 为 1～50、offset 非负，offset + limit 必须小于 200。下一页同时传 next_offset 和 next_limit；search_window_exhausted=true 表示有更多数据但已到接口窗口上限，需要缩小关键词。空结果、权限错误和响应异常分别处理；不扩大当前版本固定权限。后台与实际接口仍需真实环境验收。


Markdown正文写入支持三级标题和普通段落；表格不会从Markdown自动转换，但可通过docs tables专用命令创建并嵌入。三类表格的完整初始化及验收流程见[创建含三类表格的文档](../../kunlun-tables/references/create-with-tables.md)。复杂表格结构、代码块、列表和截图尚未封装；全文读取也不保真。文档删除、移动、重命名尚无快捷命令。

读取先获取文档 revision，所有页固定该版本。原有 markdown / block_count 字段保留，新增：

- `pagination_complete`：分页是否取完；最多 20 页，缺失或重复游标、无效响应、中途请求失败均以非零退出及 `error.type: incomplete` 返回部分结果，data.reason 说明原因。
- `content_complete`：已取回块的文本内容是否均在当前支持范围内呈现，不承诺样式、链接等格式保真。
- `complete`：上述两项同时为 true。成功退出也必须检查此字段，不能把部分 Markdown 当全文。
- `revision` / `pages_read`：固定文档版本、已读取页数。
- `diagnostics`：省略或异常的 block_index / block_id / block_type、可用的 element_index / element_type，以及 reason。索引从 0 开始；缺失子块也会报告。
- `blocks`：轻量结构，包含 index、可用的 block_id / block_type / parent_id、children。容器中提取到部分子文本，不代表表格结构或整个容器完整。
- `raw_blocks`：仅 `--raw` 时返回原始块；失败时同样只包含已获取部分。
