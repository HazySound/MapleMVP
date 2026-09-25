<script lang="ts">
  import { app, getBase, pcroomClear, pcroomSave, pcroomScan } from '../store.svelte'
  import { anchor, compare, restore } from '../core/pcroom'
  import { type Solved, acceptReading, panelFields, solveScan, whyReject } from '../core/scan'
  import HelpModal from './HelpModal.svelte'
  import { STAGE, type ShareHandle, type ShareStatus, canShare, startShare } from '../web/share'
  import { primeChime } from '../web/chime'
  import { type Guide, canGuide, openGuide } from '../web/pip'
  import type { PcRoomResult, Tier } from '../types'
  import { TIER_COLOR, TIER_INK_VAR, addDays, md, spotlight, won } from '../format'
  import { tip } from '../tip'

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

  /** 넣은 숫자로 주차별 PC방 반영액을 뽑는다. 규칙은 core/pcroom에 있다. */
  function calc() {
    error = ''
    edited = {}
    const b = getBase()
    if (!b) return
    const [tierTh, total] = anchor(d.tiers.map(t => t.th), nextIndex, num(remainText))
    const r = restore(needTexts.map(num), tierTh, total, keepText.trim() ? num(keepText) : null)
    if (!r.ok) {
      result = null
      error = r.issues.join(' ')
      openInput = true
      return
    }
    const gaps = compare(r.weeks, b.purchases, b.starts)
    result = {
      ok: gaps.every(g => g.ok),
      issues: gaps.filter(g => g.note).map(g => g.note),
      rows: gaps.map(g => ({ start: g.start, end: addDays(g.start, 6), nexon: g.nexon,
                             spent: g.collected, amount: g.amount, minutes: g.minutes,
                             note: g.note, warn: g.warn })),
      total, tierTh, pcTotal: gaps.reduce((s, g) => s + g.amount, 0),
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
  let scanMsg = $state('')
  let scanBad = $state(false)
  let scanPartial = $state(false)
  let scanning = $state(false)
  let prev: Solved | null = null   // 먼저 읽어 둔 값 (두 장에 나눠 찍을 때 이어 붙인다)
  // 읽어온 값은 확인용이라 기본은 접어 둔다. 중요한 건 아래 보정 결과다
  let openInput = $state(false)
  const doneCount = $derived(needTexts.filter(t => t.trim() !== '').length)
  const summary = $derived(
    doneCount === 0 ? '아직 비어 있어요 · 펼치면 직접 넣을 수 있어요'
      : `${curTier?.name ?? '등급 미정'} · ${remainText || '?'} 캐시 · ${doneCount}/12줄`)

  async function grab(dataUrl = '') {
    scanning = true
    scanBad = scanPartial = false
    try {
      const b = getBase()
      const raw = await pcroomScan(dataUrl, prev?.scale ?? 0)
      if (!b || !raw.ok) {
        scanBad = true
        scanMsg = raw.message || '이미지를 읽지 못했어요.'
        return
      }
      const s = solveScan(raw, b.purchases, prev)
      if (!s) {
        scanBad = true
        // 왜 실패했는지 말해 주지 않으면 매번 처음부터 원인을 찾게 된다
        const ok = raw.readings.filter(v => acceptReading(v, b.purchases)).length
        scanMsg = !raw.readings.length
          ? `12줄 표를 찾지 못했어요. MVP 패널 위에 마우스를 올린 채로 찍어 주세요. `
            + `(화면에서 숫자 ${raw.amounts.length}개만 봤어요)`
          : ok
            ? `표는 읽었는데 어느 값이 맞는지 가릴 수 없었어요. `
              + `(후보 ${raw.readings.length}개 중 ${ok}개 통과, 숫자 ${raw.amounts.length}개)`
            : `표는 찾았는데 구매내역과 맞지 않아요. ${whyReject(raw.readings[0], b.purchases)}`
        return
      }
      apply(s)
    } finally {
      scanning = false
    }
  }

  /** 읽어낸 값을 입력칸에 넣는다. 캡처로 읽든 화면공유로 읽든 같다. */
  function apply(s: Solved) {
    prev = s
    needTexts = s.needs.map(v => v.toLocaleString('ko-KR'))
    const f = panelFields(s)
    nextIndex = f.tierIndex
    if (f.remaining != null) remainText = f.remaining.toLocaleString('ko-KR')
    if (s.total == null) {
      scanPartial = true
      scanMsg = "툴팁 12줄은 읽었어요. 상단 '○○ 등급까지'가 가려져 있어서 가장 오래된 주만 "
        + '알 수 없어요. 마우스를 치우고 한 장 더 찍어 주세요.'
    } else {
      scanPartial = false
      scanMsg = `읽었어요. 지금 13주 합계 ${s.total.toLocaleString('ko-KR')}원`
      calc()
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

  /** 붙여넣기 단추. 브라우저는 사용자가 누를 때만 클립보드를 열어 준다. */
  async function pasteFromClipboard() {
    scanning = true
    scanBad = scanPartial = false
    try {
      const items = await navigator.clipboard.read()
      for (const it of items) {
        const type = it.types.find(t => t.startsWith('image/'))
        if (!type) continue
        const blob = await it.getType(type)
        scanning = false
        fromFile(new File([blob], 'capture.png', { type }))
        return
      }
      scanBad = true
      scanMsg = '클립보드에 이미지가 없어요. 게임 화면에서 PrintScreen을 눌러 주세요.'
    } catch {
      scanBad = true
      scanMsg = '클립보드를 열지 못했어요. 권한을 허용하거나 Ctrl+V로 붙여넣어 주세요.'
    } finally {
      scanning = false
    }
  }

  // ---- 화면공유로 읽기 ----
  // 캡처 한 장에 다 담으려면 툴팁이 상단 패널을 가리지 않게 커서를 맞춰야 한다.
  // 화면을 계속 받으면 마우스를 올렸다 치우는 것만으로 둘 다 모인다.
  let sharing = $state(false)
  let shareState = $state<ShareStatus | null>(null)
  let stream = $state<MediaStream | null>(null)
  let screen = $state<HTMLVideoElement | null>(null)
  let handle: ShareHandle | null = null
  // 게임 위에 띄우는 안내 창. 열렸으면 화면을 못 봐도 지금 상황이 보인다
  let guided = $state(false)
  // 화면공유가 주된 길이다. 캡처는 그게 안 되는 자리를 위한 대비책
  const live1st = $derived(app.web && canLive)
  let showHelp = $state(false)
  // 모바일 브라우저에는 화면 공유가 없다
  const canLive = canShare() && !matchMedia('(pointer: coarse)').matches

  /** 안내 창이 처음에 못 열렸을 때. 누른 직후여야 열린다 */
  async function showGuide() {
    const g: Guide | null = await openGuide(() => handle?.stop(), () => handle?.save())
    guided = !!g
    handle?.setGuide(g)
  }

  $effect(() => {
    if (screen && stream) {
      screen.srcObject = stream
      screen.play().catch(() => {})
    }
  })

  // 공유를 시작하면 브라우저 창을 떠나 게임으로 가야 해서, 지금 무엇을 할 차례인지
  // 한눈에 보여야 한다. 진행에 따라 저절로 다음 줄로 넘어간다.
  const tell = $derived(guided ? '게임 위 안내 창과 소리로' : '소리로')
  const LIVE_STEPS = $derived([
    '공유 창에서 게임이 있는 화면을 고르세요',
    `게임에서 MVP 패널을 열고 그 위에 마우스를 올려 두세요 (읽으면 ${tell} 알려 드려요)`,
    `마우스를 패널 밖으로 치우세요 (다 읽으면 ${tell} 알려 드려요)`,
  ])
  const liveStep = $derived(
    !shareState?.shots ? 0 : !shareState.needs ? 1 : 2)

  // 화면에 적는 말과 알림으로 보내는 말이 같아야 한다. 둘 다 share의 판단을 쓴다
  const liveBlank = $derived(!!shareState?.shots && shareState.stage === 'blank')
  const liveHint = $derived(
    !shareState?.shots ? '공유할 화면을 고르면 시작돼요.' : STAGE[shareState.stage].body)

  async function live() {
    const b = getBase()
    if (!b || sharing) return
    primeChime()   // 누른 이 순간에 열어 둬야 브라우저가 소리를 허락한다
    scanBad = scanPartial = false
    scanMsg = ''
    shareState = null
    try {
      handle = await startShare({
        collected: b.purchases,
        guide: async () => {
          const g = await openGuide(() => handle?.stop(), () => handle?.save())
          guided = !!g
          return g
        },
        onStream: s => (stream = s),
        onState: s => (shareState = s),
        onDone: s => apply(s),
        onStop: reason => {
          sharing = false
          guided = false
          stream = null
          handle = null
          if (reason) {
            scanBad = true
            scanMsg = `화면을 읽는 중에 끊겼어요. ${reason}`
          } else if (shareState?.solved) {
            // apply가 이미 채웠다
          } else if (shareState?.partial) {
            apply(shareState.partial)   // 12줄까지는 건졌다
          } else {
            scanBad = true
            scanMsg = !shareState?.shots ? '읽기 전에 멈췄어요.' : STAGE[shareState.stage].body
          }
        },
      })
      sharing = true
    } catch (e) {
      // 공유 창에서 취소한 것은 잘못이 아니다
      const name = (e as Error)?.name
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        scanBad = true
        scanMsg = '화면 공유를 시작하지 못했어요. 브라우저가 지원하지 않거나 권한이 막혀 있어요.'
      }
    }
  }

  // 창을 닫으면 공유도 끊는다
  $effect(() => () => handle?.stop())
</script>

{#if showHelp}<HelpModal web={app.web && canLive} onClose={() => (showHelp = false)} />{/if}

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
      <button class="help" onclick={() => (showHelp = true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.9 2.9 0 1 1 3.6 3.1c-.6.2-.8.7-.8 1.3v.4"/><path d="M12 17.2h.01"/></svg>
        사용법
      </button>
      <button class="x" onclick={() => (app.showPcRoom = false)} aria-label="닫기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </header>

    <div class="body">
      <p class="why">
        프리미엄 PC방 접속분은 6분마다 100캐시씩 MVP 금액에 반영되는데 구매내역에는 잡히지 않아요.
        인게임 <b>MVP 패널</b>만 보여 주시면 읽어 드려요.
      </p>

      <section class="cap" aria-label="캡처로 불러오기"
        ondragover={e => e.preventDefault()}
        ondrop={e => { e.preventDefault(); fromFile(e.dataTransfer?.files?.[0]) }}>
        <div class="capmain">
          {#if live1st}
            <b>화면을 공유하면 알아서 읽어 드려요</b>
            <span>게임에서 MVP 패널을 열고 <b>그 위에 마우스를 올렸다 치우기만</b> 하면 돼요.
              게임 위에 작은 안내 창이 떠서 지금 무엇을 할 차례인지 알려 줍니다.</span>
            <span class="alt">캡처를 직접 찍어 붙여넣어도 돼요 —
              <kbd>Ctrl</kbd>+<kbd>V</kbd>, 끌어다 놓기, 파일 선택 모두 됩니다.</span>
          {:else}
            <b>게임에서 <kbd>PrintScreen</kbd>을 누른 뒤</b>
            <span>MVP 패널을 열고 그 위에 마우스를 올린 채로 찍어 주세요.
              {#if app.web}여기에 <kbd>Ctrl</kbd>+<kbd>V</kbd> 하거나 이미지를 끌어다 놓으면 읽어 드려요.
              {:else}이미지를 끌어다 놓거나 <kbd>Ctrl</kbd>+<kbd>V</kbd>도 돼요.{/if}</span>
          {/if}
        </div>
        {#if live1st}
          <button class="btn primary" disabled={scanning || sharing} onclick={live}>화면 공유로 읽기</button>
        {/if}
        <button class="btn" class:primary={!live1st} disabled={scanning}
          onclick={() => (app.web ? pasteFromClipboard() : grab())}>
          {#if scanning}<span class="spin" aria-hidden="true"></span>{/if}
          {scanning ? '읽는 중…' : '붙여넣기'}
        </button>
        <label class="chip file" class:off={scanning}>
          파일 선택
          <input type="file" accept="image/*" disabled={scanning} onchange={e => fromFile(e.currentTarget.files?.[0])} />
        </label>
      </section>

      {#if sharing}
        <section class="live" aria-label="화면 공유로 읽는 중">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={screen} muted playsinline></video>
          <div class="livebody">
            <b><span class="spin small" aria-hidden="true"></span>화면을 읽고 있어요</b>
            <ol class="lsteps">
              {#each LIVE_STEPS as s, i (s)}
                <li class:now={liveStep === i} class:ok={liveStep > i}>{s}</li>
              {/each}
            </ol>
            <span class="hint" class:warn={liveBlank}>{liveHint}</span>
            <div class="marks">
              <span class="mark" class:on={!!shareState?.needs}>툴팁 12줄</span>
              <span class="mark" class:on={!!shareState?.solved}>13주 합계</span>
              <small>{shareState?.shots ?? 0}장 확인</small>
            </div>
          </div>
          {#if !guided && canGuide()}
            <button class="chip call" onclick={showGuide}
              use:tip={'게임 위에 떠 있는 작은 안내 창을 띄워요'}>안내 창 띄우기</button>
          {/if}
          <button class="chip" onclick={() => handle?.stop()}>중지</button>
        </section>
      {/if}

      {#if scanning}
        <p class="scanmsg busy"><span class="spin small" aria-hidden="true"></span>캡처를 읽고 있어요…</p>
      {:else if scanMsg}
        <p class="scanmsg" class:bad={scanBad} class:warn={scanPartial}>{scanMsg}</p>
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
          <b class="tier" style="--c:{curTier ? TIER_INK_VAR[curTier.key] : 'var(--color-tx3)'}">{curTier?.name ?? '등급 없음'}</b>
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
            <span class="c tg" style="--c:{p?.tier ? TIER_INK_VAR[p.tier.key] : 'var(--color-tx3)'}">
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
    background: color-mix(in oklab, var(--color-scrim) 72%, transparent); backdrop-filter: blur(8px);
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
  .help {
    margin-left: auto; appearance: none; cursor: pointer; font: inherit; font-size: 12.5px;
    display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 10px;
    border: 1px solid var(--color-line); background: var(--color-panel2); color: var(--color-tx2);
  }
  .help:hover { color: var(--color-tx); border-color: var(--color-lav); }
  .help svg { width: 15px; height: 15px; }
  .x { appearance: none; width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: grid; place-items: center; border: 1px solid var(--color-line); background: var(--color-panel2); color: var(--color-tx2); }
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
  .capmain .alt { color: var(--color-tx4, var(--color-tx3)); opacity: .8; }
  kbd {
    font: inherit; font-family: var(--font-mono); font-size: 11.5px; padding: 1px 6px;
    border-radius: 6px; border: 1px solid var(--color-line2); background: var(--color-panel2);
  }
  .file { position: relative; overflow: hidden; }
  .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  /* 화면공유로 읽는 동안 */
  .live {
    display: flex; align-items: center; gap: 12px; margin: -4px 0 14px;
    padding: 11px 13px; border-radius: 12px; background: var(--color-bg2);
    border: 1px solid color-mix(in oklab, var(--color-lav) 55%, var(--color-line));
  }
  .live video {
    flex: none; width: 168px; height: 96px; border-radius: 8px; object-fit: contain;
    background: #000; border: 1px solid var(--color-line);
  }
  .livebody { flex: 1 1 220px; min-width: 0; display: grid; gap: 5px; }
  .lsteps { list-style: none; margin: 1px 0 2px; padding: 0; display: grid; gap: 3px; counter-reset: s; }
  .lsteps li {
    position: relative; padding-left: 20px; font-size: 11.5px; line-height: 1.45;
    color: var(--color-tx3); counter-increment: s; transition: color .2s;
  }
  .lsteps li::before {
    content: counter(s); position: absolute; left: 0; top: 1px;
    width: 14px; height: 14px; border-radius: 50%; font-size: 9.5px; line-height: 14px;
    text-align: center; color: var(--color-tx3); background: var(--color-panel2);
    border: 1px solid var(--color-line2);
  }
  .lsteps li.now { color: var(--color-tx); font-weight: 600; }
  .lsteps li.now::before { color: var(--color-on-accent); background: var(--color-lav); border-color: var(--color-lav); }
  .lsteps li.ok { color: var(--color-tx3); }
  .lsteps li.ok::before {
    content: '¹3'; color: var(--color-good);
    border-color: color-mix(in oklab, var(--color-good) 45%, transparent);
    background: color-mix(in oklab, var(--color-good) 14%, transparent);
  }
  .livebody b { display: flex; align-items: center; font-size: 13px; color: var(--color-tx); }
  .hint { font-size: 11.5px; color: var(--color-tx3); line-height: 1.5; }
  .hint.warn { color: var(--color-peach); }
  .marks { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 2px; }
  .mark {
    font-size: 11px; padding: 2px 8px; border-radius: 999px; color: var(--color-tx3);
    border: 1px solid var(--color-line2); background: var(--color-panel2);
    transition: color .2s, border-color .2s, background .2s;
  }
  /* 표시가 켜져도 폭이 변하지 않게 자리를 미리 잡아 둔다 */
  .mark::before { content: '✓ '; opacity: 0; }
  .mark.on::before { opacity: 1; }
  .mark.on {
    color: var(--color-good);
    border-color: color-mix(in oklab, var(--color-good) 45%, transparent);
    background: color-mix(in oklab, var(--color-good) 14%, transparent);
  }
  .marks small { font-size: 11px; color: var(--color-tx3); }

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
  .btn.primary { background: var(--color-lav); border-color: var(--color-lav); color: var(--color-on-accent); }
  .btn:disabled { opacity: .45; cursor: default; }
  .chip { appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; padding: 9px 13px; border-radius: 11px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2); }
  .chip:hover:not(:disabled) { color: var(--color-tx); border-color: var(--color-line2); }
  /* 크기는 그대로 두고 테두리 빛만 번지게 한다 */
  .chip.call {
    color: var(--color-lav); border-color: color-mix(in oklab, var(--color-lav) 65%, transparent);
    animation: call 2.2s ease-out infinite;
  }
  @keyframes call {
    0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-lav) 55%, transparent); }
    70%, 100% { box-shadow: 0 0 0 11px transparent; }
  }
  @media (prefers-reduced-motion: reduce) { .chip.call { animation: none; } }
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
