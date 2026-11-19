import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { saveUserSession } from "../../auth/session.ts"
import { defaultConfig, saveConfig, saveSecret } from "../../config/store.ts"
import { run } from "../program.ts"

test("standalone OKR progress commands preview offline and create, read and update with the OKR scope", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kunlun-okr-test-"))
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase().startsWith("KUNLUN_")))
  const fetch = globalThis.fetch
  const stdout = process.stdout.write
  const target = "7222222222222222222"
  const progress = "7333333333333333333"
  const source = "https://docs.example.com/example"
  const textFile = path.join(dir, "进展.txt")
  const create = ["okr", "progress", "create", "--target", target, "--target-type", "key-result", "--source-title", "联调样例", "--source-url", source, "--file", textFile]
  const read = ["okr", "progress", "read", "--progress", progress]
  const update = ["okr", "progress", "update", "--progress", progress, "--content", "联调完成"]
  const calls: { method: string; path: string; body: unknown }[] = []
  let content: unknown
  let writes = 0

  function login(scope: string) {
    saveUserSession(dir, { accessToken: "test-user-token", refreshToken: "", openId: "ou_test", name: "", scope, expiresAt: Date.now() + 3_600_000, refreshExpiresAt: 0 })
  }

  async function invoke(args: string[]) {
    let out = ""
    process.stdout.write = ((chunk: string | Uint8Array) => { out += String(chunk); return true }) as typeof process.stdout.write
    try { return { code: await run(args), payload: JSON.parse(out) } }
    finally { process.stdout.write = stdout }
  }

  try {
    for (const key of Object.keys(env)) delete process.env[key]
    process.env.KUNLUN_CONFIG_DIR = dir
    writeFileSync(textFile, "准备完成\r\n开始联调", "utf8")
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input))
      assert.equal(url.origin, "https://open.example.com")
      assert.equal(url.searchParams.get("user_id_type"), "open_id")
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-user-token")
      const method = init?.method ?? "GET"
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ method, path: url.pathname, body })
      if (method === "GET" && url.pathname === `/open-apis/okr/v1/progress_records/${progress}`) {
        return Response.json({ code: 0, data: { progress_id: progress, modify_time: String(writes), content } })
      }
      if ((method === "POST" && url.pathname === "/open-apis/okr/v1/progress_records") ||
          (method === "PUT" && url.pathname === `/open-apis/okr/v1/progress_records/${progress}`)) {
        content = body.content
        writes++
        return Response.json({ code: 0, data: { progress_id: progress } })
      }
      assert.fail(`Unexpected call: ${method} ${url.pathname}`)
    }

    const preview = await invoke([...create, "--dry-run"])
    assert.equal(preview.code, 0)
    assert.equal(preview.payload.data.dry_run, true)
    assert.equal(preview.payload.data.text, "准备完成\n开始联调")
    assert.equal(preview.payload.data.required_scope, "okr:okr")
    assert.equal(calls.length, 0)
    assert.equal((await invoke([...create, "--content", "冲突输入", "--dry-run"])).payload.error.type, "usage")

    saveConfig(dir, { ...defaultConfig, appId: "cli_test", openBaseUrl: "https://open.example.com" })
    saveSecret(dir, "test-secret")
    login("docx:document")
    for (const args of [["okr", "list", "--all"], read, create, update]) {
      const rejected = await invoke(args)
      assert.equal(rejected.payload.error.type, "auth")
      assert.equal(rejected.payload.data.required_scope, "okr:okr")
    }
    assert.equal(calls.length, 0)

    login("okr:okr")
    const created = await invoke(create)
    assert.equal(created.code, 0)
    assert.equal(created.payload.data.verified, true)
    assert.equal(created.payload.data.progress_id, progress)
    assert.deepEqual(calls[0]?.body, {
      source_title: "联调样例", source_url: source, target_id: target, target_type: 3,
      content: { blocks: ["准备完成", "开始联调"].map(text => ({ type: "paragraph", paragraph: { elements: [{ type: "textRun", textRun: { text } }] } })) },
    })
    assert.equal((await invoke(read)).payload.data.text, "准备完成\n开始联调")
    const edited = await invoke(update)
    assert.equal(edited.code, 0)
    assert.equal(edited.payload.data.verified, true)
    assert.equal((await invoke(read)).payload.data.text, "联调完成")
    assert.equal((await invoke(update)).payload.data.action, "unchanged")
    assert.equal(writes, 2)
  } finally {
    globalThis.fetch = fetch
    process.stdout.write = stdout
    for (const key of Object.keys(process.env)) if (key.toUpperCase().startsWith("KUNLUN_")) delete process.env[key]
    Object.assign(process.env, env)
    rmSync(dir, { recursive: true, force: true })
  }
})
