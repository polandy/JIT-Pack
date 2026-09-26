<script setup lang="ts">
/**
 * The app's bottom-sheet chrome, once (§3.25 consistency directive): the
 * modal variables, the scroll box and the grab handle every sheet presents.
 *
 * The body is a plain box rather than an `IonContent` on purpose: inside an
 * auto-height modal an `IonContent` has no intrinsic height to give, so the
 * sheet sizes itself to nothing and swallows the taps meant for its own
 * controls — M7's kind chooser paid for that once, and its comment is why
 * this component keeps the box.
 *
 * **M4's filter sheet** is 86 % of the viewport rather than as tall as its
 * content, so its body has to scroll on its own and its handle is a
 * different width and shade — `height` and `grab` exist for exactly that
 * one caller. They are the only two dimensions the filter sheet's chrome
 * differs on (a 2 px shift in the shared values reflows it by 4 217 px);
 * a caller that passes `height` also owns its
 * own scrolling body — `.sheet-box` only constrains height at the default,
 * because a sized sheet's content decides that instead (`IonContent` there
 * already does, and stacking two scroll containers would fight over the
 * wheel/touch event Ionic hands to only one of them).
 */
import { ref } from 'vue'
import { IonModal } from '@ionic/vue'

/*
 * Two roots on purpose — a hidden marker, then the modal. Ionic moves a
 * presented inline modal out to the app root and does not put it back, so a
 * sheet that has been open once no longer stands where Vue left it. A
 * sibling that appears later with `v-if` is inserted *before* the next
 * sibling's element, and if that element is the moved modal the insert
 * throws (`insertBefore … not a child of this node`) and the whole patch is
 * lost — M25's selection bar would never come back after its batch sheet.
 * With two roots the component is a fragment whose start marker
 * stays in place, and on unmount Vue still removes the modal wherever it is.
 */
defineOptions({ inheritAttrs: false })

import { PRESENTED_ATTRIBUTE } from '@/lib/presented'

withDefaults(
  defineProps<{
    isOpen: boolean
    /** Put on the modal, for a case that has to address this sheet. */
    testid?: string
    /** Ionic's `--height`. `'auto'` sizes to content; a sized sheet scrolls its own body. */
    height?: string
    /** `'wide'` is the filter sheet's own handle, kept pixel-identical to before the fold. */
    grab?: 'default' | 'wide'
  }>(),
  { testid: undefined, height: 'auto', grab: 'default' },
)
const emit = defineEmits<{ dismiss: []; present: [] }>()

/*
 * Rendered, because a test has to see it: Ionic's enter animation is a
 * duration nobody controls (measured at 2.9 s on a loaded WebKit), and what a
 * sheet's content can do before it ends is not what it can do after —
 * `ion-datetime` readies itself only once the sheet has landed. The
 * attribute is the presentation as a state, not as an event that was missed.
 */
const presented = ref(false)

function onPresent() {
  presented.value = true
  emit('present')
}

function onDismiss() {
  presented.value = false
  emit('dismiss')
}
</script>

<template>
  <span class="sheet-marker" hidden></span>
  <IonModal
    v-bind="$attrs"
    :is-open="isOpen"
    class="sheet-modal"
    :style="{ '--height': height }"
    :data-testid="testid"
    :[PRESENTED_ATTRIBUTE]="presented || undefined"
    @did-dismiss="onDismiss"
    @did-present="onPresent"
  >
    <div class="sheet-box" :class="{ sized: height !== 'auto' }">
      <div class="grab" :class="{ wide: grab === 'wide' }" />
      <slot />
    </div>
  </IonModal>
</template>

<style scoped>
.sheet-modal {
  --border-radius: var(--jp-r-lg) var(--jp-r-lg) 0 0;
  --background: var(--ct-mantle);
  --box-shadow: var(--jp-shadow-sheet);
  --backdrop-opacity: 0.62;
  align-items: flex-end;
}

.sheet-box {
  max-height: 85vh;
  overflow-y: auto;
}

/*
 * A sized sheet (M4's filter, `height="86%"`) fills the modal instead of
 * scrolling as a box: its slotted content is an `IonContent` that already
 * owns the scroll, and a second scrolling ancestor around it would leave
 * Ionic's wheel/touch handling contested between the two.
 */
.sheet-box.sized {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: none;
  overflow: visible;
}

.grab {
  width: 36px;
  height: 4px;
  margin: 10px auto 4px;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface1);
  flex: none;
}

/* The filter sheet's own handle. */
.grab.wide {
  width: 38px;
  margin: 10px auto 2px;
  background: var(--ct-surface2);
}
</style>
