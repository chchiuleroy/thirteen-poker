// 模擬共用工具：取樣牌墩分布、分位數表、duplicate 對戰
const fs = require('fs');
const path = require('path');

function chunks(total, size) {
  const out = [];
  for (let s = 0; s < total; s += size) out.push([s, Math.min(total, s + size)]);
  return out;
}

/** 以 policy 自我對弈取樣，回傳各墩牌力值（已排序） */
async function sampleLanes(pool, n, policy, count, seed, extra) {
  const per = Math.max(50, Math.ceil(count / (pool.size * 3)));
  const jobs = chunks(count, per).map(([a, b], i) => Object.assign({ n, policy, count: b - a, seed: seed * 100003 + i * 9973 + a }, extra));
  const res = await pool.runAll('calib', jobs);
  const out = { front: [], mid: [], back: [] };
  for (const r of res) for (const k of ['front', 'mid', 'back']) for (const v of r[k]) out[k].push(v);
  for (const k of Object.keys(out)) out[k].sort((x, y) => x - y);
  return out;
}

function quantiles(sorted, Q) {
  const M = sorted.length, out = [];
  for (let i = 0; i < Q; i++) out.push(sorted[Math.min(M - 1, Math.floor(((i + 0.5) * M) / Q))]);
  return out;
}

/** 兩個經驗分布（升冪陣列）的 KS 距離 */
function ks(a, b) {
  let i = 0, j = 0, d = 0;
  const na = a.length, nb = b.length;
  while (i < na && j < nb) {
    const x = Math.min(a[i], b[j]);
    while (i < na && a[i] <= x) i++;
    while (j < nb && b[j] <= x) j++;
    d = Math.max(d, Math.abs(i / na - j / nb));
  }
  return d;
}

/** duplicate 對戰：levels[i] = 座位 i 的策略。回傳每座位「每手平均得分」與標準誤 */
async function tourney(pool, n, levels, deals, extra, opts) {
  const o = Object.assign({ seed0: 1, chunk: 0 }, opts);
  const per = o.chunk || Math.max(5, Math.ceil(deals / (pool.size * 4)));
  const jobs = chunks(deals, per).map(([a, b]) => Object.assign({ n, levels, seed0: o.seed0 + a, seed1: o.seed0 + b }, extra));
  const res = await pool.runAll('tourney', jobs);
  const seats = levels.map(() => ({ sum: 0, sumsq: 0 }));
  const stats = { deals: 0, foul: 0, five: 0, sweeps: 0, homeruns: 0 };
  for (const r of res) {
    r.perSeat.forEach((s, i) => { seats[i].sum += s.sum; seats[i].sumsq += s.sumsq; });
    for (const k of Object.keys(stats)) stats[k] += r.stats[k];
  }
  const D = stats.deals;
  const seatOut = seats.map((s, i) => {
    const mean = s.sum / D / n;
    const varDeal = Math.max(0, s.sumsq / D - (s.sum / D) ** 2);
    return { level: levels[i], mean, se: Math.sqrt(varDeal / D) / n };
  });
  return { seats: seatOut, stats, deals: D };
}

function loadTables() {
  const p = path.join(__dirname, '..', 'js', 'tables.js');
  delete require.cache[require.resolve(p)];
  return require(p);
}
function saveTables(tables, meta) {
  const p = path.join(__dirname, '..', 'js', 'tables.js');
  const body = `/* 自動產生：由 sim/calibrate.js 以自我對弈迭代校準（見 docs/HL_LOG.md）。請勿手改。\n * meta: ${JSON.stringify(meta)} */\n` +
    `(function (root, factory) {\n  if (typeof module === 'object' && module.exports) module.exports = factory();\n  else root.TP_TABLES = factory();\n})(typeof self !== 'undefined' ? self : this, function () {\n  return ${JSON.stringify(tables)};\n});\n`;
  fs.writeFileSync(p, body);
}

module.exports = { sampleLanes, quantiles, ks, tourney, loadTables, saveTables, chunks };
