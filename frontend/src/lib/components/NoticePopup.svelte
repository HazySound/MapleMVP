<script lang="ts">
  /**
   * 한 번 확인하면 다시 안 뜨는 공지. 새 공지를 띄우려면 ID를 바꾼다.
   * 2026-09-29: 넥슨 MVP 블랙 이월 중복 적립 버그(9/17~9/24 오전) — 후속 조치 공지 전이라 숫자가 다를 수 있다
   * 2026-09-30: 넥슨이 9/29 차감을 끝냈다. 계산을 고쳤고, 블랙이던 사람은 PC방 보정을 다시 해 달라
   */
  import gsap from 'gsap'
  import { REDUCED } from '../format'
  import { go } from '../qna.svelte'

  const ID = 'carry-fix-20260930'
  const KEY = 'maplemvp.notice'
  let open = $state((() => { try { return localStorage.getItem(KEY) !== ID } catch { return true } })())

  function close() {
    try { localStorage.setItem(KEY, ID) } catch { /* 막혀 있으면 이번만 */ }
    open = false
  }
  function report() { close(); go('qna') }

  function pop(node: HTMLElement) {
    if (!REDUCED) gsap.from(node, { y: 20, scale: 0.97, opacity: 0, duration: 0.5, ease: 'back.out(1.6)' })
  }
</script>

{#if open}
  <div class="scrim" role="dialog" aria-modal="true" aria-labelledby="notice-title">
    <div class="box" use:pop>
      <div class="ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.7 2.7L16 9.5"/></svg>
      </div>
      <h2 id="notice-title">블랙 이월 계산 수정 안내</h2>
      <div class="body">
        <p>넥슨이 9/29(화) <b>MVP 블랙 등급의 비정상 반영 금액 차감</b>을 완료했습니다. 이에 맞춰 MapleMVP의 이월 계산도 수정했습니다.</p>
        <p>이제 9/17 이후 <b>블랙 기준(250만 원)을 넘긴 결제는 그 주 실적에 들어가지 않고 이월로만</b> 쌓이며, 이월을 꺼내 쓰는 주의 실적이 됩니다. 두 번 반영되던 금액은 더 이상 계산하지 않습니다.</p>
        <p>블랙 등급이시거나 최근 블랙이셨던 분은 <b class="hl">PC방 보정을 한 번 다시 해 주세요.</b> 넥슨 차감으로 인게임 주별 금액이 바뀌어 이전에 저장한 보정값이 맞지 않을 수 있습니다. 인게임 숫자가 아직 그대로라면 재접속한 뒤에 보정해 주세요.</p>
        <p>그래도 인게임과 수치가 다르다면 <b>문의 게시판</b>에 캡처와 함께 글을 남겨 주세요. 제보해 주신 분들 덕분에 빠르게 확인할 수 있었습니다. 감사합니다.</p>
      </div>
      <div class="acts">
        <button class="btn" onclick={report}>문의 게시판에 제보하기</button>
        <button class="btn primary" onclick={close}>확인했습니다</button>
      </div>
      <div class="fine">2026년 9월 30일 · 확인하시면 다시 표시되지 않습니다</div>
    </div>
  </div>
{/if}

<style>
  /* 사용자가 직접 해야 하는 일. 눈에 띄게 */
  .hl { color: var(--color-peach); }
  .scrim {
    position: fixed; inset: 0; z-index: 60;
    display: grid; place-items: center; padding: 16px;
    background: var(--color-scrim, rgba(20, 21, 26, .7));
    background: color-mix(in oklab, var(--color-scrim, #14151a) 72%, transparent);
    backdrop-filter: blur(8px);
  }
  .box {
    width: 100%; max-width: 480px; max-height: calc(100% - 32px); overflow-y: auto;
    background: var(--color-panel); border: 1px solid var(--color-line2); border-radius: 24px;
    padding: 26px 24px 20px; box-shadow: 0 30px 80px -30px rgba(0, 0, 0, .8);
  }
  .ic {
    width: 52px; height: 52px; margin: 0 auto; border-radius: 16px; display: grid; place-items: center;
    color: var(--color-mint); background: color-mix(in oklab, var(--color-mint) 18%, transparent);
  }
  .ic svg { width: 24px; height: 24px; }
  h2 { font-family: var(--font-display); font-weight: 400; font-size: 20px; margin: 12px 0 12px; text-align: center; text-wrap: balance; }
  .body { display: grid; gap: 10px; }
  .body p { margin: 0; font-size: 13.5px; line-height: 1.65; color: var(--color-tx2); }
  .body b { color: var(--color-tx); font-weight: 600; }
  .acts { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 18px; }
  .fine { margin-top: 12px; font-size: 11.5px; color: var(--color-tx3); text-align: center; }
  @media (max-width: 420px) {
    .acts { flex-direction: column-reverse; }
    .acts :global(.btn) { width: 100%; justify-content: center; }
  }
</style>
