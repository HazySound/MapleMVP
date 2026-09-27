<script lang="ts">
  /** 2. 캐시는 얼마에 — 캐시 잔액, 상품권 할인과 남은 한도, 바코드(이벤트 때만) */
  import NumBox from './NumBox.svelte'
  import { SHOP, eff, saveEff, thisMonth } from '../eff.svelte'
  import { rateOf } from '../core/efficiency'
  import { won } from '../format'

  const month = Number(thisMonth().slice(5))
  const bc = SHOP.barcode

  function note(disc: number) {
    const r = rateOf(disc)
    if (r == null) return '할인을 넣으면 계산에 써요'
    if (disc <= 100) return `5만원권 ${won(50000 * r)}원`
    return `${((1 - r) * 100).toFixed(1).replace(/\.0$/, '')}% 할인`
  }
</script>

<article class="card">
  <h3 class="card-title"><span class="n">2</span>캐시는 얼마에</h3>

  <div class="ef-field">
    <label for="eff-balance">캐시 잔액</label>
    <NumBox id="eff-balance" label="캐시 잔액" unit="캐시" placeholder="없으면 비움" value={eff.balance} set={v => { eff.balance = v; saveEff() }} />
    <span class="ef-hint">{eff.balance ? '잔액부터 먼저 써요. 이미 충전한 돈이라 1:1로 계산해요.' : '넥슨 캐시 잔액이 있으면 넣어 주세요. 먼저 써요.'}</span>
  </div>

  <div class="or">모자라는 캐시는 이렇게 충전</div>

  <div class="pay">
    <div class="row head"><span></span><span>상품권 (달마다 20만)</span><span>할인율(%) 또는 5만원권 가격</span><span>{month}월 남은 한도</span></div>
    {#each eff.cards as c, i (c.key)}
      <div class="row" class:off={!c.on}>
        <input type="checkbox" id="eff-card-{c.key}" bind:checked={c.on} onchange={saveEff} />
        <label for="eff-card-{c.key}">{c.name}<small>{note(c.disc)}</small></label>
        <NumBox id="eff-disc-{c.key}" label="{c.name} 할인율 또는 5만원권 가격" size="sm" decimal placeholder="8" unit={c.disc && c.disc <= 100 ? '%' : ''}
          value={c.disc} set={v => { eff.cards[i].disc = v; saveEff() }} disabled={!c.on} />
        <NumBox id="eff-left-{c.key}" label="{c.name} {month}월 남은 한도" size="sm"
          value={eff.leftNow[c.key] ?? 0} set={v => { eff.leftNow[c.key] = v; saveEff() }} disabled={!c.on} />
      </div>
    {/each}

    <div class="row bc" class:off={!bc.on}>
      <input type="checkbox" id="eff-bc" bind:checked={eff.barcodeOn} onchange={saveEff} disabled={!bc.on} />
      <label for="eff-bc">넥슨플레이 바코드<small>{bc.on ? `이벤트 중${bc.until ? ` (~${bc.until})` : ''} · ${Math.round(bc.bonus * 100)}% 더 충전 · 추가분 최대 ${won(bc.cap)}캐시` : '지금은 추가 충전 이벤트가 없어요'}</small></label>
      {#if bc.on}
        <div class="want">
          <NumBox id="eff-bc-want" label="바코드로 받을 캐시" size="sm" unit="캐시" placeholder="비우면 나머지 전부"
            value={eff.barcodeWant ?? 0} set={v => { eff.barcodeWant = v || null; saveEff() }} disabled={!eff.barcodeOn} />
          {#if eff.barcodeWant}<span class="ef-hint">약 <b>{won(Math.ceil(eff.barcodeWant / (1 + bc.bonus)))}원</b> 충전하면 {won(eff.barcodeWant)}캐시</span>{/if}
        </div>
      {/if}
    </div>
  </div>

  <p class="ef-hint">상품권은 <b>5만원권을 먼저</b> 할인이 큰 것부터 쓰고, 남은 한도로만 3천 원 단위를 채운다고 보고 계산해요. 목표 계획을 따르면 달마다 한도를 이렇게 주별로 나눠요. 딱 맞지 않는 끝자리는 {bc.on ? '바코드나 ' : ''}일반 충전(1:1)으로 채워요.</p>
</article>

<style>
  .card { display: grid; gap: 12px; align-content: start; }
  .n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 7px; background: var(--color-panel3); font-family: var(--font-mono); font-size: 11px; color: var(--color-lav); }
  .or { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--color-tx3); }
  .or::before, .or::after { content: ""; flex: 1; height: 1px; background: var(--color-line); }
  .pay { display: grid; gap: 6px; }
  .row { display: grid; grid-template-columns: 18px minmax(0, 1fr) 112px 104px; gap: 8px; align-items: center; font-size: 13px; }
  .row.head { font-size: 11px; color: var(--color-tx3); }
  .row.head span:nth-child(n+3) { text-align: right; }
  .row.off label { opacity: .55; }
  .row input[type=checkbox] { accent-color: var(--color-lav); width: 15px; height: 15px; margin: 0; cursor: pointer; }
  .row label { display: grid; line-height: 1.3; cursor: pointer; color: var(--color-tx); }
  .row small { font-size: 11px; color: var(--color-tx3); }
  .bc { grid-template-columns: 18px minmax(0, 1fr) 216px; padding-top: 4px; border-top: 1px dashed var(--color-line); }
  .want { display: grid; gap: 3px; }
  @media (max-width: 672px) {
    .row { grid-template-columns: 18px minmax(0, 1fr) 84px 92px; }
    .bc { grid-template-columns: 18px minmax(0, 1fr); }
    .bc .want { grid-column: 2; }
  }
  /* 좁은 폰: 상품권 이름이 칸에 눌려 잘렸다. 이름을 한 줄 다 쓰고, 두 칸은 그 아래에 */
  @media (max-width: 420px) {
    .row { grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1fr); row-gap: 4px; }
    .row label { grid-column: 2 / -1; }
    .row:not(.head, .bc) > :global(:nth-child(3)) { grid-column: 2; }
    .row:not(.head, .bc) > :global(:nth-child(4)) { grid-column: 3; }
    .row.head span:nth-child(2) { display: none; }
    .row.head span:nth-child(n+3) { text-align: left; }
    .row + .row:not(.bc) { padding-top: 6px; border-top: 1px solid var(--color-line); }
  }
</style>
