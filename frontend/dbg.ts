import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { scan, toGray } from './src/lib/core/ocr'
import { acceptReading } from './src/lib/core/scan'
const TRUTH = [20330,46750,46750,48850,48850,88850,108850,108850,138650,178450,178450,646300]
const C = [30000,26420,0,0,0,40000,20000,0,29800,39800,0,467850,253700]
for (const n of process.argv.slice(2)) {
  const p = PNG.sync.read(readFileSync(`test/captures/${n}.png`))
  const r = scan(toGray(p.data, p.width, p.height))
  console.log(`\n=== ${n} 배율 ${r.scale.toFixed(2)} 후보 ${r.readings.length} ===`)
  for (const v of r.readings) {
    const bad = v.map((x,i)=> x===TRUTH[i] ? null : `${i+1}행 ${TRUTH[i]}→${x}`).filter(Boolean)
    console.log(`  통과=${acceptReading(v,C)?'O':'X'} 틀림 ${bad.length}: ${bad.slice(0,3).join(', ')}`)
  }
}
