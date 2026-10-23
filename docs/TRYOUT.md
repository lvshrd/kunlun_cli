# 在自己电脑上独立试用安装包

本项目提供独立安装、独立配置、独立 npm 缓存和独立工作目录。它不是虚拟机或系统安全沙箱，但足以避免试用污染原有 CLI 配置。仅换工作目录不会隔离默认的 `~/.kunlun-cli`。

## 准备试用环境

在源码根目录执行：

```powershell
npm run package
npm run sandbox
powershell -NoExit -ExecutionPolicy Bypass -File .\.kunlun-sandbox\start.ps1
```

最后一行进入新的 PowerShell 进程；Bypass 只作用于该进程，不修改系统策略。启动脚本仅设置这个终端的环境。输出应为版本 0.1.0、空 App ID、secret_source: missing，说明没读原有应用配置。

每次运行 sandbox 创建新的 `.kunlun-sandbox/trial-*`，使用本次构建的 tgz 离线安装；start.ps1 指向最近一次环境。`latest.json` 记录各目录，默认不复制任何真实凭证。

## 在试用终端里测试

```powershell
kunlun.cmd config init
kunlun.cmd config show
kunlun.cmd auth login --scope "docx:document"
kunlun.cmd auth status
kunlun.cmd skills install --dir .cursor/skills
kunlun.cmd docs template --output .\试用草稿.md
kunlun.cmd docs create --title "CLI 0.1.0 隔离试用" --file .\试用草稿.md --dry-run
```

配置时输入真实 App ID 和 Secret，浏览器完成本人授权。上面最后一步不写入云端。要验证真实写入，可去掉 --dry-run 创建这篇测试文档，然后使用返回 ID 读取、追加或编辑。

如果要通过 Agent 试用，在当前 work 目录打开 Agent。Agent 进程也必须继承此终端的 PATH 和 KUNLUN_CONFIG_DIR，或由 Agent 显式设置 latest.json 中的对应路径；单纯在另一个窗口打开同名目录，并不会继承试用环境。不要假设已有的 Agent 窗口已经切换配置。

## 结束试用

关闭试用终端即可恢复日常终端环境。原本的安装位置和 `~/.kunlun-cli` 不会被覆盖。

试用目录可能保存真实密钥与 token，不提交、不分发。可在试用终端运行 `kunlun.cmd auth logout` 清除用户 session；完整清理须确认不再使用后删除该次 trial 目录。云端测试文档不会随本地清理而删除。
