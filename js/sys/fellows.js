/* fellows.js：AI 虚拟道友系统（契约 §10/§11，本游戏灵魂）——纯逻辑，无 DOM 依赖
 *
 * ============================ UI 对接面（供 ui 层调用的全部接口） ============================
 * 查询：
 *   XG.sys.fellows.list()            → [{uid,name,persona,personaName,school,schoolName,schoolIcon,
 *                                        rootName,realmIdx,layer,realmName,state,favor,relation,
 *                                        power,reincarn,canDiscuss,lastNews}]  按好感>境界排序
 *   XG.sys.fellows.get(uid)          → 单个道友详情（同上结构 + talent/stateUntil/gifts/metAt/lastNews），无则 null
 *   XG.sys.fellows.count()           → {total, friend, rival, partner}
 *   XG.sys.fellows.listHelp()        → [{hid,uid,name,text,kind,id,n,itemName,icon,done}]  当前一波求助（done:0待处理 1已助 -1已拒）
 *   XG.sys.fellows.market()          → {unlocked, refreshAt, nextInSec, slots:[{sid,uid,sellerName,persona,
 *                                        kind,id,baseId,grade,n,name,icon,price,cur,curName,sold,line}]}  坊市货栏
 *   XG.sys.fellows.partnerInfo()     → null | {uid,name,realmName,canDual}  道侣状态
 *   XG.sys.fellows.canDiscuss(uid)   → bool
 * 操作（均返回 {ok, msg, ...}，ok=false 时 msg 为失败原因，可直接 toast）：
 *   XG.sys.fellows.discuss(uid)      → {ok,msg,text,cult,favor}      论道（每友10分钟冷却：+修为+好感+性格文案）
 *   XG.sys.fellows.discussAll()      → {ok,msg,count,cult}           一键论道（与全部冷却完毕的道友依次煮茶）
 *   XG.sys.fellows.satisfyHelp(hid)  → {ok,msg,text,gift}            满足求助（扣资源，好感+10+回赠）
 *   XG.sys.fellows.refuseHelp(hid)   → {ok,msg,text}                 拒绝求助（refuse 池文案，无惩罚）
 *   XG.sys.fellows.buyMarket(sid)    → {ok,msg}                      坊市购买（耗灵石/灵玉，每格限量）
 *   XG.sys.fellows.refreshMarket()   → {ok,msg}                      灵玉×5 立即刷新坊市
 *   XG.sys.fellows.becomePartner(uid)→ {ok,msg}                      结缘道侣（好感=100，每日限1次操作）
 *   XG.sys.fellows.dualCultivate()   → {ok,msg,cult}                 每小时双修一次（修为加成）
 * 属性聚合：getMods() → 道侣在世时 {cultRatePct:10}
 *
 * ============================ 写入的 stats 键（XG.state.stats，snake） ============================
 *   news_count        本系统产生的传闻条数（check.k: newsCount）
 *   help_fellow       累计帮助道友次数（check.k: helpFellow）
 *   fellow_favor_max  道友好感历史峰值（check.k: fellowFavorMax）
 *   fellow_partner    已结道侣（0/1）（check.k: fellowPartner）
 *   discuss_count     累计论道次数（修行录「结交道友」目标统计口径）
 *
 * ============================ 事件 ============================
 * emit：fellow:gift {uid,persona,ouhuang}（回赠礼；ouhuang=true 即 3% 隐藏功法机缘，gongfa 系统据此解锁 gf_hongyun）
 *       fellow:helped {uid} ｜ fellow:partner {uid} ｜ fellow:news {uid,text,imp,t}（契约 §4 道友大事件）
 *       news（经内部 pushNews，同时落 state.news）
 * 订阅：realm:break {realmIdx,ok}（玩家高光播报+挚友贺礼）｜ forge:done {uid,grade}（grade4 神装播报）
 *       tower:clear {layer}（33 倍数层播报）
 *
 * ============================ offline 行为 ============================
 * offline(dt)：按 5 分钟一步循环模拟全部道友成长/突破/卡关/渡劫/转世/随机动态；
 *   传闻不逐条入 state.news，压缩为「总条数+≤3 条要闻样本」经报告片段 fellowNews 返回（契约 §8 弹窗展示）；
 *   坊市按实际流逝时间补刷新；周报/关系判定同步推进。
 *
 * ============================ 隐藏内容 ============================
 *   欧皇道友求助被满足后有 3% 概率赠出隐藏功法机缘（emit fellow:gift{ouhuang:true} → gf_hongyun 鸿运通宝录）；
 *   欧皇坊市货栏 8% 概率刷出超一阶的货而售价不变（world.marketRules 坊市传闻）；
 *   彩蛋名道友（韩立/叶凡等）好感满可被成就统计器识别（fellowEggFavorMax）。
 * ===================================================================================== */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  /* ---------------- 常量 ---------------- */
  const STEP_SEC = 300;               // 成长步进：游戏内 5 分钟一步（online/offline 同路径）
  const STEP_NEWS_MAX = 3;            // 每步最多播报 2~3 条（采样克制）
  const STUCK_H = [6, 48];            // 卡关时长区间（小时）
  const SURGE_SEC = 7200;             // 顿悟（surge）持续 2 小时
  const SURGE_MULT = 3;               // 顿悟期间成长倍率
  const FAVOR_FRIEND = 60;            // 挚友门槛
  const FAVOR_PARTNER = 100;          // 道侣门槛
  const RIVAL_CAP = 3;                // 宿敌数量上限
  const MARKET_MANUAL_COST = 5;       // 灵玉立即刷新坊市
  const HELP_ROLL_MS = 4 * 3600000;   // 求助重摇间隔（每 4 小时一波）
  const HELP_PER_ROLL = [1, 3];       // 每波求助道友数区间
  const DISCUSS_CD_MS = 600000;       // 论道冷却（每友 10 分钟）
  const DUAL_CD_MS = 3600000;         // 双修冷却（1 小时）
  const OUHUANG_GIFT_P = 0.03;        // 欧皇回赠隐藏功法概率
  const OUHUANG_SLOT_P = 0.08;        // 欧皇货栏超阶概率
  const HILIGHT_GAP_MS = 45000;       // 玩家高光播报最小间隔

  /* ---------------- 内部小工具 ---------------- */
  function U() { return XG.util; }
  function S() { return XG.state; }
  function stats() { XG.state.stats = XG.state.stats || {}; return XG.state.stats; }
  function bumpStat(k, n) { const s = stats(); s[k] = (s[k] || 0) + (n == null ? 1 : n); }
  function maxStat(k, v) { const s = stats(); if (!(s[k] >= v)) s[k] = v; }
  function dayStr() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  // 传闻统一出口：落 state.news（NEWS_CAP 截断）+ 广播；fellow 类同步发 fellow:news（契约 §4）
  function pushNews(cat, text, imp, uid) {
    const n = { t: Date.now(), cat: cat, text: text, imp: imp || 0 };
    const arr = S().news = S().news || [];
    arr.unshift(n);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (arr.length > cap) arr.length = cap;
    bumpStat('news_count');
    XG.bus.emit('news', n);
    if (cat === 'fellow') XG.bus.emit('fellow:news', { uid: uid || '', text: text, imp: imp || 0, t: n.t });
  }

  // 给其他系统发修为（守则 §5：防御性降级）
  function giveCult(n, src) {
    n = Math.max(0, Math.floor(n));
    if (!n) return 0;
    const c = XG.sys.cultivation;
    if (c && typeof c.addCult === 'function') c.addCult(n, src);
    else { S().player.cult = (S().player.cult || 0) + n; XG.bus.emit('res:changed'); }
    return n;
  }

  /* ---------------- 数据查询 ---------------- */
  function personas() { return (XG.data.fellows && XG.data.fellows.personas) || []; }
  function schools() { return (XG.data.fellows && XG.data.fellows.schools) || []; }
  function lines() { return (XG.data.fellows && XG.data.fellows.lines) || {}; }
  function roots() { return (XG.data.gongfa && XG.data.gongfa.roots) || []; }
  function personaOf(f) { const ps = personas(); for (const p of ps) if (p.id === f.persona) return p; return ps[0] || { id: '?', name: '未知', growth: [1, 1], favorGain: 1, pricePct: 1, giftW: 1, w: 1 }; }
  function schoolOf(f) { const ss = schools(); for (const s of ss) if (s.id === f.school) return s; return ss[0] || { id: '?', name: '散修', icon: '修' }; }
  function rootOf(f) { const rs = roots(); for (const r of rs) if (r.id === f.root) return r; return { id: f.root, name: '灵根', mult: 1, w: 1 }; }
  function realmName(realmIdx, layer) {
    const r = XG.cfg.REALMS[realmIdx] || XG.cfg.REALMS[0];
    return r.name + (realmIdx >= XG.cfg.REALMS.length - 1 ? '' : layer + '层');
  }
  function findFellow(uid) {
    const fs = S().fellows || [];
    for (const f of fs) if (f.uid === uid) return f;
    return null;
  }

  // 文案占位符替换：{name} {realm} {item} {map} {layer}
  function fill(tpl, f, extra) {
    const u = U();
    let s = String(tpl || '');
    const map = extra && extra.map ? extra.map : u.pick(mapNames());
    const item = extra && extra.item ? extra.item : u.pick(itemNames());
    s = s.split('{name}').join(extra && extra.name ? extra.name : (f && f.name ? f.name : '某位道友'));
    s = s.split('{realm}').join(extra && extra.realm ? extra.realm : (f ? realmName(f.realmIdx, f.layer) : '此境'));
    s = s.split('{layer}').join(String(extra && extra.layer ? extra.layer : (f ? f.layer : 1)));
    s = s.split('{map}').join(map);
    s = s.split('{item}').join(item);
    return s;
  }

  // 惰性构建 {map}/{item} 占位符素材池
  let _mapNames = null, _itemNames = null;
  function mapNames() {
    if (!_mapNames) {
      _mapNames = ((XG.data.world && XG.data.world.maps) || []).map(function (m) { return m.name; });
      if (!_mapNames.length) _mapNames = ['青云山'];
    }
    return _mapNames;
  }
  function itemNames() {
    if (!_itemNames) {
      _itemNames = [];
      const eq = (XG.data.equips && XG.data.equips.bases) || [];
      for (const b of eq) if (b.grade >= 2) _itemNames.push(b.name);
      const mats = XG.data.mats || {};
      for (const id in mats) if (mats[id].grade >= 2) _itemNames.push(mats[id].name);
      const pills = (XG.data.pills && XG.data.pills.recipes) || [];
      for (const p of pills) if (!p.hidden && p.grade >= 3) _itemNames.push(p.name);
      if (!_itemNames.length) _itemNames = ['上古玉简'];
    }
    return _itemNames;
  }

  // 道友战力估算（境界基值 × 层数系数 × 天赋，供宿敌匹配/论剑参考）
  function fellowPower(f) {
    const base = XG.cfg.REALM_BASE[f.realmIdx] || XG.cfg.REALM_BASE[0];
    const k = (1 + 0.12 * (f.layer - 1)) * (0.6 + 0.4 * f.talent) * (rootOf(f).mult || 1);
    return XG.cfg.POWER({ atk: base.atk * k, def: base.def * k, hp: base.hp * k, spd: base.spd * k });
  }

  /* ---------------- 生成（契约 §11） ---------------- */
  function genFellow(schoolId, usedNames) {
    const u = U();
    const p = S().player;
    const persona = u.weighted(personas());
    let name = '';
    for (let i = 0; i < 20; i++) { name = XG.data.genName(); if (!usedNames[name]) break; }
    usedNames[name] = 1;
    const g = persona.growth || [1, 1];
    const realmIdx = u.clamp(p.realmIdx + u.randInt(-2, 2), 0, XG.cfg.REALMS.length - 2); // 围绕玩家±2大境界（渡劫止，免生成即飞升）
    const layer = u.randInt(1, XG.cfg.LAYERS);
    return {
      uid: u.uid(), name: name,
      persona: persona.id, school: schoolId, root: u.weighted(roots()).id,
      realmIdx: realmIdx, layer: layer,
      cult: Math.floor(XG.cfg.layerCost(realmIdx, layer) * u.rand(0, 0.8)),
      talent: u.clamp(u.rand(g[0], g[1]), 0.5, 2.0),
      state: 'normal', stateUntil: 0, alive: true,
      favor: u.randInt(0, 15), relation: 'stranger', metAt: Date.now(),
      lastNews: '', gifts: 0, reincarn: 0, breakFails: 0, hasPartner: false,
    };
  }

  function ensureFellows() {
    const st = S();
    st.fellows = st.fellows || [];
    if (st.fellows.length) { migrate(); return; }
    const u = U();
    const range = XG.cfg.FELLOW_COUNT || [30, 50];
    const n = u.randInt(range[0], range[1]);
    const ss = u.shuffle(schools().map(function (s) { return s.id; })); // 流派均布：洗牌后轮流派发
    const usedNames = {};
    for (let i = 0; i < n; i++) st.fellows.push(genFellow(ss[i % ss.length], usedNames));
  }

  // 旧档字段补齐（自恢复）
  function migrate() {
    for (const f of S().fellows) {
      if (f.cult == null) f.cult = 0;
      if (!f.state) f.state = 'normal';
      if (f.stateUntil == null) f.stateUntil = 0;
      if (f.alive == null) f.alive = true;
      if (f.favor == null) f.favor = 0;
      if (!f.relation) f.relation = 'stranger';
      if (f.reincarn == null) f.reincarn = 0;
      if (f.breakFails == null) f.breakFails = 0;
      if (f.gifts == null) f.gifts = 0;
      if (f.lastNews == null) f.lastNews = '';
      if (!f.metAt) f.metAt = Date.now();
    }
  }

  /* ---------------- 成长模拟（10 分钟一步） ---------------- */
  // 单道友一步成长；newsBuf 收集候选动态 {uid, cat, text, imp}
  function stepFellow(f, now, newsBuf) {
    if (!f.alive) return;
    const u = U();
    // 卡关中：龟速修行，到期自解
    if (f.state === 'stuck') {
      if (now >= f.stateUntil) { f.state = 'normal'; f.breakFails = 0; }
      else { f.cult += XG.cfg.REALMS[f.realmIdx].rate * STEP_SEC * 0.05; return; }
    }
    // 顿悟（surge）状态到期回落
    const surge = f.state === 'surge' && now < f.stateUntil;
    if (f.state === 'surge' && !surge) f.state = 'normal';
    // 飞升（末境）不再增长
    if (f.realmIdx >= XG.cfg.REALMS.length - 1) return;

    const realm = XG.cfg.REALMS[f.realmIdx];
    const gain = realm.rate * (1 + 0.12 * (f.layer - 1)) * STEP_SEC
      * f.talent * (rootOf(f).mult || 1) * (surge ? SURGE_MULT : 1) * u.rand(0.85, 1.15);
    f.cult += gain;

    // 小境界：修为满即升（可连升，静默不播报）
    while (f.layer < XG.cfg.LAYERS && f.cult >= XG.cfg.layerCost(f.realmIdx, f.layer)) {
      f.cult -= XG.cfg.layerCost(f.realmIdx, f.layer);
      f.layer++;
    }
    // 大境界：满层且修为足 → 按概率突破
    if (f.layer >= XG.cfg.LAYERS && f.cult >= XG.cfg.layerCost(f.realmIdx, XG.cfg.LAYERS)) {
      tryBreakthrough(f, now, newsBuf);
    }
  }

  function tryBreakthrough(f, now, newsBuf) {
    const u = U();
    const dyn = lines().dynamic || {};
    const trib = f.realmIdx >= 7; // 大乘→渡劫、渡劫→飞升 视为渡天劫
    const persona = personaOf(f);
    let rate = XG.cfg.REALMS[f.realmIdx].breakRate + (f.breakFails || 0) * XG.cfg.BREAK_FAIL_BONUS;
    if (persona.id === 'ouhuang') rate += 0.05; // 气运之子
    if (u.chance(Math.min(0.95, rate))) {
      // 突破成功
      f.realmIdx++; f.layer = 1; f.cult = 0; f.breakFails = 0; f.state = 'normal';
      const text = fill(u.pick(dyn['突破'] || ['{name}破境成功。']), f);
      newsBuf.push({ uid: f.uid, cat: '突破', text: text, imp: f.realmIdx >= 7 ? 1 : 0 });
      f.lastNews = { k: '突破', text: text, t: now };
    } else {
      // 突破失败 → 卡关一段时间；渡劫失败另有文案，小概率转世重来
      f.breakFails = (f.breakFails || 0) + 1;
      f.state = 'stuck';
      f.stateUntil = now + u.randInt(STUCK_H[0], STUCK_H[1]) * 3600 * 1000;
      if (trib) {
        const text = fill(u.pick(dyn['渡劫失败'] || ['{name}渡劫失败。']), f);
        newsBuf.push({ uid: f.uid, cat: '渡劫失败', text: text, imp: 1 });
        f.lastNews = { k: '渡劫失败', text: text, t: now };
        if (u.chance(0.15)) { // 兵解转世：境界归零，天赋重掷
          f.reincarn++;
          f.realmIdx = 0; f.layer = 1; f.cult = 0; f.breakFails = 0; f.state = 'normal'; f.stateUntil = 0;
          const g = persona.growth || [1, 1];
          f.talent = u.clamp(u.rand(g[0], g[1]) * u.rand(0.9, 1.3), 0.5, 2.0); // 转世或得更好根骨
          const t2 = fill(u.pick(dyn['转世'] || ['{name}转世重修。']), f);
          newsBuf.push({ uid: f.uid, cat: '转世', text: t2, imp: 1 });
          f.lastNews = { k: '转世', text: t2, t: now };
        }
      } else {
        const text = fill(u.pick(dyn['卡关'] || ['{name}困于瓶颈。']), f);
        newsBuf.push({ uid: f.uid, cat: '卡关', text: text, imp: 0 });
        f.lastNews = { k: '卡关', text: text, t: now };
      }
    }
  }

  // 单道友一步随机动态（至宝/炸炉/结道侣/顿悟/隐居/比武；小概率，全局采样克制在 doStep 收口）
  function stepEvent(f, now, newsBuf) {
    if (!f.alive || f.state === 'stuck') return;
    const u = U();
    const persona = personaOf(f);
    let p = 0.012;                       // 基础每步 1.2%
    if (persona.id === 'ouhuang') p = 0.03;   // 欧皇事儿多
    if (persona.id === 'hualao') p = 0.018;   // 话痨爱出动静
    if (!u.chance(p)) return;
    const dyn = lines().dynamic || {};
    const cat = u.weighted([
      { k: '获得至宝', w: persona.id === 'ouhuang' ? 30 : 12 },
      { k: '炸炉', w: f.school === 'dan' ? 22 : 10 },
      { k: '结为道侣', w: f.hasPartner ? 0 : 8 },
      { k: '顿悟', w: 12 },
      { k: '隐居', w: 5 },
      { k: '比武', w: 14 },
    ], 'w');
    if (!cat) return;
    if (cat.k === '结为道侣') f.hasPartner = true;
    if (cat.k === '顿悟') { f.state = 'surge'; f.stateUntil = now + SURGE_SEC * 1000; }
    const text = fill(u.pick(dyn[cat.k] || ['{name}有了新动静。']), f);
    newsBuf.push({ uid: f.uid, cat: cat.k, text: text, imp: 0 });
    f.lastNews = { k: cat.k, text: text, t: now };
  }

  // 一步总控：成长+事件+关系判定+周报+道侣剧情；offlineBuf 为 null 时在线直推，否则压缩收集
  function doStep(now, offlineBuf) {
    const u = U();
    const buf = [];
    const fs = S().fellows || [];
    for (const f of fs) { stepFellow(f, now, buf); stepEvent(f, now, buf); }
    checkRelations(now, buf);
    weeklyCheck(now, buf);
    partnerStory(now, buf);

    if (!offlineBuf) {
      // 在线：采样 2~3 条直推传闻流
      const n = Math.min(buf.length, u.randInt(2, STEP_NEWS_MAX));
      const picked = u.pickN(buf, n);
      for (const it of picked) pushNews('fellow', it.text, it.imp, it.uid);
    } else {
      // 离线：只记总条数与要闻样本（重要的优先）
      offlineBuf.count += buf.length;
      buf.sort(function (a, b) { return b.imp - a.imp; });
      for (const it of buf) {
        if (offlineBuf.samples.length >= 3) break;
        offlineBuf.samples.push(it.text);
      }
    }
  }

  /* ---------------- 关系：挚友/宿敌 ---------------- */
  function setRelation(f, rel) { f.relation = rel; }

  function checkRelations(now, buf) {
    const u = U();
    const st = S();
    const p = st.player;
    let rivals = 0;
    for (const f of st.fellows) if (f.relation === 'rival') rivals++;
    let myPower = 0;
    try { myPower = XG.stats.get().power || 0; } catch (e) { myPower = 0; }
    for (const f of st.fellows) {
      if (!f.alive) continue;
      // 挚友：好感 ≥60 自动晋级
      if (f.relation === 'stranger' && f.favor >= FAVOR_FRIEND) {
        setRelation(f, 'friend');
        buf.push({ uid: f.uid, cat: '挚友', text: f.name + '与你相交莫逆，自此以挚友相称，修行路上互为奥援。', imp: 1 });
        continue;
      }
      // 宿敌：境界差≤1 且战力相近、非挚友/道侣，自动标记
      if (f.relation === 'stranger' && rivals < RIVAL_CAP
        && Math.abs(f.realmIdx - p.realmIdx) <= 1 && f.favor < FAVOR_FRIEND && myPower > 0) {
        const ratio = fellowPower(f) / myPower;
        if (ratio > 0.3 && ratio < 3 && u.chance(0.02)) {
          setRelation(f, 'rival'); rivals++;
          buf.push({ uid: f.uid, cat: '宿敌', text: f.name + '近日处处与你针锋相对，坊间已将你们并称为一时瑜亮。', imp: 1 });
        }
      }
      // 宿敌境界拉开两档以上 → 恩怨自解
      if (f.relation === 'rival' && Math.abs(f.realmIdx - p.realmIdx) > 2) {
        setRelation(f, 'stranger');
      }
    }
  }

  // 每周对比宿敌与玩家的境界进度，排行互超即发战书（war 池）
  function weeklyCheck(now, buf) {
    const st = S();
    const wid = U().weekId();
    st.fellowWeek = st.fellowWeek || { wid: wid, player: 0, rivals: {} };
    const wk = st.fellowWeek;
    const score = function (realmIdx, layer) { return realmIdx * XG.cfg.LAYERS + layer; };
    const pScore = score(st.player.realmIdx, st.player.layer);
    if (wk.wid !== wid) {
      // 周轮换：找出互超的宿敌发战书
      const u = U();
      const warPool = lines().war || [];
      for (const f of st.fellows) {
        if (f.relation !== 'rival' || !f.alive) continue;
        const prevR = wk.rivals[f.uid] || 0;
        const curR = score(f.realmIdx, f.layer);
        const overtaken = (prevR <= wk.player && curR > pScore) || (prevR >= wk.player && curR < pScore);
        if (overtaken && warPool.length) {
          const tpl = u.pick(warPool);
          buf.push({
            uid: f.uid, cat: '战书', imp: 1,
            text: fill(tpl, f, { name: st.player.name, realm: realmName(st.player.realmIdx, st.player.layer) }),
          });
        }
      }
      // 新周快照
      wk.wid = wid; wk.player = pScore; wk.rivals = {};
      for (const f of st.fellows) if (f.relation === 'rival') wk.rivals[f.uid] = score(f.realmIdx, f.layer);
    } else {
      // 周内持续刷新快照（保持可比性）
      wk.player = pScore;
      for (const f of st.fellows) if (f.relation === 'rival') wk.rivals[f.uid] = score(f.realmIdx, f.layer);
    }
  }

  /* ---------------- 玩家高光（订阅玩家事件，playerHilight 池统一播报） ---------------- */
  function playerHilight(extra) {
    const now = Date.now();
    if (now - (playerHilight._last || 0) < HILIGHT_GAP_MS) return;
    playerHilight._last = now;
    const p = S().player;
    const pool = lines().playerHilight || [];
    if (!pool.length) return;
    const text = fill(U().pick(pool), null, {
      name: p.name, realm: realmName(p.realmIdx, p.layer),
    });
    pushNews('player', text, 1);
  }

  // 玩家突破大境界成功：挚友/道侣按 giftW 概率携礼来贺（congrats 池）
  function friendsCongrat() {
    const u = U();
    const p = S().player;
    const pool = lines().congrats || [];
    for (const f of S().fellows) {
      if (!f.alive || (f.relation !== 'friend' && f.relation !== 'partner')) continue;
      const persona = personaOf(f);
      if (!u.chance(Math.min(0.85, 0.45 * (persona.giftW || 1)))) continue;
      const gift = rollGift(f);
      const text = fill(u.pick(pool), f, { realm: realmName(p.realmIdx, p.layer) })
        + (gift ? '（贺礼：' + gift.desc + '）' : '');
      pushNews('fellow', text, 1, f.uid);
      if (gift) { gift.apply(); f.gifts++; }
    }
  }

  function subscribe() {
    if (subscribe._done) return;
    subscribe._done = true;
    XG.bus.on('realm:break', function (e) {
      if (!e || !e.ok) return;
      playerHilight();
      friendsCongrat();
    });
    XG.bus.on('forge:done', function (e) {
      if (e && e.grade >= 4) playerHilight(); // grade4 神装出炉
    });
    XG.bus.on('tower:clear', function (e) {
      if (e && e.layer > 0 && e.layer % 33 === 0) playerHilight(); // 33 倍数层（隐藏 BOSS 层）
    });
  }

  /* ---------------- 礼物生成（回赠/贺礼共用） ---------------- */
  // 返回 {desc, apply()}；量级与玩家境界挂钩（数值纪律：参照境界 rate × 秒数）
  function rollGift(f) {
    const u = U();
    const p = S().player;
    const kind = u.weighted([{ k: 'mat', w: 40 }, { k: 'lingShi', w: 35 }, { k: 'pill', w: 25 }], 'w');
    if (kind.k === 'lingShi') {
      const n = Math.round((p.realmIdx + 1) * u.randInt(300, 1200));
      return { desc: '灵石×' + U().fmt(n), apply: function () { XG.addRes({ lingShi: n }); } };
    }
    if (kind.k === 'pill') {
      const pool = ((XG.data.pills && XG.data.pills.recipes) || []).filter(function (r) {
        return !r.hidden && r.grade <= Math.min(9, p.realmIdx + 2);
      });
      if (pool.length) {
        const r = u.pick(pool);
        const n = u.randInt(1, 2);
        return { desc: r.name + '×' + n, apply: function () { XG.addRes({ pill: { [r.id]: n } }); } };
      }
    }
    // 材料兜底（含 mats 池为空时的灵石降级）
    const g = u.clamp(Math.round(p.realmIdx / 2) + u.randInt(0, 1), 0, 4);
    const pool = [];
    const mats = XG.data.mats || {};
    for (const id in mats) if (mats[id].grade === g) pool.push(id);
    if (!pool.length) for (const id in mats) pool.push(id);
    if (pool.length) {
      const id = u.pick(pool);
      const n = u.randInt(1, 3);
      return { desc: (mats[id] ? mats[id].name : id) + '×' + n, apply: function () { XG.addRes({ mat: { [id]: n } }); } };
    }
    const n2 = Math.round((p.realmIdx + 1) * u.randInt(200, 600));
    return { desc: '灵石×' + U().fmt(n2), apply: function () { XG.addRes({ lingShi: n2 }); } };
  }

  /* ---------------- 求助（每 4 小时一波，1~3 名道友） ---------------- */
  function dailyHelp() {
    const d = S().daily = S().daily || {};
    if (!d.help || !d.help.at || Date.now() - d.help.at >= HELP_ROLL_MS || !Array.isArray(d.help.list)) rollDailyHelp();
    return S().daily.help;
  }

  function rollDailyHelp() {
    const u = U();
    const d = S().daily;
    d.help = { at: Date.now(), list: [] };
    const n = u.randInt(HELP_PER_ROLL[0], HELP_PER_ROLL[1]);
    if (!n || !(S().fellows || []).length) return;
    const p = S().player;
    const helpPool = lines().help || [];
    const cands = u.pickN(S().fellows.filter(function (f) { return f.alive; }), n);
    for (const f of cands) {
      const kind = u.chance(0.5) ? 'mat' : 'pill';
      let id = '', itemName = '', cnt = 1;
      if (kind === 'mat') {
        const g = u.clamp(Math.round(p.realmIdx / 2) + u.randInt(-1, 1), 0, 4);
        const pool = [];
        const mats = XG.data.mats || {};
        for (const mid in mats) if (mats[mid].grade === g) pool.push(mid);
        if (!pool.length) for (const mid in mats) pool.push(mid);
        if (!pool.length) continue;
        id = u.pick(pool);
        itemName = mats[id].name;
        cnt = u.randInt(1, 3);
      } else {
        const pool = ((XG.data.pills && XG.data.pills.recipes) || []).filter(function (r) {
          return !r.hidden && r.grade <= Math.min(9, p.realmIdx + 1);
        });
        if (!pool.length) continue;
        const r = u.pick(pool);
        id = r.id; itemName = r.name;
        cnt = u.randInt(1, 2);
      }
      d.help.list.push({
        hid: u.uid(), uid: f.uid, kind: kind, id: id, n: cnt,
        itemName: itemName,
        icon: kind === 'pill' ? ((XG.data.pills.recipes.find(function (x) { return x.id === id; }) || {}).icon || '丹') : ((XG.data.mats[id] || {}).icon || '材'),
        text: fill(u.pick(helpPool), f),
        done: 0,
      });
      pushNews('fellow', f.name + '似乎有求于你，不妨去道友录中看看。', 0, f.uid);
    }
  }

  /* ---------------- 坊市（筑基5层解锁，10 分钟刷新 6 栏） ---------------- */
  function marketRules() { return (XG.data.world && XG.data.world.marketRules) || { refreshSec: 600, slots: 6, priceByPersona: {}, priceByRelation: {}, stock: { kindW: {}, basePrice: {}, currencyW: {} } }; }
  function marketSt() {
    const st = S();
    st.fellowMarket = st.fellowMarket || { at: 0, slots: [] };
    return st.fellowMarket;
  }
  function marketUnlocked() { return XG.cfg.isUnlocked('market'); }

  function genMarket(now) {
    const u = U();
    const mr = marketRules();
    const st = marketSt();
    const p = S().player;
    const fs = (S().fellows || []).filter(function (f) { return f.alive; });
    st.at = now || Date.now();
    st.slots = [];
    if (!fs.length) return;
    const bp = mr.stock.basePrice || {};
    const pills = (XG.data.pills && XG.data.pills.recipes) || [];
    const bases = (XG.data.equips && XG.data.equips.bases) || [];
    const gfs = (XG.data.gongfa && XG.data.gongfa.list) || [];
    const mats = XG.data.mats || {};
    const sellPool = (XG.data.fellows.marketLines && XG.data.fellows.marketLines.sell) || [];

    for (let i = 0; i < (mr.slots || 6); i++) {
      const seller = u.pick(fs);
      const persona = personaOf(seller);
      let kind = u.weighted([
        { k: 'pill', w: mr.stock.kindW.pill || 30 }, { k: 'mat', w: mr.stock.kindW.mat || 30 },
        { k: 'equip', w: mr.stock.kindW.equip || 20 }, { k: 'frag', w: mr.stock.kindW.frag || 15 },
        { k: 'egg', w: mr.stock.kindW.egg || 5 },
      ], 'w').k;
      // 炼器未开（坊市已提前至筑基5层）时不挂装备栏，降级为材料，免玩家买到只能折矿的货
      if (kind === 'equip' && !(XG.cfg && XG.cfg.isUnlocked && XG.cfg.isUnlocked('forge'))) kind = 'mat';
      let slot = { sid: u.uid(), uid: seller.uid, kind: kind, n: 1, sold: false, grade: 0, id: '', baseId: '' };

      if (kind === 'pill') {
        const pool = pills.filter(function (r) { return !r.hidden && r.grade <= Math.min(9, p.realmIdx + 2); });
        if (!pool.length) continue;
        const r = u.pick(pool);
        slot.id = r.id; slot.name = r.name; slot.icon = r.icon; slot.grade = r.grade;
        slot.n = u.randInt(1, 2);
        slot.price = (bp.pillPerGrade || 200) * r.grade;
      } else if (kind === 'mat') {
        const g = u.clamp(Math.round(p.realmIdx / 2) + u.randInt(-1, 1), 0, 4);
        const pool = [];
        for (const id in mats) if (mats[id].grade === g) pool.push(id);
        if (!pool.length) for (const id in mats) pool.push(id);
        if (!pool.length) continue;
        const id = u.pick(pool);
        slot.id = id; slot.name = mats[id].name; slot.icon = mats[id].icon; slot.grade = g;
        slot.n = u.randInt(1, 5);
        slot.price = bp['matG' + g] || 100;
      } else if (kind === 'equip') {
        const g = u.clamp(Math.round(p.realmIdx / 2), 0, 3);
        const pool = bases.filter(function (b) { return b.grade === g; });
        if (!pool.length) continue;
        const b = u.pick(pool);
        slot.baseId = b.id; slot.id = b.id; slot.name = b.name; slot.icon = b.icon; slot.grade = g;
        slot.price = (bp.equipPerGrade || 800) * Math.max(1, g);
      } else if (kind === 'frag') {
        const pool = gfs.filter(function (g2) { return !g2.hidden && !g2.cond && g2.grade <= Math.min(9, p.realmIdx + 1); });
        if (!pool.length) continue;
        const g2 = u.pick(pool);
        slot.id = g2.id; slot.name = g2.name + '残篇'; slot.icon = g2.icon; slot.grade = g2.grade;
        slot.n = u.randInt(1, 3);
        slot.price = (bp.fragPerGrade || 1500) * g2.grade;
      } else { // egg
        slot.id = 'egg'; slot.name = '灵宠蛋'; slot.icon = '🥚'; slot.grade = 1;
        slot.price = bp.egg || 3e4;
      }

      // 欧皇货栏：小概率超一阶而售价不变（坊市传闻）
      if (persona.id === 'ouhuang' && u.chance(OUHUANG_SLOT_P) && slot.kind !== 'egg') {
        if (slot.kind === 'equip') {
          const up = bases.filter(function (b) { return b.grade === slot.grade + 1; });
          if (up.length) { const b = u.pick(up); slot.baseId = b.id; slot.id = b.id; slot.name = b.name; slot.icon = b.icon; slot.grade++; }
        } else if (slot.kind === 'pill') {
          const up = pills.filter(function (r) { return !r.hidden && r.grade === slot.grade + 1; });
          if (up.length) { const r = u.pick(up); slot.id = r.id; slot.name = r.name; slot.icon = r.icon; slot.grade++; }
        } else if (slot.kind === 'mat') {
          const up = [];
          for (const id in mats) if (mats[id].grade === slot.grade + 1) up.push(id);
          if (up.length) { const id = u.pick(up); slot.id = id; slot.name = mats[id].name; slot.icon = mats[id].icon; slot.grade++; }
        }
      }

      // 售价 = 基准 × 性格 pricePct × 关系折让；货币按权重（约两成灵玉标价）
      const rel = mr.priceByRelation[seller.relation] != null ? mr.priceByRelation[seller.relation] : 1;
      let price = slot.price * (mr.priceByPersona[seller.persona] || persona.pricePct || 1) * rel;
      // 轮回天赋/转世身份坊市折扣（reincarn.getMods 输出、stats.calc 透传键 marketDiscPct；
      // 防御性缺省 0；下限保护最多 7 折，防叠加跌破成本）
      let discPct = 0;
      try { discPct = (XG.stats && XG.stats.get().marketDiscPct) || 0; } catch (e) { discPct = 0; }
      if (!isFinite(discPct)) discPct = 0;
      price *= Math.max(0.7, 1 - discPct / 100);
      const cur = u.weighted([
        { k: 'lingShi', w: (mr.stock.currencyW && mr.stock.currencyW.lingShi) || 8 },
        { k: 'lingYu', w: (mr.stock.currencyW && mr.stock.currencyW.lingYu) || 2 },
      ], 'w').k;
      slot.cur = cur;
      slot.price = cur === 'lingYu' ? Math.max(1, Math.round(price / 500)) : Math.max(1, Math.round(price));
      slot.line = sellPool.length ? fill(u.pick(sellPool), seller, { item: slot.name }) : '';
      st.slots.push(slot);
    }
  }

  /* ---------------- 道侣专属剧情 news 系列 ---------------- */
  const PARTNER_STORY = [
    '洞房花烛夜，{name}与你剪烛西窗，共誓大道：他日飞升，同去同归。',
    '{name}将洞府重新布置了一番，檐下新挂两盏鸳鸯灯，日子过得有了烟火气。',
    '有好事者编了段《神仙眷侣传》在坊市传唱，说的正是你与{name}。',
  ];
  function partnerStory(now, buf) {
    const st = S();
    const s = st.fellowStory;
    if (!s || !s.uid || s.stage >= PARTNER_STORY.length || now < s.nextAt) return;
    const f = findFellow(s.uid);
    if (!f || !f.alive) { st.fellowStory = null; return; }
    buf.push({
      uid: f.uid, cat: '道侣', imp: 1,
      text: PARTNER_STORY[s.stage].split('{name}').join(f.name),
    });
    s.stage++;
    s.nextAt = now + 86400000; // 每日一折
  }

  /* ---------------- 系统注册 ---------------- */
  XG.sys.fellows = {
    id: 'fellows',
    _acc: 0,

    init() {
      try {
        ensureFellows();
        marketSt();
        S().fellowWeek = S().fellowWeek || { wid: U().weekId(), player: 0, rivals: {} };
        dailyHelp(); // 仅跨天/缺档才重摇（曾误用 rollDailyHelp：每次加载都清空重摇，致「有求于你」传闻与求助列表脱节）
        if (marketUnlocked() && !marketSt().slots.length) genMarket(Date.now());
        subscribe();
      } catch (e) {
        console.error('[fellows] init 失败', e);
      }
    },

    // 主循环每秒：累计满 10 分钟走一步（online 与 offline 同路径）
    tick(dt) {
      // 求助到点重摇（dailyHelp 内部按 4 小时间隔判定）
      dailyHelp();
      // 坊市到点刷新
      if (marketUnlocked()) {
        const mr = marketRules();
        const st = marketSt();
        if (!st.slots.length || Date.now() - st.at >= (mr.refreshSec || 600) * 1000) genMarket(Date.now());
      }
      // 成长步进
      this._acc += dt;
      let guard = 0;
      while (this._acc >= STEP_SEC && guard < 100) {
        this._acc -= STEP_SEC;
        doStep(Date.now(), null);
        guard++;
      }
    },

    // 离线结算：按 10 分钟一步循环，传闻压缩为摘要+总条数（契约 §8 报告片段）
    offline(dt) {
      const steps = Math.floor(dt / STEP_SEC);
      const buf = { count: 0, samples: [] };
      const now = Date.now();
      for (let i = 0; i < steps; i++) doStep(now, buf);
      // 坊市按流逝时间补刷新
      if (marketUnlocked()) {
        const mr = marketRules();
        if (now - marketSt().at >= (mr.refreshSec || 600) * 1000) genMarket(now);
      }
      if (!steps || !buf.count) return null;
      const fellowNews = ['闭关这些时日，道友圈共传出 ' + buf.count + ' 桩动静，最引人侧目的有：'];
      for (const s of buf.samples) fellowNews.push('· ' + s);
      return { fellowNews: fellowNews, fellowEventCount: buf.count };
    },

    // 道侣在世：永久 cultRatePct+10（契约 §10 fellows 条目）
    getMods() {
      const uid = S().player && S().player.partner;
      if (!uid) return {};
      const f = findFellow(uid);
      if (!f || !f.alive || f.relation !== 'partner') return {};
      return { cultRatePct: 10 };
    },

    /* ================= UI 对接面 ================= */

    list() {
      const u = U();
      const fs = (S().fellows || []).slice();
      fs.sort(function (a, b) {
        const ra = a.relation === 'partner' ? 3 : a.relation === 'friend' ? 2 : a.relation === 'rival' ? 1 : 0;
        const rb = b.relation === 'partner' ? 3 : b.relation === 'friend' ? 2 : b.relation === 'rival' ? 1 : 0;
        if (ra !== rb) return rb - ra;
        if (b.favor !== a.favor) return b.favor - a.favor;
        return (b.realmIdx * 10 + b.layer) - (a.realmIdx * 10 + a.layer);
      });
      const self = this;
      return fs.map(function (f) { return self._view(f, u); });
    },

    _view(f, u) {
      const persona = personaOf(f), school = schoolOf(f);
      return {
        uid: f.uid, name: f.name,
        persona: f.persona, personaName: persona.name, personaDesc: persona.desc,
        school: f.school, schoolName: school.name, schoolIcon: school.icon,
        root: f.root, rootName: rootOf(f).name,
        realmIdx: f.realmIdx, layer: f.layer, realmName: realmName(f.realmIdx, f.layer),
        cultPct: XG.cfg.layerCost(f.realmIdx, f.layer) > 0 && isFinite(XG.cfg.layerCost(f.realmIdx, f.layer))
          ? Math.min(100, Math.floor(f.cult / XG.cfg.layerCost(f.realmIdx, f.layer) * 100)) : 100,
        state: f.state, favor: f.favor, relation: f.relation,
        power: Math.round(fellowPower(f)), reincarn: f.reincarn,
        lastNews: f.lastNews || '',
        canDiscuss: this.canDiscuss(f.uid),
      };
    },

    get(uid) {
      const f = findFellow(uid);
      if (!f) return null;
      const v = this._view(f, U());
      v.talent = f.talent;
      v.stateUntil = f.stateUntil;
      v.gifts = f.gifts;
      v.metAt = f.metAt;
      return v;
    },

    count() {
      const r = { total: 0, friend: 0, rival: 0, partner: 0 };
      for (const f of (S().fellows || [])) {
        r.total++;
        if (f.relation === 'friend') r.friend++;
        else if (f.relation === 'rival') r.rival++;
        else if (f.relation === 'partner') r.partner++;
      }
      return r;
    },

    canDiscuss(uid) {
      const f = findFellow(uid);
      if (!f || !f.alive) return false;
      const d = S().daily || {};
      return !(d.discussAt && d.discussAt[uid] > Date.now());
    },

    // 论道：每友 10 分钟冷却；+修为（对方境界越高越多）+好感（×性格 favorGain）；性格池文案+最近动态呼应
    discuss(uid) {
      const f = findFellow(uid);
      if (!f || !f.alive) return { ok: false, msg: '查无此人。' };
      if (!this.canDiscuss(uid)) return { ok: false, msg: f.name + '正在静思，盏茶后再论。' };
      const u = U();
      const d = S().daily = S().daily || {};
      d.discussAt = d.discussAt || {};
      d.discussAt[uid] = Date.now() + DISCUSS_CD_MS;

      const persona = personaOf(f);
      const cultBase = XG.cfg.REALMS[f.realmIdx].rate * (1 + 0.12 * (f.layer - 1));
      const cult = giveCult(cultBase * u.randInt(300, 900), '与' + f.name + '论道');
      const favorAdd = u.clamp(Math.round(u.rand(2, 4) * (persona.favorGain || 1)), 1, 8);
      f.favor = u.clamp(f.favor + favorAdd, 0, 100);
      maxStat('fellow_favor_max', f.favor);
      bumpStat('discuss_count'); // 论道累计（修行录「结交道友」目标统计口径）

      const pool = (lines().discuss || {})[f.persona] || [];
      let text = pool.length ? fill(u.pick(pool), f) : '「今日论道，受益匪浅。」';
      if (f.lastNews && f.lastNews.k && u.chance(0.6)) {
        text += '\n「前番闻你' + f.lastNews.k + '之事，可有什么心得，说与我听听？」';
      }
      return { ok: true, msg: '与' + f.name + '论道一番，修为+' + u.fmt(cult) + '，好感+' + favorAdd, text: text, cult: cult, favor: f.favor };
    },

    // 一键论道：与全部冷却完毕的道友依次煮茶，汇总收益（契约 quick 操作口径）
    discussAll() {
      const fs = (S().fellows || []).filter(function (f) { return f.alive; });
      let count = 0, cult = 0;
      const names = [];
      const self = this;
      fs.forEach(function (f) {
        if (!self.canDiscuss(f.uid)) return;
        const r = self.discuss(f.uid);
        if (r && r.ok) {
          count++;
          cult += r.cult || 0;
          if (names.length < 3) names.push(f.name);
        }
      });
      if (!count) return { ok: false, msg: '诸友皆在静思，盏茶后再来。' };
      return {
        ok: true, count: count, cult: cult,
        msg: '与 ' + names.join('、') + (count > 3 ? ' 等 ' : ' 共 ') + count + ' 位道友煮茶论道，修为+' + U().fmt(cult) + '。',
      };
    },

    listHelp() {
      const h = dailyHelp();
      const out = [];
      for (const it of h.list) {
        const f = findFellow(it.uid);
        out.push({
          hid: it.hid, uid: it.uid, name: f ? f.name : '故人', text: it.text,
          kind: it.kind, id: it.id, n: it.n, itemName: it.itemName, icon: it.icon, done: it.done,
        });
      }
      return out;
    },

    // 满足求助：扣资源 → 好感+10 + 回赠（thanks 池+礼物）；欧皇 3% 赠隐藏功法机缘
    satisfyHelp(hid) {
      const h = dailyHelp();
      let req = null;
      for (const it of h.list) if (it.hid === hid) { req = it; break; }
      if (!req) return { ok: false, msg: '这桩求助已不在了。' };
      if (req.done !== 0) return { ok: false, msg: '这桩求助已经了结过了。' };
      const f = findFellow(req.uid);
      if (!f || !f.alive) return { ok: false, msg: '对方已云游远去。' };
      const cost = req.kind === 'pill' ? { pill: { [req.id]: req.n } } : { mat: { [req.id]: req.n } };
      if (!XG.hasRes(cost)) return { ok: false, msg: req.itemName + '×' + req.n + ' 不足，爱莫能助。' };
      XG.addRes(req.kind === 'pill' ? { pill: { [req.id]: -req.n } } : { mat: { [req.id]: -req.n } });
      req.done = 1;

      const u = U();
      f.favor = u.clamp(f.favor + 10, 0, 100);
      maxStat('fellow_favor_max', f.favor);
      bumpStat('help_fellow');
      XG.bus.emit('fellow:helped', { uid: f.uid });

      const persona = personaOf(f);
      let text = fill(u.pick(lines().thanks || ['「多谢道友！」']), f, { item: req.itemName });
      let giftDesc = '';
      // 回赠：按性格 giftW 概率附礼
      if (u.chance(Math.min(0.95, 0.6 * (persona.giftW || 1)))) {
        const gift = rollGift(f);
        gift.apply();
        f.gifts++;
        giftDesc = gift.desc;
        XG.bus.emit('fellow:gift', { uid: f.uid, persona: f.persona, ouhuang: false });
      }
      // 欧皇隐藏机缘：3% 赠隐藏功法（gongfa 系统监听 fellow:gift{ouhuang:true} 解锁 gf_hongyun）
      let ouhuang = false;
      if (persona.id === 'ouhuang' && u.chance(OUHUANG_GIFT_P)) {
        ouhuang = true;
        XG.bus.emit('fellow:gift', { uid: f.uid, persona: f.persona, ouhuang: true });
        const bonus = u.randInt(5, 15);
        XG.addRes({ lingYu: bonus });
        giftDesc += (giftDesc ? '、' : '') + '灵玉×' + bonus;
        text += '\n「这个你收好——」' + f.name + '神神秘秘地塞来一卷古册，册上五个古篆：鸿运通宝录。';
        pushNews('fellow', f.name + '赠予你一卷疑似上古传承的古册，坊市为之轰动！', 2, f.uid);
      }
      return {
        ok: true, msg: '相助' + f.name + '，好感+10' + (giftDesc ? '，获回赠：' + giftDesc : ''),
        text: text, gift: giftDesc ? { desc: giftDesc, ouhuang: ouhuang } : null,
      };
    },

    // 拒绝求助：refuse 池文案，无任何惩罚
    refuseHelp(hid) {
      const h = dailyHelp();
      let req = null;
      for (const it of h.list) if (it.hid === hid) { req = it; break; }
      if (!req) return { ok: false, msg: '这桩求助已不在了。' };
      if (req.done !== 0) return { ok: false, msg: '这桩求助已经了结过了。' };
      req.done = -1;
      const f = findFellow(req.uid);
      const text = fill(U().pick(lines().refuse || ['「无妨。」']), f || { name: '对方' });
      return { ok: true, msg: '已婉拒' + (f ? f.name : '对方') + '的求助。', text: text };
    },

    /* -------- 坊市 -------- */
    market() {
      const st = marketSt();
      const mr = marketRules();
      const now = Date.now();
      return {
        unlocked: marketUnlocked(),
        refreshAt: st.at,
        nextInSec: Math.max(0, Math.ceil((st.at + (mr.refreshSec || 600) * 1000 - now) / 1000)),
        slots: st.slots.map(function (s) {
          const f = findFellow(s.uid);
          return {
            sid: s.sid, uid: s.uid,
            sellerName: f ? f.name : '行商', persona: f ? f.persona : '',
            kind: s.kind, id: s.id, baseId: s.baseId || '', grade: s.grade,
            n: s.n, name: s.name, icon: s.icon,
            price: s.price, cur: s.cur, curName: s.cur === 'lingYu' ? '灵玉' : '灵石',
            sold: !!s.sold || s.n <= 0, line: s.line || '',
          };
        }),
      };
    },

    buyMarket(sid) {
      if (!marketUnlocked()) return { ok: false, msg: '坊市尚未开启（筑基5层解锁）。' };
      const st = marketSt();
      let slot = null;
      for (const s of st.slots) if (s.sid === sid) { slot = s; break; }
      if (!slot) return { ok: false, msg: '这宗买卖已不在了。' };
      if (slot.sold || slot.n <= 0) return { ok: false, msg: '此货已售罄。' };
      const cost = { [slot.cur]: slot.price };
      if (!XG.hasRes(cost)) return { ok: false, msg: (slot.cur === 'lingYu' ? '灵玉' : '灵石') + '不足。' };
      XG.addRes({ [slot.cur]: -slot.price });

      // 交付
      let got = slot.name;
      if (slot.kind === 'mat') XG.addRes({ mat: { [slot.id]: 1 } });
      else if (slot.kind === 'pill') XG.addRes({ pill: { [slot.id]: 1 } });
      else if (slot.kind === 'egg') XG.addRes({ egg: 1 });
      else if (slot.kind === 'frag') {
        const g = XG.sys.gongfa;
        if (g && typeof g.addFrag === 'function') g.addFrag(slot.id, 1);
        else XG.addRes({ frag: { [slot.id]: 1 } }); // 降级：直接入残篇袋
      } else if (slot.kind === 'equip') {
        const fg = XG.sys.forge;
        if (fg && typeof fg.createEquip === 'function') fg.createEquip(slot.baseId, slot.grade);
        else { // 降级：发等阶矿石
          const oreByGrade = { 0: 'ore_heite', 1: 'ore_xuantie', 2: 'ore_miyin', 3: 'ore_hantie', 4: 'ore_xingchenjin' };
          const oid = oreByGrade[slot.grade] || 'ore_heite';
          XG.addRes({ mat: { [oid]: 2 } });
          got += '（炼器铺未开，折算为材料）';
        }
      }
      slot.n--;
      if (slot.n <= 0) slot.sold = true;
      const f = findFellow(slot.uid);
      if (f) { f.favor = U().clamp(f.favor + 1, 0, 100); } // 照顾生意略增好感
      const dealPool = (XG.data.fellows.marketLines && XG.data.fellows.marketLines.deal) || [];
      const line = dealPool.length ? fill(U().pick(dealPool), f || { name: '卖家' }, { item: slot.name }) : '';
      return { ok: true, msg: '购得 ' + got + '，花费' + slot.price + (slot.cur === 'lingYu' ? '灵玉' : '灵石') + '。' + line };
    },

    // 灵玉×5 立即刷新
    refreshMarket() {
      if (!marketUnlocked()) return { ok: false, msg: '坊市尚未开启（筑基5层解锁）。' };
      if (!XG.hasRes({ lingYu: MARKET_MANUAL_COST })) return { ok: false, msg: '灵玉不足（需×' + MARKET_MANUAL_COST + '）。' };
      XG.addRes({ lingYu: -MARKET_MANUAL_COST });
      genMarket(Date.now());
      return { ok: true, msg: '坊市已换新一批货色。' };
    },

    /* -------- 道侣 -------- */
    partnerInfo() {
      const uid = S().player && S().player.partner;
      if (!uid) return null;
      const f = findFellow(uid);
      if (!f) return null;
      const d = S().daily || {};
      return {
        uid: f.uid, name: f.name, realmName: realmName(f.realmIdx, f.layer),
        favor: f.favor, canDual: !(d.dualAt > Date.now()),
      };
    },

    // 结缘：好感=100，每日限 1 次结缘操作
    becomePartner(uid) {
      const f = findFellow(uid);
      if (!f || !f.alive) return { ok: false, msg: '查无此人。' };
      if (f.relation === 'partner') return { ok: false, msg: '你们已是道侣。' };
      if ((f.favor || 0) < FAVOR_PARTNER) return { ok: false, msg: '好感未满（需' + FAVOR_PARTNER + '），结缘时机未到。' };
      const p = S().player;
      if (p.partner) return { ok: false, msg: '你已有道侣在身，岂可负心。' };
      const d = S().daily = S().daily || {};
      if (d.partner === dayStr()) return { ok: false, msg: '今日已行过结缘之礼，明日再来。' };
      d.partner = dayStr();

      f.relation = 'partner';
      f.favor = FAVOR_PARTNER;
      p.partner = f.uid;
      maxStat('fellow_partner', 1);
      XG.bus.emit('fellow:partner', { uid: f.uid });
      const text = fill(U().pick(lines().partner || ['「往后请多指教。」']), f);
      pushNews('fellow', '你与' + f.name + '结为道侣，红绸十里，仙鹤来贺。' + text, 2, f.uid);
      // 专属剧情 news 系列：即刻起每日一折
      S().fellowStory = { uid: f.uid, stage: 0, nextAt: Date.now() };
      XG.stats.invalidate(); // getMods 变化（cultRatePct+10）
      return { ok: true, msg: '你与' + f.name + '结为道侣！修炼速度永久+10%。', text: text };
    },

    // 双修：每小时一次，修为加成（按道侣境界 rate 折算）
    dualCultivate() {
      const info = this.partnerInfo();
      if (!info) return { ok: false, msg: '你尚无道侣。' };
      if (!info.canDual) return { ok: false, msg: '调息未毕，一个时辰后再修。' };
      const f = findFellow(info.uid);
      const d = S().daily = S().daily || {};
      d.dualAt = Date.now() + DUAL_CD_MS;
      const base = XG.cfg.REALMS[f.realmIdx].rate * (1 + 0.12 * (f.layer - 1));
      const cult = giveCult(base * U().randInt(600, 1800), '与' + f.name + '双修');
      const text = fill(U().pick(lines().partner || ['「双修共进。」']), f);
      return { ok: true, msg: '与' + f.name + '双修一回，修为+' + U().fmt(cult), cult: cult, text: text };
    },
  };

  XG.sysOrder.push('fellows');
})();
