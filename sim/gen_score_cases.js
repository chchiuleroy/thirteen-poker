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
// 手工邊界：頭墩與中墩「3 張能比的部分相同」的平手情形（嚴格小於規則）
const C = (r, s) => (r - 2) * 4 + s;
const J = E.JOKER;
const back = [C(14, 0), C(14, 1), C(14, 2), C(3, 1), C(3, 2)];
const filler = { front: [C(2, 0), C(4, 1), C(7, 2)], mid: [C(3, 0), C(5, 1), C(8, 2), C(10, 3), C(13, 0)], back: [C(4, 0), C(6, 1), C(9, 2), C(11, 3), C(14, 3)] };
const ties = [
  { front: [C(14, 0), C(14, 1), C(13, 2)], mid: [C(14, 2), C(14, 3), C(13, 0), C(12, 1), C(11, 2)] },
  { front: [C(14, 0), C(14, 1), C(13, 2)], mid: [C(14, 2), C(14, 3), C(12, 0), C(11, 1), C(9, 2)] },
  { front: [C(14, 0), C(14, 1), C(3, 2)], mid: [C(14, 2), C(14, 3), C(9, 0), C(8, 1), C(7, 2)] },
  { front: [C(9, 0), C(9, 1), C(9, 2)], mid: [C(9, 3), C(9, 0), C(9, 1), C(4, 2), C(2, 3)] },
  { front: [C(8, 0), C(8, 1), C(8, 2)], mid: [C(9, 3), C(9, 0), C(9, 1), C(4, 2), C(2, 3)] },
  { front: [C(14, 0), C(13, 1), C(9, 2)], mid: [C(14, 1), C(13, 2), C(9, 3), C(4, 0), C(2, 1)] },
  { front: [C(14, 0), C(13, 1), C(8, 2)], mid: [C(14, 1), C(13, 2), C(9, 3), C(4, 0), C(2, 1)] },
  { front: [J, C(13, 1), C(5, 2)], mid: [C(13, 2), C(13, 3), C(5, 0), C(4, 1), C(2, 2)] },   // 鬼牌湊對子 K 帶 5
  { front: [C(7, 0), C(7, 1), J], mid: [C(7, 2), C(7, 3), C(7, 0), C(9, 1), C(8, 2)] },     // 頭三條 7（鬼）對中三條 7
];
for (const t of ties) for (let rep = 0; rep < 3; rep++) {
  const a = { front: t.front, mid: t.mid, back };
  const sc = E.scoreRound([a, filler]);
  cases.push({ n: 2, arrs: [a, filler], totals: sc.totals, homerun: sc.homerun, foul: sc.foul });
}
fs.writeFileSync(out, JSON.stringify(cases));
const stat = { foul: 0, homerun: 0, tables: cases.length };
for (const c of cases) { stat.foul += c.foul.filter(Boolean).length; stat.homerun += c.homerun.filter(Boolean).length; }
console.log('score cases:', JSON.stringify(stat));
