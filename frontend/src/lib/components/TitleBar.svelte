<script lang="ts">
  import { onMount } from 'svelte'
  import AccountMenu from './AccountMenu.svelte'
  import NoteBell from './NoteBell.svelte'
  import { go, leaveBoard } from '../qna.svelte'
  import { app, refresh, showLogin, toggleTheme, win } from '../store.svelte'
  import { TOUCH } from '../format'
  import { tip } from '../tip'

  let now = $state(Date.now())
  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 20_000)
    return () => clearInterval(t)
  })

  /** 넥슨에서 받아오는 중 — exe는 직접, 웹은 북마클릿이 */
  const busy = $derived(app.syncing || app.importing)

  const status = $derived.by(() => {
    if (busy) {
      const p = app.progress
      return p ? `불러오는 중 · ${p.label}${p.count ? ` · ${p.count}건` : ''}` : '불러오는 중'
    }
    if (app.loggedOut) return '로그아웃됨'
    if (!app.data?.syncedAt) return '아직 동기화 전'
    // 저절로 동기화되는 게 아니라서 '방금'·'n분 전'은 헷갈린다. 마지막으로 가져온 때를 그대로 적는다
    const t = new Date(app.data.syncedAt)
    const day = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const hm = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`
    const when = day(t) === day(new Date(now)) ? '오늘'
      : day(t) === day(new Date(now - 864e5)) ? '어제'
      : `${t.getMonth() + 1}월 ${t.getDate()}일`
    return `마지막 동기화 ${when} ${hm}`
  })

  // 웹에는 로그인이 없다. 받아 둔 내역이 하나도 없으면 여기부터 시작해야 하므로
  // 단추가 어디 있는지 확실히 알려 준다.
  // 손가락 기기에서는 가져오기 자체가 안 된다. 없는 길을 가리키지 않는다
  const needSync = $derived(app.web && !app.data?.syncedAt && !busy && !TOUCH)

  function tab(v: 'dash' | 'plan' | 'eff') {
    leaveBoard()
    app.view = v
  }

  /**
   * 로고를 누르면 첫 화면(현황)으로. 주소로 다시 들어가면 페이지를 통째로 새로 받느라
   * 한동안 멈춘 것처럼 보이고, 이미 '/'에 있으면 아무 일도 없는 것처럼 보였다.
   * 새 탭으로 열기(ctrl·가운데 단추)는 그대로 둔다
   */
  function home(e: MouseEvent) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    tab('dash')
    document.querySelector('main')?.scrollTo(0, 0)
  }
</script>

<header class="bar">
  {#snippet brand()}
    <span class="logo" aria-hidden="true">
      <svg viewBox="0 0 32 32"><path d="M8 23V9l8 8 8-8v14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
    <span class="ttl">MapleMVP</span>
  {/snippet}

  <!-- 웹에서는 여느 사이트처럼 첫 화면으로 돌아가는 길이다.
       exe에는 돌아갈 '홈'이 따로 없어서 그냥 이름표로 둔다 -->
  {#if app.web}
    <a class="brand" href="/" onclick={home} aria-label="MapleMVP 첫 화면">{@render brand()}</a>
  {:else}
    <div class="brand">{@render brand()}</div>
  {/if}
  {#if app.data?.demo}<span class="tag">예시 데이터</span>{/if}

  {#if app.data}
    <nav class="tabs" aria-label="화면">
      <button aria-pressed={app.view === 'dash'} onclick={() => tab('dash')}>현황</button>
      <button aria-pressed={app.view === 'plan'} onclick={() => tab('plan')}>목표 계획</button>
      <button aria-pressed={app.view === 'eff'} onclick={() => tab('eff')}>효율표</button>
      <span class="ind" class:off={app.view === 'qna'} style="--i:{['dash', 'plan', 'eff'].indexOf(app.view)}"></span>
    </nav>
  {/if}

  <!-- 버튼이 없는 빈 영역만 창 이동에 쓴다 -->
  <div class="pywebview-drag-region drag"></div>

  <div class="sync">
    {#if app.web}
      <span class="txt" class:call={needSync}>
        {app.data?.syncedAt ? status : TOUCH ? 'PC에서 가져온 뒤 로그인하면 보여요' : '구매내역부터 가져와 주세요'}
      </span>
    {:else if app.loggedOut && !busy}
      <button class="stat" onclick={showLogin} use:tip={'넥슨에 다시 로그인'}>
        <span class="dot out"></span><span class="txt">로그아웃됨 · 다시 로그인</span>
      </button>
    {:else}
      <span class="dot" class:busy class:err={!!app.error}></span>
      <span class="txt">{app.error ? '동기화 실패 · 이전 결과 표시 중' : status}</span>
    {/if}
    {#if !(app.web && TOUCH)}
    <button class="ib" class:spinning={busy} class:hl={needSync}
      onclick={() => (app.web ? (app.showImport = true) : refresh())}
      disabled={busy} aria-label="구매내역 가져오기" use:tip={app.web ? '구매내역 가져오기' : '새로고침 (F5)'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
    </button>
    {/if}
  </div>

  <!-- 문의는 로그인 전에도 읽을 수 있다. 종은 알림을 받을 사람(로그인)에게만 -->
  {#if app.web}
    <button class="qna" class:has-bell={!!app.user} aria-pressed={app.view === 'qna'} onclick={() => go('qna')} aria-label="문의 게시판" use:tip={'문의 게시판'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.5 11.6a8.1 8.1 0 0 1-11.9 7.2L3.5 20.5l1.7-4.8A8.1 8.1 0 1 1 20.5 11.6z"/><path d="M8.6 11.8h.01M12.2 11.8h.01M15.8 11.8h.01"/>
      </svg>
      <span>문의</span>
    </button>
    {#if app.user}<NoteBell />{/if}
  {/if}

  <!-- 왼쪽부터: 동기화 · 화면 밝기 · 로그인. 오른쪽 끝은 창 단추가 있던 자리라 비워 둔다 -->
  <button class="sw" role="switch" aria-checked={app.theme === 'light'} onclick={toggleTheme}
    aria-label="화면 밝기" use:tip={app.theme === 'dark' ? '밝은 화면으로' : '어두운 화면으로'}>
    <span class="knob">
      {#if app.theme === 'dark'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7z"/>
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <circle cx="12" cy="12" r="4.4"/>
          <path d="M12 2.4v2.4M12 19.2v2.4M4.1 4.1l1.7 1.7M18.2 18.2l1.7 1.7M2.4 12h2.4M19.2 12h2.4M4.1 19.9l1.7-1.7M18.2 5.8l1.7-1.7"/>
        </svg>
      {/if}
    </span>
  </button>

  {#if app.web}<AccountMenu />{/if}

  {#if !app.web}
  <div class="winctl">
    <button onclick={win.minimize} aria-label="최소화"><svg viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" stroke-width="1.3"/></svg></button>
    <button onclick={win.maximize} aria-label={app.maximized ? '이전 크기로' : '최대화'}>
      {#if app.maximized}
        <!-- 겹친 사각형: 이전 크기로 되돌리기 -->
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="1.8" y="3.8" width="6.4" height="6.4" rx="1.3"/>
          <path d="M4.2 3.6V2.9A1.1 1.1 0 0 1 5.3 1.8h4.0a1.1 1.1 0 0 1 1.1 1.1v4.0a1.1 1.1 0 0 1-1.1 1.1h-0.7"/>
        </svg>
      {:else}
        <svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
      {/if}
    </button>
    <button class="x" onclick={win.close} aria-label="닫기"><svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>
  </div>
  {/if}
</header>

<style>
  .bar {
    position: relative; z-index: 30;
    height: 52px; flex: none;
    display: flex; align-items: center; gap: 12px;
    padding-left: 16px;
    border-bottom: 1px solid var(--color-line);
    background: color-mix(in oklab, var(--color-bg) 70%, transparent);
    backdrop-filter: blur(14px);
  }
  .brand {
    flex: none; display: flex; align-items: center; gap: 12px;
    color: inherit; text-decoration: none;
    margin: -4px -8px; padding: 4px 8px; border-radius: 10px;
  }
  a.brand:hover { background: var(--color-panel); }
  a.brand:focus-visible { outline: 2px solid var(--color-lav); outline-offset: 1px; }
  .logo {
    width: 26px; height: 26px; border-radius: 8px; flex: none;
    display: grid; place-items: center; color: #1b1c21;
    /* 로고는 표식이라 화면 밝기를 따라 바뀌면 안 된다. 변수를 거치지 않는다 */
    background: linear-gradient(135deg, #b8a8ff, #ffa9c2);
  }
  .logo svg { width: 16px; height: 16px; }
  .ttl { font-family: var(--font-display); font-size: 14px; letter-spacing: .03em; }
  .tag { font-size: 11px; padding: 2px 8px; border-radius: 6px; background: var(--color-panel3); color: var(--color-tx3); }
  .drag { flex: 1; align-self: stretch; }
  .tabs { position: relative; flex: none; min-width: 0; display: grid; grid-template-columns: repeat(3, 1fr); margin-left: 14px; padding: 3px; border-radius: 12px; background: var(--color-panel); border: 1px solid var(--color-line); }
  .tabs button { position: relative; z-index: 1; appearance: none; border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 13px; font-weight: 500; color: var(--color-tx3); padding: 5px 16px; white-space: nowrap; transition: color .25s; }
  .tabs button[aria-pressed="true"] { color: var(--color-tx); }
  .ind { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 3); transform: translateX(calc(100% * var(--i, 0))); border-radius: 9px; background: var(--color-panel3); box-shadow: 0 2px 10px -2px rgba(0,0,0,.5), inset 0 0 0 1px rgba(184,168,255,.25); transition: transform .35s cubic-bezier(.3,1.4,.5,1); }
  /* 게시판에서는 가리킬 탭이 없다(--i가 -1). 안 보이는 채로 왼쪽으로 밀려 로고 글자를 덮고 클릭을 가로챘다 */
  .ind { pointer-events: none; }
  .ind.off { opacity: 0; }
  /* 문의 게시판. 넓을 때는 글자까지, 좁아지면 말풍선만 */
  .qna {
    flex: none; appearance: none; cursor: pointer; font: inherit; font-size: 12.5px;
    display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px 0 9px; border-radius: 9px;
    border: 1px solid var(--color-line); background: var(--color-panel); color: var(--color-tx2); transition: all .2s;
  }
  .qna:hover { color: var(--color-tx); border-color: var(--color-line2); background: var(--color-panel2); }
  .qna[aria-pressed="true"] { color: var(--color-lav); border-color: color-mix(in oklab, var(--color-lav) 60%, transparent); }
  .qna svg { width: 15px; height: 15px; }
  .sync { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--color-tx3); }
  .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--color-mint); animation: ping 2.4s infinite; }
  .dot.busy { background: var(--color-lav); }
  .dot.err { background: var(--color-peach); animation: none; }
  .dot.out { background: var(--color-bad); animation: none; }
  .stat {
    appearance: none; cursor: pointer; font: inherit; font-size: 12px;
    display: flex; align-items: center; gap: 10px;
    padding: 4px 10px 4px 8px; border-radius: 8px;
    border: 1px solid color-mix(in oklab, var(--color-bad) 40%, var(--color-line));
    background: color-mix(in oklab, var(--color-bad) 12%, transparent); color: var(--color-bad);
  }
  .stat:hover { background: color-mix(in oklab, var(--color-bad) 20%, transparent); }
  @keyframes ping {
    0% { box-shadow: 0 0 0 0 rgba(149, 226, 196, .6); }
    70%, 100% { box-shadow: 0 0 0 7px transparent; }
  }
  .ib {
    appearance: none; width: 30px; height: 30px; border-radius: 9px; cursor: pointer;
    display: grid; place-items: center;
    border: 1px solid var(--color-line); background: var(--color-panel); color: var(--color-tx2);
    transition: all .2s;
  }
  .ib:hover:not(:disabled) { color: var(--color-tx); border-color: var(--color-line2); background: var(--color-panel2); }
  .ib svg { width: 15px; height: 15px; }
  /* 크기는 그대로 두고 테두리 빛만 번지게 한다. 줄이 밀리면 안 된다 */
  .ib.hl { color: var(--color-lav); border-color: color-mix(in oklab, var(--color-lav) 65%, transparent); animation: call 2.2s ease-out infinite; }
  .txt.call { color: var(--color-lav); }
  @keyframes call {
    0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-lav) 50%, transparent); }
    70%, 100% { box-shadow: 0 0 0 10px transparent; }
  }
  @media (prefers-reduced-motion: reduce) { .ib.hl { animation: none; } }
  .ib.spinning svg { animation: spin .9s linear infinite; }
  /* 화면 밝기: 켜고 끄는 느낌으로 */
  .sw {
    flex: none; appearance: none; cursor: pointer; padding: 0; margin-left: 2px;
    width: 46px; height: 26px; border-radius: 999px;
    border: 1px solid var(--color-line); background: var(--color-bg2);
    display: flex; align-items: center; transition: background .2s, border-color .2s;
  }
  .sw[aria-checked="true"] { background: color-mix(in oklab, var(--color-lav) 30%, var(--color-bg2)); border-color: var(--color-lav); }
  .knob {
    width: 20px; height: 20px; margin: 0 2px; border-radius: 50%;
    display: grid; place-items: center;
    background: var(--color-panel2); color: var(--color-tx2);
    transition: transform .2s cubic-bezier(.4,0,.2,1), color .2s;
  }
  .sw[aria-checked="true"] .knob { transform: translateX(20px); background: var(--color-lav); color: var(--color-on-accent); }
  .knob svg { width: 12px; height: 12px; }

  /* 창 단추가 없는 웹에서도 그 자리는 비워 둔다 */
  .bar:not(:has(.winctl)) { padding-right: 46px; }
  .winctl { display: flex; align-self: stretch; margin-left: 6px; }
  .winctl button {
    appearance: none; border: 0; background: transparent; color: var(--color-tx2);
    width: 46px; display: grid; place-items: center; cursor: pointer; transition: background .15s, color .15s;
  }
  .winctl button:hover { background: var(--color-panel2); color: var(--color-tx); }
  .winctl button.x:hover { background: #d9536a; color: #fff; }
  .winctl svg { width: 12px; height: 12px; }
  /*
   * 좁은 화면.
   *
   * 중단점은 --ui-scale(1.2)을 미리 곱해 둔 값이다. 미디어 쿼리는 창 너비만 보고
   * 배율을 모르기 때문에, 그냥 두면 자리가 없는데도 발동하지 않는다.
   * 원래 값: 860 / 560
   */
  @media (max-width: 1032px) {
    .sync .txt, .tag { display: none; }
    .qna { width: 30px; padding: 0; justify-content: center; }
    .qna span { display: none; }
    .tabs { margin-left: 4px; }
    .tabs button { padding: 5px 12px; }
    /* 글씨도 단추도 없으면 빈 칸만 남는다 (웹+손가락) */
    .sync:not(:has(.ib, .stat)) { display: none; }
  }
  /* 휴대폰. 여기서는 한 줄에 다 들어가는 것이 먼저다 */
  @media (max-width: 672px) {
    .bar { gap: 8px; padding-left: 10px; }
    /* 창 단추가 있던 자리를 비워 둘 여유가 없다 */
    .bar:not(:has(.winctl)) { padding-right: 10px; }
    .ttl { display: none; }            /* 이름표는 로고만 남긴다 */
    .brand { margin: -4px; padding: 4px; }
    .tabs { margin-left: 0; }
    .tabs button { padding: 5px 9px; font-size: 12.5px; }
    .sw { width: 42px; height: 24px; margin-left: 0; }
    .knob { width: 18px; height: 18px; }
    .sw[aria-checked="true"] .knob { transform: translateX(18px); }
  }
  /* 360px 폰: 탭이 셋이라 로그인 단추가 밀려 잘렸다. 탭 여백을 줄여 한 줄에 넣는다 */
  @media (max-width: 400px) {
    .bar { gap: 4px; padding-left: 8px; }
    .bar:not(:has(.winctl)) { padding-right: 8px; }
    .tabs button { padding: 5px 7px; font-size: 12px; }
    /* 단추 하나 둘 자리가 없다. 로그인했으면 종만 남긴다(종 메뉴에 게시판 가는 길이 있다) */
    .qna.has-bell { display: none; }
    /* 로그인 전에는 '로그인' 글자 단추와 문의 단추가 같이 선다. 로고는 첫 화면 링크일 뿐이라 이때만 뺀다 */
    .bar:has(.qna:not(.has-bell)) .brand { display: none; }
    .sw { width: 38px; }
    .sw[aria-checked="true"] .knob { transform: translateX(14px); }
  }
</style>
