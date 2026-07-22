/* cfg.js：全部数值/平衡常量（契约 §5：境界、层数、解锁、战力公式、存档键等） */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  XG.cfg = {
    // 大境界表（顺序即进度；baseCost=每层突破修为基数；rate=基础修为/秒；breakRate=突破基础成功率）
    // 节奏校准（2026 重调）：baseCost 按「裸速全境耗时目标」反推（Σ layer^2.2/(1+0.12(l-1)) ≈ 320），
    // 目标：炼气≈5分钟 / 筑基≈9小时 / 金丹≈1天 / 元婴≈2天 / 化神≈3天 / 炼虚≈3.5天 / 合体≈4天 / 大乘≈4天 / 渡劫≈4天；
    // 旧档 baseCost 每境 ×250（速率仅 ×4.3，每境耗时 ×58，元婴起曲线断裂），故压缩至每境 ×4~11。
    REALMS: [
      // 炼气 baseCost 20→10（QA 节奏校准）：首日炼气→筑基纯挂机 19.2 分钟 → 9.6 分钟（口径：Σcost/基础rate）
      { id: 'lianqi',   name: '炼气', baseCost: 10,     rate: 10,    breakRate: 0.65 },
      { id: 'zhuji',    name: '筑基', baseCost: 4e3,    rate: 40,    breakRate: 0.60 },
      { id: 'jindan',   name: '金丹', baseCost: 4.3e4,  rate: 160,   breakRate: 0.55 },
      { id: 'yuanying', name: '元婴', baseCost: 3.8e5,  rate: 700,   breakRate: 0.50 },
      { id: 'huashen',  name: '化神', baseCost: 2.4e6,  rate: 3e3,   breakRate: 0.45 },
      { id: 'lianxu',   name: '炼虚', baseCost: 1.23e7, rate: 1.3e4, breakRate: 0.40 },
      { id: 'heti',     name: '合体', baseCost: 6.5e7,  rate: 6e4,   breakRate: 0.35 },
      { id: 'dacheng',  name: '大乘', baseCost: 2.7e8,  rate: 2.5e5, breakRate: 0.30 },
      { id: 'dujie',    name: '渡劫', baseCost: 1.08e9, rate: 1e6,   breakRate: 0.25 },
      { id: 'feisheng', name: '飞升', baseCost: Infinity, rate: 0,   breakRate: 0 },
    ],

    LAYERS: 10, // 每个大境界 10 层小境界

    // 某大境界第 layer 层突破所需修为 = baseCost * layer^2.2（返回 number）
    layerCost(realmIdx, layer) {
      const r = this.REALMS[realmIdx] || this.REALMS[0];
      return r.baseCost * Math.pow(layer, 2.2);
    },

    OFFLINE_CAP_H: 8,        // 离线收益上限 8 小时
    BREAK_FAIL_BONUS: 0.08,  // 突破失败保底成功率逐次 +8%（成功清零）
    BREAK_PILL_BONUS: 0.15,  // 每颗破境丹 +15%（最多用 3 颗）
    NEWS_CAP: 200,           // 传闻缓存上限
    FELLOW_COUNT: [30, 50],  // 开局道友数量区间

    // 战力公式（唯一）：攻*2 + 防*1.5 + 血*0.2 + 速*10
    POWER: function (s) { return s.atk * 2 + s.def * 1.5 + s.hp * 0.2 + s.spd * 10; },

    SAVE_KEY: 'xg_save_v1', // localStorage 存档键

    // 境界战斗基值表（atk/def/hp/spd 按 realmIdx 递增；炼气 10/8/100/10，每大境界约 ×6，供 stats 使用）
    REALM_BASE: [
      { atk: 10,        def: 8,        hp: 100,         spd: 10 },        // 炼气
      { atk: 60,        def: 48,       hp: 600,         spd: 60 },        // 筑基
      { atk: 360,       def: 288,      hp: 3.6e3,       spd: 360 },       // 金丹
      { atk: 2160,      def: 1728,     hp: 2.16e4,      spd: 2160 },      // 元婴
      { atk: 12960,     def: 10368,    hp: 1.296e5,     spd: 12960 },     // 化神
      { atk: 77760,     def: 62208,    hp: 7.776e5,     spd: 77760 },     // 炼虚
      { atk: 466560,    def: 373248,   hp: 4.66656e6,   spd: 466560 },    // 合体
      { atk: 2799360,   def: 2239488,  hp: 2.79936e7,   spd: 2799360 },   // 大乘
      { atk: 16796160,  def: 13436928, hp: 1.679616e8,  spd: 16796160 },  // 渡劫
      { atk: 100776960, def: 80621568, hp: 1.0077696e9, spd: 100776960 }, // 飞升
    ],

    // 系统解锁条件表：key=系统 id，value={realmIdx, layer} 或 {days:N}（创角天数）
    UNLOCKS: {
      gongfa:        { realmIdx: 0, layer: 1 },  // 功法：炼气1层
      adventure:     { realmIdx: 0, layer: 2 },  // 奇遇：炼气2层
      pets:          { realmIdx: 0, layer: 5 },  // 灵宠：炼气5层
      fellows:       { realmIdx: 0, layer: 3 },  // 道友：炼气3层（体验迭代：由8层提前，前期即有传闻流与论道）
      cave:          { realmIdx: 1, layer: 1 },  // 洞府：筑基1层
      expedition:    { realmIdx: 1, layer: 1 },  // 历练派遣：筑基1层
      alchemy:       { realmIdx: 1, layer: 5 },  // 炼丹：筑基5层
      market:        { realmIdx: 1, layer: 5 },  // 坊市：筑基5层（体验迭代：由金丹1层提前，缓解筑基期灵石/灵玉无处可花）
      forge:         { realmIdx: 2, layer: 1 },  // 炼器：金丹1层
      dungeon_tower: { realmIdx: 2, layer: 1 },  // 爬塔：金丹1层
      pvp:           { realmIdx: 2, layer: 5 },  // 论剑：金丹5层
      petBreed:      { realmIdx: 3, layer: 1 },  // 灵宠繁殖：元婴1层
      gongfaCreate:  { realmIdx: 4, layer: 1 },  // 自创功法：化神1层
      dungeon_guard: { realmIdx: 4, layer: 1 },  // 守关：化神1层
      dungeon_hunt:  { realmIdx: 5, layer: 1 },  // 限时寻宝：炼虚1层
      hiddenMaps:    { realmIdx: 5, layer: 1 },  // 隐藏区域提示：炼虚1层
      tribulation:   { realmIdx: 7, layer: 1 },  // 渡劫预告：大乘1层
      reincarn:      { realmIdx: 8, layer: 10 }, // 轮回：渡劫10层
    },

    // 系统可见性统一判定（读 XG.state 玩家境界/创角天数；未登记的系统默认解锁）
    isUnlocked(sysId) {
      const u = this.UNLOCKS[sysId];
      if (!u) return true;
      const st = XG.state;
      if (!st || !st.player) return false;
      // 创角天数类条件
      if (u.days) {
        const days = (Date.now() - (st.createdAt || Date.now())) / 86400000;
        return days >= u.days;
      }
      // 境界层数类条件：大境界更高，或同境界层数达标
      const p = st.player;
      return p.realmIdx > u.realmIdx || (p.realmIdx === u.realmIdx && p.layer >= u.layer);
    },
  };
})();
