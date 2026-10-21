import { readdirSync, readFileSync } from 'node:fs'

// A Windows-only context-filter mismatch previously produced a successful build
// with an empty icon registry. Check the actual bundle, not just the source regex.
const directory = new URL('../dist/static/js/', import.meta.url)
const bundles = readdirSync(directory, { recursive: true })
  .filter((name) => name.endsWith('.js'))
  .map((name) => readFileSync(new URL(name, directory), 'utf8'))
  .join('\n')
for (const icon of [
  'Claude/components/Color.js',
  'OpenAI/components/Mono.js',
]) {
  if (!bundles.includes(icon)) {
    throw new Error(`Production brand icon is missing: ${icon}`)
  }
}
const images = readdirSync(new URL('../dist/static/image/', import.meta.url))
if (!images.some((name) => /^typesafe\..+\.png$/.test(name))) {
  throw new Error('Production TypeSafe brand asset is missing')
}
console.log('Production Claude, OpenAI and TypeSafe icons verified')
