// 產生牌墩評價的隨機測試案例（含鬼牌、重複牌），輸出 JSON 供 Python 獨立實作交叉驗證。
// 用法：node sim/gen_eval_cases.js <輸出檔> [seed]
const fs = require('fs');
const E = require('../js/engine.js');

const out = process.argv[2];
const seed = parseInt(process.argv[3] || '20261124', 10);
if (!out) { console.error('usage: node gen_eval_cases.js <out.json> [seed]'); process.exit(2); }
const rng = E.mulberry32(seed);

const cases = [];
function add(cards) { cases.push({ cards: cards.slice(), v: E.evalLane(cards) }); }

// 1) 一般隨機（4 副牌堆，含鬼牌）：5 張與 3 張
const shoe = E.makeShoe(4);
function draw(k) { const a = E.shuffle(shoe.slice(), rng); return a.slice(0, k); }
for (let i = 0; i < 6000; i++) add(draw(5));
for (let i = 0; i < 3000; i++) add(draw(3));

// 2) 偏向特殊牌型：同點數、同花、連續點數，各自再混入 0~3 張鬼牌
function pick(a) { return a[Math.floor(rng() * a.length)]; }
for (let i = 0; i < 4000; i++) {
  const size = rng() < 0.7 ? 5 : 3;
  const j = Math.floor(rng() * 4);               // 鬼牌數 0..3
  const mode = Math.floor(rng() * 4);
  const cards = [];
  const n = size - j;
  const suit = Math.floor(rng() * 4);
  const base = 2 + Math.floor(rng() * 13);
  for (let k = 0; k < n; k++) {
    let r, s;
    if (mode === 0) { r = base; s = Math.floor(rng() * 4); }                                  // 同點數（五條／鐵支／三條）
    else if (mode === 1) { r = 2 + Math.floor(rng() * 13); s = suit; }                         // 同花
    else if (mode === 2) { r = ((base - 2 + k + Math.floor(rng() * 2)) % 13) + 2; s = rng() < 0.6 ? suit : Math.floor(rng() * 4); } // 近順子
    else { r = pick([base, base, base, 2 + Math.floor(rng() * 13)]); s = Math.floor(rng() * 4); }  // 葫蘆／三條偏向
    cards.push((r - 2) * 4 + s);
  }
  for (let k = 0; k < j; k++) cards.push(E.JOKER);
  add(E.shuffle(cards, rng));
}

// 3) 手動邊界案例
const C = (r, s) => (r - 2) * 4 + s;
const J = E.JOKER;
add([J, J, J, J, C(7, 0)]);                  // 4 鬼 + 1 張：五條
add([J, J, J, C(14, 0), C(14, 1)]);          // 五條 A（3 鬼 + AA）
add([J, J, J, C(13, 0), C(12, 1)]);          // 3 鬼 + K Q：鐵支 K 帶 Q（不是五條）
add([J, J, C(14, 0), C(13, 0), C(12, 0)]);   // 同花順 A 高（皇家）
add([J, C(14, 0), C(2, 0), C(3, 0), C(4, 0)]); // A2345 同花順（輪子，5 高）
add([J, C(14, 0), C(13, 1), C(12, 2), C(11, 3)]); // 順子 A 高
add([J, C(13, 0), C(13, 1), C(9, 0), C(9, 1)]);   // 葫蘆 K 帶 9
add([J, J, C(5, 0), C(9, 1), C(11, 2)]);     // 2 鬼：三條 11? 看評價
add([J, C(10, 1), C(10, 2), C(10, 3), C(10, 0)]);  // 5 條 10（4 自然 + 鬼）
add([C(14, 3), C(14, 3), C(14, 3), C(14, 3), C(14, 3)]); // 同一張牌五張（5 副牌堆才有，這裡測重複）
add([C(14, 3), C(14, 3), C(13, 3), C(12, 3), C(11, 3)]); // 同花（含重複 A♠）
add([J, J, J]);                               // 3 鬼：三條 A
add([J, C(2, 0), C(3, 1)]);                  // 鬼 + 2 3：一對 3（鬼當 3）
add([J, J, C(2, 0)]);                         // 三條 2? 2 鬼 + 2 → 三條 A? 看評價

fs.writeFileSync(out, JSON.stringify(cases));
console.log('cases written:', cases.length);
