/* save.js：存档 API（契约 §8：save/load/reset/export/import；定时器与页面钩子由 main.js 负责） */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  // 默认值深合并（读档容错）：以默认结构为骨架，用存档值覆盖；
  // 存档缺失的键补默认值，存档多出的键原样保留（兼容旧档与未来扩展）
  function mergeDeep(def, saved) {
    if (Array.isArray(def)) {
      return Array.isArray(saved) ? XG.util.deepClone(saved) : XG.util.deepClone(def);
    }
    if (def !== null && typeof def === 'object') {
      const src = (saved !== null && typeof saved === 'object' && !Array.isArray(saved)) ? saved : {};
      const out = {};
      for (const k of Object.keys(def)) out[k] = mergeDeep(def[k], src[k]);
      for (const k of Object.keys(src)) {
        if (!(k in def)) out[k] = XG.util.deepClone(src[k]);
      }
      return out;
    }
    return saved === undefined ? def : saved;
  }

  // JSON 字符串 → base64（encodeURIComponent 技巧处理中文 UTF-8）
  function encode64(json) {
    return btoa(unescape(encodeURIComponent(json)));
  }

  // base64 → JSON 字符串（encode64 的逆过程）
  function decode64(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  XG.save = {
    // 序列化 state → localStorage（同时刷新 lastSeen 供离线结算）
    save() {
      try {
        XG.state.lastSeen = Date.now();
        localStorage.setItem(XG.cfg.SAVE_KEY, JSON.stringify(XG.state));
      } catch (e) {
        console.error('[save] 存档失败', e);
      }
    },

    // 读档并做默认值深合并（容错缺字段），返回 bool 是否有档
    load() {
      let raw = null;
      try {
        raw = localStorage.getItem(XG.cfg.SAVE_KEY);
      } catch (e) {
        console.error('[save] 读取存档失败', e);
      }
      if (!raw) return false; // 无存档，保留 state.js 建立的默认新档
      try {
        const obj = JSON.parse(raw);
        XG.state = mergeDeep(XG.newState(), obj);
        return true;
      } catch (e) {
        console.error('[save] 存档损坏，已重开新档', e);
        XG.state = XG.newState();
        return false;
      }
    },

    // 清档重开（删除本地存档并重置为默认状态；是否刷新页面由调用方决定）
    reset() {
      try {
        localStorage.removeItem(XG.cfg.SAVE_KEY);
      } catch (e) {
        console.error('[save] 清档失败', e);
      }
      XG.state = XG.newState();
      XG.bus.emit('res:changed');
    },

    // 导出存档为 base64 字符串（UTF-8 安全）
    export() {
      try {
        return encode64(JSON.stringify(XG.state));
      } catch (e) {
        console.error('[save] 导出失败', e);
        return '';
      }
    },

    // 导入 base64 存档，返回 {ok, err?}
    import(str) {
      try {
        const obj = JSON.parse(decode64(String(str || '').trim()));
        if (!obj || typeof obj !== 'object' || typeof obj.ver === 'undefined') {
          return { ok: false, err: '存档格式不正确' };
        }
        XG.state = mergeDeep(XG.newState(), obj);
        this.save();
        XG.bus.emit('res:changed');
        return { ok: true };
      } catch (e) {
        return { ok: false, err: '存档解析失败：' + e.message };
      }
    },
  };
})();
