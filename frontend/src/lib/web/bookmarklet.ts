/**
 * 넥슨 결제 페이지에서 실행되는 북마클릿.
 *
 * 브라우저는 남의 도메인 응답을 읽지 못해서, 웹앱이 직접 넥슨을 긁을 수 없다.
 * 하지만 북마클릿은 '지금 보고 있는 페이지 안에서' 도는 코드라 같은 출처가 되고
 * 로그인 쿠키도 그대로 쓸 수 있다. exe의 숨김 창이 하던 일을 여기서 한다.
 *
 * 긁은 내역은 웹앱으로 바로 보낸다(postMessage). 사용자가 넥슨 페이지를 직접 열어
 * 연결이 없으면 클립보드 복사로 떨어진다.
 */

/** 북마클릿 안에서 도는 본체. 바깥 것을 참조하면 안 된다 (문자열로 만들어 넣는다). */
function collect(appOrigin: string, months: number) {
  const API = 'https://public.api.nexon.com/billing-bff/mycash'
  const OP = 'getNxCashHistoryDetailUseWithPaging'
  const QUERY = `
  query ${OP}($year: Int!, $month: Int!, $cursor: Int!) {
    nexonCashHistoryDetailUseWithPaging(year: $year, month: $month, cursor: $cursor) {
      useList { seqNo gameName purchaseAmount purchaseDate purchaseId purchaseItem purchaseStatus }
    }
  }
`
  const PAGE = 20
  const MAPLE = '메이플스토리'
  const w = window as any

  // 두 번 누르면 두 번 긁는다
  if (w.__maplemvpRunning) return
  w.__maplemvpRunning = true

  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;inset:auto 16px 16px auto;z-index:2147483647;'
    + 'background:#1b1c21;color:#ecebf2;font:14px/1.5 system-ui,sans-serif;'
    + 'padding:14px 18px;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);'
    + 'border:1px solid #474b59;min-width:260px'
  document.body.appendChild(box)
  const say = (html: string) => { box.innerHTML = html }

  const fetchMonth = async (y: number, m: number) => {
    const out: any[] = []
    for (let cursor = 0; cursor < 5000; cursor += PAGE) {
      const res = await fetch(API, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { year: y, month: m, cursor }, operationName: OP }),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const json = await res.json()
      if (json.errors) throw new Error(json.errors[0]?.message || 'GraphQL 오류')
      const list = json?.data?.nexonCashHistoryDetailUseWithPaging?.useList
      if (!Array.isArray(list)) throw new Error('응답 형식이 달라요')
      out.push(...list)
      if (list.length < PAGE) break
    }
    return out
  }

  // 넥슨 결제 페이지가 아니면 아무것도 하지 않고 안내만 한다.
  // (북마클릿은 페이지를 벗어나는 순간 죽어서, 여기서 이동시켜 봐야 이어지지 않는다)
  if (location.host !== 'payment.nexon.com') {
    say('<b style="color:#ffc29e">여기서는 쓸 수 없어요</b><br>'
      + '<span style="color:#b4b5c3">넥슨 결제 페이지에서만 동작해요.</span><br><br>'
      + '<span style="color:#80828f">① MapleMVP에서 <b style="color:#ecebf2">넥슨 결제 페이지 열기</b>를 누르고<br>'
      + '② 로그인한 뒤<br>'
      + '③ <b style="color:#ecebf2">그 탭에서</b> 이 북마크를 다시 눌러 주세요.</span><br><br>'
      + `<span style="color:#5b5f6d;font-size:12px">지금 페이지: ${location.host}</span>`)
    setTimeout(() => { box.remove(); w.__maplemvpRunning = false }, 12000)
    return
  }

  ;(async () => {
    try {
      const now = new Date()
      const rows: { date: string; item: string; price: number; id: string }[] = []
      let empty = 0
      for (let i = 0; i < months; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const y = d.getFullYear()
        const m = d.getMonth() + 1
        say(`<b>MapleMVP</b><br>${y}년 ${m}월 읽는 중… (${i + 1}/${months})<br>`
          + `<span style="color:#80828f">메이플 ${rows.length}건</span>`)
        const raw = await fetchMonth(y, m)
        const mine = raw.filter(r => (r.gameName || '').trim() === MAPLE && (r.purchaseStatus || '').trim() === '사용')
        for (const r of mine) {
          rows.push({
            date: String(r.purchaseDate || '').slice(0, 10),
            item: String(r.purchaseItem || '').replace(/\s+/g, ' ').trim(),
            price: Number(r.purchaseAmount) || 0,
            id: String(r.purchaseId || ''),
          })
        }
        // 빈 달이 이어지면 더 거슬러 올라가지 않는다
        empty = raw.length ? 0 : empty + 1
        if (empty >= 6) break
      }

      const payload = { source: 'maplemvp-bookmarklet', rows }
      const opener = window.opener
      if (opener && !opener.closed) {
        opener.postMessage(payload, appOrigin)
        say(`<b>메이플 ${rows.length}건</b> 보냈어요.<br>`
          + '<span style="color:#80828f">MapleMVP 탭으로 돌아가세요. 이 창은 닫아도 돼요.</span>')
        setTimeout(() => window.close(), 1500)
        return
      }
      // 웹앱이 연 탭이 아니면 클립보드로 넘긴다
      const text = JSON.stringify(payload)
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;top:-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      say(`<b>메이플 ${rows.length}건</b> 복사했어요.<br>`
        + '<span style="color:#80828f">MapleMVP에서 Ctrl+V 하세요.</span>')
      setTimeout(() => box.remove(), 6000)
    } catch (e) {
      const msg = String((e as Error)?.message || e)
      // 로그인이 풀린 경우는 따로 안내한다 (넥슨이 '세션 만료 유저'로 답한다)
      const loggedOut = /세션|로그인|401|403/.test(msg)
      say(loggedOut
        ? '<b style="color:#ffc29e">넥슨 로그인이 필요해요</b><br>'
          + '<span style="color:#80828f">이 페이지에서 로그인한 뒤 북마크를 다시 눌러 주세요.</span>'
        : `<b style="color:#ff9aa8">읽지 못했어요</b><br><span style="color:#80828f">${msg}</span>`)
      setTimeout(() => box.remove(), 9000)
    } finally {
      w.__maplemvpRunning = false
    }
  })()
}

/** 북마크에 넣을 `javascript:` 주소를 만든다. */
export function bookmarkletUrl(appOrigin = location.origin, months = 24): string {
  const body = `(${collect.toString()})(${JSON.stringify(appOrigin)},${months})`
  return 'javascript:' + encodeURIComponent(body)
}

export const NEXON_USAGE_URL = 'https://payment.nexon.com/usage/?pagecode=2'
