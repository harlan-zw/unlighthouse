<script setup lang="ts">
import type { BestPracticesData } from '@unlighthouse/contracts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const route = useRoute()
const config = useRuntimeConfig()
const baseUrl = config.public.unlighthouseApiUrl as string
const scanId = route.params.id as string

const { data, status } = useAsyncData(
  `bp-${scanId}`,
  async () => {
    const res = await fetch(`${baseUrl}/dashboard/best-practices/${scanId}`)
    if (!res.ok) return null
    return await res.json() as BestPracticesData
  },
)

function severityVariant(severity: string) {
  if (severity === 'critical' || severity === 'high') return 'destructive' as const
  if (severity === 'medium') return 'secondary' as const
  return 'outline' as const
}

const totalIssues = computed(() => {
  if (!data.value) return 0
  return data.value.securityIssues.length
    + data.value.vulnerableLibraries.length
    + data.value.deprecatedApis.length
    + data.value.consoleErrors.length
})
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
      <h1 class="text-xl font-bold tracking-tight">Best Practices</h1>
    </div>

    <div v-if="status === 'pending'" class="text-center py-12 text-muted-foreground">
      Loading best practices data...
    </div>

    <div v-else-if="!data" class="text-center py-12 text-muted-foreground">
      No best practices data available.
    </div>

    <template v-else>
      <!-- Security Issues -->
      <Card v-if="data.securityIssues.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Security Issues
            <Badge variant="destructive" class="text-xs">{{ data.securityIssues.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-2">
          <Alert v-for="issue in data.securityIssues" :key="issue.type" variant="destructive">
            <Icon name="lucide:shield-alert" class="size-4" />
            <AlertTitle class="text-sm">{{ issue.type }}</AlertTitle>
            <AlertDescription class="text-xs">
              <p>{{ issue.description }}</p>
              <p class="mt-1 text-muted-foreground">{{ issue.pageCount }} page(s) affected</p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <!-- Vulnerable Libraries -->
      <Card v-if="data.vulnerableLibraries.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Vulnerable Libraries
            <Badge variant="destructive" class="text-xs">{{ data.vulnerableLibraries.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Library</TableHead>
                <TableHead class="w-24">Version</TableHead>
                <TableHead class="w-24">Severity</TableHead>
                <TableHead class="w-32">CVEs</TableHead>
                <TableHead class="w-20 text-right">Pages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="lib in data.vulnerableLibraries" :key="lib.name + lib.version">
                <TableCell class="font-medium text-sm">{{ lib.name }}</TableCell>
                <TableCell class="font-mono text-xs">{{ lib.version }}</TableCell>
                <TableCell>
                  <Badge :variant="severityVariant(lib.highestSeverity)" class="text-[10px]">
                    {{ lib.highestSeverity }}
                  </Badge>
                </TableCell>
                <TableCell class="text-xs">{{ lib.cves.join(', ') || '—' }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ lib.pageCount }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Detected Libraries -->
      <Card v-if="data.libraries.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Detected Libraries
            <Badge variant="secondary" class="text-xs">{{ data.libraries.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Library</TableHead>
                <TableHead class="w-24">Version</TableHead>
                <TableHead class="w-24">Status</TableHead>
                <TableHead class="w-20 text-right">Pages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="lib in data.libraries" :key="lib.name + lib.version">
                <TableCell class="font-medium text-sm">{{ lib.name }}</TableCell>
                <TableCell class="font-mono text-xs">{{ lib.version }}</TableCell>
                <TableCell><Badge variant="outline" class="text-[10px]">{{ lib.status }}</Badge></TableCell>
                <TableCell class="text-right tabular-nums">{{ lib.pageCount }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Deprecated APIs -->
      <Card v-if="data.deprecatedApis.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Deprecated APIs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>API</TableHead>
                <TableHead>Source</TableHead>
                <TableHead class="w-20 text-right">Pages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="api in data.deprecatedApis" :key="api.api">
                <TableCell class="font-mono text-xs">{{ api.api }}</TableCell>
                <TableCell class="text-xs truncate max-w-xs">{{ api.source }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ api.pageCount }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Console Errors -->
      <Card v-if="data.consoleErrors.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Console Errors
            <Badge variant="secondary" class="text-xs">{{ data.consoleErrors.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <div v-for="err in data.consoleErrors" :key="err.message" class="rounded-md border p-3">
              <div class="font-mono text-xs text-red-500 break-all">{{ err.message }}</div>
              <div class="mt-1 text-xs text-muted-foreground">
                {{ err.source }} · {{ err.instanceCount }} instances · {{ err.pageCount }} pages
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div v-if="!totalIssues && !data.libraries.length" class="text-center py-12 text-muted-foreground">
        No best practices issues found.
      </div>
    </template>
  </div>
</template>
