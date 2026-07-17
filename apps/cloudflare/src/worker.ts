import type { ContainerNamespaceLike, ContainerStubLike } from '@unlighthouse/cloudflare/auditors/container'
import type { NamedAuditor } from '@unlighthouse/contracts/ports'
import type { DeviceMatrix } from '@unlighthouse/contracts/types/atoms'
import { createContainerLighthouseAuditor } from '@unlighthouse/cloudflare/auditors/container'
import {
  LighthouseContainer,
  RateLimiterDO,
} from '@unlighthouse/cloudflare/durable-objects'
import { ScanWorkflow } from '@unlighthouse/cloudflare/workflows/scan'
import { createCruxAuditor } from '@unlighthouse/core/auditors/crux'
import { createPsiAuditor } from '@unlighthouse/core/auditors/psi'
import { fallbackAuditor } from '@unlighthouse/core/auditors/route'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { authenticateRequest, unauthorizedResponse } from './auth'
import { createCloudflareApp } from './runtime'
import { createAllowedTargetPolicy } from './target-policy'

interface OptionalProviderSecrets {
  /** Optional Google API key that increases PageSpeed Insights quota. */
  PSI_API_KEY?: string
  /** Optional Google API key that enables the CrUX field-data fallback. */
  CRUX_API_KEY?: string
}

type AppEnv = Env & OptionalProviderSecrets

function containerNamespace(env: AppEnv): ContainerNamespaceLike {
  const stubFor = (name: string): ContainerStubLike => {
    const stub = env.LIGHTHOUSE_CONTAINER.getByName(name)
    return {
      fetch: (input, init) => stub.fetch(input, init),
    }
  }
  return {
    getByName: stubFor,
    // The adapter prefers getByName. These two methods keep its compatibility
    // fallback structural without weakening types with a double assertion.
    idFromName: name => name,
    get: (id) => {
      if (typeof id !== 'string')
        throw new TypeError('Container instance name must be a string.')
      return stubFor(id)
    },
  }
}

function createAuditor(env: AppEnv) {
  const tiers: NamedAuditor[] = [
    {
      name: 'psi',
      auditor: createPsiAuditor({ apiKey: env.PSI_API_KEY }),
    },
    {
      name: 'container-lighthouse',
      auditor: createContainerLighthouseAuditor({
        container: containerNamespace(env),
        token: env.SHARED_AUDIT_TOKEN,
      }),
    },
  ]

  if (env.CRUX_API_KEY) {
    tiers.push({
      name: 'crux',
      auditor: createCruxAuditor({ apiKey: env.CRUX_API_KEY }),
    })
  }
  return fallbackAuditor(tiers)
}

function deploymentVersion(metadata: WorkerVersionMetadata): string {
  return metadata.tag ? `${metadata.tag}@${metadata.id}` : metadata.id
}

function createApp(
  env: AppEnv,
  principal?: { principal: string },
) {
  return createCloudflareApp(env, {
    auditorFactory: () => createAuditor(env),
    authenticate: request => principal
      ? Promise.resolve(principal)
      : authenticateRequest(request, env.UNLIGHTHOUSE_API_TOKEN),
    allowedTargets: createAllowedTargetPolicy(env.UNLIGHTHOUSE_ALLOWED_ORIGINS),
    version: deploymentVersion(env.CF_VERSION_METADATA),
  })
}

export class AuditEntrypoint extends WorkerEntrypoint<AppEnv> {
  async audit(input: { scanId: string, url: string, devices: DeviceMatrix }) {
    return createApp(this.env).audit(input)
  }
}

// Wrangler resolves these names from Durable Object and Workflow bindings.
export { LighthouseContainer, RateLimiterDO, ScanWorkflow }

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname
    let principal: { principal: string } | undefined
    if (pathname !== '/health') {
      try {
        principal = await authenticateRequest(request, env.UNLIGHTHOUSE_API_TOKEN) ?? undefined
      }
      catch (error) {
        console.error(JSON.stringify({
          event: 'cloudflare.auth_configuration_invalid',
          message: error instanceof Error ? error.message : String(error),
        }))
        return new Response(JSON.stringify({ error: 'service_unavailable' }), {
          status: 503,
          headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
        })
      }
      if (!principal)
        return unauthorizedResponse()
    }

    try {
      return await createApp(env, principal).fetch(request, env, ctx)
    }
    catch (error) {
      console.error(JSON.stringify({
        event: 'cloudflare.fetch_failed',
        message: error instanceof Error ? error.message : String(error),
      }))
      return new Response(JSON.stringify({ error: 'service_unavailable' }), {
        status: 503,
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
      })
    }
  },
  async scheduled(_controller, env, _ctx) {
    await createApp(env).scheduled()
  },
} satisfies ExportedHandler<AppEnv>
