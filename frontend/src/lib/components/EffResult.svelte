<script lang="ts">
  /**
   * 결론. 루트 셋 중 하나를 골라 가장 크게 '실제로 나가는 돈', 그 아래 따라 할 순서.
   *   최저가 루트: 가장 적게 잃는 조합 (판매 횟수는 따지지 않는다)
   *   최적화 루트: 판매를 한 번 줄일 때 더 내는 돈이 '판매 1회 수고비' 이하인 한도에서 가장 적게 파는 조합
   *   횟수 정하기: 주마다 판매 n회까지
   * 계획을 따르면 주별 표가 붙고, 줄을 누르면 순서가 그 주로 바뀐다.
   */
  import NumBox from './NumBox.svelte'
  import EffCombo from './EffCombo.svelte'
  import { app } from '../store.svelte'
  import { planner } from '../plan.svelte'
  import { SHOP, eff, saveEff, type EffOut, type Pick, type RouteSet, type Summary, type Want, type WeekPick } from '../eff.svelte'
  import { PG_ID, countLabel, itemLabel, unitName, type Part } from '../core/efficiency'
  import { eul, eun } from '../format'
  import { won } from '../format'

  let { out, sel = $bindable(0) }: { out: EffOut | null; sel?: number } = $props()

  const d = $derived(app.data!)
  const tierName = (k: string | null) => d.tiers.find(t => t.key === k)?.name ?? '등급 없음'
  const md = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`
  const pick = $derived(out?.sel ?? null)
  const cur = $derived(pick ? pick.weeks[Math.min(sel, pick.weeks.length - 1)] : null)
  const per = $derived(out?.mode === 'plan' ? '주마다 ' : '')
  /**
   * 메소마켓이 고른 아이템 모두보다 덜 남으면, 그 금액은 메소마켓이 나아서가 아니라 결제액을 맞추려고 남은 끝자리다.
   * '메소마켓을 사라는 거냐'는 오해가 있었다(2026-10-01 댓글)
   */
  const fillerOnly = (r: { fee: number; lines: { item: { price: number; cash: number } }[] }) =>
    !!eff.mk && r.lines.every(l => l.item.price * (1 - r.fee) / l.item.cash > 1 / eff.mk)

  const missing = $derived.by(() => {
    const m: string[] = []
    if (!(eff.usePlan && planner.result && !planner.result.error) && !eff.amount) m.push('1번에서 결제할 금액(또는 목표 계획)')
    if (!eff.um) m.push('3번의 엄 시세')
    if (!eff.prices[PG_ID] && !eff.mk) m.push('4번의 플가 가격이나 3번의 메소마켓')
    return m
  })

  const question = $derived.by(() => {
    if (!out) return ''
    const minus = out.use ? ` (구매용 ${won(out.use)}원 제외)` : ''
    if (out.mode === 'plan' && planner.input) {
      const k = planner.result?.keep
      const m = planner.result?.mode ?? 'reach'
      const head = m === 'keep' ? `${tierName(planner.input.target)} ${k?.weeks ?? ''}주 유지`
        : m === 'hold' ? `${tierName(planner.input.target)}로 내려가며 ${k?.weeks ?? ''}주 유지`
        : `${tierName(planner.input.target)} 달성${k ? ` + ${k.weeks}주 유지` : ''}`
      return `${head}까지 실제로 나가는 돈${minus}`
    }
    return `${won(out.target)}원 결제하면 실제로 나가는 돈${minus}`
  })
  const rate = (p: Pick) => p.cost ? p.back / p.cost * 100 : 0

  // 유지를 켰으면 달성하는 주와 유지하는 주를 나눠 본다. 유지 주는 주차별 계획에서 목표 주 뒤의 주
  const split = $derived.by(() => {
    if (!pick || out?.mode !== 'plan' || !planner.result?.keep) return null
    const keepStarts = new Set(planner.result.timeline.filter(w => w.keep).map(w => w.start))
    const part = (ws: WeekPick[]) => {
      const cost = ws.reduce((a, w) => a + w.route.cost, 0)
      const back = ws.reduce((a, w) => a + w.route.back + (w.credit?.back ?? 0), 0)
      const sales = ws.reduce((a, w) => a + w.route.sales, 0)
      return { n: ws.length, cost, back, sales, loss: ws.reduce((a, w) => a + w.loss, 0), rate: cost ? back / cost * 100 : 0 }
    }
    const keep = pick.weeks.filter(w => keepStarts.has(w.w.start))
    if (!keep.length) return null
    // 같은 구간을 최저가로 했을 때 잃는 돈. 그 차이를 주당으로도 보여 준다
    const bestOf = (k: boolean) => out!.best.weeks.filter(w => keepStarts.has(w.w.start) === k).reduce((a, w) => a + w.loss, 0)
    const withGap = (p: ReturnType<typeof part>, k: boolean) => ({ ...p, gap: Math.max(0, p.loss - bestOf(k)) })
    return { reach: withGap(part(pick.weeks.filter(w => !keepStarts.has(w.w.start))), false), keep: withGap(part(keep), true) }
  })
  const choose = (w: Want) => { eff.want = w; saveEff() }
  // 달성·유지를 따로 정할 수 있는 때: 목표 계획에서 유지를 켰을 때
  const canSplit = $derived(out?.mode === 'plan' && !!out.keepStarts?.size)
  const apart = $derived(canSplit && eff.split)
  /** 구간별 설정 한 벌. 달성은 eff의 기본 설정을, 유지는 eff.keep을 고친다 */
  const phaseSet = (k: 'reach' | 'keep'): RouteSet => k === 'keep' ? eff.keep
    : { get want() { return eff.want }, set want(v) { eff.want = v }, get salesN() { return eff.salesN }, set salesN(v) { eff.salesN = v },
        get sellCost() { return eff.sellCost }, set sellCost(v) { eff.sellCost = v }, get minRate() { return eff.minRate }, set minRate(v) { eff.minRate = v ?? 0 }, get combo() { return eff.combo }, set combo(v) { eff.combo = v } }
  const WANTS: [Want, string][] = [['best', '최저가'], ['knee', '최적화'], ['count', '횟수 정하기'], ['custom', '직접 짜기']]
  const weeksOf = (k: 'reach' | 'keep') => (out?.weeks ?? []).filter(w => (out?.keepStarts?.has(w.start) ?? false) === (k === 'keep')).length

  // ---- 판매 횟수별 곡선 ----
  // 그래프는 칸 너비에 맞춰 그린다. 늘려 그리면 글자까지 커진다
  let cw = $state(600)
  const W = $derived(Math.max(280, cw - 28))
  // PX: 왼쪽에 세로 축 이름과 눈금, 아래에 가로 눈금과 축 이름이 들어갈 자리
  const H = 150, PX = 66, PY = 16
  const chart = $derived.by(() => {
    if (!out || out.hi <= out.lo) return null
    const xs: number[] = [], ys: number[] = []
    for (let n = out.lo; n <= out.hi; n++) if (Number.isFinite(out.curve[n])) { xs.push(n); ys.push(out.curve[n]) }
    const y0 = Math.min(...ys), y1 = Math.max(...ys), span = y1 - y0 || 1
    const X = (n: number) => PX + (n - out.lo) / (out.hi - out.lo) * (W - PX - 12)
    const Y = (v: number) => PY + (1 - (v - y0) / span) * (H - PY * 2)
    const line = xs.map((n, i) => `${i ? 'L' : 'M'}${X(n).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join('')
    const area = `${line}L${X(xs.at(-1)!).toFixed(1)},${H - PY}L${X(xs[0]).toFixed(1)},${H - PY}Z`
    const dot = (n: number, loss = out.curve[n]) => ({ x: X(Math.max(out.lo, Math.min(n, out.hi))), y: Y(Math.min(y1, Math.max(y0, loss))) })
    // 여러 주면 최저가·최적화는 주마다 따로 고른 값이라 이 곡선(모든 주에 같은 상한) 위에 없다.
    // 최저가는 곡선 끝(상한 없음)과 같고, 최적화는 곡선에 찍지 않는다
    const one = out.weeks.length === 1
    return { line, area, X, Y, y0, y1, one, best: one ? dot(out.best.n ?? out.hi, out.best.loss) : dot(out.hi), knee: dot(out.knee.n ?? out.hi, out.knee.loss), count: dot(out.count.n ?? out.hi) }
  })

  // 싼 낱개(1만 원 미만)를 여러 번 파는 루트면 주 초반·월초 시세 경고. 보통 플가·원더베리가 이렇게 된다
  const cheapSingles = $derived.by(() => {
    if (!pick) return [] as string[]
    const m = new Map<string, number>()
    for (const w of pick.weeks) for (const l of w.route.lines) if (l.item.set === 1 && l.item.cash < 10_000) m.set(itemLabel(l.item), (m.get(itemLabel(l.item)) ?? 0) + l.n)
    return [...m].filter(([, n]) => n >= 2).map(([k, n]) => `${k} ${n}개`)
  })
  // 기간 안에 써야 하는 아이템. 짧은 것부터
  const timedIn = $derived.by(() => {
    if (!pick) return [] as string[]
    const m = new Map<string, number>()
    for (const w of pick.weeks) for (const l of w.route.lines) if (l.item.days) m.set(itemLabel(l.item), l.item.days)
    return [...m].sort((a, b) => a[1] - b[1]).map(([k, d]) => `${k}(${d}일)`)
  })

  const cardDetail = (q: Part) => q.card && q.unit ? `${unitName(q.unit)} ${q.cash / q.unit}장` : ''
  const discount = (w: WeekPick) => w.funding.parts.filter(q => !q.held).reduce((a, q) => a + q.cash - q.won, 0)
  const byMonth = $derived.by(() => {
    const m: Record<string, Record<string, string[]>> = {}
    for (const w of pick?.weeks ?? []) for (const q of w.funding.parts) if (q.card) ((m[w.w.month] ??= {})[q.name] ??= []).push(`${md(w.w.start)} ${won(q.cash)}`)
    return m
  })
  const firstOfMonth = (i: number) => !pick || i === 0 || pick.weeks[i - 1].w.month !== pick.weeks[i].w.month
  // 달 한도가 있는 결제수단만(상품권 + 직접 추가한 것 중 한도가 있는 것)
  const monthLine = (month: string) => [...eff.cards.filter(c => c.on), ...eff.methods.filter(m => m.on && m.monthly)]
    .map(c => `${c.name} ${byMonth[month]?.[c.name]?.join(', ') ?? '안 씀'}`).join(' · ')
  const setWeekBc = (start: string, v: number) => { if (v) eff.weekBarcode[start] = v; else delete eff.weekBarcode[start]; saveEff() }
</script>

{#snippet vsSplit(s: Summary)}
  {#if s.split}<small class="vsp">달성 <b class="mono">{won(s.split.reach.loss)}원</b> ({s.split.reach.sales}회) · 유지 <b class="mono">{won(s.split.keep.loss)}원</b> ({s.split.keep.sales}회)</small>{/if}
{/snippet}

<article class="card answer" id="eff-answer">
  {#if missing.length}
    <div class="empty">
      <b>몇 칸만 더 채우면 결론이 나와요</b>
      <span>남은 것: {missing.join(', ')}</span>
    </div>
  {:else if out && pick && cur}
    <p class="q">{question}</p>

    {#if canSplit}
      <label class="together" for="eff-split">
        <input id="eff-split" type="checkbox" checked={!eff.split} onchange={e => { eff.split = !e.currentTarget.checked; saveEff() }} />
        <span class="sw" aria-hidden="true"></span>
        <span class="tx"><b>달성과 유지를 같이 설정</b><small>{eff.split ? '달성과 유지를 따로 정하고 있어요' : '끄면 달성과 유지의 루트를 따로 정해요'}</small></span>
      </label>
    {/if}

    {#if apart}
      <div class="phases">
        {#each [['reach', '달성'], ['keep', '유지']] as const as [k, name] (k)}
          {@const s = phaseSet(k)}
          <div class="phase">
            <div class="ph-h"><b>{name}</b><small>{weeksOf(k)}주</small></div>
            <div class="seg" role="group" aria-label="{name} 루트">
              {#each WANTS as [w, t] (w)}
                <button aria-pressed={s.want === w} onclick={() => { s.want = w; saveEff() }}>{t}</button>
              {/each}
            </div>
            {#if s.want === 'count'}
              <div class="srow">
                <label for="eff-sales-{k}">주마다 경매장에 최대</label>
                <b class="mono n">{s.salesN}회</b>
                <input id="eff-sales-{k}" type="range" min={out.lo} max={out.hi} value={Math.min(s.salesN, out.hi)}
                  oninput={e => { s.salesN = Number(e.currentTarget.value); saveEff() }} />
              </div>
            {:else if s.want === 'knee'}
              <div class="kcost">
                <span>판매를 한 번 줄일 때 더 내는 돈이</span>
                <span class="box"><NumBox id="eff-sale-cost-{k}" label="{name} 판매 1회 수고비" size="sm" unit="원" placeholder="2,000" value={s.sellCost} set={v => { s.sellCost = v; saveEff() }} /></span>
                <span>이하일 때만 줄이고, 회수율은</span>
                <span class="box"><NumBox id="eff-min-rate-{k}" label="{name} 회수율 하한" size="sm" decimal unit={s.minRate ? '%' : ''} placeholder="하한 없음" value={s.minRate ?? 0} set={v => { s.minRate = v; saveEff() }} /></span>
                <span>아래로 안 내려가게</span>
              </div>
            {:else if s.want === 'custom'}
              <EffCombo combo={s.combo} title="{name} · 매주 이 조합" id="eff-combo-{k}" />
            {/if}
          </div>
        {/each}
      </div>
    {:else}
    <div class="routes" role="group" aria-label="루트 고르기">
      <button class:on={eff.want === 'best'} onclick={() => choose('best')}>
        <span class="rn">최저가 루트</span>
        <b class="mono">{won(out.best.loss)}원</b>
        <span class="rs">판매 {out.best.sales}회 · 가장 적게 잃어요</span>
      </button>
      <button class:on={eff.want === 'knee'} onclick={() => choose('knee')}>
        <span class="rn">최적화 루트 <em>추천</em></span>
        <b class="mono">{won(out.knee.loss)}원</b>
        <span class="rs">판매 {out.knee.sales}회{out.knee.sales < out.best.sales ? ` · 최저가보다 ${out.best.sales - out.knee.sales}회 적게, +${won(out.knee.loss - out.best.loss)}원` : ' · 최저가가 가장 효율적이에요'}</span>
      </button>
      <button class:on={eff.want === 'count'} onclick={() => choose('count')}>
        <span class="rn">횟수 정하기</span>
        <b class="mono">{won(out.count.loss)}원</b>
        <span class="rs">{per}최대 {out.count.n}회 · 판매 {out.count.sales}회</span>
      </button>
      <button class:on={eff.want === 'custom'} onclick={() => choose('custom')}>
        <span class="rn">직접 짜기</span>
        {#if out.custom}
          <b class="mono">{won(out.custom.loss)}원</b>
          <span class="rs">판매 {out.custom.sales}회 · 최저가보다 {out.custom.loss >= out.best.loss ? '+' : '−'}{won(Math.abs(out.custom.loss - out.best.loss))}원</span>
        {:else}
          <b class="mono dim">—</b>
          <span class="rs">살 아이템과 개수를 직접 적어요</span>
        {/if}
      </button>
    </div>
    {#if eff.want === 'custom'}<EffCombo combo={eff.combo} title="{out.mode === 'plan' ? '매주 이 조합' : '이 조합으로'}" id="eff-combo-all" />{/if}
    {/if}

    <div class="headline">
      <div class="big mono">{won(pick.loss)}<small>원</small></div>
      <p class="flow">
        현금 <b class="mono">{won(pick.cost)}원</b> 넣고 <b class="mono up">{won(pick.back)}원</b> 돌려받음{#if pick.creditBack}<span class="cr">(크레딧 큐브 {won(pick.creditBack)}원 포함)</span>{/if}
        <span class="dot">·</span> 회수율 <b class="mono">{rate(pick).toFixed(1)}%</b>
        <span class="dot">·</span> 경매장 판매 <b class="mono">{pick.sales}회</b>
      </p>
      {#if out.use}
        <p class="usenote">결제 {won(out.target)}원 중 <b>구매용 {won(out.use)}원</b>({eff.buys.map(b => b.name).join(', ')})은 쓰는 돈이라 뺐어요. 위 숫자는 엠작 <b>{won(out.target - out.use)}원</b> 기준이에요.{#if out.useOver} 구매용이 결제액보다 <b class="bad">{won(out.useOver)}원</b> 많아 그만큼은 넣지 못했어요.{/if}</p>
      {/if}
      {#if split}
        <div class="split">
          {#each [['달성', split.reach], ['유지', split.keep]] as const as [name, s] (name)}
            {@const low = s.gap < 1}
            <div class:low>
              <span>{name} <small>{s.n}주</small>{#if low}<i class="badge">최저가</i>{/if}</span>
              <b class="mono">{won(s.loss)}원</b>
              {#if !low}<strong class="gap">최저가보다 <span class="mono">+{won(s.gap)}원</span>{#if s.n > 1}{' · 주당 '}<span class="mono">+{won(s.gap / s.n)}원</span>{/if}</strong>{/if}
              <em>현금 {won(s.cost)}원 · 회수율 {s.rate.toFixed(1)}% · 판매 {s.sales}회{s.n > 1 ? ` (주당 ${Math.round(s.sales / s.n)}회)` : ''}</em>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if chart}
      <figure class="chart" bind:clientWidth={cw}>
        <figcaption>판매 횟수를 줄이면 얼마나 비싸지나</figcaption>
        <svg viewBox="0 0 {W} {H + 38}" role="img" aria-label="판매 횟수별 실제로 나가는 돈">
          <text x="12" y={H / 2} class="at" text-anchor="middle" transform="rotate(-90 12 {H / 2})">실제로 나가는 돈</text>
          <text x={PX + (W - 12 - PX) / 2} y={H + 32} class="at" text-anchor="middle">{out.mode === 'plan' ? '주마다 최대 판매 횟수' : '경매장 판매 횟수'}</text>
          <line x1={PX} x2={W - 12} y1={H - PY} y2={H - PY} class="axis" />
          <text x={PX - 6} y={PY + 4} class="yl" text-anchor="end">{won(Math.round(chart.y1 / 1000))}천</text>
          <text x={PX - 6} y={H - PY} class="yl" text-anchor="end">{won(Math.round(chart.y0 / 1000))}천</text>
          <path d={chart.area} class="area" />
          <path d={chart.line} class="line" />
          <circle cx={chart.best.x} cy={chart.best.y} r="5" class="m best" />
          {#if chart.one}<circle cx={chart.knee.x} cy={chart.knee.y} r="5" class="m knee" />{/if}
          {#if eff.want === 'count'}<circle cx={chart.count.x} cy={chart.count.y} r="5" class="m count" />{/if}
          <text x={PX} y={H + 12} class="xl">{out.lo}회</text>
          <text x={W - 12} y={H + 12} class="xl" text-anchor="end">{out.hi}회</text>
          {#if chart.one}<text x={chart.knee.x} y={chart.knee.y - 10} class="kl" text-anchor="middle">최적화 {out.knee.n}회</text>{/if}
        </svg>
        <div class="ef-hint cost">
          <span><b>최적화</b>는 판매를 한 번 줄일 때 더 내는 돈이</span>
          <span class="box"><NumBox id="eff-sale-cost" label="판매 1회 수고비" size="sm" unit="원" placeholder="2,000" value={eff.sellCost} set={v => { eff.sellCost = v; saveEff() }} /></span>
          <span>이하일 때만 줄이고, 회수율은</span>
          <span class="box"><NumBox id="eff-min-rate" label="회수율 하한" size="sm" decimal unit={eff.minRate ? '%' : ''} placeholder="하한 없음" value={eff.minRate} set={v => { eff.minRate = v; saveEff() }} /></span>
          <span>아래로 안 내려가게 해요.</span>
          {#if out.knee.sales < out.best.sales}
            <span>지금은 한 번 줄일 때 평균 <b>{won((out.knee.loss - out.best.loss) / (out.best.sales - out.knee.sales))}원</b>이라 {out.best.sales - out.knee.sales}회 줄였어요. 회수율 <b>{(out.knee.cost ? out.knee.back / out.knee.cost * 100 : 0).toFixed(1)}%</b>{eff.minRate ? ` (하한 ${eff.minRate}%)` : ''}.</span>
            {#if !chart.one}<span>최적화는 주마다 판매 횟수를 따로 정해서, 모든 주에 같은 상한을 거는 이 곡선 위에는 없어요.</span>{/if}
          {:else if eff.minRate && (out.best.cost ? out.best.back / out.best.cost * 100 : 0) < eff.minRate}
            <span>최저가 루트도 회수율이 <b>{(out.best.back / out.best.cost * 100).toFixed(1)}%</b>라 하한 {eff.minRate}%에 못 미쳐요. 판매를 줄이면 더 내려가서 최저가 그대로 둬요.</span>
          {:else}
            <span>판매를 줄이면 한 번에 이보다 더 들어서, 최저가 루트가 가장 효율적이에요.</span>
          {/if}
        </div>
      </figure>
    {/if}

    {#if eff.want === 'count' && !apart}
      <div class="sales">
        <div class="srow">
          <label for="eff-sales">{per}경매장에 최대</label>
          <b class="mono n">{out.count.n}회</b>
          <input id="eff-sales" type="range" min={out.lo} max={out.hi} value={out.count.n}
            oninput={e => { eff.salesN = Number(e.currentTarget.value); saveEff() }} />
        </div>
      </div>
    {/if}

    {#if eff.want !== 'best'}
      <div class="caution">
        <i aria-hidden="true">!</i>
        <span><b>판매 횟수는 경매장에 올리는 횟수만 셉니다.</b> 얼마나 빨리 팔리는지(회전율)는 계산에 없어요. 비싼 아이템은 사는 사람이 적어 오래 안 팔리거나 값을 내려야 할 수 있으니, 실제로 팔리는 속도를 보고 고르세요.</span>
      </div>
    {/if}
    {#if cheapSingles.length}
      <div class="caution">
        <i aria-hidden="true">!</i>
        <span><b>{cheapSingles.join(', ')}{eul(cheapSingles.at(-1)!)} 낱개로 파는 루트예요.</b> 같은 걸 파는 사람이 많아서, MVP작이 몰리는 주 초반(목요일 갱신 직후)과 월초에는 시세가 평소보다 많이 떨어질 수 있어요. 넣은 가격보다 싸게 팔리면 실제로 나가는 돈이 늘어나요.</span>
      </div>
    {/if}
    {#if timedIn.length}
      <div class="caution soft">
        <i aria-hidden="true">i</i>
        <span><b>{timedIn.join(', ')}{eun(timedIn.at(-1)!)} 받은 뒤 그 기간 안에 써야 해요.</b> 값이 오를 때까지 오래 들고 기다리기 어려우니, 기간 안에 다 팔 수 있는 만큼만 사세요.</span>
      </div>
    {/if}

    <div class="vs">
      {#if out.pgOnly}<div>플가만 ({out.pgOnly.sales}회)<b class="mono">{won(out.pgOnly.loss)}원</b>{@render vsSplit(out.pgOnly)}</div>{/if}
      {#if out.mkOnly}<div>전부 메소마켓 ({out.mkOnly.sales}회)<b class="mono">{won(out.mkOnly.loss)}원</b>{@render vsSplit(out.mkOnly)}</div>{/if}
    </div>

    {#if out.mode === 'plan'}
      <section class="weeks">
        <h4>주별로 보면 <span>줄을 누르면 아래 순서가 그 주로 바뀌어요</span></h4>
        <p class="note">결제액은 <b>목표 계획의 주별 금액 그대로</b>예요. 결제수단은 할인이 큰 것부터 그 달 남은 한도 안에서 권 단위로 써요. {#if eff.plainOn}한 권보다 작은 끝자리는 {SHOP.barcode.on ? '바코드나 ' : ''}일반 충전으로 딱 맞추고, 남긴 캐시를 뒤 주에서 다 쓸 수 있을 때만 한 권 더 사서 <b>남는 캐시를 다음 주에</b> 써요.{:else}한 권보다 작은 끝자리는 한 권 더 사서 <b>남는 캐시를 다음 주에</b> 써요(일반 충전 꺼 둠).{/if} 달 줄에 그 달 한도를 어느 주에 썼는지 나와요.</p>
        <div class="tbl">
          <table>
            <thead><tr><th>주</th><th>결제</th><th>충전</th>{#if SHOP.barcode.on}<th>바코드로 받을 캐시</th>{/if}<th>할인 받음</th><th>판매</th>{#if out.credit}<th>크레딧</th>{/if}<th>낸 현금</th><th>실제로 나감</th></tr></thead>
            <tbody>
              {#each pick.weeks as w, i (w.w.start)}
                {#if firstOfMonth(i)}
                  <tr class="month"><td colspan={7 + (SHOP.barcode.on ? 1 : 0) + (out.credit ? 1 : 0)}><b>{Number(w.w.month.slice(5))}월 결제수단 한도</b> ({i === 0 ? '2번에 넣은 남은 한도' : '달마다 새로'}) — {monthLine(w.w.month)}</td></tr>
                {/if}
                <tr class="wk" class:sel={w === cur} onclick={() => (sel = i)}>
                  <td class="d">{md(w.w.start)} 주{#if i === 0}<small>이번 주</small>{/if}</td>
                  <td class="mono" data-l="결제">{won(w.route.pay + w.w.use)}{#if w.w.use}<small class="use">구매용 {won(w.w.use)}</small>{/if}</td>
                  <td class="pt"><div class="parts">{#each w.funding.parts as q, qi (qi)}<span class="ef-chip">{q.name} <b>{won(q.cash)}</b>{#if cardDetail(q)}<em>{cardDetail(q)}</em>{/if}{#if q.spare}<em class="sp">{won(q.spare)} 남김</em>{/if}</span>{/each}</div></td>
                  {#if SHOP.barcode.on}
                    <td data-l="바코드로 받을 캐시" onclick={e => e.stopPropagation()}>
                      <NumBox id="eff-wbc-{w.w.start}" label="{md(w.w.start)} 주 바코드 캐시" size="sm" placeholder={eff.barcodeWant ? won(eff.barcodeWant) : '나머지 전부'}
                        value={eff.weekBarcode[w.w.start] ?? 0} set={v => setWeekBc(w.w.start, v)} />
                    </td>
                  {/if}
                  <td class="mono good" data-l="할인 받음">{discount(w) > 0 ? won(discount(w)) : '—'}</td>
                  <td class="mono" data-l="판매">{w.route.sales}회</td>
                  {#if out.credit}
                    <td class="crd" data-l="크레딧">{#if w.credit?.buys.length}{w.credit.buys.map(b => `${b.item.name.replace('프라임 ', '')} ${b.n}`).join(' + ')}{:else if w.credit?.earned}<span class="dim">모으는 중 {won(w.credit.left)}</span>{:else}—{/if}</td>
                  {/if}
                  <td class="mono" data-l="낸 현금">{won(w.route.cost)}</td>
                  <td class="mono bad lo" data-l="실제로 나감">{won(w.loss)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <section class="route">
      <h4>{out.mode === 'plan' ? `${md(cur.w.start)} 주에 이렇게 하면 돼요` : '이렇게 하면 돼요'}</h4>
      <ol>
        <li>
          <div class="t">캐시 {won(cur.route.pay + cur.w.use)} 충전 → 현금 {won(cur.funding.cost)}원</div>
          <div class="chips">{#each cur.funding.parts as q, qi (qi)}<span class="ef-chip">{q.name} <b>{won(q.cash)}</b>{#if cardDetail(q)}<em>{cardDetail(q)}</em>{/if}{#if !q.held} → {won(q.won)}원{/if}</span>{/each}</div>
          {#if cur.w.use}<div class="dd">이 중 <b>{won(cur.w.use)}캐시는 구매용</b>(실제로 쓸 아이템)이에요. 아래 엠작은 나머지 {won(cur.route.pay)}캐시로만 짰어요.</div>{/if}
          {#if cur.funding.spare}<div class="dd">끝자리 때문에 한 권 더 사서 <b>{won(cur.funding.spare.cash)}캐시가 남아요</b>. 다음 주에 먼저 쓰고, 그 값은 다음 주에 세요.</div>{/if}
        </li>
        {#if cur.route.lines.length}
          <li>
            <div class="t">캐시샵에서 사기</div>
            <div class="chips">{#each cur.route.lines as l (l.item.id)}<span class="ef-chip">{itemLabel(l.item)} <b>{countLabel(l.item, l.n)}</b></span>{/each}</div>
            <div class="dd">사는 순간 {tierName(cur.w.tier)} · 수수료 {Math.round(cur.route.fee * 100)}%</div>
          </li>
          <li>
            <div class="t">경매장에 {cur.route.lines.reduce((a, l) => a + l.n, 0)}번 팔기 → 수수료 빼고 {cur.route.meso.toFixed(1)}억 메소</div>
            <div class="chips">{#each cur.route.lines as l (l.item.id)}<span class="ef-chip">{itemLabel(l.item)} <b>{l.item.price}억</b>에</span>{/each}</div>
          </li>
        {/if}
        {#if cur.route.market}
          <li>
            <div class="t">캐시 {won(cur.route.market)} → 메이플포인트로 사서 메소마켓에 팔기 (1회)</div>
            <div class="dd">{(cur.route.market / eff.mk).toFixed(2)}억 메소{cur.route.lines.length ? (fillerOnly(cur.route) ? ` · ${out.mode === 'plan' ? '계획' : '목표'} 금액을 딱 맞추려고 남은 끝자리` : ' · 아이템으로 채우지 않은 금액') : ''}</div>
          </li>
        {/if}
        {#if cur.credit && (cur.credit.buys.length || cur.credit.earned)}
          <li>
            {#if cur.credit.buys.length}
              <div class="t">크레딧 {won(cur.credit.have)}으로 크레딧샵에서 사서 팔기 → {cur.credit.meso.toFixed(1)}억 메소</div>
              <div class="chips">{#each cur.credit.buys as b (b.item.id)}<span class="ef-chip">{b.item.name} <b>{b.n}개</b> · {b.item.price}억</span>{/each}</div>
              <div class="dd">이번에 쌓인 크레딧 {won(cur.credit.earned)}{cur.credit.have > cur.credit.earned ? ` + 남아 있던 ${won(cur.credit.have - cur.credit.earned)}` : ''} · 남는 크레딧 {won(cur.credit.left)}</div>
            {:else}
              <div class="t">크레딧 {won(cur.credit.earned)} 쌓임 → 모아 뒀다가 다음에 사요</div>
              <div class="dd">지금 {won(cur.credit.left)}크레딧. 큐브를 살 만큼 모이면 그 주에 사서 팔아요</div>
            {/if}
          </li>
        {/if}
        <li>
          <div class="t">메소 {(cur.route.meso + (cur.route.market && eff.mk ? cur.route.market / eff.mk : 0) + (cur.credit?.meso ?? 0)).toFixed(1)}억 → 엄 시세로 {won(cur.route.back + (cur.credit?.back ?? 0))}원</div>
        </li>
      </ol>
    </section>

    <p class="extra">
      {#if pick.pay > out.target}<span>{out.mode === 'plan' ? `메이플포인트를 1,000원 단위로만 살 수 있어서 계획보다 ${won(pick.pay - out.target)}원 더 결제해요` : `목표보다 ${won(pick.pay - out.target)}원 더 결제하는 게 더 남아서 그렇게 짰어요`}</span>{/if}
      <span>엄 시세가 100원 내리면 {won(pick.back / eff.um * 100)}원 더 나가요</span>
    </p>
  {:else}
    <div class="empty">
      <b>이 조건으로는 조합을 만들 수 없어요</b>
      <span>아이템 가격이나 메소마켓 시세를 확인해 주세요.</span>
    </div>
  {/if}
</article>

<style>
  .together { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--color-line); background: var(--color-bg2); cursor: pointer; width: max-content; max-width: 100%; }
  .together input { position: absolute; opacity: 0; pointer-events: none; }
  .together .sw { position: relative; flex: none; width: 38px; height: 22px; border-radius: 99px; background: var(--color-panel3); border: 1px solid var(--color-line2); transition: background .25s, border-color .25s; }
  .together .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--color-tx2); transition: transform .3s cubic-bezier(.3, 1.4, .5, 1), background .25s; }
  .together input:checked + .sw { background: color-mix(in oklab, var(--color-lav) 40%, var(--color-panel3)); border-color: var(--color-lav); }
  .together input:checked + .sw::after { transform: translateX(16px); background: #fff; }
  .together input:focus-visible + .sw { outline: 2px solid var(--color-lav); outline-offset: 2px; }
  .together .tx { display: grid; line-height: 1.35; }
  .together .tx b { font-size: 13px; }
  .together .tx small { font-size: 11.5px; color: var(--color-tx3); }
  .phases { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); align-items: start; }
  .phase { display: grid; gap: 10px; padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid var(--color-line); background: var(--color-bg2); min-width: 0; }
  .ph-h { display: flex; justify-content: space-between; align-items: baseline; }
  .ph-h b { font-size: 14px; }
  .ph-h small { font-size: 12px; color: var(--color-tx3); }
  .seg { display: flex; flex-wrap: wrap; gap: 4px; }
  .seg button { appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; padding: 6px 11px; border-radius: 9px; border: 1px solid var(--color-line); background: var(--color-panel); color: var(--color-tx2); }
  .seg button[aria-pressed="true"] { border-color: var(--color-lav); color: var(--color-tx); background: color-mix(in oklab, var(--color-lav) 16%, var(--color-panel)); }
  .phase .srow { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--color-tx3); }
  .phase .srow input { flex: 1; min-width: 0; accent-color: var(--color-peach); }
  .phase .srow .n { font-size: 15px; color: var(--color-tx); }
  .kcost { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12.5px; color: var(--color-tx3); }
  .kcost .box { width: 110px; }
  .routes .dim { color: var(--color-tx3); }
  .vsp { display: block; margin-top: 2px; font-size: 11.5px; color: var(--color-tx3); }
  .vs .vsp b { display: inline; font-size: 12px; font-weight: 600; color: var(--color-tx2); }
  .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; margin-top: 10px; }
  .split div { display: grid; gap: 1px; padding: 9px 12px; border-radius: var(--radius-md); background: var(--color-bg2); border: 1px solid var(--color-line); }
  .split span { font-size: 12px; color: var(--color-tx3); }
  .split small { font-size: 11px; }
  .split b { font-size: 17px; font-weight: 700; color: var(--color-bad); }
  .split em { font-style: normal; font-size: 12px; color: var(--color-tx2); }
  .split .low b { color: var(--color-mint); }
  .split .badge { font-style: normal; margin-left: 6px; padding: 0 7px; border-radius: 999px; font-size: 10.5px; font-weight: 600; color: var(--color-mint); background: color-mix(in oklab, var(--color-mint) 16%, transparent); }
  .split .gap { font-weight: 500; font-size: 12.5px; color: var(--color-peach); }
  .split .gap span { font-size: 12.5px; color: inherit; }
  .ef-chip em.sp { color: var(--color-lav); }
  .answer > * { min-width: 0; }
  .answer {
    display: grid; gap: 16px; padding: 22px;
    background:
      radial-gradient(520px circle at var(--mx) var(--my), rgba(184, 168, 255, .09), transparent 60%),
      linear-gradient(160deg, color-mix(in oklab, var(--color-lav) 12%, var(--color-panel)), var(--color-panel) 55%);
    border-color: color-mix(in oklab, var(--color-lav) 35%, var(--color-line));
  }
  .empty { display: grid; gap: 4px; padding: 10px 2px; }
  .empty b { font-size: 16px; }
  .empty span { font-size: 13px; color: var(--color-tx3); }
  .q { margin: 0; font-size: 14px; color: var(--color-tx2); }

  .routes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  @media (max-width: 1100px) { .routes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 672px) { .routes { grid-template-columns: 1fr; } }
  .routes button {
    appearance: none; cursor: pointer; font: inherit; text-align: left; color: var(--color-tx3);
    display: grid; gap: 2px; padding: 12px 14px; border-radius: 14px;
    background: var(--color-bg2); border: 1px solid var(--color-line); transition: border-color .2s, background .2s;
  }
  .routes button:hover { border-color: var(--color-line2); }
  .routes button.on { border-color: var(--color-lav); background: color-mix(in oklab, var(--color-lav) 12%, var(--color-bg2)); box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-lav) 18%, transparent); }
  .rn { font-size: 12.5px; color: var(--color-tx2); font-weight: 600; }
  .rn em { font-style: normal; font-size: 10.5px; font-weight: 600; padding: 0 6px; margin-left: 4px; border-radius: 6px; background: var(--color-lav); color: var(--color-on-accent); }
  .routes b { font-size: 20px; color: var(--color-tx); font-weight: 600; }
  .routes button.on b { color: var(--color-lav); }
  .rs { font-size: 11.5px; }

  .headline { display: grid; gap: 8px; }
  .big { font-size: clamp(40px, 5vw, 58px); line-height: 1; font-weight: 700; letter-spacing: -.03em; }
  .big small { font-size: 18px; font-weight: 400; color: var(--color-tx3); margin-left: 6px; letter-spacing: 0; }
  .flow { margin: 0; font-size: 14px; color: var(--color-tx2); }
  .flow b { color: var(--color-tx); font-weight: 500; }
  .flow .up { color: var(--color-mint); }
  .dot { margin: 0 6px; color: var(--color-tx3); }
  .cr { font-size: 12px; color: var(--color-tx3); margin-left: 4px; }
  .crd { font-size: 12px; color: var(--color-butter); }
  .crd .dim { color: var(--color-tx3); }

  .chart { margin: 0; padding: 12px 14px; border-radius: var(--radius-md); background: var(--color-bg2); border: 1px solid var(--color-line); display: grid; gap: 6px; }
  .chart figcaption { font-size: 12.5px; font-weight: 600; color: var(--color-tx2); }
  .chart svg { width: 100%; height: 188px; display: block; }
  .axis { stroke: var(--color-line2); stroke-width: 1; }
  .area { fill: color-mix(in oklab, var(--color-lav) 14%, transparent); }
  .line { fill: none; stroke: var(--color-lav); stroke-width: 2; }
  .m { stroke: var(--color-bg2); stroke-width: 2; }
  .m.best { fill: var(--color-mint); }
  .m.knee { fill: var(--color-lav); }
  .cost { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
  .cost .box { width: 110px; }
  .m.count { fill: var(--color-peach); }
  .yl, .xl { font-family: var(--font-mono); font-size: 10.5px; fill: var(--color-tx3); }
  .at { font-family: var(--font-sans); font-size: 11px; fill: var(--color-tx3); }
  .kl { font-family: var(--font-sans); font-size: 11px; fill: var(--color-lav); font-weight: 600; }

  .sales { display: grid; gap: 10px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--color-bg2); border: 1px solid var(--color-line); }
  .srow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 12.5px; color: var(--color-tx3); }
  .srow .n { font-size: 22px; color: var(--color-tx); min-width: 64px; }
  .srow input { flex: 1 1 220px; accent-color: var(--color-peach); }
  .caution {
    display: grid; grid-template-columns: 22px 1fr; gap: 10px; align-items: start; padding: 10px 12px; border-radius: 12px; font-size: 12.5px; color: var(--color-tx);
    background: color-mix(in oklab, var(--color-peach) 13%, transparent); border: 1px solid color-mix(in oklab, var(--color-peach) 45%, transparent);
  }
  .caution i { font-style: normal; font-weight: 700; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--color-peach); color: var(--color-on-accent); font-size: 13px; }
  .caution b { color: var(--color-peach); }
  .caution.soft { background: color-mix(in oklab, var(--color-sky) 10%, transparent); border-color: color-mix(in oklab, var(--color-sky) 40%, transparent); }
  .caution.soft i { background: var(--color-sky); }
  .caution.soft b { color: var(--color-sky); }

  .vs { display: flex; flex-wrap: wrap; gap: 8px; }
  .vs:empty { display: none; }
  .vs div { flex: 1 1 180px; display: grid; gap: 2px; padding: 8px 12px; border-radius: 12px; background: var(--color-bg2); border: 1px dashed var(--color-line2); font-size: 12px; color: var(--color-tx3); }
  .vs div b { font-size: 16px; color: var(--color-tx2); font-weight: 500; }

  h4 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  h4 span { font-size: 11.5px; font-weight: 400; color: var(--color-tx3); margin-left: 6px; }
  .note { margin: 0 0 10px; font-size: 12.5px; color: var(--color-tx2); background: var(--color-bg2); border-radius: 10px; padding: 10px 12px; line-height: 1.55; }
  .note b { color: var(--color-tx); font-weight: 600; }
  .tbl { overflow-x: auto; border-radius: var(--radius-md); border: 1px solid var(--color-line); }
  table { width: 100%; min-width: 800px; border-collapse: collapse; font-size: 13px; }
  th { font-weight: 500; font-size: 11.5px; color: var(--color-tx3); text-align: right; padding: 8px 10px; background: var(--color-bg2); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  td { padding: 7px 10px; box-shadow: inset 0 1px 0 var(--color-line); text-align: right; white-space: nowrap; vertical-align: middle; }
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
  .usenote { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--color-tx2); }
  .usenote b { color: var(--color-tx); font-weight: 600; }
  .usenote .bad { color: var(--color-bad); }
  td small.use { display: block; font-size: 10.5px; color: var(--color-tx3); font-family: var(--font-sans); }

  /*
   * 패드·폰: 주별 표를 주마다 카드로. 아홉 칸을 한 줄에 두면 화면을 넘어 '실제로 나감'이 잘린다.
   *   9월 24일 주 · 이번 주              실제로 나감
   *   충전 칩들
   *   결제 | 할인 받음 | 판매 | 크레딧 | 낸 현금   (폰은 세 칸씩)
   */
  @media (max-width: 1032px) {
    .tbl { border: 0; overflow: visible; }
    table { min-width: 0; display: block; }
    thead { display: none; }
    tbody { display: grid; gap: 8px; }
    tr { display: block; }
    .month td { display: block; border-radius: 10px; padding: 8px 10px; box-shadow: none; }
    .wk { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px 10px; padding: 12px; border-radius: 12px; background: var(--color-bg2); border: 1px solid var(--color-line); }
    .wk.sel { border-color: var(--color-lav); background: color-mix(in oklab, var(--color-lav) 12%, var(--color-bg2)); }
    .wk td, .wk:hover td, .wk.sel td { padding: 0; box-shadow: none; background: none; text-align: left; white-space: normal; order: 4; }
    .wk td[data-l]::before { content: attr(data-l); display: block; font-family: var(--font-sans); font-size: 10.5px; color: var(--color-tx3); }
    .wk td.d { grid-column: span 4; order: 1; font-weight: 600; }
    .wk .d small { display: inline; margin-left: 6px; }
    .wk td.lo { grid-column: span 2; order: 2; text-align: right; font-size: 15px; }
    .wk td.pt { grid-column: 1 / -1; order: 3; }
    .parts { justify-content: flex-start; }
    .wk :global(.nb) { margin-left: 0; }
  }
  @media (max-width: 672px) {
    .answer { padding: 16px; }
    .big { font-size: 44px; }
    .route li { grid-template-columns: 26px 1fr; column-gap: 8px; }
    .answer :global(.ef-chip) { white-space: normal; flex-wrap: wrap; border-radius: 10px; }
    .wk { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .wk td.d { grid-column: span 2; }
    .wk td.lo { grid-column: span 1; }
  }
</style>
