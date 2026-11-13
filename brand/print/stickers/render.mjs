// Renders stickers.html to the print PDF, the cut-guide PDF and two preview PNGs, with headless Chrome.
// Usage: node brand/print/stickers/render.mjs   (needs Chrome and the internet for the Archivo font)
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const page = pathToFileURL(join(here, 'stickers.html')).href
const base = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-pdf-header-footer', '--virtual-time-budget=15000']
const shot = ['--force-device-scale-factor=2', '--window-size=794,1123']

const jobs = [
  [`--print-to-pdf=${join(here, 'final-heaven-stickers-a4.pdf')}`, page],
  [`--print-to-pdf=${join(here, 'final-heaven-stickers-a4-cut-guide.pdf')}`, page + '?cut=1'],
  [...shot, `--screenshot=${join(here, 'preview.png')}`, page],
  [...shot, `--screenshot=${join(here, 'preview-cut.png')}`, page + '?cut=1'],
]
for (const job of jobs) {
  execFileSync(chrome, [...base, ...job], { stdio: 'ignore' })
  console.log('wrote', job.find((a) => a.startsWith('--print-to-pdf=') || a.startsWith('--screenshot=')).split('=')[1])
}
