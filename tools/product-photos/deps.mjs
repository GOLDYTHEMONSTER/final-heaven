// Where the photo tools' libraries live: outside the repo (they are ~350 MB
// and the repo syncs through OneDrive), in %LOCALAPPDATA%\final-heaven\photo-tools
// unless FH_PHOTO_TOOLS says otherwise. `node tools/product-photos/setup.mjs` installs them.
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEPS = process.env.FH_PHOTO_TOOLS || join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'final-heaven', 'photo-tools')

if (!existsSync(join(DEPS, 'node_modules', '@imgly', 'background-removal-node'))) {
  console.error(`The photo tools aren't installed. Run: node tools/product-photos/setup.mjs  (installs into ${DEPS})`)
  process.exit(1)
}

const fromDeps = createRequire(join(DEPS, 'node_modules', 'noop.js'))
// The sharp copy that background removal itself uses, so one process loads one libvips.
const fromImgly = createRequire(fromDeps.resolve('@imgly/background-removal-node'))
export const sharp = fromImgly('sharp')

/** Local background removal (no AI service, no cost): the medium model. */
export async function cutOut(buffer, type = 'image/jpeg') {
  const { removeBackground } = fromDeps('@imgly/background-removal-node')
  // Its model files sit next to it; by default it looks under the current folder's node_modules.
  const publicPath = `${pathToFileURL(dirname(fromDeps.resolve('@imgly/background-removal-node'))).href}/`
  const blob = await removeBackground(new Blob([buffer], { type }), { publicPath, model: 'medium', output: { format: 'image/png' } })
  return Buffer.from(await blob.arrayBuffer())
}

/** The store's photo shape: 4:5, 1200 × 1500. */
export const W = 1200
export const H = 1500
