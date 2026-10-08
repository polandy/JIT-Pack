import type { InjectionKey } from 'vue'

import type { ActivityReaders } from '@/domain/activityReader'

/** Where the composition root (`App.vue`) binds each module's {@link ActivityReaders}. */
export const ACTIVITY_READERS = Symbol('activityReaders') as InjectionKey<ActivityReaders>
