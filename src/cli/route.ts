export interface Flags {
  [name: string]: string | boolean
}

export interface Invocation {
  flags: Flags
  rest: string[]
}

export interface Route {
  path: string[]
  summary: string
  run: (invocation: Invocation) => Promise<void>
}
