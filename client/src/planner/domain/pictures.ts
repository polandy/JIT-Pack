/**
 * An idea's pictures (FR-29.5) — pure, like the rest of the board's rules.
 *
 * Up to four per idea, in the order their positions give; the first is the
 * cover, the one the board's card shows. Positions are written by whoever
 * adds or moves a picture, so two devices can leave two pictures on one
 * position: the id then decides, and every device agrees without asking.
 */
import type { IdeaImage } from '@/types/domain'

/** How many pictures an idea carries — the server holds the same number. */
export const MAX_IDEA_IMAGES = 4

/** One idea's pictures, cover first. */
export function ideaPictures(ideaId: string, images: readonly IdeaImage[]): IdeaImage[] {
  return images
    .filter((image) => image.idea_id === ideaId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

/** Whether another picture fits. */
export function canAddPicture(pictures: readonly IdeaImage[]): boolean {
  return pictures.length < MAX_IDEA_IMAGES
}

/** Where a new picture goes: behind the last one, never into a gap. */
export function nextPicturePosition(pictures: readonly IdeaImage[]): number {
  return pictures.reduce((last, image) => Math.max(last, image.position + 1), 0)
}

/** One picture's new place, as a move writes it. */
export interface PictureMove {
  image: IdeaImage
  position: number
}

/**
 * „Als Titelbild": the picture moves to the front and the others keep their
 * order behind it. Only the pictures whose position changes are returned, so
 * the move writes nothing it does not have to — and nothing at all for the
 * cover itself.
 */
export function coverMoves(pictures: readonly IdeaImage[], imageId: string): PictureMove[] {
  const chosen = pictures.find((image) => image.id === imageId)
  if (!chosen) return []
  const order = [chosen, ...pictures.filter((image) => image.id !== imageId)]
  return order
    .map((image, position) => ({ image, position }))
    .filter(({ image, position }) => image.position !== position)
}
