import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [svelte(), tailwindcss(), Icons({ compiler: 'svelte' })],
  // pywebview는 dist/index.html을 파일로 열기 때문에 상대 경로가 필요하다.
  // 웹 배포는 루트 기준으로 올린다.
  base: mode === 'web' ? '/' : './',
  build: mode === 'web' ? { outDir: 'dist-web' } : {},
  server: { port: 5173, strictPort: true },
}))
