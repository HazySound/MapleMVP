<script lang="ts">
  import gsap from 'gsap'
  import { onMount } from 'svelte'
  import { app } from '../store.svelte'
  import { atX, clamp01, easeOut, fit, niceStep, onResize, roundRect } from '../canvas'
  import { C, FONT, REDUCED, addDays, hexA, man, md, spotlight, tierColor, tierName, won } from '../format'

  const d = $derived(app.data!)
  const sim = $derived(app.sim ?? d.sim)
  const data = $derived(d.weeks) // 13주. 첫 주가 다음 목요일에 빠진다

  let cv: HTMLCanvasElement
  let wrap: HTMLDivElement
  let hover = $state<number | null>(null)
  let rects: { x: number; w: number; cx: number; top: number }[] = []
  const anim = { p: REDUCED ? 1 : 0 }

  function draw() {
    if (!cv) return
    const { ctx, w, h } = fit(cv)
    const padL = 54, padR = 8, padT = 22, padB = 42
    const pw = w - padL - padR, ph = h - padT - padB
    const maxV = Math.max(10000, ...data.map(x => x.amount)) * 1.15
    const step = niceStep(maxV / 4)
    const top = Math.ceil(maxV / step) * step
    ctx.clearRect(0, 0, w, h)

    ctx.font = `11px ${FONT.mono}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    for (let v = 0; v <= top; v += step) {
      const y = padT + ph - (v / top) * ph
      ctx.strokeStyle = 'rgba(255,255,255,.055)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke()
      ctx.fillStyle = C.tx3
      ctx.fillText(man(v), padL - 10, y)
    }

    const n = data.length
    const gap = Math.max(4, (pw / n) * 0.28)
    const bw = (pw - gap * (n - 1)) / n
    rects = []
    data.forEach((wk, i) => {
      const x = padL + i * (bw + gap)
      const hh = Math.max(2, (wk.amount / top) * ph * easeOut(clamp01(anim.p * 1.6 - i * 0.05)))
      const y = padT + ph - hh
      const col = i === 0 ? C.peach : i === n - 1 ? C.mint : C.lav
      const faded = 1
      const active = hover === i
      if (active) { ctx.fillStyle = 'rgba(255,255,255,.035)'; roundRect(ctx, x - gap / 2, padT, bw + gap, ph, 8); ctx.fill() }

      const grad = ctx.createLinearGradient(0, y, 0, padT + ph)
      grad.addColorStop(0, hexA(col, active ? 1 : 0.92 * faded))
      grad.addColorStop(1, hexA(col, active ? 0.35 : 0.18 * faded))
      ctx.fillStyle = grad
      roundRect(ctx, x, y, bw, hh, Math.min(7, bw / 3, hh / 3)); ctx.fill()

      if (i === n - 1) {
        // 진행 중인 주: 점선 윤곽
        ctx.setLineDash([3, 4]); ctx.strokeStyle = hexA(col, 0.55); ctx.lineWidth = 1.2
        roundRect(ctx, x, padT + ph * 0.1, bw, ph * 0.9, Math.min(7, bw / 3)); ctx.stroke(); ctx.setLineDash([])
      }
      if (anim.p >= 1 && wk.amount > 0) {
        ctx.fillStyle = active ? C.tx : C.tx2
        ctx.textAlign = 'center'
        ctx.font = `600 10.5px ${FONT.mono}`
        ctx.fillText(man(wk.amount), x + bw / 2, y - 10)
      }
      ctx.textAlign = 'center'
      ctx.fillStyle = active ? C.tx : C.tx3
      ctx.font = `11px ${FONT.sans}`
      ctx.fillText(i === n - 1 ? '이번 주' : `${i + 1}주`, x + bw / 2, padT + ph + 16)
      ctx.font = `10px ${FONT.mono}`
      ctx.fillStyle = C.tx3
      ctx.fillText(md(wk.start), x + bw / 2, padT + ph + 31)
      rects.push({ x: x - gap / 2, w: bw + gap, cx: x + bw / 2, top: y })
    })
  }

  onMount(() => {
    if (!REDUCED) gsap.to(anim, { p: 1, duration: 1.5, delay: 0.35, ease: 'none', onUpdate: draw })
  })
  $effect(() => { void data; void hover; draw() })

  function move(e: PointerEvent) {
    const x = atX(cv, e.clientX)
    const i = rects.findIndex(r => x >= r.x && x < r.x + r.w)
    hover = i < 0 ? null : i
  }

  const tip = $derived.by(() => {
    if (hover == null || !rects[hover]) return null
    const i = hover
    const wk = data[i]
    const after = sim.forecast[i] // forecast[k] = k+1번째 갱신 (그 주까지 빠진 뒤)
    const dropDate = md(addDays(d.deadline, i * 7))
    const note = i === 12
      ? `수요일 23:59까지 더해지고, ${dropDate}(목)에 빠져요`
      : `${dropDate}(목) 갱신 때 빠져요`
    const tw = 236
    const r = rects[i]
    const left = Math.max(0, Math.min((wrap?.clientWidth ?? 0) - tw, r.cx - tw / 2))
    return { i, wk, after, note, left, top: Math.max(0, r.top - 132), tw }
  })
</script>

<article class="card" use:spotlight>
  <h3 class="card-title">주차별 결제 <span class="sub">이번 주 포함 13주 · 막대에 올리면 상세</span></h3>
  <div class="chart" bind:this={wrap} use:onResize={draw}>
    <canvas bind:this={cv} onpointermove={move} onpointerleave={() => (hover = null)}></canvas>
    <div class="tip" class:show={!!tip} style="left:{tip?.left ?? 0}px;top:{tip?.top ?? 0}px;width:{tip?.tw ?? 236}px">
      {#if tip}
        <b>{tip.i === 12 ? '이번 주' : `${tip.i + 1}주차`}</b>
        <span class="mono" style="color:var(--color-tx3)">{md(tip.wk.start)} – {md(tip.wk.end)}</span>
        <div class="r" style="margin-top:6px"><span>결제</span><span class="mono">{won(tip.wk.amount)}원</span></div>
        <div class="r"><span>이 주가 빠진 뒤 합계</span><span class="mono">{won(tip.after.sum)}원</span></div>
        <div class="r"><span>그때 등급</span><span style="color:{tierColor(tip.after.tier)};font-weight:600">{tierName(d.tiers, tip.after.tier)}</span></div>
        <div style="margin-top:6px;color:var(--color-tx3)">{tip.note}</div>
      {/if}
    </div>
  </div>
  <div class="legend">
    <span><i style="background:var(--color-peach)"></i>다음 목요일에 빠지는 주</span>
    <span><i style="background:var(--color-lav)"></i>13주 합계에 들어가는 주</span>
    <span><i style="background:var(--color-mint)"></i>이번 주 (진행 중)</span>
  </div>
</article>

<style>

  .chart { position: relative; margin-top: 12px; }
  canvas { display: block; width: 100%; height: 260px; }
</style>
