/**
 * 마우스를 올리면 뜨는 설명.
 *
 * 브라우저가 기본으로 주는 title은 한참 기다려야 뜨고 모양도 못 바꾼다. 직접 그린다.
 *
 * 편하게 느껴지려면 몇 가지가 필요하다.
 *   - 처음 하나는 잠깐 뜸을 들인다. 지나가기만 해도 뜨면 화면이 어지럽다.
 *   - 한 번 뜬 뒤 옆으로 옮기면 곧바로 바꿔 보여 준다. 그때마다 기다리면 답답하다.
 *   - 떠 있는 동안에는 자리를 붙잡는다. 글이 바뀌어도(칩 금액처럼 계속 움직인다)
 *     다시 가운데 맞추지 않는다. 가만히 있는데 툴팁이 흔들리면 그게 제일 거슬린다.
 *   - 위/아래도 한 번 정하면 사라질 때까지 바꾸지 않는다.
 *
 * 띄우는 자리는 body다. 카드나 모달 안에 두면 overflow에 잘린다.
 * 앱 화면에는 배율이 걸려 있지만 body에는 걸려 있지 않아서,
 * getBoundingClientRect가 주는 화면 좌표를 그대로 쓰면 맞는다.
 */
const GAP = 9        // 대상과 띄울 간격
const EDGE = 8       // 화면 가장자리에서 남길 여백
const WAIT = 350     // 처음 하나가 뜨기까지
const LINGER = 500   // 이 안에 다음 것으로 옮기면 기다리지 않는다
const ARROW = 6      // 삼각형 한 변의 절반

let box: HTMLDivElement | null = null
let arrow: HTMLDivElement | null = null
let owner: HTMLElement | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let lastHid = 0

function make() {
  if (box && arrow) return { box, arrow }
  const d = document.createElement('div')
  d.setAttribute('role', 'tooltip')
  d.style.cssText = 'position:fixed;left:0;top:0;z-index:200;pointer-events:none;opacity:0;'
    + 'max-width:280px;padding:7px 11px;border-radius:9px;'
    + 'font:14px/1.5 var(--font-sans),system-ui,sans-serif;white-space:pre-line;'
    + 'color:var(--color-tx,#ecebf2);background:var(--color-panel2,#2b2d36);'
    + 'border:1px solid var(--color-line2,#474b59);box-shadow:0 10px 28px rgba(0,0,0,.45);'
    + 'transition:opacity .13s ease,transform .13s ease;transform:translateY(2px)'
  const a = document.createElement('div')
  a.style.cssText = `position:absolute;width:${ARROW * 2}px;height:${ARROW * 2}px;transform:rotate(45deg);`
    + 'background:var(--color-panel2,#2b2d36);border:1px solid var(--color-line2,#474b59)'
  d.appendChild(a)
  document.body.appendChild(d)
  box = d
  arrow = a
  return { box: d, arrow: a }
}

/** 대상 위(또는 아래) 가운데에 놓는다. 뜰 때 딱 한 번만 부른다. */
function place(node: HTMLElement) {
  const { box: d, arrow: a } = make()
  const r = node.getBoundingClientRect()
  const w = d.offsetWidth
  const h = d.offsetHeight
  const above = r.top - GAP - h >= EDGE
  const top = above ? r.top - GAP - h : Math.min(innerHeight - h - EDGE, r.bottom + GAP)
  const mid = r.left + r.width / 2
  const left = Math.max(EDGE, Math.min(innerWidth - w - EDGE, mid - w / 2))
  d.style.left = `${Math.round(left)}px`
  d.style.top = `${Math.round(top)}px`
  // 화살표는 대상 가운데를 가리킨다. 툴팁이 가장자리에서 밀려도 따라간다
  a.style.left = `${Math.round(Math.max(ARROW + 3, Math.min(w - ARROW * 3 - 3, mid - left - ARROW)))}px`
  a.style.top = above ? `${h - ARROW - 1}px` : `${-ARROW - 1}px`
  a.style.clipPath = above ? 'polygon(100% 0, 100% 100%, 0 100%)' : 'polygon(0 0, 100% 0, 0 100%)'
}

function hide() {
  clearTimeout(timer)
  if (!owner) return
  owner = null
  lastHid = Date.now()
  if (!box) return
  box.style.opacity = '0'
  box.style.transform = 'translateY(2px)'
}

function paint(node: HTMLElement, text: string) {
  const { box: d, arrow: a } = make()
  d.textContent = text
  d.appendChild(a)   // textContent가 화살표를 지운다
  owner = node
  place(node)
  d.style.opacity = '1'
  d.style.transform = 'none'
}

/**
 * 설명을 붙인다. 빈 문자열이면 아무것도 하지 않는다.
 * 내용이 바뀌면 떠 있는 동안에도 글자만 바뀐다. 자리는 그대로 둔다.
 */
export function tip(node: HTMLElement, text: string) {
  let now = text

  const show = () => {
    if (!now) return
    clearTimeout(timer)
    // 방금까지 다른 설명이 떠 있었으면 기다리지 않는다
    const wait = owner || Date.now() - lastHid < LINGER ? 0 : WAIT
    if (!wait) return paint(node, now)
    timer = setTimeout(() => paint(node, now), wait)
  }
  const off = () => {
    clearTimeout(timer)
    if (owner === node || !owner) hide()
  }

  node.addEventListener('pointerenter', show)
  node.addEventListener('pointerleave', off)
  node.addEventListener('pointerdown', off)   // 누르면 치운다. 남아 있으면 거슬린다
  node.addEventListener('focus', show)
  node.addEventListener('blur', off)

  return {
    update(next: string) {
      now = next
      if (owner !== node || !box) return
      if (!next) return hide()
      // 글자만 갈아 끼운다. 다시 가운데 맞추면 떠 있는 채로 흔들린다
      box.textContent = next
      box.appendChild(arrow!)
    },
    destroy() {
      off()
      node.removeEventListener('pointerenter', show)
      node.removeEventListener('pointerleave', off)
      node.removeEventListener('pointerdown', off)
      node.removeEventListener('focus', show)
      node.removeEventListener('blur', off)
    },
  }
}

// 화면이 움직이면 붙어 있던 자리가 어긋난다. 그냥 치운다
if (typeof window !== 'undefined') {
  addEventListener('scroll', hide, true)
  addEventListener('resize', hide)
}
