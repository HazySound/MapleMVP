<script lang="ts">
  import gsap from 'gsap'
  import { app, toggleMedal } from '../store.svelte'
  import { fit, onResize } from '../canvas'
  import { C, FONT, REDUCED, TIER_COLOR, TIER_INK, TIER_INK_VAR, TIER_VAR, TOUCH, countup, hexA, spotlight, tierIdx, won } from '../format'
  import Badge from './Badge.svelte'
  import Medal from './Medal.svelte'
  import { tip } from '../tip'

  const d = $derived(app.data!)
  const sim = $derived(app.sim ?? d.sim)
  const base = $derived(sim.total - sim.extra)
  // 자릿수가 늘어나도 게이지를 넘지 않게 글자 크기를 줄인다
  const bigSize = $derived.by(() => {
    const v = sim.total
    if (v < 1_000_000) return 30
    if (v < 10_000_000) return 26
    if (v < 100_000_000) return 22
    if (v < 1_000_000_000) return 19
    return 17
  })
  // 미리보기를 켜면 카드 전체가 그 등급을 보여주는 화면으로 바뀐다
  const preview = $derived(app.previewTier)
  const now = $derived(preview ?? sim.current ?? d.current)
  const previewTh = $derived(preview ? d.tiers.find(t => t.key === preview)!.th : 0)

  function openPreview() {
    app.previewTier = sim.current ?? d.current ?? d.tiers[0].key
  }
  const delta = $derived(tierIdx(d.tiers, sim.next) - tierIdx(d.tiers, now))

  let cv: HTMLCanvasElement
  const g = { base: 0, extra: 0, carry: 0 }
  let filled = false

  const START = Math.PI * 0.75
  const SWEEP = Math.PI * 1.5

  /** 등급 기준 사이를 같은 각도로 나눈 눈금 (0 → 15만 → 30만 → … → 250만) */
  function frac(v: number) {
    const b = [0, ...d.tiers.map(t => t.th)]
    for (let i = 0; i < 6; i++) if (v < b[i + 1]) return (i + (v - b[i]) / (b[i + 1] - b[i])) / 6
    return 1
  }

  /** 등급 색이 이어지는 원뿔형 그라데이션 (조각을 이어 붙이지 않아 경계가 생기지 않는다) */
  function paint(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const turn = SWEEP / (Math.PI * 2)
    const g = ctx.createConicGradient(START, cx, cy)
    g.addColorStop(0, '#5b5f6d')
    d.tiers.forEach((t, i) => g.addColorStop(((i + 1) / 6) * turn, TIER_COLOR[t.key]))
    g.addColorStop(1, TIER_COLOR.black)
    return g
  }

  /** 시작 쪽 둥근 끝만 안쪽으로 당긴다. 진행 끝은 그대로 둬야 흰 점이 끝에 맞는다 */
  function stroke(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, lw: number,
                  from: number, to: number, alpha: number, blur = 0, padStart = true) {
    if (to <= from) return
    const pad = lw / 2 / r                       // 라디안
    const a0 = START + SWEEP * from + (padStart ? pad : 0)
    let a1 = START + SWEEP * to
    if (a1 < a0) a1 = a0
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.strokeStyle = paint(ctx, cx, cy)
    if (blur) ctx.filter = `blur(${blur}px)`
    ctx.beginPath()
    ctx.arc(cx, cy, r, a0, a1)
    ctx.stroke()
    ctx.restore()
  }

  function draw() {
    if (!cv) return
    const { ctx, w, h } = fit(cv)
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 18, lw = Math.max(10, R * 0.11)
    ctx.clearRect(0, 0, w, h)

    const f0 = frac(g.base), f1 = frac(g.base + g.extra), f2 = frac(g.base + g.extra + g.carry)

    // 밝은 바탕에서는 옅게 깔면 있는지도 모른다. 바탕도 글로우도 진하게 올린다
    const light = document.documentElement.dataset.theme === 'light'
    stroke(ctx, cx, cy, R, lw, 0, 1, light ? 0.22 : 0.13)                 // 바탕
    if (!REDUCED) {
      stroke(ctx, cx, cy, R, lw * 0.9, 0, f1, light ? 0.8 : 0.5, lw * (light ? 0.42 : 0.5))
    }
    stroke(ctx, cx, cy, R, lw, 0, f1, 0.45)                               // 시뮬레이션까지 더한 길이
    stroke(ctx, cx, cy, R, lw, 0, f0, 1)                                  // 실제 결제 부분

    if (f2 > f1) {   // 이월 잔액
      ctx.save()
      ctx.globalAlpha = 0.8
      ctx.lineWidth = lw * 0.36
      ctx.lineCap = 'round'
      ctx.strokeStyle = C.butter
      ctx.beginPath()
      ctx.arc(cx, cy, R, START + SWEEP * f1, START + SWEEP * f2)
      ctx.stroke()
      ctx.restore()
    }

    // 등급 이름은 기준 금액 눈금 위치에
    ctx.font = `500 10.5px ${FONT.sans}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    d.tiers.forEach((t, i) => {
      const a = START + (SWEEP * (i + 1)) / 6, rr = R - lw - 24
      const reached = g.base + g.extra + g.carry >= t.th
      // 이름은 카드 바탕 위에 얹히는 글자다. 칠하는 색이 아니라 글자색을 쓴다
      ctx.fillStyle = hexA(TIER_INK[t.key], reached ? 1 : 0.5)
      ctx.fillText(t.name, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * (R - lw / 2 - 4), cy + Math.sin(a) * (R - lw / 2 - 4))
      ctx.lineTo(cx + Math.cos(a) * (R - lw / 2 - 8), cy + Math.sin(a) * (R - lw / 2 - 8))
      ctx.strokeStyle = hexA(TIER_COLOR[t.key], reached ? 0.9 : 0.35)
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

    // 끝점
    const ah = START + SWEEP * f2
    ctx.beginPath()
    ctx.arc(cx + Math.cos(ah) * R, cy + Math.sin(ah) * R, lw * 0.34, 0, Math.PI * 2)
    ctx.fillStyle = C.tx
    ctx.fill()
  }

  $effect(() => {
    void app.theme
    const to = preview
      ? { base: previewTh, extra: 0, carry: 0 }
      : { base, extra: sim.extra, carry: d.carry }
    void now
    if (REDUCED) { Object.assign(g, to); draw(); return }
    const first = !filled
    filled = true
    gsap.to(g, { ...to, duration: first ? 1.8 : 0.35, delay: first ? 0.4 : 0, ease: 'power3.out', overwrite: 'auto', onUpdate: draw })
  })

  // PC방 접속분은 구매내역에 안 잡혀서, 맞추기 전까지는 인게임 숫자와 다르다.
  // 한 번 맞춰 놔도 주가 지나면 새 주가 비므로 다시 어긋난다.
  // 그래서 '아직 모르는 주'가 하나라도 있으면 계속 알린다 — 오랜만에 들어와도 눈에 띈다.
  const needPc = $derived(app.web && !!d.syncedAt && d.pcroom.missing.length > 0)

  /*
   * 보정은 PC에서만 된다.
   *
   * 인게임 화면을 캡처해서 붙여넣거나 화면공유로 읽어야 하는데, 휴대폰에는
   * 메이플도 없고 화면공유도 안 된다. 눌러도 아무것도 못 하는 단추를 띄우면
   * 뭘 잘못한 줄 안다. 맞춰 둔 금액만 보여 주고 고치는 길은 닫는다.
   */
  const canFix = $derived(!(app.web && TOUCH))
</script>

<article class="card grade" use:spotlight>
  <h3 class="card-title">
    MVP 등급
    <button class="tog" aria-pressed={!!preview}
      onclick={() => (preview ? (app.previewTier = null) : openPreview())}>등급 미리보기</button>
    {#if canFix}
      <button class="pc" class:on={!!d.pcroom.total} class:hl={needPc} onclick={() => (app.showPcRoom = true)}
        use:tip={needPc
          ? `프리미엄 PC방 접속분은 구매내역에 안 잡혀요. 13주 중 ${d.pcroom.missing.length}주가 아직 비어 있어요`
          : '프리미엄 PC방 접속분은 구매내역에 안 잡혀요. 인게임 캡처로 보정할 수 있어요'}>
        {#if d.pcroom.total}PC방 +{won(d.pcroom.total)}원{:else}PC방 보정{/if}
      </button>
    {:else if d.pcroom.total}
      <span class="pc tag on"
        use:tip={'PC에서 맞춰 둔 프리미엄 PC방 접속분이에요. 고치는 건 PC에서만 돼요'}>
        PC방 +{won(d.pcroom.total)}원
      </span>
    {/if}
  </h3>

  {#if preview}
    <div class="devrow">
      {#each d.tiers as t (t.key)}
        <button class:on={preview === t.key} style="--c:{TIER_VAR[t.key]};--ink:{TIER_INK_VAR[t.key]}"
          onclick={() => (app.previewTier = t.key)}>{t.name}</button>
      {/each}
    </div>
  {/if}

  <div class="gauge" use:onResize={draw}>
    <canvas bind:this={cv} aria-label="최근 13주 합계 게이지"></canvas>
    <button class="center" onclick={() => !preview && toggleMedal()}
      use:tip={preview ? '미리보기 중' : '클릭하면 합계와 메달이 바뀌어요'}>
      {#if app.medal || preview}
        <Medal tier={now} size={116} />
      {:else}
        <span class="lbl">최근 13주 합계</span>
        <span class="big mono" style="font-size:{bigSize}px" use:countup={sim.total}>0</span>
        <span class="plus mono">
          {#if sim.extra}<span style="color:var(--color-mint)">시뮬레이션 +{won(sim.extra)}</span>{/if}
          {#if d.carry}<span style="color:var(--color-butter)">이월 +{won(d.carry)}</span>{/if}
        </span>
      {/if}
    </button>
  </div>

  <div class="flow">
    {#if preview}
      <div class="col">
        <span class="meta">미리보기</span>
        <Badge tier={now} tiers={d.tiers} />
      </div>
    {:else}
      <div class="col">
        <span class="meta">현재 등급</span>
        <Badge tier={now} tiers={d.tiers} />
      </div>
      <svg class="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      <div class="col">
        <span class="meta">다음 주 예정 등급</span>
        <Badge tier={sim.next} tiers={d.tiers} ghost />
      </div>
    {/if}
  </div>
  {#if !preview}
    <div class="trendline">
      <span class="trend" class:down={delta < 0} class:up={delta > 0}>
        {delta < 0 ? `▼ ${-delta}단계 하락 예정` : delta > 0 ? `▲ ${delta}단계 상승 예정` : '유지 예정'}
      </span>
    </div>
  {/if}
</article>

<style>
  .grade { display: grid; gap: 10px; align-content: start; }
  .gauge { position: relative; width: min(100%, 300px); aspect-ratio: 1; margin: 2px auto 0; }
  .gauge canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .center {
    position: absolute; inset: 17%; appearance: none; border: 0; background: none; cursor: pointer;
    display: grid; place-content: center; justify-items: center; gap: 2px; text-align: center;
    color: inherit; font: inherit; border-radius: 50%;
  }
  .center:hover .lbl { color: var(--color-tx2); }
  .lbl { font-size: 12px; color: var(--color-tx3); transition: color .2s; }
  .pc {
    margin-left: auto; appearance: none; cursor: pointer; font: inherit; font-size: 11.5px;
    padding: 4px 10px; border-radius: 8px; border: 1px solid var(--color-line);
    background: var(--color-bg2); color: var(--color-tx3);
  }
  .pc:hover { color: var(--color-tx); border-color: var(--color-lav); }
  /* 휴대폰에서는 읽는 것만 된다. 누를 것처럼 보이면 안 된다 */
  .pc.tag { cursor: default; }
  .pc.tag:hover { color: var(--color-butter); border-color: color-mix(in oklab, var(--color-butter) 45%, var(--color-line)); }
  .pc.on { color: var(--color-butter); border-color: color-mix(in oklab, var(--color-butter) 45%, var(--color-line)); }
  /* 크기는 그대로 두고 테두리 빛만 번지게 한다 */
  .pc.hl { color: var(--color-lav); border-color: color-mix(in oklab, var(--color-lav) 65%, transparent); animation: call 2.2s ease-out infinite; }
  @keyframes call {
    0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-lav) 50%, transparent); }
    70%, 100% { box-shadow: 0 0 0 10px transparent; }
  }
  @media (prefers-reduced-motion: reduce) { .pc.hl { animation: none; } }
  .tog {
    appearance: none; cursor: pointer; font: inherit; font-size: 11.5px;
    padding: 3px 9px; border-radius: 7px;
    border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx3);
  }
  .tog[aria-pressed="true"] { color: var(--color-lav); border-color: color-mix(in oklab, var(--color-lav) 45%, var(--color-line)); }
  .tog:hover { color: var(--color-tx); }
  .devrow { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
  .devrow button {
    appearance: none; cursor: pointer; font: inherit; font-size: 11.5px; padding: 3px 8px; border-radius: 7px;
    border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx3);
  }
  .devrow button.on { color: var(--ink, var(--color-tx)); border-color: currentColor; }
  .big { font-weight: 700; letter-spacing: -.02em; white-space: nowrap; }
  .plus { font-size: 11.5px; min-height: 18px; display: grid; }

  .flow { display: flex; align-items: flex-end; justify-content: center; gap: 16px; flex-wrap: wrap; }
  .col { display: grid; gap: 5px; justify-items: center; }
  .meta { font-size: 12px; color: var(--color-tx3); }
  .arr { width: 22px; height: 22px; color: var(--color-tx3); margin-bottom: 8px; }
  .trendline { display: flex; justify-content: center; }
  .trend { font-size: 12px; font-weight: 500; padding: 3px 10px; border-radius: 7px; background: var(--color-panel3); color: var(--color-tx2); }
  .trend.down { background: color-mix(in oklab, var(--color-bad) 18%, transparent); color: var(--color-bad); }
  .trend.up { background: color-mix(in oklab, var(--color-good) 18%, transparent); color: var(--color-good); }
</style>
