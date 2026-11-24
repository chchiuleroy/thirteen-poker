/* 十三支 AI：把 13 張牌擺成 頭(3)/中(5)/尾(5)
 *
 * 等級（由弱到強）：
 *   random   隨機合法擺法（只當驗證基準，不開放給玩家）
 *   greedy   尾→中→頭 逐墩貪心（只當驗證基準）
 *   hard     困難：加權牌型分數最大化（權重由 HL 迴圈用模擬回饋校準，見 docs/HL_LOG.md）
 *   super    超困難：對「對手牌墩分布」最大化期望得分（含額外加分與打槍），分布表由自我對弈（虛擬對局）校準
 *   extreme  極限：超困難 + 逐局學習每位對手的牌墩分布（貝式收縮到先驗）+ 全壘打期望（自己全壘打的收益與被全壘打的損失，均為近似）
 *
 * 公平性：AI 只看自己的 13 張牌與牌堆組成（幾副牌），不偷看任何人的手牌。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.TPAI = factory(root.TPEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const FULL = (1 << 13) - 1;
  const MASK5 = [], MASK3 = [];
  for (let m = 0; m <= FULL; m++) {
    let pc = 0; for (let x = m; x; x &= x - 1) pc++;
    if (pc === 5) MASK5.push(m); else if (pc === 3) MASK3.push(m);
  }
  const COMB58 = []; // 從 8 個位置選 5 個
  for (let m = 0; m < 256; m++) {
    let pc = 0; for (let x = m; x; x &= x - 1) pc++;
    if (pc === 5) { const a = []; for (let i = 0; i < 8; i++) if ((m >> i) & 1) a.push(i); COMB58.push(a); }
  }

  const b5 = [0, 0, 0, 0, 0], b3 = [0, 0, 0];

  /** 預先評價 13 張牌所有 5 張／3 張子集的牌力值 */
  function prep(hand) {
    const v5 = new Float64Array(8192), v3 = new Float64Array(8192); // 牌力值含花色鍵，超過 int32
    for (let q = 0; q < MASK5.length; q++) {
      const m = MASK5[q]; let k = 0;
      for (let i = 0; i < 13; i++) if ((m >> i) & 1) b5[k++] = hand[i];
      v5[m] = E.eval5(b5);
    }
    for (let q = 0; q < MASK3.length; q++) {
      const m = MASK3[q]; let k = 0;
      for (let i = 0; i < 13; i++) if ((m >> i) & 1) b3[k++] = hand[i];
      v3[m] = E.eval3(b3);
    }
    const fu = new Int32Array(8192); // 頭墩各子集的「與中墩比較的點數位數單位」，見 engine.frontFoul
    for (let q = 0; q < MASK3.length; q++) { const m = MASK3[q]; fu[m] = E.FRONT_UNIT[E.catOf(v3[m])]; }
    const rp = new Float64Array(8192), sk = new Int32Array(8192); // 5 張子集：點數部分／花色鍵
    for (let q = 0; q < MASK5.length; q++) { const m = MASK5[q]; rp[m] = Math.floor(v5[m] / E.SK); sk[m] = v5[m] - rp[m] * E.SK; }
    return { hand, v5, v3, fu, rp, sk };
  }

  /** 列舉所有合法（不倒水）擺法；cb(back, mid, front) */
  const idx8 = new Int32Array(8);
  function forEachLegal(p, cb) {
    const v5 = p.v5, v3 = p.v3, fu = p.fu, rp = p.rp, sk = p.sk, SK = E.SK, SM = E.FRONT_SUIT_MASK;
    for (let bi = 0; bi < MASK5.length; bi++) {
      const back = MASK5[bi], vb = v5[back];
      const rem = FULL ^ back;
      let k = 0;
      for (let i = 0; i < 13; i++) if ((rem >> i) & 1) idx8[k++] = i;
      for (let ci = 0; ci < COMB58.length; ci++) {
        const c = COMB58[ci];
        const mid = (1 << idx8[c[0]]) | (1 << idx8[c[1]]) | (1 << idx8[c[2]]) | (1 << idx8[c[3]]) | (1 << idx8[c[4]]);
        const vm = v5[mid];
        if (vm > vb) continue;
        const front = rem ^ mid;
        const u = fu[front];
        if (!(v3[front] < Math.floor(rp[mid] / u) * u * SK + (sk[mid] & SM))) continue; // 頭墩必須嚴格小於中墩（同 engine.frontFoul，含花色）
        cb(back, mid, front);
      }
    }
  }

  function cardsOf(hand, mask) { const a = []; for (let i = 0; i < 13; i++) if ((mask >> i) & 1) a.push(hand[i]); return a; }
  function toArrangement(p, back, mid, front) {
    return {
      front: cardsOf(p.hand, front), mid: cardsOf(p.hand, mid), back: cardsOf(p.hand, back),
      vals: [p.v3[front], p.v5[mid], p.v5[back]],
    };
  }

  // ---------------- random / greedy ----------------
  function chooseRandom(hand, ctx) {
    const p = prep(hand);
    const all = [];
    forEachLegal(p, (b, m, f) => all.push(b, m, f));
    const k = Math.floor(ctx.rng() * (all.length / 3)) * 3;
    return toArrangement(p, all[k], all[k + 1], all[k + 2]);
  }

  function chooseGreedy(hand) {
    const p = prep(hand);
    let bb = 0, bm = 0, bf = 0, vb = -1, vm = -1, vf = -1;
    forEachLegal(p, (b, m, f) => {
      const x = p.v5[b], y = p.v5[m], z = p.v3[f];
      if (x > vb || (x === vb && (y > vm || (y === vm && z > vf)))) { vb = x; vm = y; vf = z; bb = b; bm = m; bf = f; }
    });
    return toArrangement(p, bb, bm, bf);
  }

  // ---------------- hard：加權牌型分數 ----------------
  // 分數 s(v) = 牌型階級 + 0.30*(主點數/14) + 0.05*(次點數/14)；總分 = wf*s(前) + wm*s(中) + wb*s(尾)
  // 權重由 sim/tune_hard.js（HL 迴圈）校準：起點 {1,1,1,0.30,0.05}，對起點的驗證得分 +0.50 ±0.03（N=2）、+1.45 ±0.05（N=4），見 docs/HL_LOG.md
  const DEFAULT_HARD = { wf: 1.96, wm: 0.7, wb: 1.96, r0: 0.42, r1: 0.035 };
  function laneScoreHeur(v, prm) {
    const rpart = E.rankPart(v);
    const cat = Math.floor(rpart / E.B5);
    const rest = rpart - cat * E.B5;
    const t0 = Math.floor(rest / 50625) % 15;
    const t1 = Math.floor(rest / 3375) % 15;
    return cat + prm.r0 * (t0 / 14) + prm.r1 * (t1 / 14);
  }
  function chooseHard(hand, ctx) {
    const prm = (ctx && ctx.hardParams) || DEFAULT_HARD;
    const p = prep(hand);
    const sF = new Float64Array(8192), s5 = new Float64Array(8192);
    for (const m of MASK3) sF[m] = laneScoreHeur(p.v3[m], prm);
    for (const m of MASK5) s5[m] = laneScoreHeur(p.v5[m], prm);
    let best = -Infinity, bb = 0, bm = 0, bf = 0;
    forEachLegal(p, (b, m, f) => {
      const s = prm.wb * s5[b] + prm.wm * s5[m] + prm.wf * sF[f];
      if (s > best) { best = s; bb = b; bm = m; bf = f; }
    });
    return toArrangement(p, bb, bm, bf);
  }

  // ---------------- super：對對手牌墩分布最大化期望得分 ----------------
  /** tables = {front:[...], mid:[...], back:[...]}：對手「最終擺法」各墩牌力值的分位點（由小到大） */
  function buildStats(tab) {
    const mk = (vals, lane) => {
      const Q = vals.length, suf = new Float64Array(Q + 1);
      for (let i = Q - 1; i >= 0; i--) suf[i] = suf[i + 1] + E.laneBonus(lane, vals[i]);
      return { vals, Q, suf, lane };
    };
    return [mk(tab.front, 0), mk(tab.mid, 1), mk(tab.back, 2)];
  }
  const statsCache = new WeakMap();
  function statsOf(tab) { let s = statsCache.get(tab); if (!s) { s = buildStats(tab); statsCache.set(tab, s); } return s; }

  function newOut() {
    return { W: [new Float64Array(8192), new Float64Array(8192), new Float64Array(8192)],
             L: [new Float64Array(8192), new Float64Array(8192), new Float64Array(8192)],
             EV: [new Float64Array(8192), new Float64Array(8192), new Float64Array(8192)] };
  }
  const SHARED_OUT = newOut();

  function fillLane(st, lane, masks, vArr, out) {
    const vals = st.vals, Q = st.Q, w = out.W[lane], l = out.L[lane], e = out.EV[lane];
    for (let q = 0; q < masks.length; q++) {
      const m = masks[q], v = vArr[m];
      let lo = 0, hi = Q; // lo = #(<v)
      while (lo < hi) { const mid = (lo + hi) >> 1; if (vals[mid] < v) lo = mid + 1; else hi = mid; }
      const nLess = lo;
      lo = nLess; hi = Q; // #(<=v)
      while (lo < hi) { const mid = (lo + hi) >> 1; if (vals[mid] <= v) lo = mid + 1; else hi = mid; }
      const nLeq = lo;
      const pw = nLess / Q, pl = (Q - nLeq) / Q;
      w[m] = pw; l[m] = pl;
      e[m] = (pw - pl) + E.laneBonus(lane, v) * pw - st.suf[nLeq] / Q;
    }
  }
  const SWEEP_EXTRA = 3; // 打槍把基本分 3 變 6，多出 3 分
  const HOMERUN_EXTRA = 6; // 全壘打再把每位對手的 6 變 12，每位多 6 分
  // 兩位實力相近的玩家之間「A 打槍 B」的機率，取自 4 人桌 [極限,超困難×3] 的對戰輸出：8079 次打槍 / (1500 副 × 4 輪 × 12 有序配對) ≈ 0.112
  const HOMERUN_Q = 0.11;

  function fillArrangementsEV(p, tab, out) {
    const st = statsOf(tab);
    fillLane(st[0], 0, MASK3, p.v3, out);
    fillLane(st[1], 1, MASK5, p.v5, out);
    fillLane(st[2], 2, MASK5, p.v5, out);
  }
  function evOf(out, b, m, f) {
    return out.EV[0][f] + out.EV[1][m] + out.EV[2][b] +
      SWEEP_EXTRA * (out.W[0][f] * out.W[1][m] * out.W[2][b] - out.L[0][f] * out.L[1][m] * out.L[2][b]);
  }

  function bestEV(p, tab) {
    fillArrangementsEV(p, tab, SHARED_OUT);
    let best = -Infinity, bb = 0, bm = 0, bf = 0;
    forEachLegal(p, (b, m, f) => {
      const s = evOf(SHARED_OUT, b, m, f);
      if (s > best) { best = s; bb = b; bm = m; bf = f; }
    });
    return { back: bb, mid: bm, front: bf, ev: best };
  }

  function chooseSuper(hand, ctx) {
    const p = prep(hand);
    const r = bestEV(p, ctx.tables[ctx.n]);
    return toArrangement(p, r.back, r.mid, r.front);
  }

  // ---------------- extreme：逐局學習對手分布 ----------------
  // 每位對手一個 model：累積他攤牌時三墩的牌力值。對手分布 = 先驗（超困難校準表，權重 PRIOR_W 局）與觀察值（每局權重 1）的加權混合。
  const PRIOR_W = 40;
  function makeModel() { return { front: [], mid: [], back: [], rounds: 0, cache: null }; }
  function observe(model, vals) {
    model.front.push(vals[0]); model.mid.push(vals[1]); model.back.push(vals[2]);
    model.rounds++; model.cache = null;
  }
  function blend(prior, obs, Q, priorW) {
    const pw = priorW / prior.length;
    const items = [];
    for (let i = 0; i < prior.length; i++) items.push([prior[i], pw]);
    for (let i = 0; i < obs.length; i++) items.push([obs[i], 1]);
    items.sort((x, y) => x[0] - y[0]);
    let tot = 0; for (const it of items) tot += it[1];
    const out = new Array(Q);
    let acc = 0, k = 0;
    for (let q = 0; q < Q; q++) {
      const target = ((q + 0.5) / Q) * tot;
      while (k < items.length - 1 && acc + items[k][1] < target) { acc += items[k][1]; k++; }
      out[q] = items[k][0];
    }
    return out;
  }
  function modelTable(model, prior, priorW) {
    if (!model || model.rounds === 0) return prior;
    const w = priorW || PRIOR_W;
    if (model.cache && model.cacheBase === prior && model.cacheW === w) return model.cache;
    const Q = prior.front.length;
    model.cache = { front: blend(prior.front, model.front, Q, w), mid: blend(prior.mid, model.mid, Q, w), back: blend(prior.back, model.back, Q, w) };
    model.cacheBase = prior; model.cacheW = w;
    return model.cache;
  }

  /** ctx.models[o]：第 o 位對手的 model（可缺省，缺省則等同超困難＋全壘打期望） */
  function chooseExtreme(hand, ctx) {
    const n = ctx.n, k = n - 1;
    const prior = ctx.tables[n];
    const p = prep(hand);
    const outs = [];
    for (let o = 0; o < k; o++) {
      const out = o === 0 ? SHARED_OUT : newOut();
      fillArrangementsEV(p, modelTable(ctx.models && ctx.models[o], prior, ctx.priorW), out);
      outs.push(out);
    }
    let best = -Infinity, bb = 0, bm = 0, bf = 0;
    const qPow = Math.pow(HOMERUN_Q, k - 1);
    forEachLegal(p, (b, m, f) => {
      let s = 0, allSweep = 1, beSwept = 0;
      for (let o = 0; o < k; o++) {
        const out = outs[o];
        s += evOf(out, b, m, f);
        allSweep *= out.W[0][f] * out.W[1][m] * out.W[2][b];     // 我打槍這位對手的機率（三墩獨立近似）
        beSwept += out.L[0][f] * out.L[1][m] * out.L[2][b];       // 這位對手打槍我的機率
      }
      // 全壘打：我打槍所有人 → 每位多 +6；某位對手打槍所有人（含我）→ 我對他的損失多 −6。
      // 對手要全壘打還得同時打槍其餘 N−2 位，用固定的兩人打槍率 HOMERUN_Q 近似。
      if (k >= 2) s += HOMERUN_EXTRA * (k * allSweep - beSwept * qPow);
      if (s > best) { best = s; bb = b; bm = m; bf = f; }
    });
    return toArrangement(p, bb, bm, bf);
  }

  const LEVELS = {
    random: { name: '隨機（基準）', choose: chooseRandom },
    greedy: { name: '貪心（基準）', choose: chooseGreedy },
    hard: { name: '困難', choose: chooseHard },
    super: { name: '超困難', choose: chooseSuper },
    extreme: { name: '極限', choose: chooseExtreme },
  };

  /** ctx = { n, rng, tables, hardParams?, extreme? } */
  function choose(level, hand, ctx) { return LEVELS[level].choose(hand, ctx); }

  return {
    LEVELS, choose, prep, forEachLegal, toArrangement, bestEV, makeModel, observe, modelTable,
    DEFAULT_HARD, PRIOR_W, MASK5, MASK3,
  };
});
