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
   *
   * 목록은 사람마다 고른다. 처음에는 자주 쓰는 몇 가지만 있고, 나머지는 '아이템 추가'에서
   * 이름 일부를 치면 후보가 떠서 고른다. 없는 이름이면 그 자리에서 직접 만든다.
   * 빼기는 한 번에 되고 되돌릴 수 있다. 넣어 둔 가격은 남겨 둬서 다시 넣으면 그대로다.
   */
  import NumBox from './NumBox.svelte'
  import { type BuyItem, addBuy, ageOf, buyTotal, catalog, eff, pickItem, removeBuy, removeCustom, restoreCustom, saveCustom, saveEff, shopItems, touch, unpickItem, updateBuy } from '../eff.svelte'
  import { PG_ID, daysLabel, isShort, itemLabel, minPrice, type ShopItem } from '../core/efficiency'
  import { eul, won } from '../format'
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

  // ---- 추가: 이름 일부를 치면 후보가 뜬다. 없는 이름이면 직접 만든다 ----
  let adding = $state(false)
  let editing = $state<string | null>(null)
  let form = $state({ name: '', cash: 0, set: 1, days: 0 })
  let hi = $state(0)
  let nameEl = $state<HTMLInputElement>()
  const openAdd = () => { editing = null; form = { name: '', cash: 0, set: 1, days: 0 }; hi = 0; adding = true; queueMicrotask(() => nameEl?.focus()) }
  const openEdit = (x: ShopItem) => { editing = x.id; form = { name: x.name, cash: x.cash, set: x.set, days: x.days ?? 0 }; adding = true }
  const closeAdd = () => { adding = false; editing = null }
  // 띄어쓰기·괄호를 무시하고 찾는다: '원더베리11' → '위습의 원더베리(11개)'
  const norm = (t: string) => t.toLowerCase().replace(/[\s()]/g, '')
  const outside = $derived(catalog().filter(x => x.id !== PG_ID && !eff.picked.includes(x.id)))
  const q = $derived(norm(form.name))
  const cands = $derived(editing ? [] : outside.filter(x => norm(itemLabel(x)).includes(q)).slice(0, 8))
  const inList = $derived(!!q && items.some(x => norm(itemLabel(x)) === q || norm(x.name) === q))
  const known = $derived(!!q && outside.some(x => norm(itemLabel(x)) === q || norm(x.name) === q))
  // 후보에 없는 새 이름일 때만 캐시가·묶음·기간 칸을 연다
  const making = $derived(!!editing || (!!q && !inList && !known && !cands.length))
  const canSave = $derived(form.name.trim().length > 0 && form.cash > 0 && form.set >= 1)
  function choose(x: ShopItem) {
    pickItem(x.id)
    form.name = ''; hi = 0
    nameEl?.focus()
  }
  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') { closeAdd(); return }
    if (!cands.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); hi = (hi + 1) % cands.length }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hi = (hi - 1 + cands.length) % cands.length }
    else if (e.key === 'Enter') { e.preventDefault(); choose(cands[Math.min(hi, cands.length - 1)]) }
  }
  function submit(e: Event) {
    e.preventDefault()
    if (!making || !canSave) return
    // 캐시가나 묶음 개수가 바뀌면 전에 넣은 경매장 가격은 다른 물건 값이라 비운다
    const old = editing ? items.find(x => x.id === editing) : null
    if (old && (old.cash !== Math.round(form.cash) || old.set !== Math.max(1, Math.round(form.set)))) delete eff.prices[old.id]
    saveCustom({ name: form.name.trim(), cash: Math.round(form.cash), set: Math.max(1, Math.round(form.set)), ...(form.days ? { days: form.days } : {}) }, editing ?? undefined)
    if (editing) closeAdd()
    else { form = { name: '', cash: 0, set: 1, days: 0 }; nameEl?.focus() }
  }

  // ---- 빼기: 확인 창 대신 바로 빼고 잠깐 되돌리기를 띄운다 ----
  type Undo = { text: string; undo: () => void }
  let undo = $state<Undo | null>(null)
  let undoTimer: number | undefined
  const offer = (u: Undo) => { undo = u; clearTimeout(undoTimer); undoTimer = window.setTimeout(() => (undo = null), 7000) }
  function drop(x: ShopItem) {
    unpickItem(x.id)
    offer({ text: `${itemLabel(x)}${eul(itemLabel(x).replace(/\)$/, ''))} 목록에서 뺐어요. 다시 추가하면 입력값이 그대로 돌아와요.`, undo: () => pickItem(x.id) })
  }
  function forget(x: ShopItem) {
    const was = eff.picked.includes(x.id)
    const r = removeCustom(x.id)
    if (r) offer({ text: `내가 추가한 ${itemLabel(x)}${eul(itemLabel(x).replace(/\)$/, ''))} 지웠어요.`, undo: () => restoreCustom(r, was) })
  }
  const lossCount = $derived(rows.filter(x => zone(x) === 'down').length)
  const shown = $derived(eff.hideLoss ? rows.filter(x => zone(x) !== 'down') : rows)
  const zone = (x: ShopItem) => x.id === PG_ID ? 'base' : !effOf(x) ? 'none' : effOf(x) >= 1 ? 'up' : 'down'

  // 메소마켓도 같은 잣대로: 캐시 1원당 메소를 플가와 견준다
  const mkEff = $derived(pg && eff.mk ? (1 / eff.mk) / (pg * (1 - fee) / pgItem.cash) : 0)
  const setPrice = (id: string, v: number) => { if (v) eff.prices[id] = v; else delete eff.prices[id]; touch(`p:${id}`); saveEff() }
  /** 주당 최대 구매(회전율). 0이나 비우면 제한 없음 */
  const setCap = (id: string, v: number) => { if (v > 0) eff.caps[id] = Math.round(v); else delete eff.caps[id]; saveEff() }
  const fx = (v: number) => (Math.round(v * 100) / 100).toFixed(2)
  /** 플가의 회수율. 효율 e인 아이템의 회수율은 그 e배다(캐시 1원어치를 팔아 받는 돈) */
  const pgRate = $derived(pg && eff.um ? pg * (1 - fee) * eff.um / pgItem.cash : 0)
  const VIEWS = { ratio: '플가 몇 개', price: '플가 가격으로', rate: '회수율' } as const
  const head = $derived(({ ratio: '플가 대비', price: '플가로 치면', rate: '회수율' } as const)[eff.pgView])
  const pct = (e: number) => pgRate ? `${(e * pgRate * 100).toFixed(1)}%` : '—'
  /** 효율 칸: 몇 플가인지, 플가를 얼마에 판 셈인지, 회수율 */
  const cell = (e: number) => eff.pgView === 'ratio' ? `${e.toFixed(2)}플가` : eff.pgView === 'price' ? `${fx(pg * e)}억` : pct(e)
  // 말풍선에는 나머지 둘을 보여 준다
  const other = (e: number) => [
    eff.pgView !== 'ratio' ? `${e.toFixed(2)}플가(플가보다 ${e >= 1 ? `${((e - 1) * 100).toFixed(1)}% 이득` : `${((1 - e) * 100).toFixed(1)}% 손해`})` : '',
    eff.pgView !== 'price' ? `플가를 ${fx(pg * e)}억에 판 셈` : '',
    eff.pgView !== 'rate' && pgRate ? `회수율 ${pct(e)}` : '',
  ].filter(Boolean).join(' · ')

  // ---- 탭: MVP작용(사서 팔아 회수) / 구매용(실제로 쓸 것, 회수 없음) ----
  // 구매용은 이름과 캐시 가격만 적는다. 첫 결제 주부터 차례로 빼고 남은 금액으로 MVP작을 짠다 (2026-10-04 건의)
  let tab = $state<'mvp' | 'buy'>('mvp')
  let buyForm = $state({ name: '', cash: 0 })
  let buyEditing = $state<string | null>(null)
  let buyNameEl = $state<HTMLInputElement>()
  const buyQ = $derived(norm(buyForm.name))
  // 캐시샵 이름 일부를 치면 후보가 떠서 캐시가를 채워 준다. 없는 이름이면 금액을 직접 적는다
  const buyCands = $derived(buyQ && !buyEditing ? catalog().filter(x => norm(itemLabel(x)).includes(buyQ) && norm(itemLabel(x)) !== buyQ).slice(0, 6) : [])
  const canBuy = $derived(buyForm.name.trim().length > 0 && buyForm.cash > 0)
  const chooseBuy = (x: ShopItem) => { buyForm = { name: itemLabel(x), cash: x.cash } }
  const editBuy = (b: BuyItem) => { buyEditing = b.id; buyForm = { name: b.name, cash: b.cash }; queueMicrotask(() => buyNameEl?.focus()) }
  const cancelBuy = () => { buyEditing = null; buyForm = { name: '', cash: 0 } }
  function submitBuy(e: Event) {
    e.preventDefault()
    if (!canBuy) return
    const x = { name: buyForm.name.trim(), cash: Math.round(buyForm.cash) }
    if (buyEditing) updateBuy(buyEditing, x); else addBuy(x)
    cancelBuy()
    buyNameEl?.focus()
  }
</script>

<article class="card">
  <div class="tabs-head">
    <h3 class="card-title"><span class="n">4</span>아이템</h3>
    <div class="ef-seg tabs" role="tablist" aria-label="아이템 목록">
      <button role="tab" aria-pressed={tab === 'mvp'} aria-selected={tab === 'mvp'} onclick={() => (tab = 'mvp')}>MVP작용 아이템</button>
      <button role="tab" aria-pressed={tab === 'buy'} aria-selected={tab === 'buy'} onclick={() => (tab = 'buy')}>구매용 아이템{#if eff.buys.length}<span class="cnt">{eff.buys.length}</span>{/if}</button>
    </div>
  </div>

  {#if tab === 'mvp'}
  <p class="ef-hint tabhint">플가 기준 가격표 · 가격은 경매장 한 번 판매 기준(묶음이면 묶음 전체). 사서 경매장에 팔아 회수하는 아이템이에요.</p>

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
        <label class="view" use:tip={'회수율: 수수료 빼고 받는 메소를 엄 시세로 바꾼 돈 ÷ 캐시가'}>
          효율 보기
          <select bind:value={eff.pgView} onchange={saveEff}>
            {#each Object.entries(VIEWS) as [k, t] (k)}<option value={k}>{t}</option>{/each}
          </select>
        </label>
      </div>
      {#if eff.listNews}
        <div class="news" role="note">
          <span><b>새로 생겼어요</b> 필요 없는 아이템은 줄 오른쪽 <b>×</b>로 목록에서 뺄 수 있어요. 넣어 둔 가격은 남아서, <b>아이템 추가</b>에서 다시 넣으면 그대로 돌아와요.</span>
          <button type="button" onclick={() => { eff.listNews = false; saveEff() }}>알겠어요</button>
        </div>
      {/if}
      <div class="tbl">
        <table>
          <thead><tr><th>아이템</th><th>캐시가</th><th use:tip={'한 주에 팔 수 있는(그래서 살) 최대 개수예요. 하루에 팔리는 개수 × 7. 비우면 제한 없음'}>주당 최대 구매</th><th>이 가격 넘으면 플가보다 이득</th><th>경매장 실제 가격</th><th>{head}</th></tr></thead>
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
                    {#if x.id !== PG_ID}
                      <span class="acts">
                        {#if x.custom}
                          <button type="button" onclick={() => openEdit(x)} aria-label="{itemLabel(x)} 고치기" use:tip={'고치기'}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                          </button>
                        {/if}
                        <button type="button" class="out" onclick={() => drop(x)} aria-label="{itemLabel(x)} 목록에서 빼기" use:tip={'목록에서 빼기'}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                        </button>
                      </span>
                    {/if}
                  </span>
                </td>
                <td class="mono c-cash">{won(x.cash)}</td>
                <td class="c-cap">
                  <NumBox id="eff-cap-{x.id}" label="{itemLabel(x)} 주당 최대 구매" size="sm" unit={eff.caps[x.id] ? (x.set > 1 ? '세트' : '개') : ''} placeholder="제한 없음"
                    value={eff.caps[x.id] ?? 0} set={v => setCap(x.id, v)} />
                </td>
                <td class="mono min c-min">{x.id === PG_ID ? '—' : pg ? `${fx(minPrice(pg, x.cash))}억` : '—'}</td>
                <td class="in c-price">
                  {#if x.id === PG_ID}
                    <span class="pgin">{pg ? `${pg}억` : '—'}<small>플가 칸에서 입력</small></span>
                  {:else}
                    <NumBox id="eff-p-{x.id}" label="{itemLabel(x)} 경매장 가격(억)" size="sm" decimal unit="억"
                      placeholder={pg ? fx(minPrice(pg, x.cash)) : ''} value={eff.prices[x.id] ?? 0}
                      set={v => setPrice(x.id, v)} onfocus={hold} onblur={release} />
                  {/if}
                </td>
                <td class="mono eff c-eff">
                  {#if e}<span use:tip={other(e)}>{cell(e)}</span>{:else}—{/if}
                </td>
              </tr>
            {/each}
            {#if eff.hideLoss && lossCount}
              <tr class="folded"><td colspan="6">
                <button type="button" onclick={() => { eff.hideLoss = false; saveEff() }}>플가보다 손해인 아이템 {lossCount}개를 접어 뒀어요 · 펼치기</button>
              </td></tr>
            {/if}
            <tr class="mk">
              <td><span class="name mkn">메소마켓<small>메이플포인트로 사서 메소마켓에 팔기</small></span></td>
              <td class="mono c-cash">—</td><td class="mono c-cap">—</td><td class="mono c-min">—</td><td class="ef-hint r c-price">3번 칸의 시세로</td>
              <td class="mono eff c-eff" class:up={mkEff >= 1} class:down={mkEff > 0 && mkEff < 1}>
                {#if mkEff}<span use:tip={other(mkEff)}>{cell(mkEff)}</span>{:else}—{/if}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {#if undo}
        <div class="undo" role="status">
          <span>{undo.text}</span>
          <button type="button" onclick={() => { undo?.undo(); undo = null }}>되돌리기</button>
        </div>
      {/if}

      {#if adding}
        <form class="add" onsubmit={submit}>
          <b class="at">{editing ? '직접 만든 아이템 고치기' : '아이템 추가'}</b>
          <div class="ef-field nm2">
            <label for="eff-add-name">이름 {#if !editing}<span class="u">일부만 쳐도 후보가 떠요</span>{/if}</label>
            <input id="eff-add-name" class="txt" type="text" autocomplete="off" placeholder={editing ? '' : '예: 원더베리, 로얄, 골드 애플'}
              bind:this={nameEl} bind:value={form.name} maxlength="40" oninput={() => (hi = 0)} onkeydown={keys}
              role="combobox" aria-expanded={cands.length > 0} aria-controls="eff-add-list" aria-autocomplete="list" />
            {#if !editing && cands.length}
              <ul class="cands" id="eff-add-list" role="listbox">
                {#each cands as x, i (x.id)}
                  <li role="option" aria-selected={i === hi} class:on={i === hi}>
                    <button type="button" class="pick" onclick={() => choose(x)} onmouseenter={() => (hi = i)}>
                      <span>{itemLabel(x)}</span>
                      <em class="tag" class:short={isShort(x)} class:forever={!x.days}>{daysLabel(x)}</em>
                      {#if x.custom}<em class="tag mine">내가 추가</em>{/if}
                      <span class="c mono">{won(x.cash)}캐시</span>
                      {#if eff.prices[x.id]}<span class="c mono">· {eff.prices[x.id]}억</span>{/if}
                    </button>
                    {#if x.custom}
                      <button type="button" class="forget" onclick={() => forget(x)} aria-label="{itemLabel(x)} 아예 지우기" use:tip={'내가 추가한 아이템을 아예 지워요'}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
                      </button>
                    {/if}
                  </li>
                {/each}
              </ul>
            {:else if !editing && inList}
              <span class="ef-hint">이미 목록에 있어요.</span>
            {:else if !editing && !q && !outside.length}
              <span class="ef-hint">프리셋은 모두 목록에 있어요. 새 이름을 치면 직접 만들 수 있어요.</span>
            {/if}
          </div>
          {#if making}
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
          {/if}
          <div class="btns">
            <button type="button" class="btn" onclick={closeAdd}>{making ? '취소' : '닫기'}</button>
            {#if making}<button type="submit" class="btn primary" disabled={!canSave}>{editing ? '고치기' : '새로 만들어 추가'}</button>{/if}
          </div>
          {#if making}
            <p class="ef-hint wide">
              {#if canSave && pg}이 가격이면 플가 기준가는 <b>{fx(minPrice(pg, form.cash))}억</b>이에요. 추가한 뒤 경매장 실제 가격을 넣으면 계산에 들어가요.{:else}후보에 없는 이름이에요. 캐시 가격을 넣으면 새로 만들어요. 다음부터는 후보에 떠요.{/if}
            </p>
          {/if}
        </form>
      {:else}
        <button class="addbtn" onclick={openAdd}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          아이템 추가{#if outside.length}<span class="more">{outside.length}개 더 있어요</span>{/if}
        </button>
      {/if}
    </div>
  </div>
  <p class="ef-hint">흐린 숫자가 기준이에요. 경매장에서 확인한 실제 가격을 넣으면(기준보다 높아도, 낮아도) 그 값으로 계산하고, 칸을 벗어나면 효율 순으로 다시 줄 서요. 비워 둔 아이템은 계산에서 빠져요. 효율 칸에 마우스를 올리면 다른 보기 값도 나와요. 목록에서 뺀 아이템은 계산에서도 빠져요.</p>
  {:else}
  <!-- 구매용: 실제로 쓸 아이템. 결제액에는 들지만 팔지 않으니 회수가 없다. 표 규칙(폰에서 카드로 접히는 것)을 안 타게 표 대신 목록으로 -->
  <div class="buytab">
    <p class="ef-hint">실제로 쓰려고 사는 아이템(모멘텀 패스 등)이에요. <b>결제액에는 들어가지만 팔지 않으니 회수가 없어요.</b> 첫 결제 주부터 차례로 빼고, 남은 금액으로만 MVP작 조합을 짜요. 효율도 MVP작 몫만 봐요.</p>
    {#if eff.buys.length}
      <div class="buylist" role="list">
        {#each eff.buys as b (b.id)}
          <div class="buyrow" role="listitem" class:editing={buyEditing === b.id}>
            <span class="bn">{b.name}</span>
            <span class="mono bc">{won(b.cash)}<small>캐시</small></span>
            <span class="acts">
              <button type="button" onclick={() => editBuy(b)} aria-label="{b.name} 고치기" use:tip={'고치기'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
              </button>
              <button type="button" class="out" onclick={() => removeBuy(b.id)} aria-label="{b.name} 빼기" use:tip={'빼기'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </span>
          </div>
        {/each}
        <div class="buyrow sum"><span class="bn">합계</span><span class="mono bc">{won(buyTotal())}<small>캐시</small></span><span></span></div>
      </div>
    {:else}
      <p class="ef-hint none">아직 없어요. 아래에 이름과 캐시 가격을 넣으면 그만큼을 MVP작에서 빼요.</p>
    {/if}
    <form class="add buyadd" onsubmit={submitBuy}>
      <b class="at">{buyEditing ? '구매용 아이템 고치기' : '구매용 아이템 추가'}</b>
      <div class="ef-field nm2">
        <label for="eff-buy-name">이름 <span class="u">캐시샵 이름 일부를 치면 가격을 채워 줘요</span></label>
        <input id="eff-buy-name" class="txt" type="text" autocomplete="off" placeholder="예: 모멘텀 패스" maxlength="40"
          bind:this={buyNameEl} bind:value={buyForm.name} onkeydown={e => e.key === 'Escape' && cancelBuy()} />
        {#if buyCands.length}
          <ul class="cands" role="listbox">
            {#each buyCands as x (x.id)}
              <li role="option" aria-selected="false"><button type="button" class="pick" onclick={() => chooseBuy(x)}><span>{itemLabel(x)}</span><span class="c mono">{won(x.cash)}캐시</span></button></li>
            {/each}
          </ul>
        {/if}
      </div>
      <div class="ef-field">
        <label for="eff-buy-cash">캐시 가격</label>
        <NumBox id="eff-buy-cash" label="구매용 캐시 가격" unit="캐시" placeholder="예: 29,800" value={buyForm.cash} set={v => (buyForm.cash = v)} />
      </div>
      <div class="btns">
        {#if buyEditing}<button type="button" class="btn" onclick={cancelBuy}>취소</button>{/if}
        <button type="submit" class="btn primary" disabled={!canBuy}>{buyEditing ? '고치기' : '추가'}</button>
      </div>
    </form>
  </div>
  {/if}
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
  .view { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; color: var(--color-tx3); cursor: help; }
  .view select {
    font: inherit; font-size: 12.5px; color: var(--color-tx); padding: 4px 8px; border-radius: 8px; cursor: pointer;
    background: var(--color-bg2); border: 1px solid var(--color-line);
  }
  .view select:focus { outline: none; border-color: var(--color-lav); }
  .hide { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: var(--color-tx2); }
  .hide input { accent-color: var(--color-lav); margin: 0; }
  .folded td { text-align: center; padding: 4px; background: var(--color-bg2); }
  .folded button { appearance: none; border: 0; background: none; cursor: pointer; font: inherit; font-size: 12px; color: var(--color-tx3); padding: 4px 10px; border-radius: 8px; }
  .folded button:hover { color: var(--color-tx); background: var(--color-panel3); }
  .tbl { overflow-x: auto; border-radius: var(--radius-md); border: 1px solid var(--color-line); }
  table { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 13px; }
  th { font-weight: 500; font-size: 11.5px; color: var(--color-tx3); text-align: right; padding: 8px 10px; background: var(--color-bg2); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  /* 화면 배율(1.2) 때문에 1px 테두리가 칸마다 다르게 반올림돼 끊겨 보인다. 그림자로 그어 칸마다 똑같이 보이게 한다 */
  td { --sep: inset 0 1px 0 var(--color-line); padding: 6px 10px; box-shadow: var(--sep); text-align: right; white-space: nowrap; }
  td.in { width: 128px; }
  td.c-cap { width: 118px; }
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
  tr.up td:first-child { box-shadow: var(--sep), inset 3px 0 0 var(--color-mint); }
  tr.up .eff { color: var(--color-mint); }
  tr.down td { background: color-mix(in oklab, var(--color-peach) 6%, transparent); }
  tr.down td:first-child { box-shadow: var(--sep), inset 3px 0 0 var(--color-peach); }
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
  /* 빼기 단추는 줄에 마우스를 올렸을 때만 또렷하게. 손가락 화면은 늘 보인다 */
  .acts .out { opacity: .55; }
  tr:hover .acts .out, .acts .out:focus-visible { opacity: 1; }
  .acts .out:hover { color: var(--color-bad); }
  @media (hover: none) { .acts .out { opacity: .8; } }
  .undo {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 12px; border-radius: 10px;
    font-size: 12.5px; color: var(--color-tx2); background: var(--color-panel3); border: 1px solid var(--color-line2);
  }
  .undo button { appearance: none; border: 0; cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--color-lav); background: none; padding: 2px 6px; border-radius: 6px; }
  .undo button:hover { background: color-mix(in oklab, var(--color-lav) 14%, transparent); }
  .news {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 9px 12px; border-radius: 10px;
    font-size: 12.5px; color: var(--color-tx2); line-height: 1.5;
    background: color-mix(in oklab, var(--color-lav) 12%, transparent); border: 1px solid color-mix(in oklab, var(--color-lav) 40%, transparent);
  }
  .news b { color: var(--color-lav); font-weight: 600; }
  .news button { appearance: none; border: 0; cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--color-on-accent); background: var(--color-lav); padding: 4px 12px; border-radius: 8px; }
  .addbtn .more { font-size: 11.5px; color: var(--color-tx3); margin-left: 4px; }
  .cands {
    list-style: none; margin: 4px 0 0; padding: 4px; display: grid; gap: 1px; max-height: 280px; overflow-y: auto;
    border-radius: 10px; background: var(--color-panel); border: 1px solid var(--color-line2);
  }
  .cands li { display: flex; align-items: center; border-radius: 8px; }
  .cands li.on { background: color-mix(in oklab, var(--color-lav) 14%, transparent); }
  .cands .pick {
    flex: 1; min-width: 0; appearance: none; border: 0; background: none; cursor: pointer; font: inherit; font-size: 13px; color: var(--color-tx);
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 7px 10px; text-align: left;
  }
  .cands .c { font-size: 11.5px; color: var(--color-tx3); }
  .cands .forget { appearance: none; border: 0; background: none; cursor: pointer; width: 28px; height: 28px; border-radius: 6px; display: grid; place-items: center; color: var(--color-tx3); }
  .cands .forget:hover { color: var(--color-bad); background: var(--color-panel3); }
  .cands .forget svg { width: 14px; height: 14px; }
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

  /* 탭 머리: 제목 왼쪽, 탭 오른쪽. 좁으면 줄바꿈 */
  .tabs-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .tabs .cnt { margin-left: 6px; padding: 0 7px; border-radius: 999px; font-family: var(--font-mono); font-size: 11px; background: var(--color-lav); color: var(--color-on-accent); }
  .tabhint { margin: -4px 0 0; }
  /* 구매용 탭. 'buy'는 위의 '구매' 뱃지 스타일과 이름이 겹쳐 탭 전체가 민트색으로 칠해졌다. 다른 이름을 쓴다 */
  .buytab { display: grid; gap: 12px; }
  .buytab .none { padding: 10px 2px; }
  .buylist { display: grid; border-radius: var(--radius-md); border: 1px solid var(--color-line); overflow: hidden; }
  .buyrow { display: grid; grid-template-columns: minmax(0, 1fr) auto 52px; align-items: center; gap: 10px; padding: 8px 12px; font-size: 13px; box-shadow: inset 0 1px 0 var(--color-line); }
  .buyrow:first-child { box-shadow: none; }
  .buyrow.editing { background: color-mix(in oklab, var(--color-lav) 10%, transparent); }
  .buyrow.sum { background: var(--color-bg2); font-weight: 600; }
  .buyrow .bn { min-width: 0; overflow-wrap: anywhere; }
  .buyrow .bc { text-align: right; }
  .buyrow .bc small { font-family: var(--font-sans); font-size: 11px; color: var(--color-tx3); margin-left: 3px; }
  .buyrow .acts { justify-self: end; }
  .buyadd { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) auto; }
  .buyadd .btns { align-self: end; }

  /* 패드: 표 그대로 두되 이름·머리글이 줄바꿈되게 해서 가격 칸까지 화면 안에 넣는다 */
  @media (min-width: 673px) and (max-width: 1295px) {
    table { min-width: 0; }
    th { white-space: normal; }
    td:first-child { white-space: normal; }
    .name { flex-wrap: wrap; row-gap: 3px; }
    td.in { width: 112px; }
    td.c-cap { width: 104px; }
  }

  /*
   * 폰: 표를 줄마다 카드로 바꾼다. 다섯 칸을 한 줄에 두면 가격 칸이 화면 밖으로 밀린다.
   *   이름 (한 줄 다)
   *   캐시 5,400 | 이득 기준 2.75억
   *   주당 최대 칸 | 가격 칸 | 효율
   * 칸은 순서가 아니라 이름(c-…)으로 둔다. 칸이 늘어도 자리가 밀리지 않는다
   */
  @media (max-width: 672px) {
    table { min-width: 0; }
    thead { display: none; }
    tbody { display: grid; }
    tr { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 72px; column-gap: 8px; row-gap: 4px; align-items: center; padding: 9px 10px; box-shadow: inset 0 1px 0 var(--color-line); }
    tbody tr:first-child { box-shadow: none; }
    td, tr.up td, tr.down td, tr.base td, tr.mk td { padding: 0; background: none; border: 0; box-shadow: none; }
    tr.up td:first-child, tr.down td:first-child, tr.base td:first-child { box-shadow: none; }
    td:first-child { grid-column: 1 / -1; white-space: normal; margin-bottom: 2px; }
    .name { flex-wrap: wrap; row-gap: 3px; }
    td.c-cash, td.c-min { text-align: left; font-size: 11.5px; color: var(--color-tx3); }
    td.c-cash { grid-column: 1; grid-row: 2; }
    td.c-min { grid-column: 2 / -1; grid-row: 2; }
    td.c-cash::before { content: '캐시 '; font-family: var(--font-sans); }
    td.c-min::before { content: '이득 기준 '; font-family: var(--font-sans); }
    td.c-cap { grid-column: 1; grid-row: 3; width: auto; }
    td.c-price { grid-column: 2; grid-row: 3; width: auto; }
    td.c-eff { grid-column: 3; grid-row: 3; }
    tr.base td.c-price { grid-row: 2; grid-column: 1 / 3; text-align: left; }
    tr.base td.c-eff { grid-row: 2; }
    tr.base td.c-cap { grid-row: 3; }
    tr.base td.c-cash { display: none; }
    .pgin { justify-items: start; }
    tr.base td.c-min, tr.mk td.c-cash, tr.mk td.c-min, tr.mk td.c-cap { display: none; }
    tr.mk td.c-price { grid-row: 2; grid-column: 1 / 3; font-size: 11.5px; text-align: left; }
    tr.mk td.c-eff { grid-row: 2; }
    tr.folded { display: block; padding: 4px; }
    tr.up { background: color-mix(in oklab, var(--color-mint) 7%, transparent); box-shadow: inset 0 1px 0 var(--color-line), inset 3px 0 0 var(--color-mint); }
    tr.down { background: color-mix(in oklab, var(--color-peach) 6%, transparent); box-shadow: inset 0 1px 0 var(--color-line), inset 3px 0 0 var(--color-peach); }
    tr.base { background: color-mix(in oklab, var(--color-lav) 12%, transparent); box-shadow: inset 0 0 0 2px var(--color-lav); }
    tr.mk { background: color-mix(in oklab, var(--color-sky) 6%, transparent); }
  }
  .add input.txt::placeholder { color: var(--color-tx3); }
  @media (max-width: 912px) { .add { grid-template-columns: 1fr 1fr; } .add .nm2 { grid-column: 1 / -1; } }
</style>
