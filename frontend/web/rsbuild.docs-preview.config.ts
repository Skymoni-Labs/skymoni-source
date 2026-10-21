import path from 'node:path'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'
export default defineConfig({
 plugins: [pluginReact(), pluginTailwindcss({ optimize: false })],
 source: { entry: { index: './src/usage-docs-preview.tsx' } },
 resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
 html: { template: './index.html', favicon: './public/favicon.ico' },
 server: { host: '127.0.0.1', port: 39127, strictPort: true },
 output: { distPath: { root: 'dist-docs-preview' } },
})
