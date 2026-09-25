<script lang="ts">
  import { onMount } from 'svelte'
  import { app, clearWeb } from '../store.svelte'
  import { bookmarkletUrl } from '../web/bookmarklet'
  import { openNexon } from '../web/import'
  import { spotlight, won } from '../format'

  const d = $derived(app.data!)
  const count = $derived(d.recent.length ? d.weeks.reduce((s, w) => s + w.spent, 0) : 0)
  const has = $derived(d.weeks.some(w => w.spent))

  let url = $state('')
  let status = $state('')
  let waiting = $state(false)

  // 북마클릿이 이 화면을 부르면 다음에 누를 단추를 짚어 준다.
  // 창이 이미 떠 있으면 아무 변화가 없어서 눌린 줄도 모른다.
  const poke = $derived(app.importPoke > 0 && !waiting && !busy)

  // 받는 일은 store가 앱이 뜰 때부터 하고 있다. 여기서는 그 상태만 비춘다
  const busy = $derived(app.importing)
  const p = $derived(app.progress)

  let goBtn = $state<HTMLButtonElement | null>(null)

  onMount(() => {
    url = bookmarkletUrl(location.origin)
    return () => { app.importPoke = 0 }   // 창을 닫으면 짚어 주기도 끝난다
  })

  // 창이 길어서 단추가 화면 밖일 수 있다. 짚어 줄 때는 보이는 곳까지만 끌어온다
  $effect(() => {
    if (app.importPoke > 0) goBtn?.scrollIntoView({ block: 'nearest' })
  })

  // 지우고 나면 되돌릴 수 없다. 한 번 더 묻는다
  let asking = $state(false)
  let wiping = $state(false)

  async function wipe() {
    wiping = true
    try {
      await clearWeb()
      asking = false
      app.showImport = false   // 빈 화면으로 돌려보낸다
    } finally {
      wiping = false
    }
  }

  function go() {
    app.importPoke = 0
    waiting = true
    status = '넥슨 결제내역 페이지를 열었어요. 거기서 북마크를 눌러 주세요.'
    if (!openNexon()) {
      waiting = false
      status = '새 탭이 막혔어요. 팝업 허용을 켜거나 직접 결제내역 페이지를 열어 주세요.'
    }
  }
</script>

<article class="card" use:spotlight>
  <h3 class="card-title">
    구매내역 가져오기
    <span class="sub">{has ? `${won(count)}원 · 최근 13주` : '아직 없어요'}</span>
  </h3>

  {#if busy}
    <p class="live">
      <span class="spin" aria-hidden="true"></span>
      <span class="livetx">
        <b>넥슨에서 내역을 읽고 있어요</b>
        <small>{p ? `${p.label} · 메이플 ${p.count ?? 0}건` : '연결됐어요. 곧 시작돼요'}</small>
      </span>
    </p>
  {:else if app.importError}
    <p class="live bad">
      <span class="livetx"><b>가져오지 못했어요</b><small>{app.importError}</small></span>
    </p>
  {/if}

  <p class="why">
    브라우저는 다른 사이트의 응답을 읽지 못해서, 이 화면이 넥슨을 직접 볼 수 없어요.
    대신 <b>넥슨 페이지에서 실행되는 북마크</b>를 하나 만들어 두면 거기서 내역을 읽어 보내 줍니다.
    받은 내역은 <b>이 브라우저에만</b> 저장돼요.
  </p>

  <ol class="steps">
    <li>
      <span class="n">1</span>
      <div>
        <b>아래 단추를 북마크바로 끌어다 놓으세요</b> <em>(처음 한 번만)</em>
        <div class="drop">
          <a class="bm" href={url} onclick={e => e.preventDefault()}>📥 MapleMVP 가져오기</a>
          <small>북마크바가 없으면 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd></small>
        </div>
      </div>
    </li>
    <li>
      <span class="n">2</span>
      <div>
        <b>넥슨 결제내역 페이지를 열고 로그인하세요</b>
        <small>아래 단추로 열면 됩니다. 다른 사이트에서 북마크를 눌러도
          같은 안내가 뜨면서 열 수 있어요.</small>
        <button class="btn primary" class:poke bind:this={goBtn} onclick={go} disabled={waiting}>
          {waiting ? '열었어요 · 거기서 북마크를 누르세요' : '넥슨 결제내역 페이지 열기'}
        </button>
      </div>
    </li>
    <li>
      <span class="n">3</span>
      <div>
        <b class="hl">그 페이지에서</b> <b>북마크를 한 번 더 누르면 끝이에요</b>
        <small>내역을 읽어서 이 화면으로 보내고, 넥슨 탭은 알아서 닫힙니다.
          읽는 동안 진행률이 여기 위에 뜹니다.</small>
      </div>
    </li>
  </ol>

  <p class="note">
    다음부터는 <b>아무 사이트에서나 북마크만 누르면</b> 돼요. MapleMVP를 미리 열어 둘
    필요도 없어요 — 다 읽으면 이 화면을 알아서 띄워 줍니다. 이미 열려 있으면 그 탭으로 옵니다.
  </p>

  {#if status}<p class="status" class:on={!waiting}>{status}</p>{/if}

  <div class="danger">
    {#if asking}
      <span class="ask">이 브라우저에 저장된 <b>구매내역과 PC방 보정값</b>을 모두 지워요. 되돌릴 수 없어요.</span>
      <button class="btn del on" onclick={wipe} disabled={wiping}>{wiping ? '지우는 중…' : '지우기'}</button>
      <button class="btn" onclick={() => (asking = false)} disabled={wiping}>취소</button>
    {:else}
      <span class="ask">받아 둔 내역은 이 브라우저에만 있어요.</span>
      <button class="btn del" onclick={() => (asking = true)}>캐시 삭제</button>
    {/if}
  </div>
</article>

<style>
  .card { display: grid; gap: 12px; align-content: start; }
  .why { margin: 0; font-size: 12.5px; line-height: 1.65; color: var(--color-tx2); }
  .why b { color: var(--color-tx); }

  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
  .steps li { display: flex; gap: 11px; align-items: flex-start; }
  .steps li > div { display: grid; gap: 7px; justify-items: start; min-width: 0; }
  .n {
    flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
    font-size: 12px; font-weight: 600; color: var(--color-lav);
    background: color-mix(in oklab, var(--color-lav) 18%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-lav) 40%, transparent);
  }
  .steps b { font-size: 13px; color: var(--color-tx); font-weight: 600; }
  .steps em { font-style: normal; font-size: 11.5px; color: var(--color-tx3); }
  .steps small { font-size: 11.5px; color: var(--color-tx3); line-height: 1.55; }

  .drop { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .bm {
    display: inline-flex; align-items: center; gap: 6px; cursor: grab; user-select: none;
    font-size: 13px; font-weight: 600; text-decoration: none; padding: 8px 14px; border-radius: 10px;
    color: var(--color-tx); background: var(--color-bg2);
    border: 1px dashed color-mix(in oklab, var(--color-lav) 55%, var(--color-line));
  }
  .bm:hover { border-style: solid; border-color: var(--color-lav); }
  kbd {
    font: inherit; font-family: var(--font-mono); font-size: 11px; padding: 1px 5px;
    border-radius: 5px; border: 1px solid var(--color-line2); background: var(--color-panel2);
  }

  .btn { appearance: none; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx); }
  .btn:disabled { opacity: .5; cursor: default; }
  .btn.primary { background: var(--color-lav); border-color: var(--color-lav); color: #1b1c21; }
  /* 크기는 그대로 두고 테두리 빛만 번지게 한다 */
  .btn.poke { animation: call 1.8s ease-out infinite; }
  @keyframes call {
    0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-lav) 60%, transparent); }
    70%, 100% { box-shadow: 0 0 0 12px transparent; }
  }
  @media (prefers-reduced-motion: reduce) { .btn.poke { animation: none; } }

  .hl { color: var(--color-lav) !important; }
  .note {
    margin: 0; font-size: 11.5px; line-height: 1.6; color: var(--color-tx3);
    padding: 10px 12px; border-radius: 10px; background: var(--color-bg2); border: 1px solid var(--color-line);
  }
  .note b { color: var(--color-tx2); }
  .danger {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding-top: 13px; border-top: 1px solid var(--color-line);
  }
  .ask { flex: 1 1 220px; min-width: 0; font-size: 11.5px; line-height: 1.55; color: var(--color-tx3); }
  .ask b { color: var(--color-tx2); }
  .btn.del { color: var(--color-bad); border-color: color-mix(in oklab, var(--color-bad) 45%, var(--color-line)); }
  .btn.del:hover:not(:disabled) { background: color-mix(in oklab, var(--color-bad) 14%, transparent); }
  .btn.del.on { background: var(--color-bad); border-color: var(--color-bad); color: #1b1c21; }
  .btn.del.on:hover:not(:disabled) { filter: brightness(1.08); }

  .status { margin: 0; font-size: 12.5px; color: var(--color-tx2); }
  .status.on { color: var(--color-good); }

  /* 북마클릿이 읽고 있는 동안 */
  .live {
    display: flex; align-items: center; gap: 11px; margin: 0;
    padding: 11px 13px; border-radius: 12px; background: var(--color-bg2);
    border: 1px solid color-mix(in oklab, var(--color-lav) 55%, var(--color-line));
  }
  .live.bad { border-color: color-mix(in oklab, var(--color-bad) 55%, var(--color-line)); }
  .livetx { display: grid; gap: 2px; min-width: 0; }
  .livetx b { font-size: 13px; color: var(--color-tx); }
  .livetx small { font-size: 11.5px; color: var(--color-tx3); line-height: 1.5; }
  .live.bad .livetx b { color: var(--color-bad); }
  .spin {
    flex: none; display: inline-block; width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid color-mix(in oklab, var(--color-lav) 30%, transparent); border-top-color: var(--color-lav);
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
