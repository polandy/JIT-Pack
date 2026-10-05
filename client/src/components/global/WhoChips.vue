<script setup lang="ts">
/**
 * A row of chips saying whom something is for: *Alle*, then each traveller
 * (FR-31.3's who goes, FR-29.15's whom an entry is for). It draws the choice
 * and reports the next one; the rule a tap follows is `lib/whoGoes.ts`'s.
 */
import ChoiceChip from '@/components/global/ChoiceChip.vue'
import { toggleWho } from '@/lib/whoGoes'
import type { Traveler } from '@/types/domain'

const props = defineProps<{
  travelers: readonly Traveler[]
  /** Null for everybody; the people named otherwise. */
  who: readonly string[] | null
  /** The words on the everybody chip. */
  allLabel: string
  /** The screen's half of every `data-testid` — `m27` gives `who-m27-Sia` and `who-all-m27`. */
  testKey: string
}>()

const emit = defineEmits<{ update: [who: string[] | null] }>()

function named(id: string): boolean {
  return props.who !== null && props.who.includes(id)
}
</script>

<template>
  <div class="chips" :data-testid="`who-${testKey}`">
    <ChoiceChip
      :pressed="who === null"
      :data-testid="`who-all-${testKey}`"
      @click="emit('update', null)"
    >
      {{ allLabel }}
    </ChoiceChip>
    <ChoiceChip
      v-for="traveler in travelers"
      :key="traveler.id"
      :pressed="named(traveler.id)"
      :data-testid="`who-${testKey}-${traveler.name}`"
      @click="emit('update', toggleWho(who, traveler.id, travelers))"
    >
      {{ traveler.name }}
    </ChoiceChip>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
