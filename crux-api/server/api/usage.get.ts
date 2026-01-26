import { defineEventHandler } from '#imports'
import { getUsage } from '../app/services/usage'

export default defineEventHandler(() => {
  return getUsage()
})
