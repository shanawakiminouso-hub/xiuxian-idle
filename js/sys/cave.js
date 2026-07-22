/* cave.js：洞府经营系统（建筑升级 / 3x3 风水相生 / 灵田产出暂存池与一键领取 / 离线结算）
 *
 * ============================ UI 对接面（供 UI 代理调用，全部为同步函数） ============================
 *
 * ▶ 总览
 *   getInfo() → {
 *     unlocked: bool,                 // 是否已解锁（筑基1层，UI 也可自调 XG.cfg.isUnlocked('cave')）
 *     buildings: [BuildingView...],   // 6 栋建筑，顺序固定 jlz/lt/df/qs/sl/lm
 *     layout: LayoutView,             // 见下
 *     pool: PoolView,                 // 见下
 *   }
 *
 *   BuildingView = {
 *     id, name, icon, wx:'jin|mu|shui|huo|tu', wxName:'金木水火土',
 *     lv, cap,                        // 当前等级 / 当前等级上限（非灵脉=灵脉lv×2，另有硬顶 40；灵脉硬顶 25）
 *     built: bool,                    // lv≥1
 *     cell: -1|0..8,                  // 已摆放的格位，-1=未摆放
 *     fsPct,                          // 风水加成百分数（0/5/10…，相邻相生每对 +5）
 *     effText,                        // 当前生效效果文案（已含风水加成），如 '修炼速度 +12.6%'
 *     nextCost: {lingShi, mat:{id:n}} | null,   // 升至下一级消耗；满级为 null
 *     costText,                       // 消耗可读文案，如 '灵石1150 玄铁×2'
 *     canUp: bool,                    // 是否可升级（未满级且资材充足）
 *     upTip,                          // 不可升级原因文案（满级/灵脉不足/资材不足；可升级为 ''）
 *   }
 *
 *   LayoutView = {
 *     cells: [ {cell:0..8, id|null, name, icon, wx, wxName} ×9 ],   // 按格位 0~8 顺序（0 1 2 / 3 4 5 / 6 7 8）
 *     bonus: {buildingId: pct},      // 每栋建筑的风水总加成
 *     pairs: [PairView...],          // 全部相生对明细
 *     totalPairs: n,                 // 相生对数
 *   }
 *   PairView = { aCell, aId, aName, aWx, bCell, bId, bName, bWx, recv: buildingId, pct: 5 }
 *              // 语义：a 生 b（recv=bId），b 栋建筑效果 +5%
 *
 *   PoolView = { acc: 小数, whole: 整数(可收株数), ratePerHour, etaSec(下一株还需秒数,未建灵田为 null) }
 *
 * ▶ 操作（均返回 {ok, msg}，UI 直接 toast msg；quickCollect 返回 {msg:[...]}）
 *   upgrade(id)          升级/建造（0→1 即建造，自动摆入空格）。自动扣资材。
 *   place(id, cell)      把建筑摆到格位 0..8；目标格有建筑则互换；已摆放则移动。
 *   unplace(id)          从风水盘取下（建筑效果仍在，仅失去/改变相生关系）。
 *   autoLayout()         一键按五行相生自动排布全部已建建筑。
 *   quickCollect() → {msg:[...], empty?}   一键领取灵田暂存池，发放草药入背包。
 *
 * ▶ 查询
 *   fengshuiReport() → {pairs:[PairView...], bonus:{id:pct}, totalPairs}   // 风水加成明细
 *   getPool() → PoolView
 *   costFor(id) → {lingShi, mat:{id:n}} | null                             // 当前升级消耗预览
 *   effOf(id) → {cultRatePct?|alchSuccPct?|forgeSuccPct?|herbPerHour?|petCap?|workSlots?}  // 单建筑生效值（含风水）
 *
 * ▶ 供其他系统（pets 等）调用
 *   isBuilt(id) → bool                 // 灵田岗解锁：isBuilt('lt')
 *   getPetCapAdd() → int               // 兽栏提供的宠物上限加成（含风水取整）
 *   getWorkSlots() → int               // 兽栏提供的打工位总数（含风水取整）
 *   herbRatePerHour() → float          // 灵田自身每小时产草株数（含风水）
 *
 * ============================ 写入的 stats 键（state.stats，snake 懒初始化） ============================
 *   cave_upgrade   建筑升级/建造累计次数
 *   cave_collect   灵田一键领取累计次数
 *   cave_herb      灵田累计产出草药株数
 * （成就 caveLvSum 由 collection 统计器直接读 state.cave.lv 求和，本系统不写）
 *
 * ============================ emit 的事件 ============================
 *   'news'        {t, cat:'system', text, imp}   // 首建/逢5级/风水大成祥瑞（同时 push 进 state.news）
 *   'res:changed' / 'save:dirty'                  // 经 XG.addRes 自动发出
 *
 * ============================ 隐藏内容 ============================
 *   藏风聚气：风水相生对 ≥5 时一次性触发祥瑞（灵玉+8、传闻 imp:1），存档标记 state.cave.fsDone。
 *   灵田欧皇：每株草药 8% 为二阶、2% 为三阶灵草，领到三阶会额外上传闻。
 * ===================================================================================================
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  // ---------- 常量 ----------
  const WX_NAME = { jin: '金', mu: '木', shui: '水', huo: '火', tu: '土' };
  const GEN = { jin: 'shui', shui: 'mu', mu: 'huo', huo: 'tu', tu: 'jin' }; // 五行相生：金生水生木生火生土生金
  const FS_PAIR_PCT = 5;     // 每对相邻相生 +5% 建筑效果
  const MAX_LM = 25;         // 灵脉硬顶
  const MAX_OTHER = 40;      // 其余建筑硬顶（同时受灵脉 lv×2 限制）
  const LS_GROWTH = 2.2;     // 灵石消耗递增倍率

  // 建筑定义：costMat 为等级段材料表 [起始lv, 材料id1, 材料id2?]（数量统一 1+floor(lv/2)，取 lv 命中最后一段）
  const BUILDINGS = {
    jlz: {
      name: '聚灵阵', icon: '阵', wx: 'tu', lsBase: 500,
      desc: '镌刻聚灵符文，聚拢四方灵气，提升修炼速度。',
      effDesc: '修炼速度 +4%/级',
      costMat: [[0, 'ore_wuxingsha'], [5, 'ore_jingjin'], [10, 'ore_hantie'], [15, 'ore_xingchen']],
    },
    lt: {
      name: '灵田', icon: '田', wx: 'mu', lsBase: 800,
      desc: '引灵泉灌溉的药圃，自行孕育低阶灵草；建成后灵宠可来此打工。',
      effDesc: '每小时产灵草 12 株/级，并解锁灵宠灵田岗',
      costMat: [[0, 'herb_lingzhi'], [5, 'herb_renshen'], [10, 'herb_chiyancao'], [15, 'herb_hunyuancao']],
    },
    df: {
      name: '丹房', icon: '丹', wx: 'huo', lsBase: 1500,
      desc: '地火引入丹室，火候绵长稳定，炼丹成功率提升。',
      effDesc: '炼丹成功率 +2%/级',
      costMat: [[0, 'herb_qingling'], [5, 'herb_chiyang'], [10, 'herb_huolingzhi'], [15, 'herb_dihuo']],
    },
    qs: {
      name: '器室', icon: '器', wx: 'jin', lsBase: 2000,
      desc: '金石之气充盈的炼器之所，锤焰相济，炼器成功率提升。',
      effDesc: '炼器成功率 +2%/级',
      costMat: [[0, 'ore_xuantie'], [5, 'ore_miyin'], [10, 'ore_hantie'], [15, 'ore_xingchen']],
    },
    sl: {
      name: '兽栏', icon: '兽', wx: 'shui', lsBase: 1200,
      desc: '以灵木围栏、清泉饮兽，提升灵宠容纳上限与打工岗位。',
      effDesc: '灵宠上限 +1/级，打工位 +1/级',
      costMat: [[0, 'herb_huangjing'], [5, 'herb_heshouwu'], [10, 'herb_longxiancao'], [15, 'herb_hunyuancao']],
    },
    lm: {
      name: '灵脉', icon: '脉', wx: 'tu', lsBase: 3000,
      desc: '洞府地脉之眼，滋养全局修炼，并决定其余建筑的等级上限。',
      effDesc: '全局修炼速度 +2%/级；其余建筑等级上限 = 灵脉Lv×2',
      costMat: [[0, 'ore_xuantie', 'herb_lingzhi'], [5, 'ore_jingjin', 'herb_renshen'], [10, 'ore_hantie', 'herb_hunyuancao'], [15, 'ore_xingchen', 'herb_dihuo']],
    },
  };
  const BUILDING_IDS = ['jlz', 'lt', 'df', 'qs', 'sl', 'lm'];

  // 灵田产出池（按品阶分档，roll 权重 90/8/2）
  const POOL_G1 = ['herb_qingling', 'herb_ningxue', 'herb_ningshen', 'herb_ziye', 'herb_lingzhi', 'herb_fuling', 'herb_huangjing'];
  const POOL_G2 = ['herb_renshen', 'herb_heshouwu', 'herb_xuelian', 'herb_juling', 'herb_yuehua', 'herb_chiyang', 'herb_bingxin'];
  const POOL_G3 = ['herb_chiyancao', 'herb_longxiancao', 'herb_xuanbing', 'herb_huolingzhi', 'herb_digen', 'herb_jinxian'];

  // 自动排布优选格位（金→水→木→火→土连环相生，可得 5 对）
  const AUTO_CELLS = { qs: 0, sl: 1, lt: 2, df: 5, lm: 4, jlz: 8 };

  // ---------- 内部工具 ----------
  function caveState() {
    const st = XG.state;
    st.cave = st.cave || {};
    const c = st.cave;
    c.lv = c.lv || {};
    for (const id of BUILDING_IDS) {
      if (typeof c.lv[id] !== 'number') c.lv[id] = (id === 'jlz' || id === 'lm') ? 1 : 0;
    }
    c.pool = c.pool || { acc: 0 };
    c.layout = c.layout || {};
    return c;
  }
  function getLv(id) { return caveState().lv[id] || 0; }
  function capOf(id) {
    if (id === 'lm') return MAX_LM;
    return Math.min(MAX_OTHER, getLv('lm') * 2);
  }
  function bumpStat(k, n) {
    const st = XG.state;
    st.stats = st.stats || {};
    st.stats[k] = (st.stats[k] || 0) + (n || 1);
  }
  function pushNews(text, imp) {
    const news = { t: Date.now(), cat: 'system', text: text, imp: imp || 0 };
    const st = XG.state;
    st.news = st.news || [];
    st.news.unshift(news);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (st.news.length > cap) st.news.length = cap;
    XG.bus.emit('news', news);
  }
  function invalidate() {
    if (XG.stats && typeof XG.stats.invalidate === 'function') XG.stats.invalidate();
    XG.bus.emit('save:dirty');
  }
  function matName(id) {
    const m = (XG.data && XG.data.mats && XG.data.mats[id]) || null;
    return m ? m.name : id;
  }
  function matIcon(id) {
    const m = (XG.data && XG.data.mats && XG.data.mats[id]) || null;
    return m ? m.icon : '草';
  }

  // ---------- 升级消耗 ----------
  function costFor(id) {
    const b = BUILDINGS[id];
    if (!b) return null;
    const lv = getLv(id);
    if (lv >= capOf(id)) return null;
    const cost = { lingShi: Math.round(b.lsBase * Math.pow(LS_GROWTH, lv)), mat: {} };
    let band = b.costMat[0];
    for (const seg of b.costMat) { if (lv >= seg[0]) band = seg; }
    const n = 1 + Math.floor(lv / 2);
    for (let i = 1; i < band.length; i++) cost.mat[band[i]] = n;
    return cost;
  }
  function costText(cost) {
    if (!cost) return '—';
    const parts = ['灵石' + XG.util.fmt(cost.lingShi)];
    for (const id in cost.mat) parts.push(matName(id) + '×' + cost.mat[id]);
    return parts.join(' ');
  }

  // ---------- 风水（3x3 相邻相生） ----------
  // 格位：0 1 2 / 3 4 5 / 6 7 8；相邻=上下左右
  const ADJ = [[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8]];
  function computeFengshui() {
    const c = caveState();
    const pairs = [];
    const bonus = {};
    for (const e of ADJ) {
      const aId = c.layout[e[0]];
      const bId = c.layout[e[1]];
      if (!aId || !bId || !BUILDINGS[aId] || !BUILDINGS[bId]) continue;
      const wa = BUILDINGS[aId].wx, wb = BUILDINGS[bId].wx;
      let recv = null;
      if (GEN[wa] === wb) recv = bId;       // a 生 b → b +5%
      else if (GEN[wb] === wa) recv = aId;  // b 生 a → a +5%
      if (!recv) continue;
      bonus[recv] = (bonus[recv] || 0) + FS_PAIR_PCT;
      pairs.push({
        aCell: e[0], aId: aId, aName: BUILDINGS[aId].name, aWx: wa,
        bCell: e[1], bId: bId, bName: BUILDINGS[bId].name, bWx: wb,
        recv: recv, pct: FS_PAIR_PCT,
      });
    }
    return { pairs: pairs, bonus: bonus, totalPairs: pairs.length };
  }
  function fsPctOf(id) { return computeFengshui().bonus[id] || 0; }

  // ---------- 单建筑生效值（含风水） ----------
  function effOf(id) {
    const lv = getLv(id);
    if (lv < 1) return {};
    const mult = 1 + fsPctOf(id) / 100;
    switch (id) {
      case 'jlz': return { cultRatePct: 4 * lv * mult };
      case 'lm': return { cultRatePct: 2 * lv * mult };
      case 'df': return { alchSuccPct: 2 * lv * mult };
      case 'qs': return { forgeSuccPct: 2 * lv * mult };
      case 'lt': return { herbPerHour: 12 * lv * mult };
      case 'sl': return { petCap: lv + Math.floor(lv * fsPctOf(id) / 100), workSlots: lv + Math.floor(lv * fsPctOf(id) / 100) };
    }
    return {};
  }
  function effTextOf(id) {
    const e = effOf(id);
    if (id === 'jlz' && e.cultRatePct) return '修炼速度 +' + XG.util.fmt(e.cultRatePct) + '%';
    if (id === 'lm' && e.cultRatePct) return '全局修炼 +' + XG.util.fmt(e.cultRatePct) + '%，上限 Lv' + capOf('jlz');
    if (id === 'df' && e.alchSuccPct) return '炼丹成功率 +' + XG.util.fmt(e.alchSuccPct) + '%';
    if (id === 'qs' && e.forgeSuccPct) return '炼器成功率 +' + XG.util.fmt(e.forgeSuccPct) + '%';
    if (id === 'lt' && e.herbPerHour) return '每小时产灵草 ' + XG.util.fmt(e.herbPerHour) + ' 株';
    if (id === 'sl' && e.petCap) return '灵宠上限 +' + e.petCap + '，打工位 +' + e.workSlots;
    return '未建成';
  }

  // ---------- 摆放 ----------
  function cellOf(id) {
    const layout = caveState().layout;
    for (const k in layout) if (layout[k] === id) return Number(k);
    return -1;
  }
  function firstFreeCell() {
    const layout = caveState().layout;
    for (let i = 0; i < 9; i++) if (!layout[i]) return i;
    return -1;
  }
  function placeInternal(id, cell) {
    const c = caveState();
    const old = cellOf(id);
    const occ = c.layout[cell];
    if (old >= 0) delete c.layout[old];
    if (occ && occ !== id && old >= 0) c.layout[old] = occ; // 互换
    c.layout[cell] = id;
  }
  // 隐藏：藏风聚气——相生对 ≥5 一次性祥瑞
  function checkFsSecret() {
    const c = caveState();
    if (c.fsDone) return;
    const fs = computeFengshui();
    if (fs.totalPairs >= 5) {
      c.fsDone = 1;
      XG.addRes({ lingYu: 8 });
      pushNews('洞府五行连环相生，藏风聚气，一夜之间灵雾凝露，天降祥瑞（灵玉+8）。', 1);
    }
  }

  // ---------- 灵田产出 ----------
  function herbRatePerHour() {
    const e = effOf('lt');
    return e.herbPerHour || 0;
  }
  function rollHerb() {
    const r = Math.random();
    if (r < 0.02) return XG.util.pick(POOL_G3);
    if (r < 0.10) return XG.util.pick(POOL_G2);
    return XG.util.pick(POOL_G1);
  }

  // ---------- 模块 ----------
  XG.sys.cave = {
    id: 'cave',

    init() {
      const c = caveState();
      // 清洗 layout：去未知建筑/重复摆放/越界格位
      const seen = {};
      for (const k in c.layout) {
        const id = c.layout[k];
        const cell = Number(k);
        if (!BUILDINGS[id] || seen[id] || isNaN(cell) || cell < 0 || cell > 8) delete c.layout[k];
        else seen[id] = 1;
      }
      // 无摆放时自动把已建建筑放上风水盘
      if (Object.keys(c.layout).length === 0) {
        for (const id of BUILDING_IDS) {
          if (getLv(id) >= 1) {
            const cell = firstFreeCell();
            if (cell < 0) break;
            c.layout[cell] = id;
          }
        }
      }
    },

    tick(dt) {
      const c = caveState();
      const rate = herbRatePerHour();
      if (rate > 0) c.pool.acc += rate * dt / 3600;
    },

    offline(dt) {
      const rate = herbRatePerHour();
      if (rate <= 0) return null;
      const gain = rate * dt / 3600;
      caveState().pool.acc += gain;
      return { cave: { herb: gain, note: '灵田积蓄灵草约 ' + XG.util.fmt(gain) + ' 株' } };
    },

    getMods() {
      const mods = {};
      const j = effOf('jlz'); if (j.cultRatePct) mods.cultRatePct = (mods.cultRatePct || 0) + j.cultRatePct;
      const l = effOf('lm'); if (l.cultRatePct) mods.cultRatePct = (mods.cultRatePct || 0) + l.cultRatePct;
      const d = effOf('df'); if (d.alchSuccPct) mods.alchSuccPct = d.alchSuccPct;
      const q = effOf('qs'); if (q.forgeSuccPct) mods.forgeSuccPct = q.forgeSuccPct;
      return mods;
    },

    // ===== 操作 =====
    upgrade(id) {
      const b = BUILDINGS[id];
      if (!b) return { ok: false, msg: '无此建筑。' };
      const lv = getLv(id);
      const cap = capOf(id);
      if (lv >= cap) {
        return { ok: false, msg: id === 'lm' ? '灵脉已至当前极致。' : b.name + '已达上限，请先提升灵脉等级（上限=灵脉Lv×2）。' };
      }
      const cost = costFor(id);
      if (!XG.hasRes(cost)) return { ok: false, msg: '资材不足：需 ' + costText(cost) + '。' };
      const neg = { lingShi: -cost.lingShi, mat: {} };
      for (const m in cost.mat) neg.mat[m] = -cost.mat[m];
      XG.addRes(neg);
      caveState().lv[id] = lv + 1;
      bumpStat('cave_upgrade');
      // 建造（0→1）自动摆入空格
      if (lv === 0) {
        const cell = firstFreeCell();
        if (cell >= 0) caveState().layout[cell] = id;
        pushNews('洞府新起' + b.name + '，' + b.desc, 0);
      } else if ((lv + 1) % 5 === 0) {
        pushNews('洞府' + b.name + '已至 ' + (lv + 1) + ' 级，气象愈发不凡。', 0);
      }
      invalidate();
      checkFsSecret();
      return { ok: true, msg: b.name + '升至 Lv' + (lv + 1) + '。' };
    },

    place(id, cell) {
      const b = BUILDINGS[id];
      if (!b) return { ok: false, msg: '无此建筑。' };
      cell = Number(cell);
      if (isNaN(cell) || cell < 0 || cell > 8) return { ok: false, msg: '格位须在 0~8 之间。' };
      if (getLv(id) < 1) return { ok: false, msg: b.name + '尚未建成，无法摆放。' };
      if (cellOf(id) === cell) return { ok: true, msg: b.name + '已在此处。' };
      placeInternal(id, cell);
      invalidate();
      checkFsSecret();
      return { ok: true, msg: b.name + '已移至' + WX_NAME[b.wx] + '位（格' + cell + '）。' };
    },

    unplace(id) {
      const b = BUILDINGS[id];
      if (!b) return { ok: false, msg: '无此建筑。' };
      const cell = cellOf(id);
      if (cell < 0) return { ok: false, msg: b.name + '本就不在风水盘上。' };
      delete caveState().layout[cell];
      invalidate();
      return { ok: true, msg: b.name + '已自风水盘取下。' };
    },

    autoLayout() {
      const c = caveState();
      c.layout = {};
      // 先按优选格位放（五行连环相生），冲突/未建者顺延空格
      for (const id of BUILDING_IDS) {
        if (getLv(id) < 1) continue;
        const want = AUTO_CELLS[id];
        if (want != null && !c.layout[want]) c.layout[want] = id;
        else {
          const cell = firstFreeCell();
          if (cell >= 0) c.layout[cell] = id;
        }
      }
      invalidate();
      checkFsSecret();
      const fs = computeFengshui();
      return { ok: true, msg: '已按五行相生自动排布，当前相生 ' + fs.totalPairs + ' 对。' };
    },

    quickCollect() {
      const c = caveState();
      const n = Math.floor(c.pool.acc);
      if (n < 1) return { msg: ['灵田之中暂无积蓄，稍安勿躁。'], empty: true };
      c.pool.acc -= n;
      const gain = {};
      let rare = 0;
      for (let i = 0; i < n; i++) {
        const id = rollHerb();
        gain[id] = (gain[id] || 0) + 1;
        if (POOL_G3.indexOf(id) >= 0) rare++;
      }
      XG.addRes({ mat: gain });
      bumpStat('cave_collect');
      bumpStat('cave_herb', n);
      // 汇总文案（按数量从多到少展示前 4 种）
      const ids = Object.keys(gain).sort((a, b) => gain[b] - gain[a]);
      const parts = ids.slice(0, 4).map(function (id) { return matIcon(id) + matName(id) + '×' + gain[id]; });
      if (ids.length > 4) parts.push('等' + ids.length + '种');
      const msg = ['灵田收获灵草 ' + n + ' 株：' + parts.join('、') + '。'];
      if (rare > 0) {
        msg.push('其中竟有 ' + rare + ' 株三阶灵草，药香冲鼻！');
        pushNews('洞府灵田丰产，收获三阶灵草 ' + rare + ' 株，颇为难得。', 0);
      }
      return { msg: msg };
    },

    // ===== 查询 =====
    costFor: costFor,

    effOf: effOf,

    fengshuiReport() { return computeFengshui(); },

    getPool() {
      const acc = caveState().pool.acc;
      const rate = herbRatePerHour();
      return {
        acc: acc,
        whole: Math.floor(acc),
        ratePerHour: rate,
        etaSec: rate > 0 ? Math.max(0, (1 - (acc - Math.floor(acc))) * 3600 / rate) : null,
      };
    },

    isBuilt(id) { return getLv(id) >= 1; },

    getPetCapAdd() {
      const e = effOf('sl');
      return e.petCap || 0;
    },

    getWorkSlots() {
      const e = effOf('sl');
      return e.workSlots || 0;
    },

    herbRatePerHour: herbRatePerHour,

    getInfo() {
      const fs = computeFengshui();
      const buildings = BUILDING_IDS.map(function (id) {
        const b = BUILDINGS[id];
        const lv = getLv(id);
        const cost = costFor(id);
        const cap = capOf(id);
        let upTip = '';
        if (lv >= cap) upTip = id === 'lm' ? '已至极致' : '灵脉等级不足（上限 Lv' + cap + '）';
        else if (cost && !XG.hasRes(cost)) upTip = '资材不足';
        return {
          id: id, name: b.name, icon: b.icon, wx: b.wx, wxName: WX_NAME[b.wx],
          lv: lv, cap: cap, built: lv >= 1, cell: cellOf(id),
          fsPct: fs.bonus[id] || 0,
          effText: lv >= 1 ? effTextOf(id) : '未建成（' + b.effDesc + '）',
          desc: b.desc,
          nextCost: cost, costText: costText(cost),
          canUp: !!cost && XG.hasRes(cost), upTip: upTip,
        };
      });
      const cells = [];
      const layout = caveState().layout;
      for (let i = 0; i < 9; i++) {
        const id = layout[i] || null;
        cells.push(id
          ? { cell: i, id: id, name: BUILDINGS[id].name, icon: BUILDINGS[id].icon, wx: BUILDINGS[id].wx, wxName: WX_NAME[BUILDINGS[id].wx] }
          : { cell: i, id: null, name: '', icon: '', wx: '', wxName: '' });
      }
      return {
        unlocked: XG.cfg && typeof XG.cfg.isUnlocked === 'function' ? XG.cfg.isUnlocked('cave') : true,
        buildings: buildings,
        layout: { cells: cells, bonus: fs.bonus, pairs: fs.pairs, totalPairs: fs.totalPairs },
        pool: this.getPool(),
      };
    },
  };

  XG.sysOrder.push('cave');
})();
