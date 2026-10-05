<script lang="ts">
  /**
   * 직접 짜기: 쓸 아이템을 고르고, 개수를 정할 아이템만 개수를 적는다.
   *   개수를 적은 아이템 → 그 개수를 먼저 산다(주당 최대를 넘으면 주당 최대로 자른다)
   *   비워 둔 아이템(제한 없음) → 주당 최대 안에서 알아서 고른다
   *   모자라는 금액 → 메소마켓
   * 조합에 넣지 않은 아이템은 쓰지 않는다. 선물식도 넣어야 쓴다(금액을 적으면 그만큼 먼저, 비우면 알아서)
   */
  import NumBox from './NumBox.svelte'
  import { eff, saveEff, sellables, type Combo } from '../eff.svelte'
  import { GIFT_ID, countLabel, itemLabel } from '../core/efficiency'
  import { won } from '../format'

  let { combo, title, id }: { combo: Combo; title: string; id: string } = $props()

  const items = $derived(sellables().filter(x => x.price > 0))
  const chosen = $derived(items.filter(x => x.id in combo))
  const rest = $derived(items.filter(x => !(x.id in combo)))
  const fixedOnes = $derived(chosen.filter(x => combo[x.id] != null))
  const autoOnes = $derived(chosen.filter(x => combo[x.id] == null))
  const unit = (set: number) => (set > 1 ? '세트' : '개')
  /** 개수를 적으면 주당 최대로 자르고, 지우면 제한 없음(아이템은 남는다) */
  function setCount(k: string, v: number) {
    const cap = eff.caps[k]
    combo[k] = v > 0 ? Math.min(Math.round(v), cap ?? Infinity) : null
    saveEff()
  }
  function add(k: string) { combo[k] = null; saveEff() }

  // 선물식: 비율을 넣었을 때만 고를 수 있다. 조합에는 단위 묶음 수로 넣고, 화면에는 캐시 금액으로 보인다
  const giftOn = $derived(eff.gift > 0)
  const giftIn = $derived(giftOn && GIFT_ID in combo)
  const giftMinN = $derived(Math.max(1, Math.ceil(Math.max(eff.giftMin, eff.giftUnit) / eff.giftUnit)))
  const giftCash = $derived(combo[GIFT_ID] != null ? combo[GIFT_ID]! * eff.giftUnit : 0)
  /** 금액을 적으면 단위로 맞추고, 최소 금액보다 적으면 최소로 올린다. 지우면 알아서 */
  function setGift(v: number) {
    combo[GIFT_ID] = v > 0 ? Math.max(giftMinN, Math.round(v / eff.giftUnit)) : null
    saveEff()
  }
  const giftWord = $derived(giftIn ? (combo[GIFT_ID] != null ? `선물식 ${won(giftCash)}캐시` : '선물식') : '')
  function drop(k: string) { delete combo[k]; saveEff() }
</script>

<div class="combo">
  <div class="ch"><b>{title}</b><span>개수를 적은 아이템부터 사고, 비워 둔 아이템은 알아서 골라요. 모자라면 메소마켓</span></div>
  {#if giftIn}
    <div class="row">
      <span class="nm">선물식<small class="mono">1만 캐시당 {won(eff.gift)}원 · {eff.giftUnit / 10_000}만 단위</small></span>
      <NumBox id="{id}-gift" label="선물식으로 한 주에 쓸 캐시" size="sm" unit={combo[GIFT_ID] != null ? '캐시' : ''} placeholder="알아서"
        value={giftCash} set={setGift} />
      <span class="cap none">최소 {won(giftMinN * eff.giftUnit)}</span>
      <button class="x" onclick={() => drop(GIFT_ID)} aria-label="선물식 빼기" title="빼기">×</button>
    </div>
  {/if}
  {#each chosen as x (x.id)}
    {@const cap = eff.caps[x.id]}
    <div class="row">
      <span class="nm">{itemLabel(x)}<small class="mono">{won(x.cash)}캐시</small></span>
      <NumBox id="{id}-{x.id}" label="{itemLabel(x)} 한 주에 살 개수" size="sm" unit={combo[x.id] != null ? unit(x.set) : ''} placeholder="제한 없음"
        value={combo[x.id] ?? 0} set={v => setCount(x.id, v)} />
      {#if cap}
        <button class="cap" onclick={() => setCount(x.id, cap)} title="주당 최대 개수로 넣기">주당 최대 {cap}</button>
      {:else}
        <span class="cap none">주당 최대 없음</span>
      {/if}
      <button class="x" onclick={() => drop(x.id)} aria-label="{itemLabel(x)} 빼기" title="빼기">×</button>
    </div>
  {/each}
  {#if rest.length || (giftOn && !giftIn)}
    <select class="addsel" value="" onchange={e => { const v = e.currentTarget.value; if (v) add(v); e.currentTarget.value = '' }} aria-label="직접 짜기에 아이템 넣기">
      <option value="">+ 아이템 넣기</option>
      {#if giftOn && !giftIn}<option value={GIFT_ID}>선물식 · 1만 캐시당 {won(eff.gift)}원</option>{/if}
      {#each rest as x (x.id)}<option value={x.id}>{itemLabel(x)} · {won(x.cash)}캐시</option>{/each}
    </select>
  {/if}
  <p class="sum">
    {#if !items.length && !giftOn}4번 가격표에 경매장 가격을 넣은 아이템만 고를 수 있어요.
    {:else if !chosen.length && !giftIn}아직 넣은 아이템이 없어요. 전부 메소마켓으로 계산해요.
    {:else}
      {@const first = [...fixedOnes.map(x => `${itemLabel(x)} ${countLabel(x, combo[x.id]!)}`), ...(giftIn && combo[GIFT_ID] != null ? [giftWord] : [])]}
      {@const auto = [...autoOnes.map(x => itemLabel(x)), ...(giftIn && combo[GIFT_ID] == null ? ['선물식'] : [])]}
      {#if first.length}먼저 {first.join(', ')}{/if}{#if first.length && auto.length}{' · '}{/if}{#if auto.length}{auto.join(', ')} 중에서 알아서{/if}{' · 모자라면 메소마켓'}
    {/if}
  </p>
</div>

<style>
  .combo { display: grid; gap: 6px; min-width: 0; padding: 12px 14px; border-radius: var(--radius-md); background: var(--color-bg2); border: 1px solid var(--color-line); }
  .ch { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 10px; }
  .ch b { font-size: 13px; }
  .ch span { font-size: 11.5px; color: var(--color-tx3); }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) 110px 110px 24px; gap: 8px; align-items: center; font-size: 13px; }
  .nm { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; min-width: 0; }
  .nm small { font-size: 11px; color: var(--color-tx3); }
  .cap { justify-self: end; font: inherit; font-size: 11.5px; color: var(--color-tx3); }
  button.cap { appearance: none; cursor: pointer; padding: 3px 8px; border-radius: 8px; border: 1px dashed var(--color-line2); background: transparent; color: var(--color-tx2); }
  button.cap:hover { border-color: var(--color-lav); color: var(--color-tx); }
  .x { appearance: none; border: 0; background: none; cursor: pointer; color: var(--color-tx3); font-size: 15px; border-radius: 6px; padding: 2px 4px; }
  .x:hover { background: var(--color-panel3); color: var(--color-tx); }
  /* 펼친 목록은 브라우저가 그린다. 배경과 글자를 테마 색으로 직접 준다 */
  .addsel { justify-self: start; max-width: 100%; min-width: 0; font: inherit; font-size: 12.5px; padding: 6px 10px; border-radius: 9px; border: 1px dashed var(--color-line2); background: var(--color-panel); color: var(--color-tx); cursor: pointer; }
  .addsel option { background: var(--color-panel); color: var(--color-tx); }
  .addsel:hover, .addsel:focus { border-color: var(--color-lav); outline: none; }
  .sum { margin: 2px 0 0; font-size: 12px; color: var(--color-tx2); }
  @media (max-width: 520px) {
    .row { grid-template-columns: minmax(0, 1fr) 100px 24px; }
    .cap { grid-column: 1 / -1; grid-row: 2; justify-self: start; margin-top: -2px; }
  }
</style>
