<script lang="ts">
  import { app, history, exportHistory } from '../store.svelte'
  import type { SortField } from '../types'
  import { won } from '../format'

  let term = $state('')   // 입력 중인 검색어
  let q = $state('')      // 실제로 적용된 검색어
  // 기간은 '월별'(연·월 드롭다운)이 기본이고, 필요하면 '기간 지정'으로 날짜를 직접 넣는다
  const TODAY = new Date()
  const NOW_Y = TODAY.getFullYear()
  const NOW_M = TODAY.getMonth() + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  /** 오늘. 날짜 칸의 max로 써서 오지 않은 날을 못 고르게 한다 */
  const TODAY_STR = `${NOW_Y}-${pad(NOW_M)}-${pad(TODAY.getDate())}`

  let mode = $state<'all' | 'month' | 'range'>('all')
  let year = $state(NOW_Y)
  let month = $state(NOW_M)
  let start = $state('')   // 기간 지정 모드에서만 쓴다
  let end = $state('')

  /** 고른 해에서 고를 수 있는 달. 올해라면 이번 달까지다 */
  const months = $derived.by(() => {
    const last = year === NOW_Y ? NOW_M : 12
    return Array.from({ length: last }, (_, i) => i + 1)
  })
  // 2026년 3월을 보다가 2025년으로 옮기면 3월이 그대로 맞지만, 반대로 올해로
  // 돌아오면 아직 오지 않은 달에 머무를 수 있다. 그때는 이번 달로 당긴다
  $effect(() => {
    if (year === NOW_Y && month > NOW_M) month = NOW_M
  })

  const period = $derived.by(() => {
    if (mode === 'all') return { start: '', end: '' }
    if (mode === 'range') return { start, end }
    const lastDay = new Date(year, month, 0).getDate()   // 다음 달 0일 = 이번 달 말일
    return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` }
  })
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

  /** 드롭다운에 띄울 연도. 보관된 내역의 범위에 올해와 지금 고른 해를 always 포함한다 */
  const years = $derived.by(() => {
    const ys = [NOW_Y, year]
    for (const d of [res?.first, res?.last]) if (d) ys.push(Number(d.slice(0, 4)))
    // 오지 않은 해는 고를 것이 없다. 보관된 내역이 미래 날짜를 들고 있어도 자른다
    const hi = Math.min(Math.max(...ys), NOW_Y)
    const lo = Math.min(Math.min(...ys), hi)
    return Array.from({ length: hi - lo + 1 }, (_, i) => hi - i)
  })

  // 조건이 바뀌면 첫 페이지부터 다시
  const key = $derived(`${q}|${period.start}|${period.end}|${sort}|${desc}|${size}`)
  let lastKey = ''
  $effect(() => {
    const k = key
    if (k !== lastKey) { lastKey = k; page = 1 }
    history({ page, size, q, start: period.start, end: period.end, sort: sort ?? 'date', desc })
  })

  function search() { q = term.trim() }

  async function save() {
    exporting = true
    try {
      const r = await exportHistory({ q, start: period.start, end: period.end, sort: sort ?? 'date', desc })
      if (r.canceled) notify(true, '내보내기를 취소했어요')
      else if (r.error) notify(false, `저장하지 못했어요 · ${r.error}`)
      else notify(true, `${r.name} 저장 완료 · ${(r.count ?? 0).toLocaleString('ko-KR')}건`)
    } catch (e) {
      notify(false, `저장하지 못했어요 · ${e}`)
    } finally {
      exporting = false
    }
  }

  function reset() {
    term = ''; q = ''
    mode = 'all'; year = NOW_Y; month = NOW_M
    start = ''; end = ''
    sort = null; sortDesc = false
  }
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
      <!-- 도구줄에 두면 앞의 것들이 줄바꿈될 때마다 같이 밀린다. 여기는 안 밀린다 -->
      <button class="btn primary out" onclick={save} disabled={exporting || !res?.total}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
        <span class="lbl">{exporting ? '내보내는 중…' : '엑셀로 내보내기'}</span>
      </button>
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
        <div class="seg" role="group" aria-label="기간 고르는 방식">
          <button class:on={mode === 'all'} aria-pressed={mode === 'all'} onclick={() => (mode = 'all')}>전체</button>
          <button class:on={mode === 'month'} aria-pressed={mode === 'month'} onclick={() => (mode = 'month')}>월별</button>
          <button class:on={mode === 'range'} aria-pressed={mode === 'range'} onclick={() => (mode = 'range')}>기간 지정</button>
        </div>
        <!-- 비어 있어도 자리는 지킨다. 까닭은 아래 .opts 규칙에 적어 두었다 -->
        <div class="opts">
          {#if mode === 'month'}
            <select bind:value={year} aria-label="연도">
              {#each years as y (y)}<option value={y}>{y}년</option>{/each}
            </select>
            <select bind:value={month} aria-label="월">
              {#each months as m (m)}<option value={m}>{m}월</option>{/each}
            </select>
          {:else if mode === 'range'}
            <!-- max를 걸어 오지 않은 날은 달력에서 아예 못 고르게 한다 -->
            <input type="date" bind:value={start} max={end || TODAY_STR} aria-label="시작 날짜" />
            <span>~</span>
            <input type="date" bind:value={end} min={start} max={TODAY_STR} aria-label="끝 날짜" />
          {/if}
        </div>
      </div>
      <div class="grow"></div>
      <div class="tail">
        <select bind:value={size} aria-label="한 페이지 개수">
          {#each [25, 50, 100, 200] as n (n)}<option value={n}>{n}개씩</option>{/each}
        </select>
        <button class="chip" onclick={reset}>조건 초기화</button>
      </div>
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
    background: color-mix(in oklab, var(--color-scrim) 72%, transparent);
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
  h2 { flex: none; }
  h2 { font-family: var(--font-display); font-weight: 400; font-size: 19px; margin: 0; }
  /* 보관 범위가 길어도 내보내기·닫기를 밀어내지 않게 줄여서 말줄임 */
  .meta { min-width: 0; font-size: 12px; color: var(--color-tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta em { font-style: normal; color: var(--color-butter); }
  .out { margin-left: auto; flex: none; white-space: nowrap; }
  .x { appearance: none; width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: grid; place-items: center; border: 1px solid var(--color-line); background: var(--color-panel2); color: var(--color-tx2); }
  .x:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .x { flex: none; }
  .x svg { width: 15px; height: 15px; }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 0 20px 12px; }
  /*
   * 검색칸이 남는 자리를 먹었다 뱉었다 했다. '전체'를 고르면 뒤따르는 칸이
   * 사라지니 검색칸이 그만큼 늘어나면서 토글을 오른쪽으로 밀어 버렸다.
   * 폭을 붙박아 두면 토글은 늘 같은 자리에 선다.
   */
  .search { display: flex; align-items: center; gap: 4px; flex: none; width: 220px; padding: 0 4px 0 12px; border-radius: 10px; border: 1px solid var(--color-line); background: var(--color-bg2); }
  /* 남는 자리는 토글 뒤에서 늘어난다. 개수·초기화는 오른쪽 끝에 붙어 있게 된다 */
  .grow { flex: 1 1 0; min-width: 0; }
  .search input { flex: 1; min-width: 0; border: 0; background: none; outline: none; color: var(--color-tx); font: inherit; font-size: 13px; padding: 9px 0; }
  .search .go, .search .clear { appearance: none; border: 0; background: none; cursor: pointer; color: var(--color-tx3); display: grid; place-items: center; }
  .search .go { width: 28px; height: 28px; border-radius: 8px; }
  .search .go:hover { color: var(--color-tx); background: var(--color-panel2); }
  .search .go svg { width: 15px; height: 15px; }
  .search .clear { font-size: 16px; line-height: 1; padding: 0 4px; }
  .search .clear:hover { color: var(--color-tx); }
  .range { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--color-tx3); }
  /*
   * 뒤따르는 칸은 남은 자리에 맞춰 줄어든다.
   *
   * 중단점으로만 막으면 그 사이 폭(창을 반만 줄인 노트북, 세로로 든 패드)에서
   * 둘째 날짜 칸이 밖으로 밀려 잘린다. 어느 폭에서든 줄어들게 두고, 대신
   * 넉넉할 때 혼자 늘어나지 않게 위를 막는다.
   */
  /*
   * 비어 있어도 가장 넓은 '기간 지정'만큼 자리를 잡아 둔다.
   *
   * 방식마다 폭이 달라지면 도구줄이 줄바꿈되는 시점도 달라진다. 그러면 어떤
   * 폭에서는 '전체'일 때 토글이 첫 줄에 있다가 '기간 지정'으로 바꾸면 아랫줄로
   * 내려간다. 폭을 붙박아 두면 줄바꿈이 어느 방식에서나 똑같이 일어난다.
   */
  .opts { display: flex; align-items: center; gap: 6px; flex: 0 1 auto; min-width: 316px; }
  .opts input[type=date] { flex: 0 1 auto; min-width: 0; max-width: 150px; }
  .opts select { flex: 0 1 auto; min-width: 0; }
  .tail { display: flex; flex: none; align-items: center; gap: 8px; }
  .seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; flex: none; border: 1px solid var(--color-line); border-radius: 10px; overflow: hidden; background: var(--color-bg2); }
  .seg button { appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; padding: 8px 11px; border: 0; background: none; color: var(--color-tx3); white-space: nowrap; min-width: 0; }
  .seg button:hover { color: var(--color-tx2); }
  .seg button.on { background: color-mix(in oklab, var(--color-lav) 18%, var(--color-bg2)); color: var(--color-tx); }
  input[type=date], select {
    font: inherit; font-size: 12.5px; color: var(--color-tx); color-scheme: inherit;
    background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 10px; padding: 8px 10px; outline: none;
    /* 날짜 칸은 브라우저가 정한 기본 폭이 꽤 넓다. 그대로 두면 좁은 화면에서
       둘째 칸이 밖으로 밀려 잘린다. 줄어들 수 있게 열어 둔다 */
    min-width: 0;
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
  /*
   * 좁은 화면.
   *
   * 줄마다 하나씩 맡긴다. 검색 / 토글 / 바뀌는 칸 / 개수·초기화.
   * 토글은 줄을 통째로 쓰고 셋으로 고르게 나눈다. 어느 방식을 골라도 폭이
   * 같으니 자리가 흔들리지 않는다.
   *
   * 이 덩어리는 반드시 스타일시트 맨 끝에 둔다. 가운데 끼워 두면 뒤에 오는
   * 기본 규칙들이 그대로 덮어써서 아무 일도 일어나지 않는다. 실제로 그랬다.
   *
   * (중단점은 app.css에 적어 둔 좁은 화면 기준값 672)
   */
  @media (max-width: 672px) {
    header { gap: 8px; padding: 14px 14px 10px; }
    .meta { display: none; }
    .out { padding: 8px 10px; }
    .out .lbl { display: none; }

    .tools { padding: 0 14px 10px; gap: 7px; }
    .search { width: 100%; }
    .range { flex: 1 1 100%; gap: 7px; }
    .seg { width: 100%; }
    .seg button { padding: 9px 4px; font-size: 12.5px; }
    .opts { flex: 1 1 100%; min-width: 0; gap: 7px; }
    .opts select, .opts input[type=date] { flex: 1 1 0; width: 100%; min-width: 0; max-width: none; }
    .grow { display: none; }
    .tail { flex: 1 1 100%; }
    .tail select { flex: none; }
    .tail .chip { flex: 1 1 0; }

    .count { padding: 0 14px 8px; font-size: 12px; }
    .rows { padding: 0 14px; }
    .row { grid-template-columns: 74px minmax(0, 1fr) auto; gap: 8px; font-size: 12.5px; }
    /* 쪽 넘기기는 다섯 개가 한 줄에 안 들어간다. 양 끝을 접는다 */
    footer { padding: 10px 14px; gap: 6px; }
    footer .chip:first-child, footer .chip:last-child { display: none; }
    footer .chip { flex: 1 1 0; }
    .pages { min-width: 0; flex: 1 1 0; }
  }
</style>