// Our photos come as smaller WebP copies (lib/images.ts). A photo added
// without running `npm run images` would show as a broken image.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IMAGE_WIDTHS, sized } from '@/lib/images'

const photos = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? photos(path) : /\.(jpe?g|png)$/i.test(name) ? [path] : []
})

describe('image copies', () => {
  it('exist for every photo, at every width', () => {
    const missing = ['products', 'drops', 'editorial'].flatMap((root) => photos(join('public', root)))
      .flatMap((file) => IMAGE_WIDTHS.map((w) => join('public', sized('/' + file.slice('public/'.length).replace(/\\/g, '/'), w))))
      .filter((copy) => { try { return !statSync(copy).isFile() } catch { return true } })
    expect(missing).toEqual([])
  })

  it('are used only for our own photos', () => {
    expect(sized('/products/tee/tee-black.jpg', 640)).toBe('/products/tee/tee-black-640.webp')
    expect(sized('/editorial/post.png', 1200)).toBe('/editorial/post-1200.webp')
    expect(sized('https://example.com/a.jpg', 640)).toBe('https://example.com/a.jpg')
    expect(sized('data:image/jpeg;base64,xyz', 640)).toBe('data:image/jpeg;base64,xyz')
    expect(sized('/brand/logo-white.png', 640)).toBe('/brand/logo-white.png')
  })
})
