/* sys/pets.js：灵宠系统 —— 孵蛋/捕捉、资质/性格/技能 roll、升级、进化、血脉觉醒、繁殖、出战加成、打工产出
 * ====================================================================================================
 * 【玩法对照任务书】
 *  · 获得：孵蛋（耗 state.inv.egg，物种按 w 权重抽，高品阶受玩家境界门槛过滤：g2 筑基 / g3 金丹 / g4 化神）；
 *    捕捉与事件直给走 catchPet(spId)（供 expedition / adventure 调用，可给 w:0 隐藏物种）。
 *    隐藏物种 w:0 不入蛋池：饕餮=繁殖 2% 异变；白泽=归墟偶遇事件（adventure 调 catchPet('pet_baize')）；
 *    神兽（苍龙/丹凰/麒麟/玄武/白虎/鲲鹏）= 进化链终段。
 *  · 实例：资质 1~100 六档（data aptTiers，倍率 0.6~2.0；三骰加权偏态 roll，天赐 ≈0.5%）；性格按 w 抽
 *    （data personas，workPct 影响打工、fightPct 影响出战折算）；技能栏 1~3 个（data skills 按 w 抽，
 *    hidden 血脉技不进随机池，work 类只影响打工，buff 类出战时并入主人面板）。
 *  · 养成：等级（出战宠每秒得经验；喂宠物经验丹 feedPill；alchemy 服群体兽丹调 addTeamExp）；
 *    进化（达 evo.lv + 耗 evo.item 材料，属性随新物种 base 暴涨，换 species 名/icon）；
 *    血脉觉醒（纯度出生 roll 20~100，凡血恒 0；≥60 耗材料觉醒：全属性 +50% + 解锁 bloods[].skill 隐藏技）。
 *  · 繁殖（cfg.UNLOCKS.petBreed，元婴1层）：两只 ≥lv30 耗灵石（异性不论），后代物种随父母一方、
 *    资质继承均值±20、血脉纯度取高±10、2% 异变出饕餮；双亲各 24h 冷却。
 *  · 出战：team≤3；宠物最终属性 ×0.2（CONVERT）折算 atkFlat/defFlat/hpFlat/spdFlat 进 getMods，
 *    再乘性格 fightPct；buff 技能 pct 原样并入；cai 擅长出战每只 +3 dropPct；
 *    3 宠同血脉（非泛血）触发【血脉共鸣】atkPct+5/defPct+5。
 *  · 打工：jobs 分配（lt 灵田→灵草/h；sl 兽栏→宠物经验/h；explore 探索→灵石/h），
 *    产出 = 基础率 ×(1+性格/打工技能 workPct) ×(1+全局 workPct，如力士丹) ×洞府建筑加成（灵田/兽栏 +5%/级），
 *    tick 累积进「待领池」state.pets.jobGain，collect()/quickCollect() 一键领取；offline 同口径入池并出报告。
 * ====================================================================================================
 * 【UI 对接面】（本文件纯逻辑，以下即 UI 唯一接口依据；全部函数在 XG.sys.pets 上）
 *
 *  —— 数据结构 PetView（list/get/teamList 返回元素；均为普通对象，可直接渲染）——
 *  { uid, sp, spName, icon, grade, hidden, spDesc, blood, bloodName, bloodIcon,
 *    name, shiny, src, bornAt, breedCd,                       // breedCd: 繁殖冷却截止 ts（0=无冷却）
 *    lv, exp, expNeed, isMaxLv,                               // expNeed=当前级升下一级所需；满级 expNeed=0
 *    apt, tier, tierName, aptMult,                            // 资质数值/档位 id/档位名/倍率
 *    persona, personaName, personaWorkPct, personaFightPct, personaDesc,
 *    purity, awaken, awakenSkillId,                           // 血脉纯度/是否觉醒/血脉隐藏技 id（无则 null）
 *    skills: [{id,name,icon,type,desc,eff}],                  // 已学技能（觉醒技在第 4 位也正常）
 *    stats: {atk,def,hp,spd}, power,                          // 宠物最终面板与战力（含资质/觉醒/性格擅长加成）
 *    inTeam, job }                                            // job: null|'lt'|'sl'|'explore'
 *
 *  —— 查询 ——
 *  list()            → [PetView] 全部灵宠（获得时间新→旧）
 *  get(uid)          → PetView | null
 *  teamList()        → [PetView] 出战队列（≤3）
 *  teamCap()         → 3
 *  eggs()            → 当前灵宠蛋数量
 *  codexPets()       → [speciesId] 已解锁图鉴（读 state.codex.pet）
 *  speciesOf(spId)   → data 物种行 | null（含 getHint/desc/base/apt/evo/w）
 *  skillInfo(id)     → data 技能行 | null
 *  personaInfo(id)   → data 性格行 | null
 *  bloodInfo(id)     → data 血脉行 | null
 *  tierOf(apt)       → {id,name,min,max,mult} 资质档
 *  jobDefs()         → { lt:{id,name,icon,desc}, sl:{...}, explore:{...} } 打工定义
 *  jobCap()          → 打工位上限（3 + 洞府兽栏等级/2 + 段位等级 + 境界等级）
 *  jobList()         → [{ uid, pet:PetView, job, jobName, icon }]
 *  ratesFor(uid)     → { herbPerH, expPerH, lingShiPerH } 该宠三种打工的小时产出（已含全部倍率）
 *  pending()         → { lingShi, mat:{matId:n} } 待领池原值（lingShi 为浮点，显示请 fmtInt）
 *  powerOf(uid)      → number 单宠战力（expedition 派遣校验可用）
 *  teamPower()       → number 当前出战合计战力
 *  canEvolve(uid)    → { ok, reason, need:{lv, curLv, item, itemName, itemHave} }
 *  canAwaken(uid)    → { ok, reason, cost }
 *  canBreed(uidA,uidB) → { ok, reason, cost, cdUntil }      // cdUntil=双方冷却截止较大 ts
 *  hatchPoolInfo()   → [{ spId, name, icon, grade, w, pct }] 当前境界可孵池（pct=概率%，按 w 算）
 *  consts            → { TEAM_CAP, MAX_LV, CONVERT, BREED_COST, BREED_CD_H, AWAKEN_COST, SHINY_P, BREED_MUT_P }
 *
 *  —— 操作（返回 {ok, msg, ...}，msg 已可直接 toast）——
 *  hatch()           → {ok, msg, pet?}             孵蛋（耗 1 蛋；高品阶受境界过滤）
 *  catchPet(spId, src?) → pet | null               【系统对接】捕捉/事件直给（可给隐藏物种），内部全 roll
 *  rename(uid, name) → {ok, msg}                   改名（≤12 字）
 *  addExp(uid, n)    → {ok, lvUps}                 加经验（自动连升，满级 100 截断）
 *  feedPill(uid, pillId) → {ok, msg, lvUps}        喂单宠经验丹（耗背包丹药，读 pills.js eff.type=='exp'）
 *  addTeamExp(n)     → lvUps 合计                  【系统对接】alchemy 服兽用经验丹：出战每只 +n
 *  evolve(uid)       → {ok, msg, from?, to?}       进化（校验 canEvolve）
 *  awaken(uid)       → {ok, msg}                   血脉觉醒（校验 canAwaken，耗 AWAKEN_COST）
 *  breed(uidA, uidB) → {ok, msg, child?}           繁殖（校验 canBreed，耗灵石，双亲入 24h 冷却）
 *  joinTeam(uid)     → {ok, msg}                   入队（≤3；打工中的宠须先召回）
 *  leaveTeam(uid)    → {ok, msg}
 *  setTeam([uids])   → {ok, msg}                   整体换阵（非法项静默剔除）
 *  assignJob(uid, jobId) → {ok, msg}               派工（'lt'|'sl'|'explore'；出战中的宠不可派工）
 *  unassignJob(uid)  → {ok, msg}                   召回
 *  collect()         → {ok, msg, gain:{lingShi,mat}} 领取待领池
 *  quickCollect()    → {msg:[...]}                 契约一键接口（=collect 包装）
 *
 * 【写入的 state.stats 键】（snake，懒初始化 XG.state.stats）
 *  pet_hatch 孵化次数 | pet_catch 捕捉次数 | pet_own 累计获得只数 | pet_grade5 五品神兽获得数
 *  pet_shiny 闪光灵宠数 | pet_evo 进化次数 | pet_awaken 血脉觉醒次数（=check.k petAwaken）
 *  pet_breed 繁殖次数（=check.k petBreed）| pet_job_collect 打工领取次数 | pet_maxlv 百级圆满数
 *
 * 【emit 事件】
 *  pet:awaken {uid}            血脉觉醒（契约标准事件）
 *  pet:breed {uid}             繁殖得子（uid=后代；契约标准事件）
 *  codex:new {kind:'pet', id}  图鉴新增（同时自写 state.codex.pet 去重，供 gongfa 隐藏条件 codex_pet_20 读取）
 *  pets:changed                自定义：灵宠结构变化（获得/进化/觉醒/繁殖/编队/派工/领取），UI 可监听刷新
 *  news                        传闻（神兽降世/异变饕餮/闪光/觉醒/高品获得/百级圆满；pushNews 同步写 state.news）
 *  res:changed / save:dirty    经 XG.addRes 或直接 emit
 *
 * 【offline 行为】offline(dt)：出战宠与兽栏宠按在线秒率补经验（自动升级）；
 *  打工按在线同口径 ×dt 累积进待领池（灵草按期望值取整 + 零头掷骰）；返回报告片段
 *  { petJob:{lingShi, mat:{id:n}, exp}, events:[简讯…] }，无收益返回 null。
 *
 * 【隐藏内容】
 *  1. 饕餮 pet_taotie：繁殖 2% 异变（w:0 不入蛋池，不可进化）
 *  2. 白泽 pet_baize：仅归墟偶遇事件直给（adventure 调 catchPet('pet_baize')）
 *  3. 六神兽走进化链终段（w:0；进化材料 beast_jingxue / beast_shenyu）
 *  4. 闪光灵宠 1%：资质保底 61+、非泛血脉纯度拉满 100，传闻播报
 *  5. 血脉共鸣：出战 3 宠同血脉（非泛）→ atkPct+5 / defPct+5（未写在任何说明里，待玩家自行发现）
 *  6. 血脉觉醒技 pskill_aw_*（w:0 不入随机池，仅觉醒获得；技能栏可因此突破 3 格到第 4 格）
 * ==================================================================================================== */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  /* ============================== 常量 ============================== */
  const TEAM_CAP = 3;                 // 出战上限
  const MAX_LV = 100;                 // 等级上限
  const CONVERT = 0.2;                // 宠物属性折算玩家 flat 的比例
  const EXP_NEED_BASE = 80;           // 升级经验基数：need(lv)=80*lv^1.5*(1+0.25*(grade-1))
  const LV_GROWTH = 0.08;             // 每级属性成长（线性）：lvMul = 1+0.08*(lv-1)
  const SHINY_P = 0.01;               // 闪光概率
  const BREED_COST = 1e5;             // 繁殖灵石消耗
  const BREED_CD_MS = 1800000;        // 繁殖双亲冷却 30min（原 4h）
  const BREED_CD_H = 0.5;
  const BREED_MUT_P = 0.02;           // 异变饕餮概率
  const BREED_LV = 20;                // 繁殖等级门槛（原 30）
  const AWAKEN_COST = { lingShi: 5e4, mat: { beast_dan: 5, beast_jingxue: 1 } }; // 觉醒消耗
  const AWAKEN_PURITY = 60;           // 觉醒纯度门槛（与 data awaken.purityNeed 一致）
  const GRADE_MIN_REALM = { 1: 0, 2: 1, 3: 2, 4: 4 }; // 蛋池品阶→最低大境界（g2筑基/g3金丹/g4化神；g5 不入池）
  const TEAM_EXP_PS = function (g) { return (20 + 10 * g) * (1 + ((XG.state.player || {}).realmIdx || 0)); };   // 出战经验/秒（随境界增长）
  const SL_EXP_PS = function (g) { return (40 + 20 * g) * (1 + ((XG.state.player || {}).realmIdx || 0)); };     // 兽栏经验/秒（随境界增长）
  const HERB_PER_H = 30;              // 灵田灵草期望株数/小时（基础值）
  const EXPLORE_LS_PS = 0.6;          // 探索灵石/秒 = 境界 rate × 0.6 × 品阶
  const CAI_DROP_PCT = 3;             // cai 擅长出战每只 dropPct 加成
  const RESONANCE_PCT = 5;            // 血脉共鸣 atkPct/defPct
  // buff 技能可并入主人面板的 pct 键白名单（排除 dmgPct/healPct/cd/workPct）
  const BUFF_KEYS = ['atkPct', 'defPct', 'hpPct', 'spdPct', 'cultRatePct', 'dropPct', 'breakSuccPct', 'alchSuccPct', 'forgeSuccPct'];

  // 打工定义（lt 灵田→灵草；sl 兽栏→宠物经验；explore 探索→灵石）
  const JOBS = {
    lt:      { id: 'lt', name: '灵田采药', icon: '🌾', desc: '派驻灵田采撷灵草，每小时约 ' + HERB_PER_H + ' 株（品阶随灵宠品阶提升）。' },
    sl:      { id: 'sl', name: '兽栏驯养', icon: '🏕️', desc: '入驻兽栏潜心修炼，持续获得宠物经验（效率高于出战历练）。' },
    explore: { id: 'explore', name: '外出探索', icon: '🧭', desc: '云游四方寻访遗宝，持续带回灵石（随主人境界与灵宠品阶提升）。' },
  };

  /* ============================== 内部助手 ============================== */
  const U = function () { return XG.util; };
  const D = function () { return XG.data.pets || { species: [], skills: [], personas: [], bloods: [], aptTiers: [], awaken: {} }; };

  let _spMap = null, _skillMap = null, _personaMap = null, _bloodMap = null, _herbPools = {};
  function spMap() {
    if (!_spMap) { _spMap = {}; D().species.forEach(function (s) { _spMap[s.id] = s; }); }
    return _spMap;
  }
  function skillMap() {
    if (!_skillMap) { _skillMap = {}; D().skills.forEach(function (s) { _skillMap[s.id] = s; }); }
    return _skillMap;
  }
  function personaMap() {
    if (!_personaMap) { _personaMap = {}; D().personas.forEach(function (p) { _personaMap[p.id] = p; }); }
    return _personaMap;
  }
  function bloodMap() {
    if (!_bloodMap) { _bloodMap = {}; D().bloods.forEach(function (b) { _bloodMap[b.id] = b; }); }
    return _bloodMap;
  }
  function bySp(id) { return spMap()[id] || null; }
  function skillOf(id) { return skillMap()[id] || null; }
  function personaOf(id) { return personaMap()[id] || { id: id, name: id, workPct: 0, fightPct: 0, desc: '' }; }
  function bloodOf(id) { return bloodMap()[id] || { id: id, name: '凡血', icon: '凡', grade: 1, skill: null, desc: '' }; }
  function tierOf(apt) {
    const tiers = D().aptTiers || [];
    for (let i = 0; i < tiers.length; i++) if (apt >= tiers[i].min && apt <= tiers[i].max) return tiers[i];
    return tiers[tiers.length - 1] || { id: 'liang', name: '良品', min: 41, max: 60, mult: 1 };
  }

  function P() { return XG.state.pets; }
  function byUid(uid) {
    const list = P().list;
    for (let i = 0; i < list.length; i++) if (list[i].uid === uid) return list[i];
    return null;
  }

  // 统计累加（契约守则 3：懒初始化 state.stats，snake 键名）
  function addStat(k, n) {
    const st = (XG.state.stats = XG.state.stats || {});
    st[k] = (st[k] || 0) + (n || 1);
  }
  // 传闻推送（emit + 自写 state.news，按 NEWS_CAP 截断）
  function pushNews(cat, text, imp) {
    const n = { t: Date.now(), cat: cat || 'system', text: text, imp: imp || 0 };
    XG.state.news = XG.state.news || [];
    XG.state.news.unshift(n);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (XG.state.news.length > cap) XG.state.news.length = cap;
    XG.bus.emit('news', n);
  }
  function emitChanged() {
    XG.bus.emit('pets:changed');
    XG.bus.emit('save:dirty');
  }
  function invalidate() { if (XG.stats && XG.stats.invalidate) XG.stats.invalidate(); }
  // 图鉴登记（去重自写 state.codex.pet + emit codex:new；供 gongfa 隐藏条件 codex_pet_20 读取）
  function regCodex(spId) {
    const c = (XG.state.codex = XG.state.codex || {});
    c.pet = c.pet || [];
    if (c.pet.indexOf(spId) >= 0) return false;
    c.pet.push(spId);
    XG.bus.emit('codex:new', { kind: 'pet', id: spId });
    return true;
  }
  function matName(id) { const m = (XG.data.mats || {})[id]; return m ? m.name : id; }

  /* ============================== roll 管线 ============================== */
  // 资质：三骰加权偏态（均值≈50，天赐≈0.5%，废材≈5%），区间 [1,100]
  function rollApt() {
    const r = (Math.random() + Math.random() + Math.random()) / 3;
    return U().clamp(1 + Math.floor(r * 100), 1, 100);
  }
  function rollPersonaId() {
    const p = U().weighted(D().personas, 'w');
    return p ? p.id : 'zhongcheng';
  }
  // 技能：1~3 个（1:50% / 2:37.5% / 3:12.5%），按 w 不放回抽，hidden（血脉技）不入池
  function rollSkills() {
    const n = 1 + (U().chance(0.5) ? 1 : 0) + (U().chance(0.25) ? 1 : 0);
    const pool = D().skills.filter(function (s) { return !s.hidden && (s.w || 0) > 0; });
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const sk = U().weighted(pool, 'w');
      if (!sk) break;
      out.push(sk.id);
      pool.splice(pool.indexOf(sk), 1);
    }
    return out;
  }
  // 生成宠物实例（获得统一入口：hatch/catch/breed 均走此）
  function makePet(spId, src) {
    const sp = bySp(spId);
    if (!sp) return null;
    let apt = rollApt();
    let purity = sp.blood === 'fan' ? 0 : U().randInt(20, 100);
    const shiny = U().chance(SHINY_P) ? 1 : 0;
    if (shiny) { // 闪光：资质保底 61+，非泛血脉纯度拉满
      apt = Math.max(apt, U().randInt(61, 100));
      if (sp.blood !== 'fan') purity = 100;
    }
    const names = XG.data.petNames || [];
    return {
      uid: U().uid(),
      sp: sp.id,
      name: names.length ? U().pick(names) : sp.name,
      lv: 1, exp: 0,
      apt: apt,
      persona: rollPersonaId(),
      purity: purity,
      awaken: false,
      skills: rollSkills(),
      shiny: shiny,
      src: src || 'hatch',
      bornAt: Date.now(),
      breedCd: 0,
    };
  }
  // 获得后的统一收尾：登记图鉴/统计/传闻/刷新
  function onObtain(pet) {
    const sp = bySp(pet.sp);
    P().list.push(pet);
    regCodex(pet.sp);
    addStat('pet_own');
    if (sp.grade >= 5) addStat('pet_grade5');
    if (pet.shiny) addStat('pet_shiny');
    const tier = tierOf(pet.apt);
    if (pet.shiny) {
      pushNews('player', '【异象】' + pet.name + '（' + sp.name + '）降生时霞光绕体，乃百年一遇的闪光灵宠！', 2);
    } else if (sp.grade >= 5) {
      pushNews('player', '【神兽降世】' + sp.name + '现世，四海修士皆有所感。', 2);
    } else if (sp.grade >= 4 || tier.id === 'tianci') {
      pushNews('system', '道友喜得灵宠「' + sp.name + '」（' + tier.name + '资质），气度不凡。', 1);
    }
    invalidate();
    emitChanged();
    return pet;
  }

  /* ============================== 属性与等级 ============================== */
  function expNeed(lv, grade) {
    return Math.round(EXP_NEED_BASE * Math.pow(lv, 1.5) * (1 + 0.25 * (grade - 1)));
  }
  // 宠物最终面板：base × 等级成长 × 资质倍率 ×(觉醒 1.5) ×擅长加成
  function petStats(pet) {
    const sp = bySp(pet.sp) || D().species[0];
    if (!sp) return { atk: 0, def: 0, hp: 0, spd: 0 };
    const lvMul = 1 + LV_GROWTH * (pet.lv - 1);
    const aptMul = tierOf(pet.apt).mult;
    const aw = pet.awaken ? 1.5 : 1;
    const m = lvMul * aptMul * aw;
    const apt = sp.apt || [];
    const gong = apt.indexOf('gong') >= 0 ? 1.1 : 1;
    const shou = apt.indexOf('shou') >= 0 ? 1.1 : 1;
    const su = apt.indexOf('su') >= 0 ? 1.3 : 1;
    return {
      atk: sp.base.atk * m * gong,
      def: sp.base.def * m * shou,
      hp: sp.base.hp * m * shou,
      spd: (sp.base.atk + sp.base.def) * 0.05 * m * su,
    };
  }
  function powerOfPet(pet) {
    const s = petStats(pet);
    return XG.cfg.POWER({ atk: s.atk, def: s.def, hp: s.hp, spd: s.spd });
  }
  // 加经验（内部）：返回升级数；满级清零经验；到顶发一次传闻
  function applyExp(pet, n) {
    if (!pet || n <= 0 || pet.lv >= MAX_LV) { if (pet && pet.lv >= MAX_LV) pet.exp = 0; return 0; }
    const sp = bySp(pet.sp);
    const grade = sp ? sp.grade : 1;
    pet.exp += n;
    let ups = 0;
    while (pet.lv < MAX_LV) {
      const need = expNeed(pet.lv, grade);
      if (pet.exp < need) break;
      pet.exp -= need;
      pet.lv++;
      ups++;
    }
    if (pet.lv >= MAX_LV) {
      if (pet.exp > 0) pet.exp = 0;
      if (ups > 0) {
        addStat('pet_maxlv');
        pushNews('system', '灵宠「' + pet.name + '」勤修不辍，终臻百级圆满！', 1);
      }
    }
    if (ups > 0) invalidate();
    return ups;
  }

  /* ============================== 打工 ============================== */
  function caveLv(id) { const c = XG.state.cave; return (c && c.lv && c.lv[id]) || 0; }
  // 段位等级：论剑段位 idx（青铜=0 递增至仙尊=5），防御性降级
  function pvpTierIdx() {
    try {
      const pvp = XG.sys.pvp;
      if (pvp && typeof pvp.getOverview === 'function') {
        const ov = pvp.getOverview();
        if (ov && ov.tier && typeof ov.tier.idx === 'number') return ov.tier.idx;
      }
    } catch (e) { /* ignore */ }
    return 0;
  }
  // 打工总倍率：1 +(性格 workPct + 打工技能 workPct + 全局 workPct，如力士丹)/100
  function workMult(pet) {
    let pct = personaOf(pet.persona).workPct || 0;
    (pet.skills || []).forEach(function (id) {
      const sk = skillOf(id);
      if (sk && sk.type === 'work' && sk.eff) pct += (sk.eff.workPct || 0);
    });
    let g = 0;
    try { g = (XG.stats && XG.stats.get().workPct) || 0; } catch (e) { g = 0; }
    return Math.max(0.1, 1 + (pct + g) / 100);
  }
  function jobCaveBonus(job) {
    if (job === 'lt') return 1 + 0.05 * caveLv('lt');
    if (job === 'sl') return 1 + 0.05 * caveLv('sl');
    return 1;
  }
  // 灵草池：按宠物品阶封顶（g1-2→一阶草；g3-4→≤二阶；g5→≤三阶），权重 = 6-品阶
  function herbPool(grade) {
    const cap = grade <= 2 ? 1 : grade <= 4 ? 2 : 3;
    if (_herbPools[cap]) return _herbPools[cap];
    const mats = XG.data.mats || {};
    const pool = [];
    for (const id in mats) {
      if (id.indexOf('herb_') === 0 && (mats[id].grade || 1) <= cap) {
        pool.push({ id: id, w: Math.max(1, 6 - (mats[id].grade || 1)) });
      }
    }
    _herbPools[cap] = pool.length ? pool : [{ id: 'herb_qingling', w: 1 }];
    return _herbPools[cap];
  }
  function pickHerb(grade) {
    const it = U().weighted(herbPool(grade), 'w');
    return it ? it.id : 'herb_qingling';
  }
  function realmRate() {
    const p = XG.state.player || { realmIdx: 0 };
    const r = XG.cfg.REALMS[p.realmIdx] || XG.cfg.REALMS[0];
    return r.rate;
  }
  // 三种打工的小时速率（含全部倍率），供 tick/offline/UI 共用
  function jobRates(pet, job) {
    const sp = bySp(pet.sp);
    const grade = sp ? sp.grade : 1;
    const mult = workMult(pet) * jobCaveBonus(job);
    let herbPerH = 0, expPerH = 0, lingShiPerH = 0;
    if (job === 'lt') herbPerH = HERB_PER_H * mult;
    else if (job === 'sl') expPerH = SL_EXP_PS(grade) * 3600 * mult;
    else if (job === 'explore') {
      const cai = sp && (sp.apt || []).indexOf('cai') >= 0 ? 1.15 : 1; // cai 擅长探索加成
      lingShiPerH = realmRate() * EXPLORE_LS_PS * grade * 3600 * mult * cai;
    }
    return { herbPerH: herbPerH, expPerH: expPerH, lingShiPerH: lingShiPerH };
  }
  const _herbAcc = {}; // 灵草小数累积（运行时，不入存档）
  function gainHerb(jobGain, pet) {
    const sp = bySp(pet.sp);
    const id = pickHerb(sp ? sp.grade : 1);
    jobGain.mat[id] = (jobGain.mat[id] || 0) + 1;
    return id;
  }

  /* ============================== 模块协议 ============================== */
  XG.sys.pets = {
    id: 'pets',

    // 启动自恢复：补全 state 结构、清洗失效引用、补全实例字段
    init() {
      const st = (XG.state.pets = XG.state.pets || {});
      st.list = st.list || [];
      st.team = st.team || [];
      st.jobs = st.jobs || {};
      st.jobGain = st.jobGain || { lingShi: 0, mat: {} };
      st.jobGain.lingShi = st.jobGain.lingShi || 0;
      st.jobGain.mat = st.jobGain.mat || {};
      const self = this;
      st.team = st.team.filter(function (uid) { return !!self._byUid(uid); });
      for (const uid in st.jobs) {
        if (!self._byUid(uid) || !JOBS[st.jobs[uid]]) delete st.jobs[uid];
      }
      st.list.forEach(function (p) {
        p.lv = p.lv || 1;
        p.exp = p.exp || 0;
        p.apt = p.apt || 50;
        p.persona = p.persona || 'zhongcheng';
        p.purity = p.purity || 0;
        p.skills = p.skills || [];
        p.awaken = !!p.awaken;
        p.shiny = p.shiny || 0;
        p.breedCd = p.breedCd || 0;
      });
      invalidate();
    },

    // 每秒：出战宠得经验 + 打工产出累积进待领池
    tick(dt) {
      if (!dt || dt <= 0) return;
      const st = P();
      if (!st) return;
      // 保底第一只灵宠：灵宠系统解锁（炼气5层）后，若囊中无宠亦无蛋，赠灵宠蛋一枚——
      // 破「无宠不能历练、无历练不得宠蛋」的死循环（一次性，存 state 持久标记）
      if (!st.starterGiven && XG.cfg.isUnlocked('pets') && !st.list.length && !((XG.state.inv && XG.state.inv.egg) || 0)) {
        st.starterGiven = 1;
        XG.addRes({ egg: 1 });
        pushNews('system', '你于山中独行，忽闻草间嘤鸣，俯身拾得一枚温热的灵宠蛋——且往灵宠页孵化一试。', 1);
      }
      if (!st.list.length) return;
      // 出战经验
      for (let i = 0; i < st.team.length; i++) {
        const pet = this._byUid(st.team[i]);
        if (!pet) continue;
        const sp = bySp(pet.sp);
        applyExp(pet, TEAM_EXP_PS(sp ? sp.grade : 1) * dt);
      }
      // 打工
      for (const uid in st.jobs) {
        const pet = this._byUid(uid);
        if (!pet) continue;
        const job = st.jobs[uid];
        const sp = bySp(pet.sp);
        const grade = sp ? sp.grade : 1;
        const r = jobRates(pet, job);
        if (job === 'explore') {
          st.jobGain.lingShi += (r.lingShiPerH / 3600) * dt;
        } else if (job === 'sl') {
          applyExp(pet, (r.expPerH / 3600) * dt);
        } else if (job === 'lt') {
          _herbAcc[uid] = (_herbAcc[uid] || 0) + (r.herbPerH / 3600) * dt;
          while (_herbAcc[uid] >= 1) {
            _herbAcc[uid] -= 1;
            gainHerb(st.jobGain, pet);
          }
        }
      }
    },

    // 离线结算：同 tick 口径 ×dt 入待领池；灵草期望取整 + 零头掷骰；返回报告片段
    offline(dt) {
      if (!dt || dt <= 0) return null;
      const st = P();
      if (!st || !st.list.length) return null;
      let expSum = 0, lsSum = 0;
      const matSum = {};
      // 出战经验
      for (let i = 0; i < st.team.length; i++) {
        const pet = this._byUid(st.team[i]);
        if (!pet) continue;
        const sp = bySp(pet.sp);
        const e = TEAM_EXP_PS(sp ? sp.grade : 1) * dt;
        applyExp(pet, e);
        expSum += e;
      }
      // 打工
      for (const uid in st.jobs) {
        const pet = this._byUid(uid);
        if (!pet) continue;
        const job = st.jobs[uid];
        const r = jobRates(pet, job);
        if (job === 'explore') {
          const v = (r.lingShiPerH / 3600) * dt;
          st.jobGain.lingShi += v;
          lsSum += v;
        } else if (job === 'sl') {
          const e = (r.expPerH / 3600) * dt;
          applyExp(pet, e);
          expSum += e;
        } else if (job === 'lt') {
          const expect = (r.herbPerH / 3600) * dt;
          let n = Math.floor(expect);
          if (U().chance(expect - n)) n += 1; // 零头掷骰，保留欧非体验
          for (let i = 0; i < n; i++) {
            const id = gainHerb(st.jobGain, pet);
            matSum[id] = (matSum[id] || 0) + 1;
          }
        }
      }
      if (expSum <= 0 && lsSum <= 0 && !Object.keys(matSum).length) return null;
      const parts = [];
      if (lsSum > 0) parts.push('灵石 +' + U().fmtInt(lsSum));
      let herbN = 0;
      for (const id in matSum) herbN += matSum[id];
      if (herbN > 0) parts.push('灵草 ×' + herbN);
      if (expSum > 0) parts.push('灵宠经验 +' + U().fmtInt(expSum));
      return {
        petJob: { lingShi: Math.round(lsSum), mat: matSum, exp: Math.round(expSum) },
        events: ['灵宠勤勉打工 ' + U().fmtTime(dt) + '：' + parts.join('，') + '（已存入待领池）'],
      };
    },

    // 属性聚合：出战宠 flat 折算 + buff 技能 + cai 擅长 + 血脉共鸣
    getMods() {
      const st = P();
      const mods = {};
      if (!st || !st.team || !st.team.length) return mods;
      const bloodCount = {};
      for (let i = 0; i < st.team.length; i++) {
        const pet = this._byUid(st.team[i]);
        if (!pet) continue;
        const sp = bySp(pet.sp);
        const s = petStats(pet);
        const fm = 1 + (personaOf(pet.persona).fightPct || 0) / 100;
        mods.atkFlat = (mods.atkFlat || 0) + s.atk * CONVERT * fm;
        mods.defFlat = (mods.defFlat || 0) + s.def * CONVERT * fm;
        mods.hpFlat = (mods.hpFlat || 0) + s.hp * CONVERT * fm;
        mods.spdFlat = (mods.spdFlat || 0) + s.spd * CONVERT * fm;
        (pet.skills || []).forEach(function (id) {
          const sk = skillOf(id);
          if (!sk || sk.type !== 'buff' || !sk.eff) return;
          BUFF_KEYS.forEach(function (k) {
            if (sk.eff[k]) mods[k] = (mods[k] || 0) + sk.eff[k];
          });
        });
        if (sp && (sp.apt || []).indexOf('cai') >= 0) mods.dropPct = (mods.dropPct || 0) + CAI_DROP_PCT;
        if (sp && sp.blood && sp.blood !== 'fan') bloodCount[sp.blood] = (bloodCount[sp.blood] || 0) + 1;
      }
      // 血脉共鸣：3 宠同血脉（非泛血）
      if (st.team.length >= TEAM_CAP) {
        for (const b in bloodCount) {
          if (bloodCount[b] >= TEAM_CAP) {
            mods.atkPct = (mods.atkPct || 0) + RESONANCE_PCT;
            mods.defPct = (mods.defPct || 0) + RESONANCE_PCT;
            break;
          }
        }
      }
      for (const k in mods) mods[k] = Math.round(mods[k] * 100) / 100;
      return mods;
    },

    // 契约一键接口：领取打工待领池
    quickCollect() {
      const r = this.collect();
      return { msg: [r.msg] };
    },

    /* ============================== 内部方法（挂对象便于 init/tick 用 this 调用） ============================== */
    _byUid: byUid,

    /* ============================== 查询 API ============================== */
    consts: {
      TEAM_CAP: TEAM_CAP, MAX_LV: MAX_LV, CONVERT: CONVERT,
      BREED_COST: BREED_COST, BREED_CD_H: BREED_CD_H, AWAKEN_COST: AWAKEN_COST,
      SHINY_P: SHINY_P, BREED_MUT_P: BREED_MUT_P,
    },

    // PetView 组装（UI 渲染唯一视图结构）
    _view(p) {
      const sp = bySp(p.sp) || { name: p.sp, icon: '❓', grade: 1, hidden: false, blood: 'fan', desc: '', apt: [] };
      const blood = bloodOf(sp.blood);
      const tier = tierOf(p.apt);
      const persona = personaOf(p.persona);
      const s = petStats(p);
      const grade = sp.grade || 1;
      const need = p.lv >= MAX_LV ? 0 : expNeed(p.lv, grade);
      const st = P();
      return {
        uid: p.uid, sp: p.sp, spName: sp.name, icon: sp.icon, grade: grade,
        hidden: !!sp.hidden, spDesc: sp.desc || '',
        blood: sp.blood, bloodName: blood.name, bloodIcon: blood.icon,
        name: p.name, shiny: p.shiny || 0, src: p.src || 'hatch',
        bornAt: p.bornAt || 0, breedCd: p.breedCd || 0,
        lv: p.lv, exp: Math.floor(p.exp), expNeed: need, isMaxLv: p.lv >= MAX_LV,
        apt: p.apt, tier: tier.id, tierName: tier.name, aptMult: tier.mult,
        persona: p.persona, personaName: persona.name,
        personaWorkPct: persona.workPct || 0, personaFightPct: persona.fightPct || 0,
        personaDesc: persona.desc || '',
        purity: p.purity, awaken: !!p.awaken, awakenSkillId: blood.skill || null,
        skills: (p.skills || []).map(function (id) {
          const sk = skillOf(id);
          return sk ? { id: sk.id, name: sk.name, icon: sk.icon, type: sk.type, desc: sk.desc, eff: sk.eff }
                    : { id: id, name: id, icon: '❓', type: 'buff', desc: '', eff: {} };
        }),
        stats: { atk: Math.round(s.atk), def: Math.round(s.def), hp: Math.round(s.hp), spd: Math.round(s.spd) },
        power: Math.round(powerOfPet(p)),
        inTeam: st.team.indexOf(p.uid) >= 0,
        job: st.jobs[p.uid] || null,
      };
    },

    list() {
      const self = this;
      return P().list.slice().reverse().map(function (p) { return self._view(p); });
    },
    get(uid) { const p = byUid(uid); return p ? this._view(p) : null; },
    teamList() {
      const self = this;
      return P().team.map(function (uid) { return self._byUid(uid); })
        .filter(Boolean).map(function (p) { return self._view(p); });
    },
    teamCap() { return TEAM_CAP; },
    eggs() { return (XG.state.inv && XG.state.inv.egg) || 0; },
    codexPets() { return ((XG.state.codex || {}).pet || []).slice(); },
    speciesOf(spId) { return bySp(spId); },
    skillInfo(id) { return skillOf(id); },
    personaInfo(id) { return personaMap()[id] || null; },
    bloodInfo(id) { return bloodMap()[id] || null; },
    tierOf: tierOf,
    jobDefs() { return JOBS; },
    jobCap() { return 3 + Math.floor(caveLv('sl') / 2) + pvpTierIdx() + (XG.state.player.realmIdx || 0); }, // 打工位上限（基数3 + 洞府兽栏等级/2 + 段位等级 + 境界等级）
    jobList() {
      const st = P(), self = this, out = [];
      for (const uid in st.jobs) {
        const p = self._byUid(uid);
        if (!p) continue;
        const j = JOBS[st.jobs[uid]];
        if (!j) continue;
        out.push({ uid: uid, pet: self._view(p), job: j.id, jobName: j.name, icon: j.icon });
      }
      return out;
    },
    ratesFor(uid) {
      const p = byUid(uid);
      if (!p) return null;
      return {
        lt: this._rateView(p, 'lt'),
        sl: this._rateView(p, 'sl'),
        explore: this._rateView(p, 'explore'),
      };
    },
    _rateView(p, job) {
      const r = jobRates(p, job);
      return { herbPerH: r.herbPerH, expPerH: Math.round(r.expPerH), lingShiPerH: Math.round(r.lingShiPerH) };
    },
    pending() {
      const g = P().jobGain;
      return { lingShi: g.lingShi, mat: Object.assign({}, g.mat) };
    },
    powerOf(uid) { const p = byUid(uid); return p ? Math.round(powerOfPet(p)) : 0; },
    teamPower() {
      const st = P();
      let sum = 0;
      for (let i = 0; i < st.team.length; i++) {
        const p = this._byUid(st.team[i]);
        if (p) sum += powerOfPet(p);
      }
      return Math.round(sum);
    },
    canEvolve(uid) {
      const p = byUid(uid);
      if (!p) return { ok: false, reason: '灵宠不存在', need: null };
      const sp = bySp(p.sp);
      const evo = sp && sp.evo;
      if (!evo) return { ok: false, reason: '此灵宠已至化境，无可进化', need: null };
      const itemName = evo.item ? matName(evo.item) : null;
      const itemHave = evo.item ? ((XG.state.inv.mat || {})[evo.item] || 0) : 0;
      const need = { lv: evo.lv, curLv: p.lv, item: evo.item || null, itemName: itemName, itemHave: itemHave };
      if (p.lv < evo.lv) return { ok: false, reason: '等级不足（需 ' + evo.lv + ' 级）', need: need };
      if (evo.item && itemHave < 1) return { ok: false, reason: '缺少材料「' + itemName + '」', need: need };
      return { ok: true, reason: '', need: need };
    },
    canAwaken(uid) {
      const p = byUid(uid);
      if (!p) return { ok: false, reason: '灵宠不存在', cost: AWAKEN_COST };
      const sp = bySp(p.sp);
      if (!sp || sp.blood === 'fan') return { ok: false, reason: '凡血之躯，无觉醒之缘', cost: AWAKEN_COST };
      if (p.awaken) return { ok: false, reason: '血脉已然觉醒', cost: AWAKEN_COST };
      if ((p.purity || 0) < AWAKEN_PURITY) return { ok: false, reason: '血脉纯度不足（需 ≥' + AWAKEN_PURITY + '，当前 ' + (p.purity || 0) + '）', cost: AWAKEN_COST };
      if (!XG.hasRes(AWAKEN_COST)) return { ok: false, reason: '材料不足（需灵石 ' + U().fmt(AWAKEN_COST.lingShi) + '、妖兽内丹×5、神兽精血×1）', cost: AWAKEN_COST };
      return { ok: true, reason: '', cost: AWAKEN_COST };
    },
    canBreed(uidA, uidB) {
      const res = { ok: false, reason: '', cost: BREED_COST, cdUntil: 0 };
      if (!XG.cfg.isUnlocked('petBreed')) { res.reason = '需元婴一层方可解锁灵宠繁殖'; return res; }
      const a = byUid(uidA), b = byUid(uidB);
      if (!a || !b) { res.reason = '灵宠不存在'; return res; }
      if (uidA === uidB) { res.reason = '不能与自己繁殖'; return res; }
      if (a.lv < BREED_LV || b.lv < BREED_LV) { res.reason = '双方均需达 ' + BREED_LV + ' 级'; return res; }
      const now = Date.now();
      res.cdUntil = Math.max(a.breedCd || 0, b.breedCd || 0);
      if (now < res.cdUntil) { res.reason = '双亲元气未复（' + U().fmtTime((res.cdUntil - now) / 1000) + ' 后可再行繁衍）'; return res; }
      if (!XG.hasRes({ lingShi: BREED_COST })) { res.reason = '灵石不足（需 ' + U().fmt(BREED_COST) + '）'; return res; }
      res.ok = true;
      return res;
    },
    // 当前境界可孵蛋池（含概率 pct）
    hatchPoolInfo() {
      const realmIdx = (XG.state.player || {}).realmIdx || 0;
      const pool = D().species.filter(function (s) {
        return (s.w || 0) > 0 && realmIdx >= (GRADE_MIN_REALM[s.grade] || 0);
      });
      let total = 0;
      pool.forEach(function (s) { total += s.w; });
      return pool.map(function (s) {
        return { spId: s.id, name: s.name, icon: s.icon, grade: s.grade, w: s.w, pct: total > 0 ? Math.round((s.w / total) * 1000) / 10 : 0 };
      });
    },

    /* ============================== 操作 API ============================== */
    // 孵蛋：耗 1 蛋，按 w 抽物种（高品阶受境界过滤）
    hatch() {
      if (!XG.hasRes({ egg: 1 })) return { ok: false, msg: '囊中没有灵宠蛋：历练地图、奇遇机缘、坊市货摊皆有出落。' };
      const info = this.hatchPoolInfo();
      if (!info.length) return { ok: false, msg: '机缘未到，蛋中毫无动静。' };
      const pool = info.map(function (it) { return { id: it.spId, w: it.w }; });
      const hit = U().weighted(pool, 'w');
      const spId = hit ? hit.id : pool[0].id;
      XG.addRes({ egg: -1 });
      const pet = makePet(spId, 'hatch');
      if (!pet) return { ok: false, msg: '孵化失败，蛋壳归于沉寂。' };
      addStat('pet_hatch');
      onObtain(pet);
      const sp = bySp(spId);
      const tier = tierOf(pet.apt);
      let msg = '灵光乍现，「' + sp.name + '」破壳而出！资质 ' + pet.apt + '（' + tier.name + '）';
      if (pet.shiny) msg += '，霞光绕体，竟是闪光灵宠！';
      return { ok: true, msg: msg, pet: this._view(pet) };
    },

    // 【系统对接】捕捉/事件直给（expedition/adventure 调用；可给 w:0 隐藏物种，如 catchPet('pet_baize')）
    catchPet(spId, src) {
      if (!bySp(spId)) return null;
      const pet = makePet(spId, src || 'catch');
      if (!pet) return null;
      addStat('pet_catch');
      return onObtain(pet);
    },

    rename(uid, name) {
      const p = byUid(uid);
      if (!p) return { ok: false, msg: '灵宠不存在' };
      name = String(name == null ? '' : name).trim().slice(0, 12);
      if (!name) return { ok: false, msg: '名字不可为空' };
      p.name = name;
      emitChanged();
      return { ok: true, msg: '已更名为「' + name + '」' };
    },

    addExp(uid, n) {
      const p = byUid(uid);
      if (!p) return { ok: false, lvUps: 0 };
      const ups = applyExp(p, Math.max(0, n || 0));
      return { ok: true, lvUps: ups };
    },

    // 喂单宠经验丹（耗背包丹药；读 pills.js eff.type=='exp'）
    feedPill(uid, pillId) {
      const p = byUid(uid);
      if (!p) return { ok: false, msg: '灵宠不存在', lvUps: 0 };
      const recipes = (XG.data.pills && XG.data.pills.recipes) || [];
      let r = null;
      for (let i = 0; i < recipes.length; i++) {
        if (recipes[i].id === pillId && recipes[i].eff && recipes[i].eff.type === 'exp') { r = recipes[i]; break; }
      }
      if (!r) return { ok: false, msg: '此丹非灵宠经验丹', lvUps: 0 };
      if (((XG.state.inv.pill || {})[pillId] || 0) < 1) return { ok: false, msg: '囊中没有「' + r.name + '」', lvUps: 0 };
      XG.addRes({ pill: { [pillId]: -1 } });
      const ups = applyExp(p, r.eff.val);
      let msg = p.name + ' 服下「' + r.name + '」，经验 +' + U().fmtInt(r.eff.val);
      if (ups > 0) msg += '，连升 ' + ups + ' 级！';
      emitChanged();
      return { ok: true, msg: msg, lvUps: ups };
    },

    // 【系统对接】alchemy 服兽用经验丹：出战灵宠每只 +n
    addTeamExp(n) {
      const st = P();
      let ups = 0;
      for (let i = 0; i < st.team.length; i++) {
        const p = this._byUid(st.team[i]);
        if (p) ups += applyExp(p, Math.max(0, n || 0));
      }
      if (ups > 0) emitChanged();
      return ups;
    },

    // 进化：达 lv + 耗材料，物种进阶（属性随新 base 暴涨，换名换 icon）
    evolve(uid) {
      const chk = this.canEvolve(uid);
      if (!chk.ok) return { ok: false, msg: chk.reason };
      const p = byUid(uid);
      const from = bySp(p.sp);
      const evo = from.evo;
      if (evo.item) XG.addRes({ mat: { [evo.item]: -1 } });
      p.sp = evo.to;
      const to = bySp(evo.to);
      addStat('pet_evo');
      const isNew = regCodex(evo.to);
      if (to.grade >= 5) {
        addStat('pet_grade5');
        pushNews('player', '【神兽降世】' + p.name + '历劫进化，化作「' + to.name + '」，瑞气冲霄，四方皆闻！', 2);
      } else if (to.grade >= 4) {
        pushNews('system', '灵宠「' + p.name + '」进化为「' + to.name + '」，气息暴涨，已入仙兽之列。', 1);
      }
      invalidate();
      emitChanged();
      return { ok: true, msg: '进化功成！「' + from.name + '」化作「' + to.name + '」，资质血脉尽数承继。', from: from.id, to: to.id, isNewSpecies: isNew };
    },

    // 血脉觉醒：纯度≥60 耗材料，全属性 +50% + 解锁血脉隐藏技
    awaken(uid) {
      const chk = this.canAwaken(uid);
      if (!chk.ok) return { ok: false, msg: chk.reason };
      const p = byUid(uid);
      XG.addRes({ lingShi: -AWAKEN_COST.lingShi, mat: { beast_dan: -5, beast_jingxue: -1 } });
      p.awaken = true;
      const sp = bySp(p.sp);
      const blood = bloodOf(sp.blood);
      if (blood.skill && p.skills.indexOf(blood.skill) < 0) p.skills.push(blood.skill);
      addStat('pet_awaken');
      XG.bus.emit('pet:awaken', { uid: p.uid });
      const skName = blood.skill ? (skillOf(blood.skill) || {}).name : null;
      pushNews(sp.grade >= 5 ? 'player' : 'system',
        '【血脉觉醒】' + p.name + '（' + sp.name + '）体内' + blood.name + '轰然苏醒，全属性暴涨五成' +
        (skName ? '，悟得血脉秘技「' + skName + '」' : '') + '！', sp.grade >= 5 ? 2 : 1);
      invalidate();
      emitChanged();
      return { ok: true, msg: '血脉觉醒成功！全属性 +50%' + (skName ? '，解锁隐藏技「' + skName + '」' : '') + '。' };
    },

    // 繁殖：两只≥lv30 耗灵石，后代随父母一方、资质均值±20、纯度取高±10、2% 异变饕餮
    breed(uidA, uidB) {
      const chk = this.canBreed(uidA, uidB);
      if (!chk.ok) return { ok: false, msg: chk.reason };
      const a = byUid(uidA), b = byUid(uidB);
      XG.addRes({ lingShi: -BREED_COST });
      a.breedCd = b.breedCd = Date.now() + BREED_CD_MS;
      const mutated = U().chance(BREED_MUT_P);
      const childSp = mutated ? 'pet_taotie' : (U().chance(0.5) ? a.sp : b.sp);
      const child = makePet(childSp, 'breed');
      if (!child) return { ok: false, msg: '繁衍失败，灵韵消散。' };
      if (!mutated) { // 异变保持野性 roll；正常后代按继承公式
        child.apt = U().clamp(Math.round((a.apt + b.apt) / 2) + U().randInt(-20, 20), 1, 100);
        const sp = bySp(childSp);
        child.purity = sp.blood === 'fan' ? 0 : U().clamp(Math.max(a.purity || 0, b.purity || 0) + U().randInt(-10, 10), 1, 100);
      }
      addStat('pet_breed');
      onObtain(child);
      XG.bus.emit('pet:breed', { uid: child.uid });
      const csp = bySp(childSp);
      if (mutated) {
        pushNews('player', '【异变】' + a.name + '与' + b.name + '的后代竟生出血盆大口之形——凶兽「饕餮」降世！', 2);
      }
      const tier = tierOf(child.apt);
      let msg = '新生命呱呱坠地：「' + csp.name + '」，资质 ' + child.apt + '（' + tier.name + '）';
      if (mutated) msg += '——竟是异变饕餮！';
      else if (child.shiny) msg += '，霞光绕体，竟是闪光灵宠！';
      return { ok: true, msg: msg, child: this._view(child), mutated: mutated };
    },

    /* ============================== 出战编队 ============================== */
    joinTeam(uid) {
      const st = P();
      const p = byUid(uid);
      if (!p) return { ok: false, msg: '灵宠不存在' };
      if (st.team.indexOf(uid) >= 0) return { ok: false, msg: '已在出战队列之中' };
      if (st.team.length >= TEAM_CAP) return { ok: false, msg: '出战队列已满（' + TEAM_CAP + '）' };
      if (st.jobs[uid]) return { ok: false, msg: '此宠正在' + JOBS[st.jobs[uid]].name + '，需先召回方可出战' };
      st.team.push(uid);
      invalidate();
      emitChanged();
      return { ok: true, msg: p.name + ' 已入出战队列' };
    },
    leaveTeam(uid) {
      const st = P();
      const i = st.team.indexOf(uid);
      if (i < 0) return { ok: false, msg: '不在出战队列中' };
      st.team.splice(i, 1);
      invalidate();
      emitChanged();
      return { ok: true, msg: '已离队休整' };
    },
    setTeam(uids) {
      const st = P();
      const self = this;
      const clean = (uids || []).filter(function (uid, i) {
        return self._byUid(uid) && !st.jobs[uid] && uids.indexOf(uid) === i;
      }).slice(0, TEAM_CAP);
      st.team = clean;
      invalidate();
      emitChanged();
      return { ok: true, msg: '出战队列已更新（' + clean.length + '/' + TEAM_CAP + '）' };
    },

    /* ============================== 打工 ============================== */
    assignJob(uid, jobId) {
      const st = P();
      const p = byUid(uid);
      if (!p) return { ok: false, msg: '灵宠不存在' };
      if (!JOBS[jobId]) return { ok: false, msg: '没有这门差事' };
      if (st.team.indexOf(uid) >= 0) return { ok: false, msg: '出战中的灵宠无暇打工，请先撤下战阵' };
      if (st.jobs[uid] === jobId) return { ok: false, msg: '已在' + JOBS[jobId].name + '中' };
      if (!st.jobs[uid] && Object.keys(st.jobs).length >= this.jobCap()) {
        return { ok: false, msg: '工位已满（' + this.jobCap() + '）' };
      }
      st.jobs[uid] = jobId;
      emitChanged();
      return { ok: true, msg: p.name + ' 已派往' + JOBS[jobId].name };
    },
    unassignJob(uid) {
      const st = P();
      if (!st.jobs[uid]) return { ok: false, msg: '此宠并无差事在身' };
      const name = JOBS[st.jobs[uid]].name;
      delete st.jobs[uid];
      delete _herbAcc[uid];
      emitChanged();
      return { ok: true, msg: '已从' + name + '召回' };
    },
    // 领取待领池（灵石取整，零头留存）
    collect() {
      const st = P();
      const g = st.jobGain;
      const out = { lingShi: Math.floor(g.lingShi), mat: {} };
      for (const id in g.mat) {
        const n = Math.floor(g.mat[id]);
        if (n > 0) out.mat[id] = n;
      }
      if (out.lingShi <= 0 && !Object.keys(out.mat).length) {
        return { ok: false, msg: '灵宠尚在劳作，暂无产出可领取', gain: { lingShi: 0, mat: {} } };
      }
      XG.addRes(out);
      g.lingShi -= out.lingShi;
      for (const id in out.mat) {
        g.mat[id] -= out.mat[id];
        if (g.mat[id] <= 0) delete g.mat[id];
      }
      addStat('pet_job_collect');
      const parts = [];
      if (out.lingShi > 0) parts.push('灵石 +' + U().fmtInt(out.lingShi));
      for (const id in out.mat) parts.push(matName(id) + ' ×' + out.mat[id]);
      emitChanged();
      return { ok: true, msg: '打工收获：' + parts.join('，'), gain: out };
    },
  };

  XG.sysOrder.push('pets');
})();
