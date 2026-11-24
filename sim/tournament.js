// 各難度對戰：duplicate 輪替座位（每副牌被每個座位各打一次），報告「每手平均得分 ± 95% 信賴區間」
// 用法：
//   node sim/tournament.js --n 2 --levels hard,super --deals 2000
//   node sim/tournament.js --suite full --scale 1        （完整驗證套件，scale 可縮小成 0.1 試跑）
const fs = require('fs');
const path = require('path');
const { createPool } = require('./pool.js');
const L = require('./lib.js');

const argv = {};
for (let i = 2; i < process.argv.length; i += 2) argv[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const SCALE = parseFloat(argv.scale || '1');
const EXT = argv.samples ? { samples: parseInt(argv.samples, 10) } : undefined;

function fmt(s) { return `${s.mean >= 0 ? '+' : ''}${s.mean.toFixed(3)} ±${(1.96 * s.se).toFixed(3)}`; }

async function run(pool, tables, n, levels, deals, seed0) {
  const t0 = Date.now();
  const r = await L.tourney(pool, n, levels, deals, { tables, extreme: EXT }, { seed0 });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`N=${n} [${levels.join(' | ')}] ${deals} 副牌 (${secs}s)  ` + r.seats.map((s) => `${s.level}:${fmt(s)}`).join('  ') +
    `  | 倒水 ${r.stats.foul} 五條墩 ${r.stats.five} 打槍 ${r.stats.sweeps} 全壘打 ${r.stats.homeruns}`);
  return { n, levels, deals, seats: r.seats, stats: r.stats, seconds: +secs };
}

(async () => {
  const pool = createPool();
  const tables = require('../js/tables.js');
  const out = [];
  const D = (x) => Math.max(20, Math.round(x * SCALE));
  if (argv.suite === 'full') {
    const lv = ['random', 'greedy', 'hard', 'super', 'extreme'];
    // N=2：所有兩兩對戰
    for (let i = 0; i < lv.length; i++) for (let j = i + 1; j < lv.length; j++) {
      const heavy = lv[j] === 'extreme';
      out.push(await run(pool, tables, 2, [lv[j], lv[i]], D(heavy ? 3000 : 6000), 100000));
    }
    // N=3、N=4：混合桌
    out.push(await run(pool, tables, 3, ['extreme', 'super', 'hard'], D(2000), 200000));
    out.push(await run(pool, tables, 3, ['hard', 'greedy', 'random'], D(4000), 210000));
    out.push(await run(pool, tables, 4, ['extreme', 'super', 'hard', 'greedy'], D(1500), 300000));
    out.push(await run(pool, tables, 4, ['extreme', 'hard', 'hard', 'hard'], D(1500), 310000));
    out.push(await run(pool, tables, 4, ['super', 'hard', 'hard', 'hard'], D(3000), 320000));
    out.push(await run(pool, tables, 4, ['extreme', 'super', 'super', 'super'], D(1500), 330000));
  } else {
    const n = parseInt(argv.n || '2', 10);
    out.push(await run(pool, tables, n, (argv.levels || 'hard,super').split(','), parseInt(argv.deals || '1000', 10), parseInt(argv.seed || '1', 10)));
  }
  if (argv.out) fs.writeFileSync(path.resolve(argv.out), JSON.stringify(out, null, 1));
  await pool.close();
})();
