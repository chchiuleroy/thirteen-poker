// 發牌與五條出現率統計，並和超幾何分布的理論值比對
// 用法：node sim/rule_stats.js [deals=300000]
const E = require('../js/engine.js');
const DEALS = parseInt(process.argv[2] || '300000', 10);

function logC(n, k) { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; }
const hyper = (N, K, n, k) => Math.exp(logC(K, k) + logC(N - K, n - k) - logC(N, n)); // 從 N 張含 K 張目標抽 n 張恰 k 張

// 理論：某手 13 張，「鬼牌數 + 某點數張數 ≥ 5」的機率（可湊出五條）= 用蒙地卡羅以外的精確式不易，這裡只比對鬼牌分布
for (const n of [2, 3, 4]) {
  const rng = E.mulberry32(1234 + n);
  const total = 54 * n, jokers = 2 * n;
  const jc = new Array(14).fill(0);
  let canFive = 0, naturalFive = 0, handsN = 0;
  for (let d = 0; d < DEALS; d++) {
    const hands = E.deal(n, rng);
    for (const h of hands) {
      handsN++;
      const cnt = new Array(15).fill(0); let j = 0;
      for (const c of h) { if (c === E.JOKER) j++; else cnt[(c >> 2) + 2]++; }
      jc[j]++;
      const mx = Math.max(...cnt);
      if (mx + j >= 5) canFive++;
      if (mx >= 5) naturalFive++;
    }
  }
  console.log(`\nN=${n}（${n} 副牌，${total} 張，鬼牌 ${jokers} 張）  樣本 ${handsN} 手`);
  console.log('  鬼牌數  觀察機率    超幾何理論     相對誤差');
  for (let k = 0; k <= 5; k++) {
    const th = hyper(total, jokers, 13, k), ob = jc[k] / handsN;
    console.log(`  ${k}       ${ob.toFixed(5)}   ${th.toFixed(5)}   ${(((ob - th) / th) * 100).toFixed(2)}%`);
  }
  console.log(`  可湊五條（同點數張數 + 鬼牌 ≥ 5）的手牌比例: ${(canFive / handsN * 100).toFixed(2)}%`);
  console.log(`  不靠鬼牌、自然 5 張同點數的手牌比例: ${(naturalFive / handsN * 100).toFixed(3)}%`);
}
