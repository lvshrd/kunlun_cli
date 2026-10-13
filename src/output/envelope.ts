import { CliError } from "../errors.ts"

export function printOk(data: unknown): void {
  write({ ok: true, data })
}

export function printErr(err: unknown): void {
  if (process.env.KUNLUN_DEBUG === "1" && err instanceof Error && err.stack) {
    console.error(err.stack)
  }
  if (err instanceof CliError) {
    const error: Record<string, unknown> = { type: err.type, message: err.message }
    if (err.hint) error.hint = err.hint
    const payload: Record<string, unknown> = { ok: false, error }
    if (err.data !== undefined) payload.data = err.data
    write(payload)
    return
  }
  const message = err instanceof Error ? err.message : String(err)
  write({ ok: false, error: { type: "internal", message } })
}

function write(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}
