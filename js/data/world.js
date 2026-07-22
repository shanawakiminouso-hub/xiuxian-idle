/* world.js：世界地图、秘境副本与坊市规则数据（契约 §9.6）—— 纯数据登记，不含逻辑 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.data = XG.data || {};
  XG.data.mats = XG.data.mats || {};

  /* ==================== 材料登记（并入 XG.data.mats） ====================
   * 本文件负责登记：ore_*（矿石 12 种）、gem_*（宝石 10 种）、beast_*（妖兽材料 13 种）、sp_*（地图特产 9 种）。
   * herb_* 由炼丹批次（pills.js）主登记；此处仅对本图掉落引用到的 9 种低阶 herb 做「保底登记」：
   *   一律「存在则不覆盖」，绝不改写他人条目，保证与炼丹批次不冲突。
   *   中高阶地图（万妖岭起）掉落表另直接引用 pills.js 主登记的丹方灵草（四~九阶），
   *   按图阶配品：万妖岭g4 / 北海g4~5 / 焚天g5~6 / 幽冥g6 / 归墟g5~9 / 龙渊g8~9，无需重复登记。
   * grade 口径（材料表自定义）：0 凡 / 1 灵 / 2 宝 / 3 仙 / 4 神。
   */
  const MATS = {
    /* ---- herb_* 保底登记（主登记在 pills.js，若炼丹批次已登记则跳过） ---- */
    herb_lingzhi:    { name: '灵芝',   icon: '芝', grade: 1, desc: '深山朽木所生，霞盖云纹，益气养神，丹家最常用。' },
    herb_fuling:     { name: '茯苓',   icon: '苓', grade: 1, desc: '抱松根而生，质白如玉，宁心安神，可入百般丹方。' },
    herb_huangjing:  { name: '黄精',   icon: '精', grade: 1, desc: '得坤土之气，九蒸九晒后甘美如饴，食之延年。' },
    herb_renshen:    { name: '人参',   icon: '参', grade: 2, desc: '形如婴孩，藏精纳灵，百年者已属难得。' },
    herb_heshouwu:   { name: '何首乌', icon: '乌', grade: 2, desc: '藤蔓夜交，块根似人形，乌发固精之圣药。' },
    herb_xuelian:    { name: '雪莲',   icon: '莲', grade: 2, desc: '生于万仞冰崖，凌寒独放，清火解毒有奇效。' },
    herb_chiyancao:  { name: '赤焰草', icon: '焰', grade: 3, desc: '叶脉如火纹游走，触之灼手，唯焚天谷地热可育。' },
    herb_longxiancao:{ name: '龙涎草', icon: '涎', grade: 3, desc: '传为蛟龙涎液滴落所生，异香经月不散。' },
    herb_hunyuancao: { name: '混元草', icon: '混', grade: 4, desc: '一茎三叶，叶分五色，暗合混元之理，丹家求之难得。' },

    /* ---- ore_* 矿石（12 种，本文件主登记） ---- */
    ore_qingtong:    { name: '青铜',     icon: '铜', grade: 0, desc: '山间常见之矿，铸器入门之材，百炼亦可成锋。' },
    ore_heite:       { name: '黑铁',     icon: '铁', grade: 0, desc: '色沉如墨，质坚而脆，炼去杂质方堪大用。' },
    ore_xuantie:     { name: '玄铁',     icon: '玄', grade: 1, desc: '色玄而重逾常铁三倍，剑修梦寐以求。' },
    ore_wuxingsha:   { name: '五行砂',   icon: '砂', grade: 1, desc: '五色矿砂相生相克，布阵铸器两宜。' },
    ore_miyin:       { name: '秘银',     icon: '银', grade: 2, desc: '月华所淬，轻若鸿羽而韧逾精钢。' },
    ore_jingjin:     { name: '精金',     icon: '金', grade: 2, desc: '百炼之精，金光内蕴，凡火难熔。' },
    ore_hantie:      { name: '万年寒铁', icon: '寒', grade: 3, desc: '沉于北海玄冰之下万载，入手几欲冻裂筋骨。' },
    ore_chijing:     { name: '赤晶铜',   icon: '赤', grade: 3, desc: '地火熔浆中结晶而成，赤光灼灼，导热极佳。' },
    ore_mingtie:     { name: '幽冥玄铁', icon: '冥', grade: 3, desc: '幽冥涧底阴煞所孕，黝黑无光，炼器可附蚀魂之威。' },
    ore_xingchenjin: { name: '星辰金',   icon: '星', grade: 4, desc: '传为星屑坠地所化，夜观之有银辉流转。' },
    ore_longwenjin:  { name: '龙纹金',   icon: '纹', grade: 4, desc: '金纹如龙游走，乃龙气浸润千年之宝。' },
    ore_hundunjin:   { name: '混沌母金', icon: '沌', grade: 4, desc: '天地未分时一点精金，可孕万器之胚。' },

    /* ---- gem_* 宝石（10 种，本文件主登记） ---- */
    gem_lingcui: { name: '灵翠',   icon: '翠', grade: 0, desc: '青山灵气凝成之翠石，微光莹然。' },
    gem_biyu:    { name: '碧玉',   icon: '碧', grade: 1, desc: '苍梧深涧所产，色如春水，温润养人。' },
    gem_zijing:  { name: '紫晶',   icon: '紫', grade: 1, desc: '紫气东来之象，蕴雷光于内。' },
    gem_xuepo:   { name: '血珀',   icon: '珀', grade: 2, desc: '古兽精血封于松脂万载而成，殷红欲滴。' },
    gem_hanyu:   { name: '寒玉',   icon: '玉', grade: 2, desc: '触手生寒，佩之可定心神、辟火毒。' },
    gem_xinghui: { name: '星辉石', icon: '辉', grade: 3, desc: '夜半自生微光，如掬一捧星河。' },
    gem_yanxin:  { name: '焰心石', icon: '焰', grade: 3, desc: '地火之心凝就，内有一丝不灭之焰。' },
    gem_mingzhu: { name: '幽冥珠', icon: '珠', grade: 3, desc: '阴华凝聚，幽光泠泠，可照九泉之路。' },
    gem_guixuyu: { name: '归墟玉', icon: '墟', grade: 4, desc: '万水归处沉淀之玉，内有潮汐之声。' },
    gem_longmu:  { name: '龙目珠', icon: '目', grade: 4, desc: '传为真龙瞑目所化，珠中竖瞳隐隐欲睁。' },

    /* ---- beast_* 妖兽材料（13 种，本文件主登记） ---- */
    beast_huya:        { name: '青狼牙',   icon: '牙', grade: 0, desc: '青云青狼之锐齿，坚逾精铁，可磨作刃。' },
    beast_tuling:      { name: '土灵鬃',   icon: '鬃', grade: 0, desc: '土灵兽颈后硬鬃，内含厚土之气。' },
    beast_shelin:      { name: '青蟒鳞',   icon: '鳞', grade: 1, desc: '苍梧青蟒蜕下之鳞，柔韧刀枪难入。' },
    beast_xiongdan:    { name: '熊罴胆',   icon: '胆', grade: 1, desc: '山野熊罴之胆，苦极而大补，丹家珍视。' },
    beast_yaodan:      { name: '妖兽内丹', icon: '丹', grade: 2, desc: '妖兽百年修为所凝，丹光内蕴，炼器服丹两宜。' },
    beast_jiaowei:     { name: '蛟尾筋',   icon: '筋', grade: 2, desc: '恶蛟尾上大筋，抽之可制弓弦鞭索。' },
    beast_bingjiao_lin:{ name: '冰蛟鳞',   icon: '冰', grade: 3, desc: '北海冰蛟之鳞，寒光湛湛，水火不侵。' },
    beast_yanlang_gu:  { name: '炎狼脊骨', icon: '骨', grade: 3, desc: '焚天炎狼脊骨，余温经年不熄。' },
    beast_mingdie_yi:  { name: '冥蝶翼',   icon: '蝶', grade: 3, desc: '幽冥冥蝶之翼，薄如幽纱，隐现魂光。' },
    beast_kun_yu:      { name: '鲲羽',     icon: '鲲', grade: 4, desc: '北溟巨鲲脱落的翎羽，一片可覆小舟。' },
    beast_longlin:     { name: '龙鳞',     icon: '麟', grade: 4, desc: '真龙之鳞，万金难求，刀枪术法皆难伤。' },
    beast_longgu:      { name: '龙骨',     icon: '骸', grade: 4, desc: '龙骸之骨，历经万劫而不腐，沉重如山。' },
    beast_longjiao:    { name: '龙角',     icon: '角', grade: 4, desc: '龙角峥嵘，蕴一丝真龙威压，镇邪辟易。' },

    /* ---- sp_* 地图特产（9 种，每图一种，本文件主登记） ---- */
    sp_qingyun_tea:  { name: '青云云雾茶', icon: '茶', grade: 1, desc: '青云之巅云雾滋养的灵茶，一盏清心明目，赠友最宜。' },
    sp_luoxia_jing:  { name: '落霞晶',     icon: '霞', grade: 1, desc: '落霞谷暮色所凝的晶簇，握之如掬一抹残霞，佩之安神定魄。' },
    sp_cangwu_wood:  { name: '苍梧灵木',   icon: '木', grade: 1, desc: '苍梧古木之心，纹理天然成阵，炼器造屋皆为良材。' },
    sp_yaoling_guo:  { name: '妖灵果',     icon: '果', grade: 2, desc: '万妖岭深处异果，妖气氤氲，灵宠食之助长灵性。' },
    sp_beihai_sui:   { name: '玄冰髓',     icon: '髓', grade: 2, desc: '玄冰万载凝出的一点冰髓，降火定丹有奇效。' },
    sp_fentian_huo:  { name: '焚天火种',   icon: '火', grade: 3, desc: '焚天地火凝出的一缕火种，驯之可为丹炉异火之引。' },
    sp_youming_hua:  { name: '彼岸花',     icon: '花', grade: 3, desc: '花开不见叶，叶生不见花，幽冥涧畔接引幽魂之卉。' },
    sp_guixu_bi:     { name: '归墟残璧',   icon: '璧', grade: 4, desc: '上古祭器之残片，潮声中隐有龙吟，集齐五枚可启龙渊。' },
    sp_longyuan_lin: { name: '龙渊逆鳞',   icon: '逆', grade: 4, desc: '龙有逆鳞，触之必怒；此鳞乃龙渊镇渊之宝，万邪不侵。' },
  };

  // 保底合并：一律不覆盖既有条目（防与炼丹批次的 herb_* 冲突）
  for (const id in MATS) {
    if (Object.prototype.hasOwnProperty.call(MATS, id) && !XG.data.mats[id]) {
      XG.data.mats[id] = MATS[id];
    }
  }

  /* ==================== 历练地图 ====================
   * drops 字段口径（由 expedition 系统实现）：
   *   mat：{ 材料id: [数量下限, 数量上限, 权重] }；
   *   pill / frag：{ 'g1'~'g9': [数量下限, 数量上限, 权重] } —— 按品阶掉「随机成品丹 / 随机功法残篇」，
   *     品阶池分别见 pills.js / gongfa.js，故本文件不直接引用其 id，避免跨批次悬空引用。
   *   结算规则（注释）：按权重抽取 3/4/5 种（时长档 1分/3分/10分钟），每种数量在上下限间取整，
   *     再乘时长系数 ×1 / ×3.2 / ×6；sp 特产按 min(1, 时长/1h) 概率判定，得 1/1/2 件；
   *     eggChance / recipeChance 为每次派遣独立判定的概率（灵宠蛋 / 随机丹方），
   *     结算时按 min(1, 时长/1h) 缩放，时产口径与旧 1h 档一致。
   *   power 为建议战力：参照 cfg.REALM_BASE 战力基值（金丹≈5.5e3，每大境界×6）×约 1.5 设定。
   * events：各地图专属事件 id 为「预留位」（evb_<mapId>_01~03，每图 3 条），
   *   由 events_b 批次按 id + mapId 落地实现；未实现前 expedition 可安全跳过。
   */
  const maps = [
    {
      id: 'qingyun', name: '青云山', icon: '⛰️', hidden: false,
      unlock: { realmIdx: 1, layer: 1 }, power: 1e3, dur: [60, 180, 600],
      drops: {
        mat: {
          herb_lingzhi: [1, 3, 10], herb_fuling: [1, 2, 9], herb_ningshen: [1, 2, 7], herb_ziye: [1, 2, 6],
          ore_qingtong: [1, 3, 9], ore_heite: [1, 2, 7],
          beast_huya: [1, 2, 5], beast_tuling: [1, 2, 5],
          gem_lingcui: [1, 1, 3],
          herb_qingling: [1, 2, 8], herb_ningxue: [1, 2, 7],
          ore_jingtie: [1, 2, 8],
        },
        pill: { g1: [1, 1, 5] }, frag: { g1: [1, 1, 4] },
        eggChance: 0.06, recipeChance: 0.03,
      },
      sp: 'sp_qingyun_tea',
      events: ['evb_qingyun_01', 'evb_qingyun_02', 'evb_qingyun_03'],
      desc: '钟灵毓秀之仙山，云雾缭绕，灵草遍地，乃散修初窥门径的好去处。',
    },
    {
      id: 'luoxia', name: '落霞谷', icon: '🌄', hidden: false,
      unlock: { realmIdx: 1, layer: 6 }, power: 3e3, dur: [60, 180, 600],
      drops: {
        mat: {
          herb_fuling: [1, 3, 9], herb_huangjing: [1, 2, 8],
          herb_juling: [1, 2, 7], herb_yuehua: [1, 2, 6],
          ore_wuxingsha: [1, 2, 8], ore_qingtong: [1, 3, 7],
          beast_shelin: [1, 2, 5], beast_xiongdan: [1, 1, 5],
          gem_zijing: [1, 1, 4],
          herb_ningshen: [1, 2, 5], herb_ziye: [1, 1, 4],
          ore_jingtie: [1, 2, 7],
          beast_yaodan: [1, 1, 3],
        },
        pill: { g1: [1, 1, 4], g2: [1, 1, 2] }, frag: { g1: [1, 1, 3], g2: [1, 1, 1] },
        eggChance: 0.05, recipeChance: 0.04,
      },
      sp: 'sp_luoxia_jing',
      events: ['evb_luoxia_01', 'evb_luoxia_02', 'evb_luoxia_03'],
      desc: '日落时分霞光满谷，紫晶与灵草并生，熊罴青蟒偶有出没，筑基中方可一探。',
    },
    {
      id: 'cangwu', name: '苍梧之野', icon: '🌳', hidden: false,
      unlock: { realmIdx: 2, layer: 1 }, power: 8e3, dur: [60, 180, 600],
      drops: {
        mat: {
          herb_huangjing: [1, 3, 9], herb_renshen: [1, 2, 8],
          herb_xuanbing: [1, 2, 6], herb_digen: [1, 2, 5],
          ore_xuantie: [1, 3, 9], ore_wuxingsha: [1, 2, 7],
          beast_shelin: [1, 2, 6], beast_xiongdan: [1, 1, 4],
          gem_biyu: [1, 1, 4],
          ore_zijin: [1, 2, 7], ore_xingsha: [1, 1, 4],
        },
        pill: { g2: [1, 1, 5] }, frag: { g2: [1, 1, 4], g3: [1, 1, 1] },
        eggChance: 0.05, recipeChance: 0.04,
      },
      sp: 'sp_cangwu_wood',
      events: ['evb_cangwu_01', 'evb_cangwu_02', 'evb_cangwu_03'],
      desc: '古木参天的莽莽荒野，凤栖之木与凶兽并存，金丹修士方可涉足。',
    },
    {
      id: 'wanyao', name: '万妖岭', icon: '🐍', hidden: false,
      unlock: { realmIdx: 3, layer: 1 }, power: 5e4, dur: [60, 180, 600],
      drops: {
        mat: {
          herb_renshen: [1, 3, 8], herb_heshouwu: [1, 2, 8],
          herb_jinxian: [1, 2, 6], herb_longxu: [1, 1, 4],
          ore_miyin: [1, 2, 8], ore_jingjin: [1, 2, 7],
          beast_yaodan: [1, 2, 7], beast_jiaowei: [1, 2, 6],
          gem_zijing: [1, 1, 5], gem_xuepo: [1, 1, 4],
          herb_youming: [1, 2, 7], herb_fengwei: [1, 1, 5], herb_zhuguo: [1, 1, 3],
          herb_tianxing: [1, 1, 4], ore_xingchen: [1, 2, 7],
        },
        pill: { g3: [1, 1, 5] }, frag: { g3: [1, 1, 4] },
        eggChance: 0.07, recipeChance: 0.04,
      },
      sp: 'sp_yaoling_guo',
      events: ['evb_wanyao_01', 'evb_wanyao_02', 'evb_wanyao_03'],
      desc: '群妖啸聚之恶岭，夜半妖火点点，内丹与杀机皆俯拾皆是。',
    },
    {
      id: 'beihai', name: '北海冰原', icon: '🧊', hidden: false,
      unlock: { realmIdx: 4, layer: 1 }, power: 3e5, dur: [60, 180, 600],
      drops: {
        mat: {
          herb_xuelian: [1, 2, 9], herb_heshouwu: [1, 2, 6],
          herb_tianxing: [1, 2, 5], herb_dihuo: [1, 1, 4],
          ore_hantie: [1, 2, 8], ore_jingjin: [1, 2, 6],
          beast_bingjiao_lin: [1, 2, 7], beast_jiaowei: [1, 2, 5],
          gem_hanyu: [1, 1, 5], gem_xinghui: [1, 1, 3],
          herb_longxu: [1, 2, 7], herb_hansui: [1, 1, 5], herb_yusui: [1, 1, 4],
          herb_wudao: [1, 1, 4], ore_longjin: [1, 1, 5],
        },
        pill: { g4: [1, 1, 4] }, frag: { g4: [1, 1, 3] },
        eggChance: 0.04, recipeChance: 0.05,
      },
      sp: 'sp_beihai_sui',
      events: ['evb_beihai_01', 'evb_beihai_02', 'evb_beihai_03'],
      desc: '万里冰封的苦寒之地，冰蛟潜于渊，寒铁沉于底，化神之下难抵其寒。',
    },
    {
      id: 'fentian', name: '焚天谷', icon: '🔥', hidden: false,
      unlock: { realmIdx: 5, layer: 1 }, power: 1.8e6, dur: [60, 180, 600],
      drops: {
        mat: {
          herb_chiyancao: [1, 2, 8], herb_longxiancao: [1, 1, 5],
          herb_xueling: [1, 2, 5], herb_taiyin: [1, 1, 4],
          ore_chijing: [1, 3, 9], ore_jingjin: [2, 3, 7],
          beast_yanlang_gu: [1, 2, 8],
          gem_yanxin: [1, 1, 6], gem_xinghui: [1, 1, 3],
          herb_dihuo: [1, 2, 7], herb_leiming: [1, 1, 5], herb_taiyang: [1, 1, 4],
          ore_mingtie: [1, 1, 4],
        },
        pill: { g5: [1, 1, 4] }, frag: { g5: [1, 1, 3] },
        eggChance: 0.05, recipeChance: 0.06,
      },
      sp: 'sp_fentian_huo',
      events: ['evb_fentian_01', 'evb_fentian_02', 'evb_fentian_03'],
      desc: '地火喷薄的赤色裂谷，赤晶遍地，炎狼成群，相传谷底沉睡着上古火种。',
    },
    {
      id: 'youming', name: '幽冥涧', icon: '🌑', hidden: false,
      unlock: { realmIdx: 6, layer: 1 }, power: 1.1e7, dur: [60, 180, 600],
      drops: {
        mat: {
          herb_hunyuancao: [1, 2, 7], herb_longxiancao: [1, 2, 5],
          herb_xukong: [1, 1, 5], herb_wudao: [1, 1, 4],
          ore_mingtie: [1, 3, 9], ore_chijing: [1, 2, 5],
          beast_mingdie_yi: [1, 2, 8], beast_yaodan: [1, 3, 6],
          gem_mingzhu: [1, 1, 6],
          herb_xueling: [1, 2, 7], herb_taiyin: [1, 1, 5],
          ore_xingchenjin: [1, 1, 4],
        },
        pill: { g6: [1, 1, 4] }, frag: { g6: [1, 1, 3] },
        eggChance: 0.04, recipeChance: 0.06,
      },
      sp: 'sp_youming_hua',
      events: ['evb_youming_01', 'evb_youming_02', 'evb_youming_03'],
      desc: '阴阳交界之深涧，冥蝶引路，彼岸花开，入内者需以纯阳护住心脉。',
    },
    /* ---- 隐藏地图（hiddenMaps 系统提示：炼虚1层；实际进入须满足 cond，由 expedition 判定） ---- */
    {
      id: 'guixu', name: '归墟', icon: '🌊', hidden: true,
      unlock: { realmIdx: 7, layer: 1 }, power: 6.5e7, dur: [60, 180, 600],
      cond: 'youming_exp_30',
      condText: '于幽冥涧派遣累计满三十次，且臻大乘之境；夜半潮落时，归墟路口自现。',
      drops: {
        mat: {
          herb_hunyuancao: [1, 3, 8], herb_longxiancao: [1, 2, 6],
          herb_fengxue: [1, 1, 5], herb_xuanwu: [1, 1, 4],
          ore_xingchenjin: [1, 2, 9], ore_mingtie: [1, 2, 5],
          beast_kun_yu: [1, 2, 8],
          gem_guixuyu: [1, 1, 6], gem_xinghui: [1, 2, 5],
          herb_xukong: [1, 2, 6], herb_tianxing: [1, 1, 5], herb_wudao: [1, 1, 4], herb_hundun: [1, 1, 2],
          ore_longwenjin: [1, 1, 4],
        },
        pill: { g7: [1, 1, 4] }, frag: { g7: [1, 1, 3], g8: [1, 1, 1] },
        eggChance: 0.08, recipeChance: 0.08,
      },
      sp: 'sp_guixu_bi',
      events: ['evb_guixu_01', 'evb_guixu_02', 'evb_guixu_03'],
      desc: '万水所归的无底之壑，潮起潮落间，偶有上古残器浮出水面。',
    },
    {
      id: 'longyuan', name: '龙渊', icon: '🐉', hidden: true,
      unlock: { realmIdx: 8, layer: 1 }, power: 4e8, dur: [60, 180, 600],
      cond: 'guixu_bi_5',
      condText: '集「归墟残璧」五枚，于归墟深处祭坛献祭，渡劫之境方启龙渊之门。',
      drops: {
        mat: {
          herb_hunyuancao: [2, 3, 7],
          herb_zhuguo: [1, 2, 5], herb_hundun: [1, 1, 3],
          ore_longwenjin: [1, 2, 9], ore_xingchenjin: [1, 2, 6], ore_hundunjin: [1, 1, 3],
          beast_longlin: [1, 2, 8], beast_longgu: [1, 2, 7], beast_longjiao: [1, 1, 5],
          gem_longmu: [1, 1, 5], gem_guixuyu: [1, 1, 3],
          herb_longxian: [1, 2, 6], herb_fengxue: [1, 1, 5], herb_xuanwu: [1, 1, 4],
          herb_puti: [1, 1, 3], herb_busi: [1, 1, 2],
        },
        pill: { g8: [1, 1, 4] }, frag: { g8: [1, 1, 3], g9: [1, 1, 1] },
        eggChance: 0.1, recipeChance: 0.08,
      },
      sp: 'sp_longyuan_lin',
      events: ['evb_longyuan_01', 'evb_longyuan_02', 'evb_longyuan_03'],
      desc: '真龙蛰眠之深渊，逆鳞镇守，龙纹金与龙骨俯首可拾，唯大勇气者敢入。',
    },
  ];

  /* ==================== 秘境副本 ==================== */
  const dungeons = {
    /* ---- 镇妖塔（爬塔，金丹1层开启，无尽层数） ---- */
    tower: {
      // 周词缀池：dungeon 系统以 mulberry32(weekId) 每周从中抽 3 条生效。
      // eff 键口径：foe*Pct=塔内妖邪属性加成百分数（负值=利好玩家）；rw*Pct=通关奖励加成百分数。
      affixPool: [
        { id: 'af_liren',    name: '利刃', eff: { foeAtkPct: 25 },                          desc: '塔中妖邪刃口淬毒，攻势大涨。' },
        { id: 'af_tiejia',   name: '铁甲', eff: { foeDefPct: 30 },                          desc: '妖邪披上玄铁重甲，刀枪难入。' },
        { id: 'af_xuehai',   name: '血海', eff: { foeHpPct: 40 },                           desc: '血海滔天，妖邪气血绵延不绝。' },
        { id: 'af_jifeng',   name: '疾风', eff: { foeSpdPct: 20 },                          desc: '罡风助阵，妖邪来去如电。' },
        { id: 'af_shixue',   name: '嗜血', eff: { foeAtkPct: 15, foeHpPct: 15 },            desc: '妖邪嗅到血气，愈发凶狂。' },
        { id: 'af_cuihun',   name: '摧魂', eff: { foeAtkPct: 45, foeDefPct: -10 },          desc: '摧魂魔音贯耳，敌攻极盛而守备空虚。' },
        { id: 'af_xuanming', name: '玄冥', eff: { foeDefPct: 50, foeSpdPct: -10 },          desc: '玄冥寒气护体，敌坚如磐石而行动迟缓。' },
        { id: 'af_hundun',   name: '混沌', eff: { foeAtkPct: 20, foeDefPct: 20, foeHpPct: 20, rwCultPct: 20 }, desc: '混沌之气弥漫全塔，凶险倍增，所得修为亦厚。' },
        { id: 'af_yinguo',   name: '因果', eff: { rwCultPct: 30 },                          desc: '一念因果，本周登塔所得修为大增。' },
        { id: 'af_jinyu',    name: '金玉', eff: { rwLingShiPct: 50 },                       desc: '金玉满堂，塔中灵石藏量翻涌。' },
        { id: 'af_tianji',   name: '天机', eff: { rwDropPct: 35 },                          desc: '天机一线，奇珍掉落较往日频繁。' },
        { id: 'af_lingji',   name: '灵机', eff: { rwFragPct: 40 },                          desc: '灵机一动，功法残篇更易现世。' },
        { id: 'af_ruishou',  name: '瑞兽', eff: { rwEggPct: 60 },                           desc: '瑞兽衔蛋而过，灵宠蛋缘法大增。' },
        { id: 'af_qingping', name: '清平', eff: { foeAtkPct: -10, foeDefPct: -10 },         desc: '清气上升，妖邪蛰伏，本周登塔顺遂。' },
      ],
      // 隐藏 BOSS：每 33 层（33/66/99…）现身，战力 = 当层基准 × powerMul，按轮次循环 bosses 名单。
      hiddenBossEvery: 33,
      hiddenBoss: {
        powerMul: 2.5,
        bosses: [
          { id: 'tb_xuangui',  name: '玄甲冥龟', icon: '🐢', desc: '镇塔四灵之一，背负玄甲，万年不动如山。' },
          { id: 'tb_luosha',   name: '赤发罗刹', icon: '👹', desc: '赤发覆面，食人魂魄，塔底冤魂奉其为主。' },
          { id: 'tb_gulong',   name: '九幽骨龙', icon: '🐉', desc: '陨落古龙之骸为煞气所驱，骨翼蔽日。' },
          { id: 'tb_jianling', name: '无量剑灵', icon: '⚔️', desc: '上古剑仙一缕剑意所化，出剑则无量生、无量灭。' },
        ],
        // 击杀奖励（注释，由 dungeon 实现）：灵玉 = 20 + 5×轮次；必掉装备 grade = min(2+轮次, 5)；
        // 功法残篇 g(min(3+轮次, 9))×2；另赠宝石箱（gem_* 随机 2~4 件，品阶随轮次提升）。
        rewardsNote: '灵玉=20+5*轮次；必掉装备 grade=min(2+轮次,5)；残篇 g(min(3+轮次,9))x2；gem 随机 2~4 件',
      },
      // 塔层奖励公式（注释，由 dungeon 实现）：
      //   第 N 层基准战力 ≈ 5e3 × N^1.35（金丹一层可战，约 200 层抵合体，400 层后非大乘莫入）；
      //   通关灵石 = 100 × N^1.5；通关修为 = 当前境界 rate × (60 + 12×N) 秒等值；
      //   装备掉率逐层提升，每 10 层保底一件，grade = min(1 + ⌊N/20⌋, 5)；
      //   材料 = ore_*/gem_* 随机 1~3 种，每种 [1, 2+⌊N/15⌋] 件，品阶随层数解锁；
      //   扫荡（每日免费 3 次，其后灵玉 5/次）按历史最高层奖励 ×0.6 折算。
      rewardsNote: '战力=5e3*N^1.35；灵石=100*N^1.5；修为=rate*(60+12N)秒；装备每10层保底 grade=min(1+N/20取整,5)；材料1~3种×[1,2+N/15取整]；扫荡=最高层奖励x0.6',
    },

    /* ---- 守关（化神1层开启，波次生存；每档战力校验，失败不计进度，首通全额、复刷 1/3） ---- */
    guard: {
      note: '化神1层开启；逐档迎击兽潮，战力达标方可挑战；第 5/10/15 档追加灵玉、残篇等厚赏。',
      waves: [
        { n: 1,  name: '游魂散卒', icon: '👻', power: 2e5,   reward: { lingShi: 5e3,   mat: { beast_huya: [1, 2, 8] } },        desc: '山外阴风骤起，零星游魂循阳气而来。' },
        { n: 2,  name: '山魈成群', icon: '🙈', power: 3e5,   reward: { lingShi: 2e4,   mat: { ore_heite: [1, 2, 8] } },         desc: '山魈结队叩关，尖啸声震林樾。' },
        { n: 3,  name: '狼烟四起', icon: '🐺', power: 4.5e5, reward: { lingShi: 4.5e4, mat: { beast_shelin: [1, 2, 8] } },      desc: '青狼衔枚疾走，四野狼烟同时燃起。' },
        { n: 4,  name: '蟒潮翻涌', icon: '🐍', power: 7e5,   reward: { lingShi: 8e4,   mat: { gem_biyu: [1, 1, 6] } },         desc: '青蟒如潮漫过关墙，腥风扑面。' },
        { n: 5,  name: '百兽夜行', icon: '🌙', power: 1.1e6, reward: { lingShi: 1.25e5, lingYu: 10, mat: { beast_xiongdan: [1, 2, 8] } }, desc: '月黑风高，百兽倾巢，此乃第一重死关。' },
        { n: 6,  name: '血鸦蔽日', icon: '🦅', power: 1.7e6, reward: { lingShi: 1.8e5, mat: { ore_miyin: [1, 2, 8] } },        desc: '血鸦万点遮蔽天日，啄人双目。' },
        { n: 7,  name: '尸傀列阵', icon: '🧟', power: 2.6e6, reward: { lingShi: 2.6e5, mat: { beast_yaodan: [1, 2, 8] } },     desc: '魔修驱尸为傀，列阵而进，刀枪不惧。' },
        { n: 8,  name: '蛟影裂空', icon: '🌊', power: 4e6,   reward: { lingShi: 3.6e5, mat: { beast_jiaowei: [1, 2, 8] } },    desc: '恶蛟破空而至，尾扫之处关墙倾颓。' },
        { n: 9,  name: '魔修结队', icon: '🥷', power: 6e6,   reward: { lingShi: 5e5,   mat: { gem_xuepo: [1, 1, 6] } },        desc: '黑袍魔修联袂而来，所过之处寸草不生。' },
        { n: 10, name: '千妖压境', icon: '🏔️', power: 9e6,   reward: { lingShi: 6.5e5, lingYu: 20, frag: { g4: [1, 1, 1] } },  desc: '千妖压境，黑云摧关，此乃第二重死关。' },
        { n: 11, name: '罗刹巡山', icon: '👹', power: 1.4e7, reward: { lingShi: 8.5e5, mat: { ore_hantie: [1, 2, 8] } },       desc: '罗刹踏夜巡山，生人魂魄为其所摄。' },
        { n: 12, name: '冥凤唳天', icon: '🔥', power: 2.2e7, reward: { lingShi: 1.1e6, mat: { gem_yanxin: [1, 1, 6] } },       desc: '冥凤一声长唳，九泉之火燎尽长空。' },
        { n: 13, name: '骨龙苏醒', icon: '🐉', power: 3.4e7, reward: { lingShi: 1.4e6, mat: { beast_yanlang_gu: [1, 2, 8] } }, desc: '地底骨龙睁目，万骸随之而起。' },
        { n: 14, name: '九幽门开', icon: '🚪', power: 5.2e7, reward: { lingShi: 1.8e6, mat: { gem_mingzhu: [1, 1, 6] } },      desc: '九幽之门轰然中开，阴煞如潮倒灌人间。' },
        { n: 15, name: '混沌魔尊', icon: '👿', power: 8e7,   reward: { lingShi: 2.4e6, lingYu: 40, frag: { g5: [1, 1, 1] }, egg: 1 }, desc: '混沌魔尊亲率群魔叩关，守得此关，当世可称一流。' },
      ],
    },

    /* ---- 限时寻宝（炼虚1层开启，300 秒探宝） ---- */
    hunt: {
      dur: 300,
      note: '炼虚1层开启；300 秒内上古遗府中刷新宝箱（每 4~8 秒一只，场上至多 4 只），点击或自动寻取；每日免费 1 次，其后灵玉 10/次；按 pools 权重抽取箱品。',
      pools: [
        { id: 'hu_muxia',    name: '青木匣',   icon: '🪵', w: 50, loot: { lingShi: [2e3, 5e3],    mat: { herb_xuelian: [1, 2, 6], ore_hantie: [1, 2, 6], gem_hanyu: [1, 1, 3] } } },
        { id: 'hu_tonghan',  name: '青铜函',   icon: '🥉', w: 28, loot: { lingShi: [5e3, 1.2e4],  mat: { ore_chijing: [1, 2, 6], gem_yanxin: [1, 1, 4] }, pill: { g4: [1, 1, 3] } } },
        { id: 'hu_yinxia',   name: '白银匣',   icon: '🥈', w: 14, loot: { lingShi: [1e4, 2.5e4],  lingYu: [2, 5], mat: { ore_mingtie: [1, 2, 6], gem_mingzhu: [1, 1, 4] }, frag: { g5: [1, 1, 2] } } },
        { id: 'hu_jinxia',   name: '紫金匣',   icon: '🥇', w: 6,  loot: { lingShi: [2e4, 5e4],    lingYu: [5, 10], mat: { ore_xingchenjin: [1, 2, 6], gem_guixuyu: [1, 1, 4], beast_kun_yu: [1, 2, 4] }, pill: { g6: [1, 1, 2] }, eggChance: 0.15 } },
        { id: 'hu_guixuhan', name: '归墟宝函', icon: '🎁', w: 2,  loot: { lingShi: [5e4, 1e5],    lingYu: [10, 20], mat: { ore_longwenjin: [1, 2, 6], gem_longmu: [1, 1, 4], beast_longlin: [1, 2, 4] }, frag: { g7: [1, 1, 2] }, eggChance: 0.3 } },
      ],
    },
  };

  /* ==================== 坊市规则（筑基5层开启） ==================== */
  const marketRules = {
    refreshSec: 600, // 每 600 秒（10 分钟）自动刷新；耗灵玉 5 可立即刷新
    slots: 6,         // 6 栏货位
    note: '每栏由在售道友（fellows 系统取其冗余背包物）挂售生成；先按 kindW 抽品类，再按玩家当前境界 ±1 品阶抽具体货。'
        + '售价 = 基准价 × priceByPersona[卖家性格] × priceByRelation[与卖家关系]；回收价 = 基准价 × 0.4。'
        + '同一货品每日限购 3 件；若卖家为「欧皇」，其货栏有小概率刷出超一阶的货（售价不变）——此乃坊市传闻，信不信由你。',
    // 性格价格倍率（奸商 ×1.3，话痨好侃价 ×1.15，咸鱼懒得多要 ×0.9……）
    priceByPersona: {
      rexin: 0.95, gaoleng: 1.1, aojiao: 1.05, jianshang: 1.3, juanwang: 1.0,
      xianyu: 0.9, ouhuang: 1.0, hualao: 1.15, chenwen: 1.0, fuhei: 1.2,
    },
    // 关系价格折让（挚友八折、道侣七五折、宿敌加价两成）
    priceByRelation: { stranger: 1.0, friend: 0.8, rival: 1.2, partner: 0.75 },
    stock: {
      kindW: { pill: 30, mat: 30, equip: 20, frag: 15, egg: 5, recipe: 8 }, // 品类抽取权重：丹药/材料/装备/残篇/灵宠蛋/丹方
      // 基准价（灵石；售价在此基础上乘性格与关系倍率）
      basePrice: {
        matG0: 50, matG1: 300, matG2: 2e3, matG3: 1.5e4, matG4: 1e5, // 材料按 grade
        pillPerGrade: 200,   // 成品丹 = 200 × 品阶
        equipPerGrade: 800,  // 装备 = 800 × 品阶
        fragPerGrade: 1500,  // 功法残篇 = 1500 × 品阶
        egg: 3e4,            // 灵宠蛋统一基准价
      },
      currencyW: { lingShi: 8, lingYu: 2 }, // 标价货币权重：约两成货品以灵玉标价
    },
  };

  /* ==================== 登记 ==================== */
  XG.data.world = { maps: maps, dungeons: dungeons, marketRules: marketRules };
})();
