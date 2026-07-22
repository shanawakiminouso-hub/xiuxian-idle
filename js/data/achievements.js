/* achievements.js：成就表（契约 §9.8）
   —— XG.data.ach = [...]；元素 {id:'ac_*', name, icon, desc, hidden, cat, check:{k,v}, reward:{lingYu?, lingShi?, eff?}}
   —— reward.eff 为永久属性加成，键名取契约 §7 mods 键（cultRatePct/atkPct/defPct/hpPct/dropPct/
      alchSuccPct/forgeSuccPct/breakSuccPct/offlineHours/workPct），单项数值克制 ≤5。
   —— check.k 由 collection.js 统计器实现。本文件用到的 key 一览：
      【契约原列】layer / realmIdx / totalCult / gongfaOwn / gongfaMaxLv / pillMake / pillExplode /
        tox100 / equipEnhMax / equipGod / petOwn / petGrade5 / caveLvSum / mapUnlock / towerLayer /
        pvpWins / fellowFavorMax / fellowPartner / reincarn / codexPct / newsCount / helpFellow /
        nightLogin / rich
      【本文件新增，collection.js 需实现同名统计器】
        alchLv            炼丹师等级（state.alchemy.lv）
        advDone           已完成奇遇事件数（state.adventure.done 计数）
        breakFailStreak   当前连续突破失败次数（突破成功清零；取历史峰值）
        expeditionCount   累计派遣次数（expedition 系统累加）
        fellowEggFavorMax 彩蛋名道友（names.js egg 表）中的最高好感
        fellowRival       当前宿敌（relation='rival'）数量
        forgeMake         累计打造装备件数（forge 系统累加）
        gongfaCreateCount 自创功法数量（state.gongfa.custom.length）
        gongfaHidden      已习得隐藏功法数量（owned 中 hidden=true 的功法数）
        guardWave         守关历史最高波次（dungeon.guard 最佳纪录）
        hiddenMapUnlock   已解锁隐藏地图数（world.maps 中 hidden=true 且已解锁）
        petAwaken         血脉觉醒宠物数（pets.list 中已觉醒计数）
        petBreed          灵宠繁殖次数（pets 系统累加）
        playerEggName     玩家名字命中彩蛋名表（names.js egg）则为 1，否则 0
        pvpPts            论剑当前积分（state.pvp.pts 历史峰值）
        spiritRootMut     灵根为变异（spiritRoot.mut 非 null）则为 1，否则 0
        towerHiddenBoss   击败爬塔隐藏 BOSS 次数（每 33 层一只，dungeon 系统累加）
        totalOnlineH      累计在线小时数（totalOnlineSec/3600 向下取整）
*/
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.data = XG.data || {}; // data 层挂载点由数据文件自建（加载顺序任意，兜底）

  XG.data.ach = [
    /* ==================== cult 修炼 ==================== */
    { id: 'ac_cult_01', name: '引气入体', icon: '🌱', cat: 'cult', hidden: false,
      check: { k: 'layer', v: 5 }, reward: { lingYu: 5 },
      desc: '炼气五层。引天地灵气入体，自此也算半个修士。' },
    { id: 'ac_cult_02', name: '炼气圆满', icon: '💮', cat: 'cult', hidden: false,
      check: { k: 'layer', v: 10 }, reward: { lingYu: 10 },
      desc: '炼气十层圆满，气海充盈，只待一朝筑基。' },
    { id: 'ac_cult_03', name: '聚沙成塔', icon: '⏳', cat: 'cult', hidden: false,
      check: { k: 'totalCult', v: 1e5 }, reward: { lingYu: 8 },
      desc: '累计修为十万。点滴之功，汇成江河。' },
    { id: 'ac_cult_04', name: '筑基立业', icon: '🏔', cat: 'cult', hidden: false,
      check: { k: 'realmIdx', v: 1 }, reward: { lingYu: 30, eff: { cultRatePct: 2 } },
      desc: '百日筑基，道基初奠。从此仙凡有别，长生有望。' },
    { id: 'ac_cult_05', name: '金丹一粒', icon: '🟡', cat: 'cult', hidden: false,
      check: { k: 'realmIdx', v: 2 }, reward: { lingYu: 80 },
      desc: '一粒金丹吞入腹，始知我命不由天。' },
    { id: 'ac_cult_06', name: '元婴出窍', icon: '🧘', cat: 'cult', hidden: false,
      check: { k: 'realmIdx', v: 3 }, reward: { lingYu: 150, eff: { hpPct: 2 } },
      desc: '元婴凝形，神魂可离体而游，生死之间多了一分退路。' },
    { id: 'ac_cult_07', name: '化神悟道', icon: '🌟', cat: 'cult', hidden: false,
      check: { k: 'realmIdx', v: 4 }, reward: { lingYu: 300, eff: { atkPct: 3 } },
      desc: '神与道合，抬手之间自有天地之势相随。' },
    { id: 'ac_cult_08', name: '炼虚还朴', icon: '🌫', cat: 'cult', hidden: false,
      check: { k: 'realmIdx', v: 5 }, reward: { lingYu: 500 },
      desc: '炼神还虚，虚实相生，已非凡人可测。' },
    { id: 'ac_cult_09', name: '合体归一', icon: '☯', cat: 'cult', hidden: false,
      check: { k: 'realmIdx', v: 6 }, reward: { lingYu: 800, eff: { defPct: 3 } },
      desc: '身与道合，形神一体，举手投足皆是法则。' },
    { id: 'ac_cult_10', name: '大乘圆满', icon: '🪷', cat: 'cult', hidden: false,
      check: { k: 'realmIdx', v: 7 }, reward: { lingYu: 1500 },
      desc: '大乘圆满，功行俱足，只待天劫一问。' },
    { id: 'ac_cult_11', name: '渡劫问天', icon: '⚡', cat: 'cult', hidden: false,
      check: { k: 'realmIdx', v: 8 }, reward: { lingYu: 2500, eff: { breakSuccPct: 3 } },
      desc: '九霄雷动，天劫临头。渡得过，便是逍遥仙。' },
    { id: 'ac_cult_12', name: '飞升证道', icon: '🌈', cat: 'cult', hidden: false,
      check: { k: 'realmIdx', v: 9 }, reward: { lingYu: 5000, eff: { cultRatePct: 5 } },
      desc: '白日飞升，霞举成仙。此界种种，皆成身后云烟。' },
    { id: 'ac_cult_13', name: '功行万贯', icon: '📿', cat: 'cult', hidden: false,
      check: { k: 'totalCult', v: 1e9 }, reward: { lingYu: 120 },
      desc: '累计修为十亿。寒来暑往，功不唐捐。' },
    { id: 'ac_cult_14', name: '修为如渊', icon: '🌊', cat: 'cult', hidden: false,
      check: { k: 'totalCult', v: 1e15 }, reward: { lingYu: 2000, eff: { cultRatePct: 3 } },
      desc: '累计修为千万亿。渊渟岳峙，深不可测。' },

    /* ==================== gongfa 功法 ==================== */
    { id: 'ac_gf_01', name: '初窥门径', icon: '📜', cat: 'gongfa', hidden: false,
      check: { k: 'gongfaOwn', v: 1 }, reward: { lingYu: 5 },
      desc: '习得第一本功法。大道三千，自此有径可循。' },
    { id: 'ac_gf_02', name: '博览群经', icon: '📚', cat: 'gongfa', hidden: false,
      check: { k: 'gongfaOwn', v: 8 }, reward: { lingYu: 40 },
      desc: '身藏八部功法。触类旁通，渐有大家气象。' },
    { id: 'ac_gf_03', name: '藏经满楼', icon: '🏛', cat: 'gongfa', hidden: false,
      check: { k: 'gongfaOwn', v: 16 }, reward: { lingYu: 200, eff: { cultRatePct: 2 } },
      desc: '十六部功法在握，胸中自有万卷。' },
    { id: 'ac_gf_04', name: '炉火纯青', icon: '🔥', cat: 'gongfa', hidden: false,
      check: { k: 'gongfaMaxLv', v: 10 }, reward: { lingYu: 100, eff: { atkPct: 2 } },
      desc: '一门功法修至十重。千锤百炼，方得纯青。' },
    { id: 'ac_gf_05', name: '开宗立派', icon: '🖋', cat: 'gongfa', hidden: false,
      check: { k: 'gongfaCreateCount', v: 1 }, reward: { lingYu: 600, eff: { cultRatePct: 3 } },
      desc: '自创功法，独辟蹊径。他日或可循此开宗。' },
    { id: 'ac_gf_h1', name: '遗世孤篇', icon: '🗞', cat: 'gongfa', hidden: true,
      check: { k: 'gongfaHidden', v: 1 }, reward: { lingYu: 400 },
      desc: '偶得遗世功法一部。天机不可泄露——此卷究竟从何而来？' },

    /* ==================== pill 炼丹 ==================== */
    { id: 'ac_pill_01', name: '初试炉火', icon: '🍶', cat: 'pill', hidden: false,
      check: { k: 'pillMake', v: 1 }, reward: { lingYu: 10 },
      desc: '开炉炼丹，首丹告成。药香虽淡，其道不浅。' },
    { id: 'ac_pill_02', name: '丹熟五十', icon: '⚗', cat: 'pill', hidden: false,
      check: { k: 'pillMake', v: 50 }, reward: { lingYu: 60 },
      desc: '成丹五十。火候药材，渐熟于心。' },
    { id: 'ac_pill_03', name: '丹成千炉', icon: '🏺', cat: 'pill', hidden: false,
      check: { k: 'pillMake', v: 500 }, reward: { lingYu: 500, eff: { alchSuccPct: 3 } },
      desc: '成丹五百。炉火纯青，丹道大成。' },
    { id: 'ac_pill_04', name: '丹道宗师', icon: '👑', cat: 'pill', hidden: false,
      check: { k: 'alchLv', v: 8 }, reward: { lingYu: 300, eff: { alchSuccPct: 2 } },
      desc: '炼丹师八级。一炉在手，天下灵药皆可为我所用。' },
    { id: 'ac_pill_05', name: '炸炉惊魂', icon: '💥', cat: 'pill', hidden: false,
      check: { k: 'pillExplode', v: 1 }, reward: { lingYu: 5 },
      desc: '轰然一响，丹炉尽毁。炼丹之人，谁没炸过几回炉。' },
    { id: 'ac_pill_h1', name: '百炼成灰', icon: '🌋', cat: 'pill', hidden: true,
      check: { k: 'pillExplode', v: 20 }, reward: { lingYu: 300, eff: { forgeSuccPct: 2 } },
      desc: '炸炉二十次。炉灰积了三尺，道心却越炸越稳。' },
    { id: 'ac_pill_h2', name: '丹毒攻心', icon: '☠', cat: 'pill', hidden: true,
      check: { k: 'tox100', v: 1 }, reward: { lingYu: 200 },
      desc: '丹毒积至百点。是药三分毒，贪多必自毙。' },

    /* ==================== equip 装备 ==================== */
    { id: 'ac_eq_01', name: '百炼精钢', icon: '🔨', cat: 'equip', hidden: false,
      check: { k: 'equipEnhMax', v: 5 }, reward: { lingYu: 30 },
      desc: '一件装备强化至+5。铁杵磨针，方见锋芒。' },
    { id: 'ac_eq_02', name: '千锤百炼', icon: '⚒', cat: 'equip', hidden: false,
      check: { k: 'equipEnhMax', v: 10 }, reward: { lingYu: 120, eff: { atkPct: 2 } },
      desc: '一件装备强化至+10。寒光出鞘，锐不可当。' },
    { id: 'ac_eq_03', name: '神器初临', icon: '🗡', cat: 'equip', hidden: false,
      check: { k: 'equipGod', v: 1 }, reward: { lingYu: 400, eff: { hpPct: 2 } },
      desc: '首获神品装备。器有灵兮，择主而事。' },
    { id: 'ac_eq_04', name: '六神护体', icon: '🛡', cat: 'equip', hidden: false,
      check: { k: 'equipGod', v: 6 }, reward: { lingYu: 2500, eff: { defPct: 5 } },
      desc: '六件神品加身。万法不侵，诸邪辟易。' },
    { id: 'ac_eq_05', name: '铸器五十', icon: '🏭', cat: 'equip', hidden: false,
      check: { k: 'forgeMake', v: 50 }, reward: { lingYu: 150, eff: { forgeSuccPct: 2 } },
      desc: '亲手打造装备五十件。火候深浅，一锤便知。' },

    /* ==================== pet 灵宠 ==================== */
    { id: 'ac_pet_01', name: '灵宠初遇', icon: '🐣', cat: 'pet', hidden: false,
      check: { k: 'petOwn', v: 1 }, reward: { lingYu: 8 },
      desc: '收服第一只灵宠。山野相逢，自此同行。' },
    { id: 'ac_pet_02', name: '百兽来朝', icon: '🐾', cat: 'pet', hidden: false,
      check: { k: 'petOwn', v: 10 }, reward: { lingYu: 80 },
      desc: '座下灵宠十只。号令群兽，蔚为壮观。' },
    { id: 'ac_pet_03', name: '神兽现世', icon: '🐉', cat: 'pet', hidden: false,
      check: { k: 'petGrade5', v: 1 }, reward: { lingYu: 300, eff: { atkPct: 2 } },
      desc: '育得五品神兽一只。神威初显，群邪退避。' },
    { id: 'ac_pet_04', name: '五神齐聚', icon: '🦁', cat: 'pet', hidden: false,
      check: { k: 'petGrade5', v: 5 }, reward: { lingYu: 1800, eff: { hpPct: 4 } },
      desc: '五只神兽齐聚麾下。兽威所至，山岳俯首。' },
    { id: 'ac_pet_05', name: '血脉延续', icon: '🥚', cat: 'pet', hidden: false,
      check: { k: 'petBreed', v: 1 }, reward: { lingYu: 100 },
      desc: '灵宠初次繁殖。血脉绵延，薪火不熄。' },
    { id: 'ac_pet_06', name: '血脉觉醒', icon: '🔱', cat: 'pet', hidden: false,
      check: { k: 'petAwaken', v: 1 }, reward: { lingYu: 500, eff: { atkPct: 3 } },
      desc: '灵宠血脉觉醒。沉睡的先祖之力，于斯复苏。' },

    /* ==================== cave 洞府 ==================== */
    { id: 'ac_cave_01', name: '洞天初辟', icon: '⛰', cat: 'cave', hidden: false,
      check: { k: 'caveLvSum', v: 6 }, reward: { lingYu: 20 },
      desc: '洞府建筑累计六级。方寸之地，渐成气候。' },
    { id: 'ac_cave_02', name: '福地俨然', icon: '🏞', cat: 'cave', hidden: false,
      check: { k: 'caveLvSum', v: 20 }, reward: { lingYu: 150, eff: { workPct: 2 } },
      desc: '洞府建筑累计二十级。灵田药圃，井然有序。' },
    { id: 'ac_cave_03', name: '洞天圆满', icon: '🌄', cat: 'cave', hidden: false,
      check: { k: 'caveLvSum', v: 40 }, reward: { lingYu: 1000, eff: { workPct: 4 } },
      desc: '洞府建筑累计四十级。三十六洞天，也不过如此。' },

    /* ==================== explore 历练 ==================== */
    { id: 'ac_exp_01', name: '初逢奇遇', icon: '🎐', cat: 'explore', hidden: false,
      check: { k: 'advDone', v: 1 }, reward: { lingYu: 5 },
      desc: '奇遇初临。仙缘一事，妙不可言。' },
    { id: 'ac_exp_02', name: '缘法十桩', icon: '🎋', cat: 'explore', hidden: false,
      check: { k: 'advDone', v: 10 }, reward: { lingYu: 50 },
      desc: '历经十桩奇遇。福缘深厚，非常人可及。' },
    { id: 'ac_exp_03', name: '遍历三山', icon: '🗺', cat: 'explore', hidden: false,
      check: { k: 'mapUnlock', v: 3 }, reward: { lingYu: 30 },
      desc: '解锁三张历练地图。行万里路，胜读万卷书。' },
    { id: 'ac_exp_04', name: '足迹六合', icon: '🧭', cat: 'explore', hidden: false,
      check: { k: 'mapUnlock', v: 6 }, reward: { lingYu: 150, eff: { dropPct: 2 } },
      desc: '解锁六张历练地图。三山五岳，皆留足迹。' },
    { id: 'ac_exp_05', name: '八荒踏遍', icon: '🌏', cat: 'explore', hidden: false,
      check: { k: 'mapUnlock', v: 8 }, reward: { lingYu: 800, eff: { dropPct: 3 } },
      desc: '八张地图尽数解锁。八荒六合，任我纵横。' },
    { id: 'ac_exp_06', name: '秘境寻踪', icon: '🕳', cat: 'explore', hidden: false,
      check: { k: 'hiddenMapUnlock', v: 1 }, reward: { lingYu: 400 },
      desc: '寻得一处隐藏秘境。归墟龙渊，世人不知其处。' },
    { id: 'ac_exp_07', name: '派遣百次', icon: '📯', cat: 'explore', hidden: false,
      check: { k: 'expeditionCount', v: 100 }, reward: { lingYu: 600, eff: { workPct: 3 } },
      desc: '派遣灵宠历练百次。运筹帷幄，决胜千里。' },
    { id: 'ac_exp_08', name: '缘法五十', icon: '🎑', cat: 'explore', hidden: false,
      check: { k: 'advDone', v: 50 }, reward: { lingYu: 500 },
      desc: '历经五十桩奇遇。天道酬勤，亦酬有缘人。' },

    /* ==================== dungeon 秘境 ==================== */
    { id: 'ac_dun_01', name: '登塔十层', icon: '🗼', cat: 'dungeon', hidden: false,
      check: { k: 'towerLayer', v: 10 }, reward: { lingYu: 40 },
      desc: '镇妖塔登至十层。塔影深深，妖气森森。' },
    { id: 'ac_dun_02', name: '三十三天', icon: '🏯', cat: 'dungeon', hidden: false,
      check: { k: 'towerLayer', v: 33 }, reward: { lingYu: 200, eff: { hpPct: 2 } },
      desc: '登塔三十三层。传闻此层有隐世大妖蛰伏。' },
    { id: 'ac_dun_03', name: '百层问顶', icon: '⛩', cat: 'dungeon', hidden: false,
      check: { k: 'towerLayer', v: 100 }, reward: { lingYu: 800, eff: { atkPct: 3 } },
      desc: '登塔百层。百尺竿头，更进一步。' },
    { id: 'ac_dun_04', name: '五百凌霄', icon: '☁', cat: 'dungeon', hidden: false,
      check: { k: 'towerLayer', v: 500 }, reward: { lingYu: 4000, eff: { atkPct: 5, hpPct: 5 } },
      desc: '登塔五百层。凌霄之上，俯瞰众生。' },
    { id: 'ac_dun_05', name: '守关十波', icon: '🏰', cat: 'dungeon', hidden: false,
      check: { k: 'guardWave', v: 10 }, reward: { lingYu: 150, eff: { defPct: 2 } },
      desc: '守关抵挡十波来犯。一夫当关，万夫莫开。' },
    { id: 'ac_dun_h1', name: '塔影寻踪', icon: '👁', cat: 'dungeon', hidden: true,
      check: { k: 'towerHiddenBoss', v: 1 }, reward: { lingYu: 600, eff: { dropPct: 3 } },
      desc: '斩落塔中隐世大妖。若非亲眼所见，谁知塔底藏着什么。' },

    /* ==================== pvp 论剑 ==================== */
    { id: 'ac_pvp_01', name: '初露锋芒', icon: '⚔', cat: 'pvp', hidden: false,
      check: { k: 'pvpWins', v: 1 }, reward: { lingYu: 20 },
      desc: '论剑首胜。剑既出鞘，自有回响。' },
    { id: 'ac_pvp_02', name: '百战不殆', icon: '🏹', cat: 'pvp', hidden: false,
      check: { k: 'pvpWins', v: 50 }, reward: { lingYu: 150, eff: { atkPct: 2 } },
      desc: '论剑五十胜。身经百战，剑心愈明。' },
    { id: 'ac_pvp_03', name: '剑压群雄', icon: '🏆', cat: 'pvp', hidden: false,
      check: { k: 'pvpWins', v: 300 }, reward: { lingYu: 1200, eff: { atkPct: 4 } },
      desc: '论剑三百胜。剑锋所指，群雄俯首。' },
    { id: 'ac_pvp_04', name: '仙尊之位', icon: '🎖', cat: 'pvp', hidden: false,
      check: { k: 'pvpPts', v: 3000 }, reward: { lingYu: 1000, eff: { hpPct: 3 } },
      desc: '论剑积分三千。仙尊之位，实至名归。' },

    /* ==================== fellow 道友 ==================== */
    { id: 'ac_fel_01', name: '知己相逢', icon: '🤝', cat: 'fellow', hidden: false,
      check: { k: 'fellowFavorMax', v: 60 }, reward: { lingYu: 30 },
      desc: '与道友好感至六十。高山流水，知己难求。' },
    { id: 'ac_fel_02', name: '结为道侣', icon: '💞', cat: 'fellow', hidden: false,
      check: { k: 'fellowPartner', v: 1 }, reward: { lingYu: 300, eff: { cultRatePct: 2 } },
      desc: '结为道侣，双修同契。愿以长生为聘，共赴大道。' },
    { id: 'ac_fel_03', name: '宿敌当前', icon: '⚔️', cat: 'fellow', hidden: false,
      check: { k: 'fellowRival', v: 1 }, reward: { lingYu: 100, eff: { atkPct: 2 } },
      desc: '得了个旗鼓相当的宿敌。棋逢对手，亦是快事。' },
    { id: 'ac_fel_04', name: '援手十次', icon: '🤲', cat: 'fellow', hidden: false,
      check: { k: 'helpFellow', v: 10 }, reward: { lingYu: 60 },
      desc: '相助道友十次。赠人灵丹，手留药香。' },
    { id: 'ac_fel_h1', name: '义薄云天', icon: '🌤', cat: 'fellow', hidden: true,
      check: { k: 'helpFellow', v: 50 }, reward: { lingYu: 500, eff: { workPct: 3 } },
      desc: '相助道友五十次。侠之大者，润物无声。' },
    { id: 'ac_fel_h2', name: '故人依旧', icon: '🌙', cat: 'fellow', hidden: true,
      check: { k: 'fellowEggFavorMax', v: 100 }, reward: { lingYu: 800, eff: { cultRatePct: 3 } },
      desc: '与那位名动千古的道友结为至交。似曾相识燕归来——他竟真的在此界。' },

    /* ==================== reincarn 轮回 ==================== */
    { id: 'ac_rei_01', name: '一世轮回', icon: '🌀', cat: 'reincarn', hidden: false,
      check: { k: 'reincarn', v: 1 }, reward: { lingYu: 1000, eff: { breakSuccPct: 2 } },
      desc: '首度轮回转世。前尘尽忘，道心不改。' },
    { id: 'ac_rei_02', name: '三生有幸', icon: '🎡', cat: 'reincarn', hidden: false,
      check: { k: 'reincarn', v: 3 }, reward: { lingYu: 2000, eff: { cultRatePct: 3 } },
      desc: '三度轮回。三生三世，道心愈坚。' },
    { id: 'ac_rei_03', name: '五世修行', icon: '♾', cat: 'reincarn', hidden: false,
      check: { k: 'reincarn', v: 5 }, reward: { lingYu: 3500, eff: { atkPct: 4 } },
      desc: '五度轮回。五世修行，只为今朝。' },
    { id: 'ac_rei_04', name: '九世归真', icon: '🌌', cat: 'reincarn', hidden: false,
      check: { k: 'reincarn', v: 9 }, reward: { lingYu: 6000, eff: { cultRatePct: 5 } },
      desc: '九度轮回。九世沉淀，一朝归真。' },

    /* ==================== fun 杂趣 ==================== */
    { id: 'ac_fun_01', name: '富甲一方', icon: '💰', cat: 'fun', hidden: false,
      check: { k: 'rich', v: 1 }, reward: { lingYu: 100 },
      desc: '灵石逾百万。财侣法地，财字当头。' },
    { id: 'ac_fun_02', name: '闻道百则', icon: '📰', cat: 'fun', hidden: false,
      check: { k: 'newsCount', v: 100 }, reward: { lingYu: 40 },
      desc: '耳闻传闻百则。修真界风吹草动，尽在掌握。' },
    { id: 'ac_fun_03', name: '江湖百晓', icon: '🗞', cat: 'fun', hidden: false,
      check: { k: 'newsCount', v: 500 }, reward: { lingYu: 300 },
      desc: '耳闻传闻五百则。江湖百晓，不过如此。' },
    { id: 'ac_fun_04', name: '图鉴三成', icon: '📖', cat: 'fun', hidden: false,
      check: { k: 'codexPct', v: 30 }, reward: { lingYu: 100, eff: { dropPct: 2 } },
      desc: '图鉴集齐三成。万物有灵，皆入吾彀。' },
    { id: 'ac_fun_05', name: '图鉴六成', icon: '📕', cat: 'fun', hidden: false,
      check: { k: 'codexPct', v: 60 }, reward: { lingYu: 400, eff: { dropPct: 3 } },
      desc: '图鉴集齐六成。博闻强识，世所罕见。' },
    { id: 'ac_fun_06', name: '万识归宗', icon: '📙', cat: 'fun', hidden: false,
      check: { k: 'codexPct', v: 90 }, reward: { lingYu: 2000, eff: { dropPct: 5 } },
      desc: '图鉴集齐九成。万识归宗，只差一步。' },
    { id: 'ac_fun_07', name: '朝暮不辍', icon: '🕯', cat: 'fun', hidden: false,
      check: { k: 'totalOnlineH', v: 168 }, reward: { lingYu: 200, eff: { offlineHours: 1 } },
      desc: '累计在线七日。朝饮露兮暮餐霞，道心不移。' },
    { id: 'ac_fun_h1', name: '子夜修仙', icon: '🌃', cat: 'fun', hidden: true,
      check: { k: 'nightLogin', v: 3 }, reward: { lingYu: 300 },
      desc: '连续三日子夜（零至六时）上线。月黑风高夜，正是修仙时。' },
    { id: 'ac_fun_h2', name: '异根天降', icon: '❄', cat: 'fun', hidden: true,
      check: { k: 'spiritRootMut', v: 1 }, reward: { lingYu: 400, eff: { cultRatePct: 2 } },
      desc: '灵根洗出变异。冰雷风暗光，皆非尘世凡根。' },
    { id: 'ac_fun_h3', name: '五败之地', icon: '🍂', cat: 'fun', hidden: true,
      check: { k: 'breakFailStreak', v: 5 }, reward: { lingYu: 150, eff: { breakSuccPct: 2 } },
      desc: '连续五次突破失败。天将降大任，必先挫其锋。' },
    { id: 'ac_fun_h4', name: '名动古今', icon: '✒', cat: 'fun', hidden: true,
      check: { k: 'playerEggName', v: 1 }, reward: { lingYu: 200 },
      desc: '给自己取了个名动千古的名字。道友，这名字……好像在哪里听过？' },
  ];
})();
