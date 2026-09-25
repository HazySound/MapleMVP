<script lang="ts">
  import { SHOT, SPOT } from '../guide'
  import { spotlight } from '../format'

  let { web = false, onClose }: { web?: boolean; onClose: () => void } = $props()

  type Mark = { spot: string; kind: 'no' | 'ok' | 'pick' }
  /** ui를 주면 이 앱의 단추 줄을 그려서 어디를 누르라는 건지 보여 준다 */
  type Step = { head: string; text: string; shot?: keyof typeof SHOT; marks?: Mark[]; ui?: 'live' | 'paste' }

  /** 화면공유 중에 게임 위로 뜨는 안내. 무엇이 보이느냐에 따라 이렇게 바뀐다 */
  const STATES: { tone: 'warn' | 'wait' | 'good'; title: string; text: string }[] = [
    { tone: 'warn', title: '⚠️ MVP 패널을 못 찾았어요',
      text: '패널이 안 열렸거나, 게임이 전체화면이에요. 창 모드로 바꾸거나 캡처 붙여넣기를 쓰세요.' },
    { tone: 'wait', title: '🖱️ 패널 위에 마우스를 올려 주세요',
      text: '패널은 보여요. 초록 칸 아무 데나 올려 두면 표가 뜹니다.' },
    { tone: 'wait', title: '👀 12줄 표가 보여요',
      text: '읽는 중이에요. 몇 초 지나도 안 끝나면 마우스를 아주 조금만 움직여 주세요.' },
    { tone: 'good', title: '✅ 12줄 표를 읽었어요 (1/2)',
      text: '절반 끝났어요. 이제 마우스를 패널 밖으로 치우세요.' },
    { tone: 'good', title: '✅ 다 읽었어요 (2/2)',
      text: '끝났습니다. 「탭으로 돌아가기」를 누르면 이 화면으로 옵니다.' },
  ]

  const OPEN: Step[] = [
    {
      head: 'ESC를 눌러 메뉴를 열고, 이벤트 › MVP를 누릅니다',
      text: '오른쪽에서 두 번째 칸이 이벤트예요. 그 안의 세 번째 항목이 MVP입니다.',
      shot: 'menu', marks: [{ spot: SPOT.mvp, kind: 'pick' }],
    },
  ]

  const LIVE: Step[] = [
    {
      head: '화면 공유로 읽기를 누르고, 공유할 화면을 고릅니다',
      text: '게임이 있는 화면을 고르세요. 게임은 창 모드여야 합니다 — 전체화면은 공유 목록에 뜨지 않아요. 전체화면 그대로 쓰시려면 옆의 캡처 붙여넣기를 쓰시면 됩니다.',
      ui: 'live',
    },
    {
      head: 'MVP 패널 위에 마우스를 올려 둡니다',
      text: '초록 칸 아무 데나 괜찮아요. 빨간 칸의 금액만 가리지 마세요 — 13주 합계가 거기서 나옵니다.',
      shot: 'panel', marks: [{ spot: SPOT.amount, kind: 'no' }, { spot: SPOT.hover, kind: 'ok' }],
    },
    {
      head: '12줄 표가 뜨면 그대로 둡니다',
      text: '읽는 동안 가만히 두세요. 몇 초 지나도 안 끝나면 마우스를 아주 조금만 움직여 주세요.',
      shot: 'tip', marks: [{ spot: SPOT.tipAmount, kind: 'no' }],
    },
    {
      head: '마우스를 패널 밖으로 치우면 끝입니다',
      text: '표가 사라져야 가려졌던 윗줄 금액을 읽어요. 다 읽으면 알려 드리고 공유도 알아서 멈춥니다.',
    },
  ]

  const SHOTS: Step[] = [
    {
      head: 'MVP 패널을 열고 그 위에 마우스를 올립니다',
      text: '빨간 칸의 금액이 가려지지 않게만 올려 주세요.',
      shot: 'panel', marks: [{ spot: SPOT.amount, kind: 'no' }, { spot: SPOT.hover, kind: 'ok' }],
    },
    {
      head: '12줄 표가 뜬 채로 PrintScreen을 누릅니다',
      text: '화면 전체가 찍혀도 되고, 캡처 도구로 MVP 부분만 잘라도 됩니다.',
      shot: 'tip', marks: [{ spot: SPOT.tipAmount, kind: 'no' }],
    },
    {
      head: '이 화면으로 돌아와 붙여넣기를 누릅니다',
      text: '창 안 아무 데서나 Ctrl+V 해도 되고, 이미지를 끌어다 놓거나 파일 선택으로 넣어도 같습니다.',
      ui: 'paste',
    },
    {
      head: '윗줄이 가려졌다면 한 장 더',
      text: '툴팁이 「○○ 등급까지」를 덮었으면 12줄만 읽히고 합계를 모릅니다. '
        + '마우스를 치운 뒤 한 장 더 찍어 붙여넣으면 나머지가 채워져요.',
    },
  ]

  let tab = $state<'live' | 'shot'>(web ? 'live' : 'shot')
  const steps = $derived(tab === 'live' ? LIVE : SHOTS)
</script>

<div class="back" role="presentation" onclick={e => e.target === e.currentTarget && onClose()}>
  <div class="sheet" role="dialog" aria-label="PC방 보정 사용법" use:spotlight>
    <header>
      <h2>PC방 보정 사용법</h2>
      <button class="x" onclick={onClose} aria-label="닫기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </header>

    <div class="body">
      <p class="why">
        프리미엄 PC방 접속분은 6분마다 100캐시씩 MVP 금액에 반영되는데 구매내역에는 잡히지 않아요.
        인게임 MVP 패널을 보여 주시면 <b>주차별로 얼마가 반영됐는지</b> 역산해 드립니다.
      </p>

      <h3 class="part">먼저 · MVP 패널 열기</h3>
      {#each OPEN as s (s.head)}
        {@render step(s, 0)}
      {/each}

      {#if web}
        <nav class="tabs" aria-label="방법">
          <button aria-pressed={tab === 'live'} onclick={() => (tab = 'live')}>화면 공유 <em>권장</em></button>
          <button aria-pressed={tab === 'shot'} onclick={() => (tab = 'shot')}>캡처 붙여넣기</button>
        </nav>
      {:else}
        <h3 class="part">그다음 · 캡처 붙여넣기</h3>
      {/if}

      {#each steps as s, i (s.head)}
        {@render step(s, i + 1)}
      {/each}

      {#if tab === 'live' && web}
        <p class="tip">
          공유가 시작되면 <b>게임 위에 작은 안내 창</b>이 떠서 지금 무엇을 할 차례인지 알려 줍니다.
          소리로도 알려 드려요 — 올라가는 음이면 한 단계 넘어간 것, 내려가는 음이면 못 하고 끝난 것입니다.
        </p>

        <h3 class="part">안내 창은 이렇게 바뀝니다</h3>
        <div class="states">
          {#each STATES as st (st.title)}
            <div class="card {st.tone}">
              <b>{st.title}</b>
              <span>{st.text}</span>
            </div>
          {/each}
        </div>
      {/if}

      <p class="note">
        읽어 낸 값은 <b>그대로 저장되지 않습니다.</b> 주차별 금액을 되짚어 보여 드리니
        인게임 화면과 같은지 확인한 뒤 저장하세요.
      </p>
    </div>
  </div>
</div>

{#snippet step(s: Step, n: number)}
  <section class="step">
    <span class="n">{n === 0 ? '·' : n}</span>
    <div class="txt">
      <b>{s.head}</b>
      <span>{s.text}</span>
      {#if s.ui}
        <div class="uimock" aria-hidden="true">
          <span class="ghost">화면을 공유하면 알아서 읽어 드려요…</span>
          <span class="b lav" class:on={s.ui === 'live'}>화면 공유로 읽기</span>
          <span class="b" class:on={s.ui === 'paste'}>붙여넣기</span>
          <span class="b">파일 선택</span>
        </div>
      {/if}
      {#if s.shot}
        {@const art = SHOT[s.shot]}
        <figure style="width:{art.w}px">
          <img src={art.src} alt="" width={art.w} height={art.h} />
          {#each s.marks ?? [] as m (m.spot)}
            <span class="hl {m.kind}" style={m.spot}></span>
          {/each}
        </figure>
      {/if}
    </div>
  </section>
{/snippet}

<svelte:window onkeydown={e => e.key === 'Escape' && onClose()} />

<style>
  .back {
    position: absolute; inset: 52px 0 0 0; z-index: 60;
    display: grid; place-items: center; padding: 20px;
    background: color-mix(in oklab, var(--color-scrim) 78%, transparent); backdrop-filter: blur(8px);
  }
  .sheet {
    position: relative; width: min(640px, 100%); max-height: 100%;
    display: flex; flex-direction: column; overflow: hidden;
    border-radius: 16px; border: 1px solid var(--color-line2); background: var(--color-panel);
  }
  header {
    display: flex; align-items: center; gap: 10px; flex: none;
    padding: 15px 16px 13px; border-bottom: 1px solid var(--color-line);
  }
  h2 { flex: 1; margin: 0; font-size: 15px; font-weight: 700; color: var(--color-tx); }
  .x {
    appearance: none; width: 30px; height: 30px; border-radius: 9px; cursor: pointer;
    display: grid; place-items: center; border: 1px solid var(--color-line);
    background: var(--color-bg2); color: var(--color-tx2);
  }
  .x:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .x svg { width: 14px; height: 14px; }

  .body { overflow-y: auto; padding: 16px; display: grid; gap: 13px; align-content: start; }
  .why, .tip, .note {
    margin: 0; font-size: 12.5px; line-height: 1.65; color: var(--color-tx2);
    background: var(--color-bg2); border: 1px solid var(--color-line);
    border-radius: 12px; padding: 11px 13px;
  }
  .why b, .tip b, .note b { color: var(--color-tx); }
  .note { font-size: 11.5px; color: var(--color-tx3); }

  .part { margin: 4px 0 -4px; font-size: 11.5px; font-weight: 600; color: var(--color-tx3); }

  .tabs { display: flex; gap: 6px; padding: 4px; border-radius: 12px; background: var(--color-bg2); }
  .tabs button {
    flex: 1; appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 600;
    padding: 8px 10px; border-radius: 9px; border: 0;
    background: transparent; color: var(--color-tx3);
  }
  .tabs button[aria-pressed="true"] { background: var(--color-panel2); color: var(--color-tx); }
  .tabs em {
    font-style: normal; font-size: 10.5px; font-weight: 600; margin-left: 4px;
    padding: 1px 6px; border-radius: 999px;
    color: var(--color-lav); background: color-mix(in oklab, var(--color-lav) 18%, transparent);
  }

  .step { display: flex; gap: 11px; align-items: flex-start; }
  .n {
    flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
    font-size: 12px; font-weight: 700; color: var(--color-lav);
    background: color-mix(in oklab, var(--color-lav) 18%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-lav) 40%, transparent);
  }
  .txt { display: grid; gap: 5px; min-width: 0; }
  .txt b { font-size: 13px; font-weight: 600; color: var(--color-tx); }
  .txt span { font-size: 11.5px; line-height: 1.6; color: var(--color-tx3); }

  /* 이 앱의 단추 줄을 작게 옮겨 그린 것. 어디를 누르라는 건지 글보다 빠르다 */
  .uimock {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 5px 0 2px;
    padding: 9px 10px; border-radius: 10px; background: var(--color-bg2);
    border: 1px dashed color-mix(in oklab, var(--color-lav) 40%, var(--color-line));
  }
  .ghost { flex: 1 1 130px; min-width: 0; font-size: 10.5px; color: var(--color-tx4, var(--color-tx3)); opacity: .55; }
  .b {
    flex: none; font-size: 10.5px; font-weight: 600; padding: 5px 9px; border-radius: 8px;
    border: 1px solid var(--color-line); background: var(--color-panel2); color: var(--color-tx3);
  }
  .b.lav { background: color-mix(in oklab, var(--color-lav) 35%, var(--color-panel2)); color: var(--color-tx); }
  .b.on {
    color: var(--color-on-accent); background: var(--color-lav); border-color: var(--color-lav);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-lav) 30%, transparent);
  }

  .states { display: grid; gap: 7px; }
  .card {
    display: grid; gap: 2px; padding: 9px 11px; border-radius: 10px;
    background: var(--color-bg2); border: 1px solid var(--color-line);
    border-left-width: 3px;
  }
  .card b { font-size: 12px; font-weight: 700; }
  .card span { font-size: 11px; line-height: 1.55; color: var(--color-tx3); }
  .card.warn { border-left-color: var(--color-peach); }
  .card.warn b { color: var(--color-peach); }
  .card.wait { border-left-color: var(--color-lav); }
  .card.wait b { color: var(--color-lav); }
  .card.good { border-left-color: var(--color-good); }
  .card.good b { color: var(--color-good); }

  figure {
    position: relative; margin: 4px 0 2px; max-width: 100%;
    border-radius: 8px; overflow: hidden; border: 1px solid var(--color-line);
  }
  img { display: block; width: 100%; height: auto; }
  /* 테두리 자리는 비율이라, 그림을 줄여 그려도 그대로 맞는다 */
  .hl { position: absolute; border-radius: 3px; pointer-events: none; }
  .hl.no { border: 2px solid var(--color-bad); }
  .hl.ok { border: 2px dashed var(--color-good); }
  .hl.pick { border: 2px solid var(--color-lav); }

  @media (max-width: 672px) {
    figure { width: 100% !important; }
  }
</style>
