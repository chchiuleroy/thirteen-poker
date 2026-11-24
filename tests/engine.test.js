// node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const tables = require('../js/tables.js');

const J = E.JOKER;
const C = (r, s) => (r - 2) * 4 + s; // rank 2..14, suit 0..3
const cat = (cards) => E.catOf(E.evalLane(cards));

test('牌型階級：五條 > 同花順 > 鐵支 > 葫蘆 > 同花 > 順子 > 三條 > 兩對 > 一對 > 烏龍', () => {
  const hands = [
    [C(14, 0), C(14, 1), C(14, 2), C(14, 3), J],                 // 五條
    [C(10, 0), C(11, 0), C(12, 0), C(13, 0), C(14, 0)],          // 同花順
    [C(9, 0), C(9, 1), C(9, 2), C(9, 3), C(2, 0)],               // 鐵支
    [C(9, 0), C(9, 1), C(9, 2), C(3, 3), C(3, 0)],               // 葫蘆
    [C(2, 1), C(5, 1), C(9, 1), C(11, 1), C(13, 1)],             // 同花
    [C(5, 0), C(6, 1), C(7, 2), C(8, 3), C(9, 0)],               // 順子
    [C(9, 0), C(9, 1), C(9, 2), C(3, 3), C(5, 0)],               // 三條
    [C(9, 0), C(9, 1), C(4, 2), C(4, 3), C(5, 0)],               // 兩對
    [C(9, 0), C(9, 1), C(4, 2), C(6, 3), C(5, 0)],               // 一對
    [C(9, 0), C(11, 1), C(4, 2), C(6, 3), C(2, 0)],              // 烏龍
  ];
  const vals = hands.map(E.evalLane);
  for (let i = 0; i < vals.length - 1; i++) assert.ok(vals[i] > vals[i + 1], `第 ${i} 型應大於第 ${i + 1} 型`);
  assert.deepEqual(vals.map(E.catOf), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
});

test('A 的雙重身分：A-2-3-4-5 是最小順子、10-J-Q-K-A 是最大順子，Q-K-A-2-3 不算順子', () => {
  const wheel = E.evalLane([C(14, 0), C(2, 1), C(3, 2), C(4, 3), C(5, 0)]);
  const six = E.evalLane([C(2, 0), C(3, 1), C(4, 2), C(5, 3), C(6, 0)]);
  const broadway = E.evalLane([C(10, 0), C(11, 1), C(12, 2), C(13, 3), C(14, 0)]);
  assert.equal(E.catOf(wheel), E.CAT.STRAIGHT);
  assert.ok(wheel < six && six < broadway);
  assert.equal(cat([C(12, 0), C(13, 1), C(14, 2), C(2, 3), C(3, 0)]), E.CAT.HIGH);
});

test('鬼牌是任意牌：湊成最大牌型（含五條、同花順、輪子同花順）', () => {
  assert.equal(cat([J, J, J, C(14, 0), C(14, 1)]), E.CAT.FIVE);
  assert.equal(cat([J, C(7, 0), C(7, 1), C(7, 2), C(7, 3)]), E.CAT.FIVE);       // 四條 + 鬼 = 五條
  assert.equal(cat([J, C(14, 0), C(2, 0), C(3, 0), C(4, 0)]), E.CAT.STRAIGHT_FLUSH); // 輪子同花順
  assert.equal(cat([J, J, J, C(13, 0), C(12, 1)]), E.CAT.QUAD);                  // 不同點數兩張 → 最多鐵支
  assert.equal(cat([J, C(13, 0), C(13, 1), C(9, 0), C(9, 1)]), E.CAT.FULL_HOUSE);
  assert.equal(cat([J, C(2, 0), C(5, 0), C(9, 0), C(12, 0)]), E.CAT.FLUSH);
  assert.equal(cat([J, C(2, 0), C(5, 1), C(9, 2), C(12, 3)]), E.CAT.PAIR);       // 鬼只能湊一對（無更大牌型）
  // 鬼牌湊出的牌型要拿最大點數：鬼 + K K 9 9 → 葫蘆 K 帶 9（不是 9 帶 K）
  assert.ok(E.evalLane([J, C(13, 0), C(13, 1), C(9, 0), C(9, 1)]) > E.evalLane([C(9, 0), C(9, 1), C(9, 2), C(13, 0), C(13, 1)]));
});

test('五個相同點數：多副牌自然五條（含重複同一張牌），且贏過同花順', () => {
  const five = E.evalLane([C(5, 0), C(5, 0), C(5, 1), C(5, 2), C(5, 3)]);
  const sf = E.evalLane([C(10, 0), C(11, 0), C(12, 0), C(13, 0), C(14, 0)]);
  assert.equal(E.catOf(five), E.CAT.FIVE);
  assert.ok(five > sf);
  assert.ok(E.evalLane([C(6, 0), C(6, 1), C(6, 2), C(6, 3), J]) > five); // 六的五條 > 五的五條
});

test('頭墩 3 張：只有烏龍／一對／三條，3 張同花連號也不算順子或同花', () => {
  assert.equal(cat([C(10, 0), C(11, 0), C(12, 0)]), E.CAT.HIGH);
  assert.equal(cat([C(9, 0), C(9, 1), C(2, 0)]), E.CAT.PAIR);
  assert.equal(cat([C(9, 0), C(9, 1), C(9, 2)]), E.CAT.TRIPS);
  assert.equal(cat([J, C(9, 1), C(9, 2)]), E.CAT.TRIPS);
  assert.equal(cat([J, J, C(3, 0)]), E.CAT.TRIPS);
  assert.equal(cat([J, C(14, 0), C(3, 0)]), E.CAT.PAIR);
});

test('倒水判定：尾 ≥ 中 ≥ 頭 才合法；頭墩三條壓過中墩一對即倒水', () => {
  const front = E.evalLane([C(9, 0), C(9, 1), C(9, 2)]);
  const mid = E.evalLane([C(14, 0), C(14, 1), C(2, 2), C(3, 3), C(4, 0)]);
  const back = E.evalLane([C(10, 0), C(10, 1), C(10, 2), C(3, 1), C(3, 2)]);
  assert.equal(E.isFoul(front, mid, back), true);
  assert.equal(E.isFoul(mid, front, back), false);
  assert.equal(E.isFoul(mid, mid, mid), false); // 相等允許
});

function sc(arrs) { return E.scoreRound(arrs); }
// 固定測試牌墩
const ARR = {
  weakest: { front: [C(2, 0), C(4, 1), C(7, 2)], mid: [C(2, 1), C(5, 2), C(8, 3), C(10, 0), C(13, 1)], back: [C(3, 0), C(6, 1), C(9, 2), C(11, 3), C(14, 0)] },
  pairs: { front: [C(3, 0), C(3, 1), C(9, 2)], mid: [C(5, 0), C(5, 1), C(8, 2), C(10, 3), C(12, 0)], back: [C(6, 0), C(6, 1), C(8, 3), C(11, 2), C(13, 3)] },
  trips: { front: [C(9, 0), C(9, 1), C(9, 2)], mid: [C(10, 0), C(10, 1), C(10, 2), C(3, 1), C(3, 2)], back: [C(12, 0), C(12, 1), C(12, 2), C(12, 3), C(5, 0)] },
};

test('計分：贏墩 +1、打槍基本分 6、衝三／中墩葫蘆／尾墩鐵支加分', () => {
  const r = sc([ARR.trips, ARR.weakest]);
  // 三墩全勝（打槍）：6；衝三 +1、中墩葫蘆 +1、尾墩鐵支 +2 → 10
  assert.deepEqual(r.totals, [10, -10]);
  assert.deepEqual(r.homerun, [false, false]); // 2 人無全壘打
});

test('計分：兩人互有勝負，只算單墩 ±1', () => {
  const a = ARR.pairs; // 頭墩一對3、中墩一對5、尾墩一對6
  const b = { front: ARR.weakest.front, mid: [C(11, 0), C(11, 1), C(2, 2), C(5, 3), C(8, 0)], back: [C(12, 0), C(12, 1), C(3, 2), C(6, 3), C(9, 0)] };
  assert.equal(sc([b, b]).foul[0], false); // b 本身合法
  const r = sc([a, b]);
  // a：頭墩 一對 > 烏龍 (+1)；中墩 一對5 < 一對J (-1)；尾墩 一對6 < 一對Q (-1) → -1
  assert.deepEqual(r.totals, [-1, 1]);
});

test('計分：倒水者被所有人打槍（-6），兩人都倒水不計分', () => {
  const foul = { front: ARR.trips.back.slice(0, 3), mid: ARR.weakest.mid, back: ARR.weakest.back }; // 頭墩 QQQ > 中墩烏龍
  assert.equal(sc([foul, ARR.weakest]).foul[0], true);
  const r = sc([foul, ARR.weakest]);
  assert.deepEqual(r.totals, [-6, 6]);
  assert.deepEqual(sc([foul, foul]).totals, [0, 0]);
});

test('計分：全壘打（3 人）：A 打槍 B、C → 每人 12；B、C 之間照常比', () => {
  const r = sc([ARR.pairs, ARR.weakest, ARR.weakest]);
  // pairs 對 weakest：頭墩一對>烏龍、中墩一對>烏龍、尾墩一對>烏龍 → 打槍 6，全壘打 12
  assert.deepEqual(r.homerun, [true, false, false]);
  assert.deepEqual(r.totals, [24, -12, -12]);
});

test('零和：隨機桌面任何人數總分都是 0', () => {
  const rng = E.mulberry32(99);
  for (let t = 0; t < 400; t++) {
    const n = 2 + (t % 3);
    const hands = E.deal(n, rng);
    const arrs = hands.map((h) => {
      if (rng() < 0.5) return AI.choose('hard', h, { n, rng, tables });
      const s = E.shuffle(h.slice(), rng);
      return { front: s.slice(0, 3), mid: s.slice(3, 8), back: s.slice(8, 13) };
    });
    const r = sc(arrs);
    assert.equal(r.totals.reduce((x, y) => x + y, 0), 0);
  }
});

test('發牌：N 人 = N 副牌 + 2N 鬼牌，每人 13 張，且全部來自牌堆', () => {
  for (const n of [2, 3, 4]) {
    const shoe = E.makeShoe(n);
    assert.equal(shoe.length, 54 * n);
    assert.equal(shoe.filter((c) => c === J).length, 2 * n);
    for (let c = 0; c < 52; c++) assert.equal(shoe.filter((x) => x === c).length, n);
    const hands = E.deal(n, E.mulberry32(5));
    assert.equal(hands.length, n);
    const used = {};
    for (const h of hands) { assert.equal(h.length, 13); for (const c of h) used[c] = (used[c] || 0) + 1; }
    for (const c of Object.keys(used)) assert.ok(used[c] <= (Number(c) === J ? 2 * n : n));
  }
});

test('發牌均勻性：卡方檢定（每種牌被抽中的次數）', () => {
  const n = 3, rng = E.mulberry32(2026), trials = 30000;
  const obs = new Array(53).fill(0);
  for (let t = 0; t < trials; t++) for (const c of E.deal(n, rng)[0]) obs[c]++;
  const total = trials * 13;
  let chi = 0;
  for (let c = 0; c < 53; c++) {
    const exp = total * (c === J ? 2 * n : n) / (54 * n);
    chi += (obs[c] - exp) ** 2 / exp;
  }
  // 自由度 52，p=0.001 的臨界值約 82.0
  assert.ok(chi < 82, `chi2=${chi.toFixed(1)}`);
});

// ---- AI ----
function bruteLegalCount(hand) {
  let n = 0;
  const idx = [...Array(13).keys()];
  const comb = (arr, k) => { const out = []; (function rec(s, cur) { if (cur.length === k) { out.push(cur.slice()); return; } for (let i = s; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); } })(0, []); return out; };
  for (const f of comb(idx, 3)) {
    const rest = idx.filter((i) => !f.includes(i));
    const vf = E.evalLane(f.map((i) => hand[i]));
    for (const m of comb(rest, 5)) {
      const b = rest.filter((i) => !m.includes(i));
      const vm = E.evalLane(m.map((i) => hand[i])), vb = E.evalLane(b.map((i) => hand[i]));
      if (!E.isFoul(vf, vm, vb)) n++;
    }
  }
  return n;
}

test('AI 列舉：合法擺法數與暴力窮舉（72072 種切分逐一檢查）完全一致', () => {
  const rng = E.mulberry32(31337);
  for (let t = 0; t < 3; t++) {
    const hand = E.deal(4, rng)[0];
    let cnt = 0;
    AI.forEachLegal(AI.prep(hand), () => cnt++);
    assert.equal(cnt, bruteLegalCount(hand));
  }
});

test('各級 AI：絕不倒水、牌一張不少一張不多，且牌力值與重新評價一致', () => {
  const rng = E.mulberry32(8);
  for (const level of ['random', 'greedy', 'hard', 'super', 'extreme']) {
    for (let t = 0; t < 120; t++) {
      const n = 2 + (t % 3);
      const hand = E.deal(n, rng)[0];
      const models = []; for (let o = 0; o < n - 1; o++) { const m = AI.makeModel(); if (t % 2) AI.observe(m, [E.V(1, 5, 3, 0, 0, 0), E.V(2, 9, 4, 3, 0, 0), E.V(5, 13, 11, 8, 4, 2)]); models.push(m); }
      const a = AI.choose(level, hand, { n, rng, tables, models });
      assert.equal(a.front.length, 3); assert.equal(a.mid.length, 5); assert.equal(a.back.length, 5);
      assert.deepEqual([...a.front, ...a.mid, ...a.back].sort((x, y) => x - y), hand.slice().sort((x, y) => x - y));
      const v = E.valuesOf(a);
      assert.deepEqual(v, a.vals);
      assert.equal(E.isFoul(v[0], v[1], v[2]), false, `${level} 倒水`);
    }
  }
});

test('hard 與 greedy 在已知牌上的選擇：能湊五條就把五條放尾墩', () => {
  // 5 張 K（含鬼牌）+ 其他散牌：尾墩應是五條 K
  const hand = [C(13, 0), C(13, 1), C(13, 2), C(13, 3), J, C(2, 0), C(4, 1), C(6, 2), C(8, 3), C(10, 0), C(3, 1), C(5, 2), C(9, 3)];
  const rng = E.mulberry32(1);
  for (const level of ['greedy', 'hard', 'super', 'extreme']) {
    const a = AI.choose(level, hand, { n: 2, rng, tables, models: [AI.makeModel()] });
    assert.equal(E.catOf(a.vals[2]), E.CAT.FIVE, level);
  }
});
