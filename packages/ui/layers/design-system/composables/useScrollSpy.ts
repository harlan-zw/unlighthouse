import type { Ref } from 'vue'
import { useThrottleFn } from '@vueuse/core'
import { nextTick, onMounted, ref } from 'vue'

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
 * and providing navigation functionality
 *
 * @param sections  The sections to track
 * @param options   Configuration options
 * @returns Active section and navigation methods
 */
export function useScrollSpy(sections: SectionInput[], options: ScrollSpyOptions = {}): ScrollSpyReturn {
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

      // Reset the flag after scrolling animation is likely to be complete
      setTimeout(() => {
        isUserScrolling.value = true
      }, 1000) // Typical smooth scroll takes less than 1000ms
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

    // Get all sections and their positions
    const sectionElements: { id: string, top: number }[] = []

    sections.forEach((section) => {
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
    else if (sections[0]) {
      // Fallback to first section if nothing else is active
      activeSection.value = getSectionId(sections[0])
    }
  }

  // Throttled version of calculateActiveSection
  const throttledCalculateActiveSection = useThrottleFn(calculateActiveSection, throttleMs)

  // Handle user interaction with the page
  function handleUserInteraction() {
    isUserScrolling.value = true
  }

  // Setup handlers
  onMounted(() => {
    // Wait for DOM to be fully rendered
    void nextTick(() => {
      // Add scroll event listener
      window.addEventListener('scroll', throttledCalculateActiveSection, { passive: true })

      // Listen for user interaction
      window.addEventListener('mousedown', handleUserInteraction, { passive: true })
      window.addEventListener('keydown', handleUserInteraction, { passive: true })
      window.addEventListener('touchstart', handleUserInteraction, { passive: true })

      // Calculate initial section
      calculateActiveSection()

      // Also recalculate after a short delay to handle any dynamic content loading
      setTimeout(calculateActiveSection, 300)
    })
  })

  // Clean up
  onUnmounted(() => {
    window.removeEventListener('scroll', throttledCalculateActiveSection)
    window.removeEventListener('mousedown', handleUserInteraction)
    window.removeEventListener('keydown', handleUserInteraction)
    window.removeEventListener('touchstart', handleUserInteraction)
  })

  return {
    activeSection,
    scrollToSection,
  }
}
