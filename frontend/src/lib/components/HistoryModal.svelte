<script lang="ts">
  import { app, history, exportHistory } from '../store.svelte'
  import type { SortField } from '../types'
  import { won } from '../format'

  let term = $state('')   // 입력 중인 검색어
  let q = $state('')      // 실제로 적용된 검색어
  let start = $state('')
  let end = $state('')
  // null이면 기본 순서(최신순). 헤더를 누르면 오름차순 → 내림차순 → 기본으로 돈다
  let sort = $state<SortField | null>(null)
  let sortDesc = $state(false)
  const desc = $derived(sort === null ? true : sortDesc)

  function clickSort(f: SortField) {
    if (sort !== f) { sort = f; sortDesc = false }
    else if (!sortDesc) sortDesc = true
    else sort = null
  }
  const arrow = (f: SortField) => (sort !== f ? '' : sortDesc ? '▼' : '▲')
  let size = $state(50)
  let page = $state(1)
  let exporting = $state(false)
  let toast = $state<{ ok: boolean; msg: string } | null>(null)
  let toastTimer: number | undefined

  function notify(ok: boolean, msg: string) {
    toast = { ok, msg }
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => (toast = null), 4000)
  }

  const res = $derived(app.history)

  // 조건이 바뀌면 첫 페이지부터 다시
  const key = $derived(`${q}|${start}|${end}|${sort}|${desc}|${size}`)
  let lastKey = ''
  $effect(() => {
    const now = key
    if (now !== lastKey) { lastKey = now; page = 1 }
    history({ page, size, q, start, end, sort: sort ?? 'date', desc })
  })

  function search() { q = term.trim() }

  async function save() {
    exporting = true
    try {
      const r = await exportHistory({ q, start, end, sort: sort ?? 'date', desc })
      if (r.canceled) notify(true, '내보내기를 취소했어요')
      else if (r.error) notify(false, `저장하지 못했어요 · ${r.error}`)
      else notify(true, `${r.name} 저장 완료 · ${(r.count ?? 0).toLocaleString('ko-KR')}건`)
    } catch (e) {
      notify(false, `저장하지 못했어요 · ${e}`)
    } finally {
      exporting = false
    }
  }

  function reset() { term = ''; q = ''; start = ''; end = ''; sort = null; sortDesc = false }
</script>

<div class="back" role="presentation" onclick={e => e.target === e.currentTarget && (app.showHistory = false)}>
  <div class="sheet" role="dialog" aria-label="구매내역 전체">
    <header>
      <h2>구매내역 보관함</h2>
      {#if res}
        <span class="meta">
          {res.first ? `${res.first.replace(/-/g, '.')} ~ ${res.last.replace(/-/g, '.')}` : ''}
          · 전체 {res.allTotal.toLocaleString('ko-KR')}건
          {#if !res.archived}<em>· 과거 내역을 아직 받아오는 중이에요</em>{/if}
        </span>
      {/if}
      <button class="x" onclick={() => (app.showHistory = false)} aria-label="닫기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </header>

    <div class="tools">
      <div class="search">
        <input type="text" bind:value={term} placeholder="아이템 이름으로 검색 후 Enter" aria-label="아이템 검색"
          onkeydown={e => e.key === 'Enter' && search()} />
        {#if q}<button class="clear" onclick={() => { term = ''; q = '' }} aria-label="검색어 지우기">×</button>{/if}
        <button class="go" onclick={search} aria-label="검색">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        </button>
      </div>
      <div class="range">
        <input type="date" bind:value={start} aria-label="시작 날짜" />
        <span>~</span>
        <input type="date" bind:value={end} aria-label="끝 날짜" />
      </div>
      <select bind:value={size} aria-label="한 페이지 개수">
        {#each [25, 50, 100, 200] as n (n)}<option value={n}>{n}개씩</option>{/each}
      </select>
      <button class="chip" onclick={reset}>조건 초기화</button>
      <div class="grow"></div>
      <button class="btn primary" onclick={save} disabled={exporting || !res?.total}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
        엑셀로 내보내기
      </button>
    </div>

    {#if res}
      <div class="count">
        조건에 맞는 결제 <b>{res.total.toLocaleString('ko-KR')}건</b> · 합계 <b class="mono">{won(res.sum)}원</b>
      </div>

      <div class="rows">
        <div class="row head">
          <button class="sort" class:on={sort === 'date'} onclick={() => clickSort('date')}>날짜 <i>{arrow('date')}</i></button>
          <button class="sort" class:on={sort === 'item'} onclick={() => clickSort('item')}>아이템 <i>{arrow('item')}</i></button>
          <button class="sort num" class:on={sort === 'price'} onclick={() => clickSort('price')}>금액 <i>{arrow('price')}</i></button>
        </div>
        {#each res.rows as r, i (r.date + r.item + i)}
          <div class="row">
            <span class="mono dt">{r.date.replace(/-/g, '.')}</span>
            <span class="it">{r.item}</span>
            <span class="num mono" class:neg={r.price < 0}>{won(r.price)}</span>
          </div>
        {:else}
          <p class="empty">조건에 맞는 결제가 없어요.</p>
        {/each}
      </div>

      {#if toast}
        <div class="toast" class:bad={!toast.ok} role="status">
          {#if toast.ok}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 8v5M12 16h.01"/><circle cx="12" cy="12" r="9"/></svg>
          {/if}
          {toast.msg}
        </div>
      {/if}

      <footer>
        <button class="chip" disabled={res.page <= 1} onclick={() => (page = 1)}>처음</button>
        <button class="chip" disabled={res.page <= 1} onclick={() => (page = res.page - 1)}>이전</button>
        <span class="pages mono">{res.page} / {res.pages}</span>
        <button class="chip" disabled={res.page >= res.pages} onclick={() => (page = res.page + 1)}>다음</button>
        <button class="chip" disabled={res.page >= res.pages} onclick={() => (page = res.pages)}>마지막</button>
      </footer>
    {:else}
      <p class="empty">불러오는 중…</p>
    {/if}
  </div>
</div>

<svelte:window onkeydown={e => e.key === 'Escape' && (app.showHistory = false)} />

<style>
  .back {
    position: absolute; inset: 52px 0 0 0; z-index: 40;
    display: grid; place-items: center; padding: 20px;
    background: color-mix(in oklab, #14151a 72%, transparent);
    backdrop-filter: blur(8px);
  }
  .sheet {
    position: relative;
    width: min(1000px, 100%); max-height: 100%;
    display: flex; flex-direction: column;
    background: var(--color-panel); border: 1px solid var(--color-line2); border-radius: 22px;
    box-shadow: 0 30px 90px -30px rgba(0, 0, 0, .85);
    overflow: hidden;
  }
  header { display: flex; align-items: center; gap: 12px; padding: 18px 20px 12px; }
  h2 { font-family: var(--font-display); font-weight: 400; font-size: 19px; margin: 0; }
  .meta { font-size: 12px; color: var(--color-tx3); }
  .meta em { font-style: normal; color: var(--color-butter); }
  .x { margin-left: auto; appearance: none; width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: grid; place-items: center; border: 1px solid var(--color-line); background: var(--color-panel2); color: var(--color-tx2); }
  .x:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .x svg { width: 15px; height: 15px; }

  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 0 20px 12px; }
  .grow { flex: 1; }
  .search { display: flex; align-items: center; gap: 4px; flex: 1 1 220px; min-width: 200px; padding: 0 4px 0 12px; border-radius: 10px; border: 1px solid var(--color-line); background: var(--color-bg2); }
  .search input { flex: 1; min-width: 0; border: 0; background: none; outline: none; color: var(--color-tx); font: inherit; font-size: 13px; padding: 9px 0; }
  .search .go, .search .clear { appearance: none; border: 0; background: none; cursor: pointer; color: var(--color-tx3); display: grid; place-items: center; }
  .search .go { width: 28px; height: 28px; border-radius: 8px; }
  .search .go:hover { color: var(--color-tx); background: var(--color-panel2); }
  .search .go svg { width: 15px; height: 15px; }
  .search .clear { font-size: 16px; line-height: 1; padding: 0 4px; }
  .search .clear:hover { color: var(--color-tx); }
  .range { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-tx3); }
  input[type=date], select {
    font: inherit; font-size: 12.5px; color: var(--color-tx); color-scheme: dark;
    background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 10px; padding: 8px 10px; outline: none;
  }
  input[type=date]:focus, select:focus, .search:focus-within { border-color: var(--color-lav); }
  .chip { appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2); }
  .chip:hover:not(:disabled) { color: var(--color-tx); border-color: var(--color-line2); }
  .chip:disabled { opacity: .4; cursor: default; }
  .toast {
    position: absolute; left: 50%; bottom: 74px; transform: translateX(-50%);
    display: flex; align-items: center; gap: 9px; max-width: calc(100% - 48px);
    padding: 10px 16px; border-radius: 12px; font-size: 13px; color: var(--color-tx);
    background: color-mix(in oklab, var(--color-panel3) 94%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-mint) 45%, var(--color-line));
    box-shadow: 0 16px 40px -14px rgba(0, 0, 0, .8);
    animation: rise .25s ease-out;
  }
  .toast.bad { border-color: color-mix(in oklab, var(--color-bad) 55%, var(--color-line)); }
  .toast svg { width: 16px; height: 16px; color: var(--color-mint); flex: none; }
  .toast.bad svg { color: var(--color-bad); }
  @keyframes rise { from { opacity: 0; transform: translate(-50%, 8px); } }

  .count { padding: 0 20px 10px; font-size: 13px; color: var(--color-tx2); }
  .count b { color: var(--color-tx); }

  .rows { flex: 1; overflow-y: auto; padding: 0 20px; }
  .row { display: grid; grid-template-columns: 96px minmax(0, 1fr) 120px; gap: 12px; align-items: center; padding: 9px 4px; border-bottom: 1px dashed var(--color-line); font-size: 13.5px; }
  .row.head { position: sticky; top: 0; z-index: 1; background: var(--color-panel); font-size: 11.5px; color: var(--color-tx3); border-bottom: 1px solid var(--color-line); padding: 4px 4px; }
  .sort { appearance: none; border: 0; background: none; cursor: pointer; font: inherit; font-size: 11.5px; color: var(--color-tx3); padding: 5px 6px; border-radius: 7px; text-align: left; display: flex; align-items: center; gap: 5px; }
  .sort.num { justify-content: flex-end; }
  .sort:hover { color: var(--color-tx); background: var(--color-panel2); }
  .sort.on { color: var(--color-lav); }
  .sort i { font-style: normal; font-size: 9px; }
  .dt { color: var(--color-tx3); font-size: 12.5px; }
  .it { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .num { text-align: right; }
  .row:not(.head) .num { font-weight: 600; }
  .num.neg { color: var(--color-bad); }
  .empty { padding: 30px 20px; text-align: center; color: var(--color-tx3); font-size: 13px; }

  footer { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid var(--color-line); }
  .pages { font-size: 13px; color: var(--color-tx2); min-width: 70px; text-align: center; }
</style>
