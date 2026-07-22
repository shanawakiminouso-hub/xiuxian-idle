/* equips.js：装备体系数据表（契约 §9.5）——底材/词条/套装/宝石/器灵/强化公式 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.data = XG.data || {}; // data 层挂载点（各数据文件任意顺序加载，须自建）

  /* ==================== 通用规则注释 ====================
   * 品阶 grade：0凡品 1灵品 2宝品 3仙品 4神品（与契约 §9 一致）。
   * 词条数值 min/max 一律为「百分数」，roll 出的值写入装备实例；
   * kind → XG.stats 修饰键映射：atk→atkPct, def→defPct, hp→hpPct,
   *   cult→cultRatePct, drop→dropPct, work→workPct, alch→alchSuccPct,
   *   crit→critPct / spd→spdPct（§7 透传键，由战斗/历练系统读取）。
   * 每件装备 roll 词条数：grade0→1 条，grade1→1~2 条，grade2→2 条，
   *   grade3→3 条，grade4→4 条；同一件装备词条 kind 不可重复；
   *   候选词条须满足 grades 含该装备品阶，再按 w 权重抽取（好词条更稀有）。
   * 装备底材掉落品阶建议（由 dungeon/forge 系统实现）：
   *   炼气~筑基出 grade0~1，金丹~元婴出 grade1~2，
   *   化神~炼虚出 grade2~3，合体以上出 grade3~4。
   * 矿石材料（ore_*）对应 world.js 各地图掉落；归墟/龙渊两套
   *   对应隐藏地图「归墟」「龙渊」，形成跨系统收集闭环。
   * ===================================================== */

  /* ---- 矿石材料登记（并入 XG.data.mats，供 inventory/forge 使用） ---- */
  const mats = {
    ore_jingtie:  { name: '精铁矿', icon: '铁', grade: 0, desc: '凡铁千锤百炼，去芜存菁，可为凡器之基。' },
    ore_xuantie:  { name: '玄铁',   icon: '玄', grade: 1, desc: '色沉如墨，坠手异常，凡火难熔。' },
    ore_zijin:    { name: '紫金',   icon: '紫', grade: 2, desc: '紫气氤氲，金性至坚，炼器上品之材。' },
    ore_xingchen: { name: '星辰铁', icon: '星', grade: 3, desc: '天外陨星所遗，内蕴一缕星辰之力。' },
    ore_longjin:  { name: '龙纹金', icon: '龙', grade: 4, desc: '金生龙纹，传为真龙涎水点化，举世难求。' },
    ore_xingsha:  { name: '星砂',   icon: '砂', grade: 2, desc: '夜半北斗垂光，凝沙而成，升星必备之物。' },
  };

  /* ==================== 底材 bases（48+1 件） ====================
   * 数值口径：参照 XG.cfg.REALM_BASE（炼气 atk10/hp100，每大境界 ×6）。
   * 凡品 ≈ 炼气期过渡，灵品 ≈ 筑基，宝品 ≈ 金丹，仙品 ≈ 元婴~化神，
   * 神品 ≈ 化神以上；强化+20（×2.6）与 10 星（×2.5）另计，故高品阶
   * 底材刻意留有余量，避免单系统速通毕业。
   * slot：weapon 武器 / head 冠 / body 衣甲 / boots 履靴 / ring 戒 / talisman 符
   * ================================================================== */
  const bases = [
    /* ---- 凡品 grade 0（6 件，炼气期入门装） ---- */
    { id: 'eq_tiejian',      name: '精铁剑',   icon: '🗡', slot: 'weapon',   grade: 0, base: { atk: 8 },          desc: '精铁百炼而成，凡俗武夫亦可驱使。' },
    { id: 'eq_qingbujin',    name: '青布巾',   icon: '👑', slot: 'head',     grade: 0, base: { def: 5, hp: 60 },  desc: '青布束发，遮尘蔽日，行走江湖的寻常装扮。' },
    { id: 'eq_mayi',         name: '粗麻道衣', icon: '🥋', slot: 'body',     grade: 0, base: { def: 8, hp: 120 }, desc: '麻布粗织，冬暖夏凉，散修入门之物。' },
    { id: 'eq_mangxie',      name: '芒鞋',     icon: '🥾', slot: 'boots',    grade: 0, base: { def: 4, hp: 40 },  desc: '草茎编就，踏遍青山不觉累。' },
    { id: 'eq_tongjie',      name: '黄铜戒',   icon: '💍', slot: 'ring',     grade: 0, base: { atk: 5 },          desc: '黄铜所铸，内刻微小聚灵纹，聊胜于无。' },
    { id: 'eq_taomufu',      name: '桃木符',   icon: '🎴', slot: 'talisman', grade: 0, base: { atk: 3, hp: 50 },  desc: '桃木辟邪，朱砂点睛，可挡低阶阴邪。' },

    /* ---- 灵品 grade 1（6 件，筑基期主流装） ---- */
    { id: 'eq_hanguangjian', name: '寒光剑',   icon: '🗡', slot: 'weapon',   grade: 1, base: { atk: 64 },          desc: '寒光凛凛，削铁如泥，剑身隐有霜纹。' },
    { id: 'eq_qingyuguan',   name: '青玉冠',   icon: '👑', slot: 'head',     grade: 1, base: { def: 40, hp: 480 }, desc: '青玉温润，凝神静气，于修行小有裨益。' },
    { id: 'eq_yunsipao',     name: '云丝道袍', icon: '🥋', slot: 'body',     grade: 1, base: { def: 64, hp: 960 }, desc: '天蚕丝织，轻若流云，水火难侵。' },
    { id: 'eq_jifengxue',    name: '疾风靴',   icon: '🥾', slot: 'boots',    grade: 1, base: { def: 32, hp: 320 }, desc: '靴底纳风，行之无声，一日千里。' },
    { id: 'eq_baiyinjie',    name: '白银戒',   icon: '💍', slot: 'ring',     grade: 1, base: { atk: 40 },          desc: '白银通灵，内蕴一缕灵机。' },
    { id: 'eq_zhushafu',     name: '朱砂符',   icon: '🎴', slot: 'talisman', grade: 1, base: { atk: 24, hp: 400 }, desc: '朱砂混以灵兽之血，符成之日隐有雷鸣。' },

    /* ---- 宝品 grade 2（6 件，金丹期追求装） ---- */
    { id: 'eq_zihongjian',   name: '紫虹剑',   icon: '🗡', slot: 'weapon',   grade: 2, base: { atk: 480 },          desc: '剑出如紫虹贯日，金丹修士亦珍视之。' },
    { id: 'eq_zijinguan',    name: '紫金冠',   icon: '👑', slot: 'head',     grade: 2, base: { def: 300, hp: 3600 }, desc: '紫金为骨，明珠为饰，气度俨然。' },
    { id: 'eq_xuanlinjia',   name: '玄鳞宝甲', icon: '🥋', slot: 'body',     grade: 2, base: { def: 480, hp: 7200 }, desc: '玄鳄之鳞层层缀成，刀剑难伤分毫。' },
    { id: 'eq_dengyunlv',    name: '登云履',   icon: '🥾', slot: 'boots',    grade: 2, base: { def: 240, hp: 2400 }, desc: '履下生云，登萍渡水，踏雪无痕。' },
    { id: 'eq_feicuijie',    name: '翡翠戒',   icon: '💍', slot: 'ring',     grade: 2, base: { atk: 300 },          desc: '翡翠含翠，灵光内蕴，可安神魂。' },
    { id: 'eq_wuleifu',      name: '五雷符',   icon: '🎴', slot: 'talisman', grade: 2, base: { atk: 180, hp: 3000 }, desc: '符藏五雷，掷出则霹雳随行。' },

    /* ---- 仙品 grade 3 ·「太玄」套（6 件，均衡/修炼向） ---- */
    { id: 'eq_taixuan_jian',  name: '太玄·无名剑',   icon: '☯', slot: 'weapon',   grade: 3, base: { atk: 3600 },            desc: '道可道，非常道。此剑无名，锋芒自敛。' },
    { id: 'eq_taixuan_guan',  name: '太玄·束发冠',   icon: '☯', slot: 'head',     grade: 3, base: { def: 2250, hp: 27000 }, desc: '冠正而心正，心正而道存。' },
    { id: 'eq_taixuan_pao',   name: '太玄·云纹道袍', icon: '☯', slot: 'body',     grade: 3, base: { def: 3600, hp: 54000 }, desc: '云纹舒卷，暗合天道流转之序。' },
    { id: 'eq_taixuan_lv',    name: '太玄·踏云履',   icon: '☯', slot: 'boots',    grade: 3, base: { def: 1800, hp: 18000 }, desc: '履云而行，不染尘埃。' },
    { id: 'eq_taixuan_jie',   name: '太玄·清心戒',   icon: '☯', slot: 'ring',     grade: 3, base: { atk: 2250 },            desc: '清心寡欲，方见本真。' },
    { id: 'eq_taixuan_fu',    name: '太玄·镇妖符',   icon: '☯', slot: 'talisman', grade: 3, base: { atk: 1350, hp: 22500 }, desc: '一符镇万邪，浩然正气长存。' },

    /* ---- 仙品 grade 3 ·「沧浪」套（4 件，气血/防御向） ---- */
    { id: 'eq_canglang_jian', name: '沧浪·听雨剑', icon: '🌊', slot: 'weapon', grade: 3, base: { atk: 3600 },            desc: '剑鸣如雨打芭蕉，声声入梦。' },
    { id: 'eq_canglang_jia',  name: '沧浪·潮汐甲', icon: '🌊', slot: 'body',   grade: 3, base: { def: 3600, hp: 54000 }, desc: '甲光如潮，层层叠叠，御力于无形。' },
    { id: 'eq_canglang_lv',   name: '沧浪·踏波履', icon: '🌊', slot: 'boots',  grade: 3, base: { def: 1800, hp: 18000 }, desc: '履波不沉，踏浪而行。' },
    { id: 'eq_canglang_jie',  name: '沧浪·明珠戒', icon: '🌊', slot: 'ring',   grade: 3, base: { atk: 2250 },            desc: '沧海遗珠，光华内蕴而不炫。' },

    /* ---- 仙品 grade 3 ·「赤霄」套（4 件，攻击/暴击向） ---- */
    { id: 'eq_chixiao_jian', name: '赤霄·焚天剑', icon: '🔥', slot: 'weapon',   grade: 3, base: { atk: 3600 },            desc: '剑身赤红如火，挥之则烈焰焚空。' },
    { id: 'eq_chixiao_guan', name: '赤霄·焰纹冠', icon: '🔥', slot: 'head',     grade: 3, base: { def: 2250, hp: 27000 }, desc: '焰纹灼灼，如帝冠临尘。' },
    { id: 'eq_chixiao_jie',  name: '赤霄·流火戒', icon: '🔥', slot: 'ring',     grade: 3, base: { atk: 2250 },            desc: '戒蕴流火，触之温热，斗法时助涨三分凶焰。' },
    { id: 'eq_chixiao_fu',   name: '赤霄·焚心符', icon: '🔥', slot: 'talisman', grade: 3, base: { atk: 1350, hp: 22500 }, desc: '符火焚心，邪祟不近。' },

    /* ---- 仙品 grade 3 ·「青冥」套（4 件，速度/掉落向） ---- */
    { id: 'eq_qingming_ren', name: '青冥·逐风刃', icon: '🍃', slot: 'weapon',   grade: 3, base: { atk: 3600 },            desc: '刃薄如蝉翼，逐风而无影。' },
    { id: 'eq_qingming_lv',  name: '青冥·御风履', icon: '🍃', slot: 'boots',    grade: 3, base: { def: 1800, hp: 18000 }, desc: '御风而行，直上青冥。' },
    { id: 'eq_qingming_jie', name: '青冥·流云戒', icon: '🍃', slot: 'ring',     grade: 3, base: { atk: 2250 },            desc: '流云绕指，聚散随心。' },
    { id: 'eq_qingming_fu',  name: '青冥·神行符', icon: '🍃', slot: 'talisman', grade: 3, base: { atk: 1350, hp: 22500 }, desc: '神行千里，朝北海而暮苍梧。' },

    /* ---- 仙品 grade 3 ·「瑶光」套（4 件，炼丹/打工向） ---- */
    { id: 'eq_yaoguang_guan', name: '瑶光·星砂冠', icon: '⭐', slot: 'head',     grade: 3, base: { def: 2250, hp: 27000 }, desc: '星砂缀冠，入夜则荧荧生辉。' },
    { id: 'eq_yaoguang_yi',   name: '瑶光·织星衣', icon: '⭐', slot: 'body',     grade: 3, base: { def: 3600, hp: 54000 }, desc: '传为织女遗梭所织，星光满襟。' },
    { id: 'eq_yaoguang_jie',  name: '瑶光·凝露戒', icon: '⭐', slot: 'ring',     grade: 3, base: { atk: 2250 },            desc: '晨露凝于戒面，久而不晞。' },
    { id: 'eq_yaoguang_fu',   name: '瑶光·引星符', icon: '⭐', slot: 'talisman', grade: 3, base: { atk: 1350, hp: 22500 }, desc: '符引星辉，照彻丹炉，火候自分。' },

    /* ---- 神品 grade 4 ·「归墟」套（4 件，隐藏，生存/修炼向） ---- */
    { id: 'eq_guixu_jian', name: '归墟·溟海剑', icon: '🌑', slot: 'weapon',   grade: 4, hidden: true, base: { atk: 24000 },            desc: '溟海之底千年寒铁所铸，剑气森然如深渊。', getHint: '归墟秘境深处，偶有剑光破水而出。' },
    { id: 'eq_guixu_jia',  name: '归墟·玄溟甲', icon: '🌑', slot: 'body',     grade: 4, hidden: true, base: { def: 24000, hp: 360000 }, desc: '玄溟重水淬甲，万钧之力加身亦如无物。', getHint: '归墟秘境深处，或可遇之。' },
    { id: 'eq_guixu_jie',  name: '归墟·潮生戒', icon: '🌑', slot: 'ring',     grade: 4, hidden: true, base: { atk: 15000 },            desc: '潮生潮落，戒面水光千年不散。', getHint: '归墟秘境深处，或可遇之。' },
    { id: 'eq_guixu_zhu',  name: '归墟·定海珠', icon: '🌑', slot: 'talisman', grade: 4, hidden: true, base: { atk: 9000, hp: 150000 }, desc: '海珠定波，佩之则四海无澜。', getHint: '归墟秘境最深处，潮眼之下。' },

    /* ---- 神品 grade 4 ·「龙渊」套（4 件，隐藏，攻伐向） ---- */
    { id: 'eq_longyuan_jian', name: '龙渊·吟龙剑', icon: '🐉', slot: 'weapon', grade: 4, hidden: true, base: { atk: 24000 },            desc: '剑吟如龙，潜修渊底千年方出。', getHint: '龙渊秘境，潜龙之地，非大勇不可得。' },
    { id: 'eq_longyuan_guan', name: '龙渊·角龙冠', icon: '🐉', slot: 'head',   grade: 4, hidden: true, base: { def: 15000, hp: 180000 }, desc: '角龙蜕角所制，威仪自生。', getHint: '龙渊秘境，潜龙之地。' },
    { id: 'eq_longyuan_lv',   name: '龙渊·跃渊履', icon: '🐉', slot: 'boots',  grade: 4, hidden: true, base: { def: 12000, hp: 120000 }, desc: '金鳞岂是池中物，一遇风云便化龙。', getHint: '龙渊秘境，潜龙之地。' },
    { id: 'eq_longyuan_jie',  name: '龙渊·衔珠戒', icon: '🐉', slot: 'ring',   grade: 4, hidden: true, base: { atk: 15000 },            desc: '龙衔明珠，暗夜生辉。', getHint: '龙渊秘境，潜龙之地。' },

    /* ---- 彩蛋底材（隐藏，不入任何套装） ---- */
    { id: 'eq_tianshu', name: '半页天书', icon: '📜', slot: 'talisman', grade: 4, hidden: true, base: { atk: 9000, hp: 150000 }, desc: '残卷半页，字迹如蚁。非历轮回者，读之茫然。', getHint: '渡劫之后，雷池之畔偶有焦页。' },
  ];

  /* ==================== 词条 affixes（40 条） ====================
   * min/max 为百分数；grades 限定可出现的装备品阶；w 越小越稀有。
   * ============================================================ */
  const affixes = [
    /* 攻 atk */
    { id: 'aff_fengrui',   name: '锋锐', kind: 'atk', min: 3,  max: 6,  grades: [0, 1, 2, 3, 4], w: 100 },
    { id: 'aff_pojia',     name: '破甲', kind: 'atk', min: 5,  max: 9,  grades: [1, 2, 3, 4],    w: 70 },
    { id: 'aff_zhanyue',   name: '斩岳', kind: 'atk', min: 8,  max: 12, grades: [2, 3, 4],       w: 40 },
    { id: 'aff_tianxing',  name: '天刑', kind: 'atk', min: 12, max: 18, grades: [3, 4],          w: 18 },
    { id: 'aff_zhuxian',   name: '诛仙', kind: 'atk', min: 18, max: 25, grades: [4],             w: 6 },
    /* 防 def */
    { id: 'aff_panshi',    name: '磐石', kind: 'def', min: 3,  max: 6,  grades: [0, 1, 2, 3, 4], w: 100 },
    { id: 'aff_tiebi',     name: '铁壁', kind: 'def', min: 5,  max: 9,  grades: [1, 2, 3, 4],    w: 70 },
    { id: 'aff_zhenyue',   name: '镇岳', kind: 'def', min: 8,  max: 12, grades: [2, 3, 4],       w: 40 },
    { id: 'aff_budong',    name: '不动', kind: 'def', min: 12, max: 18, grades: [3, 4],          w: 18 },
    { id: 'aff_qiankunhu', name: '乾坤', kind: 'def', min: 18, max: 25, grades: [4],             w: 6 },
    /* 血 hp */
    { id: 'aff_huoxue',    name: '活血', kind: 'hp', min: 4,  max: 8,  grades: [0, 1, 2, 3, 4], w: 100 },
    { id: 'aff_changchun', name: '长春', kind: 'hp', min: 7,  max: 12, grades: [1, 2, 3, 4],    w: 70 },
    { id: 'aff_canghai',   name: '沧海', kind: 'hp', min: 10, max: 16, grades: [2, 3, 4],       w: 40 },
    { id: 'aff_niepan',    name: '涅槃', kind: 'hp', min: 15, max: 22, grades: [3, 4],          w: 18 },
    { id: 'aff_buxiu',     name: '不朽', kind: 'hp', min: 22, max: 30, grades: [4],             w: 6 },
    /* 暴击 crit（透传键 critPct） */
    { id: 'aff_huixin',    name: '会心', kind: 'crit', min: 2, max: 4,  grades: [0, 1, 2, 3, 4], w: 80 },
    { id: 'aff_zhiming',   name: '致命', kind: 'crit', min: 3, max: 6,  grades: [1, 2, 3, 4],    w: 55 },
    { id: 'aff_jueying',   name: '绝影', kind: 'crit', min: 5, max: 8,  grades: [2, 3, 4],       w: 32 },
    { id: 'aff_lushen',    name: '戮神', kind: 'crit', min: 8, max: 12, grades: [3, 4],          w: 14 },
    /* 速度 spd（透传键 spdPct） */
    { id: 'aff_jifeng',    name: '疾风', kind: 'spd', min: 2, max: 4,  grades: [0, 1, 2, 3, 4], w: 80 },
    { id: 'aff_liuyun',    name: '流云', kind: 'spd', min: 3, max: 6,  grades: [1, 2, 3, 4],    w: 55 },
    { id: 'aff_suodi',     name: '缩地', kind: 'spd', min: 5, max: 8,  grades: [2, 3, 4],       w: 32 },
    { id: 'aff_shunxi',    name: '瞬息', kind: 'spd', min: 8, max: 12, grades: [3, 4],          w: 14 },
    /* 掉落 drop */
    { id: 'aff_jucai',     name: '聚财', kind: 'drop', min: 4,  max: 8,  grades: [0, 1, 2, 3, 4], w: 90 },
    { id: 'aff_nabao',     name: '纳宝', kind: 'drop', min: 7,  max: 12, grades: [1, 2, 3, 4],    w: 60 },
    { id: 'aff_tianku',    name: '天库', kind: 'drop', min: 10, max: 16, grades: [2, 3, 4],       w: 35 },
    { id: 'aff_jubao',     name: '聚宝', kind: 'drop', min: 15, max: 22, grades: [3, 4],          w: 15 },
    /* 修炼 cult */
    { id: 'aff_jingxin',   name: '静心', kind: 'cult', min: 3,  max: 6,  grades: [0, 1, 2, 3, 4], w: 90 },
    { id: 'aff_wudao',     name: '悟道', kind: 'cult', min: 5,  max: 9,  grades: [1, 2, 3, 4],    w: 60 },
    { id: 'aff_tongming',  name: '通明', kind: 'cult', min: 8,  max: 12, grades: [2, 3, 4],       w: 35 },
    { id: 'aff_tianren',   name: '天人', kind: 'cult', min: 12, max: 18, grades: [3, 4],          w: 15 },
    /* 打工 work */
    { id: 'aff_qinmian',   name: '勤勉', kind: 'work', min: 4,  max: 8,  grades: [0, 1, 2, 3, 4], w: 90 },
    { id: 'aff_qiaojiang', name: '巧匠', kind: 'work', min: 7,  max: 12, grades: [1, 2, 3, 4],    w: 60 },
    { id: 'aff_guifu',     name: '鬼斧', kind: 'work', min: 10, max: 16, grades: [2, 3, 4],       w: 35 },
    { id: 'aff_zaohua',    name: '造化', kind: 'work', min: 15, max: 22, grades: [3, 4],          w: 15 },
    /* 炼丹 alch */
    { id: 'aff_shiyao',    name: '识药', kind: 'alch', min: 3,  max: 5,  grades: [0, 1, 2, 3, 4], w: 80 },
    { id: 'aff_konghuo',   name: '控火', kind: 'alch', min: 4,  max: 7,  grades: [1, 2, 3, 4],    w: 55 },
    { id: 'aff_danxin',    name: '丹心', kind: 'alch', min: 6,  max: 10, grades: [2, 3, 4],       w: 30 },
    { id: 'aff_yaowang',   name: '药王', kind: 'alch', min: 10, max: 14, grades: [3, 4],          w: 12 },
    /* 彩蛋词条（神品专属，万中无一） */
    { id: 'aff_dadao',     name: '大道至简', kind: 'cult', min: 20, max: 28, grades: [4], w: 2, hidden: true, desc: '大道至简，衍化至繁。得此纹者，如闻道祖亲授。' },
  ];

  /* ==================== 套装 sets（7 套） ====================
   * pieces 为底材 id；穿满 2 件激活 eff2，4 件激活 eff4。
   * 归墟/龙渊为隐藏套装，产自对应隐藏地图（world.js）。
   * ============================================================ */
  const sets = [
    { id: 'set_taixuan', name: '太玄', icon: '☯', grade: 3,
      pieces: ['eq_taixuan_jian', 'eq_taixuan_guan', 'eq_taixuan_pao', 'eq_taixuan_lv', 'eq_taixuan_jie', 'eq_taixuan_fu'],
      eff2: { cultRatePct: 12 }, eff4: { atkPct: 15, breakSuccPct: 5 },
      desc: '太玄者，道之极也。传为道祖讲道时所遗之器，六器同鸣，如闻天籁。' },
    { id: 'set_canglang', name: '沧浪', icon: '🌊', grade: 3,
      pieces: ['eq_canglang_jian', 'eq_canglang_jia', 'eq_canglang_lv', 'eq_canglang_jie'],
      eff2: { hpPct: 15 }, eff4: { defPct: 18, hpPct: 10 },
      desc: '沧浪之水清兮，可以濯吾缨。水德之器，绵延不绝。' },
    { id: 'set_chixiao', name: '赤霄', icon: '🔥', grade: 3,
      pieces: ['eq_chixiao_jian', 'eq_chixiao_guan', 'eq_chixiao_jie', 'eq_chixiao_fu'],
      eff2: { atkPct: 15 }, eff4: { atkPct: 18, critPct: 6 },
      desc: '赤霄出鞘，白蛇授首。帝王之器，杀伐果断。' },
    { id: 'set_qingming', name: '青冥', icon: '🍃', grade: 3,
      pieces: ['eq_qingming_ren', 'eq_qingming_lv', 'eq_qingming_jie', 'eq_qingming_fu'],
      eff2: { spdPct: 12 }, eff4: { spdPct: 15, dropPct: 12 },
      desc: '青冥浩荡不见底，日月照耀金银台。' },
    { id: 'set_yaoguang', name: '瑶光', icon: '⭐', grade: 3,
      pieces: ['eq_yaoguang_guan', 'eq_yaoguang_yi', 'eq_yaoguang_jie', 'eq_yaoguang_fu'],
      eff2: { alchSuccPct: 8 }, eff4: { workPct: 15, alchSuccPct: 7 },
      desc: '瑶光者，北斗第七星也，主福寿，佑丹成。' },
    { id: 'set_guixu', name: '归墟', icon: '🌑', grade: 4, hidden: true,
      pieces: ['eq_guixu_jian', 'eq_guixu_jia', 'eq_guixu_jie', 'eq_guixu_zhu'],
      eff2: { hpPct: 25, defPct: 15 }, eff4: { atkPct: 25, cultRatePct: 20 },
      desc: '归墟者，众水所归，尾闾泄之而不竭。得之者，如负沧海。' },
    { id: 'set_longyuan', name: '龙渊', icon: '🐉', grade: 4, hidden: true,
      pieces: ['eq_longyuan_jian', 'eq_longyuan_guan', 'eq_longyuan_lv', 'eq_longyuan_jie'],
      eff2: { atkPct: 25 }, eff4: { atkPct: 20, critPct: 10, spdPct: 10 },
      desc: '龙潜于渊，鳞爪不现。一剑既出，风云变色。' },
  ];

  /* ==================== 宝石 gems（7 种 × lv1~5） ====================
   * eff 为「每级」加成（百分数），lv n 实际加成 = eff × n。
   * 合成规则（cost）：3 枚同级宝石 + lingShi[当前lv] 灵石 → 1 枚高一级；
   * lv5 为上限，不可再合。背包中各级宝石 id 为 `${id}_${lv}`（gem_* 命名空间）。
   * 获取：lv1 坊市有售 / 爬塔与历练掉落；高阶宝石亦可于限时寻宝中偶得。
   * 镶嵌规则注释：每件装备至多嵌 2 枚，卸下不损（由 forge 系统实现）。
   * ============================================================ */
  const gems = [
    { id: 'gem_chiyu',    name: '赤玉',   icon: '🔴', eff: { atkPct: 3 },      lv: 5, cost: { merge: 3, lingShi: [0, 500, 5000, 50000, 500000] }, desc: '赤玉如燃，嵌之助涨攻伐之势。' },
    { id: 'gem_qingyu',   name: '青玉',   icon: '🟢', eff: { defPct: 3 },      lv: 5, cost: { merge: 3, lingShi: [0, 500, 5000, 50000, 500000] }, desc: '青玉坚润，护体为上。' },
    { id: 'gem_yangzhi',  name: '羊脂玉', icon: '⚪', eff: { hpPct: 4 },       lv: 5, cost: { merge: 3, lingShi: [0, 500, 5000, 50000, 500000] }, desc: '温润如凝脂，佩之气血绵长。' },
    { id: 'gem_zijing',   name: '紫晶',   icon: '🟣', eff: { critPct: 2 },     lv: 5, cost: { merge: 3, lingShi: [0, 800, 8000, 80000, 800000] }, desc: '紫晶蕴雷光，得之者目明手快。' },
    { id: 'gem_fengling', name: '风灵石', icon: '💨', eff: { spdPct: 2 },      lv: 5, cost: { merge: 3, lingShi: [0, 800, 8000, 80000, 800000] }, desc: '石窍生风，嵌之身法愈疾。' },
    { id: 'gem_huangyu',  name: '黄玉',   icon: '🟡', eff: { dropPct: 3 },     lv: 5, cost: { merge: 3, lingShi: [0, 600, 6000, 60000, 600000] }, desc: '黄玉招财，商贾与历练者皆爱之。' },
    { id: 'gem_bingxin',  name: '冰心玉', icon: '🧊', eff: { cultRatePct: 3 }, lv: 5, cost: { merge: 3, lingShi: [0, 600, 6000, 60000, 600000] }, desc: '冰心一片，尘虑尽消，修行自速。' },
  ];
  /* 各级宝石同步登记为材料（gem_chiyu_1 … gem_bingxin_5），供背包显示 */
  const CN_LV = ['一', '二', '三', '四', '五'];
  gems.forEach(function (g) {
    for (let lv = 1; lv <= 5; lv++) {
      mats[g.id + '_' + lv] = {
        name: g.name + '·' + CN_LV[lv - 1],
        icon: g.icon,
        grade: Math.min(4, lv),
        desc: g.desc + '（' + lv + ' 阶，可镶嵌；三枚同级可熔炼升阶。）',
      };
    }
  });

  /* ==================== 器灵 spirits ====================
   * 器灵者，器之魂也。神器通灵，可孕灵智。
   * 唤醒条件 wakeCond：神器（grade4）强化至 +15，耗灵玉×100 唤醒。
   * 器灵名由 XG.data.spiritNames 提供（names.js）。
   * 养成规则注释：以灵玉/矿石喂养升亲密；每 10 级亲密随机习得或强化
   *   1 个技能；persona 的性格加成常驻，技能加成随器灵等级成长。
   * ============================================================ */
  const spirits = {
    desc: '器灵者，器之魂也。神器久沐灵气，自生灵智，可语可战。',
    wakeCond: { grade: 4, enh: 15, lingYu: 100, text: '神器（grade4）强化至 +15，耗灵玉×100 可唤醒器灵。' },
    personas: [
      { id: 'spt_guao',    name: '孤傲', w: 20, eff: { atkPct: 5 },      desc: '孤高自持，剑不染尘。' },
      { id: 'spt_wenwan',  name: '温婉', w: 20, eff: { cultRatePct: 5 }, desc: '轻声细语，如沐春风。' },
      { id: 'spt_kuangfang', name: '狂放', w: 15, eff: { critPct: 3 },   desc: '快意恩仇，肆意汪洋。' },
      { id: 'spt_chenwen', name: '沉稳', w: 20, eff: { defPct: 5 },      desc: '渊渟岳峙，不动如山。' },
      { id: 'spt_lingdong', name: '灵动', w: 15, eff: { spdPct: 4 },     desc: '活泼跳脱，神出鬼没。' },
      { id: 'spt_guayan',  name: '寡言', w: 10, eff: { hpPct: 6 },       desc: '惜字如金，大音希声。' },
    ],
    skills: [
      { id: 'sps_jianming', name: '剑鸣九天', icon: '⚔', eff: { atkPct: 10 },               w: 100, desc: '剑鸣之声上彻九天，敌胆俱裂。' },
      { id: 'sps_tiexin',   name: '铁心护主', icon: '🛡', eff: { defPct: 10 },               w: 100, desc: '器灵护主，临危自鸣，刀枪不入。' },
      { id: 'sps_xueyong',  name: '血涌如潮', icon: '🌊', eff: { hpPct: 12 },                w: 100, desc: '气血如潮，生生不息。' },
      { id: 'sps_jiying',   name: '疾影追风', icon: '🍃', eff: { spdPct: 8 },                w: 90,  desc: '影随身动，追风逐电。' },
      { id: 'sps_juling',   name: '聚灵纳气', icon: '☯', eff: { cultRatePct: 8 },            w: 90,  desc: '器灵吐纳，灵气自来投怀。' },
      { id: 'sps_tongxuan', name: '通玄识宝', icon: '👁', eff: { dropPct: 10 },               w: 80,  desc: '器灵通玄，宝物所在，纤毫毕现。' },
      { id: 'sps_danyin',   name: '丹引灵香', icon: '🌸', eff: { alchSuccPct: 5 },           w: 70,  desc: '灵香一缕入丹炉，火候自分，丹成有望。' },
      { id: 'sps_pojun',    name: '破军临阵', icon: '💥', eff: { critPct: 5 },               w: 60,  desc: '破军星动，一击必杀之机乍现。' },
      { id: 'sps_shihun',   name: '噬魂夺魄', icon: '🌑', eff: { atkPct: 6, dropPct: 4 },    w: 40,  desc: '器灵噬敌之魂以养己身，杀敌愈多，灵性愈盛。' },
    ],
  };

  /* ==================== 强化/升星公式（纯计算函数） ==================== */
  const ORE_BY_GRADE = ['ore_jingtie', 'ore_xuantie', 'ore_zijin', 'ore_xingchen', 'ore_longjin'];
  const formula = {
    maxStar: 10, // 升星上限（契约 §9.5）
    maxEnh: 20,  // 强化上限 +20（器灵 +15 唤醒条件在其内）

    /* 强化属性倍率：每级 +8% 底材白值，+20 时 ×2.6 */
    enhMul(lv) { return 1 + 0.08 * (lv || 0); },

    /* 升星属性倍率：每星 +15% 底材白值，10 星时 ×2.5 */
    starMul(star) { return 1 + 0.15 * (star || 0); },

    /* 强化 lv→lv+1 消耗：灵石 + 对应品阶矿石（数量随等级递增）。
       lv 为当前强化等级（0 起），grade 缺省 0。灵石曲线 1.45^lv（原 1.65^lv 过陡，强满≈单宠 18 天灵石） */
    enhanceCost(lv, grade) {
      grade = grade || 0;
      const cost = { lingShi: Math.floor(120 * Math.pow(1.45, lv) * Math.pow(6, grade)), mat: {} };
      cost.mat[ORE_BY_GRADE[grade] || 'ore_jingtie'] = 2 + lv;
      return cost;
    },

    /* 升星 star→star+1 消耗：灵玉 + 星砂；5 星及以上另需同名底材 1 件
       （dup 仅为标记，由 forge 系统校验并消耗，本函数不改任何状态）。 */
    starCost(star, grade) {
      grade = grade || 0;
      return {
        lingYu: (star + 1) * 3 * (grade + 1),
        mat: { ore_xingsha: star + 1 },
        dup: star >= 5 ? 1 : 0,
      };
    },
  };

  /* ==================== 登记 ==================== */
  XG.data.equips = { bases: bases, affixes: affixes, sets: sets, gems: gems, spirits: spirits, formula: formula };
  XG.data.mats = Object.assign(XG.data.mats || {}, mats);
})();
