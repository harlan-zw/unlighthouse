<template>
<div class="w-600px bg-blue-900/20 rounded mx-auto mt-10">
  <form class="p-5" @submit="$emit('submit')">
    <div class="mb-2">
    <label>Site URL</label>
    </div>
    <input type="url" placeholder="https://" class="w-full mb-4 rounded text-blue-900" />
    <button class="bg-blue-900/50 text-white px-3 py-2 rounded">Submit</button>
  </form>
</div>
</template>
