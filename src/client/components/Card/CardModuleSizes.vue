<script lang="ts" setup>
const props = defineProps<{
  stats: {
    modules: {
      vendor: { size: number }
      commons: { size: number }
      app: { size: number }
    }
  }
}>()
</script>
<template>
<card>
  <div class="flex w-full justify-between">
    <div>
      <div class="flex">
        <div class="mb-2 mr-5">
          <div class="text-xs uppercase opacity-40">
            Vendor Bundle
          </div> {{ stats.modules.vendor.size }}
        </div>
        <div class="mb-2">
          <div class="text-xs uppercase opacity-40">
            Commons Bundle
          </div> {{ stats.modules.commons.size }}
        </div>
      </div>
      <div class="mb-2">
        <div class="text-xs uppercase opacity-40">
          App Bundle
        </div> {{ stats.modules.app.size }}
      </div>
    </div>
  </div>
</card>
</template>
