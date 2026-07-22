/* main.js：启动引导与 1s 主循环（契约 §13；UI 未接入时渲染核心占位面板） */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  let curDay = '';        // 当前日期串（每日 0 点判定用）
  let saveCountdown = 0;  // 距下次自动存档的累计秒数
  let dirtyTimer = null;  // save:dirty 延迟存档句柄
  let lastTick = 0;       // 上次 tick 时间戳

  // 本地日期串 'YYYY/M/D'（跨 0 点判定）
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  // 每日 0 点重置 state.daily（论道/求助/免费赠礼记录）
  function resetDaily() {
    XG.state.daily = { day: curDay, discuss: {}, help: {}, gift: 0 };
    XG.bus.emit('save:dirty');
  }

  // save:dirty 响应：2s 内合并为一次存档（避免高频写 localStorage）
  function scheduleDirtySave() {
    if (dirtyTimer) return;
    dirtyTimer = setTimeout(function () {
      dirtyTimer = null;
      XG.save.save();
    }, 2000);
  }

  // 1s 主循环：emit tick、累加在线时长、每日 0 点重置、15s 自动存档
  function onTick() {
    const now = Date.now();
    let dt = Math.round((now - lastTick) / 1000);
    lastTick = now;
    if (dt <= 0) dt = 1;
    if (dt > 5) dt = 5; // 页面休眠恢复丢弃异常大步长（离线收益归 offline.settle 管）
    XG.state.totalOnlineSec += dt;

    // 每日 0 点检测
    const dk = dayKey();
    if (dk !== curDay) {
      curDay = dk;
      resetDaily();
    }

    XG.bus.emit('tick', { dt: dt });

    // 每 15s 自动存档
    saveCountdown += dt;
    if (saveCountdown >= 15) {
      saveCountdown = 0;
      XG.save.save();
    }
  }

  // 阶段 0 占位渲染：UI 层未接入时输出「核心加载完成」+ JSON 化 stats 面板（保证本阶段可验证）
  function renderCorePlaceholder() {
    const el = document.getElementById('tab-container');
    if (!el) return;
    const s = XG.stats.get();
    const p = XG.state.player;
    const realm = XG.cfg.REALMS[p.realmIdx] || XG.cfg.REALMS[0];
    el.innerHTML =
      '<div class="tab-page">' +
        '<div class="card">' +
          '<h2 class="card-title">核心加载完成</h2>' +
          '<p>道友：' + XG.util.esc(p.name) + '　境界：' + XG.util.esc(realm.name) + ' ' + p.layer + ' 层</p>' +
          '<pre class="core-stats-pre">' + XG.util.esc(JSON.stringify(s, null, 2)) + '</pre>' +
        '</div>' +
      '</div>';
  }

  // 启动流程（契约 §13）
  function boot() {
    // 1. 读档（默认值深合并容错）
    XG.save.load();

    // 2. 各系统按注册顺序 init（读 XG.state 自恢复）
    const order = XG.sysOrder || [];
    for (const id of order) {
      const m = XG.sys && XG.sys[id];
      if (m && typeof m.init === 'function') {
        try {
          m.init();
        } catch (e) {
          console.error('[main] ' + id + '.init() 出错', e);
        }
      }
    }

    // 3. 重建属性缓存
    XG.stats.invalidate();

    // 4. 离线结算并广播弹窗（报告由 ui-core 监听 modal:offline 展示）
    let report = null;
    try {
      report = XG.offline.settle();
    } catch (e) {
      console.error('[main] 离线结算出错', e);
    }
    if (report) XG.bus.emit('modal:offline', report);

    // 5. 每日记录初始化（跨天补重置）
    curDay = dayKey();
    if (XG.state.daily.day !== curDay) resetDaily();

    // 6. 启动 1s 主循环
    lastTick = Date.now();
    setInterval(onTick, 1000);

    // 7. 存档钩子：beforeunload / 页面切后台 / save:dirty
    window.addEventListener('beforeunload', function () { XG.save.save(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) XG.save.save();
    });
    XG.bus.on('save:dirty', scheduleDirtySave);

    // 8. UI 启动：存在 XG.ui 则走正常 UI 流程，否则渲染核心占位面板
    if (XG.ui) {
      if (typeof XG.ui.boot === 'function') {
        try {
          XG.ui.boot();
        } catch (e) {
          console.error('[main] XG.ui.boot() 出错', e);
        }
      }
    } else {
      renderCorePlaceholder();
    }
  }

  // 脚本在 body 末尾加载时 DOM 已就绪；保险起见仍做 readyState 判断
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
