import { defineConfig, mergeRsbuildConfig } from '@rsbuild/core'
import base from './rsbuild.config'
export default defineConfig(async (context) => mergeRsbuildConfig(await base(context), { output: { sourceMap: { js: false, css: false } } }))
