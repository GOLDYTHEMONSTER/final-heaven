// The product page's spec table and size chart (lib/product-tables).
import { describe, expect, it } from 'vitest'
import { checkSizeChart, checkSpecs, parseSizeChart, parseSpecs } from '@/lib/product-tables'

describe('spec table', () => {
  it('keeps clean rows and drops empty ones when reading what is stored', () => {
    expect(parseSpecs([{ label: ' Connector ', value: 'USB Type-C' }, { label: 'Empty', value: ' ' }, null, 'x'])).toEqual([{ label: 'Connector', value: 'USB Type-C' }])
    expect(parseSpecs('nope')).toEqual([])
    expect(parseSpecs(null)).toEqual([])
  })

  it('numbers are fine as values', () => {
    expect(parseSpecs([{ label: 'Weight (g)', value: 47 }])).toEqual([{ label: 'Weight (g)', value: '47' }])
  })

  it('on a write, refuses what it would otherwise drop', () => {
    expect(checkSpecs([{ label: 'A', value: 'b' }])).toEqual({ value: [{ label: 'A', value: 'b' }] })
    expect(checkSpecs(null)).toEqual({ value: [] })
    expect(checkSpecs([{ label: 'A', value: '' }])).toHaveProperty('error')
    expect(checkSpecs('x')).toHaveProperty('error')
    expect(checkSpecs([{ label: 'Colour', value: 'a' }, { label: 'colour', value: 'b' }])).toHaveProperty('error')
    expect(checkSpecs(Array.from({ length: 31 }, (_, i) => ({ label: `L${i}`, value: 'v' })))).toHaveProperty('error')
  })
})

describe('size chart', () => {
  const chart = { unit: 'cm', headers: ['Size', 'Chest', 'Length'], rows: [['M', '104', '68'], ['L', 108, '70']] }

  it('reads a chart, as text', () => {
    expect(parseSizeChart(chart)).toEqual({ unit: 'cm', headers: ['Size', 'Chest', 'Length'], rows: [['M', '104', '68'], ['L', '108', '70']] })
  })

  it('needs two or more headed columns and at least one full row', () => {
    expect(parseSizeChart(null)).toBeNull()
    expect(parseSizeChart({ headers: ['Size'], rows: [['M']] })).toBeNull()
    expect(parseSizeChart({ headers: ['Size', ''], rows: [['M', '1']] })).toBeNull()
    expect(parseSizeChart({ headers: ['Size', 'Chest'], rows: [['M']] })).toBeNull()
    expect(parseSizeChart({ headers: ['Size', 'Chest'], rows: [[' ', '1']] })).toBeNull()
  })

  it('on a read, shows the usable rows and skips a broken one', () => {
    expect(parseSizeChart({ headers: ['Size', 'Chest'], rows: [['M', '104'], ['L']] })?.rows).toEqual([['M', '104']])
  })

  it('on a write, refuses a chart with a broken row rather than dropping it', () => {
    expect(checkSizeChart(chart)).toHaveProperty('value')
    expect(checkSizeChart(null)).toEqual({ value: null })
    expect(checkSizeChart({ headers: ['Size', 'Chest'], rows: [['M', '104'], ['L']] })).toHaveProperty('error')
    expect(checkSizeChart({ headers: ['Size'], rows: [['M']] })).toHaveProperty('error')
  })
})
