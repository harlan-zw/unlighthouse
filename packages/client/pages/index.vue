<script setup lang="ts">
import {
  categoryScores,
  changedTab,
  closeIframeModal,
  iframeModelUrl,
  incrementSort,
  isModalOpen,
  isOffline,
  isStatic,
  openLighthouseReportIframeModal,
  refreshScanMeta,
  rescanRoute,
  resultColumns,
  searchResults,
  searchText,
  sorting,
  tabs,
  wsConnect,
} from '../logic'

if (!isStatic) {
  onMounted(() => {
    wsConnect()
    setInterval(() => {
      refreshScanMeta()
    }, 5000)
  })
}
</script>
<template>
  <NavBar />
  <div class="2xl:flex mt-2">
    <div class="px-3 mr-0 w-full 2xl:(mr-5 w-250px mb-0) mb-3">
      <TabGroup vertical @change="changedTab">
        <TabList class="p-1 dark:(bg-blue-900/20 border-none) border-2 border-blue-900/30 rounded-xl 2xl:(mt-8 block) flex">
          <Tab
            v-for="(category, key) in tabs"
            :key="key"
            v-slot="{ selected }"
            as="template"
          >
            <btn-tab
              :selected="selected"
            >
              <span class="inline-flex items-center">{{ category }}
                <tooltip v-if="category === 'Performance'">
                  <i-carbon-warning class="inline ml-2" />
                  <template #tooltip>
                    Lighthouse is running with variability. Performance scores should not be considered accurate.
                  </template>
                </tooltip>
              </span>
              <metric-guage v-if="category !== 'Overview' && !Number.isNaN(categoryScores[key - 1])" :score="categoryScores[key - 1]" :stripped="true" class="dark:font-bold" :class="selected ? ['dark:bg-teal-900 bg-blue-100 rounded px-2'] : []" />
            </btn-tab>
          </Tab>
        </TabList>
      </TabGroup>
      <div class="hidden 2xl:block">
        <div class="px-2 text-center 2xl:text-left">
          <div class="text-xs opacity-75 2xl:mt-4">
            <a href="https://unlighthouse.dev" target="_blank" class="underline hover:no-underline">Documentation</a>
          </div>
          <div class="text-xs opacity-75 2xl:mt-4">
            Made with <i-simple-line-icons-heart title="Love" class="inline" /> by <a href="https://twitter.com/harlan_zw" target="_blank" class="underline hover:no-underline">@harlan_zw</a>
          </div>
          <div class="text-xs opacity-50 2xl:mt-4 mt-1">
            Portions of this report use Lighthouse. For more information visit <a href="https://developers.google.com/web/tools/lighthouse" class="underline hover:no-underline">here</a>.
          </div>
        </div>
        <lighthouse-three-d />
      </div>
    </div>
    <div class="xl:w-full w-screen overflow-x-auto px-3">
      <div class="pr-10 py-1 w-full min-w-1500px">
        <div class="grid grid-cols-12 gap-4 text-sm dark:(text-gray-300) text-gray-700">
          <results-table-head
            v-for="(column, key) in resultColumns"
            :key="key"
            :sorting="sorting"
            :column="column"
            @sort="incrementSort"
          />
        </div>
      </div>
      <div class="w-full min-w-1500px 2xl:(max-h-[calc(100vh-100px)]) lg:max-h-[calc(100vh-205px)] sm:max-h-[calc(100vh-220px)] max-h-[calc(100vh-250px)] overflow-auto pr-5 mr-4">
        <div v-if="Object.values(searchResults).length === 0" class="px-4 py-3">
          <template v-if="searchText">
            <p class="mb-2">
              No results for search "{{ searchText }}"...
            </p>
            <btn-action class="dark:(bg-teal-700) bg-blue-100 px-2 text-sm" @click="searchText = ''">
              Reset Search
            </btn-action>
          </template>
          <div v-else class="flex items-center">
            <loading-spinner class="mr-2" />
            Waiting for routes...
          </div>
        </div>
        <div v-else-if="searchText" class="px-4 py-3">
          <p>Showing {{ Object.values(searchResults).flat().length }} routes for search "{{ searchText }}":</p>
        </div>
        <results-row
          v-for="(reports, routeName) in searchResults"
          :key="routeName"
          :reports="reports"
          :route-name="routeName"
        >
          <template #actions="{ report }">
            <popover-actions position="left">
              <div class="w-300px flex flex-col space-y-2">
                <btn-basic
                  v-if="report.report"
                  class="flex items-start hover:bg-blue-500 transition children:hover:text-white"
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
                  class="flex items-start hover:bg-blue-500 transition children:hover:text-white"
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
              </div>
            </popover-actions>
          </template>
        </results-row>
      </div>
    </div>
  </div>
  <footer class="block 2xl:hidden my-2">
    <div class="px-2 text-center 2xl:text-left">
      <div class="flex items-center justify-around">
        <div class="text-xs opacity-75 2xl:mt-4">
          <a href="https://unlighthouse.dev" target="_blank" class="underline">Unlighthouse</a>
        </div>
        <div class="text-xs opacity-75 2xl:mt-4">
          Made with <i-simple-line-icons-heart title="Love" class="inline" /> by <a href="https://twitter.com/harlan_zw" target="_blank" class="underline">@harlan_zw</a>
        </div>
      </div>
      <div class="text-xs opacity-50 2xl:mt-4 mt-1">
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
              class="inline-block w-full max-w-7xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:(bg-teal-900) shadow-xl rounded-2xl"
            >
              <div id="modal-portal" />
              <iframe v-if="iframeModelUrl" :src="iframeModelUrl" class="w-full h-700px bg-white" />
            </div>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
