<script lang="ts">
  /**
   * 5. 메이플 크레딧.
   *
   * 캐시샵에서 쓴 캐시(캐시템, 메이플포인트)의 5%가 크레딧으로 쌓인다. 크레딧샵 큐브를 사서 경매장에 팔면 그만큼 더 돌려받는다.
   * 크레딧당 가장 많이 받는 물건 기준으로 조합을 고를 때 반영하고, 실제로는 살 수 있는 개수만큼만 산다.
   * 계획을 따르면 주마다 쌓이는 크레딧을 모아 가며 가장 효율적으로 턴다.
   */
  import NumBox from './NumBox.svelte'
  import { addCreditItem, creditItems, eff, removeCreditItem, saveEff, type EffOut } from '../eff.svelte'
  import { CREDIT_RATE, daysLabel } from '../core/efficiency'
  import { won } from '../format'
  import { tip } from '../tip'

  let { out, fee }: { out: EffOut | null; fee: number } = $props()

  const items = $derived(creditItems())
  /** 크레딧 1만 개당 돌려받는 돈 */
  const per10k = (x: { price: number; credits: number }) => x.price && eff.um ? x.price * (1 - fee) * eff.um / x.credits * 10_000 : 0
  const bestId = $derived([...items].filter(x => x.price > 0).sort((a, b) => b.price / b.credits - a.price / a.credits)[0]?.id)

  // 지금 고른 루트에서 쌓이고 쓰는 크레딧
  const sum = $derived.by(() => {
    const p = out?.sel
    if (!p || !out?.credit) return null
    const earned = p.weeks.reduce((a, w) => a + (w.credit?.earned ?? 0), 0)
    const buys = new Map<string, { name: string; n: number }>()
    for (const w of p.weeks) for (const b of w.credit?.buys ?? []) {
      const cur = buys.get(b.item.id) ?? { name: b.item.name, n: 0 }
      cur.n += b.n; buys.set(b.item.id, cur)
    }
    return { earned, buys: [...buys.values()], back: p.creditBack, left: p.creditLeft, sales: p.creditSales }
  })

  let adding = $state(false)
  let form = $state({ name: '', credits: 0, days: 30 })
  function submit(e: Event) {
    e.preventDefault()
    if (!form.name.trim() || form.credits <= 0) return
    addCreditItem({ name: form.name.trim(), credits: Math.round(form.credits), ...(form.days ? { days: form.days } : {}) })
    adding = false; form = { name: '', credits: 0, days: 30 }
  }
</script>

<article class="card">
  <h3 class="card-title"><span class="n">5</span>메이플 크레딧 <span class="sub">캐시샵에서 쓴 캐시의 {Math.round(CREDIT_RATE * 100)}%가 크레딧으로 쌓여요</span></h3>

  <div class="wrap">
    <div class="left">
      <div class="ef-seg" role="group" aria-label="크레딧 쓰기">
        <button aria-pressed={eff.creditOn} onclick={() => { eff.creditOn = true; saveEff() }}>크레딧 쓰기</button>
        <button aria-pressed={!eff.creditOn} onclick={() => { eff.creditOn = false; saveEff() }}>안 쓰기</button>
      </div>
      <div class="ef-field">
        <label for="eff-credit-bal">남아 있는 크레딧</label>
        <NumBox id="eff-credit-bal" label="남아 있는 크레딧" unit="크레딧" placeholder="없으면 비움" value={eff.creditBalance}
          set={v => { eff.creditBalance = v; saveEff() }} disabled={!eff.creditOn} />
      </div>
      <div class="ef-field">
        <span class="lbl">끝에 남는 크레딧</span>
        <div class="ef-seg" role="group" aria-label="끝에 남는 크레딧">
          <button aria-pressed={!eff.creditKeep} onclick={() => { eff.creditKeep = false; saveEff() }} disabled={!eff.creditOn}>다 털기</button>
          <button aria-pressed={eff.creditKeep} onclick={() => { eff.creditKeep = true; saveEff() }} disabled={!eff.creditOn}>모아 두기</button>
        </div>
        <span class="ef-hint">{eff.creditKeep ? '가장 효율 좋은 큐브만 사고, 모자란 크레딧은 남겨서 다음 작 때 합쳐요' : '마지막에 남은 크레딧으로 살 수 있는 만큼 사서 팔아요'}</span>
      </div>
      {#if eff.creditOn && sum}
        <div class="sum">
          <span>이번에 쌓이는 크레딧 <b class="mono">{won(sum.earned)}</b>{#if eff.creditBalance} + 남아 있던 <b class="mono">{won(eff.creditBalance)}</b>{/if}</span>
          {#if sum.buys.length}
            <span class="buy">{sum.buys.map(b => `${b.name} ${b.n}개`).join(' + ')} → 팔아서 <b class="mono up">+{won(sum.back)}원</b></span>
          {:else}
            <span class="buy">큐브 하나를 살 만큼 안 모여요</span>
          {/if}
          <span>남는 크레딧 <b class="mono">{won(sum.left)}</b>{#if sum.sales} · 큐브 판매 {sum.sales}회(경매장 판매 횟수와 따로){/if}</span>
        </div>
      {:else if !eff.creditOn}
        <p class="ef-hint">크레딧을 계산에서 빼요. 큐브를 직접 쓰거나 모아 두실 때.</p>
      {/if}
    </div>

    <div class="right" class:off={!eff.creditOn}>
      <div class="tbl">
        <table>
          <thead><tr><th>크레딧샵 물건</th><th>크레딧</th><th>경매장 가격</th><th>크레딧 1만당</th></tr></thead>
          <tbody>
            {#each items as x (x.id)}
              <tr class:best={x.id === bestId}>
                <td>
                  <span class="name">{x.name}
                    <em class="tag">{daysLabel(x)}</em>
                    {#if x.id === bestId}<em class="tag top" use:tip={'크레딧당 가장 많이 받는 물건. 조합을 고를 때 이 값으로 크레딧을 쳐요'}>가장 효율</em>{/if}
                    {#if x.custom}<button class="del" onclick={() => removeCreditItem(x.id)} aria-label="{x.name} 지우기">×</button>{/if}
                  </span>
                </td>
                <td class="mono">{won(x.credits)}</td>
                <td class="in">
                  <NumBox id="eff-cp-{x.id}" label="{x.name} 경매장 가격(억)" size="sm" decimal unit="억" value={eff.creditPrices[x.id] ?? 0}
                    set={v => { if (v) eff.creditPrices[x.id] = v; else delete eff.creditPrices[x.id]; saveEff() }} disabled={!eff.creditOn} />
                </td>
                <td class="mono">{per10k(x) ? `${won(per10k(x))}원` : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if adding}
        <form class="add" onsubmit={submit}>
          <input class="txt" type="text" placeholder="물건 이름" bind:value={form.name} maxlength="40" aria-label="크레딧샵 물건 이름" />
          <NumBox id="eff-cc-credits" label="크레딧" unit="크레딧" size="sm" placeholder="10,000" value={form.credits} set={v => (form.credits = v)} />
          <div class="ef-seg" role="group" aria-label="사용 기간">
            {#each [[0, '무기한'], [7, '7일'], [30, '30일']] as [v, t] (v)}
              <button type="button" aria-pressed={form.days === v} onclick={() => (form.days = v as number)}>{t}</button>
            {/each}
          </div>
          <button type="button" class="btn" onclick={() => (adding = false)}>취소</button>
          <button type="submit" class="btn primary" disabled={!form.name.trim() || form.credits <= 0}>추가</button>
        </form>
      {:else}
        <button class="addbtn" onclick={() => (adding = true)} disabled={!eff.creditOn}>+ 크레딧샵 물건 직접 추가</button>
      {/if}
    </div>
  </div>
  <p class="ef-hint">캐시템을 살 때도, 메소마켓에 팔 메이플포인트를 살 때도 크레딧이 쌓여요. 큐브는 받은 뒤 30일 안에 써야 해요.</p>
</article>

<style>
  .card { display: grid; gap: 12px; }
  .n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 7px; background: var(--color-panel3); font-family: var(--font-mono); font-size: 11px; color: var(--color-lav); }
  .wrap { display: grid; gap: 14px; grid-template-columns: 1fr; }
  @media (min-width: 1080px) { .wrap { grid-template-columns: 280px minmax(0, 1fr); } }
  .left {
    display: grid; gap: 12px; align-content: start; align-self: start; padding: 16px; border-radius: var(--radius-md);
    background: linear-gradient(150deg, color-mix(in oklab, var(--color-butter) 10%, var(--color-bg2)), var(--color-bg2) 70%);
    border: 1px solid color-mix(in oklab, var(--color-butter) 28%, var(--color-line));
  }
  .left .ef-seg { justify-self: start; }
  .sum { display: grid; gap: 4px; font-size: 12.5px; color: var(--color-tx2); padding-top: 10px; border-top: 1px dashed var(--color-line2); }
  .sum b { color: var(--color-tx); font-weight: 500; }
  .sum .up { color: var(--color-mint); }
  .sum .buy { color: var(--color-tx); }
  .right { display: grid; gap: 8px; min-width: 0; align-content: start; }
  .right.off { opacity: .5; }
  .tbl { overflow-x: auto; border-radius: var(--radius-md); border: 1px solid var(--color-line); }
  table { width: 100%; min-width: 520px; border-collapse: collapse; font-size: 13px; }
  th { font-weight: 500; font-size: 11.5px; color: var(--color-tx3); text-align: right; padding: 8px 10px; background: var(--color-bg2); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  td { padding: 6px 10px; box-shadow: inset 0 1px 0 var(--color-line); text-align: right; white-space: nowrap; }
  td.in { width: 128px; }
  tr.best td { background: color-mix(in oklab, var(--color-butter) 8%, transparent); }
  tr.best td:first-child { box-shadow: inset 0 1px 0 var(--color-line), inset 3px 0 0 var(--color-butter); }
  .name { display: inline-flex; align-items: center; gap: 6px; }
  .tag { font-style: normal; font-size: 10.5px; padding: 0 6px; border-radius: 6px; background: var(--color-panel3); color: var(--color-tx3); }
  .tag.top { background: color-mix(in oklab, var(--color-butter) 22%, transparent); color: var(--color-butter); cursor: help; }
  .del { appearance: none; border: 0; background: none; color: var(--color-tx3); cursor: pointer; font-size: 14px; padding: 0 4px; border-radius: 6px; }
  .del:hover { background: var(--color-panel3); color: var(--color-tx); }
  .addbtn { appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; color: var(--color-tx3); padding: 8px; border-radius: var(--radius-md); background: transparent; border: 1px dashed var(--color-line2); }
  .addbtn:hover:not(:disabled) { border-color: var(--color-butter); color: var(--color-tx); }
  .add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px; border-radius: var(--radius-md); background: var(--color-bg2); border: 1px solid var(--color-line); }
  .add .txt { all: unset; box-sizing: border-box; flex: 1 1 160px; padding: 5px 10px; border-radius: 8px; font-size: 13px; color: var(--color-tx); background: var(--color-panel); border: 1px solid var(--color-line); user-select: text; }
  .add .txt:focus { border-color: var(--color-lav); }
  .add :global(.nb) { width: 150px; }

  /* 폰: 줄마다 카드. 이름 / 크레딧·1만당 | 가격 칸 */
  @media (max-width: 672px) {
    table { min-width: 0; }
    thead { display: none; }
    tbody { display: grid; }
    tr { display: grid; grid-template-columns: minmax(0, 1fr) 112px; column-gap: 8px; row-gap: 2px; align-items: center; padding: 9px 10px; box-shadow: inset 0 1px 0 var(--color-line); }
    tbody tr:first-child { box-shadow: none; }
    td, tr.best td, tr.best td:first-child { padding: 0; background: none; box-shadow: none; }
    td:first-child { grid-column: 1 / -1; white-space: normal; margin-bottom: 2px; }
    .name { flex-wrap: wrap; row-gap: 3px; }
    td:nth-child(2), td:nth-child(4) { grid-column: 1; text-align: left; font-size: 11.5px; color: var(--color-tx3); }
    td:nth-child(2)::before { content: '크레딧 '; font-family: var(--font-sans); }
    td:nth-child(4)::before { content: '크레딧 1만당 '; font-family: var(--font-sans); }
    td:nth-child(3) { grid-column: 2; grid-row: 2 / span 2; width: auto; }
    tr.best { background: color-mix(in oklab, var(--color-butter) 8%, transparent); box-shadow: inset 0 1px 0 var(--color-line), inset 3px 0 0 var(--color-butter); }
  }
</style>
