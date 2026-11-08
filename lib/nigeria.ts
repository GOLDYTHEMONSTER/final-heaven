// Nigeria's 36 states and the Federal Capital Territory, for the delivery address.
// The checkout offers exactly these, and the order API refuses anything else.
export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
  'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const

/** The state's proper spelling, matched loosely ("lagos", "Abuja", "FCT"), or null when it isn't one. */
export function nigerianState(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().toLowerCase().replace(/\s+state$/, '')
  if (!v) return null
  if (v === 'fct' || v === 'abuja' || v === 'federal capital territory') return 'FCT (Abuja)'
  return NIGERIAN_STATES.find((s) => s.toLowerCase() === v) ?? null
}
