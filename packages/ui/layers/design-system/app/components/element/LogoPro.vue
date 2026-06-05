<script setup lang="ts">
</script>

<template>
  <svg viewBox="0 0 64 64" class="pop-quick w-7 h-7" aria-hidden="true">
    <defs>
      <linearGradient id="wmLine2" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="var(--ui-color-primary-600)" />
        <stop offset="100%" stop-color="var(--ui-color-primary-300)" />
      </linearGradient>
      <linearGradient id="wmFill2" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="var(--ui-color-primary-600)" stop-opacity="0.6" />
        <stop offset="100%" stop-color="var(--ui-color-primary-600)" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path
      class="fill"
      d="M8 52 Q20 48 24 36 T40 20 T56 12 L56 56 L8 56 Z"
      fill="url(#wmFill2)"
    />
    <path
      class="line"
      d="M8 52 Q20 48 24 36 T40 20 T56 12"
      fill="none"
      stroke="url(#wmLine2)"
      stroke-width="4"
      stroke-linecap="round"
    />
    <circle class="node" cx="56" cy="12" r="6" fill="url(#wmLine2)" />
  </svg>
  <span class="-ml-1 text-highlighted text-lg font-bold tracking-tight slide-right font-display">
    Nuxt<span class="ml-1 text-pro-600 dark:text-pro-400">SEO Pro</span>
  </span>
</template>

<style>
@keyframes drawLine {
  0% { stroke-dashoffset: 100; }
  100% { stroke-dashoffset: 0; }
}
@keyframes revealFill {
  0% { clip-path: inset(0 100% 0 0); }
  100% { clip-path: inset(0 0% 0 0); }
}
@keyframes popNode {
  0%, 70% { opacity: 0; transform: scale(0); }
  85% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.pop-quick .line {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: drawLine 0.8s ease-out forwards;
}
.pop-quick .fill {
  clip-path: inset(0 100% 0 0);
  animation: revealFill 0.4s ease-out forwards;
}
.pop-quick .node {
  opacity: 0;
  transform-origin: 56px 12px;
  animation: popNode 0.6s ease-out forwards;
}

@media (prefers-reduced-motion: reduce) {
  .pop-quick .line { animation: none; stroke-dashoffset: 0; }
  .pop-quick .fill { animation: none; clip-path: none; }
  .pop-quick .node { animation: none; opacity: 1; transform: none; }
}
</style>
