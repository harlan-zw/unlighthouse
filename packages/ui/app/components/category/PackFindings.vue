<script setup lang="ts">
// The "findings accordion" used by a11y-quick-wins, seo-basics,
// agentic-browsing, and most of the other pack pages. Each finding is
// an audit-grouped finding with severity, title, description, an
// affected-routes list. Five pages were rendering the same block
// with slight copy variation; co-locate it here.

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

// Index signature so pack-specific fields (a11y's `fixHint` +
// `elements`, images' `imageUrl`, etc.) flow through the slot without
// the consumer needing to cast. The shared layer only relies on the
// named fields above.
interface Finding {
  auditId: string
  severity: 'critical' | 'serious' | 'moderate' | 'minor' | 'info' | string
  title?: string | null
  description?: string | null
  routeCount?: number
  routes?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [extra: string]: any
}

interface Props {
  findings: Finding[]
  title?: string
  // Cap on the routes-list rendered under each finding; the rest
  // collapses to "+N more". Keep small for table-of-contents feel.
  maxRoutesPerFinding?: number
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Issues',
  maxRoutesPerFinding: 10,
})

function severityVariant(severity: string): 'destructive' | 'secondary' | 'outline' {
  if (severity === 'critical' || severity === 'serious') return 'destructive'
  if (severity === 'moderate') return 'secondary'
  return 'outline'
}
</script>

<template>
  <Card v-if="findings?.length">
    <CardHeader class="pb-3">
      <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
        {{ title }}
        <Badge variant="secondary" class="text-xs">
          {{ findings.length }}
        </Badge>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <Accordion type="multiple" class="w-full">
        <AccordionItem v-for="finding in findings" :key="finding.auditId" :value="finding.auditId">
          <AccordionTrigger class="text-sm">
            <div class="flex items-center gap-3 text-left flex-1 min-w-0">
              <Badge :variant="severityVariant(finding.severity)" class="text-[10px] shrink-0 capitalize">
                {{ finding.severity }}
              </Badge>
              <span class="truncate">{{ finding.title || finding.auditId }}</span>
              <span v-if="finding.routeCount != null" class="text-xs text-muted-foreground shrink-0 ml-auto">
                {{ finding.routeCount }} route{{ finding.routeCount === 1 ? '' : 's' }}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div class="text-sm space-y-2">
              <!-- Slot for the per-pack extra body (image preview, code
                   snippet, etc.). Receives the finding so the consumer
                   can decide what to render. -->
              <slot name="finding-body" :finding="finding">
                <p v-if="finding.description" class="text-muted-foreground text-xs">
                  {{ finding.description }}
                </p>
              </slot>

              <div v-if="finding.routes?.length" class="text-xs text-muted-foreground">
                Affected routes:
                <ul class="mt-1 space-y-0.5 font-mono">
                  <li v-for="r in finding.routes.slice(0, maxRoutesPerFinding)" :key="r">
                    {{ r }}
                  </li>
                  <li v-if="finding.routes.length > maxRoutesPerFinding">
                    +{{ finding.routes.length - maxRoutesPerFinding }} more
                  </li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </CardContent>
  </Card>
</template>
