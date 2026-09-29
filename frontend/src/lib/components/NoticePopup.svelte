<script lang="ts">
  /**
   * 한 번 확인하면 다시 안 뜨는 공지. 새 공지를 띄우려면 ID를 바꾼다.
   * 2026-09-29: 넥슨 MVP 블랙 이월 중복 적립 버그(9/17~9/24 오전) — 후속 조치 공지 전이라 숫자가 다를 수 있다
   */
  import gsap from 'gsap'
  import { REDUCED } from '../format'
  import { go } from '../qna.svelte'

  const ID = 'carry-dup-20260929'
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
      </div>
      <h2 id="notice-title">블랙 이월 중복 적립 이슈 안내</h2>
      <div class="body">
        <p>넥슨 MVP <b>블랙 등급 이월 금액이 중복으로 적립되던 문제</b>(9/17 ~ 9/24 오전) 때문에, 현황에 표시되는 <b>등급·사용 금액·PC방 보정 금액</b>이 실제 인게임 데이터와 다를 수 있습니다.</p>
        <p>넥슨의 후속 조치 공지가 아직 나오지 않아 지켜보고 있습니다. 공지가 나오면 바로 확인하고 계산을 수정하겠습니다.</p>
        <p>인게임과 수치가 다르다면 <b>문의 게시판</b>에 캡처와 함께 글을 남겨 주세요. 특히 <b>현재 블랙 등급</b>이시라면, 인게임에서 이월 금액을 지금 어떻게 처리하고 있는지 확인하는 데 큰 도움이 됩니다. 제보해 주시면 정말 감사하겠습니다.</p>
      </div>
      <div class="acts">
        <button class="btn" onclick={report}>문의 게시판에 제보하기</button>
        <button class="btn primary" onclick={close}>확인했습니다</button>
      </div>
      <div class="fine">2026년 9월 29일 · 확인하시면 다시 표시되지 않습니다</div>
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
    width: 100%; max-width: 480px; max-height: calc(100% - 32px); overflow-y: auto;
    background: var(--color-panel); border: 1px solid var(--color-line2); border-radius: 24px;
    padding: 26px 24px 20px; box-shadow: 0 30px 80px -30px rgba(0, 0, 0, .8);
  }
  .ic {
    width: 52px; height: 52px; margin: 0 auto; border-radius: 16px; display: grid; place-items: center;
    color: var(--color-peach); background: color-mix(in oklab, var(--color-peach) 18%, transparent);
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
