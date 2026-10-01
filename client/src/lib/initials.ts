/**
 * A person's one or two letters — the avatar's ground, a person's mark on a
 * map (FR-29.19): the first letters of two words, or the first two of one,
 * punctuation dropped; `?` where nothing is left.
 */
export function initialsOf(name: string | null | undefined, seed?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  const source = words[0] ?? seed ?? ''
  return (
    source
      .replace(/[^\p{L}\p{N}]/gu, '')
      .slice(0, 2)
      .toUpperCase() || '?'
  )
}
