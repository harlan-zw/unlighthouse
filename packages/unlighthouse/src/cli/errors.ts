import consola from 'consola'

export class PrettyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name

    if (typeof Error.captureStackTrace === 'function')
      Error.captureStackTrace(this, this.constructor)

    else
      this.stack = new Error(message).stack
  }
}

export function handleError(error: unknown) {
  if (error instanceof PrettyError)
    consola.error(error.message)
  else
    consola.error(error)
  process.exit(1)
}
