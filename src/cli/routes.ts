import { printOk } from "../output/envelope.ts"
import { version } from "../version.ts"
import { apiRoutes } from "./commands/api.ts"
import { authRoutes } from "./commands/auth.ts"
import { configRoutes } from "./commands/config.ts"
import { doctorRoutes } from "./commands/doctor.ts"
import { docsRoutes } from "./commands/docs.ts"
import { skillsRoutes } from "./commands/skills.ts"
import { tableRoutes } from "./commands/tables.ts"
import type { Route } from "./route.ts"
import { CliError } from "../errors.ts"

export function allRoutes(): Route[] {
  return [
    ...configRoutes(),
    ...authRoutes(),
    ...doctorRoutes(),
    ...apiRoutes(),
    ...docsRoutes(),
    ...tableRoutes(),
    ...skillsRoutes(),
    {
      path: ["version"],
      summary: "Show the version",
      run: async (invocation) => {
        if (invocation.rest.length || Object.keys(invocation.flags).length) throw new CliError("usage", "version does not accept additional arguments", "Run kunlun-cli -v or kunlun-cli --version to view the version")
        printOk({ version })
      },
    },
  ]
}
