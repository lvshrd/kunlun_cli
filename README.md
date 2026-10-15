# kunlun

用昆仑智联开放平台替你处理办公操作的命令行。AI 通过稳定的 JSON 输出调用它。当前版本可以登录，并创建、追加、读取云文档。

架构说明见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 准备

1. 安装 Node.js 22.18 或更高版本。当前开发环境是 Node.js 24。
2. 在 [昆仑智联开放平台](https://open.fklzl.cnpc.com.cn/document/home/index) 创建自建应用。
3. 开通云文档读写权限。权限名称以昆仑文档为准，常见项是文档的创建与编辑。
4. 把 `http://127.0.0.1:19876/callback` 填进应用的重定向 URL。

## 配置和登录

在 PowerShell 中，从仓库根目录执行：

```powershell
npm install
"你的AppSecret" | node src/main.ts config init --app-id cli_xxx --app-secret-stdin
node src/main.ts auth login
```

`auth login` 会打开昆仑智联授权页，不要附加 `--scope`。授权地址使用 `client_id`、`response_type=code`、`redirect_uri` 和 `state`。若未自动弹出浏览器，把终端里**整行完整 URL** 复制到浏览器（不能只复制到第一个 `&` 之前）。远程登录可加 `--no-browser`，只打印链接。授权完成后，本机保存用户登录态。

自动打开浏览器按操作系统调用系统 API（Windows 用 `rundll32`，macOS 用 `open`，Linux 用 `xdg-open`），与日常办公在本机跑 CLI 的方式一致；无图形界面的服务器请用 `--no-browser` 或设置 `KUNLUN_NO_BROWSER=1`。

```powershell
node src/main.ts auth status
node src/main.ts doctor
```

`config show`、`auth status` 和 `doctor` 不会打印 App Secret 或 token。

## 让 AI 写文档

先预览会生成多少块，再真正创建。默认使用用户身份，文档创建在你的云空间：

```powershell
node src/main.ts docs create --title "项目周报" --file .\周报.md --dry-run
node src/main.ts docs create --title "项目周报" --file .\周报.md
```

`周报.md` 里现在识别这几种写法：

```markdown
# 一级标题
## 二级标题
### 三级标题

普通段落
```

继续往同一篇文档末尾写，或把正文读回来：

```powershell
node src/main.ts docs append --document <document_id> --file .\补充.md
node src/main.ts docs read --document <document_id>
```

`--document` 可以是文档 ID，也可以是包含 `/docx/<document_id>` 的链接。

中文正文优先放在 UTF-8 文件里用 `--file` 传入。Windows PowerShell 的管道编码不稳定，不适合作为长文入口。短句可以用 `--content "一段话"`。

如果配置了网页根地址，返回结果里会带 `url`：

```powershell
node src/main.ts config init --app-id cli_xxx --web-base-url https://你的昆仑网页域名 --app-secret-stdin
```

未配置时结果里只有 `document_id`。应用身份创建文档时加 `--as bot`；这种文档属于应用，不一定出现在你的「我的空间」。

## 直接调用接口

还没有快捷命令的能力，用 `api` 先打通：

```powershell
node src/main.ts api GET /open-apis/authen/v1/user_info
node src/main.ts api POST /open-apis/docx/v1/documents --data "{\"title\":\"草稿\"}" --dry-run
```

路径必须是开放平台相对路径，客户端只会把它发到配置中的 `open_base_url`。

## 测试

```powershell
npm test
```
