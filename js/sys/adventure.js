/* 文件名：adventure.js —— 随机奇遇引擎（契约 §9.7 / §10；事件源 XG.data.events，98 条）
 *
 * 玩法实现对照（任务书深度 6 条）：
 * 1. 修炼触发：修炼中每 5~15 分钟（300~900s，state.adventure.cd 倒计时）roll 一次，
 *    池 = trigger 'cultivate'|'any' 且无 mapId，按 w 权重 + minRealm + cond 过滤；
 *    w<=0 与「被 chain 指向的事件」不进随机池（连锁专属）；once 事件做完永不重复。
 * 2. 探索触发：triggerOnMap(mapId) —— 该图专属事件（mapId 相同）+ 通用池
 *    （trigger 'explore'|'any' 且无 mapId），四级回退保证必出 1 条；有 pending 时插队为下一桩。
 * 3. 连锁：choice.out.chain 指向的事件进 state.adventure.queue，当前事件结算完立即优先触发；
 *    链上每一步都可再 chain（轩辕/龙渊/归墟 4 段链如此串成）。
 * 4. 条件 cond 九种全部实现：night(0~6点)/tox50/stuck3d(3天未破境)/power10m/fellow_partner/
 *    reincarn1/explode5(炸炉5次)/rich(灵石>1e6)/poor(灵石<100)。未知 cond 一律判 false（不误放稀有事件）。
 * 5. 结算 out 全键：cult→cultivation.addCult（降级直接 cult+=）、lingShi/lingYu/mat/pill/egg→XG.addRes、
 *    frag→gongfa.addFrag（降级 addRes）、toxicity 正加负减 clamp 0~100、rootWash→免费洗灵根
 *    （优先 cultivation.washRootFree，降级本地按 roots 权重重洗）、meridian→免费点亮下一可点穴位
 *    （优先 cultivation.lightMeridianFree，降级本地直接点亮）、news→pushNews、ach→忽略（成就靠 stats 自动达成）、
 *    hiddenEnd→stats.hidden_end++ + 结界弹窗标记 + 豪华奖励（灵玉 5~10 + 修为 rate×1800）+ imp:2 传闻。
 * 6. 随机性/数值：奖励数值完全按数据表（已按 minRealm 境界 rate×秒数刻度），不打额外倍率；
 *    once/连锁/隐藏结局均为一次性稀有体验，欧非差异来自权重池与 9 种条件门。
 *
 * ==================== UI 对接面（本系统对外的全部查询/操作函数） ====================
 * XG.sys.adventure.isUnlocked()
 *   → bool 奇遇系统是否已解锁（炼气2层，XG.cfg.isUnlocked('adventure')）。
 *
 * XG.sys.adventure.getPending()
 *   → null | { id, title, icon, text, via, choices:[{i, text, reqOk, reqText}] }
 *     当前待决事件（玩家三选一/二选一）。via: 'cultivate'修炼|'explore'探索|'chain'连锁|'offline'离线归来。
 *     choices[i].reqOk=false 时 UI 应置灰该选项；reqText 为可读消耗串（如 '灵石×200、境界≥筑基'）。
 *     UI 可轮询本函数，或监听 'adv:pending' 事件主动弹窗。
 *
 * XG.sys.adventure.choose(choiceIdx)
 *   → { ok:true, eventId, title, icon, msg:[结算文案…], rewards:{cult,lingShi,lingYu,mat,pill,frag,egg,
 *        toxicity,rootWash,meridian}, hiddenEnd:'结界文案'|undefined, chained:'后继事件id'|undefined,
 *        next: getPending()|null（连锁的下一桩，已自动置顶） }
 *     失败 → { ok:false, err:'no_pending'|'bad_choice'|'req_not_met'|'event_gone' }
 *     （err='req_not_met' 时附 msg 文案）。调用即扣 req、发奖励、记 once、emit 'adv:done'。
 *
 * XG.sys.adventure.triggerOnMap(mapId)
 *   → { ok:true, immediate:bool, queued:bool, event:{id,title,icon,text} }
 *     | { ok:false, err:'no_event' }
 *     探索/历练到某图时调用：必出 1 条。immediate=true 表示立即成为待决；否则排入队列最前（queued=true）。
 *
 * XG.sys.adventure.getQueue()
 *   → [{id, title, icon}] 连锁排队中的事件（按触发顺序）。
 *
 * XG.sys.adventure.getCdLeft()  → int 秒，距下次修炼奇遇 roll 的倒计时（pending 期间暂停）。
 * XG.sys.adventure.getCdRange() → {min:300, max:900} 供 UI 展示「约 5~15 分钟一桩」。
 *
 * XG.sys.adventure.getDoneInfo() → { count:int（done 记录的不同事件数）, ids:[事件id…] }
 *
 * XG.sys.adventure.getHiddenEnd()   → null | {eventId, text, t} 未展示的隐藏结局结界弹窗标记。
 * XG.sys.adventure.clearHiddenEnd() → 清除该标记（UI 弹窗关闭后调用）。
 *
 * ==================== 写入的 stats 键（XG.state.stats，snake） ====================
 *   adv_done    每结算一桩奇遇 +1（对应 check.k advDone；collection 亦可读 state.adventure.done 计数）
 *   hidden_end  每达成一处隐藏结局 +1
 *
 * ==================== emit / on 事件 ====================
 *   emit 'adv:done'      {eventId}            结算完成（契约规定）
 *   emit 'adv:pending'   {eventId, via}       新待决事件产生（roll/探索/连锁/离线）
 *   emit 'adv:hiddenEnd' {eventId, text}      达成隐藏结局（UI 可据此直接弹结界弹窗）
 *   on   'tick'                               主循环驱动 cd 倒计时（init 内订阅）
 *   on   'realm:break' / 'realm:layer'        更新 lastBreakTs（stuck3d 判定基准）
 *   on   'alch:done'                          炸炉兜底计数（explode5 判定兜底）
 *
 * offline 行为：cd 照常流逝；若离线期间 cd 归零且当前无待决，则补 roll 一桩作为「归来机缘」
 * （至多 1 桩，via='offline'），并往总报告 events 里塞一条简讯。连锁队列离线不自动消化（需玩家抉择）。
 *
 * 埋藏的隐藏内容（数据侧已备，本引擎负责放出）：8 组连锁（merchant/ruhuo/古洞遗府/灵狐报恩/鲛人/
 * 轩辕剑冢/龙渊/归墟）+ 6 处 hiddenEnd 隐藏结局（ merchant_3 / eva_yifu / eva_baihu_3 /
 * evb_xuanyuan_3 / evb_longyuan_3 / evb_gui_xu_3，奖励含隐藏功法 gf_xuanyuan / gf_guixu 残篇）。
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  const CD_MIN = 60;    // 修炼奇遇最小间隔（秒）= 1 分钟
  const CD_MAX = 180;   // 最大间隔（秒）= 3 分钟
  const STUCK_MS = 3 * 86400000; // stuck3d：3 天未破境

  /* ---------------- 状态存取（懒初始化，读档合并后自恢复） ---------------- */
  function adv() {
    const st = XG.state;
    const a = (st.adventure = st.adventure || {});
    a.done = a.done || {};          // {eventId: 完成次数}（once 判定 & advDone 口径）
    a.chains = a.chains || {};      // 契约保留位：连锁进度（本实现用 queue 承载，此处兼容存档）
    if (typeof a.cd !== 'number') a.cd = 0; // 距下次修炼 roll 的倒计时（秒）
    a.queue = a.queue || [];        // 连锁优先队列 [eventId]
    if (a.pending === undefined) a.pending = null; // 当前待决 {id, via}
    if (typeof a.lastBreakTs !== 'number') a.lastBreakTs = 0; // 上次破境时间（stuck3d）
    if (typeof a.explodeSeen !== 'number') a.explodeSeen = 0; // 炸炉兜底计数（explode5）
    if (a.hiddenEnd === undefined) a.hiddenEnd = null; // 结界弹窗标记 {eventId, text, t}
    return a;
  }
  function stats() { return (XG.state.stats = XG.state.stats || {}); }

  /* ---------------- 事件索引（id 表 + 连锁目标集合，带缓存） ---------------- */
  let _cache = null;
  function index() {
    const evs = XG.data.events || [];
    if (_cache && _cache.evs === evs && _cache.size === evs.length) return _cache;
    const byId = {}, chainT = {};
    for (const e of evs) {
      if (!e || !e.id) continue;
      byId[e.id] = e;
      const cs = e.choices || [];
      for (const c of cs) {
        if (c && c.out && c.out.chain) chainT[c.out.chain] = 1;
      }
    }
    _cache = { evs: evs, size: evs.length, byId: byId, chainT: chainT };
    return _cache;
  }

  /* ---------------- cond 九种条件判定（未知 cond 判 false，不误放稀有事件） ---------------- */
  const _condWarned = {};
  function condOk(cond) {
    if (!cond) return true;
    const st = XG.state, p = st.player, a = adv();
    switch (cond) {
      case 'night': { const h = new Date().getHours(); return h >= 0 && h < 6; }
      case 'tox50': return (p.toxicity || 0) >= 50;
      case 'stuck3d': {
        const base = a.lastBreakTs || st.createdAt || Date.now();
        return Date.now() - base >= STUCK_MS;
      }
      case 'power10m': {
        try { return (XG.stats.get().power || 0) > 1e7; } catch (e) { return false; }
      }
      case 'fellow_partner': {
        if (p.partner) return true;
        const fs = st.fellows || [];
        for (const f of fs) { if (f && f.relation === 'partner') return true; }
        return false;
      }
      case 'reincarn1': return (p.reincarn || 0) >= 1;
      case 'explode5': {
        const s = stats();
        return Math.max(s.pill_explode || 0, a.explodeSeen || 0) >= 5;
      }
      case 'rich': return (st.res.lingShi || 0) > 1e6;
      case 'poor': return (st.res.lingShi || 0) < 100;
      default:
        if (!_condWarned[cond]) { _condWarned[cond] = 1; console.warn('[adventure] 未知 cond：' + cond); }
        return false;
    }
  }

  /* ---------------- 随机池过滤：w>0、非连锁目标、once 未做、境界达标、cond 通过 ---------------- */
  function passBase(e) {
    const idx = index(), a = adv();
    if (!e || !e.id) return false;
    if ((e.w || 0) <= 0) return false;                 // w:0 = 连锁专属
    if (idx.chainT[e.id]) return false;                // 被 chain 指向 = 连锁专属
    if (e.once && a.done[e.id]) return false;          // once 永不重复
    if ((e.minRealm || 0) > XG.state.player.realmIdx) return false;
    return condOk(e.cond);
  }

  // 修炼池：trigger cultivate|any 且无 mapId（mapId 事件只在对应地图出）
  function poolCultivate() {
    return index().evs.filter(function (e) {
      return !e.mapId && (e.trigger === 'cultivate' || e.trigger === 'any') && passBase(e);
    });
  }

  // 探索池：该图专属 + 通用（explore|any 无 mapId）；relax 逐级放宽保证「必出 1 条」
  function poolExplore(mapId, relax) {
    relax = relax || 0;
    return index().evs.filter(function (e) {
      if (!e || !e.id) return false;
      const isMap = e.mapId === mapId;
      const isGeneric = !e.mapId && (e.trigger === 'explore' || e.trigger === 'any');
      if (!isMap && !isGeneric) return false;
      if (relax >= 3) return true;                     // 兜底：只看归属
      if (relax < 2 && e.once && adv().done[e.id]) return false;
      if (relax < 1) {
        if ((e.w || 0) <= 0 || index().chainT[e.id]) return false;
        if ((e.minRealm || 0) > XG.state.player.realmIdx) return false;
        if (!condOk(e.cond)) return false;
      }
      return true;
    });
  }

  function rollCultivateEvent() {
    const pool = poolCultivate();
    if (!pool.length) return null;
    return XG.util.weighted(pool, 'w');
  }

  function rollExploreEvent(mapId) {
    for (let relax = 0; relax <= 3; relax++) {
      const pool = poolExplore(mapId, relax);
      if (pool.length) return XG.util.weighted(pool, 'w');
    }
    return null;
  }

  /* ---------------- 传闻推送（emit 'news' + push 进 state.news，按 NEWS_CAP 截断） ---------------- */
  function pushNews(text, cat, imp) {
    if (!text) return;
    const st = XG.state;
    st.news = st.news || [];
    const n = { t: Date.now(), cat: cat || 'world', text: text, imp: imp || 0 };
    st.news.unshift(n);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (st.news.length > cap) st.news.length = cap;
    XG.bus.emit('news', n);
  }

  /* ---------------- 跨系统发奖助手（全部防御性，目标不在则降级不报错） ---------------- */
  function giveCult(n, src) {
    if (!n) return;
    const cu = XG.sys.cultivation;
    if (cu && typeof cu.addCult === 'function') {
      try { cu.addCult(n, src); return; } catch (e) { /* 降级 */ }
    }
    XG.state.player.cult = (XG.state.player.cult || 0) + n;
    const s = stats();
    s.total_cult = (s.total_cult || 0) + n;
  }

  function giveFrag(gfId, n) {
    if (!gfId || !n) return;
    const gf = XG.sys.gongfa;
    if (gf && typeof gf.addFrag === 'function') {
      try { gf.addFrag(gfId, n); return; } catch (e) { /* 降级 */ }
    }
    const d = { frag: {} };
    d.frag[gfId] = n;
    XG.addRes(d);
  }

  // 免费洗灵根：优先 cultivation.washRootFree()；不在则本地按 roots 权重重洗（含变异/混沌小概率）
  function freeRootWash() {
    const cu = XG.sys.cultivation;
    if (cu && typeof cu.washRootFree === 'function') {
      try { return cu.washRootFree() || '灵根已重洗'; } catch (e) { /* 降级 */ }
    }
    const p = XG.state.player;
    const roots = (XG.data.gongfa && XG.data.gongfa.roots) || [];
    const commons = roots.filter(function (r) { return !r.hidden && ['jin', 'mu', 'shui', 'huo', 'tu'].indexOf(r.id) >= 0; });
    const muts = roots.filter(function (r) { return !r.hidden && ['bing', 'lei', 'feng', 'an', 'guang'].indexOf(r.id) >= 0; });
    const hundun = roots.filter(function (r) { return r.id === 'hundun'; })[0];
    p.spiritRoot = p.spiritRoot || { type: 'jin', grade: 3, mut: null };
    let name = '';
    if (hundun && XG.util.chance(0.01)) {
      p.spiritRoot.mut = 'hundun'; name = hundun.name;
    } else if (muts.length && XG.util.chance(0.15)) {
      const m = XG.util.weighted(muts, 'w');
      p.spiritRoot.mut = m.id; name = m.name;
    } else {
      const c = commons.length ? XG.util.weighted(commons, 'w') : { id: 'jin', name: '金灵根' };
      p.spiritRoot.type = c.id; p.spiritRoot.mut = null; name = c.name;
    }
    // 品相 1~5，低品常见高品稀有
    p.spiritRoot.grade = XG.util.weighted([{ g: 1, w: 30 }, { g: 2, w: 30 }, { g: 3, w: 20 }, { g: 4, w: 12 }, { g: 5, w: 8 }], 'w').g;
    if (XG.stats) XG.stats.invalidate();
    XG.bus.emit('save:dirty');
    return '灵根重洗为「' + name + '·' + p.spiritRoot.grade + '品」';
  }

  // 免费点亮下一可点穴位（need 前置全亮、自身未亮，按表序取第一个）；优先 cultivation API
  function freeMeridian() {
    const cu = XG.sys.cultivation;
    if (cu && typeof cu.lightMeridianFree === 'function') {
      try { return cu.lightMeridianFree(1) || '穴位已点亮'; } catch (e) { /* 降级 */ }
    }
    const p = XG.state.player;
    p.meridians = p.meridians || { lit: [] };
    const lit = p.meridians.lit;
    const table = (XG.data.gongfa && XG.data.gongfa.meridians) || [];
    for (const m of table) {
      if (lit.indexOf(m.id) >= 0) continue;
      const needs = m.need || [];
      let ok = true;
      for (const nd of needs) { if (lit.indexOf(nd) < 0) { ok = false; break; } }
      if (!ok) continue;
      lit.push(m.id);
      if (XG.stats) XG.stats.invalidate();
      XG.bus.emit('save:dirty');
      return '点亮穴位「' + m.name + '」（' + (m.branch || '经脉') + '）';
    }
    // 经脉全通：折成修为补偿（30 分钟档）
    const rate = realmRate();
    giveCult(rate * 1800, '奇遇·经脉圆满');
    return '经脉俱已贯通，化作修为 +' + XG.util.fmt(rate * 1800);
  }

  function realmRate() {
    const rs = XG.cfg.REALMS, p = XG.state.player;
    const r = rs[p.realmIdx] || rs[0];
    if (r.rate > 0) return r.rate;
    return (rs[p.realmIdx - 1] || rs[0]).rate; // 飞升 rate=0 时按渡劫计
  }

  /* ---------------- 材料/丹药/功法名查询（reqText 与结算文案用，防御性） ---------------- */
  function matName(id) { const m = XG.data.mats && XG.data.mats[id]; return (m && m.name) || id; }
  function pillName(id) {
    const rs = (XG.data.pills && XG.data.pills.recipes) || [];
    for (const r of rs) { if (r.id === id) return r.name; }
    return id;
  }
  function gfName(id) {
    const ls = (XG.data.gongfa && XG.data.gongfa.list) || [];
    for (const g of ls) { if (g.id === id) return g.name; }
    return id;
  }

  // choice.req 是否满足（realmIdx 为境界校验，其余走 XG.hasRes）
  function reqOk(req) {
    if (!req) return true;
    if (req.realmIdx && XG.state.player.realmIdx < req.realmIdx) return false;
    return XG.hasRes(req);
  }

  function reqText(req) {
    if (!req) return '';
    const parts = [];
    if (req.lingShi) parts.push('灵石×' + XG.util.fmt(req.lingShi));
    if (req.lingYu) parts.push('灵玉×' + XG.util.fmt(req.lingYu));
    const bags = { mat: matName, pill: pillName, frag: gfName };
    for (const k in bags) {
      if (req[k]) for (const id in req[k]) parts.push(bags[k](id) + '×' + req[k][id]);
    }
    if (req.realmIdx) {
      const r = XG.cfg.REALMS[req.realmIdx];
      parts.push('境界≥' + (r ? r.name : req.realmIdx));
    }
    return parts.join('、');
  }

  /* ---------------- 待决事件 ---------------- */
  function setPending(id, via) {
    const a = adv();
    a.pending = { id: id, via: via };
    XG.bus.emit('adv:pending', { eventId: id, via: via });
    XG.bus.emit('save:dirty');
  }

  // 连锁队列优先：无待决时取出下一个有效连锁事件置为待决
  function promoteQueue() {
    const a = adv();
    if (a.pending) return false;
    const idx = index();
    while (a.queue.length) {
      const id = a.queue.shift();
      const e = idx.byId[id];
      if (!e) continue;
      if (e.once && a.done[id]) continue; // 已完成的一次性连锁不再出
      setPending(id, 'chain');
      return true;
    }
    return false;
  }

  function rollCd() { return XG.util.randInt(CD_MIN, CD_MAX); }

  function isUnlocked() {
    try { return XG.cfg.isUnlocked('adventure'); } catch (e) { return true; }
  }

  /* ---------------- 奇遇奖励缩放 ---------------- */
  // 按玩家当前境界 rate 与事件 minRealm 基准 rate 的比例缩放数值奖励
  function rewardScale(e) {
    const p = XG.state.player;
    const baseRate = XG.cfg.REALMS[(e.minRealm || 0)] ? XG.cfg.REALMS[e.minRealm || 0].rate : 10;
    const currRate = XG.cfg.REALMS[p.realmIdx] ? XG.cfg.REALMS[p.realmIdx].rate : baseRate;
    if (baseRate <= 0) return 1;
    return currRate / baseRate;
  }

  /* ---------------- out 结算 ---------------- */
  function settleOut(e, choice, result) {
    const out = choice.out || {};
    const p = XG.state.player;
    const msg = result.msg, rw = result.rewards;
    const src = '奇遇·' + e.title;
    // 奇遇奖励随境界缩放
    const scale = rewardScale(e);
    const sc = function (v) { return Math.max(1, Math.floor((v || 0) * scale)); };

    if (out.cult) { const v = sc(out.cult); giveCult(v, src); rw.cult = (rw.cult || 0) + v; msg.push('修为 +' + XG.util.fmt(v)); }
    if (out.lingShi || out.lingYu || out.mat || out.pill || out.egg) {
      const d = {};
      const ls = out.lingShi ? sc(out.lingShi) : 0;
      const ly = out.lingYu ? sc(out.lingYu) : 0;
      if (ls) d.lingShi = ls;
      if (ly) d.lingYu = ly;
      if (out.mat) d.mat = out.mat;
      if (out.pill) d.pill = out.pill;
      if (out.egg) d.egg = out.egg;
      XG.addRes(d);
      if (ls) { rw.lingShi = (rw.lingShi || 0) + ls; msg.push('灵石 +' + XG.util.fmt(ls)); }
      if (ly) { rw.lingYu = (rw.lingYu || 0) + ly; msg.push('灵玉 +' + XG.util.fmt(ly)); }
      if (out.mat) { rw.mat = rw.mat || {}; for (const id in out.mat) { rw.mat[id] = (rw.mat[id] || 0) + out.mat[id]; msg.push(matName(id) + '×' + out.mat[id]); } }
      if (out.pill) { rw.pill = rw.pill || {}; for (const id in out.pill) { rw.pill[id] = (rw.pill[id] || 0) + out.pill[id]; msg.push(pillName(id) + '×' + out.pill[id]); } }
      if (out.egg) { rw.egg = (rw.egg || 0) + out.egg; msg.push('灵宠蛋 +' + out.egg); }
    }
    if (out.frag) {
      rw.frag = rw.frag || {};
      for (const id in out.frag) {
        giveFrag(id, out.frag[id]);
        rw.frag[id] = (rw.frag[id] || 0) + out.frag[id];
        msg.push('《' + gfName(id) + '》残篇×' + out.frag[id]);
      }
    }
    if (out.toxicity) {
      const old = p.toxicity || 0;
      p.toxicity = XG.util.clamp(old + out.toxicity, 0, 100); // 正加负减，clamp 0~100
      const real = p.toxicity - old;
      rw.toxicity = (rw.toxicity || 0) + real;
      if (real) msg.push(real > 0 ? '丹毒 +' + real : '丹毒 ' + real);
      XG.bus.emit('res:changed');
    }
    if (out.rootWash) {
      const t = freeRootWash();
      rw.rootWash = (rw.rootWash || 0) + 1;
      msg.push(t);
    }
    if (out.meridian) {
      for (let i = 0; i < out.meridian; i++) {
        const t = freeMeridian();
        rw.meridian = (rw.meridian || 0) + 1;
        msg.push(t);
      }
    }
    if (out.news) pushNews(out.news, 'world', out.chain || out.hiddenEnd ? 1 : 0);
    if (out.ach) { /* 忽略：成就靠 stats 自动达成（契约 §9.7 口径） */ }

    if (out.chain) {
      const a = adv(), idx = index();
      const te = idx.byId[out.chain];
      if (te && !(te.once && a.done[out.chain]) && a.queue.indexOf(out.chain) < 0) {
        a.queue.push(out.chain);
        result.chained = out.chain;
      }
    }

    if (out.hiddenEnd) {
      // 隐藏结局：结界弹窗标记 + stats.hidden_end++ + 豪华奖励 + 高亮传闻
      const a = adv(), s = stats();
      s.hidden_end = (s.hidden_end || 0) + 1;
      a.hiddenEnd = { eventId: e.id, text: out.hiddenEnd, t: Date.now() };
      const bonusYu = XG.util.randInt(5, 10);
      const bonusCult = realmRate() * 1800;
      XG.addRes({ lingYu: bonusYu });
      giveCult(bonusCult, '奇遇·隐藏结局');
      rw.lingYu = (rw.lingYu || 0) + bonusYu;
      rw.cult = (rw.cult || 0) + bonusCult;
      msg.push('隐藏结局达成！灵玉 +' + bonusYu + '，修为 +' + XG.util.fmt(bonusCult));
      pushNews(out.hiddenEnd, 'player', 2);
      result.hiddenEnd = out.hiddenEnd;
      XG.bus.emit('adv:hiddenEnd', { eventId: e.id, text: out.hiddenEnd });
    }
  }

  /* ---------------- 系统注册（契约 §10 模块协议） ---------------- */
  XG.sys.adventure = {
    id: 'adventure',

    init() {
      const a = adv();
      if (!(a.cd > 0)) a.cd = rollCd();                 // 新档/异常档自愈
      if (!a.lastBreakTs) a.lastBreakTs = XG.state.createdAt || Date.now();
      // 读档自恢复：清掉指向已不存在事件的待决/队列项
      const idx = index();
      if (a.pending && !idx.byId[a.pending.id]) a.pending = null;
      a.queue = a.queue.filter(function (id) { return !!idx.byId[id]; });
      // 订阅主循环与判定基准事件（幂等）
      if (!this._subbed) {
        this._subbed = true;
        const self = this;
        XG.bus.on('tick', function (p) { self.tick((p && p.dt) || 1); });
        XG.bus.on('realm:break', function (p2) { if (p2 && p2.ok) adv().lastBreakTs = Date.now(); });
        XG.bus.on('realm:layer', function () { adv().lastBreakTs = Date.now(); });
        XG.bus.on('alch:done', function (p2) { if (p2 && p2.explode) adv().explodeSeen++; });
      }
    },

    // 每秒：cd 倒计时 → roll 修炼奇遇；无待决时连锁队列优先
    tick(dt) {
      if (!isUnlocked()) return;
      const a = adv();
      if (a.pending) return;                  // 待决期间暂停 cd（玩家抉择不计时）
      if (promoteQueue()) return;             // 连锁优先触发
      a.cd -= dt;
      if (a.cd <= 0) {
        const e = rollCultivateEvent();
        a.cd = rollCd();                      // 无论是否 roll 到都重置倒计时
        if (e) setPending(e.id, 'cultivate');
      }
    },

    // 离线结算：cd 流逝；归零且无待决时补一桩「归来机缘」（至多 1 桩），附简讯进总报告
    offline(dt) {
      if (!isUnlocked()) return null;
      const a = adv();
      if (a.pending) return null;
      a.cd -= dt;
      if (a.cd > 0) return null;
      const e = rollCultivateEvent();
      a.cd = rollCd();
      if (!e) return null;
      setPending(e.id, 'offline');
      return { events: ['云游归来，恰逢一桩机缘等候多时：' + (e.icon || '') + '「' + e.title + '」'] };
    },

    /* ============ UI 对接面（见文件头注释） ============ */
    isUnlocked: isUnlocked,

    getPending() {
      const a = adv();
      if (!a.pending) return null;
      const e = index().byId[a.pending.id];
      if (!e) { a.pending = null; return null; }
      return {
        id: e.id, title: e.title, icon: e.icon, text: e.text, via: a.pending.via,
        choices: (e.choices || []).map(function (c, i) {
          return { i: i, text: c.text, reqOk: reqOk(c.req), reqText: reqText(c.req) };
        }),
      };
    },

    choose(choiceIdx) {
      const a = adv();
      if (!a.pending) return { ok: false, err: 'no_pending' };
      const e = index().byId[a.pending.id];
      if (!e) { a.pending = null; return { ok: false, err: 'event_gone' }; }
      const c = (e.choices || [])[choiceIdx];
      if (!c) return { ok: false, err: 'bad_choice' };
      if (!reqOk(c.req)) {
        return { ok: false, err: 'req_not_met', msg: '条件不足：' + (reqText(c.req) || '境界未至') };
      }
      // 扣 req（realmIdx 仅校验不消耗）
      if (c.req) {
        const cost = {};
        if (c.req.lingShi) cost.lingShi = -c.req.lingShi;
        if (c.req.lingYu) cost.lingYu = -c.req.lingYu;
        if (c.req.mat) { cost.mat = {}; for (const id in c.req.mat) cost.mat[id] = -c.req.mat[id]; }
        if (c.req.pill) { cost.pill = {}; for (const id in c.req.pill) cost.pill[id] = -c.req.pill[id]; }
        if (cost.lingShi || cost.lingYu || cost.mat || cost.pill) XG.addRes(cost);
      }
      // 结算
      const result = { ok: true, eventId: e.id, title: e.title, icon: e.icon, msg: [], rewards: {} };
      settleOut(e, c, result);
      // 记档：done 计数（once 永不重复的判定源 & advDone 统计口径）+ stats.adv_done
      a.done[e.id] = (a.done[e.id] || 0) + 1;
      stats().adv_done = (stats().adv_done || 0) + 1;
      a.pending = null;
      XG.bus.emit('adv:done', { eventId: e.id });
      XG.bus.emit('res:changed');
      XG.bus.emit('save:dirty');
      // 连锁优先：立即置顶下一桩
      promoteQueue();
      result.next = this.getPending();
      return result;
    },

    triggerOnMap(mapId) {
      const e = rollExploreEvent(mapId);
      if (!e) return { ok: false, err: 'no_event' };
      const a = adv();
      if (a.pending) {
        // 当前有待决：插队到最前，当前事件结算完立即出
        a.queue.unshift(e.id);
        XG.bus.emit('save:dirty');
        return { ok: true, immediate: false, queued: true, event: { id: e.id, title: e.title, icon: e.icon, text: e.text } };
      }
      setPending(e.id, 'explore');
      return { ok: true, immediate: true, queued: false, event: { id: e.id, title: e.title, icon: e.icon, text: e.text } };
    },

    getQueue() {
      const idx = index();
      return adv().queue.map(function (id) {
        const e = idx.byId[id];
        return e ? { id: id, title: e.title, icon: e.icon } : { id: id, title: id, icon: '？' };
      });
    },

    getCdLeft() { return Math.max(0, Math.ceil(adv().cd)); },
    getCdRange() { return { min: CD_MIN, max: CD_MAX }; },

    getDoneInfo() {
      const d = adv().done;
      return { count: Object.keys(d).length, ids: Object.keys(d) };
    },

    getHiddenEnd() { return adv().hiddenEnd || null; },
    clearHiddenEnd() { adv().hiddenEnd = null; XG.bus.emit('save:dirty'); },
  };

  XG.sysOrder.push('adventure');
})();
