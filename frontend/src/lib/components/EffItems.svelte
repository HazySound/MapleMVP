<script lang="ts">
  /**
   * 4. 플가 기준 가격표.
   *
   * 플가 가격 하나로 다른 아이템마다 '이 가격 넘으면 플가보다 이득'인 기준을 잡는다.
   * 기준은 기준일 뿐이라 실제 경매장 가격은 언제든 넣을 수 있고(높게도 낮게도),
   * 넣은 값으로 효율과 순서가 바뀐다. 비워 둔 아이템은 계산에서 뺀다.
   *
   * 목록에는 플가도 한 줄로 들어가 경계선 노릇을 한다. 위는 플가보다 이득, 아래는 손해.
   * 플가 가격은 기준이라 왼쪽에서만 넣는다.
   */
  import NumBox from './NumBox.svelte'
  import { ageOf, eff, removeCustom, saveCustom, saveEff, shopItems, touch } from '../eff.svelte'
  import { PG_ID, daysLabel, isShort, itemLabel, minPrice, type ShopItem } from '../core/efficiency'
  import { won } from '../format'
  import { tip } from '../tip'

  let { fee, used }: { fee: number; used: Set<string> } = $props()

  const items = $derived(shopItems())
  const pgItem = $derived(items.find(x => x.id === PG_ID)!)
  const others = $derived(items.filter(x => x.id !== PG_ID))
  const pg = $derived(eff.prices[PG_ID] ?? 0)

  const effOf = (x: ShopItem) => {
    if (x.id === PG_ID) return pg ? 1 : 0
    const p = eff.prices[x.id] ?? 0, m = minPrice(pg, x.cash)
    return p && m ? p / m : 0
  }
  // 가격을 넣은 것(플가 포함) → 효율 높은 순, 그다음 비워 둔 것은 비싼 순.
  // 플가 가격을 바꾸면 곧바로 다시 줄 선다. 표 안의 가격 칸에 치는 동안에만 줄이 움직이지 않게 붙잡아 둔다
  const sorted = () => {
    const known = items.filter(x => effOf(x) > 0).sort((a, b) => effOf(b) - effOf(a) || (a.id === PG_ID ? -1 : b.id === PG_ID ? 1 : 0))
    const rest = others.filter(x => effOf(x) === 0).sort((a, b) => b.cash - a.cash)
    return [...(pg ? [] : [pgItem]), ...known, ...rest].map(x => x.id)
  }
  const live = $derived(sorted())
  let frozen = $state<string[] | null>(null)
  const hold = () => { frozen = [...live] }
  const release = () => { frozen = null }
  const order = $derived(frozen ?? live)
  // 붙잡아 둔 사이에 추가한 아이템은 맨 아래에 붙인다. 지운 것은 빠진다
  const rows = $derived([...order, ...items.map(x => x.id).filter(id => !order.includes(id))]
    .map(id => items.find(x => x.id === id)).filter(x => !!x))

  // ---- 직접 추가 ----
  let adding = $state(false)
  let editing = $state<string | null>(null)
  let form = $state({ name: '', cash: 0, set: 1, days: 0 })
  const openAdd = () => { editing = null; form = { name: '', cash: 0, set: 1, days: 0 }; adding = true }
  const openEdit = (x: ShopItem) => { editing = x.id; form = { name: x.name, cash: x.cash, set: x.set, days: x.days ?? 0 }; adding = true }
  const canSave = $derived(form.name.trim().length > 0 && form.cash > 0 && form.set >= 1)
  function submit(e: Event) {
    e.preventDefault()
    if (!canSave) return
    // 캐시가나 묶음 개수가 바뀌면 전에 넣은 경매장 가격은 다른 물건 값이라 비운다
    const old = editing ? items.find(x => x.id === editing) : null
    if (old && (old.cash !== Math.round(form.cash) || old.set !== Math.max(1, Math.round(form.set)))) delete eff.prices[old.id]
    saveCustom({ name: form.name.trim(), cash: Math.round(form.cash), set: Math.max(1, Math.round(form.set)), ...(form.days ? { days: form.days } : {}) }, editing ?? undefined)
    adding = false; editing = null
  }
  const lossCount = $derived(rows.filter(x => zone(x) === 'down').length)
  const shown = $derived(eff.hideLoss ? rows.filter(x => zone(x) !== 'down') : rows)
  const zone = (x: ShopItem) => x.id === PG_ID ? 'base' : !effOf(x) ? 'none' : effOf(x) >= 1 ? 'up' : 'down'

  // 메소마켓도 같은 잣대로: 캐시 1원당 메소를 플가와 견준다
  const mkEff = $derived(pg && eff.mk ? (1 / eff.mk) / (pg * (1 - fee) / pgItem.cash) : 0)
  const setPrice = (id: string, v: number) => { if (v) eff.prices[id] = v; else delete eff.prices[id]; touch(`p:${id}`); saveEff() }
  const fx = (v: number) => (Math.round(v * 100) / 100).toFixed(2)
  const showRatio = $derived(eff.pgView === 'ratio')
  /** 효율 칸: 몇 플가인지, 또는 플가를 얼마에 판 셈인지 */
  const cell = (e: number) => showRatio ? `${e.toFixed(2)}플가` : `${fx(pg * e)}억`
  const other = (e: number) => showRatio ? `플가를 ${fx(pg * e)}억에 판 것과 같아요` : `${e.toFixed(2)}플가 · 플가보다 ${e >= 1 ? `${((e - 1) * 100).toFixed(1)}% 이득` : `${((1 - e) * 100).toFixed(1)}% 손해`}`
</script>

<article class="card">
  <h3 class="card-title"><span class="n">4</span>플가 기준 가격표 <span class="sub">가격은 경매장 한 번 판매 기준(묶음이면 묶음 전체)</span></h3>

  <div class="wrap">
    <div class="pg">
      <span class="nm">플래티넘 카르마의 가위</span>
      <span class="ef-hint">{won(pgItem.cash)}캐시 · 무기한 · 경매장 1개 가격</span>
      <NumBox id="eff-pg" label="플가 경매장 가격(억)" size="lg" decimal unit="억" placeholder="예: 3.0" value={pg}
        set={v => setPrice(PG_ID, v)} />
      <span class="ef-hint">
        {#if pg && eff.um}수수료 {Math.round(fee * 100)}% 빼고 1개당 <b>{won(pg * (1 - fee) * eff.um)}원</b> 회수 · 이 효율이 <b>1.00플가</b>{:else}플가 가격을 넣으면 다른 아이템의 기준 가격이 나와요{/if}
      </span>
      {#if ageOf(`p:${PG_ID}`)}<span class="ef-hint">{ageOf(`p:${PG_ID}`)}</span>{/if}
    </div>

    <div class="right">
      <div class="legend">
        <span><i class="up"></i>플가보다 이득</span>
        <span><i class="pgk"></i>플가(기준)</span>
        <span><i class="down"></i>플가보다 손해</span>
        <span><em class="buy">구매</em>지금 고른 루트에서 사는 아이템</span>
        <label class="hide"><input type="checkbox" bind:checked={eff.hideLoss} onchange={saveEff} />플가보다 손해인 것 숨기기{#if lossCount} ({lossCount}){/if}</label>
        <div class="ef-seg view" role="group" aria-label="플가 대비 보기">
          <button aria-pressed={showRatio} onclick={() => { eff.pgView = 'ratio'; saveEff() }}>플가 몇 개</button>
          <button aria-pressed={!showRatio} onclick={() => { eff.pgView = 'price'; saveEff() }}>플가 가격으로</button>
        </div>
      </div>
      <div class="tbl">
        <table>
          <thead><tr><th>아이템</th><th>캐시가</th><th>이 가격 넘으면 플가보다 이득</th><th>경매장 실제 가격</th><th>{showRatio ? '플가 대비' : '플가로 치면'}</th></tr></thead>
          <tbody>
            {#each shown as x (x.id)}
              {@const e = effOf(x)}
              {@const z = zone(x)}
              <tr class={z}>
                <td>
                  <span class="name">
                    {itemLabel(x)}
                    {#if x.id === PG_ID}<em class="tag pgt">기준</em>{/if}
                    <em class="tag" class:short={isShort(x)} class:forever={!x.days}
                      use:tip={x.days ? `받은 뒤 ${x.days}일 안에 써야 해요. ${isShort(x) ? '오래 들고 기다리기 어려워요' : '조금은 기다려 볼 수 있어요'}` : '기간이 없어서 값이 오를 때까지 들고 있을 수 있어요'}>{daysLabel(x)}</em>
                    {#if x.until}<em class="tag" use:tip={`캐시샵 판매는 ${Number(x.until.slice(5, 7))}월 ${Number(x.until.slice(8))}일까지`}>~{Number(x.until.slice(5, 7))}/{Number(x.until.slice(8))}</em>{/if}
                    {#if x.custom}<em class="tag mine">내가 추가</em>{/if}
                    {#if used.has(x.id)}<em class="buy">구매</em>{/if}
                    {#if x.custom}
                      <span class="acts">
                        <button type="button" onclick={() => openEdit(x)} aria-label="{itemLabel(x)} 고치기" use:tip={'고치기'}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                        </button>
                        <button type="button" onclick={() => removeCustom(x.id)} aria-label="{itemLabel(x)} 지우기" use:tip={'지우기'}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                        </button>
                      </span>
                    {/if}
                  </span>
                </td>
                <td class="mono">{won(x.cash)}</td>
                <td class="mono min">{x.id === PG_ID ? '—' : pg ? `${fx(minPrice(pg, x.cash))}억` : '—'}</td>
                <td class="in">
                  {#if x.id === PG_ID}
                    <span class="pgin">{pg ? `${pg}억` : '—'}<small>왼쪽에서 입력</small></span>
                  {:else}
                    <NumBox id="eff-p-{x.id}" label="{itemLabel(x)} 경매장 가격(억)" size="sm" decimal unit="억"
                      placeholder={pg ? fx(minPrice(pg, x.cash)) : ''} value={eff.prices[x.id] ?? 0}
                      set={v => setPrice(x.id, v)} onfocus={hold} onblur={release} />
                  {/if}
                </td>
                <td class="mono eff">
                  {#if e}<span use:tip={other(e)}>{cell(e)}</span>{:else}—{/if}
                </td>
              </tr>
            {/each}
            {#if eff.hideLoss && lossCount}
              <tr class="folded"><td colspan="5">
                <button type="button" onclick={() => { eff.hideLoss = false; saveEff() }}>플가보다 손해인 아이템 {lossCount}개를 접어 뒀어요 · 펼치기</button>
              </td></tr>
            {/if}
            <tr class="mk">
              <td><span class="name mkn">메소마켓<small>메이플포인트로 사서 메소마켓에 팔기</small></span></td>
              <td class="mono">—</td><td class="mono">—</td><td class="ef-hint r">3번 칸의 시세로</td>
              <td class="mono eff" class:up={mkEff >= 1} class:down={mkEff > 0 && mkEff < 1}>
                {#if mkEff}<span use:tip={other(mkEff)}>{cell(mkEff)}</span>{:else}—{/if}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {#if adding}
        <form class="add" onsubmit={submit}>
          <b class="at">{editing ? '추가한 아이템 고치기' : '아이템 직접 추가'}</b>
          <div class="ef-field nm2">
            <label for="eff-add-name">이름</label>
            <input id="eff-add-name" class="txt" type="text" placeholder="예: 골드 애플" bind:value={form.name} maxlength="40" />
          </div>
          <div class="ef-field">
            <label for="eff-add-cash">캐시 가격 <span class="u">묶음이면 묶음 전체</span></label>
            <NumBox id="eff-add-cash" label="캐시 가격" unit="캐시" placeholder="예: 5,900" value={form.cash} set={v => (form.cash = v)} />
          </div>
          <div class="ef-field">
            <label for="eff-add-set">묶음 개수</label>
            <NumBox id="eff-add-set" label="묶음 개수" unit="개" placeholder="1" value={form.set} set={v => (form.set = v)} />
          </div>
          <div class="ef-field">
            <span class="lbl">사용 기간</span>
            <div class="ef-seg" role="group" aria-label="사용 기간">
              {#each [[0, '무기한'], [7, '7일'], [14, '14일'], [30, '30일']] as [v, t] (v)}
                <button type="button" aria-pressed={form.days === v} onclick={() => (form.days = v as number)}>{t}</button>
              {/each}
            </div>
          </div>
          <div class="btns">
            <button type="button" class="btn" onclick={() => { adding = false; editing = null }}>취소</button>
            <button type="submit" class="btn primary" disabled={!canSave}>{editing ? '고치기' : '추가'}</button>
          </div>
          <p class="ef-hint wide">
            {#if canSave && pg}이 가격이면 플가 기준가는 <b>{fx(minPrice(pg, form.cash))}억</b>이에요. 추가한 뒤 경매장 실제 가격을 넣으면 계산에 들어가요.{:else}이름과 캐시 가격을 넣으면 플가 기준가가 자동으로 붙어요. 이 브라우저에만 저장돼요.{/if}
          </p>
        </form>
      {:else}
        <button class="addbtn" onclick={openAdd}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          목록에 없는 아이템 직접 추가
        </button>
      {/if}
    </div>
  </div>
  <p class="ef-hint">흐린 숫자가 기준이에요. 경매장에서 확인한 실제 가격을 넣으면(기준보다 높아도, 낮아도) 그 값으로 계산하고, 칸을 벗어나면 효율 순으로 다시 줄 서요. 비워 둔 아이템은 계산에서 빠져요. 효율 칸에 마우스를 올리면 플가를 얼마에 판 셈인지(또는 몇 플가인지) 나와요.</p>
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
  .right { display: grid; gap: 8px; min-width: 0; }
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; font-size: 11.5px; color: var(--color-tx3); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 10px; height: 10px; border-radius: 3px; }
  .legend i.up { background: var(--color-mint); }
  .legend i.down { background: var(--color-peach); }
  .legend i.pgk { background: var(--color-lav); }
  .view { margin-left: auto; }
  .hide { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: var(--color-tx2); }
  .hide input { accent-color: var(--color-lav); margin: 0; }
  .folded td { text-align: center; padding: 4px; background: var(--color-bg2); }
  .folded button { appearance: none; border: 0; background: none; cursor: pointer; font: inherit; font-size: 12px; color: var(--color-tx3); padding: 4px 10px; border-radius: 8px; }
  .folded button:hover { color: var(--color-tx); background: var(--color-panel3); }
  .tbl { overflow-x: auto; border-radius: var(--radius-md); border: 1px solid var(--color-line); }
  table { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 13px; }
  th { font-weight: 500; font-size: 11.5px; color: var(--color-tx3); text-align: right; padding: 8px 10px; background: var(--color-bg2); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  td { padding: 6px 10px; border-top: 1px solid var(--color-line); text-align: right; white-space: nowrap; }
  td.in { width: 128px; }
  .name { display: inline-flex; align-items: center; gap: 6px; }
  .name small { display: block; font-size: 11px; color: var(--color-tx3); }
  .mkn { display: grid; gap: 0; }
  .tag { font-style: normal; font-size: 10.5px; padding: 0 6px; border-radius: 6px; background: var(--color-panel3); color: var(--color-tx3); cursor: default; }
  .tag.short { background: color-mix(in oklab, var(--color-sky) 20%, transparent); color: var(--color-sky); }
  .tag.forever { background: color-mix(in oklab, var(--color-mint) 16%, transparent); color: var(--color-mint); }
  .tag.mine { background: color-mix(in oklab, var(--color-butter) 20%, transparent); color: var(--color-butter); }
  .tag.pgt { background: color-mix(in oklab, var(--color-lav) 25%, transparent); color: var(--color-lav); }
  .buy { font-style: normal; font-size: 10.5px; font-weight: 600; padding: 0 6px; border-radius: 6px; background: var(--color-mint); color: var(--color-on-accent); }
  .min { color: var(--color-tx); }
  .eff { color: var(--color-tx3); }
  .eff span { cursor: help; border-bottom: 1px dotted currentColor; }

  /* 위는 이득, 아래는 손해. 기준인 플가 줄이 경계선이다 */
  tr.up td { background: color-mix(in oklab, var(--color-mint) 7%, transparent); }
  tr.up td:first-child { box-shadow: inset 3px 0 0 var(--color-mint); }
  tr.up .eff { color: var(--color-mint); }
  tr.down td { background: color-mix(in oklab, var(--color-peach) 6%, transparent); }
  tr.down td:first-child { box-shadow: inset 3px 0 0 var(--color-peach); }
  tr.down .eff { color: var(--color-peach); }
  tr.base td { background: color-mix(in oklab, var(--color-lav) 12%, transparent); border-top: 2px solid var(--color-lav); border-bottom: 2px solid var(--color-lav); }
  tr.base td:first-child { box-shadow: inset 3px 0 0 var(--color-lav); font-weight: 600; }
  tr.base .eff { color: var(--color-lav); }
  tr.none td { color: var(--color-tx3); }
  .pgin { display: inline-grid; justify-items: end; font-family: var(--font-mono); color: var(--color-tx); line-height: 1.2; }
  .pgin small { font-family: var(--font-sans); font-size: 10.5px; color: var(--color-tx3); }
  .mk td { background: color-mix(in oklab, var(--color-sky) 6%, transparent); }
  .mk .eff.up { color: var(--color-mint); }
  .mk .eff.down { color: var(--color-peach); }
  .r { text-align: right; }

  .acts { display: inline-flex; gap: 2px; margin-left: 2px; }
  .acts button { appearance: none; border: 0; background: none; cursor: pointer; width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; color: var(--color-tx3); }
  .acts button:hover { background: var(--color-panel3); color: var(--color-tx); }
  .acts svg { width: 13px; height: 13px; }
  .addbtn {
    appearance: none; cursor: pointer; font: inherit; font-size: 13px; color: var(--color-tx2);
    display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; border-radius: var(--radius-md);
    background: transparent; border: 1px dashed var(--color-line2); transition: border-color .2s, color .2s, background .2s;
  }
  .addbtn:hover { border-color: var(--color-lav); color: var(--color-tx); background: color-mix(in oklab, var(--color-lav) 6%, transparent); }
  .addbtn svg { width: 15px; height: 15px; }
  .add {
    display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) 110px auto; gap: 10px 12px; align-items: end;
    padding: 14px; border-radius: var(--radius-md); background: var(--color-bg2); border: 1px solid color-mix(in oklab, var(--color-lav) 40%, var(--color-line));
  }
  .add .at { grid-column: 1 / -1; font-size: 13px; }
  .add .btns { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
  .add .wide { grid-column: 1 / -1; margin: 0; }
  .add .u { font-size: 11px; opacity: .8; }
  .add input.txt {
    all: unset; box-sizing: border-box; width: 100%; padding: 6px 10px; border-radius: 10px; font-size: 14px; color: var(--color-tx);
    background: var(--color-panel); border: 1px solid var(--color-line); user-select: text;
  }
  .add input.txt:focus { border-color: var(--color-lav); }
  .add input.txt::placeholder { color: var(--color-tx3); }
  @media (max-width: 912px) { .add { grid-template-columns: 1fr 1fr; } .add .nm2 { grid-column: 1 / -1; } }
</style>
