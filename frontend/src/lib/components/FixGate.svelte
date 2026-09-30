<script lang="ts">
  /**
   * 인게임 금액 맞추기(보정)를 한 번도 안 했으면 현황판을 어둡게 가리고 이 단추만 밝게 둔다.
   *
   * 구매내역만으로는 인게임 MVP 금액과 다르다(프리미엄 PC방 접속분, 넥슨이 이월로 옮긴 금액 등).
   * 'PC방 보정'이라고만 적어 두니 PC방에 안 가는 사람은 자기와 상관없다고 보고 아예 하지 않았다
   * (2026-09-30 사용자). 그래서 구매내역을 가져온 뒤에는 꼭 거치게 한다
   */
  import { app } from '../store.svelte'
</script>

<div class="gate" role="dialog" aria-label="인게임 금액 맞추기">
  <div class="box">
    <b class="t">인게임 금액과 한 번 맞춰 주세요</b>
    <p>
      구매내역만으로는 인게임 MVP 금액과 달라요. <b>프리미엄 PC방 접속분</b>이나 <b>넥슨이 이월로 옮긴 금액</b>처럼
      구매내역에 안 잡히는 몫이 있어서예요. PC방에 안 가셨어도 꼭 한 번 해 주세요.
    </p>
    <p class="how">인게임 MVP 창의 등급 게이지에 마우스를 올려 나오는 표를 캡처해서 붙여 넣으면 끝이에요.</p>
    <button class="go" onclick={() => (app.showPcRoom = true)}>인게임 금액 맞추기</button>
    <span class="sub">캡처가 안 읽히면 <button class="link" onclick={() => (app.view = 'qna')}>문의 게시판</button>에 캡처를 올려 주세요.</span>
  </div>
</div>

<style>
  .gate { position: absolute; inset: 0; z-index: 5; display: flex; justify-content: center; align-items: flex-start; padding: 64px 16px; }
  .box {
    position: sticky; top: 96px; display: grid; justify-items: center; gap: 10px; max-width: 460px; text-align: center;
    padding: 22px 22px 18px; border-radius: var(--radius-lg, 16px); background: var(--color-panel);
    border: 1px solid color-mix(in oklab, var(--color-peach) 45%, var(--color-line));
    box-shadow: 0 18px 60px rgba(0, 0, 0, .45);
  }
  .t { font-size: 17px; }
  p { margin: 0; font-size: 13px; line-height: 1.55; color: var(--color-tx2); }
  p b { color: var(--color-tx); }
  .how { font-size: 12px; color: var(--color-tx3); }
  .go {
    appearance: none; cursor: pointer; font: inherit; font-size: 15px; font-weight: 700; margin-top: 4px;
    padding: 12px 22px; border-radius: 12px; border: 0; color: #1b1c21; background: var(--color-peach);
    animation: pulse 1.6s ease-in-out infinite;
  }
  .go:hover { filter: brightness(1.08); }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-peach) 60%, transparent); }
    50% { box-shadow: 0 0 0 12px color-mix(in oklab, var(--color-peach) 0%, transparent); }
  }
  @media (prefers-reduced-motion: reduce) { .go { animation: none; } }
  .sub { font-size: 11.5px; color: var(--color-tx3); }
  .link { appearance: none; border: 0; background: none; padding: 0; font: inherit; color: var(--color-lav); cursor: pointer; text-decoration: underline; }
</style>
