// Rasterises pwa/icon.svg into the PNG sizes the manifest and iOS ask for.
//
// Uses a locally installed Chromium (Chrome or Edge) in headless mode rather
// than an npm image library, so rendering the icons adds no dependency to the
// project. Set BROWSER to point at a different binary.
//
//   node pwa/render-icons.mjs

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')

// One artwork for every size: it is drawn full bleed with the mark inside the
// maskable safe zone, so it serves as both `any` and `maskable`.
const SIZES = {
  'pwa-192.png': 192,
  'pwa-512.png': 512,
  'apple-touch-icon.png': 180,
}

const CANDIDATES = [
  process.env.BROWSER,
  // Chrome before Edge: Edge's headless mode exits without writing the
  // screenshot on some Windows installs.
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean)

const browser = CANDIDATES.find((path) => existsSync(path))
if (!browser) {
  console.error('No Chromium browser found. Set BROWSER to its executable path.')
  process.exit(1)
}

const svg = readFileSync(join(here, 'icon.svg'), 'utf8')
const work = mkdtempSync(join(tmpdir(), 'pwa-icons-'))

try {
  for (const [file, size] of Object.entries(SIZES)) {
    const page = join(work, `${size}.html`)
    writeFileSync(
      page,
      `<!doctype html><style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    )
    execFileSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--user-data-dir=${join(work, 'profile')}`,
      `--window-size=${size},${size}`,
      `--screenshot=${join(publicDir, file)}`,
      pathToFileURL(page).href,
    ])
    console.log(`public/${file}  ${size}x${size}`)
  }
} finally {
  // The browser can hold its profile directory for a moment after exiting,
  // and a leftover temp folder is not worth failing the run over.
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  } catch {
    console.warn(`Could not remove ${work}; delete it by hand if it bothers you.`)
  }
}
