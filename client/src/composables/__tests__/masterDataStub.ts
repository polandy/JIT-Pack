import { ref, type Ref } from 'vue'

/** `masterDataLoaded` plus the ref it answers from (ADR-033). */
export interface MasterDataStub {
  masterDataLoaded: () => boolean
  /**
   * Whether the master partition is pretending to be on the device. Defaults
   * to `true`, so a spec about anything else sees a settled screen; a spec
   * about the guard sets it to `false` and back.
   */
  masterLoaded: Ref<boolean>
}

/**
 * The one orchestrator method every screen with a master-data empty state now
 * calls, for the mount specs whose subject is one of those screens.
 *
 * A ref rather than a plain property for the reason `tripScreenStub` uses a
 * reactive set: each screen reads the answer through a `computed`, and a plain
 * property would leave that computed stuck on whatever the first render saw —
 * a difference from production that lives only in the test.
 */
export function masterDataStub(): MasterDataStub {
  const masterLoaded = ref(true)
  return { masterLoaded, masterDataLoaded: () => masterLoaded.value }
}
