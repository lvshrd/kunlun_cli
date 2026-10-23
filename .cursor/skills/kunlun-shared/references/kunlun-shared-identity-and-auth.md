# 身份、应用配置与授权

默认文档身份是 user；bot 代表应用，不用于替代本人空间访问。

## 应用来源

配置优先级：环境变量 > 本机文件 > 昆仑端点默认值。统一 0.1.0 包不含任何默认 App ID、Secret 或用户登录态。用 `kunlun config show` 查看 App ID 和 secret_source，不展示实际 Secret。

- 本人终端执行 `kunlun config init`，输入 App ID，隐藏输入 Secret。
- 脚本使用 `config init --app-id ... --app-secret-stdin`；不使用 --app-secret 参数。
- 更换应用时清除本机旧用户 / bot session；有多个应用时用独立配置目录。

每个系统用户默认使用 `~/.kunlun-cli`；需要多应用隔离时使用 `KUNLUN_CONFIG_DIR`。

## 本人授权

```powershell
kunlun auth login --scope "docx:document"
kunlun auth status
```

多个 scope 空格分隔，最多 50 个。登录后应为本人，scope 包含 docx:document。后台开通业务权限后仍需要用户同意，刷新旧 token 不自动扩大授权。

`99991679`：补充用户授权；`20027`：维护者检查用户身份权限是否已开通生效；账号不能使用应用时检查可用范围。`doctor` 只提供连通性及登录概况，不是文档写入验收。

`--no-browser` 只跳过自动打开浏览器，回调仍必须到运行 CLI 的电脑。复制完整 URL，不能在 & 处截断。

仅换工作目录不会切换配置。独立试用需同时隔离程序 prefix 和 KUNLUN_CONFIG_DIR；Agent 也必须继承对应环境。
