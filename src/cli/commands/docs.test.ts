import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { saveUserSession } from "../../auth/session.ts"
import { defaultConfig, saveConfig, saveSecret } from "../../config/store.ts"
import { run } from "../program.ts"

const item = (token = "dox_1", title = "操作规程", type = "docx") => ({ docs_token: token, docs_type: type, title })
const searchResponse = (items: unknown[], more = false) => ({ code: 0, data: { docs_entities: items, has_more: more, total: more ? 60 : items.length } })

test("真实命令路由搜索候选并输出 ID、类型及已配置的昆仑链接", async () => {
  await withApp(async invoke => {
    const result = await invoke(["docs", "search", "--query", "操作规程"], [searchResponse([item(), item("doc_1", "旧规程", "doc")])])
    assert.equal(result.code, 0)
    assert.equal(result.payload.data.identity, "user")
    assert.equal(result.payload.data.items[0].document_id, "dox_1")
    assert.equal(result.payload.data.items[0].url, "https://docs.example.com/docx/dox_1")
    assert.equal(result.payload.data.items[1].document_id, undefined)
    assert.equal(result.requests.length, 1)
    assert.deepEqual(JSON.parse(String(result.requests[0]?.init?.body)), { search_key: "操作规程", count: 20, offset: 0, docs_types: ["doc"] })
  })
})

test("按完整名称读取先搜索再用找到的 ID 读取，保留原有 ID 读取入口", async () => {
  await withApp(async invoke => {
    const blocks = { code: 0, data: { items: [{ text: { elements: [{ text_run: { content: "规程正文" } }] } }], has_more: false } }
    const named = await invoke(["docs", "read", "--name", "操作规程"], [searchResponse([item()]), blocks])
    assert.equal(named.code, 0)
    assert.equal(named.payload.data.markdown, "规程正文")
    assert.equal(named.payload.data.located_by, "name")
    assert.equal(named.requests[1]?.url.pathname, "/open-apis/docx/v1/documents/dox_1/blocks")
    const byId = await invoke(["docs", "read", "--document", "dox_1"], [blocks])
    assert.equal(byId.code, 0)
    assert.equal(byId.requests.length, 1)
    assert.equal(byId.payload.data.located_by, undefined)
  })
})

test("候选不唯一、未取全或旧版 doc 时输出候选且不读取正文", async () => {
  await withApp(async invoke => {
    for (const [response, expected] of [
      [searchResponse([item(), item("dox_2")]), "ambiguous"],
      [searchResponse([item()], true), "incomplete"],
      [searchResponse([item("doc_1", "操作规程", "doc")]), "unsupported"],
      [searchResponse([]), "not_found"],
    ] as const) {
      const result = await invoke(["docs", "read", "--name", "操作规程"], [response])
      assert.equal(result.code, 1)
      assert.equal(result.payload.error.type, expected)
      assert.ok(Array.isArray(result.payload.data.items))
      assert.equal(result.requests.length, 1)
    }
  })
})

test("搜索参数错误、互斥目标和 bot 身份在网络前拒绝", async () => {
  await withApp(async invoke => {
    for (const args of [
      ["search"], ["search", "--query", " "], ["search", "--query", "规程", "--limt", "10"],
      ["search", "--query", "规程", "--offset", "150", "--limit", "50"],
      ["search", "--query", "规程", "--limit="], ["search", "--query", "规程", "--as", "bot"],
      ["read", "--name", "规程", "--as", "bot"], ["read", "--name", "规程", "--document", "dox_1"],
      ["read", "--name", "规程", "--dry-run"], ["read", "--nmae", "规程"],
    ]) {
      const result = await invoke(["docs", ...args], [])
      assert.equal(result.code, 1, args.join(" "))
      assert.equal(result.payload.error.type, "usage")
      assert.equal(result.requests.length, 0)
    }
  })
})

test("搜索上游权限错误保留诊断，不回退 bot、不自动重新登录", async () => {
  await withApp(async invoke => {
    const result = await invoke(["docs", "search", "--query", "规程"], [{ code: 99991679, msg: "permission denied", error: {
      permission_violations: [{ subject: "drive:drive:readonly", type: "action_privilege_required" }],
    } }])
    assert.equal(result.code, 1)
    assert.equal(result.payload.error.type, "api")
    assert.match(result.payload.error.hint, /固定权限/)
    assert.equal(result.requests.length, 1)
    assert.doesNotMatch(JSON.stringify(result.payload), /test-user-token|test-secret/)
  })
})

interface InvocationResult {
  code: number
  payload: any
  requests: Array<{ url: URL; init?: RequestInit }>
}

async function withApp(body: (invoke: (args: string[], responses: unknown[]) => Promise<InvocationResult>) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "kunlun-search-test-"))
  const originalEnv = { ...process.env }
  const originalFetch = globalThis.fetch
  const originalWrite = process.stdout.write
  try {
    for (const key of Object.keys(process.env)) if (key.toUpperCase().startsWith("KUNLUN_")) delete process.env[key]
    process.env.KUNLUN_CONFIG_DIR = dir
    saveConfig(dir, { ...defaultConfig, appId: "cli_test", openBaseUrl: "https://open.example.com", webBaseUrl: "https://docs.example.com" })
    saveSecret(dir, "test-secret")
    saveUserSession(dir, { accessToken: "test-user-token", refreshToken: "", expiresAt: Date.now() + 3_600_000, refreshExpiresAt: 0, openId: "ou_test", name: "test", scope: "drive:drive:readonly" })
    await body(async (args, responses) => {
      const requests: InvocationResult["requests"] = []
      globalThis.fetch = async (url, init) => {
        requests.push({ url: new URL(String(url)), init })
        assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-user-token")
        assert.ok(requests.length <= responses.length, "不应请求额外接口")
        return new Response(JSON.stringify(responses[requests.length - 1]), { status: 200 })
      }
      const chunks: string[] = []
      process.stdout.write = ((chunk: string | Uint8Array) => { chunks.push(Buffer.from(chunk).toString("utf8")); return true }) as typeof process.stdout.write
      try {
        const code = await run(args)
        return { code, payload: JSON.parse(chunks.join("")), requests }
      } finally { process.stdout.write = originalWrite }
    })
  } finally {
    globalThis.fetch = originalFetch
    process.stdout.write = originalWrite
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
    Object.assign(process.env, originalEnv)
    rmSync(dir, { recursive: true, force: true })
  }
}
