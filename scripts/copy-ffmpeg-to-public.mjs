import { copyFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const srcDir = join(root, 'node_modules/@ffmpeg/core/dist/esm')
const dstDir = join(root, 'public/ffmpeg')

mkdirSync(dstDir, { recursive: true })
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  copyFileSync(join(srcDir, name), join(dstDir, name))
}
console.log('[copy-ffmpeg] → public/ffmpeg/')
