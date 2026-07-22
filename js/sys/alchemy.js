/* alchemy.js：炼丹系统（契约 §10；数据源 js/data/pills.js：recipes/furnaces/fires）
 *
 * ===================== 玩法覆盖 =====================
 * 丹方习得：初始 3 张（聚气丹/小还丹/清毒散）；升级自动参悟「alchLv 达标且非隐藏」丹方；
 *   外部来源（历练掉落/奇遇事件/坊市神秘商人/成就奖励）调 learn(recipeId) / learnRandomRecipe(maxAlchLv)；
 *   隐藏丹方：cond='explode' 炸炉 12% 顿悟、cond='hiddenmap' 归墟/龙渊派遣 8% 掉落残方（监听 expedition:done）。
 * 炼丹师等级：炼制成功得 exp 升级（满级 9 级），升级自动参悟丹方 + 成功率加成（每级 +2%）。
 * 丹炉：按 furnaces 阶梯顺序购置（灵石），succ 加成功率 / speed 缩短耗时（耗时 = time × 0.25 / speed）。
 * 异火：fires 收集（fires[id]=1）与切换装备（fire=null 即凡火）；隐藏异火——
 *   fire_hundun 混沌虚火：累计炸炉 ≥100 次（监听自身 alch:done）；
 *   fire_liuding 六丁神火：归墟派遣完成 15%（监听 expedition:done）；
 *   另内置 fire_ziwu（tower:clear 每 33 层 25%）、fire_qinglian（焚天谷派遣 12%）、
 *   fire_difu（洞府丹房 df≥1 自动引地火，tick 轮询）；其余来源由对应系统调 gainFire(id)。
 * 炼制：单炉队列（state.alchemy.job 持久化，离线可结算）；成功率=基础(品阶)+等级+炉+火+功法 alchSuccPct−丹毒惩罚；
 *   失败→材料消失（40% 残留 1 份）；炸炉（失败中的 25%）→全损 + 12% 悟隐藏丹方 / 60% 得药灰（一阶灵草安慰奖）；
 *   变异（异火 mutPct）→极品丹：eff×1.5、icon 加★、id=recipeId+'_star' 计入 inv.pill。
 * 服用：usePill 按 eff.type 结算（cult→cultivation.addCult；break→存 buff 供突破读取，同次突破≤3 颗；
 *   heal→emit alch:heal 供战斗系统；tox→解毒；root→洗灵根/根骨+1/变异率 buff；atk/def/hp/work→限时 buff；exp→喂出战灵宠）。
 * 丹毒：服丹 +tox；tox>50 修炼速率 −20%（getMods 负值）；tox>80 禁服丹（解毒丹豁免）；tick 缓慢衰减（1 点/180 秒）；
 *   丹毒达 100 置 stats.tox100=1。
 *
 * ===================== stats 键（XG.state.stats，snake） =====================
 * pill_make     累计成丹数（含极品丹）
 * pill_explode  累计炸炉次数（混沌虚火 cond 判据）
 * tox100        丹毒曾达 100 则置 1（隐藏成就 check.k=tox100）
 *
 * ===================== 事件 =====================
 * emit  alch:done {ok, explode, mutated, pillId, grade}（gongfa 隐藏功法 alchemy_explode_10 等订阅）
 * emit  alch:heal {val, dur, star}（战斗系统可选订阅：回血比例/持续秒数/是否极品）
 * emit  codex:new {kind:'pill', id}（首次习得/首次炼成；collection 订阅，需自行去重）
 * emit  news（pushNews 同步写入 state.news）
 * 订阅  alch:done（自身：混沌虚火计数）/ expedition:done {mapId}（隐藏火种+隐藏残方）/ tower:clear {layer}（子午天火）
 *
 * ===================== UI 对接面（全部同步返回；{ok:false, msg} 为统一失败形态） =====================
 * getState()            → {lv, exp, expNeed, tox, toxSlow, toxBan, furnace:{id,name,icon,succ,speed}, fire:{id,name,icon,succ,mutPct},
 *                          knownCount, job: getJobProgress(), breakPillCount}
 * listRecipes()         → [{id,name,icon,grade,hidden,alchLv,known,canCraft,reason,succ,time,cost,eff,tox,desc,getHint,effText}]
 *                          （未习得隐藏丹方仅展示 getHint 线索，cost/eff 不展示——字段照给，UI 自行按 known 遮蔽）
 * listFurnaces()        → [{id,name,icon,succ,speed,cost,desc,owned,current,next}]（next=true 为可购买的下一座）
 * listFires()           → [{id,name,icon,grade,succ,mutPct,hidden,owned,equipped,getHint,desc}]
 * getJobProgress()      → null | {recipeId,name,icon,pct(0~1),remainSec,endAt,dur}
 * succPreview(recipeId) → 成功率百分数（5~97，含全部加成与丹毒惩罚，供开炉前预览）
 * canCraft(recipeId)    → {ok, reason}
 * startCraft(recipeId)  → {ok, msg}（扣材料+灵石，开炉；队列占用中返回 ok:false）
 * cancelCraft()         → {ok, msg}（全额返还材料与灵石）
 * buyFurnace()          → {ok, msg}（购置下一座丹炉，自动扣灵石）
 * setFire(fireId)       → {ok, msg}（'fire_fan' 或已收集异火 id）
 * gainFire(fireId)      → bool（供其他系统发放异火；重复返回 false）
 * usePill(pillId)       → {ok, msg, eff?}（支持 recipeId 与 recipeId+'_star'；tox>80 拒服非解毒丹；
 *                          break 丹校验 seg 境界段与同次突破 ≤3 颗）
 * pillInfo(pillId)      → {id,baseId,star,name,icon,grade,desc,effText,tox,usable,reason,count}（背包展示用）
 * learn(recipeId)       → bool（供坊市/事件/成就发放丹方）
 * learnRandomRecipe(maxAlchLv) → recipe|null（供历练/事件/成就随机发方；不含隐藏方）
 * getBreakBuffs()       → [{pillId,name,icon,val,star}]（当前已服破境丹，供突破界面展示）
 * getBreakBuffBonus()   → 数值（破境丹成功率加值合计，小数）
 * consumeBreakBuffs()   → 数值（cultivation 突破时调用：取走加值合计并清空已服破境丹）
 * getRootWashBoost()    → 0.25|0（淬灵丹 buff 存续中返回 0.25，供灵根洗练变异率加成读取）
 * getBuffs()            → {cult?|atk?|def?|hp?|work?: {val, remainSec}}（限时丹药 buff 展示）
 * getToxInfo()          → {tox, slow(tox>50), ban(tox>80), decayPerSec}
 *
 * offline(dt)：结算离线期间到期的丹炉（成丹入 pillGain / 炸炉入 events），并按 dt 衰减丹毒。
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  // ===================== 内部常量 =====================
  const MAX_LV = 9;                 // 炼丹师满级（数据最高 alchLv 8，留 1 级追求）
  const STAR_SUFFIX = '_star';      // 极品丹 id 后缀
  const STAR_MULT = 1.5;            // 极品丹药效倍率
  const EXPLODE_RATE = 0.25;        // 失败中的炸炉占比
  const FAIL_REMAINDER = 0.4;       // 普通失败残留 1 份材料的概率
  const EXPLODE_EPIPHANY = 0.12;    // 炸炉顿悟隐藏丹方概率
  const EXPLODE_ASH = 0.6;          // 炸炉得药灰（安慰奖）概率
  const BREAK_PILL_MAX = 3;         // 同次突破最多叠 3 颗破境丹（契约 cfg.BREAK_PILL_BONUS）
  const CRAFT_TIME_MULT = 0.25;   // 炼丹耗时全局倍率（耗时 = time × 0.25 / 炉速）
  const TOX_DECAY_PER_SEC = 1 / 60;// 丹毒衰减：60 秒 1 点
  const TOX_SLOW = 50;              // 丹毒 >50 修炼 −20%
  const TOX_BAN = 80;               // 丹毒 >80 禁止服丹
  const ASH_HERBS = ['herb_qingling', 'herb_ningxue', 'herb_ningshen', 'herb_ziye']; // 药灰安慰奖池
  const INITIAL_RECIPES = ['pill_juqi', 'pill_xiaohuan', 'pill_qingdu']; // 初始 3 张丹方
  const ROOT_TYPES = ['jin', 'mu', 'shui', 'huo', 'tu']; // 五行灵根（洗髓丹重 roll 池）

  // 炸炉传闻文案池
  const EXPLODE_NEWS = [
    '丹房之中轰然一响，炉火冲天，满室焦烟，一炉灵药尽成飞灰。',
    '炉火忽作龙吟，丹炉炸裂，药香尽散，只余满地炉灰。',
    '文武火一时不济，炉中丹药炸作漫天星点，幸而未伤性命。',
    '炉盖掀飞三尺，焦烟滚滚而出——这一炉，算是交代了。',
  ];

  // ===================== 内部工具 =====================
  function D() { return XG.data.pills || { recipes: [], furnaces: [], fires: [] }; }
  function A() { return XG.state.alchemy; }

  // 懒初始化跨系统统计（守则 3）
  function statsAdd(k, n) {
    const st = (XG.state.stats = XG.state.stats || {});
    st[k] = (st[k] || 0) + (n == null ? 1 : n);
  }

  // 传闻推送：写 state.news（unshift，按 NEWS_CAP 截断）+ emit 'news'（守则 7）
  function pushNews(cat, text, imp) {
    const st = XG.state;
    st.news = st.news || [];
    const obj = { t: Date.now(), cat: cat || 'player', text: text, imp: imp || 0 };
    st.news.unshift(obj);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (st.news.length > cap) st.news.length = cap;
    XG.bus.emit('news', obj);
  }

  function recipeOf(id) {
    const list = D().recipes;
    for (const r of list) if (r.id === id) return r;
    return null;
  }
  function furnaceOf(id) {
    const list = D().furnaces;
    for (const f of list) if (f.id === id) return f;
    return null;
  }
  function fireOf(id) {
    const list = D().fires;
    for (const f of list) if (f.id === id) return f;
    return null;
  }
  function curFurnace() { return furnaceOf(A().furnace) || D().furnaces[0]; }
  function curFire() {
    const a = A();
    return (a.fire && fireOf(a.fire)) || fireOf('fire_fan') || { id: 'fire_fan', name: '凡火', icon: '🕯️', succ: 0, mutPct: 0 };
  }

  // 发修为（守则 5：防御性调 cultivation.addCult）
  function addCult(n, src) {
    const c = XG.sys.cultivation;
    if (c && typeof c.addCult === 'function') {
      try { c.addCult(n, src); return; } catch (e) { /* 降级 */ }
    }
    XG.state.player.cult = (XG.state.player.cult || 0) + n;
  }

  // 图鉴新增（collection 订阅 codex:new；已登记则跳过）
  function codexNew(id) {
    const cx = XG.state.codex;
    if (cx && Array.isArray(cx.pill) && cx.pill.indexOf(id) >= 0) return;
    XG.bus.emit('codex:new', { kind: 'pill', id: id });
  }

  // ===================== 丹毒 =====================
  function addTox(n) {
    const p = XG.state.player;
    const before = p.toxicity || 0;
    p.toxicity = XG.util.clamp(before + n, 0, 100);
    if (p.toxicity >= 100 && !(XG.state.stats && XG.state.stats.tox100)) {
      statsAdd('tox100', 1);
      pushNews('player', '丹毒攻心，百脉俱灼！丹毒已积至顶峰，速觅解毒之方，否则道基堪忧。', 1);
    }
    checkToxBand(before, p.toxicity);
  }

  // 丹毒跨越 50 阈值时刷新属性缓存（getMods 的 −20% 修炼惩罚随阈值变化）
  function checkToxBand(before, after) {
    if ((before > TOX_SLOW) !== (after > TOX_SLOW) && XG.stats) XG.stats.invalidate();
  }

  // ===================== 丹方习得 =====================
  // 学习指定丹方；silent=true 不发传闻（初始/补档用）。返回 bool。
  function learn(recipeId, silent) {
    const a = A();
    const r = recipeOf(recipeId);
    if (!r || a.known.indexOf(recipeId) >= 0) return false;
    a.known.push(recipeId);
    codexNew(recipeId);
    if (!silent) {
      pushNews('player', '参悟丹方「' + r.name + '」——' + (r.hidden ? '隐世古方，得之大幸！' : '丹道又进一步。'), r.hidden ? 2 : 0);
    }
    XG.bus.emit('save:dirty');
    return true;
  }

  // 随机习得一张「非隐藏、alchLv≤maxAlchLv、未习得」的丹方（历练/事件/坊市/成就通用入口）
  function learnRandomRecipe(maxAlchLv) {
    const a = A();
    const cap = typeof maxAlchLv === 'number' ? maxAlchLv : a.lv;
    const pool = D().recipes.filter(function (r) {
      return !r.hidden && r.alchLv <= cap && a.known.indexOf(r.id) < 0;
    });
    if (!pool.length) return null;
    const r = XG.util.pick(pool);
    learn(r.id);
    return r;
  }

  // 等级提升时自动参悟「alchLv 达标且非隐藏」的全部丹方；返回新参悟的丹方数组
  function autoLearn(silent) {
    const a = A();
    const out = [];
    D().recipes.forEach(function (r) {
      if (!r.hidden && r.alchLv <= a.lv && a.known.indexOf(r.id) < 0) {
        learn(r.id, silent);
        out.push(r);
      }
    });
    return out;
  }

  // ===================== 炼丹师等级 =====================
  function expNeed(lv) { return 30 * lv + 15 * lv * lv; }

  function gainExp(n) {
    const a = A();
    if (a.lv >= MAX_LV) return;
    a.exp += n;
    while (a.lv < MAX_LV && a.exp >= expNeed(a.lv)) {
      a.exp -= expNeed(a.lv);
      a.lv += 1;
      const news2 = autoLearn(true);
      pushNews(
        'player',
        '丹道精进，炼丹师晋至' + a.lv + '阶！' + (news2.length ? '顿悟丹方：' + news2.map(function (r) { return '「' + r.name + '」'; }).join('、') : '成功率更进一分。'),
        1
      );
    }
  }

  // ===================== 成功率 =====================
  // 基础成功率按品阶：一阶 89%，每阶 −6%
  function baseSucc(grade) { return 95 - grade * 6; }

  // 丹毒惩罚：>80 扣 15，>50 扣 8
  function toxSuccPenalty() {
    const tox = XG.state.player.toxicity || 0;
    if (tox > TOX_BAN) return 15;
    if (tox > TOX_SLOW) return 8;
    return 0;
  }

  // 成功率百分数（5~97）：基础 + 等级(每级+2) + 炉 + 火 + 功法 alchSuccPct − 丹毒惩罚
  function succRate(r) {
    const a = A();
    let gongfaBonus = 0;
    if (XG.stats) {
      try { gongfaBonus = XG.stats.get().alchSuccPct || 0; } catch (e) { gongfaBonus = 0; }
    }
    const v =
      baseSucc(r.grade) +
      (a.lv - 1) * 2 +
      (curFurnace().succ || 0) +
      (curFire().succ || 0) +
      gongfaBonus -
      toxSuccPenalty();
    return XG.util.clamp(v, 5, 97);
  }

  // ===================== 炼制 =====================
  function canCraft(recipeId) {
    const a = A();
    const r = recipeOf(recipeId);
    if (!r) return { ok: false, reason: '丹方不存在' };
    if (a.known.indexOf(recipeId) < 0) return { ok: false, reason: '尚未习得此丹方' };
    if (a.lv < r.alchLv) return { ok: false, reason: '炼丹师等级不足（需' + r.alchLv + '阶）' };
    if (a.job) return { ok: false, reason: '丹炉正忙，候此炉丹成' };
    if (!XG.hasRes(r.cost)) return { ok: false, reason: '药材或灵石不足' };
    return { ok: true, reason: '' };
  }

  function startCraft(recipeId) {
    const chk = canCraft(recipeId);
    if (!chk.ok) return { ok: false, msg: chk.reason };
    const a = A();
    const r = recipeOf(recipeId);
    XG.addRes({ lingShi: -(r.cost.lingShi || 0), mat: negate(r.cost.mat) });
    const dur = Math.max(2, r.time * CRAFT_TIME_MULT / (curFurnace().speed || 1)); // 耗时 = time × 全局倍率 / 炉速
    const now = Date.now();
    a.job = { recipeId: recipeId, startAt: now, endAt: now + dur * 1000, dur: dur };
    XG.bus.emit('save:dirty');
    return { ok: true, msg: '开炉炼制「' + r.name + '」，约需' + XG.util.fmtTime(dur) + '。' };
  }

  function cancelCraft() {
    const a = A();
    if (!a.job) return { ok: false, msg: '丹炉空闲，无可取消' };
    const r = recipeOf(a.job.recipeId);
    a.job = null;
    if (r) XG.addRes({ lingShi: r.cost.lingShi || 0, mat: r.cost.mat });
    return { ok: true, msg: '熄火收炉，药材灵石如数奉还。' };
  }

  function negate(mat) {
    const o = {};
    if (mat) for (const id in mat) o[id] = -mat[id];
    return o;
  }

  // 丹成结算（成功/失败/炸炉/变异）；返回 alch:done 载荷
  function settleJob() {
    const a = A();
    const job = a.job;
    if (!job) return null;
    a.job = null;
    const r = recipeOf(job.recipeId);
    if (!r) return null;

    const ok = XG.util.chance(succRate(r) / 100);
    let explode = false;
    let mutated = false;
    let pillId = null;

    if (ok) {
      // —— 成丹：异火变异 → 极品丹（eff×1.5，id 加 _star） ——
      pillId = r.id;
      const mutPct = curFire().mutPct || 0;
      if (mutPct > 0 && XG.util.chance(mutPct / 100)) {
        mutated = true;
        pillId = r.id + STAR_SUFFIX;
      }
      XG.addRes({ pill: pillPair(pillId, 1) });
      statsAdd('pill_make', 1);
      gainExp(4 + r.grade * 4);
      codexNew(r.id);
      if (mutated) {
        pushNews('player', '炉火忽转异彩，丹成极品「' + r.name + '·极品」！药力更胜常品五成。', 1);
      }
    } else {
      explode = XG.util.chance(EXPLODE_RATE);
      if (explode) {
        // —— 炸炉：材料全损 + 顿悟/药灰 ——
        statsAdd('pill_explode', 1);
        pushNews('player', XG.util.pick(EXPLODE_NEWS), 0);
        const epiphanyPool = D().recipes.filter(function (x) {
          return x.hidden && x.cond === 'explode' && a.known.indexOf(x.id) < 0;
        });
        if (epiphanyPool.length && XG.util.chance(EXPLODE_EPIPHANY)) {
          const got = XG.util.pick(epiphanyPool);
          learn(got.id, true);
          codexNew(got.id);
          pushNews('player', '炸炉之际灵光乍现，焦烟之中竟悟得隐世丹方「' + got.name + '」！', 2);
        } else if (XG.util.chance(EXPLODE_ASH)) {
          const ash = XG.util.pick(ASH_HERBS);
          const n = XG.util.randInt(1, 2);
          XG.addRes({ mat: pillPair(ash, n) });
          pushNews('player', '炉灰之中尚余一丝药性，拣得「' + matName(ash) + '」×' + n + '，聊胜于无。', 0);
        }
      } else {
        // —— 普通失败：40% 概率残留 1 份材料 ——
        const ids = r.cost && r.cost.mat ? Object.keys(r.cost.mat) : [];
        if (ids.length && XG.util.chance(FAIL_REMAINDER)) {
          const keep = XG.util.pick(ids);
          XG.addRes({ mat: pillPair(keep, 1) });
        }
      }
    }

    const payload = { ok: ok, explode: explode, mutated: mutated, pillId: ok ? pillId : r.id, grade: r.grade };
    XG.bus.emit('alch:done', payload);
    XG.bus.emit('save:dirty');
    return payload;
  }

  function pillPair(id, n) { const o = {}; o[id] = n; return o; }
  function matName(id) {
    const m = (XG.data.mats || {})[id];
    return m ? m.name : id;
  }

  // ===================== 服用丹药 =====================
  function baseIdOf(pillId) {
    return pillId.slice(-STAR_SUFFIX.length) === STAR_SUFFIX ? pillId.slice(0, -STAR_SUFFIX.length) : pillId;
  }

  function usePill(pillId) {
    const st = XG.state;
    const a = A();
    const have = (st.inv.pill || {})[pillId] || 0;
    if (have <= 0) return { ok: false, msg: '囊中无此丹药' };
    const baseId = baseIdOf(pillId);
    const star = baseId !== pillId;
    const r = recipeOf(baseId);
    if (!r) return { ok: false, msg: '丹方已失传，此丹不可辨' };

    const tox = st.player.toxicity || 0;
    if (r.eff.type !== 'tox' && tox > TOX_BAN) {
      return { ok: false, msg: '丹毒攻心，百脉壅塞，无法再服丹药——先服解毒丹！' };
    }
    if (r.eff.type === 'break') {
      const seg = r.seg || [0, 8];
      if (st.player.realmIdx < seg[0] || st.player.realmIdx > seg[1]) {
        return { ok: false, msg: '此丹与当前境界不合，强服无益' };
      }
      if ((a.breakPills || []).length >= BREAK_PILL_MAX) {
        return { ok: false, msg: '破境丹药力已积三颗，须待突破之后方可再服' };
      }
    }

    XG.addRes({ pill: pillPair(pillId, -1) });
    const mult = star ? STAR_MULT : 1;
    const msg = applyPillEff(r, mult, star);
    if (r.tox) addTox(r.tox);
    if (XG.stats) XG.stats.invalidate();
    XG.bus.emit('save:dirty');
    return { ok: true, msg: msg, star: star, eff: r.eff };
  }

  function applyPillEff(r, mult, star) {
    const a = A();
    const st = XG.state;
    const now = Date.now();
    const name = r.name + (star ? '·极品' : '');
    const bval = r.eff.val; // 分支判定用原值（root 的 1/2/3 语义不被倍率污染）
    const val = r.eff.val * mult;
    switch (r.eff.type) {
      case 'cult':
        if (r.eff.dur) {
          setBuff('cult', val, r.eff.dur);
          return '服下' + name + '，心若明镜，' + XG.util.fmtTime(r.eff.dur) + '内修炼速度 +' + Math.round(val) + '%。';
        }
        addCult(val, '服用' + name);
        return '服下' + name + '，药力化作精纯修为（+' + XG.util.fmt(val) + '）。';
      case 'break':
        a.breakPills.push({ pillId: r.id, val: val, star: !!star });
        return '服下' + name + '，药力沉入丹田蓄势待发（突破成功率 +' + Math.round(val * 100) + '%，突破时生效）。';
      case 'heal':
        XG.bus.emit('alch:heal', { val: XG.util.clamp(val, 0, 1), dur: r.eff.dur || 0, star: !!star });
        return '服下' + name + '，一股暖流游走四肢百骸，伤势渐愈。';
      case 'tox':
        addTox(val); // val 为负
        return '服下' + name + '，清凉药力涤荡百脉，丹毒消散' + Math.round(-val) + '点。';
      case 'root': {
        const sr = st.player.spiritRoot;
        if (bval === 1) {
          const pool = ROOT_TYPES.filter(function (t) { return t !== sr.type; });
          sr.type = XG.util.pick(pool);
          pushNews('player', '伐毛洗髓，灵根重塑，五行轮转，资质蹊径自此而分。', 0);
          return '服下' + name + '，灵根五行已重新轮转。';
        }
        if (bval === 2) {
          const up = star ? 2 : 1;
          sr.grade = Math.min(5, (sr.grade || 1) + up);
          return '服下' + name + '，根骨精进，灵根品阶提升至' + sr.grade + '品。';
        }
        setBuff('rootWash', 0.25, r.eff.dur || 1800);
        return '服下' + name + '，雷火淬形，' + XG.util.fmtTime(r.eff.dur || 1800) + '内洗练灵根变异率大增。';
      }
      case 'atk':
      case 'def':
      case 'hp':
      case 'work': {
        setBuff(r.eff.type, val, r.eff.dur || 1800);
        const cn = { atk: '攻势', def: '守御', hp: '气血', work: '灵宠劳作' }[r.eff.type];
        return '服下' + name + '，' + XG.util.fmtTime(r.eff.dur || 1800) + '内' + cn + ' +' + Math.round(val) + '%。';
      }
      case 'exp': {
        const pets = XG.sys.pets;
        let fed = false;
        if (pets) {
          try {
            if (typeof pets.feedTeamExp === 'function') { pets.feedTeamExp(val, '兽丹'); fed = true; }
            else if (typeof pets.addTeamExp === 'function') { pets.addTeamExp(val); fed = true; }
          } catch (e) { fed = false; }
        }
        if (fed) return '以' + name + '喂养出战灵宠，灵宠经验 +' + XG.util.fmt(val) + '。';
        addCult(val * 10, name + '无人可服，药力化归己身'); // 降级：无灵宠系统/无出战宠
        return name + '无可喂之灵宠，药力化归己身（修为 +' + XG.util.fmt(val * 10) + '）。';
      }
    }
    return '服下' + name + '，药力入腹，暖意融融。';
  }

  function setBuff(k, val, durSec) {
    const a = A();
    a.buffs[k] = { val: val, until: Date.now() + durSec * 1000 };
    if (XG.stats) XG.stats.invalidate();
  }

  // ===================== 异火 =====================
  function gainFire(fireId, silent) {
    const a = A();
    const f = fireOf(fireId);
    if (!f || a.fires[fireId]) return false;
    a.fires[fireId] = 1;
    if (!silent) {
      pushNews('player', '收服异火「' + f.icon + f.name + '」！丹道之火，自此更添一分神异。', f.hidden ? 2 : 1);
    }
    XG.bus.emit('save:dirty');
    return true;
  }

  function setFire(fireId) {
    const a = A();
    if (fireId === 'fire_fan' || fireId == null) {
      a.fire = null;
      return { ok: true, msg: '改用凡火。' };
    }
    if (!a.fires[fireId]) return { ok: false, msg: '尚未收服此异火' };
    if (!fireOf(fireId)) return { ok: false, msg: '异火不存在' };
    a.fire = fireId;
    XG.bus.emit('save:dirty');
    return { ok: true, msg: '祭出「' + fireOf(fireId).name + '」，炉火为之一变。' };
  }

  // ===================== 事件订阅（隐藏内容判定） =====================
  function onAlchDone(p) {
    if (!p) return;
    // 混沌虚火：累计炸炉 ≥100 次，炉火通灵自燃成精
    if (p.explode) {
      const cnt = (XG.state.stats && XG.state.stats.pill_explode) || 0;
      if (cnt >= 100) gainFire('fire_hundun');
    }
  }

  function onExpeditionDone(p) {
    if (!p || !p.mapId) return;
    const a = A();
    if (p.mapId === 'guixu') {
      // 六丁神火：归墟之眼，潮退之夜，神火自现
      if (!a.fires.fire_liuding && XG.util.chance(0.15)) gainFire('fire_liuding');
    }
    if (p.mapId === 'guixu' || p.mapId === 'longyuan') {
      // 混沌一气丹残方：隐藏地图 8% 掉落
      if (a.known.indexOf('pill_hundun') < 0 && XG.util.chance(0.08)) {
        learn('pill_hundun', true);
        pushNews('player', '于' + (p.mapId === 'guixu' ? '归墟' : '龙渊') + '深处拾得上古丹方残页，参悟隐世丹方「混沌一气丹」！', 2);
      }
    }
    if (p.mapId === 'fentian') {
      // 青莲净火：焚天谷地火深泽，青莲浴火而生
      if (!a.fires.fire_qinglian && XG.util.chance(0.12)) gainFire('fire_qinglian');
    }
  }

  function onTowerClear(p) {
    if (!p || typeof p.layer !== 'number') return;
    // 子午天火：镇妖塔每过三十三层，有概率拾得火种
    if (p.layer % 33 === 0 && !A().fires.fire_ziwu && XG.util.chance(0.25)) gainFire('fire_ziwu');
  }

  // ===================== 展示辅助 =====================
  function effText(r, star) {
    const mult = star ? STAR_MULT : 1;
    const val = r.eff.val * mult;
    const dur = r.eff.dur ? XG.util.fmtTime(r.eff.dur) : '';
    switch (r.eff.type) {
      case 'cult':
        return r.eff.dur ? dur + '内修炼速度 +' + Math.round(val) + '%' : '修为 +' + XG.util.fmt(val);
      case 'break': {
        const seg = r.seg || [0, 8];
        const rn = (XG.cfg && XG.cfg.REALMS) || [];
        const segName = seg[0] === seg[1]
          ? (rn[seg[0]] ? rn[seg[0]].name : '?') + '期'
          : (rn[seg[0]] ? rn[seg[0]].name : '?') + '~' + (rn[seg[1]] ? rn[seg[1]].name : '?');
        return '突破成功率 +' + Math.round(val * 100) + '%（限' + segName + '，同次突破≤3颗）';
      }
      case 'heal':
        return r.eff.dur ? dur + '内持续回复气血 ' + Math.round(val * 100) + '%' : '立即回复气血 ' + Math.round(val * 100) + '%';
      case 'tox':
        return '丹毒 ' + Math.round(val) + '点（解毒）';
      case 'root':
        if (r.eff.val === 1) return '重 roll 五行灵根（品阶不变）';
        if (r.eff.val === 2) return '灵根品阶 +' + (star ? 2 : 1) + '（上限 5 品）';
        return dur + '内灵根洗练变异率 +25%';
      case 'atk': return dur + '内攻击 +' + Math.round(val) + '%';
      case 'def': return dur + '内防御 +' + Math.round(val) + '%';
      case 'hp': return dur + '内气血 +' + Math.round(val) + '%';
      case 'work': return dur + '内灵宠产出 +' + Math.round(val) + '%';
      case 'exp': return '出战灵宠经验 +' + XG.util.fmt(val);
    }
    return '';
  }

  // ===================== 系统注册 =====================
  XG.sys.alchemy = {
    id: 'alchemy',

    init() {
      if (this._inited) return;
      this._inited = true;
      const st = XG.state;
      st.alchemy = st.alchemy || {};
      const a = st.alchemy;
      if (typeof a.lv !== 'number' || a.lv < 1) a.lv = 1;
      if (typeof a.exp !== 'number' || a.exp < 0) a.exp = 0;
      if (typeof a.furnace !== 'number' || a.furnace < 1 || !furnaceOf(a.furnace)) a.furnace = 1;
      if (!a.fires || typeof a.fires !== 'object') a.fires = {};
      if (!('fire' in a)) a.fire = null;
      if (a.fire && !a.fires[a.fire]) a.fire = null; // 装备了未持有的火则回退凡火
      if (!Array.isArray(a.known)) a.known = [];
      if (!('job' in a)) a.job = null;
      if (!a.buffs || typeof a.buffs !== 'object') a.buffs = {};
      if (!Array.isArray(a.breakPills)) a.breakPills = [];
      st.player.toxicity = XG.util.clamp(st.player.toxicity || 0, 0, 100);

      // 初始 3 张丹方；老档补漏：lv≥2 时补齐等级对应的非隐藏方（新档由升级自动参悟接管）
      if (!a.known.length) INITIAL_RECIPES.forEach(function (id) { learn(id, true); });
      if (a.lv >= 2) autoLearn(true);

      // 隐藏内容监听（守则 4：订阅方防御性判断）
      XG.bus.on('alch:done', onAlchDone);
      XG.bus.on('expedition:done', onExpeditionDone);
      XG.bus.on('tower:clear', onTowerClear);

      this._toxBand = (st.player.toxicity || 0) > TOX_SLOW;
      this._fireCheckCd = 0;
    },

    tick(dt) {
      const a = A();
      if (!a) return;
      const p = XG.state.player;

      // 丹毒达 100 判定（先于衰减；服丹之外的来源，如奇遇事件，也可能推高丹毒）
      if (p.toxicity >= 100 && !(XG.state.stats && XG.state.stats.tox100)) {
        statsAdd('tox100', 1);
        pushNews('player', '丹毒攻心，百脉俱灼！丹毒已积至顶峰，速觅解毒之方，否则道基堪忧。', 1);
      }
      // 丹毒缓慢衰减；跨越 50 阈值时刷新属性缓存
      if (p.toxicity > 0) {
        const before = p.toxicity;
        p.toxicity = Math.max(0, p.toxicity - dt * TOX_DECAY_PER_SEC);
        const band = p.toxicity > TOX_SLOW;
        if (band !== this._toxBand) {
          this._toxBand = band;
          if (XG.stats) XG.stats.invalidate();
        }
      }

      // 限时丹药 buff 到期清理（触发属性重算）
      let expired = false;
      const now = Date.now();
      for (const k in a.buffs) {
        if (a.buffs[k] && a.buffs[k].until <= now) { delete a.buffs[k]; expired = true; }
      }
      if (expired && XG.stats) XG.stats.invalidate();

      // 丹炉到期结算
      if (a.job && now >= a.job.endAt) settleJob();

      // 地肺真火：洞府丹房（df）≥1 级自动引地火入丹房（每 5 秒轮询一次）
      this._fireCheckCd = (this._fireCheckCd || 0) - dt;
      if (this._fireCheckCd <= 0) {
        this._fireCheckCd = 5;
        if (!a.fires.fire_difu && XG.state.cave && XG.state.cave.lv && (XG.state.cave.lv.df || 0) >= 1) {
          gainFire('fire_difu');
        }
      }
    },

    // 离线结算：到期丹炉结算 + 丹毒衰减
    offline(dt) {
      const a = A();
      if (!a) return null;
      const p = XG.state.player;
      if (p.toxicity > 0) p.toxicity = Math.max(0, p.toxicity - dt * TOX_DECAY_PER_SEC);

      const frag = { events: [] };
      if (a.job && a.job.endAt <= Date.now()) {
        const res = settleJob();
        if (res) {
          if (res.ok) {
            frag.pillGain = pillPair(res.pillId, 1);
            frag.events.push('丹炉熄火，「' + this.pillInfo(res.pillId).name + '」已成，收入囊中。');
          } else if (res.explode) {
            frag.events.push('丹房传来一声闷响——丹炉炸毁，一炉药材尽成飞灰。');
          } else {
            frag.events.push('一炉丹药炼废，药材付诸东流。');
          }
        }
      }
      return frag.events.length ? frag : null;
    },

    // 属性聚合：丹毒 >50 → 修炼 −20%；丹药限时 buff（atk/def/hp/work/cult）
    getMods() {
      const mods = {};
      const p = XG.state.player;
      if ((p.toxicity || 0) > TOX_SLOW) mods.cultRatePct = -20;
      const a = XG.state.alchemy;
      if (!a || !a.buffs) return mods;
      const now = Date.now();
      const b = a.buffs;
      if (b.cult && b.cult.until > now) mods.cultRatePct = (mods.cultRatePct || 0) + b.cult.val;
      if (b.atk && b.atk.until > now) mods.atkPct = (mods.atkPct || 0) + b.atk.val;
      if (b.def && b.def.until > now) mods.defPct = (mods.defPct || 0) + b.def.val;
      if (b.hp && b.hp.until > now) mods.hpPct = (mods.hpPct || 0) + b.hp.val;
      if (b.work && b.work.until > now) mods.workPct = (mods.workPct || 0) + b.work.val;
      return mods;
    },

    // ===================== UI 对接面：查询 =====================
    getState() {
      const a = A();
      const tox = XG.state.player.toxicity || 0;
      return {
        lv: a.lv,
        exp: a.exp,
        expNeed: expNeed(a.lv),
        maxLv: MAX_LV,
        tox: tox,
        toxSlow: tox > TOX_SLOW,
        toxBan: tox > TOX_BAN,
        furnace: curFurnace(),
        fire: curFire(),
        knownCount: a.known.length,
        job: this.getJobProgress(),
        breakPillCount: (a.breakPills || []).length,
      };
    },

    listRecipes() {
      const a = A();
      const self = this;
      return D().recipes.map(function (r) {
        const known = a.known.indexOf(r.id) >= 0;
        const chk = self.canCraft(r.id);
        return {
          id: r.id, name: r.name, icon: r.icon, grade: r.grade, hidden: !!r.hidden,
          alchLv: r.alchLv, known: known,
          canCraft: chk.ok, reason: chk.reason,
          succ: known ? self.succPreview(r.id) : 0,
          time: r.time, cost: r.cost, eff: r.eff, tox: r.tox,
          desc: r.desc, getHint: r.getHint, effText: effText(r, false),
        };
      });
    },

    listFurnaces() {
      const a = A();
      return D().furnaces.map(function (f) {
        return {
          id: f.id, name: f.name, icon: f.icon, succ: f.succ, speed: f.speed,
          cost: f.cost, desc: f.desc,
          owned: f.id <= a.furnace, current: f.id === a.furnace, next: f.id === a.furnace + 1,
        };
      });
    },

    listFires() {
      const a = A();
      return D().fires.map(function (f) {
        return {
          id: f.id, name: f.name, icon: f.icon, grade: f.grade,
          succ: f.succ, mutPct: f.mutPct, hidden: !!f.hidden,
          owned: !!a.fires[f.id] || f.id === 'fire_fan',
          equipped: f.id === 'fire_fan' ? !a.fire : a.fire === f.id,
          getHint: f.getHint, desc: f.desc,
        };
      });
    },

    getJobProgress() {
      const a = A();
      if (!a || !a.job) return null;
      const r = recipeOf(a.job.recipeId);
      const now = Date.now();
      const remain = Math.max(0, (a.job.endAt - now) / 1000);
      return {
        recipeId: a.job.recipeId,
        name: r ? r.name : a.job.recipeId,
        icon: r ? r.icon : '❓',
        pct: a.job.dur > 0 ? XG.util.clamp(1 - remain / a.job.dur, 0, 1) : 1,
        remainSec: remain,
        endAt: a.job.endAt,
        dur: a.job.dur,
      };
    },

    succPreview(recipeId) {
      const r = recipeOf(recipeId);
      return r ? succRate(r) : 0;
    },

    canCraft: canCraft,
    startCraft: startCraft,
    cancelCraft: cancelCraft,

    buyFurnace() {
      const a = A();
      const next = furnaceOf(a.furnace + 1);
      if (!next) return { ok: false, msg: '太上八卦炉已是人间极致，无炉可换' };
      if (!XG.hasRes({ lingShi: next.cost })) {
        return { ok: false, msg: '灵石不足（需 ' + XG.util.fmt(next.cost) + '）' };
      }
      XG.addRes({ lingShi: -next.cost });
      a.furnace = next.id;
      pushNews('player', '重金购得「' + next.name + '」，丹房气象一新。', 0);
      XG.bus.emit('save:dirty');
      return { ok: true, msg: '购得「' + next.icon + next.name + '」，成功率 +' + next.succ + '%，炉速 ×' + next.speed + '。' };
    },

    gainFire: gainFire,
    setFire: setFire,
    usePill: usePill,
    learn: learn,
    learnRandomRecipe: learnRandomRecipe,

    // 背包丹药展示/可用性
    pillInfo(pillId) {
      const st = XG.state;
      const baseId = baseIdOf(pillId);
      const star = baseId !== pillId;
      const r = recipeOf(baseId);
      const count = (st.inv.pill || {})[pillId] || 0;
      if (!r) {
        return { id: pillId, baseId: baseId, star: star, name: pillId, icon: '❓', grade: 0, desc: '', effText: '', tox: 0, usable: false, reason: '丹方已失传', count: count };
      }
      const tox = st.player.toxicity || 0;
      let usable = true;
      let reason = '';
      if (r.eff.type !== 'tox' && tox > TOX_BAN) { usable = false; reason = '丹毒>80，禁服'; }
      else if (r.eff.type === 'break') {
        const seg = r.seg || [0, 8];
        if (st.player.realmIdx < seg[0] || st.player.realmIdx > seg[1]) { usable = false; reason = '境界不合'; }
        else if ((A().breakPills || []).length >= BREAK_PILL_MAX) { usable = false; reason = '已积3颗破境丹'; }
      }
      return {
        id: pillId, baseId: baseId, star: star,
        name: r.name + (star ? '·极品' : ''),
        icon: r.icon + (star ? '★' : ''),
        grade: r.grade, desc: r.desc,
        effText: effText(r, star), tox: r.tox,
        usable: usable, reason: reason, count: count,
      };
    },

    // ===================== 跨系统读取接口 =====================
    getBreakBuffs() {
      const a = A();
      return (a.breakPills || []).map(function (b) {
        const r = recipeOf(b.pillId);
        return {
          pillId: b.pillId,
          name: (r ? r.name : b.pillId) + (b.star ? '·极品' : ''),
          icon: r ? r.icon : '❓',
          val: b.val,
          star: !!b.star,
        };
      });
    },

    getBreakBuffBonus() {
      const a = A();
      let sum = 0;
      (a.breakPills || []).forEach(function (b) { sum += b.val || 0; });
      return sum;
    },

    // cultivation 突破时调用：取走破境丹加值合计（小数）并清空
    consumeBreakBuffs() {
      const a = A();
      const sum = this.getBreakBuffBonus();
      a.breakPills = [];
      XG.bus.emit('save:dirty');
      return sum;
    },

    // 灵根洗练变异率加成（淬灵丹 buff），cultivation 洗练时读取
    getRootWashBoost() {
      const b = A().buffs || {};
      return b.rootWash && b.rootWash.until > Date.now() ? b.rootWash.val : 0;
    },

    getBuffs() {
      const a = A();
      const now = Date.now();
      const out = {};
      for (const k in a.buffs) {
        const b = a.buffs[k];
        if (b && b.until > now) out[k] = { val: b.val, remainSec: (b.until - now) / 1000 };
      }
      return out;
    },

    getToxInfo() {
      const tox = XG.state.player.toxicity || 0;
      return { tox: tox, slow: tox > TOX_SLOW, ban: tox > TOX_BAN, decayPerSec: TOX_DECAY_PER_SEC };
    },
  };

  XG.sysOrder.push('alchemy');
})();
