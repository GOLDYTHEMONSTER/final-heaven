// Size guides (lib/size-guides) and colour swatches (lib/swatches) on the product page.
import { describe, expect, it } from 'vitest'
import { sizeGuideFor, sizeKind } from '@/lib/size-guides'
import { paintsOf, swatchBackground } from '@/lib/swatches'

describe('size guide', () => {
  it('a product’s own chart always wins', () => {
    const own = { headers: ['Size', 'Height (cm)'], rows: [['M', '151-160']] }
    expect(sizeGuideFor({ category: 'Hoodies', sizes: ['M'], sizeChart: own })).toEqual({ chart: own, standard: false })
  })

  it('picks a standard guide by kind', () => {
    expect(sizeKind({ category: 'T-Shirts', sizes: ['S', 'M', 'L', 'XL'] })).toBe('tops')
    expect(sizeKind({ category: 'Pants', name: 'Striped Track Pants', sizes: ['M', 'L'] })).toBe('bottoms')
    expect(sizeKind({ category: 'Ladies', name: 'Tie-Dye Pocket Leggings', sizes: ['S', 'M', 'L'] })).toBe('bottoms')
    expect(sizeKind({ category: 'Ladies', name: 'Rose Tank — Black', sizes: ['XS', 'S'] })).toBe('tops')
    expect(sizeKind({ category: 'Sports', name: 'Half-Finger Gym Gloves', sizes: ['S', 'M', 'L', 'XL'] })).toBe('gloves')
    expect(sizeKind({ category: 'Sports', name: 'Court Sneakers', sizes: ['35', '44'] })).toBe('shoes')
  })

  it('gives none where a standard guide would mislead', () => {
    expect(sizeKind({ category: 'Sports', name: 'Boxing Gloves', sizes: ['6 oz', '8 oz'] })).toBeNull()
    expect(sizeKind({ category: 'Accessories', sizes: ['iPhone 15', 'iPhone 16'] })).toBeNull()
    expect(sizeKind({ category: 'Accessories', sizes: ['One size'] })).toBeNull()
    expect(sizeKind({ category: 'Gadgets', sizes: ['S', 'M'] })).toBeNull()
    expect(sizeGuideFor({ category: 'T-Shirts', sizes: [] })).toBeNull()
  })

  it('cuts the standard guide to the product’s own sizes, in its order', () => {
    const g = sizeGuideFor({ category: 'T-Shirts', sizes: ['M', 'L', '5XL'] })!
    expect(g.standard).toBe(true)
    expect(g.chart.headers).toEqual(['Size', 'Chest (cm)', 'Height (cm)'])
    expect(g.chart.rows.map((r) => r[0])).toEqual(['M', 'L', '5XL'])
    expect(g.chart.rows[0]).toEqual(['M', '88–92', '165–170'])
  })

  it('shoes by foot length, EU 35 = 22.5 cm', () => {
    const g = sizeGuideFor({ category: 'Sports', name: 'Sneakers', sizes: ['35', '40', '45'] })!
    expect(g.chart.rows).toEqual([['35', '22.5'], ['40', '25.0'], ['45', '27.5']])
  })
})

describe('colour swatches', () => {
  it('reads colour names, longest words first', () => {
    expect(paintsOf('Black')).toEqual(['#111111'])
    expect(paintsOf('Rose Gold')).toEqual(['#b76e79'])
    expect(paintsOf('Black Ice Blue')).toEqual(['#111111', '#9fd8f0'])
    expect(paintsOf('Silver / Steel Link')).toEqual(['#c0c2c6'])
    expect(paintsOf('Mint')).toEqual(['#a8e6cf'])
    expect(paintsOf('Petroleum Jelly')).toEqual([])
  })

  it('one colour is flat, two are split, colourful is a rainbow, unknown is none', () => {
    expect(swatchBackground('Navy Blue')).toBe('#1b2a4a')
    expect(swatchBackground('Black & White')).toContain('linear-gradient')
    expect(swatchBackground('Black Colourful')).toContain('conic-gradient')
    expect(swatchBackground('Thunder')).toBeNull()
  })
})

describe('swatch mode', () => {
  it('paint for plain, distinct colours; photos when names repeat a colour or aren’t colours', async () => {
    const { isPlainColour, swatchMode } = await import('@/lib/swatches')
    expect(isPlainColour('Navy Blue')).toBe(true)
    expect(isPlainColour('Black & White')).toBe(true)
    expect(isPlainColour('Thunder Black')).toBe(false)
    expect(isPlainColour('Sky Blue Polka Dot')).toBe(false)
    expect(swatchMode(['Black', 'Blue', 'Red', 'Pink'], new Set())).toBe('paint')
    expect(swatchMode(['Thunder Black', 'Black Contour'], new Set(['Thunder Black', 'Black Contour']))).toBe('photo')
    expect(swatchMode(['Black', 'black'], new Set(['Black', 'black']))).toBe('photo')
    expect(swatchMode(['Thunder Black', 'White'], new Set(['White']))).toBe('mixed')
  })
})
