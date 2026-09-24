<script lang="ts">
  import { app, pcroomClear, pcroomRead, pcroomRestore, pcroomSave } from '../store.svelte'
  import type { PcRoomResult, PcRoomScan, Tier } from '../types'
  import { TIER_COLOR, addDays, md, spotlight, won } from '../format'

  const d = $derived(app.data!)

  // 인게임 상단 '○○ 등급까지 N 캐시' — 여기서 지금 등급과 13주 합계가 같이 나온다
  let nextIndex = $state(-1)
  let remainText = $state('')
  let keepText = $state('')
  // 툴팁 12줄 '현재 등급 유지까지' (1주 뒤 → 12주 뒤)
  let needTexts = $state<string[]>(Array(12).fill(''))

  let result = $state<PcRoomResult | null>(null)
  let edited = $state<Record<string, number>>({})   // 사용자가 직접 고친 주
  let busy = $state(false)
  let error = $state('')

  const num = (t: string) => Number((t ?? '').replace(/[^\d]/g, '')) || 0
  const fmt = (t: string) => (t.trim() ? num(t).toLocaleString('ko-KR') : '')

  // '레드 등급까지'라고 적혀 있으면 지금 등급은 그 바로 아래(다이아)다
  const curTier = $derived<Tier | null>(nextIndex > 0 ? d.tiers[nextIndex - 1] : null)
  const tierTh = $derived(curTier?.th ?? 0)
  const filled = $derived(needTexts.every(t => t.trim() !== '') && nextIndex >= 0 && remainText.trim() !== '')

  // 처음 열었을 때 지금 등급 바로 위를 골라둔다 (보통 그게 화면에 적혀 있다)
  $effect(() => {
    if (nextIndex >= 0) return
    const i = d.tiers.findIndex(t => t.key === d.current)
    nextIndex = Math.min(i + 1, d.tiers.length - 1)
  })

  function tierOf(sum: number): Tier | null {
    let found: Tier | null = null
    for (const t of d.tiers) if (sum >= t.th) found = t
    return found
  }

  /** 입력한 값으로 '예상 등급'을 되짚는다. 인게임 화면과 다르면 잘못 넣은 것이다. */
  const predicted = $derived(needTexts.map(t => {
    if (!t.trim() || !tierTh) return null
    const sum = tierTh - num(t)
    return { sum, tier: sum < 0 ? null : tierOf(sum), bad: sum < 0 }
  }))

  const rows = $derived(result?.rows ?? [])
  const amountOf = (start: string, fallback: number) => edited[start] ?? fallback
  const pcTotal = $derived(rows.reduce((s, r) => s + amountOf(r.start, r.amount), 0))
  const blocked = $derived(rows.some(r => r.note && edited[r.start] === undefined))

  async function calc() {
    busy = true
    error = ''
    try {
      const r = await pcroomRestore(needTexts.map(num), nextIndex, num(remainText),
        keepText.trim() ? num(keepText) : null)
      result = r
      edited = {}
      if (!r.rows.length) { error = r.issues.join(' '); openInput = true }
    } catch (e) {
      error = String(e)
      openInput = true
    } finally {
      busy = false
    }
  }

  async function save() {
    busy = true
    try {
      const weeks: Record<string, number> = {}
      for (const r of rows) weeks[r.start] = amountOf(r.start, r.amount)
      await pcroomSave(weeks)
      app.showPcRoom = false
    } finally {
      busy = false
    }
  }

  async function clear() {
    busy = true
    try {
      await pcroomClear()
      result = null
      edited = {}
    } finally {
      busy = false
    }
  }

  const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`)

  // ---- 캡처에서 읽기 ----
  let scan = $state<PcRoomScan | null>(null)
  let scanning = $state(false)
  // 읽어온 값은 확인용이라 기본은 접어 둔다. 중요한 건 아래 보정 결과다
  let openInput = $state(false)
  const doneCount = $derived(needTexts.filter(t => t.trim() !== '').length)
  const summary = $derived(
    doneCount === 0 ? '아직 비어 있어요 · 펼치면 직접 넣을 수 있어요'
      : `${curTier?.name ?? '등급 미정'} · ${remainText || '?'} 캐시 · ${doneCount}/12줄`)

  function apply(r: PcRoomScan) {
    scan = r
    if (!r.ok) return
    if (r.needs) needTexts = r.needs.map(v => v.toLocaleString('ko-KR'))
    if (r.tierIndex != null) nextIndex = r.tierIndex
    if (r.remaining != null) remainText = r.remaining.toLocaleString('ko-KR')
    if (!r.partial) calc()
  }

  async function grab(dataUrl = '') {
    scanning = true
    try {
      apply(await pcroomRead(dataUrl))
    } finally {
      scanning = false
    }
  }

  function fromFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    const fr = new FileReader()
    fr.onload = () => grab(String(fr.result))
    fr.readAsDataURL(file)
  }

  function onPaste(e: ClipboardEvent) {
    const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'))
    if (item) { e.preventDefault(); fromFile(item.getAsFile()) }
  }

</script>

<div class="back" role="presentation" onclick={e => e.target === e.currentTarget && (app.showPcRoom = false)}>
  <div class="sheet" role="dialog" aria-label="PC방 반영액 보정" use:spotlight>
    <header>
      <h2>PC방 반영액 보정</h2>
      <span class="meta">
        {#if d.pcroom.missing.length}
          <em>13주 중 {d.pcroom.missing.length}주는 아직 몰라요</em>
        {:else if d.pcroom.total}
          지금 적용 중 · {won(d.pcroom.total)}원
        {:else}
          보정값 없음
        {/if}
      </span>
      <button class="x" onclick={() => (app.showPcRoom = false)} aria-label="닫기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </header>

    <div class="body">
      <p class="why">
        프리미엄 PC방 접속분은 6분마다 100캐시씩 MVP 금액에 반영되는데 구매내역에는 잡히지 않아요.
        인게임에서 <b>등급 게이지에 마우스를 올린 채</b> 캡처하면 읽어 드려요.
      </p>

      <section class="cap" aria-label="캡처로 불러오기"
        ondragover={e => e.preventDefault()}
        ondrop={e => { e.preventDefault(); fromFile(e.dataTransfer?.files?.[0]) }}>
        <div class="capmain">
          <b>게임에서 <kbd>PrintScreen</kbd>을 누른 뒤</b>
          <span>MVP 창을 열고 등급 게이지에 마우스를 올린 채로 찍어 주세요. 이미지를 끌어다 놓거나 <kbd>Ctrl</kbd>+<kbd>V</kbd>도 돼요.</span>
        </div>
        <button class="btn primary" disabled={scanning} onclick={() => grab()}>
          {#if scanning}<span class="spin" aria-hidden="true"></span>{/if}
          {scanning ? '읽는 중…' : '클립보드에서 읽기'}
        </button>
        <label class="chip file" class:off={scanning}>
          파일 선택
          <input type="file" accept="image/*" disabled={scanning} onchange={e => fromFile(e.currentTarget.files?.[0])} />
        </label>
      </section>
      {#if scanning}
        <p class="scanmsg busy"><span class="spin small" aria-hidden="true"></span>캡처를 읽고 있어요…</p>
      {:else if scan}
        <p class="scanmsg" class:bad={!scan.ok} class:warn={scan.partial}>{scan.message}</p>
      {/if}

      <button class="fold" aria-expanded={openInput} onclick={() => (openInput = !openInput)}>
        <svg class="arw" class:open={openInput} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        <b>읽어온 값 확인·수정</b>
        <small>{summary}</small>
      </button>

      {#if openInput}
      <!-- 인게임 상단 패널과 같은 모양 -->
      <section class="panel">
        <div class="prow">
          <span class="k">이번 주 등급</span>
          <b class="tier" style="--c:{curTier ? TIER_COLOR[curTier.key] : 'var(--color-tx3)'}">{curTier?.name ?? '등급 없음'}</b>
          <small>인게임 표시와 같아야 해요</small>
        </div>
        <div class="prow">
          <span class="k">
            <select bind:value={nextIndex} aria-label="화면에 적힌 등급">
              {#each d.tiers as t, i (t.key)}<option value={i}>{t.name}</option>{/each}
            </select>
            등급까지
          </span>
          <input type="text" inputmode="numeric" bind:value={remainText} placeholder="590,330"
            onblur={() => (remainText = fmt(remainText))} aria-label="남은 금액" />
          <small>캐시</small>
        </div>
        <div class="prow">
          <span class="k">{curTier?.name ?? ''} 등급 유지까지</span>
          <input type="text" inputmode="numeric" bind:value={keepText} placeholder="20,330"
            onblur={() => (keepText = fmt(keepText))} aria-label="유지 필요 금액" />
          <small>캐시 · 선택 (넣으면 1주차와 대조해요)</small>
        </div>
      </section>

      <!-- 인게임 툴팁 표와 같은 4열 구조 -->
      <section class="tt">
        <div class="tr head">
          <span>주차</span><span>등급 설정일</span><span class="c">예상 등급</span><span class="r">현재 등급 유지까지</span>
        </div>
        {#each needTexts as _, i (i)}
          {@const p = predicted[i]}
          <div class="tr">
            <span class="wk">{i + 1} 주차 뒤</span>
            <span class="dt mono">{addDays(d.thisWeek, (i + 1) * 7)}</span>
            <span class="c tg" style="--c:{p?.tier ? TIER_COLOR[p.tier.key] : 'var(--color-tx3)'}">
              {#if !p}–{:else if p.bad}?{:else}{p.tier?.name ?? '없음'}{/if}
            </span>
            <span class="r in">
              <input type="text" inputmode="numeric" bind:value={needTexts[i]} placeholder="0"
                onblur={() => (needTexts[i] = fmt(needTexts[i]))} aria-label="{i + 1}주차 뒤 유지까지" />
              <em>캐시</em>
            </span>
          </div>
        {/each}
      </section>
      <p class="hint">
        <b>예상 등급</b> 열은 넣으신 숫자로 저희가 거꾸로 계산한 값이에요.
        인게임 표의 같은 열과 다르면 그 줄을 잘못 옮겨 적은 거예요.
      </p>

      <div class="acts">
        <button class="btn primary" disabled={!filled || busy} onclick={calc}>주차별로 계산하기</button>
      </div>
      {/if}
      {#if error}<p class="err">{error}</p>{/if}

      {#if !rows.length && Object.keys(d.pcroom.weeks).length}
        <div class="acts"><button class="chip" disabled={busy} onclick={clear}>저장된 보정값 지우기</button></div>
      {/if}

      {#if rows.length}
        <section class="result">
          <div class="label">검수 · 이상한 값은 직접 고칠 수 있어요</div>
          <div class="grid">
            <div class="r2 head"><span>주</span><span class="n">인게임</span><span class="n">수집한 결제</span><span class="n">PC방</span><span class="n">환산</span></div>
            {#each rows as r (r.start)}
              {@const v = amountOf(r.start, r.amount)}
              <div class="r2" class:bad={!!r.note} class:warn={!r.note && !!r.warn} class:zero={v === 0}>
                <span class="mono wk2">{md(r.start)}–{md(r.end)}</span>
                <span class="n mono">{won(r.nexon)}</span>
                <span class="n mono dim">{won(r.spent)}</span>
                <span class="n">
                  <input class="mono" type="text" inputmode="numeric" value={v.toLocaleString('ko-KR')}
                    aria-label="{md(r.start)} 주 PC방 금액"
                    onchange={e => (edited[r.start] = Number(e.currentTarget.value.replace(/[^\d]/g, '')) || 0)} />
                </span>
                <span class="tm">{v ? hm(Math.floor(v / 100) * 6) : '-'}</span>
              </div>
              {#if r.note || r.warn}
                <p class="msg" class:bad={!!r.note}>{r.note || r.warn}</p>
              {/if}
            {/each}
          </div>

          <div class="foot">
            <div class="sum">PC방 보정 합계 <b class="mono">{won(pcTotal)}</b>원
              <small>· 13주 합계가 {won(result?.total ?? 0)}원이 돼요</small>
            </div>
            <div class="foot-btns">
              {#if Object.keys(d.pcroom.weeks).length}
                <button class="chip" disabled={busy} onclick={clear}>저장된 보정값 지우기</button>
              {/if}
              <button class="btn primary" disabled={busy || blocked} onclick={save}>저장하고 반영</button>
            </div>
          </div>
          {#if blocked}<p class="err">빨간 줄의 금액을 확인하고 고쳐야 저장할 수 있어요.</p>{/if}
        </section>
      {/if}
    </div>
  </div>
</div>

<svelte:window onkeydown={e => e.key === 'Escape' && (app.showPcRoom = false)} onpaste={onPaste} />

<style>
  .back {
    position: absolute; inset: 52px 0 0 0; z-index: 40;
    display: grid; place-items: center; padding: 20px;
    background: color-mix(in oklab, #14151a 72%, transparent); backdrop-filter: blur(8px);
  }
  .sheet {
    position: relative; width: min(820px, 100%); max-height: 100%;
    display: flex; flex-direction: column;
    background: var(--color-panel); border: 1px solid var(--color-line2); border-radius: 22px;
    box-shadow: 0 30px 90px -30px rgba(0, 0, 0, .85); overflow: hidden;
  }
  header { display: flex; align-items: center; gap: 12px; padding: 18px 20px 12px; }
  h2 { font-family: var(--font-display); font-weight: 400; font-size: 19px; margin: 0; }
  .meta { font-size: 12px; color: var(--color-tx3); }
  .meta em { font-style: normal; color: var(--color-butter); }
  .x { margin-left: auto; appearance: none; width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: grid; place-items: center; border: 1px solid var(--color-line); background: var(--color-panel2); color: var(--color-tx2); }
  .x:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .x svg { width: 15px; height: 15px; }

  .body { overflow-y: auto; padding: 0 20px 20px; }
  .why { font-size: 12.5px; line-height: 1.65; color: var(--color-tx2); background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 12px; padding: 11px 13px; margin: 0 0 14px; }
  .why b { color: var(--color-tx); }

  .cap {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px;
    padding: 11px 13px; border-radius: 12px; background: var(--color-bg2);
    border: 1px dashed color-mix(in oklab, var(--color-lav) 45%, var(--color-line));
    transition: border-color .2s, opacity .2s;
  }
  .spin {
    display: inline-block; width: 12px; height: 12px; margin-right: 2px; border-radius: 50%;
    border: 2px solid color-mix(in oklab, currentColor 30%, transparent); border-top-color: currentColor;
    animation: spin .8s linear infinite; vertical-align: -1px;
  }
  .spin.small { width: 11px; height: 11px; border-width: 1.8px; margin-right: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .file.off { opacity: .45; pointer-events: none; }
  .scanmsg.busy { color: var(--color-tx2); display: flex; align-items: center; }
  .capmain { flex: 1 1 320px; min-width: 0; display: grid; gap: 2px; }
  .capmain b { font-size: 13px; color: var(--color-tx); }
  .capmain span { font-size: 11.5px; color: var(--color-tx3); line-height: 1.5; }
  kbd {
    font: inherit; font-family: var(--font-mono); font-size: 11.5px; padding: 1px 6px;
    border-radius: 6px; border: 1px solid var(--color-line2); background: var(--color-panel2);
  }
  .file { position: relative; overflow: hidden; }
  .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .scanmsg { margin: -6px 2px 12px; font-size: 12px; color: var(--color-good); line-height: 1.55; }
  .scanmsg.warn { color: var(--color-peach); }
  .scanmsg.bad { color: var(--color-bad); }

  /* 인게임 상단 패널 */
  .panel { border: 1px solid var(--color-line2); border-radius: 12px; overflow: hidden; background: var(--color-bg2); }
  .prow { display: flex; align-items: center; gap: 9px; padding: 8px 12px; border-top: 1px solid var(--color-line); }
  .prow:first-child { border-top: 0; }
  .prow .k { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--color-tx2); min-width: 168px; }
  .prow small { font-size: 11.5px; color: var(--color-tx3); }
  .tier { font-size: 14px; color: var(--c); }

  /* 인게임 툴팁 표 */
  .tt { margin-top: 14px; border: 1px solid var(--color-line2); border-radius: 12px; overflow: hidden; }
  .tr { display: grid; grid-template-columns: 82px 108px 1fr 190px; gap: 10px; align-items: center; padding: 5px 12px; border-top: 1px solid var(--color-line); font-size: 12.5px; }
  .tr:first-child { border-top: 0; }
  .tr.head { background: var(--color-panel2); color: var(--color-tx3); font-size: 11.5px; padding: 8px 12px; }
  .tr:not(.head):nth-child(even) { background: color-mix(in oklab, var(--color-bg2) 55%, transparent); }
  .wk { color: var(--color-tx2); }
  .dt { font-size: 11.5px; color: var(--color-tx3); }
  .c { text-align: center; }
  .r { text-align: right; }
  .tg { color: var(--c); font-weight: 600; }
  .in { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
  .in em { font-style: normal; font-size: 11px; color: var(--color-tx3); width: 24px; }
  .hint { font-size: 11.5px; line-height: 1.6; color: var(--color-tx3); margin: 8px 2px 0; }
  .hint b { color: var(--color-tx2); }

  input[type=text], select {
    font: inherit; font-size: 13px; color: var(--color-tx); color-scheme: dark;
    background: var(--color-panel); border: 1px solid var(--color-line); border-radius: 9px;
    padding: 6px 9px; outline: none; min-width: 0;
  }
  input[type=text] { width: 116px; font-family: var(--font-mono); text-align: right; }
  input:focus, select:focus { border-color: var(--color-lav); }

  .acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
  .btn { appearance: none; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; padding: 9px 15px; border-radius: 11px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx); }
  .btn.primary { background: var(--color-lav); border-color: var(--color-lav); color: #1b1c21; }
  .btn:disabled { opacity: .45; cursor: default; }
  .chip { appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; padding: 9px 13px; border-radius: 11px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2); }
  .chip:hover:not(:disabled) { color: var(--color-tx); border-color: var(--color-line2); }
  .err { font-size: 12.5px; color: var(--color-bad); margin: 10px 0 0; }
  .label { font-size: 12px; color: var(--color-tx3); margin: 18px 0 7px; }
  .fold {
    width: 100%; appearance: none; cursor: pointer; font: inherit; text-align: left;
    display: flex; align-items: center; gap: 8px; padding: 9px 12px; margin-bottom: 12px;
    border-radius: 11px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2);
  }
  .fold:hover { border-color: var(--color-line2); color: var(--color-tx); }
  .fold b { font-size: 12.5px; font-weight: 600; flex: none; }
  .fold small { margin-left: auto; font-size: 11.5px; color: var(--color-tx3); text-align: right; }
  .arw { width: 14px; height: 14px; flex: none; color: var(--color-tx3); transition: transform .2s; }
  .arw.open { transform: rotate(90deg); }
  .foot-btns { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  .grid { border: 1px solid var(--color-line); border-radius: 12px; overflow: hidden; }
  .r2 { display: grid; grid-template-columns: minmax(96px, 1.3fr) 1fr 1fr 124px 86px; gap: 8px; align-items: center; padding: 5px 11px; border-top: 1px solid var(--color-line); font-size: 12.5px; }
  .r2:first-child { border-top: 0; }
  .r2.head { background: var(--color-panel2); color: var(--color-tx3); font-size: 11.5px; padding: 8px 11px; }
  .r2.zero { color: var(--color-tx3); }
  .r2.bad { background: color-mix(in oklab, var(--color-bad) 12%, transparent); }
  .r2.warn { background: color-mix(in oklab, var(--color-peach) 11%, transparent); }
  .n { text-align: right; }
  .r2 .dim { color: var(--color-tx3); }
  .wk2 { font-size: 11.5px; }
  .tm { font-size: 11.5px; color: var(--color-tx3); text-align: right; }
  .r2 input { width: 100%; padding: 5px 8px; font-size: 12.5px; }
  .msg { margin: 0; padding: 4px 11px 8px; font-size: 11.5px; color: var(--color-peach); background: color-mix(in oklab, var(--color-peach) 11%, transparent); }
  .msg.bad { color: var(--color-bad); background: color-mix(in oklab, var(--color-bad) 12%, transparent); }

  .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
  .sum { font-size: 13px; color: var(--color-tx2); }
  .sum b { font-size: 16px; color: var(--color-tx); }
  .sum small { color: var(--color-tx3); font-size: 12px; }
</style>
