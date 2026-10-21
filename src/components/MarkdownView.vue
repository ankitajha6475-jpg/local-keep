<template>
  <div ref="root" v-html="html"></div>
</template>

<script setup>
import { nextTick, onMounted, onUpdated, ref, watch } from 'vue'
import { renderMermaidBlocks } from '../utils/mermaid.js'

const props = defineProps({
  html: { type: String, default: '' }
})

const root = ref(null)

async function hydrate() {
  await nextTick()
  if (root.value) await renderMermaidBlocks(root.value)
}

watch(() => props.html, hydrate)
onMounted(hydrate)
onUpdated(hydrate)
</script>
