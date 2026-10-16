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
      title: '목표 계획과 효율표가 새로워졌어요',
      img: 'notice/plan-week.webp', alt: '목표 계획의 이번 주 카드',
      now: [
        '쓰시면서 남겨 주신 의견을 모아 목표 계획과 효율표를 크게 손봤어요.',
        '계획은 세운 그대로 지키고, 효율표에서는 <b>한 주에 무엇을 어떻게 충전해서 사고, 얼마를 돌려받고, 실제로 얼마를 썼는지</b>를 한눈에 볼 수 있게 했어요.',
        '바뀐 점을 몇 장으로 정리했어요. 넘겨 가며 봐 주세요.',
      ],
    },
    {
      title: '계획은 세운 그대로, 이번 주는 낸 만큼만 줄어요',
      img: 'notice/plan-table.webp', alt: '주차별 계획에서 이번 주가 완료로 표시된 모습',
      before: '결제할 때마다 남은 금액을 모든 주에 다시 나눠서, 이번 주에 결제해도 이번 주 목표가 그만큼 줄지 않았어요.',
      now: [
        '세운 계획은 그대로 두고, <b>낸 금액만큼 이번 주 목표에서 빠져요.</b> 블랙이라 이월로 쌓인 결제도 낸 금액으로 쳐요.',
        '목요일이 지나면 지난 주를 판정해 기록으로 남기고, 다 채운 주는 표에 <b>✓ 완료</b>로 보여 드려요.',
        '더 냈으면 남은 주에 반영할지 고를 수 있고, 못 채웠으면 남은 주에 다시 나눠요.',
      ],
    },
    {
      title: '효율표는 위는 설정, 아래는 결과',
      img: 'notice/eff-nav.webp', alt: '주 옮기기 카드',
      before: '계획의 모든 주를 한꺼번에 계산해서 표가 길고 한눈에 안 들어왔어요.',
      now: [
        '이번 주에 <b>더 낼 금액만</b> 계산해요.',
        '아래 <b>◀ 이번 주 ▶</b>로 지난 주 결산과 다음 주 미리 보기를 넘겨 볼 수 있어요. 가운데 글자를 누르면 원하는 주로 바로 가요.',
        '아래로 내려가면 주 옮기기 카드가 화면 위에 붙어 따라와요.',
      ],
    },
    {
      title: '구매내역으로 주마다 결산이 나와요',
      img: 'notice/eff-table.webp', alt: '구매내역 결산 표',
      now: [
        '구매내역을 가져오면 그 주에 산 것이 아이템별로 정리돼요. 파워엘릭서처럼 묶음만 다른 건 한 줄로 합쳐요.',
        '<b>용도</b>(작용·선물식·메소마켓·회수 없음)는 이름으로 먼저 짐작해요. 다르면 골라 주시고, 묶인 줄은 ▸로 펼쳐서 건마다 바꿀 수 있어요.',
        '점선 밑줄 친 <b>그 주 시세</b>는 눌러서 고칠 수 있어요. 산 서버도 구매번호로 알아내요(모르는 서버는 ✎를 눌러 골라 주세요).',
      ],
    },
    {
      title: '충전부터 실제로 쓴 돈까지 한 줄로',
      img: 'notice/eff-flow.webp', alt: '결산 오른쪽 흐름 요약',
      now: [
        '결산 오른쪽에 <b>충전 → 얻은 메소 → 판 돈 → 총 회수 → 회수율 → 실제로 쓴 돈</b>이 차례로 나와요.',
        '충전에 든 현금은 실제로 충전에 쓴 돈 전부를 보여 드리고, 회수율은 작에 쓴 몫으로만 계산해요.',
        '지난 주는 오른쪽 위 <b>적기/고치기</b>로 그 주 충전을 적을 수 있어요. 안 적으면 계산값으로 보여 드려요.',
      ],
    },
    {
      title: '충전은 이번 주에 한 것만 적으면 돼요',
      img: 'notice/eff-cash.webp', alt: '캐시는 얼마에 칸',
      before: '상품권 남은 한도를 매번 직접 적어야 했어요.',
      now: [
        '결제수단마다 <b>이번 주 충전</b>만 적으면 그대로 계산해요. 모자라는 만큼만 남은 한도 안에서 추천해요.',
        '상품권은 월 20만 한도예요. 이번 달 이미 충전한 금액은 <b>밑줄 친 숫자</b>를 눌러 고쳐요.',
        '캐시 잔액도 충전과 구매내역으로 저절로 계산돼요.',
      ],
    },
    {
      title: '메소마켓과 크레딧도 실제처럼',
      img: 'notice/eff-credit.webp', alt: '크레딧샵에서 산 것과 크레딧 흐름',
      now: [
        '메소마켓은 <b>1억 단위</b>로만 살 수 있어서, 딱 안 떨어져 남는 메포까지 계산에 넣었어요. 메소 칸을 눌러 실제로 산 메소를 적을 수도 있어요.',
        '크레딧은 구매로 쌓이는 만큼 자동으로 늘어요. 크레딧샵에서 큐브를 샀다면 <b>+ 크레딧샵에서 산 것 적기</b>로 적어 주세요. 판 돈이 그 주 회수에 들어가요.',
      ],
    },
    {
      title: '처음 한 번만 맞춰 주세요',
      now: [
        '<b>2번 칸의 캐시 잔액</b>과 <b>5번 칸의 지금 남은 크레딧</b>을 게임 안 숫자와 한 번 맞춰 주세요. 그다음부터는 저절로 계산돼요.',
        '이번 달에 이미 상품권을 쓰셨다면 2번 칸 상품권 아래 숫자를 눌러 넣어 주세요.',
        '쓰시다가 이상한 점이 있으면 문의 게시판에 남겨 주세요. 늘 감사합니다.',
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
        <div class="sl" use:slide>
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
    width: 100%; max-width: 640px; max-height: calc(100% - 32px); overflow-y: auto;
    background: var(--color-panel); border: 1px solid var(--color-line2); border-radius: 24px;
    padding: 18px 24px 18px; box-shadow: 0 30px 80px -30px rgba(0, 0, 0, .8);
    display: grid; gap: 12px; touch-action: pan-y;
  }
  .top { display: flex; align-items: center; gap: 10px; }
  .tag { font-size: 11.5px; font-weight: 600; color: var(--color-mint); padding: 2px 10px; border-radius: 999px; background: color-mix(in oklab, var(--color-mint) 16%, transparent); }
  .count { font-size: 12px; color: var(--color-tx3); }
  .skip { margin-left: auto; appearance: none; border: 0; background: none; font: inherit; font-size: 12.5px; color: var(--color-tx3); cursor: pointer; }
  .skip:hover { color: var(--color-tx); }
  .sl { display: grid; gap: 12px; min-height: 380px; align-content: start; }
  h2 { font-family: var(--font-display); font-weight: 400; font-size: 21px; margin: 0; text-wrap: balance; }
  .shot { border-radius: 14px; overflow: hidden; border: 1px solid var(--color-line); background: var(--color-bg2); display: grid; place-items: center; }
  .shot img { display: block; width: 100%; max-height: 260px; object-fit: contain; }
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
    .sl { min-height: 0; }
    .acts { flex-direction: column-reverse; }
    .acts :global(.btn) { width: 100%; justify-content: center; }
  }
</style>
