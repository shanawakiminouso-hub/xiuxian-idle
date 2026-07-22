'use strict';
const fs = require('fs');
const vm = require('vm');
const ctx = {
  window: {}, console: console,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  Date: Date, Math: Math, JSON: JSON, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
};
ctx.window.localStorage = ctx.localStorage;
vm.createContext(ctx);
[
  'js/core/util.js', 'js/core/bus.js', 'js/core/cfg.js', 'js/core/state.js',
  'js/core/save.js', 'js/core/stats.js', 'js/core/offline.js',
  'js/data/names.js', 'js/data/gongfa.js', 'js/data/pills.js', 'js/data/pets.js',
  'js/data/equips.js', 'js/data/world.js', 'js/data/events_a.js', 'js/data/events_b.js',
  'js/data/achievements.js', 'js/data/fellows.js',
  'js/sys/cultivation.js', 'js/sys/gongfa.js', 'js/sys/alchemy.js', 'js/sys/forge.js',
  'js/sys/pets.js', 'js/sys/cave.js', 'js/sys/expedition.js', 'js/sys/dungeon.js',
  'js/sys/pvp.js', 'js/sys/adventure.js', 'js/sys/fellows.js', 'js/sys/reincarn.js',
  'js/sys/collection.js', 'js/sys/guide.js', 'js/sys/glue.js',
].forEach(function (f) { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }); });
const XG = ctx.window.XG;
let n = 0, fail = 0;
function ok(c, m) { n++; if (!c) { fail++; console.error('FAIL: ' + m); } else { console.log('ok: ' + m); } }
XG.save.load();
XG.state.player.realmIdx = 1; XG.state.player.layer = 10;
XG.state.res.lingShi = 1e5;
XG.sysOrder.forEach(function (id) { if (XG.sys[id] && XG.sys[id].init) XG.sys[id].init(); });
XG.stats.invalidate();

// 1. 初始丹方
const known = XG.state.alchemy.known;
ok(known.length > 0, '初始丹方已习得：' + known.join(','));
// 2. 建灵田（需灵芝×1 + 灵石800）
XG.addRes({ mat: { herb_lingzhi: 2 } });
const up = XG.sys.cave.upgrade('lt');
ok(up.ok, '灵田建造：' + up.msg);
// 3. 挂机 2 小时（7200 秒 tick）
for (let s = 0; s < 7200; s++) XG.sys.cave.tick(1);
const pool = XG.sys.cave.getPool();
ok(pool.whole >= 20, '灵田 2 小时积蓄 ' + pool.whole + ' 株（rate ' + pool.ratePerHour + '/h）');
// 4. 领取，统计青灵草
const col = XG.sys.cave.quickCollect();
ok(!col.empty, '领取：' + col.msg[0]);
const inv = XG.state.inv.mat;
const g1 = ['herb_qingling', 'herb_ningxue', 'herb_ningshen', 'herb_ziye'];
const cnt = {};
g1.forEach(function (id) { cnt[id] = inv[id] || 0; });
ok(cnt.herb_qingling > 0, '青灵草入库 ' + cnt.herb_qingling + ' 株（一阶池 4 草：' + JSON.stringify(cnt) + '）');
// 5. 聚气丹可炼
const cc = XG.sys.alchemy.canCraft('pill_juqi');
ok(cc.ok || cc.reason !== '药材或灵石不足', '聚气丹 canCraft：' + (cc.ok ? '可炼' : cc.reason));
if (cc.ok) {
  const sc = XG.sys.alchemy.startCraft('pill_juqi');
  ok(sc.ok, '开炉：' + sc.msg);
  XG.state.alchemy.job.endAt = Date.now() - 1;
  XG.sys.alchemy.tick(1);
  ok(!XG.state.alchemy.job, '丹成结算完成');
}
console.log('断言 ' + n + ' 条，失败 ' + fail + ' 条');
process.exit(fail ? 1 : 0);
