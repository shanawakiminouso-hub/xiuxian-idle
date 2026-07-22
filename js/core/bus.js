/* bus.js：全局事件总线（契约 §4，标准事件见契约表格，可自定义新事件但不得重名改义） */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  XG.bus = {
    _map: {}, // { 事件名: [回调...] }

    // 订阅事件，返回取消订阅函数
    on(evt, fn) {
      (this._map[evt] = this._map[evt] || []).push(fn);
      const self = this;
      return function () { self.off(evt, fn); };
    },

    // 取消订阅某个回调
    off(evt, fn) {
      const list = this._map[evt];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) delete this._map[evt];
    },

    // 发布事件；逐个调用回调，单个回调异常不影响其他订阅者
    emit(evt, payload) {
      const list = this._map[evt];
      if (!list) return;
      // slice 拷贝，防止回调中 on/off 导致遍历错位
      list.slice().forEach(function (fn) {
        try {
          fn(payload);
        } catch (e) {
          console.error('[bus] 事件 ' + evt + ' 的回调执行出错', e);
        }
      });
    },
  };
})();
