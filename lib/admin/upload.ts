'use client'

// Product photo uploads from the admin. The photo is resized in the browser
// first, so even a 12 MP phone photo uploads as a few hundred KB, and stored
// with a 640 px copy for shop cards (see sized() in lib/images).

const QUALITY = 0.85

async function jpeg(bitmap: ImageBitmap, maxWidth: number): Promise<Blob> {
  const scale = Math.min(1, maxWidth / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser can’t prepare photos for upload.')
  ctx.fillStyle = '#ffffff' // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t prepare the photo.'))), 'image/jpeg', QUALITY))
}

/** Uploads a photo and returns its URL for the product's images. */
export async function uploadProductImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`${file.name} isn’t a photo this browser can read. Use a JPEG, PNG or WebP.`)
  })
  try {
    const body = new FormData()
    body.append('image', await jpeg(bitmap, 1200), 'image.jpg')
    body.append('card', await jpeg(bitmap, 640), 'card.jpg')
    const res = await fetch('/api/admin/uploads', { method: 'POST', body })
    const data = await res.json().catch(() => null)
    if (!res.ok || typeof data?.url !== 'string') throw new Error(data?.error || 'The photo didn’t upload. Please try again.')
    return data.url
  } finally {
    bitmap.close()
  }
}
