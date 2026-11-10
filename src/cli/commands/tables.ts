import { CliError } from "../../errors.ts"
import { isRecord } from "../../json.ts"
import { printOk } from "../../output/envelope.ts"
import { requireApp } from "../../runtime.ts"
import { getUserToken } from "../../auth/user.ts"
import { getBotToken } from "../../auth/tenant.ts"
import { loadUserSession } from "../../auth/session.ts"
import type { OpenApi } from "../../client/http.ts"
import { identifier, pagination, resourceToken } from "../../domain/table-common.ts"
import * as sheets from "../../domain/sheets/service.ts"
import * as base from "../../domain/bitable/service.ts"
import { readBody } from "../content.ts"
import { boolFlag, strFlag } from "../args.ts"
import type { Invocation, Route } from "../route.ts"
import { identityOf } from "./api.ts"

const inputFlags = ["json", "file", "stdin"]
const pageFlags = ["page-size", "page-token", "all"]

function required(i: Invocation, key: string) {
  const value = strFlag(i.flags, key)
  if (!value) throw new CliError("usage", `Missing --${key}`)
  return value
}

function validate(i: Invocation, allowed: string[]) {
  if (i.rest.length) throw new CliError("usage", "Table commands do not accept positional arguments")
  for (const [key, value] of Object.entries(i.flags)) {
    if (!["as", ...allowed].includes(key)) throw new CliError("usage", `Unsupported option: --${key}`)
    if (typeof value !== (["stdin", "dry-run", "all"].includes(key) ? "boolean" : "string")) throw new CliError("usage", `Invalid option type: --${key}`)
    if (typeof value === "string" && !value.trim()) throw new CliError("usage", `--${key} must not be empty`)
  }
  identityOf(i)
}

function json(i: Invocation): Record<string, unknown> {
  const text = readBody({ ...i.flags, content: i.flags.json })
  let value: unknown
  try { value = JSON.parse(text.replace(/^\uFEFF/, "")) } catch { throw new CliError("usage", "Provide valid JSON using exactly one of --json, --file, or --stdin") }
  if (!isRecord(value)) throw new CliError("usage", "JSON input must be an object")
  return value
}

function only(value: Record<string, unknown>, key: string) {
  if (Object.keys(value).length !== 1 || !Object.hasOwn(value, key)) throw new CliError("usage", `JSON input must contain only ${key}`)
  return value[key]
}

function page(i: Invocation, max: number) {
  const options = { pageSize: i.flags["page-size"] === undefined ? undefined : Number(required(i, "page-size")), pageToken: strFlag(i.flags, "page-token"), all: boolFlag(i.flags, "all") }
  pagination(options, max)
  return options
}

async function execute(i: Invocation, dryRun: boolean, scopes: string[], run: (api: OpenApi, token: string) => Promise<unknown>) {
  const identity = identityOf(i)
  if (dryRun) {
    const offline: OpenApi = { call: async () => { throw new Error("Unexpected network access during preview") } }
    printOk({ identity, ...await run(offline, "") as object })
    return
  }
  const app = requireApp()
  if (identity === "user") {
    const granted = loadUserSession(app.dir)?.scope?.split(/\s+/)
    if (granted?.length && !scopes.some(scope => granted.includes(scope))) throw new CliError("auth", "The current user session lacks a required table scope", "The application permissions and your user authorization are separate. Run kunlun-cli auth login and approve the release scopes; refreshing the existing token does not expand them.", { required_any_scope: scopes })
  }
  const token = identity === "bot" ? await getBotToken(app.dir, app.client, app.config.appId, app.secret) : await getUserToken(app.dir, app.client, app.config, app.secret)
  printOk({ identity, ...await run(app.client, token) as object })
}

export function tableRoutes(): Route[] {
  const routes: Route[] = []
  for (const command of ["info", "sheets", "read", "write", "append", "clear"] as const) {
    const writing = command === "write" || command === "append"
    const mutating = writing || command === "clear"
    routes.push({ path: ["sheets", command], summary: `${command === "sheets" ? "List worksheets" : command === "info" ? "Read spreadsheet metadata" : command === "read" ? "Read a bounded A1 range" : command === "clear" ? "Clear cell contents and verify; preserve rows and columns" : command === "append" ? "Insert rows and verify by reading back" : "Overwrite cells and verify by reading back"}; --spreadsheet <token-or-URL>${["read", "write", "append", "clear"].includes(command) ? " --range <sheet-id!A1:B2>" : ""}${writing ? " (--file <values.json> | --json <JSON> | --stdin)" : ""}${mutating ? " [--dry-run]" : ""}`, run: async i => {
      validate(i, ["spreadsheet", ...(["read", "write", "append", "clear"].includes(command) ? ["range"] : []), ...(writing ? inputFlags : []), ...(mutating ? ["dry-run"] : [])])
      const token = resourceToken(required(i, "spreadsheet"), "sheets")
      const range = ["read", "write", "append", "clear"].includes(command) ? sheets.parseRange(required(i, "range")).range : ""
      const values = writing ? sheets.validateValues(only(json(i), "values")) : undefined
      if (writing) {
        const parsed = sheets.parseRange(range)
        if (values!.length > parsed.rows || values![0]!.length !== parsed.columns || (command === "write" && values!.length !== parsed.rows)) throw new CliError("usage", "Matrix dimensions must match the range; append permits fewer rows")
      }
      const dryRun = boolFlag(i.flags, "dry-run")
      await execute(i, dryRun, mutating ? ["sheets:spreadsheet", "drive:drive"] : ["sheets:spreadsheet", "sheets:spreadsheet:readonly", "drive:drive", "drive:drive:readonly"], (api, auth) => command === "info" ? sheets.spreadsheetInfo(api, auth, token) : command === "sheets" ? sheets.listSheets(api, auth, token) : command === "read" ? sheets.readRange(api, auth, token, range) : command === "clear" ? sheets.clearRange(api, auth, token, range, dryRun) : sheets.writeRange(api, auth, token, range, values, command, dryRun))
    } })
  }
  for (const command of ["info", "tables", "fields", "records"] as const) {
    const actions = command === "fields" ? ["list", "create", "update", "delete"] : command === "records" ? ["list", "search", "read", "create", "update", "delete"] : [""]
    for (const action of actions) {
      const writing = action === "create" || action === "update" || action === "delete"
      const hasInput = (writing && action !== "delete") || action === "search"
      const needsId = action === "update" || action === "read" || action === "delete"
      const paging = command === "tables" || action === "list" || action === "search"
      routes.push({ path: ["bitable", command, ...(action ? [action] : [])], summary: `${action === "delete" ? "Delete and verify" : writing ? "Write and verify" : "Read"} Base ${command}${action ? ` (${action})` : ""}; --app <token-or-base-URL>${["fields", "records"].includes(command) ? " --table <ID>" : ""}${needsId ? command === "fields" ? " --field <ID>" : " --record <ID>" : ""}${hasInput ? " (--file <input.json> | --json <JSON> | --stdin)" : ""}${writing ? " [--dry-run]" : ""}${paging ? " [--all | --page-token <cursor>] [--page-size <N>]" : ""}${command === "records" && action === "create" ? " [--client-token <UUIDv4>]" : ""}`, run: async i => {
        validate(i, ["app", ...(["fields", "records"].includes(command) ? ["table"] : []), ...(paging ? pageFlags : []), ...(needsId ? [command === "fields" ? "field" : "record"] : []), ...(hasInput ? inputFlags : []), ...(writing ? ["dry-run"] : []), ...(command === "records" && action === "create" ? ["client-token"] : [])])
        const app = resourceToken(required(i, "app"), "base")
        const table = ["fields", "records"].includes(command) ? identifier(required(i, "table"), "table ID") : ""
        const id = needsId ? identifier(required(i, command === "fields" ? "field" : "record"), "resource ID") : undefined
        const input = hasInput ? json(i) : {}
        const fields = hasInput && writing && command === "records" ? base.validateRecordFields(only(input, "fields")) : undefined
        if (hasInput && writing && command === "fields") base.validateField(input)
        if (action === "search") base.validateSearch(input)
        const clientToken = strFlag(i.flags, "client-token")
        if (clientToken) base.validateClientToken(clientToken)
        const pages = paging ? page(i, command === "records" ? 500 : 100) : {}
        const dryRun = boolFlag(i.flags, "dry-run")
        await execute(i, dryRun, writing ? ["bitable:app"] : ["bitable:app", "bitable:app:readonly"], (api, auth) => {
          if (command === "info") return base.baseInfo(api, auth, app)
          if (command === "tables") return base.listTables(api, auth, app, pages)
          if (action === "delete" && (command === "fields" || command === "records")) return base.deleteResource(api, auth, app, table, command, id!, dryRun)
          if (command === "fields") return writing ? base.writeField(api, auth, app, table, input, { fieldId: id, dryRun }) : base.listFields(api, auth, app, table, pages)
          if (writing) return base.writeRecord(api, auth, app, table, fields, { recordId: id, clientToken, dryRun })
          if (action === "read") return base.getRecord(api, auth, app, table, id!)
          return base.searchRecords(api, auth, app, table, input, pages)
        })
      } })
    }
  }
  return routes
}
