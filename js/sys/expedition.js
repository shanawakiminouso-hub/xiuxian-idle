/* expedition.js：历练探索系统（契约 §10 —— 地图解锁/派遣/结算/隐藏图/一键派遣/离线结算）
 *
 * ============================ 玩法说明 ============================
 * - 系统解锁：cfg.UNLOCKS.expedition（筑基1层）；单图另按 world.js maps[].unlock 境界解锁。
 * - 派遣：选地图 + 1~3 只灵宠 + 时长档（1分/3分/10分钟）。同时最多 3 队：
 *   第 2 队栏位=金丹1层 或 灵玉200，第 3 队栏位=化神1层 或 灵玉500。
 * - 结算规则（对齐 world.js drops 口径注释）：材料按权重抽 3/4/5 种（时长档），
 *   每种 [min,max] 取整 × 时长系数 ×1/×3.2/×6；sp 特产按 min(1, 时长/1h) 概率判定，
 *   得 1/1/2 件（保底不打折）；
 *   pill/frag 按品阶权重抽 1 档，品阶池分别随机取 pills.js 成品丹 / gongfa.js 功法残篇；
 *   eggChance / recipeChance 每次派遣独立判定，并按 min(1, 时长/1h) 缩放
 *   （保持与旧 1h 档相同的时产口径）（丹方→alchemy.learnRandomRecipe，残篇→gongfa.addFrag）。
 * - 战力校验：队伍战力 < map.power 时收益打折，factor = 0.5 + 0.5×(队伍/需求)，夹在 [0.5,1]。
 * - 每次结算必触发 1 次该地图事件：调 adventure.triggerOnMap(mapId)（防御性，可不存在/可抛错）。
 * - 随机性：6% 「鸿运当头」材料翻倍；擅长「财(cai)」的灵宠每只 +10% 材料产出。
 * - 隐藏图：归墟 cond youming_exp_30（幽冥涧派遣满30次 + 大乘1层，自动解锁+news）；
 *   龙渊 cond guixu_bi_5（渡劫1层 + 消耗 sp_guixu_bi×5 献祭，自动解锁+news）。
 * - quickDispatch：自动为空余栏位挑空闲最强 ≤3 宠，选「地图阶位×战力系数」最高的已解锁图派中途档（3分钟）。
 * - 连续历练：setAuto 记忆派遣配置，队伍结算后由 tick 按同配置自动再派（仅在线接续；
 *   离线结算不连派，回到线上后自动恢复）；地图不可达/派遣失败时自动中止并发传闻。
 * - offline：启动时结算所有已到期队伍（未到期按剩余时间跳过，不补扣不加速）。
 *
 * ============================ stats 写入键（XG.state.stats，snake_case） ============================
 *   expedition_count   累计派遣次数（dispatch 成功时 +1）——对应 check.k expeditionCount
 *   expedition_done    累计完成结算次数（settle 时 +1）
 *   youming_exp        幽冥涧累计派遣次数（隐藏图归墟 cond 计数源）
 *   map_unlock         当前已解锁历练地图数（含隐藏，变化时刷新）——对应 check.k mapUnlock
 *   hidden_map_unlock  当前已解锁隐藏地图数——对应 check.k hiddenMapUnlock
 *
 * ============================ emit 事件 ============================
 *   'expedition:done' {mapId}        每支队伍结算完成时（含离线结算）
 *   'news'            news 对象       地图解锁/隐藏图开启/灵宠蛋/鸿运等（同时自 push 进 state.news）
 *   'save:dirty'                     队伍状态变动（派遣/结算/栏位解锁）时
 *
 * ============================ offline 行为 ============================
 *   offline(dt)：逐队检查 endAt，已到期者完整结算（掉落、事件、计数、日志一样不少），
 *   未到期队伍原样保留；返回报告片段 {expedition:{done, items:[结算简讯字符串]}}，无到期队伍返回 null。
 *
 * ============================ UI 对接面（全部查询/操作函数） ============================
 *   isUnlocked() → bool                              系统是否已解锁（筑基1层）
 *   DUR_OPTS → [{sec,label,kinds,mul,sp}]            时长档定义（0=1分/1=3分/2=10分）
 *   getMaps() → [{id,name,icon,desc,hidden,power,sp,dur,unlock,condText,
 *                 unlocked:bool, lockedReason:string|null, dispatchCount:n}]
 *   getMap(mapId) → world.js 地图原始对象 | null
 *   getSlots() → {max, used, list:[{idx, unlocked, lingYu, realmText}]}
 *   unlockSlot(idx) → {ok, msg}                      idx=1|2，境界达标免费，否则扣灵玉
 *   getActive() → [{id,mapId,mapName,icon,petUids,pets:[{uid,name,icon,lv}],
 *                   endAt,dur,durIdx,remainSec,progress(0~1)}]
 *   getIdlePets() → [{uid,name,icon,lv,power}]       未派遣且未被占用的灵宠（按战力降序）
 *   petPower(pet) → number                           单宠战力（防御性估算，见函数注释）
 *   teamPower(petUids) → number
 *   estimateFactor(mapId, petUids) → {factor, teamPower, need}
 *   dispatch(mapId, petUids, durIdx) → {ok, msg, team?}
 *   quickDispatch() → {ok, msg:[...]}                一键派遣（契约 quick 操作口径）
 *   setAuto(cfg|null) → {ok,msg}                     连续历练开关（cfg={mapId, petUids, durIdx}）
 *   getAuto() → null|{mapId, petUids, durIdx, mapName, durLabel}
 *   getLog() → [{t,mapId,mapName,dur,factor,mat,pill,frag,egg,recipe,hongyun}]  最新在前，上限20
 *   checkHidden() → 手动触发隐藏图条件检查（境界突破后 UI 可调，tick 每秒也会自检）
 *
 * 依赖约定：只读 XG.data.world / XG.data.pets / XG.data.pills / XG.data.gongfa / XG.cfg / XG.state；
 * 跨系统调用（cultivation/forge/alchemy/gongfa/adventure）全部防御性判存，不存在则降级发灵石/材料。
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  /* ---------------- 常量 ---------------- */
  // 时长档（对齐 world.js drops 口径注释：抽 3/4/5 种材料，系数 ×1/×3.2/×6；
  // sp 特产与蛋/丹方概率均按 min(1, 时长/1h) 缩放，sp 为中 1/1/2 件）
  const DUR_OPTS = [
    { sec: 60, label: '短途·一分', kinds: 3, mul: 1, sp: 1 },
    { sec: 180, label: '中途·三分', kinds: 4, mul: 3.2, sp: 1 },
    { sec: 600, label: '远游·十分', kinds: 5, mul: 6, sp: 2 },
  ];
  // 第 2/3 队栏位解锁规则（idx 即队伍序号 1/2；第 1 队默认开放）
  const SLOT_RULES = {
    1: { realmIdx: 2, layer: 1, lingYu: 200, realmText: '金丹1层' },
    2: { realmIdx: 4, layer: 1, lingYu: 500, realmText: '化神1层' },
  };
  const LOG_CAP = 20;      // 派遣日志上限
  const HONGYUN_P = 0.06;  // 鸿运当头（材料翻倍）概率
  const CAI_DROP_PCT = 0.1; // 每只「财」擅长灵宠材料产出 +10%

  /* ---------------- 内部助手 ---------------- */
  // 状态子树（含本系统扩展键的懒初始化：slots=已购栏位, hidden=已解锁隐藏图, seen=已播报解锁的地图）
  function st() {
    const e = XG.state.expedition || (XG.state.expedition = { active: [], log: [] });
    e.active = e.active || [];
    e.log = e.log || [];
    e.slots = e.slots || {};   // {s2:true, s3:true} 灵玉购买的栏位
    e.hidden = e.hidden || {}; // {guixu:1, longyuan:1} 已解锁隐藏图
    e.seen = e.seen || {};     // 已播过解锁传闻的地图 id
    if (e.auto === undefined) e.auto = null; // 连续历练配置 {mapId, petUids, durIdx}（null=关闭）
    return e;
  }
  function stats() { return (XG.state.stats = XG.state.stats || {}); }
  function bump(k, n) { const s = stats(); s[k] = (s[k] || 0) + (n || 1); }
  function dirty() { XG.bus.emit('save:dirty'); }

  // 传闻推送：unshift 进 state.news 并按 cfg.NEWS_CAP 截断，同时 emit 'news'
  function pushNews(cat, text, imp) {
    const news = { t: Date.now(), cat: cat, text: text, imp: imp || 0 };
    const arr = XG.state.news || (XG.state.news = []);
    arr.unshift(news);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (arr.length > cap) arr.length = cap;
    XG.bus.emit('news', news);
  }

  function maps() { return (XG.data.world && XG.data.world.maps) || []; }
  function getMap(mapId) {
    const ms = maps();
    for (let i = 0; i < ms.length; i++) if (ms[i].id === mapId) return ms[i];
    return null;
  }
  // 境界达标判定（与 cfg.isUnlocked 同口径，但作用于地图自带的 unlock 对象）
  function meetsRealm(u) {
    if (!u) return true;
    const p = XG.state.player;
    if (!p) return false;
    return p.realmIdx > u.realmIdx || (p.realmIdx === u.realmIdx && p.layer >= u.layer);
  }
  function realmName(realmIdx) {
    const r = XG.cfg.REALMS[realmIdx];
    return r ? r.name : '未知';
  }

  /* ---------------- 灵宠查询（防御性：pets 系统可能尚未注册/实例结构待联调） ---------------- */
  function petList() { return (XG.state.pets && XG.state.pets.list) || []; }
  function petJobs() {
    const ps = XG.state.pets || (XG.state.pets = { list: [], team: [], jobs: {} });
    return (ps.jobs = ps.jobs || {});
  }
  function findPet(uid) {
    const ls = petList();
    for (let i = 0; i < ls.length; i++) if (ls[i] && ls[i].uid === uid) return ls[i];
    return null;
  }
  function speciesOf(pet) {
    if (!pet || !XG.data.pets) return null;
    const sid = pet.sp || pet.spId || pet.speciesId || pet.species || pet.sid;
    if (!sid) return null;
    const sp = XG.data.pets.species || [];
    for (let i = 0; i < sp.length; i++) if (sp[i].id === sid) return sp[i];
    return null;
  }
  // 单宠战力：优先委托 pets 系统权威口径 powerOf（实例字段以其为准）；
  // 缺则本地估算——物种 base × 等级成长(8%/级) × 资质倍率 × 觉醒加成
  function petPower(pet) {
    if (!pet) return 0;
    const ps = XG.sys.pets;
    if (ps && typeof ps.powerOf === 'function') {
      try {
        const v = ps.powerOf(pet.uid);
        if (typeof v === 'number' && v > 0) return v;
      } catch (e) { /* 降级本地估算 */ }
    }
    if (typeof pet.atk === 'number' && typeof pet.def === 'number' && typeof pet.hp === 'number') {
      return XG.cfg.POWER({ atk: pet.atk, def: pet.def, hp: pet.hp, spd: pet.spd || 10 });
    }
    const sp = speciesOf(pet);
    if (!sp || !sp.base) return 0;
    const lv = pet.lv || 1;
    let mult = 1 + 0.08 * (lv - 1);
    let aptMult = 1;
    if (typeof pet.aptMult === 'number') aptMult = pet.aptMult;
    else if (typeof pet.apt === 'number' && XG.data.pets.aptTiers) {
      const tiers = XG.data.pets.aptTiers;
      for (let i = 0; i < tiers.length; i++) {
        if (pet.apt >= tiers[i].min && pet.apt <= tiers[i].max) { aptMult = tiers[i].mult; break; }
      }
    }
    mult *= aptMult;
    if (pet.awakened) mult *= 1.5;
    return XG.cfg.POWER({ atk: sp.base.atk * mult, def: sp.base.def * mult, hp: sp.base.hp * mult, spd: 10 });
  }
  function teamPower(petUids) {
    let sum = 0;
    (petUids || []).forEach(function (uid) { sum += petPower(findPet(uid)); });
    if (!(petUids || []).length) {
      // 独自历练（无宠同行）：以玩家自身战力半数折算，保底收益系数 0.5 由此而来
      try { sum = (XG.stats.get().power || 0) * 0.5; } catch (e) { sum = 0; }
    }
    return sum;
  }
  function petView(pet) {
    const sp = speciesOf(pet) || {};
    return { uid: pet.uid, name: pet.name || sp.name || '灵宠', icon: pet.icon || sp.icon || '🐾', lv: pet.lv || 1 };
  }
  // 占用判定：已在某支出征队伍中，或 pets.jobs 有岗位（explore/建筑）
  function isPetBusy(uid) {
    const act = st().active;
    for (let i = 0; i < act.length; i++) {
      if ((act[i].petUids || []).indexOf(uid) >= 0) return true;
    }
    return !!petJobs()[uid];
  }
  function getIdlePets() {
    return petList()
      .filter(function (p) { return p && p.uid && !isPetBusy(p.uid); })
      .map(function (p) {
        const v = petView(p);
        v.power = petPower(p);
        return v;
      })
      .sort(function (a, b) { return b.power - a.power; });
  }

  /* ---------------- 地图解锁 ---------------- */
  function isMapUnlocked(map) {
    if (!map) return false;
    if (!map.hidden) return meetsRealm(map.unlock);
    return !!st().hidden[map.id];
  }
  // 隐藏图 cond 判定（满足即解锁 + news，龙渊解锁即消耗 sp_guixu_bi×5 献祭）
  function checkHidden() {
    const e = st();
    maps().forEach(function (m) {
      if (!m.hidden || e.hidden[m.id]) return;
      if (!meetsRealm(m.unlock)) return;
      if (m.cond === 'youming_exp_30') {
        if ((stats().youming_exp || 0) >= 30) {
          e.hidden[m.id] = 1;
          pushNews('world', '夜半潮落，幽冥涧底忽现古渡。万水归处，「归墟」之路悄然显现！', 2);
        }
      } else if (m.cond === 'guixu_bi_5') {
        const have = (XG.state.inv.mat && XG.state.inv.mat.sp_guixu_bi) || 0;
        if (have >= 5) {
          XG.addRes({ mat: { sp_guixu_bi: -5 } }); // 五璧献祭，祭坛启门
          e.hidden[m.id] = 1;
          pushNews('world', '五枚归墟残璧没入祭坛，龙吟自深渊而起，「龙渊」之门轰然中开！', 2);
        }
      }
    });
    refreshUnlockStats();
  }
  // 普通图境界解锁的新图播报（init 时静默标记已解锁图，避免老档刷屏）
  function checkMapNews() {
    const e = st();
    maps().forEach(function (m) {
      if (!isMapUnlocked(m) || e.seen[m.id]) return;
      e.seen[m.id] = 1;
      if (m.hidden) {
        pushNews('world', '传闻秘境「' + m.name + '」已现于世，可遣灵宠前往一探究竟。', 2);
      } else {
        pushNews('world', '云游四方，始知「' + m.name + '」之路已通，可遣灵宠前往历练。', 0);
      }
    });
  }
  // 成就统计源：已解锁地图数/隐藏图数（变化时才写）
  function refreshUnlockStats() {
    const s = stats();
    let total = 0, hid = 0;
    maps().forEach(function (m) {
      if (isMapUnlocked(m)) { total++; if (m.hidden) hid++; }
    });
    if (s.map_unlock !== total) s.map_unlock = total;
    if (s.hidden_map_unlock !== hid) s.hidden_map_unlock = hid;
  }

  /* ---------------- 栏位 ---------------- */
  function slotUnlocked(idx) {
    if (idx <= 0) return true;
    const rule = SLOT_RULES[idx];
    if (!rule) return false;
    if (st().slots['s' + (idx + 1)]) return true;
    return meetsRealm({ realmIdx: rule.realmIdx, layer: rule.layer });
  }
  function maxSlots() {
    let n = 0;
    for (let i = 0; i < 3; i++) if (slotUnlocked(i)) n++;
    return n;
  }
  function getSlots() {
    const list = [];
    for (let i = 0; i < 3; i++) {
      const rule = SLOT_RULES[i];
      list.push({
        idx: i,
        unlocked: slotUnlocked(i),
        lingYu: rule ? rule.lingYu : 0,
        realmText: rule ? rule.realmText : '',
      });
    }
    return { max: maxSlots(), used: st().active.length, list: list };
  }
  function unlockSlot(idx) {
    if (idx !== 1 && idx !== 2) return { ok: false, msg: '栏位不存在。' };
    if (slotUnlocked(idx)) return { ok: false, msg: '该栏位已然可用。' };
    const rule = SLOT_RULES[idx];
    if (!XG.hasRes({ lingYu: rule.lingYu })) {
      return { ok: false, msg: '灵玉不足（需 ' + rule.lingYu + '），或臻' + rule.realmText + '自开。' };
    }
    XG.addRes({ lingYu: -rule.lingYu });
    st().slots['s' + (idx + 1)] = true;
    pushNews('system', '洞府灵光一闪，历练队伍栏位增至 ' + maxSlots() + ' 队。', 0);
    dirty();
    return { ok: true, msg: '栏位已开，可同时派遣 ' + maxSlots() + ' 支队伍。' };
  }

  /* ---------------- 掉落 roll（品阶 → 具体 id） ---------------- */
  // 不放回权重抽 n 个（entries 元素需含 w 字段）
  function pickWeightedN(entries, n) {
    const pool = entries.slice();
    const out = [];
    while (pool.length && out.length < n) {
      const it = XG.util.weighted(pool, 'w');
      if (!it) break;
      out.push(it);
      pool.splice(pool.indexOf(it), 1);
    }
    return out;
  }
  // 按品阶随机取一个成品丹 id（优先非隐藏丹方；全空返回 null）
  function randomPillId(grade) {
    const R = (XG.data.pills && XG.data.pills.recipes) || [];
    let pool = R.filter(function (r) { return r.grade === grade && !r.hidden; });
    if (!pool.length) pool = R.filter(function (r) { return r.grade === grade; });
    if (!pool.length) pool = R.filter(function (r) { return !r.hidden; });
    const it = pool.length ? XG.util.pick(pool) : null;
    return it ? it.id : null;
  }
  // 按品阶随机取一个功法 id（优先非隐藏；全空返回 null）
  function randomGongfaId(grade) {
    const L = (XG.data.gongfa && XG.data.gongfa.list) || [];
    let pool = L.filter(function (g) { return g.grade === grade && !g.hidden; });
    if (!pool.length) pool = L.filter(function (g) { return g.grade === grade; });
    if (!pool.length) pool = L.filter(function (g) { return !g.hidden; });
    const it = pool.length ? XG.util.pick(pool) : null;
    return it ? it.id : null;
  }
  // 丹方学习（防御性：alchemy 未注册/无可学丹方则降级发灵石）
  function grantRecipe(maxLv) {
    const alch = XG.sys.alchemy;
    if (alch && typeof alch.learnRandomRecipe === 'function') {
      try {
        const r = alch.learnRandomRecipe(maxLv);
        if (r) return true; // 习得新丹方
      } catch (e) { /* 降级 */ }
    }
    XG.addRes({ lingShi: 500 * (maxLv || 1) });
    return false;
  }
  // 残篇发放（防御性：gongfa 未注册则塞背包 inv.frag）
  function grantFrag(gfId, n) {
    const gf = XG.sys.gongfa;
    if (gf && typeof gf.addFrag === 'function') {
      try { gf.addFrag(gfId, n); return; } catch (e) { /* 降级 */ }
    }
    const delta = { frag: {} };
    delta.frag[gfId] = n;
    XG.addRes(delta);
  }
  // 地图事件触发（防御性：adventure 未注册/抛错均吞掉）
  function triggerEvent(mapId, offline) {
    const adv = XG.sys.adventure;
    if (adv && typeof adv.triggerOnMap === 'function') {
      try {
        adv.triggerOnMap(mapId, offline ? { offline: true } : undefined);
        return true;
      } catch (e) { /* 忽略 */ }
    }
    return false;
  }

  /* ---------------- 结算 ---------------- */
  // 战力系数：队伍战力不足 map.power 时收益打折（0.5~1）
  function powerFactor(map, tp) {
    if (!map || !map.power) return 1;
    if (tp >= map.power) return 1;
    return XG.util.clamp(0.5 + 0.5 * (tp / map.power), 0.5, 1);
  }

  // 结算一支队伍（online/offline 共用），返回结算报告
  function settleTeam(team, isOffline) {
    const map = getMap(team.mapId);
    const opt = DUR_OPTS[team.durIdx] || DUR_OPTS[0];
    const pets = (team.petUids || []).map(findPet).filter(Boolean);
    const tp = teamPower(team.petUids);
    const factor = map ? powerFactor(map, tp) : 1;
    // 「财」擅长加成：每只 +10% 材料产出
    let caiN = 0;
    pets.forEach(function (p) {
      const sp = speciesOf(p);
      if (sp && sp.apt && sp.apt.indexOf('cai') >= 0) caiN++;
    });
    const dropMul = 1 + CAI_DROP_PCT * caiN;

    const report = {
      t: Date.now(), mapId: team.mapId, mapName: map ? map.name : team.mapId,
      icon: map ? map.icon : '🗺️', dur: team.dur || opt.sec, factor: Math.round(factor * 100) / 100,
      mat: {}, pill: {}, frag: {}, egg: 0, recipe: false, hongyun: false, event: false,
    };
    const resDelta = { mat: {}, pill: {} };

    if (map && map.drops) {
      // ---- 材料：按权重抽 kinds 种，[min,max] × 时长系数 × 战力系数 × 财加成 ----
      const entries = [];
      for (const id in map.drops.mat || {}) {
        const v = map.drops.mat[id];
        entries.push({ id: id, min: v[0], max: v[1], w: v[2] });
      }
      const picked = pickWeightedN(entries, opt.kinds);
      const hongyun = XG.util.chance(HONGYUN_P);
      report.hongyun = hongyun;
      picked.forEach(function (it) {
        let n = XG.util.randInt(it.min, it.max) * opt.mul * factor * dropMul;
        n = Math.max(1, Math.round(n));
        if (hongyun) n *= 2;
        report.mat[it.id] = (report.mat[it.id] || 0) + n;
      });
      // ---- sp 特产：按 min(1,时长/1h) 概率判定，中 1/1/2 件（保底不折扣） ----
      const rareScale = Math.min(1, opt.sec / 3600);
      if (map.sp && XG.util.chance(rareScale)) {
        report.mat[map.sp] = (report.mat[map.sp] || 0) + opt.sp;
      }
      // ---- 成品丹：品阶权重抽 1 档，品阶池随机 ----
      if (map.drops.pill) {
        const pe = [];
        for (const g in map.drops.pill) {
          const v = map.drops.pill[g];
          pe.push({ grade: parseInt(g.slice(1), 10) || 1, min: v[0], max: v[1], w: v[2] });
        }
        const pit = XG.util.weighted(pe, 'w');
        if (pit) {
          const n = Math.max(1, Math.round(XG.util.randInt(pit.min, pit.max) * factor));
          const pid = randomPillId(pit.grade);
          if (pid) report.pill[pid] = (report.pill[pid] || 0) + n;
          else resDelta.lingShi = (resDelta.lingShi || 0) + 200 * pit.grade * n; // 无此品阶丹方，折灵石
        }
      }
      // ---- 功法残篇：品阶权重抽 1 档 → gongfa.addFrag ----
      if (map.drops.frag) {
        const fe = [];
        for (const g2 in map.drops.frag) {
          const v2 = map.drops.frag[g2];
          fe.push({ grade: parseInt(g2.slice(1), 10) || 1, min: v2[0], max: v2[1], w: v2[2] });
        }
        const fit = XG.util.weighted(fe, 'w');
        if (fit) {
          const n2 = Math.max(1, Math.round(XG.util.randInt(fit.min, fit.max) * factor));
          const gfId = randomGongfaId(fit.grade);
          if (gfId) {
            report.frag[gfId] = (report.frag[gfId] || 0) + n2;
            grantFrag(gfId, n2);
          } else {
            resDelta.lingShi = (resDelta.lingShi || 0) + 1500 * fit.grade * n2; // 折灵石
          }
        }
      }
      // ---- 灵宠蛋 / 丹方：独立概率判定（受战力系数影响；按 min(1,时长/1h) 缩放，保持时产口径） ----
      if (XG.util.chance((map.drops.eggChance || 0) * factor * rareScale)) report.egg = 1;
      if (XG.util.chance((map.drops.recipeChance || 0) * factor * rareScale)) {
        let maxG = 1;
        for (const g3 in map.drops.pill || {}) maxG = Math.max(maxG, parseInt(g3.slice(1), 10) || 1);
        report.recipe = grantRecipe(maxG);
      }
    }

    // ---- 统一入账 ----
    resDelta.mat = report.mat;
    resDelta.pill = report.pill;
    if (report.egg) resDelta.egg = report.egg;
    XG.addRes(resDelta);

    // ---- 释放灵宠岗位 ----
    (team.petUids || []).forEach(function (uid) {
      const jobs = petJobs();
      if (jobs[uid] === 'explore') delete jobs[uid];
    });

    // ---- 必触发 1 次地图事件（防御性） ----
    report.event = triggerEvent(team.mapId, !!isOffline);

    // ---- 计数 / 事件 / 日志 / 传闻 ----
    bump('expedition_done');
    XG.bus.emit('expedition:done', { mapId: team.mapId });
    const e = st();
    e.log.unshift(report);
    if (e.log.length > LOG_CAP) e.log.length = LOG_CAP;

    if (report.egg) {
      pushNews('world', '灵宠历练归来，竟于「' + report.mapName + '」衔回一枚灵宠蛋，祥瑞之兆！', 1);
    } else if (report.hongyun) {
      pushNews('world', '灵宠于「' + report.mapName + '」鸿运当头，所携天材地宝较往日翻倍。', 1);
    } else if (factor <= 0.6) {
      pushNews('world', '灵宠于「' + report.mapName + '」险象环生，力有不逮，所得寥寥。', 0);
    }
    refreshUnlockStats();
    dirty();
    return report;
  }

  /* ---------------- 派遣 ---------------- */
  function dispatch(mapId, petUids, durIdx) {
    if (!XG.cfg.isUnlocked('expedition')) return { ok: false, msg: '历练之道尚未开启（需筑基1层）。' };
    const map = getMap(mapId);
    if (!map) return { ok: false, msg: '查无此图。' };
    if (!isMapUnlocked(map)) {
      return { ok: false, msg: map.hidden ? (map.condText || '秘境未启，机缘未到。') : '境界不足，难入「' + map.name + '」。' };
    }
    durIdx = durIdx | 0;
    if (durIdx < 0 || durIdx >= DUR_OPTS.length) durIdx = 0;
    const e = st();
    if (e.active.length >= maxSlots()) return { ok: false, msg: '历练队伍已满（' + maxSlots() + ' 队）。' };
    // 灵宠校验：0~3 只（不遣灵宠即独自历练，战力按自身半数折算）、存在、空闲、不重复
    const uids = [];
    (petUids || []).forEach(function (u) { if (u && uids.indexOf(u) < 0) uids.push(u); });
    if (uids.length > 3) return { ok: false, msg: '一队至多遣 3 只灵宠同行。' };
    for (let i = 0; i < uids.length; i++) {
      if (!findPet(uids[i])) return { ok: false, msg: '所选灵宠不在囊中。' };
      if (isPetBusy(uids[i])) return { ok: false, msg: '所选灵宠另有差事，暂不可遣。' };
    }
    const dur = (map.dur && map.dur[durIdx]) || DUR_OPTS[durIdx].sec;
    const team = {
      id: XG.util.uid(), mapId: mapId, petUids: uids,
      endAt: Date.now() + dur * 1000, dur: dur, durIdx: durIdx,
    };
    e.active.push(team);
    const jobs = petJobs();
    uids.forEach(function (u) { jobs[u] = 'explore'; });
    bump('expedition_count');
    if (mapId === 'youming') { bump('youming_exp'); checkHidden(); }
    dirty();
    return { ok: true, msg: uids.length ? '灵宠已往「' + map.name + '」历练（' + DUR_OPTS[durIdx].label + '）。' : '你独自往「' + map.name + '」历练（' + DUR_OPTS[durIdx].label + '）——无宠相助，收益以自身战力半数折算。', team: team };
  }

  // 一键派遣：空余栏位 × 空闲最强 ≤3 宠 × 期望收益最高图 × 中途档（3分钟）
  function quickDispatch() {
    const msg = [];
    if (!XG.cfg.isUnlocked('expedition')) return { ok: false, msg: ['历练之道尚未开启（需筑基1层）。'] };
    if (st().active.length >= maxSlots()) return { ok: false, msg: ['历练队伍已满，静候诸宠归来。'] };
    const idle = getIdlePets();
    if (!idle.length) {
      // 无空闲灵宠：独自历练兜底（收益按自身战力半数折算），破「无宠不能历练」死局
      const tp0 = teamPower([]);
      let best0 = null, bestScore0 = -1;
      maps().forEach(function (m, idx) {
        if (!isMapUnlocked(m)) return;
        const score = (idx + 1) * powerFactor(m, tp0);
        if (score > bestScore0) { bestScore0 = score; best0 = m; }
      });
      if (!best0) return { ok: false, msg: ['尚无已解锁的历练地图。'] };
      const r0 = dispatch(best0.id, [], 1);
      msg.push(r0.msg);
      if (r0.ok) {
        setAuto({ mapId: best0.id, petUids: [], durIdx: 1 });
        msg.push('连续历练已自动开启。');
      }
      return { ok: r0.ok, msg: msg };
    }
    const team = idle.slice(0, 3);
    const tp = team.reduce(function (s, p) { return s + p.power; }, 0);
    // 期望收益：地图阶位(靠后者厚) × 战力系数
    let best = null, bestScore = -1;
    const ms = maps();
    ms.forEach(function (m, idx) {
      if (!isMapUnlocked(m)) return;
      const score = (idx + 1) * powerFactor(m, tp);
      if (score > bestScore) { bestScore = score; best = m; }
    });
    if (!best) return { ok: false, msg: ['尚无已解锁的历练地图。'] };
    const r = dispatch(best.id, team.map(function (p) { return p.uid; }), 1);
    msg.push(r.msg);
    if (r.ok) {
      setAuto({ mapId: best.id, petUids: team.map(function (p) { return p.uid; }), durIdx: 1 });
      msg.push('连续历练已自动开启。');
      if (powerFactor(best, tp) < 1) msg.push('队伍战力未足「' + best.name + '」所需，归来收益将打折扣。');
    }
    return { ok: r.ok, msg: msg };
  }

  /* ---------------- 查询（UI 对接面） ---------------- */
  function getMaps() {
    const e = st();
    return maps().map(function (m) {
      const un = isMapUnlocked(m);
      let reason = null;
      if (!un) {
        reason = m.hidden
          ? (m.condText || '机缘未到')
          : '需臻 ' + realmName(m.unlock.realmIdx) + m.unlock.layer + ' 层';
      }
      return {
        id: m.id, name: m.name, icon: m.icon, desc: m.desc, hidden: !!m.hidden,
        power: m.power, sp: m.sp, dur: m.dur, unlock: m.unlock, condText: m.condText || '',
        unlocked: un, lockedReason: reason,
        dispatchCount: m.id === 'youming' ? (stats().youming_exp || 0) : 0,
        activeCount: e.active.filter(function (t) { return t.mapId === m.id; }).length,
      };
    });
  }
  function getActive() {
    const now = Date.now();
    return st().active.map(function (t) {
      const m = getMap(t.mapId) || {};
      const total = (t.dur || 1) * 1000;
      return {
        id: t.id, mapId: t.mapId, mapName: m.name || t.mapId, icon: m.icon || '🗺️',
        petUids: t.petUids.slice(),
        pets: t.petUids.map(function (u) { const p = findPet(u); return p ? petView(p) : { uid: u, name: '灵宠', icon: '🐾', lv: 1 }; }),
        endAt: t.endAt, dur: t.dur, durIdx: t.durIdx,
        remainSec: Math.max(0, Math.ceil((t.endAt - now) / 1000)),
        progress: XG.util.clamp(1 - (t.endAt - now) / total, 0, 1),
      };
    });
  }
  function estimateFactor(mapId, petUids) {
    const m = getMap(mapId);
    const tp = teamPower(petUids);
    return { factor: m ? powerFactor(m, tp) : 1, teamPower: tp, need: m ? m.power : 0 };
  }
  function getLog() { return st().log; }

  /* ---------------- 连续历练（结算后按记忆配置自动再派；仅在线接续，离线结算不连派） ---------------- */
  function runAuto() {
    const e = st();
    const a = e.auto;
    if (!a || e.active.length >= maxSlots()) return;
    const map = getMap(a.mapId);
    if (!map || !isMapUnlocked(map)) {
      e.auto = null;
      pushNews('world', '连续历练中止：' + (map ? '「' + map.name + '」之路已断，机缘不再。' : '目的地已不可达。'), 0);
      dirty();
      return;
    }
    // 灵宠忙/不在囊中者自动剔除；全体不可遣则独自历练亦可（dispatch 支持空队）
    const uids = (a.petUids || []).filter(function (u) { return findPet(u) && !isPetBusy(u); });
    const r = dispatch(a.mapId, uids, a.durIdx);
    if (!r.ok) {
      e.auto = null;
      pushNews('world', '连续历练中止：' + r.msg, 0);
      dirty();
    }
  }

  /* ---------------- 模块协议（契约 §10） ---------------- */
  XG.sys.expedition = {
    id: 'expedition',
    DUR_OPTS: DUR_OPTS,

    // 自恢复：扩展键懒初始化、回补出征宠物岗位标记、清理残损队伍、静默标记已解锁图
    init() {
      const e = st();
      e.active = e.active.filter(function (t) { return t && t.mapId && t.petUids && typeof t.endAt === 'number'; });
      const jobs = petJobs();
      e.active.forEach(function (t) {
        t.petUids.forEach(function (u) { if (findPet(u)) jobs[u] = 'explore'; });
      });
      checkHidden();
      // 静默标记当前已解锁地图（防老档首次加载连刷解锁传闻），之后由 tick 播报新解锁
      maps().forEach(function (m) { if (isMapUnlocked(m)) e.seen[m.id] = 1; });
      refreshUnlockStats();
    },

    // 每秒：结算到期队伍 + 连续历练接续 + 隐藏图条件自检 + 新图解锁播报
    tick(dt) {
      const e = st();
      const now = Date.now();
      for (let i = e.active.length - 1; i >= 0; i--) {
        const t = e.active[i];
        if (t && typeof t.endAt === 'number' && t.endAt <= now) {
          e.active.splice(i, 1);
          settleTeam(t, false);
        }
      }
      runAuto();
      checkHidden();
      checkMapNews();
    },

    // 离线结算：到期队伍完整结算，未到期跳过；返回报告片段
    offline(dt) {
      const e = st();
      const now = Date.now();
      const items = [];
      for (let i = e.active.length - 1; i >= 0; i--) {
        const t = e.active[i];
        if (t && typeof t.endAt === 'number' && t.endAt <= now) {
          e.active.splice(i, 1);
          const r = settleTeam(t, true);
          items.push('灵宠自「' + r.mapName + '」历练归来，携回天材地宝若干。');
        }
      }
      if (!items.length) return null;
      return { expedition: { done: items.length, items: items } };
    },

    // 本系统无永久属性加成，不实现 getMods

    // ---- UI 对接面（见文件头注释） ----
    isUnlocked: function () { return XG.cfg.isUnlocked('expedition'); },
    getMaps: getMaps,
    getMap: getMap,
    getSlots: getSlots,
    unlockSlot: unlockSlot,
    getActive: getActive,
    getIdlePets: getIdlePets,
    petPower: petPower,
    teamPower: teamPower,
    estimateFactor: estimateFactor,
    dispatch: dispatch,
    quickDispatch: quickDispatch,
    // 连续历练：cfg={mapId, petUids, durIdx} 开启，null 关闭
    setAuto: function (cfg) {
      const e = st();
      if (!cfg) { e.auto = null; dirty(); return { ok: true, msg: '连续历练已停止。' }; }
      const map = getMap(cfg.mapId);
      if (!map || !isMapUnlocked(map)) return { ok: false, msg: '此图不可连续历练。' };
      e.auto = { mapId: cfg.mapId, petUids: (cfg.petUids || []).slice(), durIdx: cfg.durIdx | 0 };
      dirty();
      return { ok: true, msg: '连续历练已开启：' + map.name + '，归来后自动再派。' };
    },
    getAuto: function () {
      const a = st().auto;
      if (!a) return null;
      const m = getMap(a.mapId) || {};
      const opt = DUR_OPTS[a.durIdx] || DUR_OPTS[0];
      return { mapId: a.mapId, petUids: a.petUids.slice(), durIdx: a.durIdx, mapName: m.name || a.mapId, durLabel: opt.label };
    },
    getLog: getLog,
    checkHidden: checkHidden,
  };
  XG.sysOrder.push('expedition');
})();
