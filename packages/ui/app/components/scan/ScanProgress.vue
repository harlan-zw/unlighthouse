<script setup lang="ts">
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { useScanStore } from '~/stores/scan'

const store = useScanStore()
const expanded = ref(true)
</script>

<template>
  <Card class="border-primary/30 bg-primary/5">
    <CardContent class="pt-4 pb-4 space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="relative flex size-2">
            <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
            <span class="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span class="text-sm font-medium">Scanning</span>
          <span class="text-sm text-muted-foreground truncate max-w-xs">{{ store.site }}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-sm font-medium tabular-nums">{{ store.percent }}%</span>
          <button
            class="text-muted-foreground hover:text-foreground transition-colors"
            @click="expanded = !expanded"
          >
            <Icon :name="expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="size-4" />
          </button>
        </div>
      </div>

      <Progress :model-value="store.percent" class="h-1.5" />

      <!-- Stats -->
      <div class="grid grid-cols-4 gap-3 text-center text-xs">
        <div>
          <div class="text-base font-bold tabular-nums">{{ store.discovered }}</div>
          <div class="text-muted-foreground">Discovered</div>
        </div>
        <div>
          <div class="text-base font-bold tabular-nums">{{ store.scanned }}</div>
          <div class="text-muted-foreground">Scanned</div>
        </div>
        <div>
          <div class="text-base font-bold tabular-nums" :class="store.failed > 0 ? 'text-destructive' : ''">{{ store.failed }}</div>
          <div class="text-muted-foreground">Failed</div>
        </div>
        <div>
          <div class="text-base font-bold tabular-nums">{{ store.total }}</div>
          <div class="text-muted-foreground">Total</div>
        </div>
      </div>

      <!-- Terminal -->
      <ScanTerminal v-if="expanded" />
    </CardContent>
  </Card>
</template>
