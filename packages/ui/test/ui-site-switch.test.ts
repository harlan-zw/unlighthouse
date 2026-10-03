import { describe, expect, it } from 'vitest'
import { siteSwitchDestination } from '../app/features/navigation/site-switch'

describe('site switching', () => {
  it('keeps site history filters when switching between site pages', () => {
    expect(siteSwitchDestination({ path: '/sites/old.test', query: { device: 'mobile' }, hash: '#history' }, 'new.test')).toEqual({
      path: '/sites/new.test',
      query: { device: 'mobile' },
      hash: '#history',
    })
  })

  it('opens the same scan section on the destination scan', () => {
    expect(siteSwitchDestination({ path: '/sites/old.test/scans/old-id/packs/cwv', query: { route: 'old-route' }, hash: '#old-route' }, 'new.test', 'new-id')).toEqual({
      path: '/sites/new.test/scans/new-id/packs/cwv',
    })
  })

  it('opens routes instead of carrying a route ID into another scan', () => {
    expect(siteSwitchDestination({ path: '/sites/old.test/scans/old-id/route/old-route' }, 'new.test', 'new-id')).toEqual({
      path: '/sites/new.test/scans/new-id/routes',
    })
  })

  it('opens site history when no destination scan exists', () => {
    expect(siteSwitchDestination({ path: '/sites/old.test/scans/old-id/overview' }, 'localhost:3000')).toEqual({ path: '/sites/localhost%3A3000' })
  })

  it('clears comparison IDs when switching sites', () => {
    expect(siteSwitchDestination({ path: '/sites/old.test/compare', query: { current: 'old-id', baseline: 'older-id' } }, 'new.test')).toEqual({ path: '/sites/new.test/compare' })
  })
})
