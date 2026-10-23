# 文档命令参考

安装后用 `kunlun`，源码开发才用 `node src/main.ts`。长正文使用 UTF-8 文件，`--file`、`--content`、`--stdin` 只能选一个。

| 任务 | 命令 |
| --- | --- |
| 本地模板 | `kunlun docs template --output ./草稿.md`，不覆盖已有文件 |
| 创建预览 | `kunlun docs create --title "标题" --file ./草稿.md --dry-run` |
| 创建 | 上述命令去掉 --dry-run |
| 读取 | `kunlun docs read --document <ID或docx链接>` |
| 追加 | `kunlun docs append --document <ID> --file ./补充.md`，支持 --dry-run |
| 精确修改预览 | `kunlun docs edit --document <ID> --find "原文" --replace "新文" --dry-run` |
| 执行修改 | 去掉 --dry-run，并传入预览返回的 `--revision <版本>` |

创建和追加的预览只处理本地正文，不能证明权限可用。修改预览会读取云端定位文本，但不写入；修改执行用文档版本限制并发冲突。

编辑要求在单个纯文本 run 的普通段落或一至三级标题内唯一匹配，不能跨 run，不支持空替换或批量替换。无法完整读取时拒绝编辑。修改后读回核对；网络错误不盲目重试。

文档输入应为实际 docx ID / 链接，wiki 链接未解析。创建默认归属本人；分享仍由资源权限决定。

写入格式支持三级标题和普通段落。复杂表格、代码块、列表和截图尚未实现，读取也不保真；原有 read 命令最多 20 页，超长文档可能不完整。搜索、删除、移动、重命名尚无快捷命令。
