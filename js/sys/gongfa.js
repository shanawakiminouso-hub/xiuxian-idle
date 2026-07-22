/* sys/gongfa.js：功法系统——残篇合成/学习/升级/熟练度/装备槽/羁绊/隐藏功法监听/自创功法（契约 §10，纯逻辑无 UI）
 *
 * ============================ UI 对接面（供 ui 层调用的全部查询/操作函数） ============================
 * 常量（直接挂在 XG.sys.gongfa 上）：
 *   LV_MAX=20（功法等级上限） MAX_ACTIVE=4（装备槽） MAX_CUSTOM=9（自创上限）
 *   PROF_PER_SEC=5/3（熟练度/秒，约 10 分钟圆满） PROF_BONUS=1.5（熟练圆满后 eff 倍率）
 *   CREATE_FRAG_COST=24（自创一次消耗的任意残篇总数）
 *
 * 查询：
 *   listGongfa() → [vm]，全量功法视图模型（data.list 按表序 + custom 尾随），元素：
 *     { id, name, icon, grade, hidden, root, desc, getHint, idx(data 表序，custom 为 -1),
 *       fragNeed, fragHave,                  // 残篇需求/持有（gongfa.frag 与 inv.frag 两袋合计）
 *       unlocked, visible,                   // unlocked=可参悟（境界/隐藏条件达成）；visible=UI 是否亮出（隐藏功法未解锁时显示 ???）
 *       learned, lv, prof, profMax, profFull,// 已学信息（未学 lv=0/prof=0）
 *       active,                              // 是否已装备
 *       learnable,                           // 未学 && 已解锁 && 残篇集满
 *       upCost,                              // 下一级修为消耗（满级/未学为 Infinity）
 *       effPerLv,                            // 每级 eff 原表
 *       effLines:[str],                      // 每级效果文案，如 '修炼速度 +1.5%'
 *       effNow:null|{eff,lines,lv,mult,profFull}, // 当前总效果（lv×倍率，圆满×1.5）
 *       custom:bool }
 *   listBonds() → [{ id, name, desc, eff, effLines:[str], need:[gfId],
 *                    needStatus:[{id,name,owned}], active }]   // active=need 全部已学
 *   getDef(id) → def|null                    // 原始定义（普通功法查 data，自创查 state.custom）
 *   fragOf(gfId) → n                         // 两袋残篇合计
 *   unlockOk(def) → bool                     // 境界解锁/隐藏条件是否满足
 *   upCost(id) → number                      // 升级修为消耗（满级 Infinity）
 *   effNow(id) → null|{eff,lines,lv,mult,profFull}
 *   effLines(eff, mult?) → [str]             // eff 对象转文案（供羁绊/自创展示）
 *   canCreate() → {ok, msg?, cost?}          // 自创前置检查（化神解锁/上限 9/残篇 24）
 *
 * 操作（均返回 {ok, msg?...}，失败不扣资源）：
 *   learn(gfId)        → {ok, msg?}                 // 集满残篇合成学习（耗 fragNeed）
 *   upgrade(gfId)      → {ok, msg?, lv?, cost?}     // 耗修为升 1 级
 *   upgradeMax(gfId)   → {ok, times, lv}            // 连升至修为不足或满级
 *   equip(gfId)        → {ok, msg?}                 // 装备（≤4，需已学）
 *   unequip(gfId)      → {ok, msg?}
 *   toggle(gfId)       → 同 equip/unequip           // UI 单击切换
 *   createCustom()     → {ok, msg?, def?}           // 自创 roll（耗任意残篇×24，结果 def 见下）
 *   forgetCustom(id)   → {ok, msg?}                 // 遗忘自创功法（仅 custom）
 *   addFrag(gfId, n)   → {ok, total, degraded?}     // 【跨系统 API】发残篇统一入口（守则 5）
 *
 * ============================ state.stats 写入键（snake_case，守则 3） ============================
 *   gongfa_frag          累计获得残篇数        gongfa_learn        累计习得功法数
 *   gongfa_up            累计功法升级次数      gongfa_prof_max     熟练度圆满次数
 *   gongfa_hidden_unlock 隐藏功法解锁次数      gongfa_create       自创功法次数
 *   gongfa_forget        遗忘自创功法次数
 * （成就的 gongfaOwn/gongfaMaxLv/gongfaCreateCount/gongfaHidden 由 collection 直接读 state.gongfa 子树，本系统不重复计数）
 *
 * ============================ 事件 ============================
 * emit：'news'（+push state.news）、'codex:new' {kind:'gongfa', id}（习得/隐藏解锁/自创）、
 *       'res:changed'、'save:dirty'
 * 订阅（守则 4，隐藏功法 5 条件）：
 *   'alch:done' {explode}      → 炸炉计数 ≥10 解锁 cond alchemy_explode_10（gf_danjie）
 *   'tower:clear' {layer≥33}   → 解锁 tower_33（gf_qingtian）
 *   'fellow:gift' {ouhuang|persona='ouhuang'} → 解锁 fellow_ouhuang_gift（gf_hongyun）
 *   'reincarn:done' {count}    → 解锁 reincarn_1（gf_wangsheng）
 *   'codex:new' {kind:'pet'}   → codex.pet.length≥20 解锁 codex_pet_20（gf_wanling）
 * 另有每 5s tick 兜底全量校验（自恢复：兼容旧档/轮回后/事件漏发）。
 *
 * ============================ 隐藏内容 ============================
 * 5 部 cond 隐藏功法按上述事件解锁；解锁后 news(imp2) 播报 + codex:new；
 * 自创功法名字 12 次重 roll 防重名，grade 按玩家境界段上浮（化神 5~7 品 → 渡劫 8~9 品），eff 2~3 条带 ±20% 欧非浮动。
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  // ============ 常量 ============
  const LV_MAX = 20;          // 功法等级上限（每级 eff 线性成长）
  const MAX_ACTIVE = 4;       // 装备槽上限（state.gongfa.active）
  const MAX_CUSTOM = 9;       // 自创功法上限
  const PROF_PER_SEC = 5 / 3; // 装备中功法熟练度增速（满 1000 约 10 分钟）
  const PROF_BONUS = 1.5;     // 熟练度圆满后 eff 倍率
  const CREATE_FRAG_COST = 24;// 自创一次消耗的任意残篇总数
  // 品阶→升级消耗参考境界（无 unlock 字段的隐藏功法用；g1~3 炼气，g4 筑基，g5 金丹，g6 元婴，g7 化神，g8 合体，g9 大乘）
  const GRADE_REALM = { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2, 6: 3, 7: 4, 8: 6, 9: 7 };
  // 隐藏功法 5 条件（data/gongfa.js 的 cond 取值）
  const HIDDEN_CONDS = ['alchemy_explode_10', 'tower_33', 'fellow_ouhuang_gift', 'reincarn_1', 'codex_pet_20'];
  // eff 键 → 展示文案
  const EFF_LABELS = {
    cultRatePct: '修炼速度', atkPct: '攻击加成', defPct: '防御加成', hpPct: '气血加成',
    dropPct: '掉落加成', alchSuccPct: '炼丹成功率', forgeSuccPct: '锻造成功率',
    breakSuccPct: '破境成功率', workPct: '杂务效率', offlineHours: '离线收益时长',
    atkFlat: '攻击', defFlat: '防御', hpFlat: '气血', spdPct: '身法加成', spdFlat: '身法',
  };
  const FLAT_KEYS = { atkFlat: 1, defFlat: 1, hpFlat: 1, spdFlat: 1 };
  // 自创功法 eff 每品阶强度系数（对齐 data：g7 cultRatePct≈2.5~3.5/级，g9≈6~7/级）
  const CREATE_EFF_SCALE = {
    cultRatePct: 0.7, atkPct: 0.65, defPct: 0.65, hpPct: 0.6, dropPct: 0.5,
    alchSuccPct: 0.4, forgeSuccPct: 0.35, workPct: 0.5, breakSuccPct: 0.12,
  };
  const CREATE_EFF_KEYS = Object.keys(CREATE_EFF_SCALE);

  let _map = null; // data list id→def 索引（惰性建立，避免顶层依赖 data）
  let _acc = 0;    // tick 节流计时器

  // ============ 内部助手 ============
  // 取 state.gongfa 子树并懒初始化扩展字段（save.js 深合并保留多余键，读档安全）
  function st() {
    const g = (XG.state.gongfa = XG.state.gongfa || { owned: {}, active: [], frag: {}, custom: [] });
    g.owned = g.owned || {}; g.active = g.active || []; g.frag = g.frag || {}; g.custom = g.custom || [];
    g.hiddenUnlock = g.hiddenUnlock || {};                    // {gfId:1} 已解锁的 cond 隐藏功法
    g.hiddenProg = g.hiddenProg || { explode: 0, ouhuangGift: 0 }; // 隐藏条件进度
    g.hiddenProg.explode = g.hiddenProg.explode || 0;
    g.hiddenProg.ouhuangGift = g.hiddenProg.ouhuangGift || 0;
    g.bondSeen = g.bondSeen || {};                            // {bondId:1} 已播报过的激活羁绊
    return g;
  }

  function defMap() {
    if (!_map) {
      _map = {};
      const list = (XG.data.gongfa && XG.data.gongfa.list) || [];
      for (let i = 0; i < list.length; i++) _map[list[i].id] = list[i];
    }
    return _map;
  }

  // 查功法定义：先 data 表，再自创列表
  function getDef(id) {
    if (!id) return null;
    const m = defMap();
    if (m[id]) return m[id];
    const c = st().custom;
    for (let i = 0; i < c.length; i++) if (c[i].id === id) return c[i];
    return null;
  }

  // 成就/统计计数（守则 3：懒初始化 XG.state.stats）
  function bump(k, n) {
    const s = (XG.state.stats = XG.state.stats || {});
    s[k] = (s[k] || 0) + (n || 1);
  }

  // 传闻推送（守则 7：emit + push state.news 截断）
  function pushNews(cat, text, imp) {
    const obj = { t: Date.now(), cat: cat, text: text, imp: imp || 0 };
    const news = (XG.state.news = XG.state.news || []);
    news.unshift(obj);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (news.length > cap) news.length = cap;
    XG.bus.emit('news', obj);
  }

  function invalidate() { if (XG.stats && XG.stats.invalidate) XG.stats.invalidate(); }
  function dirty() { XG.bus.emit('save:dirty'); }

  // 残篇两袋合计（state.gongfa.frag 为主，inv.frag 兼容 addRes 路径）
  function fragOf(gfId) {
    const g = st();
    const inv = XG.state.inv.frag || {};
    return (g.frag[gfId] || 0) + (inv[gfId] || 0);
  }

  // 扣除指定功法残篇 n 张（先扣 gongfa.frag，再扣 inv.frag）
  function consumeFrag(gfId, n) {
    const g = st();
    let left = n;
    const own = g.frag[gfId] || 0;
    if (own > 0) {
      const take = Math.min(own, left);
      g.frag[gfId] -= take;
      if (g.frag[gfId] <= 0) delete g.frag[gfId];
      left -= take;
    }
    if (left > 0) XG.addRes({ frag: { [gfId]: -left } });
    XG.bus.emit('res:changed');
  }

  // 全部残篇总数（两袋所有 id 合计，自创消耗用）
  function totalFrags() {
    let t = 0;
    const g = st();
    for (const k in g.frag) t += g.frag[k];
    const inv = XG.state.inv.frag || {};
    for (const k in inv) t += inv[k];
    return t;
  }

  // 从任意残篇中扣除 n 张（存量多的先扣）
  function consumeAnyFrags(n) {
    const g = st();
    const entries = [];
    for (const k in g.frag) entries.push({ inv: false, id: k, n: g.frag[k] });
    const inv = XG.state.inv.frag || {};
    for (const k in inv) entries.push({ inv: true, id: k, n: inv[k] });
    entries.sort((a, b) => b.n - a.n);
    let left = n;
    for (const e of entries) {
      if (left <= 0) break;
      const take = Math.min(e.n, left);
      if (e.inv) XG.addRes({ frag: { [e.id]: -take } });
      else {
        g.frag[e.id] -= take;
        if (g.frag[e.id] <= 0) delete g.frag[e.id];
      }
      left -= take;
    }
    XG.bus.emit('res:changed');
  }

  // 解锁判定：cond 隐藏功法看 hiddenUnlock；unlock 看境界层数；自创/无门槛恒可
  function unlockOk(def) {
    if (!def) return false;
    if (def.custom) return true;
    if (def.cond) return !!st().hiddenUnlock[def.id];
    if (def.unlock) {
      const p = XG.state.player;
      const u = def.unlock;
      return p.realmIdx > u.realmIdx || (p.realmIdx === u.realmIdx && p.layer >= u.layer);
    }
    return true;
  }

  // 单个隐藏条件当前是否满足（读 state 自恢复，事件只做加速）
  function condMet(cond) {
    const g = st();
    const s = XG.state;
    const stats = s.stats || {};
    switch (cond) {
      case 'alchemy_explode_10':
        return (g.hiddenProg.explode || 0) >= 10 || (stats.pill_explode || 0) >= 10;
      case 'tower_33': {
        const dg = s.dungeon || {};
        return (dg.towerBest || 0) >= 33 || (dg.tower || 1) >= 33;
      }
      case 'fellow_ouhuang_gift':
        return !!g.hiddenProg.ouhuangGift;
      case 'reincarn_1':
        return (s.player.reincarn || 0) >= 1;
      case 'codex_pet_20':
        return (s.codex && s.codex.pet ? s.codex.pet.length : 0) >= 20;
    }
    return false;
  }

  // 解锁某 cond 对应的全部隐藏功法：置可学习 + news 播报 + emit codex:new（守则 4）
  function unlockByCond(cond) {
    const g = st();
    const list = (XG.data.gongfa && XG.data.gongfa.list) || [];
    for (let i = 0; i < list.length; i++) {
      const def = list[i];
      if (def.cond !== cond || g.hiddenUnlock[def.id]) continue;
      g.hiddenUnlock[def.id] = 1;
      bump('gongfa_hidden_unlock');
      pushNews('system', '天机显现！隐藏功法《' + def.name + '》现世，集齐残篇即可参悟。', 2);
      XG.bus.emit('codex:new', { kind: 'gongfa', id: def.id });
    }
    dirty();
  }

  // 全量校验 5 个隐藏条件（init 自恢复 + tick 兜底）
  function checkConds() {
    for (let i = 0; i < HIDDEN_CONDS.length; i++) {
      if (condMet(HIDDEN_CONDS[i])) unlockByCond(HIDDEN_CONDS[i]);
    }
  }

  // 羁绊是否激活：need 全部已学
  function bondActive(bond) {
    const ow = st().owned;
    for (let i = 0; i < bond.need.length; i++) if (!ow[bond.need[i]]) return false;
    return true;
  }

  // 羁绊激活检测：notify=true 时对首次激活的羁绊播报（init 时用 false 播种防刷屏）
  function checkBonds(notify) {
    const g = st();
    const bonds = (XG.data.gongfa && XG.data.gongfa.bonds) || [];
    for (let i = 0; i < bonds.length; i++) {
      const b = bonds[i];
      if (!bondActive(b) || g.bondSeen[b.id]) continue;
      g.bondSeen[b.id] = 1;
      if (notify) {
        pushNews('player', '功法共鸣！羁绊「' + b.name + '」激活——' + b.desc, 1);
        invalidate(); // 羁绊 eff 进 getMods
      }
    }
  }

  // eff 对象 → 展示文案数组（mult=倍率，默认每级）
  function effLines(eff, mult) {
    mult = mult || 1;
    const out = [];
    for (const k in eff) {
      const v = Math.round(eff[k] * mult * 10) / 10;
      const label = EFF_LABELS[k] || k;
      if (k === 'offlineHours') out.push(label + ' +' + v + ' 小时');
      else if (FLAT_KEYS[k]) out.push(label + ' +' + v);
      else out.push(label + ' +' + v + '%');
    }
    return out;
  }

  // 当前已学功法的实际总效果（lv 线性 × 圆满 1.5）
  function effNow(id) {
    const g = st();
    const ow = g.owned[id];
    const def = getDef(id);
    if (!ow || !def || !def.eff) return null;
    const full = (ow.prof || 0) >= (def.profMax || 1000);
    const mult = ow.lv * (full ? PROF_BONUS : 1);
    const eff = {};
    for (const k in def.eff) eff[k] = Math.round(def.eff[k] * mult * 10) / 10;
    return { eff: eff, lines: effLines(def.eff, mult), lv: ow.lv, mult: mult, profFull: full };
  }

  // 升级修为消耗：参考境界 rate×3×lv²（满级总耗≈该境界 2 小时修为，防单系统速通）
  function upCost(id) {
    const def = getDef(id);
    const ow = st().owned[id];
    if (!def || !ow || ow.lv >= LV_MAX) return Infinity;
    const rIdx = def.custom
      ? (def.born != null ? def.born : 4) // 自创功法按创生时境界段计价
      : (def.unlock ? def.unlock.realmIdx : (GRADE_REALM[def.grade] || 0));
    const base = (XG.cfg.REALMS[rIdx] || XG.cfg.REALMS[0]).rate * 3;
    return Math.ceil(base * ow.lv * ow.lv);
  }

  // 熟练度增长（装备中的才涨）；collect 传入数组时收集圆满简讯（offline 用），否则即时播报
  function gainProf(dt, collect) {
    const g = st();
    for (let i = 0; i < g.active.length; i++) {
      const id = g.active[i];
      const ow = g.owned[id];
      const def = getDef(id);
      if (!ow || !def) continue;
      const max = def.profMax || 1000;
      if ((ow.prof || 0) >= max) continue;
      ow.prof = Math.min(max, (ow.prof || 0) + dt * PROF_PER_SEC);
      if (ow.prof >= max) {
        bump('gongfa_prof_max');
        const txt = '《' + def.name + '》臻至圆满，收发由心，威力倍增（效果×' + PROF_BONUS + '）！';
        if (collect) collect.push(txt);
        else pushNews('player', txt, 1);
        invalidate(); // ×1.5 生效
      }
    }
  }

  // 自创名字查重（普通 + 自创）
  function nameTaken(name) {
    const list = (XG.data.gongfa && XG.data.gongfa.list) || [];
    for (let i = 0; i < list.length; i++) if (list[i].name === name) return true;
    const c = st().custom;
    for (let i = 0; i < c.length; i++) if (c[i].name === name) return true;
    return false;
  }

  // ============ 跨系统 API（守则 5）：发功法残篇统一入口 ============
  function addFrag(gfId, n) {
    n = Math.floor(n || 0);
    if (n <= 0) return { ok: false, total: fragOf(gfId) };
    const def = getDef(gfId);
    if (!def || def.custom) {
      // 防御：未知/自创 id 折算灵石，不报错（守则 5 降级）
      XG.addRes({ lingShi: n * 100 });
      return { ok: false, total: 0, degraded: true };
    }
    const g = st();
    const before = fragOf(gfId);
    g.frag[gfId] = (g.frag[gfId] || 0) + n;
    bump('gongfa_frag', n);
    // 残篇集满提示（未学且已解锁，恰好跨过门槛时）
    if (!g.owned[gfId] && before < (def.fragNeed || 0) && fragOf(gfId) >= (def.fragNeed || 0) && unlockOk(def)) {
      pushNews('system', '《' + def.name + '》残篇已集齐，可前往功法界面参悟。', 1);
    }
    XG.bus.emit('res:changed');
    dirty();
    return { ok: true, total: fragOf(gfId) };
  }

  // ============ 学习 / 升级 / 装备 ============
  function learn(gfId) {
    const g = st();
    const def = getDef(gfId);
    if (!def || def.custom) return { ok: false, msg: '查无此功法' };
    if (g.owned[gfId]) return { ok: false, msg: '已然习得' };
    if (!unlockOk(def)) return { ok: false, msg: '机缘未至，尚不可参悟' };
    const need = def.fragNeed || 0;
    if (fragOf(gfId) < need) return { ok: false, msg: '残篇不足（' + fragOf(gfId) + '/' + need + '）' };
    consumeFrag(gfId, need);
    g.owned[gfId] = { lv: 1, prof: 0 };
    bump('gongfa_learn');
    pushNews('player', '你集齐残篇，习得' + def.grade + '品功法《' + def.name + '》！', def.grade >= 8 ? 2 : 1);
    XG.bus.emit('codex:new', { kind: 'gongfa', id: gfId });
    checkBonds(true);
    invalidate();
    dirty();
    return { ok: true };
  }

  function upgrade(gfId) {
    const g = st();
    const ow = g.owned[gfId];
    const def = getDef(gfId);
    if (!ow || !def) return { ok: false, msg: '尚未习得此功法' };
    if (ow.lv >= LV_MAX) return { ok: false, msg: '已臻化境（满级 ' + LV_MAX + '）' };
    const cost = upCost(gfId);
    if ((XG.state.player.cult || 0) < cost) return { ok: false, msg: '修为不足', cost: cost };
    XG.state.player.cult -= cost;
    ow.lv += 1;
    bump('gongfa_up');
    invalidate();
    XG.bus.emit('res:changed');
    dirty();
    return { ok: true, lv: ow.lv, cost: cost };
  }

  // 一键连升：修为够就一直升到满级
  function upgradeMax(gfId) {
    let times = 0;
    for (let i = 0; i < LV_MAX; i++) {
      const r = upgrade(gfId);
      if (!r.ok) break;
      times++;
    }
    const ow = st().owned[gfId];
    return { ok: times > 0, times: times, lv: ow ? ow.lv : 0 };
  }

  function equip(gfId) {
    const g = st();
    if (!g.owned[gfId]) return { ok: false, msg: '尚未习得此功法' };
    if (g.active.indexOf(gfId) >= 0) return { ok: false, msg: '已在装备中' };
    if (g.active.length >= MAX_ACTIVE) return { ok: false, msg: '装备槽已满（' + MAX_ACTIVE + ' 个）' };
    g.active.push(gfId);
    invalidate();
    dirty();
    return { ok: true };
  }

  function unequip(gfId) {
    const g = st();
    const i = g.active.indexOf(gfId);
    if (i < 0) return { ok: false, msg: '并未装备' };
    g.active.splice(i, 1);
    invalidate();
    dirty();
    return { ok: true };
  }

  function toggle(gfId) {
    return st().active.indexOf(gfId) >= 0 ? unequip(gfId) : equip(gfId);
  }

  // ============ 自创功法（化神 1 层解锁，耗任意残篇×24 roll 一次） ============
  function canCreate() {
    if (!(XG.cfg && XG.cfg.isUnlocked && XG.cfg.isUnlocked('gongfaCreate'))) {
      return { ok: false, msg: '化神一层方可自创功法' };
    }
    if (st().custom.length >= MAX_CUSTOM) {
      return { ok: false, msg: '自创功法已达上限（' + MAX_CUSTOM + ' 门），可遗忘后再创' };
    }
    if (totalFrags() < CREATE_FRAG_COST) {
      return { ok: false, msg: '残篇不足（需任意功法残篇×' + CREATE_FRAG_COST + '）' };
    }
    return { ok: true, cost: CREATE_FRAG_COST };
  }

  function createCustom() {
    const chk = canCreate();
    if (!chk.ok) return chk;
    const p = XG.state.player;
    consumeAnyFrags(CREATE_FRAG_COST);
    // 品阶按境界段位上浮：化神 5~7 品 → 渡劫 8~9 品（欧非随机）
    const grade = XG.util.clamp(XG.util.randInt(p.realmIdx, p.realmIdx + 3), 5, 9);
    // 拼名：前缀+核心+后缀，至多 12 次重 roll 防重名
    const pool = XG.data.gongfa.createPool;
    let name = '';
    for (let t = 0; t < 12; t++) {
      name = XG.util.pick(pool.prefix) + XG.util.pick(pool.core) + XG.util.pick(pool.suffix);
      if (!nameTaken(name)) break;
    }
    // roll 2~3 条 eff（55% 三条），强度=系数×品阶×±20% 浮动
    const picked = XG.util.pickN(CREATE_EFF_KEYS, XG.util.chance(0.55) ? 3 : 2);
    const eff = {};
    for (let i = 0; i < picked.length; i++) {
      const k = picked[i];
      eff[k] = Math.max(0.1, Math.round(CREATE_EFF_SCALE[k] * grade * XG.util.rand(0.8, 1.3) * 10) / 10);
    }
    // 仅两条时 40% 追加一条固定值词条（攻/血）
    if (picked.length < 3 && XG.util.chance(0.4)) {
      if (XG.util.chance(0.5)) eff.atkFlat = Math.round(grade * grade * 2.5 * XG.util.rand(0.7, 1.3));
      else eff.hpFlat = Math.round(grade * grade * 15 * XG.util.rand(0.7, 1.3));
    }
    const id = 'gfc_' + XG.util.uid();
    const def = {
      id: id, name: name, icon: XG.util.pick(['悟', '创', '道', '玄', '意', '灵']),
      grade: grade, hidden: false, root: 'wuxing',
      desc: '你于' + XG.cfg.REALMS[p.realmIdx].name + '之境观天悟道，融百家残篇自成一诀。世间独此一份。',
      eff: eff, profMax: 1000, fragNeed: 0,
      custom: true, born: p.realmIdx, ct: Date.now(),
      getHint: '自创功法，仅此一家。',
    };
    const g = st();
    g.custom.push(def);
    g.owned[id] = { lv: 1, prof: 0 }; // 自创即习得，可装备可升级
    bump('gongfa_create');
    pushNews('player', '开宗立派！你自创' + grade + '品功法《' + name + '》，自成一家之言。', grade >= 8 ? 2 : 1);
    XG.bus.emit('codex:new', { kind: 'gongfa', id: id });
    checkBonds(true);
    invalidate();
    dirty();
    return { ok: true, def: def };
  }

  function forgetCustom(gfId) {
    const g = st();
    let idx = -1;
    for (let i = 0; i < g.custom.length; i++) if (g.custom[i].id === gfId) { idx = i; break; }
    if (idx < 0) return { ok: false, msg: '仅自创功法可遗忘' };
    const def = g.custom[idx];
    g.custom.splice(idx, 1);
    delete g.owned[gfId];
    const ai = g.active.indexOf(gfId);
    if (ai >= 0) g.active.splice(ai, 1);
    bump('gongfa_forget');
    pushNews('system', '你将自创功法《' + def.name + '》付之一炬，从此江湖再无此诀。', 0);
    invalidate();
    dirty();
    return { ok: true };
  }

  // ============ UI 视图模型 ============
  function listGongfa() {
    const g = st();
    const out = [];
    const list = (XG.data.gongfa && XG.data.gongfa.list) || [];
    for (let i = 0; i < list.length; i++) {
      const def = list[i];
      const ow = g.owned[def.id];
      const unlocked = unlockOk(def);
      const full = !!ow && (ow.prof || 0) >= (def.profMax || 1000);
      out.push({
        id: def.id, name: def.name, icon: def.icon, grade: def.grade, hidden: !!def.hidden,
        root: def.root, desc: def.desc, getHint: def.getHint, idx: i,
        fragNeed: def.fragNeed || 0, fragHave: fragOf(def.id),
        unlocked: unlocked,
        visible: !def.hidden || unlocked || !!ow, // 隐藏功法未解锁时 UI 显示 ???
        learned: !!ow, lv: ow ? ow.lv : 0,
        prof: ow ? Math.floor(ow.prof || 0) : 0, profMax: def.profMax || 1000, profFull: full,
        active: g.active.indexOf(def.id) >= 0,
        learnable: !ow && unlocked && fragOf(def.id) >= (def.fragNeed || 0),
        upCost: ow ? upCost(def.id) : Infinity,
        effPerLv: def.eff, effLines: effLines(def.eff),
        effNow: ow ? effNow(def.id) : null,
        custom: false,
      });
    }
    for (let i = 0; i < g.custom.length; i++) {
      const def = g.custom[i];
      const ow = g.owned[def.id];
      const full = !!ow && (ow.prof || 0) >= (def.profMax || 1000);
      out.push({
        id: def.id, name: def.name, icon: def.icon, grade: def.grade, hidden: false,
        root: def.root, desc: def.desc, getHint: def.getHint, idx: -1,
        fragNeed: 0, fragHave: 0,
        unlocked: true, visible: true,
        learned: !!ow, lv: ow ? ow.lv : 0,
        prof: ow ? Math.floor(ow.prof || 0) : 0, profMax: def.profMax || 1000, profFull: full,
        active: g.active.indexOf(def.id) >= 0,
        learnable: false,
        upCost: ow ? upCost(def.id) : Infinity,
        effPerLv: def.eff, effLines: effLines(def.eff),
        effNow: ow ? effNow(def.id) : null,
        custom: true,
      });
    }
    return out;
  }

  function listBonds() {
    const g = st();
    const bonds = (XG.data.gongfa && XG.data.gongfa.bonds) || [];
    return bonds.map(function (b) {
      return {
        id: b.id, name: b.name, desc: b.desc, eff: b.eff, effLines: effLines(b.eff),
        need: b.need,
        needStatus: b.need.map(function (id) {
          const d = getDef(id);
          return { id: id, name: d ? d.name : id, owned: !!g.owned[id] };
        }),
        active: bondActive(b),
      };
    });
  }

  // ============ 模块协议（契约 §10） ============
  XG.sys.gongfa = {
    id: 'gongfa',

    // 常量暴露（UI 用）
    LV_MAX: LV_MAX, MAX_ACTIVE: MAX_ACTIVE, MAX_CUSTOM: MAX_CUSTOM,
    PROF_PER_SEC: PROF_PER_SEC, PROF_BONUS: PROF_BONUS, CREATE_FRAG_COST: CREATE_FRAG_COST,

    init() {
      const g = st();
      // 自恢复：active 仅保留已习得、定义存在、不重复的 id，上限 4
      const seen = {};
      const na = [];
      for (let i = 0; i < g.active.length; i++) {
        const id = g.active[i];
        if (g.owned[id] && getDef(id) && !seen[id] && na.length < MAX_ACTIVE) {
          seen[id] = 1;
          na.push(id);
        }
      }
      g.active = na;
      // 羁绊播种：已激活的静默标记，避免每次上线重复播报
      checkBonds(false);

      // —— 隐藏功法 5 条件事件订阅（守则 4，防御性判断 payload）——
      XG.bus.on('alch:done', function (p) {
        if (p && p.explode) {
          const gg = st();
          gg.hiddenProg.explode = (gg.hiddenProg.explode || 0) + 1;
          if (condMet('alchemy_explode_10')) unlockByCond('alchemy_explode_10');
        }
      });
      XG.bus.on('tower:clear', function (p) {
        if (p && (p.layer || 0) >= 33) unlockByCond('tower_33');
      });
      XG.bus.on('fellow:gift', function (p) {
        if (p && (p.ouhuang || p.persona === 'ouhuang')) {
          st().hiddenProg.ouhuangGift = 1;
          unlockByCond('fellow_ouhuang_gift');
        }
      });
      XG.bus.on('reincarn:done', function (p) {
        if (!p || (p.count || 1) >= 1) unlockByCond('reincarn_1');
      });
      XG.bus.on('codex:new', function (p) {
        if (p && p.kind === 'pet' && condMet('codex_pet_20')) unlockByCond('codex_pet_20');
      });

      // 兜底：按当前 state 全量校验一次（旧档/轮回后/事件漏发自恢复）
      checkConds();
    },

    tick(dt) {
      gainProf(dt); // 装备中功法熟练度挂机增长
      _acc += dt;
      if (_acc >= 5) { // 每 5s 兜底校验隐藏条件与羁绊（防止事件漏发）
        _acc = 0;
        checkConds();
        checkBonds(true);
      }
    },

    // 离线结算：装备中功法按离线时长补熟练度，圆满者进报告简讯
    offline(dt) {
      if (!dt || dt <= 0) return null;
      const ev = [];
      gainProf(dt, ev);
      return ev.length ? { events: ev } : null;
    },

    // 属性聚合：已装备功法 eff 总和（lv 线性，熟练圆满×1.5）+ 已激活羁绊 eff
    getMods() {
      const g = st();
      const mods = {};
      const add = function (eff, mult) {
        for (const k in eff) mods[k] = (mods[k] || 0) + eff[k] * mult;
      };
      for (let i = 0; i < g.active.length; i++) {
        const id = g.active[i];
        const ow = g.owned[id];
        const def = getDef(id);
        if (!ow || !def || !def.eff) continue;
        const full = (ow.prof || 0) >= (def.profMax || 1000);
        add(def.eff, ow.lv * (full ? PROF_BONUS : 1));
      }
      const bonds = (XG.data.gongfa && XG.data.gongfa.bonds) || [];
      for (let i = 0; i < bonds.length; i++) if (bondActive(bonds[i])) add(bonds[i].eff, 1);
      return mods;
    },

    // 跨系统 API + 查询/操作接口（见文件头 UI 对接面）
    addFrag: addFrag,
    fragOf: fragOf,
    getDef: getDef,
    unlockOk: unlockOk,
    learn: learn,
    upgrade: upgrade,
    upgradeMax: upgradeMax,
    upCost: upCost,
    equip: equip,
    unequip: unequip,
    toggle: toggle,
    effNow: effNow,
    effLines: effLines,
    listGongfa: listGongfa,
    listBonds: listBonds,
    canCreate: canCreate,
    createCustom: createCustom,
    forgetCustom: forgetCustom,
    checkConds: checkConds,
  };
  XG.sysOrder.push('gongfa');
})();
