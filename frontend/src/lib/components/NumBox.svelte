<script lang="ts">
  /**
   * 숫자 칸. 치는 대로 쉼표를 붙이고, 비우면 0으로 본다.
   * decimal이면 소수점을 받는다(억 단위 가격).
   * 값은 엔터를 누르거나 칸을 벗어날 때 한 번만 넘긴다. 치는 중에 넘기면 글자마다 전체를 다시 계산하고,
   * 다 치기도 전에 목록에서 빠지는 일이 생긴다(플가보다 손해인 아이템 숨김)
   */
  let { value, set, unit = '', placeholder = '', decimal = false, id, label, size = 'md', onblur, onfocus, disabled = false }: {
    value: number
    set: (v: number) => void
    unit?: string
    placeholder?: string
    decimal?: boolean
    id: string
    label: string
    size?: 'sm' | 'md' | 'lg'
    onblur?: () => void
    onfocus?: () => void
    disabled?: boolean
  } = $props()

  // 소수도 정수 부분에는 쉼표를 붙인다 (46,000 / 7.5)
  const comma = (s: string) => { const [i, f] = s.split('.'); return (i ? Number(i).toLocaleString('ko-KR') : '0') + (f !== undefined ? '.' + f : '') }
  const fmt = (v: number) => !v ? '' : decimal ? comma(String(v)) : Math.round(v).toLocaleString('ko-KR')
  let text = $state('')
  let focused = $state(false)
  // 밖에서 값이 바뀌면(다른 칸, 불러오기) 따라간다. 치는 중에는 건드리지 않는다
  $effect(() => { if (!focused) text = fmt(value) })

  /** 쳤지만 아직 넘기지 않은 값 */
  let pending: number | null = null
  function commit() {
    if (pending !== null && pending !== value) set(pending)
    pending = null
  }
  // 치는 중에 칸이 사라져도(탭 이동 등) 친 값은 넘긴다
  $effect(() => () => commit())

  function oninput(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value
    let clean = decimal ? raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : raw.replace(/[^\d]/g, '')
    const n = Number(clean) || 0
    text = !clean ? '' : decimal ? comma(clean) : n.toLocaleString('ko-KR')
    pending = n
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { commit(); (e.currentTarget as HTMLInputElement).blur() }
  }
</script>

<span class="nb {size}" class:off={disabled}>
  <input {id} type="text" inputmode={decimal ? 'decimal' : 'numeric'} aria-label={label} {placeholder} {disabled}
    class:txt={/[가-힣]/.test(placeholder)} value={text} {oninput} {onkeydown} onfocus={() => { focused = true; onfocus?.() }} onblur={() => { commit(); focused = false; text = fmt(value); onblur?.() }} />
  {#if unit}<span class="u">{unit}</span>{/if}
</span>

<style>
  .nb {
    display: flex; align-items: center; gap: 6px; min-width: 0;
    background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 10px;
    padding: 6px 10px; transition: border-color .2s, background .2s;
  }
  .nb:focus-within { border-color: var(--color-lav); background: color-mix(in oklab, var(--color-lav) 6%, var(--color-bg2)); }
  .nb.off { opacity: .5; }
  input {
    all: unset; flex: 1; min-width: 0; width: 100%;
    font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 14px; color: var(--color-tx);
    text-align: right; user-select: text;
  }
  input::placeholder { color: var(--color-tx3); opacity: .75; }
  /* 글자 안내는 본문 글꼴로. 숫자 기준값은 그대로 숫자 글꼴 */
  input.txt::placeholder { font-family: var(--font-sans); font-size: 12px; }
  .u { flex: none; font-size: 12px; color: var(--color-tx3); }
  .sm { padding: 4px 8px; border-radius: 8px; }
  .sm input { font-size: 13px; }
  .lg { padding: 9px 14px; border-radius: 12px; }
  .lg input { font-size: 22px; font-weight: 600; }
</style>
