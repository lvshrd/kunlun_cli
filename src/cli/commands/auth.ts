import { CliError } from "../../errors.ts"
import { printOk } from "../../output/envelope.ts"
import { clearUserSession, loadUserSession, publicUser } from "../../auth/session.ts"
import { loginUser } from "../../auth/user.ts"
import { requireApp } from "../../runtime.ts"
import { strFlag } from "../args.ts"
import type { Invocation, Route } from "../route.ts"

export function authRoutes(): Route[] {
  return [
    { path: ["auth", "login"], summary: "用浏览器登录昆仑智联，获取用户身份", run: login },
    { path: ["auth", "status"], summary: "查看用户登录态，不显示 token", run: status },
    { path: ["auth", "logout"], summary: "清除本机用户登录态", run: logout },
  ]
}

async function login(invocation: Invocation): Promise<void> {
  if (invocation.rest.length > 0) throw new CliError("usage", "auth login 不接受额外参数")
  if (strFlag(invocation.flags, "scope")) {
    throw new CliError("usage", "昆仑智联的登录地址不支持 --scope", "直接运行 kunlun auth login。文档权限使用应用里已经开通的 docx:document。")
  }
  const app = requireApp()
  const session = await loginUser(app.dir, app.client, app.config, app.secret)
  printOk(publicUser(session))
}

async function status(invocation: Invocation): Promise<void> {
  if (invocation.rest.length > 0) throw new CliError("usage", "auth status 不接受额外参数")
  printOk(publicUser(loadUserSession(requireApp().dir)))
}

async function logout(invocation: Invocation): Promise<void> {
  if (invocation.rest.length > 0) throw new CliError("usage", "auth logout 不接受额外参数")
  const removed = clearUserSession(requireApp().dir)
  printOk({ logged_out: removed })
}
