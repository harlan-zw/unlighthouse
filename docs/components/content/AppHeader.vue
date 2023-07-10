<script setup lang="ts">
const { navigation } = useContent()
const { hasDocSearch } = useDocSearch()
const hasDialog = computed(() => navigation.value?.length > 1)

const colorMode = useColorMode()

const isDark = computed({
  get() {
    return colorMode.value === 'dark'
  },
  set() {
    colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
  },
})
</script>

<template>
  <header :class="{ 'has-dialog': hasDialog, 'has-doc-search': hasDocSearch }">
    <Container fluid>
      <section class="left">
        <AppHeaderDialog v-if="hasDialog" />
        <AppHeaderLogo />
      </section>

      <section class="center">
        <AppHeaderLogo v-if="hasDialog" />
        <AppHeaderNavigation />
      </section>

      <section class="right">
        <AppSearch v-if="hasDocSearch" />
        <LegoGithubStar v-slot="{ stars }" repo="harlan-zw/unlighthouse" class="hidden md:flex mr-5 group border dark:bg-gray-900 dark:hover:bg-gray-700 hover:bg-gray-200 dark:bg-gray-900 bg-gray-100 transition rounded-lg text-sm justify-center">
          <div class="flex items-center transition rounded-l px-2 py-1 space-x-1">
            <Icon name="uil:star" class="group-hover:op75 " />
            <div>Star</div>
          </div>
          <div class="px-2 py-1 dark:bg-black bg-white rounded-r-lg">
            {{ stars }}
          </div>
        </LegoGithubStar>

        <button
          class="focus:outline-none focus-visible:outline-0 disabled:cursor-not-allowed disabled:opacity-75 flex-shrink-0 font-medium rounded-md text-sm gap-x-1.5 p-1.5 text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 inline-flex items-center"
          aria-label="Color Mode"
          type="button"
          @click="isDark = !isDark"
        >
          <Icon v-if="isDark" name="heroicons:moon-20-solid" class="group-hover:op75 flex-shrink-0 h-5 w-5" aria-hidden="true" />
          <Icon v-else name="heroicons:sun-20-solid" class="group-hover:op75 flex-shrink-0 h-5 w-5" aria-hidden="true" />
        </button>

        <AppSocialIcons />
        <a class="hidden sm:flex items-center ml-5" href="https://harlanzw.com" title="View Harlan's site." target="_blank">
          <div class="flex items-center">
            <img src="https://avatars.githubusercontent.com/u/5326365?v=4" class="rounded-full h-7 w-7 mr-2">
            <div class="flex flex-col">
              <span class="opacity-60 text-xs">Created by</span>
              <h1 class="font-bold text-sm opacity-80">harlanzw</h1>
            </div>
          </div>
        </a>
      </section>
    </Container>
  </header>
</template>

<style scoped lang="ts">
css({
  ':deep(.icon)': {
    width: '{space.5}',
    height: '{space.5}'
  },

  '.navbar-logo': {
    '.left &': {
      '.has-dialog &': {
        display: 'none',
        '@lg': {
          display: 'block'
        }
      },
    },
    '.center &': {
      display: 'block',
      '@lg': {
        display: 'none'
      }
    }
  },

  header: {
    backdropFilter: 'blur(10px)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    width: '100%',
    borderBottom: '1px solid {color.gray.100}',
    backgroundColor: '{elements.backdrop.background}',
    height: '{docus.header.height}',

    '@dark': {
      borderBottom: '1px solid {color.gray.900}',
    },

    '.container': {
      display: 'grid',
      height: '100%',
      gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
      gap: '2rem'
    },

    section: {
      display: 'flex',
      alignItems: 'center',
      flex: 'none',
      '&.left': {
        gridColumn: 'span 3 / span 3'
      },
      '&.center': {
        gridColumn: 'span 6 / span 6',
        justifyContent: 'center',
        flex: '1',
       'nav': {
          display: 'none',
'@sm': {
       display: 'flex'
     }
                     }
      },
      '&.right': {
        display: 'none',
        gridColumn: 'span 3 / span 3',
        justifyContent: 'flex-end',
        alignItems: 'center',
        flex: 'none',
        gap: '{space.4}',
        '@sm': {
          display: 'flex'
        }
      }
    }
  }
})
</style>
