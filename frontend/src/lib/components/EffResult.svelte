<script lang="ts">
  /**
   * 결론. 가장 크게 '실제로 나가는 돈', 그 아래 따라 할 순서.
   * 계획을 따르면 주별 표가 붙고, 줄을 누르면 순서가 그 주로 바뀐다.
   */
  import NumBox from './NumBox.svelte'
  import { app } from '../store.svelte'
  import { planner } from '../plan.svelte'
  import { SHOP, eff, saveEff } from '../eff.svelte'
  import { countLabel, itemLabel, type Part, type WeekResult } from '../core/efficiency'
  import type { EffOut } from '../eff.svelte'
  import { won } from '../format'

  let { out, sel = $bindable(0) }: { out: EffOut | null; sel?: number } = $props()

  const d = $derived(app.data!)
  const tierName = (k: string | null) => d.tiers.find(t => t.key === k)?.name ?? '등급 없음'
  const weeks = $derived(out?.weeks ?? null)
  const cur = $derived(weeks ? weeks[Math.min(sel, weeks.length - 1)] : null)
  const md = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`

  const missing = $derived.by(() => {
    const m: string[] = []
    if (!out) m.push(planner.result && !planner.result.error ? '1번에서 결제할 금액' : '1번에서 결제할 금액(또는 목표 계획)')
    if (!eff.um) m.push('3번의 엄 시세')
    if (!eff.prices.karma && !eff.mk) m.push('4번의 플가 가격이나 3번의 메소마켓')
    return m
  })

  const question = $derived.by(() => {
    if (!out) return ''
    if (out.mode === 'plan' && planner.input) return `${tierName(planner.input.target)} 달성까지 실제로 나가는 돈`
    return `${won(out.target)}원 결제하면 실제로 나가는 돈`
  })
  const rate = $derived(out && out.cost ? out.back / out.cost * 100 : 0)

  const cardDetail = (q: Part) => q.card ? [q.big ? `5만원권 ${q.big}장` : '', q.small ? `3천 원 단위 ${won(q.small)}` : ''].filter(Boolean).join(' + ') : ''
  const discount = (w: WeekResult) => w.funding.parts.filter(q => !q.held).reduce((a, q) => a + q.cash - q.won, 0)
  const byMonth = $derived.by(() => {
    const m: Record<string, Record<string, string[]>> = {}
    for (const w of weeks ?? []) for (const q of w.funding.parts) if (q.card) ((m[w.month] ??= {})[q.name] ??= []).push(`${md(w.start)} ${won(q.cash)}`)
    return m
  })
  const firstOfMonth = (i: number) => !weeks || i === 0 || weeks[i - 1].month !== weeks[i].month
  const monthLine = (month: string) => eff.cards.filter(c => c.on).map(c => `${c.name} ${byMonth[month]?.[c.name]?.join(', ') ?? '안 씀'}`).join(' · ')
  const extra = $derived(out ? out.loss - out.bestLoss : 0)
  const setWeekBc = (start: string, v: number) => { if (v) eff.weekBarcode[start] = v; else delete eff.weekBarcode[start]; saveEff() }
</script>

<article class="card answer" id="eff-answer">
  {#if missing.length}
    <div class="empty">
      <b>몇 칸만 더 채우면 결론이 나와요</b>
      <span>남은 것: {missing.join(', ')}</span>
    </div>
  {:else if out && weeks && cur}
    <div class="top">
      <p class="q">{question}</p>
      <div class="ef-seg" role="group" aria-label="고르는 기준">
        <button aria-pressed={eff.want === 'best'} onclick={() => { eff.want = 'best'; saveEff() }}>가장 많이 남게</button>
        <button aria-pressed={eff.want === 'count'} onclick={() => { eff.want = 'count'; saveEff() }}>판매 횟수 정하기</button>
      </div>
    </div>

    <div class="big mono">{won(out.loss)}<small>원</small></div>
    <p class="flow">
      현금 <b class="mono">{won(out.cost)}원</b> 넣고 <b class="mono up">{won(out.back)}원</b> 돌려받음
      <span class="dot">·</span> 회수율 <b class="mono">{rate.toFixed(1)}%</b>
      <span class="dot">·</span> 경매장 판매 <b class="mono">{out.sales}회</b>
    </p>

    {#if eff.want === 'count'}
      <div class="sales">
        <div class="srow">
          <label for="eff-sales">{out.mode === 'plan' ? '주마다 경매장에 최대' : '경매장에 최대'}</label>
          <b class="mono n">{Math.min(eff.salesN, out.maxSales)}회</b>
          <input id="eff-sales" type="range" min="1" max={out.maxSales} value={Math.min(eff.salesN, out.maxSales)}
            oninput={e => { eff.salesN = Number(e.currentTarget.value); saveEff() }} />
        </div>
        <div class="caution">
          <i aria-hidden="true">!</i>
          <span><b>판매 횟수는 경매장에 올리는 횟수만 셉니다.</b> 얼마나 빨리 팔리는지(회전율)는 계산에 없어요. 비싼 아이템은 사는 사람이 적어 오래 안 팔리거나 값을 내려야 할 수 있으니, 실제로 팔리는 속도를 보고 고르세요.</span>
        </div>
      </div>
    {/if}

    <div class="vs">
      {#if eff.want === 'count'}
        <div class="me">{out.sales}회로<b class="mono">{won(out.loss)}원</b><span>{#if extra > 0.5}가장 많이 남는 방법보다 <em class="mono">+{won(extra)}원</em>{:else}가장 많이 남는 방법과 같아요{/if}</span></div>
        <div>가장 많이 남게 ({out.bestSales}회)<b class="mono">{won(out.bestLoss)}원</b></div>
      {:else}
        <div class="me">이 방법 ({out.sales}회)<b class="mono">{won(out.loss)}원</b></div>
      {/if}
      {#if out.pgOnly}<div>플가만 ({out.pgOnly.sales}회)<b class="mono">{won(out.pgOnly.loss)}원</b></div>{/if}
      {#if out.mkOnly}<div>전부 메소마켓 ({out.mkOnly.sales}회)<b class="mono">{won(out.mkOnly.loss)}원</b></div>{/if}
    </div>

    {#if out.mode === 'plan'}
      <section class="weeks">
        <h4>주별로 보면 <span>줄을 누르면 아래 순서가 그 주로 바뀌어요</span></h4>
        <p class="note">결제액은 <b>목표 계획의 주별 금액 그대로</b>예요. 상품권은 <b>할인이 큰 것부터</b> 그 달 한도가 남은 주에 쓰고, 5만원권으로 먼저, 5만 원이 안 되는 부분은 3천 원 단위로 충전해요. 권으로 딱 맞지 않는 끝자리는 {SHOP.barcode.on ? '바코드나 ' : ''}일반 충전으로 채워요. 달 줄에 그 달 한도를 어느 주에 썼는지 나와요.</p>
        <div class="tbl">
          <table>
            <thead><tr><th>주</th><th>결제</th><th>충전</th>{#if SHOP.barcode.on}<th>바코드로 받을 캐시</th>{/if}<th>할인 받음</th><th>낸 현금</th><th>실제로 나감</th></tr></thead>
            <tbody>
              {#each weeks as w, i (w.start)}
                {#if firstOfMonth(i)}
                  <tr class="month"><td colspan={SHOP.barcode.on ? 7 : 6}><b>{Number(w.month.slice(5))}월 상품권 한도</b> ({i === 0 ? '2번에 넣은 남은 한도' : '각 200,000원 새로'}) — {monthLine(w.month)}</td></tr>
                {/if}
                <tr class="wk" class:sel={w === cur} onclick={() => (sel = i)}>
                  <td class="d">{md(w.start)} 주{#if i === 0}<small>이번 주</small>{/if}</td>
                  <td class="mono">{won(w.route.pay)}</td>
                  <td><div class="parts">{#each w.funding.parts as q (q.name)}<span class="ef-chip">{q.name} <b>{won(q.cash)}</b>{#if cardDetail(q)}<em>{cardDetail(q)}</em>{/if}</span>{/each}</div></td>
                  {#if SHOP.barcode.on}
                    <td onclick={e => e.stopPropagation()}>
                      <NumBox id="eff-wbc-{w.start}" label="{md(w.start)} 주 바코드 캐시" size="sm" placeholder={eff.barcodeWant ? won(eff.barcodeWant) : '나머지 전부'}
                        value={eff.weekBarcode[w.start] ?? 0} set={v => setWeekBc(w.start, v)} />
                    </td>
                  {/if}
                  <td class="mono good">{discount(w) > 0 ? won(discount(w)) : '—'}</td>
                  <td class="mono">{won(w.route.cost)}</td>
                  <td class="mono bad">{won(w.route.loss)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <section class="route">
      <h4>{out.mode === 'plan' ? `${md(cur.start)} 주에 이렇게 하면 돼요` : '이렇게 하면 돼요'}</h4>
      <ol>
        <li>
          <div class="t">캐시 {won(cur.route.pay)} 충전 → 현금 {won(cur.route.cost)}원</div>
          <div class="chips">{#each cur.funding.parts as q (q.name)}<span class="ef-chip">{q.name} <b>{won(q.cash)}</b>{#if cardDetail(q)}<em>{cardDetail(q)}</em>{/if}{#if !q.held} → {won(q.won)}원{/if}</span>{/each}</div>
        </li>
        {#if cur.route.lines.length}
          <li>
            <div class="t">캐시샵에서 사기</div>
            <div class="chips">{#each cur.route.lines as l (l.item.id)}<span class="ef-chip">{itemLabel(l.item)} <b>{countLabel(l.item, l.n)}</b></span>{/each}</div>
            <div class="dd">사는 순간 {tierName(cur.tier)} · 수수료 {Math.round(cur.route.fee * 100)}%</div>
          </li>
          <li>
            <div class="t">경매장에 {cur.route.lines.reduce((a, l) => a + l.n, 0)}번 팔기 → 수수료 빼고 {cur.route.meso.toFixed(1)}억 메소</div>
            <div class="chips">{#each cur.route.lines as l (l.item.id)}<span class="ef-chip">{itemLabel(l.item)} <b>{l.item.price}억</b>에</span>{/each}</div>
          </li>
        {/if}
        {#if cur.route.market}
          <li>
            <div class="t">캐시 {won(cur.route.market)} → 메이플포인트로 사서 메소마켓에 팔기 (1회)</div>
            <div class="dd">{(cur.route.market / eff.mk).toFixed(2)}억 메소{cur.route.lines.length ? ' · 아이템으로 채우지 않은 금액' : ''}</div>
          </li>
        {/if}
        <li>
          <div class="t">메소 {(cur.route.meso + (cur.route.market && eff.mk ? cur.route.market / eff.mk : 0)).toFixed(1)}억 → 엄 시세로 {won(cur.route.back)}원</div>
        </li>
      </ol>
    </section>

    <p class="extra">
      {#if out.pay > out.target}<span>목표보다 {won(out.pay - out.target)}원 더 결제하는 게 더 남아서 그렇게 짰어요</span>{/if}
      <span>엄 시세가 100원 내리면 {won(out.back / eff.um * 100)}원 더 나가요</span>
    </p>
  {/if}
</article>

<style>
  .answer {
    display: grid; gap: 18px; padding: 22px;
    background:
      radial-gradient(520px circle at var(--mx) var(--my), rgba(184, 168, 255, .09), transparent 60%),
      linear-gradient(160deg, color-mix(in oklab, var(--color-lav) 12%, var(--color-panel)), var(--color-panel) 55%);
    border-color: color-mix(in oklab, var(--color-lav) 35%, var(--color-line));
  }
  .empty { display: grid; gap: 4px; padding: 10px 2px; }
  .empty b { font-size: 16px; }
  .empty span { font-size: 13px; color: var(--color-tx3); }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .q { margin: 0; font-size: 14px; color: var(--color-tx2); }
  .big { font-size: clamp(40px, 5vw, 58px); line-height: 1; font-weight: 700; letter-spacing: -.03em; }
  .big small { font-size: 18px; font-weight: 400; color: var(--color-tx3); margin-left: 6px; letter-spacing: 0; }
  .flow { margin: -6px 0 0; font-size: 14px; color: var(--color-tx2); }
  .flow b { color: var(--color-tx); font-weight: 500; }
  .flow .up { color: var(--color-mint); }
  .dot { margin: 0 6px; color: var(--color-tx3); }

  .sales { display: grid; gap: 10px; padding: 14px; border-radius: var(--radius-md); background: var(--color-bg2); border: 1px solid var(--color-line); }
  .srow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 12.5px; color: var(--color-tx3); }
  .srow .n { font-size: 22px; color: var(--color-tx); min-width: 64px; }
  .srow input { flex: 1 1 220px; accent-color: var(--color-lav); }
  .caution {
    display: grid; grid-template-columns: 22px 1fr; gap: 10px; align-items: start; padding: 10px 12px; border-radius: 12px; font-size: 12.5px; color: var(--color-tx);
    background: color-mix(in oklab, var(--color-peach) 13%, transparent); border: 1px solid color-mix(in oklab, var(--color-peach) 45%, transparent);
  }
  .caution i { font-style: normal; font-weight: 700; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--color-peach); color: var(--color-on-accent); font-size: 13px; }
  .caution b { color: var(--color-peach); }

  .vs { display: flex; flex-wrap: wrap; gap: 8px; }
  .vs div { flex: 1 1 180px; display: grid; gap: 2px; padding: 10px 12px; border-radius: 12px; background: var(--color-bg2); border: 1px solid var(--color-line); font-size: 12px; color: var(--color-tx3); }
  .vs div b { font-size: 18px; color: var(--color-tx); font-weight: 600; }
  .vs div span { font-size: 11.5px; }
  .vs div em { font-style: normal; color: var(--color-peach); }
  .vs .me { border-color: color-mix(in oklab, var(--color-mint) 55%, transparent); }
  .vs .me b { color: var(--color-mint); }

  h4 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  h4 span { font-size: 11.5px; font-weight: 400; color: var(--color-tx3); margin-left: 6px; }
  .note { margin: 0 0 10px; font-size: 12.5px; color: var(--color-tx2); background: var(--color-bg2); border-radius: 10px; padding: 10px 12px; line-height: 1.55; }
  .note b { color: var(--color-tx); font-weight: 600; }
  .tbl { overflow-x: auto; border-radius: var(--radius-md); border: 1px solid var(--color-line); }
  table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 13px; }
  th { font-weight: 500; font-size: 11.5px; color: var(--color-tx3); text-align: right; padding: 8px 10px; background: var(--color-bg2); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  td { padding: 7px 10px; border-top: 1px solid var(--color-line); text-align: right; white-space: nowrap; vertical-align: middle; }
  .month td { background: var(--color-bg2); color: var(--color-tx3); font-size: 11.5px; padding: 5px 10px; white-space: normal; text-align: left; }
  .month b { color: var(--color-tx2); font-weight: 600; }
  .wk { cursor: pointer; transition: background .15s; }
  .wk:hover td { background: color-mix(in oklab, var(--color-lav) 5%, transparent); }
  .wk.sel td { background: color-mix(in oklab, var(--color-lav) 12%, transparent); }
  .wk .d small { display: block; font-size: 10.5px; color: var(--color-lav); }
  .parts { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .ef-chip em { font-style: normal; font-size: 11px; color: var(--color-tx3); }
  .wk :global(.nb) { width: 120px; margin-left: auto; }
  .good { color: var(--color-good); }
  .bad { color: var(--color-bad); }

  .route ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; counter-reset: s; }
  .route li { display: grid; grid-template-columns: 30px 1fr; column-gap: 10px; row-gap: 4px; }
  .route li::before { counter-increment: s; content: counter(s); grid-row: span 3; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--color-panel3); font-family: var(--font-mono); font-size: 12px; color: var(--color-lav); }
  .route .t { font-size: 13.5px; font-weight: 600; }
  .route .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .route .dd { font-size: 12px; color: var(--color-tx3); }
  .extra { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 12px; color: var(--color-tx3); }
</style>
