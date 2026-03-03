# Tab Switching Bug

## Current Behavior/Bug
Tab navigation (Overview/Performance/Accessibility/Best Practices/SEO) appears in UI but clicking tabs doesn't change main content view.

## Root Cause
1. `activeTab` state in `composables/state.ts` line 7 is initialized but never updated
2. Sidebar tabs use `activeCategory` for filtering routes
3. Data table columns use `activeTab` via `resultColumns` computed in `columns.ts`
4. **No sync between `activeCategory` and `activeTab`**

## Files to Modify
1. `packages/ui/composables/state.ts` - activeTab state
2. `packages/ui/pages/index.vue` - tab click handlers (lines 539-550)
3. `packages/ui/composables/columns.ts` - resultColumns uses activeTab (line 52)

## Fix Approach

Sync activeTab with activeCategory. Map:
- 'overview' → 0
- 'performance' → 1
- 'accessibility' → 2
- 'best-practices' → 3
- 'seo' → 4

Update button click handler in `index.vue` line 546:
```vue
@click="activeCategory = key; categoryScoreFilter = null; activeTab = index"
```

Or add a watcher to sync automatically when `activeCategory` changes.

Also verify keyboard shortcuts (lines 207-214) update both values.

---

## Work Log (2026-01-08)

### Investigation

1. **Found wrong file reference**: todo mentioned `index.vue` but actual results page is `results.vue`

2. **Analyzed `results.vue`**:
   - `activeCategory` is local ref (line 155)
   - `activeTab` imported from state.ts (line 13)
   - `setActiveCategory()` already syncs both (lines 188-192):
     ```ts
     function setActiveCategory(cat: typeof activeCategory.value) {
       activeCategory.value = cat
       activeTab.value = categoryKeys.indexOf(cat)
       categoryScoreFilter.value = null
     }
     ```
   - Sidebar buttons correctly call `setActiveCategory` (line 562)
   - Keyboard shortcuts (1-5) also call `setActiveCategory` (lines 214-218)

3. **Found actual bug**:
   - The sync between `activeTab` and `activeCategory` was already working
   - Real issue: results grid (lines 689-718) always showed ALL 4 category scores
   - Switching tabs only affected filtering/sorting, not visual display
   - `ResultsRoute.vue` component uses `resultColumns` but `results.vue` has its own grid

### Fix Applied

Modified `results.vue` scores display (lines 689-747):
- **Overview mode**: Shows all 4 category scores (original behavior)
- **Category mode**: Shows single large score for selected category
  - Larger score badge (w-14 h-14 / w-16 h-16)
  - Category label below score
  - Comparison delta badges still work

### Changes Made

**File**: `/home/harlan/pkg/unlighthouse/packages/ui/pages/results.vue`
- Wrapped score display in `<template v-if="activeCategory === 'overview'">` for all-scores view
- Added `<template v-else>` for single-category view with larger score display
- Both modes support comparison delta badges

### Status: COMPLETE

Tab switching now visually changes content:
- Overview tab: 4 small score badges per route
- Category tabs: 1 large score badge for selected category
