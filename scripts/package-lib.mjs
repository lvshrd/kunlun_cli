import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const projectRoot = fileURLToPath(new URL("../", import.meta.url))
export const manifest = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"))

export function runNpm(args, options = {}) {
  const npmCli = process.env.npm_execpath
  if (!npmCli) throw new Error("请通过 npm run package 或 npm run test:package 执行")
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} 失败：\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}

function validateFiles(packed) {
  const names = packed.files.map((file) => file.path)
  for (const required of ["dist/main.js", "dist/domain/docs/template.js", "README.md", "skills/kunlun-doc/SKILL.md", "skills/kunlun-shared/SKILL.md"]) {
    assert.ok(names.includes(required), `安装包缺少 ${required}`)
  }
  for (const name of names) {
    const allowed = name === "package.json" || name === "README.md" || /^dist\/.+\.js$/.test(name)
      || /^skills\/.+\.md$/.test(name)
    assert.ok(allowed, `安装包包含未允许的文件：${name}`)
    assert.ok(!name.includes(".test.") && !/(^|\/)(app-secret|user-session\.json|bot-token\.json|config\.json)$/.test(name), `安装包混入测试或凭证：${name}`)
    assert.ok(!name.endsWith("/bundled.js"), "统一包不能含旧内置凭证模块")
  }
}

export function packProject(destination) {
  runNpm(["run", "build"])
  const [preview] = JSON.parse(runNpm(["pack", "--dry-run", "--json", "--ignore-scripts"]))
  validateFiles(preview)
  const stage = mkdtempSync(path.join(tmpdir(), "kunlun-pack-stage-"))
  try {
    for (const { path: relative } of preview.files) {
      const target = path.join(stage, relative)
      mkdirSync(path.dirname(target), { recursive: true })
      copyFileSync(path.join(projectRoot, relative), target)
    }
    const stagedManifest = JSON.parse(readFileSync(path.join(stage, "package.json"), "utf8"))
    delete stagedManifest.scripts
    delete stagedManifest.devDependencies
    delete stagedManifest.kunlunDistribution
    writeFileSync(path.join(stage, "package.json"), JSON.stringify(stagedManifest, null, 2) + "\n", "utf8")
    const [packed] = JSON.parse(runNpm(["pack", "--json", "--ignore-scripts", "--pack-destination", stage], { cwd: stage }))
    validateFiles(packed)
    const original = path.join(stage, packed.filename)
    const filename = packed.filename
    const result = path.join(destination, filename)
    copyFileSync(original, result)
    return { ...packed, filename, path: result }
  } finally {
    assert.ok(path.resolve(stage).startsWith(path.resolve(tmpdir()) + path.sep))
    rmSync(stage, { recursive: true, force: true })
  }
}
