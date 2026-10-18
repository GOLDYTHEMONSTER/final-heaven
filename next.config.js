/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production'
// Vercel preview deployments inject the Vercel Toolbar (comments, feedback).
// Its hosts are allowed there only, per Vercel's CSP guidance; production
// (VERCEL_ENV=production) and local builds keep the strict policy.
const isPreview = process.env.VERCEL_ENV === 'preview'
const toolbar = (...hosts) => (isPreview ? ' ' + hosts.join(' ') : '')

// 'unsafe-inline' scripts are needed by Next 14's inline bootstrap without nonces;
// 'unsafe-eval' only in dev for React Refresh. Images may come from any https host
// because product image URLs are entered by admins. Vercel Web Analytics loads
// from /_vercel/insights (same origin) in production; its dev debug script is on
// va.vercel-scripts.com, allowed in development only.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ''}${toolbar('https://vercel.live')}`,
  `style-src 'self' 'unsafe-inline'${toolbar('https://vercel.live')}`,
  "img-src 'self' data: blob: https:",
  `font-src 'self' data:${toolbar('https://vercel.live', 'https://assets.vercel.com')}`,
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${toolbar('https://vercel.live', 'wss://ws-us3.pusher.com')}`,
  `frame-src 'self'${toolbar('https://vercel.live')}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig = {
  // Lets a production build run beside a dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  images: {
    // Next 14's image optimizer has unpatched critical advisories (fixed only in
    // Next 15.5.24+). Serving images as-is removes that attack surface until the
    // framework upgrade. Product images were already unoptimized.
    unoptimized: true,
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Never cache admin pages, login, or API responses at the edge.
      { source: '/admin/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
      { source: '/login', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ]
  },
}

module.exports = nextConfig
