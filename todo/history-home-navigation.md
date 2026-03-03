# History as Home Page + Navigation

## Current Page Structure
- `/pages/index.vue` - Results page (current home)
- `/pages/history.vue` - Scan history
- `/pages/scan.vue` - Scan progress
- `/pages/onboarding.vue` - URL input

## Goal
- History becomes home (recent scans + CTA to new scan)
- Scan page and results page have back navigation to history

## Files to Modify

### 1. Page Reorganization
- Rename `pages/index.vue` → `pages/results.vue`
- Keep `pages/history.vue` as home logic
- Nuxt creates routes automatically

### 2. pages/history.vue
- Update links from `/` to `/results`
- Keep "New Scan" CTA prominent

### 3. pages/scan.vue (~line 85)
Add back button in header:
```vue
<UButton
  variant="ghost"
  icon="i-heroicons-arrow-left"
  @click="router.push('/history')"
>
  Back
</UButton>
```

### 4. pages/results.vue (current index.vue)
- Add back button to `/history` in header
- Update exit button logic: `router.push('/')` → `router.push('/history')`
- Keyboard shortcut 'h' already goes to history

### 5. middleware/scan-redirect.global.ts
- Update redirects to use `/history` as default
- When scan completes, redirect to `/results?scanId=current`
- Default idle state → `/history` instead of `/onboarding`

### 6. Logo/Home Links
Update all logo links to point to `/history` instead of `/`
