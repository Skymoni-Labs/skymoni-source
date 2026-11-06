import path from 'node:path'

import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'

export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss({ optimize: false })],
  source: { entry: { index: './src/skivu-resources-review.tsx' } },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  html: {
    template: './index.html',
    favicon: './public/skivu/assets/skivu.png',
  },
  server: {
    host: '127.0.0.1',
    port: 18788,
    strictPort: true,
    proxy: Object.fromEntries(
      [
        '/api/app-update/latest',
        '/api/app-update/download',
        '/api/app-wallpapers',
        '/app-wallpapers/assets',
        '/app-plugins/',
      ].map((prefix) => [
        prefix,
        { target: 'https://skymoni.com', changeOrigin: true },
      ])
    ),
  },
  output: { distPath: { root: 'dist-skivu-resources-preview' } },
})
