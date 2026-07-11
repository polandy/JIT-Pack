<script setup lang="ts">
/**
 * Avatar pan/zoom crop (FR-17.13). The user drags to reposition and uses
 * the slider to zoom; on confirm the visible circle is rendered to a
 * 256×256 JPEG. All the geometry lives in src/lib/avatarCrop (pure,
 * tested) — this component is the gesture + canvas shell.
 */
import {
  IonModal,
  IonButton,
  IonButtons,
  IonToolbar,
  IonTitle,
  IonRange,
  IonIcon,
} from '@ionic/vue'
import { removeOutline, addOutline } from 'ionicons/icons'
import { ref, watch } from 'vue'
import { coverScale, clampOffset, sourceRect } from '@/lib/avatarCrop'

const props = defineProps<{ open: boolean; file: File | Blob | null }>()
const emit = defineEmits<{ crop: [blob: Blob]; cancel: [] }>()

// Display size of the square crop stage in CSS pixels (output is 256×256).
const VIEWPORT = 260
const OUTPUT = 256

const img = ref<HTMLImageElement | null>(null)
const objectUrl = ref<string | null>(null)
const base = ref(1) // cover scale at zoom 1
const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const scale = () => base.value * zoom.value

function releaseUrl() {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = null
}

// Load the picked file whenever the modal opens; center it at cover scale.
watch(
  () => [props.open, props.file] as const,
  ([open, file]) => {
    if (!open || !file) return
    releaseUrl()
    const url = URL.createObjectURL(file)
    objectUrl.value = url
    const el = new Image()
    el.onload = () => {
      img.value = el
      base.value = coverScale(el.naturalWidth, el.naturalHeight, VIEWPORT)
      zoom.value = 1
      offsetX.value = (VIEWPORT - el.naturalWidth * scale()) / 2
      offsetY.value = (VIEWPORT - el.naturalHeight * scale()) / 2
    }
    el.src = url
  },
  { immediate: true },
)

// --- Pan ---
let dragging = false
let startX = 0
let startY = 0
let startOffsetX = 0
let startOffsetY = 0

function onPointerDown(e: PointerEvent) {
  dragging = true
  startX = e.clientX
  startY = e.clientY
  startOffsetX = offsetX.value
  startOffsetY = offsetY.value
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging || !img.value) return
  const s = scale()
  offsetX.value = clampOffset(
    startOffsetX + (e.clientX - startX),
    img.value.naturalWidth,
    s,
    VIEWPORT,
  )
  offsetY.value = clampOffset(
    startOffsetY + (e.clientY - startY),
    img.value.naturalHeight,
    s,
    VIEWPORT,
  )
}

function onPointerUp() {
  dragging = false
}

// --- Zoom (around the viewport centre so it doesn't drift) ---
function onZoom(next: number) {
  if (!img.value) return
  const oldS = scale()
  zoom.value = next
  const newS = scale()
  const c = VIEWPORT / 2
  offsetX.value = clampOffset(
    c - ((c - offsetX.value) * newS) / oldS,
    img.value.naturalWidth,
    newS,
    VIEWPORT,
  )
  offsetY.value = clampOffset(
    c - ((c - offsetY.value) * newS) / oldS,
    img.value.naturalHeight,
    newS,
    VIEWPORT,
  )
}

function confirm() {
  if (!img.value) return
  const { sx, sy, sw, sh } = sourceRect(scale(), offsetX.value, offsetY.value, VIEWPORT)
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT
  canvas.height = OUTPUT
  canvas.getContext('2d')!.drawImage(img.value, sx, sy, sw, sh, 0, 0, OUTPUT, OUTPUT)
  canvas.toBlob(
    (blob) => {
      if (blob) emit('crop', blob)
      releaseUrl()
    },
    'image/jpeg',
    0.85,
  )
}

function cancel() {
  releaseUrl()
  emit('cancel')
}
</script>

<template>
  <IonModal :is-open="open" @did-dismiss="cancel">
    <IonToolbar>
      <IonTitle>Position photo</IonTitle>
      <IonButtons slot="end">
        <IonButton @click="cancel">Cancel</IonButton>
      </IonButtons>
    </IonToolbar>

    <div class="crop-body">
      <div
        class="stage"
        :style="{ width: `${VIEWPORT}px`, height: `${VIEWPORT}px` }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <img
          v-if="objectUrl"
          :src="objectUrl"
          alt=""
          class="crop-image"
          draggable="false"
          :style="{
            left: `${offsetX}px`,
            top: `${offsetY}px`,
            width: img ? `${img.naturalWidth * scale()}px` : 'auto',
          }"
        />
        <div class="mask" />
      </div>

      <div class="zoom-row">
        <IonIcon :icon="removeOutline" />
        <IonRange
          :min="1"
          :max="3"
          :step="0.01"
          :value="zoom"
          aria-label="Zoom"
          @ionInput="(e: CustomEvent) => onZoom(e.detail.value as number)"
        />
        <IonIcon :icon="addOutline" />
      </div>

      <IonButton expand="block" @click="confirm">Use photo</IonButton>
    </div>
  </IonModal>
</template>

<style scoped>
.crop-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.stage {
  position: relative;
  overflow: hidden;
  touch-action: none;
  background: var(--ion-color-step-100, #1e1e1e);
  border-radius: 8px;
  cursor: grab;
}

.stage:active {
  cursor: grabbing;
}

.crop-image {
  position: absolute;
  user-select: none;
  pointer-events: none;
}

/* Circular cut-out: a huge box-shadow dims everything outside the circle. */
.mask {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  pointer-events: none;
}

.zoom-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 260px;
  color: var(--ion-color-medium);
}

.zoom-row ion-range {
  flex: 1;
}
</style>
