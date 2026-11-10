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
    { path: ["auth", "login"], summary: "Log in with the fixed release scopes; --scope selects a subset; --no-browser skips opening the browser", run: login },
    { path: ["auth", "scopes"], summary: "List supported user scopes without network access", run: scopes },
    { path: ["auth", "status"], summary: "Show the user session without exposing tokens", run: status },
    { path: ["auth", "logout"], summary: "Clear the local user session", run: logout },
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
  if (invocation.rest.length > 0) throw new CliError("usage", `auth ${command} does not accept additional parameters`)
  const unknown = Object.keys(invocation.flags).filter((name) => !allowed.includes(name))
  if (unknown.length > 0) {
    throw new CliError("usage", `auth ${command} does not support options: ${unknown.map((name) => `--${name}`).join(", ")}`, "Run kunlun-cli auth --help to view usage.", {
      reason: "unsupported_flags", unsupported_flags: unknown,
    })
  }
}
