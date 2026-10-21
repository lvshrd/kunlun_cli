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

test("用户缺少文档授权时给出补充授权命令，保留上游诊断信息", async () => {
  const upstream = {
    code: 99991679,
    msg: "required privileges under the user identity",
    error: { permission_violations: [
      { subject: "docx:document", type: "action_privilege_required" },
      { subject: "docx:document:readonly", type: "action_privilege_required" },
    ] },
  }
  const client = new KunlunClient("https://open.example.com", async () => new Response(JSON.stringify(upstream), { status: 400 }))
  await assert.rejects(
    () => client.call({ method: "GET", path: "/open-apis/docx/v1/documents/probe", token: "secret-token" }),
    (err: unknown) => {
      assert.ok(err instanceof CliError)
      assert.match(err.hint ?? "", /auth login --scope "docx:document"/)
      assert.match(err.hint ?? "", /用户身份权限/)
      assert.deepEqual(err.data, { http_status: 400, path: "/open-apis/docx/v1/documents/probe", upstream })
      assert.doesNotMatch(JSON.stringify(err), /secret-token/)
      return true
    },
  )
})

test("应用缺少权限与用户未授权给出不同提示", async () => {
  const client = new KunlunClient("https://open.example.com", async () => new Response(JSON.stringify({ code: 99991672, msg: "Access denied" })))
  await assert.rejects(
    () => client.call({ method: "GET", path: "/open-apis/docx/v1/documents/probe" }),
    (err: unknown) => err instanceof CliError && Boolean(err.hint?.includes("应用缺少接口权限")),
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
