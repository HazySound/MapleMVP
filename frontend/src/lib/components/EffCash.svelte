<script lang="ts">
  /** 2. 캐시는 얼마에 — 캐시 잔액, 상품권 할인과 남은 한도, 직접 추가한 결제수단, 바코드(이벤트 때만) */
  import NumBox from './NumBox.svelte'
  import { SHOP, addMethod, eff, removeMethod, saveEff, thisMonth, updateMethod, type PayMethod } from '../eff.svelte'
  import { LAST_KEY, plainRateOf, rateOf, unitName, type PlainMode } from '../core/efficiency'
  import { won } from '../format'

  const month = Number(thisMonth().slice(5))
  /** 결제수단 할인을 적는 방식. 칸 단위와 예시 */
  const MODES: { key: PlainMode; name: string; unit: string; ph: string }[] = [
    { key: 'off', name: '할인율', unit: '%', ph: '7' },
    { key: 'ratio', name: '실제 비율', unit: '%', ph: '93' },
    { key: 'per10k', name: '1만 캐시당 가격', unit: '원', ph: '9,300' },
  ]
  const modeOf = (k: PlainMode) => MODES.find(m => m.key === k) ?? MODES[0]
  /** 판매 단위. 100원은 끝자리까지 아무 금액 */
  const UNITS = [100, 1_000, 5_000, 10_000, 30_000, 50_000, 100_000]
  /** '최소 5만원 단위' */
  const minUnit = (u: number) => u > 100 ? `최소 ${unitName(u).slice(0, -1)} 단위` : '단위 없음 (아무 금액)'
  const bc = SHOP.barcode

  function note(disc: number) {
    const r = rateOf(disc)
    if (r == null) return '할인을 넣으면 계산에 써요'
    if (disc <= 100) return `5만원권 ${won(50000 * r)}원`
    return off(r)
  }
  const off = (r: number) => `${((1 - r) * 100).toFixed(1).replace(/\.0$/, '')}% 할인`
  /** '7% 할인 · 한도 없음'. 단위는 따로 눈에 띄게 보여 준다 */
  function methodNote(m: { mode: PlainMode; val: number; monthly: number | null }) {
    const r = plainRateOf(m.mode, m.val)
    return `${r < 1 ? off(r) : '할인을 넣으면 계산에 써요'} · ${m.monthly ? `달마다 ${won(m.monthly)}` : '한도 없음'}`
  }

  const offs = $derived(eff.methods.filter(m => !m.on))
  let showOff = $state(false)
  /** 추가 칸과 수정 칸은 같은 모양이다. editing은 고치는 결제수단 id */
  let adding = $state(false)
  let editing = $state<string | null>(null)
  const blank = () => ({ name: '', mode: 'off' as PlainMode, val: 0, monthly: 0, unit: 50_000 })
  let form = $state(blank())
  const formOk = $derived(!!form.name.trim() && plainRateOf(form.mode, form.val) < 1)
  function startEdit(m: PayMethod) {
    adding = false; editing = m.id
    form = { name: m.name, mode: m.mode, val: m.val, monthly: m.monthly ?? 0, unit: m.unit }
  }
  function close() { adding = false; editing = null; form = blank() }
  function submit(e: Event) {
    e.preventDefault()
    if (!formOk) return
    const x = { name: form.name.trim(), mode: form.mode, val: form.val, monthly: form.monthly || null, unit: form.unit }
    if (editing) updateMethod(editing, x); else addMethod(x)
    close()
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
        <label for="eff-card-{c.key}">{c.name}<small>{note(c.disc)}{c.key === LAST_KEY ? ' · 그 달 마지막에' : ''}</small></label>
        <NumBox id="eff-disc-{c.key}" label="{c.name} 할인율 또는 5만원권 가격" size="sm" decimal placeholder="8" unit={c.disc && c.disc <= 100 ? '%' : ''}
          value={c.disc} set={v => { eff.cards[i].disc = v; saveEff() }} disabled={!c.on} />
        <NumBox id="eff-left-{c.key}" label="{c.name} {month}월 남은 한도" size="sm"
          value={eff.leftNow[c.key] ?? 0} set={v => { eff.leftNow[c.key] = v; saveEff() }} disabled={!c.on} />
      </div>
    {/each}

    <!-- 직접 추가한 결제수단(넥슨팩 쿠폰 등). 할인이 큰 것부터 상품권과 섞어 쓴다 -->
    {#snippet methodForm()}
      <form class="add" onsubmit={submit}>
        <input class="txt" type="text" placeholder="이름 (예: 넥슨팩 쿠폰)" bind:value={form.name} maxlength="30" aria-label="결제수단 이름" />
        <select bind:value={form.unit} aria-label="판매 단위">
          {#each UNITS as u (u)}<option value={u}>{minUnit(u)}</option>{/each}
        </select>
        <select bind:value={form.mode} onchange={() => (form.val = 0)} aria-label="할인 적는 방식">
          {#each MODES as x (x.key)}<option value={x.key}>{x.name}</option>{/each}
        </select>
        <NumBox id="eff-pm-form-val" label={modeOf(form.mode).name} size="sm" decimal placeholder={modeOf(form.mode).ph} unit={modeOf(form.mode).unit}
          value={form.val} set={v => (form.val = v)} />
        <NumBox id="eff-pm-form-limit" label="달마다 한도" size="sm" placeholder="달 한도 · 없으면 비움" value={form.monthly} set={v => (form.monthly = v)} />
        <span class="acts">
          <button type="button" class="btn" onclick={close}>취소</button>
          <button type="submit" class="btn primary" disabled={!formOk}>{editing ? '저장' : '추가'}</button>
        </span>
      </form>
    {/snippet}
    {#snippet methodRow(m: PayMethod)}
      {@const md = modeOf(m.mode)}
      {#if editing === m.id}{@render methodForm()}{:else}
      <div class="row m" class:off={!m.on}>
        <input type="checkbox" id="eff-pm-{m.id}" bind:checked={m.on} onchange={saveEff} />
        <span class="ml">
          <label for="eff-pm-{m.id}">{m.name} <em class="unit">{minUnit(m.unit)}</em><small>{methodNote(m)}</small></label>
          <button class="del" onclick={() => startEdit(m)} aria-label="{m.name} 고치기" title="고치기">✎</button>
          <button class="del" onclick={() => removeMethod(m.id)} aria-label="{m.name} 지우기" title="지우기">×</button>
        </span>
        <NumBox id="eff-pm-val-{m.id}" label="{m.name} {md.name}" size="sm" decimal placeholder={md.ph} unit={md.unit}
          value={m.val} set={v => { m.val = v; saveEff() }} disabled={!m.on} />
        {#if m.monthly}
          <NumBox id="eff-pm-left-{m.id}" label="{m.name} {month}월 남은 한도" size="sm"
            value={eff.leftNow[m.id] ?? m.monthly} set={v => { eff.leftNow[m.id] = v; saveEff() }} disabled={!m.on} />
        {:else}
          <span class="nolimit">한도 없음</span>
        {/if}
      </div>
      {/if}
    {/snippet}
    {#if eff.methods.length}
      <div class="row head sub"><span></span><span>직접 추가한 결제수단</span><span>할인</span><span>{month}월 남은 한도</span></div>
      {#each eff.methods.filter(m => m.on) as m (m.id)}{@render methodRow(m)}{/each}
      <!-- 꺼 둔 것은 계산에 안 쓰니 한 줄로 접어 둔다 -->
      {#if offs.length}
        <button class="fold" aria-expanded={showOff} onclick={() => (showOff = !showOff)}>
          꺼 둔 결제수단 {offs.length}개 <span class="caret" class:open={showOff}>▾</span>
        </button>
        {#if showOff}{#each offs as m (m.id)}{@render methodRow(m)}{/each}{/if}
      {/if}
    {/if}

    {#if adding}
      {@render methodForm()}
    {:else}
      <button class="addbtn" onclick={() => { close(); adding = true }}>+ 할인받는 결제수단 직접 추가</button>
    {/if}

    <div class="row plain">
      <span></span>
      <span class="pl">일반 충전<small>할인 없음 · 1:1 · 위에서 못 채운 끝자리</small></span>
      <span></span>
      <span class="nolimit">한도 없음</span>
    </div>

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

  <p class="ef-hint">상품권은 <b>5만원권으로만</b> 할인이 큰 것부터 산다고 보고 계산해요. 목표 계획을 따르면 달마다 한도를 이렇게 주별로 나눠요. 넥슨팩 쿠폰처럼 할인받아 충전하는 방법이 있으면 <b>직접 추가</b>해 주세요. 상품권과 섞어 <b>할인이 큰 것부터</b> 쓰고, 권 단위로 파는 결제수단은 그 단위로만 사요. 한 권보다 작은 끝자리는 할인되는 결제수단으로 <b>한 권 더 사서 남는 캐시를 다음 주에</b> 쓰고, 마지막 주(금액 직접이면 그 한 번)만 {bc.on ? '바코드나 ' : ''}일반 충전(1:1)으로 딱 맞춰요. 권마다 할인율이 다르면 권별로 따로 추가해 주세요.
    <b>넥슨카드</b>는 먼저 쓰면 그 달에 다른 할인 충전(현대카드 포인트·중고 캐시 등)을 못 해서, 계획에서 <b>그 달 마지막 20만원</b>에만 써요. 한 번만 결제할 때는 다른 한도를 다 쓰고 모자랄 때만 써요.</p>
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
  .row.sub { margin-top: 4px; padding-top: 8px; border-top: 1px dashed var(--color-line); }
  .ml { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .ml label { flex: 0 1 auto; min-width: 0; }
  .row.off .ml label { opacity: .55; }
  .ml .unit { font-style: normal; font-size: 11px; font-weight: 600; color: var(--color-lav); padding: 0 6px; border-radius: 6px; background: color-mix(in oklab, var(--color-lav) 14%, transparent); white-space: nowrap; }
  .del { appearance: none; border: 0; background: none; color: var(--color-tx3); cursor: pointer; font-size: 15px; line-height: 1; padding: 3px 6px; border-radius: 6px; }
  .del:hover { background: var(--color-panel3); color: var(--color-tx); }
  .fold { appearance: none; border: 0; background: none; font: inherit; font-size: 12px; color: var(--color-tx3); cursor: pointer; justify-self: start; padding: 2px 8px 2px 26px; border-radius: 6px; }
  .fold:hover { color: var(--color-tx); }
  .caret { display: inline-block; transition: transform .15s; }
  .caret.open { transform: rotate(180deg); }
  .addbtn { appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; color: var(--color-tx3); padding: 8px; border-radius: var(--radius-md); background: transparent; border: 1px dashed var(--color-line2); }
  .addbtn:hover { border-color: var(--color-lav); color: var(--color-tx); }
  .add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px; border-radius: var(--radius-md); background: var(--color-bg2); border: 1px solid var(--color-line); }
  .add .txt { all: unset; box-sizing: border-box; flex: 1 1 100%; padding: 5px 10px; border-radius: 8px; font-size: 13px; color: var(--color-tx); background: var(--color-panel); border: 1px solid var(--color-line); user-select: text; }
  .add .txt:focus { border-color: var(--color-lav); }
  .add select { padding: 5px 8px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-panel); color: var(--color-tx); font: inherit; font-size: 12.5px; }
  .add :global(.nb) { width: 140px; }
  .add .acts { display: flex; gap: 6px; margin-left: auto; }
  .plain { padding-top: 6px; border-top: 1px dashed var(--color-line); }
  .pl { display: grid; line-height: 1.3; color: var(--color-tx); }
  .nolimit { text-align: right; color: var(--color-tx3); font-size: 12px; padding-right: 10px; }
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
    .row.plain > .pl, .row.m > .ml { grid-column: 2 / -1; }
    .row.plain > :nth-child(3) { display: none; }
    .ml label { grid-column: auto; }
    .row.m > .nolimit { text-align: left; padding: 0; }
  }
</style>
