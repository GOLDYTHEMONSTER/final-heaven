// Smaller copies of our own photos. Next's image optimizer is off (see
// next.config.js), so the photos in public/products, drops and editorial come
// as WebP copies at fixed widths, made by `npm run images` and committed.
// tests/unit/images.test.ts fails if a photo is missing its copies.

export const IMAGE_WIDTHS = [640, 1200] as const
export type ImageWidth = (typeof IMAGE_WIDTHS)[number]

const OWN_PHOTO = /^\/(products|drops|editorial)\/.+\.(jpe?g|png)$/i

/** The copy of one of our photos at this width; any other image (admin uploads, links) as it is. */
export function sized(src: string, width: ImageWidth) {
  return OWN_PHOTO.test(src) ? src.replace(/\.(jpe?g|png)$/i, `-${width}.webp`) : src
}
