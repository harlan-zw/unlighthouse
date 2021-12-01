<script setup lang="ts">
import { Camera, AmbientLight, PointLight, Renderer, RendererPublicInterface, Scene, FbxModel } from 'troisjs'
import type { Group } from 'three'
import { stats, basePath } from '../logic'
import { useElementHover } from '@vueuse/core'

const rendererC = ref()
const lighthouse = shallowRef<Group>()

onMounted(() => {
  const renderer = rendererC.value as RendererPublicInterface
  if (!renderer) {
    return
  }
  renderer.onBeforeRender(() => {
    if (lighthouse.value) {
      // set initial position
      if (lighthouse.value.position.x === 0)
        lighthouse.value.position.set(175, -77, -20)
      // lighthouse
      lighthouse.value.children[0].rotation.z += 0.01
      // ground
      lighthouse.value.children[1].rotation.z += 0.01
      lighthouse.value.children[2].rotation.z += 0.01
      lighthouse.value.children[3].rotation.z += 0.01

      // ladder
      lighthouse.value.children[4].visible = false
      lighthouse.value.children[5].visible = false
    }
  })
})

const lighthouseRef = ref()

const isHovered = useElementHover(lighthouseRef)

const showLighthouse = computed(() => {
  return stats?.value?.monitor?.status === 'working' || isHovered.value
})

const onReady = (object: Group) => {
  lighthouse.value = object
}
</script>

<template>
  <div ref="lighthouseRef" :class="showLighthouse ? ['translate-y-3'] : ['opacity-0']" class="bg-gradient-to-b from-sky-50/50 to-sky-300/50 dark:(bg-none) rounded-full duration-2000 ease-in-out transform transition w-200px h-200px">
    <Renderer ref="rendererC" antialias :orbit-ctrl="{ enableDamping: true }" resize="true" :alpha="true">
      <Camera :position="{ x: 0, y: 0, z: 0 }" />
      <Scene>
        <PointLight :position="{ x: 160, y: -71, z: 0 }" />
        <AmbientLight />
        <FbxModel
            ref="meshC"
            :src="basePath + '/assets/lighthouse.fbx'"
            @load="onReady"
        />
      </Scene>
    </Renderer>
  </div>
</template>
