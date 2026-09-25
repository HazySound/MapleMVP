/**
 * 게임 위에 떠 있는 작은 안내 창.
 *
 * 화면공유로 읽는 동안 사용자는 게임을 본다. 브라우저 창은 뒤에 있어서 아무것도
 * 보여 줄 수 없다. 이 창은 항상 위에 떠 있어서 곁눈으로 바로 읽힌다.
 *
 * 평소에는 MVP 패널 한 장만 띄워 작게 있는다. 표시하는 것은 둘뿐이다.
 *   - 가리면 안 되는 금액 (읽히면 초록으로 바뀐다)
 *   - 마우스를 올려 둬도 되는 자리 (패널 위면 어디든 표가 뜬다)
 * MVP 패널을 처음 띄워 보는 사람을 위해 단계별 가이드도 접어 둔다.
 *
 * 창의 문서는 이 페이지와 별개라 스타일이 하나도 딸려 가지 않는다. 다 적어 넣는다.
 * 사진 위 표시는 비율로 두되, 그러려면 그림 상자와 사진이 정확히 같은 크기여야 한다.
 * (width를 100%로 두고 높이는 비율대로 따라오게 한다. max-height를 걸면 어긋난다.)
 */
import menuShot from '../assets/mvp-menu.webp'
import panelShot from '../assets/mvp-panel.webp'
import tipShot from '../assets/mvp-tip.webp'

export type Tone = 'warn' | 'wait' | 'good'

const COLOR: Record<Tone, string> = {
  warn: '#ffc29e',   // 뭔가 잘못됐다
  wait: '#b9a6ff',   // 이렇게 해 달라
  good: '#8ee6a8',   // 됐다
}

export interface GuideView {
  title: string
  body: string
  tone: Tone
  note?: string
  /** 그림에서 무엇이 이미 읽혔는지 */
  have?: { panel: boolean; tip: boolean }
}

export interface Guide {
  show(v: GuideView): void
  /** 막혔을 때만 '화면 저장'을 내놓는다 */
  offerSave(on: boolean): void
  /** 언제 시간이 다 되는지. 남은 시간을 스스로 세어 보여 준다 */
  deadline(at: number): void
  /** 마지막 모습을 보여 주고 물러난다. MapleMVP 화면으로 돌아오면 그때 바로 닫는다. */
  finish(v: GuideView, ms: number): void
  close(): void
}

type PipHost = { documentPictureInPicture?: { requestWindow(o: { width: number; height: number }): Promise<Window> } }

export function canGuide(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as PipHost).documentPictureInPicture
}

/**
 * 창 너비. 높이는 잡지 않고 내용을 재서 맞춘다 — 사진마다 높이가 달라서
 * 하나로 고정하면 제일 큰 사진 기준이 되고 나머지에서 공백이 크게 남는다.
 * 너비는 고정한다. 가로가 흔들리면 단추가 좌우로 움직인다.
 */
const WIDTH = 400
/**
 * 창 높이. 하나로 고정한다.
 *
 * resizeTo는 좌상단을 붙잡고 늘리는데, 크롬은 PiP 창을 스크립트로 옮기지 못하게
 * 막아 둬서(moveTo는 조용히 무시된다) 늘어난 만큼 되돌릴 수가 없다. 그래서 높이를
 * 바꾸면 아래 변이 오르내리고 거기 붙은 단추가 따라 움직인다.
 * 처음부터 가이드가 들어갈 높이로 열어 두면 그 일이 아예 없다.
 * 사진은 남는 칸에 맞춰 줄어들므로 화면마다 넘치지 않는다.
 */
const HEIGHT = 470
/** 처음 띄울 때 화면 모서리에서 띄워 둘 간격 */
const MARGIN = 24

/** 사진 위의 자리. 사진 크기에 상관없게 비율로 둔다. */
const SPOT = {
  /** 패널 사진: 가리면 안 되는 '○○ 등급까지 N 캐시' */
  amount: 'left:3%;top:63%;width:48%;height:18%',
  /** 패널 사진: 마우스를 올려 둬도 되는 자리 */
  hover: 'left:53%;top:42%;width:44%;height:50%',
  /** 메뉴 사진: 이벤트 칸의 MVP */
  mvp: 'left:4.5%;top:61.5%;width:39.5%;height:9.7%',
  /** 표가 뜬 사진: 여기서도 금액이 안 가려져 있다 */
  tipAmount: 'left:2.2%;top:16.3%;width:37.5%;height:4.8%',
}

/** 단계별 가이드. MVP 패널을 처음 띄워 보는 사람을 위한 것. */
const STEPS: { shot: string; w: number; h: number; marks: string[]; head: string; text: string }[] = [
  { shot: menuShot, w: 200, h: 298, marks: [`mvp:${SPOT.mvp}`],
    head: 'ESC를 눌러 메뉴를 열고, 이벤트 › MVP를 누릅니다',
    text: '이벤트 칸의 세 번째 항목이에요.' },
  { shot: panelShot, w: 420, h: 126, marks: [`no:${SPOT.amount}`, `ok:${SPOT.hover}`],
    head: 'MVP 패널이 뜹니다',
    text: '빨간 칸만 피해서, 초록 칸 아무 데나 마우스를 올려 두세요.' },
  { shot: tipShot, w: 375, h: 340, marks: [`no:${SPOT.tipAmount}`],
    head: '12줄 표가 나옵니다',
    text: '그대로 두면 읽어요. 이때도 빨간 칸이 가려지지 않아야 해요.' },
]

const SHEET = `
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; overflow: hidden; background: #14151a; color: #ecebf2;
    font: 14px/1.5 system-ui, -apple-system, sans-serif; user-select: none;
  }
  /* 창을 꽉 채운다. 단추는 마지막 줄이라 언제나 창 아래 변에 붙는다.
     사진은 남는 칸에서 크기를 맞추므로 넘치지도, 스크롤이 생기지도 않는다. */
  #live, #steps { height: 100%; display: grid; gap: 7px; padding: 12px 14px; }
  /* 평소 화면: 글과 사진을 한 덩어리로 가운데에 두고, 단추만 아래 변에 붙인다 */
  #live { grid-template-rows: 1fr auto; }
  .mid { min-height: 0; display: grid; align-content: center; gap: 7px; }
  #steps { grid-template-rows: auto auto 1fr auto; }
  .stage { min-height: 0; display: grid; place-items: center; }
  /* 오른쪽 위는 시계 자리다. 제목도 본문도 그 아래로 들어가지 않는다 */
  h1, p { padding-right: var(--pad, 0px); }
  h1 { margin: 0; font-size: 15.5px; line-height: 1.35; font-weight: 700; color: var(--tone, #b9a6ff); }
  /* 남은 시간. 두 화면 어디서나 같은 자리에 떠 있다 */
  .clock { position: fixed; top: 9px; right: 12px; width: 46px; height: 46px; display: grid; place-items: center; }
  .clock svg { position: absolute; inset: 0; transform: rotate(-90deg); }
  .clock circle { fill: none; stroke-width: 3.5; }
  .clock .bg { stroke: #2b2d36; }
  .clock .fg { stroke: #b9a6ff; stroke-linecap: round; transition: stroke-dashoffset .95s linear, stroke .3s; }
  .clock span { position: relative; font-size: 13px; font-weight: 700; color: #b4b5c3; font-variant-numeric: tabular-nums; }
  .clock.low .fg { stroke: #ff9aa8; }
  .clock.low span { color: #ff9aa8; }
  /* 줄을 나눠 보여 줄 수 있게. 그 밖의 공백은 평소대로 합쳐진다 */
  p { margin: 0; font-size: 12.5px; line-height: 1.5; color: #b4b5c3; white-space: pre-line; }
  [hidden] { display: none !important; }

  figure { position: relative; width: 100%; margin: 0; }
  img { display: block; width: 100%; height: auto; border-radius: 5px; }
  .hl { position: absolute; border-radius: 3px; pointer-events: none; }
  .hl.no { border: 2px solid #ff9aa8; animation: breathe 1.7s ease-in-out infinite; }
  .hl.no[data-ok="1"] { border-color: #8ee6a8; animation: none; }
  .hl.ok { border: 2px dashed #8ee6a8; }
  .hl.mvp { border: 2px solid #b9a6ff; animation: breathe 1.7s ease-in-out infinite; }
  @keyframes breathe { 50% { opacity: .3; } }

  .legend { display: flex; gap: 10px; font-size: 11px; color: #5b5f6d; }
  .legend .a[data-ok="0"] { color: #ff9aa8; }
  .legend .a[data-ok="1"] { color: #8ee6a8; }
  .legend .h { color: #8ee6a8; }

  .foot { display: flex; align-items: center; gap: 8px; }
  .note { flex: 1; min-width: 0; font-size: 11px; color: #5b5f6d; }
  button {
    appearance: none; cursor: pointer; font: inherit; font-size: 12px;
    padding: 5px 10px; border-radius: 8px;
    border: 1px solid #474b59; background: #2b2d36; color: #b4b5c3;
  }
  button:hover:not(:disabled) { color: #ecebf2; border-color: #5b5f6d; }
  button:disabled { opacity: .4; cursor: default; }

  @keyframes hit { from { opacity: .25; } to { opacity: 1; } }
  h1.hit { animation: hit .45s ease-out; }
  @media (prefers-reduced-motion: reduce) {
    h1.hit, .hl.no, .hl.mvp { animation: none; }
  }
`

const BODY = `
  <div class="clock" id="c" hidden>
    <svg viewBox="0 0 46 46" width="46" height="46" aria-hidden="true">
      <circle class="bg" cx="23" cy="23" r="20"></circle>
      <circle class="fg" id="cf" cx="23" cy="23" r="20"></circle>
    </svg><span id="ct"></span>
  </div>
  <div id="live">
    <div class="mid">
    <h1 id="t"></h1>
    <p id="b"></p>
    <figure id="pfig">
      <img id="pi" src="${panelShot}" alt="인게임 MVP 패널">
      <span class="hl no" id="ha" style="${SPOT.amount}" data-ok="0"></span>
      <span class="hl ok" style="${SPOT.hover}"></span>
    </figure>
    <div class="legend">
      <span class="a" id="la" data-ok="0">① 이 금액은 가리지 마세요</span>
      <span class="h">여기 아무 데나 올려 두세요</span>
    </div>
    </div>
    <div class="foot">
      <span class="note" id="n"></span>
      <button id="shot" hidden>화면 저장</button>
      <button id="g">MVP 패널 여는 법</button>
      <button id="s">중지</button>
      <button id="ret" hidden>탭으로 돌아가기</button>
    </div>
  </div>
  <div id="steps" hidden>
    <h1 id="sh"></h1>
    <p id="sp"></p>
    <div class="stage"><figure id="sfig"><img id="si" alt=""></figure></div>
    <div class="foot">
      <span class="note" id="sn"></span>
      <button id="prev">‹ 이전</button>
      <button id="next">다음 ›</button>
      <button id="back">닫기</button>
    </div>
  </div>
`

/** 안내 창을 연다. 사용자가 누른 직후에만 열리므로 그 자리에서 불러야 한다. */
export async function openGuide(onStop: () => void, onSave: () => void): Promise<Guide | null> {
  const host = (window as unknown as PipHost).documentPictureInPicture
  if (!host) return null

  let win: Window
  try {
    win = await host.requestWindow({ width: WIDTH, height: HEIGHT })
  } catch {
    return null   // 막히면 소리와 본 화면만으로 간다
  }

  const d = win.document
  d.title = 'MapleMVP 안내'
  const style = d.createElement('style')
  style.textContent = SHEET
  d.head.appendChild(style)
  d.body.innerHTML = BODY

  const el = (id: string) => d.getElementById(id)!
  const [live, steps] = [el('live'), el('steps')]
  const [t, b, n] = [el('t'), el('b'), el('n')]
  const [ha, la] = [el('ha'), el('la')]
  const [clock, ct, cf] = [el('c'), el('ct'), el('cf')]
  const RING = 2 * Math.PI * 20
  const [sh, sp, sn, sfig] = [el('sh'), el('sp'), el('sn'), el('sfig')]
  const si = el('si') as HTMLImageElement

  /** 사진을 남는 칸에 맞춘다. 원래 크기보다 키우지 않는다. */
  function place(fig: HTMLElement, nw: number, nh: number) {
    const box = fig.parentElement!.getBoundingClientRect()
    if (!box.width || !box.height) return
    fig.style.width = `${Math.floor(Math.min(box.width, box.height * (nw / nh), nw))}px`
  }

  /** 지금 보이는 쪽 사진을 다시 맞춘다. */
  function refit() {
    if (!live.hidden) return   // 평소 화면 사진은 폭만 채우면 된다
    const st = STEPS[Math.max(0, page)]
    place(sfig, st.w, st.h)
  }

  let page = -1   // -1이면 평소 화면
  function draw() {
    const on = page >= 0
    live.hidden = on
    steps.hidden = !on
    if (!on) { refit(); return }
    const s = STEPS[page]
    sh.textContent = `${page + 1}. ${s.head}`
    sp.textContent = s.text
    si.src = s.shot
    // 사진보다 크게 늘리지 않는다. 늘리면 표시 자리도 같이 어긋나 보인다
    sfig.querySelectorAll('.hl').forEach(x => x.remove())
    for (const m of s.marks) {
      const i = m.indexOf(':')
      const span = d.createElement('span')
      span.className = `hl ${m.slice(0, i)}`
      span.setAttribute('data-ok', '0')
      span.setAttribute('style', m.slice(i + 1))
      sfig.appendChild(span)
    }
    sn.textContent = `${page + 1} / ${STEPS.length}`
    ;(el('prev') as HTMLButtonElement).disabled = page === 0
    ;(el('next') as HTMLButtonElement).disabled = page === STEPS.length - 1
    refit()
  }

  el('g').addEventListener('click', () => { page = 0; draw() })
  el('back').addEventListener('click', () => { page = -1; draw() })
  el('prev').addEventListener('click', () => { page = Math.max(0, page - 1); draw() })
  el('next').addEventListener('click', () => { page = Math.min(STEPS.length - 1, page + 1); draw() })
  el('s').addEventListener('click', onStop)
  el('shot').addEventListener('click', onSave)

  let last = ''
  let alive = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let tick: ReturnType<typeof setInterval> | undefined
  let onBack: (() => void) | undefined
  win.addEventListener('pagehide', () => { alive = false })
  // 사진이 늦게 뜨면 그때 높이가 정해진다
  si.addEventListener('load', () => refit())
  el('pi').addEventListener('load', () => refit())
  // 크기가 실제로 바뀐 뒤에 사진을 다시 맞춘다. 사용자가 창을 늘려도 따라온다
  win.addEventListener('resize', () => refit())

  function close() {
    alive = false
    clearTimeout(timer)
    if (tick) win.clearInterval(tick)
    if (onBack) document.removeEventListener('visibilitychange', onBack)
    try { win.close() } catch { /* 이미 닫혔다 */ }
  }

  // 뜬 창은 늘 보이는 상태라 여기 시계는 느려지지 않는다
  function deadline(at: number) {
    if (tick) win.clearInterval(tick)
    const span = at - Date.now()
    clock.hidden = false
    d.body.style.setProperty('--pad', '54px')   // 시계 자리를 비워 둔다
    const paint = () => {
      const ms = Math.max(0, at - Date.now())
      const left = Math.ceil(ms / 1000)
      ct.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
      cf.style.strokeDasharray = `${RING}`
      cf.style.strokeDashoffset = `${RING * (1 - ms / span)}`
      clock.classList.toggle('low', left <= 15)
    }
    paint()
    tick = win.setInterval(paint, 1000)
  }

  el('ret').addEventListener('click', () => {
    // 이 스크립트는 원래 탭의 것이라 그 창을 앞으로 부를 수 있다
    try { window.focus() } catch { /* 막히면 닫기만 한다 */ }
    close()
  })

  function show(v: GuideView) {
    if (!alive) return
    t.style.setProperty('--tone', COLOR[v.tone])
    b.textContent = v.body
    n.textContent = v.note ?? ''
    if (v.have) {
      const ok = v.have.panel ? '1' : '0'
      ha.setAttribute('data-ok', ok)
      la.setAttribute('data-ok', ok)
      la.textContent = v.have.panel ? '✓ ① 금액을 읽었어요' : '① 이 금액은 가리지 마세요'
    }
    if (v.title === last) return
    last = v.title
    t.textContent = v.title
    // 애니메이션을 다시 태우려면 한 번 떼었다 붙여야 한다
    t.classList.remove('hit')
    void t.offsetWidth
    t.classList.add('hit')
  }

  // 옮길 수 있는지 재 보고, 그 결과에 맞춰 크기와 자리를 잡는다
  // 처음 한 번 화면 우측 하단으로 보낸다. 그 뒤로는 둔 자리의 오른쪽·아래를 따른다
  const sc = window.screen as Screen & { availLeft?: number; availTop?: number }
  try {
    win.moveTo(Math.max(0, (sc.availLeft ?? 0) + sc.availWidth - win.outerWidth - MARGIN),
               Math.max(0, (sc.availTop ?? 0) + sc.availHeight - win.outerHeight - MARGIN))
  } catch { /* 브라우저가 둔 자리에 그대로 */ }

  draw()
  return {
    show,
    deadline,
    offerSave(on) { el('shot').hidden = !on },
    finish(v, ms) {
      page = -1
      draw()
      show(v)
      if (!alive) return
      // 끝났으면 시계도, 중간에 쓰던 단추도 필요 없다
      if (tick) win.clearInterval(tick)
      clock.hidden = true
      d.body.style.setProperty('--pad', '0px')
      el('g').hidden = true
      el('s').hidden = true
      el('shot').hidden = true
      el('ret').hidden = false
      timer = setTimeout(close, ms)
      // 돌아오면 굳이 붙잡고 있을 이유가 없다
      onBack = () => { if (document.visibilityState === 'visible') close() }
      document.addEventListener('visibilitychange', onBack)
    },
    close,
  }
}
