import { okrScope } from "../../auth/scopes.ts"
import { loadUserSession } from "../../auth/session.ts"
import { getBotToken } from "../../auth/tenant.ts"
import { getUserToken } from "../../auth/user.ts"
import { listOwnOkrs, listPeriods, validateOkrPage } from "../../domain/okr/service.ts"
import { getProgress, okrId, prepareProgress, writeProgress, type ProgressTarget } from "../../domain/okr/progress.ts"
import { pagination } from "../../domain/table-common.ts"
import { CliError } from "../../errors.ts"
import { printOk } from "../../output/envelope.ts"
import { requireApp, type AppContext } from "../../runtime.ts"
import { boolFlag, strFlag } from "../args.ts"
import { readBody } from "../content.ts"
import type { Invocation, Route } from "../route.ts"

export function okrRoutes(): Route[] {
  return [
    { path: ["okr", "periods"], summary: "List OKR periods using application identity; --as bot [--all | --page-token <cursor>] [--page-size <N>]", run: periods },
    { path: ["okr", "list"], summary: "List your OKRs, objectives, key results and progress IDs; [--all | --offset <N>] [--limit <1-10>]", run: list },
    { path: ["okr", "progress", "read"], summary: "Read an OKR progress record; --progress <ID>", run: readProgress },
    { path: ["okr", "progress", "create"], summary: "Create and verify progress on an existing O or KR; --target <ID> --target-type <objective|key-result> --source-title <text> --source-url <URL> (--content <text> | --file <path> | --stdin) [--dry-run]", run: createProgress },
    { path: ["okr", "progress", "update"], summary: "Update and verify progress text; --progress <ID> (--content <text> | --file <path> | --stdin) [--dry-run]", run: updateProgress },
  ]
}

function validate(invocation: Invocation, allowed: string[]) {
  if (invocation.rest.length) throw new CliError("usage", "OKR commands do not accept positional arguments")
  for (const [key, value] of Object.entries(invocation.flags)) {
    if (!allowed.includes(key)) throw new CliError("usage", `Unsupported option: --${key}`)
    const isSwitch = key === "all" || key === "stdin" || key === "dry-run"
    if (isSwitch ? typeof value !== "boolean" : typeof value !== "string" || !value.trim()) {
      throw new CliError("usage", `Invalid value for --${key}`)
    }
  }
}

function required(invocation: Invocation, name: string) {
  const value = strFlag(invocation.flags, name)
  if (!value) throw new CliError("usage", `Missing --${name}`)
  return value
}

function numberFlag(invocation: Invocation, name: string) {
  const value = strFlag(invocation.flags, name)
  if (value === undefined) return undefined
  if (!/^\d+$/.test(value)) throw new CliError("usage", `--${name} must be a nonnegative integer`)
  return Number(value)
}

async function userIdentity(app: AppContext) {
  const session = loadUserSession(app.dir)
  const granted = session?.scope?.split(/\s+/).filter(Boolean) ?? []
  if (!session?.accessToken || (granted.length && !granted.includes(okrScope))) {
    throw new CliError("auth", "The current user session lacks the permissions for this OKR command", "Confirm the application has okr:okr, then run kunlun-cli auth login again.", {
      required_scope: okrScope,
    })
  }
  return { token: await getUserToken(app.dir, app.client, app.config, app.secret), userId: session.openId }
}

function ownUserId(userId: string) {
  if (!userId) throw new CliError("auth", "The current user session is missing its open ID", "Run auth login again with the same scopes and select your Kunlun account.")
  return userId
}

async function periods(invocation: Invocation) {
  validate(invocation, ["as", "all", "page-size", "page-token"])
  if (required(invocation, "as") !== "bot") throw new CliError("usage", "OKR period listing requires --as bot for application identity")
  const options = {
    pageSize: numberFlag(invocation, "page-size") ?? 10,
    pageToken: strFlag(invocation.flags, "page-token"),
    all: boolFlag(invocation.flags, "all"),
  }
  pagination(options, 100)
  const app = requireApp()
  const token = await getBotToken(app.dir, app.client, app.config.appId, app.secret)
  printOk({ identity: "bot", ...await listPeriods(app.client, token, options) })
}

async function list(invocation: Invocation) {
  validate(invocation, ["all", "offset", "limit"])
  const options = validateOkrPage({ offset: numberFlag(invocation, "offset"), limit: numberFlag(invocation, "limit"), all: boolFlag(invocation.flags, "all") })
  const app = requireApp()
  const { token, userId } = await userIdentity(app)
  printOk({ identity: "user", ...await listOwnOkrs(app.client, token, ownUserId(userId), options) })
}

async function readProgress(invocation: Invocation) {
  validate(invocation, ["progress"])
  const id = okrId(required(invocation, "progress"), "progress ID")
  const app = requireApp()
  const { token } = await userIdentity(app)
  printOk({ identity: "user", ...await getProgress(app.client, token, id) })
}

const writeFlags = ["content", "file", "stdin", "dry-run"]

async function createProgress(invocation: Invocation) {
  validate(invocation, [...writeFlags, "target", "target-type", "source-title", "source-url"])
  await submitProgress(invocation, {
    action: "create", targetId: required(invocation, "target"), targetType: required(invocation, "target-type"),
    sourceTitle: required(invocation, "source-title"), sourceUrl: required(invocation, "source-url"),
  })
}

async function updateProgress(invocation: Invocation) {
  validate(invocation, [...writeFlags, "progress"])
  await submitProgress(invocation, { action: "update", progressId: required(invocation, "progress") })
}

async function submitProgress(invocation: Invocation, target: ProgressTarget) {
  const plan = prepareProgress(target, readBody(invocation.flags))
  if (boolFlag(invocation.flags, "dry-run")) {
    printOk({ identity: "user", action: plan.action, ...plan.location, text: plan.text, dry_run: true, required_scope: okrScope })
    return
  }
  const app = requireApp()
  const { token } = await userIdentity(app)
  printOk({ identity: "user", ...await writeProgress(app.client, token, plan) })
}
