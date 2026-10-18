/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production'

// 'unsafe-inline' scripts are needed by Next 14's inline bootstrap without nonces;
// 'unsafe-eval' only in dev for React Refresh. Images may come from any https host
// because product image URLs are entered by admins.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
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
