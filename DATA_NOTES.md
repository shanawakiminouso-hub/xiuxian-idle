# DATA_NOTES —— 数据层交叉引用审计与权威 id 速查表

> 本文件是 CONTRACTS.md 的**数据层补充契约**，供后续系统层（sys/）与联调代理使用。
> 范围：`js/data/*.js`（names / gongfa / pills / pets / equips / world / events_a / events_b / achievements / fellows）。
> 审计方式：node 临时脚本按 index.html 顺序加载 core/util.js + 全部 data 文件后逐项断言（地图↔事件、材料、丹药/残篇、套装、check.k、契约一致性），最终 **1299 条断言全部通过**；10 个 data 文件均 `node --check` 通过。

---

## 一、修正清单（id 漂移修复记录）

### A. 地图 ↔ 事件（统一为 world.js 实际地图 id）

**mapId 修正（events_b.js，9 处）**——world.js 无 `wanmo/bingyuan/huoyan` 三张图：

| 事件 | 原 mapId | 改为 |
|---|---|---|
| evb_wm_1/2/3 | wanmo（万魔窟） | wanyao（万妖岭） |
| evb_by_1/2/3 | bingyuan（玄冰原） | beihai（北海冰原） |
| evb_hy_1/2/3 | huoyan（离火泽） | fentian（焚天谷） |

**事件 id 改名（events_b.js，25 个）**——对齐 world.js 各图 `events[]` 预留位 `evb_<mapId>_01~03`：

| 原 id | 新 id |
|---|---|
| evb_qy_1/2/3 | evb_qingyun_01/02/03 |
| evb_cw_1/2/3 | evb_cangwu_01/02/03 |
| evb_wm_1/2/3 | evb_wanyao_01/02/03 |
| evb_by_1/2/3 | evb_beihai_01/02/03 |
| evb_hy_1/2/3 | evb_fentian_01/02/03 |
| evb_ym_1/2/3 | evb_youming_01/02/03 |
| evb_ym_4 | evb_youming_04 |
| evb_ly_1/2/3 | evb_longyuan_01/02/03 |
| evb_gx_1/2/3 | evb_guixu_01/02/03 |

连锁引用同步更新 1 处：`evb_youming_03` 的 `out.chain: 'evb_ym_4'` → `'evb_youming_04'`。
其余连锁引用（含跨文件 `eva_jianmeng→evb_xuanyuan_1`、`eva_longyin→evb_longyuan_1`、`eva_guijia→evb_gui_xu_1`）经核对均有效，未改动。

### B. 材料引用（就近修正为已登记 id，共 25 处）

**events_a.js（4 处）**

| 原 id | 改为 | 说明 |
|---|---|---|
| beast_neidan ×2 | beast_yaodan | 妖兽内丹（world.js 登记） |
| gem_bingpo | gem_hanyu | 寒玉，寒潭语义贴合 |
| gem_leijing | gem_zijing | 紫晶（"蕴雷光于内"，雷晶同义） |

**events_b.js（21 处）**

| 原 id | 改为 | 出现次数 |
|---|---|---|
| sp_qingyun | sp_qingyun_tea | 1 |
| sp_cangwu | sp_cangwu_wood | 1 |
| sp_wanmo | sp_yaoling_guo | 2 |
| sp_bingyuan | sp_beihai_sui | 1 |
| sp_huoyan | sp_fentian_huo | 2 |
| sp_youming | sp_youming_hua | 1 |
| sp_longyuan | sp_longyuan_lin | 1 |
| sp_guixu | sp_guixu_bi | 1 |
| ore_hanyu | ore_hantie | 1 |
| gem_yeming | gem_mingzhu | 3 |
| gem_xingsui | gem_xinghui | 1 |
| beast_neidan | beast_yaodan | 3 |

**补登记（1 种）**：`herb_yaowang`（万年药王，icon 🍀，grade 8）补入 `pills.js` 灵草表八阶段——事件 eva_yaowang 的奖励无同义已登记 id。

### C. 丹药 / 残篇引用（events 的 out.pill / out.frag）

**丹药（4 处，改指 pills.js 真实丹方 id）**

| 原 id | 改为 | 备注 |
|---|---|---|
| pill_peiyuan ×3 | pill_juqi | 聚气丹；同步改文案"培元丹"→"聚气丹" |
| pill_qingxin ×1 | pill_qingdu | 清毒散（解毒）；同步改文案"清心丹"→"清毒散" |

**残篇·普通引用（方案 a：改事件指向 gongfa.js 真实功法 id，共 17 处）**

| 原虚构 id | 改为 | 出现位置 |
|---|---|---|
| gf_xinglan_jue | gf_zixiao（紫霄神雷策） | eva_xingdou |
| gf_yuhua_canjuan ×2 | gf_qingxin（清心诀） | eva_yedu / eva_qisou |
| gf_wuming_jianjuan ×5 | gf_wanjian（万剑朝元诀） | eva_merchant_1/2/3 商人连锁 |
| gf_guyi_canpian ×5 | gf_taixuan（太玄洞真录，getHint 恰为"洞府石匣"） | eva_shibei/shishi/yifu/maose/zhalu |
| gf_qingfeng | gf_wanjian | evb_qingyun_02 |
| gf_hanbing | gf_xuanbing（玄冰真解） | evb_beihai_01 |
| gf_longyin | gf_longxiang（龙象镇岳功） | evb_longyuan_03 |
| gf_xinghe | gf_cangling（藏灵纳海诀，getHint 恰含"归墟旧闻"） | evb_guixu_02 |
| gf_cangjian | gf_wanjian | evb_swordtalk_1 |
| gf_canjuan | gf_qingxin | evb_canye_1 |

**残篇·连锁终点（方案 b：gongfa.js 补登隐藏功法，2 部）**

| 新增 id | 名称 | grade | hidden | 解锁 | 残篇来源 |
|---|---|---|---|---|---|
| gf_xuanyuan | 轩辕剑经 | 9 | true | unlock 大乘1层（realmIdx 7, layer 1） | evb_xuanyuan_3（轩辕剑冢连锁终点）×2 |
| gf_guixu | 归墟万法经 | 9 | true | unlock 大乘1层（realmIdx 7, layer 1） | evb_gui_xu_3（归墟连锁终点）×2 |

> 两部均走 `unlock` 而非 `cond`：**不占**契约 §9.2 的 5 个 cond 隐藏名额（gf_danjie/gf_qingtian/gf_wanling/gf_hongyun/gf_wangsheng 保持原样）。补登后功法总数 26→28，仍满足契约 ≥20。

### D. 复核无需改动项

- equips `sets[].pieces`（7 套共 32 件）全部命中 `bases` id；
- fellows `lines` 结构（dynamic 10 类 / discuss 10 性格 / help 等 7 类）与契约 §9.9 一致，文案 236 条 ≥200；
- world `marketRules`（refreshSec 600 / slots 6 / priceByPersona 覆盖全部 10 性格 / priceByRelation / stock）结构完整；
- pets evo.to / evo.item、bloods[].skill、gongfa bonds.need / meridians.need 引用全部有效；
- 跨文件连锁起点 evb_xuanyuan_1 / evb_longyuan_1 / evb_gui_xu_1 均存在。

---

## 二、最终权威 id 速查表

### 2.1 地图 id（9 个，以 world.js 为准）

| id | 名称 | unlock | hidden | 进入 cond | 特产 sp | 专属事件 |
|---|---|---|---|---|---|---|
| qingyun | 青云山 | 筑基1层（realmIdx 1） | 否 | — | sp_qingyun_tea | evb_qingyun_01~03 |
| luoxia | 落霞谷 | 筑基6层 | 否 | — | sp_luoxia_jing | evb_luoxia_01~03 |
| cangwu | 苍梧之野 | 金丹1层 | 否 | — | sp_cangwu_wood | evb_cangwu_01~03 |
| wanyao | 万妖岭 | 元婴1层 | 否 | — | sp_yaoling_guo | evb_wanyao_01~03 |
| beihai | 北海冰原 | 化神1层 | 否 | — | sp_beihai_sui | evb_beihai_01~03 |
| fentian | 焚天谷 | 炼虚1层 | 否 | — | sp_fentian_huo | evb_fentian_01~03 |
| youming | 幽冥涧 | 合体1层 | 否 | — | sp_youming_hua | evb_youming_01~03（+连锁续章 evb_youming_04，w:0） |
| guixu | 归墟 | 大乘1层 | **是** | `youming_exp_30`（幽冥涧派遣满 30 次） | sp_guixu_bi | evb_guixu_01~03 |
| longyuan | 龙渊 | 渡劫1层 | **是** | `guixu_bi_5`（归墟残璧 ×5 献祭） | sp_longyuan_lin | evb_longyuan_01~03 |

> 注意区分：地图专属事件为 `evb_<mapId>_01~03`（两位数字）；
> 同名隐藏连锁为 `evb_longyuan_1/2/3`、`evb_gui_xu_1/2/3`、`evb_xuanyuan_1/2/3`（一位数字，不同 id 空间，不冲突）。
>
> 掉落补充：万妖岭起各图 drops.mat 另含 pills.js 主登记的丹方灵草（按图阶配品：
> 万妖岭 youming/fengwei/zhuguo，北海 longxu/hansui/yusui，焚天 dihuo/leiming/taiyang，
> 幽冥 xueling/taiyin，归墟 xukong/tianxing/wudao/hundun，龙渊 longxian/fengxue/xuanwu/puti/busi）；
> 灵田二阶池含 herb_yuehua。四阶以上灵草以此+坊市(≤g4)+道友赠礼(≤g4)为全部来源。

### 2.2 成就 check.k 全清单（42 种，achievements.js，由 collection.js 统计器实现同名 key）

**契约 §9.8 原列（24 种）**

| k | 统计口径 |
|---|---|
| realmIdx | 玩家当前大境界序号（0~9） |
| layer | 当前小境界层数（取历史峰值） |
| totalCult | 累计获得修为总量 |
| gongfaOwn | 已习得功法数量 |
| gongfaMaxLv | 单门功法最高等级 |
| pillMake | 累计成丹数 |
| pillExplode | 累计炸炉次数 |
| equipEnhMax | 单件装备最高强化等级 |
| equipGod | 持有神品（grade 4）装备件数 |
| petOwn | 持有灵宠只数 |
| petGrade5 | 育成五品神兽只数 |
| caveLvSum | 洞府建筑等级之和 |
| mapUnlock | 已解锁历练地图数 |
| towerLayer | 镇妖塔历史最高层 |
| pvpWins | 论剑累计胜场 |
| fellowFavorMax | 道友最高好感值 |
| fellowPartner | 已结道侣数（0/1） |
| reincarn | 轮回次数 |
| codexPct | 图鉴完成度百分比 |
| newsCount | 累计传闻条数 |
| helpFellow | 累计帮助道友次数 |
| nightLogin | 连续 0~6 点上线天数 |
| rich | 灵石 >1e6 则为 1 |
| tox100 | 丹毒达 100 则为 1 |

**achievements.js 新增（18 种，collection.js 必须实现）**

| k | 统计口径 |
|---|---|
| alchLv | 炼丹师等级（state.alchemy.lv） |
| advDone | 已完成奇遇事件数（state.adventure.done 计数） |
| breakFailStreak | 连续突破失败次数（成功清零；取历史峰值） |
| expeditionCount | 累计派遣次数（expedition 系统累加） |
| fellowEggFavorMax | 彩蛋名道友（names.js egg 表）中的最高好感 |
| fellowRival | 当前宿敌（relation='rival'）数量 |
| forgeMake | 累计打造装备件数（forge 系统累加） |
| gongfaCreateCount | 自创功法数量（state.gongfa.custom.length） |
| gongfaHidden | 已习得隐藏功法数（owned 中 hidden=true） |
| guardWave | 守关历史最高波次 |
| hiddenMapUnlock | 已解锁隐藏地图数（hidden=true 且已解锁） |
| petAwaken | 血脉觉醒宠物数 |
| petBreed | 灵宠繁殖次数 |
| playerEggName | 玩家名字命中彩蛋名表则为 1 |
| pvpPts | 论剑积分（历史峰值） |
| spiritRootMut | 灵根变异（spiritRoot.mut 非 null）则为 1 |
| towerHiddenBoss | 击败爬塔隐藏 BOSS 次数（每 33 层一只） |
| totalOnlineH | 累计在线小时（totalOnlineSec/3600 取整） |

> 成就现状：共 80 条，hidden=10（ac_gf_h1 / ac_pill_h1 / ac_pill_h2 / ac_dun_h1 / ac_fel_h1 / ac_fel_h2 / ac_fun_h1~h4）。

### 2.3 新增 / 补登记清单

- **功法（gongfa.js，总数 28）**：`gf_xuanyuan` 轩辕剑经（g9 隐藏，unlock 大乘1层，atkPct 6 / atkFlat 200 / breakSuccPct 1）；`gf_guixu` 归墟万法经（g9 隐藏，unlock 大乘1层，cultRatePct 6 / breakSuccPct 1.5 / defPct 4）。二者残篇仅产自对应隐藏连锁终点。
- **材料（pills.js 灵草表）**：`herb_yaowang` 万年药王（grade 8）。
- **材料重名双登记备忘（均为有效 id，勿再合并）**：
  - `beast_yaodan`（world.js，妖兽内丹 g2，历练掉落）vs `beast_dan`（pets.js，妖兽内丹 g2，进化专用）——同名不同 id；**事件/掉落统一用 beast_yaodan，宠物进化统一用 beast_dan**。
  - `herb_longxian`（pills.js，龙涎草 g8，丹方用）vs `herb_longxiancao`（world.js，龙涎草 g3，地图掉落）——同名不同 id，各自语义独立。
  - `ore_xuantie` 由 world.js 与 equips.js 双登记（同名同 grade 1，描述略异；后加载者覆盖，数值无冲突）。
  - `gem_zijing`：world.js 登记为 g1 宝石材料；equips.js 的镶嵌宝石基座同名，背包实例为 `gem_zijing_1..5`（equips 已登记该 5 个等级 id），命名空间复用但不冲突。

### 2.4 事件触发器与 cond 实际使用值（101 条事件：eva×52 + evb×49）

**trigger（契约三值，全部在用）**：`cultivate`×15、`any`×48、`explore`×38。

**cond（契约九值，全部在用）**：

| cond | 次数 | 语义（adventure 系统判定） |
|---|---|---|
| night | 3 | 0~6 点 |
| tox50 | 3 | 丹毒 ≥50 |
| stuck3d | 2 | 3 天未破境 |
| poor | 2 | 灵石 <100 |
| fellow_partner | 1 | 已结道侣 |
| reincarn1 | 1 | 轮回 ≥1 次 |
| explode5 | 1 | 炸炉 ≥5 次 |
| rich | 1 | 灵石 >1e6 |
| power10m | 1 | 战力 >1e7 |

> 隐藏图进入 cond（expedition 系统判定，与事件 cond 不同命名空间）：`youming_exp_30`、`guixu_bi_5`。
> 隐藏功法解锁 cond（gongfa 系统判定）：`alchemy_explode_10` / `tower_33` / `fellow_ouhuang_gift` / `reincarn_1` / `codex_pet_20`。

### 2.5 事件 out 结果键清单（实际出现 13 种）

`cult`（修为）/ `lingShi` / `lingYu` / `mat:{id:n}`（材料）/ `pill:{id:n}`（成品丹，键=pills.js 丹方 id）/ `frag:{id:n}`（功法残篇，**键=gongfa.js 功法 id**）/ `egg`（灵宠蛋数）/ `toxicity`（丹毒增减，正加负减）/ `rootWash`（洗灵根次数）/ `meridian`（点亮穴位数）/ `news`（传闻文案）/ `chain`（后继事件 id）/ `hiddenEnd`（隐藏结局文案）。

> 契约允许的 `ach`（成就 id）当前 **0 使用**；adventure 系统可按契约支持，实现时注意 achievements.js 的 id 前缀为 `ac_*`。
> req 消耗键实际使用：`lingShi` / `mat:{id:n}` / `realmIdx`（最低大境界）。

### 2.6 事件引用白名单（系统层实现结算时以此为准）

- out.pill 实际使用：`pill_juqi`、`pill_qingdu`。
- out.frag 实际使用：`gf_qingxin`、`gf_wanjian`、`gf_taixuan`、`gf_zixiao`、`gf_xuanbing`、`gf_longxiang`、`gf_cangling`、`gf_xuanyuan`、`gf_guixu`（9 个，全部存在于 gongfa.js）。
- out.mat 实际使用 25 种材料 id，全部存在于 `XG.data.mats`（主登记：world.js=ore/gem/beast/sp + 9 种 herb 保底，pills.js=herb_*，pets.js=6 种 beast_* 进化材，equips.js=强化矿 + 镶嵌宝石等级 id）。
- 连锁组（≥6）：merchant×3、ruhuo×2、古洞遗府×3、灵狐报恩×3、鲛人×2（evb_youming_03→04）、轩辕剑冢×4（eva_jianmeng 起）、龙渊×4（eva_longyin 起）、归墟×4（eva_guijia 起）——共 8 组；含 hiddenEnd 的终点 6 处（merchant_3 / eva_yifu / eva_baihu_3 / evb_xuanyuan_3 / evb_longyuan_3 / evb_gui_xu_3）。
