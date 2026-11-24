// 探針：若「超困難」的對手模型換成對手真實分布（hard 的牌墩分布），對 hard 的得分會增加多少？
const { createPool } = require('./pool.js');
const L = require('./lib.js');
(async () => {
  const pool = createPool();
  const tables = require('../js/tables.js');
  const hardT = {};
  for (const n of [2, 4]) {
    const lanes = await L.sampleLanes(pool, n, 'hard', 30000, 4242 + n, {});
    hardT[n] = { front: L.quantiles(lanes.front, 1000), mid: L.quantiles(lanes.mid, 1000), back: L.quantiles(lanes.back, 1000) };
  }
  for (const n of [2, 4]) {
    const opp = new Array(n - 1).fill('hard');
    for (const [name, lv] of [['super@calib', 'super@c'], ['super@hardtable', 'super@h']]) {
      const r = await L.tourney(pool, n, [lv].concat(opp), 4000, { tableSets: { c: tables, h: hardT } }, { seed0: 900000 });
      console.log(`N=${n} ${name} vs hard: ${r.seats[0].mean.toFixed(3)} ±${(1.96 * r.seats[0].se).toFixed(3)}`);
    }
  }
  await pool.close();
})();
