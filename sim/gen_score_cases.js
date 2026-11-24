// 產生「整桌計分」測試案例（含倒水、打槍、全壘打、各種加分），輸出 JSON 供 Python 獨立實作交叉驗證。
// 用法：node sim/gen_score_cases.js <輸出檔> [桌數]
const fs = require('fs');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const tables = require('../js/tables.js');
const out = process.argv[2];
const COUNT = parseInt(process.argv[3] || '6000', 10);
const rng = E.mulberry32(777);
const cases = [];
for (let c = 0; c < COUNT; c++) {
  const n = 2 + (c % 3);
  const hands = E.deal(n, rng);
  const arrs = hands.map((h) => {
    const r = rng();
    if (r < 0.55) return AI.choose('hard', h, { n, rng, tables });
    if (r < 0.80) return AI.choose('super', h, { n, rng, tables });
    if (r < 0.90) return AI.choose('random', h, { n, rng, tables });
    const s = E.shuffle(h.slice(), rng);                   // 純隨機切分，多半倒水
    return { front: s.slice(0, 3), mid: s.slice(3, 8), back: s.slice(8, 13) };
  });
  const sc = E.scoreRound(arrs);
  cases.push({ n, arrs: arrs.map((a) => ({ front: a.front, mid: a.mid, back: a.back })), totals: sc.totals, homerun: sc.homerun, foul: sc.foul });
}
fs.writeFileSync(out, JSON.stringify(cases));
const stat = { foul: 0, homerun: 0, tables: cases.length };
for (const c of cases) { stat.foul += c.foul.filter(Boolean).length; stat.homerun += c.homerun.filter(Boolean).length; }
console.log('score cases:', JSON.stringify(stat));
