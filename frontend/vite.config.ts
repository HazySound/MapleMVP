import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

/**
 * 맨 아래에 찍을 빌드 표시.
 *
 * 제보를 받을 때 '언제 것을 보고 있는지'를 알아야 한다. 고친 뒤인지 전인지
 * 모르면 같은 것을 두 번 쫓는다.
 *
 * Cloudflare Pages는 커밋 해시를 환경변수로 준다. 로컬에서는 git에게 묻고,
 * git도 없으면(내려받은 소스 등) 날짜만 남긴다.
 */
function buildTag(): string {
  // 쓰는 사람도 만드는 사람도 한국에 있다. UTC로 찍으면 하루 전 날짜가 보인다
  const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
  let sha = process.env.CF_PAGES_COMMIT_SHA ?? ''
  if (!sha) {
    try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { /* git이 없다 */ }
  }
  return sha ? `${date} · ${sha.slice(0, 7)}` : date
}

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

/**
 * 웹 빌드 옆에 지금 빌드 표시를 적은 파일을 둔다.
 * 열려 있는 화면이 이것과 다르면 새 버전이 나온 것이다(src/lib/web/update.ts).
 * 브라우저가 옛 화면을 붙들고 있어도 이 파일은 캐시하지 않게 해 두었다(public/_headers).
 */
const versionFile = (build: string) => ({
  name: 'version-file',
  apply: 'build' as const,
  generateBundle(this: { emitFile(f: { type: 'asset'; fileName: string; source: string }): string }) {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build }) })
  },
})

export default defineConfig(({ mode }) => {
  const build = buildTag()
  return {
  plugins: [woff2Only, svelte(), tailwindcss(), Icons({ compiler: 'svelte' }),
            ...(mode === 'web' ? [versionFile(build)] : [])],
  define: { __BUILD__: JSON.stringify(build) },
  // pywebview는 dist/index.html을 파일로 열기 때문에 상대 경로가 필요하다.
  // 웹 배포는 루트 기준으로 올린다.
  base: mode === 'web' ? '/' : './',
  build: mode === 'web' ? { outDir: 'dist-web' } : {},
  // 로컬에서 게시판·로그인을 시험할 때는 functions를 wrangler pages dev(8788)로 띄워 둔다.
  // 안 띄워 두면 /api가 실패하고 앱은 로그인 없이 돌아간다
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8788' } },
  }
})
