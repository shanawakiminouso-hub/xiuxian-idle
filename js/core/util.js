/* util.js：通用工具函数（随机、概率、大数格式化、深拷贝、HTML 转义等，契约 §2/§3） */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  // 中式大数单位表（契约 §2：万 1e4 ~ 载 1e44，从高到低匹配）
  const UNITS = [
    { v: 1e44, u: '载' }, { v: 1e40, u: '正' }, { v: 1e36, u: '涧' }, { v: 1e32, u: '沟' },
    { v: 1e28, u: '穰' }, { v: 1e24, u: '秭' }, { v: 1e20, u: '垓' }, { v: 1e16, u: '京' },
    { v: 1e12, u: '兆' }, { v: 1e8, u: '亿' }, { v: 1e4, u: '万' },
  ];

  // 保留最多 2 位小数并去掉尾部多余的 0（内部辅助）
  function trim2(x) { return String(Math.round(x * 100) / 100); }

  // HTML 转义映射表（esc 用）
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  XG.util = {
    // 浮点随机数，区间 [min, max)
    rand(min, max) { return Math.random() * (max - min) + min; },

    // 整数随机数，闭区间 [min, max]
    randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },

    // 以 p∈[0,1] 的概率返回 true
    chance(p) { return Math.random() < p; },

    // 数组等概率随机取一个元素
    pick(arr) { return arr[this.randInt(0, arr.length - 1)]; },

    // 不放回随机取 n 个元素，返回新数组
    pickN(arr, n) { return this.shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length))); },

    // 按元素 [wkey] 字段权重随机取一个（权重和 ≤0 时退化为等概率）
    weighted(arr, wkey) {
      wkey = wkey || 'w';
      if (!arr || !arr.length) return undefined;
      let total = 0;
      for (const it of arr) total += (it[wkey] || 0);
      if (total <= 0) return this.pick(arr);
      let r = Math.random() * total;
      for (const it of arr) {
        r -= (it[wkey] || 0);
        if (r < 0) return it;
      }
      return arr[arr.length - 1];
    },

    // 数值夹取到 [a, b] 区间
    clamp(v, a, b) { return Math.min(b, Math.max(a, v)); },

    // 生成短唯一 id 字符串（时间戳 + 随机段，36 进制）
    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },

    // 洗牌：返回新数组，不修改原数组（Fisher-Yates）
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },

    // 可复现随机数发生器（mulberry32；种子支持数字或字符串，周轮换/赛季用）
    mulberry32(seed) {
      // 字符串种子（如 weekId 'YYYY-Www'）先做 FNV-1a 散列为 32 位整数
      if (typeof seed !== 'number') {
        const str = String(seed);
        let h = 2166136261 >>> 0;
        for (let i = 0; i < str.length; i++) {
          h ^= str.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        seed = h >>> 0;
      }
      let a = seed >>> 0;
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    // 返回 ISO 8601 周 id 'YYYY-Www'（赛季/周词缀种子）
    weekId(date) {
      date = date || new Date();
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7; // 周日按 7 处理
      d.setUTCDate(d.getUTCDate() + 4 - dayNum); // 移到本周周四
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
    },

    // 大数值中式单位格式化（契约 §2：≥1e48 科学计数法，<1e4 最多 2 位小数）
    fmt(n) {
      if (typeof n !== 'number' || isNaN(n)) return '0';
      if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
      if (n < 0) return '-' + this.fmt(-n);
      if (n >= 1e48) return n.toExponential(2); // 形如 1.23e+48
      for (const it of UNITS) {
        if (n >= it.v) return trim2(n / it.v) + it.u;
      }
      return trim2(n);
    },

    // 向下取整后再 fmt
    fmtInt(n) { return this.fmt(Math.floor(n)); },

    // 秒数格式化为 '3时20分' / '45分10秒' / '30秒'
    fmtTime(sec) {
      sec = Math.max(0, Math.floor(sec));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      if (h > 0) return h + '时' + m + '分';
      if (m > 0) return m + '分' + s + '秒';
      return s + '秒';
    },

    // JSON 深拷贝（state 中不得存放函数/Infinity）
    deepClone(o) { return JSON.parse(JSON.stringify(o)); },

    // HTML 转义（插文案防注入）
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
    },
  };
})();
