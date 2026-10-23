import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { installSkills } from "./skills.ts"

test("Agent Skill 支持预览，默认保留已有文件，显式更新才覆盖", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kunlun-skills-"))
  const target = path.join(dir, "技能")
  try {
    const destinations = installSkills(target, false, true)
    assert.equal(existsSync(target), false)
    installSkills(target)
    assert.match(readFileSync(path.join(destinations[1]!, "SKILL.md"), "utf8"), /kunlun-doc/)
    const file = path.join(destinations[0]!, "SKILL.md")
    writeFileSync(file, "local-customization")
    assert.throws(() => installSkills(target), /已存在/)
    assert.equal(readFileSync(file, "utf8"), "local-customization")
    installSkills(target, true)
    assert.match(readFileSync(file, "utf8"), /kunlun-shared/)
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep))
    rmSync(dir, { recursive: true, force: true })
  }
})
