import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [svelte(), tailwindcss(), Icons({ compiler: 'svelte' })],
  // pywebview가 dist/index.html을 파일로 열기 때문에 상대 경로로 빌드
  base: './',
  server: { port: 5173, strictPort: true },
})
