#!/usr/bin/env node
import { runCi } from '../dist/cli/ci.mjs'

runCi().then(
  code => process.exit(code),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
