<script lang="ts">
  /**
   * 오른쪽 위 종. 문의에 답이 달리면 여기 숫자가 뜬다.
   *
   * 목록은 열 때만 받는다. 평소에는 개수만 1분마다 묻는다(qna.svelte.ts).
   * 알림을 누르면 그 글로 가고, 그 글의 알림은 글 쪽에서 읽음으로 바꾼다.
   */
  import { ago, board, checkNotes, go } from '../qna.svelte'
  import { notes, seen, type Note } from '../web/qna'
  import { tip } from '../tip'

  let open = $state(false)
  let items = $state<Note[] | null>(null)
  let now = $state(Date.now())

  async function toggle() {
    open = !open
    if (!open) return
    now = Date.now()
    const r = await notes()
    if (r.data) { items = r.data.items; board.unread = r.data.unread }
  }

  function pick(n: Note) {
    open = false
    n.seen = true
    go(`qna/${n.post}`)
  }

  async function readAll() {
    await seen()
    items = items?.map(n => ({ ...n, seen: true })) ?? null
    void checkNotes()
  }

  const TEXT: Record<Note['kind'], (t: string) => string> = {
    answer: t => `‘${t}’ 문의에 답변이 등록됐어요`,
    done: t => `‘${t}’ 문의가 해결됐어요`,
    new: t => `새 문의: ${t}`,
    more: t => `‘${t}’ 문의에 작성자가 내용을 더했어요`,
    update: t => `‘${t}’ 공지에 내용이 추가됐어요`,
  }
</script>

<svelte:window onkeydown={e => { if (e.key === 'Escape') open = false }} />

<div class="wrap">
  <button class="bell" class:on={board.unread > 0} onclick={toggle} aria-expanded={open}
    aria-label={board.unread ? `알림 ${board.unread}개` : '알림'} use:tip={'알림'}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.8 8.5-2.8 8.5h17.6S18 15 18 8.5"/><path d="M13.7 20.5a2 2 0 0 1-3.4 0"/>
    </svg>
    {#if board.unread > 0}<span class="n mono">{board.unread > 9 ? '9+' : board.unread}</span>{/if}
  </button>

  {#if open}
    <div class="veil" role="presentation" onclick={() => (open = false)}></div>
    <div class="menu">
      <div class="hd">
        <b>알림</b>
        {#if items?.some(n => !n.seen)}<button class="all" onclick={readAll}>모두 읽음</button>{/if}
      </div>
      {#if !items}
        <p class="empty">불러오는 중…</p>
      {:else if !items.length}
        <p class="empty">아직 알림이 없어요.<br>문의에 답변이 등록되면 여기에 알림을 남겨 드려요.</p>
      {:else}
        <ul>
          {#each items as n (n.id)}
            <li>
              <button class:unseen={!n.seen} onclick={() => pick(n)}>
                <span class="dot k-{n.kind}"></span>
                <span class="tx">{TEXT[n.kind]?.(n.title) ?? n.title}</span>
                <span class="at">{ago(n.at, now)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <a class="foot" href="#qna" onclick={() => (open = false)}>문의 게시판으로</a>
    </div>
  {/if}
</div>

<style>
  .wrap { position: relative; flex: none; }
  .bell {
    position: relative; appearance: none; width: 30px; height: 30px; border-radius: 9px; cursor: pointer;
    display: grid; place-items: center; padding: 0;
    border: 1px solid var(--color-line); background: var(--color-panel); color: var(--color-tx2);
    transition: all .2s;
  }
  .bell:hover { color: var(--color-tx); border-color: var(--color-line2); background: var(--color-panel2); }
  .bell.on { color: var(--color-tx); }
  .bell.on svg { animation: ring 2.8s ease-in-out infinite; transform-origin: 50% 12%; }
  .bell svg { width: 15px; height: 15px; }
  .n {
    position: absolute; top: -6px; right: -7px; min-width: 17px; height: 17px; padding: 0 4px; box-sizing: border-box;
    border-radius: 99px; display: grid; place-items: center; font-size: 10px; font-weight: 700; line-height: 1;
    background: var(--color-rose); color: var(--color-on-accent); border: 2px solid var(--color-bg);
  }
  @keyframes ring {
    0%, 88%, 100% { transform: rotate(0); }
    91% { transform: rotate(14deg); } 94% { transform: rotate(-12deg); } 97% { transform: rotate(6deg); }
  }

  .veil { position: fixed; inset: 0; z-index: 40; }
  .menu {
    position: absolute; top: calc(100% + 7px); right: -40px; z-index: 41;
    width: 300px; display: grid; padding: 6px;
    border-radius: 13px; border: 1px solid var(--color-line2); background: var(--color-panel);
    box-shadow: 0 16px 40px rgba(0, 0, 0, .38);
  }
  .hd { display: flex; align-items: center; padding: 6px 8px 8px; }
  .hd b { font-size: 13px; }
  .all { margin-left: auto; appearance: none; border: 0; background: none; cursor: pointer; font: inherit; font-size: 11.5px; color: var(--color-lav); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; max-height: 340px; overflow-y: auto; }
  li button {
    width: 100%; appearance: none; cursor: pointer; font: inherit; text-align: left;
    display: grid; grid-template-columns: 8px minmax(0, 1fr); column-gap: 9px; row-gap: 1px; align-items: center;
    padding: 9px 8px; border-radius: 9px; border: 0; background: transparent; color: var(--color-tx3);
  }
  li button:hover { background: var(--color-bg2); }
  li button.unseen { color: var(--color-tx); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: transparent; }
  .unseen .dot { background: var(--color-lav); }
  .unseen .dot.k-done { background: var(--color-mint); }
  .unseen .dot.k-update { background: var(--color-lav); }
  .unseen .dot.k-new, .unseen .dot.k-more { background: var(--color-peach); }
  .tx { font-size: 12.5px; line-height: 1.45; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; word-break: break-all; }
  .at { grid-column: 2; font-size: 11px; color: var(--color-tx3); }
  .empty { margin: 0; padding: 18px 10px 20px; text-align: center; font-size: 12px; line-height: 1.6; color: var(--color-tx3); }
  .foot { margin-top: 4px; padding: 8px; border-top: 1px solid var(--color-line); text-align: center; font-size: 11.5px; color: var(--color-tx3); text-decoration: none; }
  .foot:hover { color: var(--color-tx); }

  @media (max-width: 672px) {
    .menu { position: fixed; top: 58px; right: 8px; left: 8px; width: auto; }
  }
</style>
