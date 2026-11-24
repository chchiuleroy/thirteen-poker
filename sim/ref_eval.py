"""十三支牌墩評價的獨立參考實作（暴力列舉鬼牌代換），用來交叉驗證 js/engine.js。

與 JS 實作刻意用不同的方法：JS 是解析式（依點數計數推導），這裡是「把每張鬼牌代換成 52 張牌中的任一張，
對每種代換用最普通的牌型判定，取最大值」。兩者牌力值定義相同：cat*15^5 + t0*15^4 + ... + t4。

用法：python sim/ref_eval.py <cases.json>
"""
import itertools
import json
import sys
from collections import Counter
from multiprocessing import Pool

JOKER = 52


def plain(cards):
    """cards: list of (rank, suit)，無鬼牌。回傳 (cat, tiebreak list)。"""
    ranks = sorted((r for r, _ in cards), reverse=True)
    c = Counter(ranks)
    groups = sorted(c.items(), key=lambda kv: (-kv[1], -kv[0]))  # 先依張數、再依點數
    counts = [g[1] for g in groups]
    n = len(cards)
    flush = n == 5 and len({s for _, s in cards}) == 1
    uniq = sorted(set(ranks), reverse=True)
    top = None
    if n == 5 and len(uniq) == 5:
        if uniq[0] - uniq[4] == 4:
            top = uniq[0]
        elif uniq == [14, 5, 4, 3, 2]:
            top = 5
    cands = []
    if counts == [5]:
        cands.append((9, [groups[0][0]]))
    if flush and top:
        cands.append((8, [top]))
    if counts == [4, 1]:
        cands.append((7, [groups[0][0], groups[1][0]]))
    if counts == [3, 2]:
        cands.append((6, [groups[0][0], groups[1][0]]))
    if flush:
        cands.append((5, ranks))
    if top:
        cands.append((4, [top]))
    if counts[0] == 3:
        kick = sorted([r for r in ranks if r != groups[0][0]], reverse=True)
        cands.append((3, [groups[0][0]] + kick))
    if counts == [2, 2, 1]:
        cands.append((2, [groups[0][0], groups[1][0], groups[2][0]]))
    if counts[0] == 2:
        kick = sorted([r for r in ranks if r != groups[0][0]], reverse=True)
        cands.append((1, [groups[0][0]] + kick))
    cands.append((0, ranks))
    return max(cands, key=lambda x: (x[0], x[1] + [0] * (5 - len(x[1]))))


def encode(cat, tb):
    t = (tb + [0] * 5)[:5]
    v = cat
    for x in t:
        v = v * 15 + x
    return v


def card(c):
    return ((c >> 2) + 2, c & 3)


def brute(cards):
    nat = [card(c) for c in cards if c != JOKER]
    j = len(cards) - len(nat)
    allc = [card(c) for c in range(52)]
    best = -1
    if j == 0:
        return encode(*plain(nat))
    for sub in itertools.combinations_with_replacement(allc, j):
        v = encode(*plain(nat + list(sub)))
        if v > best:
            best = v
    return best


def check(case):
    return brute(case['cards']), case['v'], case['cards']


if __name__ == '__main__':
    cases = json.load(open(sys.argv[1], encoding='utf-8'))
    # 鬼牌 ≥4 張的案例暴力列舉太慢（C(52+j-1, j)），只抽樣
    big = [c for c in cases if sum(1 for x in c['cards'] if x == JOKER) >= 4]
    rest = [c for c in cases if sum(1 for x in c['cards'] if x == JOKER) < 4]
    with Pool() as p:
        results = p.map(check, rest, chunksize=50)
        results += p.map(check, big[:6], chunksize=1)
    bad_full = [x for x in results if x[0] != x[1]]
    by_j = Counter(sum(1 for x in c['cards'] if x == JOKER) for c in cases)
    print('cases checked:', len(results), '| joker-count histogram (all cases):', dict(sorted(by_j.items())))
    print('mismatches:', len(bad_full))
    for ref, js, cards in bad_full[:15]:
        print('  cards', cards, 'ref', ref, 'js', js)
    sys.exit(1 if bad_full else 0)
