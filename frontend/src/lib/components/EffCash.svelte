<script lang="ts">
  /**
   * 2. 캐시는 얼마에 — 이번 주 설정. 결제수단마다 할인, 이번 달 이미 충전한 금액(이번 주 전까지), 이번 주에 충전한(할) 금액.
   * 상품권 셋은 달마다 20만 고정, 직접 추가한 결제수단은 한도 없음. 이번 주 충전은 사용자가 정하고, 모자라는 만큼만
   * 남은 한도 안에서 추천한다(그래서 넥슨카드 '그 달 마지막 20만원에만 쓰기'는 없앴다, 2026-10-16 사용자)
   */
  import NumBox from './NumBox.svelte'
  import { SHOP, addMethod, beforeThisWeek, cashFlow, eff, setBefore, setWeekCharge, syncWeekOff, weekCharged, PLAIN_KEY, removeMethod, saveEff, thisMonth, updateMethod, type PayMethod } from '../eff.svelte'
  import { app, getBase } from '../store.svelte'
  import { md, spotlight } from '../format'
  import { tip } from '../tip'
  import { MONTHLY, plainRateOf, rateOf, unitName, type PlainMode } from '../core/efficiency'
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
    return `${r < 1 ? off(r) : '할인을 넣으면 계산에 써요'} · 한도 없음`
  }

  const offs = $derived(eff.methods.filter(m => !m.on))
  // 처음엔 펼쳐 둔다. 접혀 있으면 끈 결제수단이 없어진 줄 안다(사용자). 누르면 접힌다
  let showOff = $state(true)
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
  /** 충전 기록이 있으면 캐시 잔액은 기록으로 센다. 설정 칸은 기록을 시작한 주의 처음 잔액이 된다 */
  const flow = $derived(app.data ? cashFlow(getBase()?.rows ?? [], app.data.thisWeek) : null)
  /** '이번 달 이미 충전'은 라벨로 보이고, 누르면 칸이 열렸다가 Enter·칸을 벗어나면 다시 라벨로(2026-10-16 사용자) */
  let editBefore = $state<string | null>(null)
  function startBefore(key: string) {
    editBefore = key
    queueMicrotask(() => (document.getElementById(`eff-before-${key}`) as HTMLInputElement | null)?.focus())
  }
  function close() { adding = false; editing = null; form = blank() }
  function submit(e: Event) {
    e.preventDefault()
    if (!formOk) return
    const x = { name: form.name.trim(), mode: form.mode, val: form.val, monthly: null, unit: form.unit }
    if (editing) updateMethod(editing, x); else addMethod(x)
    close()
  }
</script>

<article class="card" use:spotlight>
  <h3 class="card-title"><span class="n">2</span>캐시는 얼마에</h3>

  <div class="ef-field">
    <label for="eff-balance">{flow ? `${md(flow.first)} 주 시작 때 캐시 잔액` : '캐시 잔액'}</label>
    <NumBox id="eff-balance" label="캐시 잔액" unit="캐시" placeholder="없으면 비움" value={eff.balance} set={v => { eff.balance = v; saveEff() }} />
    {#if flow}
      <span class="ef-hint">지금 잔액 <b>{won(flow.left)}캐시</b> = 이 값 + 충전 기록 − 구매내역. 충전을 기록한 첫 주가 시작될 때 잔액만 맞추면 그다음은 저절로 세요.</span>
    {:else}
      <span class="ef-hint">{eff.balance ? '잔액부터 먼저 써요. 이미 충전한 돈이라 1:1로 계산해요.' : '넥슨 캐시 잔액이 있으면 넣어 주세요. 먼저 써요.'} 아래 결산에 충전을 기록하면 잔액은 저절로 세요.</span>
    {/if}
  </div>

  <div class="or">결제수단 · 이번 주 충전</div>

  <div class="pay">
    <div class="row head"><span></span><span>상품권 (월 20만)</span><span>할인</span><span>이번 주 충전</span></div>
    {#snippet weekBox(key: string, name: string, on: boolean)}
      <NumBox id="eff-week-{key}" label="{name} 이번 주 충전" size="sm" placeholder="0" value={weekCharged(key)} set={v => setWeekCharge(key, v)} disabled={!on} />
    {/snippet}
    {#each eff.cards as c, i (c.key)}
      {@const used = beforeThisWeek(c.key) + weekCharged(c.key)}
      <div class="row" class:off={!c.on}>
        <input type="checkbox" id="eff-card-{c.key}" bind:checked={c.on} onchange={saveEff} />
        <label for="eff-card-{c.key}">{c.name}<small>{note(c.disc)}</small></label>
        <NumBox id="eff-disc-{c.key}" label="{c.name} 할인율 또는 5만원권 가격" size="sm" decimal placeholder="8" unit={c.disc && c.disc <= 100 ? '%' : ''}
          value={c.disc} set={v => { eff.cards[i].disc = v; syncWeekOff(c.key) }} disabled={!c.on} />
        <span class="wk">
          {@render weekBox(c.key, c.name, c.on)}
          <!-- 한도 라벨: '이미 충전 / 20만'. 한도(20만)는 고정이고, 앞의 이미 충전(이번 달 이번 주 전까지)만 눌러서 고친다(2026-10-16 사용자) -->
          <span class="lim" class:full={used >= MONTHLY}>
            <span class="mh">월 한도</span>
            <span class="nm2">
            {#if editBefore === c.key}
              <span class="bx"><NumBox id="eff-before-{c.key}" label="{c.name} 이번 달 이번 주 전까지 충전한 금액" size="sm" placeholder="0"
                value={beforeThisWeek(c.key)} set={v => setBefore(c.key, v)} onblur={() => (editBefore = null)} /></span>
            {:else}
              <button class="lbl" onclick={() => startBefore(c.key)} disabled={!c.on} use:tip={'이번 달 이번 주 전까지 충전한 금액 고치기'}>{won(beforeThisWeek(c.key))}</button>
            {/if}
            <span>/ {won(MONTHLY)}<span class="wu">원</span></span>
            </span>
          </span>
        </span>
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
          <span class="mn">
            <label for="eff-pm-{m.id}">{m.name}</label>
            <button class="del" onclick={() => startEdit(m)} aria-label="{m.name} 고치기" use:tip={'고치기'}>✎</button>
            <button class="del" onclick={() => removeMethod(m.id)} aria-label="{m.name} 지우기" use:tip={'지우기'}>×</button>
          </span>
          <em class="unit">{minUnit(m.unit)}</em>
          <small>{methodNote(m)}</small>
        </span>
        <NumBox id="eff-pm-val-{m.id}" label="{m.name} {md.name}" size="sm" decimal placeholder={md.ph} unit={md.unit}
          value={m.val} set={v => { m.val = v; syncWeekOff(m.id) }} disabled={!m.on} />
        {@render weekBox(m.id, m.name, m.on)}
      </div>
      {/if}
    {/snippet}
    {#if eff.methods.length}
      <div class="row head sub"><span></span><span>직접 추가 (한도 없음)</span><span>할인</span><span>이번 주 충전</span></div>
      {#each eff.methods.filter(m => m.on) as m (m.id)}{@render methodRow(m)}{/each}
      <!-- 꺼 둔 것은 계산에 안 쓴다. 펼쳐 둔 채로 보여 주고, 누르면 한 줄로 접는다 -->
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

    <div class="row plain" class:off={!eff.plainOn}>
      <input type="checkbox" id="eff-plain" bind:checked={eff.plainOn} onchange={saveEff} />
      <label for="eff-plain">일반 충전<small>{eff.plainOn
        ? '할인 없음 · 1:1 · 끝자리를 딱 맞게 채워요'
        : '끔 · 끝자리도 할인 수단으로 한 권 더 사서 남는 캐시를 다음에 써요'}</small></label>
      <span class="nolimit">1:1</span>
      {@render weekBox(PLAIN_KEY, '일반 충전', true)}
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

  <p class="ef-hint"><b>이번 주 충전</b>에 이번 주에 충전했거나 할 금액을 적으면 그대로 계산해요(아래 결산의 이번 주 충전 기록과 같아요). 적은 충전으로 모자라는 캐시만 남은 한도 안에서 할인이 큰 것부터 추천해요. 상품권은 <b>5만원권</b> 단위로, 달마다 <b>20만</b>까지예요. 상품권의 이번 주 충전 아래 <b>월 한도 ○ / 200,000원</b>은 이번 달 이번 주 전까지 충전한 금액과 한도예요. 밑줄 친 앞 숫자를 눌러 고쳐요(지난 주 결산에 적은 충전은 저절로 더해져요). {#if eff.plainOn}한 권보다 작은 끝자리는 {bc.on ? '바코드나 ' : ''}<b>일반 충전(1:1)으로 딱 맞춰요.</b>{:else}일반 충전을 꺼 두면 끝자리도 할인 수단으로 한 권 더 사서 남는 캐시를 다음에 써요.{/if} 넥슨팩 쿠폰처럼 할인받아 충전하는 방법이 있으면 <b>직접 추가</b>해 주세요.</p>
</article>

<style>
  .card { display: grid; gap: 12px; align-content: start; }
  .n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 7px; background: var(--color-panel3); font-family: var(--font-mono); font-size: 11px; color: var(--color-lav); }
  .or { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--color-tx3); }
  .or::before, .or::after { content: ""; flex: 1; height: 1px; background: var(--color-line); }
  .pay { display: grid; gap: 8px; }
  .wk { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; min-width: 0; }
  /* 할인 칸과 이번 주 충전 칸 사이는 조금 더 띄운다 */
  .row:not(.bc) > :global(:nth-child(4)) { margin-left: clamp(4px, 1vw, 14px); }
  /* 이번 주 충전 아래 라벨이 있어 줄이 높다. 칸들은 위로 맞춰 이름·할인·충전이 한 줄에 선다 */
  .row:not(.head):has(.wk) { align-items: start; }
  .row:has(.wk) > label { padding-top: 2px; }
  /* 한도 라벨이 붙은 상품권 줄은 위아래를 더 띄워 라벨이 어느 줄 것인지 헷갈리지 않게 */
  .row:has(.wk) { padding: 8px 0; }
  .row:has(.wk) > input[type=checkbox] { margin-top: 11px; }
  /* 좁은 카드에서 라벨이 충전 칸보다 길면 줄을 바꾸지 않고 왼쪽(할인 칸 아래 빈자리)으로 넘친다 */
  .lim { display: flex; justify-content: flex-end; align-items: center; gap: 4px; font-size: 11px; color: var(--color-tx3); font-variant-numeric: tabular-nums; white-space: nowrap; padding-right: 2px; }
  .lim.full { color: var(--color-peach); }
  /* '월 한도'는 숫자 바로 왼쪽. 줄 전체는 오른쪽에 붙인다 */
  .lim .nm2 { display: flex; align-items: center; gap: 4px; }
  .lim .mh { margin-right: 4px; }
  /* 고칠 수 있는 숫자(이번 달 이미 충전)는 점선 밑줄로 알린다 */
  .lbl { appearance: none; cursor: pointer; font: inherit; color: inherit; background: none; border: 0; padding: 0; text-decoration: underline dotted; text-underline-offset: 3px; }
  .lim .wu { margin-left: 3px; }
  .lbl:hover:not(:disabled) { color: var(--color-lav); }
  .lbl:disabled { cursor: default; text-decoration: none; }
  .lim .bx { width: 110px; }
  /*
   * 이름은 160px로 두고 할인 · 이번 주 충전 칸이 남는 폭을 4:5로 나눠 카드를 채운다(오른쪽이 비지 않게).
   * 카드가 아주 넓을 때(912–1295px에서 한 줄 다 쓸 때) 칸이 지나치게 길어지지 않게 줄 전체는 640px까지만(2026-10-16 사용자)
   */
  .row { display: grid; grid-template-columns: 18px minmax(0, 160px) minmax(84px, 4fr) minmax(112px, 5fr); max-width: 580px; gap: 8px; align-items: center; font-size: 13px; }
  .row.head { font-size: 11px; color: var(--color-tx3); }
  .row.head span:nth-child(n+3) { text-align: right; padding-right: 2px; }
  .row.sub { margin-top: 4px; padding-top: 8px; border-top: 1px dashed var(--color-line); }
  .row.off label { opacity: .55; }
  .row input[type=checkbox] { accent-color: var(--color-lav); width: 15px; height: 15px; margin: 0; cursor: pointer; }
  .row label { display: grid; line-height: 1.3; cursor: pointer; color: var(--color-tx); }
  .row small { font-size: 11px; color: var(--color-tx3); }
  .ml { display: grid; justify-items: start; gap: 1px; min-width: 0; }
  .mn { display: flex; align-items: center; gap: 0; }
  .mn label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mn .del { padding: 3px 4px; font-size: 14px; }
  .ml small { line-height: 1.3; }
  .ml label { flex: 0 1 auto; min-width: 0; }
  .row.off .ml label, .row.off .ml .unit, .row.off .ml small { opacity: .55; }
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
  .nolimit { text-align: right; color: var(--color-tx3); font-size: 12px; padding-right: 10px; }
  .bc { grid-template-columns: 18px minmax(0, 1fr) 216px; padding-top: 4px; border-top: 1px dashed var(--color-line); }
  .want { display: grid; gap: 3px; }
  @media (max-width: 672px) {
    .bc { grid-template-columns: 18px minmax(0, 1fr); }
    .bc .want { grid-column: 2; }
  }
  /* 좁은 폰: 이름을 한 줄 다 쓰고, 두 칸은 그 아래에 */
  @media (max-width: 420px) {
    .row { grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1fr); row-gap: 4px; }
    .row > label, .row.m > .ml { grid-column: 2 / -1; }
    .row:not(.head, .bc) > :global(:nth-child(3)) { grid-column: 2; }
    .row:not(.head, .bc) > :global(:nth-child(4)) { grid-column: 3; }
    .row.head span:nth-child(2) { display: none; }
    .row.head span:nth-child(n+3) { text-align: left; }
    .row:not(.bc) > :global(:nth-child(4)) { margin-left: 0; }
  }
</style>
