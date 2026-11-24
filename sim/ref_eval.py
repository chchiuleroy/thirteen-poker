"""十三支牌墩評價的獨立參考實作（暴力列舉鬼牌代換），用來交叉驗證 js/engine.js。

與 JS 實作刻意用不同的方法：JS 是解析式（依點數計數推導、鬼牌直接指派），這裡是「把每張鬼牌代換成 52 張牌中的
任一張，對每種代換用最普通的牌型判定，取最大值」。牌力值定義相同：
    (cat*15^5 + t0*15^4 + ... + t4) * 1024 + 花色鍵
點數優先；點數完全相同才依「決勝順序」逐張比花色，♠(3) > ♥(2) > ♦(1) > ♣(0)。
決勝順序：葫蘆／鐵支／三條／兩對／一對／烏龍＝先依「同點數張數」多者在前、再依點數大者在前（同點數內花色大者在前）；
順子／同花順＝由頂牌往下（A2345 為 5-4-3-2-A）；同花＝點數由大到小；五條＝同點數五張依花色。

用法：python sim/ref_eval.py <cases.json>
"""
import itertools
import json
import sys
from collections import Counter
from multiprocessing import Pool

JOKER = 52


def order_cards(cards, mode):
    """回傳決勝順序下的 (rank, suit) 清單。mode: 'group'（依張數、點數）或 'rank'（點數由大到小）。"""
    if mode == 'rank':
        return sorted(cards, key=lambda c: (-c[0], -c[1]))
    cnt = Counter(r for r, _ in cards)
    return sorted(cards, key=lambda c: (-cnt[c[0]], -c[0], -c[1]))


def straight_order(cards, top):
    seq = [5, 4, 3, 2, 14] if top == 5 else [top - k for k in range(5)]
    by_rank = {r: s for r, s in cards}
    return [(r, by_rank[r]) for r in seq]


def plain(cards):
    """cards: list of (rank, suit)，無鬼牌。回傳 (cat, 點數鍵 list, 花色鍵 list)。"""
    n = len(cards)
    ranks = sorted((r for r, _ in cards), reverse=True)
    c = Counter(ranks)
    groups = sorted(c.items(), key=lambda kv: (-kv[1], -kv[0]))
    counts = [g[1] for g in groups]
    flush = n == 5 and len({s for _, s in cards}) == 1
    uniq = sorted(set(ranks), reverse=True)
    top = None
    if n == 5 and len(uniq) == 5:
        if uniq[0] - uniq[4] == 4:
            top = uniq[0]
        elif uniq == [14, 5, 4, 3, 2]:
            top = 5

    def key(cat, tb, ordered):
        return (cat, tb, [s for _, s in ordered])

    cands = []
    if counts == [5]:
        cands.append(key(9, [groups[0][0]], order_cards(cards, 'group')))
    if flush and top:
        cands.append(key(8, [top], straight_order(cards, top)))
    if counts == [4, 1]:
        cands.append(key(7, [groups[0][0], groups[1][0]], order_cards(cards, 'group')))
    if counts == [3, 2]:
        cands.append(key(6, [groups[0][0], groups[1][0]], order_cards(cards, 'group')))
    if flush:
        cands.append(key(5, ranks, order_cards(cards, 'rank')))
    if top:
        cands.append(key(4, [top], straight_order(cards, top)))
    if counts[0] == 3:
        kick = sorted([r for r in ranks if r != groups[0][0]], reverse=True)
        cands.append(key(3, [groups[0][0]] + kick, order_cards(cards, 'group')))
    if counts == [2, 2, 1]:
        cands.append(key(2, [groups[0][0], groups[1][0], groups[2][0]], order_cards(cards, 'group')))
    if counts[0] == 2:
        kick = sorted([r for r in ranks if r != groups[0][0]], reverse=True)
        cands.append(key(1, [groups[0][0]] + kick, order_cards(cards, 'group')))
    cands.append(key(0, ranks, order_cards(cards, 'group')))
    return max(cands, key=lambda x: encode(*x))


def encode(cat, tb, suits):
    v = cat
    for x in (tb + [0] * 5)[:5]:
        v = v * 15 + x
    sk = 0
    for s in (suits + [0] * 5)[:5]:
        sk = sk * 4 + s
    return v * 1024 + sk


def card(c):
    return ((c >> 2) + 2, c & 3)


def brute(cards):
    nat = [card(c) for c in cards if c != JOKER]
    j = len(cards) - len(nat)
    allc = [card(c) for c in range(52)]
    if j == 0:
        return encode(*plain(nat))
    best = -1
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
