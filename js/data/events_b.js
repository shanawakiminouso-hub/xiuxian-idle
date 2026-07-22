/* 文件名：events_b.js —— 奇遇事件池 B：8 张历练地图专属事件 / 隐藏连锁 / 彩蛋 */
/*
 * 口径说明（与其他 data 文件并行开发，联调时以此对齐）：
 * 1. 地图 id 一律以 world.js 为准：qingyun 青云山 / cangwu 苍梧之野 / wanyao 万妖岭 /
 *    beihai 北海冰原 / fentian 焚天谷 / youming 幽冥涧 / guixu 归墟(隐藏) / longyuan 龙渊(隐藏)。
 *    各地图专属事件按 world.js 预留位落地：evb_<mapId>_01~03（连锁续章追加 _04）。
 * 2. 材料 id 一律用契约 §6 命名空间并以 world.js 登记为准：地图特产
 *    sp_qingyun_tea / sp_cangwu_wood / sp_yaoling_guo / sp_beihai_sui /
 *    sp_fentian_huo / sp_youming_hua / sp_guixu_bi / sp_longyuan_lin；
 *    灵草 herb_lingzhi；矿石 ore_xuantie/ore_hantie/ore_chijing；宝石 gem_mingzhu/gem_xinghui；
 *    妖兽材料 beast_yaodan/beast_gu/beast_longlin。
 * 3. 功法残篇 frag 的 key 即功法 id（gf_*，由 data/gongfa.js 登记）：gf_wanjian /
 *    gf_xuanbing / gf_longxiang / gf_cangling / gf_xuanyuan / gf_guixu / gf_qingxin。
 *    其中 gf_xuanyuan / gf_guixu 为连锁终点奖励的隐藏功法（gongfa.js 已补登）。
 * 4. 数值口径：cult ≈ XG.cfg.REALMS[minRealm].rate × 600(小)/1500(常)/3600(丰)/7200(极)；
 *    灵石 ≈ rate × 30~120；灵玉少量（1~80，隐藏连锁终点最多）。连锁终点约为单事件 2~3 倍。
 * 5. 连锁 4 组：evb_youming_03→evb_youming_04；evb_xuanyuan_1→2→3；evb_longyuan_1→2→3；
 *    evb_gui_xu_1→2→3。其中轩辕/龙渊/归墟三组起点供 eva_* 的 out.chain 回指。
 *    w:0 表示不进入随机池，只能由连锁触发。
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.data = XG.data || {};
  const E = (XG.data.events = XG.data.events || []);

  E.push(
    // ==================== 青云山（炼气，rate 10） ====================
    {
      id: 'evb_qingyun_01', title: '山涧灵泉', icon: '💧', w: 12, once: false, hidden: false,
      trigger: 'explore', mapId: 'qingyun', minRealm: 0,
      text: '云雾深处忽闻泠泠水声，一泓灵泉自石罅涌出，泉底隐有灵光流转。',
      choices: [
        { text: '掬泉而饮', out: { cult: 1.5e4, news: '你于青云山饮得灵泉，修为精进不少。' } },
        { text: '汲泉售卖', out: { lingShi: 800 } },
        { text: '灌入玉瓶珍藏', out: { mat: { sp_qingyun_tea: 2 } } },
      ],
    },
    {
      id: 'evb_qingyun_02', title: '崖壁剑痕', icon: '🪨', w: 10, once: false, hidden: false,
      trigger: 'explore', mapId: 'qingyun', minRealm: 0,
      text: '绝崖之上剑痕纵横，深浅不一，似前辈高人试剑所留，至今剑意未散。',
      choices: [
        { text: '面壁参悟', out: { cult: 3.6e4 } },
        { text: '拓印剑痕', out: { cult: 6e3, frag: { gf_wanjian: 1 } } },
        { text: '焚香遥拜', out: { cult: 6e3, news: '你遥拜前辈剑痕，心中剑道渐明。' } },
      ],
    },
    {
      id: 'evb_qingyun_03', title: '樵夫指路', icon: '🪓', w: 10, once: false, hidden: false,
      trigger: 'explore', mapId: 'qingyun', minRealm: 0,
      text: '一老樵负薪而下，笑问你可是来寻仙缘的，抬手指向云雾深处一条小径。',
      choices: [
        { text: '赠以干粮谢之（-200灵石）', req: { lingShi: 200 }, out: { cult: 3.6e4, news: '一饭之恩，老樵指点你寻得一处灵穴。' } },
        { text: '谢过自行探寻', out: { cult: 1.5e4 } },
      ],
    },
    // ==================== 苍梧之野（筑基，rate 40） ====================
    {
      id: 'evb_cangwu_01', title: '荒祠野祭', icon: '⛩️', w: 12, once: false, hidden: false,
      trigger: 'explore', mapId: 'cangwu', minRealm: 1,
      text: '野草丛中露出一角残祠，神像金身剥落，案上却供着一盏未干的清酒。',
      choices: [
        { text: '整衣上香（-500灵石）', req: { lingShi: 500 }, out: { cult: 6e4, news: '你重修荒祠香火，夜有神人入梦致谢。' } },
        { text: '四下搜寻', out: { lingShi: 1.5e3, mat: { beast_gu: 2 } } },
        { text: '绕道而行', out: { cult: 1.2e4 } },
      ],
    },
    {
      id: 'evb_cangwu_02', title: '狼群夜嚎', icon: '🐺', w: 10, once: false, hidden: false,
      trigger: 'explore', mapId: 'cangwu', minRealm: 1,
      text: '月落星沉，苍梧深处狼嚎四起，一双双幽绿的眼自暗处围拢而来。',
      choices: [
        { text: '仗剑迎战', out: { cult: 1.44e5, mat: { beast_yaodan: 1 } } },
        { text: '点火退避', out: { cult: 2.4e4 } },
      ],
    },
    {
      id: 'evb_cangwu_03', title: '瘴谷幽兰', icon: '🌫️', w: 8, once: false, hidden: false,
      trigger: 'explore', mapId: 'cangwu', minRealm: 1,
      text: '深谷瘴气弥漫，隐约可见谷底一株幽兰吐蕊，异香穿透毒瘴，久久不散。',
      choices: [
        { text: '以灵力护体强闯', req: { realmIdx: 1 }, out: { cult: 1.44e5, toxicity: 10 } },
        { text: '循隙采得幽兰', out: { cult: 2.4e4, mat: { sp_cangwu_wood: 2 } } },
        { text: '不入险地', out: { cult: 1.2e4 } },
      ],
    },
    // ==================== 万妖岭（金丹，rate 160） ====================
    {
      id: 'evb_wanyao_01', title: '魔修截道', icon: '🗡️', w: 12, once: false, hidden: false,
      trigger: 'explore', mapId: 'wanyao', minRealm: 2,
      text: '岭口阴风大作，一名魔修持幡拦路，狞笑道：「此山是我开，留下买路财。」',
      choices: [
        { text: '破财消灾（-2万灵石）', req: { lingShi: 2e4 }, out: { cult: 9.6e4, news: '你重金买路，魔修竟对你拱手，自认同道。' } },
        { text: '拔剑相向', out: { cult: 5.76e5, mat: { beast_yaodan: 1 } } },
        { text: '转身就走', out: { cult: 4.8e4 } },
      ],
    },
    {
      id: 'evb_wanyao_02', title: '白骨祭坛', icon: '💀', w: 9, once: false, hidden: false,
      trigger: 'explore', mapId: 'wanyao', minRealm: 2,
      text: '岭底白骨垒垒，砌成一座六角祭坛，坛心供奉一枚漆黑魔珠，幽光吞吐。',
      choices: [
        { text: '击碎魔珠', out: { cult: 5.76e5, toxicity: 15, news: '你毁去妖岭祭坛，方圆百里阴气为之一清。' } },
        { text: '取珠而去', req: { realmIdx: 3 }, out: { cult: 2.4e5, toxicity: 20, mat: { sp_yaoling_guo: 1 } } },
        { text: '悄然退走', out: { cult: 4.8e4 } },
      ],
    },
    {
      id: 'evb_wanyao_03', title: '岭底魔泉', icon: '🌑', w: 8, once: false, hidden: false,
      trigger: 'explore', mapId: 'wanyao', minRealm: 2,
      text: '一泓黑泉汩汩作响，泉水阴寒刺骨，却蕴含极为精纯的魔性灵机。',
      choices: [
        { text: '忍痛饮泉', out: { cult: 1.15e6, toxicity: 25 } },
        { text: '取水封存', out: { mat: { sp_yaoling_guo: 2 } } },
        { text: '以符封泉', out: { cult: 2.4e5, news: '你封住魔泉，路过散修纷纷称颂。' } },
      ],
    },
    // ==================== 北海冰原（元婴，rate 700） ====================
    {
      id: 'evb_beihai_01', title: '冰下故人', icon: '🧊', w: 10, once: false, hidden: false,
      trigger: 'explore', mapId: 'beihai', minRealm: 3,
      text: '万丈玄冰之下封着一具道袍古尸，面目如生，掌心紧攥一枚温润玉简。',
      choices: [
        { text: '破冰取简', req: { realmIdx: 3 }, out: { cult: 1.05e6, frag: { gf_xuanbing: 1 } } },
        { text: '恭谨一拜', out: { cult: 2.52e6, news: '你向冰中古修一拜，冥冥中似有剑意入体。' } },
        { text: '不扰长眠', out: { cult: 2.1e5 } },
      ],
    },
    {
      id: 'evb_beihai_02', title: '雪魄莲开', icon: '❄️', w: 9, once: false, hidden: false,
      trigger: 'explore', mapId: 'beihai', minRealm: 3,
      text: '风雪骤歇，冰崖之巅一株雪莲迎着微光缓缓绽放，幽香清冷，沁人心脾。',
      choices: [
        { text: '小心采莲', out: { cult: 4.2e5, mat: { sp_beihai_sui: 2 } } },
        { text: '守莲悟道', out: { cult: 2.52e6 } },
      ],
    },
    {
      id: 'evb_beihai_03', title: '寒渊裂隙', icon: '🌨️', w: 8, once: false, hidden: false,
      trigger: 'explore', mapId: 'beihai', minRealm: 3,
      text: '冰原忽然开裂，露出一道深不见底的寒渊，渊底隐约有蓝光明灭。',
      choices: [
        { text: '垂索下探', req: { realmIdx: 4 }, out: { cult: 1.05e6, mat: { ore_hantie: 2 } } },
        { text: '投石问路', out: { cult: 4.2e5 } },
        { text: '绕渊而行', out: { cult: 2.1e5 } },
      ],
    },
    // ==================== 焚天谷（化神，rate 3e3） ====================
    {
      id: 'evb_fentian_01', title: '地火喷涌', icon: '🔥', w: 11, once: false, hidden: false,
      trigger: 'explore', mapId: 'fentian', minRealm: 4,
      text: '谷中泥沼忽沸，一道地火冲天而起，火舌所过之处，碎石尽成赤晶。',
      choices: [
        { text: '冒险拾晶', out: { cult: 1.8e6, mat: { ore_chijing: 2 } } },
        { text: '借火炼体', out: { cult: 1.08e7 } },
        { text: '远观避祸', out: { cult: 9e5 } },
      ],
    },
    {
      id: 'evb_fentian_02', title: '火鸦巢穴', icon: '🦅', w: 9, once: false, hidden: false,
      trigger: 'explore', mapId: 'fentian', minRealm: 4,
      text: '赤岩之上筑着一座火鸦巨巢，巢中雏鸦未醒，羽间簇簇火苗明灭不定。',
      choices: [
        { text: '取一枚火羽', out: { cult: 1.8e6, mat: { sp_fentian_huo: 2 } } },
        { text: '捣巢取卵', out: { cult: 9e5, egg: 1, news: '你自火鸦巢中窃得一卵，鸦群追袭三百里。' } },
        { text: '悄悄离开', out: { cult: 9e5 } },
      ],
    },
    {
      id: 'evb_fentian_03', title: '熔岩锻骨', icon: '♨️', w: 8, once: false, hidden: false,
      trigger: 'explore', mapId: 'fentian', minRealm: 4,
      text: '熔岩湖畔热浪灼人，湖畔赤石被地火煅烧千年，蕴含火行精粹。',
      choices: [
        { text: '赤足踏石锻骨', req: { realmIdx: 4 }, out: { cult: 2.16e7, toxicity: 10 } },
        { text: '拾取火精石', out: { mat: { ore_chijing: 1, sp_fentian_huo: 1 } } },
        { text: '湖边调息', out: { cult: 1.8e6 } },
      ],
    },
    // ==================== 幽冥涧（炼虚，rate 1.3e4） ====================
    {
      id: 'evb_youming_01', title: '鬼火引路', icon: '👻', w: 11, once: false, hidden: false,
      trigger: 'explore', mapId: 'youming', minRealm: 5,
      text: '涧雾深处飘来几点幽绿鬼火，绕你三匝，竟似引路一般向深处飘去。',
      choices: [
        { text: '随火而行', out: { cult: 4.68e7 } },
        { text: '以剑驱火', out: { cult: 1.95e7 } },
        { text: '驻足不动', out: { cult: 3.9e6 } },
      ],
    },
    {
      id: 'evb_youming_02', title: '沉船遗宝', icon: '⚓', w: 9, once: false, hidden: false,
      trigger: 'explore', mapId: 'youming', minRealm: 5,
      text: '浅滩之下沉着一艘前朝楼船，舱中箱笼完好，封条上朱印依稀可辨。',
      choices: [
        { text: '开箱取宝', out: { lingShi: 1e6, mat: { gem_mingzhu: 1 } } },
        { text: '只取金银', out: { lingShi: 1.5e6 } },
        { text: '焚香祭亡魂', out: { cult: 1.95e7, news: '你祭奠沉船亡魂，夜半闻涧中有人道谢。' } },
      ],
    },
    {
      id: 'evb_youming_03', title: '鲛人泣珠', icon: '🧜', w: 7, once: true, hidden: false,
      trigger: 'explore', mapId: 'youming', minRealm: 5,
      text: '月出东海，礁石上坐着一名鲛人，对月垂泪，泪落盘中，颗颗皆成明珠。',
      choices: [
        { text: '上前慰之', out: { cult: 7.8e6, chain: 'evb_youming_04' } },
        { text: '夺珠而走', out: { cult: 3.9e6, mat: { gem_mingzhu: 2 }, news: '你夺鲛人珠，涧中三日风浪不止。' } },
      ],
    },
    {
      id: 'evb_youming_04', title: '鲛绡之赠', icon: '🌊', w: 0, once: true, hidden: false,
      trigger: 'explore', mapId: 'youming', minRealm: 5,
      text: '鲛人止泪而笑，赠你一匹鲛绡：「此物入水不濡，赠予善心人。」言毕没入水中。',
      choices: [
        { text: '拜谢收下', out: { cult: 1.95e7, lingYu: 5, mat: { sp_youming_hua: 2 } } },
      ],
    },
    // ==================== 龙渊（隐藏图，合体，rate 6e4） ====================
    {
      id: 'evb_longyuan_01', title: '渊底龙吟', icon: '🐉', w: 10, once: false, hidden: false,
      trigger: 'explore', mapId: 'longyuan', minRealm: 6,
      text: '渊水漆黑如墨，深处传来一声悠长龙吟，整片水面随之荡起金色涟漪。',
      choices: [
        { text: '临渊吐纳', out: { cult: 2.16e8 } },
        { text: '投玉祭渊（-200万灵石）', req: { lingShi: 2e6 }, out: { cult: 9e7, mat: { sp_longyuan_lin: 2 } } },
        { text: '不敢久留', out: { cult: 1.8e7 } },
      ],
    },
    {
      id: 'evb_longyuan_02', title: '龙宫残殿', icon: '🏯', w: 8, once: false, hidden: false,
      trigger: 'explore', mapId: 'longyuan', minRealm: 6,
      text: '渊底沉着半截水晶宫阙，梁柱上龙纹犹存，殿中宝光虽黯，余威尚在。',
      choices: [
        { text: '入殿搜寻', out: { lingShi: 7e6, mat: { beast_longlin: 1 } } },
        { text: '对殿而拜', out: { cult: 9e7, news: '你拜谒龙宫残殿，渊底龙吟似柔和了几分。' } },
      ],
    },
    {
      id: 'evb_longyuan_03', title: '逆鳞之触', icon: '🐲', w: 6, once: false, hidden: false,
      trigger: 'explore', mapId: 'longyuan', minRealm: 6,
      text: '一块丈许长的逆鳞斜插在渊底礁石间，鳞面寒光凛冽，触之指尖发麻。',
      choices: [
        { text: '全力拔鳞', req: { realmIdx: 7 }, out: { cult: 2.16e8, mat: { beast_longlin: 2 } } },
        { text: '拓下鳞纹', out: { cult: 3.6e7, frag: { gf_longxiang: 1 } } },
        { text: '敬而远之', out: { cult: 1.8e7 } },
      ],
    },
    // ==================== 归墟（隐藏图，大乘，rate 2.5e5） ====================
    {
      id: 'evb_guixu_01', title: '墟海归流', icon: '🌊', w: 10, once: false, hidden: false,
      trigger: 'explore', mapId: 'guixu', minRealm: 7,
      text: '万水至此皆归墟，巨大的海眼缓缓旋动，将漫天星辉一并卷入其中。',
      choices: [
        { text: '临流悟道', out: { cult: 9e8 } },
        { text: '取水一瓢', out: { cult: 1.5e8, mat: { sp_guixu_bi: 2 } } },
      ],
    },
    {
      id: 'evb_guixu_02', title: '上古舰骸', icon: '⛵', w: 8, once: false, hidden: false,
      trigger: 'explore', mapId: 'guixu', minRealm: 7,
      text: '海眼边缘搁浅着一艘上古巨舰，舰身非金非木，符文斑驳，不知来自何世。',
      choices: [
        { text: '登舰探秘', req: { realmIdx: 8 }, out: { cult: 3.75e8, mat: { gem_xinghui: 1 } } },
        { text: '抄录符文', out: { cult: 1.5e8, frag: { gf_cangling: 1 } } },
        { text: '不敢靠近', out: { cult: 7.5e7 } },
      ],
    },
    {
      id: 'evb_guixu_03', title: '无底之谷', icon: '🕳️', w: 6, once: false, hidden: false,
      trigger: 'explore', mapId: 'guixu', minRealm: 7,
      text: '一道深谷横亘海底，向下望去不见其底，只有幽微蓝光自无尽深处浮起。',
      choices: [
        { text: '纵身下潜', req: { realmIdx: 8 }, out: { cult: 1.8e9, news: '你下潜归墟深谷万丈，神识几近枯竭，归来时已非吴下阿蒙。' } },
        { text: '投石测深', out: { cult: 1.5e8, news: '你投石入归墟深谷，三年之后仍无闻其底。' } },
        { text: '临渊而立', out: { cult: 7.5e7 } },
      ],
    },
    // ==================== 隐藏连锁 · 轩辕剑冢（化神起，eva_* 可回指） ====================
    {
      id: 'evb_xuanyuan_1', title: '剑冢现世', icon: '⚔️', w: 2, once: true, hidden: true,
      trigger: 'any', minRealm: 4,
      text: '是夜，北斗倒悬，万里剑鸣。你循剑气而行，见一处古冢破土而出，冢前石碑上刻着「轩辕」二字。',
      choices: [
        { text: '整衣入冢', out: { chain: 'evb_xuanyuan_2' } },
        { text: '不敢擅入', out: { cult: 4.5e6, news: '你夜遇剑冢而不入，同道皆叹你失之交臂。' } },
      ],
    },
    {
      id: 'evb_xuanyuan_2', title: '万剑朝宗', icon: '🗡️', w: 0, once: true, hidden: true,
      trigger: 'any', minRealm: 4,
      text: '冢中万剑悬空，剑尖齐齐指向你，剑鸣如潮，似在考校你的剑心与境界。',
      choices: [
        { text: '以剑心相应', req: { realmIdx: 4 }, out: { chain: 'evb_xuanyuan_3' } },
        { text: '强行取剑', out: { cult: 1.8e6, news: '你强取冢中古剑，万剑齐鸣，你被剑气震退百里。' } },
        { text: '躬身退出', out: { cult: 4.5e6 } },
      ],
    },
    {
      id: 'evb_xuanyuan_3', title: '轩辕一剑', icon: '👑', w: 0, once: true, hidden: true,
      trigger: 'any', minRealm: 4,
      text: '万剑忽然分开，一柄古朴长剑自虚空浮现，剑身一面刻日月星辰，一面刻山川草木。',
      choices: [
        { text: '执剑而立', out: { cult: 2.16e7, lingYu: 60, frag: { gf_xuanyuan: 2 }, hiddenEnd: '你执轩辕剑而立，万剑齐俯首。此剑不属尘世，只留下一缕剑意与剑诀残篇，伴你踏上登仙之途。' } },
        { text: '拜剑而去', out: { cult: 1.08e7, lingYu: 20, news: '你拜别轩辕剑冢，剑气入体，修为大涨。' } },
      ],
    },
    // ==================== 隐藏连锁 · 龙渊（炼虚起，eva_* 可回指） ====================
    {
      id: 'evb_longyuan_1', title: '龙吟于渊', icon: '🐉', w: 2, once: true, hidden: true,
      trigger: 'any', minRealm: 5,
      text: '夜半忽闻龙吟，声自九地之下传来。你循声而往，见一处深渊雾气蒸腾，隐有龙影游动。',
      choices: [
        { text: '沿渊而下', out: { chain: 'evb_longyuan_2' } },
        { text: '临渊观望', out: { cult: 1.95e7 } },
      ],
    },
    {
      id: 'evb_longyuan_2', title: '骊珠之托', icon: '🔮', w: 0, once: true, hidden: true,
      trigger: 'any', minRealm: 5,
      text: '渊底游来一条苍老应龙，口吐人言：「吾寿将尽，颔下骊珠无处可托，愿赠有缘之人。」',
      choices: [
        { text: '跪接骊珠', out: { chain: 'evb_longyuan_3' } },
        { text: '婉言谢绝', out: { cult: 4.68e7, news: '你谢绝应龙赠珠，龙目之中流露赞许之色。' } },
      ],
    },
    {
      id: 'evb_longyuan_3', title: '龙血淬体', icon: '🩸', w: 0, once: true, hidden: true,
      trigger: 'any', minRealm: 5,
      text: '应龙引你入龙穴，以残存龙血为你淬体。霎时金光大盛，你的经脉如江河重开。',
      choices: [
        { text: '受淬谢恩', out: { cult: 9.36e7, lingYu: 40, egg: 1, hiddenEnd: '龙血淬体之后，你举手投足皆有龙威。应龙含笑而逝，只留下一枚龙蛋，待你有缘孵化。' } },
        { text: '功成拜别', out: { cult: 4.68e7, mat: { beast_longlin: 1 }, news: '你自龙渊归来，周身隐有龙气缭绕。' } },
      ],
    },
    // ==================== 隐藏连锁 · 归墟（大乘起，eva_* 可回指） ====================
    {
      id: 'evb_gui_xu_1', title: '海眼吞星', icon: '🌌', w: 2, once: true, hidden: true,
      trigger: 'any', minRealm: 7,
      text: '你在海上夜行，忽见天穹裂开一线，群星之水倾泻入海。万流归宗之处，便是传说中的归墟。',
      choices: [
        { text: '驾舟入海眼', out: { chain: 'evb_gui_xu_2' } },
        { text: '望洋兴叹', out: { cult: 3.75e8 } },
      ],
    },
    {
      id: 'evb_gui_xu_2', title: '墟中老人', icon: '🧓', w: 0, once: true, hidden: true,
      trigger: 'any', minRealm: 7,
      text: '归墟深处竟有一片不沉之地，一位麻衣老人独坐垂钓，钓线垂入无光之渊，笑问：「客从何处来？」',
      choices: [
        { text: '与老人对坐论道', out: { chain: 'evb_gui_xu_3' } },
        { text: '问其姓名来历', out: { cult: 9e8, news: '老人笑而不答，只道：墟中人，墟外事，一问便错。' } },
        { text: '不敢打扰', out: { cult: 3.75e8 } },
      ],
    },
    {
      id: 'evb_gui_xu_3', title: '归墟之眼', icon: '👁️', w: 0, once: true, hidden: true,
      trigger: 'any', minRealm: 7,
      text: '老人收竿而起，引你至海眼正中：「世间万水，皆归于此；世间万法，亦复如是。」你俯瞰墟眼，忽然了悟。',
      choices: [
        { text: '顿悟而拜', out: { cult: 1.8e9, lingYu: 80, frag: { gf_guixu: 2 }, hiddenEnd: '你在归墟之眼了悟万法归一。再回首时，老人与钓石俱已不见，唯有一部残诀静静躺在掌心。' } },
        { text: '默然记取', out: { cult: 9e8, lingYu: 30 } },
      ],
    },
    // ==================== 彩蛋 ====================
    {
      id: 'evb_saodiweng_1', title: '扫地老翁', icon: '🧹', w: 2, once: true, hidden: true,
      trigger: 'any', minRealm: 1,
      text: '山门前一位老翁执帚扫地，眉眼竟与你记忆深处的故人一般无二。他抬眼一笑：「来了？地扫完了，心可扫净了？」',
      choices: [
        { text: '上前攀谈', out: { cult: 6e4, lingYu: 5, news: '老翁与你谈玄半日，临别只说了一句：好好修行。' } },
        { text: '递上灵石孝敬（-5000灵石）', req: { lingShi: 5000 }, out: { cult: 1.44e5, news: '老翁坚辞不受，反赠你一句口诀，细品之下竟是上古道音。' } },
        { text: '默默离开', out: { cult: 1.2e4, news: '你走出很远再回首，山门前空无一人，落叶堆积如初。' } },
      ],
    },
    {
      id: 'evb_swordtalk_1', title: '剑语铮铮', icon: '⚔️', w: 2, once: true, hidden: true,
      trigger: 'explore', minRealm: 2,
      text: '乱石堆里斜插一柄锈剑，你刚走近，剑身忽作人声：「三百年了，总算来了个会喘气的。」',
      choices: [
        { text: '与之论剑', out: { cult: 2.4e5, news: '锈剑与你论剑一夜，临别嘟囔：这小子，比上一任主人顺眼。' } },
        { text: '问其来历', out: { cult: 9.6e4, frag: { gf_wanjian: 1 }, news: '锈剑自述乃古剑派镇派之剑，剑派已亡，唯它不肯锈蚀剑心。' } },
        { text: '将其拔出带走', req: { realmIdx: 4 }, out: { cult: 2.4e5, lingYu: 15, news: '锈剑跟你走了，一路唠叨个没完。' } },
      ],
    },
    {
      id: 'evb_lanke_1', title: '烂柯棋局', icon: '♟️', w: 2, once: true, hidden: true,
      trigger: 'explore', minRealm: 3,
      text: '深山松下，两位老者对弈不语，棋盘上星罗棋布，隐合周天。你驻足观棋，不觉日影西斜。',
      choices: [
        { text: '观棋至终局', out: { cult: 2.52e6, news: '你看完一局棋，回山方知已过三日，斧柯尽烂。' } },
        { text: '上前请教一招', out: { cult: 1.05e6, lingYu: 5 } },
        { text: '不敢打扰', out: { cult: 2.1e5 } },
      ],
    },
    // ==================== 通用历练补池 ====================
    {
      id: 'evb_gudong_1', title: '古洞遗府', icon: '⛰️', w: 9, once: false, hidden: false,
      trigger: 'explore', minRealm: 1,
      text: '藤蔓之后露出一方古洞，石门半掩，门楣上「遗府」二字已被岁月磨平。',
      choices: [
        { text: '推门而入', out: { cult: 6e4, mat: { ore_xuantie: 1 } } },
        { text: '先探虚实', out: { cult: 2.4e4, lingShi: 3e3 } },
      ],
    },
    {
      id: 'evb_canye_1', title: '天降残页', icon: '📜', w: 8, once: false, hidden: false,
      trigger: 'any', minRealm: 1,
      text: '一阵怪风卷过，半页焦黄古纸打着旋儿落在你膝上，字里行间灵光隐现。',
      choices: [
        { text: '小心收好', out: { cult: 1.2e4, frag: { gf_qingxin: 1 } } },
        { text: '就地参悟', out: { cult: 6e4 } },
      ],
    },
    {
      id: 'evb_lingyao_1', title: '灵药逢春', icon: '🌿', w: 9, once: false, hidden: false,
      trigger: 'explore', minRealm: 0,
      text: '石缝之中一株灵草迎风轻摇，叶片上露珠晶莹，正是百年难遇的好年份。',
      choices: [
        { text: '采收入囊', out: { cult: 6e3, mat: { herb_lingzhi: 1 } } },
        { text: '连土移栽', out: { mat: { herb_lingzhi: 2 } } },
      ],
    },
    {
      id: 'evb_kuangmai_1', title: '矿脉露头', icon: '⛏️', w: 9, once: false, hidden: false,
      trigger: 'explore', minRealm: 1,
      text: '山崩一角，露出底下乌沉沉的矿脉，敲击之下金石之声清脆悦耳。',
      choices: [
        { text: '就地开采', out: { mat: { ore_xuantie: 2 } } },
        { text: '记下图志变卖', out: { cult: 2.4e4, lingShi: 2e3 } },
      ],
    },
    {
      id: 'evb_yishou_1', title: '异兽拦路', icon: '🐅', w: 9, once: false, hidden: false,
      trigger: 'explore', minRealm: 2,
      text: '一头斑斓异兽踞坐道中，铜铃大的眼睛盯着你，喉间发出低沉的吼声。',
      choices: [
        { text: '战而胜之', out: { cult: 2.4e5, mat: { beast_yaodan: 1 } } },
        { text: '投食诱开（-1万灵石）', req: { lingShi: 1e4 }, out: { cult: 9.6e4 } },
        { text: '绕道而行', out: { cult: 4.8e4 } },
      ],
    },
    {
      id: 'evb_xinggong_1', title: '星宫垂影', icon: '✨', w: 5, once: false, hidden: false,
      trigger: 'cultivate', minRealm: 3, cond: 'night',
      text: '子夜时分，北斗七星忽然大放光明，一缕星辉穿窗而入，正落在你的眉心。',
      choices: [
        { text: '接引星辉', out: { cult: 2.52e6, news: '你夜引星辉淬神，神识为之一清。' } },
        { text: '安心吸纳', out: { cult: 1.05e6 } },
      ],
    },
    {
      id: 'evb_dandu_1', title: '丹毒攻心', icon: '☠️', w: 6, once: false, hidden: false,
      trigger: 'cultivate', minRealm: 1, cond: 'tox50',
      text: '你只觉五内如焚，往日吞服的丹药之毒一并发作，经脉中隐隐有黑气游走。',
      choices: [
        { text: '强行压制', out: { cult: 6e4, toxicity: 10 } },
        { text: '闭关排毒', out: { cult: 1.2e4, toxicity: -30, news: '你闭关三日，排出丹毒，只觉周身一轻。' } },
      ],
    },
    {
      id: 'evb_haishi_1', title: '海市一瞥', icon: '🏮', w: 4, once: false, hidden: false,
      trigger: 'explore', minRealm: 2, cond: 'rich',
      text: '海天相接处升起一座海市，楼台错落，人声鼎沸，隐约可见奇珍陈列，稍纵即逝。',
      choices: [
        { text: '入内淘宝（-50万灵石）', req: { lingShi: 5e5 }, out: { egg: 1, mat: { gem_mingzhu: 1 } } },
        { text: '只看不买', out: { cult: 9.6e4, news: '你在海市门前站了半晌，囊中虽丰，终究不舍。' } },
      ],
    },
    {
      id: 'evb_gujiu_1', title: '故旧相赠', icon: '🎁', w: 6, once: false, hidden: false,
      trigger: 'any', minRealm: 0, cond: 'poor',
      text: '一位旧识散修见你囊中羞涩，硬塞来一包灵石：「当年你请我喝过酒，莫推辞。」',
      choices: [
        { text: '感激收下', out: { lingShi: 2e3, news: '落魄之时见故人，你暗誓他日必报。' } },
        { text: '婉言谢绝', out: { cult: 6e3, news: '你谢绝故旧之赠，对方大笑而去，逢人便夸你骨气。' } },
      ],
    }
  );
})();
