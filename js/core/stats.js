/* stats.js：属性聚合面板（契约 §7：聚合各系统 getMods，缓存 + invalidate） */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  XG.stats = {
    _cache: null, // calc 结果缓存

    // 遍历 XG.sys 中所有实现了 getMods 的模块，同名数值键跨系统累加，返回 flat 加成对象
    _collect() {
      const mods = {};
      const sys = XG.sys || {};
      for (const id in sys) {
        const m = sys[id];
        if (!m || typeof m.getMods !== 'function') continue;
        let part = null;
        try {
          part = m.getMods();
        } catch (e) {
          console.error('[stats] ' + id + '.getMods() 执行出错', e);
        }
        if (!part) continue;
        for (const k in part) {
          if (typeof part[k] === 'number') mods[k] = (mods[k] || 0) + part[k];
          else mods[k] = part[k]; // 非数值键后写覆盖（约定一般不用）
        }
      }
      return mods;
    },

    // 计算最终面板（契约 §7 公式）
    calc() {
      const p = XG.state.player;
      const mods = this._collect();
      const realm = XG.cfg.REALMS[p.realmIdx] || XG.cfg.REALMS[0];
      const base = XG.cfg.REALM_BASE[p.realmIdx] || XG.cfg.REALM_BASE[0];
      // 取某加成百分数（缺省 0）
      const pct = function (k) { return mods[k] || 0; };

      // 以聚合加成为底，其余键原样透传（dropPct/workPct/alchSuccPct 等）
      const r = Object.assign({}, mods);

      // 修为/秒 = 境界rate * layer系数(1+0.12*(layer-1)) * (1+cultRatePct/100)
      const layerCoef = 1 + 0.12 * (p.layer - 1);
      r.cultRate = realm.rate * layerCoef * (1 + pct('cultRatePct') / 100);

      // atk/def/hp/spd = 境界基值 * (1+pct/100) + flat
      r.atk = base.atk * (1 + pct('atkPct') / 100) + (mods.atkFlat || 0);
      r.def = base.def * (1 + pct('defPct') / 100) + (mods.defFlat || 0);
      r.hp = base.hp * (1 + pct('hpPct') / 100) + (mods.hpFlat || 0);
      r.spd = base.spd * (1 + pct('spdPct') / 100) + (mods.spdFlat || 0);

      // 战力（唯一公式）
      r.power = XG.cfg.POWER(r);

      // 突破成功率 = 大境界breakRate + breakFails*8%（保底）+ breakSuccPct/100，封顶 95%
      r.breakRate = Math.min(
        0.95,
        realm.breakRate + (p.breakFails || 0) * XG.cfg.BREAK_FAIL_BONUS + pct('breakSuccPct') / 100
      );

      // 离线收益上限秒数 = (48 + offlineHours) * 3600
      r.offlineCapSec = (XG.cfg.OFFLINE_CAP_H + (mods.offlineHours || 0)) * 3600;

      return r;
    },

    // 获取缓存面板；无缓存则现算
    get() {
      if (!this._cache) this._cache = this.calc();
      return this._cache;
    },

    // 任何 getMods 来源变化后调用：清空缓存，下次 get 时重算
    invalidate() {
      this._cache = null;
    },
  };
})();
