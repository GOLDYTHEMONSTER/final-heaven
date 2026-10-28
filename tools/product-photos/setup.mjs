// Installs the photo tools' libraries once, outside the repo (see deps.mjs).
//   node tools/product-photos/setup.mjs
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEPS = process.env.FH_PHOTO_TOOLS || join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'final-heaven', 'photo-tools')
if (existsSync(join(DEPS, 'node_modules', '@imgly', 'background-removal-node'))) {
  console.log(`Already installed in ${DEPS}`)
  process.exit(0)
}
mkdirSync(DEPS, { recursive: true })
if (!existsSync(join(DEPS, 'package.json'))) writeFileSync(join(DEPS, 'package.json'), JSON.stringify({ name: 'fh-photo-tools', private: true }, null, 2))
// Exact versions: the ones the store's photos were made with.
execSync('npm install --no-audit --no-fund @imgly/background-removal-node@1.4.5 sharp@0.33.5', { cwd: DEPS, stdio: 'inherit' })
console.log(`Installed in ${DEPS}`)
