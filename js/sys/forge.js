/* forge.js：炼器系统 —— 打造 / 强化 / 洗练 / 镶嵌（宝石三合一）/ 升星 / 套装 / 器灵
 *
 * ============================ UI 对接面（js/ui 唯一接口依据） ============================
 * 说明：所有「操作类」接口统一返回 { ok:true, ... } 或 { ok:false, err:'失败原因文案' }；
 *       所有「查询类」接口纯读取、无副作用。装备实例结构见「装备实例 Schema」。
 *
 * ---- 装备实例 Schema（存于 XG.state.equips.list，slots 存 uid 引用） ----
 * { uid, baseId, grade, slot, affixes:[{id,kind,val,locked}], enh, enhFails,
 *   star, gems:[gemInstId|null, gemInstId|null], spirit:null|{name,persona,lv,exp,skills:[{id,lv}]} }
 *
 * ---- 查询接口 ----
 * getBaseInfo(baseId)        → data 底材对象 {id,name,icon,slot,grade,base,desc} | null
 * getEquip(uid)              → 装备实例 | null
 * getInv()                   → 背包（未装备）装备实例数组
 * getEquipped()              → { weapon:实例|null, head:…, body:…, boots:…, ring:…, talisman:… }
 * getCraftList()             → 可打造底材列表 [{base, cost, can, err}]（隐藏底材不出现在此列表）
 * craftCost(baseId)          → { lingShi, mat:{ore_*:n} } | null
 * getEquipDetail(uid)        → 装备全量视图 { uid, baseId, name, icon, slot, grade, gradeName, hidden,
 *                                enh, enhFails, star, affixes:[{id,name,kind,kindName,val,locked}],
 *                                gems:[gemInstId|null], gemView:[{instId,name,icon,lv,eff}|null],
 *                                spirit, setId, setName, equipped, flat:{atk,def,hp},
 *                                totalAffixPct:{修饰键:合计%}, power } | null
 * enhanceInfo(uid)           → { lv, max, cost, rate, doubled, pity, pityMax } | null
 * reforgeCost(uid)           → { base, perLock, locked, total } | null（total=本次洗练灵玉总价）
 * starInfo(uid)              → { star, max, cost, needDup, dupCandidates:[uid…] } | null
 * getGemBag()                → 背包宝石列表 [{instId, gemId, lv, name, icon, eff, count, canMerge, mergeCost}]
 * getSetInfo()               → 套装检测 [{id, name, icon, count, eff2on, eff4on, eff2, eff4, desc}]
 * spiritInfo(uid)            → { spirit, personaDef, skillView:[{id,name,icon,lv,eff,desc}],
 *                                expNeed, feedable:[uid…], canWake } | null
 * canWakeSpirit(uid)         → { ok, err }
 * enhRate(lv)                → 当前等级强化成功率（0~1）
 * getMods()                  → §7 flat 加成对象（本系统全部装备/套装/器灵加成汇总）
 *
 * ---- 操作接口（ok/err 结构；成功均自动写存档标记 + 刷新属性缓存） ----
 * craft(baseId)              → { ok, uid, equip } 打造指定底材（耗 ore_* + 灵石）
 * equip(uid)                 → { ok, swapped } 穿上（同槽旧件自动回背包）
 * unequip(slot)              → { ok } 卸下指定槽位
 * enhance(uid)               → { ok, success, lv, rate, pity } 强化一次（失败不掉级）
 * reforge(uid, affixIdx)     → { ok, affix } 重 roll 单条词条（锁定的词条每条加价，且不可被洗）
 * toggleLock(uid, affixIdx)  → { ok, locked } 切换词条锁定（免费）
 * inlay(uid, slotIdx, gemInstId) → { ok } 镶嵌（slotIdx 0|1，消耗背包宝石 1 枚）
 * removeGem(uid, slotIdx)    → { ok, gemInstId } 卸下宝石（不损，返还背包）
 * mergeGem(gemId, lv)        → { ok, to } 宝石 3 合 1 升阶（lv1~4 → lv+1，耗灵石）
 * starUp(uid, dupUid?)       → { ok, star } 升星（5 星起需吞同名底材，dupUid 缺省自动选首件候选）
 * wakeSpirit(uid)            → { ok, spirit } 孕育器灵（grade4 且 +15，耗灵玉）
 * feedSpirit(uid, fodderUid) → { ok, lv, learned } 喂食同名装备升级器灵
 *
 * ============================ 写入的统计键（XG.state.stats，snake_case） ============================
 * forge_make     累计打造装备件数   ← 成就 check.k = forgeMake
 * equip_enh_max  单件装备最高强化等级 ← 成就 check.k = equipEnhMax
 * equip_god      当前持有神品(grade4)件数 ← 成就 check.k = equipGod（list 变动时重算）
 * forge_enh      强化尝试次数       forge_reforge  洗练次数
 * forge_gem_merge 宝石合成次数      forge_star     升星次数
 * spirit_wake    器灵唤醒次数       spirit_feed    器灵喂食次数
 *
 * ============================ emit 事件 ============================
 * forge:done  {uid, grade}            打造成功（契约约定事件）
 * equip:gain  {uid, baseId, grade, via} 任何装备入手（createEquip/makeDrop/craft 统一出口，via: create|drop|craft）
 * news        传闻（神兵出世/欧气冲天/器灵觉醒/+20 等，自行 push 进 state.news 并截断）
 *
 * ============================ offline 行为 ============================
 * 炼器无时间型产出，offline(dt) 返回 null（不参与离线结算）。
 * ============================================================================
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  /* ==================== 内部常量 ==================== */
  const SLOTS = ['weapon', 'head', 'body', 'boots', 'ring', 'talisman'];
  const GEM_SLOTS = 2;        // 每件装备镶嵌槽数
  const ENH_DOUBLE_LV = 15;   // 强化 +15 起每次消耗翻倍
  const ENH_PITY = 3;         // +15 后连续失败 3 次，下次必定成功（保底次数）
  const SPIRIT_MAX_LV = 30;   // 器灵等级上限
  const FEED_EXP = 1000;      // 喂食一件同名装备获得的经验
  const GRADE_NAME = ['凡品', '灵品', '宝品', '仙品', '神品'];

  // 词条 kind → XG.stats 修饰键映射（契约 §7 与 data/equips.js 头部注释一致）
  const KIND_KEY = {
    atk: 'atkPct', def: 'defPct', hp: 'hpPct',
    crit: 'critPct', spd: 'spdPct', drop: 'dropPct',
    cult: 'cultRatePct', work: 'workPct', alch: 'alchSuccPct',
  };
  const KIND_NAME = {
    atk: '攻击', def: '防御', hp: '气血', crit: '暴击', spd: '速度',
    drop: '掉落', cult: '修炼', work: '打工', alch: '炼丹',
  };

  /* ==================== 内部小工具 ==================== */
  function D() { return XG.data.equips || { bases: [], affixes: [], sets: [], gems: [], spirits: { personas: [], skills: [] }, formula: {} }; }
  function equ() {
    const s = XG.state;
    s.equips = s.equips || { list: [], slots: {} };
    s.equips.list = s.equips.list || [];
    s.equips.slots = s.equips.slots || {};
    return s.equips;
  }
  function baseOf(baseId) {
    const bs = D().bases || [];
    for (const b of bs) if (b.id === baseId) return b;
    return null;
  }
  function affixDef(id) {
    const as = D().affixes || [];
    for (const a of as) if (a.id === id) return a;
    return null;
  }
  function gemDef(gemId) {
    const gs = D().gems || [];
    for (const g of gs) if (g.id === gemId) return g;
    return null;
  }
  // 宝石实例 id = `${gemId}_${lv}`（gemId 本身含下划线，按最后一个下划线拆分）
  function parseGemInst(instId) {
    if (!instId || typeof instId !== 'string') return null;
    const i = instId.lastIndexOf('_');
    if (i < 0) return null;
    const def = gemDef(instId.slice(0, i));
    const lv = parseInt(instId.slice(i + 1), 10);
    if (!def || !(lv >= 1 && lv <= (def.lv || 5))) return null;
    return { def: def, lv: lv };
  }
  // 各品阶对应矿石（取自 data 公式内部用矿，避免在 sys 重复登记数据）
  function oreOfGrade(grade) {
    const c = D().formula.enhanceCost(0, grade || 0);
    const ids = Object.keys(c.mat || {});
    return ids[0] || 'ore_jingtie';
  }
  function getEquip(uid) {
    const ls = equ().list;
    for (const e of ls) if (e.uid === uid) return e;
    return null;
  }
  function isEquipped(uid) {
    const sl = equ().slots;
    for (const k in sl) if (sl[k] === uid) return true;
    return false;
  }
  function removeItem(uid) {
    const e = equ();
    const i = e.list.findIndex(function (x) { return x.uid === uid; });
    if (i >= 0) e.list.splice(i, 1);
    for (const k in e.slots) if (e.slots[k] === uid) e.slots[k] = null;
  }
  function statAdd(k, n) {
    const s = (XG.state.stats = XG.state.stats || {});
    s[k] = (s[k] || 0) + n;
  }
  function statMax(k, v) {
    const s = (XG.state.stats = XG.state.stats || {});
    if ((s[k] || 0) < v) s[k] = v;
  }
  // 神品件数 / 最高强化 重算（list 变动后调用）
  function recount() {
    const s = (XG.state.stats = XG.state.stats || {});
    let god = 0, enhMax = 0;
    for (const e of equ().list) {
      if (e.grade >= 4) god++;
      if ((e.enh || 0) > enhMax) enhMax = e.enh;
    }
    s.equip_god = god;
    s.equip_enh_max = Math.max(s.equip_enh_max || 0, enhMax);
  }
  function invalidate() { if (XG.stats) XG.stats.invalidate(); }
  function dirty() { XG.bus.emit('save:dirty'); }
  // 传闻助手：unshift 入 state.news 并按上限截断，同时 emit
  function pushNews(text, cat, imp) {
    const n = { t: Date.now(), cat: cat || 'system', text: text, imp: imp == null ? 0 : imp };
    const s = XG.state;
    s.news = s.news || [];
    s.news.unshift(n);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (s.news.length > cap) s.news.length = cap;
    XG.bus.emit('news', n);
  }
  function negCost(cost) {
    const d = {};
    if (cost.lingShi) d.lingShi = -cost.lingShi;
    if (cost.lingYu) d.lingYu = -cost.lingYu;
    if (cost.mat) { d.mat = {}; for (const id in cost.mat) d.mat[id] = -cost.mat[id]; }
    return d;
  }
  function scaleCost(cost, mult) {
    const c = { lingShi: Math.floor((cost.lingShi || 0) * mult), mat: {} };
    for (const id in (cost.mat || {})) c.mat[id] = Math.ceil(cost.mat[id] * mult);
    return c;
  }

  /* ==================== 词条 roll ==================== */
  // 各品阶词条数（data 注释口径）：g0→1，g1→1~2，g2→2，g3→3，g4→4
  function affixCount(grade) {
    if (grade <= 0) return 1;
    if (grade === 1) return XG.util.randInt(1, 2);
    return Math.min(4, grade);
  }
  function mkAffix(def) {
    let val = XG.util.rand(def.min, def.max);
    // 隐藏彩蛋：2%「天工」直接满值
    if (XG.util.chance(0.02)) val = def.max;
    return { id: def.id, kind: def.kind, val: Math.round(val * 10) / 10, locked: false };
  }
  // 从候选池按权重抽 count 条词条，kind 不重复；excludeKinds 为需排除的 kind
  function rollAffixes(grade, count, excludeKinds) {
    const used = (excludeKinds || []).slice();
    const out = [];
    for (let i = 0; i < count; i++) {
      const cand = (D().affixes || []).filter(function (a) {
        return a.grades && a.grades.indexOf(grade) >= 0 && used.indexOf(a.kind) < 0;
      });
      if (!cand.length) break;
      const a = XG.util.weighted(cand);
      used.push(a.kind);
      out.push(mkAffix(a));
    }
    return out;
  }

  /* ==================== 装备生成（全项目通用） ==================== */
  // createEquip(baseId, grade?)：按底材+品阶 roll 词条生成装备实例并入背包；底材不存在返回 null
  function createEquip(baseId, grade) {
    const b = baseOf(baseId);
    if (!b) return null;
    grade = grade == null ? b.grade : XG.util.clamp(grade | 0, 0, 4);
    const eq = {
      uid: XG.util.uid(),
      baseId: baseId,
      grade: grade,
      slot: b.slot,
      affixes: rollAffixes(grade, affixCount(grade), []),
      enh: 0,
      enhFails: 0,
      star: 0,
      gems: [null, null],
      spirit: null,
    };
    equ().list.push(eq);
    recount();
    XG.bus.emit('equip:gain', { uid: eq.uid, baseId: baseId, grade: grade, via: 'create' });
    dirty();
    return eq;
  }

  // makeDrop(targetGrade, opts?)：按权重随机选底材并生成装备（供爬塔/历练等掉落调用）
  // opts.includeHidden=true 时才可能出隐藏底材（归墟/龙渊/半页天书，留给隐藏地图）；
  // 目标品阶无候选时返回 null（调用方自行降级处理）。
  // 隐藏彩蛋：1%「欧气冲天」品阶 +1（不超过 4）。
  function makeDrop(targetGrade, opts) {
    opts = opts || {};
    const setPiece = {};
    (D().sets || []).forEach(function (s) { s.pieces.forEach(function (p) { setPiece[p] = 1; }); });
    let grade = targetGrade | 0;
    let cand = (D().bases || []).filter(function (b) {
      return b.grade === grade && (opts.includeHidden || !b.hidden);
    });
    // 欧气彩蛋：升一品重抽（同样遵守 hidden 过滤）
    let lucky = false;
    if (grade < 4 && XG.util.chance(0.01)) {
      const up = (D().bases || []).filter(function (b) {
        return b.grade === grade + 1 && (opts.includeHidden || !b.hidden);
      });
      if (up.length) { grade++; cand = up; lucky = true; }
    }
    if (!cand.length) return null;
    const pool = cand.map(function (b) { return { b: b, w: setPiece[b.id] ? 55 : 100 }; }); // 套装件略稀有
    const picked = XG.util.weighted(pool).b;
    const eq = createEquip(picked.id, grade);
    if (eq) {
      XG.bus.emit('equip:gain', { uid: eq.uid, baseId: picked.id, grade: grade, via: 'drop' });
      if (lucky) pushNews('欧气冲天！' + XG.state.player.name + ' 获得 ' + GRADE_NAME[grade] + '「' + picked.name + '」，气运之盛令人侧目。', 'player', 1);
    }
    return eq;
  }

  /* ==================== 打造 ==================== */
  // 打造配方：灵石 300×6^grade + 对应品阶矿石 (8+6×grade)（隐藏底材不可打造）
  function craftCost(baseId) {
    const b = baseOf(baseId);
    if (!b) return null;
    const cost = { lingShi: Math.floor(300 * Math.pow(6, b.grade)), mat: {} };
    cost.mat[oreOfGrade(b.grade)] = 8 + b.grade * 6;
    return cost;
  }
  function craftErr(baseId) {
    const b = baseOf(baseId);
    if (!b) return '底材不存在';
    if (b.hidden) return '「' + b.name + '」乃秘境机缘之物，非凡火可铸';
    if (!XG.hasRes(craftCost(baseId))) return '材料或灵石不足';
    return null;
  }
  function craft(baseId) {
    const err = craftErr(baseId);
    if (err) return { ok: false, err: err };
    const b = baseOf(baseId);
    XG.addRes(negCost(craftCost(baseId)));
    const eq = createEquip(baseId, b.grade);
    statAdd('forge_make', 1);
    XG.bus.emit('forge:done', { uid: eq.uid, grade: eq.grade });
    XG.bus.emit('equip:gain', { uid: eq.uid, baseId: baseId, grade: eq.grade, via: 'craft' });
    if (eq.grade >= 4) {
      pushNews('神兵出世！' + XG.state.player.name + ' 亲手铸就神品「' + b.name + '」，霞光冲霄，百里可见。', 'player', 1);
    } else if (eq.grade >= 3) {
      pushNews(XG.state.player.name + ' 铸就仙品「' + b.name + '」，炉火纯青，技艺大进。', 'player', 0);
    }
    return { ok: true, uid: eq.uid, equip: eq };
  }
  function getCraftList() {
    const out = [];
    for (const b of (D().bases || [])) {
      if (b.hidden) continue;
      const cost = craftCost(b.id);
      const err = craftErr(b.id);
      out.push({ base: b, cost: cost, can: !err, err: err });
    }
    return out;
  }

  /* ==================== 穿脱 ==================== */
  function equip(uid) {
    const eq = getEquip(uid);
    if (!eq) return { ok: false, err: '装备不存在' };
    const sl = equ().slots;
    const old = sl[eq.slot] || null;
    if (old === uid) return { ok: false, err: '已穿戴中' };
    sl[eq.slot] = uid;
    invalidate();
    dirty();
    return { ok: true, swapped: old };
  }
  function unequip(slot) {
    const sl = equ().slots;
    if (SLOTS.indexOf(slot) < 0) return { ok: false, err: '部位不存在' };
    if (!sl[slot]) return { ok: false, err: '该部位本就空着' };
    sl[slot] = null;
    invalidate();
    dirty();
    return { ok: true };
  }

  /* ==================== 强化（+1..+20） ==================== */
  // 成功率随等级递减：1 - 4.5%×lv，下限 20%
  function enhRate(lv) {
    return XG.util.clamp(1 - 0.045 * (lv || 0), 0.2, 1);
  }
  function enhanceInfo(uid) {
    const eq = getEquip(uid);
    if (!eq) return null;
    const F = D().formula;
    const lv = eq.enh || 0;
    let cost = F.enhanceCost(lv, eq.grade);
    const doubled = lv >= ENH_DOUBLE_LV;
    if (doubled) cost = scaleCost(cost, 2); // +15 后消耗翻倍
    return { lv: lv, max: F.maxEnh || 20, cost: cost, rate: enhRate(lv), doubled: doubled, pity: eq.enhFails || 0, pityMax: ENH_PITY };
  }
  function enhance(uid) {
    const eq = getEquip(uid);
    if (!eq) return { ok: false, err: '装备不存在' };
    const F = D().formula;
    const lv = eq.enh || 0;
    if (lv >= (F.maxEnh || 20)) return { ok: false, err: '已臻化境，强化已达上限 +20' };
    const info = enhanceInfo(uid);
    if (!XG.hasRes(info.cost)) return { ok: false, err: '灵石或矿石不足' };
    XG.addRes(negCost(info.cost));
    statAdd('forge_enh', 1);
    // 保底：+15 后连续失败满 3 次，本次必成
    const guaranteed = info.doubled && (eq.enhFails || 0) >= ENH_PITY;
    const success = guaranteed || XG.util.chance(info.rate);
    const b = baseOf(eq.baseId);
    if (success) {
      eq.enh = lv + 1;
      eq.enhFails = 0;
      statMax('equip_enh_max', eq.enh);
      let msg = '强化成功，「' + b.name + '」+' + eq.enh + '！';
      if (eq.enh === (F.maxEnh || 20)) {
        msg = '鬼斧神工！「' + b.name + '」强化至 +20 圆满！';
        pushNews(XG.state.player.name + ' 将「' + b.name + '」强化至 +20 大圆满，匠道造诣惊动四方。', 'player', 1);
      } else if (eq.enh === 15 && eq.grade >= 4 && !eq.spirit) {
        pushNews('「' + b.name + '」强化至 +15，器身轻颤，隐有灵智胎动之象。（可孕育器灵）', 'system', 0);
      }
      invalidate();
      dirty();
      return { ok: true, success: true, lv: eq.enh, rate: info.rate, pity: 0, msg: msg };
    }
    // 失败不掉级；+15 后累计保底次数
    if (info.doubled) eq.enhFails = (eq.enhFails || 0) + 1;
    dirty();
    return { ok: true, success: false, lv: eq.enh, rate: info.rate, pity: eq.enhFails || 0, msg: '强化失败，炉火一滞，所幸器物无损。（不掉级）' };
  }

  // 连续强化 n 次：满级/材料不足即停；返回成功次数与最终等级
  function enhanceTimes(uid, n) {
    n = Math.max(1, Math.min(20, n | 0));
    let done = 0, wins = 0, last = null;
    for (let i = 0; i < n; i++) {
      const r = enhance(uid);
      if (!r || !r.ok) { last = r; break; }
      done++;
      if (r.success) wins++;
      last = r;
      const eq = getEquip(uid);
      if (eq && (eq.enh || 0) >= 20) break;
    }
    const eq = getEquip(uid);
    const lv = eq ? (eq.enh || 0) : 0;
    if (!done) return { ok: false, err: (last && (last.err || last.msg)) || '无法强化' };
    return {
      ok: true, times: done, wins: wins, lv: lv,
      msg: '连锤 ' + done + ' 次，成 ' + wins + ' 次，「' + (eq ? baseOf(eq.baseId).name : '装备') + '」现 +' + lv + '。',
    };
  }

  /* ==================== 洗练（重 roll 单条词条） ==================== */
  // 费用：基础 (2+2×grade) 灵玉 + 每条已锁定词条加收 (1+grade)
  function reforgeCost(uid) {
    const eq = getEquip(uid);
    if (!eq) return null;
    const base = 2 + eq.grade * 2;
    const perLock = 1 + eq.grade;
    let locked = 0;
    for (const a of eq.affixes) if (a.locked) locked++;
    return { base: base, perLock: perLock, locked: locked, total: base + perLock * locked };
  }
  function toggleLock(uid, affixIdx) {
    const eq = getEquip(uid);
    if (!eq || !eq.affixes[affixIdx]) return { ok: false, err: '词条不存在' };
    eq.affixes[affixIdx].locked = !eq.affixes[affixIdx].locked;
    dirty();
    return { ok: true, locked: eq.affixes[affixIdx].locked };
  }
  function reforge(uid, affixIdx) {
    const eq = getEquip(uid);
    if (!eq) return { ok: false, err: '装备不存在' };
    const cur = eq.affixes[affixIdx];
    if (!cur) return { ok: false, err: '词条不存在' };
    if (cur.locked) return { ok: false, err: '该词条已锁定，先解锁方可洗练' };
    const c = reforgeCost(uid);
    if ((XG.state.res.lingYu || 0) < c.total) return { ok: false, err: '灵玉不足（需 ' + c.total + '）' };
    XG.addRes({ lingYu: -c.total });
    // 新词条：排除其他词条的 kind（允许同 id 重 roll 数值）
    const otherKinds = eq.affixes.filter(function (a, i) { return i !== affixIdx; }).map(function (a) { return a.kind; });
    const cand = (D().affixes || []).filter(function (a) {
      return a.grades && a.grades.indexOf(eq.grade) >= 0 && otherKinds.indexOf(a.kind) < 0;
    });
    if (!cand.length) return { ok: false, err: '无可洗词条（词条库不足）' };
    const picked = XG.util.weighted(cand);
    const na = mkAffix(picked);
    eq.affixes[affixIdx] = na;
    statAdd('forge_reforge', 1);
    invalidate();
    dirty();
    return { ok: true, affix: na };
  }

  /* ==================== 镶嵌 / 宝石三合一 ==================== */
  function inlay(uid, slotIdx, gemInstId) {
    const eq = getEquip(uid);
    if (!eq) return { ok: false, err: '装备不存在' };
    if (!(slotIdx >= 0 && slotIdx < GEM_SLOTS)) return { ok: false, err: '镶槽不存在' };
    if (eq.gems[slotIdx]) return { ok: false, err: '该镶槽已有宝石，先卸下' };
    const g = parseGemInst(gemInstId);
    if (!g) return { ok: false, err: '宝石不存在' };
    if ((XG.state.inv.mat[gemInstId] || 0) < 1) return { ok: false, err: '背包中没有这枚宝石' };
    XG.addRes({ mat: { [gemInstId]: -1 } });
    eq.gems[slotIdx] = gemInstId;
    invalidate();
    dirty();
    return { ok: true };
  }
  function removeGem(uid, slotIdx) {
    const eq = getEquip(uid);
    if (!eq) return { ok: false, err: '装备不存在' };
    const inst = eq.gems[slotIdx];
    if (!inst) return { ok: false, err: '该镶槽是空的' };
    eq.gems[slotIdx] = null;
    XG.addRes({ mat: { [inst]: 1 } }); // 卸下不损，返还背包
    invalidate();
    dirty();
    return { ok: true, gemInstId: inst };
  }
  // 3 枚同级 + 灵石 → 1 枚高一级（lv5 封顶）
  function mergeGem(gemId, lv) {
    const def = gemDef(gemId);
    if (!def) return { ok: false, err: '宝石不存在' };
    lv = lv | 0;
    if (!(lv >= 1 && lv < (def.lv || 5))) return { ok: false, err: '已达五阶上限，不可再合' };
    const instId = gemId + '_' + lv;
    const need = (def.cost && def.cost.merge) || 3;
    if ((XG.state.inv.mat[instId] || 0) < need) return { ok: false, err: def.name + '·' + lv + '阶不足 ' + need + ' 枚' };
    const lingShi = (def.cost && def.cost.lingShi && def.cost.lingShi[lv]) || 0;
    if ((XG.state.res.lingShi || 0) < lingShi) return { ok: false, err: '灵石不足' };
    const delta = { lingShi: -lingShi, mat: { [instId]: -need } };
    delta.mat[gemId + '_' + (lv + 1)] = 1;
    XG.addRes(delta);
    statAdd('forge_gem_merge', 1);
    return { ok: true, to: gemId + '_' + (lv + 1) };
  }
  // 背包宝石清单（供镶嵌/合成界面）
  function getGemBag() {
    const out = [];
    const bag = XG.state.inv.mat || {};
    for (const instId in bag) {
      const g = parseGemInst(instId);
      if (!g) continue;
      const need = (g.def.cost && g.def.cost.merge) || 3;
      const canMerge = g.lv < (g.def.lv || 5) && bag[instId] >= need &&
        (XG.state.res.lingShi || 0) >= ((g.def.cost && g.def.cost.lingShi && g.def.cost.lingShi[g.lv]) || 0);
      out.push({
        instId: instId, gemId: g.def.id, lv: g.lv, name: g.def.name, icon: g.def.icon,
        eff: g.def.eff, count: bag[instId], canMerge: canMerge,
        mergeCost: { need: need, lingShi: (g.def.cost && g.def.cost.lingShi && g.def.cost.lingShi[g.lv]) || 0 },
      });
    }
    out.sort(function (a, b) { return a.gemId < b.gemId ? -1 : a.gemId > b.gemId ? 1 : a.lv - b.lv; });
    return out;
  }

  /* ==================== 升星（1..10 星） ==================== */
  function starInfo(uid) {
    const eq = getEquip(uid);
    if (!eq) return null;
    const F = D().formula;
    const star = eq.star || 0;
    const cost = F.starCost(star, eq.grade); // {lingYu, mat:{ore_xingsha}, dup}
    const dupCandidates = [];
    if (cost.dup) {
      for (const e of equ().list) {
        if (e.uid !== uid && e.baseId === eq.baseId && !isEquipped(e.uid) && !e.spirit) dupCandidates.push(e.uid);
      }
    }
    return { star: star, max: F.maxStar || 10, cost: cost, needDup: !!cost.dup, dupCandidates: dupCandidates };
  }
  function starUp(uid, dupUid) {
    const eq = getEquip(uid);
    if (!eq) return { ok: false, err: '装备不存在' };
    const info = starInfo(uid);
    if (info.star >= info.max) return { ok: false, err: '十星圆满，不可再升' };
    if (!XG.hasRes({ lingYu: info.cost.lingYu, mat: info.cost.mat })) return { ok: false, err: '灵玉或星砂不足' };
    let fodder = null;
    if (info.needDup) {
      fodder = dupUid ? getEquip(dupUid) : (info.dupCandidates.length ? getEquip(info.dupCandidates[0]) : null);
      if (!fodder) return { ok: false, err: '五星之后，需吞噬一件同名底材方可升星' };
      if (fodder.uid === uid || fodder.baseId !== eq.baseId) return { ok: false, err: '吞噬材料须为同名底材' };
      if (isEquipped(fodder.uid)) return { ok: false, err: '吞噬材料正穿在身上' };
      if (fodder.spirit) return { ok: false, err: '器灵相噬，有伤天和，不可取' };
    }
    XG.addRes({ lingYu: -info.cost.lingYu, mat: (function () { const m = {}; for (const id in info.cost.mat) m[id] = -info.cost.mat[id]; return m; })() });
    if (fodder) removeItem(fodder.uid);
    eq.star = info.star + 1;
    statAdd('forge_star', 1);
    recount();
    const b = baseOf(eq.baseId);
    if (eq.star >= info.max) {
      pushNews('「' + b.name + '」十星圆满，星辉缭绕，如握苍穹一角。', 'player', 1);
    }
    invalidate();
    dirty();
    return { ok: true, star: eq.star };
  }

  /* ==================== 套装检测 ==================== */
  function getSetInfo() {
    const equippedBase = {};
    const sl = equ().slots;
    for (const k in sl) {
      const e = sl[k] ? getEquip(sl[k]) : null;
      if (e) equippedBase[e.baseId] = 1;
    }
    return (D().sets || []).map(function (s) {
      let count = 0;
      for (const p of s.pieces) if (equippedBase[p]) count++;
      return {
        id: s.id, name: s.name, icon: s.icon, count: count,
        eff2on: count >= 2, eff4on: count >= 4,
        eff2: s.eff2, eff4: s.eff4, desc: s.desc, hidden: !!s.hidden,
      };
    });
  }
  function setOfBase(baseId) {
    for (const s of (D().sets || [])) {
      if (s.pieces.indexOf(baseId) >= 0) return s;
    }
    return null;
  }

  /* ==================== 器灵 ==================== */
  function canWakeSpirit(uid) {
    const eq = getEquip(uid);
    if (!eq) return { ok: false, err: '装备不存在' };
    const cond = (D().spirits && D().spirits.wakeCond) || { grade: 4, enh: 15, lingYu: 100 };
    if (eq.spirit) return { ok: false, err: '器灵已孕育' };
    if (eq.grade < cond.grade) return { ok: false, err: '唯神品（grade4）可孕灵' };
    if ((eq.enh || 0) < cond.enh) return { ok: false, err: '需强化至 +' + cond.enh + ' 方可孕灵' };
    if ((XG.state.res.lingYu || 0) < cond.lingYu) return { ok: false, err: '灵玉不足（需 ' + cond.lingYu + '）' };
    return { ok: true };
  }
  function wakeSpirit(uid) {
    const chk = canWakeSpirit(uid);
    if (!chk.ok) return chk;
    const eq = getEquip(uid);
    const SP = D().spirits;
    const cond = SP.wakeCond;
    XG.addRes({ lingYu: -cond.lingYu });
    const persona = XG.util.weighted(SP.personas || []);
    const name = XG.util.pick(XG.data.spiritNames || ['太虚']);
    const skill0 = XG.util.weighted(SP.skills || []);
    const skills = [{ id: skill0.id, lv: 1 }];
    // 隐藏彩蛋：5%「天眷」开局即携双技
    let blessed = false;
    if (XG.util.chance(0.05)) {
      const rest = (SP.skills || []).filter(function (s) { return s.id !== skill0.id; });
      if (rest.length) { skills.push({ id: XG.util.weighted(rest).id, lv: 1 }); blessed = true; }
    }
    eq.spirit = { name: name, persona: persona.id, lv: 1, exp: 0, skills: skills };
    statAdd('spirit_wake', 1);
    const b = baseOf(eq.baseId);
    if (blessed) {
      pushNews('天眷之人！「' + b.name + '」器灵「' + name + '」觉醒即携双技，' + XG.state.player.name + ' 福缘深厚，羡煞旁人。', 'player', 1);
    } else {
      pushNews('「' + b.name + '」器灵「' + name + '」（' + persona.name + '）觉醒，睁开了懵懂的第一眼。', 'player', 1);
    }
    invalidate();
    dirty();
    return { ok: true, spirit: eq.spirit };
  }
  function spiritExpNeed(lv) { return (lv || 1) * 100; }
  // 器灵升级：每 10 级习得新技能（未满 3 个）或强化已有技能
  function spiritLevelUp(eq) {
    const sp = eq.spirit;
    const SP = D().spirits;
    let learned = null;
    if (sp.lv % 10 === 0) {
      const known = {};
      sp.skills.forEach(function (s) { known[s.id] = 1; });
      const rest = (SP.skills || []).filter(function (s) { return !known[s.id]; });
      if (sp.skills.length < 3 && rest.length) {
        const ns = XG.util.weighted(rest);
        sp.skills.push({ id: ns.id, lv: 1 });
        learned = { id: ns.id, name: ns.name, isNew: true };
      } else {
        const t = XG.util.pick(sp.skills);
        t.lv++;
        const sd = (SP.skills || []).find(function (s) { return s.id === t.id; });
        learned = { id: t.id, name: sd ? sd.name : t.id, isNew: false };
      }
    }
    return learned;
  }
  function feedSpirit(uid, fodderUid) {
    const eq = getEquip(uid);
    if (!eq) return { ok: false, err: '装备不存在' };
    if (!eq.spirit) return { ok: false, err: '此器尚未孕育器灵' };
    if (eq.spirit.lv >= SPIRIT_MAX_LV) return { ok: false, err: '器灵已臻圆满（' + SPIRIT_MAX_LV + ' 级）' };
    const fodder = getEquip(fodderUid);
    if (!fodder) return { ok: false, err: '口粮装备不存在' };
    if (fodder.uid === uid) return { ok: false, err: '器灵不能自噬' };
    if (fodder.baseId !== eq.baseId) return { ok: false, err: '器灵只食同名之器' };
    if (isEquipped(fodderUid)) return { ok: false, err: '口粮正穿在身上' };
    if (fodder.spirit) return { ok: false, err: '器灵相噬，有伤天和，不可取' };
    removeItem(fodderUid);
    const sp = eq.spirit;
    sp.exp += FEED_EXP;
    let learned = null;
    while (sp.lv < SPIRIT_MAX_LV && sp.exp >= spiritExpNeed(sp.lv)) {
      sp.exp -= spiritExpNeed(sp.lv);
      sp.lv++;
      const l = spiritLevelUp(eq);
      if (l) learned = l;
    }
    if (sp.lv >= SPIRIT_MAX_LV) sp.exp = 0;
    statAdd('spirit_feed', 1);
    recount();
    invalidate();
    dirty();
    return { ok: true, lv: sp.lv, learned: learned };
  }
  function spiritInfo(uid) {
    const eq = getEquip(uid);
    if (!eq) return null;
    const SP = D().spirits;
    const wake = canWakeSpirit(uid);
    if (!eq.spirit) return { spirit: null, canWake: wake.ok, wakeErr: wake.err || null, wakeCond: SP.wakeCond };
    const sp = eq.spirit;
    const personaDef = (SP.personas || []).find(function (p) { return p.id === sp.persona; }) || null;
    const skillView = sp.skills.map(function (s) {
      const sd = (SP.skills || []).find(function (x) { return x.id === s.id; }) || { id: s.id, name: s.id, eff: {} };
      return { id: s.id, name: sd.name, icon: sd.icon, lv: s.lv, eff: sd.eff, desc: sd.desc };
    });
    const feedable = [];
    for (const e of equ().list) {
      if (e.uid !== uid && e.baseId === eq.baseId && !isEquipped(e.uid) && !e.spirit) feedable.push(e.uid);
    }
    return {
      spirit: sp, personaDef: personaDef, skillView: skillView,
      expNeed: spiritExpNeed(sp.lv), maxLv: SPIRIT_MAX_LV, feedable: feedable, canWake: false,
    };
  }

  /* ==================== 属性计算 ==================== */
  // 单件底材白值 ×强化倍率 ×升星倍率 → flat
  function calcFlat(eq) {
    const b = baseOf(eq.baseId);
    const F = D().formula;
    const mul = F.enhMul(eq.enh || 0) * F.starMul(eq.star || 0);
    const out = { atk: 0, def: 0, hp: 0 };
    if (b && b.base) {
      if (b.base.atk) out.atk = Math.round(b.base.atk * mul);
      if (b.base.def) out.def = Math.round(b.base.def * mul);
      if (b.base.hp) out.hp = Math.round(b.base.hp * mul);
    }
    return out;
  }
  // 器灵加成汇总进 mods（persona 常驻 ×(1+5%/级)，技能 ×(1+20%/技能级)）
  function addSpiritMods(eq, mods) {
    const sp = eq.spirit;
    if (!sp) return;
    const SP = D().spirits;
    const add = function (k, v) { if (typeof v === 'number' && v) mods[k] = (mods[k] || 0) + v; };
    const persona = (SP.personas || []).find(function (p) { return p.id === sp.persona; });
    if (persona && persona.eff) {
      const m = 1 + 0.05 * (sp.lv - 1);
      for (const k in persona.eff) add(k, persona.eff[k] * m);
    }
    for (const s of sp.skills) {
      const sd = (SP.skills || []).find(function (x) { return x.id === s.id; });
      if (!sd || !sd.eff) continue;
      const m = 1 + 0.2 * (s.lv - 1);
      for (const k in sd.eff) add(k, sd.eff[k] * m);
    }
  }
  // §7 属性聚合：已装备 6 件的 base(flat×强化×升星) + 词条 + 宝石 + 套装 + 器灵
  function getMods() {
    const mods = {};
    const add = function (k, v) { if (typeof v === 'number' && v) mods[k] = (mods[k] || 0) + v; };
    const sl = equ().slots;
    for (const slot of SLOTS) {
      const uid = sl[slot];
      if (!uid) continue;
      const eq = getEquip(uid);
      if (!eq) continue;
      const flat = calcFlat(eq);
      add('atkFlat', flat.atk);
      add('defFlat', flat.def);
      add('hpFlat', flat.hp);
      for (const a of eq.affixes) {
        const key = KIND_KEY[a.kind];
        if (key) add(key, a.val);
      }
      for (const inst of eq.gems) {
        const g = parseGemInst(inst);
        if (!g) continue;
        for (const k in g.def.eff) add(k, g.def.eff[k] * g.lv);
      }
      addSpiritMods(eq, mods);
    }
    // 套装 2/4 件效果
    for (const s of getSetInfo()) {
      if (s.eff2on) for (const k in s.eff2) add(k, s.eff2[k]);
      if (s.eff4on) for (const k in s.eff4) add(k, s.eff4[k]);
    }
    return mods;
  }

  /* ==================== 查询 ==================== */
  function getInv() {
    return equ().list.filter(function (e) { return !isEquipped(e.uid); });
  }
  function getEquipped() {
    const sl = equ().slots;
    const out = {};
    for (const s of SLOTS) out[s] = sl[s] ? getEquip(sl[s]) : null;
    return out;
  }
  // 装备全量视图（UI 渲染用）
  function getEquipDetail(uid) {
    const eq = getEquip(uid);
    if (!eq) return null;
    const b = baseOf(eq.baseId) || { name: eq.baseId, icon: '❓', base: {} };
    const set = setOfBase(eq.baseId);
    const flat = calcFlat(eq);
    const affixes = eq.affixes.map(function (a) {
      const def = affixDef(a.id) || { name: a.id };
      return { id: a.id, name: def.name, kind: a.kind, kindName: KIND_NAME[a.kind] || a.kind, val: a.val, locked: !!a.locked };
    });
    const gemView = eq.gems.map(function (inst) {
      const g = parseGemInst(inst);
      if (!g) return null;
      return { instId: inst, name: g.def.name, icon: g.def.icon, lv: g.lv, eff: g.def.eff };
    });
    // 单件词条+宝石合计百分数（展示用）
    const totalAffixPct = {};
    for (const a of eq.affixes) {
      const key = KIND_KEY[a.kind];
      if (key) totalAffixPct[key] = Math.round(((totalAffixPct[key] || 0) + a.val) * 10) / 10;
    }
    for (const inst of eq.gems) {
      const g = parseGemInst(inst);
      if (!g) continue;
      for (const k in g.def.eff) totalAffixPct[k] = Math.round(((totalAffixPct[k] || 0) + g.def.eff[k] * g.lv) * 10) / 10;
    }
    const power = XG.cfg.POWER({ atk: flat.atk, def: flat.def, hp: flat.hp, spd: 0 });
    return {
      uid: eq.uid, baseId: eq.baseId, name: b.name, icon: b.icon, slot: eq.slot,
      grade: eq.grade, gradeName: GRADE_NAME[eq.grade] || '凡品', hidden: !!b.hidden, desc: b.desc,
      enh: eq.enh || 0, enhFails: eq.enhFails || 0, star: eq.star || 0,
      affixes: affixes, gems: eq.gems.slice(), gemView: gemView,
      spirit: eq.spirit, setId: set ? set.id : null, setName: set ? set.name : null,
      equipped: isEquipped(uid), flat: flat, totalAffixPct: totalAffixPct, power: power,
    };
  }

  /* ==================== 模块注册（契约 §10） ==================== */
  XG.sys.forge = {
    id: 'forge',

    init() {
      // 自恢复：补全结构字段（读档/旧档容错）
      const e = equ();
      for (const s of SLOTS) if (!(s in e.slots)) e.slots[s] = null;
      for (const eq of e.list) {
        eq.affixes = eq.affixes || [];
        for (const a of eq.affixes) a.locked = !!a.locked;
        eq.enh = eq.enh || 0;
        eq.enhFails = eq.enhFails || 0;
        eq.star = eq.star || 0;
        eq.gems = Array.isArray(eq.gems) ? eq.gems.slice(0, GEM_SLOTS) : [null, null];
        while (eq.gems.length < GEM_SLOTS) eq.gems.push(null);
        eq.spirit = eq.spirit || null;
      }
      // 清理 slots 里指向已不存在装备的悬空引用
      for (const s of SLOTS) if (e.slots[s] && !getEquip(e.slots[s])) e.slots[s] = null;
      const st = (XG.state.stats = XG.state.stats || {});
      st.forge_make = st.forge_make || 0;
      st.equip_enh_max = st.equip_enh_max || 0;
      st.forge_enh = st.forge_enh || 0;
      st.forge_reforge = st.forge_reforge || 0;
      st.forge_gem_merge = st.forge_gem_merge || 0;
      st.forge_star = st.forge_star || 0;
      st.spirit_wake = st.spirit_wake || 0;
      st.spirit_feed = st.spirit_feed || 0;
      recount();
      invalidate();
    },

    tick(dt) { /* 炼器为即时操作型系统，无每秒逻辑 */ },

    offline(dt) { return null; }, // 无时间型产出，不参与离线结算

    getMods: getMods,

    // 全项目通用生成接口
    createEquip: createEquip,
    makeDrop: makeDrop,

    // 打造
    craft: craft,
    craftCost: craftCost,
    getCraftList: getCraftList,

    // 穿脱
    equip: equip,
    unequip: unequip,

    // 强化
    enhance: enhance,
    enhanceTimes: enhanceTimes,
    enhanceInfo: enhanceInfo,
    enhRate: enhRate,

    // 洗练
    reforge: reforge,
    reforgeCost: reforgeCost,
    toggleLock: toggleLock,

    // 镶嵌 / 宝石
    inlay: inlay,
    removeGem: removeGem,
    mergeGem: mergeGem,
    getGemBag: getGemBag,

    // 升星
    starUp: starUp,
    starInfo: starInfo,

    // 套装
    getSetInfo: getSetInfo,

    // 器灵
    wakeSpirit: wakeSpirit,
    feedSpirit: feedSpirit,
    spiritInfo: spiritInfo,
    canWakeSpirit: canWakeSpirit,

    // 查询
    getBaseInfo: baseOf,
    getEquip: getEquip,
    getInv: getInv,
    getEquipped: getEquipped,
    getEquipDetail: getEquipDetail,
  };

  XG.sysOrder.push('forge');
})();
