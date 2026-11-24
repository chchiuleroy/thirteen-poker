/* 十三支規則引擎（瀏覽器與 Node 共用）
 *
 * 牌的編碼：0..51 = 一般牌，rank = (c>>2)+2（2..14，14=A），suit = c&3（0♣ 1♦ 2♥ 3♠）；52 = 鬼牌（可當任意牌）。
 * 牌墩（lane）的「牌力值」是單一整數：cat*15^5 + t0*15^4 + ... + t4，可直接比大小。
 * 規則細節與計分表見 docs/RULES.md。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TPEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const JOKER = 52;
  const CAT = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUAD: 7, STRAIGHT_FLUSH: 8, FIVE: 9 };
  const CAT_NAME = ['烏龍', '一對', '兩對', '三條', '順子', '同花', '葫蘆', '鐵支', '同花順', '五條'];
  const RANK_NAME = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const SUIT_CHAR = ['♣', '♦', '♥', '♠'];
  const B5 = 759375; // 15^5

  function V(cat, a, b, c, d, e) {
    return ((((cat * 15 + a) * 15 + b) * 15 + c) * 15 + d) * 15 + e;
  }
  const catOf = (v) => Math.floor(v / B5);

  // ---- 牌墩評價（鬼牌 = 任意牌，含與手上重複的牌，因為多副牌）----
  const cnt = new Int8Array(15);
  const nat = new Int8Array(8);

  function windowMask(t) { // 順子視窗：頂牌 t（5 = A2345）
    if (t === 5) return (1 << 14) | (1 << 5) | (1 << 4) | (1 << 3) | (1 << 2);
    return ((1 << (t + 1)) - 1) & ~((1 << (t - 4)) - 1);
  }
  const WIN = []; for (let t = 5; t <= 14; t++) WIN[t] = windowMask(t);

  function bestStraightTop(mask) {
    for (let t = 14; t >= 5; t--) if ((mask & ~WIN[t]) === 0) return t;
    return 0;
  }

  /** 3 張牌（頭墩）：只有 烏龍 / 一對 / 三條（3 張不算順、花） */
  function eval3(cards) {
    cnt.fill(0);
    let j = 0;
    for (let i = 0; i < 3; i++) {
      const c = cards[i];
      if (c === JOKER) j++; else cnt[(c >> 2) + 2]++;
    }
    for (let r = 14; r >= 2; r--) if (cnt[r] <= 3 && cnt[r] + j >= 3) return V(CAT.TRIPS, r, 0, 0, 0, 0);
    for (let r = 14; r >= 2; r--) {
      if (cnt[r] <= 2 && cnt[r] + j >= 2) {
        let k = 0;
        for (let q = 14; q >= 2; q--) if (q !== r && cnt[q] > 0) { k = q; break; }
        return V(CAT.PAIR, r, k, 0, 0, 0);
      }
    }
    const a = [];
    for (let q = 14; q >= 2; q--) for (let m = cnt[q]; m > 0; m--) a.push(q);
    return V(CAT.HIGH, a[0], a[1], a[2], 0, 0);
  }

  /** 5 張牌（中墩、尾墩） */
  function eval5(cards) {
    cnt.fill(0);
    let j = 0, distinct = 0, s0 = -1, sameSuit = true, maxCnt = 0, mask = 0, top = 0;
    for (let i = 0; i < 5; i++) {
      const c = cards[i];
      if (c === JOKER) { j++; continue; }
      const r = (c >> 2) + 2, s = c & 3;
      if (cnt[r] === 0) { distinct++; mask |= 1 << r; }
      cnt[r]++;
      if (cnt[r] > maxCnt) maxCnt = cnt[r];
      if (r > top) top = r;
      if (s0 < 0) s0 = s; else if (s !== s0) sameSuit = false;
    }
    const n = 5 - j;

    // 五條：5 張同點數（多副牌 + 鬼牌才可能）
    if (distinct <= 1) return V(CAT.FIVE, distinct === 1 ? top : 14, 0, 0, 0, 0);

    // 同花順
    if (sameSuit && maxCnt <= 1) {
      const t = bestStraightTop(mask);
      if (t) return V(CAT.STRAIGHT_FLUSH, t, 0, 0, 0, 0);
    }

    // 鐵支
    for (let r = 14; r >= 2; r--) {
      if (cnt[r] <= 4 && cnt[r] + j >= 4 && n - cnt[r] <= 1) {
        let k = 0;
        for (let q = 14; q >= 2; q--) if (q !== r && cnt[q] > 0) { k = q; break; }
        return V(CAT.QUAD, r, k, 0, 0, 0);
      }
    }

    // 葫蘆：(三條點數 T, 一對點數 P)，候選只需「手上有的點數 + 14 + 13」
    {
      const cand = [];
      for (let q = 14; q >= 2; q--) if (cnt[q] > 0 || q === 14 || q === 13) cand.push(q);
      for (let a = 0; a < cand.length; a++) {
        const T = cand[a];
        if (cnt[T] > 3) continue;
        for (let b = 0; b < cand.length; b++) {
          const P = cand[b];
          if (P === T || cnt[P] > 2) continue;
          if (n === cnt[T] + cnt[P]) return V(CAT.FULL_HOUSE, T, P, 0, 0, 0);
        }
      }
    }

    // 同花
    if (sameSuit) {
      let k = 0;
      for (let q = 14; q >= 2; q--) for (let m = cnt[q]; m > 0; m--) nat[k++] = q;
      const a = [];
      for (let i = 0; i < j; i++) a.push(14);
      for (let i = 0; i < k; i++) a.push(nat[i]);
      a.sort((x, y) => y - x);
      return V(CAT.FLUSH, a[0], a[1], a[2], a[3], a[4]);
    }

    // 順子
    if (maxCnt <= 1) {
      const t = bestStraightTop(mask);
      if (t) return V(CAT.STRAIGHT, t, 0, 0, 0, 0);
    }

    // 三條
    for (let r = 14; r >= 2; r--) {
      if (cnt[r] <= 3 && cnt[r] + j >= 3) {
        const ks = [];
        for (let q = 14; q >= 2; q--) if (q !== r) for (let m = cnt[q]; m > 0; m--) ks.push(q);
        while (ks.length < 2) ks.push(14);
        return V(CAT.TRIPS, r, ks[0], ks[1], 0, 0);
      }
    }

    // 兩對（有鬼牌時一定會變成三條以上，所以只有 j=0 會到這裡）
    if (j === 0) {
      let p1 = 0, p2 = 0, k = 0;
      for (let q = 14; q >= 2; q--) {
        if (cnt[q] === 2) { if (!p1) p1 = q; else p2 = q; }
        else if (cnt[q] === 1 && !k) k = q;
      }
      if (p1 && p2) return V(CAT.TWO_PAIR, p1, p2, k, 0, 0);
    }

    // 一對
    for (let r = 14; r >= 2; r--) {
      if (cnt[r] <= 2 && cnt[r] + j >= 2) {
        const ks = [];
        for (let q = 14; q >= 2; q--) if (q !== r) for (let m = cnt[q]; m > 0; m--) ks.push(q);
        return V(CAT.PAIR, r, ks[0], ks[1], ks[2], 0);
      }
    }

    // 烏龍
    {
      const a = [];
      for (let q = 14; q >= 2; q--) for (let m = cnt[q]; m > 0; m--) a.push(q);
      return V(CAT.HIGH, a[0], a[1], a[2], a[3], a[4]);
    }
  }

  const evalLane = (cards) => (cards.length === 3 ? eval3(cards) : eval5(cards));

  function laneName(v) {
    const cat = catOf(v);
    let rest = v - cat * B5;
    const t = [0, 0, 0, 0, 0];
    for (let i = 4; i >= 0; i--) { t[i] = rest % 15; rest = Math.floor(rest / 15); }
    const R = (x) => RANK_NAME[x] || '?';
    switch (cat) {
      case CAT.FIVE: return '五條 ' + R(t[0]);
      case CAT.STRAIGHT_FLUSH: return '同花順 ' + R(t[0]) + '高';
      case CAT.QUAD: return '鐵支 ' + R(t[0]);
      case CAT.FULL_HOUSE: return '葫蘆 ' + R(t[0]) + '帶' + R(t[1]);
      case CAT.FLUSH: return '同花 ' + R(t[0]) + '高';
      case CAT.STRAIGHT: return '順子 ' + R(t[0]) + '高';
      case CAT.TRIPS: return '三條 ' + R(t[0]);
      case CAT.TWO_PAIR: return '兩對 ' + R(t[0]) + R(t[1]);
      case CAT.PAIR: return '一對 ' + R(t[0]);
      default: return '烏龍 ' + R(t[0]) + '高';
    }
  }

  // ---- 計分 ----
  // 基本分：每墩贏 +1 / 輸 -1。打槍（對同一人三墩全勝）基本分 3 → 6；全壘打（打槍所有其他人，需 ≥3 人）再 ×2。
  // 額外加分（贏墩者收）：不受打槍／全壘打加倍。
  const BONUS = {
    front: { [CAT.TRIPS]: 1 },
    mid: { [CAT.FULL_HOUSE]: 1, [CAT.QUAD]: 3, [CAT.STRAIGHT_FLUSH]: 4, [CAT.FIVE]: 5 },
    back: { [CAT.QUAD]: 2, [CAT.STRAIGHT_FLUSH]: 3, [CAT.FIVE]: 4 },
  };
  const LANE_KEYS = ['front', 'mid', 'back'];
  function laneBonus(lane, v) { return BONUS[LANE_KEYS[lane]][catOf(v)] || 0; }

  /** 由三墩牌力值判斷是否倒水（必須 front ≤ mid ≤ back） */
  const isFoul = (vf, vm, vb) => !(vf <= vm && vm <= vb);

  /**
   * 對 N 位玩家的三墩牌力值計分。vals[i] = [vf, vm, vb]（foul 玩家仍給值，由 isFoul 判定）。
   * 回傳 { totals, pair: N×N 矩陣（i 對 j 的得分，不含全壘打前後差別以最終為準）, homerun: 布林陣列, sweep: N×N 打槍矩陣 }
   */
  function scoreValues(vals) {
    const N = vals.length;
    const foul = vals.map((v) => isFoul(v[0], v[1], v[2]));
    const res = []; // res[i][j] = [r0,r1,r2] i 對 j 每墩結果
    const sweep = [];
    for (let i = 0; i < N; i++) { res.push([]); sweep.push([]); for (let j = 0; j < N; j++) { res[i].push([0, 0, 0]); sweep[i].push(false); } }
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      let r;
      if (foul[i] && foul[j]) r = [0, 0, 0];
      else if (foul[i]) r = [-1, -1, -1];
      else if (foul[j]) r = [1, 1, 1];
      else r = [0, 1, 2].map((l) => (vals[i][l] > vals[j][l] ? 1 : vals[i][l] < vals[j][l] ? -1 : 0));
      res[i][j] = r; res[j][i] = r.map((x) => -x);
      const s = r[0] + r[1] + r[2];
      if (s === 3) sweep[i][j] = true; else if (s === -3) sweep[j][i] = true;
    }
    const homerun = new Array(N).fill(false);
    if (N >= 3) for (let i = 0; i < N; i++) {
      let all = true;
      for (let j = 0; j < N; j++) if (j !== i && !sweep[i][j]) { all = false; break; }
      homerun[i] = all;
    }
    const pair = [];
    const totals = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      pair.push(new Array(N).fill(0));
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const r = res[i][j];
        let base = r[0] + r[1] + r[2];
        if (Math.abs(base) === 3) base *= 2;
        if (homerun[i] && sweep[i][j]) base *= 2;
        if (homerun[j] && sweep[j][i]) base *= 2;
        let bonus = 0;
        for (let l = 0; l < 3; l++) {
          if (r[l] === 1 && !foul[i]) bonus += laneBonus(l, vals[i][l]);
          else if (r[l] === -1 && !foul[j]) bonus -= laneBonus(l, vals[j][l]);
        }
        pair[i][j] = base + bonus;
        totals[i] += base + bonus;
      }
    }
    return { totals, pair, homerun, sweep, foul, res };
  }

  function valuesOf(arr) { return [evalLane(arr.front), evalLane(arr.mid), evalLane(arr.back)]; }
  function scoreRound(arrs) { return scoreValues(arrs.map(valuesOf)); }

  // ---- 牌堆 / 發牌 ----
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** N 人 = N 副牌（每副 52 張 + 2 張鬼牌） */
  function makeShoe(nDecks) {
    const s = [];
    for (let d = 0; d < nDecks; d++) { for (let c = 0; c < 52; c++) s.push(c); s.push(JOKER, JOKER); }
    return s;
  }
  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[k]; a[k] = t; }
    return a;
  }
  function deal(nPlayers, rng) {
    const shoe = shuffle(makeShoe(nPlayers), rng);
    const hands = [];
    for (let p = 0; p < nPlayers; p++) hands.push(shoe.slice(p * 13, p * 13 + 13));
    return hands;
  }

  function cardLabel(c) {
    if (c === JOKER) return '鬼';
    return RANK_NAME[(c >> 2) + 2] + SUIT_CHAR[c & 3];
  }

  return {
    JOKER, CAT, CAT_NAME, RANK_NAME, SUIT_CHAR, BONUS, B5,
    V, catOf, eval3, eval5, evalLane, laneName, laneBonus, isFoul,
    scoreValues, scoreRound, valuesOf,
    mulberry32, makeShoe, shuffle, deal, cardLabel,
  };
});
