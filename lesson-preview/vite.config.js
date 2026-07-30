import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

function jsxInSrcJs(appSrc) {
  const prefix = appSrc + path.sep
  return {
    name: 'jsx-in-src-js',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.startsWith(prefix) || !id.endsWith('.js')) return null
      if (!/<[A-Za-z/]/.test(code)) return null
      const esbuild = await import('esbuild')
      const result = await esbuild.transform(code, {
        loader: 'jsx',
        jsx: 'automatic',
        sourcefile: id,
      })
      return { code: result.code }
    },
  }
}

const appSrc = path.resolve(__dirname, '../src')

export default defineConfig({
  root: path.resolve(__dirname),
  base: './',
  publicDir: path.resolve(__dirname, '../public'),
  plugins: [
    jsxInSrcJs(appSrc),
    react({
      include: /\.(jsx|js|tsx|ts)$/,
    }),
  ],
  resolve: {
    alias: [
      { find: '@app', replacement: path.resolve(__dirname, '../src') },
      {
        find: path.resolve(__dirname, '../src/lessonAssetBaseEnv.js'),
        replacement: path.resolve(__dirname, 'src/lessonAssetBaseEnv.js'),
      },
    ],
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
})
