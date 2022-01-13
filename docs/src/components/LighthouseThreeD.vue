<script setup lang="ts">
import { useElementHover } from '@vueuse/core'
import { ref, shallowRef, onMounted, computed } from 'vue'

const rendererC = ref()
const lighthouse = shallowRef()

const lighthouseRef = ref()
const isHovered = useElementHover(lighthouseRef)

onMounted(() => {
  const renderer = rendererC.value
  if (!renderer)
    return

  const z = ref(10)
  const rotation = ref(0.01)

  renderer.onBeforeRender(() => {
    if (isHovered.value) {
      if (z.value < 30) {
        z.value += 0.1
      }
      if (rotation.value < 0.1) {
        rotation.value += 0.001
      }
    } else if (z.value !== 10) {
      if (z.value > 10) {
        z.value -= 0.1
      } else {
        z.value += 0.1
      }
      if (rotation.value > 0.01) {
        rotation.value -= 0.001
      }
    }
    if (lighthouse.value) {
      // set initial position
      lighthouse.value.position.set(184, -71, z.value)
      // lighthouse
      lighthouse.value.children[0].rotation.z += rotation.value
      // @ts-ignore
      lighthouse.value.children[0].material[2].opacity = 0.2
      // ground
      lighthouse.value.children[1].rotation.z += rotation.value
      lighthouse.value.children[2].rotation.z += rotation.value
      lighthouse.value.children[3].rotation.z += rotation.value

      // ladder
      lighthouse.value.children[4].visible = false
      lighthouse.value.children[5].visible = false

      lighthouse.value.children[6].visible = false
      lighthouse.value.children[7].visible = false
      lighthouse.value.children[8].visible = false
    }
  })
})


const showLighthouse = computed(() => {
  return isHovered.value
})

const onReady = (object) => {
  lighthouse.value = object
}
</script>

<template>
<div ref="lighthouseRef" :class="showLighthouse ? ['translate-y-3'] : ['translate-y-0']" class="bg-gradient-to-b from-sky-900/90 to-teal-900/50 dark:(bg-none) rounded-full duration-2000 ease-in-out transform transition w-400px h-400px">
  <Renderer ref="rendererC" antialias :orbit-ctrl="{ enableDamping: true }" resize="true" :alpha="true">
    <Camera :position="{ x: 0, y: 0, z: 0 }" />
    <Scene>
      <PointLight :position="{ x: 160, y: -71, z: 0 }" />
      <AmbientLight />
      <FbxModel
          ref="meshC"
          src="/assets/lighthouse.fbx"
          @load="onReady"
      />
    </Scene>
  </Renderer>
</div>
</template>
