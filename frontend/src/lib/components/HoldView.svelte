<script lang="ts">
  /**
   * 보관함(베타, 2026-11-12 사용자): 결산에서 판매 완료를 끈(아직 들고 있는) 작용 아이템을 경매장 판매 목록처럼 기간 짧은 순으로 보이고,
   * 판매 완료를 누르면 판 가격을 적는다. 판 값은 그 주 결산에도 들어간다.
   * 엄 시세·수수료는 효율표 값을 그대로 쓴다(여기서는 못 고친다). 회수율은 고른 기간의 결산 합계
   */
  import { app, getBase } from '../store.svelte'
  import { eff, feeNow, holdOf, holdWeeks, sellRows, setHoldBase, setUse, umNet, undoSale, type Lot } from '../eff.svelte'
  import { todayKst } from '../core/mvp'
  import NumBox from './NumBox.svelte'
  import { addDays, md, mdy, won, spotlight } from '../format'

  const d = $derived(app.data!)
  const fee = $derived(feeNow(d.current))
  const rows = $derived(getBase()?.rows ?? [])
  const weeks = $derived(holdWeeks(rows))

  // ---- 회수율 기간: 이번 주 · 최근 4주 · 전체 · 직접(주 범위) ----
  type Span = 'week' | '4w' | 'all' | 'custom'
  const SAVE = 'maplemvp.holdSpan'
  let span = $state<Span>('all')
  let from = $state('')
  let to = $state('')
  let view = $state<'all' | 'sold'>('all')
  try {
    const v = JSON.parse(localStorage.getItem(SAVE) ?? 'null')
    if (v) { span = v.span ?? 'all'; from = v.from ?? ''; to = v.to ?? ''; view = v.view === 'sold' ? 'sold' : 'all' }
  } catch { /* 기본값 */ }
  const remember = () => { try { localStorage.setItem(SAVE, JSON.stringify({ span, from, to, view })) } catch { /* 이번만 */ } }
  const range = $derived.by(() => {
    const last = d.thisWeek
    if (span === 'week') return [last, last]
    if (span === '4w') return [addDays(last, -21), last]
    if (span === 'custom' && from && to) return from <= to ? [from, to] : [to, from]
    return ['', '9999']
  })
  function pick(s: Span) {
    span = s
    if (s === 'custom' && !from) { from = weeks[0] ?? d.thisWeek; to = weeks.at(-1) ?? d.thisWeek }
    remember()
  }

  const H = $derived.by(() => {
    void eff.tags; void eff.snaps; void eff.sold; void eff.kept; void eff.prices
    return holdOf(rows, fee, d.current, range[0], range[1])
  })
  const um = $derived(umNet())
  const eok = (v: number) => (Math.round(v * 100) / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '억'
  const today = todayKst()
  /** 남은 기간(일). 무기한이면 null */
  const left = (l: Lot) => l.days ? Math.round((Date.parse(l.date) + l.days * 864e5 - Date.parse(today)) / 864e5) : null

  const held = $derived([...H.lots].sort((a, b) => (left(a) ?? 1e9) - (left(b) ?? 1e9) || a.date.localeCompare(b.date)))
  const heldN = $derived(held.reduce((a, l) => a + l.rows.length, 0))
  /** 판매 완료로 더한 회수용 메소(수수료 뺀 것) */
  const added = $derived(H.sales.reduce((a, s) => a + s.rows.length * s.price * (1 - s.fee), 0))
  const meso = $derived(eff.holdBase + added)

  // 회수율: 다 팔면 = 결산 돌려받은 돈 합(보관 중인 것은 그 주 시세로), 판 것만 = 거기서 보관 중인 것 몫을 뺀 것
  const sold = $derived(Math.max(0, H.back - H.keptWon))
  const shown = $derived(view === 'all' ? H.back : sold)
  const scale = $derived(Math.max(H.spent, H.back, 1))
  const pct = (v: number) => `${(v / scale * 100).toFixed(2)}%`

  /** 판매 완료 칸: 연 줄, 판 개수, 1개 가격 */
  let open = $state<string | null>(null)
  let n = $state(0)
  let price = $state(0)
  function start(l: Lot) {
    if (open === l.key) { open = null; return }
    open = l.key; n = l.rows.length; price = l.price
  }
  function done(l: Lot) {
    const k = Math.min(l.rows.length, Math.floor(n))
    if (k <= 0 || price <= 0) return
    sellRows(l.rows.slice(0, k), price, fee)
    open = null
  }
  function useIt(l: Lot) {
    setUse(l.rows, 'none')
    if (open === l.key) open = null
  }
  const wk = (w: string) => `${mdy(w, d.thisWeek)} – ${md(addDays(w, 6))}`
</script>

<div class="hold">
  <div class="top">
    <h2>보관함</h2><span class="beta">Beta</span>
    <span class="from">
      <span class="lock" title="효율표에서 가져온 값이라 여기서는 못 고쳐요">효율표 값 🔒</span>
      <span>엄 <b>{won(eff.um)}원</b>/억{eff.umFee ? ` · 수수료 ${eff.umFee}%` : ''}</span>
      <span>경매장 수수료 <b>{Math.round(fee * 1000) / 10}%</b></span>
    </span>
  </div>
  <p class="lead">효율표 결산에서 <b>판매 완료</b>를 끈 아이템이 여기 모여요. 기본은 산 주에 판 것으로 셉니다.</p>

  <section class="card" use:spotlight>
    <h3 class="card-title">회수용 메소<span class="sub">엄 {won(eff.um)}원에 팔면 약 {won(meso * um)}원</span></h3>
    <div class="meso">
      <div class="cell"><span class="k">기존 메소 (직접 적기)</span>
        <NumBox id="hold-base" label="기존 회수용 메소(억)" decimal unit="억" placeholder="0" value={eff.holdBase} set={setHoldBase} /></div>
      <span class="op">+</span>
      <div class="cell add"><span class="k">판매 완료로 더한 메소</span><span class="v">+{eok(added)}</span></div>
      <span class="op">=</span>
      <div class="cell sum"><span class="k">회수용 메소 합계</span><span class="v">{eok(meso)}</span></div>
    </div>
  </section>

  <section class="card" use:spotlight>
    <h3 class="card-title">판매 중<span class="sub">{heldN ? `${heldN}개 · 기간 짧은 순` : ''}</span></h3>
    <div class="list">
      <div class="row hd"><span>아이템</span><span class="r">개수</span><span class="r pc">산 주 시세(1개)</span><span></span></div>
      {#each held as l (l.key)}
        {@const dl = left(l)}
        <div class="row">
          <span class="nm"><b>{l.name}</b>{#if dl == null}<span class="chip">무기한</span>{:else}<span class="chip" class:d={dl <= 3}>{dl <= 0 ? '기간 끝' : `D-${dl}`}</span>{/if}
            <span class="sub">{md(l.date)}에 삼 · <button class="lk" onclick={() => useIt(l)}>사용 아이템으로 빼기 (회수 없음으로)</button></span></span>
          <span class="r mono">{l.rows.length}</span>
          <span class="r mono pc">{#if l.price}{eok(l.price)}{#if l.est}<span class="chip warn" title="그 주 시세가 없어 지금 가격표 값">가격표</span>{/if}{:else}<span class="chip warn">시세 없음</span>{/if}</span>
          <span class="r"><button class="btn primary sm" onclick={() => start(l)} aria-expanded={open === l.key}>판매 완료</button></span>
          {#if open === l.key}
            <form class="sell" onsubmit={e => { e.preventDefault(); done(l) }}>
              <label><span>판 개수 (/ {l.rows.length})</span><NumBox id="sell-n" label="판 개수" size="sm" unit="개" value={n} set={v => (n = v)} /></label>
              <label><span>1개 판 가격</span><NumBox id="sell-p" label="1개 판 가격(억)" size="sm" decimal unit="억" value={price} set={v => (price = v)} /></label>
              <span class="got">{Math.min(l.rows.length, Math.floor(n))}개 × {eok(price)} − 수수료 {Math.round(fee * 1000) / 10}% = <b>+{eok(Math.min(l.rows.length, Math.floor(n)) * price * (1 - fee))}</b></span>
              <span class="acts"><button class="btn primary sm" type="submit">완료</button><button class="btn sm" type="button" onclick={() => (open = null)}>취소</button></span>
            </form>
          {/if}
        </div>
      {:else}
        <div class="empty">보관 중인 아이템이 없어요. 아직 안 판 게 있으면 효율표 결산에서 그 줄의 '판매 완료'를 눌러 꺼 주세요.</div>
      {/each}
    </div>
  </section>

  <section class="card" use:spotlight>
    <h3 class="card-title">판매 완료<span class="sub">판 값은 그 주 결산에도 들어가요</span></h3>
    <div class="list">
      <div class="row hd"><span>아이템</span><span class="r">개수</span><span class="r pc">판 가격(1개)</span><span class="r">받은 메소</span></div>
      {#each H.sales as s (s.b)}
        <div class="row">
          <span class="nm"><b>{s.name}</b><span class="sub">{md(s.week)} 주에 삼 · {md(new Date(s.at + 9 * 36e5).toISOString())} 판매 · <button class="lk" onclick={() => undoSale(s.rows)}>되돌리기</button></span></span>
          <span class="r mono">{s.rows.length}</span><span class="r mono pc">{eok(s.price)}</span>
          <span class="r mono added">+{eok(s.rows.length * s.price * (1 - s.fee))}</span>
        </div>
      {:else}
        <div class="empty">아직 여기서 판매 완료한 게 없어요</div>
      {/each}
    </div>
  </section>

  <section class="card sum" use:spotlight>
    <h3 class="card-title">회수율
      <span class="seg" role="group" aria-label="회수율 기준">
        <button aria-pressed={view === 'all'} onclick={() => { view = 'all'; remember() }}>다 팔면</button>
        <button aria-pressed={view === 'sold'} onclick={() => { view = 'sold'; remember() }}>판 것만</button>
      </span>
    </h3>
    <div class="spans">
      <span class="seg" role="group" aria-label="기간">
        <button aria-pressed={span === 'week'} onclick={() => pick('week')}>이번 주</button>
        <button aria-pressed={span === '4w'} onclick={() => pick('4w')}>최근 4주</button>
        <button aria-pressed={span === 'all'} onclick={() => pick('all')}>전체</button>
        <button aria-pressed={span === 'custom'} onclick={() => pick('custom')}>기간 고르기</button>
      </span>
      {#if span === 'custom'}
        <span class="pick">
          <select aria-label="시작 주" value={from} onchange={e => { from = e.currentTarget.value; remember() }}>
            {#each weeks as w (w)}<option value={w}>{wk(w)}</option>{/each}
          </select>
          <span>~</span>
          <select aria-label="끝 주" value={to} onchange={e => { to = e.currentTarget.value; remember() }}>
            {#each weeks as w (w)}<option value={w}>{wk(w)}</option>{/each}
          </select>
        </span>
      {/if}
    </div>
    <div class="big"><span class="rate mono">{H.spent ? (shown / H.spent * 100).toFixed(1) : '0.0'}%</span>
      <span class="of mono"><b>{won(H.spent)}원</b> 중 <b>{won(shown)}원</b> · {shown >= H.spent ? '+' : '−'}{won(Math.abs(H.spent - shown))}원</span></div>
    <span class="hint">{range[0] ? `${md(range[0])} 주 ~ ${md(range[1])} 주` : '9.17 주부터 전체'} 결산 합계 · {view === 'all' ? '보관 중인 아이템도 산 주 시세로 판다고 쳐요' : '판매 완료한 것만 세요'}</span>
    <div class="bar" role="img" aria-label="사용한 현금 대비 회수 비율">
      <i class="c" style:width={pct(sold)}></i><i class="t" class:dim={view === 'sold'} style:width={pct(H.keptWon)}></i>
      {#if H.back > H.spent}<b class="mark" style:left={pct(H.spent)}></b>{/if}
    </div>
    <div class="scale mono"><span>0</span><span>사용한 현금 {won(H.spent)}</span></div>
    <div class="legend two">
      <div style:--dot="var(--color-mint)"><span class="k">판 것</span><span class="v mono">{won(sold)}원</span><span class="s">크레딧·선물식·메소마켓 포함</span></div>
      <div style:--dot="var(--color-peach)"><span class="k">보관 중</span><span class="v mono">{won(H.keptWon)}원</span><span class="s">산 주 시세</span></div>
    </div>
  </section>
</div>

<style>
  .hold { max-width: 820px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .mono { font-family: var(--font-mono, ui-monospace, Consolas, monospace); font-variant-numeric: tabular-nums; }
  .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .top h2 { margin: 0; font-size: 18px; font-weight: 600; }
  .beta { font-size: 10.5px; padding: 1px 7px; border-radius: 99px; border: 1px solid color-mix(in srgb, var(--color-butter) 55%, transparent); color: var(--color-butter); font-weight: 600; letter-spacing: .02em; }
  .from { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12.5px; color: var(--color-tx2); margin-left: auto; }
  .from > span { background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 8px; padding: 2px 9px; }
  .from b { color: var(--color-tx); font-weight: 600; }
  .from .lock { color: var(--color-tx3); }
  .card { display: flex; flex-direction: column; gap: 12px; }
  .lead { margin: -6px 0 0; font-size: 12.5px; color: var(--color-tx3); }
  .lead b { color: var(--color-mint); font-weight: 600; }
  .spans { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .spans .seg { margin-left: 0; }
  .pick { display: inline-flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--color-tx3); }
  .pick select { font: inherit; font-size: 12.5px; color: var(--color-tx); background: var(--color-panel2); border: 1px solid var(--color-line2); border-radius: 8px; padding: 4px 6px; }
  .legend.two { grid-template-columns: repeat(2, 1fr); }
  .card-title .sub { text-align: right; }

  .meso { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: center; gap: 10px; }
  .cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .k { font-size: 12px; color: var(--color-tx3); }
  .cell .v { font-size: 20px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .op { color: var(--color-tx3); font-size: 18px; }
  .add .v, .added { color: var(--color-mint); }
  .sum .v { color: var(--color-lav); }

  .list { display: flex; flex-direction: column; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) 56px 120px 104px; gap: 10px; align-items: center; padding: 10px 2px; border-top: 1px solid var(--color-line); font-size: 13.5px; }
  .row.hd { border-top: 0; padding-block: 0 6px; font-size: 12px; color: var(--color-tx3); }
  .r { text-align: right; }
  .nm { min-width: 0; }
  .nm b { font-weight: 600; }
  .nm .sub { display: block; font-size: 12px; color: var(--color-tx3); }
  .chip { display: inline-block; font-size: 11px; padding: 0 7px; border-radius: 6px; margin-left: 6px; vertical-align: 1px; background: var(--color-panel3); color: var(--color-tx3); white-space: nowrap; }
  .chip.d { background: color-mix(in srgb, var(--color-rose) 20%, transparent); color: var(--color-rose); }
  .chip.warn { background: color-mix(in srgb, var(--color-peach) 18%, transparent); color: var(--color-peach); }
  .btn.sm { padding: 6px 10px; font-size: 12.5px; white-space: nowrap; }
  .lk { appearance: none; background: none; border: 0; padding: 0; text-align: left; font: inherit; font-size: 12px; color: var(--color-tx3); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
  .lk:hover { color: var(--color-tx2); }
  .empty { color: var(--color-tx3); font-size: 13px; padding: 10px 2px; border-top: 1px solid var(--color-line); }

  .sell { grid-column: 1 / -1; background: var(--color-bg2); border: 1px solid var(--color-lav); border-radius: 12px; padding: 12px; display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: end; }
  .sell label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--color-tx3); width: 120px; }
  .got { font-size: 13px; color: var(--color-tx2); flex: 1; min-width: 180px; }
  .got b { color: var(--color-mint); }
  .acts { display: flex; gap: 6px; }

  details summary { cursor: pointer; color: var(--color-tx3); font-size: 13px; padding: 10px 2px; border-top: 1px solid var(--color-line); list-style: none; }
  details summary::-webkit-details-marker { display: none; }
  details summary::before { content: "▸ "; }
  details[open] summary::before { content: "▾ "; }

  .seg { margin-left: auto; display: inline-flex; background: var(--color-bg2); border: 1px solid var(--color-line2); border-radius: 10px; padding: 2px; }
  .seg button { appearance: none; border: 0; background: none; color: var(--color-tx3); font: inherit; font-size: 12.5px; padding: 4px 12px; border-radius: 8px; cursor: pointer; }
  .seg button[aria-pressed="true"] { background: var(--color-lav); color: #1d1b29; font-weight: 600; }
  .big { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .rate { font-size: 38px; font-weight: 600; line-height: 1; }
  .of { font-size: 14px; color: var(--color-tx2); }
  .of b { color: var(--color-tx); font-weight: 600; }
  .hint { font-size: 12px; color: var(--color-tx3); margin-top: -4px; }
  .bar { position: relative; height: 16px; border-radius: 8px; background: var(--color-panel3); display: flex; overflow: hidden; }
  .bar i { display: block; height: 100%; transition: opacity .25s; }
  .bar .dim { opacity: .25; }
  .bar .c { background: var(--color-mint); }
  .bar .m { background: var(--color-lav); }
  .bar .t { background: repeating-linear-gradient(135deg, var(--color-peach) 0 6px, color-mix(in srgb, var(--color-peach) 55%, var(--color-panel3)) 6px 12px); }
  .bar .mark { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--color-tx); }
  .scale { display: flex; justify-content: space-between; font-size: 11px; color: var(--color-tx3); margin-top: -6px; }
  .legend { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .legend div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .legend .k { display: flex; align-items: center; gap: 6px; }
  .legend .k::before { content: ""; width: 10px; height: 10px; border-radius: 3px; background: var(--dot); }
  .legend .v { font-size: 15px; font-weight: 600; white-space: nowrap; }
  .legend .s { font-size: 11px; color: var(--color-tx3); }

  @media (max-width: 560px) {
    .hold { padding: 10px; }
    .from { margin-left: 0; }
    .meso { grid-template-columns: 1fr 1fr; }
    .op { display: none; }
    .meso .sum { grid-column: 1 / -1; }
    .row { grid-template-columns: minmax(0, 1fr) 40px 92px; }
    .row .pc { display: none; }
    .rate { font-size: 32px; }
    .legend .v { font-size: 13px; }
  }
</style>
