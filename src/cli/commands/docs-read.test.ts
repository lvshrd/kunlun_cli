import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { run } from "../program.ts"

test("真实 CLI 读取输出完整性与原始块；异常分页以非零退出并保留部分结果", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kunlun-read-"))
  const originalEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase().startsWith("KUNLUN_")))
  const originalFetch = globalThis.fetch
  const originalWrite = process.stdout.write
  try {
    for (const key of Object.keys(originalEnv)) delete process.env[key]
    process.env.KUNLUN_CONFIG_DIR = dir
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ appId: "read-test" }))
    writeFileSync(path.join(dir, "app-secret"), "mock-only-secret")
    writeFileSync(path.join(dir, "user-session.json"), JSON.stringify({ accessToken: "mock-only-token", expiresAt: Date.now() + 3_600_000 }))
    for (const mode of ["normal", "raw", "incomplete"]) {
      const items = [{ block_id: "table", block_type: 31, table: {} }]
      globalThis.fetch = async (input, init) => {
        assert.equal(init?.method, "GET")
        const url = new URL(String(input))
        assert.equal(url.origin, "https://open.fklzl.cnpc.com.cn")
        if (!url.pathname.endsWith("/blocks")) return Response.json({ data: { document: { revision_id: 9 } } })
        assert.equal(url.searchParams.get("document_revision_id"), "9")
        return Response.json({ data: { items, has_more: mode === "incomplete" } })
      }
      const chunks: string[] = []
      process.stdout.write = ((chunk: string | Uint8Array) => {
        chunks.push(String(chunk)); return true
      }) as typeof process.stdout.write
      const code = await run(["docs", "read", "--document", "dox-test", ...(mode === "raw" ? ["--raw"] : [])])
      const payload = JSON.parse(chunks.join(""))
      assert.equal(code, mode === "incomplete" ? 1 : 0)
      assert.equal(payload.ok, mode !== "incomplete")
      assert.equal(payload.data.block_count, 1)
      assert.equal("blockCount" in payload.data, false)
      assert.equal(payload.data.complete, false)
      assert.equal(payload.data.pagination_complete, mode !== "incomplete")
      assert.equal(payload.data.content_complete, false)
      assert.equal(payload.data.document_id, "dox-test")
      assert.equal(payload.data.diagnostics[0].reason, "unsupported_block")
      if (mode === "raw") assert.deepEqual(payload.data.raw_blocks, items)
      else assert.equal("raw_blocks" in payload.data, false)
      if (mode === "incomplete") assert.equal(payload.error.type, "incomplete")
      assert.doesNotMatch(chunks.join(""), /mock-only-token|mock-only-secret/)
    }
  } finally {
    process.stdout.write = originalWrite
    globalThis.fetch = originalFetch
    for (const key of Object.keys(process.env)) if (key.toUpperCase().startsWith("KUNLUN_")) delete process.env[key]
    Object.assign(process.env, originalEnv)
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep))
    rmSync(dir, { recursive: true, force: true })
  }
})
