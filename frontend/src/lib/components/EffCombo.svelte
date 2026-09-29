<script lang="ts">
  /**
   * 직접 짜기: 쓸 아이템을 고르고, 개수를 정할 아이템만 개수를 적는다.
   *   개수를 적은 아이템 → 그 개수를 먼저 산다(주당 최대를 넘으면 주당 최대로 자른다)
   *   비워 둔 아이템(제한 없음) → 주당 최대 안에서 알아서 고른다
   *   모자라는 금액 → 메소마켓
   * 조합에 넣지 않은 아이템은 쓰지 않는다
   */
  import NumBox from './NumBox.svelte'
  import { eff, saveEff, sellables, type Combo } from '../eff.svelte'
  import { countLabel, itemLabel } from '../core/efficiency'
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
  function drop(k: string) { delete combo[k]; saveEff() }
</script>

<div class="combo">
  <div class="ch"><b>{title}</b><span>개수를 적은 아이템부터 사고, 비워 둔 아이템은 알아서 골라요. 모자라면 메소마켓</span></div>
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
  {#if rest.length}
    <select class="addsel" value="" onchange={e => { const v = e.currentTarget.value; if (v) add(v); e.currentTarget.value = '' }} aria-label="직접 짜기에 아이템 넣기">
      <option value="">+ 아이템 넣기</option>
      {#each rest as x (x.id)}<option value={x.id}>{itemLabel(x)} · {won(x.cash)}캐시</option>{/each}
    </select>
  {/if}
  <p class="sum">
    {#if !items.length}4번 가격표에 경매장 가격을 넣은 아이템만 고를 수 있어요.
    {:else if !chosen.length}아직 넣은 아이템이 없어요. 전부 메소마켓으로 계산해요.
    {:else}
      {#if fixedOnes.length}먼저 {fixedOnes.map(x => `${itemLabel(x)} ${countLabel(x, combo[x.id]!)}`).join(', ')}{/if}{#if fixedOnes.length && autoOnes.length}{' · '}{/if}{#if autoOnes.length}{autoOnes.map(x => itemLabel(x)).join(', ')} 중에서 알아서{/if}{' · 모자라면 메소마켓'}
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
