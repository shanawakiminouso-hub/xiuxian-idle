# 修改计划

## 一、历练——新增自动继续历练

### 现状
历练系统已有「连续历练」功能（`expedition.js` 中的 `setAuto`/`getAuto`/`runAuto`），
UI 派遣弹窗中有一行「连续历练：归来后按同配置自动再派」带开关按钮。
`tick()` 中每次结算完队伍后会调 `runAuto()` 自动再派同配置。

### 改动点
1. **`js/sys/expedition.js`** —— 连续历练在 `runAuto()` 中，当前逻辑是：
   - 结算完一支队伍后调用 `runAuto()`
   - `runAuto()` 检查 `state.expedition.auto` 配置，按原配置自动再派
   - 灵宠忙/不在囊中自动剔除；全部不可遣则独自历练兜底
   - 地图不可达/派遣失败时自动中止并播报
   
   这里不需要大改，只需为 `quickDispatch` 增加连派记忆（当前一键派遣无自动继续）。
   具体：`quickDispatch` 成功后自动记录 auto 配置（`setAuto({mapId, petUids, durIdx})`）。

2. **`js/ui/ui-tabs-b.js`** —— 派遣弹窗中「连续历练」开关已存在，不做额外 UI 改动，
   但一键派遣成功后 toast 提示中加入连续历练状态提醒。

## 二、秘境挑战——失败惩罚

### 现状
`challengeTower()` 中，挑战失败直接返回 `{win: false, rewards: null}`，
注释写着「惜败，毫无损失」。失败没有任何惩罚。

### 改动点（`js/sys/dungeon.js`）

**惩罚规则**（按需求）：
- 挑战失败扣当前等级（player.realmIdx + player.layer）所需修为的 10%
- 玩家当前修为不足该 10% 时，不允许挑战，前端提示「修为不足，无法挑战」
- 扣修为走 `cultivation.addCult(-n, '镇妖塔挑战失败')` 如果存在；否则 `player.cult -= n`

**具体实现**：
1. 在 `challengeTower()` 函数中，`!U().chance(wp)` 分支（失败）增加：
   - 计算 `penalty = 0.1 * XG.cfg.layerCost(p.realmIdx, p.layer)`
   - 校验当前修为 `player.cult` 是否 >= penalty；不足则返回 `{ok: false, err: '修为不足，无法挑战镇妖塔'}`
   - 扣修为，返回中新增 `penalty` 字段
2. `layerCost` 已在 `cfg.js` 中定义，直接调用

## 三、奇遇奖励——随修仙等级提升而提升

### 现状
`events_a.js` 和 `events_b.js` 中每条事件的 `out.cult`、`out.lingShi` 等奖励值是**硬编码**的。
例如 `eva_lingquan` 的 `cult: 1.8e4` 对炼气期可观，但对化神期（rate=3e3）就微不足道了。
数据文件头的注释描述了基于 `rate × 秒数系数` 的设计口径，但实际数值并未动态缩放。

### 改动点（`js/sys/adventure.js`）

原则：**不改动数据文件**（`events_a.js`/`events_b.js`），在结算函数 `settleOut()` 中做动态缩放。

**缩放策略**：
1. 读取玩家当前境界的 `rate`（`XG.cfg.REALMS[player.realmIdx].rate`）
2. 读取事件 `minRealm` 对应的基准 `rate`（`XG.cfg.REALMS[e.minRealm].rate`）
3. 缩放因子 = `currRate / baseRate`
4. 对 `out.cult`、`out.lingShi`、`out.lingYu` 数值型奖励乘以缩放因子（向下取整）
5. 对材料/丹药/残篇等非修为资源不做缩放（保持品阶稀有度一致）

**特别注意**：
- 需要将 `settleOut()` 能获取到事件对象 `e`（当前只有 `choice.out` 入参），所以需要把 `e` 传进 `settleOut`
- `settleOut` 签名由 `settleOut(e, choice, result)` → 已有 `e`，可直接取 `e.minRealm`
- `minRealm` 可能为 `undefined`（兼容老数据），此时按 `minRealm=0`（炼气 rate=10）处理
- 连锁事件（`out.chain`）的奖励也应缩放

## 涉及文件

| 文件 | 改动 |
|------|------|
| `js/sys/dungeon.js` | `challengeTower()` 失败分支加修为惩罚 |
| `js/sys/adventure.js` | `settleOut()` 中按当前境界 rate 缩放修为/灵石/灵玉奖励 |
| `js/sys/expedition.js` | `quickDispatch()` 成功后自动记忆 auto 配置 |

无需改动的文件（已有实现）：`js/ui/ui-tabs-b.js`（历练连派 UI 已有）、`js/data/events_a.js`/`events_b.js`（奖励缩放放在逻辑层，不动数据）
