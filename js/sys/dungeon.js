/* dungeon.js：秘境副本系统 —— 镇妖塔爬塔（金丹）/ 守关波次生存（化神）/ 限时寻宝（炼虚）/ 扫荡
 *
 * ============================================================
 * 【UI 对接面】（供 ui 层调用的全部查询/操作函数；均同步返回对象，err 字段非空即失败原因文案）
 *
 * —— 爬塔（解锁 dungeon_tower：金丹1层）——
 *   towerInfo() → { unlocked, layer, best, need, power, winP, hiddenBoss, boss|null,
 *                   affixes:[{id,name,desc,eff}], week }
 *      need=当前层战力需求（含周词缀与隐藏BOSS倍率）；winP=按当前战力估算胜率(0~1)。
 *   challengeTower() → { ok, err?, win, winP, power, need, layer, hiddenBoss, boss|null,
 *                        rewards:{ lingShi, cult, mat:{id:n}, equip:{name,icon,grade}|null,
 *                                  frag:{id,n}|null, egg, lingYu } }
 *      挑战当前层：胜率估算 + 随机；胜利 layer+1 并发放掉落；失败无任何惩罚（win=false, rewards=null）。
 *
 * —— 守关（解锁 dungeon_guard：化神1层）——
 *   guardInfo() → { unlocked, cleared, total, done, replay,
 *                   next:{n,name,icon,power,desc,reward}, power, winP }
 *      cleared=已通档数；done=true 表示 15 档全通（此后挑战为复刷末档，1/3 灵石）。
 *   challengeGuard() → { ok, err?, win, winP, wave:{n,name,icon}, replay, rewards|null }
 *
 * —— 限时寻宝（解锁 dungeon_hunt：炼虚1层）——
 *   huntInfo() → { unlocked, active, left(剩余秒), boxes, cdLeft(手动CD剩余秒),
 *                  freeLeft(今日免费次数 0/1), payCost(灵玉票价), dur }
 *   enterHunt() → { ok, err?, free }     进入遗府：每日首次免费，其后灵玉 10/次；300s 一场。
 *   seek()      → { ok, err?, box:{id,name,icon}|null, gains|null }   手动「探寻」，CD 2s；
 *      gains = { lingShi, lingYu, mat:{id:n}, pill:{id:n}, frag:{id:n}, egg }（本次宝箱所得，已入账）。
 *      放置时无需调用：场次进行中每 5s 自动开一箱（tick 驱动，离线亦结算自动部分）。
 *   endHunt()   → { ok, err?, boxes }    提前离场（结算传闻，清场）。
 *
 * —— 扫荡（爬塔副产物）——
 *   sweepInfo() → { freeLeft, payCost(灵玉/次), perDay, best, canSweep, est:{lingShi, cult} }
 *      est=按当前 towerBest 预估一键扫荡收益（(towerBest−1) 层标准收益 ×0.8）。
 *   quickSweep() → { ok, err?, msg:[文案…], gains:{lingShi, cult, mat:{id:n}} }
 *      一键扫荡：每日免费 30 次（跨天自动重置），其后灵玉 5/次；直接领取 (towerBest−1) 层标准收益×0.8。
 *
 * ============================================================
 * 【写入 XG.state.stats 的键】（懒初始化，成就统计器读取）
 *   tower_layer        镇妖塔历史最高层（对应 check.k = towerLayer）
 *   tower_clear        爬塔累计通关层数
 *   tower_hidden_boss  击败爬塔隐藏 BOSS 次数（对应 towerHiddenBoss）
 *   guard_wave         守关历史最高波次（对应 guardWave）
 *   hunt_enter         限时寻宝入场次数
 *   hunt_box           限时寻宝累计开箱数
 *   sweep_count        累计扫荡次数
 *
 * 【emit 事件】
 *   'tower:clear' { layer, hiddenBoss }   每通一层（隐藏 BOSS 层 hiddenBoss=true；隐藏功法 tower_33 判定用）
 *   'news'        经内部 pushNews（隐藏 BOSS 击杀、死关突破、寻宝结算、百层彩蛋）
 *   'res:changed' / 'save:dirty'          均由 XG.addRes 代发
 *
 * 【offline 行为】寻宝进行中途离线：按自动速率（5s/箱）结算离线时段内的宝箱，并补发结算传闻（并入总报告 events）。
 *   爬塔/守关为主动挑战玩法，无离线进度。
 *
 * 【隐藏内容】
 *   1. 每 33 层隐藏 BOSS（四灵轮换，战力 ×2.5）：必掉高 grade 装备 + 灵玉 + 高阶残篇×2 + 宝石箱；
 *      第 2 轮起（66 层后）必掉归墟/龙渊隐藏神装（grade 4 hidden 底材），为隐藏地图之外的唯一获取途径。
 *   2. towerBest 首次达到 100 层，触发一次性 imp:2 全服传闻「镇妖塔百层」彩蛋。
 *   3. 周词缀「清平」为负向敌益（利玩家），每周 mulberry32(weekId) 从 14 条词缀池抽 3 条，遇之则本周登塔顺遂。
 * ============================================================ */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  /* ==================== 内部常量 ==================== */
  const TOWER_BASE = 500;      // 塔层战力需求基数：need = 500 × 1.38^N（指数曲线，金丹起步可战）
  const TOWER_GROW = 1.38;     // 每层战力增长倍率
  const HUNT_CD_MS = 2000;     // 寻宝手动「探寻」冷却 2s
  const HUNT_AUTO_SEC = 5;     // 寻宝放置自动开箱间隔 5s
  const HUNT_PAY = 10;         // 寻宝门票（灵玉/次，每日首次免费）
  const SWEEP_PER_DAY = 30;    // 每日免费扫荡次数
  const SWEEP_PAY = 5;         // 扫荡加次票价（灵玉/次）
  const SWEEP_RATE = 0.8;      // 扫荡收益折算系数

  // 塔层材料池按品阶分档（品阶随层数解锁；id 均取自 DATA_NOTES 权威表）
  const MAT_TIERS = [
    ['ore_qingtong', 'ore_heite', 'gem_lingcui', 'beast_huya', 'beast_tuling'],
    ['ore_xuantie', 'ore_wuxingsha', 'gem_biyu', 'gem_zijing', 'beast_shelin', 'beast_xiongdan'],
    ['ore_miyin', 'ore_jingjin', 'gem_xuepo', 'gem_hanyu', 'beast_yaodan', 'beast_jiaowei'],
    ['ore_hantie', 'ore_chijing', 'ore_mingtie', 'gem_xinghui', 'gem_yanxin', 'gem_mingzhu',
      'beast_bingjiao_lin', 'beast_yanlang_gu', 'beast_mingdie_yi'],
    ['ore_xingchenjin', 'ore_longwenjin', 'ore_hundunjin', 'gem_guixuyu', 'gem_longmu',
      'beast_kun_yu', 'beast_longlin', 'beast_longgu', 'beast_longjiao'],
  ];

  /* ==================== 内部小工具 ==================== */
  function U() { return XG.util; }
  // 副本状态子树（自恢复缺省字段）
  function D() {
    const st = XG.state;
    st.dungeon = st.dungeon || {};
    const d = st.dungeon;
    if (typeof d.tower !== 'number' || d.tower < 1) d.tower = 1;
    if (typeof d.towerBest !== 'number' || d.towerBest < 1) d.towerBest = 1;
    if (typeof d.guard !== 'number' || d.guard < 0) d.guard = 0;
    if (typeof d.hunt !== 'number' || d.hunt < 0) d.hunt = 0;
    if (typeof d.sweepFree !== 'number') d.sweepFree = SWEEP_PER_DAY;
    if (typeof d.sweepDay !== 'string') d.sweepDay = '';
    if (typeof d.week !== 'string') d.week = '';
    if (!Array.isArray(d.affixes)) d.affixes = [];
    if (d.huntRun === undefined) d.huntRun = null;
    return d;
  }
  // 跨系统统计（懒初始化）
  function stats() { return (XG.state.stats = XG.state.stats || {}); }
  function incStat(k, n) { const s = stats(); s[k] = (s[k] || 0) + (n || 1); }
  function maxStat(k, v) { const s = stats(); if ((s[k] || 0) < v) s[k] = v; }
  // 传闻推送：bus 广播 + 自存 state.news（新→旧，NEWS_CAP 截断）
  function pushNews(cat, text, imp) {
    const news = { t: Date.now(), cat: cat, text: text, imp: imp || 0 };
    const arr = (XG.state.news = XG.state.news || []);
    arr.unshift(news);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (arr.length > cap) arr.length = cap;
    XG.bus.emit('news', news);
  }
  // 本地日期串（与 main.js dayKey 同格式，跨天重置用）
  function dayKey() {
    const d = new Date();
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }
  function dun() { return XG.data.world.dungeons; }
  function playerPower() { return XG.stats.get().power || 0; }

  /* ==================== 周词缀 ==================== */
  // 确保本周词缀已抽取：mulberry32(weekId) 从 affixPool 不放回抽 3 条
  function ensureWeek() {
    const d = D();
    const wk = U().weekId();
    if (d.week === wk && d.affixes.length === 3) return;
    const pool = (dun().tower.affixPool || []).slice();
    const rnd = U().mulberry32(wk);
    // 用可复现 rnd 做 Fisher-Yates，取前 3 条
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    d.week = wk;
    d.affixes = pool.slice(0, 3).map(function (a) { return a.id; });
  }
  function affixList() {
    ensureWeek();
    const pool = dun().tower.affixPool || [];
    return D().affixes.map(function (id) {
      for (const a of pool) if (a.id === id) return a;
      return null;
    }).filter(Boolean);
  }
  // 聚合词缀效果：foe*Pct 汇总为敌方战力乘区；rw*Pct 供奖励加成查询
  function affixEff() {
    const eff = {};
    for (const a of affixList()) {
      for (const k in a.eff) eff[k] = (eff[k] || 0) + a.eff[k];
    }
    return eff;
  }
  // 敌方战力乘区：按战力公式权重（攻2 防1.5 血0.2 速10，权和 13.7）折算等效百分比
  function foeMul() {
    const e = affixEff();
    const w = (e.foeAtkPct || 0) * 2 + (e.foeDefPct || 0) * 1.5 +
      (e.foeHpPct || 0) * 0.2 + (e.foeSpdPct || 0) * 10;
    return 1 + w / 13.7 / 100;
  }
  function rwPct(key) { return affixEff()[key] || 0; }

  /* ==================== 爬塔：需求与胜率 ==================== */
  // 第 N 层战力需求（含周词缀；隐藏 BOSS 层另乘 powerMul）
  function layerNeed(n) {
    let need = TOWER_BASE * Math.pow(TOWER_GROW, n) * foeMul();
    if (isBossLayer(n)) need *= (dun().tower.hiddenBoss.powerMul || 2.5);
    return Math.round(need);
  }
  function isBossLayer(n) { return n > 0 && n % (dun().tower.hiddenBossEvery || 33) === 0; }
  // 隐藏 BOSS 轮次（第 r 轮 = 第 33r 层）
  function bossRound(n) { return Math.floor(n / (dun().tower.hiddenBossEvery || 33)); }
  function bossOf(n) {
    if (!isBossLayer(n)) return null;
    const bosses = dun().tower.hiddenBoss.bosses || [];
    if (!bosses.length) return null;
    return bosses[(bossRound(n) - 1) % bosses.length];
  }
  // 胜率估算：r=玩家战力/需求，p = r³/(r³+1)，夹取 [0.03, 0.97]（势均力敌五五开，碾压约九成）
  function winRate(power, need) {
    if (need <= 0) return 0.97;
    const r = power / need;
    const p = (r * r * r) / (r * r * r + 1);
    return U().clamp(p, 0.03, 0.97);
  }

  /* ==================== 掉落物通用发放 ==================== */
  // 按品阶随机取一个功法 id（优先非隐藏；无精确品阶时向最近品阶收敛）
  function pickGongfaByGrade(g) {
    const list = (XG.data.gongfa && XG.data.gongfa.list) || [];
    const open = list.filter(function (x) { return !x.hidden; });
    for (let dg = 0; dg <= 9; dg++) {
      const cand = [g - dg, g + dg];
      for (const gg of cand) {
        const hit = open.filter(function (x) { return x.grade === gg; });
        if (hit.length) return U().pick(hit).id;
      }
    }
    return null;
  }
  // 按品阶随机取一个丹方 id（同上收敛）
  function pickPillByGrade(g) {
    const list = (XG.data.pills && XG.data.pills.recipes) || [];
    const open = list.filter(function (x) { return !x.hidden; });
    for (let dg = 0; dg <= 9; dg++) {
      const cand = [g - dg, g + dg];
      for (const gg of cand) {
        const hit = open.filter(function (x) { return x.grade === gg; });
        if (hit.length) return U().pick(hit).id;
      }
    }
    return null;
  }
  // 按品阶随机取一个装备底材（allowHidden 时含归墟/龙渊隐藏神装）
  function pickEquipBase(grade, allowHidden) {
    const bases = (XG.data.equips && XG.data.equips.bases) || [];
    for (let dg = 0; dg <= 4; dg++) {
      const gg = grade - dg;
      if (gg < 0) break;
      const hit = bases.filter(function (b) { return b.grade === gg && (allowHidden || !b.hidden); });
      if (hit.length) return U().pick(hit);
    }
    return null;
  }
  // 发装备：优先锻造系统 createEquip(baseId, grade)；不存在则降级发同阶矿石×2
  function giveEquip(grade, allowHidden, matSink) {
    const base = pickEquipBase(grade, allowHidden);
    if (!base) return null;
    const forge = XG.sys.forge;
    if (forge && typeof forge.createEquip === 'function') {
      try {
        const eq = forge.createEquip(base.id, base.grade);
        if (eq) return { name: eq.name || base.name, icon: eq.icon || base.icon, grade: base.grade };
      } catch (e) { console.error('[dungeon] forge.createEquip 出错', e); }
    }
    // 降级：改发材料（高阶矿石 2 件），不报错
    const tier = U().clamp(base.grade, 0, MAT_TIERS.length - 1);
    const orePool = MAT_TIERS[tier].filter(function (id) { return id.indexOf('ore_') === 0; });
    const mid = orePool.length ? U().pick(orePool) : U().pick(MAT_TIERS[tier]);
    XG.addRes({ mat: (function () { const o = {}; o[mid] = 2; return o; })() });
    if (matSink) matSink[mid] = (matSink[mid] || 0) + 2;
    return null;
  }
  // 发功法残篇：优先 gongfa.addFrag(gfId, n)；不存在则直接入 inv.frag
  function giveFrag(grade, n) {
    const gfId = pickGongfaByGrade(grade);
    if (!gfId) return null;
    const gf = XG.sys.gongfa;
    if (gf && typeof gf.addFrag === 'function') {
      try { gf.addFrag(gfId, n); return { id: gfId, n: n }; } catch (e) { console.error('[dungeon] gongfa.addFrag 出错', e); }
    }
    XG.addRes({ frag: (function () { const o = {}; o[gfId] = n; return o; })() });
    return { id: gfId, n: n };
  }
  // 发修为：优先 cultivation.addCult(n, 来源)；不存在则直接累加
  function giveCult(n, src) {
    n = Math.floor(n);
    if (n <= 0) return 0;
    const cv = XG.sys.cultivation;
    if (cv && typeof cv.addCult === 'function') {
      try { cv.addCult(n, src); return n; } catch (e) { console.error('[dungeon] cultivation.addCult 出错', e); }
    }
    XG.state.player.cult = (XG.state.player.cult || 0) + n;
    XG.bus.emit('res:changed');
    return n;
  }
  // 解析数值或 [min,max] 区间
  function rollNum(v) {
    if (Array.isArray(v)) return U().randInt(v[0], v[1]);
    return v || 0;
  }
  // 通用战利品结算（守关档奖励 / 寻宝宝箱共用）：
  // loot 支持 { lingShi:n|[min,max], lingYu, mat:{id:[min,max,w]}, pill:{gG:[min,max,w]},
  //             frag:{gG:[min,max,w]}, egg, eggChance }；全部立即入账并返回所得汇总
  function grantLoot(loot) {
    const got = { lingShi: 0, lingYu: 0, mat: {}, pill: {}, frag: {}, egg: 0 };
    if (!loot) return got;
    if (loot.lingShi) got.lingShi = rollNum(loot.lingShi);
    if (loot.lingYu) got.lingYu = rollNum(loot.lingYu);
    if (loot.lingShi || loot.lingYu) XG.addRes({ lingShi: got.lingShi, lingYu: got.lingYu });
    // 材料表：按条目权重（第 3 元素 w）抽一种，数量在 [min,max] 内随机
    if (loot.mat) {
      const entries = [];
      for (const id in loot.mat) {
        const v = loot.mat[id];
        entries.push({ id: id, min: v[0], max: v[1], w: v[2] || 1 });
      }
      if (entries.length) {
        const e = U().weighted(entries, 'w');
        const n = U().randInt(e.min, e.max);
        got.mat[e.id] = n;
        XG.addRes({ mat: got.mat });
      }
    }
    // 丹药表：键为 'g'+品阶，每键独立发放 randInt(min,max) 颗该品阶随机成品丹
    if (loot.pill) {
      for (const k in loot.pill) {
        const m = /^g(\d+)$/.exec(k);
        if (!m) continue;
        const n = rollNum([loot.pill[k][0], loot.pill[k][1]]);
        for (let i = 0; i < n; i++) {
          const pid = pickPillByGrade(+m[1]);
          if (pid) got.pill[pid] = (got.pill[pid] || 0) + 1;
        }
      }
      if (Object.keys(got.pill).length) XG.addRes({ pill: got.pill });
    }
    // 残篇表：键为 'g'+品阶
    if (loot.frag) {
      for (const k in loot.frag) {
        const m = /^g(\d+)$/.exec(k);
        if (!m) continue;
        const n = rollNum([loot.frag[k][0], loot.frag[k][1]]);
        if (n > 0) {
          const f = giveFrag(+m[1], n);
          if (f) got.frag[f.id] = (got.frag[f.id] || 0) + f.n;
        }
      }
    }
    if (loot.egg) { got.egg += loot.egg; XG.addRes({ egg: loot.egg }); }
    if (loot.eggChance && U().chance(loot.eggChance)) { got.egg += 1; XG.addRes({ egg: 1 }); }
    return got;
  }
  // 塔层材料掉落：1~3 种，每种 [1, 2+⌊N/15⌋] 件，品阶档 ≤ ⌊N/25⌋（高档权重略高）
  function rollTowerMats(n) {
    const maxTier = U().clamp(Math.floor(n / 25), 0, MAT_TIERS.length - 1);
    const kinds = U().randInt(1, 3);
    const per = [1, 2 + Math.floor(n / 15)];
    const out = {};
    const tierPool = [];
    for (let t = 0; t <= maxTier; t++) tierPool.push({ t: t, w: t + 1 });
    for (let i = 0; i < kinds; i++) {
      const tier = U().weighted(tierPool, 'w').t;
      const id = U().pick(MAT_TIERS[tier]);
      out[id] = (out[id] || 0) + U().randInt(per[0], per[1]);
    }
    return out;
  }

  /* ==================== 爬塔 ==================== */
  function towerInfo() {
    const d = D();
    const n = d.tower;
    const need = layerNeed(n);
    const power = playerPower();
    return {
      unlocked: XG.cfg.isUnlocked('dungeon_tower'),
      layer: n,
      best: d.towerBest,
      need: need,
      power: power,
      winP: winRate(power, need),
      hiddenBoss: isBossLayer(n),
      boss: bossOf(n),
      affixes: affixList().map(function (a) { return { id: a.id, name: a.name, desc: a.desc, eff: a.eff }; }),
      week: d.week,
    };
  }

  // 挑战当前层：胜利 layer+1 发掉落；失败无惩罚
  function challengeTower() {
    if (!XG.cfg.isUnlocked('dungeon_tower')) return { ok: false, err: '镇妖塔尚未开启（金丹一层）' };
    const d = D();
    const n = d.tower;
    const boss = isBossLayer(n);
    const need = layerNeed(n);
    const power = playerPower();
    const wp = winRate(power, need);
    const baseRet = { ok: true, win: false, winP: wp, power: power, need: need, layer: n, hiddenBoss: boss, boss: bossOf(n), rewards: null };
    if (!U().chance(wp)) return baseRet; // 惜败，毫无损失

    // —— 通关奖励：灵石/修为（标准收益）+ 随机掉落（装备/材料/残篇/蛋，受周词缀 rw*Pct 加成）——
    const rw = {
      lingShi: Math.floor(100 * Math.pow(n, 1.5) * (1 + rwPct('rwLingShiPct') / 100)),
      cult: 0, mat: {}, equip: null, frag: null, egg: 0, lingYu: 0,
    };
    const cultSec = 60 + 12 * n;
    rw.cult = Math.floor((XG.stats.get().cultRate || XG.cfg.REALMS[XG.state.player.realmIdx].rate) *
      cultSec * (1 + rwPct('rwCultPct') / 100));
    XG.addRes({ lingShi: rw.lingShi });
    giveCult(rw.cult, '镇妖塔第' + n + '层');
    // 材料（先于装备 roll：降级发材料会并入 rw.mat，避免被覆盖）
    rw.mat = rollTowerMats(n);
    if (Object.keys(rw.mat).length) XG.addRes({ mat: rw.mat });
    // 装备：掉率 min(12%+0.4%×N, 55%)，每 10 层保底；grade = min(1+⌊N/20⌋, 3)（非隐藏底材上限）
    let dropP = Math.min(0.12 + n * 0.004, 0.55) * (1 + rwPct('rwDropPct') / 100);
    if (n % 10 === 0) dropP = 1;
    if (U().chance(dropP)) {
      const g = U().clamp(1 + Math.floor(n / 20), 1, 3);
      rw.equip = giveEquip(g, false, rw.mat);
    }
    // 残篇：8% 基础，品阶 min(1+⌊N/15⌋, 9)
    if (U().chance(0.08 * (1 + rwPct('rwFragPct') / 100))) {
      rw.frag = giveFrag(U().clamp(1 + Math.floor(n / 15), 1, 9), 1);
    }
    // 灵宠蛋：1.5% 基础
    if (U().chance(0.015 * (1 + rwPct('rwEggPct') / 100))) { rw.egg = 1; XG.addRes({ egg: 1 }); }

    // —— 隐藏 BOSS 追加厚赏：灵玉 + 必掉高 grade 装备 + 高阶残篇×2 + 宝石箱 ——
    if (boss) {
      const round = bossRound(n);
      rw.lingYu = 20 + 5 * round;
      XG.addRes({ lingYu: rw.lingYu });
      // 必掉装备 grade = min(2+轮次, 4)；grade≥4 时解锁归墟/龙渊隐藏神装（第 2 轮起）
      const bg = U().clamp(2 + round, 1, 4);
      rw.equip = giveEquip(bg, bg >= 4, rw.mat) || rw.equip;
      rw.frag = giveFrag(U().clamp(3 + round, 1, 9), 2) || rw.frag;
      // 宝石箱：gem_* 随机 2~4 件，品阶 ≤ min(1+轮次, 4)（独立记账后合并展示，避免重复入账）
      const gemTier = U().clamp(1 + round, 1, MAT_TIERS.length - 1);
      const gemPool = [];
      for (let t = 0; t <= gemTier; t++) {
        for (const id of MAT_TIERS[t]) if (id.indexOf('gem_') === 0) gemPool.push(id);
      }
      const gemMat = {};
      const gemN = U().randInt(2, 4);
      for (let i = 0; i < gemN; i++) {
        const id = U().pick(gemPool);
        gemMat[id] = (gemMat[id] || 0) + 1;
      }
      XG.addRes({ mat: gemMat });
      for (const id in gemMat) rw.mat[id] = (rw.mat[id] || 0) + gemMat[id];
      const b = bossOf(n);
      incStat('tower_hidden_boss', 1);
      pushNews('world', '镇妖塔第' + n + '层魔气冲天——' + (b ? b.name : '无名魔尊') +
        '被人一剑斩落！传闻其怀中之物已易主。', 2);
    }

    // 进度推进与统计
    d.tower = n + 1;
    if (d.tower > d.towerBest) d.towerBest = d.tower;
    maxStat('tower_layer', d.towerBest);
    incStat('tower_clear', 1);
    XG.bus.emit('tower:clear', { layer: n, hiddenBoss: boss });
    // 隐藏彩蛋：首次登临百层，全服传闻
    if (d.towerBest >= 100 && !d.cent100) {
      d.cent100 = 1;
      pushNews('world', '有绝世高人登临镇妖塔百层之巅！塔身轰鸣三日，万妖伏首，天降异象。', 2);
    }
    XG.bus.emit('save:dirty');

    baseRet.win = true;
    baseRet.rewards = rw;
    return baseRet;
  }

  /* ==================== 守关 ==================== */
  function guardWaves() { return dun().guard.waves || []; }
  function guardInfo() {
    const d = D();
    const waves = guardWaves();
    const cleared = d.guard;
    const done = cleared >= waves.length;
    const wave = waves[Math.min(cleared, waves.length - 1)];
    const power = playerPower();
    return {
      unlocked: XG.cfg.isUnlocked('dungeon_guard'),
      cleared: cleared,
      total: waves.length,
      done: done,
      replay: done, // 全通后挑战=复刷末档（1/3 灵石）
      next: wave ? { n: wave.n, name: wave.name, icon: wave.icon, power: wave.power, desc: wave.desc, reward: wave.reward } : null,
      power: power,
      winP: wave ? winRate(power, wave.power) : 0,
    };
  }

  function challengeGuard() {
    if (!XG.cfg.isUnlocked('dungeon_guard')) return { ok: false, err: '守关尚未开启（化神一层）' };
    const d = D();
    const waves = guardWaves();
    if (!waves.length) return { ok: false, err: '关隘数据缺失' };
    const cleared = d.guard;
    const replay = cleared >= waves.length;
    const wave = waves[Math.min(cleared, waves.length - 1)];
    const power = playerPower();
    const wp = winRate(power, wave.power);
    const ret = {
      ok: true, win: false, winP: wp, replay: replay,
      wave: { n: wave.n, name: wave.name, icon: wave.icon }, rewards: null,
    };
    if (!U().chance(wp)) return ret; // 败走，不计进度亦无损失

    if (replay) {
      // 复刷：仅 1/3 灵石
      const ls = Math.floor(rollNum(wave.reward.lingShi) / 3);
      XG.addRes({ lingShi: ls });
      ret.rewards = { lingShi: ls, lingYu: 0, mat: {}, pill: {}, frag: {}, egg: 0 };
    } else {
      ret.rewards = grantLoot(wave.reward);
      d.guard = cleared + 1;
      maxStat('guard_wave', d.guard);
      if (wave.n === 5 || wave.n === 10 || wave.n === 15) {
        pushNews('world', '边关告急！有修士力挽狂澜，守得「' + wave.name + '」一关，满城欢呼。', 1);
      }
    }
    XG.bus.emit('save:dirty');
    ret.win = true;
    return ret;
  }

  /* ==================== 限时寻宝 ==================== */
  function huntCfg() { return dun().hunt; }
  // 今日免费次数（daily.hunt，main.js 每日重置整个 daily 对象；每日前 10 次免费）
  function huntFreeLeft() {
    const daily = (XG.state.daily = XG.state.daily || { day: '', discuss: {}, help: {}, gift: 0 });
    return Math.max(0, 10 - (daily.hunt || 0));
  }
  function huntInfo() {
    const d = D();
    const run = d.huntRun;
    const now = Date.now();
    return {
      unlocked: XG.cfg.isUnlocked('dungeon_hunt'),
      active: !!run,
      left: run ? Math.max(0, Math.ceil((run.endAt - now) / 1000)) : 0,
      boxes: run ? run.boxes : 0,
      cdLeft: run ? Math.max(0, Math.ceil((run.cdUntil - now) / 1000)) : 0,
      freeLeft: huntFreeLeft(),
      payCost: HUNT_PAY,
      dur: huntCfg().dur || 300,
    };
  }

  // 进入遗府：耗门票（每日前 10 次免费，其后灵玉 10/次），开启 300s 场次
  function enterHunt() {
    if (!XG.cfg.isUnlocked('dungeon_hunt')) return { ok: false, err: '遗府尚未显世（炼虚一层）' };
    const d = D();
    if (d.huntRun) return { ok: false, err: '已身处在遗府之中' };
    const daily = XG.state.daily;
    let free = false;
    if ((daily.hunt || 0) < 10) {
      daily.hunt = (daily.hunt || 0) + 1;
      free = true;
    } else {
      if (!XG.hasRes({ lingYu: HUNT_PAY })) return { ok: false, err: '灵玉不足（门票 ' + HUNT_PAY + ' 灵玉）' };
      XG.addRes({ lingYu: -HUNT_PAY });
    }
    d.hunt++;
    d.huntRun = { endAt: Date.now() + (huntCfg().dur || 300) * 1000, boxes: 0, cdUntil: 0, autoAcc: 0, bestBox: null };
    incStat('hunt_enter', 1);
    XG.bus.emit('save:dirty');
    return { ok: true, free: free };
  }

  // 开一只宝箱：按 pools 权重抽箱品，结算战利品
  function rollBox() {
    const d = D();
    const run = d.huntRun;
    if (!run) return null;
    const pools = huntCfg().pools || [];
    if (!pools.length) return null;
    const pool = U().weighted(pools, 'w');
    const gains = grantLoot(pool.loot);
    run.boxes++;
    incStat('hunt_box', 1);
    // 记录最珍稀箱品（权重最小者）
    if (!run.bestBox || pool.w < run.bestBox.w) run.bestBox = { name: pool.name, w: pool.w };
    XG.bus.emit('save:dirty');
    return { pool: pool, gains: gains };
  }

  // 手动「探寻」：CD 2s
  function seek() {
    const d = D();
    const run = d.huntRun;
    if (!run) return { ok: false, err: '未在寻宝场次中' };
    const now = Date.now();
    if (now < run.cdUntil) return { ok: false, err: '探寻中……稍安勿躁', cdLeft: Math.ceil((run.cdUntil - now) / 1000) };
    if (now >= run.endAt) { endHuntInner(); return { ok: false, err: '遗府已关闭' }; }
    run.cdUntil = now + HUNT_CD_MS;
    const r = rollBox();
    if (!r) return { ok: false, err: '一无所获' };
    return { ok: true, box: { id: r.pool.id, name: r.pool.name, icon: r.pool.icon }, gains: r.gains };
  }

  // 结算离场（内部）：发传闻、清场次
  function endHuntInner() {
    const d = D();
    const run = d.huntRun;
    if (!run) return 0;
    d.huntRun = null;
    if (run.boxes > 0) {
      pushNews('player', '上古遗府一行，共启 ' + run.boxes + ' 只宝匣' +
        (run.bestBox ? '，其中最珍稀者乃「' + run.bestBox.name + '」' : '') + '，满载而归。', 1);
    }
    XG.bus.emit('save:dirty');
    return run.boxes;
  }
  function endHunt() {
    const d = D();
    if (!d.huntRun) return { ok: false, err: '未在寻宝场次中' };
    return { ok: true, boxes: endHuntInner() };
  }

  /* ==================== 扫荡 ==================== */
  // 跨天重置免费次数
  function ensureSweepDay() {
    const d = D();
    const dk = dayKey();
    if (d.sweepDay !== dk) { d.sweepDay = dk; d.sweepFree = SWEEP_PER_DAY; }
  }
  // 单层标准收益（扫荡口径：灵石 + 修为，不含随机掉落）
  function layerStandard(n) {
    return {
      lingShi: Math.floor(100 * Math.pow(n, 1.5) * (1 + rwPct('rwLingShiPct') / 100)),
      cult: Math.floor((XG.stats.get().cultRate || XG.cfg.REALMS[XG.state.player.realmIdx].rate) *
        (60 + 12 * n) * (1 + rwPct('rwCultPct') / 100)),
    };
  }
  function sweepEst() {
    const d = D();
    let ls = 0, cult = 0;
    for (let n = 1; n <= d.towerBest - 1; n++) {
      const s = layerStandard(n);
      ls += s.lingShi; cult += s.cult;
    }
    return { lingShi: Math.floor(ls * SWEEP_RATE), cult: Math.floor(cult * SWEEP_RATE) };
  }
  function sweepInfo() {
    ensureSweepDay();
    const d = D();
    return {
      freeLeft: d.sweepFree,
      payCost: SWEEP_PAY,
      perDay: SWEEP_PER_DAY,
      best: d.towerBest,
      canSweep: d.towerBest > 1 && (d.sweepFree > 0 || XG.hasRes({ lingYu: SWEEP_PAY })),
      est: sweepEst(),
    };
  }

  // 一键扫荡：直接领取 (towerBest−1) 层标准收益 ×0.8；免费 30 次/日，其后灵玉 5/次
  function quickSweep() {
    ensureSweepDay();
    const d = D();
    if (d.towerBest <= 1) return { ok: false, err: '尚未登顶任何层数，无可扫荡' };
    let paid = false;
    if (d.sweepFree > 0) {
      d.sweepFree--;
    } else {
      if (!XG.hasRes({ lingYu: SWEEP_PAY })) return { ok: false, err: '今日免费次数已尽，灵玉亦不足（' + SWEEP_PAY + ' 灵玉/次）' };
      XG.addRes({ lingYu: -SWEEP_PAY });
      paid = true;
    }
    const est = sweepEst();
    XG.addRes({ lingShi: est.lingShi });
    giveCult(est.cult, '镇妖塔扫荡');
    // 材料添头：每 10 层赠 1 份随机材料（品阶按最高层解锁）
    const mat = {};
    const bundles = Math.floor((d.towerBest - 1) / 10);
    for (let i = 0; i < bundles; i++) {
      const one = rollTowerMats(d.towerBest - 1);
      for (const id in one) mat[id] = (mat[id] || 0) + 1;
    }
    if (Object.keys(mat).length) XG.addRes({ mat: mat });
    incStat('sweep_count', 1);
    XG.bus.emit('save:dirty');
    const msg = [
      '扫荡镇妖塔 ' + (d.towerBest - 1) + ' 层（×' + SWEEP_RATE + '）',
      '灵石 +' + U().fmt(est.lingShi) + '，修为 +' + U().fmt(est.cult),
    ];
    if (Object.keys(mat).length) msg.push('另获材料 ' + Object.keys(mat).length + ' 种');
    if (paid) msg.push('（消耗灵玉 ' + SWEEP_PAY + '）');
    return { ok: true, msg: msg, gains: { lingShi: est.lingShi, cult: est.cult, mat: mat } };
  }

  /* ==================== 模块协议（契约 §10） ==================== */
  XG.sys.dungeon = {
    id: 'dungeon',

    // 启动自恢复：补默认字段、对齐周词缀/跨天扫荡
    // 注意：遗留寻宝场次不在此结算——init 先于 offline.settle 执行，离线时段的自动宝箱
    // 统一由 offline(dt) 补开（场次到期由 tick 或 offline 收尾），此处保留原样
    init() {
      D();
      ensureWeek();
      ensureSweepDay();
    },

    // 每秒：寻宝自动开箱（5s/箱）与到期结算；顺带兜底周词缀/跨天刷新
    tick(dt) {
      const d = D();
      ensureSweepDay();
      if (d.week !== U().weekId()) ensureWeek();
      const run = d.huntRun;
      if (!run) return;
      const now = Date.now();
      if (now >= run.endAt) { endHuntInner(); return; }
      run.autoAcc += dt;
      while (run.autoAcc >= HUNT_AUTO_SEC && run.endAt > now) {
        run.autoAcc -= HUNT_AUTO_SEC;
        rollBox();
      }
    },

    // 离线结算：寻宝场次在离线时段内按自动速率（5s/箱）补开宝箱；场次过期则补发结算传闻
    offline(dt) {
      const d = D();
      const run = d.huntRun;
      if (!run) return null;
      const now = Date.now();
      const offlineStart = now - dt * 1000;
      const span = Math.min(now, run.endAt) - offlineStart;
      if (span <= 0) return null;
      const boxes = Math.floor(span / (HUNT_AUTO_SEC * 1000));
      if (boxes <= 0) return null;
      let ls = 0, ly = 0, eggs = 0;
      const matSum = {};
      for (let i = 0; i < boxes; i++) {
        const r = rollBox(); // 内部已入账并累计 stats.hunt_box
        if (!r) break;
        ls += r.gains.lingShi; ly += r.gains.lingYu; eggs += r.gains.egg;
        for (const id in r.gains.mat) matSum[id] = (matSum[id] || 0) + r.gains.mat[id];
      }
      if (now >= run.endAt) endHuntInner();
      return {
        resGain: { lingShi: ls, lingYu: ly },
        events: ['遗府寻宝离线代启 ' + boxes + ' 只宝匣，得灵石 ' + U().fmt(ls) +
          (ly > 0 ? '、灵玉 ' + ly : '') + (eggs > 0 ? '、灵宠蛋 ' + eggs + ' 枚' : '') + '。'],
      };
    },

    // —— UI 对接面（见文件头注释）——
    towerInfo: towerInfo,
    challengeTower: challengeTower,
    guardInfo: guardInfo,
    challengeGuard: challengeGuard,
    huntInfo: huntInfo,
    enterHunt: enterHunt,
    seek: seek,
    endHunt: endHunt,
    sweepInfo: sweepInfo,
    quickSweep: quickSweep,
  };

  XG.sysOrder.push('dungeon');
})();
