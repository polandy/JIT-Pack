// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { PRESENTED_ATTRIBUTE, markPresentedActionSheets } from '../presented'

describe('markPresentedActionSheets', () => {
  it('marks an action sheet once Ionic says it has presented, not before', () => {
    const root = document.createElement('div')
    const sheet = document.createElement('ion-action-sheet')
    root.appendChild(sheet)
    markPresentedActionSheets(root)

    expect(sheet.hasAttribute(PRESENTED_ATTRIBUTE)).toBe(false)
    sheet.dispatchEvent(new CustomEvent('ionActionSheetDidPresent', { bubbles: true }))
    expect(sheet.getAttribute(PRESENTED_ATTRIBUTE)).toBe('true')
  })

  it('leaves a sheet unmarked when only its will-present has fired', () => {
    const root = document.createElement('div')
    const sheet = document.createElement('ion-action-sheet')
    root.appendChild(sheet)
    markPresentedActionSheets(root)

    sheet.dispatchEvent(new CustomEvent('ionActionSheetWillPresent', { bubbles: true }))
    expect(sheet.hasAttribute(PRESENTED_ATTRIBUTE)).toBe(false)
  })
})
