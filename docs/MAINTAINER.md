# 维护者：统一 0.1.0 的配置与发布

所有人使用同一安装包，不区分部门包、通用包，也不向包里写入任何应用凭证。

## 推荐的配置模型

1. 安装程序：安装统一 tgz，只影响程序位置。
2. 配置应用：`kunlun config init` 在终端输入 App ID 和 Secret，Secret 隐藏输入；配置属于本机系统用户。
3. 本人授权：`kunlun auth login --scope "docx:document"`，每人用本人浏览器账号完成。
4. 接入 Skill：让 Agent 发现 `kunlun-shared` 和 `kunlun-doc`，日常用自然语言。

Lark CLI 官方快速开始也将[应用配置与用户登录](https://github.com/larksuite/cli/blob/main/README.zh.md#配置与使用)分开；公有云自动建应用流程不是昆仑 CLI 当前支持的流程。

本地配置是文件存储，Secret 尚未接入系统密钥链。不要把终端隐藏输入等同于落盘加密。将来若要同事完全不接触共享应用 Secret，需要托管授权服务，而不是在安装包中藏密钥。

## 应用准备与脚本配置

维护“小惠”可用范围，开通并使用户身份权限 docx:document 生效，登记回调 `http://127.0.0.1:19876/callback`。向成员提供批准使用的应用资料，不复制维护者的用户登录态。

人直接运行 `kunlun.cmd config init`。脚本可用 stdin，不能用 Secret 命令参数：

```powershell
$kunlunSecret = Read-Host "App Secret" -AsSecureString
[System.Net.NetworkCredential]::new("", $kunlunSecret).Password | kunlun.cmd config init --app-id cli_xxx --app-secret-stdin
Remove-Variable kunlunSecret
kunlun.cmd config show
```

`config show` 脱敏；环境变量优先于本机配置，默认值仅为昆仑端点，不含应用。通过 `KUNLUN_CONFIG_DIR` 隔离不同应用；更换应用或主机的 config init 会清除该目录旧用户 / bot session。返回网页链接可配置 `--web-base-url` 为实际文档网页根地址。

## 打包与分发

```powershell
npm ci
npm test
npm run check
npm run test:package
npm run package
```

交付 `release/kunlun-cli-0.1.0.tgz`、同名 `.sha256` 和 `使用说明.md`。包已编译，无运行时 npm 依赖，安装可以离线完成；云端操作仍需办公网络。保留 private: true，未发布到公共 npm。

旧 0.1.1 / 0.1.2 为未正式发布的试验编号，本次收敛为统一 0.1.0；不要再分发旧内置凭证包。后续正式发布后，版本号应递增，避免同版本不同内容。

## 自己先试与同事验收

运行 `npm run sandbox`，按[独立试用指南](TRYOUT.md)在新终端测试安装包。安装路径、npm 缓存、配置和工作目录均独立；仅换目录不足以隔离登录态。

自动化安装验收使用模拟凭证，不触及真实配置。真实试用仍需本人浏览器授权，建议先 dry-run，再创建明确命名的测试文档。完成后请一位同事通过 Agent 复验，并更新 [ACCEPTANCE.md](ACCEPTANCE.md)。

部门成员和外部使用者只看各自指南：[MEMBERS.md](MEMBERS.md)、[EXTERNAL.md](EXTERNAL.md)。技术结构见 [ARCHITECTURE.md](../ARCHITECTURE.md)，后续工作见 [ROADMAP.md](ROADMAP.md)。

验证通过后提交源码、文档、Skill 和 lockfile，再 push；release、dist、真实配置和试用目录不入 Git。
