/* ui-core.js：UI 框架（契约 §12 的 XG.ui 全部 API）+ 修炼主页 tab（id:'home'）
 * 框架：registerTab（含 XG._pendingTabs 队列消费）/ boot / refreshTop / 传闻轮播 /
 *       底部导航 + 「更多」弹层 / toast / modal / confirm / pop / fx 三件套 / news
 * 主页：境界大卡（突破+破境丹）/ 修炼模式 / 一键操作 / 修行录（新手目标）/ 当前目标 / 灵根经脉 / 每日提醒角标
 * 约定：全部系统调用防御性（判存 + try/catch）；数字一律 XG.util.fmt*；时间 XG.util.fmtTime；
 *       扩展样式全部在本文件注入式 <style> 块内，类名统一 xgh- 前缀防冲突。
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  // ============================ 内部状态 ============================
  const tabs = [];              // 已注册 tab 定义（按 order 排序）
  let activeId = null;          // 当前活跃 tab id
  let booted = false;           // boot 是否已完成
  let pendingOffline = null;    // boot 之前到达的离线结算报告（main.js 先 emit 后 boot）
  let moreOpen = false;         // 「更多」弹层开合
  let tickerIdx = 0;            // 传闻轮播游标
  let navSig = '';              // 底栏渲染签名（防每秒重绘吞点击）
  let moreSig = '';
  let topTimer = 0;             // res:changed 顶栏节流句柄

  // ============================ 小工具 ============================
  function $(id) { return document.getElementById(id); }
  function esc(s) { return XG.util.esc(s); }
  function fmt(n) { return XG.util.fmt(n); }
  function fmtInt(n) { return XG.util.fmtInt(n); }
  function fmtTime(s) { return XG.util.fmtTime(s); }
  function S() { return XG.state; }
  function settings() {
    const st = S();
    st.settings = st.settings || { newsCollapsed: false, sound: false };
    return st.settings;
  }
  function sys(id) { return (XG.sys && XG.sys[id]) || null; }
  // 防御性调用系统函数：系统不存在/抛错均返回 null，绝不白屏
  function call(sysId, fn, args) {
    try {
      const m = sys(sysId);
      if (!m || typeof m[fn] !== 'function') return null;
      return m[fn].apply(m, args || []);
    } catch (e) {
      console.error('[ui] ' + sysId + '.' + fn + ' 调用出错', e);
      return null;
    }
  }

  // ============================ 注入样式（xgh- 前缀） ============================
  const CSS = `
  /* —— 突破特效时长对齐契约 2.5s —— */
  .fx-breakthrough::before { animation-duration: 2.5s; }
  .fx-breakthrough-text { animation-duration: 2.5s; }
  /* —— 传闻条折叠后留一细条（含展开钮），避免完全消失无法恢复 —— */
  #news-ticker.collapsed { max-height: 22px; border-bottom: 1px solid var(--line); }
  #news-ticker.collapsed .news-label, #news-ticker.collapsed .news-viewport { display: none; }
  #news-ticker.collapsed .news-ticker-inner { height: 22px; justify-content: center; }
  /* —— 屏幕震动 —— */
  @keyframes xghShake {
    0%,100% { transform: translateX(0); }
    20% { transform: translateX(-6px); } 40% { transform: translateX(5px); }
    60% { transform: translateX(-4px); } 80% { transform: translateX(3px); }
  }
  .xgh-shake { animation: xghShake .45s ease; }
  /* —— 底栏锁定态 —— */
  .xgh-lock { opacity: .45; }
  /* —— 「更多」底部弹层 —— */
  .xgh-sheet-mask {
    position: fixed; inset: 0; z-index: 90; background: rgba(30,28,24,.5);
    animation: xghFadeIn .18s ease;
  }
  @keyframes xghFadeIn { from { opacity: 0; } to { opacity: 1; } }
  .xgh-sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 95;
    max-width: 720px; margin: 0 auto;
    background: radial-gradient(circle at 20% 10%, rgba(201,160,99,.08), transparent 45%), var(--paper);
    border-top: 2px solid var(--gold); border-radius: 14px 14px 0 0;
    box-shadow: 0 -6px 24px rgba(0,0,0,.25);
    padding: 12px 12px 18px; max-height: 62vh; overflow-y: auto;
    animation: xghSheetUp .22s ease;
  }
  @keyframes xghSheetUp { from { transform: translateY(40px); opacity: .4; } to { transform: translateY(0); opacity: 1; } }
  .xgh-sheet-title { text-align: center; color: var(--qing-d); font-size: 15px; margin: 0 0 10px; }
  .xgh-more-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .xgh-more-item {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 10px 2px 7px; border: 1px solid var(--line); border-radius: 8px;
    background: var(--paper-d); cursor: pointer; user-select: none; font-size: 12px;
  }
  .xgh-more-item:active { transform: translateY(1px); }
  .xgh-more-item .xgh-mi-ico { font-size: 21px; line-height: 1.2; }
  .xgh-more-item .xgh-mi-cond { font-size: 10px; color: var(--ink-l); text-align: center; line-height: 1.3; }
  .xgh-more-item.xgh-lock { filter: grayscale(.6); }
  .xgh-more-item .badge-new { top: 3px; right: 4px; }
  /* —— 主页：每日提醒角标 —— */
  .xgh-reminds { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .xgh-chip {
    position: relative; display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--qing-d); background: var(--paper);
    border: 1px solid var(--line); border-radius: 14px; padding: 3px 10px; cursor: pointer;
  }
  .xgh-chip .xgh-dot {
    width: 7px; height: 7px; border-radius: 50%; background: var(--danger); flex: none;
    animation: xghDot 1.2s ease infinite;
  }
  @keyframes xghDot { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
  /* —— 主页：修炼模式三选 —— */
  .xgh-modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .xgh-mode {
    border: 1px solid var(--line); border-radius: 8px; padding: 8px 4px; text-align: center;
    background: var(--paper-d); cursor: pointer; user-select: none;
  }
  .xgh-mode .xgh-mode-name { font-size: 14px; color: var(--ink); }
  .xgh-mode .xgh-mode-sub { font-size: 11px; color: var(--ink-l); line-height: 1.35; margin-top: 2px; }
  .xgh-mode.xgh-on { border-color: var(--gold); background: rgba(201,160,99,.14); box-shadow: inset 0 0 0 1px var(--gold); }
  .xgh-mode.xgh-off { cursor: not-allowed; }
  /* —— 主页：一键操作 —— */
  .xgh-quick { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  @media (min-width: 768px) { .xgh-quick { grid-template-columns: repeat(4, 1fr); } }
  /* —— 主页：目标/灵根明细行 —— */
  .xgh-line { display: flex; align-items: baseline; gap: 6px; font-size: 13px; padding: 3px 0; }
  .xgh-line .xgh-li { flex: none; width: 20px; text-align: center; }
  .xgh-line .xgh-lt { flex: none; color: var(--ink-l); }
  .xgh-line .xgh-lv { flex: 1; min-width: 0; }
  .xgh-gold { color: var(--gold-d); font-weight: bold; }
  .xgh-warn { color: var(--danger); }
  .xgh-dunwu-on { color: var(--gold-d); font-weight: bold; }
  /* —— 主页：修行录领取按钮金闪 —— */
  @keyframes xghGoldFlash {
    0%,100% { box-shadow: 0 0 0 0 rgba(201,160,99,0); }
    50% { box-shadow: 0 0 12px 3px rgba(201,160,99,.8); }
  }
  .xgh-guide-claim { margin-top: 6px; animation: xghGoldFlash 1.2s ease infinite; }
  /* —— 弹窗通用 —— */
  .xgh-modal-body { font-size: 14px; line-height: 1.7; }
  .xgh-modal-body ul { margin: 6px 0; padding-left: 20px; }
  .xgh-hr { border: none; border-top: 1px dashed var(--line); margin: 8px 0; }
  /* —— 破境丹选择 —— */
  .xgh-pill {
    display: flex; align-items: center; gap: 8px; border: 1px solid var(--line);
    border-radius: 8px; padding: 7px 10px; margin-bottom: 6px; cursor: pointer; background: var(--paper-d);
  }
  .xgh-pill.xgh-on { border-color: var(--gold); background: rgba(201,160,99,.16); box-shadow: inset 0 0 0 1px var(--gold); }
  .xgh-pill.xgh-off { opacity: .45; cursor: not-allowed; }
  .xgh-pill .xgh-pi { font-size: 20px; }
  .xgh-pill .xgh-pn { flex: 1; }
  .xgh-pill .xgh-pc { color: var(--gold-d); font-weight: bold; }
  /* —— 经脉树 —— */
  .xgh-branch { margin-bottom: 10px; }
  .xgh-branch-name { color: var(--qing-d); font-size: 14px; border-bottom: 1px dashed var(--line); padding-bottom: 3px; margin-bottom: 6px; }
  .xgh-acus { display: flex; flex-wrap: wrap; gap: 6px; }
  .xgh-acu {
    border: 1px solid var(--line); border-radius: 16px; padding: 3px 10px; font-size: 12px;
    background: var(--paper-d); color: var(--ink-l); cursor: default; user-select: none;
  }
  .xgh-acu.xgh-lit { background: rgba(201,160,99,.2); border-color: var(--gold); color: #7a5b1e; }
  .xgh-acu.xgh-can { background: rgba(58,125,107,.12); border-color: var(--qing); color: var(--qing-d); cursor: pointer; }
  .xgh-acu.xgh-can:active { transform: translateY(1px); }
  .xgh-chip-adv { border-color: var(--gold-d) !important; color: var(--gold-d) !important; font-weight: bold; animation: xghAdvPulse 1.6s ease-in-out infinite; }
  @keyframes xghAdvPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(201,160,99,0); } 50% { box-shadow: 0 0 8px 2px rgba(201,160,99,.55); } }
  .xgh-adv-hidden { margin-top:8px; padding:8px 10px; border:1px solid var(--gold-d); border-radius:8px; background:rgba(201,160,99,.12); color:#7a5b1e; line-height:1.6; }
  `;
  function injectCss() {
    const el = document.createElement('style');
    el.id = 'xgh-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  // ============================ tab 注册（含 _pendingTabs 消费） ============================
  function sortTabs() { tabs.sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); }
  function findTab(id) { for (const t of tabs) if (t.id === id) return t; return null; }
  function registerTab(def) {
    if (!def || !def.id || typeof def.mount !== 'function') return;
    const old = findTab(def.id);
    if (old) tabs.splice(tabs.indexOf(old), 1, def);
    else tabs.push(def);
    sortTabs();
    navSig = ''; moreSig = '';
  }

  // ============================ 解锁判定 ============================
  function unlockText(sysId) {
    const u = XG.cfg && XG.cfg.UNLOCKS && XG.cfg.UNLOCKS[sysId];
    if (!u) return '';
    if (u.days) return '创角满 ' + u.days + ' 日方可开启';
    const r = XG.cfg.REALMS[u.realmIdx];
    return '达 ' + (r ? r.name : '?') + ' ' + u.layer + ' 层开启';
  }
  function tabLocked(def) {
    return !!(def && def.sysId && XG.cfg && XG.cfg.isUnlocked && !XG.cfg.isUnlocked(def.sysId));
  }
  // NEW 角标：解锁后未点过
  function isNew(def) {
    if (!def || tabLocked(def)) return false;
    return !settings().seenTabs || !settings().seenTabs[def.id];
  }
  function markSeen(id) {
    const s = settings();
    s.seenTabs = s.seenTabs || {};
    if (!s.seenTabs[id]) {
      s.seenTabs[id] = 1;
      try { XG.bus.emit('save:dirty'); } catch (e) { /* 忽略 */ }
    }
  }

  // ============================ toast（顶部轻提示） ============================
  function toast(msg, type) {
    const root = $('toast-root');
    if (!root) return;
    while (root.children.length >= 5) root.removeChild(root.firstChild);
    const el = document.createElement('div');
    el.className = 'toast';
    if (type === 'gold') el.classList.add('toast-gold');
    else if (type === 'red' || type === 'err' || type === 'error') el.classList.add('toast-err');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2700);
  }

  // ============================ modal / confirm ============================
  let modalBtns = [];
  let lastModalTitle = null; // 上一次弹窗标题（同题重绘时保持滚动位置）
  function closeModal() {
    const root = $('modal-root');
    if (root) root.innerHTML = '';
    modalBtns = [];
    lastModalTitle = null;
  }
  function modal(opt) {
    opt = opt || {};
    const root = $('modal-root');
    if (!root) return;
    // 同标题重绘（装备/灵宠详情操作后刷新弹窗）时保持 .modal 滚动位置，避免跳回顶部
    const oldBox = root.querySelector('.modal');
    const keepScroll = !!(oldBox && lastModalTitle != null && lastModalTitle === (opt.title || ''));
    const oldTop = keepScroll ? oldBox.scrollTop : 0;
    const btns = (opt.buttons && opt.buttons.length) ? opt.buttons : [{ text: '告辞' }];
    modalBtns = btns;
    root.innerHTML =
      '<div class="modal-mask" data-mmask="1"><div class="modal ' + esc(opt.cls || '') + '">' +
      '<h3 class="modal-title">' + esc(opt.title || '') + '</h3>' +
      '<div class="xgh-modal-body">' + (opt.html || '') + '</div>' +
      '<div class="modal-btns">' +
      btns.map(function (b, i) {
        return '<button class="btn ' + esc(b.cls || '') + '" data-mbtn="' + i + '">' + esc(b.text) + '</button>';
      }).join('') +
      '</div></div></div>';
    lastModalTitle = opt.title || '';
    if (keepScroll) {
      const nb = root.querySelector('.modal');
      if (nb) nb.scrollTop = oldTop;
    }
  }
  function confirm(text, cb) {
    modal({
      title: '请道友定夺',
      html: '<p style="text-align:center;margin:6px 0">' + esc(text) + '</p>',
      buttons: [
        { text: '确定', cls: 'btn-primary', cb: function () { if (cb) cb(); } },
        { text: '再想想', cls: 'btn-ghost' },
      ],
    });
  }
  // modal-root 事件委托（挂一次，元素常驻）
  function bindModalRoot() {
    const root = $('modal-root');
    if (!root || root._xghBound) return;
    root._xghBound = true;
    root.addEventListener('click', function (ev) {
      const t = ev.target;
      if (t && t.getAttribute && t.getAttribute('data-mmask')) { closeModal(); return; }
      const btn = t && t.closest ? t.closest('[data-mbtn]') : null;
      if (btn) {
        const b = modalBtns[Number(btn.getAttribute('data-mbtn'))];
        if (!b) { closeModal(); return; }
        if (b.cb && b.cb() === false) return; // cb 返回 false 保持弹窗
        closeModal();
      }
    });
  }

  // ============================ pop（屏幕中央浮动跳字） ============================
  function pop(text, cls) {
    if (pop._muted) return; // 批量操作（一键论道等）期间静音，由调用方聚合跳字
    const root = $('pop-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'pop-num';
    if (cls === 'good' || cls === 'green') el.classList.add('pop-good');
    else if (cls === 'bad' || cls === 'red' || cls === 'warn') el.classList.add('pop-bad');
    // 随机散布，防止多次跳字完全重叠
    el.style.left = (42 + Math.random() * 16) + '%';
    el.style.top = (38 + Math.random() * 10) + '%';
    el.textContent = text;
    root.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1500);
  }

  // ============================ fx 三件套 ============================
  const fx = {
    // 突破：全屏金光径向扩散 + 大字，2.5s
    breakthrough: function () {
      const root = $('fx-root');
      if (!root) return;
      const el = document.createElement('div');
      el.className = 'fx-breakthrough';
      el.innerHTML = '<span class="fx-breakthrough-text">突破成功</span>';
      root.appendChild(el);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2600);
    },
    // 掉落光柱（grade≥3 触发）：按品阶着色
    drop: function (grade) {
      grade = Number(grade) || 0;
      if (grade < 3) return;
      const root = $('fx-root');
      if (!root) return;
      const colors = { 3: 'rgba(142,108,201,.85)', 4: 'rgba(233,196,106,.9)', 5: 'rgba(217,79,61,.9)' };
      const el = document.createElement('div');
      el.className = 'fx-drop-beam';
      el.style.setProperty('--beam-color', colors[grade] || colors[5]);
      root.appendChild(el);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1700);
    },
    // 屏幕震动
    shake: function () {
      const app = $('app');
      if (!app) return;
      app.classList.remove('xgh-shake');
      void app.offsetWidth;
      app.classList.add('xgh-shake');
      setTimeout(function () { app.classList.remove('xgh-shake'); }, 500);
    },
  };

  // ============================ 传闻轮播 ============================
  const NEWS_CAT = { fellow: '道友', player: '修行', system: '听闻', market: '坊市', dungeon: '秘境', world: '轶闻' };
  function newsList() { return (S().news || []).slice(0, 30); }
  function tickerText(item) {
    if (!item) return '山中寂静，暂无传闻……';
    const tag = NEWS_CAT[item.cat];
    return (tag ? '【' + tag + '】' : '') + (item.text || '');
  }
  function setTickerItem() {
    const el = $('xgh-news-text');
    if (!el) return;
    const list = newsList();
    if (!list.length) { el.textContent = tickerText(null); return; }
    tickerIdx = ((tickerIdx % list.length) + list.length) % list.length;
    const text = tickerText(list[tickerIdx]);
    el.textContent = text;
    el.style.animationDuration = Math.min(30, Math.max(9, 5 + text.length * 0.3)) + 's';
  }
  function restartTicker() {
    const el = $('xgh-news-text');
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth; // 强制 reflow 重启动画
    el.style.animation = '';
    setTickerItem();
  }
  // 新传闻推入轮播（跳到最新一条）
  function news(obj) {
    // 系统经 pushNews 已落 state.news 并发 bus；ui.news 供直接调用：未落档则补录
    if (obj && obj.text) {
      const arr = S().news = S().news || [];
      if (arr[0] !== obj) {
        arr.unshift(obj);
        const cap = (XG.cfg && XG.cfg.NEWS_CAP) || 200;
        if (arr.length > cap) arr.length = cap;
      }
    }
    tickerIdx = 0;
    if (booted) restartTicker();
  }
  function buildTicker() {
    const t = $('news-ticker');
    if (!t) return;
    t.innerHTML =
      '<div class="news-ticker-inner">' +
      '<span class="news-label">传闻</span>' +
      '<div class="news-viewport"><span class="news-scroll" id="xgh-news-text"></span></div>' +
      '<button class="news-toggle" id="xgh-news-toggle"></button>' +
      '</div>';
    const scroll = $('xgh-news-text');
    if (scroll) {
      scroll.addEventListener('animationiteration', function () {
        tickerIdx += 1;
        setTickerItem();
      });
    }
    const btn = $('xgh-news-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        const s = settings();
        s.newsCollapsed = !s.newsCollapsed;
        applyTickerCollapse();
        try { XG.bus.emit('save:dirty'); } catch (e) { /* 忽略 */ }
      });
    }
    applyTickerCollapse();
    setTickerItem();
  }
  function applyTickerCollapse() {
    const t = $('news-ticker');
    const btn = $('xgh-news-toggle');
    if (!t) return;
    const collapsed = !!settings().newsCollapsed;
    t.classList.toggle('collapsed', collapsed);
    if (btn) btn.textContent = collapsed ? '传闻 ▾' : '收起 ▴';
  }

  // ============================ 顶栏 ============================
  function buildTopbar() {
    const tb = $('topbar');
    if (!tb) return;
    tb.innerHTML =
      '<div class="topbar">' +
      '<div class="topbar-row">' +
      '<div class="topbar-avatar" id="xgh-avatar">炼</div>' +
      '<div class="topbar-main">' +
      '<div><span class="topbar-name" id="xgh-name"></span><span class="topbar-realm" id="xgh-realm"></span></div>' +
      '<div class="progress"><div class="progress-fill" id="xgh-top-fill"></div><div class="progress-text" id="xgh-top-ptext"></div></div>' +
      '<div class="topbar-rate" id="xgh-top-rate"></div>' +
      '</div></div>' +
      '<div class="res-bar">' +
      '<span class="res-item"><span class="res-ico">⚔️</span><span class="res-num" id="xgh-power" style="color:var(--gold-d)">0</span> 战力</span>' +
      '<span class="res-item"><span class="res-ico">🪙</span><span class="res-num" id="xgh-lingshi">0</span> 灵石</span>' +
      '<span class="res-item"><span class="res-ico">💎</span><span class="res-num" id="xgh-lingyu">0</span> 灵玉</span>' +
      '</div></div>';
  }
  function refreshTop() {
    if (!booted) return;
    const p = S().player;
    if (!p) return;
    const realm = XG.cfg.REALMS[p.realmIdx] || XG.cfg.REALMS[0];
    const last = p.realmIdx >= XG.cfg.REALMS.length - 1;
    const cost = last ? Infinity : XG.cfg.layerCost(p.realmIdx, p.layer || 1);
    const cult = p.cult || 0;
    const pct = last ? 100 : Math.max(0, Math.min(100, cult / cost * 100));
    let rate = 0;
    try { rate = (XG.stats && XG.stats.get().cultRate) || 0; } catch (e) { rate = 0; }
    const set = function (id, txt) { const el = $(id); if (el && el.textContent !== txt) el.textContent = txt; };
    set('xgh-avatar', (realm.name || '炼').charAt(0));
    set('xgh-name', p.name || '无名散修');
    set('xgh-realm', realm.name + (last ? '' : ' ' + (p.layer || 1) + ' 层'));
    const fill = $('xgh-top-fill');
    if (fill) fill.style.width = pct.toFixed(1) + '%';
    set('xgh-top-ptext', last ? '已至绝巅' : fmt(cult) + ' / ' + fmt(cost));
    set('xgh-top-rate', '修为 +' + fmt(rate) + '/秒');
    let power = 0;
    try { power = (XG.stats && XG.stats.get().power) || 0; } catch (e) { power = 0; }
    set('xgh-power', fmt(power));
    set('xgh-lingshi', fmtInt((S().res && S().res.lingShi) || 0));
    set('xgh-lingyu', fmtInt((S().res && S().res.lingYu) || 0));
  }

  // ============================ 底部导航 ============================
  function mainTabs() { return tabs.filter(function (t) { return t.main; }).slice(0, 4); }
  function moreTabs() { return tabs.filter(function (t) { return !t.main; }); }
  function buildNav() {
    const nav = $('bottom-nav');
    if (!nav) return;
    nav.innerHTML = '<div class="bottom-nav" id="xgh-nav-inner"></div>';
    if (!nav._xghBound) {
      nav._xghBound = true;
      nav.addEventListener('click', function (ev) {
        const item = ev.target && ev.target.closest ? ev.target.closest('[data-tab]') : null;
        if (!item) return;
        const id = item.getAttribute('data-tab');
        if (id === '__more') { toggleMore(); return; }
        showTab(id);
      });
    }
    navSync(true);
  }
  function navSync(force) {
    const inner = $('xgh-nav-inner');
    if (!inner) return;
    const items = mainTabs();
    let sig = activeId + '|';
    let html = '';
    for (const def of items) {
      const locked = tabLocked(def);
      const isNewB = !locked && isNew(def);
      sig += def.id + (locked ? 'L' : '') + (isNewB ? 'N' : '') + ';';
      html += '<div class="nav-item' + (def.id === activeId ? ' active' : '') + (locked ? ' xgh-lock' : '') + '"' +
        ' data-tab="' + esc(def.id) + '"' + (locked ? ' title="' + esc(unlockText(def.sysId)) + '"' : '') + '>' +
        '<span class="nav-ico">' + esc(def.icon || '·') + '</span><span>' + esc(def.name) + '</span>' +
        (isNewB ? '<span class="badge-new">NEW</span>' : '') +
        '</div>';
    }
    // 「更多」固定末格：有任意未解锁/新解锁的非 main tab 时带角标
    const anyNew = moreTabs().some(function (t) { return isNew(t); });
    sig += '__more' + (anyNew ? 'N' : '') + (moreOpen ? 'O' : '');
    html += '<div class="nav-item' + (moreOpen ? ' active' : '') + '" data-tab="__more">' +
      '<span class="nav-ico">✦</span><span>更多</span>' +
      (anyNew ? '<span class="badge-new">NEW</span>' : '') +
      '</div>';
    if (!force && sig === navSig) return;
    navSig = sig;
    inner.innerHTML = html;
  }

  // ============================ 「更多」底部弹层 ============================
  function toggleMore() { moreOpen ? closeMore() : openMore(); }
  function openMore() {
    moreOpen = true;
    moreSig = '';
    renderMore(true);
    navSync();
  }
  function closeMore() {
    moreOpen = false;
    const root = $('xgh-more-root');
    if (root) root.innerHTML = '';
    navSync();
  }
  function renderMore(force) {
    if (!moreOpen) return;
    let root = $('xgh-more-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'xgh-more-root';
      document.body.appendChild(root);
      root.addEventListener('click', function (ev) {
        if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-sheetmask')) { closeMore(); return; }
        const item = ev.target && ev.target.closest ? ev.target.closest('[data-mtab]') : null;
        if (!item) return;
        const id = item.getAttribute('data-mtab');
        const def = findTab(id);
        if (!def) return;
        if (tabLocked(def)) { toast(unlockText(def.sysId) || '机缘未至', 'info'); return; }
        closeMore();
        showTab(id);
      });
    }
    const list = moreTabs();
    let sig = '';
    let html = '<div class="xgh-sheet-mask" data-sheetmask="1"></div><div class="xgh-sheet">' +
      '<p class="xgh-sheet-title">—— 三界万象 ——</p><div class="xgh-more-grid">';
    for (const def of list) {
      const locked = tabLocked(def);
      const isNewB = !locked && isNew(def);
      sig += def.id + (locked ? 'L' : '') + (isNewB ? 'N' : '') + ';';
      html += '<div class="xgh-more-item' + (locked ? ' xgh-lock' : '') + '" data-mtab="' + esc(def.id) + '">' +
        '<span class="xgh-mi-ico">' + esc(def.icon || '·') + '</span>' +
        '<span>' + esc(def.name) + '</span>' +
        (locked ? '<span class="xgh-mi-cond">' + esc(unlockText(def.sysId)) + '</span>' : '') +
        (isNewB ? '<span class="badge-new">NEW</span>' : '') +
        '</div>';
    }
    if (!list.length) html += '<div class="muted" style="grid-column:1/-1;text-align:center">机缘未至，万象未开。</div>';
    html += '</div></div>';
    if (!force && sig === moreSig) return;
    moreSig = sig;
    root.innerHTML = html;
  }

  // ============================ tab 切换 ============================
  function showTab(id) {
    const def = findTab(id);
    if (!def) return false;
    if (tabLocked(def)) { toast(unlockText(def.sysId) || '机缘未至，此处尚未开启', 'info'); return false; }
    if (activeId === id) return true;
    const old = findTab(activeId);
    if (old && typeof old.unmount === 'function') {
      try { old.unmount(); } catch (e) { console.error('[ui] ' + old.id + '.unmount 出错', e); }
    }
    activeId = id;
    markSeen(id);
    const c = $('tab-container');
    if (!c) return false;
    c.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'tab-page';
    wrap.setAttribute('data-tab-page', id);
    c.appendChild(wrap);
    try {
      def.mount(wrap);
    } catch (e) {
      console.error('[ui] ' + id + '.mount 出错', e);
      wrap.innerHTML = '<div class="card"><h2 class="card-title">此处风水不佳</h2><p class="card-sub">界面渲染受阻，请稍后再试。</p></div>';
    }
    navSync();
    return true;
  }
  function renderActive() {
    const def = findTab(activeId);
    if (!def) return;
    if (typeof def.unmount === 'function') {
      try { def.unmount(); } catch (e) { /* 忽略 */ }
    }
    const keep = activeId;
    activeId = null;
    showTab(keep);
  }

  // ============================ 离线结算弹窗（modal:offline） ============================
  function pillName(id) {
    const base = String(id).replace(/_star$/, '');
    const list = (XG.data && XG.data.pills && XG.data.pills.recipes) || [];
    for (const r of list) if (r.id === base) return r.name + (/_star$/.test(id) ? '★' : '');
    return base;
  }
  function showOfflineModal(rep) {
    if (!rep) return;
    let html = '<p style="text-align:center;margin:2px 0">山中方数日，世上已千年。<br>你此次闭关 <b class="xgh-gold">' + fmtTime(rep.dt || 0) + '</b>，神游太虚而归。</p>';
    if (rep.capped || rep.truncated) {
      let capSec = 0;
      try { capSec = XG.stats.get().offlineCapSec || 0; } catch (e) { capSec = 0; }
      html += '<p class="xgh-warn" style="text-align:center;margin:2px 0">闭关机缘已至上限' + (capSec ? '（' + fmtTime(capSec) + '）' : '') + '，溢出岁月随风而散。</p>';
    }
    html += '<hr class="xgh-hr"><ul>';
    if (rep.cultGain) html += '<li>修为 <span class="xgh-gold">+' + fmt(rep.cultGain) + '</span></li>';
    const RES_NAMES = { lingShi: '灵石', lingYu: '灵玉' };
    if (rep.resGain) {
      for (const k in rep.resGain) {
        if (!rep.resGain[k]) continue;
        html += '<li>' + esc(RES_NAMES[k] || k) + ' <span class="xgh-gold">+' + fmt(rep.resGain[k]) + '</span></li>';
      }
    }
    if (rep.pillGain) {
      for (const id in rep.pillGain) {
        if (!rep.pillGain[id]) continue;
        html += '<li>丹药「' + esc(pillName(id)) + '」×' + fmtInt(rep.pillGain[id]) + '</li>';
      }
    }
    if (rep.cave && rep.cave.note) html += '<li>' + esc(rep.cave.note) + '</li>';
    html += '</ul>';
    if (rep.expedition && rep.expedition.items && rep.expedition.items.length) {
      html += '<hr class="xgh-hr"><p style="margin:2px 0"><b>历练归报</b></p><ul>';
      rep.expedition.items.slice(0, 6).forEach(function (s) { html += '<li>' + esc(s) + '</li>'; });
      html += '</ul>';
    }
    if (rep.events && rep.events.length) {
      html += '<hr class="xgh-hr"><p style="margin:2px 0"><b>闭关简讯</b></p><ul>';
      rep.events.slice(0, 8).forEach(function (s) { html += '<li>' + esc(s) + '</li>'; });
      if (rep.events.length > 8) html += '<li class="muted">……另有 ' + (rep.events.length - 8) + ' 桩小事，不足挂齿。</li>';
      html += '</ul>';
    }
    if (rep.fellowNews && rep.fellowNews.length) {
      html += '<hr class="xgh-hr"><p style="margin:2px 0"><b>道友动态</b></p><ul>';
      rep.fellowNews.slice(0, 6).forEach(function (s) { html += '<li>' + esc(s) + '</li>'; });
      html += '</ul>';
    }
    modal({ title: '闭关岁月', html: html, buttons: [{ text: '收入囊中', cls: 'btn-primary' }] });
  }

  // ============================ boot（main.js 调用） ============================
  function boot() {
    if (booted) return;
    booted = true;
    injectCss();
    bindModalRoot();
    // 消费先于此文件加载的 tab 队列（防御：其他 ui 文件可能先加载）
    const pend = XG._pendingTabs || [];
    XG._pendingTabs = [];
    pend.forEach(registerTab);

    buildTopbar();
    buildTicker();
    buildNav();

    // 默认打开首个 main tab（修炼）
    const first = mainTabs()[0] || tabs[0];
    if (first) showTab(first.id);
    refreshTop();

    // boot 前到达的离线报告：UI 就绪后补弹
    if (pendingOffline) {
      const r = pendingOffline;
      pendingOffline = null;
      setTimeout(function () { showOfflineModal(r); }, 350);
    }

    // 1s UI 刷新循环（契约 §12：仅活跃 tab 的 update 被调）
    setInterval(function () {
      try {
        refreshTop();
        navSync();
        renderMore();
        const def = findTab(activeId);
        if (def && typeof def.update === 'function') def.update(1);
      } catch (e) {
        console.error('[ui] 刷新循环出错', e);
      }
    }, 1000);
  }

  // ============================ 总线订阅（文件级：modal:offline 先于 boot 到达） ============================
  XG.bus.on('modal:offline', function (rep) {
    if (booted) showOfflineModal(rep);
    else pendingOffline = rep;
  });
  XG.bus.on('fx:breakthrough', function () {
    if (booted) fx.breakthrough();
  });
  XG.bus.on('ach:done', function (p) {
    if (!booted || !p) return;
    let name = p.id || '';
    const list = XG.data && XG.data.ach;
    if (list && list.length) {
      for (const a of list) if (a.id === p.id) { name = (a.icon ? a.icon + ' ' : '') + a.name; break; }
    }
    toast('成就达成 · ' + name, 'gold');
  });
  // 新奇遇临门：金色轻提示引至页首提醒条（频率天然克制：1~3 分钟一桩）
  XG.bus.on('adv:pending', function () {
    if (!booted) return;
    toast('奇遇临门，且见页首提醒', 'gold');
    try { refreshReminds(); } catch (e) { /* 不在主页亦无妨 */ }
  });
  XG.bus.on('codex:new', function (p) {
    if (!booted || !p) return;
    const KIND_NAMES = { gongfa: '功法', pill: '丹方', pet: '灵宠', equip: '装备', fellow: '道友' };
    let name = '';
    try {
      if (p.kind === 'gongfa') {
        const pool = ((XG.data.gongfa && XG.data.gongfa.list) || []).concat((S().gongfa && S().gongfa.custom) || []);
        for (const g of pool) if (g.id === p.id) { name = g.name; break; }
      } else if (p.kind === 'pill') {
        for (const r of (XG.data.pills && XG.data.pills.recipes) || []) if (r.id === p.id) { name = r.name; break; }
      } else if (p.kind === 'pet') {
        for (const sp of (XG.data.pets && XG.data.pets.species) || []) if (sp.id === p.id) { name = sp.name; break; }
      } else if (p.kind === 'equip') {
        for (const b of (XG.data.equips && XG.data.equips.bases) || []) if (b.id === p.id) { name = b.name; break; }
      } else if (p.kind === 'fellow') {
        const fn = S().codex && S().codex.fellowNames;
        name = (fn && fn[p.id]) || '';
      }
    } catch (e) { name = ''; }
    toast('图鉴新收录 · ' + (KIND_NAMES[p.kind] || '万物') + (name ? '「' + name + '」' : ''), 'gold');
  });
  XG.bus.on('news', function (item) {
    if (!booted) return;
    tickerIdx = 0;
    restartTicker();
  });
  // 资源/修为变动 → 节流刷新顶栏
  XG.bus.on('res:changed', function () {
    if (!booted || topTimer) return;
    topTimer = setTimeout(function () { topTimer = 0; refreshTop(); }, 300);
  });

  // ============================================================
  // 修炼主页 tab（id:'home', main:true, order:0）
  // ============================================================
  const H = { el: null, sig: {}, brkSelected: [] };

  function setT(id, txt) {
    const el = H.el && H.el.querySelector('#' + id);
    if (el && el.textContent !== txt) el.textContent = txt;
  }
  function sigHTML(key, html) {
    if (H.sig[key] === html) return;
    H.sig[key] = html;
    const el = H.el && H.el.querySelector('#xgh-' + key);
    if (el) el.innerHTML = html;
  }
  function effText(eff) {
    if (!eff) return '';
    const NAMES = {
      cultRatePct: '修炼速度', atkPct: '攻击', defPct: '防御', hpPct: '气血', spdPct: '身法',
      dropPct: '掉落', alchSuccPct: '炼丹成功率', forgeSuccPct: '锻造成功率', breakSuccPct: '破境成功率',
      workPct: '杂务效率', offlineHours: '离线收益', atkFlat: '攻击', defFlat: '防御', hpFlat: '气血', spdFlat: '身法',
    };
    const parts = [];
    for (const k in eff) {
      const v = eff[k];
      if (!v) continue;
      if (k === 'offlineHours') parts.push(NAMES[k] + ' +' + v + ' 小时');
      else if (/Pct$/.test(k)) parts.push(NAMES[k] + ' +' + v + '%');
      else parts.push((NAMES[k] || k) + ' +' + fmt(v));
    }
    return parts.join('，');
  }

  // ---------- ① 境界大卡 ----------
  function refreshRealm() {
    const p = S().player;
    if (!p) return;
    const cv = call('cultivation', 'getCultView');
    const bi = call('cultivation', 'getBreakInfo');
    const realm = XG.cfg.REALMS[p.realmIdx] || XG.cfg.REALMS[0];
    const last = p.realmIdx >= XG.cfg.REALMS.length - 1;
    const cost = bi ? bi.cost : (last ? Infinity : XG.cfg.layerCost(p.realmIdx, p.layer || 1));
    const cult = p.cult || 0;
    const pct = last ? 100 : Math.max(0, Math.min(100, cult / cost * 100));

    setT('xgh-r-name', realm.name + (last ? '' : ' ' + (p.layer || 1) + ' / ' + XG.cfg.LAYERS + ' 层'));
    setT('xgh-r-mode', cv ? (cv.modeName + ' ×' + cv.modeMult) : '');
    const fill = H.el.querySelector('#xgh-r-fill');
    if (fill) fill.style.width = pct.toFixed(1) + '%';
    setT('xgh-r-ptext', last ? '已至飞升绝巅' : fmt(cult) + ' / ' + fmt(cost));
    setT('xgh-r-rate', cv ? ('吐纳修为 +' + cv.cultRateText) : '');
    // 顿悟状态行
    let dw = '';
    if (cv && cv.dunwu) {
      dw = cv.dunwu.active ? ('顿悟中！修炼 ×' + cv.dunwu.mult + ' · 余 ' + fmtTime(cv.dunwu.remain)) : '';
    }
    setT('xgh-r-dunwu', dw);
    const dwEl = H.el.querySelector('#xgh-r-dunwu');
    if (dwEl) dwEl.className = dw ? 'xgh-dunwu-on' : 'muted';

    // 突破按钮（小境界「精进」/ 大境界「突破」）
    const btn = H.el.querySelector('#xgh-brk-btn');
    if (btn && bi) {
      btn.textContent = bi.big ? '突破' : '精进';
      btn.disabled = !bi.canBreak;
      btn.title = bi.canBreak ? '' : (bi.err || '');
    }
    let info = '';
    if (bi) {
      if (last) info = '已至绝巅，进无可进';
      else if (bi.big) {
        info = '冲击「' + bi.targetText + '」· 需修为 ' + bi.costText + ' · 成功率 ' + Math.round(bi.baseRate * 100) + '%';
        if (bi.failBonus > 0) info += '（保底 +' + Math.round(bi.failBonus * 100) + '%）';
      } else {
        info = '下一层需修为 ' + bi.costText + '，水到渠成';
      }
    }
    setT('xgh-brk-info', info);
  }

  // ---------- ② 修炼模式三选 ----------
  function refreshModes() {
    const mi = call('cultivation', 'getModeInfo');
    if (!mi) return;
    const di = call('cultivation', 'getDunwuInfo');
    // 网格仅在关键状态变化时重绘（防吞点击）；倒计时提示每秒文字刷新
    const gsig = mi.mode + '|' + (mi.locked ? 1 : 0) + '|' + (di && di.active ? 1 : 0) + '|' + (di && di.boost && di.boost.active ? 1 : 0);
    if (H.sig.modes !== gsig) {
      H.sig.modes = gsig;
      let html = '';
      for (const m of mi.modes) {
        const on = m.id === mi.mode;
        html += '<div class="xgh-mode' + (on ? ' xgh-on' : '') + (mi.locked && !on ? ' xgh-off' : '') + '" data-act="mode" data-mode="' + esc(m.id) + '" title="' + esc(m.desc) + '">' +
          '<div class="xgh-mode-name">' + esc(m.name) + '</div>' +
          '<div class="xgh-mode-sub">修炼 ×' + m.mult + '</div></div>';
      }
      // 顿悟格：非可选模式，点击弹出机制说明（防误以为「没生效」）
      let dwSub = '随机降临 · 降临×' + ((di && di.mult) || 5);
      if (di && di.active) dwSub = '降临中！余 ' + fmtTime(di.remain);
      else if (di && di.chancePerSec > 0) dwSub = '约 ' + fmtTime(1 / di.chancePerSec) + ' 一遇';
      if (di && di.boost && di.boost.active) dwSub += ' · 悟性丹 +' + di.boost.pct + '%';
      html += '<div class="xgh-mode' + (di && di.active ? ' xgh-on' : '') + '" data-act="dunwu-info" style="cursor:pointer" title="顿悟不可强求，随机降临；降临时 30 秒修炼 ×5。悟性丹可提升降临几率。点击查看详情。">' +
        '<div class="xgh-mode-name">顿悟 · 机缘</div><div class="xgh-mode-sub">' + esc(dwSub) + '</div></div>';
      const grid = H.el.querySelector('#xgh-modes');
      if (grid) grid.innerHTML = html;
    }
    let tip = '';
    if (mi.locked) tip = '闭关锁脉中，尚需 ' + fmtTime(mi.lockRemain) + ' 方可改修他法。';
    else {
      const cur = (mi.modes || []).filter(function (m) { return m.id === mi.mode; })[0];
      tip = cur ? cur.desc : '';
      if (tip) tip += '点击场景中的小人可手动吐纳（每次约得20秒修为）。';
    }
    setT('xgh-mode-tip', tip);
  }

  // ---------- ③ 一键操作行 ----------
  function countCultPills() {
    const bag = (S().inv && S().inv.pill) || {};
    const TYPES = { cult: 1, atk: 1, def: 1, hp: 1, work: 1 };
    const recipes = (XG.data && XG.data.pills && XG.data.pills.recipes) || [];
    const map = {};
    for (const r of recipes) map[r.id] = r;
    let n = 0;
    for (const id in bag) {
      const r = map[String(id).replace(/_star$/, '')];
      if (r && r.eff && TYPES[r.eff.type] && (bag[id] || 0) > 0) n += bag[id];
    }
    return n;
  }
  function refreshQuick() {
    const st = {};
    // 一键领取：洞府灵田池 / 灵宠打工池 任一有货
    let collect = false, collectWhy = '各处仓廪皆空，暂无进项';
    try {
      const pool = call('cave', 'getPool');
      if (pool && pool.whole > 0) collect = true;
      const pend = call('pets', 'pending');
      if (!collect && pend && (pend.lingShi >= 1 || (pend.mat && Object.keys(pend.mat).length))) collect = true;
    } catch (e) { /* 忽略 */ }
    st.collect = { can: collect, why: collectWhy };
    // 一键修炼：有修为丹/增益丹
    const pillN = countCultPills();
    st.cult = { can: pillN > 0, why: '囊中没有修为丹或增益丹' };
    // 一键派遣
    let disp = false, dispWhy = '';
    if (!(XG.cfg.isUnlocked && XG.cfg.isUnlocked('expedition'))) dispWhy = unlockText('expedition');
    else {
      const slots = call('expedition', 'getSlots');
      const act = call('expedition', 'getActive') || [];
      const idle = call('expedition', 'getIdlePets') || [];
      if (slots && act.length >= slots.max) dispWhy = '远征队伍尽数在外';
      else if (!idle.length) dispWhy = '无空闲灵宠可使（炼气5层解锁灵宠）';
      else disp = true;
    }
    st.dispatch = { can: disp, why: dispWhy };
    // 一键扫荡
    let sweep = false, sweepWhy = '';
    if (!(XG.cfg.isUnlocked && XG.cfg.isUnlocked('dungeon_tower'))) sweepWhy = unlockText('dungeon_tower');
    else {
      const si = call('dungeon', 'sweepInfo');
      if (!si) sweepWhy = '秘境未开';
      else if (si.best <= 1) sweepWhy = '尚未登顶任何层数';
      else if (!si.canSweep) sweepWhy = '今日免费次数已尽，灵玉亦不足';
      else sweep = true;
    }
    st.sweep = { can: sweep, why: sweepWhy };
    H.quick = st;
    const patch = function (id, v) {
      const b = H.el.querySelector('#' + id);
      if (!b) return;
      b.disabled = !v.can;
      b.title = v.can ? '' : v.why;
    };
    patch('xgh-q-collect', st.collect);
    patch('xgh-q-cult', st.cult);
    patch('xgh-q-dispatch', st.dispatch);
    patch('xgh-q-sweep', st.sweep);
  }

  // ---------- ③.5 修行录卡（新手目标，防御性读 XG.sys.guide） ----------
  function refreshGuide() {
    const card = H.el && H.el.querySelector('#xgh-guide-card');
    if (!card) return;
    const g = sys('guide');
    if (!g) { card.style.display = 'none'; return; }
    card.style.display = '';
    const goal = call('guide', 'nextGoal');
    // 主体（目标名/描述/奖励/领取按钮）仅在状态签名变化时重绘——进度条走下方安全刷新，不打断领取点击
    const sig = goal ? (goal.id + '|' + (goal.done ? 1 : 0) + '|' + (goal.claimed ? 1 : 0)) : 'all';
    if (H.sig.guide !== sig) {
      H.sig.guide = sig;
      let html = '';
      if (!goal) {
        html = '<div class="xgh-line"><span class="xgh-li">🏅</span><span class="xgh-lv"><span class="xgh-gold">修行录已圆满</span>，仙途漫漫，此后且看你自己走了。</span></div>';
      } else {
        html = '<div class="xgh-line"><span class="xgh-li">📜</span><span class="xgh-lt">目标</span>' +
          '<span class="xgh-lv"><b>' + esc(goal.name) + '</b> · ' + esc(goal.desc) + '</span></div>' +
          '<div class="xgh-line"><span class="xgh-li">🎁</span><span class="xgh-lt">酬赏</span><span class="xgh-lv">' + esc(goal.rewardText) + '</span></div>';
        if (goal.done && !goal.claimed) {
          html += '<button class="btn btn-primary xgh-guide-claim" data-act="guide-claim" data-id="' + esc(goal.id) + '">领取酬赏</button>';
        }
      }
      const body = H.el.querySelector('#xgh-guide-body');
      if (body) body.innerHTML = html;
    }
    // 进度条：每秒只改宽度与文字（不重写按钮 DOM）
    const fill = H.el.querySelector('#xgh-guide-fill');
    const pct = goal && goal.target > 0 ? Math.min(100, goal.progress / goal.target * 100) : 100;
    if (fill) fill.style.width = pct.toFixed(1) + '%';
    setT('xgh-guide-ptext', goal ? (fmt(Math.min(goal.progress, goal.target)) + ' / ' + fmt(goal.target)) : '');
  }

  // ---------- ④ 当前目标卡 ----------
  function refreshGoals() {
    const p = S().player;
    if (!p) return;
    const lines = [];
    // 下一境界：还差多少修为 / 预计时间
    const bi = call('cultivation', 'getBreakInfo');
    if (bi && bi.cost !== Infinity) {
      const need = Math.max(0, bi.cost - (p.cult || 0));
      let rate = 0;
      try { rate = XG.stats.get().cultRate || 0; } catch (e) { rate = 0; }
      if (need <= 0) {
        lines.push({ i: '🎯', t: '下一境界', v: '修为已足，可随时' + (bi.big ? '冲击「' + bi.targetText + '」' : '精进一步') });
      } else {
        const eta = rate > 0 ? fmtTime(need / rate) : '遥遥无期';
        lines.push({ i: '🎯', t: '下一境界', v: '距「' + bi.targetText + '」尚缺修为 ' + fmt(need) + '，约需 ' + eta });
      }
    } else {
      lines.push({ i: '🎯', t: '下一境界', v: '已至飞升绝巅，进无可进' });
    }
    // 图鉴完成度
    const cs = call('collection', 'getCodexSummary');
    if (cs) lines.push({ i: '📖', t: '万灵图鉴', v: '完成度 ' + cs.pct + '%（' + cs.collected + ' / ' + cs.total + '）' });
    // 秘境层数
    let towerTxt = '';
    const ti = call('dungeon', 'towerInfo');
    if (ti && ti.unlocked) towerTxt = '镇妖塔 第 ' + ti.layer + ' 层 · 历史最佳 ' + ti.best + ' 层';
    else if (XG.cfg.isUnlocked && !XG.cfg.isUnlocked('dungeon_tower')) towerTxt = '镇妖塔 · ' + unlockText('dungeon_tower');
    if (towerTxt) lines.push({ i: '🗼', t: '秘境', v: towerTxt });
    // 轮回次数
    const rn = p.reincarn || 0;
    let reinTxt = '已历 ' + rn + ' 世轮回';
    if (!rn) {
      const open = call('reincarn', 'isOpen');
      reinTxt = open ? '飞升在望，可引天劫' : '未入轮回（渡劫10层开启）';
    }
    lines.push({ i: '🔄', t: '轮回', v: reinTxt });

    const html = lines.map(function (l) {
      return '<div class="xgh-line"><span class="xgh-li">' + l.i + '</span><span class="xgh-lt">' + esc(l.t) + '</span><span class="xgh-lv">' + esc(l.v) + '</span></div>';
    }).join('');
    sigHTML('goals', html);
  }

  // ---------- ⑤ 灵根卡 ----------
  function refreshRoot() {
    const ri = call('cultivation', 'getRootInfo');
    if (!ri) return;
    const rsig = [ri.effId, ri.grade, ri.mult, ri.canWash, ri.washBoost && ri.washBoost.active, ri.mut].join('|');
    if (H.sig.root !== rsig) {
      H.sig.root = rsig;
      let html = '<div class="xgh-line"><span class="xgh-li">☯️</span><span class="xgh-lt">灵根</span>' +
        '<span class="xgh-lv"><b>' + esc(ri.effName) + '</b>（' + ri.grade + ' 品）· 修炼加成 ×' + ri.mult +
        (ri.mut ? ' · <span class="xgh-gold">已变异</span>' : '') + '</span></div>';
      if (ri.mut && ri.typeName) html += '<div class="xgh-line"><span class="xgh-li"></span><span class="xgh-lt">基底</span><span class="xgh-lv muted">' + esc(ri.typeName) + '</span></div>';
      if (ri.desc) html += '<div class="xgh-line"><span class="xgh-li"></span><span class="xgh-lv muted">' + esc(ri.desc) + '</span></div>';
      html += '<div class="xgh-line"><span class="xgh-li">🧪</span><span class="xgh-lt">洗练</span><span class="xgh-lv muted">耗 ' + esc(ri.washCostText) + '，重铸五行，小概率变异（冰雷风暗光，乃至传说中的混沌）</span></div>';
      const el = H.el.querySelector('#xgh-root');
      if (el) el.innerHTML = html;
    }
    // 变异加成倒计时（淬灵丹）
    let boost = '';
    if (ri.washBoost && ri.washBoost.active) boost = '淬灵丹加持：洗练变异率 +' + ri.washBoost.pct + '%（余 ' + fmtTime(ri.washBoost.remain) + '）';
    setT('xgh-root-tip', boost);
    const btn = H.el.querySelector('#xgh-wash-btn');
    if (btn) {
      btn.disabled = !ri.canWash;
      btn.title = ri.canWash ? '' : (ri.washErr || '');
    }
  }

  // ---------- ⑥ 每日提醒角标 ----------
  function refreshReminds() {
    const chips = [];
    // 奇遇待决置顶（金框脉冲，此前无入口会导致奇遇系统卡死，务必醒目）
    if (XG.cfg.isUnlocked && XG.cfg.isUnlocked('adventure')) {
      const pd = call('adventure', 'getPending');
      if (pd) chips.push({ adv: 1, label: '奇遇 · ' + (pd.title || '待决') });
    }
    if (XG.cfg.isUnlocked && XG.cfg.isUnlocked('fellows')) {
      const list = call('fellows', 'list') || [];
      let dn = 0;
      for (const f of list) if (f.canDiscuss) dn++;
      if (dn > 0) chips.push({ tab: 'fellows', label: '论道 ×' + dn });
      const helps = call('fellows', 'listHelp') || [];
      let hn = 0;
      for (const h of helps) if (!h.done) hn++;
      if (hn > 0) chips.push({ tab: 'fellows', label: '求助 ×' + hn });
    }
    if (XG.cfg.isUnlocked && XG.cfg.isUnlocked('dungeon_tower')) {
      const si = call('dungeon', 'sweepInfo');
      if (si && si.freeLeft > 0 && si.best > 1) chips.push({ tab: 'dungeon', label: '免费扫荡 ×' + si.freeLeft });
    }
    if (XG.cfg.isUnlocked && XG.cfg.isUnlocked('market')) {
      const mk = call('fellows', 'market');
      if (mk && mk.unlocked && (mk.refreshAt || 0) > (settings().mktSeen || 0)) {
        chips.push({ tab: 'market', label: '坊市新货', mkt: 1 });
      }
    }
    const html = chips.map(function (c) {
      if (c.adv) return '<span class="xgh-chip xgh-chip-adv" data-act="adv-open"><span class="xgh-dot"></span>' + esc(c.label) + '</span>';
      return '<span class="xgh-chip" data-act="remind" data-tab="' + esc(c.tab) + '"' + (c.mkt ? ' data-mkt="1"' : '') + '><span class="xgh-dot"></span>' + esc(c.label) + '</span>';
    }).join('');
    sigHTML('reminds', html);
  }

  // ---------- 奇遇决断弹窗 ----------
  const ADV_VIA = { cultivate: '静坐偶得', explore: '历练偶遇', offline: '归来机缘', chain: '连锁后缘' };
  // 打开当前待决奇遇（无待决则提示）
  function openAdventure() {
    const p = call('adventure', 'getPending');
    if (!p) { toast('眼下并无待决奇遇', 'info'); return; }
    let h = '<div style="text-align:center;font-size:26px;margin:2px 0">' + esc(p.icon || '✨') + '</div>'
      + (p.via ? '<div class="muted" style="text-align:center;margin-bottom:4px">' + esc(ADV_VIA[p.via] || '机缘') + '</div>' : '')
      + '<p style="margin:6px 0;line-height:1.7">' + esc(p.text || '') + '</p>';
    const btns = (p.choices || []).map(function (c, i) {
      return {
        text: c.reqOk === false ? (c.text + '（' + (c.reqText || '条件未足') + '）') : c.text,
        cls: c.reqOk === false ? 'btn-ghost' : (i === 0 ? 'btn-primary' : ''),
        cb: function () {
          if (c.reqOk === false) { toast('条件未足：' + (c.reqText || '境界未至'), 'red'); return false; }
          const r = call('adventure', 'choose', [c.i != null ? c.i : i]);
          if (!r || !r.ok) { toast((r && r.msg) || (r && r.err) || '抉择失败', 'red'); return false; }
          showAdventureResult(r);
          return false; // 弹窗链式复用，不关闭
        },
      };
    });
    modal({ title: '奇遇 · ' + (p.title || ''), html: h, buttons: btns.length ? btns : [{ text: '告辞' }] });
  }
  // 抉择结果展示；有连锁则「一探究竟」接续下一桩
  function showAdventureResult(r) {
    let h = '';
    (r.msg || []).forEach(function (m) { h += '<p style="margin:4px 0;line-height:1.6">' + esc(m) + '</p>'; });
    if (r.hiddenEnd) h += '<div class="xgh-adv-hidden">【隐藏结局】' + esc(r.hiddenEnd) + '</div>';
    try { homeUpdate(); } catch (e) { /* 刷新主页资源/提醒 */ }
    if (r.next) {
      modal({
        title: '余波未平', html: h,
        buttons: [{ text: '一探究竟', cls: 'btn-primary', cb: function () { openAdventure(); return false; } }],
      });
    } else {
      modal({ title: '奇遇已了', html: h || '<p>事已毕，你收束心神，继续修行。</p>', buttons: [{ text: '收入囊中', cls: 'btn-primary' }] });
    }
  }

  // ---------- 主页聚合刷新 ----------
  function homeUpdate() {
    if (!H.el) return;
    try { refreshRealm(); } catch (e) { console.error('[home] 境界卡', e); }
    try { refreshModes(); } catch (e) { console.error('[home] 模式', e); }
    try { refreshQuick(); } catch (e) { console.error('[home] 一键', e); }
    try { refreshGuide(); } catch (e) { console.error('[home] 修行录', e); }
    try { refreshGoals(); } catch (e) { console.error('[home] 目标', e); }
    try { refreshRoot(); } catch (e) { console.error('[home] 灵根', e); }
    try { refreshReminds(); } catch (e) { console.error('[home] 提醒', e); }
  }

  // ---------- 突破交互 ----------
  function openBreak() {
    const bi = call('cultivation', 'getBreakInfo');
    if (!bi) return;
    if (!bi.canBreak) { toast(bi.err || '修为未足，机缘未至', 'red'); return; }
    if (!bi.big) {
      const r = call('cultivation', 'tryBreakthrough');
      if (r && r.ok) toast(r.msg || '境界精进！', 'gold');
      else if (r) toast(r.err || r.msg || '突破受阻', 'red');
      homeUpdate();
      return;
    }
    H.brkSelected = [];
    renderBreakModal();
  }
  function renderBreakModal() {
    const bi = call('cultivation', 'getBreakInfo');
    if (!bi) { closeModal(); return; }
    const n = H.brkSelected.length;
    const rate = bi.rateWith(n);
    let html = '<p style="text-align:center;margin:2px 0">冲击「' + esc(bi.targetText) + '」· 当前成功率 <b class="xgh-gold">' + Math.round(rate * 100) + '%</b></p>' +
      '<p class="muted" style="text-align:center;margin:2px 0">基础 ' + Math.round((bi.baseRate - bi.failBonus) * 100) + '%' +
      (bi.failBonus > 0 ? ' + 保底 ' + Math.round(bi.failBonus * 100) + '%' : '') +
      ' · 每颗破境丹 +' + Math.round((XG.cfg.BREAK_PILL_BONUS || 0.15) * 100) + '%（至多 ' + bi.pillMax + ' 颗）· 败则修为折半</p>' +
      '<hr class="xgh-hr">';
    if (bi.pills && bi.pills.length) {
      for (const pl of bi.pills) {
        const on = H.brkSelected.indexOf(pl.id) >= 0;
        const off = !on && n >= bi.pillMax;
        html += '<div class="xgh-pill' + (on ? ' xgh-on' : '') + (off ? ' xgh-off' : '') + '" data-pill="' + esc(pl.id) + '">' +
          '<span class="xgh-pi">' + esc(pl.icon || '💊') + '</span>' +
          '<span class="xgh-pn">' + esc(pl.name) + '（' + pl.grade + ' 品）</span>' +
          '<span class="xgh-pc">×' + pl.count + '</span></div>';
      }
    } else {
      html += '<p class="muted" style="text-align:center">囊中没有合用的破境丹，只能以血肉之躯硬撼玄关。</p>';
    }
    modal({
      title: '破境玄关',
      html: html,
      buttons: [
        {
          text: '逆天突破（' + Math.round(rate * 100) + '%）', cls: 'btn-primary', cb: function () {
            const r = call('cultivation', 'tryBreakthrough', [H.brkSelected.slice()]);
            if (!r) return;
            if (!r.ok) { toast(r.err || '突破受阻', 'red'); return; }
            if (r.success) toast(r.msg || '突破成功！', 'gold'); // 全屏特效由 bus 'fx:breakthrough' 播放
            else { toast(r.msg || '突破失败', 'red'); fx.shake(); }
          },
        },
        { text: '再筹备些时日', cls: 'btn-ghost' },
      ],
    });
  }
  function toggleBrkPill(id) {
    const bi = call('cultivation', 'getBreakInfo');
    if (!bi) return;
    const i = H.brkSelected.indexOf(id);
    if (i >= 0) H.brkSelected.splice(i, 1);
    else {
      if (H.brkSelected.length >= bi.pillMax) { toast('破境丹至多服 ' + bi.pillMax + ' 颗', 'info'); return; }
      H.brkSelected.push(id);
    }
    renderBreakModal();
  }

  // ---------- 灵根洗练 ----------
  function doWash() {
    const ri = call('cultivation', 'getRootInfo');
    if (!ri) return;
    if (!ri.canWash) { toast(ri.washErr || '资材不足', 'red'); return; }
    confirm('洗练灵根将耗 ' + ri.washCostText + '；灵根重铸五行，变异难测（或有冰雷风暗光之机缘）。确定洗练？', function () {
      const r = call('cultivation', 'washRoot');
      if (!r) return;
      if (r.ok) {
        toast(r.msg || '洗练已毕', r.mutated ? 'gold' : 'info');
        if (r.mutated) fx.drop(3);
      } else toast(r.err || '洗练不成', 'red');
      H.sig.root = '';
      refreshRoot();
    });
  }

  // ---------- 经脉弹窗 ----------
  function meridianHtml() {
    const list = call('cultivation', 'getMeridians') || [];
    if (!list.length) return '<p class="muted">经脉图谱尚未现世，且待后缘。</p>';
    const branches = [];
    const byBranch = {};
    for (const m of list) {
      const b = m.branch || '任脉';
      if (!byBranch[b]) { byBranch[b] = []; branches.push(b); }
      byBranch[b].push(m);
    }
    const litN = list.filter(function (m) { return m.lit; }).length;
    let html = '<p class="muted" style="text-align:center;margin:2px 0">已通 ' + litN + ' / ' + list.length + ' 穴 · 点穴耗修为，须循序渐进</p>';
    for (const b of branches) {
      html += '<div class="xgh-branch"><div class="xgh-branch-name">' + esc(b) + '</div><div class="xgh-acus">';
      for (const m of byBranch[b]) {
        const cls = m.lit ? 'xgh-lit' : (m.can ? 'xgh-can' : '');
        const title = m.name + ' · 耗修为 ' + m.costText + (m.eff ? '\n' + effText(m.eff) : '') + (m.err ? '\n' + m.err : '');
        html += '<span class="xgh-acu ' + cls + '"' + (m.can ? ' data-acu="' + esc(m.id) + '"' : '') + ' title="' + esc(title) + '">' +
          (m.lit ? '✦ ' : '') + esc(m.name) + '</span>';
      }
      html += '</div></div>';
    }
    return html;
  }
  function setModalBody(html) {
    const b = document.querySelector('#modal-root .xgh-modal-body');
    if (b) b.innerHTML = html;
  }
  function openMeridian() {
    modal({ title: '经脉穴位', html: meridianHtml(), buttons: [{ text: '收功', cls: 'btn-ghost' }] });
  }
  function doLightAcu(id) {
    const r = call('cultivation', 'lightMeridian', [id]);
    if (!r) return;
    toast(r.ok ? r.msg : (r.err || '点穴不成'), r.ok ? 'gold' : 'red');
    setModalBody(meridianHtml());
    homeUpdate();
  }

  // ---------- 一键操作 ----------
  function quickCollect() {
    const lines = [];
    for (const id of (XG.sysOrder || [])) {
      const m = sys(id);
      if (!m || typeof m.quickCollect !== 'function') continue;
      try {
        const r = m.quickCollect();
        if (r && r.msg && r.msg.length) lines.push.apply(lines, r.msg);
      } catch (e) { console.error('[home] ' + id + '.quickCollect 出错', e); }
    }
    if (!lines.length) { toast('各处仓廪皆空，暂无进项可领', 'info'); return; }
    modal({
      title: '一键领取',
      html: '<ul>' + lines.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>',
      buttons: [{ text: '收入囊中', cls: 'btn-primary' }],
    });
  }
  function quickCultivate() {
    const bag = (S().inv && S().inv.pill) || {};
    const TYPES = { cult: 1, atk: 1, def: 1, hp: 1, work: 1 };
    const recipes = (XG.data && XG.data.pills && XG.data.pills.recipes) || [];
    const map = {};
    for (const r of recipes) map[r.id] = r;
    const plan = [];
    for (const id in bag) {
      const base = String(id).replace(/_star$/, '');
      const r = map[base];
      if (!r || !r.eff || !TYPES[r.eff.type] || (bag[id] || 0) <= 0) continue;
      plan.push({ id: id, n: bag[id], eff: r.eff, star: /_star$/.test(id) });
    }
    if (!plan.length) { toast('囊中没有修为丹或增益丹可服', 'info'); return; }
    if (!sys('alchemy') || typeof sys('alchemy').usePill !== 'function') { toast('丹道未开，无法服丹', 'red'); return; }
    let ate = 0, cultSum = 0, blocked = 0;
    for (const it of plan) {
      for (let i = 0; i < it.n; i++) {
        const r = call('alchemy', 'usePill', [it.id]);
        if (r && r.ok) {
          ate++;
          if (it.eff.type === 'cult' && !it.eff.dur) cultSum += it.eff.val * (it.star ? 1.5 : 1);
        } else { blocked += it.n - i; break; }
      }
    }
    if (ate > 0) {
      pop('连服 ' + ate + ' 枚丹药，药力通达百脉', 'gold');
      if (cultSum > 0) pop('+' + fmt(cultSum) + ' 修为', '');
    }
    let msg = ate > 0 ? ('服下 ' + ate + ' 枚丹药') : '一枚也未服下';
    if (blocked > 0) msg += '，' + blocked + ' 枚因丹毒淤积受阻';
    if (ate > 0) msg += '（丹毒 ' + Math.round((S().player && S().player.toxicity) || 0) + '）';
    toast(msg, ate > 0 ? 'gold' : 'red');
    homeUpdate();
  }
  function quickDispatch() {
    const r = call('expedition', 'quickDispatch');
    if (!r) return;
    if (!r.ok) { toast((r.msg && r.msg[0]) || '此刻无可派遣', 'red'); return; }
    const lines = r.msg || [];
    modal({
      title: '一键派遣',
      html: '<ul>' + lines.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>',
      buttons: [{ text: '一路顺风', cls: 'btn-primary' }],
    });
  }
  function quickSweep() {
    const r = call('dungeon', 'quickSweep');
    if (!r) return;
    if (!r.ok) { toast(r.err || '扫荡不成', 'red'); return; }
    const lines = r.msg || [];
    if (r.gains && r.gains.cult) pop('+' + fmt(r.gains.cult) + ' 修为', '');
    modal({
      title: '扫荡秘境',
      html: '<ul>' + lines.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>',
      buttons: [{ text: '收入囊中', cls: 'btn-primary' }],
    });
  }
  function goRemind(tabId, isMkt) {
    if (isMkt) settings().mktSeen = Date.now();
    if (tabId && findTab(tabId)) { if (showTab(tabId)) return; }
    toast('此处尚未开辟，且待后缘', 'info');
  }

  // ---------- 主页事件委托 ----------
  function onHomeClick(ev) {
    const t = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!t) return;
    const act = t.getAttribute('data-act');
    if (act === 'break') openBreak();
    else if (act === 'mode') {
      const r = call('cultivation', 'setMode', [t.getAttribute('data-mode')]);
      if (r) toast(r.ok ? r.msg : (r.err || '不可改修'), r.ok ? 'info' : 'red');
      H.sig.modes = '';
      refreshModes();
    } else if (act === 'qc') quickCollect();
    else if (act === 'dunwu-info') {
      // 顿悟机制说明（玩家常误以为「顿悟没生效」，点击给出当前概率与状态）
      const di = call('cultivation', 'getDunwuInfo');
      if (!di) { toast('顿悟之道尚未参透', 'info'); return; }
      const msg = di.active
        ? '顿悟降临中！30 秒内修炼 ×' + di.mult + '，尚余 ' + fmtTime(di.remain) + '，且看修为奔涌。'
        : '顿悟不可强求：静坐修行时每秒约 ' + (di.chancePerSec * 100).toFixed(2) + '% 几率降临（约 ' + fmtTime(1 / di.chancePerSec) + ' 一遇），降临时 30 秒修炼 ×' + di.mult + '。悟性丹可提升降临几率，离线闭关亦有梦中顿悟折算。';
      toast(msg, di.active ? 'gold' : 'info');
    }
    else if (act === 'qx') quickCultivate();
    else if (act === 'qd') quickDispatch();
    else if (act === 'qs') quickSweep();
    else if (act === 'wash') doWash();
    else if (act === 'meridian') openMeridian();
    else if (act === 'remind') goRemind(t.getAttribute('data-tab'), t.getAttribute('data-mkt'));
    else if (act === 'guide-claim') {
      const r = call('guide', 'claim', [t.getAttribute('data-id')]);
      if (r) toast(r.ok ? r.msg : (r.err || '领取失败'), r.ok ? 'gold' : 'red');
      H.sig.guide = '';
      refreshGuide();
    }
    else if (act === 'adv-open') openAdventure();
  }

  // ---------- 主页 tab 定义 ----------
  const homeDef = {
    id: 'home', name: '修炼', icon: '🧘', order: 0, main: true, sysId: null,
    mount: function (el) {
      H.el = el;
      H.sig = {};
      el.innerHTML =
        '<div class="xgh-reminds" id="xgh-reminds"></div>' +
        // ⓪ 修炼场景（scene.js 挂载点：盘坐小人+灵气动画+事件联动）
        '<div id="scene-root" class="xgh-scene"></div>' +
        // ① 境界大卡
        '<div class="card"><h2 class="card-title">修行境界</h2>' +
        '<div class="row" style="justify-content:space-between"><b id="xgh-r-name" style="font-size:17px;color:var(--qing-d)"></b><span class="muted" id="xgh-r-mode"></span></div>' +
        '<div class="progress" style="margin:8px 0 4px"><div class="progress-fill" id="xgh-r-fill"></div><div class="progress-text" id="xgh-r-ptext"></div></div>' +
        '<div class="row"><span class="muted" id="xgh-r-rate"></span><span class="muted" id="xgh-r-dunwu"></span></div>' +
        '<div class="row" style="margin-top:8px"><button class="btn btn-primary" id="xgh-brk-btn" data-act="break">精进</button>' +
        '<span class="muted" id="xgh-brk-info"></span></div></div>' +
        // ② 修炼模式
        '<div class="card"><h2 class="card-title">修炼方式</h2>' +
        '<div class="xgh-modes" id="xgh-modes"></div>' +
        '<div class="muted" id="xgh-mode-tip" style="margin-top:6px"></div></div>' +
        // ③ 一键操作
        '<div class="card"><h2 class="card-title">一键行事</h2>' +
        '<div class="xgh-quick">' +
        '<button class="btn" id="xgh-q-collect" data-act="qc">一键领取</button>' +
        '<button class="btn" id="xgh-q-cult" data-act="qx">一键修炼</button>' +
        '<button class="btn" id="xgh-q-dispatch" data-act="qd">一键派遣</button>' +
        '<button class="btn" id="xgh-q-sweep" data-act="qs">一键扫荡</button>' +
        '</div></div>' +
        // ③.5 修行录（新手目标卡，guide.js 驱动；系统缺失时整卡隐藏）
        '<div class="card" id="xgh-guide-card"><h2 class="card-title">修行录</h2>' +
        '<div id="xgh-guide-body"></div>' +
        '<div class="progress" style="margin-top:6px"><div class="progress-fill" id="xgh-guide-fill"></div><div class="progress-text" id="xgh-guide-ptext"></div></div></div>' +
        // ④ 当前目标
        '<div class="card"><h2 class="card-title">当前目标</h2><div id="xgh-goals"></div></div>' +
        // ⑤ 灵根与经脉
        '<div class="card"><h2 class="card-title">灵根资质</h2>' +
        '<div id="xgh-root"></div>' +
        '<div class="muted xgh-gold" id="xgh-root-tip"></div>' +
        '<div class="row" style="margin-top:8px">' +
        '<button class="btn" id="xgh-wash-btn" data-act="wash">洗练灵根</button>' +
        '<button class="btn btn-ghost" data-act="meridian">经脉穴位</button>' +
        '</div></div>';
      el.addEventListener('click', onHomeClick);
      homeUpdate();
    },
    update: function () { homeUpdate(); },
    unmount: function () {
      if (H.el) H.el.removeEventListener('click', onHomeClick);
      H.el = null;
      H.sig = {};
    },
  };

  // ============================ XG.ui 导出 + 主页注册 ============================
  XG.ui = {
    registerTab: registerTab,
    boot: boot,
    refreshTop: refreshTop,
    renderActive: renderActive,
    showTab: showTab,
    toast: toast,
    modal: modal,
    closeModal: closeModal,
    confirm: confirm,
    pop: pop,
    popMute: function (m) { pop._muted = !!m; }, // 批量操作期间静音跳字（try/finally 成对调用）
    fx: fx,
    news: news,
  };
  registerTab(homeDef);

  // 破境丹选择 / 经脉点穴：弹窗内交互的文档级委托（modal-root 每次重建，挂 document 常驻）
  document.addEventListener('click', function (ev) {
    const pill = ev.target && ev.target.closest ? ev.target.closest('[data-pill]') : null;
    if (pill) { toggleBrkPill(pill.getAttribute('data-pill')); return; }
    const acu = ev.target && ev.target.closest ? ev.target.closest('[data-acu]') : null;
    if (acu) doLightAcu(acu.getAttribute('data-acu'));
  });
})();
