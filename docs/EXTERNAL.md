# 外部使用者：使用自己的应用

与部门同事使用同一个 `kunlun-cli-0.1.0.tgz`，没有任何默认 App ID、Secret 或用户登录态。

准备 Node.js 22.18+，创建自己的昆仑智联应用，使 `kunlun auth scopes` 列出的用户身份权限生效，登记回调 `http://127.0.0.1:19876/callback`。

```powershell
.\install.cmd
```

Windows 使用完整交付目录中的安装器，自动加入用户 PATH。首次安装后重启终端和 Agent 应用，再执行：

```powershell
kunlun.cmd config init
kunlun.cmd skills install --dir .cursor/skills
```

终端交互输入自己的 App ID、隐藏输入 Secret；Skill 目录选择实际 Agent 的发现目录。重开 Agent 对话后，说：“使用 kunlun-doc，帮我以本人账号登录，然后将这份草稿写到我的昆仑空间并读回核对。”

所有 App ID 使用相同的版本权限集合，默认 `auth login` 请求全部四项。若自己的应用仅开通文档权限，可明确使用 `auth login --scope "docx:document"`，并告知 Agent 此限制；`--scope` 只能选已支持的子集。需要集合外的权限应先验证并更新源码、发布新版，不能临时通过登录参数加入。

日常自然语言用法及当前能力见[成员指南](MEMBERS.md#日常直接说需求)。脚本配置和多应用隔离见[维护者指南](MAINTAINER.md)。没有修改文件中的密钥模板或自行重打包的步骤。

其他私有化部署可通过 config init 的 `--open-base-url`、`--accounts-base-url`、`--web-base-url` 调整地址，接口兼容性需另行验证。
