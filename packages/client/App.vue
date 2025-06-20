<script setup lang="ts">
import { useTitle } from '@vueuse/core'
import { $fetch } from 'ofetch'
import { EXCLUDED_CATEGORIES } from './constants'
import {
  activeTab,
  apiUrl,
  basePath,
  categoryScores,
  changedTab,
  closeIframeModal,
  device,
  dynamicSampling,
  iframeModalUrl,
  incrementSort,
  isDebugModalOpen,
  isModalOpen,
  isOffline,
  isStatic,
  lighthouseOptions,
  openDebugModal,
  openLighthouseReportIframeModal,
  page,
  paginatedResults,
  perPage,
  refreshScanMeta,
  rescanRoute,
  resultColumns,
  searchResults,
  searchText,
  shouldShowWaitingState,
  sorting,
  tabs,
  throttle,
  website,
  wsConnect,
} from './logic'

const crux = ref(null)
const cruxError = ref(false)

if (!isStatic) {
  let refreshInterval: NodeJS.Timeout | null = null

  onMounted(() => {
    wsConnect().catch((error) => {
      console.warn('Failed to establish server connection:', error)
    })

    refreshInterval = setInterval(() => {
      refreshScanMeta()
    }, 5000)

    $fetch(`https://crux.unlighthouse.dev/api/${encodeURIComponent(website)}/crux/history`)
      .then((res) => {
        crux.value = res
        cruxError.value = false
      })
      .catch((error) => {
        console.warn('Failed to fetch CrUX data:', error)
        cruxError.value = true
      })
  })

  onUnmounted(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
  })
}

function openPsi(report) {
  window.open(`https://pagespeed.web.dev/report?url=${encodeURIComponent(report.route.url)}`, '_blank')
}

// Computed for complex template expressions
const shouldShowCategoryScore = computed(() => (category, key) => {
  return !EXCLUDED_CATEGORIES.includes(category.label) && !Number.isNaN(categoryScores.value[key - 1])
})

useTitle(`${website.replace(/https?:\/\/(www.)?/, '')} | Unlighthouse`)
</script>

<template>
  <main class="text-gray-700 dark:text-gray-200 overflow-y-hidden max-h-screen h-screen grid grid-rows-[min-content_1fr]">
    <NavBar />
    <div class="xl:flex mt-2 mb-2">
      <div class="flex justify-between max-h-[95%] flex-col xl:ml-3 mx-3 mr-0 w-full xl:mr-5 xl:w-[250px] xl:mb-0">
        <div>
          <TabGroup vertical @change="changedTab">
            <TabList class="xl:block xl:space-x-0 flex space-x-2 mb-3">
              <Tab
                v-for="(category, key) in tabs"
                :key="key"
                v-slot="{ selected }"
                as="template"
              >
                <btn-tab
                  :selected="selected"
                >
                  <span class="inline-flex items-center space-x-1">
                    <component :is="category.icon" class="inline text-sm opacity-40 h-4 w-4" />
                    <span>{{ category.label }}</span>
                    <tooltip v-if="category.label === 'Performance'" class="text-left">
                      <i-carbon-warning class="inline text-xs mx-1" />
                      <template #tooltip>
                        <div class="mb-2">Lighthouse is running with variability. Performance scores should not be considered accurate.</div>
                        <div>Unlighthouse is running <span class="underline">with{{ throttle ? '' : 'out' }} throttling</span> which will also effect scores.</div>
                      </template>
                    </tooltip>
                  </span>
                  <metric-guage v-if="shouldShowCategoryScore(category, key)" :score="categoryScores[key - 1]" :stripped="true" class="dark:font-bold" :class="selected ? ['dark:bg-teal-900 bg-blue-100 rounded px-2'] : []" />
                </btn-tab>
              </Tab>
            </TabList>
          </TabGroup>
          <div v-if="dynamicSampling" class="text-sm opacity-70 mt-3">
            <p>Dynamically sampling is enabled, not all pages are being scanned.</p>
            <p><a href="https://unlighthouse.dev/guide/guides/dynamic-sampling" target="_blank" class="underline">Learn more</a></p>
          </div>
        </div>
        <div class="hidden xl:block">
          <lighthouse-three-d v-if="!isStatic" class="mb-7" />
          <div class="px-2 text-center xl:text-left">
            <div class="text-xs opacity-75 xl:mt-4">
              <a href="https://unlighthouse.dev" target="_blank" class="underline hover:no-underline">Documentation</a>
              <btn-action v-if="!isStatic" class="underline hover:no-underline ml-3" @click="openDebugModal">
                Debug
              </btn-action>
            </div>
            <div class="text-xs opacity-75 xl:mt-4">
              Made with <i-simple-line-icons-heart title="Love" class="inline" aria-label="love" /> by <a href="https://twitter.com/harlan_zw" target="_blank" class="underline hover:no-underline">@harlan_zw</a>
            </div>
            <div class="text-xs opacity-50 xl:mt-4 mt-1">
              Portions of this report use Lighthouse. For more information visit <a href="https://developers.google.com/web/tools/lighthouse" class="underline hover:no-underline">here</a>.
            </div>
          </div>
        </div>
      </div>
      <div class="xl:w-full px-3 mr-5">
        <div v-if="tabs[activeTab].label === 'CrUX'">
          <div>
            <h2 class="font-bold text-2xl mb-7">
              Origin CrUX History - Mobile
            </h2>
          </div>
          <div v-if="!crux && !cruxError" class="w-full">
            <div class="text-gray-500 text-center w-full text-sm">
              Loading CrUX data...
            </div>
          </div>
          <div v-else-if="cruxError" class="w-full">
            <div class="flex items-center justify-center space-x-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <i-carbon-warning class="text-red-600 dark:text-red-400 text-xl" />
              <div class="text-center">
                <p class="font-medium text-red-800 dark:text-red-200">
                  Failed to Load CrUX Data
                </p>
                <p class="text-sm text-red-700 dark:text-red-300 mt-1">
                  Unlighthouse CrUX API is currently unavailable.
                </p>
              </div>
            </div>
          </div>
          <div v-else-if="crux?.exists === false" class="w-full">
            <div class="text-gray-500 text-center inline text-sm">
              No data from Chrome UX report
            </div>
          </div>
          <div v-else class="w-full flex-col flex space-y-5">
            <div>
              <div>
                <a href="https://web.dev/articles/inp" target="_blank" class="transition hover:underline">Interaction to Next Paint (INP)</a>
              </div>
              <div v-if="crux?.inp" class="flex items-center">
                <div class="w-full h-[200px] w-[400px] relative">
                  <CruxGraphInp v-if="crux?.inp" :value="crux.inp" :height="200" />
                </div>
                <div>
                  <div class="text-green-500 font-bold">
                    Good &lt; 200ms
                  </div>
                  <div class="text-yellow-500 font-bold">
                    Needs Improvement 200ms - 500ms
                  </div>
                  <div class="text-red-500 font-bold">
                    Poor &gt; 500ms
                  </div>
                </div>
              </div>
              <div v-else class="inline">
                <div class="inline text-gray-500 text-center w-full text-sm">
                  No data
                </div>
              </div>
            </div>
            <div>
              <div><a href="https://web.dev/articles/cls" target="_blank" class="transition hover:underline">Cumulative Layout Shift (CLS)</a></div>
              <div v-if="crux?.cls" class="flex items-center">
                <div class="w-full h-[200px] w-[400px] relative">
                  <CruxGraphCls v-if="crux?.cls" :value="crux.cls" :height="200" />
                </div>
                <div>
                  <div class="text-green-500 font-bold">
                    Good &lt; 0.1
                  </div>
                  <div class="text-yellow-500 font-bold">
                    Needs Improvement 0.1 - 0.25
                  </div>
                  <div class="text-red-500 font-bold">
                    Poor &gt; 0.25
                  </div>
                </div>
              </div>
              <div v-else class="inline">
                <div class="text-gray-500 inline text-center w-full text-sm">
                  No data
                </div>
              </div>
            </div>
            <div>
              <div>
                <a href="https://web.dev/articles/lcp" target="_blank" class="transition hover:underline">Largest Contentful Paint (LCP)</a>
              </div>
              <div v-if="crux?.lcp" class="flex items-center">
                <div class="w-full h-[200px] w-[400px] relative">
                  <CruxGraphLcp v-if="crux?.lcp" :value="crux.lcp" :height="200" />
                </div>
                <div>
                  <div class="text-green-500 font-bold">
                    Good &lt; 2.5s
                  </div>
                  <div class="text-yellow-500 font-bold">
                    Needs Improvement 2.5s - 4s
                  </div>
                  <div class="text-red-500 font-bold">
                    Poor &gt; 4s
                  </div>
                </div>
              </div>
              <div v-else class="inline">
                <div class="text-gray-500 text-center inline w-full text-sm">
                  No data
                </div>
              </div>
            </div>
          </div>
        </div>
        <template v-else-if="!shouldShowWaitingState">
          <div class="pr-10 pb-1 w-full min-w-1500px">
            <div class="grid grid-cols-12 gap-4 text-sm dark:text-gray-300 text-gray-700">
              <results-table-head
                v-for="(column, key) in resultColumns"
                :key="key"
                :sorting="sorting"
                :column="column"
                @sort="incrementSort"
              />
            </div>
          </div>
          <div class="w-full min-w-1500px pr-3 overflow-y-auto xl:max-h-[calc(100vh-100px)] lg:max-h-[calc(100vh-205px)] sm:max-h-[calc(100vh-220px)] max-h-[calc(100vh-250px)]">
            <div v-if="Object.values(searchResults).length === 0" class="px-4 py-3">
              <template v-if="searchText">
                <p class="mb-2">
                  No results for search "{{ searchText }}"...
                </p>
                <btn-action class="dark:bg-teal-700 bg-blue-100 px-2 text-sm" @click="searchText = ''">
                  Reset Search
                </btn-action>
              </template>
              <template v-else-if="isOffline && !isStatic">
                <div class="flex items-center space-x-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <i-carbon-warning-alt class="text-yellow-600 dark:text-yellow-400 text-xl" />
                  <div>
                    <p class="font-medium text-yellow-800 dark:text-yellow-200">
                      Server Connection Lost
                    </p>
                    <p class="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      The Unlighthouse client is running but cannot connect to the server.
                      Please ensure the Unlighthouse server is running and accessible.
                    </p>
                  </div>
                </div>
              </template>
              <template v-else-if="isStatic && (!window.__unlighthouse_payload?.reports || window.__unlighthouse_payload.reports.length === 0)">
                <div class="flex items-center space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <i-carbon-information class="text-blue-600 dark:text-blue-400 text-xl" />
                  <div>
                    <p class="font-medium text-blue-800 dark:text-blue-200">
                      No Report Data
                    </p>
                    <p class="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      This is a static client build with no report data.
                      Generate reports using the Unlighthouse CLI to see lighthouse results here.
                    </p>
                  </div>
                </div>
              </template>
              <div v-else class="flex items-center">
                <loading-spinner class="mr-2" aria-label="Loading" />
                <div>
                  <p aria-live="polite">
                    Waiting for routes...
                  </p>
                  <span class="text-xs opacity-50">If this hangs consider running Unlighthouse with --debug.</span>
                </div>
              </div>
            </div>
            <div v-else-if="searchText" class="px-4 py-3">
              <p id="search-results-status" aria-live="polite">
                Showing {{ Object.values(searchResults).flat().length }} routes for search "{{ searchText }}":
              </p>
            </div>
            <results-route
              v-for="(report, routeName) in paginatedResults"
              :key="routeName"
              v-memo="[report.route.url, report.report?.categories, report.tasks.runLighthouseTask]"
              :report="report"
            >
              <template #actions>
                <popover-actions position="left">
                  <div class="w-[350px] flex flex-col space-y-3">
                    <btn-basic
                      v-if="report.report"
                      class="flex items-start hover:bg-blue-500 transition children:hover:text-white p-3 rounded"
                      @click="openLighthouseReportIframeModal(report)"
                    >
                      <div style="flex-basis: 70px;" class="mt-1 text-blue-500">
                        <i-vscode-icons-file-type-lighthouse class="text-xl mr-2" />
                      </div>
                      <div class="text-left">
                        <p class="break-none text-base">
                          Open Lighthouse Report
                        </p>
                        <span class="opacity-70 text-xs">
                          Lighthouse HTML report is opened in a modal.
                        </span>
                      </div>
                    </btn-basic>
                    <btn-basic
                      :disabled="isOffline ? 'disabled' : false"
                      class="flex items-start hover:bg-blue-500 transition children:hover:text-white p-3 rounded"
                      @click="rescanRoute(report.route)"
                    >
                      <div style="flex-basis: 70px;" class="mt-1 text-blue-500">
                        <i-mdi-magnify-scan class="text-xl" />
                      </div>
                      <div class="text-left">
                        <p class="break-none text-base">
                          Rescan Route
                        </p>
                        <span class="opacity-70 text-xs">
                          Crawl the route again and generate a fresh report.
                        </span>
                      </div>
                    </btn-basic>
                    <btn-basic
                      v-if="report.report"
                      class="flex items-start hover:bg-blue-500 transition children:hover:text-white p-3 rounded"
                      @click="openPsi(report)"
                    >
                      <div style="flex-basis: 70px;" class="mt-1 text-blue-500">
                        <i-mdi-speedometer class="text-xl" />
                      </div>
                      <div class="text-left">
                        <p class="break-none text-base">
                          Run PageSpeed Insights
                        </p>
                        <span class="opacity-70 text-xs">
                          Get more accurate performance data by running a PageSpeed Insights test.
                        </span>
                      </div>
                    </btn-basic>
                  </div>
                </popover-actions>
              </template>
            </results-route>
            <div v-if="searchResults.length > perPage" class="flex items-center space-x-4 mt-5">
              <Pagination v-model="page" :page-count="perPage" :total="searchResults.length" />
              <div class="opacity-70">
                {{ searchResults.length }} total
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <!-- Waiting state: show clean message instead of broken table -->
          <div class="flex flex-col items-center justify-center py-20 px-4">
            <div class="text-center max-w-md">
              <div class="mb-6">
                <template v-if="isStatic">
                  <i-carbon-information class="text-blue-500 text-4xl mx-auto mb-4" />
                  <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    No Report Data Available
                  </h3>
                  <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    This is a static Unlighthouse client with no report data.
                    Generate reports using the Unlighthouse CLI to see results here.
                  </p>
                </template>
                <template v-else>
                  <i-carbon-warning-alt class="text-yellow-500 text-4xl mx-auto mb-4" />
                  <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    Waiting for Server Connection
                  </h3>
                  <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    The Unlighthouse client is running but cannot connect to the server.
                    Please ensure the Unlighthouse server is running and accessible.
                  </p>
                  <div class="flex items-center justify-center space-x-2 text-sm text-gray-500 dark:text-gray-400 mt-4">
                    <loading-spinner class="w-4 h-4" />
                    <span>Attempting to connect...</span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
    <footer class="block xl:hidden my-2">
      <div class="px-2 text-center xl:text-left">
        <div class="flex items-center justify-around">
          <div class="text-xs opacity-75 xl:mt-4">
            <a href="https://unlighthouse.dev" target="_blank" class="underline">Unlighthouse</a>
          </div>
          <div class="text-xs opacity-75 xl:mt-4">
            Made with <i-simple-line-icons-heart title="Love" class="inline" aria-label="love" /> by <a href="https://twitter.com/harlan_zw" target="_blank" class="underline">@harlan_zw</a>
          </div>
        </div>
        <div class="text-xs opacity-50 xl:mt-4 mt-1">
          Portions of this report use Lighthouse. For more information visit <a href="https://developers.google.com/web/tools/lighthouse" class="underline">here</a>.
        </div>
      </div>
    </footer>
    <TransitionRoot appear :show="isModalOpen" as="template">
      <Dialog as="div" @close="closeIframeModal">
        <DialogOverlay class="fixed inset-0 bg-black opacity-40" />
        <div class="fixed inset-0 z-10 overflow-y-auto">
          <div class="min-h-screen px-4 text-center">
            <TransitionChild
              as="template"
              enter="duration-300 ease-out"
              enter-from="opacity-0"
              enter-to="opacity-100"
              leave="duration-200 ease-in"
              leave-from="opacity-100"
              leave-to="opacity-0"
            >
              <DialogOverlay class="fixed inset-0" />
            </TransitionChild>

            <span class="inline-block h-screen align-middle" aria-hidden="true">
              &#8203;
            </span>

            <TransitionChild
              as="template"
              enter="duration-300 ease-out"
              enter-from="opacity-0 scale-95"
              enter-to="opacity-100 scale-100"
              leave="duration-200 ease-in"
              leave-from="opacity-100 scale-100"
              leave-to="opacity-0 scale-95"
            >
              <div
                class="inline-block w-auto max-w-7xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-teal-900 shadow-xl rounded-2xl"
              >
                <div id="modal-portal" />
                <div v-if="isDebugModalOpen" class="p-5 bg-gray-100">
                  <div class="font-bold mb-3 text-xl">
                    Core
                  </div>
                  <div class="mb-2">
                    Base path: {{ basePath }}
                  </div>
                  <div class="mb-2">
                    API URL: {{ apiUrl }}
                  </div>
                  <div class="font-bold mb-3 mt-5 text-xl">
                    Scan
                  </div>
                  <div class="mb-2">
                    Throttle: {{ throttle }}
                  </div>
                  <div class="mb-2">
                    Device: {{ device }}
                  </div>
                  <div class="mb-2">
                    Dynamic Sampling: {{ dynamicSampling }}
                  </div>
                  <div class="mb-2">
                    Lighthouse Options: <code><pre>{{ lighthouseOptions }}</pre></code>
                  </div>
                  <div class="mb-2">
                    Search Results: <code><pre>{{ searchResults }}</pre></code>
                  </div>
                </div>
                <iframe v-if="iframeModalUrl" :src="iframeModalUrl" class="w-1200px max-w-full h-700px bg-white" />
              </div>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </TransitionRoot>
  </main>
</template>
