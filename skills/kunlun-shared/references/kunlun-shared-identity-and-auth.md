# 身份、应用配置与授权

默认文档身份是 user；bot 代表应用，不用于替代本人空间访问。

## 应用来源

配置优先级：环境变量 > 本机文件 > 昆仑端点默认值。安装包不含任何默认 App ID、Secret 或用户登录态。用 `kunlun-cli config show` 查看 App ID 和 secret_source，不展示实际 Secret。

- 本人终端执行 `kunlun-cli config init`，输入 App ID，隐藏输入 Secret。
- 脚本使用 `config init --app-id ... --app-secret-stdin`；不使用 --app-secret 参数。
- 更换应用时清除本机旧用户 / bot session；有多个应用时用独立配置目录。

每个系统用户默认使用 `~/.kunlun-cli`；需要多应用隔离时使用 `KUNLUN_CONFIG_DIR`。

## 本人授权

```powershell
kunlun-cli auth scopes
kunlun-cli auth login
kunlun-cli auth status
```

默认登录使用版本固定权限，准确清单以 `auth scopes` 为准；该命令不读取凭证或查询后台。0.2.3 清单包括 docx:document、drive:drive.metadata:readonly、drive:drive:readonly、space:document:retrieve、sheets:spreadsheet、bitable:app。权限在清单中不等于应用后台已开通、当前账号已授权或业务接口已验收。

旧 `--scope "docx:document"` 用法仍可用，但只能选择版本清单内的非空子集。多个值用空格分隔；空值、未知项、通配符、重复参数和拼错参数直接报错，不进入授权等待。不要自动编辑源码或本地安装包来绕过限制；新增权限由维护者验证后发布新版。

登录后确认本人及实际返回的 scope；不要将 `auth scopes` 清单当成用户已经授予的权限。后台开通新权限、升级 CLI、刷新旧 token 均不等于用户已同意，新增权限需要重新登录授权。

`99991679`：根据 CLI 提示判断是否属于本版本支持范围；支持项可在确认后台生效后重新登录，仍失败则停止重试并联系维护者，不照抄上游 scope。`20027`：维护者检查用户身份权限是否已开通生效；账号不能使用应用时检查可用范围。`doctor` 只提供连通性及登录概况，不是文档写入验收。

当前回调等待上限为 180 秒；授权页面报错且未回调时 CLI 无法立即感知。授权失败时保留诊断，解决原因后再重试，不连续重复发起登录。

`--no-browser` 只跳过自动打开浏览器，回调仍必须到运行 CLI 的电脑。复制完整 URL，不能在 & 处截断。

仅换工作目录不会切换配置。隔离账号或应用使用 KUNLUN_CONFIG_DIR；并行试用不同程序版本时另隔离 npm prefix。Agent 必须继承所选环境和 PATH。Secret 和 token 当前保存在本机文件中，隐藏输入不代表落盘加密；排障使用脱敏命令，不打印凭证文件。
