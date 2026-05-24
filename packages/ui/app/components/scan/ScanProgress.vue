<script setup lang="ts">
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useScanStore } from '~/stores/scan'

const store = useScanStore()
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <CardTitle class="flex items-center gap-2 text-base">
        <span class="relative flex size-2">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
          <span class="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        Scanning {{ store.site }}
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div>
        <div class="flex items-center justify-between mb-2 text-sm">
          <span class="text-muted-foreground">Progress</span>
          <span class="font-medium tabular-nums">{{ store.percent }}%</span>
        </div>
        <Progress :model-value="store.percent" class="h-2" />
      </div>

      <div class="grid grid-cols-4 gap-4 text-center text-sm">
        <div>
          <div class="text-lg font-bold tabular-nums">{{ store.discovered }}</div>
          <div class="text-muted-foreground text-xs">Discovered</div>
        </div>
        <div>
          <div class="text-lg font-bold tabular-nums">{{ store.scanned }}</div>
          <div class="text-muted-foreground text-xs">Scanned</div>
        </div>
        <div>
          <div class="text-lg font-bold tabular-nums text-destructive">{{ store.failed }}</div>
          <div class="text-muted-foreground text-xs">Failed</div>
        </div>
        <div>
          <div class="text-lg font-bold tabular-nums">{{ store.total }}</div>
          <div class="text-muted-foreground text-xs">Total</div>
        </div>
      </div>

      <ScanTerminal />
    </CardContent>
  </Card>
</template>
