/* 十三支網頁 UI：你（座位 0）對 1–3 位電腦。規則見 docs/RULES.md，AI 見 js/ai.js。 */
(function () {
  'use strict';
  const E = window.TPEngine, AI = window.TPAI, TABLES = window.TP_TABLES;
  const $ = (id) => document.getElementById(id);
  const LANES = [
    { key: 'front', label: '頭墩', size: 3 },
    { key: 'mid', label: '中墩', size: 5 },
    { key: 'back', label: '尾墩', size: 5 },
  ];
  const LEVEL_NAME = { hard: '困難', super: '超困難', extreme: '極限' };
  const LEVEL_INFO = {
    hard: '加權牌型分數的啟發式擺法：先把牌型湊大，再兼顧三墩平衡。',
    super: '對「對手牌墩分布」最大化期望得分（含打槍、額外加分），分布表由自我對弈校準。',
    extreme: '超困難＋全壘打期望值，並且逐局學習每位玩家（包括你）的擺牌習慣，越玩越會針對你。',
  };
  const AI_NAMES = ['電腦 A', '電腦 B', '電腦 C'];

  const S = {
    n: 2, level: 'hard',
    round: 0, totals: [], names: [],
    hands: [], loc: [], sel: new Set(), sortMode: 'rank',
    aiArr: [], aiReady: false, models: [], phase: 'setup', seed: 0,
  };

  // ---------- 小工具 ----------
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function randSeed() {
    try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; } catch (e) { return Math.floor(Math.random() * 4294967296); }
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  const rankOf = (c) => (c === E.JOKER ? 15 : (c >> 2) + 2);
  const isRed = (c) => c !== E.JOKER && ((c & 3) === 1 || (c & 3) === 2);
  function cardLabel(c) { return c === E.JOKER ? '鬼牌' : E.RANK_NAME[(c >> 2) + 2] + ['梅花', '方塊', '紅心', '黑桃'][c & 3]; }

  function cardEl(c, opts) {
    opts = opts || {};
    const b = el(opts.static ? 'span' : 'button', 'card' + (isRed(c) ? ' red' : '') + (c === E.JOKER ? ' joker' : '') + (opts.mini ? ' mini' : '') + (opts.static ? ' static' : ''));
    if (!opts.static) b.type = 'button';
    b.setAttribute('aria-label', cardLabel(c));
    if (c === E.JOKER) { b.appendChild(el('span', '', '鬼')); b.appendChild(el('span', 's', '★')); }
    else { b.appendChild(el('span', '', E.RANK_NAME[(c >> 2) + 2])); b.appendChild(el('span', 's', E.SUIT_CHAR[c & 3])); }
    return b;
  }

  // ---------- 設定畫面 ----------
  function setSeg(id, value) {
    for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.v === String(value)));
  }
  function refreshSetup() {
    setSeg('seg-players', S.n); setSeg('seg-level', S.level);
    $('deck-info').textContent = `${S.n} 人 = ${S.n} 副牌 + ${2 * S.n} 張鬼牌，共 ${54 * S.n} 張，每人 13 張。`;
    $('level-info').textContent = LEVEL_INFO[S.level];
  }

  // ---------- 開局 ----------
  function newGame() {
    S.totals = new Array(S.n).fill(0);
    S.names = ['你'].concat(AI_NAMES.slice(0, S.n - 1));
    S.round = 0;
    // models[s][k]：AI 座位 s 對「其他座位」的觀察（依座位順序、不含自己）
    S.models = [];
    for (let s = 0; s < S.n; s++) { const m = []; for (let k = 0; k < S.n - 1; k++) m.push(AI.makeModel()); S.models.push(m); }
    $('screen-setup').hidden = true; $('screen-table').hidden = false; $('btn-new').hidden = false;
    nextRound();
  }

  function nextRound() {
    S.round++;
    S.seed = randSeed();
    const rng = E.mulberry32(S.seed);
    S.hands = E.deal(S.n, rng);
    S.loc = new Array(13).fill('tray');
    S.sel.clear(); S.phase = 'arrange'; S.aiReady = false; S.aiArr = [];
    $('reveal').hidden = true; $('panel-you').hidden = false;
    $('seed-info').textContent = `第 ${S.round} 局牌局種子 #${S.seed}（相同種子會發出相同的牌）`;
    $('round-title').textContent = `第 ${S.round} 局`;
    sortTray();
    render();
    // 電腦擺牌：只看自己的 13 張，放到下一個事件迴圈避免卡住畫面
    setTimeout(() => {
      for (let s = 1; s < S.n; s++) {
        const ctx = { n: S.n, rng, tables: TABLES, models: S.models[s] };
        S.aiArr[s] = AI.choose(S.level, S.hands[s], ctx);
      }
      S.aiReady = true; render();
    }, 30);
  }

  // ---------- 擺牌 ----------
  const trayCards = () => S.loc.map((l, i) => (l === 'tray' ? i : -1)).filter((i) => i >= 0);
  const laneCards = (key) => S.loc.map((l, i) => (l === key ? i : -1)).filter((i) => i >= 0);
  function sortIdx(a) {
    const h = S.hands[0];
    return a.sort((x, y) => {
      if (S.sortMode === 'suit') { const sx = h[x] === E.JOKER ? 9 : h[x] & 3, sy = h[y] === E.JOKER ? 9 : h[y] & 3; if (sx !== sy) return sx - sy; }
      return rankOf(h[y]) - rankOf(h[x]) || (h[y] & 3) - (h[x] & 3);
    });
  }
  function sortTray() { /* 顯示時才排序；保持 loc 不變 */ }

  /** 把選取的牌（可來自手牌或其他墩）放進指定墩；放不下的留在選取狀態 */
  function placeSelected(key) {
    if (!S.sel.size) { flash('先選牌：點牌可多選，也可以在牌上拖曳劃選。'); return; }
    const lane = LANES.find((l) => l.key === key);
    const inLane = new Set(laneCards(key));
    const free = lane.size - inLane.size;
    const cand = sortIdx([...S.sel].filter((i) => !inLane.has(i)));
    if (!cand.length) { S.sel.clear(); render(); return; }
    const take = cand.slice(0, Math.max(0, free));
    for (const i of take) { S.loc[i] = key; S.sel.delete(i); }
    render();
    if (take.length < cand.length) flash(`${lane.label}只剩 ${free} 個位置，其餘 ${cand.length - take.length} 張仍在選取中。`);
  }
  function returnSelected() {
    for (const i of S.sel) S.loc[i] = 'tray';
    S.sel.clear(); render();
  }
  function flash(msg) { const s = $('status'); s.className = 'status warn'; s.textContent = msg; }

  function currentArrangement() {
    const out = {};
    for (const l of LANES) out[l.key] = laneCards(l.key).map((i) => S.hands[0][i]);
    return out;
  }

  function render() {
    renderScoreboard();
    if (S.phase === 'arrange') renderLanes();
    updateStatus();
  }

  function renderScoreboard() {
    const box = $('scoreboard'); box.textContent = '';
    for (let s = 0; s < S.n; s++) {
      const c = el('div', 'pchip' + (s === 0 ? ' me' : ''));
      const nm = el('div', 'nm'); nm.appendChild(el('span', '', S.names[s]));
      if (s > 0) nm.appendChild(el('span', '', LEVEL_NAME[S.level]));
      c.appendChild(nm);
      c.appendChild(el('div', 'tot ' + (S.totals[s] > 0 ? 'pos' : S.totals[s] < 0 ? 'neg' : ''), (S.totals[s] > 0 ? '+' : '') + S.totals[s]));
      let st = '';
      if (s > 0 && S.phase === 'arrange') st = S.aiReady ? '已擺好' : '思考中…';
      c.appendChild(el('div', 'st', st || '累計'));
      box.appendChild(c);
    }
  }

  function renderLanes() {
    const wrap = $('lanes'); wrap.textContent = '';
    for (const lane of LANES) {
      const idxs = sortIdx(laneCards(lane.key));
      const d = el('div', 'lane' + (S.sel.size ? ' target' : ''));
      d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-label', `${lane.label}，放入選取的牌`);
      d.dataset.lane = lane.key;
      const head = el('div', 'lane-head');
      const left = el('span'); left.appendChild(el('b', '', lane.label)); left.appendChild(document.createTextNode(` ${idxs.length}/${lane.size}`));
      head.appendChild(left);
      head.appendChild(el('span', 'lane-name', idxs.length === lane.size ? E.laneName(E.evalLane(idxs.map((i) => S.hands[0][i]))) : ''));
      d.appendChild(head);
      const row = el('div', 'cards');
      for (const i of idxs) {
        const c = cardEl(S.hands[0][i]); c.dataset.i = i;
        if (S.sel.has(i)) c.classList.add('sel');
        row.appendChild(c);
      }
      for (let k = idxs.length; k < lane.size; k++) row.appendChild(el('span', 'slot'));
      d.appendChild(row);
      const go = () => placeSelected(lane.key);
      d.addEventListener('click', (ev) => { if (!ev.target.closest('.card')) go(); });
      d.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
      wrap.appendChild(d);
    }
    const tray = $('tray'); tray.textContent = '';
    for (const i of sortIdx(trayCards())) {
      const c = cardEl(S.hands[0][i]); c.dataset.i = i;
      if (S.sel.has(i)) c.classList.add('sel');
      tray.appendChild(c);
    }
    renderSelBar();
    $('btn-confirm').disabled = !canConfirm();
  }

  // ---------- 選取列與劃選 ----------
  function renderSelBar() {
    const bar = $('selbar'); bar.textContent = '';
    const n = S.sel.size;
    bar.appendChild(el('span', 'selcount', n ? `已選 ${n} 張` : '先選牌'));
    for (const lane of LANES) {
      const inLane = new Set(laneCards(lane.key));
      const free = lane.size - inLane.size;
      const b = el('button', 'ghost', `放入${lane.label}`);
      b.type = 'button'; b.disabled = !n;
      b.title = `${lane.label}還有 ${free} 個位置`;
      b.addEventListener('click', () => placeSelected(lane.key));
      bar.appendChild(b);
    }
    const back = el('button', 'ghost', '收回手牌'); back.type = 'button';
    back.disabled = ![...S.sel].some((i) => S.loc[i] !== 'tray');
    back.addEventListener('click', returnSelected); bar.appendChild(back);
    const clr = el('button', 'ghost', '取消選取'); clr.type = 'button'; clr.disabled = !n;
    clr.addEventListener('click', () => { S.sel.clear(); render(); }); bar.appendChild(clr);
  }

  // 點一下切換選取；在牌上按住拖過去可一次劃選（或劃掉）多張。起點牌決定本次是「加選」還是「取消」。
  let drag = null;
  function setCardSel(i, on) {
    if (on) S.sel.add(i); else S.sel.delete(i);
    for (const c of document.querySelectorAll(`#panel-you .card[data-i="${i}"]`)) c.classList.toggle('sel', on);
  }
  function cardAt(x, y) { const e = document.elementFromPoint(x, y); return e && e.closest ? e.closest('#panel-you .card[data-i]') : null; }
  function initSelection() {
    const panel = $('panel-you');
    panel.addEventListener('pointerdown', (ev) => {
      if (S.phase !== 'arrange' || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      const c = ev.target.closest('.card[data-i]'); if (!c) return;
      const i = +c.dataset.i, on = !S.sel.has(i);
      drag = { on, visited: new Set([i]) };
      setCardSel(i, on);
    });
    panel.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const c = cardAt(ev.clientX, ev.clientY); if (!c) return;
      const i = +c.dataset.i;
      if (!drag.visited.has(i)) { drag.visited.add(i); setCardSel(i, drag.on); }
    });
    const end = () => { if (drag) { drag = null; render(); } };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    // 鍵盤（Enter／空白鍵）：click 事件 detail === 0
    panel.addEventListener('click', (ev) => {
      const c = ev.target.closest('.card[data-i]');
      if (c && ev.detail === 0) { const i = +c.dataset.i; setCardSel(i, !S.sel.has(i)); render(); }
    });
  }

  function canConfirm() {
    if (S.phase !== 'arrange' || !S.aiReady) return false;
    if (trayCards().length) return false;
    const a = currentArrangement();
    const v = E.valuesOf(a);
    return !E.isFoul(v[0], v[1], v[2]);
  }

  function updateStatus() {
    const s = $('status');
    if (S.phase !== 'arrange') { s.className = 'status'; s.textContent = ''; return; }
    const left = trayCards().length;
    if (left) { s.className = 'status'; s.textContent = S.sel.size ? `已選 ${S.sel.size} 張：按上面的「放入○墩」，或直接點要放的墩。` : `還有 ${left} 張牌沒放：點牌可多選（也可拖曳劃選），再選要放的墩。`; return; }
    const v = E.valuesOf(currentArrangement());
    if (E.frontFoul(v[0], v[1])) { s.className = 'status warn'; s.textContent = '倒水：頭墩必須比中墩小（點數相同比花色，連花色都一樣也算倒水），請調整（頭墩 < 中墩 ≤ 尾墩）。'; }
    else if (v[1] > v[2]) { s.className = 'status warn'; s.textContent = '倒水：中墩比尾墩大了，請調整（頭墩 < 中墩 ≤ 尾墩）。'; }
    else if (!S.aiReady) { s.className = 'status'; s.textContent = '等電腦擺好牌…'; }
    else { s.className = 'status ok'; s.textContent = '擺法合法，可以攤牌。'; }
  }

  // ---------- 攤牌 ----------
  function reveal() {
    if (!canConfirm()) return;
    S.phase = 'reveal';
    const mine = currentArrangement();
    const arrs = [mine].concat(S.aiArr.slice(1).map((a) => ({ front: a.front, mid: a.mid, back: a.back })));
    const vals = arrs.map(E.valuesOf);
    const sc = E.scoreValues(vals);
    for (let s = 0; s < S.n; s++) S.totals[s] += sc.totals[s];
    // 每位電腦都觀察到「其他座位」攤出的三墩（公開資訊）
    for (let s = 1; s < S.n; s++) { let k = 0; for (let o = 0; o < S.n; o++) if (o !== s) AI.observe(S.models[s][k++], vals[o]); }
    renderReveal(arrs, vals, sc);
    renderScoreboard();
    $('lanes').textContent = ''; $('tray').textContent = '';
    $('panel-you').hidden = true;
    updateStatus();
    $('btn-confirm').disabled = true;
    $('reveal').scrollIntoView({ block: 'start' });
  }

  function fmt(n) { return (n > 0 ? '+' : '') + n; }

  function pairNote(sc, vals, j) {
    const r = sc.res[0][j];
    const sym = r.map((x) => (x > 0 ? '勝' : x < 0 ? '負' : '平')).join('/');
    const notes = [];
    if (sc.foul[0] && !sc.foul[j]) notes.push('你倒水');
    if (sc.foul[j] && !sc.foul[0]) notes.push('對手倒水');
    if (sc.sweep[0][j]) notes.push('打槍');
    if (sc.sweep[j][0]) notes.push('被打槍');
    if (sc.homerun[0] && sc.sweep[0][j]) notes.push('全壘打');
    if (sc.homerun[j] && sc.sweep[j][0]) notes.push('被全壘打');
    const names = ['頭', '中', '尾'];
    for (let l = 0; l < 3; l++) {
      if (r[l] === 1 && !sc.foul[0]) { const b = E.laneBonus(l, vals[0][l]); if (b) notes.push(`${names[l]}墩${E.laneName(vals[0][l]).split(' ')[0]}+${b}`); }
      if (r[l] === -1 && !sc.foul[j]) { const b = E.laneBonus(l, vals[j][l]); if (b) notes.push(`對手${names[l]}墩${E.laneName(vals[j][l]).split(' ')[0]}−${b}`); }
    }
    return `${S.names[0]} 對 ${S.names[j]}：頭中尾 ${sym}${notes.length ? '（' + notes.join('、') + '）' : ''} → ${fmt(sc.pair[0][j])}`;
  }

  function renderReveal(arrs, vals, sc) {
    const box = $('reveal'); box.hidden = false; box.textContent = '';
    box.appendChild(el('h2', '', `第 ${S.round} 局結果`));
    for (let s = 0; s < S.n; s++) {
      const p = el('div', 'rv-player');
      const head = el('div', 'rv-head');
      const nm = el('b', '', S.names[s]);
      if (sc.foul[s]) nm.appendChild(el('span', 'badge bad', '倒水'));
      if (sc.homerun[s]) nm.appendChild(el('span', 'badge', '全壘打'));
      else if (sc.sweep[s].some(Boolean)) nm.appendChild(el('span', 'badge', '打槍'));
      head.appendChild(nm);
      head.appendChild(el('span', 'rv-score ' + (sc.totals[s] > 0 ? 'pos' : sc.totals[s] < 0 ? 'neg' : ''), fmt(sc.totals[s])));
      p.appendChild(head);
      LANES.forEach((lane, l) => {
        const row = el('div', 'rv-lane');
        row.appendChild(el('span', 'nm', lane.label));
        const cs = el('div', 'cards');
        for (const c of arrs[s][lane.key].slice().sort((a, b) => rankOf(b) - rankOf(a))) cs.appendChild(cardEl(c, { static: true, mini: true }));
        row.appendChild(cs);
        row.appendChild(el('span', 'hn', E.laneName(vals[s][l])));
        p.appendChild(row);
      });
      box.appendChild(p);
    }
    const notes = el('div', 'rv-notes');
    for (let j = 1; j < S.n; j++) notes.appendChild(el('div', '', pairNote(sc, vals, j)));
    box.appendChild(notes);
    const act = el('div', 'rv-actions');
    const next = el('button', 'primary', '下一局'); next.type = 'button'; next.addEventListener('click', nextRound);
    act.appendChild(next);
    act.appendChild(el('span', 'rv-notes', '分數為累計；所有人總分相加永遠是 0。'));
    box.appendChild(act);
    next.focus();
  }

  // ---------- 提示 / 整理 ----------
  function hint() {
    if (S.phase !== 'arrange') return;
    const models = []; for (let k = 0; k < S.n - 1; k++) models.push(AI.makeModel());
    const a = AI.choose('extreme', S.hands[0], { n: S.n, rng: Math.random, tables: TABLES, models });
    const pool = S.hands[0].map((c, i) => ({ c, i }));
    S.loc = new Array(13).fill('tray');
    for (const lane of LANES) {
      for (const c of a[lane.key]) {
        const k = pool.findIndex((x) => x.c === c); S.loc[pool[k].i] = lane.key; pool.splice(k, 1);
      }
    }
    S.sel.clear(); render();
  }

  // ---------- 規則 ----------
  function buildRules() {
    $('rules-body').appendChild($('tpl-rules').content.cloneNode(true));
  }

  // ---------- 事件 ----------
  function init() {
    const n = parseInt(store('tp.n'), 10), lv = store('tp.level');
    if ([2, 3, 4].includes(n)) S.n = n;
    if (LEVEL_NAME[lv]) S.level = lv;
    refreshSetup(); buildRules();
    $('seg-players').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.n = parseInt(b.dataset.v, 10); store('tp.n', S.n); refreshSetup(); });
    $('seg-level').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.level = b.dataset.v; store('tp.level', S.level); refreshSetup(); });
    $('btn-start').addEventListener('click', newGame);
    $('btn-confirm').addEventListener('click', reveal);
    $('btn-clear').addEventListener('click', () => { if (S.phase !== 'arrange') return; S.loc = new Array(13).fill('tray'); S.sel.clear(); render(); });
    $('btn-sort').addEventListener('click', () => { S.sortMode = S.sortMode === 'rank' ? 'suit' : 'rank'; $('btn-sort').textContent = S.sortMode === 'rank' ? '依花色整理' : '依點數整理'; render(); });
    $('btn-hint').addEventListener('click', hint);
    $('btn-rules').addEventListener('click', () => $('dlg-rules').showModal());
    $('btn-new').addEventListener('click', () => {
      if (S.phase !== 'setup' && !confirm('要放棄目前的牌局，回到設定畫面嗎？')) return;
      S.phase = 'setup'; $('screen-table').hidden = true; $('screen-setup').hidden = false; $('btn-new').hidden = true; $('seed-info').textContent = '';
    });
    $('btn-sort').textContent = '依花色整理';
    initSelection();
  }
  document.addEventListener('DOMContentLoaded', init);

  // 供自動化測試／除錯使用
  window.__TP = { S, render, reveal, placeSelected };
})();
