// 連續多局實驗：「極限」逐局學習對手後，相對「超困難」的每手得分增益（配對差值）
// 用法：node sim/sessions.js [--sessions 400] [--rounds 60] [--out docs/sessions_result.json]
const fs = require('fs');
const path = require('path');
const { createPool } = require('./pool.js');
const L = require('./lib.js');
const argv = {};
for (let i = 2; i < process.argv.length; i += 2) argv[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const SESS = parseInt(argv.sessions || '400', 10), ROUNDS = parseInt(argv.rounds || '60', 10);
const PRIORW = argv.priorW ? parseFloat(argv.priorW) : undefined;
const ONLY = argv.cases ? argv.cases.split(';') : null; // 例："2:hard;4:hard,hard,hard"
const BUCKETS = [[0, 1], [1, 5], [5, 15], [15, 30], [30, ROUNDS]].filter((b) => b[1] <= ROUNDS);

(async () => {
  const pool = createPool();
  const tables = require('../js/tables.js');
  const cases = [
    [2, ['hard']], [2, ['super']], [2, ['greedy']],
    [3, ['hard', 'hard']], [3, ['super', 'super']],
    [4, ['hard', 'hard', 'hard']], [4, ['super', 'super', 'super']], [4, ['hard', 'super', 'greedy']],
  ];
  const results = [];
  for (const [n, opp] of cases) {
    if (ONLY && !ONLY.includes(n + ':' + opp.join(','))) continue;
    const jobs = L.chunks(SESS, Math.max(2, Math.ceil(SESS / (pool.size * 2)))).map(([a, b]) => ({ n, opp, rounds: ROUNDS, seed0: 500000 + a, seed1: 500000 + b, tables, priorW: PRIORW }));
    const res = await pool.runAll('session', jobs);
    const tot = { sup: new Array(ROUNDS).fill(0), ext: new Array(ROUNDS).fill(0), diff: new Array(ROUNDS).fill(0), diff2: new Array(ROUNDS).fill(0), sessions: 0 };
    for (const r of res) { tot.sessions += r.sessions; for (let i = 0; i < ROUNDS; i++) { tot.sup[i] += r.sup[i]; tot.ext[i] += r.ext[i]; tot.diff[i] += r.diff[i]; tot.diff2[i] += r.diff2[i]; } }
    const S = tot.sessions;
    const rows = BUCKETS.map(([a, b]) => {
      let d = 0, d2 = 0, sup = 0;
      for (let i = a; i < b; i++) { d += tot.diff[i]; d2 += tot.diff2[i]; sup += tot.sup[i]; }
      const m = b - a, cnt = S * m;
      const mean = d / cnt, v = Math.max(0, d2 / cnt - mean * mean);
      return { rounds: `${a + 1}-${b}`, extMinusSuper: +mean.toFixed(3), ci95: +(1.96 * Math.sqrt(v / cnt)).toFixed(3), superVsOpp: +(sup / cnt).toFixed(3) };
    });
    console.log(`N=${n} vs [${opp.join(',')}]  sessions=${S}`);
    for (const r of rows) console.log(`   局 ${r.rounds.padEnd(6)} 極限−超困難 = ${r.extMinusSuper >= 0 ? '+' : ''}${r.extMinusSuper} ±${r.ci95}   (超困難自己對該對手 ${r.superVsOpp})`);
    results.push({ n, opp, sessions: S, rows });
  }
  if (argv.out) fs.writeFileSync(path.resolve(argv.out), JSON.stringify(results, null, 1));
  await pool.close();
})();
