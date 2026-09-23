<script lang="ts">
  import { onMount } from 'svelte'
  import { C, REDUCED, hexA } from '../format'

  let cv: HTMLCanvasElement

  onMount(() => {
    const ctx = cv.getContext('2d')!
    const blobs = [
      { c: C.lav, x: 0.15, y: 0.1, r: 0.42, sx: 0.00011, sy: 0.00007 },
      { c: C.mint, x: 0.85, y: 0.25, r: 0.36, sx: 0.00008, sy: 0.00012 },
      { c: C.peach, x: 0.6, y: 0.85, r: 0.34, sx: 0.00012, sy: 0.00009 },
      { c: C.rose, x: 0.3, y: 0.65, r: 0.3, sx: 0.00009, sy: 0.00011 },
    ]
    // 블러를 걸 거라 1/4 해상도로 충분하다
    const size = () => { cv.width = innerWidth / 4; cv.height = innerHeight / 4 }
    size()
    addEventListener('resize', size)
    let raf = 0
    const frame = (t: number) => {
      const w = cv.width, h = cv.height
      ctx.clearRect(0, 0, w, h)
      blobs.forEach((b, i) => {
        const x = (b.x + Math.sin(t * b.sx + i) * 0.12) * w
        const y = (b.y + Math.cos(t * b.sy + i * 2) * 0.1) * h
        const r = b.r * Math.max(w, h)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, hexA(b.c, 0.26))
        g.addColorStop(1, hexA(b.c, 0))
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      })
      if (!REDUCED && !document.hidden) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const vis = () => { if (!document.hidden && !REDUCED) raf = requestAnimationFrame(frame) }
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', size)
      document.removeEventListener('visibilitychange', vis)
    }
  })
</script>

<canvas bind:this={cv} aria-hidden="true"></canvas>
<div class="grain" aria-hidden="true"></div>

<style>
  canvas { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; filter: blur(70px) saturate(120%); opacity: .55; }
  .grain {
    position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: .05;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
</style>
