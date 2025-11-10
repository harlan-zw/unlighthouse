#!/bin/bash
# Remove all Icon components from app.vue

sed -i '
# Remove Icon from tab labels - just keep the text
s|<Icon :name="category.icon" class="inline text-sm opacity-40 h-4 w-4" />||g

# Remove warning icon in tooltip - replace with text
s|<Icon name="i-carbon-warning" class="inline text-xs mx-1" />|⚠️|g

# Remove heart icon - replace with emoji
s|<Icon name="i-simple-line-icons-heart" title="Love" class="inline" aria-label="love" />|❤️|g

# Remove info/warning icons in error messages
s|<Icon name="i-carbon-warning" class="text-red-600 dark:text-red-400 text-xl" />||g
s|<Icon name="i-carbon-warning-alt" class="text-yellow-600 dark:text-yellow-400 text-xl" />||g
s|<Icon name="i-carbon-information" class="text-blue-600 dark:text-blue-400 text-xl" />||g
s|<Icon name="i-carbon-information" class="text-blue-500 text-4xl mx-auto mb-4" />||g
s|<Icon name="i-carbon-warning-alt" class="text-yellow-500 text-4xl mx-auto mb-4" />||g
' app.vue
