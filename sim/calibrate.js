// HL 迴圈：校準「超困難」使用的對手牌墩分布表
//   state    = tables（各人數 N × 各墩的牌力值分位數）
//   policy   = js/ai.js 的 super（對 tables 最大化期望得分）；第 0 輪用 hard 的分布當起點
//   feedback = 用目前 policy 自我對弈取樣 → 新 tables；與上一輪比 KS 距離
//   收斂檢查 = 新表 vs 舊表的 KS 距離、以及 super@新表 對 super@舊表 的 duplicate 對戰得分是否趨近 0
// 用法：node sim/calibrate.js [--hands 12000] [--iters 4] [--duels 1500]
const fs = require('fs');
const path = require('path');
const { createPool } = require('./pool.js');
const L = require('./lib.js');

const argv = {};
for (let i = 2; i < process.argv.length; i += 2) argv[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const HANDS = parseInt(argv.hands || '12000', 10);
const ITERS = parseInt(argv.iters || '4', 10);
const DUELS = parseInt(argv.duels || '1500', 10);
const Q = 1000;
const NS = [2, 3, 4];

(async () => {
  const pool = createPool();
  const log = { method: 'fictitious play (pooled sample average)', hands: HANDS, duels: DUELS, Q, iterations: [] };
  const t0 = Date.now();
  // 虛擬對局（fictitious play）：對手模型 = 歷代自我對弈牌墩分布的「等權混合」。
  // 單純拿「上一輪自己的分布」當對手模型會在 best-response 之間來回擺盪（實測 KS 卡在 ~0.11 不收斂），混合平均才收斂。
  const pooled = {}; for (const n of NS) pooled[n] = { front: [], mid: [], back: [] };
  let prev = null;
  for (let it = 0; it <= ITERS; it++) {
    const policy = it === 0 ? 'hard' : 'super';
    const tables = {};
    const entry = { iter: it, policy, ks: {}, duel: {} };
    for (const n of NS) {
      const lanes = await L.sampleLanes(pool, n, policy, Math.ceil(HANDS / n), 1000 + it * 17 + n, { tables: prev });
      tables[n] = {};
      for (const k of ['front', 'mid', 'back']) {
        pooled[n][k].push(lanes[k]);
        const all = [].concat(...pooled[n][k]).sort((x, y) => x - y);
        tables[n][k] = L.quantiles(all, Q);
      }
      if (prev) entry.ks[n] = ['front', 'mid', 'back'].map((k) => +L.ks(tables[n][k], prev[n][k]).toFixed(4));
    }
    if (prev) {
      for (const n of NS) {
        const levels = ['super@new'].concat(new Array(n - 1).fill('super@old'));
        const r = await L.tourney(pool, n, levels, DUELS, { tableSets: { new: tables, old: prev } }, { seed0: 70000 + it * 1000 });
        entry.duel[n] = { mean: +r.seats[0].mean.toFixed(4), se: +r.seats[0].se.toFixed(4) };
      }
    }
    log.iterations.push(entry);
    console.log(`iter ${it} (${policy}) @ ${((Date.now() - t0) / 1000).toFixed(0)}s  ks=${JSON.stringify(entry.ks)} duel(new vs old)=${JSON.stringify(entry.duel)}`);
    prev = tables;
  }
  L.saveTables(prev, { method: 'fictitious play', hands: HANDS, iters: ITERS, Q, built: new Date().toISOString().slice(0, 10) });
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'calibration_log.json'), JSON.stringify(log, null, 1));
  console.log('tables saved. total', ((Date.now() - t0) / 1000).toFixed(0), 's');
  await pool.close();
})();
