/**
 * A time of day as typed into `TimeField`: digits that become `HH:MM` on the
 * 24-hour clock, whatever the device's locale would make of a native time
 * input (UX-6). Pure, so the rule is read and tested without a field.
 */

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/
const DIGITS_MAX = 4
/** A first digit above this cannot open a two-digit hour: `9` is nine o'clock. */
const TWO_DIGIT_HOUR_MAX_LEAD = '2'

function digitsOf(text: string): string {
  return text.replace(/\D/g, '').slice(0, DIGITS_MAX)
}

/** How many of the digits name the hour while they are typed. */
function hourLength(digits: string): number {
  return digits[0]! > TWO_DIGIT_HOUR_MAX_LEAD ? 1 : 2
}

/** What the field shows while typing: the colon set as soon as the hour is complete. */
export function typedTime(text: string): string {
  let digits = digitsOf(text)
  if (digits === '') return ''
  const hour = hourLength(digits)
  digits = digits.slice(0, hour + 2)
  return digits.length > hour ? `${digits.slice(0, hour)}:${digits.slice(hour)}` : digits
}

/**
 * What the field holds once left: `HH:MM`, split where typing showed the
 * colon, an hour alone as its full hour and a lone minute digit as its ten —
 * or, past the clock, the text as typed, which no caller takes for a time.
 */
export function settledTime(text: string): string {
  const digits = digitsOf(text)
  if (digits === '') return ''
  const hour = Math.min(hourLength(digits), digits.length)
  const minutes = digits.slice(hour, hour + 2).padEnd(2, '0')
  const settled = `${digits.slice(0, hour).padStart(2, '0')}:${minutes}`
  return HH_MM.test(settled) ? settled : text
}
