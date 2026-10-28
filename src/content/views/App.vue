<script setup lang="ts">
import Logo from '@/assets/crx.svg'
import { ref } from 'vue'

const show = ref(false)
const toggle = () => show.value = !show.value
</script>

<template>
  <div class="popup-container">
    <div
      v-show="show"
      class="popup-content tg-surface"
      :class="show ? 'opacity-100' : 'opacity-0'"
    >
      <h1>HELLO CRXJS + Touch GRAAAASSS!</h1>
    </div>
    <button
      class="tg-button-round"
      @click="toggle()"
    >
      <img :src="Logo" alt="CRXJS logo" class="button-icon">
    </button>
  </div>
</template>

<style scoped>
.popup-container {
  position: fixed;
  right: 0;
  bottom: 0;
  margin: 1.25rem;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  font-family: ui-sans-serif, system-ui, sans-serif;
  user-select: none;
  line-height: 1em;
}

.popup-content {
  width: max-content;
  height: min-content;
  margin: auto var(--tg-space-sm) 0 0;
  transition: opacity 300ms;
}

.button-icon {
  padding: 4px;
}
</style>
