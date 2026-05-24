<script setup lang="ts">
import type { AccessibilityData } from '@unlighthouse/contracts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const route = useRoute()
const config = useRuntimeConfig()
const baseUrl = config.public.unlighthouseApiUrl as string
const scanId = route.params.id as string

const { data, status } = useAsyncData(
  `a11y-${scanId}`,
  async () => {
    const res = await fetch(`${baseUrl}/dashboard/accessibility/${scanId}`)
    if (!res.ok) return null
    return await res.json() as AccessibilityData
  },
)

function severityVariant(severity: string) {
  if (severity === 'critical' || severity === 'serious') return 'destructive' as const
  if (severity === 'moderate') return 'secondary' as const
  return 'outline' as const
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink :to="`/scan/${scanId}/overview`">
          <Icon name="lucide:arrow-left" class="size-4 mr-1" />
          Overview
        </NuxtLink>
      </Button>
      <h1 class="text-xl font-bold tracking-tight">Accessibility</h1>
    </div>

    <div v-if="status === 'pending'" class="text-center py-12 text-muted-foreground">
      Loading accessibility data...
    </div>

    <div v-else-if="!data" class="text-center py-12 text-muted-foreground">
      No accessibility data available.
    </div>

    <template v-else>
      <!-- Issues by Audit -->
      <Card v-if="data.issues.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Issues
            <Badge variant="secondary" class="text-xs">{{ data.issues.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" class="w-full">
            <AccordionItem v-for="issue in data.issues" :key="issue.auditId" :value="issue.auditId">
              <AccordionTrigger class="text-sm">
                <div class="flex items-center gap-3 text-left flex-1 min-w-0">
                  <Badge :variant="severityVariant(issue.severity)" class="text-[10px] shrink-0">
                    {{ issue.severity }}
                  </Badge>
                  <span class="truncate">{{ issue.title }}</span>
                  <span class="text-xs text-muted-foreground shrink-0">{{ issue.instanceCount }} instances</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div class="text-sm space-y-3">
                  <p class="text-muted-foreground">{{ issue.description }}</p>
                  <div v-if="issue.wcagCriteria.length" class="flex items-center gap-1.5 flex-wrap">
                    <Badge v-for="w in issue.wcagCriteria" :key="w" variant="outline" class="text-[10px]">
                      {{ w }}
                    </Badge>
                  </div>
                  <div v-if="issue.pages.length" class="text-xs text-muted-foreground">
                    {{ issue.pageCount }} page(s):
                    <ul class="mt-1 space-y-0.5 font-mono">
                      <li v-for="p in issue.pages.slice(0, 5)" :key="p">{{ p }}</li>
                      <li v-if="issue.pages.length > 5">...and {{ issue.pages.length - 5 }} more</li>
                    </ul>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <!-- Missing Alt Images -->
      <Card v-if="data.missingAltImages.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Missing Alt Text
            <Badge variant="destructive" class="text-xs">{{ data.missingAltImages.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Image URL</TableHead>
                <TableHead class="w-24">Decorative</TableHead>
                <TableHead class="w-20 text-right">Pages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="img in data.missingAltImages" :key="img.url">
                <TableCell class="font-mono text-xs truncate max-w-md">{{ img.url }}</TableCell>
                <TableCell>
                  <Badge v-if="img.isDecorative" variant="outline" class="text-xs">Yes</Badge>
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ img.pageCount }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Element Details -->
      <Card v-if="data.elements.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Element Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <div
              v-for="(el, i) in data.elements.slice(0, 20)"
              :key="i"
              class="rounded-md border p-3 text-sm space-y-1"
            >
              <div class="flex items-center gap-2">
                <Badge :variant="severityVariant(el.severity)" class="text-[10px]">{{ el.severity }}</Badge>
                <code class="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-md">{{ el.selector }}</code>
              </div>
              <p v-if="el.issueDescription" class="text-xs text-muted-foreground">{{ el.issueDescription }}</p>
              <div v-if="el.contrastRatio != null" class="text-xs text-muted-foreground">
                Contrast: {{ el.contrastRatio.toFixed(2) }} (required: {{ el.requiredRatio?.toFixed(2) }})
              </div>
              <div v-if="el.snippet" class="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">{{ el.snippet }}</div>
            </div>
            <p v-if="data.elements.length > 20" class="text-xs text-muted-foreground text-center">
              ...and {{ data.elements.length - 20 }} more elements
            </p>
          </div>
        </CardContent>
      </Card>

      <div v-if="!data.issues.length && !data.missingAltImages.length" class="text-center py-12 text-muted-foreground">
        No accessibility issues found.
      </div>
    </template>
  </div>
</template>
