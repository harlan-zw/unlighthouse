<script lang="ts" setup>
import { useIntervalFn } from '@vueuse/core'

const props = defineProps<{
  screenshots: any[]
}>()

const emit = defineEmits<{
  close: []
}>()

// Use v-model approach for modal
const isOpen = defineModel<boolean>('open', { default: false })

const currentFrame = ref(0)
const isPlaying = ref(false)

const totalFrames = computed(() => props.screenshots.length)
const currentScreenshot = computed(() => props.screenshots[currentFrame.value])
const maxDuration = computed(() => (totalFrames.value - 1) * 300)

const { pause, resume } = useIntervalFn(() => {
  if (currentFrame.value < totalFrames.value - 1) {
    currentFrame.value++
  }
  else {
    // Loop back to beginning
    currentFrame.value = 0
  }
}, 150, { immediate: false })

function play() {
  if (isPlaying.value)
    return
  isPlaying.value = true
  resume()
}

function stop() {
  isPlaying.value = false
  pause()
}

function stepForward() {
  if (currentFrame.value < totalFrames.value - 1) {
    currentFrame.value++
  }
}

function stepBackward() {
  if (currentFrame.value > 0) {
    currentFrame.value--
  }
}

function reset() {
  stop()
  currentFrame.value = 0
}

function closeModal() {
  stop()
  isOpen.value = false
  emit('close')
}

// Reset when modal opens
watch(isOpen, (newIsOpen) => {
  if (newIsOpen) {
    currentFrame.value = 0
    isPlaying.value = false
  }
  else {
    stop()
  }
})

// cleanup on unmount
onUnmounted(() => {
  pause()
})
</script>

<template>
  <UModal v-model:open="isOpen" size="lg" :ui="{ variants: { fullscreen: { false: 'max-w-7xl' } } }" title="Page Load Timeline" description="Watch how your page loads in real-time. Each frame is captured 300ms apart during the loading process." @close="closeModal">
    <template #body>
      <div class="w-full max-w-6xl mx-auto p-6">
        <!-- Main Screenshot Display -->
        <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-6 relative">
          <div class="bg-white dark:bg-gray-900 rounded shadow-inner flex items-center justify-center overflow-hidden min-h-[400px]">
            <img
              v-if="currentScreenshot"
              :src="currentScreenshot.data"
              class="w-auto h-auto max-w-full"
              :alt="`Screenshot at ${currentFrame * 300}ms`"
            >
          </div>

          <!-- Frame Counter -->
          <div class="absolute top-2 right-2 bg-black bg-opacity-75 text-white px-3 py-1 rounded text-sm">
            <div>
              Frame {{ currentFrame + 1 }} / {{ totalFrames }}
            </div>
            <div class="text-xs opacity-75">
              {{ currentFrame * 300 }}ms
            </div>
          </div>
        </div>

        <!-- Controls -->
        <div class="flex items-center justify-center space-x-4 mb-6">
          <UButton
            v-if="!isPlaying"
            icon="i-heroicons-arrow-uturn-left"
            variant="outline"
            color="neutral"
            size="sm"
            title="Reset to start"
            @click="reset"
          />
          <UButton
            v-if="!isPlaying"
            icon="i-heroicons-backward"
            variant="outline"
            color="neutral"
            size="sm"
            :disabled="currentFrame === 0"
            title="Previous frame"
            @click="stepBackward"
          />
          <UButton
            v-if="!isPlaying"
            icon="i-heroicons-forward"
            variant="outline"
            color="neutral"
            size="sm"
            :disabled="currentFrame === totalFrames - 1"
            title="Next frame"
            @click="stepForward"
          />
          <UButton
            v-if="!isPlaying"
            icon="i-heroicons-play"
            color="success"
            size="sm"
            title="Play animation"
            @click="play"
          >
            Play
          </UButton>
          <UButton
            v-else
            icon="i-heroicons-pause"
            color="error"
            size="sm"
            title="Stop animation"
            @click="stop"
          >
            Stop
          </UButton>
        </div>

        <!-- Timeline Scrubber -->
        <div class="w-full">
          <div class="flex items-center space-x-3 mb-3">
            <span class="text-sm text-gray-500 dark:text-gray-400 min-w-[40px]">0ms</span>
            <div class="flex-1 relative">
              <input
                v-model="currentFrame"
                type="range"
                :min="0"
                :max="totalFrames - 1"
                class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                @input="stop"
              >
            </div>
            <span class="text-sm text-gray-500 dark:text-gray-400 min-w-[50px]">{{ maxDuration }}ms</span>
          </div>

          <!-- Timeline Thumbnails -->
          <div class="flex space-x-1 overflow-x-auto py-2">
            <button
              v-for="(image, index) in screenshots"
              :key="index"
              class="flex-shrink-0 border-2 rounded transition-all duration-200"
              :class="[
                currentFrame === index
                  ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500',
              ]"
              :title="`Frame ${index + 1} - ${index * 300}ms`"
              @click="currentFrame = index; stop()"
            >
              <img
                :src="image.data"
                class="w-16 h-10 object-cover rounded-sm"
                :alt="`Thumbnail ${index + 1}`"
              >
            </button>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
