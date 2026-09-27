<script lang="ts">
  /**
   * 결론. 루트 셋 중 하나를 골라 가장 크게 '실제로 나가는 돈', 그 아래 따라 할 순서.
   *   최저가 루트: 가장 적게 잃는 조합 (판매 횟수는 따지지 않는다)
   *   최적화 루트: 판매 횟수 대비 가장 효율적인 지점 (core/efficiency의 knee)
   *   횟수 정하기: 주마다 판매 n회까지
   * 계획을 따르면 주별 표가 붙고, 줄을 누르면 순서가 그 주로 바뀐다.
   */
  import NumBox from './NumBox.svelte'
  import { app } from '../store.svelte'
  import { planner } from '../plan.svelte'
  import { SHOP, eff, saveEff, type EffOut, type Pick, type Want, type WeekPick } from '../eff.svelte'
  import { PG_ID, countLabel, itemLabel, type Part } from '../core/efficiency'
  import { eul, eun } from '../format'
  import { won } from '../format'

  let { out, sel = $bindable(0) }: { out: EffOut | null; sel?: number } = $props()

  const d = $derived(app.data!)
  const tierName = (k: string | null) => d.tiers.find(t => t.key === k)?.name ?? '등급 없음'
  const md = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`
  const pick = $derived(out?.sel ?? null)
  const cur = $derived(pick ? pick.weeks[Math.min(sel, pick.weeks.length - 1)] : null)
  const per = $derived(out?.mode === 'plan' ? '주마다 ' : '')

  const missing = $derived.by(() => {
    const m: string[] = []
    if (!(eff.usePlan && planner.result && !planner.result.error) && !eff.amount) m.push('1번에서 결제할 금액(또는 목표 계획)')
    if (!eff.um) m.push('3번의 엄 시세')
    if (!eff.prices[PG_ID] && !eff.mk) m.push('4번의 플가 가격이나 3번의 메소마켓')
    return m
  })

  const question = $derived.by(() => {
    if (!out) return ''
    if (out.mode === 'plan' && planner.input) return `${tierName(planner.input.target)} 달성까지 실제로 나가는 돈`
    return `${won(out.target)}원 결제하면 실제로 나가는 돈`
  })
  const rate = (p: Pick) => p.cost ? p.back / p.cost * 100 : 0
  const choose = (w: Want) => { eff.want = w; saveEff() }

  // ---- 판매 횟수별 곡선 ----
  // 그래프는 칸 너비에 맞춰 그린다. 늘려 그리면 글자까지 커진다
  let cw = $state(600)
  const W = $derived(Math.max(280, cw - 28))
  const H = 150, PX = 48, PY = 16
  const chart = $derived.by(() => {
    if (!out || out.hi <= out.lo) return null
    const xs: number[] = [], ys: number[] = []
    for (let n = out.lo; n <= out.hi; n++) if (Number.isFinite(out.curve[n])) { xs.push(n); ys.push(out.curve[n]) }
    const y0 = Math.min(...ys), y1 = Math.max(...ys), span = y1 - y0 || 1
    const X = (n: number) => PX + (n - out.lo) / (out.hi - out.lo) * (W - PX - 12)
    const Y = (v: number) => PY + (1 - (v - y0) / span) * (H - PY * 2)
    const line = xs.map((n, i) => `${i ? 'L' : 'M'}${X(n).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join('')
    const area = `${line}L${X(xs.at(-1)!).toFixed(1)},${H - PY}L${X(xs[0]).toFixed(1)},${H - PY}Z`
    const dot = (n: number) => ({ x: X(n), y: Y(out.curve[n]) })
    return { line, area, X, Y, y0, y1, best: dot(out.hi), knee: dot(out.knee.n ?? out.hi), count: dot(out.count.n ?? out.hi) }
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

  const cardDetail = (q: Part) => q.card ? [q.big ? `5만원권 ${q.big}장` : '', q.small ? `3천 원 단위 ${won(q.small)}` : ''].filter(Boolean).join(' + ') : ''
  const discount = (w: WeekPick) => w.funding.parts.filter(q => !q.held).reduce((a, q) => a + q.cash - q.won, 0)
  const byMonth = $derived.by(() => {
    const m: Record<string, Record<string, string[]>> = {}
    for (const w of pick?.weeks ?? []) for (const q of w.funding.parts) if (q.card) ((m[w.w.month] ??= {})[q.name] ??= []).push(`${md(w.w.start)} ${won(q.cash)}`)
    return m
  })
  const firstOfMonth = (i: number) => !pick || i === 0 || pick.weeks[i - 1].w.month !== pick.weeks[i].w.month
  const monthLine = (month: string) => eff.cards.filter(c => c.on).map(c => `${c.name} ${byMonth[month]?.[c.name]?.join(', ') ?? '안 씀'}`).join(' · ')
  const setWeekBc = (start: string, v: number) => { if (v) eff.weekBarcode[start] = v; else delete eff.weekBarcode[start]; saveEff() }
</script>

<article class="card answer" id="eff-answer">
  {#if missing.length}
    <div class="empty">
      <b>몇 칸만 더 채우면 결론이 나와요</b>
      <span>남은 것: {missing.join(', ')}</span>
    </div>
  {:else if out && pick && cur}
    <p class="q">{question}</p>

    <div class="routes" role="group" aria-label="루트 고르기">
      <button class:on={eff.want === 'best'} onclick={() => choose('best')}>
        <span class="rn">최저가 루트</span>
        <b class="mono">{won(out.best.loss)}원</b>
        <span class="rs">판매 {out.best.sales}회 · 가장 적게 잃어요</span>
      </button>
      <button class:on={eff.want === 'knee'} onclick={() => choose('knee')}>
        <span class="rn">최적화 루트 <em>추천</em></span>
        <b class="mono">{won(out.knee.loss)}원</b>
        <span class="rs">판매 {out.knee.sales}회{out.knee.sales < out.best.sales ? ` · 최저가보다 ${out.best.sales - out.knee.sales}회 적게, +${won(out.knee.loss - out.best.loss)}원` : ' · 최저가와 같아요'}</span>
      </button>
      <button class:on={eff.want === 'count'} onclick={() => choose('count')}>
        <span class="rn">횟수 정하기</span>
        <b class="mono">{won(out.count.loss)}원</b>
        <span class="rs">{per}최대 {out.count.n}회 · 판매 {out.count.sales}회</span>
      </button>
    </div>

    <div class="headline">
      <div class="big mono">{won(pick.loss)}<small>원</small></div>
      <p class="flow">
        현금 <b class="mono">{won(pick.cost)}원</b> 넣고 <b class="mono up">{won(pick.back)}원</b> 돌려받음
        <span class="dot">·</span> 회수율 <b class="mono">{rate(pick).toFixed(1)}%</b>
        <span class="dot">·</span> 경매장 판매 <b class="mono">{pick.sales}회</b>
      </p>
    </div>

    {#if chart}
      <figure class="chart" bind:clientWidth={cw}>
        <figcaption>판매 횟수를 줄이면 얼마나 더 나가나 <span>{out.mode === 'plan' ? '가로: 주마다 최대 판매 횟수' : '가로: 판매 횟수'} · 세로: 실제로 나가는 돈</span></figcaption>
        <svg viewBox="0 0 {W} {H + 18}" role="img" aria-label="판매 횟수별 실제로 나가는 돈">
          <line x1={PX} x2={W - 12} y1={H - PY} y2={H - PY} class="axis" />
          <text x={PX - 6} y={PY + 4} class="yl" text-anchor="end">{won(Math.round(chart.y1 / 1000))}천</text>
          <text x={PX - 6} y={H - PY} class="yl" text-anchor="end">{won(Math.round(chart.y0 / 1000))}천</text>
          <path d={chart.area} class="area" />
          <path d={chart.line} class="line" />
          <circle cx={chart.best.x} cy={chart.best.y} r="5" class="m best" />
          <circle cx={chart.knee.x} cy={chart.knee.y} r="5" class="m knee" />
          {#if eff.want === 'count'}<circle cx={chart.count.x} cy={chart.count.y} r="5" class="m count" />{/if}
          <text x={PX} y={H + 12} class="xl">{out.lo}회</text>
          <text x={W - 12} y={H + 12} class="xl" text-anchor="end">{out.hi}회</text>
          <text x={chart.knee.x} y={chart.knee.y - 10} class="kl" text-anchor="middle">최적화 {out.knee.n}회</text>
        </svg>
        <p class="ef-hint">
          {#if out.knee.n != null && out.knee.n < out.hi}
            <b>최적화</b>는 곡선이 가장 크게 꺾이는 곳이에요. 여기서부터는 더 팔아도 아끼는 돈이 얼마 안 돼요.
          {:else}
            판매 횟수를 줄이면 손해가 바로 커져서 최저가 루트가 가장 효율적이에요.
          {/if}
        </p>
      </figure>
    {/if}

    {#if eff.want === 'count'}
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
        <span><b>{cheapSingles.join(', ')}{eul(cheapSingles.at(-1)!)} 낱개로 파는 루트예요.</b> 같은 걸 파는 사람이 많아서, 엠작이 몰리는 주 초반(목요일 갱신 직후)과 월초에는 시세가 평소보다 많이 떨어질 수 있어요. 넣은 가격보다 싸게 팔리면 실제로 나가는 돈이 늘어나요.</span>
      </div>
    {/if}
    {#if timedIn.length}
      <div class="caution soft">
        <i aria-hidden="true">i</i>
        <span><b>{timedIn.join(', ')}{eun(timedIn.at(-1)!)} 받은 뒤 그 기간 안에 써야 해요.</b> 값이 오를 때까지 오래 들고 기다리기 어려우니, 기간 안에 다 팔 수 있는 만큼만 사세요.</span>
      </div>
    {/if}

    <div class="vs">
      {#if out.pgOnly}<div>플가만 ({out.pgOnly.sales}회)<b class="mono">{won(out.pgOnly.loss)}원</b></div>{/if}
      {#if out.mkOnly}<div>전부 메소마켓 ({out.mkOnly.sales}회)<b class="mono">{won(out.mkOnly.loss)}원</b></div>{/if}
    </div>

    {#if out.mode === 'plan'}
      <section class="weeks">
        <h4>주별로 보면 <span>줄을 누르면 아래 순서가 그 주로 바뀌어요</span></h4>
        <p class="note">결제액은 <b>목표 계획의 주별 금액 그대로</b>예요. 상품권은 <b>할인이 큰 것부터</b> 그 달 한도가 남은 주에 쓰고, 5만원권으로 먼저, 5만 원이 안 되는 부분은 3천 원 단위로 충전해요. 권으로 딱 맞지 않는 끝자리는 {SHOP.barcode.on ? '바코드나 ' : ''}일반 충전으로 채워요. 달 줄에 그 달 한도를 어느 주에 썼는지 나와요.</p>
        <div class="tbl">
          <table>
            <thead><tr><th>주</th><th>결제</th><th>충전</th>{#if SHOP.barcode.on}<th>바코드로 받을 캐시</th>{/if}<th>할인 받음</th><th>판매</th><th>낸 현금</th><th>실제로 나감</th></tr></thead>
            <tbody>
              {#each pick.weeks as w, i (w.w.start)}
                {#if firstOfMonth(i)}
                  <tr class="month"><td colspan={SHOP.barcode.on ? 8 : 7}><b>{Number(w.w.month.slice(5))}월 상품권 한도</b> ({i === 0 ? '2번에 넣은 남은 한도' : '각 200,000원 새로'}) — {monthLine(w.w.month)}</td></tr>
                {/if}
                <tr class="wk" class:sel={w === cur} onclick={() => (sel = i)}>
                  <td class="d">{md(w.w.start)} 주{#if i === 0}<small>이번 주</small>{/if}</td>
                  <td class="mono">{won(w.route.pay)}</td>
                  <td><div class="parts">{#each w.funding.parts as q (q.name)}<span class="ef-chip">{q.name} <b>{won(q.cash)}</b>{#if cardDetail(q)}<em>{cardDetail(q)}</em>{/if}</span>{/each}</div></td>
                  {#if SHOP.barcode.on}
                    <td onclick={e => e.stopPropagation()}>
                      <NumBox id="eff-wbc-{w.w.start}" label="{md(w.w.start)} 주 바코드 캐시" size="sm" placeholder={eff.barcodeWant ? won(eff.barcodeWant) : '나머지 전부'}
                        value={eff.weekBarcode[w.w.start] ?? 0} set={v => setWeekBc(w.w.start, v)} />
                    </td>
                  {/if}
                  <td class="mono good">{discount(w) > 0 ? won(discount(w)) : '—'}</td>
                  <td class="mono">{w.route.sales}회</td>
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
      <h4>{out.mode === 'plan' ? `${md(cur.w.start)} 주에 이렇게 하면 돼요` : '이렇게 하면 돼요'}</h4>
      <ol>
        <li>
          <div class="t">캐시 {won(cur.route.pay)} 충전 → 현금 {won(cur.route.cost)}원</div>
          <div class="chips">{#each cur.funding.parts as q (q.name)}<span class="ef-chip">{q.name} <b>{won(q.cash)}</b>{#if cardDetail(q)}<em>{cardDetail(q)}</em>{/if}{#if !q.held} → {won(q.won)}원{/if}</span>{/each}</div>
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
            <div class="dd">{(cur.route.market / eff.mk).toFixed(2)}억 메소{cur.route.lines.length ? ' · 아이템으로 채우지 않은 금액' : ''}</div>
          </li>
        {/if}
        <li>
          <div class="t">메소 {(cur.route.meso + (cur.route.market && eff.mk ? cur.route.market / eff.mk : 0)).toFixed(1)}억 → 엄 시세로 {won(cur.route.back)}원</div>
        </li>
      </ol>
    </section>

    <p class="extra">
      {#if pick.pay > out.target}<span>목표보다 {won(pick.pay - out.target)}원 더 결제하는 게 더 남아서 그렇게 짰어요</span>{/if}
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

  .routes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
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

  .chart { margin: 0; padding: 12px 14px; border-radius: var(--radius-md); background: var(--color-bg2); border: 1px solid var(--color-line); display: grid; gap: 6px; }
  .chart figcaption { font-size: 12.5px; font-weight: 600; color: var(--color-tx2); }
  .chart figcaption span { font-weight: 400; font-size: 11px; color: var(--color-tx3); margin-left: 6px; }
  .chart svg { width: 100%; height: 168px; display: block; }
  .axis { stroke: var(--color-line2); stroke-width: 1; }
  .area { fill: color-mix(in oklab, var(--color-lav) 14%, transparent); }
  .line { fill: none; stroke: var(--color-lav); stroke-width: 2; }
  .m { stroke: var(--color-bg2); stroke-width: 2; }
  .m.best { fill: var(--color-mint); }
  .m.knee { fill: var(--color-lav); }
  .m.count { fill: var(--color-peach); }
  .yl, .xl { font-family: var(--font-mono); font-size: 10.5px; fill: var(--color-tx3); }
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
