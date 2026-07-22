/* glue.js：跨系统胶水层（联调阶段补）——并行开发的系统之间预定接口的最终对接
 *
 * 职责（全部在 init 中执行，init 由 main.js 在其余系统之后统一调用）：
 * 0. 主循环 tick 分发：main.js 只 emit bus 'tick'，除 adventure 自订阅外其余系统的
 *    tick(dt) 方法无人调用；glue 订阅 bus 'tick' 按 sysOrder 分发（跳过 adventure/自身）。
 * 1. 突破丹药增益串联：包装 cultivation.getBreakInfo / tryBreakthrough，
 *    把 alchemy 已服破境丹 buff（state.alchemy.breakPills，经 getBreakBuffBonus/consumeBreakBuffs）
 *    真正计入大境界突破成功率；判定后（成败皆耗）清空 buff。
 *    —— cultivation 自身的 pillIds 路径消耗的是背包丹药，与 alchemy 已服 buff 互不重复：
 *       背包丹按 pillIds 耗一次，已服 buff 耗一次，两条路径各自只计一次。
 * 2. cultivation.washRootFree() / lightMeridianFree(n)：adventure 奇遇奖励用的免费版别名，
 *    基于公开的 washRoot/lightMeridian 实现（垫付消耗→调用→回收/恢复，不耗玩家资源）。
 * 3. pets.feedTeamExp(n, src)：别名到 pets.addTeamExp（alchemy 服兽丹优先调此名）。
 * 4. fellows.onRivalBattle(win, uid)：pvp 宿敌战后调用——按 data/fellows 的 war 文案池
 *    发一条宿敌战书 news（复用 fellows 的 fellow 传闻风格：落 state.news + emit news/fellow:news）。
 * 5. reincarn 自定义键（dunwuRatePct/advRatePct/marketDiscPct 等）已由 reincarn.getMods
 *    输出，core/stats.js calc() 以 Object.assign({}, mods) 全键透传（已读码确认，无需修补）；
 *    glue.getMods() 返回空对象，不重复加计。三个消费方接通情况：
 *    - advRatePct → 本文件 §5 包装 adventure.tick/offline（cd 流逝速率 ×(1+pct/100)）。
 *    - dunwuRatePct → cultivation.js dunwuChancePerSec() 闭包不可达，已在该文件内做最小乘法修补。
 *    - marketDiscPct → fellows.js genMarket() 闭包不可达，已在该文件内做最小乘法修补（7 折下限）。
 *
 * 原则：不修改其余 13 个 sys 文件；所有对接均为防御性包装（目标缺失则跳过）。
 * （例外：上述两个闭包内概率/价格无法外部包装，按任务授权做了一行级最小修补。）
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  function alchemy() { return XG.sys && XG.sys.alchemy; }

  // ============================ 0. 主循环 tick 分发 ============================
  // main.js 主循环只 emit bus 'tick'（契约 §13）；而契约 §10 约定各系统暴露 tick(dt) 方法由调度器调用。
  // 实际只有 adventure 自订阅了 bus 'tick'，其余系统的 tick(dt) 无人调用——
  // 导致修为不累积、丹炉不结算、坊市不刷新、道友不成长等。glue 在此架桥：
  // 订阅 bus 'tick'，按 sysOrder 分发到各系统 tick(dt)（跳过 adventure，避免双重步进；跳过自身）。
  function bridgeTick() {
    XG.bus.on('tick', function (p) {
      const dt = (p && p.dt) || 1;
      const order = XG.sysOrder || [];
      for (const id of order) {
        if (id === 'glue' || id === 'adventure') continue;
        const m = XG.sys && XG.sys[id];
        if (m && typeof m.tick === 'function') {
          try { m.tick(dt); } catch (e) { console.error('[glue] ' + id + '.tick() 出错', e); }
        }
      }
    });
  }

  // ============================ 1. 突破丹药增益串联 ============================
  function wrapBreakthrough() {
    const cult = XG.sys.cultivation;
    if (!cult) return;

    // getBreakInfo 包装：大境界时把已服破境丹 buff 计入 baseRate/rateWith（预览与实算同源）
    const origInfo = cult.getBreakInfo.bind(cult);
    cult.getBreakInfo = function () {
      const info = origInfo();
      const al = alchemy();
      if (info && info.big && al && typeof al.getBreakBuffBonus === 'function') {
        let bonus = 0;
        try { bonus = al.getBreakBuffBonus() || 0; } catch (e) { bonus = 0; }
        if (bonus > 0) {
          const base = (info.baseRate || 0) + bonus;
          info.breakBuffBonus = bonus; // 已服破境丹加值（小数，供 UI 展示）
          info.breakBuffs = typeof al.getBreakBuffs === 'function' ? al.getBreakBuffs() : [];
          info.baseRate = base;
          info.rateWith = function (n) {
            n = XG.util.clamp(Math.floor(n || 0), 0, info.pillMax || 3);
            return Math.min(0.98, base + n * XG.cfg.BREAK_PILL_BONUS);
          };
        }
      }
      return info;
    };

    // tryBreakthrough 包装：大境界突破判定后清空已服破境丹 buff（与背包丹同规，成败皆耗）
    const origTry = cult.tryBreakthrough.bind(cult);
    cult.tryBreakthrough = function (pillIds) {
      const res = origTry(pillIds);
      const al = alchemy();
      if (res && res.ok && res.big && al && typeof al.consumeBreakBuffs === 'function') {
        try { al.consumeBreakBuffs(); } catch (e) { console.error('[glue] consumeBreakBuffs 出错', e); }
      }
      return res;
    };
  }

  // ============================ 2. 免费洗灵根 / 免费点穴别名 ============================
  function addFreeAliases() {
    const cult = XG.sys.cultivation;
    if (!cult) return;

    // 免费洗灵根（adventure 奇遇 rootWash 奖励）：垫付消耗 → 调原版 → 未成功收回垫付
    if (typeof cult.washRootFree !== 'function') {
      cult.washRootFree = function () {
        const cost = typeof cult._washCost === 'function' ? cult._washCost() : { lingYu: 0, mat: {} };
        const grant = { lingYu: cost.lingYu || 0, mat: {} };
        for (const id in (cost.mat || {})) grant.mat[id] = cost.mat[id];
        XG.addRes(grant); // 垫付后即被 washRoot 扣除，玩家资源净变化为 0
        const res = cult.washRoot();
        if (!res || !res.ok) { // 兜底：未洗成则收回垫付
          const back = { lingYu: -grant.lingYu, mat: {} };
          for (const id in grant.mat) back.mat[id] = -grant.mat[id];
          XG.addRes(back);
          return (res && res.err) || '洗练未成';
        }
        return res.msg || '灵根已重洗';
      };
    }

    // 免费点亮穴位（adventure 奇遇 meridian 奖励）：垫付修为点亮后恢复，按表序点 n 个前置已通的
    if (typeof cult.lightMeridianFree !== 'function') {
      cult.lightMeridianFree = function (n) {
        n = Math.max(1, Math.floor(n || 1));
        const list = typeof cult.getMeridians === 'function' ? cult.getMeridians() : [];
        const p = XG.state.player;
        const names = [];
        for (const m of list) {
          if (names.length >= n) break;
          if (m.lit || m.err === '前置穴位未通') continue; // 只点前置已通、自身未亮的
          const before = p.cult || 0;
          if (before < m.cost) p.cult = m.cost; // 垫付修为
          const res = cult.lightMeridian(m.id);
          p.cult = before; // 免费：恢复修为
          if (res && res.ok) names.push(res.name);
        }
        if (!names.length) return '经脉无可点之穴';
        return '点亮穴位「' + names.join('、') + '」';
      };
    }
  }

  // ============================ 3. pets.feedTeamExp 别名 ============================
  function aliasPets() {
    const pets = XG.sys.pets;
    if (pets && typeof pets.addTeamExp === 'function' && typeof pets.feedTeamExp !== 'function') {
      pets.feedTeamExp = function (n, src) { return pets.addTeamExp(n); };
    }
  }

  // ============================ 4. fellows.onRivalBattle 宿敌战书 ============================
  function patchFellows() {
    const fellows = XG.sys.fellows;
    if (!fellows || typeof fellows.onRivalBattle === 'function') return;
    fellows.onRivalBattle = function (win, uid) {
      const st = XG.state;
      const list = st.fellows || [];
      let f = null;
      for (const x of list) { if (x.uid === uid) { f = x; break; } }
      const pool = (XG.data && XG.data.fellows && XG.data.fellows.lines && XG.data.fellows.lines.war) || [];
      const tpl = pool.length ? XG.util.pick(pool) : '「{name}，择日再战！」';
      const playerName = (st.player && st.player.name) || '道友';
      const quote = String(tpl).replace(/\{name\}/g, playerName);
      const lead = f
        ? f.name + (win ? '败于你手，心有不甘，掷下战书：' : '胜你一局，意气正盛，掷下战书：')
        : '宿敌掷下战书：';
      const text = lead + quote;
      // 防御性 push state.news + emit（复用 fellows 的 fellow 传闻风格）
      st.news = st.news || [];
      const item = { t: Date.now(), cat: 'fellow', text: text, imp: 1 };
      st.news.unshift(item);
      const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
      if (st.news.length > cap) st.news.length = cap;
      st.stats = st.stats || {};
      st.stats.news_count = (st.stats.news_count || 0) + 1;
      XG.bus.emit('news', item);
      XG.bus.emit('fellow:news', { uid: uid || '', text: text, imp: 1, t: item.t });
      XG.bus.emit('save:dirty');
    };
  }

  // ============================ 5. adventure 奇遇率加成（轮回 advRatePct 透传键） ============================
  // adventure 的修炼奇遇为 cd 制（300~900s roll 一次，tick 内 a.cd -= dt）。
  // 此处包装 tick/offline 步进：dt ×(1+advRatePct/100)，等效于触发频率 ×(1+pct/100)。
  // adventure 自订阅 bus 'tick' 时是闭包内动态读 self.tick，故后包装仍生效；getCdRange 展示区间不变。
  function patchAdventure() {
    const adv = XG.sys.adventure;
    if (!adv || adv._advRateWrapped) return;
    function factor() {
      let pct = 0;
      try { pct = (XG.stats && XG.stats.get().advRatePct) || 0; } catch (e) { pct = 0; }
      if (!isFinite(pct)) pct = 0;
      return 1 + pct / 100;
    }
    if (typeof adv.tick === 'function') {
      const origTick = adv.tick.bind(adv);
      adv.tick = function (dt) { return origTick((Number(dt) || 0) * factor()); };
    }
    if (typeof adv.offline === 'function') {
      const origOffline = adv.offline.bind(adv);
      adv.offline = function (dt) { return origOffline((Number(dt) || 0) * factor()); };
    }
    adv._advRateWrapped = true;
  }

  // ============================ 系统注册（排最后，由 main.js 统一调 init） ============================
  XG.sys.glue = {
    id: 'glue',

    init() {
      try { bridgeTick(); } catch (e) { console.error('[glue] tick 分发失败', e); }
      try { wrapBreakthrough(); } catch (e) { console.error('[glue] 突破串联失败', e); }
      try { addFreeAliases(); } catch (e) { console.error('[glue] 免费别名失败', e); }
      try { aliasPets(); } catch (e) { console.error('[glue] 灵宠别名失败', e); }
      try { patchFellows(); } catch (e) { console.error('[glue] 宿敌战书失败', e); }
      try { patchAdventure(); } catch (e) { console.error('[glue] 奇遇率包装失败', e); }
    },

    // 属性聚合：空对象——reincarn 的 dunwuRatePct/advRatePct/marketDiscPct 等键
    // 已由 reincarn.getMods 输出并经 stats.calc 透传，glue 不重复加计
    getMods() { return {}; },
  };

  XG.sysOrder.push('glue');
})();
