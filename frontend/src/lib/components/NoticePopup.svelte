<script lang="ts">
  /**
   * 한 번 확인하면 다시 안 뜨는 공지. 새 공지를 띄우려면 ID를 바꾼다.
   * 2026-09-29: 넥슨 MVP 블랙 이월 중복 적립 버그(9/17~9/24 오전) — 후속 조치 공지 전이라 숫자가 다를 수 있다
   * 2026-09-30: 넥슨이 9/29 차감을 끝냈다. 계산을 고쳤고, 블랙이던 사람은 PC방 보정을 다시 해 달라
   * 2026-10-16: 목표 계획 · 효율표 개편. 넘겨 보는 안내 카드(캡처는 public/notice)
   */
  import gsap from 'gsap'
  import { REDUCED } from '../format'
  import { app } from '../store.svelte'

  const ID = 'plan-eff-20261016'
  const KEY = 'maplemvp.notice'
  let open = $state((() => { try { return localStorage.getItem(KEY) !== ID } catch { return true } })())

  interface Slide { title: string; img?: string; alt?: string; before?: string; now: string[] }
  const SLIDES: Slide[] = [
    {
      title: '목표 계획, 이제 손으로 안 고쳐도 돼요',
      img: 'notice/plan-week.webp', alt: '목표 계획의 이번 주 카드',
      now: [
        '구매내역을 가져오면 <b>낸 만큼 이번 주 목표에서 저절로 빠져요.</b>',
        '목요일이 지나면 다음 주로 넘어가고, 모자란 금액은 남은 주에 다시 나눠요.',
      ],
    },
    {
      title: '효율표는 이번 주만 보여 줘요',
      img: 'notice/eff-cash.webp', alt: '2번 칸 결제수단과 이번 주 충전',
      now: [
        '이번 주에 <b>얼마를 어떻게 충전해서 무엇을 사면 얼마가 돌아오는지</b> 바로 보여요.',
        '이번 주에 충전한 금액만 적으면 돼요.',
      ],
    },
    {
      title: '지난 주는 결산으로 확인해요',
      img: 'notice/eff-nav.webp', alt: '주 옮기기 카드와 결산 요약',
      now: [
        '<b>◀ ▶</b>로 지난 주나 목표를 채운 주를 열면 <b>실제로 쓴 돈과 회수율</b>이 나와요.',
      ],
    },
    {
      title: '캐시 잔액·크레딧은 자동으로',
      now: [
        '충전과 구매내역으로 <b>캐시 잔액과 남은 크레딧이 저절로 계산돼요.</b>',
        '처음 한 번만 <b>2번 칸 캐시 잔액</b>과 <b>5번 칸 남은 크레딧</b>을 게임 안 숫자에 맞춰 주세요.',
      ],
    },
  ]

  let i = $state(0)
  const s = $derived(SLIDES[i])
  const last = $derived(i === SLIDES.length - 1)

  function close() {
    try { localStorage.setItem(KEY, ID) } catch { /* 막혀 있으면 이번만 */ }
    open = false
  }
  function toEff() { close(); app.view = 'eff' }
  const go = (d: number) => { i = Math.max(0, Math.min(SLIDES.length - 1, i + d)) }
  function onkey(e: KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowRight') go(1)
    else if (e.key === 'ArrowLeft') go(-1)
  }
  // 손가락으로 밀어서 넘기기
  let x0 = 0
  const down = (e: PointerEvent) => { x0 = e.clientX }
  const up = (e: PointerEvent) => { const dx = e.clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1) }

  function pop(node: HTMLElement) {
    if (!REDUCED) gsap.from(node, { y: 20, scale: 0.97, opacity: 0, duration: 0.5, ease: 'back.out(1.6)' })
  }
  function slide(node: HTMLElement) {
    if (!REDUCED) gsap.from(node, { opacity: 0, x: 18, duration: 0.3, ease: 'power2.out' })
  }
</script>

<svelte:window onkeydown={onkey} />

{#if open}
  <div class="scrim" role="dialog" aria-modal="true" aria-labelledby="notice-title">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="box" use:pop onpointerdown={down} onpointerup={up}>
      <div class="top">
        <span class="tag">업데이트 안내</span>
        <span class="count mono">{i + 1} / {SLIDES.length}</span>
        <button class="skip" onclick={close}>{last ? '닫기' : '건너뛰기'}</button>
      </div>
      {#key i}
        <div class="sl" class:bare={!s.img} use:slide>
          <h2 id="notice-title">{s.title}</h2>
          {#if s.img}<div class="shot"><img src={s.img} alt={s.alt} loading="eager" /></div>{/if}
          {#if s.before}<p class="was"><span>전에는</span>{s.before}</p>{/if}
          <ul class="now">
            {#each s.now as t, k (k)}<li>{@html t}</li>{/each}
          </ul>
        </div>
      {/key}
      <div class="dots" role="tablist" aria-label="안내 장">
        {#each SLIDES as _, k (k)}<button role="tab" aria-selected={k === i} aria-label="{k + 1}번째 장" class:on={k === i} onclick={() => (i = k)}></button>{/each}
      </div>
      <div class="acts">
        {#if i > 0}<button class="btn" onclick={() => go(-1)}>이전</button>{/if}
        {#if last}
          <button class="btn" onclick={close}>확인했습니다</button>
          <button class="btn primary" onclick={toEff}>효율표 보러 가기</button>
        {:else}
          <button class="btn primary" onclick={() => go(1)}>다음</button>
        {/if}
      </div>
      <div class="fine">2026년 10월 16일 · 확인하시면 다시 표시되지 않습니다</div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 60;
    display: grid; place-items: center; padding: 16px;
    background: var(--color-scrim, rgba(20, 21, 26, .7));
    background: color-mix(in oklab, var(--color-scrim, #14151a) 72%, transparent);
    backdrop-filter: blur(8px);
  }
  .box {
    width: 100%; max-width: 640px; max-height: calc(100dvh - 32px); overflow: hidden;
    background: var(--color-panel); border: 1px solid var(--color-line2); border-radius: 24px;
    padding: 18px 24px 18px; box-shadow: 0 30px 80px -30px rgba(0, 0, 0, .8);
    display: flex; flex-direction: column; gap: 12px; touch-action: pan-y;
  }
  .top { display: flex; align-items: center; gap: 10px; }
  .tag { font-size: 11.5px; font-weight: 600; color: var(--color-mint); padding: 2px 10px; border-radius: 999px; background: color-mix(in oklab, var(--color-mint) 16%, transparent); }
  .count { font-size: 12px; color: var(--color-tx3); }
  .skip { margin-left: auto; appearance: none; border: 0; background: none; font: inherit; font-size: 12.5px; color: var(--color-tx3); cursor: pointer; }
  .skip:hover { color: var(--color-tx); }
  /* 장 길이만큼만 차지한다(빈 여백 없이). 화면이 낮으면 이 칸만 줄고(안에서 스크롤) 아래 단추는 늘 보인다 */
  .sl { flex: 0 1 auto; min-height: 0; overflow-y: auto; display: grid; gap: 12px; align-content: start; }
  .top, .dots, .acts, .fine { flex: none; }
  .sl.bare { text-align: center; padding: 18px 0; }
  .sl.bare .now { list-style: none; padding: 0; gap: 10px; }
  .sl.bare .now li { font-size: 15px; }
  h2 { font-family: var(--font-display); font-weight: 400; font-size: 21px; margin: 0; text-wrap: balance; }
  .shot { border-radius: 14px; overflow: hidden; border: 1px solid var(--color-line); background: var(--color-bg2); display: grid; place-items: center; }
  .shot img { display: block; width: 100%; max-height: min(220px, 30dvh); object-fit: contain; }
  .was { margin: 0; font-size: 13px; line-height: 1.6; color: var(--color-tx3); padding: 8px 12px; border-radius: 10px; background: var(--color-bg2); }
  .was span { display: inline-block; margin-right: 8px; font-size: 11px; font-weight: 600; color: var(--color-peach); }
  .now { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
  .now li { font-size: 13.5px; line-height: 1.65; color: var(--color-tx2); }
  .now :global(b) { color: var(--color-tx); font-weight: 600; }
  .dots { display: flex; justify-content: center; gap: 6px; }
  .dots button { appearance: none; border: 0; width: 7px; height: 7px; padding: 0; border-radius: 999px; background: var(--color-line2); cursor: pointer; transition: width .2s, background .2s; }
  .dots button.on { width: 20px; background: var(--color-lav); }
  .acts { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  .fine { font-size: 11.5px; color: var(--color-tx3); text-align: center; }
  @media (max-width: 420px) {
    .box { padding: 16px; }
    .sl { flex-basis: auto; }
    .acts { flex-direction: column-reverse; }
    .acts :global(.btn) { width: 100%; justify-content: center; }
  }
</style>
