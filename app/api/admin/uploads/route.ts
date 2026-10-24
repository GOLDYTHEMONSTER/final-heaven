import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, requestIdOf } from '@/lib/api'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { PRODUCT_IMAGES_BUCKET } from '@/lib/images'

export const dynamic = 'force-dynamic'

// The admin resizes photos before uploading (lib/admin/upload.ts), so each
// part is a JPEG well under this. Matches the bucket's file_size_limit.
const MAX_BYTES = 1_500_000

/** A JPEG part of the form, checked by its bytes, not by what the browser says it is. */
async function jpegPart(form: FormData, field: string) {
  const file = form.get(field)
  if (!(file instanceof Blob) || file.size === 0) throw new BadRequest('Choose a photo to upload.')
  if (file.size > MAX_BYTES) throw new BadRequest('That photo is too large. Try a smaller one.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new BadRequest('Photos must be JPEG images.')
  return bytes
}

/**
 * Stores a product photo and its 640 px card copy (sized() in lib/images
 * finds the copy by name) and returns the photo's public URL.
 */
export const POST = handle('admin.uploads.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied

  const form = await req.formData().catch(() => { throw new BadRequest('Upload the photo as form data.') })
  const [image, card] = await Promise.all([jpegPart(form, 'image'), jpegPart(form, 'card')])

  const path = `${staff.tenant.tenantId}/${randomUUID()}`
  const bucket = createSupabaseServiceClient().storage.from(PRODUCT_IMAGES_BUCKET)
  const put = (name: string, bytes: Uint8Array) => bucket.upload(name, bytes, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })

  const main = await put(`${path}.jpg`, image)
  if (main.error) throw main.error
  const copy = await put(`${path}-640.jpg`, card)
  if (copy.error) {
    await bucket.remove([`${path}.jpg`])
    throw copy.error
  }

  const url = bucket.getPublicUrl(`${path}.jpg`).data.publicUrl
  await audit({ tenantId: staff.tenant.tenantId, action: 'product.image_uploaded', entityType: 'product_image', entityId: path,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { bytes: image.length + card.length } })
  return NextResponse.json({ url }, { status: 201 })
})
