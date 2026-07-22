/* reincarn.js：轮回飞升系统（渡劫挑战 → 转世轮回 → 天赋树 → 转世身份）
 * ============================================================================
 * 【玩法链路】
 *   1. 飞升挑战（渡劫）：大乘十层圆满（或渡劫境）可引动天劫，天劫共 9 波，
 *      每波战力需求逐波递增（waveReq = WAVE_BASE × WAVE_GROW^(i-1)），按
 *      「当前战力(含祭丹加成)/需求」折算每波通过率，逐波 roll 点校验；
 *      挑战前可「祭丹」——消耗背包中 atk/def/hp 类战斗丹药，临时堆高本次挑战战力；
 *      失败 → 跌落回大乘 9 层（境界受损，但修为/资源/装备等一概不清空），
 *      且每次失败为本轮回内后续挑战累积 +5%/波 的保底通过率（成功清零）；
 *      九波全过 → 飞升转世。
 *   2. 转世轮回：reincarn+1；保留 codex/ach(含永久 eff)/灵玉×20%(+天赋加成)/
 *      天赋树/轮回点/道友好感×50%；重置 境界/修为/灵石/背包/装备/功法/丹道/
 *      宠物(放生返祖,图鉴保留)/洞府/派遣/秘境/论剑/奇遇；
 *      发放 rp 轮回点 = 本世累计大境界数×2 + 已达成成就数/10（向下取整）。
 *   3. 天赋树（数据内嵌本文件 TALENTS）：15 节点 3 支（修炼系 cultRatePct/offlineHours/顿悟率，
 *      战斗系 atkPct/hpPct/暴击，机缘系 dropPct/坊市折扣/奇遇率），每节点 3 级，耗 rp 逐级递增，
 *      支内链式前置（前一节点满级方可点下一节点）。
 *   4. 转世身份（IDENTITIES，14 种随机表）：每次转世 roll 一个，影响开局——
 *      书香门第→初始功法残篇、猎户之子→atk、商贾之家→灵石、丹童→丹方、
 *      流浪儿/天弃之子→高变异灵根率（天弃之子为隐藏稀有，混沌灵根率极高）……
 *      身份 mods 持续生效至下次转世。
 *
 * 【与契约的差异说明】契约 §5 UNLOCKS.reincarn=渡劫10层 管 tab 可见性；按任务书
 *   「渡劫（大乘 10 层后）」，本系统挑战资格 canChallenge() 以「大乘10层或渡劫境」为准，
 *   isOpen() 自大乘1层起可见（预告），转世过一次后永久可见。UI 请以本系统查询函数为准。
 *
 * ============================================================================
 * 【UI 对接面】（UI 代理唯一接口依据；除 getMods 外均为查询/操作函数）
 *
 *  ▸ XG.sys.reincarn.isOpen()
 *      → bool。轮回 tab 是否可见（大乘1层起可见作预告；转世过则永久可见）。
 *  ▸ XG.sys.reincarn.canChallenge()
 *      → {ok:bool, reason:string}。是否可发起飞升挑战（大乘10层/渡劫境）。
 *  ▸ XG.sys.reincarn.getChallengeInfo()
 *      → { open, canChallenge, reason, power(当前面板战力), fails(本世已失败次数),
 *          pityPct(保底加成百分点), bestWave(历史最佳波数,0~9), waveCount:9,
 *          waves:[{i, name, desc, req, reqFmt, chance(0~1,含保底)}],
 *          maxPills, lingYuKeepPct(转世灵玉保留百分比) }
 *  ▸ XG.sys.reincarn.previewPills()
 *      → [{id, name, icon, count, type:'atk|def|hp', val(每颗战力加成%,变异已×1.5), mut}]，
 *        背包中可用于祭丹的战斗丹药清单。
 *  ▸ XG.sys.reincarn.startChallenge(pillIds)
 *      pillIds: 丹药 id 数组（每个元素=祭 1 颗，可重复；最多 maxPills 颗；可为空数组）。
 *      → 校验失败 {ok:false, msg}
 *      → 挑战失败 {ok:true, success:false, failedAt, waves:[{i,name,desc,req,pow,chance,roll,pass}],
 *                   pillPct, invalid:[被跳过丹药id], pityPct(新的保底百分点), dropTo:{realmIdx,layer}}
 *      → 飞升成功 {ok:true, success:true, waves:[同上9波全pass], pillPct, invalid,
 *                   reincarn:{count, rpGain, realmCount, achCount, keepLingYu, petReleased,
 *                             identity:{id,name,icon,desc}, grants:[开局奖励文案…], root:{type,grade,mut}}}
 *      （UI 可按 waves 逐波播放渡劫动画后再展示结果）
 *  ▸ XG.sys.reincarn.getTalentTree()
 *      → [{id, br:'cult|battle|luck', brName, name, icon, lv, max, costNext(满级为null),
 *          canUp, needOk(前置是否满足), need:[前置id], effNow:{键:值}, effNext:{键:值}|null,
 *          effText, desc}]（15 节点 flat，按 br 分三组，UI 自行分列）
 *  ▸ XG.sys.reincarn.upgradeTalent(id)
 *      → {ok:bool, msg, lv}。消耗 rp 升 1 级（校验前置满级/等级上限/rp 足够）。
 *  ▸ XG.sys.reincarn.getRpInfo()
 *      → {rp(当前可用), rpTotal(累计获得), nextRpGain(此刻转世可得的 rp 预览), reincarn(次数)}
 *  ▸ XG.sys.reincarn.getIdentity()
 *      → null | {id, name, icon, desc, mods, modsText}（本世身份；未转世过为 null）
 *  ▸ XG.sys.reincarn.getIdentityPool()
 *      → [{id, name, icon, desc, modsText, rare}]（身份图鉴式展示；rare=隐藏稀有，
 *        未获得过稀有身份时 UI 可显示 ???）
 *  ▸ XG.sys.reincarn.getKeepInfo()
 *      → {keep:[保留项文案…], reset:[重置项文案…], lingYuKeepPct, rpGain(预览),
 *          realmCount, achCount}
 *  ▸ XG.sys.reincarn.getMods() → flat 加成对象（契约 §7 协议；属性聚合用，UI 一般不直调）
 *
 * 【写入的 stats 键】（XG.state.stats，snake，懒初始化）
 *   reincarn     轮回次数（= player.reincarn，成就 check.k 'reincarn' 用）
 *   trib_try     累计发起飞升挑战次数
 *   trib_fail    累计渡劫失败次数
 *   trib_best    历史最佳波数（0~9，9=渡过）
 *   rp_total     累计获得轮回点
 *
 * 【emit 事件】
 *   reincarn:done {count}         转世完成（契约标准事件；隐藏功法 reincarn_1 等订阅方消费）
 *   news {t,cat,text,imp}         传闻（渡劫失败/飞升转世/灵宠放生，同时落 state.news）
 *   res:changed / save:dirty      资源与存档钩子
 *
 * 【自定义透传 mods 键】（stats.calc 原样透传，其他系统从 XG.stats.get() 读取，缺省 0）
 *   dunwuRatePct   顿悟率加成百分点（cultivation 顿悟模式消费）
 *   critPct        暴击率百分点（战斗/爬塔/论剑消费）
 *   critDmgPct     暴击伤害加成百分点（同上）
 *   marketDiscPct  坊市价格折扣百分点（market 消费）
 *   advRatePct     奇遇触发率加成百分点（adventure 消费）
 *   lingYuKeepPct  转世灵玉额外保留百分点（本系统自用）
 *
 * 【offline 行为】无离线收益（飞升挑战为即时手动玩法，转世不产时间收益），offline(dt) 恒返回 null。
 * 【tick 行为】无逐秒逻辑，空实现（协议占位）。
 * ============================================================================
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.sys = XG.sys || {};
  XG.sysOrder = XG.sysOrder || [];

  /* ===================== 数值常量 ===================== */
  const WAVE_COUNT = 9;          // 天劫波数
  const WAVE_BASE = 8e7;         // 第 1 波需求战力（大乘基值战力约 4.3e7 的 2 倍）
  const WAVE_GROW = 1.5;         // 逐波递增倍率（第 9 波 ≈ 2.05e9）
  const PASS_BASE = 0.55;        // 战力=需求时的基准通过率
  const PASS_SLOPE = 0.9;        // 战力比每超 1，通过率增量
  const PASS_FLOOR = 0.05;       // 每波通过率地板（欧皇一线生机）
  const PASS_CAP = 0.95;         // 不含保底的每波通过率上限（天劫无常）
  const PITY_PER_FAIL = 0.05;    // 每次失败保底 +5%/波
  const PITY_CAP = 0.75;         // 保底加成上限
  const TOTAL_CAP = 0.97;        // 含保底的每波通过率总上限
  const MAX_PILLS = 12;          // 单次挑战最多祭丹数
  const LINGYU_KEEP = 0.2;       // 转世灵玉基础保留比例 20%
  const FAIL_DROP = { realmIdx: 7, layer: 9 }; // 渡劫失败跌落：大乘 9 层

  /* ===================== 天劫 9 波（名称/描述，内嵌数据） ===================== */
  const WAVES = [
    { name: '青木神雷', desc: '乙木之雷，生生不息，磨人道基。' },
    { name: '丙火神雷', desc: '丙火燎原，焚经灼脉，酷烈非常。' },
    { name: '玄水神雷', desc: '玄水蚀骨，无声无息，销魂蚀魄。' },
    { name: '庚金神雷', desc: '庚金肃杀，万钧加身，硬撼者骨断筋折。' },
    { name: '戊土神雷', desc: '戊土镇狱，厚土压顶，几令人窒息道崩。' },
    { name: '阴火焚神', desc: '阴火自涌泉起，直焚神魂，道心稍动即成飞灰。' },
    { name: '赑风散魂', desc: '赑风自囟门入，吹散三魂七魄，肉身如沙而逝。' },
    { name: '心魔问心', desc: '心魔乘虚而入，问心问道，一念之差万劫不复。' },
    { name: '紫霄神雷', desc: '紫霄落处，万法俱灭——渡过，便是仙门。' },
  ];

  /* ===================== 天赋树（15 节点 3 支，内嵌数据） =====================
   * eff 数值数组为「累计生效值」：lv 级时取 eff[k][lv-1]；cost 数组为升至 1/2/3 级各自 rp 消耗。
   * need 为前置节点 id（需满级）。br: cult 修炼系 / battle 战斗系 / luck 机缘系 */
  const BRANCHES = {
    cult:   { name: '修炼系', icon: '🧘' },
    battle: { name: '战斗系', icon: '⚔️' },
    luck:   { name: '机缘系', icon: '🍀' },
  };

  const TALENTS = [
    // —— 修炼系 ——
    { id: 'tx_daoxin', br: 'cult', name: '道心通明', icon: '🧘', max: 3, cost: [1, 2, 3], need: [],
      eff: { cultRatePct: [4, 9, 15] },
      desc: '道心澄澈，万念归一，吐纳之间灵气自生。修为速度 +4%/9%/15%。' },
    { id: 'tx_shenyou', br: 'cult', name: '神游太虚', icon: '🌌', max: 3, cost: [2, 3, 4], need: ['tx_daoxin'],
      eff: { offlineHours: [1, 2, 4] },
      desc: '神魂离体游于太虚，纵不在此间，修行亦不止。离线收益上限 +1/2/4 小时。' },
    { id: 'tx_huigen', br: 'cult', name: '慧根天成', icon: '💡', max: 3, cost: [2, 3, 5], need: ['tx_shenyou'],
      eff: { dunwuRatePct: [10, 20, 35] },
      desc: '天生慧根，时有灵光贯顶。顿悟概率 +10%/20%/35%。' },
    { id: 'tx_du_e', br: 'cult', name: '渡厄道体', icon: '🛡️', max: 3, cost: [3, 4, 6], need: ['tx_huigen'],
      eff: { breakSuccPct: [2, 4, 7] },
      desc: '道体天成，破境之时心魔不侵。突破成功率 +2%/4%/7%。' },
    { id: 'tx_tianren', br: 'cult', name: '天人合一', icon: '☯️', max: 3, cost: [4, 6, 8], need: ['tx_du_e'],
      eff: { cultRatePct: [6, 12, 20], dunwuRatePct: [5, 10, 15] },
      desc: '人身小天地，天地大人身。修为速度 +6%/12%/20%，顿悟概率 +5%/10%/15%。' },
    // —— 战斗系 ——
    { id: 'tz_gengjin', br: 'battle', name: '庚金剑意', icon: '⚔️', max: 3, cost: [1, 2, 3], need: [],
      eff: { atkPct: [5, 10, 16] },
      desc: '剑意淬于庚金，锋芒所指无坚不摧。攻击 +5%/10%/16%。' },
    { id: 'tz_xuanwu', br: 'battle', name: '玄武霸体', icon: '🐢', max: 3, cost: [2, 3, 4], need: ['tz_gengjin'],
      eff: { hpPct: [6, 12, 20] },
      desc: '玄武血脉护体，气血如渊。气血 +6%/12%/20%。' },
    { id: 'tz_shafa', br: 'battle', name: '杀伐果决', icon: '🗡️', max: 3, cost: [2, 3, 5], need: ['tz_xuanwu'],
      eff: { critPct: [3, 6, 10] },
      desc: '出手即是杀招，攻敌必救。暴击率 +3%/6%/10%。' },
    { id: 'tz_pojun', br: 'battle', name: '破军之势', icon: '💥', max: 3, cost: [3, 4, 6], need: ['tz_shafa'],
      eff: { critDmgPct: [15, 30, 50] },
      desc: '破军入命，杀气盈野。暴击伤害 +15%/30%/50%。' },
    { id: 'tz_zhanshen', br: 'battle', name: '战神临世', icon: '👹', max: 3, cost: [4, 6, 8], need: ['tz_pojun'],
      eff: { atkPct: [6, 12, 20], hpPct: [6, 12, 20] },
      desc: '战神临世，万夫莫敌。攻击与气血各 +6%/12%/20%。' },
    // —— 机缘系 ——
    { id: 'ty_jinchan', br: 'luck', name: '金蟾衔财', icon: '🐸', max: 3, cost: [1, 2, 3], need: [],
      eff: { dropPct: [5, 10, 16] },
      desc: '金蟾吐宝，财缘广进。掉落 +5%/10%/16%。' },
    { id: 'ty_shanjia', br: 'luck', name: '善贾之缘', icon: '⚖️', max: 3, cost: [2, 3, 4], need: ['ty_jinchan'],
      eff: { marketDiscPct: [4, 8, 12] },
      desc: '与商道有缘，坊市人人愿结个善缘。坊市价格 -4%/8%/12%。' },
    { id: 'ty_qiyuan', br: 'luck', name: '奇遇天成', icon: '🌈', max: 3, cost: [2, 3, 5], need: ['ty_shanjia'],
      eff: { advRatePct: [10, 20, 35] },
      desc: '福至心灵，机缘自至。奇遇触发率 +10%/20%/35%。' },
    { id: 'ty_fuyuan', br: 'luck', name: '福缘深厚', icon: '🍀', max: 3, cost: [3, 4, 6], need: ['ty_qiyuan'],
      eff: { lingYuKeepPct: [5, 10, 15] },
      desc: '福缘深厚，转世时灵玉多携几分。灵玉保留比例 +5%/10%/15%。' },
    { id: 'ty_tianchong', br: 'luck', name: '天宠之运', icon: '🎲', max: 3, cost: [4, 6, 8], need: ['ty_fuyuan'],
      eff: { dropPct: [6, 12, 20], advRatePct: [10, 20, 30] },
      desc: '天之所宠，运道昌隆。掉落 +6%/12%/20%，奇遇触发率 +10%/20%/30%。' },
  ];

  /* ===================== 转世身份随机表（14 种，内嵌数据） =====================
   * mods：本世常驻加成（经 getMods 输出）；rootBias：灵根重 roll 修正
   *   （'mutHigh' 变异率高 / 'chaos' 变异+混沌率极高）；grant(st)：开局一次性奖励，
   *   返回奖励文案数组。跨系统调用一律防御性（守则 §5）。 */
  const IDENTITIES = [
    { id: 'sf_shuxiang', name: '书香门第', icon: '📜', w: 10, mods: { cultRatePct: 3 },
      desc: '世代簪缨，满门皆是读书人。家中藏书楼三层，最底层压着一卷无人识得的修仙残篇。',
      grant(st, grants) {
        // 初始功法：发《清心诀》残篇×12（fragNeed=4，足够合成并升级）；防御性走 gongfa.addFrag
        if (XG.sys.gongfa && typeof XG.sys.gongfa.addFrag === 'function') {
          try { XG.sys.gongfa.addFrag('gf_qingxin', 12); } catch (e) { XG.addRes({ frag: { gf_qingxin: 12 } }); }
        } else XG.addRes({ frag: { gf_qingxin: 12 } });
        grants.push('家传《清心诀》残篇 ×12');
      } },
    { id: 'sf_liehu', name: '猎户之子', icon: '🏹', w: 10, mods: { atkPct: 6 },
      desc: '生于深山猎户之家，七岁能开硬弓，十五岁独搏山君。骨子里淌着猎手的血。',
      grant(st, grants) { grants.push('猎手血脉：攻击 +6%'); } },
    { id: 'sf_shanggu', name: '商贾之家', icon: '💰', w: 10, mods: { marketDiscPct: 3 },
      desc: '祖上三代行商，南货北贩，算盘打得比剑还快。投胎前爹娘塞了一把压箱底的灵石。',
      grant(st, grants) {
        XG.addRes({ lingShi: 2000 });
        grants.push('压箱底灵石 ×2000');
      } },
    { id: 'sf_dantong', name: '丹童', icon: '🧪', w: 8, mods: { alchSuccPct: 4 },
      desc: '前世是丹房外门的烧火童子，偷师学来半册丹方，今世犹记得炉火温度。',
      grant(st, grants) {
        // 学丹方：alchemy.learnRandomRecipe（防御性，不在则降级发成品丹）
        let learnt = false;
        if (XG.sys.alchemy && typeof XG.sys.alchemy.learnRandomRecipe === 'function') {
          try { learnt = !!XG.sys.alchemy.learnRandomRecipe(2); } catch (e) { learnt = false; }
        }
        if (learnt) grants.push('偷师丹方 ×1（已习得）');
        else { XG.addRes({ pill: { pill_juqi: 3 } }); grants.push('聚气丹 ×3'); }
      } },
    { id: 'sf_liulang', name: '流浪儿', icon: '🍂', w: 8, mods: { dropPct: 4 }, rootBias: 'mutHigh',
      desc: '无父无母，讨饭度日。褴褛之中，一身灵根却在流浪里磨出了异变之机。',
      grant(st, grants) { grants.push('流浪磨砺：灵根高变异率'); } },
    { id: 'sf_tiejiang', name: '铁匠之子', icon: '⚒️', w: 8, mods: { forgeSuccPct: 6 },
      desc: '铁砧边长大，锤声作摇篮曲。爹说打铁的火候，和修仙是一个道理。',
      grant(st, grants) {
        XG.addRes({ mat: { ore_hantie: 5, ore_xuantie: 2 } });
        grants.push('寒铁 ×5、玄铁 ×2');
      } },
    { id: 'sf_yaonong', name: '药农之后', icon: '🌿', w: 8, mods: { alchSuccPct: 3 },
      desc: '祖辈以种药采药为生，识得百草性味。自幼在药田里打滚，草木皆亲。',
      grant(st, grants) {
        XG.addRes({ mat: { herb_chiyang: 5, herb_ningxue: 5 } });
        grants.push('赤阳花 ×5、凝血草 ×5');
      } },
    { id: 'sf_jiangmen', name: '将门之后', icon: '🛡️', w: 8, mods: { defPct: 6, hpPct: 4 },
      desc: '将门虎子，世代戍边。家学不在诗书在兵戈，一身横练筋骨铁打一般。',
      grant(st, grants) { grants.push('将门筋骨：防御 +6%、气血 +4%'); } },
    { id: 'sf_youfang', name: '游方道童', icon: '☯️', w: 8, mods: { advRatePct: 8 },
      desc: '前世随游方老道云游四海，听惯了山精鬼怪的传说，走到哪都有三分奇遇缘。',
      grant(st, grants) { grants.push('云游之缘：奇遇率 +8%'); } },
    { id: 'sf_yujia', name: '渔家儿女', icon: '🎣', w: 10, mods: { cultRatePct: 4, hpPct: 3 },
      desc: '水乡渔家出身，风波里讨生活。水性极好，耐性更好，撒网如吐纳，一收一放皆有节律。',
      grant(st, grants) { grants.push('渔家耐性：修为速度 +4%、气血 +3%'); } },
    { id: 'sf_kuangnu', name: '矿奴出身', icon: '⛏️', w: 8, mods: { workPct: 5 },
      desc: '曾在灵石矿底做了十年矿奴，暗无天日。逃出那日，怀里只揣着几块带血的矿石。',
      grant(st, grants) {
        XG.addRes({ lingShi: 1000, mat: { ore_hantie: 3 } });
        grants.push('带血灵石 ×1000、寒铁 ×3');
      } },
    { id: 'sf_luopo', name: '落魄书生', icon: '📖', w: 8, mods: { dunwuRatePct: 12 },
      desc: '屡试不第，穷得只剩满肚子文章。谁知文章无用，悟道却有声——读书人的顿悟，总是来得突然。',
      grant(st, grants) { grants.push('满腹文章：顿悟率 +12%'); } },
    { id: 'sf_nongjia', name: '农家子弟', icon: '🌾', w: 10, mods: { workPct: 8 },
      desc: '面朝黄土背朝天，一分耕耘一分收获。庄稼人的勤勉，放在修仙路上也一样使。',
      grant(st, grants) { grants.push('庄稼勤勉：打工效率 +8%'); } },
    { id: 'sf_tianqi', name: '天弃之子', icon: '⚡', w: 2, rare: true, mods: { critPct: 3, dropPct: 6 }, rootBias: 'chaos',
      desc: '天厌之，天亦妒之。生而被天道遗弃之人，灵根异变莫测，或出混沌——古往今来，不过一掌之数。',
      grant(st, grants) { grants.push('天弃之命：灵根异变莫测（混沌可期）'); } },
  ];

  // 变异灵根 → 母系五行（spiritRoot.type 必须是五行 id，变异记入 mut）
  const MUT_PARENT = { bing: 'shui', lei: 'jin', feng: 'mu', an: 'tu', guang: 'huo' };
  // 灵根表兜底（data/gongfa.js 未加载时防御用；正常流程走 XG.data.gongfa.roots）
  const FALLBACK_ROOTS = [
    { id: 'jin', w: 20 }, { id: 'mu', w: 20 }, { id: 'shui', w: 20 }, { id: 'huo', w: 20 }, { id: 'tu', w: 20 },
    { id: 'bing', w: 6 }, { id: 'lei', w: 5 }, { id: 'feng', w: 4 }, { id: 'an', w: 3 }, { id: 'guang', w: 2 }, { id: 'hundun', w: 1 },
  ];

  /* ===================== 内部助手 ===================== */

  // stats 懒初始化
  function stats() { return (XG.state.stats = XG.state.stats || {}); }

  // 传闻推送（守则 §7）：emit 'news' + 落 state.news（unshift，NEWS_CAP 截断）
  function pushNews(text, imp, cat) {
    const news = { t: Date.now(), cat: cat || 'player', text: text, imp: imp == null ? 1 : imp };
    const arr = (XG.state.news = XG.state.news || []);
    arr.unshift(news);
    const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
    if (arr.length > cap) arr.length = cap;
    if (XG.bus && typeof XG.bus.emit === 'function') XG.bus.emit('news', news);
  }

  function talentById(id) {
    for (const t of TALENTS) if (t.id === id) return t;
    return null;
  }

  function identityOf(id) {
    if (!id) return null;
    for (const it of IDENTITIES) if (it.id === id) return it;
    return null;
  }

  // 第 i 波（1-based）天劫需求战力
  function waveReq(i) { return WAVE_BASE * Math.pow(WAVE_GROW, i - 1); }

  // 单波通过率：按 战力/需求 折算，加失败保底，多重封顶
  function waveChance(pow, req, fails) {
    const ratio = req > 0 ? pow / req : 1;
    let c = Math.min(PASS_CAP, Math.max(PASS_FLOOR, PASS_BASE + PASS_SLOPE * (ratio - 1)));
    c = Math.min(TOTAL_CAP, c + Math.min(PITY_CAP, (fails || 0) * PITY_PER_FAIL));
    return c;
  }

  // 祭丹：解析丹药 id → 战斗加成（仅接受 atk/def/hp 类；兼容变异后缀 id，效果 ×1.5）
  function pillEffOf(pid) {
    const recipes = (XG.data.pills && XG.data.pills.recipes) || [];
    let mut = false;
    let r = null;
    for (const x of recipes) if (x.id === pid) { r = x; break; }
    if (!r) {
      const base = String(pid).replace(/_(m|mut|mutated)$/, '');
      if (base !== pid) {
        for (const x of recipes) if (x.id === base) { r = x; mut = true; break; }
      }
    }
    if (!r || !r.eff) return null;
    const t = r.eff.type;
    if (t !== 'atk' && t !== 'def' && t !== 'hp') return null;
    return { type: t, val: (r.eff.val || 0) * (mut ? 1.5 : 1), name: r.name, icon: r.icon, mut: mut };
  }

  // 灵根重 roll（转世开局）：rootBias 修正变异/混沌权重；返回 spiritRoot 结构
  function rollRoot(bias) {
    const roots = (XG.data.gongfa && XG.data.gongfa.roots) || FALLBACK_ROOTS;
    const arr = roots.map(function (r) {
      let w = r.w || 1;
      const isMut = !!MUT_PARENT[r.id];
      if (bias === 'mutHigh') { if (isMut) w *= 6; if (r.id === 'hundun') w *= 3; }
      else if (bias === 'chaos') { if (isMut) w *= 6; if (r.id === 'hundun') w *= 30; }
      return { r: r, w: w };
    });
    const picked = (XG.util.weighted(arr, 'w') || arr[0]).r;
    if (picked.id === 'hundun') {
      return { type: XG.util.pick(['jin', 'mu', 'shui', 'huo', 'tu']), grade: XG.util.randInt(3, 5), mut: 'hundun' };
    }
    if (MUT_PARENT[picked.id]) {
      return { type: MUT_PARENT[picked.id], grade: XG.util.randInt(2, 5), mut: picked.id };
    }
    return { type: picked.id, grade: XG.util.randInt(1, 5), mut: null };
  }

  // 已达成成就数（rp 结算用；state.ach={id:{done:1,claimed:1}}）
  function achDoneCount() {
    const ach = XG.state.ach || {};
    let n = 0;
    for (const id in ach) if (ach[id] && ach[id].done) n++;
    return n;
  }

  // rp 预览：本世累计大境界数（realmIdx+1，炼气=1…渡劫=9）×2 + 成就数/10（向下取整）
  function rpPreview() {
    const realmCount = (XG.state.player.realmIdx || 0) + 1;
    const achCount = achDoneCount();
    return { realmCount: realmCount, achCount: achCount, rp: realmCount * 2 + Math.floor(achCount / 10) };
  }

  // 灵玉保留比例（基础 20% + 天赋 lingYuKeepPct）
  function lingYuKeepPct() {
    let pct = LINGYU_KEEP * 100;
    const lv = (XG.state.player.talents || {}).ty_fuyuan | 0;
    const node = talentById('ty_fuyuan');
    if (node && lv > 0) pct += node.eff.lingYuKeepPct[Math.min(node.max, lv) - 1];
    return pct;
  }

  // mods 数值 → 展示文案（UI 用）
  const MOD_LABEL = {
    cultRatePct: '修为速度', offlineHours: '离线时长(h)', dunwuRatePct: '顿悟率',
    breakSuccPct: '突破成功率', atkPct: '攻击', defPct: '防御', hpPct: '气血',
    critPct: '暴击率', critDmgPct: '暴伤', dropPct: '掉落', marketDiscPct: '坊市折扣',
    advRatePct: '奇遇率', workPct: '打工效率', alchSuccPct: '炼丹成功率',
    forgeSuccPct: '炼器成功率', lingYuKeepPct: '灵玉保留',
  };
  function modsText(mods) {
    const parts = [];
    for (const k in mods) {
      const label = MOD_LABEL[k] || k;
      if (k === 'marketDiscPct') parts.push(label + ' -' + mods[k] + '%');
      else if (k === 'offlineHours') parts.push(label + ' +' + mods[k]);
      else parts.push(label + ' +' + mods[k] + '%');
    }
    return parts.join('，');
  }

  /* ===================== 转世主流程（飞升成功后调用） ===================== */
  function doReincarn() {
    const st = XG.state;
    const p = st.player;
    const def = XG.newState(); // 默认子树工厂，保证重置结构与 state.js 一致

    // —— 结算（重置前取数） ——
    const pre = rpPreview();                       // {realmCount, achCount, rp}
    const keepPct = lingYuKeepPct();
    const keepLingYu = Math.floor((st.res.lingYu || 0) * keepPct / 100);
    const petReleased = (st.pets && st.pets.list ? st.pets.list.length : 0);
    const rpGain = pre.rp;

    // —— 轮回计数与轮回点 ——
    p.reincarn = (p.reincarn || 0) + 1;
    p.rp = (p.rp || 0) + rpGain;
    const S = stats();
    S.reincarn = p.reincarn;                       // 成就 check.k 'reincarn' 统计源
    S.rp_total = (S.rp_total || 0) + rpGain;
    S.trib_best = WAVE_COUNT;

    // —— roll 转世身份 + 灵根 ——
    const ident = XG.util.weighted(IDENTITIES, 'w') || IDENTITIES[0];
    const newRoot = rollRoot(ident.rootBias);

    // —— 重置：境界/修为/资源/装备/功法/丹道/宠物/洞府/派遣/秘境/论剑/奇遇 ——
    // player 保留：名字/轮回四件套/新身份/新灵根；其余回默认
    const keepPlayer = {
      name: p.name, reincarn: p.reincarn, talents: p.talents || {}, rp: p.rp,
      identity: ident.id, spiritRoot: newRoot, tribFails: 0,
    };
    st.player = Object.assign(def.player, keepPlayer);
    st.res = { lingShi: 0, lingYu: keepLingYu };   // 灵石清空，灵玉×保留比例
    st.inv = def.inv;                              // 材料/丹药/残篇/蛋 清空
    st.equips = def.equips;                        // 装备重置
    st.gongfa = def.gongfa;                        // 功法重置
    st.alchemy = def.alchemy;                      // 丹道重置
    st.pets = def.pets;                            // 灵宠放生（图鉴 codex.pet 保留）
    st.cave = def.cave;                            // 洞府建筑重置
    st.expedition = def.expedition;
    st.dungeon = def.dungeon;
    st.pvp = def.pvp;
    st.adventure = def.adventure;
    st.daily = def.daily;
    // 保留不碰：codex / ach(含永久 eff) / fellows(见下) / news / stats / settings /
    //          createdAt / totalOnlineSec

    // —— 道友：好感 ×50%，关系降级（宿敌因果不消；道侣缘尽降为挚友） ——
    if (Array.isArray(st.fellows)) {
      for (const f of st.fellows) {
        f.favor = Math.floor((f.favor || 0) * 0.5);
        if (f.relation === 'partner') f.relation = 'friend';
        else if (f.relation === 'rival') { /* 宿敌保留 */ }
        else f.relation = (f.favor >= 60) ? 'friend' : 'stranger';
      }
    }

    // —— 身份开局奖励（跨系统调用全部防御性） ——
    const grants = [];
    try { ident.grant(st, grants); } catch (e) { console.error('[reincarn] 身份奖励发放出错', e); }

    // —— 传闻与事件 ——
    if (petReleased > 0) {
      pushNews('【轮回】' + petReleased + ' 只灵宠放归山林，返祖归源，图鉴长存。', 1, 'player');
    }
    const rootName = (function () {
      const roots = (XG.data.gongfa && XG.data.gongfa.roots) || [];
      const id = newRoot.mut || newRoot.type;
      for (const r of roots) if (r.id === id) return r.name;
      return id;
    })();
    pushNews(
      '【轮回】九重天劫尽数渡过，霞举飞升！转世为「' + ident.name + '」，身负 ' + rootName +
      '，携 ' + rpGain + ' 点轮回造化再入尘寰。',
      2, 'player'
    );

    XG.bus.emit('reincarn:done', { count: p.reincarn });
    XG.stats.invalidate();
    XG.bus.emit('res:changed');
    XG.bus.emit('save:dirty');

    return {
      count: p.reincarn, rpGain: rpGain, realmCount: pre.realmCount, achCount: pre.achCount,
      keepLingYu: keepLingYu, petReleased: petReleased,
      identity: { id: ident.id, name: ident.name, icon: ident.icon, desc: ident.desc },
      grants: grants, root: newRoot,
    };
  }

  /* ===================== 系统模块（契约 §10 协议） ===================== */
  XG.sys.reincarn = {
    id: 'reincarn',

    // 启动自恢复：字段兜底 + 脏数据校验 + stats 同步
    init() {
      const p = XG.state.player;
      p.talents = p.talents || {};
      if (typeof p.rp !== 'number' || isNaN(p.rp)) p.rp = 0;
      if (typeof p.reincarn !== 'number' || isNaN(p.reincarn)) p.reincarn = 0;
      if (typeof p.tribFails !== 'number' || isNaN(p.tribFails)) p.tribFails = 0;
      // 天赋脏数据清理：未知节点剔除、等级 clamp 到 [0,max]
      for (const id in p.talents) {
        const node = talentById(id);
        if (!node) { delete p.talents[id]; continue; }
        const lv = Math.floor(p.talents[id]);
        if (lv <= 0) delete p.talents[id];
        else p.talents[id] = Math.min(node.max, lv);
      }
      // 身份失效容错（表更新后旧档身份被移除的情况）
      if (p.identity && !identityOf(p.identity)) p.identity = null;
      // stats 同步（以 player.reincarn 为准）
      const S = stats();
      S.reincarn = p.reincarn;
      XG.stats.invalidate();
    },

    // 无逐秒逻辑（飞升挑战为即时手动玩法）
    tick(dt) {},

    // 无离线收益：挑战需手动发起，转世不产生时间收益
    offline(dt) { return null; },

    // 属性聚合：天赋树 + 本世身份
    getMods() {
      const out = {};
      const p = XG.state.player;
      const t = p.talents || {};
      for (const node of TALENTS) {
        const lv = Math.min(node.max, t[node.id] | 0);
        if (lv <= 0) continue;
        for (const k in node.eff) out[k] = (out[k] || 0) + node.eff[k][lv - 1];
      }
      const ident = identityOf(p.identity);
      if (ident && ident.mods) {
        for (const k in ident.mods) out[k] = (out[k] || 0) + ident.mods[k];
      }
      return out;
    },

    /* ---------- 查询：可见性与挑战 ---------- */

    // tab 可见性：转世过永久可见；否则大乘1层起可见（天劫预告）
    isOpen() {
      const p = XG.state.player;
      if ((p.reincarn || 0) > 0) return true;
      return p.realmIdx >= 7;
    },

    // 飞升挑战资格：大乘10层圆满，或已入渡劫境
    canChallenge() {
      const p = XG.state.player;
      if (p.realmIdx > 7 || (p.realmIdx === 7 && p.layer >= 10)) return { ok: true, reason: '' };
      return { ok: false, reason: '需臻至大乘十层圆满，方可引动九重天劫。' };
    },

    // 挑战信息总览（UI 渲染渡劫面板）
    getChallengeInfo() {
      const p = XG.state.player;
      const gate = this.canChallenge();
      const fails = p.tribFails || 0;
      const power = XG.stats.get().power;
      const waves = [];
      for (let i = 1; i <= WAVE_COUNT; i++) {
        const req = waveReq(i);
        waves.push({
          i: i, name: WAVES[i - 1].name, desc: WAVES[i - 1].desc,
          req: req, reqFmt: XG.util.fmt(req),
          chance: gate.ok ? waveChance(power, req, fails) : 0,
        });
      }
      return {
        open: this.isOpen(), canChallenge: gate.ok, reason: gate.reason,
        power: power, fails: fails, pityPct: Math.min(PITY_CAP, fails * PITY_PER_FAIL) * 100,
        bestWave: stats().trib_best || 0, waveCount: WAVE_COUNT, waves: waves,
        maxPills: MAX_PILLS, lingYuKeepPct: lingYuKeepPct(),
      };
    },

    // 背包中可祭丹的战斗丹药清单
    previewPills() {
      const bag = XG.state.inv.pill || {};
      const out = [];
      for (const pid in bag) {
        if ((bag[pid] || 0) <= 0) continue;
        const eff = pillEffOf(pid);
        if (!eff) continue;
        out.push({ id: pid, name: eff.name, icon: eff.icon, count: bag[pid], type: eff.type, val: eff.val, mut: eff.mut });
      }
      out.sort(function (a, b) { return b.val - a.val; });
      return out;
    },

    /* ---------- 操作：发起飞升挑战（一次结算 9 波） ---------- */
    startChallenge(pillIds) {
      const gate = this.canChallenge();
      if (!gate.ok) return { ok: false, msg: gate.reason };

      const S = stats();
      S.trib_try = (S.trib_try || 0) + 1;

      // 祭丹聚合：逐颗校验持有量与类型，非法/超量/超出上限的一律记入 invalid 并跳过
      pillIds = Array.isArray(pillIds) ? pillIds : [];
      const used = {}, invalid = [];
      let pillPct = 0, accepted = 0;
      for (const pid of pillIds) {
        if (accepted >= MAX_PILLS) { invalid.push(pid); continue; } // 单次最多祭 MAX_PILLS 颗
        const eff = pillEffOf(pid);
        if (!eff) { invalid.push(pid); continue; }
        if ((used[pid] || 0) + 1 > (XG.state.inv.pill[pid] || 0)) { invalid.push(pid); continue; }
        used[pid] = (used[pid] || 0) + 1;
        pillPct += eff.val;
        accepted++;
      }
      if (Object.keys(used).length) {
        const delta = { pill: {} };
        for (const pid in used) delta.pill[pid] = -used[pid];
        XG.addRes(delta); // 祭丹祭天，成败不退
      }

      const p = XG.state.player;
      const fails = p.tribFails || 0;
      const power = XG.stats.get().power * (1 + pillPct / 100);

      // 逐波校验
      const log = [];
      let passAll = true, failedAt = 0;
      for (let i = 1; i <= WAVE_COUNT; i++) {
        const req = waveReq(i);
        const chance = waveChance(power, req, fails);
        const roll = Math.random();
        const pass = roll < chance;
        log.push({ i: i, name: WAVES[i - 1].name, desc: WAVES[i - 1].desc, req: req, pow: power, chance: chance, roll: roll, pass: pass });
        if (!pass) { passAll = false; failedAt = i; break; }
      }

      if (passAll) {
        const rep = doReincarn();
        return { ok: true, success: true, waves: log, pillPct: pillPct, invalid: invalid, reincarn: rep };
      }

      // —— 渡劫失败：跌落大乘 9 层，修为/资源一概不清空；保底 +5% ——
      p.realmIdx = FAIL_DROP.realmIdx;
      p.layer = FAIL_DROP.layer;
      p.tribFails = fails + 1;
      S.trib_fail = (S.trib_fail || 0) + 1;
      S.trib_best = Math.max(S.trib_best || 0, failedAt - 1);

      // 彩蛋文案：连败触发天劫围观梗（隐藏内容）
      let text = '【天劫】道友于天劫第 ' + failedAt + ' 波「' + WAVES[failedAt - 1].name +
        '」之下道基受损，跌落回大乘九层。幸而修为未散，来日可再渡。（保底 +' +
        Math.round(Math.min(PITY_CAP, p.tribFails * PITY_PER_FAIL) * 100) + '%）';
      if (p.tribFails === 3) text = '【天劫】三渡天劫而不果，坊间已有好事者开盘设赌：这一回，过还是不过？';
      else if (p.tribFails === 5) text = '【天劫】五渡五败。守劫天将见了道友，拱手道：又是你？';
      else if (p.tribFails === 7) text = '【天劫】七渡七败，天劫雷云见道友便自发聚拢——雷部已将其引为编外熟人。';
      pushNews(text, 2, 'player');

      XG.stats.invalidate();
      XG.bus.emit('res:changed');
      XG.bus.emit('save:dirty');
      return {
        ok: true, success: false, failedAt: failedAt, waves: log, pillPct: pillPct, invalid: invalid,
        pityPct: Math.min(PITY_CAP, p.tribFails * PITY_PER_FAIL) * 100,
        dropTo: { realmIdx: FAIL_DROP.realmIdx, layer: FAIL_DROP.layer },
      };
    },

    /* ---------- 天赋树 ---------- */

    // 天赋树总览（15 节点 flat；effNow/effNext 为累计生效值）
    getTalentTree() {
      const p = XG.state.player;
      const t = p.talents || {};
      return TALENTS.map(function (node) {
        const lv = Math.min(node.max, t[node.id] | 0);
        const needOk = node.need.every(function (nid) {
          const nn = talentById(nid);
          return nn && Math.min(nn.max, t[nid] | 0) >= nn.max;
        });
        const costNext = lv < node.max ? node.cost[lv] : null;
        const effNow = {}, effNext = {};
        for (const k in node.eff) {
          if (lv > 0) effNow[k] = node.eff[k][lv - 1];
          if (lv < node.max) effNext[k] = node.eff[k][lv];
        }
        return {
          id: node.id, br: node.br, brName: BRANCHES[node.br].name, name: node.name, icon: node.icon,
          lv: lv, max: node.max, costNext: costNext,
          canUp: needOk && lv < node.max && (p.rp || 0) >= costNext,
          needOk: needOk, need: node.need,
          effNow: effNow, effNext: lv < node.max ? effNext : null,
          effText: modsText(effNow), desc: node.desc,
        };
      });
    },

    // 升级天赋（耗 rp，逐级递增；前置需满级）
    upgradeTalent(id) {
      const p = XG.state.player;
      const node = talentById(id);
      if (!node) return { ok: false, msg: '无此天赋。', lv: 0 };
      p.talents = p.talents || {};
      const lv = Math.min(node.max, p.talents[id] | 0);
      if (lv >= node.max) return { ok: false, msg: '此天赋已臻圆满。', lv: lv };
      const needOk = node.need.every(function (nid) {
        const nn = talentById(nid);
        return nn && Math.min(nn.max, p.talents[nid] | 0) >= nn.max;
      });
      if (!needOk) return { ok: false, msg: '前置天赋尚未圆满，不可点悟。', lv: lv };
      const cost = node.cost[lv];
      if ((p.rp || 0) < cost) return { ok: false, msg: '轮回点不足（需 ' + cost + ' 点）。', lv: lv };
      p.rp -= cost;
      p.talents[id] = lv + 1;
      XG.stats.invalidate();
      XG.bus.emit('save:dirty');
      return { ok: true, msg: node.name + ' 提升至 ' + (lv + 1) + ' 级。', lv: lv + 1 };
    },

    /* ---------- 轮回点 / 身份 / 保留清单 ---------- */

    getRpInfo() {
      const p = XG.state.player;
      const pre = rpPreview();
      return {
        rp: p.rp || 0, rpTotal: stats().rp_total || 0,
        nextRpGain: pre.rp, reincarn: p.reincarn || 0,
      };
    },

    getIdentity() {
      const ident = identityOf(XG.state.player.identity);
      if (!ident) return null;
      return {
        id: ident.id, name: ident.name, icon: ident.icon, desc: ident.desc,
        mods: ident.mods || {}, modsText: modsText(ident.mods || {}),
      };
    },

    // 身份全表（图鉴式展示；rare=隐藏稀有，UI 未获得时可显示 ???）
    getIdentityPool() {
      return IDENTITIES.map(function (it) {
        return {
          id: it.id, name: it.name, icon: it.icon, desc: it.desc,
          modsText: modsText(it.mods || {}), rare: !!it.rare,
        };
      });
    },

    // 转世保留/重置清单预览（UI 确认弹窗用）
    getKeepInfo() {
      const pre = rpPreview();
      return {
        keep: [
          '图鉴（codex）全部保留',
          '成就（含永久属性）全部保留',
          '灵玉 ×' + Math.round(lingYuKeepPct()) + '%',
          '天赋树与轮回点全部保留',
          '道友好感 ×50%（宿敌因果不消）',
          '灵宠图鉴保留（灵宠放归山林，返祖归源）',
        ],
        reset: [
          '境界 / 修为 / 突破保底',
          '灵石与背包（材料 / 丹药 / 残篇 / 灵宠蛋）',
          '装备 / 功法 / 丹道',
          '洞府建筑 / 历练派遣 / 秘境进度 / 论剑积分',
          '奇遇记录 / 灵根（转世重铸）',
        ],
        lingYuKeepPct: lingYuKeepPct(),
        rpGain: pre.rp, realmCount: pre.realmCount, achCount: pre.achCount,
      };
    },
  };

  XG.sysOrder.push('reincarn');
})();
