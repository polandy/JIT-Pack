/**
 * Every spec runs on the device the family holds — in Zurich, as the e2e
 * suite does (`playwright.config.ts`). The app formats dates and numbers by
 * the device's region (NFR-4.12), which a browser names through its time
 * zone; without this pin an English date would read 4.10 on one machine and
 * 10/4 on the next. A spec about another region pins its own.
 */
import { beforeEach } from 'vitest'

import { pinDeviceTimeZone } from '@/i18n'

beforeEach(() => pinDeviceTimeZone('Europe/Zurich'))
