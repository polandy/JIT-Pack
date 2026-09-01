// @vitest-environment jsdom
/**
 * FR-17.13 — the avatar crop modal.
 *
 * The geometry is pure and covered in `lib/__tests__/avatarCrop.spec.ts`;
 * what is pinned here is the shell around it: the placement, the two exits and
 * the four localized strings.
 *
 * This header used to say the modal "opens only behind a native file dialog,
 * so no Playwright project can drive it". That was wrong — `setInputFiles`
 * fills a hidden `<input type=file>` with no dialog — and it kept E2E-M17-12
 * closed while the rendered stage carried a defect **this layer cannot see**:
 * the assertions below read the inline `width` style, and Ionic's global
 * `img { max-width: 100% }` then clamped it in the browser. The case that can
 * see it is `e2e/single/settings-profile.spec.ts`.
 *
 * Two of these are leak checks rather than feature checks. `createObjectURL`
 * hands out a reference the browser keeps alive until it is revoked, and both
 * exits — confirming and cancelling — have to release it. That is invisible on
 * screen and only shows up as memory a long session never gives back, which is
 * exactly the kind of rule a test has to hold instead of a reviewer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import AvatarCropModal from '../AvatarCropModal.vue'
import { setLocale, t } from '@/i18n'

const OBJECT_URL = 'blob:jitpack/avatar'

/** A landscape source: the shorter edge (200) is what cover scale fills. */
const IMAGE_WIDTH = 400
const IMAGE_HEIGHT = 200

let drawImage: ReturnType<typeof vi.fn>
let croppedBlob: Blob

/**
 * `new Image()` never loads in jsdom, so the component's `onload` would never
 * fire. The stub resolves it on assignment to `src` — synchronously, so the
 * test asserts a settled state instead of waiting for one.
 */
function stubImage(width = IMAGE_WIDTH, height = IMAGE_HEIGHT): void {
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null
      naturalWidth = width
      naturalHeight = height
      set src(_value: string) {
        this.onload?.()
      }
    },
  )
}

beforeEach(() => {
  setLocale('en')
  drawImage = vi.fn()
  croppedBlob = new Blob(['jpeg'], { type: 'image/jpeg' })
  stubImage()
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => OBJECT_URL),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(croppedBlob),
  )
})

/**
 * `IonModal` mounts its content through the web component, which never
 * upgrades under jsdom — the real one renders an empty `<ion-modal>`. The
 * stub stands in for the container only; everything asserted below is the
 * component's own markup inside it.
 */
const ModalStub = {
  name: 'IonModal',
  emits: ['didDismiss'],
  template: '<div><slot /></div>',
}

/**
 * Ionic's `IonButton` takes `expand` as a prop, so it never reaches the DOM
 * under jsdom — the confirm button is found by its label instead, which also
 * keeps the selector honest about which control is meant.
 */
function confirmButton(wrapper: ReturnType<typeof mountModal>) {
  const button = wrapper.findAll('ion-button').find((b) => b.text() === t('avatarCrop.use'))
  if (!button) throw new Error('the crop modal rendered no confirm button')
  return button
}

function mountModal(file: Blob | null = new Blob(['source'], { type: 'image/png' })) {
  return mount(AvatarCropModal, {
    props: { open: true, file },
    global: { stubs: { IonModal: ModalStub } },
  })
}

describe('AvatarCropModal', () => {
  it('places the picked image at cover scale, centred on the stage', async () => {
    const wrapper = mountModal()
    await nextTick()

    // Cover scale is 260/200 = 1.3, so the 400px edge renders 520px wide and
    // overhangs the stage by 130px on each side.
    const style = wrapper.get('img.crop-image').attributes('style')
    expect(style).toContain('width: 520px')
    expect(style).toContain('left: -130px')
    expect(style).toContain('top: 0px')
  })

  it('crops the visible circle and emits the rendered blob', async () => {
    const wrapper = mountModal()
    await nextTick()

    await confirmButton(wrapper).trigger('click')

    // The visible square is 260/1.3 = 200 source pixels, starting 100 in.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 200, 200, 0, 0, 256, 256)
    expect(wrapper.emitted('crop')).toEqual([[croppedBlob]])
  })

  it('releases the object URL after a successful crop', async () => {
    const wrapper = mountModal()
    await nextTick()

    await confirmButton(wrapper).trigger('click')

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL)
  })

  it('releases the object URL when the crop is abandoned', async () => {
    const wrapper = mountModal()
    await nextTick()

    wrapper.findComponent(ModalStub).vm.$emit('didDismiss')
    await nextTick()

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL)
  })

  it('emits nothing when confirmed before an image has loaded', async () => {
    const wrapper = mountModal(null)
    await nextTick()

    await confirmButton(wrapper).trigger('click')

    // Positive signal beside the absent event: the canvas was never asked to draw.
    expect(drawImage).not.toHaveBeenCalled()
    expect(wrapper.emitted('crop')).toBeUndefined()
  })

  it('takes its labels from the catalogue in both languages (NFR-4.12)', async () => {
    const wrapper = mountModal()
    await nextTick()

    expect(wrapper.text()).toContain(t('avatarCrop.title'))
    expect(wrapper.text()).toContain(t('avatarCrop.use'))
    // Guards the key rather than the language: 'Zoom' is the same word in both
    // catalogues, so no rendered assertion can tell a hardcoded one apart from
    // a looked-up one. The two labels below carry the language switch.
    expect(wrapper.get('ion-range').attributes('aria-label')).toBe(t('avatarCrop.zoom'))

    setLocale('de')
    await nextTick()

    // Asserted against the German entries, so an English string left in place
    // fails here instead of passing as "some text is present".
    expect(wrapper.text()).toContain('Foto ausrichten')
    expect(wrapper.text()).toContain('Foto verwenden')
  })
})
