/**
 * 제보자·운영자 계정의 실제 숫자. 결제 정보라 git에 올리지 않는다(test/private/, .gitignore).
 * 파일이 없는 곳에서는 이 숫자를 쓰는 테스트를 건너뛴다. 캡처 테스트와 같은 방식이다.
 *
 * src 안의 테스트도 가져다 쓰므로 node 모듈을 쓰지 않는다. 앱 타입 검사에 node 타입이 섞이면
 * 타이머 같은 전역 타입이 바뀐다. glob은 파일이 없으면 빈 결과를 줄 뿐이라 그대로 쓴다.
 */
export interface Real {
  /** 블랙 제보자: 툴팁 12줄, '사용 이월' 열(과 그 오독), 화면 숫자, 결제 */
  reporter: {
    tip: number[]
    carry: number[]
    carryMisread: number[]
    amounts: number[]
    spent13: number[]
    spentByWeek: Record<string, number>
    pcKnown: Record<string, number>
    /** 툴팁에서 되짚은 넥슨 13주 금액 */
    nexon13: number[]
    /** 13주 바로 앞 주의 넥슨 금액(PC방 추정 포함) */
    outsideWeek: number
  }
  /** 툴팁 앞쪽 줄이 0 캐시인 다이아 계정 */
  operator: { needs: number[]; spent: number[]; amounts: number[] }
}

const found = import.meta.glob('./private/cases.json', { eager: true, import: 'default' })
export const real = (Object.values(found)[0] ?? null) as Real | null
