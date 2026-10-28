import { CliError } from "../../errors.ts"
import { printOk } from "../../output/envelope.ts"
import { clearUserSession, loadUserSession, publicUser } from "../../auth/session.ts"
import { loginUser } from "../../auth/user.ts"
import { resolveUserScopes, supportedUserScopes } from "../../auth/scopes.ts"
import { version } from "../../version.ts"
import { requireApp } from "../../runtime.ts"
import { boolFlag } from "../args.ts"
import type { Invocation, Route } from "../route.ts"

export function authRoutes(): Route[] {
  return [
    { path: ["auth", "login"], summary: "浏览器登录，默认请求本版本固定权限；--scope 仅可选子集；--no-browser", run: login },
    { path: ["auth", "scopes"], summary: "查看本版本允许的用户授权权限（本地查询）", run: scopes },
    { path: ["auth", "status"], summary: "查看用户登录态，不显示 token", run: status },
    { path: ["auth", "logout"], summary: "清除本机用户登录态", run: logout },
  ]
}

async function login(invocation: Invocation): Promise<void> {
  validateInvocation(invocation, "login", ["scope", "no-browser"])
  // 必须在加载凭证、监听回调或打开浏览器前拒绝非法权限。
  const scope = resolveUserScopes(invocation.flags.scope as string | undefined).join(" ")
  const app = requireApp()
  const session = await loginUser(app.dir, app.client, app.config, app.secret, {
    openBrowser: !boolFlag(invocation.flags, "no-browser"),
    scope,
  })
  printOk(publicUser(session))
}

async function status(invocation: Invocation): Promise<void> {
  validateInvocation(invocation, "status")
  printOk(publicUser(loadUserSession(requireApp().dir)))
}

async function logout(invocation: Invocation): Promise<void> {
  validateInvocation(invocation, "logout")
  const removed = clearUserSession(requireApp().dir)
  printOk({ logged_out: removed })
}

async function scopes(invocation: Invocation): Promise<void> {
  validateInvocation(invocation, "scopes")
  printOk({ version, source: "release", default_scopes: supportedUserScopes, allowed_scopes: supportedUserScopes })
}

function validateInvocation(invocation: Invocation, command: string, allowed: string[] = []): void {
  if (invocation.rest.length > 0) throw new CliError("usage", `auth ${command} 不接受额外参数`)
  const unknown = Object.keys(invocation.flags).filter((name) => !allowed.includes(name))
  if (unknown.length > 0) {
    throw new CliError("usage", `auth ${command} 不支持参数：${unknown.map((name) => `--${name}`).join("、")}`, "运行 kunlun auth --help 查看用法。", {
      reason: "unsupported_flags", unsupported_flags: unknown,
    })
  }
}
