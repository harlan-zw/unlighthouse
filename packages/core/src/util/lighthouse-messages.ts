export interface LighthouseProcessMessage {
  type: 'success' | 'error' | 'info'
  route: string
  message?: string
  error?: {
    name: string
    message: string
    stack?: string
    code?: string
  }
  data?: any
}

export function parseStructuredOutput(output: string): {
  messages: LighthouseProcessMessage[]
  otherOutput: string[]
} {
  const lines = output.split('\n')
  const messages: LighthouseProcessMessage[] = []
  const otherOutput: string[] = []

  for (const line of lines) {
    const messageMatch = line.match(/__LIGHTHOUSE_MESSAGE__(.+?)__END_MESSAGE__/)
    if (messageMatch) {
      try {
        const message = JSON.parse(messageMatch[1]) as LighthouseProcessMessage
        messages.push(message)
      }
      catch {
        otherOutput.push(line)
      }
    }
    else if (line.trim()) {
      otherOutput.push(line)
    }
  }

  return { messages, otherOutput }
}

export function isRetryableError(errorMessage: string): boolean {
  const lowerMessage = errorMessage.toLowerCase()
  return lowerMessage.includes('timeout')
    || lowerMessage.includes('network')
    || errorMessage.includes('ECONNREFUSED')
    || errorMessage.includes('ERR_NETWORK')
}
