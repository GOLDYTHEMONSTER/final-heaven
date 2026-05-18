export function formatCurrency(amount: number | string | undefined | null) {
  const value = typeof amount === 'string' ? parseFloat(amount) : Number(amount || 0)
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(value)
  } catch (e) {
    return `₦${value.toFixed(2)}`
  }
}
