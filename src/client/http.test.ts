import assert from "node:assert/strict"
import test from "node:test"
import { CliError } from "../errors.ts"
import { KunlunClient } from "./http.ts"

test("业务错误码会变成 CLI 错误且不回传密钥", async () => {
  const client = new KunlunClient("https://open.example.com", async () => new Response(JSON.stringify({ code: 99991663, msg: "缺少权限" }), { status: 200 }))
  await assert.rejects(
    () => client.call({ method: "GET", path: "/open-apis/docx/v1/documents/dox", token: "secret-token" }),
    (err: unknown) => err instanceof CliError && err.message === "缺少权限",
  )
})

test("成功响应原样返回 JSON", async () => {
  const client = new KunlunClient("https://open.example.com", async (_url, init) => {
    assert.equal(init?.method, "POST")
    const headers = init?.headers as Record<string, string>
    assert.equal(headers.Authorization, "Bearer token")
    return new Response(JSON.stringify({ code: 0, data: { document: { document_id: "dox_1" } } }), { status: 200 })
  })
  const body = await client.call({ method: "POST", path: "/open-apis/docx/v1/documents", token: "token", body: { title: "周报" } })
  assert.equal((body as { data: { document: { document_id: string } } }).data.document.document_id, "dox_1")
})
