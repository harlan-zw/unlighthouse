<template>
  <div class="bg-elevated/40 border border-default rounded-xl p-4 animate-pulse">
    <div class="flex items-start justify-between gap-4">
      <!-- Site info skeleton -->
      <div class="flex-1 space-y-3">
        <div class="flex items-center gap-3">
          <div class="h-5 bg-elevated/60 rounded w-48" />
          <div class="h-5 bg-elevated/60 rounded-full w-20" />
        </div>
        <div class="flex items-center gap-4">
          <div class="h-4 bg-elevated/60 rounded w-32" />
          <div class="h-4 bg-elevated/60 rounded w-16" />
          <div class="h-4 bg-elevated/60 rounded w-20" />
        </div>
      </div>

      <!-- Scores skeleton -->
      <div class="flex gap-2">
        <div v-for="i in 4" :key="i" class="text-center">
          <div class="w-10 h-10 rounded-lg bg-elevated/60" />
          <div class="h-2 bg-elevated/60 rounded w-6 mx-auto mt-1" />
        </div>
      </div>

      <!-- Action button skeleton -->
      <div class="w-8 h-8 rounded bg-elevated/60" />
    </div>
  </div>
</template>
