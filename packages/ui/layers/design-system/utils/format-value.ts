import { CalendarDate } from '@internationalized/date'
import {
  differenceInDays,
  differenceInMinutes,
  format as formatDateFn,
  formatDistanceToNow,
  isValid,
  parse,
  parseISO,
} from 'date-fns'
import { titleCase } from 'scule'

// ---------------------------------------------------------------------------------------------------------------------
// public functions
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Kitchen-sink formatting function
 *
 * Supports complex formatting via simple, single, auto-completing string format:
 *
 * - format:arg1,arg2 [suffix]
 *
 * Functionality:
 *
 * - supports percent, number, currency, date, time and datetime formats
 * - types have optional preset suffixes, i.e. `percent:2' or 'date:month'
 * - number and date types supports custom formatting, i.e. `number:0,0.00000` or `date:Do MMM`
 * - supports suffixes via format `[placeholder], i.e. `number:short,2 [BTC]`
 * - supports multiple date values, i.e. timestamp, ISO string, short-date, or Date object
 * - supports nullish values with English placeholders
 *
 * @usage
 *
 *  formatValue(value, 'currency')
 *  formatValue(value, 'percent:2')
 *  formatValue(value, 'number:short,2 [BTC]')
 *  formatValue(value, 'date:Do MMM')
 *  formatValue('no format')
 *  formatValue(null)
 *
 * @see https://github.com/forged-com/forgd/blob/dev/docs/ui/formatting.md
 * @see https://github.com/forged-com/forgd/pull/1815
 * @see https://github.com/forged-com/forgd/pull/2254
 *
 * @param input     A number or string value (will be parsed)
 * @param fmt       A FormatType preset
 */
export function formatValue(input: Value, fmt?: ValueFormat): string {
  // empty string
  if (input === '') {
    return ''
  }

  // undefined
  if (input === undefined) {
    return '...'
  }

  // null
  if (input === null) {
    return 'N/A'
  }

  // NaN
  if (Number.isNaN(input)) {
    // dev guard: a NaN input means the caller mishandled types, surface in console rather than persist
    console.warn('[formatValue] received NaN')
    return 'NaN'
  }

  // no format
  if (!fmt) {
    return String(input)
  }

  // parse format
  const parts = parseValueFormat(fmt)
  if (!parts) {
    return String(input)
  }

  // TODO return final fmt with function
  const { type, rest, suffix } = parts
  fmt = rest ? (`${type}:${rest}` as ValueFormat) : (type as ValueFormat)

  // format
  let output = String(input)
  switch (type) {
    case 'boolean':
      if (typeof input === 'boolean') {
        output = formatters.boolean(input, fmt as BooleanFormat)
      }
      break

    case 'percent':
      if (typeof input === 'number' || typeof input === 'string') {
        output = formatters.percent(parseNumber(input), fmt as PercentFormat)
      }
      break

    case 'number':
      if (typeof input === 'number' || typeof input === 'string') {
        output = formatters.number(parseNumber(input), fmt as NumberFormat)
      }
      break

    case 'currency':
      if (typeof input === 'number' || typeof input === 'string') {
        output = formatters.currency(parseNumber(input), fmt as CurrencyFormat)
      }
      break

    case 'date':
      if (isDateTimeValue(input)) {
        output = formatters.date(input, fmt as DateFormat)
      }
      break

    case 'time':
      if (isDateTimeValue(input)) {
        output = formatters.time(input, fmt as TimeFormat)
      }
      break

    case 'datetime':
      if (isDateTimeValue(input)) {
        output = formatters.datetime(input, fmt as DateTimeFormat)
      }
      break

    case 'string':
      if (typeof input === 'string' || typeof input === 'number') {
        output = formatters.string(String(input), fmt as StringFormat)
      }
      break
  }

  // return with optional suffix
  return suffix ? `${output} ${suffix}` : output
}

/**
 * Helper function to return a curried version of formatValue()
 *
 * @usage
 *
 *  const formatShort = makeFormatter('number:short,3')
 *  const formatted = formatShort(1_000_000)
 */
export function makeFormatter(fmt: ValueFormat) {
  return function (value?: Value) {
    return formatValue(value, fmt)
  }
}

/**
 * Set locale specific to UiDateInput and `date:input` pattern
 *
 * Generally no need to use this; locale should be set automatically
 *
 * @param locale
 */
export function setDateLocale(locale: string) {
  dateSettings.locale = locale === 'en-US' ? 'en-US' : 'en-GB'
}

/**
 * Get date-specific settings
 */
export function getDateSettings() {
  const { locale, pattern } = dateSettings
  return { locale, pattern }
}

/**
 * Checks if the given input is a valid DateTimeValue.
 * @param input - The value to check.
 * @returns `true` if the input is a valid DateTimeValue, otherwise `false`
 */
function isDateTimeValue(input: unknown) {
  return (
    typeof input === 'number' || typeof input === 'string' || input instanceof Date || input instanceof CalendarDate
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------------------------------------------------
export type DateTimeValue = number | string | Date | CalendarDate

export type Value = undefined | null | boolean | number | string | DateTimeValue

export type ValueFormatType = 'boolean' | 'percent' | 'number' | 'currency' | 'datetime' | 'date' | 'time' | 'string'

export type BooleanFormat
  = | 'boolean' // Yes,No
    | `boolean:${string}` // Yep,Nope, Enabled,Disabled

export type PercentFormat
  = | 'percent' // 12%
    | 'percent:1' // 12.3%
    | 'percent:2' // 12.34%
    | 'percent:3' // 12.345%

export type NumberDecimalsFormat = '0' | '2' | '2,4' | 'short' | 'short,2' | 'short,3'

/**
 * `number:2` is 1.23, 1,234.56
 *
 * `number:2,4` is 1.23, 1.2345, 1,234.56
 *
 * `number:short` is 1M
 *
 * `number:short,2` is 1.23M
 *
 * `number:short,3` is 1.234M
 *
 * `number:${string}` is custom
 */
export type NumberFormat
  = | 'number' // 0.0₄12, 1.1234, 1,23.45, 12,345.67, 123.46K, 1.24M
    | `number ${string}` // custom
    | `number:${NumberDecimalsFormat}` // 1.234M
    | `number:${NumberDecimalsFormat} ${string}` // 1.234M

export type CurrencyFormat
  = | 'currency' // $0.0₄12, $1.1234, $1,23.45, $12,345.67, $123.46K, $1.24M
    | 'currency:0' // $1, $1,234
    | 'currency:2' // $1.23, $1,234.56
    | 'currency:2,4' // $1.23, $1.2345, $1,234.56
    | 'currency:short' // $1M
    | 'currency:short,2' // $1.23M
    | 'currency:short,3' // $1.234M

export type DateTimeFormat
  = | 'datetime' // 2024-08-16 20:00 GMT+1
    | 'datetime:day-hour' // Aug 16 20:00

export type DateFormat
  = | 'date' // Aug 16, 2024
    | 'date:day' // Aug 16
    | 'date:month' // Aug '24
    | 'date:iso' // 2024-08-16
    | 'date:input' // 16/08/2024
    | `date:${string}` // custom date-fns

export type TimeFormat
  = | 'time' // 12:34 PM
    | 'time:iso' // 12:34:56
    | `time:relative,${string}` // Just now | X minutes ago | X hour ago | X day ago | in X [value] | [date] when the date diff >= X [time:relative,X]

export type StringFormat
  = | 'string:title' // Title Case
    | `string:plural,${string}` // Pluralize based on input number. First arg is singular form, optional second arg is plural form. Examples: 'string:plural,day' -> '1 day'/'2 days', 'string:plural,child,children' -> '1 child'/'2 children'

export type ValueFormat
  = | PercentFormat
    | NumberFormat
    | CurrencyFormat
    | DateTimeFormat
    | DateFormat
    | TimeFormat
    | BooleanFormat
    | StringFormat

// ---------------------------------------------------------------------------------------------------------------------
// formatting functions dictionary
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Formatters dictionary
 *
 * @see tests/format-value.test.ts
 */
const formatters = {
  boolean(input: boolean, fmt: BooleanFormat): string {
    const [, options = 'Yes,No'] = fmt.split(':') // unused for now
    const [truthy = 'Yes', falsy = 'No'] = options.split(',')
    return input ? truthy : falsy
  },

  percent(input: number, fmt: PercentFormat): string {
    const [, precision = 0] = fmt.split(':')
    const formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: Number(precision),
      maximumFractionDigits: Number(precision),
      signDisplay: input < 0 ? 'exceptZero' : 'auto',
    })
    const output = formatter.format(input)
    return `${output}%`
  },

  number(input: number, fmt: NumberFormat): string {
    // arguments
    const { name, args } = parseFormat(fmt)

    // auto
    if (!name) {
      const num = Math.abs(input)
      if (num < 1) {
        return formatters.short(input, 3, 4)
      }
      if (num < 10) {
        return formatters.number(input, 'number:2,4')
      }
      if (num < 100_000) {
        return formatters.number(input, 'number:2')
      }
      return formatters.short(input, 2)
    }

    // short
    if (name === 'short') {
      return formatters.short(input, Number(args[0]) || (Math.abs(input) < 1 ? 3 : 0))
    }

    // numeric
    const formats = {
      'number:0': [0, 0],
      'number:2': [2, 2],
      'number:2,4': [2, 4],
    }
    const format = formats[fmt as keyof typeof formats]
    if (format) {
      const [minimumFractionDigits, maximumFractionDigits] = format
      const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits,
        maximumFractionDigits: maximumFractionDigits ?? minimumFractionDigits,
      })
      return formatter.format(input)
    }

    // anything else; stringify
    return String(input)
  },

  currency(input: number, inputFmt: CurrencyFormat): string {
    const fmt = inputFmt.replace('currency', 'number') as NumberFormat
    const value = formatters.number(input, fmt)
    return value.startsWith('-')
      ? `-$${value.slice(1)}` // move minus sign before denomination
      : `$${value}`
  },

  datetime(input: DateTimeValue, fmt: DateTimeFormat): string {
    const date = parseDate(input)
    if (!date) {
      return String(input)
    }
    const formats: Record<DateTimeFormat, string> = {
      'datetime': 'yyyy-MM-dd HH:mm O',
      'datetime:day-hour': 'MMM dd HH:mm',
    }
    return formatDateFn(date, formats[fmt]).replace('GMT+0', 'UTC')
  },

  date(input: DateTimeValue, fmt: DateFormat): string {
    const date = parseDate(input)
    if (!date) {
      return String(input)
    }
    const formats: Record<DateFormat, string> = {
      'date': 'MMM dd, yyyy',
      'date:day': 'MMM dd',
      'date:month': 'MMM \'\'yy', // '' is a single '
      'date:iso': 'yyyy-MM-dd',
      'date:input': dateSettings.pattern,
    }
    const { rest } = parseFormat(fmt)
    const format = formats[fmt] || rest
    if (format === 'since') {
      return formatDistanceToNow(date) // could add unit options `date:since,<unit>`
    }
    return formatDateFn(date, format || formats.date)
  },

  time(input: DateTimeValue, fmt: TimeFormat): string {
    const date = parseDate(input)
    if (!date) {
      return String(input)
    }

    const { name, args } = parseFormat(fmt)
    if (name === 'relative') {
      const diffMinutes = differenceInMinutes(new Date(), date)
      const diffDays = differenceInDays(new Date(), date)

      if (diffMinutes >= 0 && diffMinutes < 5) {
        return 'Just now'
      }

      if (diffDays >= Number(args[0])) {
        return this.date(date, 'date')
      }

      return formatDistanceToNow(date, { addSuffix: true })
    }
    const formats: Record<Extract<TimeFormat, 'time' | 'time:iso'>, string> = {
      'time': 'HH:mm',
      'time:iso': 'HH:mm:ss',
    }
    return formatDateFn(date, formats[fmt as keyof typeof formats])
  },

  /**
   * Format numbers using metric (large) or subscript (small) notation
   *
   * @param input         The value to format
   * @param precision     amount of significant digits to show in fractions
   * @param maxZeros      amount of zeros at which to subscript small numbers
   */
  short(input: number, precision = 2, maxZeros = 4): string {
    // for 0, just return 0
    if (input === 0) {
      return input.toString()
    }

    // otherwise
    const abs = Math.abs(input)
    const sign = input < 0 ? '-' : ''

    // subscript notation for tiny numbers e.g. Shiba Inu price
    if (abs > 0 && abs < 1) {
      // threshold for showing ordinals
      const threshold = 1 / 10 ** (maxZeros + 1)

      // calculate ordinals
      if (abs < threshold) {
        // variables
        const chars = '₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉'.split(' ')
        const str = stringifyNumber(input)
        const matches = str.match(/0\.(0+)([^0]\d*)/)

        // if we have multiple leading 0's, look to replace them
        if (matches) {
          const [, zeroes, digits] = matches as [`${number}`, `${number}`, `${number}`] // If matches is truthy, this is the RegExpMatchArray structure
          const subscript = String(zeroes?.length ?? 0).replace(/\w/g, c => chars[Number(c)] as string)
          return `${sign}0.0${subscript}${digits.slice(0, precision)}`
        }

        // otherwise, just show the number
        // note: we should never get here, just including it for safety
        return str.slice(0, precision + 2)
      }

      // otherwise, use international formatter
      // 👀 note that values outside the range of maximumFractionDigits will have
      // already been handled by subscript notation, above
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: precision,
        maximumFractionDigits: maxZeros + precision,
        maximumSignificantDigits: maxZeros + precision,
        roundingPriority: 'lessPrecision',
      }).format(input)
    }

    // shorthand notation for powers of 1000
    const options = [
      { suffix: 'Q', threshold: 1e15 },
      { suffix: 'T', threshold: 1e12 },
      { suffix: 'B', threshold: 1e9 },
      { suffix: 'M', threshold: 1e6 },
      { suffix: 'K', threshold: 1e3 },
      { suffix: ' ', threshold: 1 },
    ]
    const option = options.find(x => abs >= x.threshold)
    return option ? (input / option.threshold).toFixed(precision) + option.suffix : input.toFixed(precision)
  },

  string(input: string, fmt: StringFormat): string {
    const [, rest] = fmt.split(':')
    if (!rest)
      return input

    const [subtype, ...args] = rest.split(',')
    switch (subtype) {
      case 'title':
        return titleCase(input)
      case 'plural':
        if (args.length > 0) {
          const plural = new Intl.PluralRules('en-US', { type: 'cardinal' }).select(Number(input))
          return `${input} ${plural === 'one' ? args[0] : args[1] || `${args[0]}s`}`
        }
        return input
      default:
        return input
    }
  },
}

// export const formatPercent = formatters.percent
// export const formatNumber = formatters.number
// export const formatCurrency = formatters.currency
// export const formatDate = formatters.date
// export const formatTime = formatters.time
// export const formatDatetime = formatters.datetime
// export const formatShort = formatters.short

// ---------------------------------------------------------------------------------------------------------------------
// date helpers
// ---------------------------------------------------------------------------------------------------------------------

/**
 * We're now using a quasi-local date setup:
 *
 * - US: en-US
 * - Everyone else: en-GB
 *
 * This makes it simpler configure the date picker + communicate dates
 */
const dateSettings = {
  locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
  get pattern() {
    return this.locale === 'en-US' ? 'MM/dd/yyyy' : 'dd/MM/yyyy'
  },
}

/**
 * Parse date or date-like input to Date object
 *
 * Supports
 *  - timestamp
 *  - Date object
 *  - CalendarDate object
 *  - iso date
 *  - yyyy-MM-dd
 *  - yyyy-MM
 *
 * @param input
 */
export function parseDate(input: string | number | Date | CalendarDate | unknown) {
  // Date
  if (input instanceof Date) {
    return input
  }

  // CalendarDate
  if (input instanceof CalendarDate) {
    // input && typeof input === 'object' && ('year' in input) && ('month' in input) && ('day' in input)
    const { year, month, day } = input
    return parseDate(`${year}-${month}-${day}`)
  }

  // timestamp
  if (typeof input === 'number') {
    const date = new Date(input)
    return isValid(date) ? date : null
  }

  // string
  if (typeof input === 'string') {
    // full iso
    const isoDate = parseISO(input)
    if (isValid(isoDate)) {
      return isoDate
    }

    // date only
    const formats = ['yyyy-MM', 'yyyy-MM-dd']
    for (const format of formats) {
      const parsedDate = parse(input, format, new Date())
      if (isValid(parsedDate)) {
        return parsedDate
      }
    }
  }

  // otherwise null
  return null
}

// ---------------------------------------------------------------------------------------------------------------------
// number helpers
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Parse a numerical input which may include commas or underscores to a number
 *
 * @example
 *
 *    parseNumber('123_456.789') // 123456.789
 *    parseNumber('123,456.789') // 123456.789
 */
function parseNumber(input: string | number): number {
  return typeof input !== 'number' ? Number(String(input).replace(/[,_]/g, '')) : input
}

/**
 * Safely stringifies numbers with exponents (i.e. 0.123e-10) to string
 *
 * @example
 *
 *  // large numbers
 *  stringifyNumber(-1.23e24)    // '-1230000000000000000000000'
 *
 *  // small numbers
 *  stringifyNumber(0.123e-10)   // '0.0000000000123'
 *
 *  // negative small numbers
 *  stringifyNumber(-0.123e-10)  // '-0.0000000000123'
 *
 *  // numbers passed as strings
 *  stringifyNumber('0.123e-10') // '0.0000000000123'
 */
export function stringifyNumber(input: string | number): string {
  // variables
  const num = typeof input === 'string' ? Number.parseFloat(input) : input
  const str = num.toString()
  const sign = num < 0 ? '-' : ''

  // check for exponent
  if (!str.includes('e')) {
    return str
  }

  const [coeffRaw, expRaw] = str.split('e')
  if (coeffRaw === undefined || expRaw === undefined) {
    return str
  }

  const exponent = Number.parseInt(expRaw)
  const parsedCoeff = Number.parseFloat(coeffRaw).toString()
  const coeffParts = parsedCoeff.split('.')
  const digits = coeffParts.join('').replace('-', '')
  const decimalPos = coeffParts[0]?.length ?? 0

  if (exponent < 0) {
    const zeros = '0'.repeat(Math.abs(exponent) - 1)
    return `${sign}0.${zeros}${digits}`
  }

  const zeros = '0'.repeat(exponent - (digits.length - decimalPos))
  return `${sign}${digits}${zeros}`
}

// ---------------------------------------------------------------------------------------------------------------------
// internal
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Helper function to parse main, type, args and suffix from ValueFormat
 *
 * Note that the ValueFormat DSL uses commas to split arguments, so if you pass
 * a format with a comma, this function will incorrectly parse it.
 *
 * However, the function also returns a "rest" parameter which can be used in the
 * passing code to manually process (for example, to pass the entire "rest" value
 * to date-fns)
 *
 * @example using presets; use `args` ok
 *
 *    parseFormat('number:short,2')
 *    // { type: 'number', rest: 'short,2', name: 'short', args: [2] }
 *
 * @example using custom value; use `rest` as the comma breaks `args`
 *
 *    parseFormat('number:0,0.00a')
 *    // { type: 'number', rest: '0,0.00a', name: '0', args: ['0.00a'] }
 *
 * @example parsing the suffix
 *
 *    parseFormat('number:short,2 [BTC]')
 *    // { type: 'number', rest: 'short,2', name: 'short', args: [2] }
 */
function parseFormat(format: ValueFormat) {
  const matches = format.match(/(\w+):?(.*)/)
  if (matches) {
    const [, type, rest] = matches
    if (rest) {
      const [name, ...args] = rest.split(',')
      return {
        type,
        name,
        rest,
        args: args.filter(Boolean).map((arg) => {
          return /^\d/.test(arg) ? Number(arg) : arg
        }),
      }
    }
    return { type, name: rest || '', args: [] }
  }
  return {}
}

interface ParsedValueFormat {
  type: ValueFormatType | string
  name?: string
  rest?: string
  args?: Array<string | number>
  suffix?: string
}

/**
 * Parse value format + optional suffix into parts
 *
 * Given a ValueFormat and optional [SUFFIX], return individual parts as properties:
 *
 *     type   args[] suffix
 *    ┌─┴──┐ ┌──┴──┐  ┌┴┐
 *    number:short,2 [BTC]
 *           └──┬──┘
 *             rest
 */
export function parseValueFormat(fmt: ValueFormat): ParsedValueFormat | null {
  const suffixRegex = /\[(.+)\]$/ // Match suffix inside square brackets
  const noSuffix = fmt.replace(suffixRegex, '').trim() // Remove suffix from format
  const argsSeparatorIndex = noSuffix.indexOf(':') // Get index of colon that separates type from args

  // The format type (required)
  const type: ValueFormatType | string = argsSeparatorIndex === -1 ? noSuffix : noSuffix.slice(0, argsSeparatorIndex)

  if (!type) {
    return null
  }

  // The format (anything after colon) or empty string if not present
  const rest = argsSeparatorIndex === -1 ? '' : noSuffix.slice(argsSeparatorIndex + 1)

  // The suffix (inside square brackets) or empty string if not present
  const suffix = fmt.match(suffixRegex)?.[1] ?? ''

  // Split the format by commas, first segment is the name, the rest are args
  const [name, ...restArgs] = rest.split(',')

  // Parse the args as numbers or strings
  const args = restArgs.map((arg) => {
    const parsed = Number.parseFloat(arg)
    return Number.isNaN(parsed) ? arg.trim() : parsed
  })

  // Return the object
  return {
    type,
    name,
    rest,
    args,
    suffix,
  }
}
