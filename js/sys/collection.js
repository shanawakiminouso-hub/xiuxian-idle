/* collection.js：图鉴与成就系统（契约 §10 sys/collection.js；§9.8 成就统计器）
   =========================================================================
   【职责】
   1. 图鉴（state.codex）：每 tick 节流 3s 扫描登记——
        功法  state.gongfa.owned 的功法 id（含自创功法）
        丹方  state.alchemy.known 的丹方 id
        灵宠  拥有过的物种 id（state.codex.pet 只增不减，天然即历史并集）
        装备  state.equips.list 出现过的 baseId
        道友  已 met 的 uid → name（名字快照存 codex.fellowNames，轮回后仍可展示）
      新收录 emit 'codex:new' {kind,id} + 发 news（图鉴+1）；
      完成度 pct = 五类（功法25/丹方20/灵宠25/装备20/道友10）已收集/总量加权。
   2. 成就（state.ach）：实现 DATA_NOTES §2.2 全部 42 种 check.k 统计器（函数表导出为
      XG.sys.collection.metrics 供调试）；每 tick 节流 3s 遍历未达成成就，
      check 达成 → 置 done + 发 news + emit 'ach:done' {id}；
      玩家手动 claim 领奖（lingYu/lingShi 走 XG.addRes；eff 永久属性并入
      state.player.permEff，经 getMods 参与属性聚合）。
   =========================================================================
   【state 扩展键（本系统新增；save.js 默认值深合并自动保留多出的键）】
   - state.stats（守则3 共享计数表，全体系统懒初始化 snake 键）——本系统写入：
       news_count          累计传闻条数（订阅 'news' 事件自增；首次 init 以 state.news 长度为基线）
       night_login_last    最近一次计入子夜上线的日期串 'YYYY-M-D'
       night_login_streak  连续 0~6 点上线天数（nightLogin 统计源）
       layer_max           小境界层数历史峰值（layer 统计源：突破回落后峰值不丢）
       break_fail_max      连续突破失败历史峰值（breakFailStreak 统计源）
       pvp_pts_max         论剑积分历史峰值（pvpPts 统计源）
       tox_max             丹毒历史峰值（tox100 统计源）
       rich_ever           灵石曾 >1e6 则为 1（rich 统计源）
       equip_enh_max       装备强化等级历史峰值（equipEnhMax 统计源：装备销毁后峰值不丢）
     ——本系统只读（由对应系统按守则3 写入；缺失时容错为 0 或从 state 子树推导）：
       total_cult(cultivation 累计修为) / pill_make·pill_explode(alchemy) /
       forge_make(forge) / expedition_count(expedition) / tower_hidden_boss(dungeon) /
       help_fellow(fellows) / pet_breed·pet_awaken(pets)
   - state.codex.fellowNames = {uid:name} 道友图鉴名字快照
   - state.player.permEff  = {} 成就嘉奖给的永久属性（契约 §7 mods 键，getMods 输出）
   =========================================================================
   【缺失数据的推导约定（其他系统代理请对齐；本系统按下述口径兜底）】
   - 宠物实例物种字段：按 sp → species → spId → sid 顺序探测；
     血脉觉醒标记按 awaken → awakened → bloodAwake 探测，再与 stats.pet_awaken 取大。
   - 装备实例：底材读 baseId；品阶读 grade（缺则回查底材表 grade）；
     强化等级按 enh → enhance → lv 探测。
   - 地图解锁判定：普通图按 unlock 境界条件；隐藏图须 state.expedition.unlocked[mapId] 为真，
     或派遣日志/进行中派遣出现该图；cond 'youming_exp_30' 另以幽冥涧派遣日志≥30 次兜底直判
     （'guixu_bi_5' 因残璧献祭消耗无痕，仅以 unlocked/日志为准）。
   - nightLogin 由本系统在 init 与每次扫描时判定：0~6 点在线记一天，同日不重复，
     昨日有记录则连续天数+1，否则重置为 1。
   =========================================================================
   【UI 对接面】（本系统纯逻辑不含渲染；UI 一律经下列函数读写，事件见契约 §4）
   ■ 图鉴
   - getCodexSummary() → {
       pct:number,            // 总完成度 0~100（加权，保留 1 位小数）
       collected:number, total:number,                     // 五类合计
       cats:[{kind:'gongfa|pill|pet|equip|fellow', name:'功法|丹方|灵宠|装备|道友',
              icon:string, collected:number, total:number, pct:number}]  // pct 0~100 保留 1 位
     }
   - getCodexList(kind) → [{   // kind 见上；未收录且数据 hidden=true 的条目 name/icon/desc/getHint 占位为 ???
       id, name, icon, grade:number, hidden:bool, got:bool, desc:string, getHint:string
     }]                        // fellow 类：id=uid，grade 恒 0，未结识的当前道友以 ??? 占位
   ■ 成就
   - getAchCats() → [{cat, name, total, done, claimable}]   // claimable=可领标记数（done 且未领）
   - getAchSummary() → {total, done, claimed, claimable, pct}  // pct=done/total*100 取整
   - getAchList(cat?) → [{    // 传 cat 过滤；hidden 且未达成：name/icon/desc 显示 ???，
       id, cat, hidden, name, icon, desc,      //   cur/target/reward 置 null（隐藏成就占位）
       done:bool, claimed:bool, canClaim:bool, // canClaim=可领标记
       cur:number|null, target:number|null, progress:number,  // progress 0~1
       reward:{lingYu?,lingShi?,eff?}|null
     }]
   - claim(id)   → {ok:bool, msg:string, reward?}   // 手动领奖；未达成/已领取 ok:false
   - claimAll()  → {ok, count, reward:{lingYu,lingShi,eff}, msg}  // 一键领取全部可领
   ■ 调试
   - metricValue(k) → number          // 任一 check.k 当前值（非法 k 返回 0）
   - XG.sys.collection.metrics        // 42 种统计器函数表 {k: fn(state)→number}
   ■ 事件（bus，UI 订阅刷新角标/弹喜报）
   - 'codex:new' {kind,id} 图鉴新增；'ach:done' {id} 成就达成；'news' 传闻播报
   ========================================================================= */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  const SCAN_SEC = 3; // 图鉴扫描 / 成就评估节流（秒）

  // 图鉴五类定义：kind → 展示名 / 图标 / 数据源（fellow 为动态生成，无静态表）
  const KIND_ORDER = ['gongfa', 'pill', 'pet', 'equip', 'fellow'];
  const KINDS = {
    gongfa: { name: '功法', icon: '📜', data: function () { return (XG.data.gongfa && XG.data.gongfa.list) || []; } },
    pill:   { name: '丹方', icon: '⚗️', data: function () { return (XG.data.pills && XG.data.pills.recipes) || []; } },
    pet:    { name: '灵宠', icon: '🐾', data: function () { return (XG.data.pets && XG.data.pets.species) || []; } },
    equip:  { name: '装备', icon: '🗡️', data: function () { return (XG.data.equips && XG.data.equips.bases) || []; } },
    fellow: { name: '道友', icon: '🤝', data: null },
  };
  // 完成度加权（合计 100）
  const WEIGHTS = { gongfa: 25, pill: 20, pet: 25, equip: 20, fellow: 10 };

  // 成就分类展示名
  const ACH_CATS = [
    { cat: 'cult', name: '修炼' }, { cat: 'gongfa', name: '功法' }, { cat: 'pill', name: '炼丹' },
    { cat: 'equip', name: '装备' }, { cat: 'pet', name: '灵宠' }, { cat: 'cave', name: '洞府' },
    { cat: 'explore', name: '历练' }, { cat: 'dungeon', name: '秘境' }, { cat: 'pvp', name: '论剑' },
    { cat: 'fellow', name: '道友' }, { cat: 'reincarn', name: '轮回' }, { cat: 'fun', name: '杂趣' },
  ];

  /* ---------------- 内部小工具 ---------------- */

  // 数值容错：非有限数一律归 0
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }

  // 懒初始化共享计数表（守则3）
  function lazyStats() { const st = XG.state; return (st.stats = st.stats || {}); }
  // 读共享计数（容错 0）
  function statN(k) { const s = XG.state && XG.state.stats; return num(s && s[k]); }

  // 懒初始化图鉴结构（容错旧档缺键）
  function lazyCodex() {
    const st = XG.state;
    const cd = (st.codex = st.codex || {});
    cd.gongfa = cd.gongfa || [];
    cd.pill = cd.pill || [];
    cd.pet = cd.pet || [];
    cd.equip = cd.equip || [];
    cd.fellow = cd.fellow || [];
    cd.fellowNames = cd.fellowNames || {}; // 扩展：道友名字快照
    return cd;
  }

  // 传闻推送助手（守则7）：unshift 进 state.news 按 NEWS_CAP 截断，并 emit 'news'
  function pushNews(n) {
    const st = XG.state;
    st.news = st.news || [];
    st.news.unshift(n);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (st.news.length > cap) st.news.length = cap;
    XG.bus.emit('news', n);
  }

  // 数据表 id → 元素 索引（data 层静态，构建一次缓存）
  let _maps = null;
  function dataMaps() {
    if (_maps) return _maps;
    const gf = {}, pill = {}, sp = {}, eqb = {}, persona = {}, school = {};
    KINDS.gongfa.data().forEach(function (g) { if (g) gf[g.id] = g; });
    KINDS.pill.data().forEach(function (r) { if (r) pill[r.id] = r; });
    KINDS.pet.data().forEach(function (s) { if (s) sp[s.id] = s; });
    KINDS.equip.data().forEach(function (b) { if (b) eqb[b.id] = b; });
    const fd = XG.data.fellows || {};
    (fd.personas || []).forEach(function (p) { if (p) persona[p.id] = p; });
    (fd.schools || []).forEach(function (s) { if (s) school[s.id] = s; });
    _maps = { gf: gf, pill: pill, sp: sp, eqb: eqb, persona: persona, school: school };
    return _maps;
  }

  // 功法名解析（数据表查不到时回查自创功法）
  function gongfaName(id) {
    const g = dataMaps().gf[id];
    if (g) return g.name;
    const cus = (XG.state.gongfa && XG.state.gongfa.custom) || [];
    for (let i = 0; i < cus.length; i++) if (cus[i] && cus[i].id === id) return cus[i].name || id;
    return id;
  }

  // 宠物实例物种 id 探测（sp → species → spId → sid）
  function petSpId(pt) {
    if (!pt) return null;
    return pt.sp || pt.species || pt.spId || pt.sid || null;
  }

  // 装备实例强化等级探测（enh → enhance → lv）
  function equipEnh(e) {
    if (!e) return 0;
    return num(e.enh != null ? e.enh : (e.enhance != null ? e.enhance : e.lv));
  }

  // 装备实例品阶探测（实例 grade → 底材表 grade）
  function equipGrade(e) {
    if (!e) return 0;
    const g = num(e.grade);
    if (g) return g;
    const b = e.baseId && dataMaps().eqb[e.baseId];
    return b ? num(b.grade) : 0;
  }

  // 地图是否已解锁（隐藏图判定见文件头推导约定）
  function mapUnlocked(m, st) {
    if (!m) return false;
    const p = st.player || {};
    const u = m.unlock || { realmIdx: 0, layer: 1 };
    const rIdx = num(p.realmIdx), lay = num(p.layer);
    const realmOk = rIdx > num(u.realmIdx) || (rIdx === num(u.realmIdx) && lay >= num(u.layer));
    if (!realmOk) return false;
    if (!m.hidden) return true;
    const ex = st.expedition || {};
    if (ex.unlocked && ex.unlocked[m.id]) return true; // expedition 系统登记为准
    const log = ex.log || [];
    let youmingCnt = 0;
    for (let i = 0; i < log.length; i++) {
      if (!log[i]) continue;
      if (log[i].mapId === m.id) return true; // 去过即视为已解锁
      if (log[i].mapId === 'youming') youmingCnt++;
    }
    const act = ex.active || [];
    for (let i = 0; i < act.length; i++) if (act[i] && act[i].mapId === m.id) return true;
    if (m.cond === 'youming_exp_30' && youmingCnt >= 30) return true; // cond 兜底直判
    return false;
  }

  /* ---------------- 峰值追踪（历史峰值类成就统计源） ---------------- */
  function trackPeaks() {
    const st = XG.state;
    const ss = lazyStats();
    const p = st.player || {};
    ss.layer_max = Math.max(num(ss.layer_max), num(p.layer));
    ss.break_fail_max = Math.max(num(ss.break_fail_max), num(p.breakFails));
    ss.pvp_pts_max = Math.max(num(ss.pvp_pts_max), num(st.pvp && st.pvp.pts));
    ss.tox_max = Math.max(num(ss.tox_max), num(p.toxicity));
    if (num(st.res && st.res.lingShi) > 1e6) ss.rich_ever = 1;
    let enh = num(ss.equip_enh_max);
    const list = (st.equips && st.equips.list) || [];
    for (let i = 0; i < list.length; i++) enh = Math.max(enh, equipEnh(list[i]));
    ss.equip_enh_max = enh;
  }

  /* ---------------- 子夜上线（nightLogin） ---------------- */
  function dayKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function trackNightLogin() {
    const h = new Date().getHours();
    if (h >= 6) return; // 0~5 点计为子夜在线
    const ss = lazyStats();
    const today = dayKey(new Date());
    if (ss.night_login_last === today) return; // 当日已计
    const yest = dayKey(new Date(Date.now() - 864e5));
    ss.night_login_streak = (ss.night_login_last === yest) ? num(ss.night_login_streak) + 1 : 1;
    ss.night_login_last = today;
  }

  /* ---------------- 图鉴扫描登记 ---------------- */
  function scanCodex() {
    const st = XG.state;
    const cd = lazyCodex();
    const added = [];
    const reg = function (kind, id, name) {
      if (!id || cd[kind].indexOf(id) >= 0) return;
      cd[kind].push(id);
      added.push({ kind: kind, id: id, name: name || id });
    };

    // 功法：已习得（含自创功法——自创功法一经创出即视为收录，不论是否已习得）
    const owned = (st.gongfa && st.gongfa.owned) || {};
    for (const id in owned) reg('gongfa', id, gongfaName(id));
    const cus = (st.gongfa && st.gongfa.custom) || [];
    for (let ci = 0; ci < cus.length; ci++) {
      if (cus[ci] && cus[ci].id) reg('gongfa', cus[ci].id, cus[ci].name || cus[ci].id);
    }

    // 丹方：已习得
    const known = (st.alchemy && st.alchemy.known) || [];
    for (let i = 0; i < known.length; i++) {
      const r = dataMaps().pill[known[i]];
      reg('pill', known[i], r ? r.name : known[i]);
    }

    // 灵宠：拥有过的物种（codex.pet 只增不减 = 历史并集）
    const pets = (st.pets && st.pets.list) || [];
    for (let i = 0; i < pets.length; i++) {
      const spId = petSpId(pets[i]);
      if (!spId) continue;
      const sp = dataMaps().sp[spId];
      reg('pet', spId, sp ? sp.name : spId);
    }

    // 装备：出现过的底材 baseId
    const eqs = (st.equips && st.equips.list) || [];
    for (let i = 0; i < eqs.length; i++) {
      const b = eqs[i] && eqs[i].baseId;
      if (!b) continue;
      const bd = dataMaps().eqb[b];
      reg('equip', b, bd ? bd.name : b);
    }

    // 道友：已 met（metAt / 有好感 / 赠过礼 任一佐证）
    const fellows = st.fellows || [];
    for (let i = 0; i < fellows.length; i++) {
      const f = fellows[i];
      if (!f || !f.uid) continue;
      if (!f.metAt && num(f.favor) <= 0 && num(f.gifts) <= 0) continue;
      if (f.name) cd.fellowNames[f.uid] = f.name; // 名字快照
      reg('fellow', f.uid, f.name);
    }

    // 广播：逐个 emit codex:new；news 少量逐条、批量合并（防首次补录刷屏）
    if (added.length) {
      for (let i = 0; i < added.length; i++) {
        XG.bus.emit('codex:new', { kind: added[i].kind, id: added[i].id });
      }
      const now = Date.now();
      if (added.length <= 3) {
        for (let i = 0; i < added.length; i++) {
          const a = added[i];
          pushNews({
            t: now, cat: 'system', imp: 0,
            text: '【图鉴】新收录「' + a.name + '」，' + KINDS[a.kind].name + '图鉴+1。',
          });
        }
      } else {
        pushNews({
          t: now, cat: 'system', imp: 0,
          text: '【图鉴】一举新收录 ' + added.length + ' 项，完成度已达 ' + codexPct() + '%。',
        });
      }
      XG.bus.emit('save:dirty');
    }
    return added;
  }

  /* ---------------- 图鉴完成度 ---------------- */
  // 单类总量（fellow 动态；gongfa 含自创）
  function codexTotal(kind) {
    const cd = lazyCodex();
    if (kind === 'fellow') {
      return Math.max((XG.state.fellows || []).length, (cd.fellow || []).length);
    }
    let t = KINDS[kind].data().length;
    if (kind === 'gongfa') t += ((XG.state.gongfa && XG.state.gongfa.custom) || []).length;
    return t;
  }
  // 单类完成情况
  function codexCat(kind) {
    const got = (lazyCodex()[kind] || []).length;
    const total = codexTotal(kind);
    const pct = total > 0 ? Math.min(100, Math.round(got / total * 1000) / 10) : 0;
    return { kind: kind, name: KINDS[kind].name, icon: KINDS[kind].icon, collected: got, total: total, pct: pct };
  }
  // 总完成度（加权，0~100 保留 1 位）
  function codexPct() {
    let sum = 0, wsum = 0;
    for (const k in WEIGHTS) {
      const c = codexCat(k);
      sum += WEIGHTS[k] * (c.total > 0 ? Math.min(100, c.collected / c.total * 100) : 0);
      wsum += WEIGHTS[k];
    }
    return wsum > 0 ? Math.round(sum / wsum * 10) / 10 : 0;
  }

  /* ---------------- 42 种成就统计器（DATA_NOTES §2.2 全清单） ---------------- */
  const metrics = {
    /* ===== 契约 §9.8 原列 24 种 ===== */
    realmIdx: function (st) { return num(st.player && st.player.realmIdx); },
    layer: function (st) { return Math.max(num(st.player && st.player.layer), statN('layer_max')); },
    totalCult: function () { return statN('total_cult'); }, // cultivation 记 stats.total_cult
    gongfaOwn: function (st) { return Object.keys((st.gongfa && st.gongfa.owned) || {}).length; },
    gongfaMaxLv: function (st) {
      let m = 0;
      const o = (st.gongfa && st.gongfa.owned) || {};
      for (const id in o) m = Math.max(m, num(o[id] && o[id].lv));
      return m;
    },
    pillMake: function () { return statN('pill_make'); },
    pillExplode: function () { return statN('pill_explode'); },
    equipEnhMax: function (st) {
      let m = statN('equip_enh_max');
      const list = (st.equips && st.equips.list) || [];
      for (let i = 0; i < list.length; i++) m = Math.max(m, equipEnh(list[i]));
      return m;
    },
    equipGod: function (st) {
      let c = 0;
      const list = (st.equips && st.equips.list) || [];
      for (let i = 0; i < list.length; i++) if (equipGrade(list[i]) >= 4) c++;
      return c;
    },
    petOwn: function (st) { return ((st.pets && st.pets.list) || []).length; },
    petGrade5: function (st) {
      let c = 0;
      const list = (st.pets && st.pets.list) || [];
      for (let i = 0; i < list.length; i++) {
        const pt = list[i];
        if (!pt) continue;
        if (num(pt.grade) === 5) { c++; continue; } // 实例自带品阶优先
        const sp = dataMaps().sp[petSpId(pt)];
        if (sp && num(sp.grade) === 5) c++;
      }
      return c;
    },
    caveLvSum: function (st) {
      let s = 0;
      const lv = (st.cave && st.cave.lv) || {};
      for (const k in lv) s += num(lv[k]);
      return s;
    },
    mapUnlock: function (st) {
      let c = 0;
      const maps = (XG.data.world && XG.data.world.maps) || [];
      for (let i = 0; i < maps.length; i++) if (mapUnlocked(maps[i], st)) c++;
      return c;
    },
    towerLayer: function (st) {
      const d = st.dungeon || {};
      return Math.max(num(d.towerBest), num(d.tower));
    },
    pvpWins: function (st) { return num(st.pvp && st.pvp.wins); },
    fellowFavorMax: function (st) {
      let m = 0;
      const fs = st.fellows || [];
      for (let i = 0; i < fs.length; i++) if (fs[i]) m = Math.max(m, num(fs[i].favor));
      return m;
    },
    fellowPartner: function (st) {
      if (st.player && st.player.partner) return 1;
      const fs = st.fellows || [];
      for (let i = 0; i < fs.length; i++) if (fs[i] && fs[i].relation === 'partner') return 1;
      return 0;
    },
    reincarn: function (st) { return num(st.player && st.player.reincarn); },
    codexPct: function () { return codexPct(); },
    newsCount: function (st) { return Math.max(statN('news_count'), (st.news || []).length); },
    helpFellow: function () { return statN('help_fellow'); },
    nightLogin: function () { return statN('night_login_streak'); },
    rich: function (st) { return (num(st.res && st.res.lingShi) > 1e6 || statN('rich_ever')) ? 1 : 0; },
    tox100: function (st) { return (num(st.player && st.player.toxicity) >= 100 || statN('tox_max') >= 100) ? 1 : 0; },

    /* ===== achievements.js 新增 18 种 ===== */
    alchLv: function (st) { return num(st.alchemy && st.alchemy.lv); },
    advDone: function (st) { return Object.keys((st.adventure && st.adventure.done) || {}).length; },
    breakFailStreak: function (st) { return Math.max(statN('break_fail_max'), num(st.player && st.player.breakFails)); },
    expeditionCount: function (st) {
      return Math.max(statN('expedition_count'), ((st.expedition && st.expedition.log) || []).length);
    },
    fellowEggFavorMax: function (st) {
      const egg = (XG.data.names && XG.data.names.egg) || [];
      let m = 0;
      const fs = st.fellows || [];
      for (let i = 0; i < fs.length; i++) {
        if (fs[i] && egg.indexOf(fs[i].name) >= 0) m = Math.max(m, num(fs[i].favor));
      }
      return m;
    },
    fellowRival: function (st) {
      let c = 0;
      const fs = st.fellows || [];
      for (let i = 0; i < fs.length; i++) if (fs[i] && fs[i].relation === 'rival') c++;
      return c;
    },
    forgeMake: function () { return statN('forge_make'); },
    gongfaCreateCount: function (st) { return ((st.gongfa && st.gongfa.custom) || []).length; },
    gongfaHidden: function (st) {
      let c = 0;
      const o = (st.gongfa && st.gongfa.owned) || {};
      for (const id in o) { const g = dataMaps().gf[id]; if (g && g.hidden) c++; }
      return c;
    },
    guardWave: function (st) { return num(st.dungeon && st.dungeon.guard); },
    hiddenMapUnlock: function (st) {
      let c = 0;
      const maps = (XG.data.world && XG.data.world.maps) || [];
      for (let i = 0; i < maps.length; i++) if (maps[i].hidden && mapUnlocked(maps[i], st)) c++;
      return c;
    },
    petAwaken: function (st) {
      let c = 0;
      const list = (st.pets && st.pets.list) || [];
      for (let i = 0; i < list.length; i++) {
        const pt = list[i];
        if (pt && (pt.awaken || pt.awakened || pt.bloodAwake)) c++;
      }
      return Math.max(c, statN('pet_awaken'));
    },
    petBreed: function () { return statN('pet_breed'); },
    playerEggName: function (st) {
      const egg = (XG.data.names && XG.data.names.egg) || [];
      return (st.player && egg.indexOf(st.player.name) >= 0) ? 1 : 0;
    },
    pvpPts: function (st) { return Math.max(num(st.pvp && st.pvp.pts), statN('pvp_pts_max')); },
    spiritRootMut: function (st) { return (st.player && st.player.spiritRoot && st.player.spiritRoot.mut) ? 1 : 0; },
    towerHiddenBoss: function () { return statN('tower_hidden_boss'); },
    totalOnlineH: function (st) { return Math.floor(num(st.totalOnlineSec) / 3600); },
  };

  /* ---------------- 成就评估 ---------------- */
  function evalAch() {
    const st = XG.state;
    st.ach = st.ach || {};
    const list = XG.data.ach || [];
    const newly = [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a || !a.id || !a.check) continue;
      const rec = st.ach[a.id];
      if (rec && rec.done) continue; // 只评估未达成
      const fn = metrics[a.check.k];
      if (!fn) continue;
      let cur = 0;
      try { cur = num(fn(st)); } catch (e) { cur = 0; }
      if (cur >= num(a.check.v)) {
        st.ach[a.id] = { done: 1, claimed: rec && rec.claimed ? 1 : 0 };
        newly.push(a);
      }
    }
    for (let i = 0; i < newly.length; i++) {
      const a = newly[i];
      pushNews({
        t: Date.now(), cat: 'system', imp: a.hidden ? 2 : 1,
        text: a.hidden
          ? '【成就】隐藏成就「' + a.name + '」达成！天机已现，速去领取嘉奖。'
          : '【成就】「' + a.name + '」达成！可前往领取嘉奖。',
      });
      XG.bus.emit('ach:done', { id: a.id });
    }
    if (newly.length) XG.bus.emit('save:dirty');
    return newly;
  }

  /* ---------------- 奖励发放 ---------------- */
  function grantReward(rw) {
    if (!rw) return;
    const delta = {};
    if (num(rw.lingYu)) delta.lingYu = rw.lingYu;
    if (num(rw.lingShi)) delta.lingShi = rw.lingShi;
    if (delta.lingYu || delta.lingShi) XG.addRes(delta);
    if (rw.eff && Object.keys(rw.eff).length) {
      const st = XG.state;
      const pe = (st.player.permEff = st.player.permEff || {});
      for (const k in rw.eff) pe[k] = num(pe[k]) + num(rw.eff[k]);
      if (XG.stats && XG.stats.invalidate) XG.stats.invalidate();
    }
    XG.bus.emit('save:dirty');
  }

  /* ---------------- 系统注册 ---------------- */
  XG.sys.collection = {
    id: 'collection',
    metrics: metrics, // 统计器函数表导出（调试 / UI 进度查询用）

    _acc: 0,       // 扫描节流累积
    _newsBound: false, // news 订阅防重复

    init() {
      const st = XG.state;
      lazyStats();
      lazyCodex();
      st.ach = st.ach || {};
      st.player = st.player || {};
      st.player.permEff = st.player.permEff || {};
      // 传闻计数：首次以存量 news 长度为基线，此后订阅 'news' 自增
      const ss = lazyStats();
      if (typeof ss.news_count !== 'number') ss.news_count = (st.news || []).length;
      if (!this._newsBound) {
        this._newsBound = true;
        XG.bus.on('news', function () {
          const s2 = XG.state && XG.state.stats;
          if (s2) s2.news_count = num(s2.news_count) + 1;
        });
      }
      trackNightLogin();
      trackPeaks();
      scanCodex(); // 老档补录
      evalAch();   // 已满足条件的成就即补达成
    },

    tick(dt) {
      this._acc += num(dt) || 1;
      if (this._acc < SCAN_SEC) return;
      this._acc = 0;
      trackNightLogin(); // 跨零点在线亦可计入（当日去重）
      trackPeaks();
      scanCodex();
      evalAch();
    },

    // 离线结算：补一次扫描+评估，把离线期间达成的成就/图鉴收入报告简讯
    offline(dt) {
      trackNightLogin();
      trackPeaks();
      const added = scanCodex();
      const newly = evalAch();
      const ev = [];
      if (newly.length) {
        ev.push('成就达成：' + newly.map(function (a) { return '「' + a.name + '」'; }).join('、'));
      }
      if (added.length) ev.push('图鉴新收录 ' + added.length + ' 项。');
      return ev.length ? { events: ev } : null;
    },

    // 永久属性参与属性聚合（契约 §7）
    getMods() {
      const pe = XG.state && XG.state.player && XG.state.player.permEff;
      return pe || {};
    },

    /* ================= UI 对接面 ================= */

    // 图鉴总览：{pct, collected, total, cats:[{kind,name,icon,collected,total,pct}]}
    getCodexSummary() {
      const cats = [];
      let collected = 0, total = 0;
      for (let i = 0; i < KIND_ORDER.length; i++) {
        const c = codexCat(KIND_ORDER[i]);
        cats.push(c);
        collected += c.collected;
        total += c.total;
      }
      return { pct: codexPct(), collected: collected, total: total, cats: cats };
    },

    // 图鉴分类列表：[{id,name,icon,grade,hidden,got,desc,getHint}]（hidden 未收录占位 ???）
    getCodexList(kind) {
      const cd = lazyCodex();
      if (kind === 'fellow') return this._fellowCodexList();
      if (!KINDS[kind]) return [];
      const gotSet = {};
      (cd[kind] || []).forEach(function (id) { gotSet[id] = 1; });
      const out = KINDS[kind].data().map(function (it) {
        const got = !!gotSet[it.id];
        const masked = it.hidden && !got;
        return {
          id: it.id,
          name: masked ? '???' : it.name,
          icon: masked ? '❓' : it.icon,
          grade: num(it.grade),
          hidden: !!it.hidden,
          got: got,
          desc: masked ? '???' : (it.desc || ''),
          getHint: masked ? '???' : (it.getHint || ''),
        };
      });
      // 自创功法（表外条目）已收录的补列于末
      if (kind === 'gongfa') {
        const cus = (XG.state.gongfa && XG.state.gongfa.custom) || [];
        for (let i = 0; i < cus.length; i++) {
          const c = cus[i];
          if (!c || !c.id || !gotSet[c.id]) continue;
          out.push({
            id: c.id, name: c.name || c.id, icon: c.icon || '🖋️', grade: num(c.grade),
            hidden: false, got: true, desc: c.desc || '自创功法。', getHint: '自创功法（化神解锁）。',
          });
        }
      }
      return out;
    },

    // 道友图鉴列表（内部）：已收录按快照/在册信息展示，未结识的当前道友 ??? 占位
    _fellowCodexList() {
      const st = XG.state;
      const cd = lazyCodex();
      const maps = dataMaps();
      const byUid = {};
      const fs = st.fellows || [];
      for (let i = 0; i < fs.length; i++) if (fs[i] && fs[i].uid) byUid[fs[i].uid] = fs[i];
      const out = [];
      for (let i = 0; i < cd.fellow.length; i++) {
        const uid = cd.fellow[i];
        const f = byUid[uid];
        const name = (f && f.name) || cd.fellowNames[uid] || uid;
        let desc = '旧识道友（此界已难觅其踪）。';
        if (f) {
          const pn = (maps.persona[f.persona] || {}).name || f.persona || '未知';
          const sn = (maps.school[f.school] || {}).name || f.school || '散修';
          desc = pn + ' · ' + sn + ' · 好感 ' + num(f.favor);
        }
        out.push({ id: uid, name: name, icon: '🤝', grade: 0, hidden: false, got: true, desc: desc, getHint: '' });
        delete byUid[uid];
      }
      for (const uid in byUid) {
        out.push({
          id: uid, name: '???', icon: '❓', grade: 0, hidden: false, got: false,
          desc: '尚未结识。', getHint: '论道、相助或坊市往来皆可结识。',
        });
      }
      return out;
    },

    // 成就分类总览：[{cat,name,total,done,claimable}]
    getAchCats() {
      const st = XG.state;
      const agg = {};
      const list = XG.data.ach || [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a) continue;
        const g = (agg[a.cat] = agg[a.cat] || { total: 0, done: 0, claimable: 0 });
        g.total++;
        const rec = st.ach && st.ach[a.id];
        if (rec && rec.done) {
          g.done++;
          if (!rec.claimed) g.claimable++;
        }
      }
      return ACH_CATS.map(function (c) {
        const g = agg[c.cat] || { total: 0, done: 0, claimable: 0 };
        return { cat: c.cat, name: c.name, total: g.total, done: g.done, claimable: g.claimable };
      });
    },

    // 成就总览：{total, done, claimed, claimable, pct}
    getAchSummary() {
      const st = XG.state;
      let total = 0, done = 0, claimed = 0, claimable = 0;
      const list = XG.data.ach || [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a) continue;
        total++;
        const rec = st.ach && st.ach[a.id];
        if (rec && rec.done) {
          done++;
          if (rec.claimed) claimed++;
          else claimable++;
        }
      }
      return { total: total, done: done, claimed: claimed, claimable: claimable, pct: total ? Math.floor(done / total * 100) : 0 };
    },

    // 成就列表（可按 cat 过滤；hidden 未达成 name/desc/reward/进度占位 ???/null）
    getAchList(cat) {
      const st = XG.state;
      const out = [];
      const list = XG.data.ach || [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a || (cat && a.cat !== cat)) continue;
        const rec = (st.ach && st.ach[a.id]) || {};
        const done = !!rec.done, claimed = !!rec.claimed;
        const masked = a.hidden && !done; // 隐藏成就达成前占位
        let cur = 0;
        if (!masked) {
          const fn = metrics[a.check && a.check.k];
          if (fn) { try { cur = num(fn(st)); } catch (e) { cur = 0; } }
        }
        const target = a.check ? num(a.check.v) : 0;
        out.push({
          id: a.id, cat: a.cat, hidden: !!a.hidden,
          name: masked ? '???' : a.name,
          icon: masked ? '❓' : a.icon,
          desc: masked ? '???' : a.desc,
          done: done, claimed: claimed, canClaim: done && !claimed,
          cur: masked ? null : cur,
          target: masked ? null : target,
          progress: masked ? 0 : (target > 0 ? XG.util.clamp(cur / target, 0, 1) : 0),
          reward: masked ? null : (a.reward || null),
        });
      }
      return out;
    },

    // 领取单个成就嘉奖
    claim(id) {
      const st = XG.state;
      st.ach = st.ach || {};
      const list = XG.data.ach || [];
      let a = null;
      for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) { a = list[i]; break; }
      if (!a) return { ok: false, msg: '成就不存在。' };
      const rec = st.ach[id];
      if (!rec || !rec.done) return { ok: false, msg: '成就尚未达成。' };
      if (rec.claimed) return { ok: false, msg: '嘉奖已领取。' };
      rec.claimed = 1;
      grantReward(a.reward);
      return { ok: true, msg: '领取「' + a.name + '」嘉奖。', reward: a.reward || {} };
    },

    // 一键领取全部可领嘉奖
    claimAll() {
      const st = XG.state;
      st.ach = st.ach || {};
      const agg = { lingYu: 0, lingShi: 0, eff: {} };
      let count = 0;
      const list = XG.data.ach || [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a) continue;
        const rec = st.ach[a.id];
        if (!rec || !rec.done || rec.claimed) continue;
        rec.claimed = 1;
        count++;
        const rw = a.reward || {};
        agg.lingYu += num(rw.lingYu);
        agg.lingShi += num(rw.lingShi);
        if (rw.eff) for (const k in rw.eff) agg.eff[k] = num(agg.eff[k]) + num(rw.eff[k]);
      }
      if (!count) return { ok: false, count: 0, reward: agg, msg: '暂无可领取的成就嘉奖。' };
      grantReward({ lingYu: agg.lingYu, lingShi: agg.lingShi, eff: agg.eff });
      return { ok: true, count: count, reward: agg, msg: '共领取 ' + count + ' 项成就嘉奖。' };
    },

    // 调试：任一 check.k 当前值
    metricValue(k) {
      const fn = metrics[k];
      if (!fn) return 0;
      try { return num(fn(XG.state)); } catch (e) { return 0; }
    },
  };

  XG.sysOrder.push('collection');
})();
