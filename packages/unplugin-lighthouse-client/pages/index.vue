<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { refetchReports, refetchStats, searchResults, stats, sorting } from '../logic'

const isOpen = ref(false)
const modalReport = ref(false)

const closeModal = () => {
  isOpen.value = false
}
const openModal = (report: any) => {
  modalReport.value = report
  isOpen.value = true
}

const activeTab = ref(0)

const changedTab = (index: number) => {
  activeTab.value = index
}

const resultColumns = computed(() => {
  let columns = [
    {
      label: 'Route Name',
      slot: 'routeName',
      key: 'route.name',
      sortable: true,
    },
    {
      label: 'Score',
      key: 'score',
      cols: activeTab.value === 0 ? 4 : 1,
      sortable: true,
    },
  ]
  if (activeTab.value === 0) {
    columns = [
      ...columns,
      { label: 'Component' },
      { label: 'Screenshot', cols: 2 },
    ]
  }
  else if (activeTab.value === 1) {
    columns = [
      ...columns,
      { cols: 1, label: 'FCP', sortable: true, key: 'report.audits.first-contentful-paint.numericValue' },
      { cols: 1, label: 'TBT', sortable: true, key: 'report.audits.total-blocking-time.numericValue' },
      { cols: 1, label: 'CLS', sortable: true, key: 'report.audits.cumulative-layout-shift.numericValue' },
      { cols: 2, label: 'Requests', sortable: true, key: 'requests' },
      { cols: 2, label: 'Size', sortable: true, key: 'size' },
    ]
  }
  // Accessibility 2
  else if (activeTab.value === 2) {
    columns = [
      ...columns,
      { cols: 4, label: 'Color Contrast' },
      { cols: 3, label: 'Image Alt', sortable: true, key: 'size' },
    ]
  }
  // best practices
  else if (activeTab.value === 3) {
    columns = [
      ...columns,
      { cols: 1, label: 'Console Errors', sortable: true, key: 'size' },
      { cols: 2, label: 'Meta Description' },
    ]
  }
  // SEO
  else if (activeTab.value === 4) {
    columns = [
      ...columns,
      { cols: 1, label: 'Indexable', sortable: true, key: 'size' },
      { cols: 3, label: 'Meta Description' },
      { cols: 3, label: 'Share Previews' },
    ]
  }
  columns.push({ label: 'Actions', slot: 'actions', classes: ['justify-between'] })
  return columns
})

const incrementSort = (key: string) => {
  const currentValue = sorting.value[key]
  if (typeof currentValue === 'undefined')
    sorting.value[key] = 'asc'
  else if (currentValue === 'asc')
    sorting.value[key] = 'desc'
  else
    delete sorting.value[key]
}

onMounted(() => {
  setInterval(() => {
    refetchReports()
    refetchStats()
  }, 10000)
})
</script>
<template>
<div>
  <NavBar />
  <div class="container mx-auto mt-5">
    <div v-if="stats" class="grid grid-cols-3 gap-8 text-lg w-full mb-5">
      <card-route-scan-progress :stats="stats" />
      <card-module-sizes :stats="stats" />
      <card-packages :stats="stats" />
    </div>
    <TabGroup @change="changedTab">
      <TabList class="flex p-1 space-x-1 bg-blue-900/20 rounded-xl mb-2">
        <Tab
            v-for="category in ['Overview', 'Performance', 'Accessibility', 'Best Practices', 'SEO']"
            :key="category"
            v-slot="{ selected }"
            as="template"
        >
          <button
              :class="[
                'w-full py-2.5 text-sm leading-5 font-medium text-blue-700 rounded-lg',
                'focus:outline-none focus:ring-2 ring-offset-2 ring-offset-blue-400 ring-white ring-opacity-60',
                selected
                  ? 'bg-white shadow'
                  : 'text-blue-100 hover:bg-white/[0.12] hover:text-white',
              ]"
          >
            {{ category }}
          </button>
        </Tab>
      </TabList>

      <results-panel>
        <results-table-head
            :columns="resultColumns"
            :sorting="sorting"
            @sort="incrementSort"
        >
          <template #routeName>
          <div class="flex items-center">
            <search-box />
          </div>

          </template>
          <template #actions>
          <button class="self-end justify-self-end bg-gray-900/80 px-2 py-1 mr-2 text-xs rounded-lg flex items-center">
            Collapse All
          </button>
          </template>
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
              :active-tab="activeTab"
              class="mb-3">
            <template #actions="{ report }">
            <div class="flex items-center justify-start">
              <button
                  v-if="report.report"
                  type="button"
                  class="inline-flex items-center mr-2 px-2 py-1 text-sm font-medium text-white bg-black rounded-md bg-opacity-20 hover:bg-opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
                  @click="openModal(report)"
              >
                <i-vscode-icons-file-type-lighthouse class="text-3xl mr-1" />
                Report
              </button>
              <button class="icon-btn text-lg mr-3" title="Refetch" @click="refetch()">
                <i-carbon-renew />
              </button>
              <button class="icon-btn text-lg" title="Refetch" @click="refetch()">
                <i-carbon-trash-can />
              </button>
            </div>
            </template>
          </results-row>
        </results-table-body>
      </results-panel>
    </TabGroup>
  </div>
</div>
<TransitionRoot appear :show="isOpen" as="template">
  <Dialog as="div" @close="closeModal">
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
            <iframe :src="`http://localhost:3000/__routes/api/reports/${modalReport.reportId}`" class="w-full h-700px bg-white"></iframe>
          </div>
        </TransitionChild>
      </div>
    </div>
  </Dialog>
</TransitionRoot>
</template>
