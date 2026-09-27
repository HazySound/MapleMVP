/**
 * 새 버전이 배포됐는지 본다.
 *
 * 배포해도 열어 둔 탭은 옛 화면 그대로고, 브라우저가 옛 파일을 붙들고 있으면 새로고침해도
 * 옛것이 뜰 때가 있다. 그러면 고친 것을 제보자가 못 본다. 빌드할 때 함께 내보내는
 * version.json(vite.config.ts)을 캐시 없이 읽어, 지금 화면의 빌드 표시와 다르면 알린다.
 */

/** 배포된 빌드 표시. 지금 화면과 같거나 알 수 없으면 null */
export async function newerBuild(): Promise<string | null> {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const { build } = (await r.json()) as { build?: string }
    return build && build !== __BUILD__ ? build : null
  } catch {
    return null   // 오프라인이거나 개발 서버다
  }
}

/**
 * 캐시를 건너뛰고 새로 불러온다.
 * 주소에 빌드 표시를 붙이면 브라우저가 같은 화면으로 보지 않고 새로 받는다.
 * 붙인 표시는 뜬 뒤에 cleanUrl이 지운다.
 */
export function reloadFresh(build: string): void {
  const u = new URL(location.href)
  u.searchParams.set('v', build.replace(/\W+/g, ''))
  location.replace(u.toString())
}

/** 새로 불러오며 붙였던 표시를 주소에서 지운다 */
export function cleanUrl(): void {
  const u = new URL(location.href)
  if (!u.searchParams.has('v')) return
  u.searchParams.delete('v')
  history.replaceState(history.state, '', u.toString())
}
