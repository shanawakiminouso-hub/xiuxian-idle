/* pills.js：炼丹数据表（契约 §9.3）——丹方 recipes / 丹炉 furnaces / 异火 fires / 灵草材料 herb_* 登记
 * —— 数据口径约定（alchemy 等 sys 层实现时遵循）——
 * eff.type 语义：
 *   cult：无 dur → 立即获得 val 点修为；有 dur → dur 秒内修炼速度 +val%
 *   break：val=大境界突破成功率加值（小数，0.15=+15%），服后存为一次性 buff，突破时消耗；
 *         同一突破最多叠 3 颗（见 cfg.BREAK_PILL_BONUS）；seg:[min,max] 限定可用 realmIdx 闭区间，段外不可服
 *   heal：val=回血比例(0~1)；无 dur 立即回复，有 dur 为 dur 秒内持续回复的总量
 *   tox ：val=丹毒变化量（负数为解毒）；解毒丹不受「丹毒>80 禁止服丹」限制
 *   root：val=1 重 roll 五行灵根（grade 不变）；val=2 灵根 grade+1（上限 5）；val=3 → dur 秒内灵根洗练变异率 +25%（数据约定常量）
 *   atk/def/hp：dur 秒内对应战斗属性 +val%（爬塔/守关/论剑生效）
 *   work：dur 秒内灵宠打工产出 +val%（兽用丹）
 *   exp ：出战灵宠每只立即获得 val 点经验（兽用丹）
 * 丹方 tox 字段 = 玩家服用后丹毒增量，按品阶递增；兽用丹（work/exp）tox=0 不入丹毒。
 * hidden 丹方不进初始 known，解锁 cond：'explode' 炸炉时概率顿悟 / 'merchant' 坊市神秘商人限售 / 'hiddenmap' 隐藏地图（归墟·龙渊）掉落残方，由 alchemy 系统判定。
 * 非隐藏丹方 alchLv 达标即自动参悟。furnaces：succ=成功率百分点加值，speed=炼制耗时÷speed，cost=购置灵石，id:1 为初始持有。
 * fires：succ=成功率百分点加值，mutPct=变异概率百分点（变异极品效果×1.5、icon 加★）；须先获取（XG.state.alchemy.fires[id]=1）方可装备。
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  // ================= 灵草材料（合并进 XG.data.mats，契约 §6 命名空间 herb_*） =================
  // grade 1~9 品阶梯度；desc 中暗示获取渠道（灵田种植/山泽采撷/历练掉落），供 world/cave 系统引用
  const mats = {
    // —— 一阶凡草 ——
    herb_qingling: { name: '青灵草', icon: '🌿', grade: 1, desc: '山泽间最常见的灵草，叶含淡淡青气。灵田亦可栽植，是百丹之基。' },
    herb_ningxue:  { name: '凝血草', icon: '🌾', grade: 1, desc: '叶缘如锯齿，断口渗赤汁。止血良药，散修行囊常备。' },
    herb_ningshen: { name: '宁神花', icon: '🌸', grade: 1, desc: '月夜绽放，幽香安神。沏茶或入药，皆可定心静气。' },
    herb_ziye:     { name: '紫叶兰', icon: '🌷', grade: 1, desc: '叶背泛紫，生于阴湿岩缝。药性和缓，多作丹方佐使。' },
    // —— 二阶灵草 ——
    herb_juling:   { name: '聚灵草', icon: '☘️', grade: 2, desc: '叶脉天生聚灵纹路，晨昏之间吞吐灵气。灵田丰年方得一茬。' },
    herb_yuehua:   { name: '月华草', icon: '🌙', grade: 2, desc: '满月之夜凝露成珠，珠中有月华流转。阴年阴月采之最佳。' },
    herb_chiyang:  { name: '赤阳花', icon: '🌼', grade: 2, desc: '向阳而生，花色如燃。性烈如火，丹中用之可添三分猛劲。' },
    herb_bingxin:  { name: '冰心莲', icon: '🪷', grade: 2, desc: '生于寒潭，莲心一点冰晶。清热败毒，解丹毒之首选。' },
    // —— 三阶珍品 ——
    herb_xuanbing: { name: '玄冰花', icon: '❄️', grade: 3, desc: '雪岭绝巅方开，触手生寒。百年不谢，谢则化水。' },
    herb_huolingzhi:{ name: '火灵芝', icon: '🍄', grade: 3, desc: '长于火山裂隙，芝盖赤红流霞。温补火元，炼丹常用之君药。' },
    herb_digen:    { name: '地根参', icon: '🌱', grade: 3, desc: '深埋地脉之处，参形如人。得地气百年，大补元气。' },
    herb_jinxian:  { name: '金线兰', icon: '🎋', grade: 3, desc: '叶脉如金丝缠绕，日光下熠熠生辉。淬体固元之妙品。' },
    // —— 四阶灵物 ——
    herb_longxu:   { name: '龙须草', icon: '🐉', grade: 4, desc: '传为真龙须落地所生，草茎细长如须，韧不可折。续脉接气，丹中上品。' },
    herb_fengwei:  { name: '凤尾花', icon: '🦚', grade: 4, desc: '花开如凤尾舒展，五色流转。霞光所至，百药增辉。' },
    herb_yusui:    { name: '玉髓芝', icon: '💮', grade: 4, desc: '芝体晶莹剔透，内有玉髓流动。生死人肉白骨之辅药。' },
    herb_youming:  { name: '幽冥兰', icon: '🌑', grade: 4, desc: '生于不见天日之谷，花色如墨。性极阴毒，善用者以毒攻毒。' },
    // —— 五阶地宝 ——
    herb_tianxing: { name: '天星草', icon: '⭐', grade: 5, desc: '夜映星辉而长，叶上有点点星斑。引星力入丹，可通造化。' },
    herb_dihuo:    { name: '地心火莲', icon: '🔥', grade: 5, desc: '地火深处千年一开，莲瓣皆燃而不毁。火性丹药之至宝。' },
    herb_hansui:   { name: '寒髓花', icon: '🧊', grade: 5, desc: '玄冰之下孕出，花芯一滴寒髓。洗髓炼骨，非此不可。' },
    herb_leiming:  { name: '雷鸣藤', icon: '⚡', grade: 5, desc: '雷暴之夜疯长，藤身时有电光游走。淬灵荡秽，劲道刚猛。' },
    // —— 六阶天材 ——
    herb_xueling:  { name: '血灵菇', icon: '🩸', grade: 6, desc: '生于古战场血浸之地，菇盖殷红欲滴。补精养血，效力雄浑。' },
    herb_taiyin:   { name: '太阴芝', icon: '🌚', grade: 6, desc: '阴风洞中偶得，通体幽蓝。太阴之精凝结，镇魂定魄。' },
    herb_taiyang:  { name: '太阳精葵', icon: '🌻', grade: 6, desc: '终日逐日而转，籽中蕴含太阳精火。至阳之品，阴寒丹方赖以调和。' },
    // —— 七阶仙品 ——
    herb_zhuguo:   { name: '千年朱果', icon: '🍎', grade: 7, desc: '千年一熟，果如赤玉。传闻食之可增一甲子修为，入丹更佳。' },
    herb_xukong:   { name: '虚空莲', icon: '🌀', grade: 7, desc: '开于虚空裂隙之畔，时隐时现。采之须趁其现身一瞬。' },
    herb_wudao:    { name: '悟道茶', icon: '🍵', grade: 7, desc: '古茶树万载成灵，茶叶含道韵。一品之下，玄机自现。' },
    // —— 八阶神物 ——
    herb_longxian: { name: '龙涎草', icon: '🐲', grade: 8, desc: '真龙涎液浇灌而生，草香沉郁千年不散。定魂安魄，渡劫之佐。' },
    herb_fengxue:  { name: '凤血草', icon: '🌺', grade: 8, desc: '凤凰滴血之地所生，草色殷红如凝血。内含一丝凤凰真血。' },
    herb_xuanwu:   { name: '玄武苔', icon: '🐢', grade: 8, desc: '附于玄武遗甲之侧，万年不枯。服之如负玄甲，固若金汤。' },
    herb_yaowang:  { name: '万年药王', icon: '🍀', grade: 8, desc: '万年方成的药中之王，出土时霞光冲霄，四方修士必争。生死人肉白骨，丹家梦寐以求。' },
    // —— 九阶圣药 ——
    herb_hundun:   { name: '混沌青莲', icon: '🌌', grade: 9, desc: '天地初开时的一缕混沌气所化，世间难寻。得之者，丹道可通神。' },
    herb_puti:     { name: '菩提子', icon: '📿', grade: 9, desc: '菩提古树千年结一子。悟者视之见道，迷者视之如石。' },
    herb_busi:     { name: '不死草', icon: '🌳', grade: 9, desc: '传说中枯荣轮回而不灭的神草。一叶入口，生死一线可挽回。' },
  };

  // ================= 丹方（34 张：修为 6 档 / 破境 4 档 / 疗伤 4 / 解毒 3 / 灵根 3 / 灵宠 3 / 打工 2 / 悟性 3 / 战斗 6，含隐藏 4） =================
  // 数值口径：cult 立即修为 ≈ 对应境界基础 rate × 约 8 小时；破境 val 恒 0.15 与 cfg 一致，靠 seg 与成本拉开梯度
  const recipes = [
    // —— 修为丹·六品阶（type:cult 立即修为） ——
    { id: 'pill_juqi', name: '聚气丹', icon: '💊', grade: 1, hidden: false, alchLv: 1,
      cost: { mat: { herb_qingling: 3, herb_ningxue: 2 }, lingShi: 200 }, time: 30,
      eff: { type: 'cult', val: 1e6 }, tox: 2,
      desc: '采青灵之气合凝血草而成，色作淡青。服之如甘霖灌体，修为立增，乃丹道入门第一丹。',
      getHint: '丹房初启即可参悟。' },
    { id: 'pill_ningyuan', name: '凝元丹', icon: '🔵', grade: 2, hidden: false, alchLv: 2,
      cost: { mat: { herb_juling: 3, herb_yuehua: 2 }, lingShi: 1500 }, time: 60,
      eff: { type: 'cult', val: 4.5e6 }, tox: 3,
      desc: '聚灵草承月华之露，凝作元丹。丹成之夜有微光自炉中透出，筑基修士视若珍宝。',
      getHint: '炼丹等级二阶自悟。' },
    { id: 'pill_xuanzhi', name: '玄芝丹', icon: '🟣', grade: 3, hidden: false, alchLv: 3,
      cost: { mat: { herb_yusui: 2, herb_jinxian: 2, herb_juling: 3 }, lingShi: 6000 }, time: 120,
      eff: { type: 'cult', val: 1.8e7 }, tox: 4,
      desc: '玉髓芝配金线兰，文火三日方成一炉。丹香清远，服之玄元充盈。',
      getHint: '炼丹等级三阶自悟。' },
    { id: 'pill_taiyi', name: '太一元丹', icon: '🟡', grade: 4, hidden: false, alchLv: 4,
      cost: { mat: { herb_tianxing: 2, herb_longxu: 2 }, lingShi: 2.5e4 }, time: 240,
      eff: { type: 'cult', val: 7.5e7 }, tox: 5,
      desc: '天星草引星辉，龙须草续地脉，两仪相济，丹成自鸣。金丹真人亦难得一炉。',
      getHint: '炼丹等级四阶自悟。' },
    { id: 'pill_jiuzhuan', name: '九转金丹', icon: '🌕', grade: 5, hidden: false, alchLv: 5,
      cost: { mat: { herb_zhuguo: 1, herb_taiyang: 2, herb_tianxing: 2 }, lingShi: 1e5 }, time: 420,
      eff: { type: 'cult', val: 3.6e8 }, tox: 7,
      desc: '九转方成，丹衣鎏金。相传古修士一粒入腹，抵得上枯坐数年。',
      getHint: '炼丹等级五阶自悟。' },
    { id: 'pill_hundun', name: '混沌一气丹', icon: '🌌', grade: 6, hidden: true, alchLv: 7, cond: 'hiddenmap',
      cost: { mat: { herb_hundun: 1, herb_puti: 1, herb_zhuguo: 2 }, lingShi: 8e5 }, time: 900,
      eff: { type: 'cult', val: 7.5e9 }, tox: 10,
      desc: '混沌青莲为引，一气化三清。丹成时炉中隐隐有开天之音，非常人所能炼。',
      getHint: '传闻龙渊深处沉有上古丹方残页，有机缘者方可参悟。' },

    // —— 破境丹·四档（type:break，seg 限定境界段） ——
    { id: 'pill_zhuji', name: '筑基丹', icon: '🧱', grade: 2, hidden: false, alchLv: 1,
      cost: { mat: { herb_ningxue: 3, herb_chiyang: 2 }, lingShi: 800 }, time: 90,
      eff: { type: 'break', val: 0.15 }, seg: [0, 0], tox: 3,
      desc: '炼气圆满之钥。丹成赤色，服之气血冲关，道基由此而立。',
      getHint: '丹房初启即可参悟。' },
    { id: 'pill_jiejin', name: '结金丹', icon: '🌰', grade: 4, hidden: false, alchLv: 3,
      cost: { mat: { herb_huolingzhi: 2, herb_jinxian: 2, herb_digen: 2 }, lingShi: 1.2e4 }, time: 300,
      eff: { type: 'break', val: 0.15 }, seg: [1, 1], tox: 5,
      desc: '火灵芝为君，地根参为臣，炉中自成一粒金性。破境金丹时服之，多一分胜算。',
      getHint: '炼丹等级三阶自悟。' },
    { id: 'pill_huaying', name: '化婴丹', icon: '👶', grade: 6, hidden: false, alchLv: 5,
      cost: { mat: { herb_fengwei: 2, herb_youming: 2, herb_xueling: 1 }, lingShi: 8e4 }, time: 600,
      eff: { type: 'break', val: 0.15 }, seg: [2, 3], tox: 8,
      desc: '凤尾栖霞，幽兰藏夜。金丹碎而元婴生，此丹可护那一瞬的道心不失。',
      getHint: '炼丹等级五阶自悟。' },
    { id: 'pill_due', name: '渡厄丹', icon: '🛡️', grade: 8, hidden: false, alchLv: 7,
      cost: { mat: { herb_longxian: 1, herb_taiyin: 2, herb_fengxue: 1 }, lingShi: 5e5 }, time: 1200,
      eff: { type: 'break', val: 0.15 }, seg: [4, 8], tox: 12,
      desc: '化神以上，一步一劫。龙涎定魂，太阴镇魔，渡厄之名，取其履险如夷。',
      getHint: '炼丹等级七阶自悟。' },

    // —— 疗伤（type:heal） ——
    { id: 'pill_xiaohuan', name: '小还丹', icon: '🟢', grade: 1, hidden: false, alchLv: 1,
      cost: { mat: { herb_ningxue: 2, herb_qingling: 2 }, lingShi: 150 }, time: 20,
      eff: { type: 'heal', val: 0.2 }, tox: 1,
      desc: '山间散修的救命丸，止血生肌。虽非灵丹妙药，胜在随处可炼。',
      getHint: '丹房初启即可参悟。' },
    { id: 'pill_huichun', name: '回春丹', icon: '💚', grade: 3, hidden: false, alchLv: 2,
      cost: { mat: { herb_ningshen: 2, herb_digen: 2, herb_bingxin: 1 }, lingShi: 3000 }, time: 90,
      eff: { type: 'heal', val: 0.5 }, tox: 3,
      desc: '宁神定魄，枯木回春。重伤垂危之际服之，生机自丹田复燃。',
      getHint: '炼丹等级二阶自悟。' },
    { id: 'pill_yulu', name: '玉露回生丹', icon: '💧', grade: 5, hidden: false, alchLv: 4,
      cost: { mat: { herb_yusui: 2, herb_hansui: 2 }, lingShi: 3e4 }, time: 300,
      eff: { type: 'heal', val: 0.8, dur: 60 }, tox: 5,
      desc: '玉髓化露，寒髓为引。药力绵绵不绝，一炷香内断骨可续、残躯渐愈。',
      getHint: '炼丹等级四阶自悟。' },
    { id: 'pill_huanhun', name: '九转还魂丹', icon: '✨', grade: 8, hidden: true, alchLv: 8, cond: 'explode',
      cost: { mat: { herb_busi: 1, herb_xukong: 1, herb_longxian: 1 }, lingShi: 1e6 }, time: 1500,
      eff: { type: 'heal', val: 1.0 }, tox: 10,
      desc: '九转还魂，生死人肉白骨。纵是气若游丝，一丹入口亦能还阳。',
      getHint: '炸炉之际偶有所悟——焦烟之中，或窥生死之机。' },

    // —— 解毒（type:tox，val 为负） ——
    { id: 'pill_qingdu', name: '清毒散', icon: '🍵', grade: 1, hidden: false, alchLv: 1,
      cost: { mat: { herb_bingxin: 2, herb_qingling: 1 }, lingShi: 100 }, time: 20,
      eff: { type: 'tox', val: -10 }, tox: 0,
      desc: '冰心莲研末冲服，苦得皱眉。丹毒初积时服一盏，通体松快。',
      getHint: '丹房初启即可参悟。' },
    { id: 'pill_bingxinhu', name: '冰心玉壶丹', icon: '🧊', grade: 4, hidden: false, alchLv: 3,
      cost: { mat: { herb_bingxin: 3, herb_xuanbing: 2 }, lingShi: 8000 }, time: 120,
      eff: { type: 'tox', val: -40 }, tox: 0,
      desc: '一片冰心在玉壶。药力清凉彻骨，所过之处丹毒如雪遇汤。',
      getHint: '炼丹等级三阶自悟。' },
    { id: 'pill_wandu', name: '万毒归元丹', icon: '☠️', grade: 7, hidden: false, alchLv: 6,
      cost: { mat: { herb_youming: 3, herb_leiming: 2, herb_xueling: 1 }, lingShi: 2e5 }, time: 600,
      eff: { type: 'tox', val: -100 }, tox: 0,
      desc: '以毒攻毒，万毒归元。幽冥兰裹雷鸣藤，入腹如惊雷荡秽，丹毒尽散。',
      getHint: '炼丹等级六阶自悟。' },

    // —— 灵根（type:root：1 洗灵根 / 2 根骨提升 / 3 变异淬炼） ——
    { id: 'pill_xisui', name: '洗髓丹', icon: '🫧', grade: 5, hidden: false, alchLv: 4,
      cost: { mat: { herb_hansui: 2, herb_yusui: 2, herb_bingxin: 2 }, lingShi: 5e4 }, time: 480,
      eff: { type: 'root', val: 1 }, tox: 6,
      desc: '伐毛洗髓，脱胎换骨。服之可重塑灵根五行，资质虽未变，蹊径自此分。',
      getHint: '炼丹等级四阶自悟。' },
    { id: 'pill_zhuanggu', name: '补天壮骨丹', icon: '🦴', grade: 6, hidden: false, alchLv: 5,
      cost: { mat: { herb_digen: 4, herb_xueling: 2, herb_zhuguo: 1 }, lingShi: 1.5e5 }, time: 720,
      eff: { type: 'root', val: 2 }, tox: 8,
      desc: '地根参补其本，朱果培其元。根骨再进一步，修行之路便宽一分。',
      getHint: '炼丹等级五阶自悟。' },
    { id: 'pill_cuiling', name: '淬灵丹', icon: '🌩️', grade: 7, hidden: false, alchLv: 6,
      cost: { mat: { herb_leiming: 2, herb_fengwei: 2, herb_taiyin: 1 }, lingShi: 2.5e5 }, time: 720,
      eff: { type: 'root', val: 3, dur: 1800 }, tox: 9,
      desc: '雷藤淬形，凤羽引灵。一炷香内洗练灵根，五行之外或见冰雷风暗之光。',
      getHint: '炼丹等级六阶自悟。' },

    // —— 灵宠经验（type:exp，兽用无丹毒） ——
    { id: 'pill_lingshou', name: '灵兽丹', icon: '🐾', grade: 2, hidden: false, alchLv: 1,
      cost: { mat: { herb_qingling: 2, herb_chiyang: 1 }, lingShi: 300 }, time: 30,
      eff: { type: 'exp', val: 500 }, tox: 0,
      desc: '以灵草合赤阳花搓成的小丸，灵宠闻之摇尾。兽用，不入人口。',
      getHint: '丹房初启即可参悟。' },
    { id: 'pill_zhuangshou', name: '壮兽丹', icon: '🍖', grade: 4, hidden: false, alchLv: 3,
      cost: { mat: { herb_huolingzhi: 2, herb_digen: 2 }, lingShi: 5000 }, time: 120,
      eff: { type: 'exp', val: 5000 }, tox: 0,
      desc: '火灵芝温补，地根参厚力。灵宠服之筋肉勃发，灵智渐开。',
      getHint: '炼丹等级三阶自悟。' },
    { id: 'pill_tianshou', name: '天兽真丹', icon: '🦄', grade: 7, hidden: false, alchLv: 6,
      cost: { mat: { herb_fengxue: 1, herb_zhuguo: 2, herb_taiyang: 1 }, lingShi: 1.8e5 }, time: 600,
      eff: { type: 'exp', val: 5e4 }, tox: 0,
      desc: '凤血为引，朱果为胎。传闻圣兽幼崽以此丹喂养，血脉可早醒三分。',
      getHint: '炼丹等级六阶自悟。' },

    // —— 打工效率（type:work，兽用无丹毒） ——
    { id: 'pill_lishi', name: '力士丹', icon: '💪', grade: 3, hidden: false, alchLv: 2,
      cost: { mat: { herb_digen: 2, herb_chiyang: 2 }, lingShi: 2000 }, time: 90,
      eff: { type: 'work', val: 30, dur: 3600 }, tox: 0,
      desc: '服之膂力倍增，一个时辰内担山赶海不在话下。灵宠劳作前喂一粒，事半功倍。',
      getHint: '炼丹等级二阶自悟。' },
    { id: 'pill_shengong', name: '神工丹', icon: '⚙️', grade: 6, hidden: false, alchLv: 5,
      cost: { mat: { herb_tianxing: 2, herb_leiming: 2 }, lingShi: 9e4 }, time: 480,
      eff: { type: 'work', val: 60, dur: 7200 }, tox: 0,
      desc: '星草醒神，雷藤壮力。两个时辰内灵宠耕作如神相助，灵田兽栏皆得其益。',
      getHint: '炼丹等级五阶自悟。' },

    // —— 悟性（type:cult + dur：限时修炼速度加成） ——
    { id: 'pill_wudao', name: '悟道丹', icon: '🍂', grade: 4, hidden: false, alchLv: 3,
      cost: { mat: { herb_wudao: 1, herb_ningshen: 3 }, lingShi: 1e4 }, time: 240,
      eff: { type: 'cult', val: 50, dur: 1800 }, tox: 4,
      desc: '悟道茶叶一枚，宁神花三钱。服之心若明镜，半个时辰内吐纳事半功倍。',
      getHint: '炼丹等级三阶自悟。' },
    { id: 'pill_tihu', name: '醍醐丹', icon: '🥛', grade: 6, hidden: false, alchLv: 5,
      cost: { mat: { herb_wudao: 2, herb_xukong: 1 }, lingShi: 1.2e5 }, time: 600,
      eff: { type: 'cult', val: 120, dur: 3600 }, tox: 7,
      desc: '醍醐灌顶，茅塞顿开。一个时辰内灵气入体如江河倒灌，悟性远胜平日。',
      getHint: '炼丹等级五阶自悟。' },
    { id: 'pill_puti', name: '菩提醍醐丹', icon: '📿', grade: 9, hidden: true, alchLv: 8, cond: 'merchant',
      cost: { mat: { herb_puti: 2, herb_wudao: 3, herb_hundun: 1 }, lingShi: 1.2e6 }, time: 1800,
      eff: { type: 'cult', val: 250, dur: 7200 }, tox: 12,
      desc: '菩提树下悟此丹方。服之如闻大道纶音，两个时辰内修行一日千里。',
      getHint: '坊市之中有神秘行商，行踪不定，或售此丹方，售价不菲。' },

    // —— 战斗增益（type:atk/def/hp + dur） ——
    { id: 'pill_zhanyi', name: '战意丹', icon: '⚔️', grade: 3, hidden: false, alchLv: 2,
      cost: { mat: { herb_chiyang: 3, herb_ningxue: 2 }, lingShi: 2500 }, time: 90,
      eff: { type: 'atk', val: 25, dur: 1800 }, tox: 3,
      desc: '赤阳花燃起胸中战血。半个时辰内攻势如虹，登塔论剑前服之最宜。',
      getHint: '炼丹等级二阶自悟。' },
    { id: 'pill_jingang', name: '金刚丹', icon: '🔰', grade: 3, hidden: false, alchLv: 2,
      cost: { mat: { herb_jinxian: 2, herb_digen: 2 }, lingShi: 2500 }, time: 90,
      eff: { type: 'def', val: 25, dur: 1800 }, tox: 3,
      desc: '金线兰淬体，地根参固元。半个时辰内肤若精金，刀剑难伤。',
      getHint: '炼丹等级二阶自悟。' },
    { id: 'pill_xueyuan', name: '血元丹', icon: '❤️', grade: 4, hidden: false, alchLv: 3,
      cost: { mat: { herb_xueling: 2, herb_ningxue: 3 }, lingShi: 9000 }, time: 150,
      eff: { type: 'hp', val: 30, dur: 1800 }, tox: 4,
      desc: '血灵菇熬炼七日，凝作一点精血。服之气血如炉，生生不竭。',
      getHint: '炼丹等级三阶自悟。' },
    { id: 'pill_sanmei', name: '三昧真火丹', icon: '🔥', grade: 7, hidden: false, alchLv: 6,
      cost: { mat: { herb_huolingzhi: 3, herb_dihuo: 2, herb_taiyang: 1 }, lingShi: 2.2e5 }, time: 660,
      eff: { type: 'atk', val: 60, dur: 3600 }, tox: 8,
      desc: '地心火莲炼就，丹中封存一缕真火。一个时辰内出手皆挟焚山之势。',
      getHint: '炼丹等级六阶自悟。' },
    { id: 'pill_xuanwudan', name: '玄武镇岳丹', icon: '🐢', grade: 6, hidden: false, alchLv: 5,
      cost: { mat: { herb_xuanwu: 1, herb_hansui: 2, herb_digen: 3 }, lingShi: 1e5 }, time: 540,
      eff: { type: 'def', val: 50, dur: 3600 }, tox: 7,
      desc: '玄武苔千年不腐，服之周身如负玄甲。一个时辰内巍然镇岳，万邪莫侵。',
      getHint: '炼丹等级五阶自悟。' },
    { id: 'pill_duhuo', name: '毒火罡丹', icon: '🧪', grade: 7, hidden: true, alchLv: 6, cond: 'explode',
      cost: { mat: { herb_youming: 3, herb_taiyin: 2, herb_xueling: 2 }, lingShi: 2e5 }, time: 600,
      eff: { type: 'atk', val: 80, dur: 1800 }, tox: 18,
      desc: '炸炉余烬中悟出的邪门丹方，以毒养火，以火淬罡。威力霸道，丹毒亦烈，慎之。',
      getHint: '炸炉时概率顿悟——邪火入炉，歪打正着。' },
  ];

  // ================= 丹炉（7 座：succ 成功率百分点 / speed 耗时倍率 / cost 灵石，均递增；id:1 初始持有） =================
  const furnaces = [
    { id: 1, name: '粗陶丹炉', icon: '🏺', succ: 0, speed: 1.0, cost: 0,
      desc: '山间土窑粗陶所制，火候难控，聊胜于无。丹道修行，皆自此炉始。' },
    { id: 2, name: '青铜丹炉', icon: '⚱️', succ: 3, speed: 1.1, cost: 5e3,
      desc: '青铜铸身，纹路古朴。火力平稳，丹成之数稍增。' },
    { id: 3, name: '玄铁丹炉', icon: '🔩', succ: 6, speed: 1.2, cost: 3e4,
      desc: '北冥玄铁千锤百炼，炉身沉黑如夜。锁温极佳，药性不泄。' },
    { id: 4, name: '紫金丹炉', icon: '🔮', succ: 10, speed: 1.35, cost: 2e5,
      desc: '紫金为骨，炉腹暗藏聚火纹。开炉时紫气氤氲，丹成率颇可观。' },
    { id: 5, name: '九龙离火炉', icon: '🐉', succ: 15, speed: 1.5, cost: 1.2e6,
      desc: '炉铸九龙衔珠，离火自窍中吞吐。相传为离火宫镇宫之物，后流转散仙之手。' },
    { id: 6, name: '太乙乾坤炉', icon: '☯️', succ: 21, speed: 1.75, cost: 6e6,
      desc: '内有乾坤，自分阴阳。药材入炉各归其位，火候由心，几近道器。' },
    { id: 7, name: '太上八卦炉', icon: '🌟', succ: 28, speed: 2.0, cost: 3e7,
      desc: '八卦方位暗合天机，文武火自在流转。传说老君炉中煅过石猴——此炉纵非彼炉，亦是人间极致。' },
  ];

  // ================= 异火（7 种：succ 成功率百分点 / mutPct 变异率百分点；含 2 种隐藏获取） =================
  const fires = [
    { id: 'fire_fan', name: '凡火', icon: '🕯️', grade: 0, succ: 0, mutPct: 0,
      getHint: '丹房初启即有，人人使得。',
      desc: '柴薪之火，最寻常不过。虽无灵性，亦曾煮出无数入门丹药。' },
    { id: 'fire_difu', name: '地肺真火', icon: '🌋', grade: 2, succ: 5, mutPct: 1,
      getHint: '洞府引地火入丹房，即可驭使。',
      desc: '引地肺之火，温而不燥，善养药性。取之不尽，用之不竭。' },
    { id: 'fire_ziwu', name: '子午天火', icon: '☄️', grade: 3, succ: 9, mutPct: 2,
      getHint: '镇妖塔每过三十三层，有概率拾得火种。',
      desc: '子午之交，天火坠世。得其一缕，可熔金化玉。' },
    { id: 'fire_qinglian', name: '青莲净火', icon: '🪷', grade: 4, succ: 14, mutPct: 3,
      getHint: '历练地火深泽，偶见青莲浴火而生，采得火种。',
      desc: '火中生莲，莲心吐焰。焰色青碧，最能淬去药中杂质。' },
    { id: 'fire_jiuyou', name: '九幽冥火', icon: '👻', grade: 5, succ: 18, mutPct: 5,
      getHint: '守关鏖战至深处，于妖潮余烬中采得。',
      desc: '九幽之下的冷焰，燃而不热，专焚药中戾气，丹成自有一番幽光。' },
    { id: 'fire_liuding', name: '六丁神火', icon: '🀄', grade: 6, succ: 24, mutPct: 7, hidden: true,
      getHint: '归墟之眼，潮退之夜，神火自现。',
      desc: '六丁六甲，神火无质。丹药过此火一遍，凡胎尽去，时有异变。' },
    { id: 'fire_hundun', name: '混沌虚火', icon: '🌀', grade: 7, succ: 32, mutPct: 10, hidden: true,
      getHint: '炸炉百次，炉火通灵，或自燃成精。',
      desc: '无形无相，似有似无。相传是炉中百炼之余的一点火灵，性喜变异，丹成多出奇品。' },
  ];

  // 登记挂载（纯数据，不触碰 XG.state）
  XG.data = XG.data || {};
  XG.data.mats = Object.assign(XG.data.mats || {}, mats);
  XG.data.pills = { recipes, furnaces, fires, mats };
})();
