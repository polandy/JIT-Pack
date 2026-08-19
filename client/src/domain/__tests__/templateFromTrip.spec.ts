/**
 * M21 — folding a finished trip back into templates (§3.27, FR-27.5).
 * Recognition is a fact of the provenance data, not a question to the user.
 */
import { describe, expect, it } from 'vitest'

import {
  planTemplateFromTrip,
  recogniseTripComposition,
  suggestTemplateName,
} from '../templateFromTrip'
import type {
  RecognitionInput,
  TemplateFromTripWrites,
  WritePlanInput,
} from '../templateFromTrip'
import type { MasterItem, Template, TemplateItem, TripItem } from '@/types/domain'

function template(id: string, name: string, kind: Template['kind'] = 'group'): Template {
  return { id, owner_id: 'user-a', name, kind }
}

function master(id: string, name: string): MasterItem {
  return { id, name, weight_grams: null, value_cents: null }
}

function position(id: string, templateId: string, itemId: string): TemplateItem {
  return {
    id,
    template_id: templateId,
    item_id: itemId,
    quantity: 1,
    assignment: 'trip_global',
    dedup: 'max',
    conditions: null,
    default_mode: 'pack',
    late_packer: false,
  }
}

function row(id: string, name: string, sourceTemplateId: string | null): TripItem {
  return {
    id,
    trip_id: 'trip-1',
    source_item_id: null,
    source_template_id: sourceTemplateId,
    name,
    weight_grams: null,
    value_cents: null,
    category_name: null,
    quantity: 1,
    packed_count: 1,
    state: 'packed',
    mode: 'pack',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '1',
  }
}

describe('recogniseTripComposition (FR-27.5)', () => {
  const makro = template('grp-makro', 'Makro Fotografie')
  const wildlife = template('grp-wild', 'Wildlife')
  const vorlage = template('tpl-ferien', 'Ferien Samedan', 'template')
  const items = [master('itm-1', 'Stativ'), master('itm-2', 'Ringlicht'), master('itm-3', 'Zelt')]

  it('TripRowsFoldIntoTheGroupTheyCameFrom_ByProvenance', () => {
    const result = recogniseTripComposition({
      tripItems: [row('r1', 'Stativ', 'grp-makro'), row('r2', 'Zelt', null)],
      templates: [makro],
      positions: [position('p1', 'grp-makro', 'itm-1')],
      masterItems: items,
    })

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]!.group.id).toBe('grp-makro')
    expect(result.groups[0]!.tripItems.map((r) => r.id)).toEqual(['r1'])
    expect(result.loose.map((l) => l.tripItem.id)).toEqual(['r2'])
    expect(result.loose[0]!.reason).toBe('ad-hoc')
  })

  it('RowTheGroupDoesNotContain_IsReportedAsAddedOnTheTrip', () => {
    const result = recogniseTripComposition({
      tripItems: [row('r1', 'Stativ', 'grp-makro'), row('r2', 'Gimbal', 'grp-makro')],
      templates: [makro],
      positions: [position('p1', 'grp-makro', 'itm-1')],
      masterItems: items,
    })

    expect(result.groups[0]!.added.map((r) => r.name)).toEqual(['Gimbal'])
    expect(result.groups[0]!.absent).toEqual([])
  })

  it('GroupPositionMissingFromTheTrip_IsReportedAsAbsent', () => {
    const result = recogniseTripComposition({
      tripItems: [row('r1', 'Stativ', 'grp-makro')],
      templates: [makro],
      positions: [position('p1', 'grp-makro', 'itm-1'), position('p2', 'grp-makro', 'itm-2')],
      masterItems: items,
    })

    expect(result.groups[0]!.absent).toEqual(['Ringlicht'])
    expect(result.groups[0]!.added).toEqual([])
  })

  it('NameMatchIsCaseAndWhitespaceTolerant_SoATripRowIsNotAFalseDeviation', () => {
    const result = recogniseTripComposition({
      tripItems: [row('r1', '  stativ ', 'grp-makro')],
      templates: [makro],
      positions: [position('p1', 'grp-makro', 'itm-1')],
      masterItems: items,
    })

    expect(result.groups[0]!.added).toEqual([])
    expect(result.groups[0]!.absent).toEqual([])
  })

  it('RowFromAFerienVorlage_IsLooseNotRecognised_BecauseFR271ForbidsTheReference', () => {
    const result = recogniseTripComposition({
      tripItems: [row('r1', 'Reisepass', 'tpl-ferien')],
      templates: [vorlage],
      positions: [],
      masterItems: items,
    })

    expect(result.groups).toEqual([])
    expect(result.loose[0]!.reason).toBe('from-template')
    expect(result.loose[0]!.sourceTemplate?.name).toBe('Ferien Samedan')
  })

  it('RowWhoseProvenanceThisDeviceCannotResolve_IsLooseRatherThanAFabricatedGroup', () => {
    const result = recogniseTripComposition({
      tripItems: [row('r1', 'Stativ', 'grp-unsynced')],
      templates: [makro],
      positions: [],
      masterItems: items,
    })

    expect(result.groups).toEqual([])
    expect(result.loose[0]!.reason).toBe('ad-hoc')
    expect(result.loose[0]!.sourceTemplate).toBeNull()
  })

  it('GroupsAreOrderedByName_SoTwoDevicesAgree', () => {
    const result = recogniseTripComposition({
      tripItems: [row('r1', 'Fernglas', 'grp-wild'), row('r2', 'Stativ', 'grp-makro')],
      templates: [wildlife, makro],
      positions: [],
      masterItems: items,
    })

    expect(result.groups.map((g) => g.group.name)).toEqual(['Makro Fotografie', 'Wildlife'])
  })

  it('PurelyAdHocTrip_YieldsNoGroupsAndDegradesToTheLooseList', () => {
    const result = recogniseTripComposition({
      tripItems: [row('r1', 'Zelt', null), row('r2', 'Schlafsack', null)],
      templates: [makro],
      positions: [],
      masterItems: items,
    })

    expect(result.groups).toEqual([])
    expect(result.loose).toHaveLength(2)
  })

  it('TripWithoutLooseRows_YieldsAnEmptyLooseList', () => {
    const result = recogniseTripComposition({
      tripItems: [row('r1', 'Stativ', 'grp-makro')],
      templates: [makro],
      positions: [position('p1', 'grp-makro', 'itm-1')],
      masterItems: items,
    })

    expect(result.loose).toEqual([])
    expect(result.groups).toHaveLength(1)
  })

  it('PositionWhoseMasterItemHasNotSynced_IsNotReportedAsAbsent', () => {
    // "not loaded ≠ empty" (ADR-016): an unnamed position cannot be compared,
    // and claiming the trip left it behind would be a guess.
    const result = recogniseTripComposition({
      tripItems: [row('r1', 'Stativ', 'grp-makro')],
      templates: [makro],
      positions: [position('p1', 'grp-makro', 'itm-1'), position('p9', 'grp-makro', 'itm-gone')],
      masterItems: items,
    })

    expect(result.groups[0]!.absent).toEqual([])
  })
})

describe('suggestTemplateName (FR-27.5)', () => {
  it('BumpsTheYearInTheTripName', () => {
    expect(suggestTemplateName('Samedan Sommer 2026')).toBe('Samedan Sommer 2027')
  })

  it('BumpsOnlyTheFirstYear_SoARangeKeepsItsShape', () => {
    expect(suggestTemplateName('Sabbatical 2026 bis 2027')).toBe('Sabbatical 2027 bis 2027')
  })

  it('NameWithoutAYear_StandsAsItIs', () => {
    expect(suggestTemplateName('Wochenende Berge')).toBe('Wochenende Berge')
  })

  it('DoesNotTreatALongerNumberAsAYear', () => {
    expect(suggestTemplateName('Tour 12345')).toBe('Tour 12345')
  })
})

describe('planTemplateFromTrip (FR-27.5)', () => {
  const makro = template('grp-makro', 'Makro Fotografie')
  const wildlife = template('grp-wild', 'Wildlife')
  const items = [master('itm-1', 'Stativ'), master('itm-2', 'Ringlicht')]

  function compose(over: Partial<RecognitionInput> = {}) {
    return recogniseTripComposition({
      tripItems: [],
      templates: [makro, wildlife],
      positions: [position('p1', 'grp-makro', 'itm-1')],
      masterItems: items,
      ...over,
    })
  }

  function plan(over: Partial<WritePlanInput>): TemplateFromTripWrites {
    return planTemplateFromTrip({
      composition: compose(),
      templateName: 'Samedan Sommer 2027',
      choices: {},
      checkedLooseIds: [],
      bundleName: null,
      masterItems: items,
      ...over,
    })
  }

  it('RecognisedGroupsAreReferencedNotCopied_EvenWithoutDeviations', () => {
    const writes = plan({
      composition: compose({ tripItems: [row('r1', 'Stativ', 'grp-makro')] }),
    })

    expect(writes.template.includeGroupIds).toEqual(['grp-makro'])
    // The group's own position is not repeated as an own position.
    expect(writes.template.positions).toEqual([])
    expect(writes.groupUpdates).toEqual([])
  })

  it('DeviationDefaultsToFlowingBackIntoItsGroup_WithoutAnExplicitChoice', () => {
    const writes = plan({
      composition: compose({
        tripItems: [row('r1', 'Stativ', 'grp-makro'), row('r2', 'Gimbal', 'grp-makro')],
      }),
    })

    expect(writes.groupUpdates).toHaveLength(1)
    expect(writes.groupUpdates[0]!.groupId).toBe('grp-makro')
    expect(writes.groupUpdates[0]!.positions.map((p) => p.name)).toEqual(['Gimbal'])
    expect(writes.template.positions).toEqual([])
  })

  it('DeviationMarkedOwn_StaysInTheNewVorlageAndLeavesTheGroupUntouched', () => {
    const writes = plan({
      composition: compose({
        tripItems: [row('r1', 'Stativ', 'grp-makro'), row('r2', 'Gimbal', 'grp-makro')],
      }),
      choices: { 'grp-makro': 'own' },
    })

    expect(writes.groupUpdates).toEqual([])
    expect(writes.template.positions.map((p) => p.name)).toEqual(['Gimbal'])
  })

  it('AbsentGroupPositionsChangeNothing_SoAnIncompleteTripCannotErodeTheGroup', () => {
    const writes = plan({
      composition: compose({
        tripItems: [row('r1', 'Stativ', 'grp-makro')],
        positions: [position('p1', 'grp-makro', 'itm-1'), position('p2', 'grp-makro', 'itm-2')],
      }),
    })

    expect(writes.groupUpdates).toEqual([])
    expect(writes.template.positions).toEqual([])
  })

  it('OnlyCheckedLooseRowsBecomeOwnPositions', () => {
    const writes = plan({
      composition: compose({ tripItems: [row('r1', 'Zelt', null), row('r2', 'Buch', null)] }),
      checkedLooseIds: ['r1'],
    })

    expect(writes.template.positions.map((p) => p.name)).toEqual(['Zelt'])
  })

  it('BundleToggleSendsTheLooseRowsIntoAFreshGroupTheVorlageIncludes', () => {
    const writes = plan({
      composition: compose({ tripItems: [row('r1', 'Zelt', null)] }),
      checkedLooseIds: ['r1'],
      bundleName: 'Samedan Extras',
    })

    expect(writes.newGroup?.name).toBe('Samedan Extras')
    expect(writes.newGroup?.positions.map((p) => p.name)).toEqual(['Zelt'])
    expect(writes.template.positions).toEqual([])
  })

  it('BundleToggleIsInertWithoutCheckedRows_NoEmptyGroupIsCreated', () => {
    const writes = plan({
      composition: compose({ tripItems: [row('r1', 'Zelt', null)] }),
      checkedLooseIds: [],
      bundleName: 'Samedan Extras',
    })

    expect(writes.newGroup).toBeNull()
  })

  it('AdHocNameMatchingTheInventory_FoldsOntoTheExistingMasterItem', () => {
    const writes = plan({
      composition: compose({ tripItems: [row('r1', 'stativ', null)] }),
      checkedLooseIds: ['r1'],
    })

    expect(writes.template.positions).toEqual([{ name: 'Stativ', itemId: 'itm-1' }])
    expect(writes.newMasterItems).toEqual([])
  })

  it('UnknownAdHocName_CreatesTheMasterItemFirst', () => {
    const writes = plan({
      composition: compose({ tripItems: [row('r1', 'Gimbal', null)] }),
      checkedLooseIds: ['r1'],
    })

    expect(writes.newMasterItems).toEqual(['Gimbal'])
    expect(writes.template.positions).toEqual([{ name: 'Gimbal', itemId: null }])
  })

  it('TwoRowsOfOneName_LeaveOnlyOneNewMasterItemBehind', () => {
    const writes = plan({
      composition: compose({
        tripItems: [row('r1', 'Gimbal', null), row('r2', 'gimbal ', null)],
      }),
      checkedLooseIds: ['r1', 'r2'],
    })

    expect(writes.newMasterItems).toEqual(['Gimbal'])
    expect(writes.template.positions.map((p) => p.name)).toEqual(['Gimbal', 'Gimbal'])
  })

  it('GeneratedRowUsesItsOwnProvenance_RatherThanReMatchingItsNameByHand', () => {
    const generated = { ...row('r1', 'Ringlicht', 'grp-makro'), source_item_id: 'itm-2' }
    const writes = plan({
      composition: compose({ tripItems: [generated] }),
    })

    expect(writes.groupUpdates[0]!.positions).toEqual([{ name: 'Ringlicht', itemId: 'itm-2' }])
    expect(writes.newMasterItems).toEqual([])
  })
})
