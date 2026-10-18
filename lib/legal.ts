// Business identity and store policies: the one source for the legal pages,
// checkout, footer and order records. Policy decisions were made by the owner
// on 18 Oct 2026. `null` values are not known yet; pages show them as
// "to be added" rather than inventing them. Fill these in before launch.

export const BUSINESS = {
  tradingName: 'Final Heaven',
  /** Registered name as it appears with the Corporate Affairs Commission. */
  legalName: null as string | null,
  /** CAC registration number (RC for a company, BN for a business name). */
  registrationNumber: null as string | null,
  address: null as string | null,
  /** Customer support email shown on the site and in policies. */
  email: null as string | null,
  phone: null as string | null,
  /** Who handles privacy requests (NDPA). Usually the owner for a small business. */
  privacyContact: null as string | null,
  governingLaw: 'the Federal Republic of Nigeria',
}

export const POLICY = {
  /** Bump when the Terms or Returns policy changes; stored on each order. */
  termsVersion: '2026-10-18',
  effectiveDate: '18 October 2026',
  shipsTo: 'Nigeria',
  currency: 'NGN',
  returnWindowDays: 7,
  changeOfMindReturnShipping: 'customer' as 'customer' | 'store',
  /** Business days to issue a refund after a return arrives and is checked. Owner to confirm. */
  refundProcessingDays: 5,
  /** How long to report a faulty, damaged or wrong item. Owner to confirm. */
  faultReportDays: 7,
}

export const RETENTION = {
  ordersAndPayments: '6 years after the order, for tax and accounting records',
  analytics: '13 months, as anonymous daily counts that cannot identify you',
  newsletter: 'until you unsubscribe',
  abuseProtection: '2 days',
}

/** Missing details, for the pre-launch checklist. */
export function missingBusinessDetails() {
  return Object.entries({
    'Registered business name': BUSINESS.legalName,
    'CAC registration number': BUSINESS.registrationNumber,
    'Business address': BUSINESS.address,
    'Support email': BUSINESS.email,
    'Support phone': BUSINESS.phone,
    'Privacy contact': BUSINESS.privacyContact,
  }).filter(([, v]) => !v).map(([k]) => k)
}
