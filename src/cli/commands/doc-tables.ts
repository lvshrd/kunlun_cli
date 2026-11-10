import { getBotToken } from "../../auth/tenant.ts"
import { getUserToken } from "../../auth/user.ts"
import type { OpenApi } from "../../client/http.ts"
import { createTable, nativeWriteValues, planTable, readNativeTable, writeNativeTable, type TableKind } from "../../domain/docs/tables.ts"
import { identifier, resourceToken } from "../../domain/table-common.ts"
import { CliError } from "../../errors.ts"
import { isRecord } from "../../json.ts"
import { printOk } from "../../output/envelope.ts"
import { requireApp } from "../../runtime.ts"
import { boolFlag, strFlag } from "../args.ts"
import { readBody } from "../content.ts"
import type { Invocation, Route } from "../route.ts"
import { identityOf } from "./api.ts"

const inputFlags = ["json", "file", "stdin"]
function required(i: Invocation, key: string) {
  const value = strFlag(i.flags, key)
  if (!value) throw new CliError("usage", `Missing --${key}`)
  return value
}
function input(i: Invocation, optional = false): unknown {
  const present = inputFlags.some(key => i.flags[key] !== undefined && i.flags[key] !== false)
  if (!present && optional) return undefined
  const raw = readBody({ ...i.flags, content: i.flags.json })
  let parsed: unknown
  try { parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) } catch { throw new CliError("usage", "Provide valid JSON with --file, --json or --stdin") }
  if (!isRecord(parsed) || Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, "values")) throw new CliError("usage", "Table input must contain only a values matrix")
  return parsed.values
}
function validate(i: Invocation, allowed: string[]) {
  if (i.rest.length) throw new CliError("usage", "docs tables commands do not accept positional arguments")
  for (const [key, value] of Object.entries(i.flags)) {
    if (!["document", "as", ...allowed].includes(key)) throw new CliError("usage", `Unsupported option: --${key}`)
    if (typeof value !== (["stdin", "dry-run"].includes(key) ? "boolean" : "string")) throw new CliError("usage", `Invalid option type: --${key}`)
    if (typeof value === "string" && !value.trim()) throw new CliError("usage", `--${key} must not be empty`)
  }
  identityOf(i)
}
async function execute(i: Invocation, dryRun: boolean, fn: (api: OpenApi, token: string) => Promise<unknown>) {
  const identity = identityOf(i)
  if (dryRun) {
    const api: OpenApi = { async call() { throw new Error("Unexpected network access in preview") } }
    printOk({ identity, ...await fn(api, "") as object })
    return
  }
  const app = requireApp()
  const token = identity === "bot" ? await getBotToken(app.dir, app.client, app.config.appId, app.secret) : await getUserToken(app.dir, app.client, app.config, app.secret)
  printOk({ identity, ...await fn(app.client, token) as object })
}

export function docTableRoutes(): Route[] {
  return [
    { path: ["docs", "tables", "create"], summary: "Create and embed a table; --document <ID-or-docx-URL> --type <native|sheet|bitable> [--title <heading>] [--rows 2 --columns 2] [--file <native-values.json>] [--client-token <UUIDv4>] [--dry-run]", run: async i => {
      validate(i, ["type", "title", "rows", "columns", "client-token", "dry-run", ...inputFlags])
      const document = resourceToken(required(i, "document"), "docx")
      const options = {
        type: required(i, "type") as TableKind, title: strFlag(i.flags, "title"),
        rows: i.flags.rows === undefined ? undefined : Number(required(i, "rows")), columns: i.flags.columns === undefined ? undefined : Number(required(i, "columns")),
        values: input(i, true), clientToken: strFlag(i.flags, "client-token"), dryRun: boolFlag(i.flags, "dry-run"),
      }
      planTable(options)
      await execute(i, options.dryRun, (api, token) => createTable(api, token, document, options))
    } },
    { path: ["docs", "tables", "read"], summary: "Read plain native DocX cells; --document <ID-or-docx-URL> --table <block-id>; embedded resources use sheets/bitable", run: async i => {
      validate(i, ["table"])
      const document = resourceToken(required(i, "document"), "docx"), table = identifier(required(i, "table"), "table block ID")
      await execute(i, false, (api, token) => readNativeTable(api, token, document, table))
    } },
    { path: ["docs", "tables", "write"], summary: "Replace plain native cell text; --document <ID-or-docx-URL> --table <block-id> (--file <values.json> | --json <JSON> | --stdin) [--revision <N>] [--dry-run]", run: async i => {
      validate(i, ["table", "revision", "dry-run", ...inputFlags])
      const document = resourceToken(required(i, "document"), "docx"), table = identifier(required(i, "table"), "table block ID"), values = nativeWriteValues(input(i))
      const revision = i.flags.revision === undefined ? undefined : Number(required(i, "revision"))
      if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) throw new CliError("usage", "--revision must be a nonnegative integer")
      const dryRun = boolFlag(i.flags, "dry-run")
      await execute(i, dryRun, (api, token) => writeNativeTable(api, token, document, table, values, { dryRun, revision }))
    } },
  ]
}
