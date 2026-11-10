import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const dist = path.resolve(root, "dist")
assert.equal(path.dirname(dist), path.resolve(root))
assert.equal(path.basename(dist), "dist")
if (existsSync(dist)) {
  assert.ok(!lstatSync(dist).isSymbolicLink(), "dist must not be a symbolic link")
  rmSync(dist, { recursive: true, force: true })
}
const built = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.build.json"], { cwd: root, stdio: "inherit", windowsHide: true })
if (built.error) throw built.error
process.exitCode = built.status ?? 1
