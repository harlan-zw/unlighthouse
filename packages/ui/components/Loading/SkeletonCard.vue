<template>
  <div class="bg-elevated/40 border border-default rounded-sm p-4 animate-pulse">
    <div class="flex items-center gap-4">
      <!-- Screenshot skeleton -->
      <div class="w-24 h-16 rounded-sm bg-elevated/60 shrink-0" />

      <!-- Content skeleton -->
      <div class="flex-1 space-y-2">
        <div class="h-4 bg-elevated/60 rounded w-2/3" />
        <div class="h-3 bg-elevated/60 rounded w-1/2" />
      </div>

      <!-- Scores skeleton -->
      <div class="flex gap-2">
        <div v-for="i in 4" :key="i" class="text-center">
          <div class="w-10 h-10 rounded-sm bg-elevated/60" />
          <div class="h-2 bg-elevated/60 rounded w-6 mx-auto mt-1" />
        </div>
      </div>
    </div>
  </div>
</template>
