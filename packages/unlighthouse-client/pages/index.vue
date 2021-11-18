<script setup lang="ts">
import {
  changedTab,
  rescanRoute,
  refetchStats,
  searchResults,
  sorting,
  wsConnect,
  Sorting,
  categoryScores,
  tabs,
  isIframeModalOpen,
  iframeModelUrl,
  openLighthouseReportIframeModal,
  closeIframeModal,
  openTreemapReportIframeModal
} from '../logic'


const incrementSort = (key: string) => {
  const val = sorting.value as Sorting

  // increment the sort
  if (val.key === key) {

    const sort = val.dir
    if (typeof sort === 'undefined')
      sorting.value.dir = 'asc'
    else if (sort === 'asc')
      sorting.value.dir = 'desc'
    else
      sorting.value = {}
  } else {
    sorting.value.key = key
    sorting.value.dir = 'asc'
  }
}

onMounted(() => {
  wsConnect()
  setInterval(() => {
    refetchStats()
  }, 5000)
})
</script>
<template>
<div>
  <NavBar />
  <div class="container mx-auto mt-2">
    <TabGroup @change="changedTab">
      <TabList class="flex p-1 space-x-1 bg-blue-900/20 rounded-xl mb-2">
        <Tab
            v-for="(category, key) in tabs"
            :key="key"
            v-slot="{ selected }"
            as="template"
        >
          <button
              :class="[
                  'flex items-center justify-around w-full py-2 text-sm leading-5 font-medium text-blue-700 rounded-lg',
                  'focus:outline-none focus:ring-1 ring-offset-blue-400 ring-white ring-opacity-60',
                  selected
                    ? 'bg-blue-900 text-blue-300 shadow'
                    : 'text-blue-100 hover:bg-white/[0.12] hover:text-white',
                ]"
          >
            {{ category }}
            <metric-guage v-if="category !== 'Overview' && !Number.isNaN(categoryScores[key - 1])" :score="categoryScores[key - 1]" stripped class="ml-3 font-bold text-sm" />
          </button>
        </Tab>
      </TabList>

      <results-panel>
        <results-table-head
            :sorting="sorting"
            @sort="incrementSort"
        >
        </results-table-head>
        <results-table-body>
          <div v-if="searchResults.length === 0" class="px-4 py-3">
            Waiting for route data..
          </div>
          <results-row
              v-for="(reports, routeName) in searchResults"
              v-else
              :key="routeName"
              :reports="reports"
              :route-name="routeName"
          >
            <template #actions="{ report }">
            <Popover v-slot="{ open }" class="relative flex items-center justify-end">
              <PopoverButton
                  :class="open ? '' : 'text-opacity-90'"
                  class="inline-flex items-center px-2 py-1 text-sm font-medium text-white bg-teal-700 rounded-md group hover:text-opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
              >
                <span>Actions</span>
                <i-carbon-chevron-down
                    :class="open ? '' : 'text-opacity-70'"
                    class="w-5 h-5 ml-2 text-teal-500 transition duration-150 ease-in-out group-hover:text-opacity-80"
                    aria-hidden="true"
                />
              </PopoverButton>

              <transition
                  enter-active-class="transition duration-200 ease-out"
                  enter-from-class="translate-y-1 opacity-0"
                  enter-to-class="translate-y-0 opacity-100"
                  leave-active-class="transition duration-150 ease-in"
                  leave-from-class="translate-y-0 opacity-100"
                  leave-to-class="translate-y-1 opacity-0"
              >
                <PopoverPanel
                    class="absolute z-10 px-4 mt-3 transform -translate-x-[100%] left-1/2 sm:px-0"
                >
                  <div
                      class="overflow-hidden rounded-lg shadow-lg ring-1 ring-black ring-opacity-5"
                  >
                    <div class="relative p-5 bg-teal-900">
                      <div class="text-xs uppercase opacity-40 mb-1 mt-3">
                        Reports
                      </div>
                      <div class="flex items-center justify-start">
                        <button
                            v-if="report.report"
                            type="button"
                            class="whitespace-nowrap inline-flex items-center mr-2 px-2 py-1 text-sm font-medium text-white bg-black rounded-md bg-opacity-20 hover:bg-opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
                            @click="openLighthouseReportIframeModal(report)"
                        >
                          <i-vscode-icons-file-type-lighthouse class="text-xl mr-2" />
                          Open Lighthouse Report
                        </button>
                        <button
                            v-if="report.report"
                            type="button"
                            class="whitespace-nowrap inline-flex items-center mr-2 px-2 py-1 text-sm font-medium text-white bg-black rounded-md bg-opacity-20 hover:bg-opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
                            @click="openTreemapReportIframeModal(report)"
                        >
                          <i-carbon-chart-treemap class="text-sm mr-2 opacity-50" />
                          Open Treemap Report
                        </button>
                      </div>
                      <div class="text-xs uppercase opacity-40 mb-1 mt-3">
                        Actions
                      </div>
                      <button
                          v-if="report.report"
                          type="button"
                          class="whitespace-nowrap inline-flex items-center mr-2 px-2 py-1 text-sm font-medium text-white bg-black rounded-md bg-opacity-20 hover:bg-opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
                          @click="rescanRoute(report.route)"
                      >
                        <i-carbon-renew class="text-sm mr-2  opacity-50" />
                        Rescan Route
                      </button>
                    </div>
                  </div>
                </PopoverPanel>
              </transition>
            </Popover>
            </template>
          </results-row>
        </results-table-body>
      </results-panel>
    </TabGroup>
  </div>
</div>
<TransitionRoot appear :show="isIframeModalOpen" as="template">
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
              class="inline-block w-full max-w-3xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl"
          >
            <iframe :src="iframeModelUrl" class="w-full h-700px bg-white"></iframe>
          </div>
        </TransitionChild>
      </div>
    </div>
  </Dialog>
</TransitionRoot>
</template>
