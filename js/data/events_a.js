/* 文件名：events_a.js —— 奇遇事件池 A（契约 §9.7）：修炼奇遇/日常/道友偶遇/神秘商人/走火入魔/前辈指点/天材地宝 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  XG.data = XG.data || {};

  /*
   * 数值口径（规则注释，供核对）：
   * 1. cult 修为奖励 = XG.cfg.REALMS[minRealm].rate × 秒数系数，分档如下——
   *    小奖 ×600（10分钟）｜中奖 ×1800（半小时）｜大奖 ×3600（1小时）｜
   *    重奖 ×7200（2小时）｜连锁/险中求胜 ×10800~21600（3~6小时，稀有且 once）。
   *    参照：炼气 rate10（1h=3.6e4）、筑基 rate40（1h=1.44e5）、金丹 rate160（1h=5.76e5）、
   *    元婴 rate700（1h=2.52e6）、化神 rate3e3（1h=1.08e7）、炼虚 rate1.3e4（1h=4.68e7）、
   *    合体 rate6e4（1h=2.16e8）。保证单事件收益不越档、任何单一系统无法速通毕业。
   * 2. lingShi 奖励：炼气期数十~数百、筑基数百、金丹数千、元婴以上数千~数万；
   *    req.lingShi 消耗约为同档奖励的 1.5~3 倍（买路钱总要贵过捡到的）。
   * 3. lingYu 灵玉极稀缺：单次 1~3，连锁终章最多 3；egg/rootWash/meridian 仅隐藏事件产出。
   * 4. toxicity 正=增丹毒（冒险代价），负=排毒；走火入魔类事件见 cond 'tox50'。
   * 5. 跨文件连锁前置：eva_jianmeng→evb_xuanyuan_1（轩辕剑冢）、eva_longyin→evb_longyuan_1（龙渊）、
   *    eva_guijia→evb_gui_xu_1（归墟），由 events_b.js 承接后续。
   * 6. 连锁后续事件一律 hidden:true、once:true、w:1（不进随机池，由连锁队列触发）。
   * 7. 引用口径：丹药 out.pill 取 pills.js 真实丹方 id（pill_juqi 聚气丹 / pill_qingdu 清毒散）；
   *    残篇 out.frag 的 key 取 gongfa.js 真实功法 id（gf_qingxin / gf_wanjian / gf_taixuan / gf_zixiao）；
   *    材料 id 以 world.js 登记为准（herb/ore/gem/beast/sp 五类命名空间）。
   */
  const list = [
    /* ==================== 一、修炼奇遇 ==================== */
    {
      id: 'eva_lingquan', title: '灵泉乍现', icon: '泉', w: 12, once: false, hidden: false,
      trigger: 'cultivate', minRealm: 0,
      text: '打坐之际，身侧石缝忽涌灵泉，清冽之气沁入经脉，周天为之一畅。',
      choices: [
        { text: '静心吸纳', out: { cult: 1.8e4, news: '山中灵泉乍现，有缘者饮之，修为见长。' } },
        { text: '引泉强行冲关', out: { cult: 3.6e4, toxicity: 5, news: '有人强引灵泉冲脉，进境虽快，也伤了经络。' } },
        { text: '引泉浇灌药圃', out: { cult: 6e3, mat: { herb_lingzhi: 2 }, news: '灵泉灌圃，几株灵芝一夜疯长。' } },
      ],
    },
    {
      id: 'eva_xingdou', title: '夜观星斗', icon: '星', w: 2, once: true, hidden: true,
      trigger: 'cultivate', minRealm: 0, cond: 'night',
      text: '夜半收功，仰见紫微垣中一星忽明。恍惚之间，似有纶音自天而降。',
      choices: [
        { text: '凝神感应天机', out: { cult: 7.2e4, lingYu: 1, news: '有散修夜观星斗，忽悟天机，道行大进。' } },
        { text: '潜心摹下星图', out: { cult: 1.8e4, frag: { gf_zixiao: 2 }, news: '一幅星图摹到五更，纸上隐有光华流转。' } },
      ],
    },
    {
      id: 'eva_lingchao', title: '灵气潮汐', icon: '潮', w: 10, once: false, hidden: false,
      trigger: 'cultivate', minRealm: 0,
      text: '山间灵气忽如潮涌，一浪高过一浪，正是吐纳的良机。',
      choices: [
        { text: '乘风吐纳', out: { cult: 3.6e4, news: '灵气潮汐之夜，趁势者皆有寸进。' } },
        { text: '固守玄关', out: { cult: 1.8e4, toxicity: -5, news: '潮起潮落，自守玄关者岿然不动。' } },
        { text: '逆行采补', out: { cult: 7.2e4, toxicity: 10, news: '有人趁潮汐强行采补，进境虽猛，却损了根基。' } },
      ],
    },
    {
      id: 'eva_lingdie', title: '灵蝶引路', icon: '蝶', w: 8, once: false, hidden: false,
      trigger: 'cultivate', minRealm: 1,
      text: '一只玉色灵蝶绕你三匝，翩然向谷深处飞去，翅上鳞粉洒落，点点生光。',
      choices: [
        { text: '随蝶而去', out: { cult: 7.2e4, mat: { herb_xuelian: 1 }, news: '灵蝶引路，有人于幽谷中采得雪莲。' } },
        { text: '不为所动', out: { cult: 2.4e4, news: '蝶自翩跹，人自打坐，两不相扰。' } },
      ],
    },
    {
      id: 'eva_sanri', title: '入定三日', icon: '定', w: 8, once: false, hidden: false,
      trigger: 'cultivate', minRealm: 1,
      text: '此一回入定，物我两忘，不觉已是三日之后。醒转时神清气爽，周天自转。',
      choices: [
        { text: '顺势运转周天', out: { cult: 2.88e5, news: '有修士入定三日，醒来修为大涨。' } },
        { text: '徐徐收功温养', out: { cult: 1.44e5, toxicity: -3, news: '三日入定，收功时浑身骨节轻响。' } },
      ],
    },
    {
      id: 'eva_leiwu', title: '惊雷悟道', icon: '雷', w: 6, once: false, hidden: false,
      trigger: 'cultivate', minRealm: 2,
      text: '骤雨忽至，惊雷裂空。你于电光一瞬，窥见天地间一线杀伐真意。',
      choices: [
        { text: '悟这一缕雷意', out: { cult: 5.76e5, news: '惊雷之夜，有人悟得雷意，气势陡增。' } },
        { text: '避雷调息', out: { cult: 9.6e4, news: '雷声滚滚，你自岿然调息，不为外物所动。' } },
      ],
    },
    {
      id: 'eva_ziqi', title: '紫气东来', icon: '紫', w: 4, once: false, hidden: false,
      trigger: 'cultivate', minRealm: 5,
      text: '五更将尽，东方忽起紫气，浩荡三万里。你恰逢其会，周身毛孔尽开。',
      choices: [
        { text: '紫气灌顶', out: { cult: 9.36e7, lingYu: 2, news: '紫气东来三万里，有缘者灌顶受之，道行精进。' } },
        { text: '分润同修道友', out: { cult: 4.68e7, news: '有人将紫气分润同道，传为美谈。' } },
      ],
    },

    /* ==================== 二、山野日常 ==================== */
    {
      id: 'eva_caoyao', title: '山径采药', icon: '药', w: 12, once: false, hidden: false,
      trigger: 'any', minRealm: 0,
      text: '行经山径，见岩畔生着几株灵芝，叶间隐有莹光流转。',
      choices: [
        { text: '细心采撷', out: { cult: 6e3, mat: { herb_lingzhi: 2 }, news: '山径灵芝生得好，采药人满载而归。' } },
        { text: '连根尽数掘走', out: { mat: { herb_lingzhi: 3 }, news: '有人掘尽一处灵芝，山灵颇有微词。' } },
        { text: '任其生长', out: { cult: 1.2e4, news: '留得青山在，采药人拱手而去。' } },
      ],
    },
    {
      id: 'eva_zhuozu', title: '溪边濯足', icon: '溪', w: 12, once: false, hidden: false,
      trigger: 'any', minRealm: 0,
      text: '山溪清浅，触手生凉。你歇脚濯足，顿觉尘虑尽消。',
      choices: [
        { text: '溪畔小憩片刻', out: { cult: 1.2e4, toxicity: -3, news: '一溪清水，洗去半日风尘。' } },
        { text: '掬水洗目', out: { cult: 6e3, news: '有人以灵溪水洗目，夜里视物如昼。' } },
      ],
    },
    {
      id: 'eva_yedu', title: '夜雨读书', icon: '书', w: 10, once: false, hidden: false,
      trigger: 'any', minRealm: 0,
      text: '夜雨敲窗，你挑灯翻检旧卷，于残页中读得一句残缺的口诀。',
      choices: [
        { text: '反复揣摩', out: { cult: 1.8e4, news: '雨夜读书，残句中亦有三寸灵光。' } },
        { text: '誊录收存', out: { frag: { gf_qingxin: 2 }, news: '残卷誊罢，墨迹未干，窗外雨声渐歇。' } },
      ],
    },
    {
      id: 'eva_xinyuan', title: '心猿意马', icon: '猿', w: 10, once: false, hidden: false,
      trigger: 'cultivate', minRealm: 0,
      text: '打坐未久，杂念纷起，尘缘旧事一一上心头。',
      choices: [
        { text: '斩却杂念', out: { cult: 1.8e4, news: '心猿归正，意马收缰，此一坐颇有寸进。' } },
        { text: '随它去罢', out: { cult: 3e3, news: '有人打坐时神游太虚，醒来只道饿矣。' } },
      ],
    },
    {
      id: 'eva_qiaofu', title: '樵夫指路', icon: '樵', w: 10, once: false, hidden: false,
      trigger: 'any', minRealm: 0,
      text: '山道樵夫见你风尘仆仆，笑指一条近路，又赠你半囊山泉。',
      choices: [
        { text: '谢而受之', out: { cult: 1.2e4, lingShi: 20, news: '樵夫一指，省却半日脚程。' } },
        { text: '以灵石相酬', req: { lingShi: 30 }, out: { cult: 2.4e4, news: '樵夫得了酬谢，逢人便夸你厚道。' } },
      ],
    },
    {
      id: 'eva_shibao', title: '拾得遗囊', icon: '囊', w: 6, once: false, hidden: false,
      trigger: 'any', minRealm: 1,
      text: '草丛中卧着一只无主储物袋，袋口禁制已被岁月磨平。',
      choices: [
        { text: '打开看看', out: { lingShi: 300, mat: { ore_xuantie: 1 }, cult: 2.4e4, news: '无主遗囊，落入有缘人之手。' } },
        { text: '原地等候失主', out: { cult: 7.2e4, news: '有人拾金不昧，失主乃一介散修，二人结为道友。' } },
      ],
    },
    {
      id: 'eva_chapeng', title: '茶棚听闻', icon: '茶', w: 10, once: false, hidden: false,
      trigger: 'any', minRealm: 1,
      text: '山下茶棚里，几个行脚修士高谈阔论，说的是近来坊市的行情与秘境的传闻。',
      choices: [
        { text: '驻足细听', out: { cult: 2.4e4, news: '茶棚之中多奇闻，有心人自有所得。' } },
        { text: '沽酒待客', req: { lingShi: 100 }, out: { cult: 7.2e4, news: '你沽酒一席，换得满座真言。' } },
      ],
    },

    /* ==================== 三、道友偶遇 ==================== */
    {
      id: 'eva_lundao', title: '道友论道', icon: '论', w: 12, once: false, hidden: false,
      trigger: 'any', minRealm: 0,
      text: '一位云游道友路过，见你修行勤勉，邀你煮茶论道。',
      choices: [
        { text: '欣然赴约', out: { cult: 1.8e4, news: '一壶粗茶，竟论出三分真味。' } },
        { text: '以修为互相印证', out: { cult: 3.6e4, toxicity: 3, news: '论道变成印证修为，二人各有感悟，也各自呛了口气。' } },
      ],
    },
    {
      id: 'eva_qiuyuan', title: '仗义援手', icon: '援', w: 8, once: false, hidden: false,
      trigger: 'any', minRealm: 1,
      text: '林间传来呼救之声，一位道友被一头黑风狼逼在崖角，眼看支撑不住。',
      choices: [
        { text: '仗剑相助', out: { cult: 7.2e4, mat: { beast_yaodan: 1 }, news: '有人路见不平，剑退黑风狼，救下一位同道。' } },
        { text: '高声呼喝助威', out: { cult: 2.4e4, news: '那道友狼狈逃出生天，对你半是感激半是怨怼。' } },
        { text: '悄然绕开', out: { cult: 0, news: '林间呼救声渐歇，你加快了脚步。' } },
      ],
    },
    {
      id: 'eva_huanbao', title: '以物易物', icon: '易', w: 8, once: false, hidden: false,
      trigger: 'any', minRealm: 1,
      text: '道友囊中缺一味灵芝配药，愿以亲手炼的聚气丹相易。',
      choices: [
        { text: '以灵芝易丹', req: { mat: { herb_lingzhi: 1 } }, out: { pill: { pill_juqi: 1 }, news: '各取所需，皆大欢喜。' } },
        { text: '再添些灵石多换一枚', req: { mat: { herb_lingzhi: 1 }, lingShi: 100 }, out: { pill: { pill_juqi: 2 }, news: '添头一加，丹成双枚。' } },
        { text: '婉言谢绝', out: { cult: 2.4e4, news: '道友也不恼，背起行囊自去了。' } },
      ],
    },
    {
      id: 'eva_yanjiu', title: '灵宴小聚', icon: '宴', w: 8, once: false, hidden: false,
      trigger: 'any', minRealm: 1,
      text: '道友新酿的灵桃酒开坛，邀你共饮。酒香清冽，入喉化作暖流。',
      choices: [
        { text: '开怀畅饮', out: { cult: 7.2e4, toxicity: 4, news: '灵桃酒虽好，贪杯亦乱真气。' } },
        { text: '浅尝辄止', out: { cult: 2.4e4, toxicity: 1, news: '三杯即止，宾主尽欢。' } },
        { text: '以茶代酒', out: { cult: 1.2e4, news: '满座皆醉你独醒，倒显得不合群了。' } },
      ],
    },
    {
      id: 'eva_tiaoxin', title: '宿敌挑衅', icon: '衅', w: 6, once: false, hidden: false,
      trigger: 'any', minRealm: 2,
      text: '昔日结怨的修士拦在去路，言辞讥诮，约你三日之后云台论剑。',
      choices: [
        { text: '当场应下', out: { cult: 5.76e5, lingShi: 500, news: '云台一会，你技高一筹，挫了那人的锐气。' } },
        { text: '不理不睬', out: { cult: 9.6e4, news: '任你百般挑衅，我自岿然不动。' } },
        { text: '反唇相讥', out: { cult: 2.88e5, news: '一场唇枪舌剑，围观者尽皆叹服。' } },
      ],
    },
    {
      id: 'eva_shuangxiu', title: '道侣同修', icon: '侣', w: 4, once: false, hidden: true,
      trigger: 'any', minRealm: 2, cond: 'fellow_partner',
      text: '月白风清，道侣邀你于竹楼之上同修合气之术，阴阳相济，气息交融。',
      choices: [
        { text: '双修合气', out: { cult: 1.152e6, news: '神仙眷侣，令人艳羡。' } },
        { text: '论道品茗', out: { cult: 5.76e5, toxicity: -3, news: '竹楼夜话，一盏清茶也养人。' } },
      ],
    },


    /* ==================== 四、神秘商人 ==================== */
    {
      id: 'eva_merchant_1', title: '青衫贾人', icon: '贾', w: 4, once: true, hidden: false,
      trigger: 'any', minRealm: 0,
      text: '山道上遇一青衫贾人，担中琳琅满目。他取出一卷无名残卷，低声道：「此乃冢中所出，识货者自知。」',
      choices: [
        { text: '倾囊买下', req: { lingShi: 150 }, out: { frag: { gf_wanjian: 1 }, chain: 'eva_merchant_2', news: '无名残卷入手，纸页间隐有剑鸣。' } },
        { text: '讨价还价', req: { lingShi: 80 }, out: { frag: { gf_wanjian: 1 }, news: '贾人虽不悦，终究还是卖了——只是再没提过下卷。' } },
        { text: '摆手回绝', out: { cult: 6e3, news: '残卷与贾人一同消失在晨雾里。' } },
      ],
    },
    {
      id: 'eva_merchant_2', title: '贾人再访', icon: '卷', w: 1, once: true, hidden: true,
      trigger: 'any',
      text: '半月之后，青衫贾人如约而至，又从担底摸出一卷：「中卷在此。只是这价钱，可就不一样了。」',
      choices: [
        { text: '如数奉上灵石', req: { lingShi: 600 }, out: { frag: { gf_wanjian: 2 }, chain: 'eva_merchant_3', news: '残卷渐全，剑意渐明。' } },
        { text: '力有不逮，忍痛作罢', out: { cult: 1.2e4, news: '贾人叹息一声，担起担子去了，此后再未出现。' } },
      ],
    },
    {
      id: 'eva_merchant_3', title: '多宝行商', icon: '宝', w: 1, once: true, hidden: true,
      trigger: 'any',
      text: '贾人三顾茅庐，这回不再遮掩，自称多宝阁行商。终卷价值不菲，他却允你以灵草相抵。',
      choices: [
        { text: '以灵草抵债', req: { mat: { herb_lingzhi: 3 } }, out: { frag: { gf_wanjian: 3 }, lingYu: 2, hiddenEnd: '三卷合一，残页自行拼合，现出一行古篆：「剑二十三，留待有缘。」' } },
        { text: '以灵石买断', req: { lingShi: 2000 }, out: { frag: { gf_wanjian: 3 }, lingYu: 1, hiddenEnd: '三卷合一，残页自行拼合，现出一行古篆：「剑二十三，留待有缘。」' } },
      ],
    },
    {
      id: 'eva_heishi', title: '黑市夜拍', icon: '拍', w: 4, once: false, hidden: false,
      trigger: 'any', minRealm: 2,
      text: '子夜坊市深处，一场黑市夜拍悄然开张。压轴之物，是一枚妖兽内丹与一颗灵宠蛋。',
      choices: [
        { text: '拍下妖兽内丹', req: { lingShi: 1500 }, out: { mat: { beast_yaodan: 2 }, news: '黑市之中，有人一掷千金。' } },
        { text: '拍下灵宠蛋', req: { lingShi: 2500 }, out: { egg: 1, news: '蛋壳微温，其中似有心跳。' } },
        { text: '只看个热闹', out: { cult: 9.6e4, news: '夜拍散场，看客一哄而散。' } },
      ],
    },
    {
      id: 'eva_yiyu', title: '以物易玉', icon: '玉', w: 6, once: false, hidden: false,
      trigger: 'any', minRealm: 1,
      text: '行商登门收购炼器用的玄铁，出手豪爽，愿以灵玉结算。',
      choices: [
        { text: '以玄铁易玉', req: { mat: { ore_xuantie: 2 } }, out: { lingYu: 2, news: '以物易玉，两不相亏。' } },
        { text: '留着自用', out: { cult: 2.4e4, news: '玄铁沉入箱底，行商悻悻而去。' } },
      ],
    },
    {
      id: 'eva_shezhang', title: '老贾赊账', icon: '赊', w: 3, once: false, hidden: true,
      trigger: 'any', cond: 'poor',
      text: '老相识贾人见你囊中羞涩，笑着摆摆手：「丹药先拿去，灵石么——日后有了再说。」',
      choices: [
        { text: '感激收下', out: { pill: { pill_juqi: 1 }, news: '雪中送炭，来日必报。' } },
        { text: '婉拒不受', out: { cult: 1.2e4, lingYu: 1, news: '人穷志不短，贾人对你高看一眼。' } },
      ],
    },

    /* ==================== 五、走火入魔 ==================== */
    {
      id: 'eva_ruhuo_1', title: '丹毒攻心', icon: '毒', w: 4, once: false, hidden: true,
      trigger: 'cultivate', minRealm: 1, cond: 'tox50',
      text: '丹毒日积月累，忽于今夜发作。真气逆行，五内如焚，眼前幻象丛生。',
      choices: [
        { text: '强行压下', out: { cult: 7.2e4, toxicity: 15, news: '有人强压丹毒，险些走火入魔。' } },
        { text: '散功调息', out: { cult: 0, toxicity: -25, news: '散功半日，方将毒火逼出体外。' } },
        { text: '传讯四方求助', out: { cult: 2.4e4, chain: 'eva_ruhuo_2', news: '你传讯四方，静候援手。' } },
      ],
    },
    {
      id: 'eva_ruhuo_2', title: '雪中送炭', icon: '援', w: 1, once: true, hidden: true,
      trigger: 'any',
      text: '不过半日，一位道友踏月而来，赠你一枚清毒散，又为你护法整整一夜。',
      choices: [
        { text: '当即服下', out: { cult: 7.2e4, toxicity: -20, news: '患难见真情，此恩没齿难忘。' } },
        { text: '谢过收下，留待后用', out: { pill: { pill_qingdu: 1 }, cult: 2.4e4, news: '丹药收好，情谊也收好。' } },
      ],
    },
    {
      id: 'eva_xinmo', title: '心魔低语', icon: '魔', w: 4, once: false, hidden: true,
      trigger: 'cultivate', minRealm: 1, cond: 'stuck3d',
      text: '破境无期，心魔渐生。夜深人静时，总有个声音劝你：「何苦苦修，散功罢了。」',
      choices: [
        { text: '守住道心', out: { cult: 1.44e5, news: '心魔退散，道心愈坚。' } },
        { text: '索性歇脚三日', out: { cult: 0, toxicity: -5, news: '偷得浮生三日闲，归来心气稍平。' } },
      ],
    },

    /* ==================== 六、前辈指点 ==================== */
    {
      id: 'eva_qisou', title: '山道棋叟', icon: '棋', w: 6, once: false, hidden: false,
      trigger: 'any', minRealm: 1,
      text: '松下老者独自对弈，见你路过，抬眼笑道：「小友，可愿陪老朽手谈一局？」',
      choices: [
        { text: '恭陪一局', out: { cult: 1.44e5, news: '一局终了，老者抚须：「棋如修行，你悟了么。」' } },
        { text: '请教弈理', out: { cult: 7.2e4, frag: { gf_qingxin: 1 }, news: '老者以棋喻道，你似懂非懂，只觉受用无穷。' } },
        { text: '拱手告辞', out: { cult: 2.4e4, news: '老者望着你的背影，轻轻落下一子。' } },
      ],
    },
    {
      id: 'eva_zuidao', title: '醉道人', icon: '醉', w: 6, once: false, hidden: false,
      trigger: 'any', minRealm: 2,
      text: '溪石上卧着个醉道人，抱着酒葫芦胡言乱语。细听之下，句句竟暗合剑理。',
      choices: [
        { text: '沽酒敬他', req: { lingShi: 200 }, out: { cult: 5.76e5, news: '一葫芦浊酒，换来三分剑意。' } },
        { text: '驻足旁听', out: { cult: 2.88e5, news: '醉话连篇，有心人听出了门道。' } },
        { text: '嗤之以鼻', out: { cult: 0, news: '醉道人翻了个身，骂了句「朽木」。' } },
      ],
    },
    {
      id: 'eva_chuangong', title: '前辈传功', icon: '传', w: 2, once: true, hidden: true,
      trigger: 'any', minRealm: 4,
      text: '深山古洞中，一位坐化在即的前辈拦住你，愿将残存真元倾囊相授，只求衣钵有人。',
      choices: [
        { text: '跪受真元', out: { cult: 2.16e7, meridian: 1, toxicity: 10, news: '前辈含笑而逝，真元尽付有缘人。' } },
        { text: '拜谢婉辞', out: { cult: 5.4e6, lingYu: 3, news: '前辈颔首：「不受无功之禄，此子可教。」' } },
      ],
    },
    {
      id: 'eva_mengshou', title: '梦中授业', icon: '梦', w: 3, once: false, hidden: true,
      trigger: 'cultivate', minRealm: 0, cond: 'night',
      text: '梦中一位白须老者执卷而教，口诀字字珠玑。惊醒时月色满窗，口诀竟一字不忘。',
      choices: [
        { text: '依诀修行', out: { cult: 7.2e4, news: '梦中得授真诀，醒来道行精进。' } },
        { text: '疑为心魔，弃之不用', out: { cult: 1.8e4, toxicity: -2, news: '宁可信其无，不可信其有，稳字当头。' } },
      ],
    },

    /* ==================== 七、天材地宝 ==================== */
    {
      id: 'eva_zhuguo', title: '峭壁朱果', icon: '果', w: 8, once: false, hidden: false,
      trigger: 'explore', minRealm: 0,
      text: '云雾缭绕的峭壁上，一株朱果红艳似火，异香扑鼻。只是猿猴难攀，人迹罕至。',
      choices: [
        { text: '冒险攀摘', out: { mat: { herb_zhuguo: 2 }, cult: 1.2e4, toxicity: 5, news: '有人于绝壁上采得朱果，掌心磨得鲜血淋漓。' } },
        { text: '结绳徐图', out: { mat: { herb_zhuguo: 1 }, cult: 6e3, news: '绳索三股，取之徐徐，虽少亦稳。' } },
        { text: '绕道而行', out: { cult: 1.2e4, news: '宝山空回，保命要紧。' } },
      ],
    },
    {
      id: 'eva_xuantie', title: '深谷玄铁', icon: '铁', w: 8, once: false, hidden: false,
      trigger: 'explore', minRealm: 1,
      text: '幽谷深处，一条玄铁矿脉裸露于断崖之下。矿石沉重，搬运殊为不易。',
      choices: [
        { text: '负石而返', out: { mat: { ore_xuantie: 3 }, cult: 2.4e4, toxicity: 2, news: '背石出谷，肩背俱肿，所幸不虚此行。' } },
        { text: '只凿精矿', out: { mat: { ore_xuantie: 1 }, cult: 7.2e4, news: '取其精华，弃其糟粕，矿脉留存待后日。' } },
        { text: '矿位售予坊市', out: { lingShi: 400, news: '一条矿脉的消息，换来一袋灵石。' } },
      ],
    },
    {
      id: 'eva_bingpo', title: '寒潭冰魄', icon: '冰', w: 6, once: false, hidden: false,
      trigger: 'explore', minRealm: 2,
      text: '寒潭深不见底，潭心有物幽幽发光，寒气隔着水面便刺人肌骨。',
      choices: [
        { text: '潜入潭底取宝', out: { mat: { gem_hanyu: 1 }, cult: 2.88e5, toxicity: 8, news: '寒潭取宝，上岸时唇色都青了。' } },
        { text: '以真气隔水摄取', out: { cult: 2.88e5, news: '隔水温养真气，虽未得宝，亦有进益。' } },
        { text: '望潭兴叹', out: { cult: 9.6e4, news: '潭水深寒，不是有缘人，不敢轻涉。' } },
      ],
    },
    {
      id: 'eva_leimu', title: '雷火焦木', icon: '木', w: 5, once: false, hidden: false,
      trigger: 'any', minRealm: 3,
      text: '昨夜天雷劈中一株千年古槐，树身焦黑，树心未毁，凝出一截雷晶，紫光内蕴。',
      choices: [
        { text: '取出雷晶', out: { mat: { gem_zijing: 1 }, cult: 1.26e6, news: '天雷淬木成晶，得之者暗藏一分雷威。' } },
        { text: '连根掘走古槐', out: { lingShi: 3000, news: '雷木亦是炼器良材，坊市抢着要。' } },
      ],
    },
    {
      id: 'eva_yaowang', title: '药王出世', icon: '王', w: 3, once: false, hidden: true,
      trigger: 'any', minRealm: 6,
      text: '深山中霞光冲霄，一株万年药王破土而出。四方修士闻风而至，一场争夺在所难免。',
      choices: [
        { text: '出手争夺', out: { mat: { herb_yaowang: 1 }, cult: 1.08e8, toxicity: 5, news: '药王之争，有人技压群雄，也结下几桩梁子。' } },
        { text: '趁乱分一杯羹', out: { mat: { herb_xuelian: 2 }, cult: 3.6e7, news: '乱中取利，见好就收。' } },
        { text: '远远避开', out: { cult: 3.6e7, news: '怀璧其罪，不沾为妙。' } },
      ],
    },

    /* ==================== 八、连锁·古洞遗府 ==================== */
    {
      id: 'eva_shibei', title: '山洪古碑', icon: '碑', w: 4, once: true, hidden: false,
      trigger: 'any', minRealm: 1,
      text: '一夜山洪过后，谷底露出半截古碑，碑文斑驳，隐约可见末尾一个「府」字。',
      choices: [
        { text: '沿碑探查', out: { cult: 2.4e4, chain: 'eva_shishi', news: '古碑之后，似有洞天。' } },
        { text: '拓下碑文', out: { cult: 7.2e4, frag: { gf_taixuan: 1 }, news: '碑文古奥，拓片似有微光。' } },
        { text: '无动于衷', out: { cult: 0, news: '古碑又被泥沙掩去半边。' } },
      ],
    },
    {
      id: 'eva_shishi', title: '洞中石室', icon: '室', w: 1, once: true, hidden: true,
      trigger: 'any',
      text: '碑后果然有洞。石室中一具枯骨趺坐，案上摆着一枚玉简，墙角禁制幽光微闪。',
      choices: [
        { text: '先拜枯骨，再动遗物', out: { cult: 7.2e4, lingYu: 2, chain: 'eva_yifu', news: '拜过前辈，方动遗物，礼数周全。' } },
        { text: '直取案上玉简', out: { frag: { gf_taixuan: 2 }, cult: 2.4e4, chain: 'eva_yifu', news: '玉简入手微温，似有余息。' } },
        { text: '伸手触碰禁制', out: { cult: 0, toxicity: 10, news: '禁制反噬，你吐血退出了石室。' } },
      ],
    },
    {
      id: 'eva_yifu', title: '遗府传承', icon: '府', w: 1, once: true, hidden: true,
      trigger: 'any',
      text: '玉简中留下一段前辈遗言：毕生所藏尽在于此，唯望后来者承其衣钵，莫堕此道。',
      choices: [
        { text: '承其衣钵', out: { cult: 5.76e5, frag: { gf_taixuan: 2 }, hiddenEnd: '遗府石门缓缓闭合，碑上「府」字之前，隐约又亮了半个「剑」字。' } },
        { text: '取藏而去', out: { lingShi: 1500, mat: { ore_xuantie: 2 }, hiddenEnd: '你取了财帛，也把前辈的道统，永远留在了原地。' } },
      ],
    },

    /* ==================== 九、连锁·灵狐报恩 ==================== */
    {
      id: 'eva_baihu_1', title: '白狐负伤', icon: '狐', w: 5, once: true, hidden: false,
      trigger: 'any', minRealm: 0,
      text: '草丛中窸窣作响，一只白狐后腿带伤，见人不逃，眼中竟有哀求之色。',
      choices: [
        { text: '以灵草为其疗伤', req: { mat: { herb_lingzhi: 1 } }, out: { cult: 1.2e4, chain: 'eva_baihu_2', news: '白狐舔舐伤口，深深看了你一眼。' } },
        { text: '捉去换钱', out: { lingShi: 80, news: '白狐哀鸣一声，被你卖进了兽笼。' } },
        { text: '置之不理', out: { cult: 0, news: '草木依旧，狐踪已渺。' } },
      ],
    },
    {
      id: 'eva_baihu_2', title: '白狐衔恩', icon: '恩', w: 1, once: true, hidden: true,
      trigger: 'any',
      text: '三日之后，那只白狐寻上门来，衔着一株带露的雪莲，放下便走。',
      choices: [
        { text: '收下谢礼', out: { mat: { herb_xuelian: 1 }, cult: 1.8e4, chain: 'eva_baihu_3', news: '狐且知恩，何况于人。' } },
        { text: '追上去放归山林', out: { cult: 3.6e4, lingYu: 1, news: '白狐三顾回首，似有不舍。' } },
      ],
    },
    {
      id: 'eva_baihu_3', title: '月夜引路', icon: '月', w: 1, once: true, hidden: true,
      trigger: 'any',
      text: '月圆之夜，白狐蹲坐窗外，冲你轻唤三声，引你往深山中去。谷底松涛之间，卧着一枚温热的蛋。',
      choices: [
        { text: '抱回灵蛋', out: { egg: 1, cult: 3.6e4, hiddenEnd: '白狐化作流光没入林间，风中只余一句：「善自护持。」' } },
        { text: '留于原地', out: { lingYu: 2, cult: 1.8e4, hiddenEnd: '你空着手回来，此后梦里，总见一双狐目。' } },
      ],
    },

    /* ==================== 十、跨文件连锁前置（→ events_b.js） ==================== */
    {
      id: 'eva_jianmeng', title: '夜梦剑冢', icon: '冢', w: 3, once: true, hidden: false,
      trigger: 'any', minRealm: 3,
      text: '夜得一梦：万剑插冢，锈迹斑斑，冢前一碑，大书「轩辕」二字。惊醒时，枕边竟有一片铁锈。',
      choices: [
        { text: '铭记此梦', out: { cult: 1.26e6, chain: 'evb_xuanyuan_1', news: '梦中剑冢，或为前缘指引。' } },
        { text: '付之一笑', out: { cult: 4.2e5, news: '日有所思，夜有所梦，不必当真。' } },
      ],
    },
    {
      id: 'eva_longyin', title: '深潭龙吟', icon: '龙', w: 3, once: true, hidden: false,
      trigger: 'any', minRealm: 5,
      text: '途经万丈深潭，潭底忽传一声龙吟，碧波翻涌，隐有龙影游动。',
      choices: [
        { text: '循声探渊', out: { cult: 2.34e7, chain: 'evb_longyuan_1', news: '龙吟出渊，必有异宝现世。' } },
        { text: '敬而远之', out: { cult: 7.8e6, news: '龙潭非善地，不去也罢。' } },
      ],
    },
    {
      id: 'eva_guijia', title: '归墟龟甲', icon: '甲', w: 3, once: true, hidden: false,
      trigger: 'any', minRealm: 5,
      text: '海滨拾得半截龟甲，甲上裂纹天然成字，细辨竟是「归墟」二字。',
      choices: [
        { text: '细研龟甲', out: { cult: 2.34e7, chain: 'evb_gui_xu_1', news: '龟甲所指，正是万水归墟之处。' } },
        { text: '售予藏家', out: { lingShi: 8000, news: '一截龟甲卖了高价，买家来历成谜。' } },
      ],
    },

    /* ==================== 十一、隐·特殊机缘 ==================== */
    {
      id: 'eva_maose', title: '茅塞顿开', icon: '悟', w: 4, once: false, hidden: true,
      trigger: 'cultivate', minRealm: 1, cond: 'stuck3d',
      text: '苦思多日不得寸进。今晨见檐角滴水穿石，忽有所悟——原来滞涩处，只欠一份水磨功夫。',
      choices: [
        { text: '借势再修', out: { cult: 2.88e5, news: '困守多时，一朝顿悟。' } },
        { text: '记下此悟', out: { cult: 1.44e5, frag: { gf_taixuan: 1 }, news: '滴水穿石之理，录之于卷，常看常新。' } },
      ],
    },
    {
      id: 'eva_yidugongdu', title: '以毒攻毒', icon: '药', w: 3, once: false, hidden: true,
      trigger: 'cultivate', minRealm: 2, cond: 'tox50',
      text: '丹毒缠体，寻常法门难以拔除。游方郎中献上一株腐心草，称可以毒攻毒，只是凶险非常。',
      choices: [
        { text: '吞服腐心草', out: { cult: 1.152e6, toxicity: 15, news: '以毒攻毒，险中求进——此番赌赢了。' } },
        { text: '闭死关排毒', out: { cult: 0, toxicity: -30, news: '死关三日，毒尽而出。' } },
        { text: '谢绝郎中', out: { cult: 2.88e5, news: '江湖郎中，安知不是卖假药的。' } },
      ],
    },
    {
      id: 'eva_zhalu', title: '炸炉悟道', icon: '炉', w: 3, once: false, hidden: true,
      trigger: 'any', minRealm: 1, cond: 'explode5',
      text: '又是一炉丹药炸成灰烬。望着满地焦黑，你忽然笑出了声——火性之烈，原来与剑意相通。',
      choices: [
        { text: '静心体悟', out: { cult: 7.2e4, frag: { gf_taixuan: 2 }, news: '炸炉五次，炸出一番道理，也算不亏。' } },
        { text: '清扫丹房', out: { mat: { herb_lingzhi: 1 }, cult: 2.4e4, news: '灰烬里翻检，竟有残存的药材。' } },
      ],
    },
    {
      id: 'eva_guren', title: '故人识君', icon: '缘', w: 3, once: true, hidden: true,
      trigger: 'any', minRealm: 1, cond: 'reincarn1',
      text: '街市之上，一老妪死死盯着你看，良久颤声道：「像，太像了……你前世，于我有恩。」',
      choices: [
        { text: '认下这段前缘', out: { rootWash: 1, cult: 1.44e5, news: '前世因，今生果，老妪以一匣旧物相赠。' } },
        { text: '只道认错人了', out: { lingYu: 2, cult: 7.2e4, news: '老妪怔怔良久，蹒跚而去。' } },
      ],
    },
    {
      id: 'eva_mingzhen', title: '名震一方', icon: '名', w: 2, once: true, hidden: true,
      trigger: 'any', minRealm: 6, cond: 'power10m',
      text: '你的名号渐传渐远，四方修士登门拜访，贺礼堆满了半间屋子。',
      choices: [
        { text: '广开山门待客', out: { lingShi: 5e4, lingYu: 3, cult: 1.08e8, news: '高朋满座，蓬荜生辉。' } },
        { text: '闭门谢客清修', out: { cult: 2.16e8, lingYu: 1, news: '盛名之下，你选了清净。' } },
      ],
    },
  ];

  /* 登记进全局事件池（契约 §9.7：a/b 两文件统一 push 到 XG.data.events） */
  (XG.data.events = XG.data.events || []).push(...list);
})();
