import type { BoxOpts } from 'consola/utils'
import { colorize, box as makeBox, stripAnsi } from 'consola/utils'

export const maxCharsPerLine = () => (process.stdout.columns || 100) * 80 / 100

export function indent(count: number, chr = ' ') {
  return chr.repeat(count)
}

export function indentLines(string: string, spaces: number, firstLineSpaces: number) {
  const lines = Array.isArray(string) ? string : string.split('\n')
  let s = ''
  if (lines.length) {
    const i0 = indent(firstLineSpaces === undefined ? spaces : firstLineSpaces)
    s = i0 + lines.shift()
  }
  if (lines.length) {
    const i = indent(spaces)
    s += `\n${lines.map(l => i + l).join('\n')}`
  }
  return s
}

function wrapLine(line: string, width: number): string {
  const words = line.split(' ')
  const out: string[] = []
  let current = ''
  let currentLen = 0
  for (const word of words) {
    const visibleLen = stripAnsi(word).length
    if (!current) {
      current = word
      currentLen = visibleLen
      continue
    }
    if (currentLen + 1 + visibleLen > width) {
      out.push(current)
      current = word
      currentLen = visibleLen
    }
    else {
      current += ` ${word}`
      currentLen += 1 + visibleLen
    }
  }
  if (current)
    out.push(current)
  return out.join('\n')
}

function wrapAnsi(string: string, width: number) {
  return string.split('\n').map(l => wrapLine(l, width)).join('\n')
}

export function foldLines(string: string, spaces: number, firstLineSpaces: number, charsPerLine = maxCharsPerLine()) {
  return indentLines(wrapAnsi(string, charsPerLine), spaces, firstLineSpaces)
}

export function box(message: string, title: string, options?: BoxOpts) {
  return `${makeBox([
    title,
    '',
    colorize('white', foldLines(message, 0, 0, maxCharsPerLine())),
  ].join('\n'), Object.assign({
    borderColor: 'white',
    borderStyle: 'round',
    padding: 1,
    margin: 1,
  }, options))}\n`
}

export function successBox(message: string, title: string) {
  return box(message, title, {
    style: {
      borderColor: 'green',
    },
  })
}
