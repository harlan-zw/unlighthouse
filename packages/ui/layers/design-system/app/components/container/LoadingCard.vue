<script setup lang="ts">
import UiLoadingState from './UiLoadingState.vue'

defineOptions({ inheritAttrs: false })

type Props = InstanceType<typeof UiLoadingState>['$props']

const props = defineProps<Props>()
const forwardedProps = useForwardedProps(props)
</script>

<template>
  <UiLoadingState v-bind="forwardedProps">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps || {}" />
    </template>
  </UiLoadingState>
</template>
