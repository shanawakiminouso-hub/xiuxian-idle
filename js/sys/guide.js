/* guide.js：「修行录」新手目标系统（前期内容丰富迭代）——10 个分阶段目标，达成发传闻，玩家手动领奖
 *
 * ============================ UI 对接面（ui 层唯一接口依据） ============================
 * 全部通过 XG.sys.guide 调用，均可随时安全调用（内部防御性校验）：
 *   list()           → [{ id, name, desc, progress, target, done, claimed, rewardText }]
 *                       按内嵌顺序返回 10 条；progress 为当前进度原值（UI 展示自行 cap 到 target）
 *   claim(id)        → { ok:true, msg } | { ok:false, err }   玩家手动领奖（msg/err 可直接 toast）
 *   claimableCount() → number                                 已达成未领取条数（角标用）
 *   nextGoal()       → 单条 list 结构 | null                  第一条未领取的目标；全部领取后返回 null
 *
 * ============================ 进度判定口径（check.k → 读取源） ============================
 *   totalCult  → state.stats.total_cult（累计修为）
 *   tuona      → state.stats.tuona_count（手动吐纳次数，cultivation.tuona 写入）
 *   layer      → player.realmIdx*10 + player.layer（跨境界累计层数，突破后不回退）
 *   realmIdx   → player.realmIdx
 *   gongfaOwn  → state.gongfa.owned 键数
 *   petHatch   → state.stats.pet_hatch
 *   discuss    → state.stats.discuss_count（fellows.discuss 写入）
 *   meridian   → player.meridians.lit.length
 *   advDone    → state.adventure.done 键数
 *
 * ============================ 行为说明 ============================
 *   进度评估：tick 节流 2 秒批量评估未达成项；达成即置 done + 发 news（imp1, cat:'system'）。
 *   奖励发放：玩家手动 claim——修为走 cultivation.addCult、残篇走 gongfa.addFrag、
 *     丹药/灵宠蛋/灵石/灵玉走 XG.addRes；丹药 id 运行时从 data/pills 解析
 *     （exp 丹取最低品阶、break 丹取 seg 覆盖 realmIdx 0 者），不硬编码。
 *   存档：state.guide = { done:{}, claimed:{} }（懒初始化，不改动 state.js 默认工厂）。
 *   隐藏高光：「筑基得道」达成时额外播报 imp2 传闻（传闻流高亮）。
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  const EVAL_SEC = 2; // 进度评估节流（秒）

  // ============================ 目标数据（内嵌，顺序即展示/推进顺序） ============================
  // check:{k,v} 判定口径见文件头；reward 键：lingShi/lingYu/egg/pill:{kind,n}/fragRandom/cultRealmRate
  const GOALS = [
    { id: 'yinqi', name: '引气入体', desc: '累计修为达 500',
      check: { k: 'totalCult', v: 500 },
      reward: { lingShi: 200 }, rewardText: '灵石×200' },
    { id: 'tuona', name: '勤修不辍', desc: '手动吐纳 10 次',
      check: { k: 'tuona', v: 10 },
      reward: { lingYu: 5 }, rewardText: '灵玉×5' },
    { id: 'chukui', name: '初窥门径', desc: '臻至炼气 3 层',
      check: { k: 'layer', v: 3 },
      reward: { egg: 1 }, rewardText: '灵宠蛋×1' },
    { id: 'gongfa', name: '功法初习', desc: '习得 1 部功法',
      check: { k: 'gongfaOwn', v: 1 },
      reward: { fragRandom: 3 }, rewardText: '随机功法残篇×3' },
    { id: 'pet', name: '灵宠出世', desc: '孵化 1 只灵宠',
      check: { k: 'petHatch', v: 1 },
      reward: { pill: { kind: 'exp', n: 1 } }, rewardText: '宠物经验丹×1' },
    { id: 'discuss', name: '结交道友', desc: '与道友论道 1 次',
      check: { k: 'discuss', v: 1 },
      reward: { lingShi: 1000 }, rewardText: '灵石×1000' },
    { id: 'meridian', name: '小周天', desc: '点亮 3 个穴位',
      check: { k: 'meridian', v: 3 },
      reward: { cultRealmRate: 600 }, rewardText: '修为（当前境界 600 秒吐纳所得）' },
    { id: 'jiyuan', name: '初遇机缘', desc: '完成 3 次奇遇',
      check: { k: 'advDone', v: 3 },
      reward: { lingYu: 5 }, rewardText: '灵玉×5' },
    { id: 'yuanman', name: '炼气圆满', desc: '臻至炼气 10 层',
      check: { k: 'layer', v: 10 },
      reward: { pill: { kind: 'break', n: 1 } }, rewardText: '筑基丹×1' },
    { id: 'zhuji', name: '筑基得道', desc: '突破筑基之境',
      check: { k: 'realmIdx', v: 1 },
      reward: { lingYu: 20 }, rewardText: '灵玉×20',
      extraNews: { imp: 2, text: '紫气东来三千里！你道基初成，正式踏入筑基之境，四方修士听闻，皆道一声「仙途可期」！' } },
  ];

  // ============================ 内部辅助 ============================

  // state.guide 懒初始化（不改 state.js 默认工厂）
  function G() {
    const st = XG.state;
    st.guide = st.guide || {};
    st.guide.done = st.guide.done || {};
    st.guide.claimed = st.guide.claimed || {};
    return st.guide;
  }

  // 内部传闻助手：落 state.news（NEWS_CAP 截断）+ emit 'news'（与各系统同规）
  function pushNews(cat, text, imp) {
    const st = XG.state;
    st.news = st.news || [];
    const item = { t: Date.now(), cat: cat, text: text, imp: imp || 0 };
    st.news.unshift(item);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (st.news.length > cap) st.news.length = cap;
    XG.bus.emit('news', item);
    XG.bus.emit('save:dirty');
  }

  // check.k 进度读取（口径见文件头）
  function checkVal(k) {
    const st = XG.state;
    const p = st.player || {};
    const stats = st.stats || {};
    switch (k) {
      case 'totalCult': return stats.total_cult || 0;
      case 'tuona': return stats.tuona_count || 0;
      case 'layer': return (p.realmIdx || 0) * XG.cfg.LAYERS + (p.layer || 1);
      case 'realmIdx': return p.realmIdx || 0;
      case 'gongfaOwn': return Object.keys((st.gongfa && st.gongfa.owned) || {}).length;
      case 'petHatch': return stats.pet_hatch || 0;
      case 'discuss': return stats.discuss_count || 0;
      case 'meridian': return ((p.meridians && p.meridians.lit) || []).length;
      case 'advDone': return Object.keys((st.adventure && st.adventure.done) || {}).length;
    }
    return 0;
  }

  // 丹药 id 运行时解析（不硬编码）：exp=eff.type=='exp' 中品阶最低者；break=seg 覆盖 realmIdx 0 者
  const _pillIdCache = {};
  function resolvePillId(kind) {
    if (_pillIdCache[kind]) return _pillIdCache[kind];
    const recipes = (XG.data && XG.data.pills && XG.data.pills.recipes) || [];
    let hit = null;
    if (kind === 'exp') {
      for (const r of recipes) {
        if (!r.eff || r.eff.type !== 'exp') continue;
        if (!hit || (r.grade || 99) < (hit.grade || 99)) hit = r;
      }
    } else if (kind === 'break') {
      for (const r of recipes) {
        if (!r.eff || r.eff.type !== 'break' || !r.seg) continue;
        if (0 >= r.seg[0] && 0 <= r.seg[1]) { hit = r; break; }
      }
    }
    // 防御性兜底（数据层缺失时退回权威 id，见 DATA_NOTES §二）
    _pillIdCache[kind] = (hit && hit.id) || (kind === 'exp' ? 'pill_lingshou' : 'pill_zhuji');
    return _pillIdCache[kind];
  }

  function pillName(id) {
    const recipes = (XG.data && XG.data.pills && XG.data.pills.recipes) || [];
    for (const r of recipes) if (r.id === id) return r.name;
    return id;
  }

  // 发奖：返回奖励明细文案数组（修为/残篇走系统 API，其余走 XG.addRes）
  function grantReward(def) {
    const r = def.reward || {};
    const parts = [];
    if (r.lingShi) { XG.addRes({ lingShi: r.lingShi }); parts.push('灵石×' + XG.util.fmt(r.lingShi)); }
    if (r.lingYu) { XG.addRes({ lingYu: r.lingYu }); parts.push('灵玉×' + XG.util.fmt(r.lingYu)); }
    if (r.egg) { XG.addRes({ egg: r.egg }); parts.push('灵宠蛋×' + r.egg); }
    if (r.pill) {
      const pid = resolvePillId(r.pill.kind);
      XG.addRes({ pill: { [pid]: r.pill.n || 1 } });
      parts.push(pillName(pid) + '×' + (r.pill.n || 1));
    }
    if (r.fragRandom) {
      const pool = ((XG.data && XG.data.gongfa && XG.data.gongfa.list) || []).filter(function (g) { return !g.hidden; });
      const gf = XG.sys && XG.sys.gongfa;
      for (let i = 0; i < r.fragRandom; i++) {
        if (!pool.length) break;
        const g = XG.util.pick(pool);
        if (gf && typeof gf.addFrag === 'function') gf.addFrag(g.id, 1);
        else XG.addRes({ frag: { [g.id]: 1 } }); // 降级：直接入残篇袋
      }
      parts.push('随机功法残篇×' + r.fragRandom);
    }
    if (r.cultRealmRate) {
      const realm = XG.cfg.REALMS[(XG.state.player || {}).realmIdx || 0] || XG.cfg.REALMS[0];
      const n = realm.rate * r.cultRealmRate;
      const cult = XG.sys && XG.sys.cultivation;
      if (cult && typeof cult.addCult === 'function') cult.addCult(n, '修行录');
      else { XG.state.player.cult = (XG.state.player.cult || 0) + n; XG.bus.emit('res:changed'); } // 降级直加
      parts.push('修为×' + XG.util.fmt(n));
    }
    return parts;
  }

  // 进度评估：未达成项逐条判定；达成置 done + 发 imp1 系统传闻（筑基得道追加 imp2 高光播报）
  function evaluate() {
    const g = G();
    for (const def of GOALS) {
      if (g.done[def.id]) continue;
      if (checkVal(def.check.k) < def.check.v) continue;
      g.done[def.id] = 1;
      pushNews('system', '修行录·「' + def.name + '」已达成，可至修炼主页领取酬赏：' + def.rewardText + '。', 1);
      if (def.extraNews) pushNews('system', def.extraNews.text, def.extraNews.imp);
    }
  }

  // ============================ 系统模块 ============================
  XG.sys.guide = {
    id: 'guide',
    _acc: 0,

    init() {
      G(); // 懒初始化存档子树
      evaluate(); // 老档/回归档：启动即补判一次（达成项会在首轮 tick 前落定）
    },

    tick(dt) {
      this._acc += dt || 0;
      if (this._acc < EVAL_SEC) return;
      this._acc = 0;
      evaluate();
    },

    // ============================ UI 对接面 ============================

    list() {
      const g = G();
      return GOALS.map(function (def) {
        return {
          id: def.id,
          name: def.name,
          desc: def.desc,
          progress: checkVal(def.check.k),
          target: def.check.v,
          done: !!g.done[def.id],
          claimed: !!g.claimed[def.id],
          rewardText: def.rewardText,
        };
      });
    },

    claim(id) {
      const g = G();
      let def = null;
      for (const d of GOALS) if (d.id === id) { def = d; break; }
      if (!def) return { ok: false, err: '查无此条修行录。' };
      if (g.claimed[id]) return { ok: false, err: '此条酬赏已领过了。' };
      if (!g.done[id]) {
        // 领奖前补判一次（进度可能刚达成尚未到 2 秒评估点）
        if (checkVal(def.check.k) >= def.check.v) evaluate();
        if (!g.done[id]) return { ok: false, err: '「' + def.name + '」尚未达成，还需勤勉修行。' };
      }
      g.claimed[id] = 1;
      const parts = grantReward(def);
      XG.bus.emit('save:dirty');
      return { ok: true, msg: '「' + def.name + '」酬赏已领：' + parts.join('、') };
    },

    claimableCount() {
      const g = G();
      let n = 0;
      for (const def of GOALS) if (g.done[def.id] && !g.claimed[def.id]) n++;
      return n;
    },

    nextGoal() {
      const list = this.list();
      for (const it of list) if (!it.claimed) return it;
      return null;
    },
  };

  XG.sysOrder.push('guide');
})();
