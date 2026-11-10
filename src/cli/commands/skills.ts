import { cpSync, existsSync, mkdirSync, lstatSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CliError } from "../../errors.ts"
import { printOk } from "../../output/envelope.ts"
import { boolFlag, strFlag } from "../args.ts"
import type { Invocation, Route } from "../route.ts"

const names = ["kunlun-shared", "kunlun-doc", "kunlun-tables"]

export function installSkills(directory: string, force = false, dryRun = false): string[] {
  const root = path.resolve(directory)
  const source = fileURLToPath(new URL("../../../skills/", import.meta.url))
  const destinations = names.map((name) => path.join(root, name))
  for (const destination of destinations) {
    if (existsSync(destination) && (lstatSync(destination).isSymbolicLink() || !force)) {
      throw new CliError("usage", "The destination skill already exists; it was not overwritten", "Use --force to update existing skills; symbolic link destinations cannot be overwritten")
    }
  }
  if (!dryRun) {
    mkdirSync(root, { recursive: true })
    for (const name of names) cpSync(path.join(source, name), path.join(root, name), { recursive: true, force, errorOnExist: !force })
  }
  return destinations
}

export function skillsRoutes(): Route[] {
  return [{ path: ["skills", "install"], summary: "Install document and table skills into the agent skill directory (--dir)", run: install }]
}

async function install(invocation: Invocation): Promise<void> {
  if (invocation.rest.length) throw new CliError("usage", "skills install does not accept positional arguments")
  const directory = strFlag(invocation.flags, "dir")
  if (!directory) throw new CliError("usage", "Missing --dir", "For example: kunlun-cli skills install --dir .cursor/skills")
  const dryRun = boolFlag(invocation.flags, "dry-run")
  printOk({ dry_run: dryRun, directories: installSkills(directory, boolFlag(invocation.flags, "force"), dryRun), next: "Start a new agent conversation; use kunlun-doc for documents or kunlun-tables for spreadsheets and Base" })
}
