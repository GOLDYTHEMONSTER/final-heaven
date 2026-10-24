// Smaller copies of our own photos. Next's image optimizer is off (see
// next.config.js), so the photos in public/products, drops and editorial come
// as WebP copies at fixed widths, made by `npm run images` and committed.
// tests/unit/images.test.ts fails if a photo is missing its copies.

export const IMAGE_WIDTHS = [640, 1200] as const
export type ImageWidth = (typeof IMAGE_WIDTHS)[number]

const OWN_PHOTO = /^\/(products|drops|editorial)\/.+\.(jpe?g|png)$/i

// Photos uploaded from the admin (app/api/admin/uploads) live in Supabase
// Storage at most 1200 px wide, with a 640 px copy saved beside each one.
export const PRODUCT_IMAGES_BUCKET = 'product-images'
const UPLOADED = new RegExp(`/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/.+\\.jpg$`, 'i')

/** The copy of one of our photos at this width; any other image (pasted links) as it is. */
export function sized(src: string, width: ImageWidth) {
  if (OWN_PHOTO.test(src)) return src.replace(/\.(jpe?g|png)$/i, `-${width}.webp`)
  if (width === 640 && UPLOADED.test(src)) return src.replace(/\.jpg$/i, '-640.jpg')
  return src
}
