<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

defineProps<{
  title: string
  score: number | null
  issues?: number
  icon: string
}>()

const { scoreToBg } = useScoreColor()
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between pb-2">
      <CardTitle class="text-sm font-medium">
        {{ title }}
      </CardTitle>
      <Icon :name="icon" class="size-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div class="flex items-center gap-4">
        <ScoreRing :score="score" size="sm" />
        <div>
          <div class="text-2xl font-bold tabular-nums">
            {{ score !== null ? Math.round(score * 100) : '—' }}
          </div>
          <p v-if="issues !== undefined" class="text-xs text-muted-foreground">
            {{ issues }} {{ issues === 1 ? 'issue' : 'issues' }}
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
