// QR codes for tickets: SVG for pages, PNG for emails (Gmail doesn't show SVG). Server only.
import 'server-only'
import QRCode from 'qrcode'

// Dark on white, whatever the page around it: scanners need the contrast.
const OPTIONS = { errorCorrectionLevel: 'M', margin: 2, color: { dark: '#0b0b0b', light: '#ffffff' } } as const

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...OPTIONS, type: 'svg' })
}

export function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...OPTIONS, type: 'png', width: 480 })
}
