import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

/**
 * fontsource CSS는 woff2 뒤에 구형 woff를 나란히 적어 둔다.
 *
 * woff2를 못 읽는 브라우저는 이제 없다. 그런데 그 한 줄 때문에 빌드에 아무도
 * 내려받지 않을 woff 파일이 5MB 따라 붙는다. 첫 줄만 남긴다.
 *
 * 끝의 format(...)까지 통째로 묶어서 지우므로 woff2 쪽은 걸리지 않는다.
 * woff2가 적힌 자리는 format('woff2')라서 패턴의 format('woff')와 어긋난다.
 */
const LEGACY_WOFF = /,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g

const woff2Only = {
  name: 'woff2-only',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.includes('@fontsource') || !id.includes('.css')) return null
    const out = code.replace(LEGACY_WOFF, '')
    return out === code ? null : out
  },
}

export default defineConfig(({ mode }) => ({
  plugins: [woff2Only, svelte(), tailwindcss(), Icons({ compiler: 'svelte' })],
  // pywebview는 dist/index.html을 파일로 열기 때문에 상대 경로가 필요하다.
  // 웹 배포는 루트 기준으로 올린다.
  base: mode === 'web' ? '/' : './',
  build: mode === 'web' ? { outDir: 'dist-web' } : {},
  server: { port: 5173, strictPort: true },
}))
