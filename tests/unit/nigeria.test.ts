import { describe, expect, it } from 'vitest'
import { NIGERIAN_STATES, nigerianState } from '@/lib/nigeria'

describe('nigerianState', () => {
  it('lists the 36 states and the FCT', () => {
    expect(NIGERIAN_STATES).toHaveLength(37)
  })

  it('matches loosely and returns the proper spelling', () => {
    expect(nigerianState('lagos')).toBe('Lagos')
    expect(nigerianState(' Akwa Ibom State ')).toBe('Akwa Ibom')
    expect(nigerianState('Abuja')).toBe('FCT (Abuja)')
    expect(nigerianState('FCT')).toBe('FCT (Abuja)')
    expect(nigerianState('FCT (Abuja)')).toBe('FCT (Abuja)')
  })

  it('refuses anything that is not a Nigerian state', () => {
    expect(nigerianState('California')).toBeNull()
    expect(nigerianState('')).toBeNull()
    expect(nigerianState(null)).toBeNull()
  })
})
