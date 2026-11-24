// HL 迴圈：校準「困難」的加權牌型分數參數 {wf, wm, wb, r0, r1}
//   state = 參數；policy = ai.js chooseHard；feedback = duplicate 對戰（候選 vs 目前最佳）
//   迴歸閘門 = 候選對目前最佳的得分 z > 1.5 才接受；最後用全新牌局複驗
// 用法：node sim/tune_hard.js [--rounds 6] [--deals 4000]
const fs = require('fs');
const path = require('path');
const { createPool } = require('./pool.js');
const L = require('./lib.js');
const AI = require('../js/ai.js');
const argv = {};
for (let i = 2; i < process.argv.length; i += 2) argv[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const ROUNDS = parseInt(argv.rounds || '6', 10), DEALS = parseInt(argv.deals || '4000', 10);

(async () => {
  const pool = createPool();
  const tables = require('../js/tables.js');
  let best = Object.assign({}, AI.DEFAULT_HARD);
  const start = Object.assign({}, best);
  const log = [];
  async function duel(cand, base, deals, seed0, n) {
    const levels = ['hard@c'].concat(new Array(n - 1).fill('hard@b'));
    const r = await L.tourney(pool, n, levels, deals, { tables, paramSets: { c: cand, b: base } }, { seed0 });
    return r.seats[0];
  }
  for (let round = 0; round < ROUNDS; round++) {
    let improved = false;
    for (const key of ['wf', 'wm', 'wb', 'r0', 'r1']) {
      for (const f of [0.7, 1.4]) {
        const cand = Object.assign({}, best, { [key]: +(best[key] * f).toFixed(4) });
        const s = await duel(cand, best, DEALS, 810000 + round * 100, 2);
        const z = s.mean / s.se;
        log.push({ round, key, from: best[key], to: cand[key], mean: +s.mean.toFixed(4), z: +z.toFixed(2) });
        console.log(`round ${round} ${key} ${best[key]} -> ${cand[key]}: ${s.mean.toFixed(3)} (z=${z.toFixed(2)})`);
        if (z > 1.5) { best = cand; improved = true; console.log('   accepted', JSON.stringify(best)); }
      }
    }
    if (!improved) break;
  }
  console.log('\n最終參數', JSON.stringify(best), '起點', JSON.stringify(start));
  for (const n of [2, 4]) {
    const s = await duel(best, start, 8000, 990000, n);
    const m = `驗證（全新牌局）N=${n}：調校後 vs 原預設 = ${s.mean.toFixed(3)} ±${(1.96 * s.se).toFixed(3)}`;
    console.log(m); log.push({ validate: m });
  }
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'tune_hard_log.json'), JSON.stringify({ start, best, log }, null, 1));
  await pool.close();
})();
