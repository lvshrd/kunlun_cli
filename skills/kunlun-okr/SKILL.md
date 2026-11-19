---
name: kunlun-okr
description: "通过本机 kunlun-cli 查询昆仑智联 OKR 周期和本人目标、关键结果，新增、读取和更新已发布目标或关键结果的文字进展。"
---

# 昆仑 OKR

本人查询和进展读写使用默认授权中的 `okr:okr`。旧登录缺少该权限时重新运行 `kunlun-cli auth login`。身份与结果处理见 [kunlun-shared](../kunlun-shared/SKILL.md)。

## 定位目标和进展

- 用 `kunlun-cli okr list --all` 查询本人的 OKR，在 `data.items` 中按周期和标题找目标。目标（O）的 ID 在 `objective_list[].id`，关键结果（KR）的 ID 在该 O 的 `kr_list[].id`。进展 ID 在对应 O 或 KR 的 `progress_record_list[].id`。ID 按字符串保留。需查遍所有周期时核对 `data.complete`。
- 用 `kunlun-cli okr periods --as bot --all` 以应用身份查询周期列表。创建和发布 O 或 KR 使用昆仑 OKR 页面。

## 读写进展

首次记录用 `create`，已有进展用 `read` 或 `update`。选定目标后，替换示例中的 ID、来源标题和链接。在 O 下新增时传 O 的 ID，并使用 `--target-type objective`。

```sh
kunlun-cli okr progress create --target KR_ID --target-type key-result \
  --source-title '项目周报' --source-url 'https://docs.example.com/project-update' \
  --file progress.txt --dry-run
kunlun-cli okr progress read --progress PROGRESS_ID
kunlun-cli okr progress update --progress PROGRESS_ID --file progress.txt --dry-run
```

正文输入三选一，`--content`、UTF-8 的 `--file` 或 `--stdin`。新增需要实际来源的 HTTP 或 HTTPS 链接。读回纯文本看 `data.text`，复杂内容看 `data.content`。CLI 更新纯文本正文，带格式或复杂内容的进展可在昆仑页面更新。

`--dry-run` 在本地预览参数和正文。按用户授权提交后核对 `data.verified` 并保留 `data.progress_id`。相同正文返回 `action=unchanged`。

遇到 `write_unknown` 或 `verification` 时，先按进展 ID 读回，或用 `okr list --all` 在目标下重新定位，再决定是否重试。需要从多维表格取正文时，先按表格 Skill 选择记录和字段。[Base 到 OKR 的组合流程](../kunlun-tables/references/commands.md#同步到-okr-进展)
