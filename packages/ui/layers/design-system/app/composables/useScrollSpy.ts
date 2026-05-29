import type { MaybeRefOrGetter, Ref } from 'vue'
import { useEventListener, useThrottleFn, useTimeoutFn } from '@vueuse/core'
import { nextTick, onMounted, ref, toValue } from 'vue'

// Define types for the sections
type SectionId = string

interface Section {
  id: SectionId
  label?: string

  [key: string]: any
}

type SectionInput = SectionId | Section

interface ScrollSpyOptions {
  offsetPx?: number
  throttleMs?: number
}

// Return type of the composable
interface ScrollSpyReturn {
  activeSection: Ref<SectionId>
  scrollToSection: (sectionId: SectionId) => void
}

/**
 * A composable for tracking which sections are currently visible in the viewport
 * and providing navigation functionality.
 *
 * `sections` accepts a ref/getter so a dynamic section list (e.g. derived from
 * async content) stays live — it is read via `toValue` on every recalculation
 * rather than captured once at call time.
 *
 * @param sections  The sections to track (reactive)
 * @param options   Configuration options
 * @returns Active section and navigation methods
 */
export function useScrollSpy(sections: MaybeRefOrGetter<SectionInput[]>, options: ScrollSpyOptions = {}): ScrollSpyReturn {
  const {
    offsetPx = -10, // Offset from the top (e.g., for fixed headers)
    throttleMs = 100, // Throttle milliseconds
  } = options

  const activeSection = ref<SectionId>('')
  const isUserScrolling = ref(true) // Assume initial scroll is from user

  /**
   * Get section ID from either string or object
   */
  function getSectionId(section: SectionInput): SectionId {
    return typeof section === 'string' ? section : section.id
  }

  // Re-arm the "programmatic scroll done" flag after a smooth scroll settles.
  // useTimeoutFn auto-cancels on scope dispose so it never fires into a torn-down instance.
  const { start: startResetUserScrolling, stop: stopResetUserScrolling } = useTimeoutFn(() => {
    isUserScrolling.value = true
  }, 1000, { immediate: false })

  /**
   * Scrolls the page to the selected section
   */
  function scrollToSection(sectionId: SectionId): void {
    // Set active section immediately on click
    activeSection.value = sectionId

    // Flag that next scrolls will be programmatic (not user-initiated)
    isUserScrolling.value = false

    const element = document.getElementById(sectionId)
    if (element) {
      // Get element position
      const rect = element.getBoundingClientRect()
      const absoluteTop = window.scrollY + rect.top - offsetPx

      // Scroll with smooth behavior
      window.scrollTo({
        top: absoluteTop,
        behavior: 'smooth',
      })

      // Reset the flag after the smooth scroll is likely complete
      stopResetUserScrolling()
      startResetUserScrolling()
    }
  }

  /**
   * Calculates which section should be active based on scroll position
   */
  function calculateActiveSection(): void {
    // Only calculate if this is user scrolling, not programmatic
    if (!isUserScrolling.value) {
      return
    }

    const sectionList = toValue(sections)

    // Get all sections and their positions
    const sectionElements: { id: string, top: number }[] = []

    sectionList.forEach((section) => {
      const id = getSectionId(section)
      const element = document.getElementById(id)
      if (element) {
        const rect = element.getBoundingClientRect()
        sectionElements.push({
          id,
          top: rect.top,
        })
      }
    })

    // Sort sections by position (top to bottom)
    sectionElements.sort((a, b) => a.top - b.top)

    // Find the first section that is active
    let activeSectionId: string | null

    // First check sections that are in the viewport
    const inViewport = sectionElements.filter(
      section => section.top <= offsetPx && section.top > -100,
    )

    if (inViewport[0]) {
      // If sections are in viewport, select the first one
      activeSectionId = inViewport[0].id
    }
    else {
      // Otherwise, select the last section that's above the viewport
      const aboveViewport = sectionElements.filter(section => section.top <= 0)
      activeSectionId = aboveViewport.at(-1)?.id ?? sectionElements[0]?.id ?? null
    }

    if (activeSectionId) {
      activeSection.value = activeSectionId
    }
    else if (sectionList[0]) {
      // Fallback to first section if nothing else is active
      activeSection.value = getSectionId(sectionList[0])
    }
  }

  // Throttled version of calculateActiveSection
  const throttledCalculateActiveSection = useThrottleFn(calculateActiveSection, throttleMs)

  // Handle user interaction with the page
  function handleUserInteraction() {
    isUserScrolling.value = true
  }

  // Bind listeners synchronously at setup so useEventListener registers its
  // cleanup against the active effect scope (binding inside the async nextTick
  // below would lose the scope and leak the listeners).
  useEventListener(window, 'scroll', throttledCalculateActiveSection, { passive: true })
  useEventListener(window, 'mousedown', handleUserInteraction, { passive: true })
  useEventListener(window, 'keydown', handleUserInteraction, { passive: true })
  useEventListener(window, 'touchstart', handleUserInteraction, { passive: true })

  // Recalculate shortly after mount to catch dynamic content that shifts offsets.
  const { start: startDeferredRecalc } = useTimeoutFn(calculateActiveSection, 300, { immediate: false })

  onMounted(() => {
    // Wait for DOM to be fully rendered before the first measurement
    void nextTick(() => {
      calculateActiveSection()
      startDeferredRecalc()
    })
  })

  return {
    activeSection,
    scrollToSection,
  }
}
