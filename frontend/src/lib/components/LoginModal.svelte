<script lang="ts">
  /**
   * 로그인 안내.
   *
   * 단추를 누르자마자 남의 사이트로 튕기면, 왜 가는지도 모른 채 넘어가게 된다.
   * 여기서 무엇이 좋아지고 무엇을 넘기는지 먼저 알린 다음에 보낸다.
   * 로그인 제공처가 늘어도 여기에 줄만 하나 더하면 된다.
   */
  import { login } from '../web/account'
  import { spotlight } from '../format'

  let { onClose }: { onClose: () => void } = $props()
</script>

<div class="back" role="presentation" onclick={e => e.target === e.currentTarget && onClose()}>
  <div class="sheet" role="dialog" aria-label="로그인" use:spotlight>
    <button class="x" onclick={onClose} aria-label="닫기">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>

    <h2>로그인</h2>
    <p class="why">
      PC에서 모아 둔 구매내역을<br><b>휴대폰에서도 그대로</b> 볼 수 있어요.
    </p>

    <div class="flow" aria-hidden="true">
      <div class="step">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2.6" y="4" width="18.8" height="12.4" rx="2"/><path d="M8.6 20.4h6.8M12 16.4v4"/>
        </svg>
        <b>PC</b>
        <span>구매내역 가져오기</span>
      </div>
      <svg class="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 12h15M13.5 6.5 20 12l-6.5 5.5"/>
      </svg>
      <div class="step on">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6.4" y="2.6" width="11.2" height="18.8" rx="2.4"/><path d="M11 18.6h2"/>
        </svg>
        <b>휴대폰</b>
        <span>로그인하고 보기</span>
      </div>
    </div>

    <p class="note">
      휴대폰에서는 넥슨 내역을 <b>가져올 수 없어요.</b> PC에서 먼저 가져와 주세요.
    </p>

    <button class="kakao" onclick={login}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3.2C6.9 3.2 2.8 6.4 2.8 10.4c0 2.5 1.7 4.8 4.2 6.1l-1 3.7c-.1.3.3.6.6.4l4.4-2.9c.3 0 .7.1 1 .1 5.1 0 9.2-3.2 9.2-7.2S17.1 3.2 12 3.2z"/>
      </svg>
      카카오로 로그인
    </button>

    <p class="legal">
      로그인하면 <a href="/privacy.html" target="_blank" rel="noopener">개인정보 처리방침</a>에
      동의하는 것으로 봅니다.
    </p>
  </div>
</div>

<svelte:window onkeydown={e => e.key === 'Escape' && onClose()} />

<style>
  .back {
    position: absolute; inset: 52px 0 0 0; z-index: 60;
    display: grid; place-items: center; padding: 20px;
    background: color-mix(in oklab, var(--color-scrim) 78%, transparent); backdrop-filter: blur(8px);
  }
  .sheet {
    position: relative; width: min(420px, 100%); max-height: 100%; overflow-y: auto;
    display: grid; gap: 14px; padding: 24px 22px 20px;
    border-radius: 16px; border: 1px solid var(--color-line2); background: var(--color-panel);
  }
  .x {
    position: absolute; top: 13px; right: 13px;
    appearance: none; width: 30px; height: 30px; border-radius: 9px; cursor: pointer;
    display: grid; place-items: center; border: 1px solid var(--color-line);
    background: var(--color-bg2); color: var(--color-tx2);
  }
  .x:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .x svg { width: 14px; height: 14px; }

  h2 { margin: 0; padding-right: 34px; font-size: 17px; font-weight: 700; color: var(--color-tx); }
  .why {
    margin: 0; font-size: 14px; line-height: 1.75; color: var(--color-tx2);
    letter-spacing: -.01em;
  }
  .why b { color: var(--color-tx); font-weight: 700; }

  /* PC에서 모아 휴대폰에서 본다 — 순서가 한눈에 보여야 한다 */
  .flow { display: flex; align-items: stretch; gap: 8px; margin: 2px 0; }
  .step {
    flex: 1; min-width: 0; display: grid; justify-items: center; gap: 4px;
    padding: 13px 8px 12px; border-radius: 13px;
    background: var(--color-bg2); border: 1px solid var(--color-line);
    color: var(--color-tx3);
  }
  .step svg { width: 20px; height: 20px; }
  .step b { font-size: 12.5px; font-weight: 700; color: var(--color-tx2); }
  .step span { font-size: 11px; line-height: 1.45; text-align: center; }
  .step.on {
    border-color: color-mix(in oklab, var(--color-lav) 50%, var(--color-line));
    background: color-mix(in oklab, var(--color-lav) 10%, var(--color-bg2));
    color: var(--color-tx2);
  }
  .step.on svg, .step.on b { color: var(--color-lav); }
  .arw { flex: none; align-self: center; width: 17px; height: 17px; color: var(--color-tx3); }

  .note {
    margin: 0; padding: 10px 12px; border-radius: 10px;
    font-size: 11.5px; line-height: 1.6; color: var(--color-tx3);
    background: var(--color-bg2); border: 1px solid var(--color-line);
  }
  .note b { color: var(--color-tx2); }


  /* 카카오 브랜드 색. 여기만은 테마를 따르지 않는다 */
  .kakao {
    appearance: none; cursor: pointer; font: inherit; font-size: 15px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; gap: 9px;
    margin-top: 4px; padding: 13px; border-radius: 12px; border: 0;
    background: #fee500; color: #191600;
  }
  .kakao:hover { filter: brightness(.96); }
  .kakao svg { width: 19px; height: 19px; }

  .legal { margin: 0; font-size: 11px; line-height: 1.6; color: var(--color-tx3); text-align: center; }
  .legal a { color: var(--color-lav); }
</style>
