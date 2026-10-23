# 部门同事：用 AI 操作自己的昆仑文档

使用统一的 `kunlun-cli-0.1.0.tgz`。安装包不包含部门凭证；应用配置只需做一次，日常任务直接对 Agent 说。

## 首次接入

准备 Node.js 22.18+（推荐已验证的 24），连接办公网络，在安装包目录执行：

```powershell
npm install -g .\kunlun-cli-0.1.0.tgz --offline --ignore-scripts --no-audit --no-fund
kunlun.cmd config init
```

向维护者领取批准使用的应用资料。在终端按提示输入 App ID 和 Secret，Secret 不回显。不要将 Secret 发到 Agent 对话中。维护者需将你加入“小惠”可用范围，并使用户身份权限 docx:document 生效。

在实际使用的 Cursor 项目目录中安装 Skill，然后重开 Agent 对话：

```powershell
kunlun.cmd skills install --dir .cursor/skills
```

其他支持 SKILL.md 的 Agent 使用它支持的技能目录；Agent 需具备本机终端工具并能执行 kunlun。

## 日常直接说需求

> 使用 kunlun-doc，帮我登录“小惠”。然后把下面的巡检流程整理成操作文档，创建到我的昆仑智联云空间，读回核对并给我文档 ID 和可用 URL。

Agent 会引导本人浏览器授权；你负责确认账号并同意。以后可以说：

- 读取这篇文档，帮我总结注意事项：〈docx 链接〉。
- 给这篇文档末尾补充今天的变更说明：〈内容〉。
- 把这篇文档中的“每周检查一次”改成“每天检查一次”，先给我看预览。

没有目标文档时，提供链接或 ID。当前支持三级标题与普通段落，已有文本修改须唯一匹配；搜索、删除、移动、重命名、截图和复杂表格尚未实现。若未配置文档网页根地址，结果可能只有 ID，没有 URL。

这是本机 Agent 调用 CLI，不是在昆仑“小惠”聊天窗口发指令。网络失败后先让 Agent 读回核对，不要盲目重复创建或追加。文档以本人身份访问，分享权限仍需单独设置。

## 更新与报障

同一安装包供所有人使用，更新程序保留本机配置。不同工作目录默认共用 `~/.kunlun-cli`。退出使用 `kunlun.cmd auth logout`；卸载程序不会清除全部凭证或云端文档。

反馈版本、发生时间和脱敏错误即可，不发送密钥或 token。应用配置问题联系维护者，权限错误可让 Agent 引导重新授权。
