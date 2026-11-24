// worker_threads 工作者：依 task 名稱執行模擬片段
const { parentPort } = require('worker_threads');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

function ctxFor(args, rng) {
  return { n: args.n, rng, tables: args.tables, hardParams: args.hardParams, priorW: args.priorW };
}

const tasks = {
  // 自我對弈取樣：用某個策略擺 count 手牌，回傳各墩牌力值
  calib(args) {
    const rng = E.mulberry32(args.seed);
    const ctx = ctxFor(args, rng);
    const out = { front: [], mid: [], back: [] };
    for (let i = 0; i < args.count; i++) {
      const hands = E.deal(args.n, rng);
      for (const h of hands) {
        const a = AI.choose(args.policy, h, ctx);
        out.front.push(a.vals[0]); out.mid.push(a.vals[1]); out.back.push(a.vals[2]);
      }
    }
    return out;
  },

  // 對戰：duplicate 輪替座位。args.levels[i] = 座位 i 的策略；回傳每座位每副牌的總分
  tourney(args) {
    const n = args.n;
    const perSeat = args.levels.map(() => ({ sum: 0, sumsq: 0 }));
    const stats = { deals: 0, foul: 0, five: 0, sweeps: 0, homeruns: 0, jokerHands: 0, hands: 0 };
    for (let d = args.seed0; d < args.seed1; d++) {
      const rng = E.mulberry32(d * 7919 + 13);
      const hands = E.deal(n, rng);
      const ctx = ctxFor(args, E.mulberry32(d * 104729 + 7));
      const cache = {}; // (手牌, 策略) → 擺法值；策略可寫成 'super@名稱' 指定另一份 tables（args.tableSets）
      const arr = (hi, lv) => {
        const k = hi + ':' + lv;
        if (!cache[k]) {
          const [name, set] = lv.split('@');
          const c2 = set ? Object.assign({}, ctx, {
            tables: (args.tableSets && args.tableSets[set]) || ctx.tables,
            hardParams: (args.paramSets && args.paramSets[set]) || ctx.hardParams,
          }) : ctx;
          cache[k] = AI.choose(name, hands[hi], c2).vals;
        }
        return cache[k];
      };
      const seatTotal = new Array(n).fill(0);
      for (let r = 0; r < n; r++) {
        const vals = [];
        for (let i = 0; i < n; i++) vals.push(arr((i + r) % n, args.levels[i]));
        const sc = E.scoreValues(vals);
        for (let i = 0; i < n; i++) seatTotal[i] += sc.totals[i];
        stats.foul += sc.foul.filter(Boolean).length;
        for (let i = 0; i < n; i++) {
          if (sc.homerun[i]) stats.homeruns++;
          for (let j = 0; j < n; j++) if (sc.sweep[i][j]) stats.sweeps++;
          for (let l = 0; l < 3; l++) if (E.catOf(vals[i][l]) === E.CAT.FIVE) stats.five++;
        }
      }
      for (let i = 0; i < n; i++) { perSeat[i].sum += seatTotal[i]; perSeat[i].sumsq += seatTotal[i] * seatTotal[i]; }
      stats.deals++;
    }
    return { perSeat, stats };
  },
};

// 連續多局（session）：座位 0 同一批牌下比較「超困難（固定表）」與「極限（逐局學習對手）」，其餘座位用固定策略。
// 配對設計：兩者面對完全相同的牌與對手擺法，只看差值，變異很小。
tasks.session = function (args) {
  const n = args.n, R = args.rounds;
  const acc = { sup: new Float64Array(R), ext: new Float64Array(R), diff: new Float64Array(R), diff2: new Float64Array(R), sessions: 0 };
  for (let s = args.seed0; s < args.seed1; s++) {
    const rng = E.mulberry32(s * 6151 + 5);
    const ctx = ctxFor(args, rng);
    const models = []; for (let o = 0; o < n - 1; o++) models.push(AI.makeModel());
    const ctxE = Object.assign({}, ctx, { models });
    for (let r = 0; r < R; r++) {
      const hands = E.deal(n, rng);
      const opp = [];
      for (let o = 0; o < n - 1; o++) opp.push(AI.choose(args.opp[o], hands[o + 1], ctx).vals);
      const vs = AI.choose('super', hands[0], ctx).vals;
      const ve = AI.choose('extreme', hands[0], ctxE).vals;
      const ss = E.scoreValues([vs].concat(opp)).totals[0];
      const se = E.scoreValues([ve].concat(opp)).totals[0];
      acc.sup[r] += ss; acc.ext[r] += se; acc.diff[r] += se - ss; acc.diff2[r] += (se - ss) * (se - ss);
      for (let o = 0; o < n - 1; o++) AI.observe(models[o], opp[o]);
    }
    acc.sessions++;
  }
  return { sup: Array.from(acc.sup), ext: Array.from(acc.ext), diff: Array.from(acc.diff), diff2: Array.from(acc.diff2), sessions: acc.sessions };
};

parentPort.on('message', ({ id, task, args }) => {
  try { parentPort.postMessage({ id, result: tasks[task](args) }); }
  catch (e) { parentPort.postMessage({ id, error: String(e && e.stack || e) }); }
});
