import { CliError } from "../errors.ts"

// Release-managed allowlist. Table scopes match Kunlun's documented APIs;
// the maintainer confirmed enabling them in the application console on 2026-11-10.
export const supportedUserScopes: readonly string[] = Object.freeze([
  "docx:document",
  "drive:drive.metadata:readonly",
  "drive:drive:readonly",
  "space:document:retrieve",
  "sheets:spreadsheet",
  "bitable:app",
])

export function resolveUserScopes(raw?: string): string[] {
  if (raw === undefined) return [...supportedUserScopes]
  const scopes = [...new Set(raw.trim().split(/\s+/).filter(Boolean))]
  if (scopes.length === 0) {
    throw new CliError("usage", "--scope must not be empty", "Run kunlun-cli auth login to request the fixed release scopes.", {
      reason: "empty_scope",
      allowed_scopes: supportedUserScopes,
    })
  }
  const unsupported = scopes.filter((scope) => !supportedUserScopes.includes(scope))
  if (unsupported.length > 0) {
    throw new CliError("usage", "The request contains scopes not supported by this release; authorization was not started", "Run kunlun-cli auth scopes to view allowed scopes. New scopes require maintainer verification and a new release; do not add or retry unknown scopes.", {
      reason: "unsupported_scope",
      unsupported_scopes: unsupported,
      allowed_scopes: supportedUserScopes,
    })
  }
  return scopes
}
