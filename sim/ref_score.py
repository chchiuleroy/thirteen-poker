"""整桌計分的獨立參考實作：只依 docs/RULES.md 的文字規則撰寫，牌力值用 ref_eval.py 的暴力列舉。
用法：python sim/ref_score.py <score_cases.json>
"""
import json
import sys
from multiprocessing import Pool

from ref_eval import brute

B5 = 15 ** 5
BONUS = {  # (墩, 牌型階級) -> 加分
    ('front', 3): 1,
    ('mid', 6): 1, ('mid', 7): 3, ('mid', 8): 4, ('mid', 9): 5,
    ('back', 7): 2, ('back', 8): 3, ('back', 9): 4,
}


def lane_values(arr):
    return [brute(arr['front']), brute(arr['mid']), brute(arr['back'])]


FRONT_DIGITS = {0: 3, 1: 2, 3: 1}  # 頭墩牌型實際比較的點數位數：烏龍 3、一對 2（對子+踢腳）、三條 1


def decode(v):
    """牌力值 -> (牌型階級, 點數鍵 [t0..t4], 花色鍵 [s0..s4])；v = (點數部分) * 1024 + 花色鍵"""
    sk, rp = v % 1024, v // 1024
    suits = []
    for _ in range(5):
        suits.append(sk % 4)
        sk //= 4
    ranks = []
    for _ in range(5):
        ranks.append(rp % 15)
        rp //= 15
    return rp, ranks[::-1], suits[::-1]


def is_foul(v):
    # 依 docs/RULES.md：頭 < 中 ≤ 尾。頭墩只比自己有的點數位數，點數相同再比前 3 張牌的花色（決勝順序、♠>♥>♦>♣）；
    # 點數與花色都相同＝平手＝倒水。
    cf, tf, sf = decode(v[0])
    cm, tm, sm = decode(v[1])
    k = FRONT_DIGITS[cf]
    front_below = cf < cm or (cf == cm and (tf[:k], sf[:3]) < (tm[:k], sm[:3]))
    return (not front_below) or v[1] > v[2]


def score_table(vals):
    n = len(vals)
    foul = [is_foul(v) for v in vals]
    # lane_res[i][j][k]：i 對 j 第 k 墩 +1/0/-1
    lane_res = [[None] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if foul[i] and foul[j]:
                lane_res[i][j] = [0, 0, 0]
            elif foul[i]:
                lane_res[i][j] = [-1, -1, -1]
            elif foul[j]:
                lane_res[i][j] = [1, 1, 1]
            else:
                lane_res[i][j] = [(vals[i][k] > vals[j][k]) - (vals[i][k] < vals[j][k]) for k in range(3)]
    swept = lambda i, j: sum(lane_res[i][j]) == 3  # i 打槍 j
    homerun = [n >= 3 and all(swept(i, j) for j in range(n) if j != i) for i in range(n)]
    totals = [0] * n
    lanes = ['front', 'mid', 'back']
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            base = sum(lane_res[i][j])
            if abs(base) == 3:
                base *= 2
            # 全壘打：打槍所有人者，其每筆打槍再 ×2（i 贏的、或 j 是全壘打者而 i 被打槍）
            if homerun[i] and swept(i, j):
                base *= 2
            if homerun[j] and swept(j, i):
                base *= 2
            bonus = 0
            for k in range(3):
                if lane_res[i][j][k] == 1 and not foul[i]:
                    bonus += BONUS.get((lanes[k], decode(vals[i][k])[0]), 0)
                elif lane_res[i][j][k] == -1 and not foul[j]:
                    bonus -= BONUS.get((lanes[k], decode(vals[j][k])[0]), 0)
            totals[i] += base + bonus
    return totals, homerun, foul


def check(case):
    vals = [lane_values(a) for a in case['arrs']]
    totals, homerun, foul = score_table(vals)
    ok = totals == case['totals'] and homerun == case['homerun'] and foul == case['foul'] and sum(totals) == 0
    return ok, totals, case['totals']


if __name__ == '__main__':
    cases = json.load(open(sys.argv[1], encoding='utf-8'))
    with Pool() as p:
        res = p.map(check, cases, chunksize=100)
    bad = [(i, r) for i, r in enumerate(res) if not r[0]]
    print('tables checked:', len(res), '| mismatches:', len(bad))
    for i, r in bad[:10]:
        print('  case', i, 'py', r[1], 'js', r[2])
    sys.exit(1 if bad else 0)
