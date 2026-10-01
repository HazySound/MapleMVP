<script lang="ts">
  /**
   * 문의 쓰기.
   *
   * 제보를 받아 보면 '안 돼요' 한 줄에 캡처가 없어서 되묻는 데 하루가 간다.
   * 그래서 종류부터 고르게 하고, 고른 종류에 맞춰 무엇을 찍고 무엇을 적을지
   * 바로 그 자리에 보여 준다. 내용 칸은 비워 두고 흐린 예시만 보여 준다(틀을 채워 두면 오히려 헷갈렸다).
   *
   * MVP 현황·PC방 보정 문제는 인게임 캡처 없이는 원인을 못 찾는다. 이 둘은
   * 캡처를 붙여야 올릴 수 있다.
   *
   * 쓰던 것은 이 브라우저에 적어 둔다. 캡처하러 게임에 갔다 오는 사이
   * 창을 닫아도 글이 날아가지 않게.
   */
  import QnaShots from './QnaShots.svelte'
  import { SHOT } from '../guide'
  import { TIERS } from '../core/mvp'
  import { app } from '../store.svelte'
  import { board, go, loginHere } from '../qna.svelte'
  import { create, type Diag, type Kind, type Topic } from '../web/qna'
  import { lastScans } from '../web/scanlog'
  import { ro } from '../format'

  const DRAFT = 'maplemvp.qnaDraft'

  const draft = (() => {
    try { return JSON.parse(localStorage.getItem(DRAFT) ?? 'null') ?? {} } catch { return {} }
  })()
  let kind = $state<Kind | ''>(draft.kind ?? '')
  let topic = $state<Topic>(draft.topic ?? '')
  let game = $state<string>(draft.game ?? '')           // 게임에 보이는 등급
  let title = $state<string>(draft.title ?? '')
  let titleTouched = $state<boolean>(draft.titleTouched ?? false)
  let body = $state<string>(draft.body ?? '')
  let secret = $state<boolean>(draft.secret ?? false)
  let withDiag = $state(true)
  let images = $state<string[]>([])
  let uploading = $state(false)
  let sending = $state(false)
  let error = $state('')
  let shots = $state<QnaShots>()

  const KINDS: { key: Kind; name: string; desc: string; icon: string }[] = [
    { key: 'bug', name: '버그·오류', desc: '숫자가 틀리거나 화면이 이상해요', icon: 'M12 8v5M12 16.5h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' },
    { key: 'idea', name: '건의사항', desc: '이런 기능이 있으면 좋겠어요', icon: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.4.3.6.8.6 1.3V16h6v-.9c0-.5.2-1 .6-1.3A6 6 0 0 0 12 3z' },
    { key: 'howto', name: '사용법 문의', desc: '어떻게 쓰는지 궁금해요', icon: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z' },
  ]
  const TOPICS: { key: Topic; name: string; desc: string; shot: boolean }[] = [
    { key: 'tier', name: 'MVP 현황이 게임과 달라요', desc: '등급·금액·남은 금액이 게임 속과 달라요', shot: true },
    { key: 'pcroom', name: 'PC방 보정이 이상해요', desc: '캡처를 못 읽거나 보정 결과가 이상해요', shot: true },
    { key: 'etc', name: '그 밖의 오류', desc: '화면이 깨지거나 기능이 안 돼요', shot: false },
  ]

  /**
   * 종류마다 채워 둘 틀과 예시, 붙일 그림.
   *
   * 원인을 찾는 데 필요한 건 '지금 무엇이 어떻게 보이는지'와 그 화면이다.
   * 언제부터·무슨 결제 같은 것은 캡처와 사이트 계산값으로 대부분 알 수 있어서 묻지 않는다.
   * frame은 비워 둔다. 미리 채운 틀이 문의를 더 어렵게 만든다는 의견이 있었다(2026-09-28).
   */
  interface Form { frame: string; example: string; title: string; shots: { name: string; must?: boolean }[] }
  const FORM: Record<string, Form> = {
    tier: {
      frame: '',
      example: '예) 게임에서는 블랙인데 사이트는 레드로 나와요. 블랙 유지까지 금액도 달라요.',
      title: '게임과 사이트가 어떻게 다른지 한 줄로',
      shots: [{ name: '인게임 MVP 툴팁', must: true }, { name: '사이트 현황 화면' }],
    },
    pcroom: {
      frame: '',
      example: "예) 툴팁 캡처를 붙였더니 '툴팁을 찾지 못했어요'가 떠요.",
      title: '예: 툴팁 캡처를 붙여도 읽지 못해요',
      shots: [{ name: '인게임 MVP 툴팁', must: true }, { name: 'PC방 보정 창의 결과 화면' }],
    },
    etc: {
      frame: '',
      example: '예) 효율표에서 아이템 이름을 입력했는데 고를 목록이 안 떠요.',
      title: '예: 효율표에서 아이템 추가가 안 돼요',
      shots: [{ name: '문제가 보이는 화면' }],
    },
    idea: {
      frame: '',
      example: '예) 목표 계획표를 그림으로 저장할 수 있으면 친구에게 보여 주기 편할 것 같아요.',
      title: '예: 목표 계획표를 그림으로 저장하고 싶어요',
      shots: [{ name: '참고할 화면' }],
    },
    howto: {
      frame: '',
      example: '예) PC방 보정을 하려는데 툴팁을 어디서 여는지 모르겠어요.',
      title: '예: PC방 보정은 언제 다시 해야 하나요?',
      shots: [{ name: '막힌 화면' }],
    },
    notice: { frame: '', example: '', title: '공지 제목', shots: [] },
  }
  const FRAMES = Object.values(FORM).map(f => f.frame).filter(Boolean)

  const tierName = (k: string | null | undefined) => TIERS.find(t => t.key === k)?.name ?? '등급 없음'
  const siteTier = $derived(tierName(app.data?.current))
  const needShot = $derived(kind === 'bug' && (topic === 'tier' || topic === 'pcroom'))
  const hasDiag = $derived(kind === 'bug' && !!app.data?.weeks?.length && !app.data?.demo)
  const ready = $derived(kind !== '' && (kind !== 'bug' || topic !== ''))
  const form = $derived(FORM[kind === 'bug' ? topic : kind] ?? FORM.notice)

  /** 등급을 고르면 제목을 대신 지어 준다. 직접 고친 뒤에는 건드리지 않는다 */
  const autoTitle = $derived(topic === 'tier' && game
    ? `게임은 ${game}인데 사이트는 ${siteTier}${ro(siteTier)} 나와요` : '')
  $effect(() => { if (autoTitle && !titleTouched) title = autoTitle })

  const blocker = $derived(
    !title.trim() ? '제목을 적어 주세요'
    : !tidy(body) ? '내용을 적어 주세요'
    : uploading ? '그림을 올리는 중이에요'
    : needShot && !images.length ? '인게임 캡처를 한 장 이상 붙여 주세요'
    : '')

  function pickKind(k: Kind) {
    if (kind === k) return
    kind = k
    topic = ''
    // 아직 아무것도 안 적었으면 틀을 바꿔 끼운다. 버그는 세부를 고른 뒤에
    if (!body.trim() || FRAMES.includes(body)) body = k === 'bug' ? '' : FORM[k].frame
  }

  function pickTopic(t: Topic) {
    topic = t
    // 아직 아무것도 안 적었으면 틀을 바꿔 끼운다
    if (!body.trim() || FRAMES.includes(body)) body = FORM[t]?.frame ?? ''
  }

  function diag(): Diag | null {
    if (!hasDiag || !withDiag || !app.data) return null
    return {
      build: __BUILD__,
      ua: navigator.userAgent,
      screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
      syncedAt: app.data.syncedAt ?? null,
      tier: app.data.current ?? null,
      carry: app.data.carry ?? 0,
      weeks: app.data.weeks.map(w => ({ start: w.start, amount: w.amount, spent: w.spent, pc: w.pc })),
      // 2주 안에 해 본 것만. 오래된 시도는 지금 문제와 상관없다
      scans: lastScans().filter(x => Date.now() - x.at < 14 * 86400e3),
    }
  }

  /** 틀에서 안 채운 줄은 빼고 올린다. '막힌 곳:'만 남으면 읽는 사람이 헷갈린다 */
  function tidy(text: string): string {
    const labels = new Set(form.frame.split('\n').map(l => l.trim()).filter(Boolean))
    return text.split('\n').filter(l => !labels.has(l.trim())).join('\n').trim()
  }

  async function submit() {
    if (blocker || sending || !kind) return
    sending = true
    error = ''
    const r = await create({ kind, topic: kind === 'bug' ? topic : '', title: title.trim(), body: tidy(body),
                             secret, images, diag: diag() })
    sending = false
    if (!r.data) { error = r.error ?? '올리지 못했어요'; return }
    shots?.clear()
    try { localStorage.removeItem(DRAFT) } catch { /* 없으면 그만 */ }
    board.stale++
    go(`qna/${r.data.id}`)
  }

  $effect(() => {
    const d = { kind, topic, game, title, titleTouched, body, secret }
    try { localStorage.setItem(DRAFT, JSON.stringify(d)) } catch { /* 저장이 막혀도 쓸 수는 있다 */ }
  })

  function reset() {
    kind = ''; topic = ''; game = ''; title = ''; titleTouched = false; body = ''; secret = false
    shots?.clear()
  }
</script>

<div class="card write">
  <div class="top">
    <a class="back" href="#qna">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      목록
    </a>
    <h2>문의 남기기</h2>
    {#if kind}<button class="reset" onclick={reset}>처음부터</button>{/if}
  </div>

  {#if !app.user}
    <div class="gate">
      <p>문의는 로그인하고 남길 수 있어요. 답변이 등록되면 <b>알림</b>을 남겨 드려요.</p>
      <button class="btn primary" onclick={() => loginHere()}>카카오로 로그인하고 쓰기</button>
    </div>
  {:else}
    <section>
      <h3><span class="n">1</span>어떤 문의인가요?</h3>
      <div class="opts three">
        {#each KINDS as k (k.key)}
          <button class="opt" aria-pressed={kind === k.key} onclick={() => pickKind(k.key)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={k.icon}/></svg>
            <b>{k.name}</b><span>{k.desc}</span>
          </button>
        {/each}
      </div>
      {#if app.user.admin}
        <button class="notice" aria-pressed={kind === 'notice'} onclick={() => pickKind('notice')}>공지 쓰기 (관리자)</button>
      {/if}
    </section>

    {#if kind === 'bug'}
      <section>
        <h3><span class="n">2</span>어떤 문제인가요?</h3>
        <div class="opts">
          {#each TOPICS as t (t.key)}
            <button class="opt row" aria-pressed={topic === t.key} onclick={() => pickTopic(t.key)}>
              <b>{t.name}</b><span>{t.desc}</span>
              {#if t.shot}<em>캡처 필수</em>{/if}
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if ready}
      {#if needShot}
        <section class="guide">
          <h3><span class="n">{kind === 'bug' ? 3 : 2}</span>인게임 캡처는 이렇게 찍어 주세요</h3>
          <ol class="steps">
            <li>
              <figure><img src={SHOT.menu.src} alt="ESC 메뉴의 이벤트 칸" width={SHOT.menu.w} height={SHOT.menu.h} /></figure>
              <p><b>ESC</b> → <b>이벤트</b> → <b>MVP</b>를 열어요.</p>
            </li>
            <li>
              <figure><img src={SHOT.tip.src} alt="등급 게이지에 마우스를 올려 주차별 표가 뜬 모습" width={SHOT.tip.w} height={SHOT.tip.h} /></figure>
              <p>등급 게이지에 <b>마우스를 올려</b> 주차별 표가 뜬 채로 찍어요. <b>표 전체</b>와 <b>위쪽 금액</b>이 다 보여야 해요.</p>
            </li>
            <li class="keys">
              <p><kbd>PrtSc</kbd> 또는 <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>로 찍고,<br>이 창으로 돌아와 <kbd>Ctrl</kbd>+<kbd>V</kbd>를 누르면 바로 붙어요.</p>
              <p class="warn">캡처에 캐시 금액이 보여요. 남에게 보이기 싫으면 아래에서 <b>관리자만 보기</b>를 켜 주세요.</p>
            </li>
          </ol>
        </section>
      {/if}

      <section>
        <h3><span class="n">{kind === 'bug' ? (needShot ? 4 : 3) : 2}</span>내용</h3>

        {#if topic === 'tier'}
          <div class="field">
            <span class="lbl">게임에 보이는 등급</span>
            <div class="ef-seg tiers">
              {#each [...TIERS.map(t => t.name), '등급 없음'] as n (n)}
                <button aria-pressed={game === n} onclick={() => (game = n)}>{n}</button>
              {/each}
            </div>
            <span class="ef-hint">사이트는 지금 <b>{siteTier}</b>{ro(siteTier)} 계산하고 있어요.</span>
          </div>
        {/if}

        <label class="field">
          <span class="lbl">제목</span>
          <input maxlength="80" bind:value={title} oninput={() => (titleTouched = true)} placeholder={form.title} />
        </label>

        <label class="field">
          <span class="lbl">내용</span>
          <textarea rows="7" maxlength="5000" bind:value={body} placeholder={kind === 'notice' ? '공지 내용' : form.example}></textarea>
        </label>

        <div class="field">
          <span class="lbl">
            {needShot ? '캡처' : '그림 (선택)'}
            {#if needShot}<em class="must">필수</em>{/if}
          </span>
          {#if form.shots.length}
            <ul class="want">
              {#each form.shots as w (w.name)}<li class:must={w.must}>{w.name}{#if w.must}<b>필수</b>{/if}</li>{/each}
            </ul>
          {/if}
          <QnaShots bind:this={shots} bind:ids={images} bind:busy={uploading} need={needShot} />
        </div>

        <div class="checks">
          {#if kind !== 'notice'}
            <label class="check">
              <input type="checkbox" bind:checked={secret} />
              <span><b>관리자만 보기</b><em>나와 관리자에게만 보이고 목록에도 나오지 않아요</em></span>
            </label>
          {/if}
          {#if hasDiag}
            <label class="check">
              <input type="checkbox" bind:checked={withDiag} />
              <span><b>사이트 계산값 같이 보내기</b><em>지금 등급과 주별 금액, 빌드 정보예요. 공개 글이어도 나와 관리자만 봐요</em></span>
            </label>
          {/if}
        </div>
      </section>

      <div class="send">
        {#if error}<p class="err">{error}</p>{:else if blocker}<p class="left">{blocker}</p>{/if}
        <button class="btn primary" disabled={!!blocker || sending} onclick={submit}>
          {sending ? '올리는 중…' : kind === 'notice' ? '공지 올리기' : '문의 올리기'}
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .write { display: grid; gap: 22px; padding: 20px 22px 22px; user-select: text; }
  .top { display: flex; align-items: center; gap: 12px; }
  .top h2 { margin: 0; font-size: 17px; font-weight: 600; }
  .back {
    display: inline-flex; align-items: center; gap: 2px; padding: 4px 10px 4px 6px; border-radius: 9px;
    font-size: 12.5px; color: var(--color-tx3); text-decoration: none; border: 1px solid var(--color-line);
  }
  .back:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .back svg { width: 15px; height: 15px; }
  .reset { margin-left: auto; appearance: none; border: 0; background: none; cursor: pointer; font: inherit; font-size: 12px; color: var(--color-tx3); text-decoration: underline; }
  .reset:hover { color: var(--color-tx2); }

  .gate { display: grid; justify-items: start; gap: 12px; padding: 18px; border-radius: 13px; background: var(--color-bg2); }
  .gate p { margin: 0; font-size: 13.5px; color: var(--color-tx2); }
  .gate b { color: var(--color-lav); font-weight: 600; }

  section { display: grid; gap: 12px; min-width: 0; }
  h3 { margin: 0; display: flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 600; }
  .n {
    flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
    font-size: 11.5px; font-weight: 700; background: var(--color-panel3); color: var(--color-lav);
  }

  .opts { display: grid; gap: 8px; }
  .opts.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .opt {
    position: relative; appearance: none; cursor: pointer; font: inherit; text-align: left; color: var(--color-tx);
    display: grid; gap: 3px; align-content: start; padding: 14px; border-radius: 13px;
    border: 1px solid var(--color-line); background: var(--color-bg2);
    transition: border-color .2s, background .2s, box-shadow .2s;
  }
  .opt:hover { border-color: var(--color-line2); }
  .opt[aria-pressed="true"] {
    border-color: var(--color-lav);
    background: color-mix(in oklab, var(--color-lav) 10%, var(--color-bg2));
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-lav) 18%, transparent);
  }
  .opt svg { width: 22px; height: 22px; color: var(--color-lav); margin-bottom: 4px; }
  .opt b { font-size: 13.5px; font-weight: 600; }
  .opt span { font-size: 12px; color: var(--color-tx3); line-height: 1.45; }
  .opt.row { grid-template-columns: minmax(0, 1fr) auto; column-gap: 12px; padding: 12px 14px; }
  .opt.row span { grid-column: 1; }
  .opt.row em { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
  .opt em {
    font-style: normal; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; white-space: nowrap;
    color: var(--color-peach); background: color-mix(in oklab, var(--color-peach) 14%, transparent);
  }
  .notice {
    justify-self: start; appearance: none; cursor: pointer; font: inherit; font-size: 12px;
    padding: 5px 12px; border-radius: 99px; border: 1px dashed var(--color-line2); background: none; color: var(--color-tx3);
  }
  .notice[aria-pressed="true"] { border-style: solid; border-color: var(--color-butter); color: var(--color-butter); }

  /* 캡처 안내: 그림을 보고 그대로 따라 하게 */
  .guide { padding: 16px; border-radius: 14px; background: var(--color-bg2); border: 1px solid var(--color-line); }
  .steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, .75fr) minmax(0, 1.25fr) minmax(0, 1.2fr); gap: 14px; counter-reset: s; }
  .steps li { counter-increment: s; display: grid; gap: 8px; align-content: start; min-width: 0; }
  .steps figure { position: relative; margin: 0; border-radius: 10px; overflow: hidden; border: 1px solid var(--color-line); background: #000; }
  .steps figure::before {
    content: counter(s); position: absolute; top: 6px; left: 6px; width: 20px; height: 20px; border-radius: 50%;
    display: grid; place-items: center; font-size: 11px; font-weight: 700; background: var(--color-lav); color: var(--color-on-accent);
  }
  .steps img { display: block; width: 100%; height: auto; }
  .steps p { margin: 0; font-size: 12.5px; line-height: 1.6; color: var(--color-tx2); }
  .steps b { color: var(--color-tx); font-weight: 600; }
  .keys { align-content: center !important; gap: 10px !important; }
  .keys > p:first-child::before {
    content: counter(s); display: inline-grid; place-items: center; width: 20px; height: 20px; margin-right: 6px; border-radius: 50%;
    font-size: 11px; font-weight: 700; background: var(--color-lav); color: var(--color-on-accent); vertical-align: 1px;
  }
  kbd {
    display: inline-block; padding: 0 6px; border-radius: 6px; font-family: var(--font-mono); font-size: 11.5px;
    border: 1px solid var(--color-line2); border-bottom-width: 2px; background: var(--color-panel); color: var(--color-tx);
  }
  .warn { padding: 8px 10px; border-radius: 9px; font-size: 11.5px !important; background: color-mix(in oklab, var(--color-peach) 10%, transparent); }

  .field { display: grid; gap: 6px; min-width: 0; }
  .lbl { font-size: 12px; color: var(--color-tx3); }
  .lbl em { font-style: normal; color: var(--color-tx3); opacity: .8; }
  .lbl .must { margin-left: 4px; font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 99px; color: var(--color-peach); background: color-mix(in oklab, var(--color-peach) 14%, transparent); opacity: 1; }
  .tiers { justify-self: start; }
  .want { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .want li {
    display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 10px; border-radius: 99px;
    background: var(--color-panel3); color: var(--color-tx2);
  }
  .want li::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--color-tx3); }
  .want li.must::before { background: var(--color-peach); }
  .want li b { font-size: 10.5px; font-weight: 700; color: var(--color-peach); }
  input:not([type]), textarea {
    font: inherit; font-size: 13.5px; color: var(--color-tx); width: 100%; box-sizing: border-box;
    padding: 10px 12px; border-radius: 11px; border: 1px solid var(--color-line2); background: var(--color-bg2);
  }
  textarea { resize: vertical; min-height: 150px; line-height: 1.65; }
  input:not([type]):focus, textarea:focus { outline: none; border-color: var(--color-lav); box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-lav) 16%, transparent); }

  .checks { display: grid; gap: 8px; }
  .check { display: flex; gap: 10px; align-items: start; cursor: pointer; padding: 10px 12px; border-radius: 11px; background: var(--color-bg2); }
  .check input { flex: none; margin: 3px 0 0; width: 15px; height: 15px; accent-color: var(--color-lav); }
  .check span { display: grid; gap: 1px; font-size: 13px; }
  .check b { font-weight: 600; }
  .check em { font-style: normal; font-size: 11.5px; color: var(--color-tx3); }

  .send { display: flex; align-items: center; justify-content: flex-end; gap: 14px; flex-wrap: wrap; }
  .send p { margin: 0; font-size: 12.5px; }
  .left { color: var(--color-tx3); }
  .err { color: var(--color-bad); }
  .send .btn { padding: 10px 22px; font-size: 14px; }

  @media (max-width: 912px) {
    .steps { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); }
    .keys { grid-column: 1 / -1; }
  }
  @media (max-width: 672px) {
    .write { padding: 16px 14px 18px; gap: 18px; }
    .opts.three { grid-template-columns: minmax(0, 1fr); }
    .opts.three .opt { grid-template-columns: auto minmax(0, 1fr); column-gap: 12px; padding: 12px 14px; }
    .opts.three .opt svg { grid-row: 1 / span 2; margin: 0; align-self: center; }
    .steps { grid-template-columns: minmax(0, 1fr); }
    .steps li:first-child figure { max-width: 180px; }
    .send { justify-content: stretch; }
    .send .btn { flex: 1; justify-content: center; }
  }
</style>
