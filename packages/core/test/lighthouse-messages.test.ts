import { describe, expect, it } from 'vitest'
import { isRetryableError, parseStructuredOutput } from '../src/util/lighthouse-messages'

// Test the lighthouse message parsing functionality
describe('lighthouse message parsing', () => {
  describe('message format validation', () => {
    it('should parse valid success message', () => {
      const output = '__LIGHTHOUSE_MESSAGE__{"type":"success","route":"/test","message":"Audit completed","data":{"score":0.85,"jsonPath":"/path/to/report.json"}}__END_MESSAGE__'

      const { messages, otherOutput } = parseStructuredOutput(output)

      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        type: 'success',
        route: '/test',
        message: 'Audit completed',
        data: {
          score: 0.85,
          jsonPath: '/path/to/report.json',
        },
      })
      expect(otherOutput).toHaveLength(0)
    })

    it('should parse valid error message', () => {
      const output = '__LIGHTHOUSE_MESSAGE__{"type":"error","route":"/test","message":"Audit failed","error":{"name":"LighthouseError","message":"Page timeout","code":"TIMEOUT"}}__END_MESSAGE__'

      const { messages, otherOutput } = parseStructuredOutput(output)

      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        type: 'error',
        route: '/test',
        message: 'Audit failed',
        error: {
          name: 'LighthouseError',
          message: 'Page timeout',
          code: 'TIMEOUT',
        },
      })
    })

    it('should parse valid info message', () => {
      const output = '__LIGHTHOUSE_MESSAGE__{"type":"info","route":"/test","message":"Starting lighthouse audit"}__END_MESSAGE__'

      const { messages, otherOutput } = parseStructuredOutput(output)

      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        type: 'info',
        route: '/test',
        message: 'Starting lighthouse audit',
      })
    })

    it('should handle multiple messages in output', () => {
      const output = `
Some debug output
__LIGHTHOUSE_MESSAGE__{"type":"info","route":"/test","message":"Starting audit"}__END_MESSAGE__
Regular lighthouse output
__LIGHTHOUSE_MESSAGE__{"type":"success","route":"/test","message":"Completed"}__END_MESSAGE__
Final output line
      `.trim()

      const { messages, otherOutput } = parseStructuredOutput(output)

      expect(messages).toHaveLength(2)
      expect(messages[0].type).toBe('info')
      expect(messages[1].type).toBe('success')
      expect(otherOutput).toHaveLength(3)
      expect(otherOutput).toContain('Some debug output')
      expect(otherOutput).toContain('Regular lighthouse output')
      expect(otherOutput).toContain('Final output line')
    })

    it('should handle malformed JSON messages', () => {
      const output = `
Valid line
__LIGHTHOUSE_MESSAGE__{"invalid":json}__END_MESSAGE__
Another valid line
__LIGHTHOUSE_MESSAGE__{"type":"info","route":"/test","message":"Valid message"}__END_MESSAGE__
      `.trim()

      const { messages, otherOutput } = parseStructuredOutput(output)

      expect(messages).toHaveLength(1)
      expect(messages[0].type).toBe('info')
      expect(otherOutput).toHaveLength(3)
      expect(otherOutput).toContain('__LIGHTHOUSE_MESSAGE__{"invalid":json}__END_MESSAGE__')
    })

    it('should handle empty output', () => {
      const { messages, otherOutput } = parseStructuredOutput('')

      expect(messages).toHaveLength(0)
      expect(otherOutput).toHaveLength(0)
    })

    it('should handle output with no structured messages', () => {
      const output = `
Regular output line 1
Some error output
Debug information
      `.trim()

      const { messages, otherOutput } = parseStructuredOutput(output)

      expect(messages).toHaveLength(0)
      expect(otherOutput).toHaveLength(3)
    })
  })

  describe('error categorization', () => {
    it('should identify retryable errors', () => {
      const retryableErrors = [
        'Connection timeout',
        'Network error occurred',
        'ECONNREFUSED: Connection refused',
        'ERR_NETWORK_CHANGED',
      ]

      retryableErrors.forEach((errorMessage) => {
        expect(isRetryableError(errorMessage)).toBe(true)
      })
    })

    it('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        'Invalid configuration',
        'Page not found',
        'Syntax error in script',
        'Out of memory',
      ]

      nonRetryableErrors.forEach((errorMessage) => {
        expect(isRetryableError(errorMessage)).toBe(false)
      })
    })
  })

  describe('performance data extraction', () => {
    it('should extract performance score from success message', () => {
      const output = '__LIGHTHOUSE_MESSAGE__{"type":"success","route":"/test","data":{"score":0.95}}__END_MESSAGE__'

      const { messages } = parseStructuredOutput(output)
      const successMessage = messages.find(m => m.type === 'success')

      expect(successMessage?.data?.score).toBe(0.95)
    })

    it('should handle missing performance score', () => {
      const output = '__LIGHTHOUSE_MESSAGE__{"type":"success","route":"/test","data":{"jsonPath":"/path"}}__END_MESSAGE__'

      const { messages } = parseStructuredOutput(output)
      const successMessage = messages.find(m => m.type === 'success')

      expect(successMessage?.data?.score).toBeUndefined()
    })
  })

  describe('error detail extraction', () => {
    it('should extract complete error information', () => {
      const errorData = {
        type: 'error',
        route: '/test',
        message: 'Lighthouse audit failed',
        error: {
          name: 'ConfigParseError',
          message: 'Invalid lighthouse configuration',
          stack: 'Error: Invalid config\n  at parse...',
          code: 'INVALID_CONFIG',
        },
      }

      const output = `__LIGHTHOUSE_MESSAGE__${JSON.stringify(errorData)}__END_MESSAGE__`
      const { messages } = parseStructuredOutput(output)

      expect(messages[0]).toMatchObject(errorData)
      expect(messages[0].error?.name).toBe('ConfigParseError')
      expect(messages[0].error?.stack).toContain('Error: Invalid config')
    })

    it('should handle minimal error information', () => {
      const errorData = {
        type: 'error',
        route: '/test',
        message: 'Unknown error',
        error: {
          name: 'UnknownError',
          message: 'Something went wrong',
        },
      }

      const output = `__LIGHTHOUSE_MESSAGE__${JSON.stringify(errorData)}__END_MESSAGE__`
      const { messages } = parseStructuredOutput(output)

      expect(messages[0]).toMatchObject(errorData)
      expect(messages[0].error?.stack).toBeUndefined()
      expect(messages[0].error?.code).toBeUndefined()
    })
  })
})
