<script lang="ts">
  /**
   * 4. 플가 기준 가격표.
   *
   * 플가 가격 하나로 다른 아이템마다 '이 가격 넘으면 플가보다 이득'인 기준을 잡는다.
   * 기준은 기준일 뿐이라 실제 경매장 가격은 언제든 넣을 수 있고(높게도 낮게도),
   * 넣은 값으로 효율과 순서가 바뀐다. 비워 둔 아이템은 계산에서 뺀다.
   */
  import NumBox from './NumBox.svelte'
  import { ageOf, eff, saveEff, shopItems, touch } from '../eff.svelte'
  import { PG_ID, itemLabel, minPrice } from '../core/efficiency'
  import { won } from '../format'

  let { fee, used }: { fee: number; used: Set<string> } = $props()

  const items = shopItems()
  const pgItem = items.find(x => x.id === PG_ID)!
  const others = items.filter(x => x.id !== PG_ID)
  const pg = $derived(eff.prices[PG_ID] ?? 0)

  const effOf = (id: string, cash: number) => {
    const p = eff.prices[id] ?? 0, m = minPrice(pg, cash)
    return p && m ? p / m : 0
  }
  // 가격을 넣은 것 → 효율 높은 순 → 비싼 것 순. 치는 도중에 줄이 움직이면 곤란하니 칸을 떠날 때만 다시 줄 세운다
  const sorted = () => [...others].sort((a, b) =>
    (Number(!!eff.prices[b.id]) - Number(!!eff.prices[a.id])) || (effOf(b.id, b.cash) - effOf(a.id, a.cash)) || (b.cash - a.cash))
  let order = $state(sorted().map(x => x.id))
  const resort = () => { order = sorted().map(x => x.id) }
  const rows = $derived(order.map(id => others.find(x => x.id === id)!))
  const rank = $derived.by(() => {
    const m = new Map<string, number>(); let n = 0
    for (const x of rows) if (eff.prices[x.id]) m.set(x.id, ++n)
    return m
  })
  // 메소마켓도 같은 잣대로: 캐시 1원당 메소를 플가와 견준다
  const mkEff = $derived(pg && eff.mk ? (1 / eff.mk) / (pg * (1 - fee) / pgItem.cash) : 0)
  const setPrice = (id: string, v: number) => { if (v) eff.prices[id] = v; else delete eff.prices[id]; touch(`p:${id}`); saveEff() }
  const fx = (v: number) => (Math.round(v * 100) / 100).toFixed(2)
</script>

<article class="card">
  <h3 class="card-title"><span class="n">4</span>플가 기준 가격표 <span class="sub">가격은 경매장 한 번 판매 기준(묶음이면 묶음 전체)</span></h3>

  <div class="wrap">
    <div class="pg">
      <span class="nm">플래티넘 카르마의 가위</span>
      <span class="ef-hint">{won(pgItem.cash)}캐시 · 경매장 1개 가격</span>
      <NumBox id="eff-pg" label="플가 경매장 가격(억)" size="lg" decimal unit="억" placeholder="예: 3.0" value={pg}
        set={v => setPrice(PG_ID, v)} onblur={resort} />
      <span class="ef-hint">
        {#if pg && eff.um}수수료 {Math.round(fee * 100)}% 빼고 1개당 <b>{won(pg * (1 - fee) * eff.um)}원</b> 회수 · 이 효율이 <b>1.00플가</b>{:else}플가 가격을 넣으면 다른 아이템의 기준 가격이 나와요{/if}
      </span>
      {#if ageOf(`p:${PG_ID}`)}<span class="ef-hint">{ageOf(`p:${PG_ID}`)}</span>{/if}
    </div>

    <div class="tbl">
      <table>
        <thead><tr><th>아이템</th><th>캐시가</th><th>이 가격 넘으면 플가보다 이득</th><th>경매장 실제 가격</th><th>플가 대비</th></tr></thead>
        <tbody>
          {#each rows as x (x.id)}
            {@const e = effOf(x.id, x.cash)}
            <tr class:used={used.has(x.id)}>
              <td><span class="name"><span class="rk">{rank.get(x.id) ?? ''}</span>{itemLabel(x)}</span></td>
              <td class="mono">{won(x.cash)}</td>
              <td class="mono min">{pg ? `${fx(minPrice(pg, x.cash))}억` : '—'}</td>
              <td class="in">
                <NumBox id="eff-p-{x.id}" label="{itemLabel(x)} 경매장 가격(억)" size="sm" decimal unit="억"
                  placeholder={pg ? fx(minPrice(pg, x.cash)) : ''} value={eff.prices[x.id] ?? 0}
                  set={v => setPrice(x.id, v)} onblur={resort} />
              </td>
              <td class="mono eff" class:up={e >= 1} class:down={e > 0 && e < 1}>{e ? `${e.toFixed(2)}플가` : '—'}</td>
            </tr>
          {/each}
          <tr class="mk">
            <td><span class="name mkn">메소마켓<small>메이플포인트로 사서 메소마켓에 팔기</small></span></td>
            <td class="mono">—</td><td class="mono">—</td><td class="ef-hint r">3번 칸의 시세로</td>
            <td class="mono eff" class:up={mkEff >= 1} class:down={mkEff > 0 && mkEff < 1}>{mkEff ? `${mkEff.toFixed(2)}플가` : '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <p class="ef-hint">흐린 숫자가 기준이에요. 경매장에서 확인한 실제 가격을 넣으면(기준보다 높아도, 낮아도) 그 값으로 계산하고, 칸을 벗어나면 효율 순으로 다시 줄 서요. 비워 둔 아이템은 계산에서 빠져요. 기준보다 싼 아이템도 판매 횟수를 줄일 때는 후보로 써요.</p>
</article>

<style>
  .card { display: grid; gap: 12px; }
  .n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 7px; background: var(--color-panel3); font-family: var(--font-mono); font-size: 11px; color: var(--color-lav); }
  .wrap { display: grid; gap: 14px; grid-template-columns: 1fr; }
  @media (min-width: 1080px) { .wrap { grid-template-columns: 280px minmax(0, 1fr); } }
  .pg {
    display: grid; gap: 7px; align-content: start; align-self: start; padding: 16px; border-radius: var(--radius-md);
    background: linear-gradient(150deg, color-mix(in oklab, var(--color-lav) 12%, var(--color-bg2)), var(--color-bg2) 70%);
    border: 1px solid color-mix(in oklab, var(--color-lav) 30%, var(--color-line));
  }
  .nm { font-weight: 600; font-size: 14px; }
  .tbl { overflow-x: auto; border-radius: var(--radius-md); border: 1px solid var(--color-line); }
  table { width: 100%; min-width: 600px; border-collapse: collapse; font-size: 13px; }
  th { font-weight: 500; font-size: 11.5px; color: var(--color-tx3); text-align: right; padding: 8px 10px; background: var(--color-bg2); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  td { padding: 6px 10px; border-top: 1px solid var(--color-line); text-align: right; white-space: nowrap; }
  td.in { width: 128px; }
  .name { display: flex; align-items: center; gap: 6px; }
  .name small { display: block; font-size: 11px; color: var(--color-tx3); }
  .mkn { display: grid; gap: 0; }
  .rk { width: 14px; font-family: var(--font-mono); font-size: 11px; color: var(--color-tx3); }
  .min { color: var(--color-tx); }
  .eff { color: var(--color-tx3); }
  .eff.up { color: var(--color-mint); }
  .eff.down { color: var(--color-peach); }
  tr.used td:first-child { box-shadow: inset 3px 0 0 var(--color-mint); }
  .mk td { background: color-mix(in oklab, var(--color-sky) 6%, transparent); }
  .r { text-align: right; }
</style>
