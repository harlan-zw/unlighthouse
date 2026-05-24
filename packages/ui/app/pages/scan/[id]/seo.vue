<script setup lang="ts">
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

const route = useRoute()
const api = useApi()
const scanId = route.params.id as string
const { scoreToColor, scoreToLabel } = useScoreColor()

const { data: seoPack, status } = useAsyncData(
  `seo-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'seo-basics' }).catch(() => null),
)

const data = computed(() => (seoPack.value as any)?.report ?? null)

function titleStatus(len: number | null) {
  if (len == null) return { label: 'Missing', variant: 'destructive' as const }
  if (len < 30) return { label: 'Too short', variant: 'secondary' as const }
  if (len > 60) return { label: 'Too long', variant: 'secondary' as const }
  return { label: 'Good', variant: 'default' as const }
}

function descStatus(len: number | null) {
  if (len == null) return { label: 'Missing', variant: 'destructive' as const }
  if (len < 70) return { label: 'Too short', variant: 'secondary' as const }
  if (len > 160) return { label: 'Too long', variant: 'secondary' as const }
  return { label: 'Good', variant: 'default' as const }
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
      <h1 class="text-xl font-bold tracking-tight">SEO</h1>
    </div>

    <div v-if="status === 'pending'" class="text-center py-12 text-muted-foreground">
      Loading SEO data...
    </div>

    <div v-else-if="!data" class="text-center py-12 text-muted-foreground">
      No SEO data available.
    </div>

    <template v-else>
      <!-- Meta Tags -->
      <Card v-if="data.meta?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Meta Tags
            <Badge variant="secondary" class="text-xs">{{ data.meta?.length }} pages</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent class="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Path</TableHead>
                <TableHead class="w-56">Title</TableHead>
                <TableHead class="w-20">Title</TableHead>
                <TableHead class="w-20">Desc</TableHead>
                <TableHead class="w-16">OG</TableHead>
                <TableHead class="w-20">Index</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="m in data.meta" :key="m.path">
                <TableCell class="font-mono text-xs truncate max-w-xs">{{ m.path }}</TableCell>
                <TableCell class="text-xs truncate max-w-56">{{ m.title || '—' }}</TableCell>
                <TableCell>
                  <Badge :variant="titleStatus(m.titleLength).variant" class="text-[10px]">
                    {{ titleStatus(m.titleLength).label }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge :variant="descStatus(m.descriptionLength).variant" class="text-[10px]">
                    {{ descStatus(m.descriptionLength).label }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Icon
                    :name="m.hasOgTags ? 'lucide:check' : 'lucide:x'"
                    :class="m.hasOgTags ? 'text-green-500' : 'text-red-500'"
                    class="size-4"
                  />
                </TableCell>
                <TableCell>
                  <Icon
                    :name="m.isIndexable ? 'lucide:check' : 'lucide:x'"
                    :class="m.isIndexable ? 'text-green-500' : 'text-red-500'"
                    class="size-4"
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Duplicate Content -->
      <Card v-if="data.duplicates?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Duplicate Content
            <Badge variant="destructive" class="text-xs">{{ data.duplicates?.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead class="w-20 text-right">Pages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="d in data.duplicates" :key="d.type + d.value">
                <TableCell><Badge variant="outline" class="text-xs">{{ d.type }}</Badge></TableCell>
                <TableCell class="text-sm truncate max-w-md">{{ d.value }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ d.pageCount }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Canonical Chains -->
      <Card v-if="data.canonicalChains?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Canonical Chains
            <Badge variant="secondary" class="text-xs">{{ data.canonicalChains?.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <div v-for="c in data.canonicalChains" :key="c.chain" class="rounded-md border p-3 text-sm">
              <div class="flex items-center gap-2 mb-1">
                <Badge v-if="c.isLoop" variant="destructive" class="text-xs">Loop</Badge>
                <span class="font-mono text-xs text-muted-foreground">{{ c.chain }}</span>
              </div>
              <div class="text-xs text-muted-foreground">{{ c.pages.length }} page(s)</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Link Text Issues -->
      <Card v-if="data.linkTextIssues?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Link Text Issues</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Text</TableHead>
                <TableHead class="w-24 text-right">Instances</TableHead>
                <TableHead class="w-20 text-right">Pages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="l in data.linkTextIssues" :key="l.text">
                <TableCell class="text-sm">{{ l.text || '(empty)' }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ l.instanceCount }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ l.pageCount }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div v-if="!data.meta?.length && !data.duplicates?.length" class="text-center py-12 text-muted-foreground">
        No SEO issues found.
      </div>
    </template>
  </div>
</template>
