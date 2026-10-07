<script setup lang="ts">
/**
 * The startup greeting (FR-21.29, G-22): the brand mark is packed — the bag
 * drawn, the two cubes dropped in, the wordmark under it — and then flies to
 * the logo the first screen shows, so the greeting turns into the app rather
 * than leaving it. Without a logo to land on (a cold start into a drill-down,
 * whose bar shows ‹ back) it fades instead.
 *
 * It plays over the booting app, never before it: the app mounts underneath
 * from the first frame, so the greeting hides start-up time rather than
 * adding to it. A tap or a key ends it at once. Under
 * `prefers-reduced-motion` the mark stands still and the overlay fades.
 *
 * The phases are timers, not `animationend`: a test drives them with
 * Playwright's clock, and an intro the browser never paints (a background
 * tab) still hands over.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import {
  SPLASH_FLIGHT_AT_MS,
  SPLASH_LEAVE_MS,
  SPLASH_REDUCED_AT_MS,
  SPLASH_REDUCED_LEAVE_MS,
  SPLASH_TARGET_ATTR,
  flightTransform,
} from '@/lib/splash'

const emit = defineEmits<{ done: [] }>()

type Phase = 'intro' | 'flight' | 'fade'

/** While set on the root, the landing mark is hidden so the flying one arrives in its place. */
const LANDING_HIDDEN_CLASS = 'jp-splash-landing'

/** The wordmark letter by letter, so the intro can raise them one after another. */
const WORDMARK = ['J', 'I', 'T', '·', 'P', 'a', 'c', 'k']
const WORDMARK_DOT = 3

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const leaveMs = reduced ? SPLASH_REDUCED_LEAVE_MS : SPLASH_LEAVE_MS

const phase = ref<Phase>('intro')
const mark = ref<SVGSVGElement | null>(null)
const timers: ReturnType<typeof setTimeout>[] = []
let ended = false

function landingMark(): Element | null {
  const target = document.querySelector(`[${SPLASH_TARGET_ATTR}]`)
  return target && target.getBoundingClientRect().width > 0 ? target : null
}

function leave(): void {
  const target = reduced ? null : landingMark()
  const from = mark.value?.getBoundingClientRect()
  // A mark without a box (never laid out) has no scale to fly by.
  if (target && mark.value && from && from.width > 0) {
    mark.value.style.transform = flightTransform(from, target.getBoundingClientRect())
    phase.value = 'flight'
  } else {
    document.documentElement.classList.remove(LANDING_HIDDEN_CLASS)
    phase.value = 'fade'
  }
  timers.push(setTimeout(end, leaveMs))
}

function end(): void {
  if (ended) return
  ended = true
  timers.forEach(clearTimeout)
  document.documentElement.classList.remove(LANDING_HIDDEN_CLASS)
  emit('done')
}

onMounted(() => {
  if (!reduced) document.documentElement.classList.add(LANDING_HIDDEN_CLASS)
  timers.push(setTimeout(leave, reduced ? SPLASH_REDUCED_AT_MS : SPLASH_FLIGHT_AT_MS))
  window.addEventListener('keydown', end)
})

onUnmounted(() => {
  window.removeEventListener('keydown', end)
  end()
})
</script>

<template>
  <div
    class="splash"
    data-testid="splash"
    :data-phase="phase"
    :style="{ '--splash-leave': `${leaveMs}ms` }"
    aria-hidden="true"
    @click="end"
  >
    <!-- BrandMark's geometry, in parts the intro can move one by one. -->
    <svg ref="mark" class="splash-mark" viewBox="88 96 336 336">
      <rect class="cube cube-moss" x="156" y="128" width="96" height="72" rx="18" />
      <rect class="cube cube-larch" x="268" y="112" width="80" height="88" rx="18" />
      <rect
        class="bag"
        x="136"
        y="196"
        width="240"
        height="220"
        rx="52"
        pathLength="1"
        stroke-width="32"
      />
      <path
        class="bag pocket"
        d="M180 414 V348 q0 -26 26 -26 h100 q26 0 26 26 v66"
        pathLength="1"
        stroke-width="24"
      />
    </svg>
    <div class="splash-word">
      <span
        v-for="(letter, i) in WORDMARK"
        :key="i"
        :class="{ dot: i === WORDMARK_DOT }"
        :style="{ '--i': i }"
        >{{ letter }}</span
      >
    </div>
  </div>
</template>

<style scoped>
.splash {
  position: fixed;
  inset: 0;
  /* Above Ionic's overlays (20000+): a sheet restored at boot opens under the greeting, not over it. */
  z-index: 40000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  /* The OS launch screen's colour (manifest background_color), so one hands over to the other unseen. */
  background-color: var(--ct-base);
  transition: background-color var(--splash-leave) cubic-bezier(0.2, 0.8, 0.2, 1);
  cursor: pointer;
}

.splash-mark {
  width: 152px;
  height: 152px;
  overflow: visible;
  transform-origin: 0 0;
  transition: transform var(--splash-leave) cubic-bezier(0.65, 0, 0.35, 1);
}

.cube-moss {
  fill: var(--ct-moss);
  animation: drop 420ms 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.cube-larch {
  fill: var(--ct-larch);
  animation: drop 420ms 540ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.bag {
  fill: none;
  stroke: var(--ct-lupine);
  stroke-linejoin: round;
  stroke-dasharray: 1;
  animation: draw 520ms cubic-bezier(0.65, 0, 0.35, 1) both;
}

.pocket {
  animation: draw 340ms 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

/* The lockup of the app bar's wordmark (AppHeader), at the display size. */
.splash-word {
  display: flex;
  color: var(--ct-text);
  font-family: var(--jp-font-ui);
  font-weight: var(--jp-weight-bold);
  font-size: var(--jp-text-display-xl);
  letter-spacing: var(--jp-tracking-tight);
  transition: opacity calc(var(--splash-leave) * 0.4) linear;
}

.splash-word span {
  display: inline-block;
  animation: rise 260ms calc(700ms + var(--i) * 35ms) cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.splash-word .dot {
  color: var(--ion-color-primary);
}

.splash[data-phase='flight'] {
  background-color: transparent;
  pointer-events: none;
}

.splash[data-phase='flight'] .splash-word {
  opacity: 0;
}

.splash[data-phase='fade'] {
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--splash-leave) cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes draw {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes drop {
  from {
    transform: translateY(-260px);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  75% {
    transform: translateY(14px);
  }
  to {
    transform: none;
    opacity: 1;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cube,
  .bag,
  .splash-word span {
    animation: none;
  }

  .splash-mark,
  .splash {
    transition: none;
  }

  .splash[data-phase='fade'] {
    transition: opacity var(--splash-leave) linear;
  }
}
</style>

<style>
/* Unscoped: the landing mark lives in another component (AppHeader, M19). */
.jp-splash-landing [data-splash-target] {
  visibility: hidden;
}
</style>
