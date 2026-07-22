/* pvp.js：异步斗法「论剑」系统（纯逻辑层，契约 §10 模块协议）
 *
 * 玩法：对手池=state.fellows（道友）；匹配=玩家战力±40% 筛选 + 强度贴近/宿敌偏好，无匹配时全表随机；
 *      战斗自动结算：双方战力 × 流派克制（剑→符→阵→丹→体→剑，克制方 +15%）× 随机 0.9~1.1，三局两胜；
 *      赛季=weekId，段位 pts 阈值：青铜0/白银1200/黄金1500/白金1800/钻石2100/仙尊2500；
 *      胜 +30 / 负 -15（按对手强度浮动）；每日前 5 场发灵石+修为，之后仅 pts；战报 history ≤20；
 *      跨周赛季结算：按当前段位发灵玉+随机残篇，进入可补领列表（上周没打也发基础奖，不惩罚缺席）；
 *      宿敌联动：对手 relation==='rival' 时防御性调 XG.sys.fellows.onRivalBattle(win, uid)，
 *      fellows 系统未就位时自行用 lines.war 文案池发战书 news 兜底。
 *
 * ==================== UI 对接面（本文件唯一对外接口，UI 代理以此为准） ====================
 * XG.sys.pvp.canFight()
 *   → { ok:bool, reason?:string }   // 未解锁(金丹5层)/无道友时 ok=false 并附原因文案
 * XG.sys.pvp.match()
 *   → null | { uid, name, school, schoolName, persona, relation, realmIdx, layer, power }
 *   // 匹配一名对手的快照（不下注不改状态）；无可用对手返回 null
 * XG.sys.pvp.fight(uid?)
 *   → { ok:false, reason } 或
 *     { ok:true, win, rounds:[bool..], opp:{uid,name,school,schoolName,relation,power},
 *       counter:'win'|'lose'|'none',        // 玩家克制对方/被克制/无克制
 *       delta, pts,                          // pts 变化量与赛后总分
 *       tier:{id,name,min}, tierUp:bool, tierDown:bool,
 *       reward:null|{ cult, lingShi },       // 每日前5场才有，之后为 null
 *       dailyLeft, streak, rival:bool, upset:bool }  // upset=越阶挑战(对手战力≥1.3倍仍胜)
 * XG.sys.pvp.getOverview()
 *   → { unlocked, pts, tier:{id,name,min,idx}, nextTier:null|{id,name,min}, progress:0~1,
 *       wins, losses, streak, dailyLeft, dailyMax:5, season:'YYYY-Www',
 *       pending:[{season,tierId,tierName,lingYu,frags,t}], school, schoolName, historyLen }
 * XG.sys.pvp.getHistory()
 *   → [{ t, name, uid, win, delta, pts, rounds:[bool..], rival }]  // 新→旧，≤20 条
 * XG.sys.pvp.claimSeason()
 *   → { ok:false, reason } 或 { ok:true, count, lingYu, frags:{gfId:n} }  // 一键补领全部赛季奖励
 * XG.sys.pvp.getSchool() → { id, name }            // 玩冢论剑流派（默认按灵根推导）
 * XG.sys.pvp.setSchool(id) → bool                  // id∈ jian/fu/zhen/dan/ti
 * XG.sys.pvp.getTiers() → TIERS 拷贝               // 段位表[{id,name,min,yu,frags}]
 * XG.sys.pvp.fellowPower(f) → number               // 道友战力估算（fellows 系统有同名函数则委托之）
 *
 * ==================== 写入的 state.stats 键（成就统计器读这里） ====================
 *   pvp_matches        累计论剑场次
 *   pvp_wins           累计胜场（check.k = pvpWins）
 *   pvp_losses         累计负场
 *   pvp_pts_max        积分历史峰值（check.k = pvpPts）
 *   pvp_season_claims  赛季奖励补领次数
 *   pvp_upsets         越阶挑战获胜次数
 *
 * ==================== emit 的事件 ====================
 *   pvp:result { win, pts, delta }   // pts=赛后总积分，delta=本场积分变化（胜正负）
 *   news      { t, cat, text, imp }  // 段位升降/连胜/赛季结算/宿敌战书等（经内部 pushNews）
 *
 * ==================== offline 行为 ====================
 *   offline(dt)：补做跨周赛季结算（与 tick/init 同一入口 checkSeason），
 *   若产生了新的待补领赛季奖励，返回 { events:['论剑上赛季结算…'] } 并入离线报告；否则返回 null。
 *
 * ==================== 埋的隐藏内容 ====================
 *   · 越阶挑战：对手战力 ≥1.3 倍仍获胜 → 额外 +5 pts 并播报 imp1 传闻；
 *   · 欧皇送福：战胜 persona==='ouhuang' 的对手有 5% 概率额外掉落 1 枚随机功法残篇；
 *   · 连胜播报：5/10/20 连胜各播一次传闻（败北清零）；
 *   · 宿敌战书：击败/败给宿敌后触发对方战书传闻（fellows 系统接管时自动让位）。
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  /* ---------------- 常量 ---------------- */
  // 段位表（min=达到积分；yu=赛季结算灵玉；frags=赛季结算残篇数）
  const TIERS = [
    { id: 'qingtong', name: '青铜', min: 0,    yu: 30,  frags: 2 },
    { id: 'baiyin',   name: '白银', min: 1200, yu: 60,  frags: 3 },
    { id: 'huangjin', name: '黄金', min: 1500, yu: 120, frags: 4 },
    { id: 'bojin',    name: '白金', min: 1800, yu: 200, frags: 5 },
    { id: 'zuanshi',  name: '钻石', min: 2100, yu: 350, frags: 6 },
    { id: 'xianzun',  name: '仙尊', min: 2500, yu: 600, frags: 8 },
  ];
  // 流派克制环：key 克制 value（剑→符→阵→丹→体→剑），克制方战力 +15%
  const COUNTER = { jian: 'fu', fu: 'zhen', zhen: 'dan', dan: 'ti', ti: 'jian' };
  const COUNTER_MULT = 1.15;
  // 灵根→默认论剑流派推导（金剑/木丹/水符/火体/土阵，变异兜底剑修）
  const ROOT2SCHOOL = { jin: 'jian', mu: 'dan', shui: 'fu', huo: 'ti', tu: 'zhen' };

  const MATCH_RANGE = 0.4;     // 匹配战力窗口 ±40%
  const WIN_PTS = 30;          // 胜利基础积分
  const LOSE_PTS = 15;         // 失败基础积分
  const DAILY_MAX = 5;         // 每日有奖励场次
  const HISTORY_CAP = 20;      // 战报上限
  const PENDING_CAP = 4;       // 赛季待补领奖励缓存上限
  const UPSET_RATIO = 1.3;     // 越阶挑战判定：对手战力 ≥ 1.3 × 玩家
  const UPSET_BONUS = 5;       // 越阶挑战额外积分
  const OUHUANG_FRAG_P = 0.05; // 战胜欧皇额外掉残篇概率

  /* ---------------- 内部助手 ---------------- */
  // 读取（并懒初始化/自修复）pvp 状态子树
  function st() {
    const s = XG.state;
    s.pvp = s.pvp || {};
    const p = s.pvp;
    if (typeof p.pts !== 'number') p.pts = 1000;
    if (typeof p.wins !== 'number') p.wins = 0;
    if (typeof p.losses !== 'number') p.losses = 0;
    if (typeof p.season !== 'string') p.season = '';
    if (typeof p.claimed !== 'string') p.claimed = '';
    if (!Array.isArray(p.history)) p.history = [];
    if (!Array.isArray(p.pending)) p.pending = [];       // 赛季待补领 [{season,tierId,tierName,lingYu,frags,t}]
    if (typeof p.streak !== 'number') p.streak = 0;      // 当前连胜
    if (typeof p.school !== 'string' || !COUNTER[p.school]) p.school = ''; // 论剑流派（'' 待推导）
    return p;
  }

  // 跨系统统计累加（成就统计器读 state.stats）
  function statsAdd(k, n) {
    const s = (XG.state.stats = XG.state.stats || {});
    s[k] = (s[k] || 0) + (n || 1);
  }

  // 传闻推送：unshift 进 state.news 并按上限截断，同时 emit 'news'
  function pushNews(cat, text, imp) {
    const s = XG.state;
    s.news = s.news || [];
    const item = { t: Date.now(), cat: cat, text: text, imp: imp || 0 };
    s.news.unshift(item);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (s.news.length > cap) s.news.length = cap;
    if (XG.bus) XG.bus.emit('news', item);
  }

  // 本地日期串 'YYYY/M/D'（与 main.js dayKey 一致，每日场次自愈用）
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  // 当日已赛场次（daily 对象被 main.js 每日重置；这里再按日期自愈一次，双保险）
  function dailyCount() {
    const s = XG.state;
    s.daily = s.daily || { day: '', discuss: {}, help: {}, gift: 0 };
    if (s.daily.pvpDay !== todayKey()) { s.daily.pvpDay = todayKey(); s.daily.pvpCount = 0; }
    return s.daily.pvpCount || 0;
  }
  function dailyLeft() { return Math.max(0, DAILY_MAX - dailyCount()); }

  // 玩家战力（stats 面板为准，异常时退化为境界裸基值）
  function playerPower() {
    try {
      const pw = XG.stats && XG.stats.get().power;
      if (typeof pw === 'number' && pw > 0) return pw;
    } catch (e) { /* ignore */ }
    const p = XG.state.player;
    const base = XG.cfg.REALM_BASE[p.realmIdx] || XG.cfg.REALM_BASE[0];
    return XG.cfg.POWER(base);
  }

  // 道友战力估算：fellows 系统若提供 fellowPower 则委托（保证两边口径一致），否则按境界基值×天赋×层数系数
  function fellowPower(f) {
    const fs = XG.sys.fellows;
    if (fs && typeof fs.fellowPower === 'function') {
      try {
        const v = fs.fellowPower(f);
        if (typeof v === 'number' && v > 0) return v;
      } catch (e) { /* ignore */ }
    }
    const base = XG.cfg.REALM_BASE[f.realmIdx || 0] || XG.cfg.REALM_BASE[0];
    const layerCoef = 1 + 0.06 * (((f.layer || 1) - 1));
    return XG.cfg.POWER(base) * (f.talent || 1) * layerCoef;
  }

  // 流派名查表（数据缺失时返回原 id）
  function schoolName(id) {
    const arr = (XG.data && XG.data.fellows && XG.data.fellows.schools) || [];
    for (const s of arr) if (s.id === id) return s.name;
    return id || '—';
  }

  // 积分→段位（返回拷贝，附 idx）
  function tierOf(pts) {
    let idx = 0;
    for (let i = 0; i < TIERS.length; i++) if (pts >= TIERS[i].min) idx = i;
    return { id: TIERS[idx].id, name: TIERS[idx].name, min: TIERS[idx].min, idx: idx };
  }

  // 发修为：优先走 cultivation 系统，缺位则直接加 state.player.cult（防御性）
  function grantCult(n, src) {
    const cv = XG.sys.cultivation;
    if (cv && typeof cv.addCult === 'function') {
      try { cv.addCult(n, src); return; } catch (e) { /* fallthrough */ }
    }
    XG.state.player.cult = (XG.state.player.cult || 0) + n;
  }

  // 发功法残篇：优先走 gongfa.addFrag，缺位则直接入背包（防御性）
  function grantFrag(gfId, n) {
    const gf = XG.sys.gongfa;
    if (gf && typeof gf.addFrag === 'function') {
      try { gf.addFrag(gfId, n); return; } catch (e) { /* fallthrough */ }
    }
    XG.addRes({ frag: { [gfId]: n } });
  }

  // 随机抽一部非隐藏功法 id 作残篇奖励（低品权重略高；数据缺失返回 null）
  function randomFragGf() {
    const list = (XG.data && XG.data.gongfa && XG.data.gongfa.list) || [];
    const pool = [];
    for (const g of list) {
      if (!g || g.hidden || !g.id) continue;
      pool.push({ id: g.id, w: Math.max(1, 10 - (g.grade || 1)) });
    }
    if (!pool.length) return null;
    const hit = XG.util.weighted(pool, 'w');
    return hit ? hit.id : null;
  }

  /* ---------------- 赛季（weekId） ---------------- */
  // 跨周检测与结算：赛季变更时按当前段位生成待补领奖励（上周没打也发，不惩罚缺席）
  function checkSeason() {
    const p = st();
    const wk = XG.util.weekId();
    if (p.season === wk) return null;
    const old = p.season;
    p.season = wk;
    if (!old) return null; // 新档首记赛季，无上赛季可结算

    const tier = tierOf(p.pts);
    const tDef = TIERS[tier.idx];
    const frags = {};
    for (let i = 0; i < tDef.frags; i++) {
      const id = randomFragGf();
      if (id) frags[id] = (frags[id] || 0) + 1;
    }
    const reward = {
      season: old, tierId: tDef.id, tierName: tDef.name,
      lingYu: tDef.yu, frags: frags, t: Date.now(),
    };
    p.pending.unshift(reward);
    if (p.pending.length > PENDING_CAP) p.pending.length = PENDING_CAP; // 超上限丢弃最旧（防囤）
    pushNews('system', '论剑上赛季（' + old + '）结算已出：' + tDef.name +
      '段位奖励灵玉×' + tDef.yu + '、功法残篇×' + tDef.frags + '，记得前往论剑台补领。', 1);
    if (XG.bus) XG.bus.emit('save:dirty');
    return reward;
  }

  /* ---------------- 匹配 ---------------- */
  // 可用对手池：存活道友（alive!==false）
  function oppPool() {
    const arr = XG.state.fellows || [];
    const pool = [];
    for (const f of arr) if (f && f.alive !== false) pool.push(f);
    return pool;
  }

  // 匹配：±40% 战力窗口内按「强度贴近 + 宿敌偏好」加权；无候选则全表随机
  function match() {
    const pool = oppPool();
    if (!pool.length) return null;
    const pp = playerPower();
    const cands = [];
    for (const f of pool) {
      const fp = fellowPower(f);
      if (fp >= pp * (1 - MATCH_RANGE) && fp <= pp * (1 + MATCH_RANGE)) {
        // 权重：战力越贴近越高；宿敌 ×2（排行互超，狭路相逢）
        let w = 1 / (0.1 + Math.abs(fp - pp) / Math.max(1, pp));
        if (f.relation === 'rival') w *= 2;
        cands.push({ f: f, w: w });
      }
    }
    let hit = null;
    if (cands.length) hit = XG.util.weighted(cands, 'w');
    const f = hit ? hit.f : XG.util.pick(pool);
    return {
      uid: f.uid, name: f.name, school: f.school, schoolName: schoolName(f.school),
      persona: f.persona, relation: f.relation || 'stranger',
      realmIdx: f.realmIdx || 0, layer: f.layer || 1, power: Math.round(fellowPower(f)),
    };
  }

  /* ---------------- 战斗结算 ---------------- */
  function fight(uid) {
    if (!XG.cfg.isUnlocked('pvp')) return { ok: false, reason: '论剑台尚未开启（需金丹5层）。' };
    const p = st();
    checkSeason();

    // 解析对手：指定 uid 则按 uid 找（找不到则重新匹配），否则走匹配
    let opp = null;
    if (uid) {
      const pool = oppPool();
      for (const f of pool) {
        if (f.uid === uid) {
          opp = {
            uid: f.uid, name: f.name, school: f.school, schoolName: schoolName(f.school),
            persona: f.persona, relation: f.relation || 'stranger',
            realmIdx: f.realmIdx || 0, layer: f.layer || 1, power: Math.round(fellowPower(f)),
          };
          break;
        }
      }
    }
    if (!opp) opp = match();
    if (!opp) return { ok: false, reason: '暂无道友可一战，待广结仙缘后再来。' };

    const mySchool = p.school || 'jian';
    const pp = playerPower();
    const op = Math.max(1, opp.power);
    // 流派克制（固定于整场）：我克对面 / 对面克我 / 无克制
    const cmP = COUNTER[mySchool] === opp.school ? COUNTER_MULT : 1;
    const cmO = COUNTER[opp.school] === mySchool ? COUNTER_MULT : 1;
    const counter = cmP > 1 ? 'win' : (cmO > 1 ? 'lose' : 'none');

    // 三局两胜：每局 战力×克制×随机0.9~1.1
    const rounds = [];
    let pw = 0, ow = 0;
    while (pw < 2 && ow < 2) {
      const pr = pp * cmP * XG.util.rand(0.9, 1.1);
      const or_ = op * cmO * XG.util.rand(0.9, 1.1);
      const win = pr >= or_;
      rounds.push(win);
      if (win) pw++; else ow++;
    }
    const win = pw === 2;

    // 积分：胜 +30 / 负 -15，按对手强度比 r 浮动（胜强越多、负弱掉越多）
    const r = op / Math.max(1, pp);
    let delta;
    if (win) delta = Math.round(WIN_PTS * XG.util.clamp(r, 0.6, 1.6));
    else delta = -Math.round(LOSE_PTS * XG.util.clamp(1 / r, 0.6, 1.6));
    // 隐藏·越阶挑战：对手战力 ≥1.3 倍仍获胜，额外 +5
    const upset = win && r >= UPSET_RATIO;
    if (upset) delta += UPSET_BONUS;

    const tierBefore = tierOf(p.pts);
    p.pts = Math.max(0, p.pts + delta);
    const tierAfter = tierOf(p.pts);
    const tierUp = tierAfter.idx > tierBefore.idx;
    const tierDown = tierAfter.idx < tierBefore.idx;

    // 战绩与统计
    if (win) { p.wins++; p.streak++; statsAdd('pvp_wins'); } else { p.losses++; p.streak = 0; statsAdd('pvp_losses'); }
    statsAdd('pvp_matches');
    const stats = (XG.state.stats = XG.state.stats || {});
    if (p.pts > (stats.pvp_pts_max || 0)) stats.pvp_pts_max = p.pts; // 积分历史峰值（check.k=pvpPts）
    if (upset) statsAdd('pvp_upsets');

    // 每日前 5 场发奖励（灵石+修为），之后仅 pts
    let reward = null;
    if (dailyLeft() > 0) {
      const pl = XG.state.player;
      const realm = XG.cfg.REALMS[pl.realmIdx] || XG.cfg.REALMS[0];
      const baseRate = realm.rate * (1 + 0.12 * (pl.layer - 1)); // 境界基础产出（不含外部加成，防速通）
      const cult = Math.round(baseRate * (win ? 900 : 300) * XG.util.rand(0.9, 1.2)); // 胜≈15分钟 / 负≈5分钟
      const lingShi = Math.round(Math.pow(pl.realmIdx + 1, 1.5) * 200 * (win ? 1 : 0.4) * XG.util.rand(0.8, 1.3));
      grantCult(cult, win ? '论剑得胜' : '论剑惜败');
      XG.addRes({ lingShi: lingShi });
      reward = { cult: cult, lingShi: lingShi };
      XG.state.daily.pvpCount = dailyCount() + 1;
    }

    // 战报（≤20 条，新→旧）
    const rival = opp.relation === 'rival';
    p.history.unshift({
      t: Date.now(), name: opp.name, uid: opp.uid, win: win,
      delta: delta, pts: p.pts, rounds: rounds, rival: rival,
    });
    if (p.history.length > HISTORY_CAP) p.history.length = HISTORY_CAP;

    // 跨系统事件（payload 约定 {win, pts}，附 delta 便于订阅方播报）
    if (XG.bus) XG.bus.emit('pvp:result', { win: win, pts: p.pts, delta: delta });

    // 宿敌联动：优先交 fellows 系统发战书；未就位则自行用 war 文案池兜底
    if (rival) {
      const fs = XG.sys.fellows;
      let handled = false;
      if (fs && typeof fs.onRivalBattle === 'function') {
        try { fs.onRivalBattle(win, opp.uid); handled = true; } catch (e) { handled = false; }
      }
      if (!handled) {
        const war = (XG.data && XG.data.fellows && XG.data.fellows.lines && XG.data.fellows.lines.war) || [];
        const line = war.length ? XG.util.pick(war) : '「{name}，择日再战！」';
        pushNews('fellow', line.replace(/\{name\}/g, opp.name), 1);
      }
    }

    // 隐藏·欧皇送福：战胜欧皇 5% 概率额外掉 1 枚随机残篇
    if (win && opp.persona === 'ouhuang' && XG.util.chance(OUHUANG_FRAG_P)) {
      const gfId = randomFragGf();
      if (gfId) {
        grantFrag(gfId, 1);
        pushNews('player', '你与' + opp.name + '论剑得胜，对方兴致大发，随手赠你功法残篇一枚，欧气逼人。', 1);
      }
    }

    // 播报克制刷屏控制：仅段位变动 / 越阶 / 连胜节点发 news，普通场次静默（看战报即可）
    if (tierUp) pushNews('player', '论剑积分涨至 ' + p.pts + '，晋入「' + tierAfter.name + '」段位！', 1);
    else if (tierDown) pushNews('player', '论剑失利，积分滑落至 ' + p.pts + '，跌回「' + tierAfter.name + '」段位。', 0);
    if (upset) pushNews('player', '越阶挑战！你力克战力高你三成的' + opp.name + '，+' + UPSET_BONUS + ' 额外积分，一时传为佳话。', 1);
    if (win && (p.streak === 5 || p.streak === 10 || p.streak === 20)) {
      pushNews('player', '论剑台捷报：你已豪取 ' + p.streak + ' 连胜，四方修士闻风侧目。', 1);
    }

    if (XG.bus) XG.bus.emit('save:dirty');
    return {
      ok: true, win: win, rounds: rounds, opp: opp, counter: counter,
      delta: delta, pts: p.pts,
      tier: { id: tierAfter.id, name: tierAfter.name, min: tierAfter.min },
      tierUp: tierUp, tierDown: tierDown,
      reward: reward, dailyLeft: dailyLeft(), streak: p.streak,
      rival: rival, upset: upset,
    };
  }

  /* ---------------- 赛季奖励补领 ---------------- */
  function claimSeason() {
    const p = st();
    checkSeason();
    if (!p.pending.length) return { ok: false, reason: '暂无待补领的赛季奖励。' };
    let lingYu = 0;
    const frags = {};
    let lastSeason = '';
    for (const r of p.pending) {
      lingYu += r.lingYu || 0;
      for (const id in (r.frags || {})) frags[id] = (frags[id] || 0) + r.frags[id];
      lastSeason = r.season;
    }
    p.pending = [];
    p.claimed = lastSeason || p.claimed;
    if (lingYu > 0) XG.addRes({ lingYu: lingYu });
    for (const id in frags) grantFrag(id, frags[id]);
    statsAdd('pvp_season_claims');
    pushNews('player', '你补领了论剑赛季奖励：灵玉×' + lingYu + '、功法残篇×' +
      Object.keys(frags).reduce(function (a, k) { return a + frags[k]; }, 0) + '。', 1);
    if (XG.bus) XG.bus.emit('save:dirty');
    return { ok: true, count: 1, lingYu: lingYu, frags: frags };
  }

  /* ---------------- 查询接口（UI 对接面） ---------------- */
  function canFight() {
    if (!XG.cfg.isUnlocked('pvp')) return { ok: false, reason: '论剑台尚未开启（需金丹5层）。' };
    if (!oppPool().length) return { ok: false, reason: '暂无道友可一战。' };
    return { ok: true };
  }

  function getOverview() {
    const p = st();
    const tier = tierOf(p.pts);
    const next = tier.idx + 1 < TIERS.length ? TIERS[tier.idx + 1] : null;
    const span = next ? (next.min - tier.min) : 1;
    return {
      unlocked: XG.cfg.isUnlocked('pvp'),
      pts: p.pts,
      tier: { id: tier.id, name: tier.name, min: tier.min, idx: tier.idx },
      nextTier: next ? { id: next.id, name: next.name, min: next.min } : null,
      progress: next ? XG.util.clamp((p.pts - tier.min) / span, 0, 1) : 1,
      wins: p.wins, losses: p.losses, streak: p.streak,
      dailyLeft: dailyLeft(), dailyMax: DAILY_MAX,
      season: p.season, pending: XG.util.deepClone(p.pending),
      school: p.school, schoolName: schoolName(p.school),
      historyLen: p.history.length,
    };
  }

  function getHistory() { return XG.util.deepClone(st().history); }

  function getTiers() { return XG.util.deepClone(TIERS); }

  function getSchool() { return { id: st().school, name: schoolName(st().school) }; }

  function setSchool(id) {
    if (!COUNTER[id]) return false;
    st().school = id;
    if (XG.bus) XG.bus.emit('save:dirty');
    return true;
  }

  /* ---------------- 模块协议（契约 §10） ---------------- */
  XG.sys.pvp = {
    id: 'pvp',

    // 启动自恢复：修复状态、推导默认论剑流派、补做跨周结算
    init() {
      const p = st();
      if (!p.school) {
        const root = XG.state.player && XG.state.player.spiritRoot;
        p.school = ROOT2SCHOOL[root && root.type] || 'jian';
      }
      checkSeason();
    },

    // 每秒：跨周检测（代价极低，weekId 纯计算）
    tick(dt) { checkSeason(); },

    // 离线：补做赛季结算；有新待补领奖励时并入离线报告
    offline(dt) {
      const before = st().pending.length;
      const r = checkSeason();
      if (r && st().pending.length > before) {
        return { events: ['论剑上赛季（' + r.season + '）结算：' + r.tierName + '段位奖励待补领（灵玉×' + r.lingYu + '）'] };
      }
      return null;
    },

    // 本系统无属性加成，不实现 getMods

    // 对外接口
    canFight: canFight,
    match: match,
    fight: fight,
    getOverview: getOverview,
    getHistory: getHistory,
    claimSeason: claimSeason,
    getSchool: getSchool,
    setSchool: setSchool,
    getTiers: getTiers,
    fellowPower: fellowPower,
  };
  XG.sysOrder.push('pvp');
})();
