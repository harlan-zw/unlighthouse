<script>
import { computed, defineComponent } from 'vue'

const config = {
  wrapper: 'flex items-center -space-x-px',
  base: '',
  rounded: 'first:rounded-s-md last:rounded-e-md',
  default: {
    size: 'sm',
    activeButton: {
      color: 'primary',
    },
    inactiveButton: {
      color: 'white',
    },
    firstButton: {
      color: 'white',
      class: 'rtl:[&_span:first-child]:rotate-180',
      icon: 'i-heroicons-chevron-double-left-20-solid',
    },
    lastButton: {
      color: 'white',
      class: 'rtl:[&_span:last-child]:rotate-180',
      icon: 'i-heroicons-chevron-double-right-20-solid',
    },
    prevButton: {
      color: 'white',
      class: 'rtl:[&_span:first-child]:rotate-180',
      icon: 'i-heroicons-chevron-left-20-solid',
    },
    nextButton: {
      color: 'white',
      class: 'rtl:[&_span:last-child]:rotate-180',
      icon: 'i-heroicons-chevron-right-20-solid',
    },
  },
}
export default defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: {
      type: Number,
      required: true,
    },
    pageCount: {
      type: Number,
      default: 10,
    },
    total: {
      type: Number,
      required: true,
    },
    max: {
      type: Number,
      default: 7,
      validate(value) {
        return value >= 5 && value < Number.MAX_VALUE
      },
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    size: {
      type: String,
      default: () => config.default.size,
      validator(value) {
        return Object.keys(buttonConfig.size).includes(value)
      },
    },
    activeButton: {
      type: Object,
      default: () => config.default.activeButton,
    },
    inactiveButton: {
      type: Object,
      default: () => config.default.inactiveButton,
    },
    showFirst: {
      type: Boolean,
      default: false,
    },
    showLast: {
      type: Boolean,
      default: false,
    },
    firstButton: {
      type: Object,
      default: () => config.default.firstButton,
    },
    lastButton: {
      type: Object,
      default: () => config.default.lastButton,
    },
    prevButton: {
      type: Object,
      default: () => config.default.prevButton,
    },
    nextButton: {
      type: Object,
      default: () => config.default.nextButton,
    },
    divider: {
      type: String,
      default: '\u2026',
    },
    class: {
      type: [String, Object, Array],
      default: () => '',
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const currentPage = computed({
      get() {
        return props.modelValue
      },
      set(value) {
        emit('update:modelValue', value)
      },
    })
    const pages = computed(() => Array.from({ length: Math.ceil(props.total / props.pageCount) }, (_, i) => i + 1))
    const displayedPages = computed(() => {
      const totalPages = pages.value.length
      const current = currentPage.value
      const maxDisplayedPages = Math.max(props.max, 5)
      const r = Math.floor((Math.min(maxDisplayedPages, totalPages) - 5) / 2)
      const r1 = current - r
      const r2 = current + r
      const beforeWrapped = r1 - 1 > 1
      const afterWrapped = r2 + 1 < totalPages
      const items = []
      if (totalPages <= maxDisplayedPages) {
        for (let i = 1; i <= totalPages; i++)
          items.push(i)

        return items
      }
      items.push(1)
      if (beforeWrapped)
        items.push(props.divider)
      if (!afterWrapped) {
        const addedItems = current + r + 2 - totalPages
        for (let i = current - r - addedItems; i <= current - r - 1; i++)
          items.push(i)
      }
      for (let i = Math.max(2, r1); i <= Math.min(totalPages, r2); i++)
        items.push(i)

      if (!beforeWrapped) {
        const addedItems = 1 - (current - r - 2)
        for (let i = current + r + 1; i <= current + r + addedItems; i++)
          items.push(i)
      }
      if (afterWrapped)
        items.push(props.divider)
      if (r2 < totalPages)
        items.push(totalPages)

      if (items.length >= 3 && items[1] === props.divider && items[2] === 3)
        items[1] = 2

      if (items.length >= 3 && items[items.length - 2] === props.divider && items[items.length - 1] === items.length)
        items[items.length - 2] = items.length - 1

      return items
    })
    const canGoFirstOrPrev = computed(() => currentPage.value > 1)
    const canGoLastOrNext = computed(() => currentPage.value < pages.value.length)
    function onClickFirst() {
      if (!canGoFirstOrPrev.value)
        return

      currentPage.value = 1
    }
    function onClickLast() {
      if (!canGoLastOrNext.value)
        return

      currentPage.value = pages.value.length
    }
    function onClickPage(page) {
      if (typeof page === 'string')
        return

      currentPage.value = page
    }
    function onClickPrev() {
      if (!canGoFirstOrPrev.value)
        return

      currentPage.value--
    }
    function onClickNext() {
      if (!canGoLastOrNext.value)
        return

      currentPage.value++
    }
    return {
      ui: {
        wrapper: 'flex items-center -space-x-px',
        base: '',
        rounded: 'first:rounded-s-md last:rounded-e-md',
        default: {
          size: 'sm',
          activeButton: {
            class: 'text-teal-900 dark:text-teal-100 !font-bold underline',
          },
          inactiveButton: {
            color: 'bg-white text-teal-100',
          },
          firstButton: {
            color: 'white',
            class: 'rtl:[&_span:first-child]:rotate-180',
            icon: 'i-heroicons-chevron-double-left-20-solid',
          },
          lastButton: {
            color: 'white',
            class: 'rtl:[&_span:last-child]:rotate-180',
            icon: 'i-heroicons-chevron-double-right-20-solid',
          },
          prevButton: {
            color: 'white',
            class: 'rtl:[&_span:first-child]:rotate-180',
            icon: 'i-heroicons-chevron-left-20-solid',
          },
          nextButton: {
            color: 'white',
            class: 'rtl:[&_span:last-child]:rotate-180',
            icon: 'i-heroicons-chevron-right-20-solid',
          },
        },
      },
      currentPage,
      pages,
      displayedPages,
      canGoLastOrNext,
      canGoFirstOrPrev,
      onClickPrev,
      onClickNext,
      onClickPage,
      onClickFirst,
      onClickLast,
    }
  },
})
</script>

<template>
  <div :class="ui.wrapper">
    <slot name="first" :on-click="onClickFirst">
      <BtnBasic
        v-if="firstButton && showFirst"
        :disabled="!canGoFirstOrPrev || disabled"
        :class="[ui.base, ui.rounded]"
        v-bind="{ ...(ui.default.firstButton || {}), ...firstButton }"
        aria-label="First"
        @click="onClickFirst"
      >
        1
      </BtnBasic>
    </slot>

    <slot name="prev" :on-click="onClickPrev">
      <BtnBasic
        v-if="prevButton"
        :disabled="!canGoFirstOrPrev || disabled"
        :class="[ui.base, ui.rounded]"
        v-bind="{ ...(ui.default.prevButton || {}), ...prevButton }"
        aria-label="Prev"
        @click="onClickPrev"
      >
        <i-carbon-chevron-left />
      </BtnBasic>
    </slot>

    <BtnBasic
      v-for="(page, index) of displayedPages"
      :key="`${page}-${index}`"
      :disabled="disabled"
      v-bind="page === currentPage ? { ...(ui.default.activeButton || {}), ...activeButton } : { ...(ui.default.inactiveButton || {}), ...inactiveButton }"
      :class="[{ 'pointer-events-none': typeof page === 'string', 'z-[1]': page === currentPage }, ui.base, ui.rounded]"
      @click="() => onClickPage(page)"
    >
      {{ page }}
    </BtnBasic>

    <slot name="next" :on-click="onClickNext">
      <BtnBasic
        v-if="nextButton"
        :disabled="!canGoLastOrNext || disabled"
        :class="[ui.base, ui.rounded]"
        v-bind="{ ...(ui.default.nextButton || {}), ...nextButton }"
        aria-label="Next"
        @click="onClickNext"
      >
        <i-carbon-chevron-right />
      </BtnBasic>
    </slot>

    <slot name="last" :on-click="onClickLast">
      <BtnBasic
        v-if="lastButton && showLast"
        :disabled="!canGoLastOrNext || disabled"
        :class="[ui.base, ui.rounded]"
        v-bind="{ ...(ui.default.lastButton || {}), ...lastButton }"
        aria-label="Last"
        @click="onClickLast"
      >
        <i-carbon-chevron-right />
      </BtnBasic>
    </slot>
  </div>
</template>
