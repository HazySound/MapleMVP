<script lang="ts">
  import { onMount } from 'svelte'
  import { app, refresh, showLogin, toggleTheme, win } from '../store.svelte'
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
    const min = Math.floor((now - new Date(app.data.syncedAt).getTime()) / 60000)
    return min < 1 ? '방금 동기화됨' : min < 60 ? `${min}분 전 동기화` : `${Math.floor(min / 60)}시간 전 동기화`
  })

  // 웹에는 로그인이 없다. 받아 둔 내역이 하나도 없으면 여기부터 시작해야 하므로
  // 단추가 어디 있는지 확실히 알려 준다.
  const needSync = $derived(app.web && !app.data?.syncedAt && !busy)
</script>

<header class="bar">
  <div class="logo" aria-hidden="true">
    <svg viewBox="0 0 32 32"><path d="M8 23V9l8 8 8-8v14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </div>
  <div class="ttl">MapleMVP</div>
  {#if app.data?.demo}<span class="tag">예시 데이터</span>{/if}

  {#if app.data}
    <nav class="tabs" aria-label="화면">
      <button aria-pressed={app.view === 'dash'} onclick={() => (app.view = 'dash')}>현황</button>
      <button aria-pressed={app.view === 'plan'} onclick={() => (app.view = 'plan')}>목표 계획</button>
      <span class="ind" class:right={app.view === 'plan'}></span>
    </nav>
  {/if}

  <!-- 버튼이 없는 빈 영역만 창 이동에 쓴다 -->
  <div class="pywebview-drag-region drag"></div>

  <div class="sync">
    {#if app.web}
      <span class="txt" class:call={needSync}>{app.data?.syncedAt ? status : '구매내역부터 가져와 주세요'}</span>
    {:else if app.loggedOut && !busy}
      <button class="stat" onclick={showLogin} use:tip={'넥슨에 다시 로그인'}>
        <span class="dot out"></span><span class="txt">로그아웃됨 · 다시 로그인</span>
      </button>
    {:else}
      <span class="dot" class:busy class:err={!!app.error}></span>
      <span class="txt">{app.error ? '동기화 실패 · 이전 결과 표시 중' : status}</span>
    {/if}
    <button class="ib" class:spinning={busy} class:hl={needSync}
      onclick={() => (app.web ? (app.showImport = true) : refresh())}
      disabled={busy} aria-label="구매내역 가져오기" use:tip={app.web ? '구매내역 가져오기' : '새로고침 (F5)'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
    </button>
  </div>

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

  <button class="login" disabled use:tip={'휴대폰에서도 보기 · 준비 중이에요'}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8.4" r="3.8"/><path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0"/>
    </svg>
    로그인
  </button>

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
  .logo {
    width: 26px; height: 26px; border-radius: 8px; flex: none;
    display: grid; place-items: center; color: var(--color-on-accent);
    background: linear-gradient(135deg, var(--color-lav), var(--color-rose));
  }
  .logo svg { width: 16px; height: 16px; }
  .ttl { font-family: var(--font-display); font-size: 14px; letter-spacing: .03em; }
  .tag { font-size: 11px; padding: 2px 8px; border-radius: 6px; background: var(--color-panel3); color: var(--color-tx3); }
  .drag { flex: 1; align-self: stretch; }
  .tabs { position: relative; display: grid; grid-template-columns: 1fr 1fr; margin-left: 14px; padding: 3px; border-radius: 12px; background: var(--color-panel); border: 1px solid var(--color-line); }
  .tabs button { position: relative; z-index: 1; appearance: none; border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 13px; font-weight: 500; color: var(--color-tx3); padding: 5px 16px; transition: color .25s; }
  .tabs button[aria-pressed="true"] { color: var(--color-tx); }
  .ind { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc(50% - 3px); border-radius: 9px; background: var(--color-panel3); box-shadow: 0 2px 10px -2px rgba(0,0,0,.5), inset 0 0 0 1px rgba(184,168,255,.25); transition: transform .35s cubic-bezier(.3,1.4,.5,1); }
  .ind.right { transform: translateX(100%); }
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

  .login {
    flex: none; appearance: none; cursor: pointer; font: inherit; font-size: 12.5px;
    display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 10px;
    border: 1px solid var(--color-line); background: var(--color-panel); color: var(--color-tx2);
  }
  .login:hover:not(:disabled) { color: var(--color-tx); border-color: var(--color-line2); }
  .login:disabled { opacity: .5; cursor: default; }
  .login svg { width: 14px; height: 14px; }
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
  @media (max-width: 1032px) { .sync .txt, .tag { display: none; } .tabs { margin-left: 4px; } .tabs button { padding: 5px 12px; } }
</style>
