<script lang="ts">
  /**
   * 그림 붙이기. 글쓰기와 답글이 같이 쓴다.
   *
   * 게임 캡처는 대개 클립보드에 있다(Print Screen, Win+Shift+S). 파일로 저장하게
   * 하면 거기서 한 번 더 막힌다. 그래서 Ctrl+V를 가장 먼저 받는다. 끌어다 놓기와
   * 파일 고르기도 된다.
   *
   * 붙이는 즉시 서버에 올려 둔다. 글을 올릴 때는 번호만 보낸다.
   */
  import { upload } from '../web/qna'

  interface Shot { key: number; url: string; id?: string; error?: string }

  let {
    ids = $bindable([]),
    need = false,
    busy = $bindable(false),
    paste = true,
  }: { ids?: string[]; need?: boolean; busy?: boolean; paste?: boolean } = $props()

  const MAX = 6
  let shots = $state<Shot[]>([])
  let over = $state(false)
  let why = $state('')
  let input: HTMLInputElement
  let seq = 0

  const sync = () => {
    ids = shots.filter(s => s.id).map(s => s.id!)
    busy = shots.some(s => !s.id && !s.error)
  }

  async function add(files: File[]) {
    why = ''
    const imgs = files.filter(f => f.type.startsWith('image/'))
    if (!imgs.length) { why = '그림 파일만 붙일 수 있어요'; return }
    const room = MAX - shots.length
    if (room <= 0) { why = `그림은 ${MAX}장까지예요`; return }
    if (imgs.length > room) why = `그림은 ${MAX}장까지라 ${room}장만 붙였어요`
    for (const f of imgs.slice(0, room)) {
      const s: Shot = { key: ++seq, url: URL.createObjectURL(f) }
      shots.push(s)
      sync()
      const r = await upload(f)
      const at = shots.findIndex(x => x.key === s.key)
      if (at < 0) continue   // 올라가는 사이에 뺐다
      shots[at] = { ...shots[at], id: r.id, error: r.error }
      sync()
    }
  }

  function remove(key: number) {
    const s = shots.find(x => x.key === key)
    if (s) URL.revokeObjectURL(s.url)
    shots = shots.filter(x => x.key !== key)
    sync()
  }

  /** 글을 올린 뒤 비운다 */
  export function clear() {
    for (const s of shots) URL.revokeObjectURL(s.url)
    shots = []
    why = ''
    sync()
  }

  function onPaste(e: ClipboardEvent) {
    if (!paste) return
    const files = [...(e.clipboardData?.files ?? [])]
    if (!files.some(f => f.type.startsWith('image/'))) return   // 글자 붙여 넣기는 그대로 둔다
    e.preventDefault()
    void add(files)
  }
</script>

<svelte:window onpaste={onPaste} />

<div class="shots">
  <button type="button" class="drop" class:over class:need={need && !ids.length}
    onclick={() => input.click()}
    ondragover={e => { e.preventDefault(); over = true }}
    ondragleave={() => (over = false)}
    ondrop={e => { e.preventDefault(); over = false; void add([...(e.dataTransfer?.files ?? [])]) }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5.2-5.2L6 20"/>
    </svg>
    <span class="big"><b>Ctrl+V</b>로 붙여 넣기</span>
    <span class="small">또는 끌어다 놓거나 눌러서 고르기 · {shots.length}/{MAX}장</span>
  </button>
  <input bind:this={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden
    onchange={e => { void add([...(e.currentTarget.files ?? [])]); e.currentTarget.value = '' }} />

  {#if shots.length}
    <ul class="thumbs">
      {#each shots as s (s.key)}
        <li class:err={!!s.error}>
          <img src={s.url} alt="붙인 그림" />
          {#if !s.id && !s.error}<span class="state"><i></i></span>{/if}
          {#if s.error}<span class="state bad">{s.error}</span>{/if}
          <button type="button" class="x" onclick={() => remove(s.key)} aria-label="그림 빼기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if why}<p class="why">{why}</p>{/if}
</div>

<style>
  .shots { display: grid; gap: 8px; min-width: 0; }
  .drop {
    appearance: none; cursor: pointer; font: inherit; color: var(--color-tx2);
    display: grid; justify-items: center; gap: 2px; padding: 16px 12px;
    border-radius: 12px; border: 1.5px dashed var(--color-line2); background: var(--color-bg2);
    transition: border-color .2s, background .2s;
  }
  .drop:hover, .drop.over { border-color: var(--color-lav); background: color-mix(in oklab, var(--color-lav) 8%, var(--color-bg2)); }
  .drop.need { border-color: color-mix(in oklab, var(--color-peach) 70%, transparent); }
  .drop svg { width: 22px; height: 22px; color: var(--color-tx3); margin-bottom: 2px; }
  .big { font-size: 13px; }
  .big b { color: var(--color-lav); font-family: var(--font-mono); font-weight: 600; }
  .small { font-size: 11.5px; color: var(--color-tx3); }
  .thumbs { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .thumbs li {
    position: relative; width: 108px; height: 72px; border-radius: 9px; overflow: hidden;
    border: 1px solid var(--color-line); background: var(--color-bg2);
  }
  .thumbs li.err { border-color: var(--color-bad); }
  .thumbs img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .state {
    position: absolute; inset: 0; display: grid; place-items: center; padding: 4px;
    background: color-mix(in oklab, var(--color-scrim) 55%, transparent);
    font-size: 10.5px; text-align: center; line-height: 1.3; color: #fff;
  }
  .state.bad { background: color-mix(in oklab, var(--color-bad) 55%, transparent); }
  .state i { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; animation: spin .8s linear infinite; }
  .x {
    position: absolute; top: 4px; right: 4px; appearance: none; cursor: pointer;
    width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; padding: 0;
    border: 0; background: rgba(20, 21, 26, .75); color: #fff;
  }
  .x svg { width: 12px; height: 12px; }
  .why { margin: 0; font-size: 11.5px; color: var(--color-peach); }
</style>
