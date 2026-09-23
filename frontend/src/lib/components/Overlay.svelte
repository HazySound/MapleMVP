<script lang="ts">
  import gsap from 'gsap'
  import { app, openLogin, refresh } from '../store.svelte'
  import { REDUCED } from '../format'

  const pct = $derived(app.progress && app.progress.total ? (app.progress.done / app.progress.total) * 100 : 6)
  // 과거 내역은 어디까지 있는지 미리 알 수 없어서 전체 개수 대신 받은 건수를 보여준다
  const busy = $derived(!app.progress?.total)
  const detail = $derived.by(() => {
    const p = app.progress
    if (!p) return '넥슨 페이지 여는 중'
    const got = p.count ? ` · ${p.count}건 받음` : ''
    return p.total ? `${p.label} · ${p.done}/${p.total}${got}` : `${p.label}${got}`
  })

  function pop(node: HTMLElement) {
    if (!REDUCED) gsap.from(node, { y: 20, scale: 0.97, opacity: 0, duration: 0.5, ease: 'back.out(1.6)' })
  }
</script>

{#if app.overlay && app.overlay !== 'boot'}
  <div class="overlay" class:solid={!app.data}>
    <div class="box" use:pop>
      {#if app.overlay === 'login'}
        <div class="ic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        </div>
        {#if app.loginOpened}
          <h2>로그인 창에서 로그인해 주세요</h2>
          <p>로그인이 끝나면 창이 자동으로 닫히고 바로 불러와요. 창을 닫았다면 다시 열 수 있어요.</p>
          <button class="btn" onclick={openLogin}>로그인 창 다시 열기</button>
        {:else}
          <h2>넥슨 로그인이 필요해요</h2>
          <p>처음 한 번만 로그인하면 이 PC에 로그인 상태가 저장돼서, 다음부터는 열자마자 불러와요. 앱은 아이디와 비밀번호를 보지도, 저장하지도 않아요.</p>
          <button class="btn primary" onclick={openLogin}>넥슨 로그인 창 열기</button>
        {/if}
        <div class="fine">로그인 창은 넥슨 공식 로그인 페이지예요.</div>
      {:else if app.overlay === 'first-sync'}
        <div class="ic spin">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
        </div>
        <h2>구매내역 불러오는 중</h2>
        <p>처음 한 번만 오래 걸려요. 이월 계산에 쓸 최근 1년 치를 먼저 읽고, 이어서 보관함에 담을 지난 내역을 끝까지 받아와요. 중간에 창을 닫아도 받은 만큼 저장돼서 다음에 이어받고, 그 다음부터는 이번 달만 새로 읽어요.</p>
        <div class="prog" class:busy><i style={busy ? '' : `width:${pct}%`}></i></div>
        <div class="fine mono">{detail}</div>
      {:else if app.overlay === 'first-error'}
        <div class="ic warn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
        </div>
        <h2>구매내역을 불러오지 못했어요</h2>
        <p>{app.firstError}</p>
        <button class="btn primary" onclick={refresh} disabled={app.syncing}>다시 시도</button>
      {/if}
    </div>
  </div>
{/if}

{#if app.error && !app.overlay}
  <div class="toast" role="status">
    <span>{app.error}</span>
    <button class="btn" onclick={refresh} disabled={app.syncing}>다시 시도</button>
  </div>
{/if}

<style>
  .overlay {
    position: absolute; inset: 52px 0 0 0; z-index: 20;
    display: grid; place-items: center; padding: 24px;
    background: color-mix(in oklab, #1e1f25 78%, transparent);
    backdrop-filter: blur(10px);
  }
  .overlay.solid { background: color-mix(in oklab, #1e1f25 55%, transparent); }
  .box {
    width: 100%; max-width: 440px; text-align: center;
    background: var(--color-panel); border: 1px solid var(--color-line2); border-radius: 26px;
    padding: 30px 26px; box-shadow: 0 30px 80px -30px rgba(0, 0, 0, .8);
  }
  .ic {
    width: 58px; height: 58px; margin: 0 auto; border-radius: 18px; display: grid; place-items: center; color: var(--color-lav);
    background: linear-gradient(135deg, color-mix(in oklab, var(--color-lav) 30%, transparent), color-mix(in oklab, var(--color-rose) 25%, transparent));
  }
  .ic.warn { color: var(--color-peach); }
  .ic svg { width: 26px; height: 26px; }
  .ic.spin svg { animation: spin 1.1s linear infinite; }
  h2 { font-family: var(--font-display); font-weight: 400; font-size: 21px; margin: 14px 0 6px; }
  p { color: var(--color-tx2); margin: 0 0 18px; font-size: 13.5px; line-height: 1.6; }
  .fine { font-size: 12px; color: var(--color-tx3); margin-top: 12px; }
  .prog { height: 8px; border-radius: 99px; background: var(--color-bg2); border: 1px solid var(--color-line); overflow: hidden; }
  .prog i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--color-lav), var(--color-mint)); transition: width .5s cubic-bezier(.2, .8, .2, 1); }
  .prog.busy i { width: 34%; animation: slide 1.5s ease-in-out infinite; }
  @keyframes slide { 0% { margin-left: -34%; } 100% { margin-left: 100%; } }
  .toast {
    position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 25;
    display: flex; align-items: center; gap: 14px; padding: 10px 10px 10px 18px; border-radius: 14px;
    background: var(--color-panel2); border: 1px solid color-mix(in oklab, var(--color-peach) 40%, var(--color-line));
    box-shadow: 0 20px 50px -20px rgba(0, 0, 0, .8); font-size: 13px; color: var(--color-tx2);
  }
</style>
