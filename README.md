# kunlun-cli

让本机 AI Agent 用自然语言操作本人昆仑智联文档。统一发行版本：**0.1.0**。

安装包只包含程序与 Skill，不包含 App ID、App Secret 或用户登录态。每台电脑安装后通过命令行配置应用，用户再用本人账号授权。

## 开始使用

Windows 安装 Node.js 22.18+，解压完整交付目录后运行：

```powershell
.\install.cmd
```

安装器校验安装包，将程序安装到 `%LOCALAPPDATA%\kunlun-cli` 并自动加入用户 PATH，无需管理员权限。首次安装后重启终端和 Agent 应用，再执行：

```powershell
kunlun.cmd --version
kunlun.cmd config init
kunlun.cmd skills install --dir .cursor/skills
kunlun.cmd auth login
```

`config init` 交互输入 App ID，隐藏输入 Secret；不把 Secret 放在命令参数中。Skill 应安装到实际 Agent 的发现目录，Cursor 示例为项目内的 `.cursor/skills`。

`auth login` 默认请求当前版本固定的四项业务权限；`auth scopes` 可离线查看清单。Agent 无需拼接 scope。新增权限由维护者验证后随新版发布，用户升级后重新授权。

重开 Agent 对话后说：“使用 kunlun-doc，将这份草稿写入我的昆仑云空间，读回核对并给我文档 ID 和可用链接。”

## 按身份阅读

| 读者 | 说明 |
| --- | --- |
| 部门同事 | [首次接入和自然语言使用](docs/MEMBERS.md) |
| 维护者 | [应用配置、打包、分发与验收](docs/MAINTAINER.md) |
| 外部使用者 | [配置自己的应用](docs/EXTERNAL.md) |
| 自己先试安装包 | [独立安装、独立配置、独立工作目录](docs/TRYOUT.md) |

当前支持按关键词搜索候选、按完整标题唯一定位读取、创建、读取、末尾追加和唯一文本定位修改；删除、移动、重命名和复杂格式编辑尚未实现。这是本机 Agent 调用 CLI，不是昆仑“小惠”聊天窗口执行任务。

只记得名称时，可以对 Agent 说：“使用 kunlun-doc，找一下泵站巡检规程并总结注意事项。”也可直接执行：

```powershell
kunlun.cmd docs search --query "巡检规程"
kunlun.cmd docs read --name "泵站巡检规程"
```

按名称读取要求完整标题唯一匹配；同名或结果未取全时返回候选，不自动选第一条。搜索仅支持本人身份，沿用现有 `drive:drive:readonly` 权限，不增加管理权限；接口已按昆仑官方文档封装，真实环境仍待验收。类型、分页和权限依据见[搜索接口说明](docs/SEARCH_API.md)。

读取返回 `complete`、`pagination_complete`、`content_complete` 和 `diagnostics`；成功退出也应检查是否完整，省略内容不能视为不存在。分页异常以非零退出返回部分结果。`docs read --raw` 可按需返回原始块；文本提取不承诺复杂格式保真。

## 开发与交付

```powershell
npm ci
npm test
npm run check
npm run test:package
npm run package
npm run sandbox
```

统一包在 `release/kunlun-cli-0.1.0.tgz`。源码调试用 `node src/main.ts <命令>`；安装后在任意目录使用 `kunlun`，PowerShell 推荐 `kunlun.cmd` 避免 ps1 执行策略问题。

维护者在仓库执行 `npm run install:local`，即可重新打包并覆盖安装到本机固定目录；重复安装保留配置和登录态，用户 PATH 不重复添加。给同事分发完整的 `release` 交付文件，更新时再次运行 `install.cmd`。项目内已复制的 Skill 如需同步，另行执行 `kunlun.cmd skills install --dir .cursor/skills --force`（覆盖前保留自己的改动）。

[架构](ARCHITECTURE.md) · [产品能力与拓展规划](docs/PRODUCT_PLAN.md) · [开发路线](docs/ROADMAP.md) · [验收记录](docs/ACCEPTANCE.md)

程序安装、应用配置、用户授权彼此独立。换工作目录不会隔离配置；默认配置仍是 `~/.kunlun-cli`，独立试用必须设置 `KUNLUN_CONFIG_DIR`。本地凭证、生成物和试用目录不提交 Git。
