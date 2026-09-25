/**
 * 웹폰트.
 *
 * 한글 웹폰트는 글자가 많아서 유니코드 구간별로 잘라 싣는다. 브라우저가 지금
 * 화면에 필요한 조각만 받아 가는 대신, @font-face 선언이 사백 줄 가까이 되어
 * CSS 하나가 766KB가 된다.
 *
 * 그것을 첫 화면 CSS에 같이 넣으면 화면이 그 내려받기를 기다렸다가 그려진다.
 * 그래서 여기로 떼어 내 앱이 뜬 뒤에 싣는다. 먼저 시스템 글꼴로 그리고,
 * 웹폰트가 도착하면 바꿔 끼운다(fontsource가 font-display: swap을 넣어 준다).
 * 끝내 안 와도 app.css의 글꼴 목록에 적어 둔 대체 글꼴로 멀쩡히 보인다.
 */
import '@fontsource/orbit/400.css'
import '@fontsource/ibm-plex-sans-kr/400.css'
import '@fontsource/ibm-plex-sans-kr/500.css'
import '@fontsource/ibm-plex-sans-kr/600.css'
import '@fontsource/ibm-plex-sans-kr/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
