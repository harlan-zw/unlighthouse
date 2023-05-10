<script setup lang="ts">
import GithubButton from 'vue-github-button'
const { navigation } = useContent()
const { hasDocSearch } = useDocSearch()
const hasDialog = computed(() => navigation.value?.length > 1)

const color = useColorMode()
const githubColorScheme = computed(() => color.value === 'dark' ? 'no-preference: dark; light: dark; dark: dark;' : 'no-preference: light; light: light; dark: light;')
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
        <GithubButton class="hidden xl:inline h-[20px]" href="https://github.com/harlan-zw/unlighthouse" :data-color-scheme="githubColorScheme" data-icon="octicon-star" data-show-count="true" aria-label="Star on GitHub">
          Star
        </GithubButton>
        <GithubButton class="hidden xl:inline h-[20px]" href="https://github.com/sponsors/harlan-zw" :data-color-scheme="githubColorScheme" data-icon="octicon-heart" aria-label="Sponsor @harlan-zw on GitHub">
          Sponsor
        </GithubButton>
        <ThemeSelect />
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
