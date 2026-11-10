# 开发、验收与发布

用户安装、配置和使用只维护在 [README](../README.md)。Skill 源码在 `skills/`，不要把它与 Agent 项目的安装目录混为一谈。

## 开发

Node.js 22.18+，在仓库根目录执行：

```sh
npm ci
npm test
npm run check
npm run test:package
npm run package
```

源码调试用 `node src/main.ts <命令>`。`build` 编译为 dist 并排除测试；`package` 生成无开发依赖、无安装脚本的 tgz，以及校验文件、安装器、manifest 和使用说明。`test:package` 在临时目录、空 npm 缓存、模拟配置下离线安装，Windows 额外验证多安装共存及覆盖更新，结束自动清理。

保留的脚本各有职责：build、package-lib（包白名单及暂存）、package（交付目录）、test-package（安装验收）、install.ps1 和 install.cmd（Windows 安装）。`npm run install:local` 组合打包和真实本机安装，会改当前用户 PATH；它不是隔离验收。

npm 包仅允许 README、package.json、编译后 JS 和 skills；架构、规划、验收、历史分析、源码、测试及脚本不随安装包分发。

## 应用准备

维护者在昆仑后台登记本机回调、应用成员范围和 `auth scopes` 中的权限。新增权限先验证真实接口与本人授权，再更新 src/auth/scopes.ts、业务代码、测试及 Skill，递增版本后分发。后台新增权限不会自动扩大旧 token 的范围。

Secret 不写入包，不复制维护者 session。需要同事完全不接触共享 Secret 时，应建设托管授权服务。脚本配置使用 stdin：

```powershell
$kunlunSecret = Read-Host 'App Secret' -AsSecureString
[System.Net.NetworkCredential]::new('', $kunlunSecret).Password | kunlun-cli.cmd config init --app-id cli_xxx --app-secret-stdin
Remove-Variable kunlunSecret
```

`config init` 可配置 open/accounts/web 根地址；其他私有化部署需另行验证兼容性。

## 独立真实试用

先完成离线 test:package。人工试用使用新的终端，清除继承的 KUNLUN_* 变量，使用专属配置目录；仅换工作目录不足以隔离登录态。以 PowerShell 为例：

```powershell
Get-ChildItem Env: | Where-Object Name -like 'KUNLUN_*' | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
$trialRoot = Join-Path $env:TEMP ('kunlun-trial-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $trialRoot | Out-Null
$env:KUNLUN_CONFIG_DIR = Join-Path $trialRoot 'config'
$env:npm_config_cache = Join-Path $trialRoot 'npm-cache'
npm install --global --prefix $trialRoot ./release/lvshrd-kunlun-cli-0.2.2.tgz --offline --ignore-scripts --no-audit --no-fund
& (Join-Path $trialRoot 'kunlun-cli.cmd') config show
```

macOS / Linux 使用相同的 npm prefix、独立 KUNLUN_CONFIG_DIR，入口位于 `<prefix>/bin/kunlun-cli`。真实 Agent 也必须继承这些环境或显式使用对应配置和绝对入口。试用目录可能含真实凭证，不提交、不分发；关闭终端恢复日常环境，清理前确认目录用途。旧的 .kunlun-sandbox 目录仍可能保存凭证，不由本次代码整理自动删除。

使用本人账号完成 config init、auth login/status，生成模板并预览后，在明确的测试文档完成创建、搜索定位、读取、追加、修改和读回。核对文本、追加次数、归属、完整性标记及并发版本冲突。失败保留文档 ID，先核对实际内容再恢复。至少一位非维护者在独立电脑通过 Agent 完成同一流程；把版本、环境、实际结果和限制记录到 [ACCEPTANCE](ACCEPTANCE.md)，不能用本地模拟替代平台实测。

## npm 发布

公共包名为 @lvshrd/kunlun-cli，命令名为 kunlun-cli；package.json 的 publishConfig 固定公共 registry 和 public 访问。没有 scope 的同名包不是本项目。仓库尚未指定开源许可证，发布不自动附加某个开源许可。

1. 本机 `npm login --registry=https://registry.npmjs.org/`，用 whoami 确认身份；不要在聊天提供 token。
2. 每次更新递增 package.json、lockfile、src/version.ts 与 README 中的版本；用 `npm view @lvshrd/kunlun-cli versions --json` 确认未被发布过。
3. 保持 scoped 包名、publishConfig 和 bin 一致；Windows 安装器接受 lvshrd-kunlun-cli-<版本>.tgz。
4. 运行上述全部检查和 package。审查 tgz 清单及 SHA-256，不覆盖已发布版本。
5. 对生成的那个 tgz 执行 `npm publish ./release/lvshrd-kunlun-cli-<版本>.tgz --access public --tag latest --dry-run`，核验后去掉 --dry-run 发布。发布使用与验包相同的 tgz；npm dry-run 不证明发布权限或账号验证已通过。
6. 用空目录从 registry 安装精确版本，验证 --version、帮助、skills install；再更新 README 的实际安装命令。

latest 指向最新正式版，使用者重复 `npm install --global @lvshrd/kunlun-cli@latest` 即可更新；配置和登录态在独立目录保留。CLI 不在启动时自行下载程序。Skill 是项目内副本，需备份自定义内容后另行 skills install --force；新增 scope 仍需重新授权。

旧版专属 prefix 迁移见 README，移除旧 kunlun-cli 后安装带 scope 的包，避免两个包争用同一个命令。不要用 --force 跳过入口冲突。

## 离线交付与更新

保留 Windows 离线安装方式，交付 release 中的 tgz、.sha256、release.json、install.cmd、install.ps1、使用说明.md。生成物不提交 Git；源码和锁文件通过验证后再提交。

安装器支持 -InstallDir 指定专属目录、-NoPersistPath 避免写入持久 PATH。重复安装保留配置和登录态；新 scope 仍需重新授权，Skill 副本仍需另行同步。首次 PATH 变更后完全重启终端及 Agent。
