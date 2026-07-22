/* cultivation.js：放置核心系统（契约 §10）——修为累积 / 三种修炼状态 / 突破 / 灵根洗练 / 经脉点亮 / 离线收益
 *
 * ============================ UI 对接面（下一批 UI 代理唯一接口依据） ============================
 * 全部通过 XG.sys.cultivation 调用；所有函数均可随时安全调用（内部做防御性校验）。
 *
 * 【修炼主页聚合】
 *   getCultView() → {
 *     realmIdx, realmName, layer, layers(=10), cult, cultText, cultRate, cultRateText,
 *     mode:'dazuo|biguan', modeName, modeMult, locked(闭关锁脉中), lockRemain(秒),
 *     dunwu:{ active, remain, mult, chancePerSec },
 *   }
 * 【模式切换】（打坐×1.0 / 闭关×2.0；入闭关即锁脉 10 分钟，锁内不可切出；顿悟非模式不可手选）
 *   getModeInfo()  → { mode, modeName, mult, modes:[{id,name,mult,desc}], locked, lockRemain }
 *   canSetMode(mode) → { can, err?, lockRemain? }
 *   setMode(mode)  → { ok, msg?, err?, lockRemain? }   // err 文案可直接 toast
 * 【突破】（小境界 100%；大境界 layer10 按 stats.breakRate + 破境丹，失败保底 +8%、只扣一半消耗）
 *   getBreakInfo() → {
 *     big(是否大境界突破), realmIdx, realmName, layer, targetText(目标文案), cost, costText,
 *     cult, enough(修为是否够), canBreak, err?,
 *     baseRate(大境界基础成功率含保底/功法), failBonus(breakFails*0.08),
 *     pills:[{ id, name, icon, grade, count }](seg 匹配当前境界的破境丹), pillMax(=3),
 *     rateWith(n) → 用 n 颗破境丹后的总成功率(0~0.98),
 *   }
 *   tryBreakthrough(pillIds) → { ok:false, err } | { ok:true, big, success, rate?, cost, msg }
 *     // pillIds 为选用的破境丹 id 数组（≤3，可空/省略）；小境界忽略丹药。msg 可直接 toast/pop。
 * 【灵根洗练】（耗灵玉+灵草重 roll 五行；小概率变异冰雷风暗光；混沌隐藏；变异 emit spirit:mutated）
 *   getRootInfo() → {
 *     type, typeName, mut, mutName, effId, effName, grade, mult, hidden, desc,
 *     washCost:{ lingYu, mat:{id:n} }, washCostText, canWash, washErr?,
 *     washBoost:{ active, pct, remain }(淬灵丹变异率加成),
 *   }
 *   washRoot() → { ok:false, err } | { ok:true, rootId, name, mutated, isHundun, mult, msg }
 * 【经脉点亮】（耗修为，need 前置校验；三条支线见 data/gongfa.js meridians）
 *   getMeridians() → [{ id, name, branch, cost, costText, eff, need, lit, can, err? }]（按表序）
 *   lightMeridian(id) → { ok:false, err } | { ok:true, id, name, msg }
 * 【顿悟】（随机触发，30 秒 ×5；受灵根/悟性丹加成）
 *   getDunwuInfo() → { active, remain, mult, chancePerSec, boost:{ active, pct, remain } }
 *
 * ============================ 跨系统接口（其他系统防御性调用） ============================
 *   addCult(n, src)            // 发修为奖励：加修为 + 屏幕跳字；src=来源文案（可省）
 *   addDunwuBoost(pct, durSec) // 悟性丹等：durSec 秒内顿悟触发率 +pct%（alchemy 服悟性丹后调用）
 *   addRootWashBoost(pct, durSec) // 淬灵丹(eff root val=3)：durSec 秒内洗练变异率 +pct 百分点
 *   tuona()                    // 手动吐纳（美术场景点击小人调用）：全局 0.8s 冷却，
 *                              // gain=当前 cultRate×20 → { ok:true, gain }；冷却中 → { ok:false, cd(秒) }
 *
 * ============================ 写入的 state.stats 键（snake，成就统计器读） ============================
 *   total_cult(累计获得修为) / news_count(本系统传闻条数) / dunwu_count(顿悟次数)
 *   break_success(大境界突破成功) / break_fail(大境界突破失败) / break_fail_streak_max(连败峰值)
 *   layer_up(小境界提升次数) / layer_max(小境界历史峰值) / realm_max(大境界历史峰值)
 *   spirit_wash(灵根洗练次数) / spirit_root_mut(灵根变异次数) / meridian_lit(点亮穴位数)
 *   tuona_count(手动吐纳次数)
 *
 * ============================ emit 的事件 ============================
 *   realm:layer {realmIdx, layer}（小境界提升）｜ realm:break {realmIdx, ok}（大境界结果）
 *   fx:breakthrough {realmIdx}（大境界成功特效）｜ spirit:mutated {rootId}（灵根变异）
 *   dunwu:start {until, mult} / dunwu:end {}（顿悟起止，自定义事件，供 UI/道友系统联动）
 *   tuona {gain}（手动吐纳一次，自定义事件，供美术场景监听联动）
 *   news {t,cat,text,imp}（顿悟/灵根变异；玩家突破高光由 fellows 系统统一播报，本系统不发）
 *   res:changed（每秒 tick 与修为变动）｜ save:dirty（突破/洗练/点穴后）
 *
 * offline 行为：dt 秒全额修为收益（无衰减，沿用当前模式倍率；离线顿悟按触发率折算次数，单次至多 3 次并补偿超额修为），返回 {cultGain, dunwuProcs}。
 * 隐藏内容：混沌灵根（hundun）仅在洗练变异池中权重 1 隐藏产出，mult×3 为全游戏最强灵根。
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  // ============================ 常量（数值纪律：口径对齐契约 §5/§9.3） ============================
  const MODES = {
    dazuo:  { name: '打坐', mult: 1.0, desc: '心平气和，吐纳天地。' },
    biguan: { name: '闭关', mult: 2.0, desc: '闭死关苦修，进境翻倍；入关即锁脉十分钟，期间不可切换。' },
  };
  const BIGUAN_LOCK_SEC = 120;   // 闭关锁脉时长（秒）
  const DUNWU_DUR_SEC = 30;      // 顿悟持续（秒）
  const DUNWU_MULT = 5;          // 顿悟修炼倍率
  const DUNWU_BASE_P = 1 / 900;  // 顿悟基础触发率（每秒，期望约 15 分钟一次；挂机三分钟内约两成几率遇见）
  const DUNWU_OFFLINE_CAP = 3;   // 单次离线结算最多折算顿悟次数
  const GRADE_COEF = 0.05;       // 灵根 grade 每超 1 级修炼 +5%（grade 上限 5，见 pills.js 补天壮骨丹）
  const WUXING = ['jin', 'mu', 'shui', 'huo', 'tu'];             // 五行灵根
  const MUT_IDS = ['bing', 'lei', 'feng', 'an', 'guang', 'hundun']; // 变异灵根（混沌隐藏）
  const WASH_MUT_BASE = 0.08;    // 洗练变异基础概率
  const PILL_CAP = 3;            // 单次突破最多服用破境丹数
  const BREAK_RATE_CAP = 0.98;   // 破境丹加持后的成功率封顶
  const TUONA_CD_MS = 800;       // 手动吐纳全局冷却（毫秒）
  const TUONA_SEC = 20;          // 手动吐纳单次收益 = 当前 cultRate × 秒数

  // 顿悟传闻文案池（古风，随机取一）
  const DUNWU_NEWS = [
    '你于吐纳间灵光乍现，顿有所悟，只觉天地灵气倒灌入体，修行一日千里！',
    '你观檐前雨滴，忽有所感，经脉中真元自转不息，竟是顿悟之兆！',
    '夜半静坐，你忽闻心中一声清鸣，如拨云见日，修为精进迅猛！',
    '你偶读残卷半句，豁然贯通，灵台清明，吐纳之效暴增数倍！',
    '你于梦中得高人指点一二，醒来只觉大道在眼前徐徐展开，顿悟陡生！',
    '你见庭前花开花落，忽悟枯荣之理，体内真元澎湃如潮，修行势如破竹！',
  ];

  // ============================ 内部辅助 ============================

  let tuonaLastAt = 0; // 手动吐纳上次触发时间戳（闭包态，不入存档）

  // stats 计数累加（懒初始化；snake 键名，成就统计器直接读）
  function bumpStat(k, n) {
    const st = XG.state;
    st.stats = st.stats || {};
    st.stats[k] = (st.stats[k] || 0) + (n || 1);
  }

  // stats 取历史峰值（只增不减）
  function setStatMax(k, v) {
    const st = XG.state;
    st.stats = st.stats || {};
    if ((st.stats[k] || 0) < v) st.stats[k] = v;
  }

  // 内部传闻助手：push 进 state.news（unshift，按 NEWS_CAP 截断）并 emit 'news'
  function pushNews(cat, text, imp) {
    const st = XG.state;
    st.news = st.news || [];
    const item = { t: Date.now(), cat: cat, text: text, imp: imp || 0 };
    st.news.unshift(item);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (st.news.length > cap) st.news.length = cap;
    XG.bus.emit('news', item);
    bumpStat('news_count', 1);
  }

  // 屏幕中央浮动跳字（UI 未接入时静默跳过）
  function pop(text, cls) {
    if (XG.ui && typeof XG.ui.pop === 'function') XG.ui.pop(text, cls);
  }

  // 灵根表查询（防御性：数据层缺失时返回 null）
  function rootDef(id) {
    const roots = XG.data && XG.data.gongfa && XG.data.gongfa.roots;
    if (!roots) return null;
    for (const r of roots) if (r.id === id) return r;
    return null;
  }

  // 当前生效灵根 id（变异优先于五行）
  function effRootId() {
    const sr = XG.state.player.spiritRoot;
    return (sr && sr.mut) || (sr && sr.type) || 'jin';
  }

  // 当前生效灵根倍率（数据缺失按 1.0）
  function effRootMult() {
    const def = rootDef(effRootId());
    return def ? def.mult || 1 : 1;
  }

  // 灵根 grade 修炼系数
  function gradeCoef() {
    const g = (XG.state.player.spiritRoot && XG.state.player.spiritRoot.grade) || 1;
    return 1 + GRADE_COEF * (Math.max(1, g) - 1);
  }

  // 顿悟是否进行中
  function dunwuActive() {
    const u = XG.state.player.dunwuUntil || 0;
    return u > Date.now();
  }

  // 顿悟每秒触发率：基础 × 灵根倍率 × 根骨系数 × (1+悟性丹加成/100) × (1+轮回顿悟率/100)
  function dunwuChancePerSec() {
    const p = XG.state.player;
    let boost = 0;
    const b = p.dunwuBoost;
    if (b && b.until > Date.now()) boost = b.pct || 0;
    // 轮回天赋/转世身份顿悟率加成（reincarn.getMods 输出、stats.calc 透传键 dunwuRatePct；防御性缺省 0）
    let talentPct = 0;
    try { talentPct = (XG.stats && XG.stats.get().dunwuRatePct) || 0; } catch (e) { talentPct = 0; }
    if (!isFinite(talentPct)) talentPct = 0;
    return DUNWU_BASE_P * effRootMult() * gradeCoef() * (1 + boost / 100) * (1 + talentPct / 100);
  }

  // 结束顿悟（到点调用）：清状态 + 刷新面板 + 提示
  function endDunwu() {
    XG.state.player.dunwuUntil = 0;
    if (XG.stats) XG.stats.invalidate();
    pop('顿悟结束，灵台复归清明。', '');
    XG.bus.emit('dunwu:end', {});
  }

  // 触发顿悟：30 秒 ×5 + news + pop
  function startDunwu() {
    const p = XG.state.player;
    p.dunwuUntil = Date.now() + DUNWU_DUR_SEC * 1000;
    if (XG.stats) XG.stats.invalidate();
    bumpStat('dunwu_count', 1);
    pushNews('player', XG.util.pick(DUNWU_NEWS), 1);
    pop('顿悟！' + DUNWU_DUR_SEC + '秒内修炼速度 ×' + DUNWU_MULT, 'gold');
    XG.bus.emit('dunwu:start', { until: p.dunwuUntil, mult: DUNWU_MULT });
    XG.bus.emit('save:dirty');
  }

  // 破境丹数据查询：返回 { recipeMap, avail:[{id,name,icon,grade,count}] }（eff.type='break' 且 seg 匹配当前 realmIdx）
  function breakPillInfo() {
    const recipes = (XG.data && XG.data.pills && XG.data.pills.recipes) || [];
    const map = {};
    for (const r of recipes) map[r.id] = r;
    const p = XG.state.player;
    const bag = XG.state.inv.pill || {};
    const avail = [];
    for (const id in bag) {
      const r = map[id];
      if (!r || !r.eff || r.eff.type !== 'break' || !r.seg) continue;
      if (p.realmIdx < r.seg[0] || p.realmIdx > r.seg[1]) continue;
      if ((bag[id] || 0) <= 0) continue;
      avail.push({ id: id, name: r.name, icon: r.icon, grade: r.grade, count: bag[id] });
    }
    avail.sort(function (a, b) { return a.grade - b.grade; });
    return { recipeMap: map, avail: avail };
  }

  // ============================ 系统模块 ============================
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  XG.sys.cultivation = {
    id: 'cultivation',

    // 启动自恢复：补齐本系统附加字段、矫正非法模式/灵根/穴位数据
    init() {
      const st = XG.state;
      const p = st.player;
      // 模式矫正（顿悟非模式，旧档残留一律归打坐）
      if (!MODES[p.cultivateMode]) p.cultivateMode = 'dazuo';
      // 附加瞬态字段（存档深合并会保留，缺省补 0）
      if (typeof p.biguanUntil !== 'number') p.biguanUntil = 0;   // 闭关锁脉截止 ts
      if (typeof p.dunwuUntil !== 'number') p.dunwuUntil = 0;     // 顿悟截止 ts
      if (!p.dunwuBoost || typeof p.dunwuBoost !== 'object') p.dunwuBoost = { pct: 0, until: 0 };
      if (!p.rootWashBoost || typeof p.rootWashBoost !== 'object') p.rootWashBoost = { pct: 0, until: 0 };
      // 灵根合法性
      p.spiritRoot = p.spiritRoot || { type: 'jin', grade: 3, mut: null };
      if (WUXING.indexOf(p.spiritRoot.type) < 0) p.spiritRoot.type = 'jin';
      if (p.spiritRoot.mut && MUT_IDS.indexOf(p.spiritRoot.mut) < 0) p.spiritRoot.mut = null;
      p.spiritRoot.grade = XG.util.clamp(p.spiritRoot.grade || 3, 1, 5);
      // 经脉列表合法性（剔除数据层已不存在的穴位）
      const table = (XG.data && XG.data.gongfa && XG.data.gongfa.meridians) || [];
      const known = {};
      for (const m of table) known[m.id] = 1;
      p.meridians = p.meridians || { lit: [] };
      if (!Array.isArray(p.meridians.lit)) p.meridians.lit = [];
      p.meridians.lit = p.meridians.lit.filter(function (id) { return known[id]; });
      // 历史峰值补登（老档兼容）
      setStatMax('layer_max', p.layer || 1);
      setStatMax('realm_max', p.realmIdx || 0);
    },

    // 每秒主循环：修为累积 + 顿悟状态机
    tick(dt) {
      const p = XG.state.player;
      // 顿悟到期结算
      if ((p.dunwuUntil || 0) > 0 && p.dunwuUntil <= Date.now()) endDunwu();
      // 修为累积（cultRate 已含模式/顿悟/灵根/经脉加成，见 getMods）
      const rate = XG.stats ? XG.stats.get().cultRate : 0;
      if (rate > 0 && dt > 0) {
        const gain = rate * dt;
        p.cult = (p.cult || 0) + gain;
        bumpStat('total_cult', gain);
      }
      // 顿悟随机触发（进行中不重复触发）
      if (!dunwuActive()) {
        const prob = dunwuChancePerSec() * dt;
        if (XG.util.chance(prob)) startDunwu();
      }
      XG.bus.emit('res:changed'); // 顶栏节流刷新点
    },

    // 离线结算：全额修为收益（无衰减，沿用当前模式倍率）+ 离线顿悟按机率折算，返回 {cultGain, dunwuProcs}
    offline(dt) {
      if (!dt || dt <= 0) return { cultGain: 0 };
      const rate = XG.stats ? XG.stats.get().cultRate : 0;
      const gain = rate * dt;
      if (gain > 0) {
        XG.state.player.cult = (XG.state.player.cult || 0) + gain;
        bumpStat('total_cult', gain);
      }
      // 离线顿悟（梦中机缘）：按每秒触发率 × 离线时长折算次数（单次结算至多 DUNWU_OFFLINE_CAP 次），
      // 每次补偿顿悟超出常速的部分修为 = rate × 持续秒 × (倍率-1)
      let procs = 0;
      let bonus = 0;
      if (rate > 0) {
        const exp = dunwuChancePerSec() * dt;
        procs = Math.floor(exp);
        if (XG.util.chance(exp - procs)) procs++;
        procs = Math.min(procs, DUNWU_OFFLINE_CAP);
        if (procs > 0) {
          bonus = procs * rate * DUNWU_DUR_SEC * (DUNWU_MULT - 1);
          XG.state.player.cult = (XG.state.player.cult || 0) + bonus;
          bumpStat('total_cult', bonus);
          bumpStat('dunwu_count', procs);
          pushNews('player', '你闭关静修，神游太虚之际灵光频现，梦中顿悟 ' + procs + ' 次，修为大进！', 1);
        }
      }
      return { cultGain: gain + bonus, dunwuProcs: procs, events: procs > 0 ? ['梦中顿悟 ×' + procs] : [] };
    },

    // 属性聚合（契约 §7）：穴位 eff 之和 + 灵根 mult 换算 + 模式加成 + 顿悟加成
    getMods() {
      const p = XG.state.player;
      const mods = {};
      // 经脉：全部已点亮穴位 eff 累加（cultRatePct/atkPct/defPct/hpPct/breakSuccPct/workPct/alchSuccPct/hpFlat 等）
      const table = (XG.data && XG.data.gongfa && XG.data.gongfa.meridians) || [];
      const lit = (p.meridians && p.meridians.lit) || [];
      const litSet = {};
      for (const id of lit) litSet[id] = 1;
      let meridianCultPct = 0;
      for (const m of table) {
        if (!litSet[m.id]) continue;
        for (const k in m.eff) {
          if (k === 'cultRatePct') meridianCultPct += m.eff[k]; // 修炼项单独处理（与倍率合并）
          else if (typeof m.eff[k] === 'number') mods[k] = (mods[k] || 0) + m.eff[k];
        }
      }
      // 修炼总倍率 = 灵根 mult × 根骨系数 × 模式倍率 × 顿悟倍率，换算为 cultRatePct 后叠加穴位平加项
      const modeMult = (MODES[p.cultivateMode] || MODES.dazuo).mult;
      const totalMult = effRootMult() * gradeCoef() * modeMult * (dunwuActive() ? DUNWU_MULT : 1);
      mods.cultRatePct = (mods.cultRatePct || 0) + (totalMult - 1) * 100 + meridianCultPct;
      return mods;
    },

    // ============================ 跨系统接口 ============================

    // 全项目统一发修为入口：加修为 + 跳字提示（契约·共同守则 5）
    addCult(n, src) {
      n = Number(n) || 0;
      if (n <= 0) return 0;
      const p = XG.state.player;
      p.cult = (p.cult || 0) + n;
      bumpStat('total_cult', n);
      pop('+' + XG.util.fmt(n) + ' 修为' + (src ? '（' + src + '）' : ''), 'cult');
      XG.bus.emit('res:changed');
      return n;
    },

    // 手动吐纳：全局 0.8s 冷却；收益 = 当前 cultRate × 20 秒（走 addCult 统一入口）
    tuona() {
      const now = Date.now();
      if (now - tuonaLastAt < TUONA_CD_MS) {
        return { ok: false, cd: Math.ceil((TUONA_CD_MS - (now - tuonaLastAt)) / 100) / 10 };
      }
      tuonaLastAt = now;
      const rate = XG.stats ? XG.stats.get().cultRate : 0;
      const gain = this.addCult(rate * TUONA_SEC, '吐纳');
      bumpStat('tuona_count', 1);
      XG.bus.emit('tuona', { gain: gain }); // 美术场景监听联动
      return { ok: true, gain: gain };
    },

    // 悟性丹等临时顿悟率加成（alchemy 服用后调用；重复调用覆盖为较优者）
    addDunwuBoost(pct, durSec) {
      const p = XG.state.player;
      pct = Number(pct) || 0;
      durSec = Number(durSec) || 0;
      if (pct <= 0 || durSec <= 0) return false;
      const now = Date.now();
      const cur = p.dunwuBoost || { pct: 0, until: 0 };
      // 已有更高加成且未到期则只顺延时间，否则覆盖
      if (cur.until > now && (cur.pct || 0) > pct) p.dunwuBoost = { pct: cur.pct, until: now + durSec * 1000 };
      else p.dunwuBoost = { pct: pct, until: now + durSec * 1000 };
      return true;
    },

    // 淬灵丹（eff root val=3）洗练变异率加成（数据约定 +25 百分点）
    addRootWashBoost(pct, durSec) {
      const p = XG.state.player;
      pct = Number(pct) || 0;
      durSec = Number(durSec) || 0;
      if (pct <= 0 || durSec <= 0) return false;
      const now = Date.now();
      const cur = p.rootWashBoost || { pct: 0, until: 0 };
      if (cur.until > now && (cur.pct || 0) > pct) p.rootWashBoost = { pct: cur.pct, until: now + durSec * 1000 };
      else p.rootWashBoost = { pct: pct, until: now + durSec * 1000 };
      return true;
    },

    // ============================ 修炼模式 ============================

    getModeInfo() {
      const p = XG.state.player;
      const now = Date.now();
      const locked = (p.biguanUntil || 0) > now;
      const modes = [];
      for (const id in MODES) modes.push({ id: id, name: MODES[id].name, mult: MODES[id].mult, desc: MODES[id].desc });
      return {
        mode: p.cultivateMode,
        modeName: (MODES[p.cultivateMode] || MODES.dazuo).name,
        mult: (MODES[p.cultivateMode] || MODES.dazuo).mult,
        modes: modes,
        locked: locked,
        lockRemain: locked ? Math.ceil((p.biguanUntil - now) / 1000) : 0,
      };
    },

    canSetMode(mode) {
      const p = XG.state.player;
      if (!MODES[mode]) return { can: false, err: '未知修炼方式' };
      if (mode === p.cultivateMode) return { can: true };
      const now = Date.now();
      if ((p.biguanUntil || 0) > now) {
        return { can: false, err: '闭关锁脉未解，尚需 ' + XG.util.fmtTime(Math.ceil((p.biguanUntil - now) / 1000)), lockRemain: Math.ceil((p.biguanUntil - now) / 1000) };
      }
      return { can: true };
    },

    // 切换模式；切入闭关即锁脉 10 分钟（UI 提示接口：err/lockRemain/msg 直接展示）
    setMode(mode) {
      const chk = this.canSetMode(mode);
      if (!chk.can) return { ok: false, err: chk.err, lockRemain: chk.lockRemain };
      const p = XG.state.player;
      if (mode === p.cultivateMode) return { ok: true, msg: '已是' + MODES[mode].name + '之中' };
      p.cultivateMode = mode;
      let msg = '改修「' + MODES[mode].name + '」，修炼速度 ×' + MODES[mode].mult;
      if (mode === 'biguan') {
        p.biguanUntil = Date.now() + BIGUAN_LOCK_SEC * 1000;
        msg += '；锁脉 ' + XG.util.fmtTime(BIGUAN_LOCK_SEC) + '，期间不可切换';
      }
      if (XG.stats) XG.stats.invalidate();
      XG.bus.emit('res:changed');
      XG.bus.emit('save:dirty');
      return { ok: true, msg: msg };
    },

    // ============================ 顿悟 ============================

    getDunwuInfo() {
      const p = XG.state.player;
      const now = Date.now();
      const b = p.dunwuBoost || { pct: 0, until: 0 };
      return {
        active: dunwuActive(),
        remain: dunwuActive() ? Math.ceil((p.dunwuUntil - now) / 1000) : 0,
        mult: DUNWU_MULT,
        chancePerSec: dunwuChancePerSec(),
        boost: { active: b.until > now, pct: b.pct || 0, remain: b.until > now ? Math.ceil((b.until - now) / 1000) : 0 },
      };
    },

    // ============================ 突破 ============================

    getBreakInfo() {
      const p = XG.state.player;
      const realms = XG.cfg.REALMS;
      const realm = realms[p.realmIdx] || realms[0];
      const big = (p.layer || 1) >= XG.cfg.LAYERS;
      const info = {
        big: big,
        realmIdx: p.realmIdx,
        realmName: realm.name,
        layer: p.layer,
        cult: p.cult || 0,
        pills: [],
        pillMax: PILL_CAP,
        failBonus: (p.breakFails || 0) * XG.cfg.BREAK_FAIL_BONUS,
      };
      // 飞升（末位境界）前无去路
      if (p.realmIdx >= realms.length - 1) {
        info.canBreak = false;
        info.err = '已至飞升绝巅，进无可进';
        info.targetText = '—';
        info.cost = Infinity;
        info.costText = '∞';
        info.enough = false;
        info.baseRate = 0;
        info.rateWith = function () { return 0; };
        return info;
      }
      const cost = XG.cfg.layerCost(p.realmIdx, p.layer);
      info.cost = cost;
      info.costText = XG.util.fmt(cost);
      info.enough = (p.cult || 0) >= cost;
      info.targetText = big ? ((realms[p.realmIdx + 1] || {}).name || '?') + '之境' : realm.name + ' ' + ((p.layer || 1) + 1) + ' 层';
      if (big) {
        const base = XG.stats ? XG.stats.get().breakRate : realm.breakRate + info.failBonus;
        info.baseRate = base;
        info.pills = breakPillInfo().avail;
        info.rateWith = function (n) {
          n = XG.util.clamp(Math.floor(n || 0), 0, PILL_CAP);
          return Math.min(BREAK_RATE_CAP, base + n * XG.cfg.BREAK_PILL_BONUS);
        };
      } else {
        info.baseRate = 1; // 小境界水到渠成，必成
        info.rateWith = function () { return 1; };
      }
      info.canBreak = info.enough;
      if (!info.enough) info.err = '修为不足，尚需 ' + XG.util.fmt(cost - (p.cult || 0));
      return info;
    },

    // 执行突破：消耗修为=cfg.layerCost(realmIdx,layer)；大境界按成功率判定，失败保底 +8%、只扣一半消耗
    tryBreakthrough(pillIds) {
      const p = XG.state.player;
      const info = this.getBreakInfo();
      if (!info.canBreak) return { ok: false, err: info.err || '机缘未至' };
      const cost = info.cost;

      // —— 小境界：100% 成功 ——
      if (!info.big) {
        p.cult -= cost;
        p.layer += 1;
        bumpStat('layer_up', 1);
        setStatMax('layer_max', p.layer);
        if (XG.stats) XG.stats.invalidate();
        XG.bus.emit('realm:layer', { realmIdx: p.realmIdx, layer: p.layer });
        XG.bus.emit('res:changed');
        XG.bus.emit('save:dirty');
        pop('突破至 ' + info.realmName + ' ' + p.layer + ' 层！', 'gold');
        return { ok: true, big: false, success: true, cost: cost, msg: '突破至 ' + info.realmName + ' ' + p.layer + ' 层！' };
      }

      // —— 大境界：校验并服用破境丹（≤3 颗，成败皆耗） ——
      const pillData = breakPillInfo();
      const useIds = [];
      if (Array.isArray(pillIds)) {
        for (const id of pillIds) {
          if (useIds.length >= PILL_CAP) break;
          if (useIds.indexOf(id) >= 0) continue;
          const found = pillData.avail.find(function (a) { return a.id === id; });
          if (found) useIds.push(id);
        }
      }
      for (const id of useIds) XG.addRes({ pill: { [id]: -1 } });

      const rate = info.rateWith(useIds.length);
      const success = XG.util.chance(rate);
      if (success) {
        p.cult -= cost;
        p.breakFails = 0;
        p.realmIdx += 1;
        p.layer = 1;
        bumpStat('break_success', 1);
        setStatMax('realm_max', p.realmIdx);
        setStatMax('layer_max', 1);
        if (XG.stats) XG.stats.invalidate();
        // 玩家突破高光的 news 由 fellows 系统统一播报（共同守则 7），本系统只发事件
        XG.bus.emit('realm:break', { realmIdx: p.realmIdx, ok: true });
        XG.bus.emit('fx:breakthrough', { realmIdx: p.realmIdx });
        XG.bus.emit('res:changed');
        XG.bus.emit('save:dirty');
        const name = (XG.cfg.REALMS[p.realmIdx] || {}).name || '?';
        return { ok: true, big: true, success: true, rate: rate, cost: cost, msg: '冲破玄关，踏入 ' + name + ' 之境！' };
      }
      // 失败：不清零修为只扣一半，保底成功率 +8%
      p.cult = Math.max(0, p.cult - cost / 2);
      p.breakFails = (p.breakFails || 0) + 1;
      bumpStat('break_fail', 1);
      setStatMax('break_fail_streak_max', p.breakFails);
      if (XG.stats) XG.stats.invalidate();
      XG.bus.emit('realm:break', { realmIdx: p.realmIdx, ok: false });
      XG.bus.emit('res:changed');
      XG.bus.emit('save:dirty');
      pop('突破失败，修为折损半数；道心愈坚，下次成功率 +' + Math.round(XG.cfg.BREAK_FAIL_BONUS * 100) + '%', 'warn');
      return { ok: true, big: true, success: false, rate: rate, cost: cost, msg: '突破失败，保底成功率已提升' };
    },

    // ============================ 灵根洗练 ============================

    // 洗练消耗：灵玉随大境界递增 + 五阶灵草（对齐洗髓丹成本量级）
    _washCost() {
      const p = XG.state.player;
      return { lingYu: 40 + 30 * (p.realmIdx || 0), mat: { herb_hansui: 1, herb_yusui: 1 } };
    },

    getRootInfo() {
      const p = XG.state.player;
      const sr = p.spiritRoot;
      const effId = effRootId();
      const def = rootDef(effId) || { name: '未知灵根', mult: 1, desc: '' };
      const tDef = rootDef(sr.type) || { name: '未知' };
      const mDef = sr.mut ? rootDef(sr.mut) : null;
      const cost = this._washCost();
      const canWash = XG.hasRes(cost);
      const matNames = [];
      const mats = (XG.data && XG.data.mats) || {};
      for (const id in cost.mat) matNames.push(((mats[id] || {}).name || id) + '×' + cost.mat[id]);
      const b = p.rootWashBoost || { pct: 0, until: 0 };
      const now = Date.now();
      return {
        type: sr.type, typeName: tDef.name,
        mut: sr.mut, mutName: mDef ? mDef.name : null,
        effId: effId, effName: def.name,
        grade: sr.grade, mult: def.mult || 1,
        hidden: !!def.hidden, desc: def.desc || '',
        washCost: cost,
        washCostText: '灵玉×' + cost.lingYu + '、' + matNames.join('、'),
        canWash: canWash,
        washErr: canWash ? null : '灵玉或灵草不足（需 ' + ('灵玉×' + cost.lingYu + '、' + matNames.join('、')) + '）',
        washBoost: { active: b.until > now, pct: b.pct || 0, remain: b.until > now ? Math.ceil((b.until - now) / 1000) : 0 },
      };
    },

    // 洗练：重 roll 五行；小概率变异（冰雷风暗光，混沌隐藏）；变异 emit spirit:mutated
    washRoot() {
      const p = XG.state.player;
      const cost = this._washCost();
      if (!XG.hasRes(cost)) return { ok: false, err: '灵玉或灵草不足，无法行洗练之礼' };
      // 扣费（灵玉 + 灵草）
      const delta = { lingYu: -cost.lingYu, mat: {} };
      for (const id in cost.mat) delta.mat[id] = -cost.mat[id];
      XG.addRes(delta);

      // 变异判定：基础 8% + 淬灵丹加成（数据约定 +25 百分点）
      const b = p.rootWashBoost || { pct: 0, until: 0 };
      const mutP = WASH_MUT_BASE + (b.until > Date.now() ? (b.pct || 0) / 100 : 0);
      const mutated = XG.util.chance(mutP);
      const sr = p.spiritRoot;
      let msg;
      if (mutated) {
        // 变异池按数据表权重 roll（冰6/雷5/风4/暗3/光2/混沌1——混沌隐藏，万中无一）
        const pool = [];
        for (const id of MUT_IDS) {
          const d = rootDef(id);
          if (d) pool.push(d);
        }
        const got = XG.util.weighted(pool, 'w') || pool[0];
        sr.type = XG.util.pick(WUXING); // 变异后五行基底重 roll
        sr.mut = got.id;
        bumpStat('spirit_root_mut', 1);
        XG.bus.emit('spirit:mutated', { rootId: got.id });
        if (got.id === 'hundun') {
          pushNews('player', '天现异象！你洗练灵根之际混沌气入体，竟觉醒传说中万中无一的【混沌灵根】！', 2);
          msg = '鸿蒙初判，混沌入体——觉醒【混沌灵根】！修炼加成 ×' + got.mult;
        } else {
          pushNews('player', '你洗练灵根时五行逆乱，竟变异觉醒【' + got.name + '】，修炼天赋脱胎换骨！', 1);
          msg = '灵根变异，觉醒【' + got.name + '】！修炼加成 ×' + got.mult;
        }
      } else {
        sr.type = XG.util.pick(WUXING); // 重 roll 五行（允许与原相同，欧非各安天命）
        sr.mut = null;
        const d = rootDef(sr.type) || { name: sr.type, mult: 1 };
        msg = '洗练已毕，灵根重塑为【' + d.name + '】';
      }
      bumpStat('spirit_wash', 1);
      if (XG.stats) XG.stats.invalidate();
      XG.bus.emit('res:changed');
      XG.bus.emit('save:dirty');
      pop(msg, mutated ? 'gold' : '');
      const effId = effRootId();
      const effDef = rootDef(effId) || { mult: 1 };
      return { ok: true, rootId: effId, name: effDef.name || effId, mutated: mutated, isHundun: sr.mut === 'hundun', mult: effDef.mult || 1, msg: msg };
    },

    // ============================ 经脉点亮 ============================

    getMeridians() {
      const p = XG.state.player;
      const table = (XG.data && XG.data.gongfa && XG.data.gongfa.meridians) || [];
      const lit = (p.meridians && p.meridians.lit) || [];
      const litSet = {};
      for (const id of lit) litSet[id] = 1;
      const cult = p.cult || 0;
      return table.map(function (m) {
        const isLit = !!litSet[m.id];
        let can = true, err = null;
        if (isLit) { can = false; err = '已点亮'; }
        else {
          for (const n of m.need) {
            if (!litSet[n]) { can = false; err = '前置穴位未通'; break; }
          }
          if (can && cult < m.cost) { can = false; err = '修为不足（需 ' + XG.util.fmt(m.cost) + '）'; }
        }
        return { id: m.id, name: m.name, branch: m.branch, cost: m.cost, costText: XG.util.fmt(m.cost), eff: m.eff, need: m.need, lit: isLit, can: can, err: err };
      });
    },

    // 点亮穴位：耗修为，need 前置校验
    lightMeridian(id) {
      const p = XG.state.player;
      const table = (XG.data && XG.data.gongfa && XG.data.gongfa.meridians) || [];
      const m = table.find(function (x) { return x.id === id; });
      if (!m) return { ok: false, err: '查无此穴' };
      const lit = (p.meridians && p.meridians.lit) || [];
      if (lit.indexOf(id) >= 0) return { ok: false, err: '此穴已通' };
      for (const n of m.need) {
        if (lit.indexOf(n) < 0) return { ok: false, err: '前置穴位未通，须循序渐进' };
      }
      if ((p.cult || 0) < m.cost) return { ok: false, err: '修为不足，尚需 ' + XG.util.fmt(m.cost - (p.cult || 0)) };
      p.cult -= m.cost;
      p.meridians.lit.push(id);
      bumpStat('meridian_lit', 1);
      if (XG.stats) XG.stats.invalidate();
      XG.bus.emit('res:changed');
      XG.bus.emit('save:dirty');
      const msg = '冲开「' + m.name + '」穴，' + m.branch + '经气又通一分';
      pop(msg, '');
      return { ok: true, id: id, name: m.name, msg: msg };
    },

    // ============================ 修炼主页聚合视图 ============================

    getCultView() {
      const p = XG.state.player;
      const realm = XG.cfg.REALMS[p.realmIdx] || XG.cfg.REALMS[0];
      const rate = XG.stats ? XG.stats.get().cultRate : 0;
      const mi = this.getModeInfo();
      const di = this.getDunwuInfo();
      return {
        realmIdx: p.realmIdx,
        realmName: realm.name,
        layer: p.layer,
        layers: XG.cfg.LAYERS,
        cult: p.cult || 0,
        cultText: XG.util.fmt(p.cult || 0),
        cultRate: rate,
        cultRateText: XG.util.fmt(rate) + '/秒',
        mode: mi.mode,
        modeName: mi.modeName,
        modeMult: mi.mult,
        locked: mi.locked,
        lockRemain: mi.lockRemain,
        dunwu: { active: di.active, remain: di.remain, mult: di.mult, chancePerSec: di.chancePerSec },
      };
    },
  };

  XG.sysOrder.push('cultivation');
})();
