/**
 * 넥슨 결제내역 페이지에서 실행되는 북마클릿.
 *
 * 브라우저는 남의 도메인 응답을 읽지 못해서, 웹앱이 직접 넥슨을 긁을 수 없다.
 * 하지만 북마클릿은 '지금 보고 있는 페이지 안에서' 도는 코드라 같은 출처가 되고
 * 로그인 쿠키도 그대로 쓸 수 있다. exe의 숨김 창이 하던 일을 여기서 한다.
 *
 * 어디서 눌러도 말이 되게 만들었다.
 *   - 넥슨 결제내역 페이지가 아니면 → 그 페이지를 열어 주고, 로그인 뒤 다시 누르라고 안내
 *   - 넥슨 로그인 페이지면 → 로그인을 끊지 않도록 안내만
 *   - 결제내역 페이지면 → MapleMVP 탭을 잡고, 긁으면서 진행률을 보내고, 다 보내면 스스로 닫힌다
 * MapleMVP 탭은 이미 열려 있으면 그리로 가고, 없으면 새로 연다.
 */

/** 북마클릿 안에서 도는 본체. 바깥 것을 참조하면 안 된다 (문자열로 만들어 넣는다). */
function collect(appOrigin: string) {
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
  const MARK = 'maplemvp-bookmarklet'
  const HOST = 'payment.nexon.com'
  const USAGE = 'https://payment.nexon.com/usage/?pagecode=2'
  const TAB = 'maplemvp'
  const w = window as any

  // 두 번 누르면 두 번 긁는다
  if (w.__maplemvpRunning) return
  w.__maplemvpRunning = true

  // 앞서 띄운 안내가 남아 있으면 치운다. 두 개가 겹쳐 보이면 안 된다
  try { w.__maplemvpBox?.remove() } catch { /* 이미 사라졌다 */ }

  const box = document.createElement('div')
  w.__maplemvpBox = box
  box.style.cssText = 'position:fixed;inset:auto 16px 16px auto;z-index:2147483647;'
    + 'background:#1b1c21;color:#ecebf2;font:14px/1.6 system-ui,sans-serif;'
    + 'padding:14px 18px;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);'
    + 'border:1px solid #474b59;min-width:280px;max-width:380px'
  document.body.appendChild(box)
  const say = (html: string) => { box.innerHTML = html }
  // 잠금은 바로 푼다. 안내를 읽다가 다시 눌렀는데 아무 일도 안 나면 고장 난 줄 안다
  const bye = (ms: number) => { w.__maplemvpRunning = false; setTimeout(() => box.remove(), ms) }
  const dim = (s: string) => `<span style="color:#80828f">${s}</span>`
  const hi = (s: string) => `<b style="color:#ecebf2">${s}</b>`
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  // ── 결제내역 페이지가 아니면 거기부터 열어 준다 ──
  if (location.host !== HOST) {
    // 로그인 중이라면 새 탭을 띄우지 않는다. 로그인 흐름이 끊긴다
    if (/(^|\.)nexon\.com$/.test(location.host)) {
      say(`<b style="color:#ffc29e">로그인을 마쳐 주세요</b><br>`
        + dim(`로그인이 끝나고 ${hi('넥슨캐시 사용/철회내역')} 화면이 뜨면<br>북마크를 한 번 더 눌러 주세요.`))
      bye(15000)
      return
    }
    // MapleMVP 화면이라면 거기 안내가 훨씬 낫다. 그걸 연다.
    // 같은 화면이니 앱을 직접 부른다. 주소로 부르면 듣는 코드가 아직 없을 때 그냥 사라진다.
    if (location.origin === appOrigin) {
      box.remove()
      w.__maplemvpRunning = false
      if (typeof w.__mvpImport === 'function') w.__mvpImport()
      else location.href = appOrigin + '/#import'
      return
    }

    // 넥슨 탭은 사용자가 눌러서 연다. 새 탭은 열리자마자 앞으로 나오는데
    // 넥슨 문서 안에는 우리 안내를 넣을 수 없어서, 여기서 먼저 읽게 한다.
    say(`<b>MapleMVP · 구매내역 가져오기</b><br>`
      + dim(`① 아래를 눌러 넥슨 결제내역 페이지를 열고<br>`
          + `② 로그인이 안 돼 있으면 로그인한 뒤<br>`
          + `③ ${hi('그 페이지에서')} 북마크를 한 번 더 누르면 끝이에요.`)
      + `<br><br><button id="mvpgo" style="appearance:none;cursor:pointer;font:inherit;font-weight:600;`
      + `padding:8px 15px;border-radius:9px;border:0;background:#b9a6ff;color:#1b1c21">넥슨 결제내역 페이지 열기</button>`
      // 브라우저는 열린 탭 목록을 알려주지 않는다. 이미 있는 탭은 사용자만 안다
      + `<br><br><span style="color:#5b5f6d;font-size:12px">넥슨 결제내역 페이지 탭이 이미 있다면<br>`
      + `그 탭으로 가서 북마크를 누르는 게 더 빨라요.</span>`)
    box.querySelector('#mvpgo')?.addEventListener('click', () => {
      const opened = window.open(USAGE, 'maplemvp-nexon')
      say(opened
        ? `<b>열었어요</b><br>`
          + dim(`로그인한 뒤 ${hi('그 페이지에서')} 북마크를 한 번 더 눌러 주세요.<br>`
              + `이 안내는 이 탭에 그대로 있어요.`)
        : `<b style="color:#ff9aa8">새 탭이 막혔어요</b><br>`
          + dim(`팝업 허용을 켜거나 결제내역 페이지를 직접 열어 주세요.<br>${USAGE}`))
      bye(120000)
    })
    bye(120000)
    return
  }

  // ── MapleMVP 탭을 잡는다 ──
  // 이 탭을 MapleMVP가 열었다면 opener가 곧 그 탭이다. 이름으로 찾는 방법은
  // 출처가 다르면 통하지 않으므로, 손잡이가 있을 때는 그걸 써야 새 탭이 안 생긴다.
  let target: Window | null = null
  let acked = false
  addEventListener('message', e => {
    if (e.origin === appOrigin && (e.data as any)?.source === 'maplemvp-app') acked = true
  })
  const ping = () => { try { target?.postMessage({ source: MARK, kind: 'ping' }, appOrigin) } catch { /* 아직 안 떴다 */ } }
  const send = (msg: Record<string, unknown>) => {
    if (target && acked) try { target.postMessage({ source: MARK, ...msg }, appOrigin) } catch { /* 닫혔다 */ }
  }

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

  /** 연결이 안 됐을 때. 복사는 사용자가 눌러야 허용된다 */
  const offerCopy = (text: string, n: number) => {
    say(`<b>메이플 ${n}건</b> 읽었어요.<br>`
      + dim('MapleMVP 탭을 열지 못했어요. 아래를 누른 뒤 MapleMVP에서 Ctrl+V 하세요.')
      + `<br><br><button id="mvpcopy" style="appearance:none;cursor:pointer;font:inherit;`
      + `padding:7px 14px;border-radius:9px;border:0;background:#b9a6ff;color:#1b1c21">복사하기</button>`)
    box.querySelector('#mvpcopy')?.addEventListener('click', () => {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;top:-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      say(`<b>복사했어요.</b><br>` + dim('MapleMVP 화면에서 Ctrl+V 하세요.'))
      bye(8000)
    })
  }

  ;(async () => {
    try {
      say(`<b>MapleMVP</b><br>${dim('MapleMVP 탭과 연결하는 중…')}`)

      // 1) 우리를 연 탭이 MapleMVP인지 물어본다. 맞으면 새로 열 이유가 없다.
      //    남의 출처면 postMessage가 조용히 버려져서 답이 오지 않는다.
      const op = window.opener as Window | null
      if (op && !op.closed) {
        target = op
        for (let i = 0; i < 5 && !acked; i++) { ping(); await sleep(180) }
      }

      // 2) 답이 없으면 그때 연다. 사용자가 누른 효력(약 5초)이 아직 남아 있다.
      if (!acked) {
        try { target = window.open('', TAB) } catch { target = null }
        let fresh = false
        try { fresh = !!target && target.location.href === 'about:blank' } catch { fresh = false }
        // 읽다가 막혔다면 남의 출처 = 이미 떠 있는 MapleMVP다. 다시 불러오지 않는다
        if (target && fresh) target.location.href = appOrigin
        for (let i = 0; i < 60 && !acked && target; i++) {
          ping()
          // 한참 답이 없으면 그 탭이 다른 곳을 보고 있는 것이다. MapleMVP로 돌린다
          if (i === 20) try { target.location.href = appOrigin } catch { /* 막히면 그대로 */ }
          await sleep(250)
        }
      }

      const now = new Date()
      const rows: { date: string; item: string; price: number; id: string }[] = []
      let empty = 0
      // 몇 달치가 있는지는 넥슨만 안다. 물어볼 방법이 없으니 빈 달이 이어질 때까지
      // 거슬러 올라간다. 미리 정해 둔 개월 수로 끊으면 남아 있는 내역을 두고 온다.
      // STOP은 넥슨이 고장 났을 때 끝없이 도는 것만 막는 울타리다 (20년)
      const STOP = 240
      for (let i = 0; i < STOP; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const y = d.getFullYear()
        const m = d.getMonth() + 1
        say(`<b>MapleMVP</b><br>${y}년 ${m}월 읽는 중…<br>` + dim(`메이플 ${rows.length}건`))
        // 끝을 모르므로 total은 보내지 않는다. 받은 건수로 나아가는 것이 보인다
        send({ kind: 'progress', label: `${y}년 ${m}월`, done: i + 1, count: rows.length })
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

      if (acked) {
        send({ kind: 'rows', rows })
        say(`<b>메이플 ${rows.length}건</b> 보냈어요.<br>` + dim('MapleMVP 탭에서 확인하세요.'))
        // 우리가 연 탭이면 닫힌다. 직접 연 탭이면 안내만 남는다
        setTimeout(() => { window.close(); bye(6000) }, 1200)
        return
      }
      offerCopy(JSON.stringify({ source: MARK, rows }), rows.length)
    } catch (e) {
      const msg = String((e as Error)?.message || e)
      // 로그인이 풀린 경우는 따로 안내한다 (넥슨이 '세션 만료 유저'로 답한다)
      const loggedOut = /세션|로그인|401|403/.test(msg)
      send({ kind: 'error', message: loggedOut ? '넥슨 로그인이 풀렸어요. 결제내역 페이지에서 로그인한 뒤 북마크를 다시 눌러 주세요.' : msg })
      say(loggedOut
        ? `<b style="color:#ffc29e">넥슨 로그인이 필요해요</b><br>`
          + dim('이 페이지에서 로그인한 뒤 북마크를 다시 눌러 주세요.')
        : `<b style="color:#ff9aa8">읽지 못했어요</b><br>${dim(msg)}`)
      bye(15000)
    } finally {
      w.__maplemvpRunning = false
    }
  })()
}

/** 북마크에 넣을 `javascript:` 주소를 만든다. */
export function bookmarkletUrl(appOrigin = location.origin): string {
  const body = `(${collect.toString()})(${JSON.stringify(appOrigin)})`
  return 'javascript:' + encodeURIComponent(body)
}

export const NEXON_USAGE_URL = 'https://payment.nexon.com/usage/?pagecode=2'
/** MapleMVP 탭에 붙이는 이름. 북마클릿이 이 이름으로 탭을 찾는다 */
export const APP_TAB = 'maplemvp'
