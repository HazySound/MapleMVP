/**
 * 안내에 쓰는 인게임 그림과, 그 위에 테두리를 두를 자리.
 *
 * 게임 위에 뜨는 작은 창(web/pip)과 앱 안의 사용법 창이 같은 그림을 쓴다.
 * 따로 두면 한쪽만 고쳐져서 서로 다른 자리를 가리키게 된다.
 *
 * 자리는 비율로 적는다. 그림을 어떤 크기로 그리든 그대로 맞는다.
 * (금액은 뭉개 뒀다. 화면 전체를 공유하면 이 그림도 같이 찍혀서,
 *  거기 적힌 숫자가 게임의 진짜 숫자와 섞이면 합계를 못 고른다.)
 */
import menuShot from './assets/mvp-menu.webp'
import panelShot from './assets/mvp-panel.webp'
import tipShot from './assets/mvp-tip.webp'

export const SHOT = {
  /** ESC 메뉴의 이벤트 칸 */
  menu: { src: menuShot, w: 200, h: 298 },
  /** MVP 패널만 */
  panel: { src: panelShot, w: 420, h: 126 },
  /** 등급 게이지에 마우스를 올렸을 때 뜨는 주차별 표(2026-11-19 리뉴얼, 숫자는 뭉갬) */
  tip: { src: tipShot, w: 470, h: 317 },
}

export const SPOT = {
  /** 메뉴: 이벤트 칸의 MVP */
  mvp: 'left:4.5%;top:61.5%;width:39.5%;height:9.7%',
  /** 패널: 마우스를 올리면 주차별 표가 뜨는 자리(등급 게이지와 그 아래 등급 칸) */
  hover: 'left:2%;top:4%;width:96%;height:90%',
  /** 표가 뜬 화면: 마우스로 가리면 안 되는 숫자 칸 */
  table: 'left:8.9%;top:11.9%;width:90.7%;height:88.1%',
}
