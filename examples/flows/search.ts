import type { FlowContext } from '../../src/audit/flow.ts'

export default async function search({ flow, page, url }: FlowContext): Promise<void> {
  await flow.navigate(url, { name: 'Open the home page' })

  await flow.startTimespan({ name: 'Type a search' })
  await page.type('input[name=q]', 'running shoes', { delay: 50 })
  await flow.endTimespan()

  await flow.startNavigation({ name: 'Submit the search' })
  await page.keyboard.press('Enter')
  await flow.endNavigation()

  await flow.snapshot({ name: 'Results' })
}
