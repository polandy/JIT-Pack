/**
 * Two decodable PNGs for the photo cases, differing in *shape* rather than
 * in colour: the scaler keeps the aspect ratio (FR-22.3), so the rendered
 * `naturalWidth` is a signal about the bytes behind a picture — an object
 * URL changes whether or not the bytes did. Both are far under every cap;
 * the backoff itself is measured where it is deterministic, in
 * `lib/__tests__/imageResize.spec.ts`.
 */
export const WIDE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAQCAIAAADrtar6AAAAIElEQVR4nGO4o6ExIIhh1OJRi0ctHrV41OJRi0cthiEAX9ruH4ZT4goAAAAASUVORK5CYII=',
  'base64',
)
/** {@link WIDE_PNG}'s width. */
export const WIDE_PNG_WIDTH = 40

export const TALL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAoCAIAAAB4uO32AAAAIElEQVR4nGPQsLlDEmIY1TCqYVTDqIZRDaMaRjXQSwMAeQMgLkk8R3gAAAAASUVORK5CYII=',
  'base64',
)
/** {@link TALL_PNG}'s width. */
export const TALL_PNG_WIDTH = 16
