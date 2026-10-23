import { cpSync, existsSync, mkdirSync, lstatSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CliError } from "../../errors.ts"
import { printOk } from "../../output/envelope.ts"
import { boolFlag, strFlag } from "../args.ts"
import type { Invocation, Route } from "../route.ts"

const names = ["kunlun-shared", "kunlun-doc"]

export function installSkills(directory: string, force = false, dryRun = false): string[] {
  const root = path.resolve(directory)
  const source = fileURLToPath(new URL("../../../.cursor/skills/", import.meta.url))
  const destinations = names.map((name) => path.join(root, name))
  for (const destination of destinations) {
    if (existsSync(destination) && (lstatSync(destination).isSymbolicLink() || !force)) {
      throw new CliError("usage", "目标 Skill 已存在，未覆盖", "确认需要更新时使用 --force；符号链接目标不支持覆盖")
    }
  }
  if (!dryRun) {
    mkdirSync(root, { recursive: true })
    for (const name of names) cpSync(path.join(source, name), path.join(root, name), { recursive: true, force, errorOnExist: !force })
  }
  return destinations
}

export function skillsRoutes(): Route[] {
  return [{ path: ["skills", "install"], summary: "将自然语言文档 Skill 安装到 Agent 的技能目录（--dir）", run: install }]
}

async function install(invocation: Invocation): Promise<void> {
  if (invocation.rest.length) throw new CliError("usage", "skills install 不接受位置参数")
  const directory = strFlag(invocation.flags, "dir")
  if (!directory) throw new CliError("usage", "缺少 --dir", "例如 kunlun skills install --dir .cursor/skills")
  const dryRun = boolFlag(invocation.flags, "dry-run")
  printOk({ dry_run: dryRun, directories: installSkills(directory, boolFlag(invocation.flags, "force"), dryRun), next: "重新打开 Agent 对话，要求使用 kunlun-doc 操作本人文档" })
}
