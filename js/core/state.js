/* state.js：唯一游戏状态对象（契约 §6 默认 state 工厂 + 资源增减工具函数） */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  // 默认状态工厂：新档/读档合并均以本结构为准（契约 §6 Schema）
  XG.newState = function () {
    const now = Date.now();
    return {
      ver: 1, createdAt: now, lastSeen: now, totalOnlineSec: 0,
      player: {
        name: '无名散修', realmIdx: 0, layer: 1, cult: 0, // cult=当前累积修为(用于突破消耗)
        breakFails: 0, cultivateMode: 'dazuo',            // dazuo打坐|biguan闭关|dunwu顿悟
        spiritRoot: { type: 'jin', grade: 3, mut: null }, // 五行 + 变异(null|bing|lei|feng|an|guang|hundun)
        meridians: { lit: [] },                           // 已点亮穴位 id 列表
        reincarn: 0, identity: null, talents: {}, rp: 0,  // 轮回: 次数/转世身份/天赋树/轮回点
        toxicity: 0,                                      // 丹毒 0~100
        partner: null,                                    // 道侣 fellow uid
      },
      res: { lingShi: 0, lingYu: 0 },                     // 灵石 / 灵玉
      inv: { mat: {}, pill: {}, frag: {}, egg: 0 },       // 材料/丹药/功法残篇/灵宠蛋 {id:count}
      equips: { list: [], slots: { weapon: null, head: null, body: null, boots: null, ring: null, talisman: null } },
      gongfa: { owned: {}, active: [], frag: {}, custom: [] }, // owned:{id:{lv,prof}}, active:已装备功法id(≤4)
      alchemy: { lv: 1, exp: 0, furnace: 1, fire: null, fires: {}, known: [] }, // known=已习得丹方id
      pets: { list: [], team: [], jobs: {} },             // team≤3 出战; jobs:{petUid: buildingId|'explore'}
      cave: { lv: { jlz: 1, lt: 0, df: 0, qs: 0, sl: 0, lm: 1 }, layout: {} }, // 建筑等级 + 3x3 摆放
      expedition: { active: [], log: [] },                // 进行中派遣 {mapId, petUids, endAt, dur}
      dungeon: { tower: 1, towerBest: 1, guard: 0, hunt: 0, sweepFree: 3, sweepDay: '', week: '', affixes: [] },
      pvp: { pts: 1000, wins: 0, losses: 0, season: '', claimed: '', history: [] },
      fellows: [],                                        // 道友列表（契约 §11）
      news: [],                                           // {t, cat, text, imp} 新→旧, 上限 NEWS_CAP
      ach: {},                                            // {id: {done:1, claimed:1}}
      codex: { gongfa: [], pill: [], pet: [], equip: [], fellow: [] },
      adventure: { done: {}, chains: {}, cd: 0 },         // 奇遇: 已做once事件/连锁进度/冷却
      daily: { day: '', discuss: {}, help: {}, gift: 0 }, // 每日: 论道/求助/免费赠礼 记录
      settings: { newsCollapsed: false, sound: false },
    };
  };

  // 立即建立全局唯一状态对象（读档时由 save.load 整体替换）
  XG.state = XG.newState();

  // 材料/丹药/残篇袋增减（内部辅助）：负数即扣除，归零清键保持存档整洁
  function addBag(bag, obj) {
    for (const id in obj) {
      const nv = Math.max(0, (bag[id] || 0) + obj[id]);
      if (nv <= 0) delete bag[id];
      else bag[id] = nv;
    }
  }

  // 资源统一增减入口（契约 §6）：delta 支持 {lingShi, lingYu, mat:{id:n}, pill:{id:n}, frag:{id:n}, egg}
  // 负数即扣除，自动 clamp 不为负；变动后 emit 'res:changed' + 'save:dirty'
  XG.addRes = function (delta) {
    if (!delta) return;
    const st = XG.state;
    if (delta.lingShi) st.res.lingShi = Math.max(0, (st.res.lingShi || 0) + delta.lingShi);
    if (delta.lingYu) st.res.lingYu = Math.max(0, (st.res.lingYu || 0) + delta.lingYu);
    if (delta.mat) addBag(st.inv.mat, delta.mat);
    if (delta.pill) addBag(st.inv.pill, delta.pill);
    if (delta.frag) addBag(st.inv.frag, delta.frag);
    if (delta.egg) st.inv.egg = Math.max(0, (st.inv.egg || 0) + delta.egg);
    XG.bus.emit('res:changed');
    XG.bus.emit('save:dirty');
  };

  // 资源充足判定：cost 结构同 addRes 的 delta（全部满足才返回 true）
  XG.hasRes = function (cost) {
    if (!cost) return true;
    const st = XG.state;
    if (cost.lingShi && (st.res.lingShi || 0) < cost.lingShi) return false;
    if (cost.lingYu && (st.res.lingYu || 0) < cost.lingYu) return false;
    const kinds = { mat: st.inv.mat, pill: st.inv.pill, frag: st.inv.frag };
    for (const k in kinds) {
      if (cost[k]) {
        for (const id in cost[k]) {
          if ((kinds[k][id] || 0) < cost[k][id]) return false;
        }
      }
    }
    if (cost.egg && (st.inv.egg || 0) < cost.egg) return false;
    return true;
  };
})();
