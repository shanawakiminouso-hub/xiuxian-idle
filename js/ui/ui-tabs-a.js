/* ui-tabs-a.js：功法 / 炼丹 / 炼器 / 灵宠 四个系统页（契约 §12；均 main:false，入「更多」网格）
 * 渲染模式：mount 搭骨架 + 事件委托（data-act 分发）；update 每秒只刷新动态节点（进度条/倒计时/待领池），
 * 不重绘输入中的控件与详情浮层；全部系统调用防御性（sys 缺失/异常不白屏）。 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  /* ==================== 注册（防御：兼容 ui-core 后加载） ==================== */
  function reg(def) {
    if (window.XG && XG.ui && XG.ui.registerTab) XG.ui.registerTab(def);
    else { XG._pendingTabs = XG._pendingTabs || []; XG._pendingTabs.push(def); }
  }

  /* ==================== 小工具 ==================== */
  function sys(name) { return (XG.sys && XG.sys[name]) || null; }
  function esc(s) {
    if (XG.util && XG.util.esc) return XG.util.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { try { return XG.util && XG.util.fmt ? XG.util.fmt(n) : String(n); } catch (e) { return String(n); } }
  function fmtInt(n) { try { return XG.util && XG.util.fmtInt ? XG.util.fmtInt(n) : String(Math.floor(n || 0)); } catch (e) { return String(Math.floor(n || 0)); } }
  function fmtTime(s) { try { return XG.util && XG.util.fmtTime ? XG.util.fmtTime(Math.max(0, s || 0)) : Math.floor(s || 0) + '秒'; } catch (e) { return Math.floor(s || 0) + '秒'; } }
  function toast(msg, type) {
    if (!msg) return;
    if (type === true) type = 'err';
    if (XG.ui && XG.ui.toast) { try { XG.ui.toast(msg, type); } catch (e) { /* 静默 */ } }
  }
  function pop(text, cls) {
    if (XG.ui && XG.ui.pop) { try { XG.ui.pop(text, cls); } catch (e) { /* 静默 */ } }
  }
  function hasRes(cost) { try { return !!(XG.hasRes && XG.hasRes(cost)); } catch (e) { return false; } }

  // 材料/宝石等杂项查名查图标（data.mats 契约 §6 命名空间）
  function matName(id) {
    const m = XG.data && XG.data.mats && XG.data.mats[id];
    return (m && m.name) || id;
  }
  function matIcon(id) {
    const m = XG.data && XG.data.mats && XG.data.mats[id];
    if (m && m.icon) return m.icon;
    if (/^herb_/.test(id)) return '🌿';
    if (/^ore_/.test(id)) return '⛏️';
    if (/^gem_/.test(id)) return '💎';
    if (/^beast_/.test(id)) return '🦴';
    return '✨';
  }

  // 品质色：装备 grade 0~4 → 灰绿蓝紫金；功法/丹方 grade 1~9 → 1-2灰 3-4绿 5-6蓝 7-8紫 9金
  function qg(g) { g = (g == null ? 0 : g); return 'uta-q' + Math.max(1, Math.min(5, g + 1)); }
  function tqg(g) { g = (g == null ? 0 : g); return 'uta-tq' + Math.max(1, Math.min(5, g + 1)); }
  function qn(g) { g = g || 1; return 'uta-q' + (g <= 2 ? 1 : g <= 4 ? 2 : g <= 6 ? 3 : g <= 8 ? 4 : 5); }
  function tqn(g) { g = g || 1; return 'uta-tq' + (g <= 2 ? 1 : g <= 4 ? 2 : g <= 6 ? 3 : g <= 8 ? 4 : 5); }

  // eff 对象 → 文案行（与 sys 同口径，供套装/宝石/自创结果展示）
  const EFF_LABEL = {
    cultRatePct: '修炼速度', atkPct: '攻击加成', defPct: '防御加成', hpPct: '气血加成',
    dropPct: '掉落加成', alchSuccPct: '炼丹成功率', forgeSuccPct: '锻造成功率',
    breakSuccPct: '破境成功率', workPct: '杂务效率', offlineHours: '离线时长',
    atkFlat: '攻击', defFlat: '防御', hpFlat: '气血', spdPct: '身法加成', spdFlat: '身法', critPct: '暴击',
  };
  const EFF_FLAT = { atkFlat: 1, defFlat: 1, hpFlat: 1, spdFlat: 1 };
  function effLines(eff, mult) {
    const out = [];
    if (!eff) return out;
    for (const k in eff) {
      const v0 = eff[k];
      if (typeof v0 !== 'number') continue;
      const v = v0 * (mult || 1);
      const lab = EFF_LABEL[k] || k;
      if (EFF_FLAT[k]) out.push(lab + ' +' + fmtInt(v));
      else if (k === 'offlineHours') out.push(lab + ' +' + (Math.round(v * 10) / 10) + ' 时辰');
      else out.push(lab + ' +' + (Math.round(v * 10) / 10) + '%');
    }
    return out;
  }

  // 消耗展示：灵石/灵玉/材料，足则绿、缺则红（跳过 dup 等非资源键）
  function costHtml(cost) {
    if (!cost) return '';
    const res = (XG.state && XG.state.res) || {};
    const inv = (XG.state && XG.state.inv && XG.state.inv.mat) || {};
    const parts = [];
    function num(have, need, icon, name) {
      const ok = (have || 0) >= need;
      parts.push('<span class="' + (ok ? 'uta-ok' : 'uta-no') + '" title="' + esc(name) + '">' + icon + ' ' + fmtInt(have || 0) + '/' + fmt(need) + '</span>');
    }
    if (cost.lingShi) num(res.lingShi, cost.lingShi, '🪙', '灵石');
    if (cost.lingYu) num(res.lingYu, cost.lingYu, '💠', '灵玉');
    if (cost.mat) for (const id in cost.mat) num(inv[id], cost.mat[id], matIcon(id), matName(id));
    return parts.join(' ');
  }

  function realmName(idx, layer) {
    const R = (XG.cfg && XG.cfg.REALMS) || [];
    const r = R[idx];
    return (r ? r.name : '境界' + idx) + ' ' + (layer || 1) + ' 层';
  }
  function isLocked(sysId) { return !!(XG.cfg && XG.cfg.isUnlocked && !XG.cfg.isUnlocked(sysId)); }
  function lockedHtml(sysId, label) {
    const u = (XG.cfg && XG.cfg.UNLOCKS && XG.cfg.UNLOCKS[sysId]) || null;
    let need = '机缘未到';
    if (u && u.realmIdx != null) need = realmName(u.realmIdx, u.layer);
    else if (u && u.days) need = '创角第 ' + u.days + ' 日';
    return '<div class="tab-page"><h2>' + esc(label) + '</h2><div class="card"><div class="card-title">🔒 未解锁</div>' +
      '<div class="card-sub">需达 <b>' + esc(need) + '</b> 方开此道，道友且先潜心修行。</div></div></div>';
  }

  // 子页签条
  function subTabs(ns, cur, defs) {
    let h = '<div class="uta-sub">';
    for (let i = 0; i < defs.length; i++) {
      h += '<button class="btn' + (cur === defs[i][0] ? ' uta-on' : '') + '" data-act="' + ns + ':sub:' + defs[i][0] + '">' + esc(defs[i][1]) + '</button>';
    }
    return h + '</div>';
  }

  /* ==================== 弹窗（优先 XG.ui.modal，缺失则用自带兜底） ==================== */
  let _fallbackMask = null;
  function openModal(title, html, cls) {
    if (XG.ui && XG.ui.modal) {
      try {
        XG.ui.modal({ title: title, html: html, cls: cls || '', buttons: [{ text: '关闭', cb: function () { closeModal(); } }] });
        return;
      } catch (e) { /* 落到兜底 */ }
    }
    closeModal();
    const root = document.getElementById('modal-root') || document.body;
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = '<div class="modal ' + (cls || '') + '"><h3 class="modal-title">' + esc(title) + '</h3>' +
      '<div class="uta-mbody">' + html + '</div>' +
      '<div class="modal-btns"><button class="btn" data-uta-close="1">关闭</button></div></div>';
    mask.addEventListener('click', function (e) {
      if (e.target === mask || (e.target.getAttribute && e.target.getAttribute('data-uta-close'))) closeModal();
    });
    root.appendChild(mask);
    _fallbackMask = mask;
  }
  function closeModal() {
    if (XG.ui && XG.ui.closeModal) { try { XG.ui.closeModal(); } catch (e) { /* 静默 */ } }
    if (_fallbackMask && _fallbackMask.parentNode) _fallbackMask.parentNode.removeChild(_fallbackMask);
    _fallbackMask = null;
  }
  // 确认框（优先 XG.ui.confirm）
  let _confirmCb = null;
  function confirmBox(text, cb) {
    if (XG.ui && XG.ui.confirm) { try { XG.ui.confirm(text, cb); return; } catch (e) { /* 落到兜底 */ } }
    _confirmCb = cb;
    openModal('请决断', '<p style="margin:4px 0">' + esc(text) + '</p>' +
      '<div class="modal-btns"><button class="btn btn-danger" data-act="cm:ok">确认</button>' +
      '<button class="btn" data-act="cm:no">再想想</button></div>');
  }
  function cmAct(op) {
    const cb = _confirmCb; _confirmCb = null;
    closeModal();
    if (op === 'ok' && cb) { try { cb(); } catch (e) { toast('行事不济', true); } }
  }

  /* ==================== 注入样式（uta- 前缀防冲突；复用 style.css 的 card/btn/progress/grid） ==================== */
  const UTA_CSS = [
    '.uta-sub{display:flex;gap:6px;margin-bottom:10px}',
    '.uta-sub .btn{flex:1;padding:6px 4px;font-size:13px}',
    '.uta-sub .btn.uta-on{background:linear-gradient(180deg,#3a7d6b,#2e6254);color:#f9f5ea;border-color:#2e6254}',
    '.uta-slots{display:flex;gap:8px}',
    '.uta-slot{flex:1;max-width:82px;min-height:64px;border:2px solid rgba(43,43,43,.18);border-radius:8px;background:#efe7d3;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:22px;cursor:pointer;padding:3px;gap:1px}',
    '.uta-slot small{font-size:10px;color:#5a5650;line-height:1.15;text-align:center;word-break:break-all}',
    '.uta-slot.uta-empty{opacity:.55;cursor:default;border-style:dashed;border-width:1px}',
    '.uta-q1{border-color:#9a958c!important}.uta-q2{border-color:#4e9a51!important;box-shadow:0 0 4px rgba(78,154,81,.35)}',
    '.uta-q3{border-color:#3f6fb5!important;box-shadow:0 0 4px rgba(63,111,181,.35)}',
    '.uta-q4{border-color:#7d4fb0!important;box-shadow:0 0 5px rgba(125,79,176,.45)}',
    '.uta-q5{border-color:#c9a063!important;box-shadow:0 0 7px rgba(201,160,99,.6)}',
    '.uta-tq1{color:#8a857c}.uta-tq2{color:#3f7d42}.uta-tq3{color:#33588f}.uta-tq4{color:#68428f}.uta-tq5{color:#a8834a}',
    '.uta-item{border:1px solid rgba(43,43,43,.15);border-radius:8px;background:rgba(255,255,255,.25);padding:8px 10px;margin-bottom:8px}',
    '.uta-item.uta-dim{opacity:.62}',
    '.uta-ihead{display:flex;align-items:center;gap:7px;flex-wrap:wrap}',
    '.uta-iico{font-size:20px;flex:none}',
    '.uta-iname{font-weight:bold}',
    '.uta-tag{font-size:11px;border:1px solid rgba(43,43,43,.25);border-radius:4px;padding:0 4px;color:#5a5650}',
    '.uta-tag.uta-on{color:#a8834a;border-color:#c9a063}',
    '.uta-eff{color:#2e6254;font-size:12px}',
    '.uta-ok{color:#2e7d46;font-size:12px}.uta-no{color:#9e3b2f;font-size:12px}',
    '.uta-mini{font-size:12px;color:#5a5650}',
    '.uta-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px}',
    '.uta-btn-sm{padding:3px 10px!important;font-size:12px!important}',
    '.uta-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}',
    '.uta-chip{border:1px dashed rgba(43,43,43,.3);border-radius:12px;padding:1px 9px;font-size:12px;color:#8a857c}',
    '.uta-chip.uta-lit{border:1px solid #c9a063;color:#2b2b2b;background:rgba(201,160,99,.14)}',
    '.uta-toxwrap .progress-fill{background:linear-gradient(90deg,#3a7d6b,#c9a063 55%,#9e3b2f)}',
    '.uta-warn{color:#a8834a;font-size:12px}',
    '.uta-danger{color:#9e3b2f;font-size:12px;font-weight:bold}',
    '.uta-shiny{color:#a8834a;font-weight:bold;animation:utaShine 1.6s ease-in-out infinite}',
    '@keyframes utaShine{0%,100%{text-shadow:0 0 2px rgba(201,160,99,.4)}50%{text-shadow:0 0 9px rgba(233,196,106,.95)}}',
    '.uta-egg{font-size:44px;text-align:center;animation:utaEgg .5s ease-in-out infinite}',
    '@keyframes utaEgg{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(9deg) translateY(-4px)}}',
    '.uta-kv{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;padding:3px 0;border-bottom:1px dashed rgba(43,43,43,.1);flex-wrap:wrap}',
    '.uta-sec{margin:10px 0 5px;font-size:14px;color:#2e6254;border-left:3px solid #c9a063;padding-left:6px}',
    '.uta-skill{display:flex;gap:6px;align-items:baseline;font-size:12px;margin:2px 0;flex-wrap:wrap}',
    '.uta-select{font-family:inherit;background:#f6f1e4;border:1px solid rgba(43,43,43,.25);border-radius:6px;padding:5px 6px;font-size:13px;color:#2b2b2b;max-width:100%}',
    '.uta-input{font-family:inherit;background:#f6f1e4;border:1px solid rgba(43,43,43,.25);border-radius:6px;padding:5px 8px;font-size:13px;color:#2b2b2b}',
    '.uta-group{font-size:14px;color:#2e6254;margin:12px 0 6px;border-bottom:1px dashed rgba(43,43,43,.18);padding-bottom:3px}',
    '.uta-pbar-sm{height:7px;margin-top:4px}',
  ].join('\n');
  if (typeof document !== 'undefined') {
    const stEl = document.createElement('style');
    stEl.setAttribute('data-uta', '1');
    stEl.textContent = UTA_CSS;
    document.head.appendChild(stEl);
  }

  /* ==================== 事件分发 ==================== */
  const els = {}; // tabId → 当前挂载 el
  const RENDER = {}; // tabId → render(el)
  let _fgUid = null; // 炼器详情浮层当前 uid
  let _ptUid = null; // 灵宠详情浮层当前 uid

  function rerender(id) {
    if (els[id] && RENDER[id]) { try { RENDER[id](els[id]); } catch (e) { /* 单页异常不白屏 */ } }
  }
  function dispatch(act, t) {
    if (!act) return;
    const p = String(act).split(':');
    const ns = p[0], op = p[1], arg = p[2];
    try {
      if (ns === 'gf') gfAct(op, arg, t);
      else if (ns === 'al') alAct(op, arg, t);
      else if (ns === 'fg') fgAct(op, arg, t);
      else if (ns === 'pt') ptAct(op, arg, t);
      else if (ns === 'cm') cmAct(op);
    } catch (e) { toast('行事不济：' + (e && e.message || e), true); }
  }
  function onElClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (t) dispatch(t.getAttribute('data-act'), t);
  }
  function onElChange(e) {
    const t = e.target;
    if (!t || !t.getAttribute) return;
    if (t.hasAttribute('data-al-fire')) alAct('setfire', t.value, t);
    else if (t.hasAttribute('data-pt-breed')) { SP[t.getAttribute('data-pt-breed')] = t.value; rerender('pets'); }
  }
  // 浮层（modal）内的事件：modal 在 #modal-root / .modal-mask，独立于 tab 容器
  let _docBound = false;
  function bindDoc() {
    if (_docBound || typeof document === 'undefined') return;
    _docBound = true;
    document.addEventListener('click', function (e) {
      const t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!t) return;
      if (!t.closest('.modal-mask') && !t.closest('#modal-root')) return;
      dispatch(t.getAttribute('data-act'), t);
    });
    document.addEventListener('change', function (e) {
      const t = e.target;
      if (!t || !t.closest || (!t.closest('.modal-mask') && !t.closest('#modal-root'))) return;
      if (t.hasAttribute('data-pt-jobassign')) ptAct('job', t.value, t);
    });
  }
  function mountBase(id, el) {
    els[id] = el;
    el.addEventListener('click', onElClick);
    el.addEventListener('change', onElChange);
    rerender(id);
  }
  function unmountBase(id) { delete els[id]; }

  /* ============================================================
   * 功法（sysId: gongfa）：运功槽 / 功法列表 / 羁绊 / 自创功法
   * ============================================================ */
  const SG = { sub: 'list' }; // list | bond | create

  function renderGongfa(el) {
    if (isLocked('gongfa')) { el.innerHTML = lockedHtml('gongfa', '功法'); return; }
    const G = sys('gongfa');
    if (!G) { el.innerHTML = '<div class="card">功法系统未载入……</div>'; return; }
    let vms = [];
    try { vms = G.listGongfa() || []; } catch (e) { vms = []; }
    const H = [];
    H.push('<div class="tab-page"><h2>功法阁</h2>');
    // —— 已装备 4 槽横排（点击卸下）——
    const active = vms.filter(function (v) { return v.active; });
    H.push('<div class="card"><div class="card-title">运功槽 <span class="card-sub">' + active.length + '/4 · 点击卸下</span></div><div class="uta-slots">');
    for (let i = 0; i < 4; i++) {
      const v = active[i];
      if (v) {
        H.push('<div class="uta-slot ' + qn(v.grade) + '" data-act="gf:unequip" data-id="' + esc(v.id) + '" title="' + esc(v.name) + '（点击卸下）">' +
          esc(v.icon) + '<small>' + esc(v.name) + '<br>lv.' + v.lv + '</small></div>');
      } else H.push('<div class="uta-slot uta-empty">＋<small>空槽</small></div>');
    }
    H.push('</div></div>');
    // —— 子页签 ——
    H.push(subTabs('gf', SG.sub, [['list', '功法'], ['bond', '羁绊'], ['create', '自创']]));
    if (SG.sub === 'bond') H.push(gfBondHtml(G));
    else if (SG.sub === 'create') H.push(gfCreateHtml(G, vms));
    else H.push(gfListHtml(vms));
    H.push('</div>');
    el.innerHTML = H.join('');
  }

  function gfListHtml(vms) {
    const H = [];
    const learned = [], learnable = [], fragging = [], locked = [];
    for (let i = 0; i < vms.length; i++) {
      const v = vms[i];
      if (v.custom) continue; // 自创功法归「自创」页签
      if (v.learned) learned.push(v);
      else if (v.learnable) learnable.push(v);
      else if (v.unlocked) fragging.push(v);
      else locked.push(v);
    }
    if (learned.length) {
      H.push('<div class="uta-group">已参悟（' + learned.length + '）</div>');
      learned.forEach(function (v) { H.push(gfRowLearned(v, false)); });
    }
    if (learnable.length) {
      H.push('<div class="uta-group">可合成参悟（' + learnable.length + '）</div>');
      H.push('<div class="uta-row" style="margin-bottom:6px"><button class="btn btn-primary uta-btn-sm" data-act="gf:learnall">一键合成全部（' + learnable.length + '）</button></div>');
      learnable.forEach(function (v) { H.push(gfRowLearnable(v)); });
    }
    if (fragging.length) {
      H.push('<div class="uta-group">残篇搜集中（' + fragging.length + '）</div>');
      fragging.forEach(function (v) { H.push(gfRowFrag(v)); });
    }
    if (locked.length) {
      H.push('<div class="uta-group">未解锁（' + locked.length + '）</div>');
      locked.forEach(function (v) { H.push(gfRowLocked(v)); });
    }
    if (!learned.length && !learnable.length) {
      H.push('<div class="card card-sub">尚无已悟功法——残篇可往历练、派遣探索求得。</div>');
    }
    return H.join('');
  }

  // 已学功法行：等级/熟练度条/效果行/升级与连升/装备切换（custom 行加遗忘钮）
  function gfRowLearned(v, isCustom) {
    const cult = (XG.state && XG.state.player && XG.state.player.cult) || 0;
    const H = [];
    H.push('<div class="uta-item">');
    H.push('<div class="uta-ihead"><span class="uta-iico">' + esc(v.icon) + '</span>' +
      '<span class="uta-iname ' + tqn(v.grade) + '">' + esc(v.name) + '</span>' +
      '<span class="uta-tag">' + v.grade + '品</span><span class="uta-tag">lv.' + v.lv + '</span>' +
      (isCustom ? '<span class="uta-tag uta-on">自创</span>' : '') +
      (v.active ? '<span class="uta-tag uta-on">运功中</span>' : '') +
      (v.profFull ? '<span class="uta-tag uta-on">圆满</span>' : '') + '</div>');
    const pct = v.profMax > 0 ? Math.min(100, v.prof / v.profMax * 100) : 0;
    H.push('<div class="progress uta-pbar-sm"><div class="progress-fill" data-gf-prof="' + esc(v.id) + '" style="width:' + pct + '%"></div>' +
      '<div class="progress-text" data-gf-proftxt="' + esc(v.id) + '">' + (v.profFull ? '熟练圆满（效×1.5）' : '熟练 ' + v.prof + '/' + v.profMax) + '</div></div>');
    if (v.effNow && v.effNow.lines && v.effNow.lines.length) {
      H.push('<div class="uta-eff">当前：' + esc(v.effNow.lines.join('，')) + '</div>');
    }
    if (v.effLines && v.effLines.length) H.push('<div class="uta-mini">每级：' + esc(v.effLines.join('，')) + '</div>');
    H.push('<div class="uta-row">');
    const upOk = isFinite(v.upCost);
    H.push('<button class="btn uta-btn-sm" data-act="gf:up" data-id="' + esc(v.id) + '" data-gf-up="' + esc(v.id) + '"' +
      (upOk && cult >= v.upCost ? '' : ' disabled') + '>' + (upOk ? '升级（' + fmt(v.upCost) + ' 修为）' : '已臻化境') + '</button>');
    if (upOk) H.push('<button class="btn btn-ghost uta-btn-sm" data-act="gf:upmax" data-id="' + esc(v.id) + '">连升</button>');
    H.push('<button class="btn ' + (v.active ? 'btn-ghost' : 'btn-primary') + ' uta-btn-sm" data-act="gf:toggle" data-id="' + esc(v.id) + '">' +
      (v.active ? '卸下' : '装备') + '</button>');
    if (isCustom) H.push('<button class="btn btn-danger uta-btn-sm" data-act="gf:forget" data-id="' + esc(v.id) + '">遗忘</button>');
    H.push('</div></div>');
    return H.join('');
  }

  // 可学：残篇 n/need（绿）+ 合成按钮
  function gfRowLearnable(v) {
    return '<div class="uta-item"><div class="uta-ihead"><span class="uta-iico">' + esc(v.icon) + '</span>' +
      '<span class="uta-iname ' + tqn(v.grade) + '">' + esc(v.name) + '</span><span class="uta-tag">' + v.grade + '品</span></div>' +
      (v.effLines && v.effLines.length ? '<div class="uta-mini">每级：' + esc(v.effLines.join('，')) + '</div>' : '') +
      '<div class="uta-mini">' + esc(v.desc || '') + '</div>' +
      '<div class="uta-row"><span class="uta-ok">残篇 ' + v.fragHave + '/' + v.fragNeed + '</span>' +
      '<button class="btn btn-primary uta-btn-sm" data-act="gf:learn" data-id="' + esc(v.id) + '">合成参悟</button></div></div>';
  }

  // 已解锁但残篇未集满：n/need（红）+ 获取线索
  function gfRowFrag(v) {
    return '<div class="uta-item uta-dim"><div class="uta-ihead"><span class="uta-iico">' + esc(v.icon) + '</span>' +
      '<span class="uta-iname">' + esc(v.name) + '</span><span class="uta-tag">' + v.grade + '品</span></div>' +
      '<div class="uta-row"><span class="uta-no">残篇 ' + v.fragHave + '/' + v.fragNeed + '</span>' +
      (v.getHint ? '<span class="uta-mini">' + esc(v.getHint) + '</span>' : '') + '</div></div>';
  }

  // 未解锁：灰显 + unlock 境界条件或 getHint（隐藏功法未亮出显示 ???）
  function gfRowLocked(v) {
    let name = '???', icon = '❓', req = '无名残卷，机缘未到';
    if (v.visible) {
      name = v.name; icon = v.icon;
      const G = sys('gongfa');
      let def = null;
      if (G && G.getDef) { try { def = G.getDef(v.id); } catch (e) { def = null; } }
      if (def && def.unlock && def.unlock.realmIdx != null) req = realmName(def.unlock.realmIdx, def.unlock.layer) + ' 可悟';
      else req = v.getHint || '机缘未到';
    } else if (v.getHint) req = '线索：' + v.getHint;
    return '<div class="uta-item uta-dim"><div class="uta-ihead"><span class="uta-iico">' + esc(icon) + '</span>' +
      '<span class="uta-iname">' + esc(name) + '</span><span class="uta-tag">' + v.grade + '品</span></div>' +
      '<div class="uta-mini">🔒 ' + esc(req) + '</div></div>';
  }

  // 羁绊页签：need 功法点亮 / 激活高亮 / 效果
  function gfBondHtml(G) {
    let bonds = [];
    try { bonds = G.listBonds() || []; } catch (e) { bonds = []; }
    if (!bonds.length) return '<div class="card card-sub">羁绊图鉴未载入。</div>';
    const H = [];
    bonds.forEach(function (b) {
      H.push('<div class="card' + (b.active ? '' : ' uta-dim') + '"><div class="card-title">' + esc(b.name) +
        (b.active ? ' <span class="uta-tag uta-on">已激活</span>' : ' <span class="uta-tag">未激活</span>') + '</div>');
      H.push('<div class="uta-chips">');
      (b.needStatus || []).forEach(function (n) {
        H.push('<span class="uta-chip' + (n.owned ? ' uta-lit' : '') + '">' + esc(n.name) + '</span>');
      });
      H.push('</div>');
      if (b.effLines && b.effLines.length) H.push('<div class="uta-eff">羁绊之效：' + esc(b.effLines.join('，')) + '</div>');
      if (b.desc) H.push('<div class="uta-mini">' + esc(b.desc) + '</div>');
      H.push('</div>');
    });
    return H.join('');
  }

  // 自创页签：化神解锁 + 消耗说明 + 推演按钮 + custom 列表（可装备/遗忘/升级）
  function gfCreateHtml(G, vms) {
    const customs = vms.filter(function (v) { return v.custom; });
    let chk = { ok: false, msg: '系统未就绪' };
    try { chk = G.canCreate(); } catch (e) { /* 保持默认 */ }
    const H = [];
    H.push('<div class="card"><div class="card-title">自创功法</div>');
    H.push('<div class="card-sub">化神一层方开此道。融任意功法残篇 ×' + (G.CREATE_FRAG_COST || 24) +
      '，推演一门独家功法（品阶随境界上浮，上限 ' + (G.MAX_CUSTOM || 9) + ' 门，现有 ' + customs.length + ' 门）。</div>');
    H.push('<div class="uta-row"><button class="btn btn-primary" data-act="gf:create"' + (chk.ok ? '' : ' disabled') + '>推演功法</button>');
    if (chk.ok) H.push('<span class="uta-mini">耗任意残篇 ×' + (chk.cost || G.CREATE_FRAG_COST || 24) + '</span>');
    else H.push('<span class="uta-no">' + esc(chk.msg || '') + '</span>');
    H.push('</div></div>');
    if (customs.length) {
      H.push('<div class="uta-group">自家法门（' + customs.length + '）</div>');
      customs.forEach(function (v) { H.push(gfRowLearned(v, true)); });
    } else H.push('<div class="card card-sub">尚未自创任何功法。</div>');
    return H.join('');
  }

  // 自创结果弹窗：roll 出的名字与词条
  function gfCreateResultHtml(G, def) {
    let lines = [];
    try { lines = G.effLines ? G.effLines(def.eff) : effLines(def.eff); } catch (e) { lines = effLines(def.eff); }
    const H = [];
    H.push('<div style="text-align:center;font-size:42px">' + esc(def.icon) + '</div>');
    H.push('<h3 style="text-align:center;margin:4px 0" class="' + tqn(def.grade) + '">《' + esc(def.name) + '》</h3>');
    H.push('<div style="text-align:center" class="uta-mini">' + def.grade + '品 · 五行通用 · 世间独此一份</div>');
    H.push('<div class="uta-sec">功法词条（每级成长）</div>');
    lines.forEach(function (l) { H.push('<div class="uta-eff">' + esc(l) + '</div>'); });
    if (def.desc) H.push('<div class="uta-mini" style="margin-top:6px">' + esc(def.desc) + '</div>');
    H.push('<div class="uta-mini" style="margin-top:4px">已自动参悟（lv.1），可往自创页装备运功。</div>');
    return H.join('');
  }

  function gfAct(op, arg, t) {
    const G = sys('gongfa'); if (!G) return;
    const id = arg || (t && t.getAttribute && t.getAttribute('data-id'));
    if (op === 'sub') { SG.sub = arg; rerender('gongfa'); return; }
    let r = null;
    if (op === 'unequip') r = G.unequip(id);
    else if (op === 'toggle') r = G.toggle(id);
    else if (op === 'learn') { r = G.learn(id); if (r && r.ok) pop('参悟成功', 'pop-good'); }
    else if (op === 'learnall') {
      r = G.combineAll ? G.combineAll() : { ok: false, msg: '一键合成未成。' };
      if (r && r.ok) pop('参悟 ' + r.count + ' 部', 'pop-good');
    }
    else if (op === 'up') r = G.upgrade(id);
    else if (op === 'upmax') { r = G.upgradeMax(id); if (r && r.ok && r.times > 0) pop('连升 ' + r.times + ' 级', 'pop-good'); }
    else if (op === 'create') {
      r = G.createCustom();
      if (r && r.ok && r.def) {
        openModal('自创功法', gfCreateResultHtml(G, r.def), '');
        toast('开宗立派：《' + r.def.name + '》', 'gold');
        try { if (XG.ui.fx && XG.ui.fx.drop) XG.ui.fx.drop(4); } catch (e) { /* 静默 */ }
      }
    } else if (op === 'forget') {
      let def = null;
      try { def = G.getDef(id); } catch (e) { def = null; }
      confirmBox('将《' + (def ? def.name : id) + '》付之一炬？此诀将永远失传。', function () {
        let rr = null;
        try { rr = G.forgetCustom(id); } catch (e) { /* 静默 */ }
        toast(rr && rr.msg, !(rr && rr.ok));
        rerender('gongfa');
      });
      return;
    }
    if (r && r.msg) toast(r.msg, !r.ok);
    else if (r && !r.ok) toast('行事未成', true);
    rerender('gongfa');
  }

  // 每秒动态：熟练度条/文本、升级按钮可用态（不重绘列表）
  function updGongfa(el) {
    const G = sys('gongfa'); if (!G) return;
    if (SG.sub !== 'list' && SG.sub !== 'create') return;
    let vms;
    try { vms = G.listGongfa() || []; } catch (e) { return; }
    const cult = (XG.state && XG.state.player && XG.state.player.cult) || 0;
    for (let i = 0; i < vms.length; i++) {
      const v = vms[i];
      const fill = el.querySelector('[data-gf-prof="' + v.id + '"]');
      if (fill) fill.style.width = (v.profMax > 0 ? Math.min(100, v.prof / v.profMax * 100) : 0) + '%';
      const txt = el.querySelector('[data-gf-proftxt="' + v.id + '"]');
      if (txt) txt.textContent = v.profFull ? '熟练圆满（效×1.5）' : '熟练 ' + v.prof + '/' + v.profMax;
      const up = el.querySelector('[data-gf-up="' + v.id + '"]');
      if (up) up.disabled = !(isFinite(v.upCost) && cult >= v.upCost);
    }
  }

  /* ============================================================
   * 炼丹（sysId: alchemy）：丹炉状态 / 丹方 / 丹囊 / 丹毒 / 炉火图鉴
   * ============================================================ */
  const SA = { sub: 'fang' }; // fang | bag | lu
  const PILL_TYPE_ORDER = ['cult', 'break', 'heal', 'tox', 'root', 'atk', 'def', 'hp', 'work', 'exp'];
  const PILL_TYPE_NAME = {
    cult: '修为丹', break: '破境丹', heal: '疗伤丹', tox: '清毒丹', root: '洗髓丹',
    atk: '攻伐丹', def: '御守丹', hp: '气血丹', work: '杂务丹', exp: '灵宠丹',
  };
  const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  function renderAlchemy(el) {
    if (isLocked('alchemy')) { el.innerHTML = lockedHtml('alchemy', '炼丹'); return; }
    const A = sys('alchemy');
    if (!A) { el.innerHTML = '<div class="card">炼丹系统未载入……</div>'; return; }
    let st = null;
    try { st = A.getState(); } catch (e) { st = null; }
    if (!st) { el.innerHTML = '<div class="card">丹房数据读取失败。</div>'; return; }
    const H = [];
    H.push('<div class="tab-page"><h2>炼丹房</h2>');
    // —— 丹炉状态卡 ——
    H.push('<div class="card"><div class="card-title">丹炉</div>');
    H.push('<div class="uta-kv"><span>' + esc(st.furnace.icon) + ' ' + esc(st.furnace.name) + '</span>' +
      '<span class="uta-mini">成功 +' + st.furnace.succ + '% · 炉速 ×' + st.furnace.speed + '</span></div>');
    // 异火切换下拉（已收集者）
    let fires = [];
    try { fires = A.listFires() || []; } catch (e) { fires = []; }
    H.push('<div class="uta-kv"><span>异火</span><span><select class="uta-select" data-al-fire="1">');
    fires.forEach(function (f) {
      if (!f.owned) return;
      H.push('<option value="' + esc(f.id) + '"' + (f.equipped ? ' selected' : '') + '>' +
        esc(f.icon + ' ' + f.name) + (f.id === 'fire_fan' ? '' : '（+' + f.succ + '%）') + '</option>');
    });
    H.push('</select></span></div>');
    // 炼丹师等级经验
    H.push('<div class="uta-kv"><span>丹道 lv.' + st.lv + '</span><span class="uta-mini">已知丹方 ' + st.knownCount + ' 张</span></div>');
    const epct = st.expNeed > 0 ? Math.min(100, st.exp / st.expNeed * 100) : 100;
    H.push('<div class="progress uta-pbar-sm"><div class="progress-fill" style="width:' + epct + '%"></div>' +
      '<div class="progress-text">' + st.exp + '/' + st.expNeed + '</div></div>');
    H.push('<div class="uta-mini" data-al-buffs="1" style="margin-top:4px">' + alBuffsHtml(A) + '</div>');
    H.push('</div>');
    // —— 炼制中 ——
    if (st.job) {
      let autoJ = null;
      try { autoJ = A.getAuto ? A.getAuto() : null; } catch (e) { autoJ = null; }
      H.push('<div class="card"><div class="card-title">' + esc(st.job.icon) + ' 炼制中：' + esc(st.job.name) +
        (autoJ ? '<span class="uta-mini"> · 🔁 连炉</span>' : '') + '</div>');
      H.push('<div class="progress"><div class="progress-fill" data-al-fill="1" style="width:' + (st.job.pct * 100) + '%"></div>' +
        '<div class="progress-text">' + Math.round(st.job.pct * 100) + '%</div></div>');
      H.push('<div class="uta-row"><span class="uta-mini" data-al-remain="1">尚余 ' + fmtTime(st.job.remainSec) + '</span>' +
        '<button class="btn btn-danger uta-btn-sm" data-act="al:cancel">取消（返还材资）</button></div></div>');
    }
    // —— 子页签 ——
    H.push(subTabs('al', SA.sub, [['fang', '丹方'], ['bag', '丹囊'], ['lu', '炉火']]));
    if (SA.sub === 'bag') H.push(alBagHtml(A));
    else if (SA.sub === 'lu') H.push(alLuHtml(A, st));
    else H.push(alFangHtml(A, st));
    H.push('</div>');
    el.innerHTML = H.join('');
    el._hadJob = !!st.job;
  }

  // 限时丹药 buff 行
  function alBuffsHtml(A) {
    let b = null;
    try { b = A.getBuffs(); } catch (e) { b = null; }
    if (!b) return '';
    const LABS = { cult: '修炼', atk: '攻', def: '防', hp: '血', work: '杂务' };
    const parts = [];
    for (const k in LABS) {
      if (b[k] && b[k].remainSec > 0) parts.push(LABS[k] + ' +' + b[k].val + '%（余 ' + fmtTime(b[k].remainSec) + '）');
    }
    return parts.length ? '药力存续：' + parts.join('；') : '';
  }

  // 丹方列表（按品阶分组）
  function alFangHtml(A, st) {
    let recs = [];
    try { recs = A.listRecipes() || []; } catch (e) { recs = []; }
    if (!recs.length) return '<div class="card card-sub">丹方未载入。</div>';
    let auto = null;
    try { auto = A.getAuto ? A.getAuto() : null; } catch (e) { auto = null; }
    const byG = {};
    recs.forEach(function (r) { (byG[r.grade] = byG[r.grade] || []).push(r); });
    const H = [];
    for (let g = 1; g <= 9; g++) {
      const arr = byG[g];
      if (!arr || !arr.length) continue;
      H.push('<div class="uta-group">' + (CN_NUM[g] || g) + '品丹方（' + arr.length + '）</div>');
      arr.forEach(function (r) { H.push(alRecRow(r, st, auto)); });
    }
    return H.join('');
  }

  function alRecRow(r, st, auto) {
    // 未习得：隐藏方只露 getHint 线索；普通方示丹道门槛
    if (!r.known) {
      if (r.hidden) {
        return '<div class="uta-item uta-dim"><div class="uta-ihead"><span class="uta-iico">❓</span>' +
          '<span class="uta-iname">无名残方</span><span class="uta-tag">' + r.grade + '品</span></div>' +
          '<div class="uta-mini">线索：' + esc(r.getHint || '机缘未至') + '</div></div>';
      }
      return '<div class="uta-item uta-dim"><div class="uta-ihead"><span class="uta-iico">' + esc(r.icon) + '</span>' +
        '<span class="uta-iname">' + esc(r.name) + '</span><span class="uta-tag">' + r.grade + '品</span></div>' +
        '<div class="uta-mini">丹道 lv.' + r.alchLv + ' 可参悟（当前 lv.' + st.lv + '）</div></div>';
    }
    const actual = st.furnace.speed > 0 ? r.time / st.furnace.speed : r.time;
    const H = [];
    H.push('<div class="uta-item">');
    H.push('<div class="uta-ihead"><span class="uta-iico">' + esc(r.icon) + '</span>' +
      '<span class="uta-iname ' + tqn(r.grade) + '">' + esc(r.name) + '</span>' +
      '<span class="uta-tag">' + r.grade + '品</span><span class="uta-tag">丹道 lv.' + r.alchLv + '</span></div>');
    if (r.effText) H.push('<div class="uta-eff">' + esc(r.effText) + '</div>');
    H.push('<div class="uta-mini">' + costHtml(r.cost) + '</div>');
    H.push('<div class="uta-mini">耗时 ' + fmtTime(actual) + ' · 成功率 ' + Math.round(r.succ) + '%' +
      (r.tox ? ' · <span class="uta-warn">丹毒 +' + r.tox + '</span>' : '') + '</div>');
    H.push('<div class="uta-row">');
    const dis = !!st.job || !r.canCraft;
    H.push('<button class="btn btn-primary uta-btn-sm" data-act="al:craft" data-id="' + esc(r.id) + '"' + (dis ? ' disabled' : '') + '>开炉</button>');
    const isAuto = !!(auto && auto.recipeId === r.id);
    H.push('<button class="btn ' + (isAuto ? 'btn-primary' : 'btn-ghost') + ' uta-btn-sm" data-act="al:auto" data-id="' + esc(r.id) + '">' +
      (isAuto ? '🔁 连炉中' : '连炉') + '</button>');
    if (st.job) H.push('<span class="uta-mini">炉火正旺，此炉占用中</span>');
    else if (!r.canCraft && r.reason) H.push('<span class="uta-no">' + esc(r.reason) + '</span>');
    H.push('</div></div>');
    return H.join('');
  }

  // 丹囊：丹毒条 + 丹药背包（按类型分组）
  function alBagHtml(A) {
    let tox = { tox: 0, slow: false, ban: false };
    try { tox = A.getToxInfo(); } catch (e) { /* 保持默认 */ }
    const H = [];
    // —— 丹毒条（0~100 渐变色，>50/>80 警示）——
    H.push('<div class="card"><div class="card-title">丹毒</div>');
    H.push('<div class="progress uta-toxwrap"><div class="progress-fill" data-al-tox="1" style="width:' + Math.min(100, Math.max(0, tox.tox)) + '%"></div>' +
      '<div class="progress-text" data-al-toxtxt="1">' + Math.floor(tox.tox) + '/100</div></div>');
    if (tox.ban) H.push('<div class="uta-danger">⚠ 丹毒攻心：百脉壅塞，不可再服丹药（解毒丹豁免）</div>');
    else if (tox.slow) H.push('<div class="uta-warn">⚠ 丹毒缠体：修炼速度 −20%</div>');
    else H.push('<div class="uta-mini">丹毒轻微，每 60 息自减 1 点。</div>');
    H.push('</div>');
    // —— 丹药背包 ——
    const inv = (XG.state && XG.state.inv && XG.state.inv.pill) || {};
    const infos = [];
    for (const pid in inv) {
      if ((inv[pid] || 0) <= 0) continue;
      let info = null;
      try { info = A.pillInfo(pid); } catch (e) { info = null; }
      if (info) infos.push(info);
    }
    if (!infos.length) {
      H.push('<div class="card card-sub">囊中无丹——往丹方页开炉炼制。</div>');
      return H.join('');
    }
    const recMap = {};
    ((XG.data && XG.data.pills && XG.data.pills.recipes) || []).forEach(function (rc) { recMap[rc.id] = rc; });
    const groups = {};
    infos.forEach(function (info) {
      const rc = recMap[info.baseId];
      const tp = (rc && rc.eff && rc.eff.type) || 'cult';
      (groups[tp] = groups[tp] || []).push(info);
    });
    PILL_TYPE_ORDER.forEach(function (tp) {
      const arr = groups[tp];
      if (!arr || !arr.length) return;
      H.push('<div class="uta-group">' + (PILL_TYPE_NAME[tp] || tp) + '（' + arr.length + '）</div>');
      arr.forEach(function (info) { H.push(alPillRow(info)); });
    });
    return H.join('');
  }

  function alPillRow(info) {
    const H = [];
    H.push('<div class="uta-item"><div class="uta-ihead"><span class="uta-iico">' + esc(info.icon) + (info.star ? '★' : '') + '</span>' +
      '<span class="uta-iname ' + tqn(info.grade) + '">' + esc(info.name) + '</span>' +
      '<span class="uta-tag">' + info.grade + '品</span><span class="uta-tag uta-on">×' + info.count + '</span>' +
      (info.star ? '<span class="uta-tag uta-on">极品</span>' : '') + '</div>');
    if (info.effText) H.push('<div class="uta-eff">' + esc(info.effText) + '</div>');
    if (info.tox) H.push('<div class="uta-warn">丹毒 +' + info.tox + '</div>');
    if (info.desc) H.push('<div class="uta-mini">' + esc(info.desc) + '</div>');
    H.push('<div class="uta-row"><button class="btn btn-primary uta-btn-sm" data-act="al:use" data-id="' + esc(info.id) + '"' +
      (info.usable ? '' : ' disabled') + '>服用</button>');
    if (info.usable && info.count > 1) {
      H.push('<button class="btn btn-ghost uta-btn-sm" data-act="al:useall" data-id="' + esc(info.id) + '">全服</button>');
    }
    if (!info.usable && info.reason) H.push('<span class="uta-no">' + esc(info.reason) + '</span>');
    H.push('</div></div>');
    return H.join('');
  }

  // 炉火页：丹炉购买列表 + 异火收集图鉴
  function alLuHtml(A, st) {
    const H = [];
    let furns = [];
    try { furns = A.listFurnaces() || []; } catch (e) { furns = []; }
    H.push('<div class="uta-group">丹炉购置</div>');
    const ls = (XG.state && XG.state.res && XG.state.res.lingShi) || 0;
    furns.forEach(function (f) {
      H.push('<div class="uta-item' + (f.owned || f.next ? '' : ' uta-dim') + '"><div class="uta-ihead"><span class="uta-iico">' + esc(f.icon) + '</span>' +
        '<span class="uta-iname">' + esc(f.name) + '</span>' +
        (f.current ? '<span class="uta-tag uta-on">在用</span>' : f.owned ? '<span class="uta-tag">已购置</span>' : '') + '</div>');
      H.push('<div class="uta-mini">成功 +' + f.succ + '% · 炉速 ×' + f.speed + (f.desc ? '　' + esc(f.desc) : '') + '</div>');
      if (f.next) {
        H.push('<div class="uta-row"><span class="' + (ls >= f.cost ? 'uta-ok' : 'uta-no') + '">🪙 ' + fmt(f.cost) + '</span>' +
          '<button class="btn btn-primary uta-btn-sm" data-act="al:buyfurnace"' + (ls >= f.cost ? '' : ' disabled') + '>购置此炉</button></div>');
      }
      H.push('</div>');
    });
    let fires = [];
    try { fires = A.listFires() || []; } catch (e) { fires = []; }
    const ownedN = fires.filter(function (f) { return f.owned; }).length;
    H.push('<div class="uta-group">异火图鉴（' + ownedN + '/' + fires.length + '）</div>');
    fires.forEach(function (f) {
      if (f.owned) {
        H.push('<div class="uta-item"><div class="uta-ihead"><span class="uta-iico">' + esc(f.icon) + '</span>' +
          '<span class="uta-iname ' + tqn(f.grade) + '">' + esc(f.name) + '</span><span class="uta-tag">' + f.grade + '品</span>' +
          (f.equipped ? '<span class="uta-tag uta-on">燃用中</span>' : '') + '</div>');
        H.push('<div class="uta-mini">成功 +' + f.succ + '% · 变异 +' + f.mutPct + '%' + (f.desc ? '　' + esc(f.desc) : '') + '</div>');
        if (!f.equipped) H.push('<div class="uta-row"><button class="btn uta-btn-sm" data-act="al:fire2" data-id="' + esc(f.id) + '">换用此火</button></div>');
        H.push('</div>');
      } else {
        H.push('<div class="uta-item uta-dim"><div class="uta-ihead"><span class="uta-iico">🕯️</span>' +
          '<span class="uta-iname">' + (f.hidden ? '???' : esc(f.name)) + '</span><span class="uta-tag">' + f.grade + '品</span></div>' +
          '<div class="uta-mini">线索：' + esc(f.getHint || '机缘未至') + '</div></div>');
      }
    });
    return H.join('');
  }

  function alAct(op, arg, t) {
    const A = sys('alchemy'); if (!A) return;
    const id = arg || (t && t.getAttribute && t.getAttribute('data-id'));
    if (op === 'sub') { SA.sub = arg; rerender('alchemy'); return; }
    let r = null;
    if (op === 'craft') { r = A.startCraft(id); if (r && r.ok) pop('开炉', 'pop-good'); }
    else if (op === 'auto') {
      const cur = A.getAuto ? A.getAuto() : null;
      r = A.setAuto(cur && cur.recipeId === id ? null : id);
    }
    else if (op === 'cancel') r = A.cancelCraft();
    else if (op === 'buyfurnace') r = A.buyFurnace();
    else if (op === 'setfire' || op === 'fire2') r = A.setFire(id);
    else if (op === 'use') {
      r = A.usePill(id);
      if (r && r.ok && r.eff && r.eff.type === 'cult') {
        pop('+' + fmt(r.eff.val * (r.star ? 1.5 : 1)) + ' 修为', 'pop-good');
      }
    }
    else if (op === 'useall') {
      r = A.useAll(id);
      if (r && r.ok) pop('服丹 ×' + r.n, 'pop-good');
    }
    if (r && r.msg) toast(r.msg, !r.ok);
    else if (r && !r.ok) toast('行事未成', true);
    rerender('alchemy');
  }

  // 每秒动态：炼丹进度/剩余、丹毒条、药力行；丹成自动整页重渲
  function updAlchemy(el) {
    const A = sys('alchemy'); if (!A) return;
    try {
      const job = A.getJobProgress();
      const fill = el.querySelector('[data-al-fill]');
      if (job && fill) fill.style.width = (job.pct * 100) + '%';
      const rem = el.querySelector('[data-al-remain]');
      if (job && rem) rem.textContent = '尚余 ' + fmtTime(job.remainSec);
      if (!job && el._hadJob) { el._hadJob = false; rerender('alchemy'); return; }
      el._hadJob = !!job;
      const tox = A.getToxInfo();
      const tbar = el.querySelector('[data-al-tox]');
      if (tbar) tbar.style.width = Math.min(100, Math.max(0, tox.tox)) + '%';
      const ttxt = el.querySelector('[data-al-toxtxt]');
      if (ttxt) ttxt.textContent = Math.floor(tox.tox) + '/100';
      const bf = el.querySelector('[data-al-buffs]');
      if (bf) bf.innerHTML = alBuffsHtml(A);
    } catch (e) { /* 静默 */ }
  }

  /* ============================================================
   * 炼器（sysId: forge）：装备槽/背包/详情（洗练/强化/升星/镶嵌/器灵）/ 打造 / 套装
   * ============================================================ */
  const SF = { sub: 'equip' }; // equip | craft | set
  const SLOT_NAME = { weapon: '兵器', head: '法冠', body: '法衣', boots: '云履', ring: '灵戒', talisman: '灵符' };
  const SLOT_ORDER = ['weapon', 'head', 'body', 'boots', 'ring', 'talisman'];
  const EQ_GRADE_NAME = ['凡品', '灵品', '宝品', '仙品', '神品'];

  function renderForge(el) {
    if (isLocked('forge')) { el.innerHTML = lockedHtml('forge', '炼器'); return; }
    const F = sys('forge');
    if (!F) { el.innerHTML = '<div class="card">炼器系统未载入……</div>'; return; }
    const H = [];
    H.push('<div class="tab-page"><h2>炼器阁</h2>');
    H.push(subTabs('fg', SF.sub, [['equip', '装备'], ['craft', '打造'], ['set', '套装']]));
    if (SF.sub === 'craft') H.push(fgCraftHtml(F));
    else if (SF.sub === 'set') H.push(fgSetHtml(F));
    else H.push(fgEquipHtml(F));
    H.push('</div>');
    el.innerHTML = H.join('');
  }

  // 装备页：6 槽 + 背包列表
  function fgEquipHtml(F) {
    const H = [];
    let eqd = {};
    try { eqd = F.getEquipped() || {}; } catch (e) { eqd = {}; }
    H.push('<div class="card"><div class="card-title">已装备 <span class="card-sub">点击查看详情</span></div><div class="uta-slots">');
    SLOT_ORDER.forEach(function (sl) {
      const e = eqd[sl];
      if (e) {
        let d = null;
        try { d = F.getEquipDetail(e.uid); } catch (err) { d = null; }
        H.push('<div class="uta-slot ' + qg(e.grade) + '" data-act="fg:detail" data-id="' + esc(e.uid) + '" title="' + esc(d ? d.name : '') + '">' +
          esc(d ? d.icon : '⚔️') + '<small>' + esc(d ? d.name : SLOT_NAME[sl]) + (e.enh ? '<br>+' + e.enh : '') + '</small></div>');
      } else H.push('<div class="uta-slot uta-empty">＋<small>' + SLOT_NAME[sl] + '</small></div>');
    });
    H.push('</div></div>');
    let inv = [];
    try { inv = F.getInv() || []; } catch (e) { inv = []; }
    H.push('<div class="uta-group">装备背包（' + inv.length + '）</div>');
    if (!inv.length) H.push('<div class="card card-sub">背包空空——可往打造页铸兵，或历练副本掉落。</div>');
    H.push('<div class="grid grid-2">');
    inv.forEach(function (e) {
      let d = null;
      try { d = F.getEquipDetail(e.uid); } catch (err) { d = null; }
      if (!d) return;
      H.push('<div class="uta-item ' + qg(d.grade) + '" data-act="fg:detail" data-id="' + esc(d.uid) + '" style="cursor:pointer;margin-bottom:0">' +
        '<div class="uta-ihead"><span class="uta-iico">' + esc(d.icon) + '</span>' +
        '<span class="uta-iname ' + tqg(d.grade) + '">' + esc(d.name) + (d.enh ? ' +' + d.enh : '') + '</span></div>' +
        '<div class="uta-mini">' + esc(d.gradeName) + ' · ' + (SLOT_NAME[d.slot] || d.slot) +
        (d.star ? ' · ★×' + d.star : '') + ' · 词条×' + (d.affixes ? d.affixes.length : 0) + '</div>' +
        '<div class="uta-mini">战力 ' + fmtInt(d.power) + '</div></div>');
    });
    H.push('</div>');
    return H.join('');
  }

  // 打造页：底材列表 + 材料消耗 + 打造按钮
  function fgCraftHtml(F) {
    let list = [];
    try { list = F.getCraftList() || []; } catch (e) { list = []; }
    if (!list.length) return '<div class="card card-sub">无可打造底材。</div>';
    const H = [];
    list.forEach(function (it) {
      const b = it.base;
      const stats = [];
      if (b.base) {
        if (b.base.atk) stats.push('攻 +' + fmtInt(b.base.atk));
        if (b.base.def) stats.push('防 +' + fmtInt(b.base.def));
        if (b.base.hp) stats.push('血 +' + fmtInt(b.base.hp));
      }
      H.push('<div class="uta-item ' + qg(b.grade) + '"><div class="uta-ihead"><span class="uta-iico">' + esc(b.icon) + '</span>' +
        '<span class="uta-iname ' + tqg(b.grade) + '">' + esc(b.name) + '</span>' +
        '<span class="uta-tag">' + (EQ_GRADE_NAME[b.grade] || '凡品') + '</span><span class="uta-tag">' + (SLOT_NAME[b.slot] || b.slot) + '</span></div>');
      H.push('<div class="uta-mini">' + stats.join('　') + (b.desc ? '　' + esc(b.desc) : '') + '</div>');
      H.push('<div class="uta-mini">' + costHtml(it.cost) + '</div>');
      H.push('<div class="uta-row"><button class="btn btn-primary uta-btn-sm" data-act="fg:craft" data-id="' + esc(b.id) + '"' +
        (it.can ? '' : ' disabled') + '>打造</button>' + (it.err ? '<span class="uta-no">' + esc(it.err) + '</span>' : '') + '</div>');
      H.push('</div>');
    });
    return H.join('');
  }

  // 套装图鉴：已收集件数点亮 + 2/4 件效果
  function fgSetHtml(F) {
    let sets = [];
    try { sets = F.getSetInfo() || []; } catch (e) { sets = []; }
    if (!sets.length) return '<div class="card card-sub">套装图鉴未载入。</div>';
    const owned = {};
    (((XG.state || {}).equips || {}).list || []).forEach(function (e) { if (e && e.baseId) owned[e.baseId] = 1; });
    const piecesMap = {};
    ((XG.data && XG.data.equips && XG.data.equips.sets) || []).forEach(function (s) { piecesMap[s.id] = s.pieces || []; });
    const H = [];
    sets.forEach(function (s) {
      const pieces = piecesMap[s.id] || [];
      H.push('<div class="card' + (s.count ? '' : ' uta-dim') + '"><div class="card-title">' + esc(s.icon) + ' ' + esc(s.name) +
        ' <span class="card-sub">已集 ' + s.count + '/' + pieces.length + '</span></div>');
      H.push('<div class="uta-chips">');
      pieces.forEach(function (pid) {
        let b = null;
        try { b = F.getBaseInfo(pid); } catch (e) { b = null; }
        H.push('<span class="uta-chip' + (owned[pid] ? ' uta-lit' : '') + '">' + esc(b ? b.name : pid) + '</span>');
      });
      H.push('</div>');
      H.push('<div class="' + (s.eff2on ? 'uta-eff' : 'uta-mini') + '">两件：' + esc(effLines(s.eff2).join('，')) + (s.eff2on ? '（已激活）' : '（未激活）') + '</div>');
      H.push('<div class="' + (s.eff4on ? 'uta-eff' : 'uta-mini') + '">四件：' + esc(effLines(s.eff4).join('，')) + (s.eff4on ? '（已激活）' : '（未激活）') + '</div>');
      if (s.desc) H.push('<div class="uta-mini">' + esc(s.desc) + '</div>');
      H.push('</div>');
    });
    return H.join('');
  }

  // —— 装备详情浮层 ——
  function openForgeDetail(uid) {
    const F = sys('forge'); if (!F) return;
    let d = null;
    try { d = F.getEquipDetail(uid); } catch (e) { d = null; }
    if (!d) { closeModal(); _fgUid = null; rerender('forge'); return; }
    _fgUid = uid;
    openModal(d.icon + ' ' + d.name + (d.enh ? ' +' + d.enh : ''), fgDetailHtml(F, d), '');
  }

  function fgDetailHtml(F, d) {
    const uid = d.uid;
    const H = [];
    H.push('<div class="uta-ihead"><span class="uta-iico">' + esc(d.icon) + '</span>' +
      '<span class="uta-iname ' + tqg(d.grade) + '">' + esc(d.name) + (d.enh ? ' +' + d.enh : '') + '</span>' +
      '<span class="uta-tag">' + esc(d.gradeName) + '</span>' + (d.star ? '<span class="uta-tag uta-on">★×' + d.star + '</span>' : '') + '</div>');
    H.push('<div class="uta-mini">' + (SLOT_NAME[d.slot] || d.slot) + (d.setName ? ' · 套装：' + esc(d.setName) : '') +
      ' · 战力 ' + fmtInt(d.power) + '</div>');
    // 属性
    const fl = d.flat || {};
    H.push('<div class="uta-sec">属性</div>');
    H.push('<div class="uta-eff">攻击 +' + fmtInt(fl.atk || 0) + '　防御 +' + fmtInt(fl.def || 0) + '　气血 +' + fmtInt(fl.hp || 0) + '</div>');
    // 词条（洗练 + 锁）
    H.push('<div class="uta-sec">词条（' + (d.affixes ? d.affixes.length : 0) + '）</div>');
    (d.affixes || []).forEach(function (a, i) {
      H.push('<div class="uta-kv"><span>' + esc(a.name) + ' <span class="uta-eff">+' + a.val + '%</span>' + (a.locked ? ' 🔒' : '') + '</span><span>' +
        '<button class="btn btn-ghost uta-btn-sm" data-act="fg:lock:' + i + '" data-id="' + esc(uid) + '">' + (a.locked ? '解锁' : '锁定') + '</button> ' +
        '<button class="btn uta-btn-sm" data-act="fg:reforge:' + i + '" data-id="' + esc(uid) + '"' + (a.locked ? ' disabled' : '') + '>洗练</button></span></div>');
    });
    if (!(d.affixes || []).length) H.push('<div class="uta-mini">无词条。</div>');
    let rc = null;
    try { rc = F.reforgeCost(uid); } catch (e) { rc = null; }
    if (rc) {
      H.push('<div class="uta-mini">洗练灵玉 ' + rc.base + (rc.locked ? ' + ' + rc.perLock + '×' + rc.locked + '（锁定）' : '') +
        ' = <b>' + rc.total + '</b>（锁定词条不被洗练）</div>');
    }
    // 强化
    let ei = null;
    try { ei = F.enhanceInfo(uid); } catch (e) { ei = null; }
    if (ei) {
      H.push('<div class="uta-sec">强化</div>');
      H.push('<div class="uta-kv"><span>+' + ei.lv + ' / +' + ei.max + '</span>' +
        '<span class="uta-mini">成功率 ' + Math.round(ei.rate * 100) + '%' + (ei.doubled ? ' · 消耗翻倍 · 连败保底 ' + ei.pity + '/' + ei.pityMax : '') + '</span></div>');
      if (ei.lv < ei.max) {
        H.push('<div class="uta-row"><span class="uta-mini">' + costHtml(ei.cost) + '</span>' +
          '<button class="btn btn-primary uta-btn-sm" data-act="fg:enh" data-id="' + esc(uid) + '"' + (hasRes(ei.cost) ? '' : ' disabled') + '>强化一次</button>' +
          '<button class="btn uta-btn-sm" data-act="fg:enh5" data-id="' + esc(uid) + '"' + (hasRes(ei.cost) ? '' : ' disabled') + '>强化×5</button></div>');
      } else H.push('<div class="uta-mini">已臻化境，强化圆满。</div>');
    }
    // 升星
    let si = null;
    try { si = F.starInfo(uid); } catch (e) { si = null; }
    if (si) {
      H.push('<div class="uta-sec">升星</div>');
      H.push('<div class="uta-kv"><span>★ ' + si.star + ' / ' + si.max + '</span>' +
        (si.needDup ? '<span class="uta-mini">需吞同名底材一件（候选 ' + si.dupCandidates.length + '）</span>' : '') + '</div>');
      if (si.star < si.max) {
        const canDup = !si.needDup || si.dupCandidates.length > 0;
        H.push('<div class="uta-row"><span class="uta-mini">' + costHtml(si.cost) + '</span>' +
          '<button class="btn btn-primary uta-btn-sm" data-act="fg:star" data-id="' + esc(uid) + '"' + (canDup && hasRes(si.cost) ? '' : ' disabled') + '>升星</button></div>');
      } else H.push('<div class="uta-mini">十星圆满。</div>');
    }
    // 镶嵌（2 槽 + 宝石背包）
    H.push('<div class="uta-sec">镶嵌</div>');
    let bag = [];
    try { bag = F.getGemBag() || []; } catch (e) { bag = []; }
    for (let i = 0; i < 2; i++) {
      const gv = d.gemView && d.gemView[i];
      if (gv) {
        H.push('<div class="uta-kv"><span>' + esc(gv.icon) + ' ' + esc(gv.name) + ' lv.' + gv.lv +
          ' <span class="uta-eff">' + esc(effLines(gv.eff).join('，')) + '</span></span>' +
          '<button class="btn btn-ghost uta-btn-sm" data-act="fg:gemoff:' + i + '" data-id="' + esc(uid) + '">卸下</button></div>');
      } else if (bag.length) {
        H.push('<div class="uta-kv"><span>槽位' + (i + 1) + '（空）</span><span><select class="uta-select" data-gemsel="' + i + '">');
        bag.forEach(function (g) {
          H.push('<option value="' + esc(g.instId) + '">' + esc(g.icon + ' ' + g.name + ' lv.' + g.lv) + (g.count > 1 ? ' ×' + g.count : '') + '</option>');
        });
        H.push('</select> <button class="btn uta-btn-sm" data-act="fg:gem:' + i + '" data-id="' + esc(uid) + '">镶嵌</button></span></div>');
      } else H.push('<div class="uta-mini">槽位' + (i + 1) + '（空）——囊中无宝石，历练副本可得。</div>');
    }
    if (bag.length) {
      H.push('<div class="uta-mini" style="margin-top:4px">宝石背包：' + bag.map(function (g) {
        return esc(g.icon + g.name) + ' lv.' + g.lv + '×' + g.count +
          (g.canMerge ? ' <button class="btn btn-ghost uta-btn-sm" data-act="fg:gemmerge:' + g.lv + '" data-id="' + esc(g.gemId) + '">三合一（🪙' + fmt(g.mergeCost) + '）</button>' : '');
      }).join('；') + '</div>');
    }
    // 器灵
    H.push('<div class="uta-sec">器灵</div>');
    let sp = null;
    try { sp = F.spiritInfo(uid); } catch (e) { sp = null; }
    if (sp && sp.spirit) {
      const persona = sp.personaDef ? sp.personaDef.name : '无名之性';
      H.push('<div class="uta-kv"><span>「' + esc(sp.spirit.name) + '」</span>' +
        '<span class="uta-mini">' + esc(persona) + ' · lv.' + sp.spirit.lv + '</span></div>');
      const xpct = sp.expNeed > 0 ? Math.min(100, (sp.spirit.exp || 0) / sp.expNeed * 100) : 100;
      H.push('<div class="progress uta-pbar-sm"><div class="progress-fill" style="width:' + xpct + '%"></div>' +
        '<div class="progress-text">' + (sp.spirit.exp || 0) + '/' + sp.expNeed + '</div></div>');
      (sp.skillView || []).forEach(function (sk) {
        H.push('<div class="uta-skill"><span>' + esc(sk.icon) + ' ' + esc(sk.name) + ' lv.' + sk.lv + '</span>' +
          '<span class="uta-mini">' + esc(sk.desc || effLines(sk.eff).join('，')) + '</span></div>');
      });
      if (sp.feedable && sp.feedable.length) {
        H.push('<div class="uta-row"><select class="uta-select" data-feedsel="1">');
        sp.feedable.forEach(function (fuid) {
          let nm = fuid;
          try {
            const fe = F.getEquip(fuid);
            const fb = fe && F.getBaseInfo(fe.baseId);
            if (fb) nm = fb.name + (fe.enh ? ' +' + fe.enh : '');
          } catch (e) { /* 用 uid 兜底 */ }
          H.push('<option value="' + esc(fuid) + '">' + esc(nm) + '</option>');
        });
        H.push('</select><button class="btn uta-btn-sm" data-act="fg:feed" data-id="' + esc(uid) + '">喂食同名装备</button></div>');
      } else H.push('<div class="uta-mini">喂食同名装备可养器灵（背包暂无同名件）。</div>');
    } else {
      let cw = null;
      try { cw = F.canWakeSpirit(uid); } catch (e) { cw = null; }
      if (cw && cw.ok) {
        let costTxt = '';
        try {
          const wc = XG.data.equips.spirits && XG.data.equips.spirits.wakeCond;
          if (wc && wc.lingYu) costTxt = '（灵玉 ' + fmt(wc.lingYu) + '）';
        } catch (e) { /* 静默 */ }
        H.push('<div class="uta-row"><button class="btn btn-primary uta-btn-sm" data-act="fg:wake" data-id="' + esc(uid) + '">孕育器灵</button>' +
          '<span class="uta-mini">神品 +15，灵智胎动 ' + costTxt + '</span></div>');
      } else H.push('<div class="uta-mini">' + esc((cw && cw.err) || '神品装备强化 +15 方可孕育器灵') + '</div>');
    }
    // 穿脱
    H.push('<div class="uta-row" style="margin-top:8px">');
    if (d.equipped) H.push('<button class="btn btn-ghost" data-act="fg:unequip" data-id="' + esc(d.slot) + '">卸下</button>');
    else H.push('<button class="btn btn-primary" data-act="fg:equip" data-id="' + esc(uid) + '">装备上身</button>');
    H.push('</div>');
    return H.join('');
  }

  function fgAct(op, arg, t) {
    const F = sys('forge'); if (!F) return;
    const id = (t && t.getAttribute && t.getAttribute('data-id')) || arg;
    if (op === 'sub') { SF.sub = arg; rerender('forge'); return; }
    if (op === 'detail') { openForgeDetail(id); return; }
    let r = null;
    if (op === 'craft') {
      r = F.craft(id);
      if (r && r.ok) {
        let nm = '', g = 0;
        try { const b = r.equip && F.getBaseInfo(r.equip.baseId); nm = b ? b.name : ''; g = r.equip ? r.equip.grade : 0; } catch (e) { /* 静默 */ }
        toast('铸成「' + nm + '」', g >= 3 ? 'gold' : undefined);
        pop('神兵出炉', 'pop-good');
        try { if (g >= 3 && XG.ui.fx && XG.ui.fx.drop) XG.ui.fx.drop(g); } catch (e) { /* 静默 */ }
      } else toast(r && r.err, true);
      rerender('forge');
      return;
    }
    if (op === 'equip') r = F.equip(id);
    else if (op === 'unequip') r = F.unequip(id);
    else if (op === 'enh') {
      r = F.enhance(id);
      if (r && r.ok) { toast(r.msg || (r.success ? '强化成功 +' + r.lv : '强化失败，器物无损'), !r.success); if (r.success) pop('+' + r.lv, 'pop-good'); }
    }
    else if (op === 'enh5') {
      r = F.enhanceTimes ? F.enhanceTimes(id, 5) : { ok: false, err: '未成' };
      if (r && r.ok && r.wins > 0) pop('+' + r.lv, 'pop-good');
    } else if (op === 'reforge') r = F.reforge(id, parseInt(arg, 10) || 0);
    else if (op === 'lock') r = F.toggleLock(id, parseInt(arg, 10) || 0);
    else if (op === 'gem') {
      const sel = document.querySelector('[data-gemsel="' + arg + '"]');
      if (!sel || !sel.value) { toast('请先择一枚宝石', true); return; }
      r = F.inlay(id, parseInt(arg, 10) || 0, sel.value);
    } else if (op === 'gemoff') r = F.removeGem(id, parseInt(arg, 10) || 0);
    else if (op === 'gemmerge') r = F.mergeGem(id, parseInt(arg, 10) || 0);
    else if (op === 'star') { r = F.starUp(id); if (r && r.ok) pop('★ ' + r.star, 'pop-good'); }
    else if (op === 'wake') {
      r = F.wakeSpirit(id);
      if (r && r.ok && r.spirit) { pop('器灵「' + r.spirit.name + '」觉醒', 'pop-good'); toast('器灵觉醒：' + r.spirit.name, 'gold'); }
    } else if (op === 'feed') {
      const sel = document.querySelector('[data-feedsel]');
      if (!sel || !sel.value) { toast('无可喂食之材', true); return; }
      r = F.feedSpirit(id, sel.value);
    }
    if (r && r.err) toast(r.err, true);
    else if (r && r.msg && op !== 'enh') toast(r.msg, !r.ok);
    else if (r && !r.ok && !r.err) toast('行事未成', true);
    rerender('forge');
    if (_fgUid) openForgeDetail(_fgUid); // 重开详情刷新
  }

  // 炼器无每秒动态量，保留空实现（契约 update 接口）
  function updForge(el) { /* 无时间型产出，无需秒刷 */ }

  /* ============================================================
   * 灵宠（sysId: pets）：出战队列 / 灵宠录 / 孵蛋 / 繁殖 / 打工
   * ============================================================ */
  const SP = { sub: 'pets', breedA: '', breedB: '', hatching: null };
  const JOB_SHORT = { lt: '灵田', sl: '兽栏', explore: '探索' };

  function renderPets(el) {
    if (isLocked('pets')) { el.innerHTML = lockedHtml('pets', '灵宠'); return; }
    const P = sys('pets');
    if (!P) { el.innerHTML = '<div class="card">灵宠系统未载入……</div>'; return; }
    const H = [];
    H.push('<div class="tab-page"><h2>灵宠苑</h2>');
    H.push(subTabs('pt', SP.sub, [['pets', '灵宠'], ['hatch', '孵蛋'], ['breed', '繁殖'], ['work', '打工']]));
    if (SP.sub === 'hatch') H.push(ptHatchHtml(P));
    else if (SP.sub === 'breed') H.push(ptBreedHtml(P));
    else if (SP.sub === 'work') H.push(ptWorkHtml(P));
    else H.push(ptPetsHtml(P));
    H.push('</div>');
    el.innerHTML = H.join('');
  }

  // 灵宠页：出战 3 槽（战力贡献）+ 宠物卡片列表
  function ptPetsHtml(P) {
    const H = [];
    let team = [];
    try { team = P.teamList() || []; } catch (e) { team = []; }
    let tp = 0;
    try { tp = P.teamPower(); } catch (e) { tp = 0; }
    H.push('<div class="card"><div class="card-title">出战队列 <span class="card-sub">' + team.length + '/3 · 总战力 ' + fmtInt(tp) + '</span></div><div class="uta-slots">');
    for (let i = 0; i < 3; i++) {
      const p = team[i];
      if (p) {
        const share = tp > 0 ? Math.round(p.power / tp * 100) : 0;
        H.push('<div class="uta-slot" data-act="pt:detail" data-id="' + esc(p.uid) + '" title="' + esc(p.name) + '">' +
          esc(p.icon) + '<small>' + esc(p.name) + '<br>战力 ' + fmtInt(p.power) + '（' + share + '%）</small></div>');
      } else H.push('<div class="uta-slot uta-empty">＋<small>虚位</small></div>');
    }
    H.push('</div><div class="uta-mini" style="margin-top:5px">出战灵宠属性两成折算予主人。</div></div>');
    let list = [];
    try { list = P.list() || []; } catch (e) { list = []; }
    H.push('<div class="uta-group">灵宠录（' + list.length + '）</div>');
    if (!list.length) H.push('<div class="card card-sub">尚无灵宠——孵蛋或历练捕捉可得。</div>');
    H.push('<div class="grid grid-2">');
    list.forEach(function (p) { H.push(ptCardHtml(p)); });
    H.push('</div>');
    return H.join('');
  }

  // 宠物卡片：icon/名字/品级/资质档（天赐金闪）/等级/性格/技能行/血脉纯度条
  function ptCardHtml(p) {
    const H = [];
    const tian = p.tierName === '天赐';
    H.push('<div class="uta-item" data-act="pt:detail" data-id="' + esc(p.uid) + '" style="cursor:pointer;margin-bottom:0">');
    H.push('<div class="uta-ihead"><span class="uta-iico">' + esc(p.icon) + (p.shiny ? '✨' : '') + '</span>' +
      '<span class="uta-iname">' + esc(p.name) + '</span>' +
      '<span class="uta-tag">' + p.grade + '品</span>' +
      '<span class="uta-tag' + (tian ? ' uta-on' : '') + (tian ? ' uta-shiny' : '') + '">' + esc(p.tierName) + '</span></div>');
    H.push('<div class="uta-mini">lv.' + p.lv + ' · ' + esc(p.personaName) +
      (p.inTeam ? ' · <span class="uta-ok">出战</span>' : '') + (p.job ? ' · 务工：' + (JOB_SHORT[p.job] || p.job) : '') + '</div>');
    const epct = p.expNeed > 0 ? Math.min(100, p.exp / p.expNeed * 100) : 100;
    H.push('<div class="progress uta-pbar-sm"><div class="progress-fill" data-pt-exp="' + esc(p.uid) + '" style="width:' + epct + '%"></div>' +
      '<div class="progress-text" data-pt-exptxt="' + esc(p.uid) + '">' + (p.isMaxLv ? '满级' : p.exp + '/' + p.expNeed) + '</div></div>');
    if (p.skills && p.skills.length) {
      H.push('<div class="uta-mini" style="margin-top:3px">技：' + p.skills.map(function (s) { return esc(s.icon + s.name); }).join('　') + '</div>');
    }
    H.push('<div class="uta-mini" style="margin-top:3px">' + esc(p.bloodIcon) + ' ' + esc(p.bloodName) + ' 纯度 ' + (p.purity || 0) +
      (p.awaken ? ' 🔥已觉醒' : '') + '</div>');
    H.push('<div class="progress uta-pbar-sm"><div class="progress-fill" style="width:' + Math.min(100, p.purity || 0) + '%"></div></div>');
    H.push('</div>');
    return H.join('');
  }

  // 孵蛋页：蛋库存 + 孵化按钮（结果动画）+ 当前蛋池
  function ptHatchHtml(P) {
    let eggs = 0;
    try { eggs = P.eggs(); } catch (e) { eggs = 0; }
    const H = [];
    H.push('<div class="card"><div class="card-title">孵蛋</div>');
    if (SP.hatching) {
      H.push('<div class="uta-egg">🥚</div><div class="uta-mini" style="text-align:center">蛋壳微裂，灵光外泄……</div>');
    } else {
      H.push('<div class="uta-kv"><span>灵宠蛋库存</span><span class="uta-tag uta-on">×' + eggs + '</span></div>');
      H.push('<div class="uta-row"><button class="btn btn-primary" data-act="pt:hatch"' + (eggs > 0 ? '' : ' disabled') + '>孵化</button>' +
        '<span class="uta-mini">灵宠蛋可往历练地图探寻</span></div>');
    }
    H.push('</div>');
    let pool = [];
    try { pool = P.hatchPoolInfo() || []; } catch (e) { pool = []; }
    if (pool.length) {
      H.push('<div class="uta-group">当前蛋池（按境界）</div><div class="card">');
      pool.forEach(function (it) {
        H.push('<div class="uta-kv"><span>' + esc(it.icon) + ' ' + esc(it.name) + ' <span class="uta-tag">' + it.grade + '品</span></span>' +
          '<span class="uta-mini">' + it.pct + '%</span></div>');
      });
      H.push('</div>');
    }
    return H.join('');
  }

  // 繁殖页：元婴解锁；选两宠 + 消耗 + 冷却显示 + 按钮
  function ptBreedHtml(P) {
    const H = [];
    if (isLocked('petBreed')) { H.push(lockedHtml('petBreed', '灵宠繁殖')); return H.join(''); }
    let list = [];
    try { list = P.list() || []; } catch (e) { list = []; }
    const now = Date.now();
    const C = P.consts || {};
    function opts(sel) {
      let h = '<option value="">—— 择一宠 ——</option>';
      list.forEach(function (p) {
        const cd = (p.breedCd || 0) > now;
        const dis = (p.lv < 30) || cd;
        h += '<option value="' + esc(p.uid) + '"' + (sel === p.uid ? ' selected' : '') + (dis ? ' disabled' : '') + '>' +
          esc(p.icon + ' ' + p.name) + ' lv.' + p.lv + (cd ? '（冷却中）' : p.lv < 30 ? '（未足30级）' : '') + '</option>';
      });
      return h;
    }
    H.push('<div class="card"><div class="card-title">灵宠繁殖</div>');
    H.push('<div class="card-sub">两宠皆需 ≥30 级，耗灵石 ' + fmt(C.BREED_COST || 1e5) + '，双亲各静养 ' +
      (C.BREED_CD_H || 24) + ' 时辰。后代承血脉与资质，偶有异变之喜。</div>');
    H.push('<div class="uta-row"><select class="uta-select" data-pt-breed="breedA">' + opts(SP.breedA) + '</select><span>×</span>' +
      '<select class="uta-select" data-pt-breed="breedB">' + opts(SP.breedB) + '</select></div>');
    let chk = null;
    if (SP.breedA && SP.breedB) { try { chk = P.canBreed(SP.breedA, SP.breedB); } catch (e) { chk = null; } }
    if (chk) {
      H.push('<div class="' + (chk.ok ? 'uta-ok' : 'uta-no') + '" data-pt-cd="1" style="margin-top:5px">' +
        esc(chk.ok ? '佳偶天成，可行繁衍。' : (chk.reason || '时机未到')) + '</div>');
    } else H.push('<div class="uta-mini" data-pt-cd="1" style="margin-top:5px">择两宠以观姻缘。</div>');
    H.push('<div class="uta-row"><button class="btn btn-primary" data-act="pt:breed"' + (chk && chk.ok ? '' : ' disabled') + '>繁衍后代</button></div>');
    H.push('</div>');
    return H.join('');
  }

  // 打工页：岗位列表（灵田/兽栏/探索）+ 待领取池 + 一键领取
  function ptWorkHtml(P) {
    const H = [];
    let pend = { lingShi: 0, mat: {} };
    try { pend = P.pending(); } catch (e) { /* 保持默认 */ }
    const hasPend = (pend.lingShi >= 1) || Object.keys(pend.mat || {}).length > 0;
    H.push('<div class="card"><div class="card-title">待领取</div><div data-pt-pending="1">' + pendHtml(pend) + '</div>' +
      '<div class="uta-row"><button class="btn btn-primary uta-btn-sm" data-act="pt:collect"' + (hasPend ? '' : ' disabled') + '>一键领取</button></div></div>');
    let defs = {};
    try { defs = P.jobDefs() || {}; } catch (e) { defs = {}; }
    let jobs = [];
    try { jobs = P.jobList() || []; } catch (e) { jobs = []; }
    let cap = 3;
    try { cap = P.jobCap(); } catch (e) { cap = 3; }
    H.push('<div class="uta-mini" style="margin:2px 0 6px">打工位 ' + jobs.length + '/' + cap + '（洞府兽栏升级可扩）</div>');
    ['lt', 'sl', 'explore'].forEach(function (jid) {
      const d = defs[jid];
      if (!d) return;
      const arr = jobs.filter(function (j) { return j.job === jid; });
      H.push('<div class="card"><div class="card-title">' + esc(d.icon) + ' ' + esc(d.name) + ' <span class="card-sub">' + arr.length + ' 宠</span></div>');
      if (d.desc) H.push('<div class="card-sub">' + esc(d.desc) + '</div>');
      if (!arr.length) H.push('<div class="uta-mini" style="margin-top:4px">尚无务工灵宠——于灵宠详情中派遣。</div>');
      arr.forEach(function (j) {
        let rate = '';
        try {
          const r = P.ratesFor(j.uid);
          const rv = r && r[jid];
          if (rv) rate = jid === 'lt' ? ('约 ' + (Math.round(rv.herbPerH * 10) / 10) + ' 株/时')
            : jid === 'sl' ? (rv.expPerH + ' 经验/时') : (fmtInt(rv.lingShiPerH) + ' 灵石/时');
        } catch (e) { /* 静默 */ }
        H.push('<div class="uta-kv"><span>' + esc(j.pet.icon) + ' ' + esc(j.pet.name) +
          ' <span class="uta-mini">lv.' + j.pet.lv + (rate ? ' · ' + rate : '') + '</span></span>' +
          '<button class="btn btn-ghost uta-btn-sm" data-act="pt:unjob" data-id="' + esc(j.uid) + '">召回</button></div>');
      });
      H.push('</div>');
    });
    return H.join('');
  }

  function pendHtml(p) {
    const parts = [];
    if (p.lingShi >= 1) parts.push('🪙 灵石 ' + fmtInt(p.lingShi));
    const ids = Object.keys(p.mat || {});
    ids.forEach(function (id) { if (p.mat[id] > 0) parts.push(matIcon(id) + ' ' + matName(id) + ' ×' + p.mat[id]); });
    return parts.length ? parts.join('　') : '<span class="uta-mini">空空如也</span>';
  }

  // —— 灵宠详情浮层 ——
  function openPetDetail(uid) {
    const P = sys('pets'); if (!P) return;
    let p = null;
    try { p = P.get(uid); } catch (e) { p = null; }
    if (!p) { closeModal(); _ptUid = null; rerender('pets'); return; }
    _ptUid = uid;
    openModal(p.icon + ' ' + p.name, ptDetailHtml(P, p), '');
  }

  function ptDetailHtml(P, p) {
    const H = [];
    const tian = p.tierName === '天赐';
    H.push('<div class="uta-ihead"><span class="uta-iico">' + esc(p.icon) + (p.shiny ? '✨' : '') + '</span>' +
      '<span class="uta-iname">' + esc(p.name) + '</span><span class="uta-tag">' + p.grade + '品</span>' +
      '<span class="uta-tag' + (tian ? ' uta-on uta-shiny' : '') + '">' + esc(p.tierName) + '（资质 ' + p.apt + '）</span></div>');
    H.push('<div class="uta-mini">' + esc(p.spName) + ' · lv.' + p.lv + (p.isMaxLv ? '（满级）' : '') + ' · 战力 ' + fmtInt(p.power) + '</div>');
    const epct = p.expNeed > 0 ? Math.min(100, p.exp / p.expNeed * 100) : 100;
    H.push('<div class="progress uta-pbar-sm"><div class="progress-fill" style="width:' + epct + '%"></div>' +
      '<div class="progress-text">' + (p.isMaxLv ? '满级' : '经验 ' + p.exp + '/' + p.expNeed) + '</div></div>');
    // 面板
    H.push('<div class="uta-sec">面板</div>');
    H.push('<div class="uta-eff">攻 ' + fmtInt(p.stats.atk) + ' · 防 ' + fmtInt(p.stats.def) + ' · 血 ' + fmtInt(p.stats.hp) + ' · 速 ' + fmtInt(p.stats.spd) + '</div>');
    H.push('<div class="uta-mini">性格：' + esc(p.personaName) + '——' + esc(p.personaDesc || '') +
      '（打工 +' + p.personaWorkPct + '% / 出战 +' + p.personaFightPct + '%）</div>');
    // 血脉
    H.push('<div class="uta-sec">血脉</div>');
    H.push('<div class="uta-mini">' + esc(p.bloodIcon) + ' ' + esc(p.bloodName) + ' · 纯度 ' + (p.purity || 0) + '/100' +
      (p.awaken ? ' 🔥 已觉醒' : '') + '</div>');
    // 技能
    H.push('<div class="uta-sec">技能（' + (p.skills ? p.skills.length : 0) + '）</div>');
    (p.skills || []).forEach(function (s) {
      H.push('<div class="uta-skill"><span>' + esc(s.icon) + ' ' + esc(s.name) + '</span><span class="uta-mini">' + esc(s.desc || '') + '</span></div>');
    });
    if (!p.skills || !p.skills.length) H.push('<div class="uta-mini">未习得技能。</div>');
    // 进化（条件绿红 + 按钮）
    H.push('<div class="uta-sec">进化</div>');
    let ev = null;
    try { ev = P.canEvolve(p.uid); } catch (e) { ev = null; }
    if (ev && ev.need) {
      const lvOk = ev.need.curLv >= ev.need.lv;
      H.push('<div class="' + (lvOk ? 'uta-ok' : 'uta-no') + '">等级 ' + ev.need.curLv + ' / ' + ev.need.lv + '</div>');
      if (ev.need.item) {
        H.push('<div class="' + (ev.need.itemHave >= 1 ? 'uta-ok' : 'uta-no') + '">材料 ' + esc(ev.need.itemName || ev.need.item) +
          ' ' + ev.need.itemHave + ' / 1</div>');
      }
      H.push('<div class="uta-row"><button class="btn btn-primary uta-btn-sm" data-act="pt:evolve" data-id="' + esc(p.uid) + '"' +
        (ev.ok ? '' : ' disabled') + '>进化</button>' + (ev.ok ? '' : '<span class="uta-mini">' + esc(ev.reason || '') + '</span>') + '</div>');
    } else H.push('<div class="uta-mini">' + esc((ev && ev.reason) || '已至化境，无可进化') + '</div>');
    // 血脉觉醒
    H.push('<div class="uta-sec">血脉觉醒</div>');
    if (p.awaken) H.push('<div class="uta-ok">🔥 血脉已觉醒，全属性 +50%。</div>');
    else {
      let aw = null;
      try { aw = P.canAwaken(p.uid); } catch (e) { aw = null; }
      let costTxt = '';
      if (aw && aw.cost) {
        costTxt = '（灵石 ' + fmt(aw.cost.lingShi || 0) +
          (aw.cost.mat ? ' · ' + Object.keys(aw.cost.mat).map(function (k) { return matName(k) + '×' + aw.cost.mat[k]; }).join(' ') : '') + '）';
      }
      H.push('<div class="uta-row"><button class="btn uta-btn-sm" data-act="pt:awaken" data-id="' + esc(p.uid) + '"' +
        (aw && aw.ok ? '' : ' disabled') + '>觉醒</button><span class="uta-mini">纯度 ≥60 可觉醒' + costTxt + '</span></div>');
      if (aw && !aw.ok && aw.reason) H.push('<div class="uta-no">' + esc(aw.reason) + '</div>');
    }
    // 改名
    H.push('<div class="uta-sec">改名</div>');
    H.push('<div class="uta-row"><input class="uta-input" data-rename="1" maxlength="12" placeholder="赐个新名（≤12字）" style="width:150px">' +
      '<button class="btn uta-btn-sm" data-act="pt:rename" data-id="' + esc(p.uid) + '">赐名</button></div>');
    // 差遣：出战 / 打工分配下拉 / 放生
    H.push('<div class="uta-sec">差遣</div>');
    H.push('<div class="uta-row">');
    if (p.inTeam) H.push('<button class="btn btn-ghost uta-btn-sm" data-act="pt:leave" data-id="' + esc(p.uid) + '">离队列</button>');
    else H.push('<button class="btn btn-primary uta-btn-sm" data-act="pt:join" data-id="' + esc(p.uid) + '">出战</button>');
    let defs = {};
    try { defs = P.jobDefs() || {}; } catch (e) { defs = {}; }
    H.push('<select class="uta-select" data-pt-jobassign="1"' + (p.inTeam ? ' disabled title="出战中的灵宠不可务工"' : '') + '>');
    H.push('<option value="">闲散</option>');
    ['lt', 'sl', 'explore'].forEach(function (jid) {
      const d = defs[jid];
      if (d) H.push('<option value="' + jid + '"' + (p.job === jid ? ' selected' : '') + '>' + esc(d.name) + '</option>');
    });
    H.push('</select>');
    H.push('<button class="btn btn-danger uta-btn-sm" data-act="pt:release" data-id="' + esc(p.uid) + '">放生</button>');
    H.push('</div>');
    return H.join('');
  }

  // 繁殖结果弹窗
  function ptChildHtml(cv) {
    return '<div style="text-align:center;font-size:42px">' + esc(cv.icon) + (cv.shiny ? '✨' : '') + '</div>' +
      '<h3 style="text-align:center;margin:4px 0">' + esc(cv.name) + '</h3>' +
      '<div style="text-align:center" class="uta-mini">' + esc(cv.spName) + ' · ' + cv.grade + '品 · ' + esc(cv.tierName) + '（资质 ' + cv.apt + '）</div>' +
      '<div class="uta-mini" style="text-align:center">血脉：' + esc(cv.bloodName) + ' 纯度 ' + (cv.purity || 0) + '</div>';
  }

  function ptAct(op, arg, t) {
    const P = sys('pets'); if (!P) return;
    const id = arg || (t && t.getAttribute && t.getAttribute('data-id'));
    if (op === 'sub') { SP.sub = arg; rerender('pets'); return; }
    let r = null;
    if (op === 'detail') { openPetDetail(id); return; }
    if (op === 'hatch') {
      if (SP.hatching) return;
      try { r = P.hatch(); } catch (e) { r = { ok: false, msg: '孵化失败' }; }
      if (!r || !r.ok) { toast(r && r.msg, true); return; }
      // 结果动画：蛋壳摇动 1.1s 后揭晓
      SP.hatching = r.pet || true;
      rerender('pets');
      setTimeout(function () {
        const pet = SP.hatching;
        SP.hatching = null;
        if (pet && pet.icon) {
          toast('🐣 ' + r.msg, (pet.grade >= 4 || pet.shiny) ? 'gold' : undefined);
          pop((pet.shiny ? '✨闪光 ' : '') + pet.icon + ' ' + pet.name, 'pop-good');
          try { if ((pet.grade >= 4 || pet.shiny) && XG.ui.fx && XG.ui.fx.drop) XG.ui.fx.drop(pet.grade); } catch (e) { /* 静默 */ }
        } else toast(r.msg);
        rerender('pets');
      }, 1100);
      return;
    }
    if (op === 'breed') {
      if (!SP.breedA || !SP.breedB) { toast('先择两宠', true); return; }
      try { r = P.breed(SP.breedA, SP.breedB); } catch (e) { r = { ok: false, msg: '繁衍未成' }; }
      toast(r && r.msg, !(r && r.ok));
      if (r && r.ok && r.child) {
        let cv = null;
        try { cv = r.child.uid ? P.get(r.child.uid) : null; } catch (e) { cv = null; }
        if (cv) openModal('麟儿降世', ptChildHtml(cv), '');
        try { if (cv && cv.grade >= 4 && XG.ui.fx && XG.ui.fx.drop) XG.ui.fx.drop(cv.grade); } catch (e) { /* 静默 */ }
      }
      rerender('pets');
      return;
    }
    if (op === 'collect') {
      r = P.collect();
      if (r && r.ok && r.gain && r.gain.lingShi >= 1) pop('+' + fmtInt(r.gain.lingShi) + ' 灵石', 'pop-good');
    } else if (op === 'unjob') r = P.unassignJob(id);
    else if (op === 'join') r = P.joinTeam(id);
    else if (op === 'leave') r = P.leaveTeam(id);
    else if (op === 'evolve') {
      r = P.evolve(id);
      if (r && r.ok) {
        pop('进化成功', 'pop-good');
        try { if (XG.ui.fx && XG.ui.fx.shake) XG.ui.fx.shake(); } catch (e) { /* 静默 */ }
      }
    } else if (op === 'awaken') { r = P.awaken(id); if (r && r.ok) pop('血脉觉醒！', 'pop-good'); }
    else if (op === 'rename') {
      const inp = document.querySelector('[data-rename]');
      r = P.rename(id, inp ? inp.value : '');
    } else if (op === 'job') {
      r = id ? P.assignJob(_ptUid, id) : P.unassignJob(_ptUid);
    } else if (op === 'release') {
      // 系统未开放放生接口：防御提示，不报错
      if (typeof P.release !== 'function') { toast('此界灵宠皆有缘法，放生之道尚未开启。'); return; }
      confirmBox('放生此宠？此别再难相见。', function () {
        let rr = null;
        try { rr = P.release(id); } catch (e) { /* 静默 */ }
        toast(rr && rr.msg, !(rr && rr.ok));
        closeModal();
        rerender('pets');
      });
      return;
    }
    if (r && r.msg) toast(r.msg, !r.ok);
    else if (r && !r.ok) toast('行事未成', true);
    rerender('pets');
    if (_ptUid) openPetDetail(_ptUid); // 重开详情刷新
  }

  // 每秒动态：出战/兽栏经验条、待领池、繁殖冷却文案；输入/下拉占用时跳过
  function updPets(el) {
    const P = sys('pets'); if (!P) return;
    const ae = document.activeElement;
    if (ae && el.contains(ae) && /^(SELECT|INPUT|TEXTAREA)$/.test(ae.tagName || '')) return;
    try {
      const bars = el.querySelectorAll('[data-pt-exp]');
      for (let i = 0; i < bars.length; i++) {
        const uid = bars[i].getAttribute('data-pt-exp');
        const p = P.get(uid);
        if (!p) continue;
        bars[i].style.width = (p.expNeed > 0 ? Math.min(100, p.exp / p.expNeed * 100) : 100) + '%';
        const txt = el.querySelector('[data-pt-exptxt="' + uid + '"]');
        if (txt) txt.textContent = p.isMaxLv ? '满级' : p.exp + '/' + p.expNeed;
      }
      const pd = el.querySelector('[data-pt-pending]');
      if (pd) pd.innerHTML = pendHtml(P.pending());
      const cd = el.querySelector('[data-pt-cd]');
      if (cd && SP.breedA && SP.breedB) {
        const chk = P.canBreed(SP.breedA, SP.breedB);
        if (chk) {
          cd.textContent = chk.ok ? '佳偶天成，可行繁衍。' : (chk.reason || '时机未到');
          cd.className = chk.ok ? 'uta-ok' : 'uta-no';
        }
      }
    } catch (e) { /* 静默 */ }
  }

  /* ==================== tab 注册（均 main:false，入「更多」网格） ==================== */
  RENDER.gongfa = renderGongfa;
  RENDER.alchemy = renderAlchemy;
  RENDER.forge = renderForge;
  RENDER.pets = renderPets;
  bindDoc();

  reg({
    id: 'gongfa', name: '功法', icon: '📜', order: 1, main: true, sysId: 'gongfa',
    mount: function (el) { mountBase('gongfa', el); },
    update: function (dt) { if (els.gongfa) updGongfa(els.gongfa); },
    unmount: function () { unmountBase('gongfa'); },
  });
  reg({
    id: 'alchemy', name: '炼丹', icon: '⚗️', order: 30, main: false, sysId: 'alchemy',
    mount: function (el) { mountBase('alchemy', el); },
    update: function (dt) { if (els.alchemy) updAlchemy(els.alchemy); },
    unmount: function () { unmountBase('alchemy'); },
  });
  reg({
    id: 'forge', name: '炼器', icon: '⚒️', order: 40, main: false, sysId: 'forge',
    mount: function (el) { mountBase('forge', el); },
    update: function (dt) { if (els.forge) updForge(els.forge); },
    unmount: function () { unmountBase('forge'); },
  });
  reg({
    id: 'pets', name: '灵宠', icon: '🐾', order: 25, main: false, sysId: 'pets',
    mount: function (el) { mountBase('pets', el); },
    update: function (dt) { if (els.pets) updPets(els.pets); },
    unmount: function () { unmountBase('pets'); },
  });
})();
