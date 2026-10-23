# kunlun-cli

让本机 AI Agent 用自然语言操作本人昆仑智联文档。统一发行版本：**0.1.0**。

安装包只包含程序与 Skill，不包含 App ID、App Secret 或用户登录态。每台电脑安装后通过命令行配置应用，用户再用本人账号授权。

## 开始使用

```powershell
npm install -g .\kunlun-cli-0.1.0.tgz --offline --ignore-scripts --no-audit --no-fund
kunlun.cmd config init
kunlun.cmd skills install --dir .cursor/skills
kunlun.cmd auth login --scope "docx:document"
```

`config init` 交互输入 App ID，隐藏输入 Secret；不把 Secret 放在命令参数中。Skill 应安装到实际 Agent 的发现目录，Cursor 示例为项目内的 `.cursor/skills`。

重开 Agent 对话后说：“使用 kunlun-doc，将这份草稿写入我的昆仑云空间，读回核对并给我文档 ID 和可用链接。”

## 按身份阅读

| 读者 | 说明 |
| --- | --- |
| 部门同事 | [首次接入和自然语言使用](docs/MEMBERS.md) |
| 维护者 | [应用配置、打包、分发与验收](docs/MAINTAINER.md) |
| 外部使用者 | [配置自己的应用](docs/EXTERNAL.md) |
| 自己先试安装包 | [独立安装、独立配置、独立工作目录](docs/TRYOUT.md) |

当前支持创建、读取、末尾追加和唯一文本定位修改；搜索、删除、移动、重命名和复杂格式编辑尚未实现。这是本机 Agent 调用 CLI，不是昆仑“小惠”聊天窗口执行任务。

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

[架构](ARCHITECTURE.md) · [开发路线](docs/ROADMAP.md) · [验收记录](docs/ACCEPTANCE.md)

程序安装、应用配置、用户授权彼此独立。换工作目录不会隔离配置；默认配置仍是 `~/.kunlun-cli`，独立试用必须设置 `KUNLUN_CONFIG_DIR`。本地凭证、生成物和试用目录不提交 Git。
