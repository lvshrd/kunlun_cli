import { CliError } from "../errors.ts"

// 随 CLI release 维护；新增项必须先在“小惠”后台生效并完成用户授权验证。
export const supportedUserScopes: readonly string[] = Object.freeze([
  "docx:document",
  "drive:drive.metadata:readonly",
  "drive:drive:readonly",
  "space:document:retrieve",
])

export function resolveUserScopes(raw?: string): string[] {
  if (raw === undefined) return [...supportedUserScopes]
  const scopes = [...new Set(raw.trim().split(/\s+/).filter(Boolean))]
  if (scopes.length === 0) {
    throw new CliError("usage", "--scope 不能为空", "直接运行 kunlun-cli auth login 使用本版本固定权限。", {
      reason: "empty_scope",
      allowed_scopes: supportedUserScopes,
    })
  }
  const unsupported = scopes.filter((scope) => !supportedUserScopes.includes(scope))
  if (unsupported.length > 0) {
    throw new CliError("usage", "请求包含本版本不支持的 scope，未启动授权", "运行 kunlun-cli auth scopes 查看允许范围；新增权限由维护者验证并发布新版，不要自行追加或重试未知 scope。", {
      reason: "unsupported_scope",
      unsupported_scopes: unsupported,
      allowed_scopes: supportedUserScopes,
    })
  }
  return scopes
}
