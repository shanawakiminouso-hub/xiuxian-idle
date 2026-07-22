# 修仙放置游戏 · 全局开发契约（CONTRACTS）

> 所有开发者（人类或 AI 子代理）**必须先读完本文件再动手**。
> 本文件是唯一的接口事实来源。任何文件不得与本契约冲突；如需扩展，按本文件既定约定扩展，不得另起炉灶。
> 项目根目录：`E:/kimi/修仙`

## 0. 技术形态（硬性约定）

- 纯前端、无构建步骤、无外部依赖、无网络请求。**禁止**使用 ES Module `import/export`、禁止 CDN。
- 全部脚本以经典 `<script src>` 按顺序加载，共享全局命名空间 `window.XG`（简称 `XG`）。
- 必须支持以 `file://` 协议直接双击 `index.html` 运行（Chrome / Edge）。
- 所有代码含中文注释；文案为简体中文古风。
- 加载顺序（index.html 中 script 标签顺序）：
  1. `js/core/util.js` → `js/core/bus.js` → `js/core/cfg.js` → `js/core/state.js` → `js/core/save.js` → `js/core/stats.js` → `js/core/offline.js`
  2. `js/data/*.js`（任意顺序，内部只做数据登记）
  3. `js/sys/*.js`（任意顺序，只做注册，不在顶层执行跨系统调用）
  4. `js/ui/ui-core.js` → `js/ui/ui-tabs-*.js`
  5. `js/main.js`（最后，负责启动）
- 每个文件结构：
  ```js
  /* 文件名：一句话说明 */
  (function () {
    'use strict';
    const XG = (window.XG = window.XG || {});
    // ... 本文件内容
  })();
  ```

## 1. 全局命名空间结构

```js
XG.util     // 工具函数（core/util.js）
XG.bus      // 事件总线（core/bus.js）
XG.cfg      // 全部数值/平衡常量（core/cfg.js）
XG.state    // 唯一游戏状态对象（core/state.js 建立默认值）
XG.save     // 存档 API（core/save.js）
XG.stats    // 属性聚合（core/stats.js）
XG.offline  // 离线结算（core/offline.js）
XG.data     // 所有数据表挂载点（data 层填充）
XG.sys      // 所有系统模块挂载点（sys 层注册）
XG.ui       // UI 框架 API（ui 层实现）
```

## 2. 数值与格式化

- 大数值一律用 JS `number`（double，可表达到 ~1.8e308，精度损失可接受）。**禁止**引入第三方大数库。
- `XG.util.fmt(n)`：中式单位缩写——
  单位表：`万1e4 亿1e8 兆1e12 京1e16 垓1e20 秭1e24 穰1e28 沟1e32 涧1e36 正1e40 载1e44`；
  ≥1e48 时用科学计数法 `1.23e+48`；<1e4 时保留最多 2 位小数。返回字符串。
- `XG.util.fmtInt(n)`：向下取整后 fmt。`XG.util.fmtTime(sec)`：`3时20分` / `45分10秒`。
- 伤害/战力比较等逻辑运算直接用 number 原值，不要用格式化后的字符串。

## 3. 工具 API（core/util.js 实现，全体共用）

```js
XG.util.rand(min, max)          // 浮点 [min,max)
XG.util.randInt(min, max)       // 整数闭区间 [min,max]
XG.util.chance(p)               // p∈[0,1] 概率返回 true
XG.util.pick(arr)               // 等概率取一个
XG.util.pickN(arr, n)           // 不放回取 n 个
XG.util.weighted(arr, wkey='w') // 按元素[wkey]权重取一个
XG.util.clamp(v, a, b)
XG.util.uid()                   // 短唯一 id 字符串
XG.util.shuffle(arr)            // 返回新数组
XG.util.mulberry32(seed)        // 返回可复现随机函数（周轮换/赛季用）
XG.util.weekId(date=new Date()) // 返回 'YYYY-Www' 字符串（赛季/周词缀种子）
XG.util.fmt / fmtInt / fmtTime  // 见 §2
XG.util.deepClone(o)            // JSON 深拷贝
XG.util.esc(s)                  // HTML 转义（插文案防注入）
```

## 4. 事件总线（core/bus.js）

```js
XG.bus.on(evt, fn)  // 返回取消订阅函数
XG.bus.off(evt, fn)
XG.bus.emit(evt, payload)
```
标准事件（各系统按此收发，可自定义新事件但不得重名改义）：

| 事件 | payload | 时机 |
|---|---|---|
| `tick` | `{dt}` 秒 | 主循环每秒 |
| `res:changed` | — | 资源/修为变动后（节流刷新顶栏） |
| `news` | news 对象 | 新传闻产生（ui ticker 消费） |
| `realm:layer` | `{realmIdx, layer}` | 小境界提升 |
| `realm:break` | `{realmIdx, ok}` | 大境界突破结果 |
| `fx:breakthrough` | `{realmIdx}` | 触发全屏突破特效 |
| `modal:offline` | offline 报告 | 打开离线结算弹窗 |
| `ach:done` | `{id}` | 成就达成 |
| `fellow:news` | fellow 相关 | 道友大事件（挚友/宿敌判定用） |
| `save:dirty` | — | 请求尽快存档 |
| `codex:new` | `{kind, id}` | 图鉴新增 |

## 5. 境界与核心数值（core/cfg.js 实现 `XG.cfg`）

```js
XG.cfg.REALMS = [
  // 顺序即进度；baseCost=该大境界每层突破所需修为基数；rate=该境界基础修为/秒
  // baseCost 已按裸速全境耗时目标重调（金丹≈1天/元婴≈2天/化神≈3天/炼虚≈3.5天/合体~渡劫≈4天）
  { id:'lianqi',  name:'炼气', baseCost:10,   rate:10,   breakRate:0.65 },
  { id:'zhuji',   name:'筑基', baseCost:4e3,  rate:40,   breakRate:0.60 },
  { id:'jindan',  name:'金丹', baseCost:4.3e4, rate:160,  breakRate:0.55 },
  { id:'yuanying',name:'元婴', baseCost:3.8e5,rate:700,  breakRate:0.50 },
  { id:'huashen', name:'化神', baseCost:2.4e6, rate:3e3,  breakRate:0.45 },
  { id:'lianxu',  name:'炼虚', baseCost:1.23e7,rate:1.3e4,breakRate:0.40 },
  { id:'heti',    name:'合体', baseCost:6.5e7, rate:6e4,  breakRate:0.35 },
  { id:'dacheng', name:'大乘', baseCost:2.7e8, rate:2.5e5,breakRate:0.30 },
  { id:'dujie',   name:'渡劫', baseCost:1.08e9,rate:1e6, breakRate:0.25 },
  { id:'feisheng',name:'飞升', baseCost:Infinity, rate:0, breakRate:0 },
];
XG.cfg.LAYERS = 10;                    // 每个大境界 10 层小境界
XG.cfg.layerCost(realmIdx, layer)      // = baseCost * layer^2.2（返回 number）
XG.cfg.OFFLINE_CAP_H = 8;              // 离线收益上限 8 小时
XG.cfg.BREAK_FAIL_BONUS = 0.08;        // 突破失败不清零，保底成功率逐次 +8%（成功清零）
XG.cfg.BREAK_PILL_BONUS = 0.15;        // 每颗破境丹 +15%（最多用 3 颗）
XG.cfg.NEWS_CAP = 200;                 // 传闻缓存上限
XG.cfg.FELLOW_COUNT = [30, 50];        // 开局道友数量区间
XG.cfg.POWER = s => s.atk * 2 + s.def * 1.5 + s.hp * 0.2 + s.spd * 10;  // 战力公式（唯一）
XG.cfg.SAVE_KEY = 'xg_save_v1';
```
- 玩家/道友境界统一表示：`{ realmIdx: 0..9, layer: 1..10 }`。
- 系统解锁（`XG.cfg.UNLOCKS`，key=系统 id，value={realmIdx, layer} 或 {days:N}）：
  - `gongfa` 炼气1层；`adventure` 炼气2层；`fellows` 炼气3层（提前，让传闻流尽早热闹）；`pets` 炼气5层；
  - `cave` 筑基1层；`expedition` 筑基1层；`alchemy` 筑基5层；`market` 筑基5层（坊市）；
  - `forge` 金丹1层；`dungeon_tower` 金丹1层；`pvp` 金丹5层；`petBreed` 元婴1层；
  - `gongfaCreate` 化神1层（自创功法）；`dungeon_guard` 化神1层；`dungeon_hunt` 炼虚1层（限时寻宝）；
  - `hiddenMaps` 炼虚1层（隐藏区域提示）；`tribulation` 大乘1层（渡劫预告）；`reincarn` 渡劫10层。
- 系统可见性统一由 `XG.cfg.isUnlocked(sysId)` 判定（读 XG.state 玩家境界/创角天数）。

## 6. 状态 Schema（core/state.js 建立默认值；save.js 做版本合并）

```js
XG.state = {
  ver: 1, createdAt: 0, lastSeen: 0, totalOnlineSec: 0,
  player: {
    name: '无名散修', realmIdx: 0, layer: 1, cult: 0,       // cult=当前累积修为(用于突破消耗)
    breakFails: 0, cultivateMode: 'dazuo',                   // dazuo打坐|biguan闭关|dunwu顿悟
    spiritRoot: { type:'jin', grade:3, mut:null },           // 五行 + 变异(null|bing|lei|feng|an|guang|hundun)
    meridians: { lit: [] },                                  // 已点亮穴位 id 列表（data 侧定义穴位表）
    reincarn: 0, identity: null, talents: {}, rp: 0,         // 轮回: 次数/转世身份/天赋树/轮回点
    toxicity: 0,                                             // 丹毒 0~100
    partner: null,                                           // 道侣 fellow uid
  },
  res: { lingShi: 0, lingYu: 0 },                            // 灵石 / 灵玉
  inv: { mat: {}, pill: {}, frag: {}, egg: 0 },              // 材料/丹药/功法残篇/灵宠蛋 {id:count}
  equips: { list: [], slots: { weapon:null, head:null, body:null, boots:null, ring:null, talisman:null } },
  gongfa: { owned: {}, active: [], frag: {}, custom: [] },   // owned:{id:{lv,prof}}, active:已装备功法id(≤4)
  alchemy: { lv: 1, exp: 0, furnace: 1, fire: null, fires: {}, known: [] }, // known=已习得丹方id
  pets: { list: [], team: [], jobs: {} },                    // team≤3 出战; jobs:{petUid: buildingId|'explore'}
  cave: { lv: { jlz:1, lt:0, df:0, qs:0, sl:0, lm:1 }, layout: {} },        // 建筑等级 + 3x3 摆放 {格位: buildingId}
  expedition: { active: [], log: [] },                       // 进行中派遣 {mapId, petUids, endAt, dur}
  dungeon: { tower: 1, towerBest: 1, guard: 0, hunt: 0, sweepFree: 3, sweepDay: '', week: '', affixes: [] },
  pvp: { pts: 1000, wins: 0, losses: 0, season: '', claimed: '', history: [] },
  fellows: [],                                               // 见 §11
  news: [],                                                  // {t, cat, text, imp} 新→旧, 上限 NEWS_CAP
  ach: {},                                                   // {id: {done:1, claimed:1}}
  codex: { gongfa: [], pill: [], pet: [], equip: [], fellow: [] },
  adventure: { done: {}, chains: {}, cd: 0 },                // 奇遇: 已做once事件/连锁进度/冷却
  daily: { day: '', discussAt: {}, help: { at: 0, list: [] }, gift: 0 }, // 冷却/求助记录（论道 discussAt、求助 help.at、双修 dualAt 均为时间戳）
  settings: { newsCollapsed: false, sound: false },
};
```
- 材料 id 命名空间：`herb_*`（灵草）/ `ore_*`（矿石）/ `gem_*`（宝石）/ `beast_*`（妖兽材料）/ `sp_*`（地图特产）。
- 所有给玩家加资源必须走 `XG.sys.core?` 不存在——统一用工具函数（core/state.js 实现）：
  `XG.addRes({lingShi, lingYu, mat:{id:n}, pill:{id:n}, frag:{id:n}, egg})`（负数即扣除，自动 emit `res:changed` + `save:dirty`）；`XG.hasRes(cost)` 返回 bool。

## 7. 属性聚合（core/stats.js）

每个系统可实现 `getMods()` 返回 flat 对象，**语义如下**（同名键跨系统累加）：
```js
{
  cultRatePct, atkPct, defPct, hpPct, dropPct, alchSuccPct, forgeSuccPct,
  breakSuccPct, offlineHours, workPct,      // 全部为“加成百分数”，加和
  atkFlat, defFlat, hpFlat,                 // 固定值加和
}
XG.stats.calc()  // 返回最终面板:
// {
//   cultRate: 境界rate * layer系数(1+0.12*(layer-1)) * (1+cultRatePct/100),
//   atk/def/hp/spd: 境界基值(见cfg) * (1+pct/100) + flat,
//   power: 按 XG.cfg.POWER,
//   breakRate: 大境界breakRate + breakFails*8% + breakSuccPct/100 (封顶95%),
//   offlineCapSec: (8+offlineHours)*3600,
//   ... 其余原样透传
// }
XG.stats.get()   // 缓存；任何 getMods 来源变化后调用 XG.stats.invalidate()
```

## 8. 存档与离线（core/save.js, core/offline.js）

```js
XG.save.save()                 // 序列化 state → localStorage（自动每15s + beforeunload + visibilitychange）
XG.save.load()                 // 读档并做默认值深合并（容错缺字段），返回 bool 是否有档
XG.save.reset()                // 清档重开
XG.save.export()               // 返回 base64 字符串
XG.save.import(str)            // 返回 {ok, err?}
XG.offline.settle()            // 启动时调用：dt=min(now-lastSeen, cap)；
   // 依次调用各系统 offline(dt)（若有）；道友离线模拟；聚合返回报告对象
   // {dt, capped, cultGain, resGain:{}, pillGain:{}, events:[简讯], fellowNews:[...], truncated}
   // 若 dt<60s 返回 null（不弹窗）
```
- 报告弹窗由 ui-core 监听 `modal:offline` 展示；main.js 在 settle 后 emit。

## 9. 数据层规范（js/data/*.js，只登记数据，不写逻辑）

登记方式：`XG.data.xxx = ...`。需要进图鉴的表，元素统一含 `{id, name, icon, grade, hidden, desc}`（icon 用单个 emoji/汉字，grade 0凡1灵2宝3仙4神 或品阶 1~9，按表定义）。
材料登记：各数据文件可向 `XG.data.mats = XG.data.mats||{}` 合并 `{id:{name,icon,grade,desc}}`。

### 9.1 `data/names.js`
- `XG.data.names = { surnames:[≥60], givenM:[≥80], givenF:[≥80], daoTitles:[≥30 道号前缀] , egg:[…彩蛋名≥5] }`
- 生成器 `XG.data.genName()`：组合出 ≥200 种不重复古风人名空间（含姓+名，偶发道号），彩蛋名（如「韩立」「叶凡」）以 1% 概率混入。
- 附带 `XG.data.petNames[≥40]`、`XG.data.spiritNames[≥30]`（器灵名）。

### 9.2 `data/gongfa.js` —— `XG.data.gongfa = { list:[≥20], bonds:[…], createPool:{…}, roots:[…], meridians:[…] }`
- 功法元素：`{id:'gf_*', name, icon, grade:1..9, hidden:bool(5个true), root:'jin|mu|shui|huo|tu|wuxing', desc, // 文案
  eff:{ /* 每级成长 */ cultRatePct, atkPct, defPct, hpPct, dropPct, alchSuccPct, breakSuccPct ... 任选2~3项 },
  profMax:1000, fragNeed: n, unlock:{realmIdx,layer} 或 cond:'隐藏条件id',
  getHint:'获取途径文案' }`
- 5 种隐藏功法（grade≥8），cond 取值：`'alchemy_explode_10'`（炸炉10次）/ `'tower_33'`（爬塔33层）/ `'fellow_ouhuang_gift'`（欧皇道友赠予）/ `'reincarn_1'`（轮回1次）/ `'codex_pet_20'`（灵宠图鉴20）。逻辑由 gongfa 系统判定。
- `bonds`: `[{id, name, need:[gfId…≥2], eff:{…同eff}, desc}] ≥6 组羁绊`。
- `createPool`：自创功法词库 `{prefix:[≥15], core:[≥15], suffix:[≥15]}` + 规则注释（化神解锁，消耗残篇 roll 词条）。
- `roots`：灵根表 `[{id:'jin|mu|shui|huo|tu|bing|lei|feng|an|guang|hundun', name, w, mult, hidden:bool, desc}]`（五行常见，变异冰雷风暗光稀有，混沌隐藏；mult=修炼加成）。
- `meridians`：穴位表 ≥24 个 `[{id, name, cost(修为), eff:{…}, need:[前置穴位id]}]`，构成 3 条经脉支线。

### 9.3 `data/pills.js` —— `XG.data.pills = { recipes:[≥30], furnaces:[≥6], fires:[≥6], mats:{…} }`
- 丹方：`{id:'pill_*', name, icon, grade:1..9, hidden:bool(≥3), alchLv:炼丹师等级门槛, cost:{mat:{…},lingShi}, time:秒,
  eff:{type:'cult|break|heal|tox|root|atk|def|hp|work|exp', val, dur?:秒}, tox:丹毒量, desc, getHint }`
- 至少覆盖：修为丹×6（逐品阶）、破境丹×4（对应境界段）、疗伤、解毒、洗灵根、根骨提升、宠物经验、打工效率、悟性(顿悟率) 等；3+ 隐藏丹方（cond 解锁：炸炉变异/神秘商人/隐藏地图）。
- `furnaces`：`[{id, name, icon, succ, speed, cost, desc}]`；`fires`：`[{id, name, icon, grade, succ, mutPct, getHint, desc}]`（异火，含 2 个隐藏获取）。
- `mats`：登记 ≥20 种 `herb_*` 材料（含品阶）。

### 9.4 `data/pets.js` —— `XG.data.pets = { species:[≥30], skills:[≥20], personas:[≥8], bloods:[≥6] }`
- 物种：`{id:'pet_*', name, icon, grade:1..5, hidden:bool(≥3), evo:{to:speciesId, lv, item?}|null, blood:'long|feng|qilin|xuanwu|baihu|fan', // 血脉
  base:{atk,def,hp}, apt:['gong|shou|su|cai'] 擅长, w:权重, getHint, desc}`，进化链 ≥8 条（至少 3 条三段链）。
- `skills`：`[{id, name, icon, type:'atk|buff|work|heal', eff:{…}, w, desc}]`。
- `personas`：`[{id, name, w, workPct, fightPct, desc}]`（性格影响打工/战斗）。
- 资质（aptitude）在逻辑层 roll：1~100，分 废/凡/良/优/极/天赐 六档；血脉觉醒规则注释（血脉纯度≥60 可觉醒，+50% 属性 & 解锁隐藏技能）。

### 9.5 `data/equips.js` —— `XG.data.equips = { bases:[…], affixes:[≥30], sets:[≥6], gems:[≥6], spirits:{…} }`
- `bases`：部位(weapon/head/body/boots/ring/talisman)× 品阶梯度 ≥18 个底材 `{id, name, icon, slot, grade, base:{atk?|def?|hp?}, desc}`。
- `affixes`：`[{id, name, kind:'atk|def|hp|crit|spd|drop|cult|work|alch', min, max(%或flat 注释), grades:[可出现的装备grade], w}]`。
- `sets`：`[{id, name, icon, pieces:[baseId…], eff2:{…}, eff4:{…}, desc}]`（套装 2/4 件效果）。
- `gems`：`[{id, name, icon, eff:{…}, lv:1..5 可合成, cost}]`。
- `spirits`：器灵规则 `{names 由 names.js, personas:[≥6], skills:[≥8], wakeCond:'神器grade4 强化+15', desc}`。
- 强化/升星成本公式写在 `XG.data.equips.formula = {enhanceCost(lv), starCost(star), maxStar:10, maxEnh:…}`（函数）。

### 9.6 `data/world.js` —— `XG.data.world = { maps:[≥8], dungeons:{…}, marketRules:{…} }`
- `maps`：`{id, name, icon, unlock:{realmIdx,layer}, hidden:bool(≥2), power:建议战力, dur:派遣时长档[1分,3分,10分], drops:{mat:{id:[min,max],w}, pill?, frag?, eggChance, recipeChance}, sp:'sp_* 特产id', events:['地图专属事件id…≥3'], desc}`；≥8 张（现 9 张：7 普通+2 隐藏：归墟/龙渊，隐藏图进入条件写在 `cond`，由 expedition 判定）。
- `dungeons`：`{ tower:{affixPool:[≥12 词缀 {id,name,eff,desc}], hiddenBossEvery:33, rewards(layer)→公式注释}, guard:{waves:[…≥10 档]}, hunt:{dur:300, pools:[…]} }`。
- `marketRules`：坊市 `{refreshSec:600, slots:6, priceByPersona:{…奸商×1.3/挚友×0.8…}, stock:{…生成规则注释}}`。

### 9.7 `data/events_a.js` + `data/events_b.js` —— 奇遇事件池合计 ≥80 条
- 统一 push 到 `XG.data.events = XG.data.events || []`；a 文件 id 前缀 `eva_*`（≥45 条，主打修炼/日常/道友偶遇），b 文件 `evb_*`（≥40 条，主打历练专属/隐藏/彩蛋）。
- 元素：
  ```js
  { id, title, icon, w:权重, once:bool, hidden:bool,
    trigger:'cultivate|explore|any', mapId?:'限该地图', minRealm?:0..9, cond?:'内置条件id(见下)',
    text:'事件描述（古风，2~4句）',
    choices:[ { text, req?:{mat?|lingShi?|pill?|realmIdx?}, 
      out:{ cult?, lingShi?, lingYu?, mat?{}, pill?{}, frag?{}, egg?, toxicity?, rootWash?, meridian?, news?:'传闻文案', chain?:'后继事件id', ach?:'成就id', hiddenEnd?:'隐藏结局文案' } } ] }
  ```
- `cond` 内置取值（adventure 系统实现判定）：`'night'`(0-6点) / `'tox50'` / `'stuck3d'`(3天未破境) / `'power10m'` / `'fellow_partner'` / `'reincarn1'` / `'explode5'`（炸炉5次）/ `'rich'`(灵石>1e6) / `'poor'`(灵石<100)。
- 连锁：choice.out.chain 指向另一事件 id（可跨 a/b 文件），连锁 ≥6 组、≥3 条含 hiddenEnd。
- 每个 choice 必须有 out（允许 `{cult:0, news:'…'}` 的“空”结果）；结果数值按 `XG.cfg.REALMS[minRealm].rate*系数` 估算，避免超标/无感。

### 9.8 `data/achievements.js` —— `XG.data.ach = [≥50]`
- `{id:'ac_*', name, icon, desc, hidden:bool(=10), cat:'cult|gongfa|pill|equip|pet|cave|explore|dungeon|pvp|fellow|reincarn|fun',
  check:{k:'指标key', v:目标值}, reward:{lingYu?, lingShi?, eff?{永久属性 key:val}}, }`
- `check.k` 取值（collection 系统实现统计源）：`realmIdx|layer|totalCult|gongfaOwn|gongfaMaxLv|pillMake|pillExplode|equipEnhMax|equipGod|petOwn|petGrade5|caveLvSum|mapUnlock|towerLayer|pvpWins|fellowFavorMax|fellowPartner|reincarn|codexPct|newsCount|helpFellow|nightLogin|rich|tox100 …`（可自行增加，但必须在 collection.js 统计器里实现同名 key）。
- 隐藏成就 10 个：如 `nightLogin` 连续3天 0-6 点上线、`tox100` 丹毒100、`pillExplode` 炸炉20次、`helpFellow` 帮助道友50次、彩蛋名道友好感满 等。

### 9.9 `data/fellows.js` —— `XG.data.fellows = { personas:[≥10], schools:[5], lines:{…≥200条}, marketLines:{…} }`
- `personas`：`[{id:'rexin|gaoleng|aojiao|jianshang|juanwang|xianyu|ouhuang|hualao|chenwen|fuhei', name, w,
  growth:成长倍率区间[min,max], favorGain:好感倍率, pricePct:坊市价格倍率, giftW:赠礼权重, desc}]`（卷王成长快、咸鱼慢、欧皇事件运好、奸商抬价……数值自洽即可）。
- `schools`：`[{id:'jian|fu|zhen|dan|ti', name, icon, desc}]`；克制环：剑→符→阵→丹→体→剑（+15% 战力）。
- `lines`：文案池，结构 `{ dynamic:{突破:[≥15], 获得至宝:[≥12], 炸炉:[≥12], 渡劫失败:[≥10], 结为道侣:[≥8], 卡关:[≥10], 顿悟:[≥10], 隐居:[≥6], 转世:[≥8], 比武:[≥10]},
  discuss:{ rexin:[≥6], gaoleng:[≥6], aojiao:[≥6], jianshang:[≥6], juanwang:[≥6], xianyu:[≥6], ouhuang:[≥6], hualao:[≥6], chenwen:[≥4], fuhei:[≥4] },
  help:[≥8 求助], thanks:[≥8 回赠], refuse:[≥6], war:[≥8 战书], congrats:[≥8 祝贺], partner:[≥8 道侣], playerHilight:[≥10 播玩家] }`
- 文案中可用占位符：`{name}` `{realm}` `{item}` `{map}` `{layer}`；总数 ≥200 条，语气符合性格（傲娇口是心非、话痨超长句、高冷少言寡语……）。

## 10. 系统层规范（js/sys/*.js）

每个系统：
```js
XG.sys.xxx = {
  id:'xxx',
  init() {},              // main.js 启动时按注册顺序调用（读 XG.state 自恢复）
  tick(dt) {},            // 每秒
  offline(dt) {},         // 离线结算（可选），返回报告片段对象（并入总报告）
  getMods() { return {...} },   // 属性聚合（可选，见 §7）
  // 一键操作（可选）：quickCollect()/quickDispatch()/quickSweep() → 返回 {msg:[...]} 汇总
};
```
注册到 `XG.sysOrder.push('xxx')`（保证 main.js 统一调度）。系统间调用只通过 `XG.sys.yyy.apiFn()` 或 bus 事件，禁止直接改对方 state 子树（自己的子树直接读写 XG.state 即可）。各系统必须实现的玩法以任务书为准，深度要求（3层成长/随机/收集/联动/隐藏/分批解锁）逐条落实。
- `sys/cultivation.js`：修为累积、打坐(×1)/闭关(×1.5 不可操作其他界面提示)/顿悟(随机倍数暴击)、突破（消耗修为+破境丹、失败+8%保底）、灵根洗练（消耗灵玉+材料，概率变异）、经脉点亮；offline 收益。
- `sys/gongfa.js`：残篇合成、学习/升级/熟练度(挂机涨)、装备≤4、羁绊检测、隐藏功法条件监听、自创功法 roll。
- `sys/alchemy.js`：炼丹队列(1炉)、成功率=基础+等级+炉+火-丹毒惩罚、炸炉(材料消失概率掉灰)、变异极品(效果×1.5 icon 加★)、丹毒系统(>50 修炼-20%、>80 禁止服丹)、服用、丹方解锁（探索掉落/商店/成就）。
- `sys/forge.js`：打造（耗材料+图纸/底材）、强化、洗练(锁词条)、镶嵌、升星、套装检测、器灵孕育/养成。
- `sys/pets.js`：孵蛋/捕捉(历练掉落)、资质/性格/技能 roll、升级(经验丹/出战)、进化、血脉觉醒、繁殖(两只≥lv30 耗灵石，后代继承血脉+随机资质)、出战加成(getMods)、打工（兽栏/灵田产出）。
- `sys/cave.js`：建筑升级（耗灵石+材料）、产出（灵田草药/h、聚灵阵修炼%、兽栏宠物位）、3x3 风水摆放（相邻相生+5%，五行循环）、灵脉等级=建筑上限。
- `sys/expedition.js`：地图解锁、派遣（选 1~3 宠 + 时长档）、特产/事件触发、隐藏图条件、一键派遣（自动最优）。
- `sys/dungeon.js`：爬塔(无尽，每层战力校验，掉落装备/材料；每33层隐藏BOSS)、守关(波次生存)、限时寻宝(300s 点击/自动寻宝箱，每日前10次免费)、周词缀（mulberry32(weekId) 选 3 条）、扫荡（每日免费30次+灵玉）。
- `sys/pvp.js`：匹配战力±30% 的道友、自动战斗（流派克制+战力+随机）、段位（青铜→仙尊，pts 阈值）、赛季(weekId)结算奖励、战报 history(≤20)。
- `sys/adventure.js`：修炼中每 5~15 分钟 roll 一次（权重×条件过滤）、探索时必触发 1 次/次、连锁队列、once 记录、冷却。
- `sys/fellows.js`：生成 30~50 道友（名字/性格/流派/灵根/成长曲线/状态机 normal|stuck|surge|trib）、离线分 5 分钟步进模拟其修为与事件并产 news、论道(每友10分钟冷却: 修为+好感+按性格出文案)、求助(每4小时一波)/回赠、坊市挂售(market 规则)、宿敌(境界差≤1 大境界 且 power 相近→排行互超时发战书)、挚友(好感≥60 突破送礼)、道侣(好感=100 结缘: 永久 cultRate+10%、专属剧情 news、双修每小时1次)、克制刷屏：news 生成按概率采样。
- `sys/reincarn.js`：渡劫10层后开启飞升挑战（天劫 9 波战力校验+丹药消耗）、成功→轮回: 保留 codex/ach/永久buff/灵玉×20%、重置其余；轮回点 rp=境界累计+成就数/10；天赋树 15 节点 3 支（修炼/战斗/机缘，data 内嵌本文件）；转世身份随机表 ≥12（影响开局灵根/资源/初始功法）。
- `sys/collection.js`：图鉴登记(codex)、完成度 %、成就统计器(§9.8 的 check.k 全实现)、达成发奖+news、隐藏成就不显示条件（显示 ???）。

## 11. 道友数据结构（fellows 系统生成，存 state.fellows）

```js
{ uid, name, persona:'性格id', school:'流派id', root:'灵根id',
  realmIdx, layer, cult,                 // 当前进度（离线推进）
  talent:0.5~2.0, state:'normal|stuck|surge|trib', stateUntil:ts, alive:true,
  favor:0..100, relation:'stranger|friend|rival|partner', metAt,
  lastNews:'最近动态key(论道对话引用)', gifts:0, reincarn:0 }
```

## 12. UI 层规范（js/ui/*.js）

- `ui-core.js` 实现 `XG.ui`：
  ```js
  XG.ui.registerTab({id, name, icon, order, main:bool(底栏≤5), sysId(解锁判定), mount(el), update(dt), unmount()});
  XG.ui.toast(msg, type);            // 顶部轻提示
  XG.ui.modal({title, html, buttons:[{text,cb,cls}], cls});  XG.ui.closeModal();
  XG.ui.confirm(text, cb);
  XG.ui.pop(text, cls);              // 屏幕中央浮动跳字（+1.2万 修为）
  XG.ui.fx.breakthrough();  XG.ui.fx.drop(grade);  XG.ui.fx.shake();
  XG.ui.news(newsObj);               // 推入传闻流
  XG.ui.refreshTop();                // 顶栏刷新
  XG.ui.renderActive();              // 强制重渲染当前 tab
  ```
- 布局（移动优先）：顶部状态栏（头像/境界/修为进度条/修为每秒/灵石/灵玉）→ 传闻滚动条（可折叠，不遮挡）→ 中部 tab 容器 → 底部主导航（修炼/功法/洞府/历练/更多）。
  「更多」以底部弹层网格展示其余系统入口（带解锁条件提示与 `NEW` 角标）。
- 国风水墨风：主色 青#3a7d6b / 墨#2b2b2b / 金#c9a063；字体栈 `"Kaiti SC","STKaiti","KaiTi","Noto Serif SC",serif`；卡片留白+宣纸底纹（纯 CSS）。
- 响应式：≤480px 单列；≥768px 内容限宽 720px 居中，可双列。
- 每个 tab 的 `update(dt)` 每秒被调（仅活跃 tab），渲染用字符串模板 + `el.innerHTML` 即可；输入控件绑定用事件委托，避免每次重渲染丢焦点（输入中的元素跳过重绘）。
- 特效：突破全屏金光+字、grade≥3 掉落彩色光柱 toast、数字跳动 CSS 动画（纯 CSS/JS，无库）。
- 长线目标展示：home tab 常驻「当前目标」卡（下一境界需求/图鉴%/秘境层数/轮回次数）。

## 13. main.js 职责

依次：`XG.save.load()` → 各 sys `init()` → `XG.stats.invalidate()` → `XG.offline.settle()` 并 emit `modal:offline` → 启动 1s 主循环（emit tick、累加 totalOnlineSec、每日 0 点重置 daily、15s 自动存档）→ beforeunload 存档。

## 14. 验收清单（所有代理完成后由联调代理核对）

- [ ] file:// 直接打开无控制台报错
- [ ] 内容量：功法≥20(隐藏5)、丹方≥30、灵宠≥30、词条≥30、地图≥8(隐藏2)、事件≥80(连锁≥6)、成就≥50(隐藏10)、道友30~50、性格≥10、文案≥200、名字库≥200
- [ ] 离线 8h 结算弹窗；道友离线有动态
- [ ] 一键领取/修炼/派遣/扫荡可用
- [ ] 存档导出/导入可用
