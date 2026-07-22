# AGENTS.md —— 放置修仙（AI 编码代理指南）

> 本文件面向对项目一无所知的 AI 编码代理。项目本身已有两份权威契约文档，动手前**必须先读**：
> - `CONTRACTS.md` —— 全局开发契约，**唯一的接口事实来源**（加载顺序、命名空间、状态 Schema、各层规范、验收清单）。任何改动不得与之冲突。
> - `DATA_NOTES.md` —— 数据层交叉引用审计与权威 id 速查表（地图/事件/材料/丹药/成就 check.k 等 id 的最终口径）。

## 项目概述

- 「放置修仙」：纯前端放置类修仙网页游戏。挂机攒修为 → 突破升境界（炼气→…→渡劫→飞升，每境十层）→ 解锁十二大系统（功法、奇遇、灵宠、道友、洞府、历练、炼丹、坊市、炼器、秘境、论剑、轮回）。
- 玩家向说明见 `README.md`（含系统解锁表、境界线、长线目标）。
- 目标浏览器：Chrome / Edge，手机与 PC 皆可。

## 技术形态（硬性约定，摘自 CONTRACTS §0）

- **纯前端、无构建步骤、无外部依赖、无网络请求。** 禁止 ES Module `import/export`，禁止 CDN，禁止第三方库（含大数库，大数值直接用 JS `number`）。
- **必须支持 `file://` 协议双击 `index.html` 直接运行。** 不要引入任何需要本地服务器/打包器才能工作的机制。
- 没有 `package.json`、没有测试框架、没有 CI。全部脚本由 `index.html` 里的经典 `<script src>` 按顺序加载。
- 所有代码含中文注释；游戏文案为简体中文古风。

## 运行时架构

- 全部代码共享全局命名空间 `window.XG`（简称 `XG`），结构（CONTRACTS §1）：
  - `XG.util` 工具 / `XG.bus` 事件总线 / `XG.cfg` 数值平衡常量 / `XG.state` 唯一游戏状态 / `XG.save` 存档 / `XG.stats` 属性聚合 / `XG.offline` 离线结算
  - `XG.data` 数据表挂载点 / `XG.sys` 系统模块挂载点（`XG.sysOrder` 注册顺序）/ `XG.ui` UI 框架
- 启动流程（`js/main.js`）：`XG.save.load()` → 各 sys 按 `XG.sysOrder` `init()` → `XG.stats.invalidate()` → `XG.offline.settle()` 并 emit `modal:offline` → 1 秒主循环（emit `tick`、每日 0 点重置 `state.daily`、15s 自动存档）→ `XG.ui.boot()`。
- 注意：`main.js` 只发 bus `tick` 事件；各系统 `tick(dt)` 的分发由 `js/sys/glue.js`（跨系统胶水层，排最后加载）订阅后按 `sysOrder` 调用。新增系统的 `tick` 无需自行订阅总线。
- 存档在浏览器 `localStorage`（key：`xg_save_v1`），存档 Schema 与默认值见 CONTRACTS §6；`save.js` 做版本默认值深合并以容错旧档。导出/导入为 base64 字符串。
- 系统间通信：通过 `XG.sys.yyy.apiFn()` 或 `XG.bus` 标准事件（`tick` / `res:changed` / `news` / `realm:break` 等，完整表见 CONTRACTS §4），**禁止**直接改其他系统的 state 子树。给玩家加/扣资源统一走 `XG.addRes(cost)` / `XG.hasRes(cost)`。

## 代码组织

```
index.html      入口：DOM 容器 + 按序加载全部脚本（改加载顺序必须同步 CONTRACTS §0）
css/style.css   国风水墨样式（纯 CSS；主色 青#3a7d6b / 墨#2b2b2b / 金#c9a063，楷体字体栈）
js/core/        引擎层（加载顺序固定）：util → bus → cfg → state → save → stats → offline
js/data/        纯数据表（任意顺序加载，只登记 `XG.data.*`，不写逻辑）：
                names / gongfa / pills / pets / equips / world / events_a / events_b / achievements / fellows
js/sys/         玩法系统（只做注册，顶层不做跨系统调用）：
                cultivation / gongfa / alchemy / forge / pets / cave / expedition / dungeon /
                pvp / adventure / fellows / reincarn / collection / guide / glue（胶水层，排最后）
js/ui/          界面层：ui-core（框架：registerTab/boot/toast/modal/fx）→ scene → ui-tabs-a/b/c
js/main.js      启动引导与 1s 主循环（最后加载）
```

- 扩充游戏内容（新功法、丹方、事件、成就……）**一般只动 `js/data/`**；id 命名与引用口径以 `DATA_NOTES.md` 为准（如 `gf_*`/`pill_*`/`herb_*`/`evb_<mapId>_01~03`/`ac_*`）。
- 每个 JS 文件统一结构（CONTRACTS §0）：

```js
/* 文件名：一句话说明 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});
  // ... 本文件内容
})();
```

- 新增系统文件时：实现 `XG.sys.xxx = { id, init(), tick(dt), offline(dt)?, getMods()? }`，`XG.sysOrder.push('xxx')`，并在 `index.html` 的 sys 区块（glue.js 之前）加 `<script>` 标签。
- 属性加成通过各系统的 `getMods()` 返回 flat 对象（同名键跨系统累加），汇总入口 `XG.stats.calc()`，语义见 CONTRACTS §7；加成来源变化后调 `XG.stats.invalidate()`。
- UI 层：tab 用 `XG.ui.registerTab({...})` 注册；渲染用字符串模板 + `innerHTML`，事件用委托绑定，输入中的元素跳过重绘（CONTRACTS §12）。

## 验证方式（无测试框架，按以下手段自查）

1. **语法检查**：`node --check <改动的每个 js 文件>`（纯脚本语法校验，项目文件可直接过 node 解析）。
2. **数据层一致性**：仿照 `DATA_NOTES.md` 所述做法，写临时 node 脚本按 `index.html` 顺序加载 `js/core/util.js` + 相关 data 文件后逐项断言 id 交叉引用（数据层文件只引用 `XG`，可在 node 里以 `global.window = {}` 等方式跑通）；跑完删除临时脚本。
3. **浏览器实测**：直接双击打开 `index.html`（或 Playwright MCP 驱动真实浏览器），确认 `file://` 下控制台无报错、存档/读档/离线结算正常。`.playwright-mcp/` 是此前浏览器自动化会话的产物目录，非源码，勿动。
4. 对照 `CONTRACTS.md` §14 验收清单核对内容量与功能点。

## 安全与数据注意

- 无网络、无后端、无密钥，攻击面极小；仍需注意：插文案进 HTML 一律用 `XG.util.esc()` 转义防注入；存档 import 需容错校验（`XG.save.import` 返回 `{ok, err?}`）。
- 不引入依赖即是最强安全约定——保持零依赖。

## 已知不一致（阅读旧文档时留意）

- `CONTRACTS.md` 开头写的项目根目录是 `E:/kimi/修仙`，为旧路径；当前实际根目录以你的工作目录为准，契约其余内容不受影响。
- `DATA_NOTES.md` 记录了一批曾修复的 id 漂移（地图↔事件、材料同名双登记如 `beast_yaodan` vs `beast_dan` 等）——引用数据 id 前先查该文件，勿凭名称猜测。
