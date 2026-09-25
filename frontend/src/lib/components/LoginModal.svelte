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

    <h2>휴대폰에서도 보시려면</h2>
    <p class="why">
      받아 둔 구매내역은 <b>이 브라우저에만</b> 저장돼요. 로그인하면 계정에 함께 보관해서
      휴대폰이나 다른 PC에서도 같은 내역을 볼 수 있습니다.
    </p>

    <ul class="pts">
      <li><span class="ok">✓</span> 가입도 비밀번호도 없어요</li>
      <li><span class="ok">✓</span> 카카오에서 받는 건 <b>회원번호 하나</b>예요. 이름·이메일·전화번호는 받지 않아요</li>
      <li><span class="ok">✓</span> 넥슨 아이디와 비밀번호는 <b>받지도, 볼 수도 없어요</b></li>
      <li><span class="ok">✓</span> 언제든 화면에서 바로 지울 수 있어요</li>
    </ul>

    <button class="kakao" onclick={login}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3.2C6.9 3.2 2.8 6.4 2.8 10.4c0 2.5 1.7 4.8 4.2 6.1l-1 3.7c-.1.3.3.6.6.4l4.4-2.9c.3 0 .7.1 1 .1 5.1 0 9.2-3.2 9.2-7.2S17.1 3.2 12 3.2z"/>
      </svg>
      카카오로 로그인
    </button>

    <p class="note">
      로그인하지 않아도 <b>모든 기능을 그대로 쓸 수 있어요.</b> 그때는 어떤 정보도 서버로 보내지 않습니다.
    </p>
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
    display: grid; gap: 13px; padding: 24px 22px 20px;
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
  .why { margin: 0; font-size: 13px; line-height: 1.7; color: var(--color-tx2); }
  .why b, .pts b, .note b { color: var(--color-tx); }

  .pts { margin: 2px 0; padding: 0; list-style: none; display: grid; gap: 7px; }
  .pts li {
    display: flex; gap: 8px; align-items: flex-start;
    font-size: 12.5px; line-height: 1.6; color: var(--color-tx3);
  }
  .ok { flex: none; color: var(--color-good); font-weight: 700; }

  /* 카카오 브랜드 색. 여기만은 테마를 따르지 않는다 */
  .kakao {
    appearance: none; cursor: pointer; font: inherit; font-size: 15px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; gap: 9px;
    margin-top: 4px; padding: 13px; border-radius: 12px; border: 0;
    background: #fee500; color: #191600;
  }
  .kakao:hover { filter: brightness(.96); }
  .kakao svg { width: 19px; height: 19px; }

  .note {
    margin: 0; font-size: 11.5px; line-height: 1.6; color: var(--color-tx3);
    padding: 10px 12px; border-radius: 10px; background: var(--color-bg2); border: 1px solid var(--color-line);
  }
  .legal { margin: 0; font-size: 11px; line-height: 1.6; color: var(--color-tx3); text-align: center; }
  .legal a { color: var(--color-lav); }
</style>
