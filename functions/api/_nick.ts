/**
 * 이름 검사.
 *
 * 목록을 길게 쓰는 것보다 검사 전에 변형을 되돌리는 것이 훨씬 중요하다.
 * '시1발', 'ㅅ ㅂ', '시!발'은 목록에 없어도 같은 말이다.
 *
 * 오탐이 더 아프다. 짧은 조각을 부분 일치로 막으면 멀쩡한 이름이 걸린다.
 * 그래서 짧은 것은 정확히 같을 때만, 긴 것만 포함해도 막는다.
 */

/** 정확히 같을 때만 막는다. 다른 말 속에 우연히 들어갈 수 있는 짧은 것들 */
const EXACT = [
  '시발', '씨발', 'ㅅㅂ', 'ㅄ', '병신', 'ㅂㅅ', '좆', '좃', '씹',
  '보지', '자지', '젖', '섹스', '야동', '창녀', '걸레', '새끼', '개새',
]

/** 이름 어디에 들어 있어도 막는다. 다른 뜻으로 쓰일 일이 없는 것들 */
const ANY = [
  '씨발', '시발', '씨팔', '시팔', '개새끼', '개세끼', '병신새끼', '좆같', '좆물',
  '섹스', '야동', '자위', '포르노', '강간', '성기', '정액', '애미뒤', '애비뒤',
  '느금마', '니애미', '니애비', 'fuck', 'shit', 'bitch', 'sex', 'porn',
]

/** 사칭. 이름이 남에게 보이지 않는 지금도 막아 두는 편이 낫다 */
const FAKE = [
  '운영자', '관리자', '관리인', '개발자', '공식', '고객센터', '고객지원',
  'admin', 'administrator', 'root', 'system', 'staff', 'official', 'support',
  'maplemvp', '메이플엠브이피', '넥슨', 'nexon',
]

/** 변형을 되돌린다. 띄어쓰기·특수문자·반복·숫자 섞기 */
function flatten(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '')   // 공백·특수문자
    .replace(/(.)\1{2,}/g, '$1$1')               // 'ㅅㅂㅂㅂ' → 'ㅅㅂㅂ'
}

/** 막을 이름이면 그 이유, 괜찮으면 빈 문자열 */
export function whyBad(nick: string): string {
  const flat = flatten(nick)
  const bare = flat.replace(/[0-9]/g, '')   // '시1발' 같은 끼워 넣기

  if (!flat) return '한글, 영문, 숫자로 지어 주세요'

  for (const form of [flat, bare]) {
    if (EXACT.includes(form)) return '쓸 수 없는 이름이에요'
    if (ANY.some(w => form.includes(w))) return '쓸 수 없는 이름이에요'
    if (FAKE.some(w => form.includes(w))) return '운영자로 오해할 수 있는 이름이에요'
  }
  return ''
}
