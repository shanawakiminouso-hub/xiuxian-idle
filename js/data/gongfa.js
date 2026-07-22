/* data/gongfa.js —— 功法总表：功法/羁绊/自创词库/灵根/经脉穴位（契约 §9.2，纯数据登记，不含任何逻辑） */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.data = XG.data || {};

  XG.data.gongfa = {

    /* ============ 功法 list ============
     * eff 为「每级成长」，键名严格取契约 §7 的 mods 键，每功法任选 2~3 项。
     * 普通功法以 unlock:{realmIdx,layer} 解锁；隐藏功法（hidden:true，grade≥8）以 cond 条件 id 解锁，
     * cond 五选一：alchemy_explode_10 / tower_33 / fellow_ouhuang_gift / reincarn_1 / codex_pet_20（由 gongfa 系统监听判定）。
     * 另有 2 部连锁奖励隐藏功法 gf_xuanyuan / gf_guixu（grade 9，hidden:true 但走 unlock 大乘1层解锁，
     * 残篇仅出自 events_b 对应隐藏连锁终点，不占上述 5 个 cond 名额）。
     * 品阶与解锁梯度：g1~g3 炼气筑基 → g4~g5 金丹 → g6 元婴 → g7 化神 → g8 合体 → g9 大乘，残篇数随品阶递增。 */
    list: [
      // —— 一品 · 炼气入门 ——
      { id: 'gf_qingxin', name: '清心诀', icon: '清', grade: 1, hidden: false, root: 'wuxing',
        desc: '吐故纳新，澄心静气。山野散修人手一册的入门心法，虽粗浅，却最稳妥。',
        eff: { cultRatePct: 1, hpPct: 0.5 }, profMax: 1000, fragNeed: 4,
        unlock: { realmIdx: 0, layer: 1 }, getHint: '坊市地摊常见，新手历练亦可拾得残篇。' },
      { id: 'gf_changchun', name: '长春功', icon: '春', grade: 1, hidden: false, root: 'mu',
        desc: '取草木向荣之意，行气绵绵不绝。习之者气血绵长，最宜打熬根基。',
        eff: { cultRatePct: 0.8, hpFlat: 30 }, profMax: 1000, fragNeed: 4,
        unlock: { realmIdx: 0, layer: 1 }, getHint: '云梦泽畔的采药人，常以残篇换些灵石。' },
      { id: 'gf_liehuo', name: '烈火功', icon: '焰', grade: 1, hidden: false, root: 'huo',
        desc: '引胸中一点真火焚遍百骸，攻势如火，可惜后劲略显浮躁。',
        eff: { atkPct: 1, cultRatePct: 0.5 }, profMax: 1000, fragNeed: 4,
        unlock: { realmIdx: 0, layer: 2 }, getHint: '低阶历练之地多有流出，残篇易得。' },

      // —— 二品 · 炼气精进 ——
      { id: 'gf_houtu', name: '厚土诀', icon: '岳', grade: 2, hidden: false, root: 'tu',
        desc: '法天象地，以身为岳。行气沉稳如山，纵风雷撼之而不动。',
        eff: { defPct: 1.2, hpPct: 0.8 }, profMax: 1000, fragNeed: 6,
        unlock: { realmIdx: 0, layer: 4 }, getHint: '坊市偶有成册，历练残篇亦可拼凑。' },
      { id: 'gf_shuilan', name: '水澜诀', icon: '澜', grade: 2, hidden: false, root: 'shui',
        desc: '水性至柔，波澜暗生。行功之势如流水绕石，绵绵不绝。',
        eff: { cultRatePct: 1.2, defPct: 0.6 }, profMax: 1000, fragNeed: 6,
        unlock: { realmIdx: 0, layer: 4 }, getHint: '江河湖泽之畔历练，时有残篇出水。' },
      { id: 'gf_jinfeng', name: '金锋诀', icon: '锋', grade: 2, hidden: false, root: 'jin',
        desc: '淬一口庚金之气于指端，锋锐无匹。金行弟子多由此诀开锋。',
        eff: { atkPct: 1.2, atkFlat: 6 }, profMax: 1000, fragNeed: 6,
        unlock: { realmIdx: 0, layer: 5 }, getHint: '剑庐外门弟子流落之物，坊市可购。' },

      // —— 三品 · 炼气圆满 ——
      { id: 'gf_qingmu', name: '青木长生功', icon: '木', grade: 3, hidden: false, root: 'mu',
        desc: '青帝遗篇，以木气滋养百脉。寿元与修为同增，田圃之间亦得其利。',
        eff: { cultRatePct: 1.6, hpPct: 1, workPct: 1.5 }, profMax: 1000, fragNeed: 9,
        unlock: { realmIdx: 0, layer: 8 }, getHint: '灵田深处偶得残篇，丹修手中亦有抄本。' },
      { id: 'gf_xuanbing', name: '玄冰真解', icon: '冰', grade: 3, hidden: false, root: 'shui',
        desc: '寒潭淬骨，玄冰封脉。守时坚不可摧，攻时霜刃袭人。',
        eff: { defPct: 1.8, atkPct: 1, hpPct: 1 }, profMax: 1000, fragNeed: 9,
        unlock: { realmIdx: 0, layer: 9 }, getHint: '极北寒潭之底，封着半卷真解。' },
      { id: 'gf_leiyin', name: '雷引诀', icon: '雷', grade: 3, hidden: false, root: 'jin',
        desc: '以身作引，摄九天之雷入体。行功时隐隐有雷音相随。',
        eff: { atkPct: 2, cultRatePct: 0.8 }, profMax: 1000, fragNeed: 9,
        unlock: { realmIdx: 1, layer: 1 }, getHint: '雷雨夜历练高山之巅，或可遇雷纹石壁。' },

      // —— 四品 · 筑基佳品 ——
      { id: 'gf_wanjian', name: '万剑朝元诀', icon: '剑', grade: 4, hidden: false, root: 'jin',
        desc: '剑修圣典，万剑朝宗。剑气所至，妖邪授首，遗宝亦多。',
        eff: { atkPct: 2.5, dropPct: 1.5 }, profMax: 1000, fragNeed: 12,
        unlock: { realmIdx: 1, layer: 3 }, getHint: '剑冢深处残篇散落，需以剑意引之。' },
      { id: 'gf_huanyuan', name: '浣元妙典', icon: '浣', grade: 4, hidden: false, root: 'wuxing',
        desc: '浣洗元气，澄澈道基。于丹道亦有所悟，相传出自浣花谷。',
        eff: { cultRatePct: 2.2, alchSuccPct: 1.5 }, profMax: 1000, fragNeed: 12,
        unlock: { realmIdx: 1, layer: 5 }, getHint: '浣花谷旧址历练，溪底偶见蜡封残卷。' },
      { id: 'gf_bihai', name: '碧海潮生功', icon: '潮', grade: 4, hidden: false, root: 'shui',
        desc: '潮起潮落，气机连绵。内力如海，绵密悠长。',
        eff: { hpPct: 2, defPct: 1.5, cultRatePct: 1 }, profMax: 1000, fragNeed: 12,
        unlock: { realmIdx: 1, layer: 7 }, getHint: '东海之滨听潮十年者，或能悟得一二。' },

      // —— 五品 · 金丹典藏 ——
      { id: 'gf_taiqing', name: '太清玄元经', icon: '太', grade: 5, hidden: false, root: 'wuxing',
        desc: '太清一脉正统道经，玄之又玄。持此经破境，道心稳固三分。',
        eff: { cultRatePct: 2.8, breakSuccPct: 0.5 }, profMax: 1000, fragNeed: 16,
        unlock: { realmIdx: 2, layer: 1 }, getHint: '太清观藏经阁遗散之书，坊市中一页千金。' },
      { id: 'gf_fenyan', name: '焚炎九转功', icon: '焚', grade: 5, hidden: false, root: 'huo',
        desc: '九转焚炎，一转一重天。功成之日，赤焰可焚山煮海。',
        eff: { atkPct: 3, atkFlat: 20 }, profMax: 1000, fragNeed: 16,
        unlock: { realmIdx: 2, layer: 3 }, getHint: '火焰山秘境深处，岩浆之下埋着赤玉残简。' },
      { id: 'gf_cangling', name: '藏灵纳海诀', icon: '藏', grade: 5, hidden: false, root: 'wuxing',
        desc: '纳百川之灵，藏须弥于芥子。纵神游物外，灵机亦涓滴归身。',
        eff: { cultRatePct: 2, offlineHours: 0.25, hpPct: 1.5 }, profMax: 1000, fragNeed: 16,
        unlock: { realmIdx: 2, layer: 5 }, getHint: '归墟旧闻中提及此诀，隐世散修或藏抄本。' },

      // —— 六品 · 元婴真传 ——
      { id: 'gf_longxiang', name: '龙象镇岳功', icon: '象', grade: 6, hidden: false, root: 'tu',
        desc: '上古炼体神功，一龙一象之力镇于周身，气血如龙象交鸣。',
        eff: { defPct: 3.2, hpPct: 2.5, hpFlat: 120 }, profMax: 1000, fragNeed: 20,
        unlock: { realmIdx: 3, layer: 1 }, getHint: '大漠古刹的壁画之后，藏着完整的功法石刻。' },
      { id: 'gf_zixiao', name: '紫霄神雷策', icon: '霄', grade: 6, hidden: false, root: 'jin',
        desc: '紫霄宫遗策，御雷如臂使指。雷光过处，群魔辟易。',
        eff: { atkPct: 3.5, cultRatePct: 1.5 }, profMax: 1000, fragNeed: 20,
        unlock: { realmIdx: 3, layer: 5 }, getHint: '雷泽秘境九死一生，策文刻于避雷古木之上。' },

      // —— 七品 · 化神秘典 ——
      { id: 'gf_yimu', name: '乙木造化书', icon: '乙', grade: 7, hidden: false, root: 'mu',
        desc: '乙木通灵，造化生焉。于丹道、灵植之道皆有鬼神莫测之妙。',
        eff: { alchSuccPct: 2.5, cultRatePct: 2.5, hpPct: 2 }, profMax: 1000, fragNeed: 25,
        unlock: { realmIdx: 4, layer: 1 }, getHint: '万年灵木心液浸过的书页，唯丹道大家识得。' },
      { id: 'gf_taixuan', name: '太玄洞真录', icon: '玄', grade: 7, hidden: false, root: 'wuxing',
        desc: '洞观太玄，照见本真。习之可窥破境之机，大道可期。',
        eff: { cultRatePct: 3.5, breakSuccPct: 0.8, dropPct: 2 }, profMax: 1000, fragNeed: 25,
        unlock: { realmIdx: 4, layer: 3 }, getHint: '太玄山崩裂后露出的洞府石匣，有缘者得之。' },

      // —— 八品 · 合体奇经（含 3 种隐藏） ——
      { id: 'gf_honglian', name: '红莲业火经', icon: '莲', grade: 8, hidden: false, root: 'huo',
        desc: '红莲业火，焚尽因果。以业火淬体，攻势滔天，然非大定力者不可持。',
        eff: { atkPct: 4.5, atkFlat: 80, hpPct: 2 }, profMax: 1000, fragNeed: 32,
        unlock: { realmIdx: 6, layer: 1 }, getHint: '幽冥血海之畔，红莲开处自有传承现世。' },
      { id: 'gf_danjie', name: '丹劫焚心诀', icon: '丹', grade: 8, hidden: true, root: 'huo',
        desc: '丹炉十毁，劫火焚心。于灰烬余温中窥得火之真意，丹武两绝。',
        eff: { alchSuccPct: 4, atkPct: 3, cultRatePct: 2.5 }, profMax: 1000, fragNeed: 32,
        cond: 'alchemy_explode_10', getHint: '丹道多舛——炸炉十次之后，灰烬中或有玄机。' },
      { id: 'gf_qingtian', name: '擎天镇狱功', icon: '柱', grade: 8, hidden: true, root: 'tu',
        desc: '古塔三十三层之下，镇压着擎天巨擘的一缕残念。承其志者，身化天柱。',
        eff: { defPct: 5, hpPct: 4, hpFlat: 300 }, profMax: 1000, fragNeed: 32,
        cond: 'tower_33', getHint: '镇妖塔三十三层，塔心深处藏着不为人知的传承。' },
      { id: 'gf_wanling', name: '万灵朝宗诀', icon: '灵', grade: 8, hidden: true, root: 'mu',
        desc: '万灵来朝，百兽归心。通晓万灵之语者，行功时百鸟衔芝、灵泉自涌。',
        eff: { cultRatePct: 4, workPct: 4, hpPct: 3 }, profMax: 1000, fragNeed: 32,
        cond: 'codex_pet_20', getHint: '灵宠图鉴集至二十种，万灵感念其诚，自有机缘。' },

      // —— 九品 · 大乘道典（含 4 种隐藏：2 种 cond + 2 种连锁奖励） ——
      { id: 'gf_hongmeng', name: '鸿蒙开辟经', icon: '鸿', grade: 9, hidden: false, root: 'wuxing',
        desc: '鸿蒙未判，混沌初开。此经相传为开天辟地之时遗落的第一缕道音。',
        eff: { cultRatePct: 6, breakSuccPct: 1.2, atkPct: 4 }, profMax: 1000, fragNeed: 40,
        unlock: { realmIdx: 7, layer: 1 }, getHint: '大乘之后，于绝域深处参悟太古石壁遗刻。' },
      { id: 'gf_xuanyuan', name: '轩辕剑经', icon: '辕', grade: 9, hidden: true, root: 'jin',
        desc: '一面刻日月星辰，一面刻山川草木。轩辕古剑所蕴剑意化经，万剑见之俯首。',
        eff: { atkPct: 6, atkFlat: 200, breakSuccPct: 1 }, profMax: 1000, fragNeed: 40,
        unlock: { realmIdx: 7, layer: 1 }, getHint: '隐藏连锁「轩辕剑冢」（夜梦剑冢→剑冢现世→万剑朝宗→轩辕一剑）终点可得残篇。' },
      { id: 'gf_guixu', name: '归墟万法经', icon: '墟', grade: 9, hidden: true, root: 'wuxing',
        desc: '万水归墟，万法归一。墟眼之畔麻衣老人垂纶万载，只赠有缘人一页真经。',
        eff: { cultRatePct: 6, breakSuccPct: 1.5, defPct: 4 }, profMax: 1000, fragNeed: 40,
        unlock: { realmIdx: 7, layer: 1 }, getHint: '隐藏连锁「归墟」（归墟龟甲→海眼吞星→墟中老人→归墟之眼）终点可得残篇。' },
      { id: 'gf_hongyun', name: '鸿运通宝录', icon: '运', grade: 9, hidden: true, root: 'wuxing',
        desc: '气运所钟，天公作美。持此录者出门逢宝，锻造亦如有神助。',
        eff: { dropPct: 6, cultRatePct: 4, forgeSuccPct: 3 }, profMax: 1000, fragNeed: 40,
        cond: 'fellow_ouhuang_gift', getHint: '那位气运逆天的道友，兴许愿意割爱一卷天书。' },
      { id: 'gf_wangsheng', name: '往生涅槃经', icon: '槃', grade: 9, hidden: true, root: 'wuxing',
        desc: '向死而生，涅槃得道。历一世轮回者方知其味——死生之间，有大逍遥。',
        eff: { cultRatePct: 7, breakSuccPct: 1.5, hpPct: 5 }, profMax: 1000, fragNeed: 40,
        cond: 'reincarn_1', getHint: '历一次轮回之后，前世记忆碎片中将浮现此经。' },
    ],

    /* ============ 功法羁绊 bonds ============
     * 集齐 need 中全部功法即激活额外加成（eff 键名同契约 §7）。 */
    bonds: [
      { id: 'bond_wuxingyi', name: '五行归一',
        need: ['gf_changchun', 'gf_liehuo', 'gf_houtu', 'gf_shuilan', 'gf_jinfeng'],
        eff: { cultRatePct: 15, hpPct: 10 },
        desc: '五行轮转，生生不息。五诀同修，气机自成周天。' },
      { id: 'bond_leihuo', name: '雷火燎原',
        need: ['gf_leiyin', 'gf_fenyan'],
        eff: { atkPct: 20 },
        desc: '雷借火势，火助雷威。雷火相济，其势不可挡。' },
      { id: 'bond_canglang', name: '沧浪濯缨',
        need: ['gf_xuanbing', 'gf_bihai'],
        eff: { defPct: 18, hpPct: 12 },
        desc: '以冰为骨，以海为怀。守如寒潭，深不见底。' },
      { id: 'bond_jianlei', name: '剑雷双绝',
        need: ['gf_wanjian', 'gf_zixiao'],
        eff: { atkPct: 25, dropPct: 8 },
        desc: '剑引紫霄之雷，雷铸不世之锋。剑雷同出，鬼神皆惊。' },
      { id: 'bond_danmu', name: '丹木同源',
        need: ['gf_qingmu', 'gf_yimu'],
        eff: { alchSuccPct: 12, workPct: 15 },
        desc: '木气养丹，丹成润木。青木乙木同源相生，丹道大利。' },
      { id: 'bond_taitai', name: '太清太玄',
        need: ['gf_taiqing', 'gf_taixuan'],
        eff: { cultRatePct: 25, breakSuccPct: 3 },
        desc: '太清演太玄，玄玄相因。道经同参，破境如有神扶。' },
      { id: 'bond_kaitian', name: '开天遗音',
        need: ['gf_honglian', 'gf_hongmeng'],
        eff: { atkPct: 30, hpPct: 30, cultRatePct: 20 },
        desc: '业火焚尽旧世，鸿蒙开辟新天。两大奇经共鸣，气冲牛斗。' },
      { id: 'bond_xiangsi', name: '向死而生',
        need: ['gf_danjie', 'gf_wangsheng'],
        eff: { breakSuccPct: 5, cultRatePct: 30 },
        desc: '历丹劫而不灭，经轮回而更生。置之死地而后生，大道豁然。' },
    ],

    /* ============ 自创功法词库 createPool ============
     * 规则（由 gongfa 系统实现）：化神 1 层解锁（XG.cfg.UNLOCKS.gongfaCreate）；
     * 消耗功法残篇 roll 词条——prefix / core / suffix 各取一词，按「前缀+核心+后缀」拼合功法名，
     * 再按消耗残篇的品阶与数量 roll 成品 grade 与 eff 词条。 */
    createPool: {
      prefix: ['太清', '玉清', '上清', '太玄', '紫霄', '九霄', '玄冥', '赤霄', '碧落', '青冥', '白虹', '苍梧', '烛龙', '鸿蒙', '混元', '无极', '太乙', '玄黄'],
      core: ['玄元', '神雷', '灵汐', '星斗', '山河', '云霞', '风雷', '水火', '阴阳', '五行', '乾坤', '造化', '生死', '轮回', '天龙', '元磁', '空明', '沧海'],
      suffix: ['真经', '宝箓', '秘典', '玄功', '心法', '剑经', '丹书', '灵篇', '道藏', '古卷', '天书', '神章', '妙诀', '遗篇', '禁典', '仙录'],
    },

    /* ============ 灵根 roots ============
     * 五行常见（w 高 mult 低）；变异（冰/雷/风/暗/光）稀有；混沌为隐藏灵根（权重极低）。
     * mult=修炼速率加成倍率，稀有度越高 mult 越大、w 越小。洗练规则由 cultivation 系统实现。 */
    roots: [
      { id: 'jin', name: '金灵根', w: 20, mult: 1.0, hidden: false, desc: '庚金锋锐，主杀伐。剑修多出于此。' },
      { id: 'mu', name: '木灵根', w: 20, mult: 1.0, hidden: false, desc: '乙木生发，主生机。丹道、灵植之良材。' },
      { id: 'shui', name: '水灵根', w: 20, mult: 1.0, hidden: false, desc: '壬水利万物，主绵长。行功绵密，韧性过人。' },
      { id: 'huo', name: '火灵根', w: 20, mult: 1.0, hidden: false, desc: '丙火暴烈，主攻伐。行功刚猛，进境如火。' },
      { id: 'tu', name: '土灵根', w: 20, mult: 1.0, hidden: false, desc: '戊土厚重，主镇守。根基扎实，稳如泰山。' },
      { id: 'bing', name: '冰灵根', w: 6, mult: 1.5, hidden: false, desc: '水行变异，寒霜凝脉。攻守兼备，百年难遇。' },
      { id: 'lei', name: '雷灵根', w: 5, mult: 1.6, hidden: false, desc: '金行变异，雷音贯体。攻伐无双，千年一见。' },
      { id: 'feng', name: '风灵根', w: 4, mult: 1.7, hidden: false, desc: '木行变异，御风而行。身法飘逸，来去无踪。' },
      { id: 'an', name: '暗灵根', w: 3, mult: 1.85, hidden: false, desc: '幽冥之气入体，昼伏夜行。行事诡谲，深不可测。' },
      { id: 'guang', name: '光灵根', w: 2, mult: 2.0, hidden: false, desc: '曜灵之气护体，诸邪不侵。天生近道，霞举可期。' },
      { id: 'hundun', name: '混沌灵根', w: 1, mult: 3.0, hidden: true, desc: '五行未分，混沌一片。古往今来，得此根者不过一掌之数。' },
    ],

    /* ============ 经脉穴位 meridians ============
     * 三条支线：手太阴（吐纳养气，主修炼速率）/ 足少阳（强筋壮骨，主战斗属性）/ 任督（贯通天地，主破境机缘）。
     * need 为前置穴位 id 列表，线内链式推进；cost 为点亮所需修为，沿链递增（量级对齐 XG.cfg.REALMS 各境界 rate，
     * 手太阴≈炼气筑基、足少阳≈筑基金丹、任督≈金丹至化神，保证无法一蹴而就）。 */
    meridians: [
      // —— 手太阴（肺经九穴）：养气归元，主 cultRatePct ——
      { id: 'm_st1', name: '中府', branch: '手太阴', cost: 50, eff: { cultRatePct: 2 }, need: [] },
      { id: 'm_st2', name: '云门', branch: '手太阴', cost: 150, eff: { cultRatePct: 2.5 }, need: ['m_st1'] },
      { id: 'm_st3', name: '天府', branch: '手太阴', cost: 400, eff: { cultRatePct: 3, hpPct: 1 }, need: ['m_st2'] },
      { id: 'm_st4', name: '侠白', branch: '手太阴', cost: 1e3, eff: { cultRatePct: 3.5 }, need: ['m_st3'] },
      { id: 'm_st5', name: '尺泽', branch: '手太阴', cost: 2.5e3, eff: { cultRatePct: 4, hpPct: 2 }, need: ['m_st4'] },
      { id: 'm_st6', name: '孔最', branch: '手太阴', cost: 6e3, eff: { cultRatePct: 4.5, workPct: 3 }, need: ['m_st5'] },
      { id: 'm_st7', name: '列缺', branch: '手太阴', cost: 1.5e4, eff: { cultRatePct: 5 }, need: ['m_st6'] },
      { id: 'm_st8', name: '经渠', branch: '手太阴', cost: 4e4, eff: { cultRatePct: 5.5, alchSuccPct: 2 }, need: ['m_st7'] },
      { id: 'm_st9', name: '太渊', branch: '手太阴', cost: 1e5, eff: { cultRatePct: 7, hpPct: 3 }, need: ['m_st8'] },

      // —— 足少阳（胆经九穴）：强筋壮骨，主攻防气血 ——
      { id: 'm_sy1', name: '瞳子髎', branch: '足少阳', cost: 1e3, eff: { atkPct: 2 }, need: [] },
      { id: 'm_sy2', name: '风池', branch: '足少阳', cost: 3e3, eff: { atkPct: 2.5, defPct: 1 }, need: ['m_sy1'] },
      { id: 'm_sy3', name: '肩井', branch: '足少阳', cost: 8e3, eff: { atkPct: 3, hpPct: 1.5 }, need: ['m_sy2'] },
      { id: 'm_sy4', name: '居髎', branch: '足少阳', cost: 2e4, eff: { defPct: 3, hpPct: 2 }, need: ['m_sy3'] },
      { id: 'm_sy5', name: '环跳', branch: '足少阳', cost: 6e4, eff: { atkPct: 3.5, hpFlat: 200 }, need: ['m_sy4'] },
      { id: 'm_sy6', name: '阳陵泉', branch: '足少阳', cost: 1.5e5, eff: { atkPct: 4, defPct: 2 }, need: ['m_sy5'] },
      { id: 'm_sy7', name: '光明', branch: '足少阳', cost: 4e5, eff: { atkPct: 4.5, hpPct: 2.5 }, need: ['m_sy6'] },
      { id: 'm_sy8', name: '悬钟', branch: '足少阳', cost: 1e6, eff: { atkPct: 5, defPct: 2.5 }, need: ['m_sy7'] },
      { id: 'm_sy9', name: '丘墟', branch: '足少阳', cost: 3e6, eff: { atkPct: 6, hpPct: 4 }, need: ['m_sy8'] },

      // —— 任督（二脉九穴）：贯通天地，主破境与综合 ——
      { id: 'm_rd1', name: '关元', branch: '任督', cost: 5e4, eff: { cultRatePct: 5, breakSuccPct: 0.5 }, need: [] },
      { id: 'm_rd2', name: '气海', branch: '任督', cost: 1.5e5, eff: { cultRatePct: 6, hpPct: 3 }, need: ['m_rd1'] },
      { id: 'm_rd3', name: '神阙', branch: '任督', cost: 5e5, eff: { breakSuccPct: 0.8, defPct: 3 }, need: ['m_rd2'] },
      { id: 'm_rd4', name: '膻中', branch: '任督', cost: 1.5e6, eff: { cultRatePct: 7, atkPct: 3 }, need: ['m_rd3'] },
      { id: 'm_rd5', name: '命门', branch: '任督', cost: 5e6, eff: { breakSuccPct: 1, hpPct: 4 }, need: ['m_rd4'] },
      { id: 'm_rd6', name: '大椎', branch: '任督', cost: 1.5e7, eff: { cultRatePct: 8, atkPct: 4 }, need: ['m_rd5'] },
      { id: 'm_rd7', name: '风府', branch: '任督', cost: 5e7, eff: { breakSuccPct: 1.2, defPct: 4 }, need: ['m_rd6'] },
      { id: 'm_rd8', name: '百会', branch: '任督', cost: 2e8, eff: { cultRatePct: 10, breakSuccPct: 1.5 }, need: ['m_rd7'] },
      { id: 'm_rd9', name: '神庭', branch: '任督', cost: 8e8, eff: { cultRatePct: 12, breakSuccPct: 2, hpPct: 5 }, need: ['m_rd8'] },
    ],
  };
})();
