/**
 * 문의 목록 탭별로 마지막에 받은 첫 장. 게시판을 나갔다 와도 바로 보이게 모듈에 둔다.
 * 계정마다 보이는 글(비공개·내 문의)이 다르니 계정도 키에 넣는다.
 */
import type { Item } from './web/qna'

export interface Page { pins: Item[]; items: Item[]; more: boolean }

const pages = new Map<string, Page>()

export const keyOf = (uid: string | undefined, kind: string, mine: boolean) => `${uid ?? ''}|${kind}|${mine ? 1 : 0}`
export const cached = (key: string) => pages.get(key)
export const keep = (key: string, p: Page) => { pages.set(key, p) }
export const forget = () => pages.clear()
