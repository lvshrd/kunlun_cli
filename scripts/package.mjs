import { createHash } from "node:crypto"
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { packProject, projectRoot } from "./package-lib.mjs"

if (process.argv.length > 2) throw new Error("仅提供统一发行包，运行 npm run package")
const release = path.join(projectRoot, "release")
mkdirSync(release, { recursive: true })
const packed = packProject(release)
const sha256 = createHash("sha256").update(readFileSync(packed.path)).digest("hex")
writeFileSync(`${packed.path}.sha256`, `${sha256}  ${packed.filename}\n`, "utf8")
copyFileSync(path.join(projectRoot, "README.md"), path.join(release, "使用说明.md"))
for (const name of ["install.ps1", "install.cmd"]) copyFileSync(path.join(projectRoot, "scripts", name), path.join(release, name))
writeFileSync(path.join(release, "release.json"), JSON.stringify({ package: packed.filename, sha256 }, null, 2) + "\n", "utf8")
console.log(JSON.stringify({ package: packed.path, credentials_embedded: false, sha256, size_bytes: packed.size, file_count: packed.files.length, installer: path.join(release, "install.cmd"), guide: path.join(release, "使用说明.md") }, null, 2))
