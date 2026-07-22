/* offline.js：离线收益结算（契约 §8；settle 须在 sys init 之后由 main.js 调用，本文件只提供函数） */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  XG.offline = {
    // 启动时离线结算：dt = min(now - lastSeen, cap)；依次调用各系统 offline(dt) 合并报告；
    // 返回 {dt, capped, cultGain, resGain:{}, pillGain:{}, events:[], fellowNews:[], truncated}；dt<60s 返回 null
    settle() {
      const st = XG.state;
      const now = Date.now();
      const last = st.lastSeen || 0;
      if (!last) { st.lastSeen = now; return null; } // 无时间基准（新档）不结算
      let dt = Math.floor((now - last) / 1000);
      if (dt < 60) return null; // 不足 1 分钟不弹窗

      // 超上限截断并标记（上限读 stats 面板 offlineCapSec，含各系统 offlineHours 加成）
      const capSec = (XG.stats ? XG.stats.get().offlineCapSec : XG.cfg.OFFLINE_CAP_H * 3600);
      const capped = dt > capSec;
      if (capped) dt = capSec;

      const report = {
        dt: dt, capped: capped,
        cultGain: 0, resGain: {}, pillGain: {},
        events: [], fellowNews: [],
        truncated: capped, // 收益被离线上限截断（与 capped 同义，供弹窗展示）
      };

      // 依次调用各系统 offline(dt)，合并报告片段
      const order = XG.sysOrder || [];
      for (const id of order) {
        const m = XG.sys && XG.sys[id];
        if (!m || typeof m.offline !== 'function') continue;
        let part = null;
        try {
          part = m.offline(dt);
        } catch (e) {
          console.error('[offline] ' + id + '.offline() 结算出错', e);
        }
        if (part) this._merge(report, part);
      }

      st.lastSeen = now; // 结算完成，推进时间基准避免重复结算
      return report;
    },

    // 合并系统报告片段到总报告（数值累加、数组拼接、未知键透传）
    _merge(rep, part) {
      if (part.cultGain) rep.cultGain += part.cultGain;
      if (part.resGain) {
        for (const k in part.resGain) rep.resGain[k] = (rep.resGain[k] || 0) + part.resGain[k];
      }
      if (part.pillGain) {
        for (const k in part.pillGain) rep.pillGain[k] = (rep.pillGain[k] || 0) + part.pillGain[k];
      }
      if (part.events) rep.events.push.apply(rep.events, part.events);
      if (part.fellowNews) rep.fellowNews.push.apply(rep.fellowNews, part.fellowNews);
      // 其余未占用键原样并入（不覆盖总报告已有字段）
      for (const k in part) {
        if (!(k in rep)) rep[k] = part[k];
      }
    },
  };
})();
