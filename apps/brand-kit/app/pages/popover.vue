<script lang="ts" setup>
const menuItems: any = [
  [{ label: 'Edit', icon: 'i-lucide-pencil', kbds: ['⌘', 'E'] }, { label: 'Duplicate', icon: 'i-lucide-copy', kbds: ['⌘', 'D'] }],
  [{ label: 'Move to…', icon: 'i-lucide-folder' }, { label: 'Archive', icon: 'i-lucide-archive' }],
  [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', kbds: ['⌫'] }],
]

const filterItems: any = [
  [{ label: 'All sites', checked: true }, { label: 'Indexed only' }, { label: 'With issues' }, { label: 'Pending sync' }],
]
</script>

<template>
  <div class="space-y-10">
    <KitHeader
      eyebrow="Components"
      title="Popover + dropdown"
      description="Popovers, dropdown menus, select menus. Polish targets: chrome consistency with tooltip, menu item hover ring, divider rendering, keyboard navigation."
    />

    <KitSection title="UDropdownMenu · row actions">
      <div class="border border-default rounded-md p-6 flex items-center gap-4">
        <UDropdownMenu :items="menuItems">
          <UiButton size="sm" purpose="secondary" trailing-icon="i-lucide-chevron-down">
            Row actions
          </UiButton>
        </UDropdownMenu>
        <span class="text-xs text-muted">Click to open. Tab through items, arrow keys navigate, Esc dismisses.</span>
      </div>
    </KitSection>

    <KitSection title="UDropdownMenu · filter list with checked state">
      <div class="border border-default rounded-md p-6">
        <UDropdownMenu :items="filterItems">
          <UiButton size="sm" purpose="secondary" trailing-icon="i-lucide-filter">
            Filter
          </UiButton>
        </UDropdownMenu>
      </div>
    </KitSection>

    <KitSection title="UiPopover · rich content body (click mode)">
      <div class="border border-default rounded-md p-6">
        <UiPopover mode="click" :content="{ side: 'bottom', align: 'start' }">
          <UiButton size="sm" purpose="secondary">
            Open popover
          </UiButton>
          <template #panel>
            <div class="p-4 max-w-xs space-y-2">
              <div class="text-sm font-semibold">
                Popover title
              </div>
              <p class="text-xs text-muted">
                Rich, interactive content that can hold links, inputs, even nested popovers. Unlike tooltips, the body is hoverable and focusable.
              </p>
              <div class="flex justify-end gap-2 pt-2">
                <UiButton size="xs" purpose="quiet">
                  Cancel
                </UiButton>
                <UiButton size="xs" purpose="cta">
                  Confirm
                </UiButton>
              </div>
            </div>
          </template>
        </UiPopover>
      </div>
    </KitSection>

    <KitSection title="UiPopover · sides">
      <div class="border border-default rounded-md p-10 grid grid-cols-4 gap-4">
        <UiPopover v-for="side in ['top', 'bottom', 'left', 'right'] as const" :key="side" mode="click" :content="{ side }">
          <UiButton block size="sm" purpose="secondary">
            {{ side }}
          </UiButton>
          <template #panel>
            <div class="p-3 text-xs">
              Anchored {{ side }}
            </div>
          </template>
        </UiPopover>
      </div>
    </KitSection>

    <KitSection title="USelectMenu · single">
      <div class="border border-default rounded-md p-6 max-w-xs">
        <USelectMenu
          :items="['All sites', 'Indexed only', 'With issues', 'Pending sync', 'Archived']"
          default-value="All sites"
          class="w-full"
        />
      </div>
    </KitSection>
  </div>
</template>
