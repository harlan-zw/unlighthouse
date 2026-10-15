import type { FlowContext } from '../../../src/audit/flow.ts'

export default async function hang({ flow, url }: FlowContext): Promise<void> {
  await flow.navigate(url, { name: 'Home' })
  await new Promise(() => {})
}
