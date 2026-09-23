<script lang="ts">
  import { app } from '../store.svelte'
  import { planner } from '../plan.svelte'
  import { fit, niceStep, onResize, roundRect } from '../canvas'
  import { C, FONT, TIER_COLOR, hexA, man, md, spotlight, tierColor, tierName, won } from '../format'

  const d = $derived(app.data!)
  const r = $derived(planner.result)
  const target = $derived(d.tiers.find(t => t.key === planner.input?.target)!)

  let cv: HTMLCanvasElement
  let wrap: HTMLDivElement
  let hover = $state<number | null>(null)
  let cols: { x: number; w: number; cx: number; y: number }[] = []

  function draw() {
    if (!cv || !r || r.error) return
    const { ctx, w, h } = fit(cv)
    const tl = r.timeline
    const n = tl.length
    const padL = 76, padR = 14
    const topT = 14, topH = h * 0.56          // 위: 13주 합계
    const botT = topT + topH + 34, botH = h - botT - 40 // 아래: 주별 결제
    const pw = w - padL - padR
    const colW = pw / n
    ctx.clearRect(0, 0, w, h)

    // ---- 위 패널: 13주 합계와 등급 띠 ----
    const peak = Math.max(target.th, ...tl.map(x => x.sum))
    const topV = peak * 1.12
    const Y = (v: number) => topT + topH - (Math.min(v, topV) / topV) * topH
    const bounds = [...d.tiers.map(t => t.th), Infinity]
    d.tiers.forEach((t, i) => {
      if (t.th >= topV) return
      const y1 = Y(t.th), y0 = Y(Math.min(bounds[i + 1], topV))
      const c = TIER_COLOR[t.key]
      const isTarget = t.key === target.key
      ctx.fillStyle = hexA(c, isTarget ? 0.1 : 0.05)
      ctx.fillRect(padL, y0, pw, y1 - y0)
      ctx.strokeStyle = hexA(c, isTarget ? 0.9 : 0.3)
      ctx.lineWidth = isTarget ? 1.5 : 1
      ctx.setLineDash(isTarget ? [6, 4] : [2, 4])
      ctx.beginPath(); ctx.moveTo(padL, y1); ctx.lineTo(w - padR, y1); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = hexA(c, isTarget ? 1 : 0.75)
      ctx.font = `${isTarget ? 600 : 500} 10.5px ${FONT.sans}`
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      ctx.fillText(isTarget ? `${t.name} ${man(t.th)}` : t.name, padL - 8, y1)
    })

    const cx = (i: number) => padL + colW * (i + 0.5)
    const grad = ctx.createLinearGradient(0, topT, 0, topT + topH)
    grad.addColorStop(0, hexA(C.lav, 0.3)); grad.addColorStop(1, hexA(C.lav, 0))
    ctx.beginPath()
    ctx.moveTo(cx(0), Y(0))
    tl.forEach((x, i) => ctx.lineTo(cx(i), Y(x.sum)))
    ctx.lineTo(cx(n - 1), Y(0)); ctx.closePath()
    ctx.fillStyle = grad; ctx.fill()
    ctx.beginPath()
    tl.forEach((x, i) => (i ? ctx.lineTo(cx(i), Y(x.sum)) : ctx.moveTo(cx(i), Y(x.sum))))
    ctx.strokeStyle = C.lav; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke()
    tl.forEach((x, i) => {
      const on = hover === i
      ctx.beginPath(); ctx.arc(cx(i), Y(x.sum), on ? 6 : 4, 0, Math.PI * 2)
      ctx.fillStyle = tierColor(x.tier); ctx.fill()
      if (on) { ctx.strokeStyle = C.tx; ctx.lineWidth = 2; ctx.stroke() }
    })
    if (r.reached != null) {
      const i = r.reached, x = cx(i), y = Y(tl[i].sum)
      ctx.save()
      ctx.shadowColor = hexA(TIER_COLOR[target.key], 0.8); ctx.shadowBlur = 18
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.strokeStyle = TIER_COLOR[target.key]; ctx.lineWidth = 2.5; ctx.stroke()
      ctx.restore()
      ctx.font = `600 11px ${FONT.sans}`; ctx.fillStyle = TIER_COLOR[target.key]
      ctx.textAlign = i > n - 3 ? 'right' : 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(`${target.name} 달성`, i > n - 3 ? x + 8 : x, y - 12)
    }

    // ---- 아래 패널: 주별 계획 결제 (이번 주에 이미 결제한 금액은 위 합계에만 반영) ----
    const maxBar = Math.max(10000, ...tl.map(x => x.amount)) * 1.18
    const step = niceStep(maxBar / 2)
    const topB = Math.ceil(maxBar / step) * step
    const B = (v: number) => (v / topB) * botH
    ctx.font = `10.5px ${FONT.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let v = 0; v <= topB; v += step) {
      const y = botT + botH - B(v)
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke()
      ctx.fillStyle = C.tx3; ctx.fillText(man(v), padL - 8, y)
    }
    const bw = Math.min(46, colW * 0.62)
    cols = []
    tl.forEach((x, i) => {
      const bx = cx(i) - bw / 2
      let y = botT + botH
      if (hover === i) { ctx.fillStyle = 'rgba(255,255,255,.035)'; roundRect(ctx, cx(i) - colW / 2 + 2, topT, colW - 4, botT + botH - topT, 10); ctx.fill() }
      if (x.amount) {
        const hh = B(x.amount); y -= hh
        const col = x.fixed ? C.lav : C.mint
        const g = ctx.createLinearGradient(0, y, 0, y + hh)
        g.addColorStop(0, hexA(col, x.counts ? 0.95 : 0.3)); g.addColorStop(1, hexA(col, x.counts ? 0.35 : 0.1))
        ctx.fillStyle = g; roundRect(ctx, bx, y, bw, hh, Math.min(6, bw / 3, hh / 3)); ctx.fill()
        if (!x.fixed) {
          ctx.save(); ctx.beginPath(); roundRect(ctx, bx, y, bw, hh, Math.min(6, bw / 3, hh / 3)); ctx.clip()
          ctx.strokeStyle = 'rgba(27,28,33,.35)'; ctx.lineWidth = 3
          for (let k = -hh; k < bw; k += 8) { ctx.beginPath(); ctx.moveTo(bx + k, y + hh); ctx.lineTo(bx + k + hh, y); ctx.stroke() }
          ctx.restore()
        }
        ctx.fillStyle = hover === i ? C.tx : C.tx2
        ctx.font = `600 10.5px ${FONT.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.fillText(man(x.amount), cx(i), y - 4)
      }
      ctx.fillStyle = hover === i ? C.tx : C.tx3
      ctx.font = `11px ${FONT.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(i === 0 ? '이번 주' : `${i}주 뒤`, cx(i), botT + botH + 15)
      ctx.font = `10px ${FONT.mono}`; ctx.fillStyle = C.tx3
      ctx.fillText(md(x.start), cx(i), botT + botH + 29)
      cols.push({ x: cx(i) - colW / 2, w: colW, cx: cx(i), y: Y(x.sum) })
    })
    ctx.fillStyle = C.tx3; ctx.font = `11px ${FONT.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('주별 계획 결제', padL, botT - 14)
  }

  $effect(() => { void r; void hover; draw() })

  function move(e: PointerEvent) {
    const x = e.clientX - cv.getBoundingClientRect().left
    const i = cols.findIndex(c => x >= c.x && x < c.x + c.w)
    hover = i < 0 ? null : i
  }

  const tip = $derived.by(() => {
    if (hover == null || !r || !cols[hover]) return null
    const wk = r.timeline[hover], c = cols[hover], tw = 230
    const left = Math.max(0, Math.min((wrap?.clientWidth ?? 0) - tw, c.cx - tw / 2))
    return { wk, left, top: Math.max(0, c.y - 150), tw }
  })
</script>

<article class="card" use:spotlight>
  <h3 class="card-title">주별 흐름 <span class="sub">위: 그 주의 13주 합계 · 아래: 주별 계획 결제</span></h3>
  <div class="chart" bind:this={wrap} use:onResize={draw}>
    <canvas bind:this={cv} onpointermove={move} onpointerleave={() => (hover = null)}></canvas>
    <div class="tip" class:show={!!tip} style="left:{tip?.left ?? 0}px;top:{tip?.top ?? 0}px;width:{tip?.tw ?? 230}px">
      {#if tip}
        <b>{tip.wk.offset === 0 ? '이번 주' : `${tip.wk.offset}주 뒤`}</b>
        <span class="mono" style="color:var(--color-tx3)">{md(tip.wk.start)} – {md(tip.wk.end)}</span>
        <div class="r" style="margin-top:6px"><span>계획 결제 ({tip.wk.fixed ? '고정' : '자동'})</span><span class="mono">{won(tip.wk.amount)}원</span></div>
        {#if tip.wk.drop}<div class="r"><span>이 주 목요일에 빠진 금액</span><span class="mono">−{won(tip.wk.drop)}원</span></div>{/if}
        <div class="r"><span>13주 합계</span><span class="mono">{won(tip.wk.sum)}원</span></div>
        <div class="r"><span>등급</span><span style="color:{tierColor(tip.wk.tier)};font-weight:600">{tierName(d.tiers, tip.wk.tier)}</span></div>
      {/if}
    </div>
  </div>
  <div class="legend">
    <span><i style="background:var(--color-lav)"></i>직접 정한 금액</span>
    <span><i style="background:repeating-linear-gradient(45deg,#95e2c4 0 3px,#4d7a69 3px 6px)"></i>자동 분배</span>
  </div>
</article>

<style>
  .chart { position: relative; margin-top: 10px; }
  canvas { display: block; width: 100%; height: 360px; }
</style>
