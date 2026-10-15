import type { FlowContext } from '../../../src/audit/flow.ts'

export default async function broken({ page, url }: FlowContext): Promise<void> {
  await page.goto(url)
  if (!await page.$('#checkout'))
    throw new Error('the checkout button is missing')
}
