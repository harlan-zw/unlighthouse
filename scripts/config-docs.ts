import { z } from 'zod'
import { configSchema } from '../src/config.ts'

interface JsonSchema {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  additionalProperties?: JsonSchema | boolean
  propertyNames?: JsonSchema
  items?: JsonSchema
  enum?: unknown[]
  anyOf?: JsonSchema[]
  format?: string
  default?: unknown
  description?: string
  minimum?: number
  maximum?: number
}

function typeOf(schema: JsonSchema): string {
  if (schema.enum)
    return schema.enum.map(value => JSON.stringify(value)).join(' \\| ')
  if (schema.anyOf)
    return schema.anyOf.map(typeOf).join(' \\| ')
  if (schema.type === 'array') {
    const item = schema.items ? typeOf(schema.items) : 'unknown'
    return item.includes('|') ? `(${item})[]` : `${item}[]`
  }
  if (schema.type === 'object' && schema.additionalProperties && typeof schema.additionalProperties === 'object')
    return `Record<${schema.propertyNames ? typeOf(schema.propertyNames) : 'string'}, ${typeOf(schema.additionalProperties)}>`
  if (schema.type === 'object')
    return 'object'
  if (schema.type === 'string' && schema.format === 'uri')
    return 'URL'
  if (schema.type === 'integer') {
    const maximum = schema.maximum === Number.MAX_SAFE_INTEGER ? undefined : schema.maximum
    const range = schema.minimum !== undefined && maximum !== undefined ? ` ${schema.minimum}–${maximum}` : schema.minimum !== undefined ? ` ≥ ${schema.minimum}` : ''
    return `integer${range}`
  }
  if (schema.type === 'number' && schema.minimum !== undefined && schema.maximum !== undefined)
    return `number ${schema.minimum}–${schema.maximum}`
  return Array.isArray(schema.type) ? schema.type.join(' \\| ') : schema.type ?? 'unknown'
}

function cell(text: string): string {
  return text.replace(/\n/g, ' ')
}

function rows(schema: JsonSchema, prefix: string): string[] {
  const out: string[] = []
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key
    const nested = child.type === 'object' && child.properties
    const fallback = child.default === undefined || nested ? '' : `\`${JSON.stringify(child.default)}\``
    out.push(`| \`${path}\` | ${nested ? 'object' : typeOf(child)} | ${fallback} | ${cell(child.description ?? '')} |`)
    if (nested)
      out.push(...rows(child, path))
  }
  return out
}

const schema = z.toJSONSchema(configSchema, { io: 'input', unrepresentable: 'any' }) as JsonSchema
console.log(['| Key | Type | Default | Description |', '|---|---|---|---|', ...rows(schema, '')].join('\n'))
