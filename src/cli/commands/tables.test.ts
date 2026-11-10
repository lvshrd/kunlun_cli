import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { run } from "../program.ts"

async function capture(args: string[]) {
  const original = process.stdout.write
  const chunks: string[] = []
  process.stdout.write = ((chunk: string | Uint8Array) => { chunks.push(String(chunk)); return true }) as typeof process.stdout.write
  try { return { code: await run(args), payload: () => JSON.parse(chunks.join("")) } }
  finally { process.stdout.write = original }
}

test("table CLI validates before loading credentials and previews are completely offline", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kunlun-table-cli-"))
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase().startsWith("KUNLUN_")))
  const originalFetch = globalThis.fetch
  try {
    for (const key of Object.keys(env)) delete process.env[key]
    process.env.KUNLUN_CONFIG_DIR = dir
    globalThis.fetch = async () => { throw new Error("No network during input validation or preview") }
    const sheets = ["sheets", "write", "--spreadsheet", "sht1", "--range", "sheet1!A1:B1"]
    const base = ["bitable", "records", "create", "--app", "base1", "--table", "tbl1"]
    for (const args of [
      [...sheets, "--json", '{"values":[["Task",1]]}', "--dry-run"],
      [...base, "--json", '{"fields":{"Task":"Plan"}}', "--dry-run"],
      ["bitable", "fields", "update", "--app", "base1", "--table", "tbl1", "--field", "fld1", "--json", '{"field_name":"Task","type":1}', "--dry-run"],
    ]) {
      const result = await capture(args)
      assert.equal(result.code, 0)
      assert.equal(result.payload().data.dry_run, true)
      assert.equal(result.payload().data.identity, "user")
    }
    for (const args of [
      [...sheets, "--json", '{"values":[[1]]}'],
      [...sheets, "--json", '{"values":[[1,2]],"extra":1}'],
      [...sheets, "--json", '{"values":[[1,2]]}', "--file", "unused.json"],
      [...sheets, "--json", '{"values":[[1,2]]}', "--force"],
      [...base, "--json", '{"fields":{}}'],
      [...base, "--json", '{"fields":{"Task":"Plan"}}', "--client-token", "invalid"],
      [...base, "--json", '{"fields":{"Task":"Plan"}}', "--client-token="],
      ["bitable", "tables", "--app", "base1", "--all", "--page-token", "later"],
      ["bitable", "tables", "--app", "base1", "--page-size", "101"],
      ["bitable", "records", "search", "--app", "base1", "--table", "tbl1", "--json", '{"unknown":1}'],
    ]) {
      const result = await capture(args)
      assert.equal(result.code, 1, args.join(" "))
      assert.equal(result.payload().error.type, "usage", args.join(" "))
    }
    const url = await capture(["sheets", "read", "--spreadsheet", "https://example.com/docx/dox1", "--range", "sheet1!A1"])
    assert.equal(url.payload().error.type, "unsupported")
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ appId: "cli_test" }))
    writeFileSync(path.join(dir, "app-secret"), "mock-secret")
    writeFileSync(path.join(dir, "user-session.json"), JSON.stringify({ accessToken: "mock-token", scope: "docx:document drive:drive:readonly", expiresAt: Date.now() + 3600000 }))
    const denied = await capture([...base, "--json", '{"fields":{"Task":"Plan"}}'])
    assert.equal(denied.code, 1)
    assert.equal(denied.payload().error.type, "auth")
    assert.deepEqual(denied.payload().data.required_any_scope, ["bitable:app"])
    assert.doesNotMatch(JSON.stringify(denied.payload()), /mock-token|mock-secret/)

    const requests: string[] = []
    globalThis.fetch = async (input, init) => {
      assert.equal(init?.method, "GET")
      const url = new URL(String(input))
      assert.equal(url.origin, "https://open.fklzl.cnpc.com.cn")
      requests.push(url.pathname)
      return Response.json({ data: url.pathname.endsWith("/sheets/sheet1") ? { sheet: { resource_type: "sheet" } } : { valueRange: { range: "sheet1!A1:A1", values: [["Read"]] } } })
    }
    const read = await capture(["sheets", "read", "--spreadsheet", "sht1", "--range", "sheet1!A1"])
    assert.equal(read.code, 0)
    assert.equal(read.payload().data.complete, true)
    assert.equal(requests.length, 2)
  } finally {
    globalThis.fetch = originalFetch
    for (const key of Object.keys(process.env)) if (key.toUpperCase().startsWith("KUNLUN_")) delete process.env[key]
    Object.assign(process.env, env)
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep))
    rmSync(dir, { recursive: true, force: true })
  }
})
