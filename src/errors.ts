export class CliError extends Error {
  readonly type: string
  readonly hint?: string
  readonly data?: unknown
  readonly exitCode: number

  constructor(type: string, message: string, hint?: string, data?: unknown, exitCode = 1) {
    super(message)
    this.name = "CliError"
    this.type = type
    this.hint = hint
    this.data = data
    this.exitCode = exitCode
  }
}
