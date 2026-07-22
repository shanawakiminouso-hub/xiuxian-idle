/* ui-tabs-c.js：道友 / 坊市 / 图鉴 / 成就 / 轮回 / 设置 六个 tab（契约 §12，均 main:false）
 * 消费系统：fellows（道友列表/求助/坊市/道侣）、collection（图鉴+成就）、reincarn（轮回）、save/state（设置）
 * 样式：优先复用 style.css 主题类（card/btn/progress/grid/modal 等）；
 *       扩展样式经 <style id="xtc-style"> 注入，类名统一 xtc- 前缀防冲突 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  /* ==================== 通用防御小工具 ==================== */
  function sys(id) { return (XG.sys && XG.sys[id]) || null; }
  function esc(s) {
    s = (s == null ? '' : String(s));
    return (XG.util && XG.util.esc) ? XG.util.esc(s) : s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { try { return XG.util.fmt(n || 0); } catch (e) { return String(n || 0); } }
  function fmtInt(n) { try { return XG.util.fmtInt(n || 0); } catch (e) { return String(Math.floor(n || 0)); } }
  function fmtTime(sec) { try { return XG.util.fmtTime(Math.max(0, sec | 0)); } catch (e) { return (sec | 0) + '秒'; } }
  function clampN(v, a, b) { v = Number(v) || 0; return Math.min(b, Math.max(a, v)); }
  function toast(msg, type) { if (XG.ui && XG.ui.toast) { try { XG.ui.toast(msg, type); } catch (e) {} } }
  function pop(text, cls) { if (XG.ui && XG.ui.pop) { try { XG.ui.pop(text, cls); } catch (e) {} } }
  function modal(opt) { if (XG.ui && XG.ui.modal) { try { XG.ui.modal(opt); } catch (e) {} } else toast(opt && opt.title || ''); }
  function closeModal() { if (XG.ui && XG.ui.closeModal) { try { XG.ui.closeModal(); } catch (e) {} } }
  function confirmBox(text, cb) {
    if (XG.ui && XG.ui.confirm) { try { XG.ui.confirm(text, cb); return; } catch (e) {} }
    if (window.confirm(text)) cb();
  }
  function unlocked(id) { try { return XG.cfg && XG.cfg.isUnlocked ? XG.cfg.isUnlocked(id) : true; } catch (e) { return true; } }
  function R(el, name) { return el ? el.querySelector('[data-r="' + name + '"]') : null; }
  function lockHtml(text) { return '<div class="card xtc-lock">🔒 ' + esc(text) + '</div>'; }

  // tab 注册（防御性：兼容 ui-core 后加载，契约 §12 守则 1）
  const reg = function (def) {
    if (window.XG && XG.ui && XG.ui.registerTab) XG.ui.registerTab(def);
    else { XG._pendingTabs = XG._pendingTabs || []; XG._pendingTabs.push(def); }
  };

  // 事件绑定/解绑（同一 el 重复 mount 不叠加监听）
  function bindTab(tab, el, handler) {
    tab._el = el;
    tab._h = handler;
    el.removeEventListener('click', handler);
    el.addEventListener('click', handler);
  }
  function unbindTab(tab, el) {
    if (tab && tab._h && el) el.removeEventListener('click', tab._h);
    if (tab) tab._el = null;
  }
  // 点击是否落在本 tab 根内（防同容器串 tab 触发）
  function inRoot(e, id) {
    const t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return null;
    const root = t.closest('[data-xtc="' + id + '"]');
    return root ? t : null;
  }

  /* ==================== 注入样式（xtc- 前缀） ==================== */
  function injectStyle() {
    if (document.getElementById('xtc-style')) return;
    const st = document.createElement('style');
    st.id = 'xtc-style';
    st.textContent = [
      '/* ui-tabs-c 注入样式：类名统一 xtc- 前缀 */',
      '.xtc-kv{display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:2px 0}',
      '.xtc-kv b{color:var(--qing-d)}',
      '.xtc-rel{font-size:11px;border-radius:8px;padding:0 6px;margin-left:4px;white-space:nowrap}',
      '.xtc-rel-friend{color:var(--gold-d);border:1px solid var(--gold)}',
      '.xtc-rel-rival{color:var(--danger);border:1px solid var(--danger)}',
      '.xtc-rel-partner{color:#c05a7e;border:1px solid #d98aa5;background:rgba(217,138,165,.14)}',
      '.xtc-tag{font-size:11px;color:var(--ink-l);border:1px solid var(--line);border-radius:8px;padding:0 5px;white-space:nowrap}',
      '.xtc-fav{margin-top:5px}',
      '.xtc-click{cursor:pointer}',
      '.xtc-click:active{transform:translateY(1px)}',
      '.xtc-old{text-decoration:line-through;color:var(--ink-l);font-size:12px;margin-right:4px}',
      '.xtc-price{color:var(--gold-d);font-weight:bold}',
      '.xtc-say{background:rgba(58,125,107,.08);border-left:3px solid var(--qing);padding:8px 10px;border-radius:4px;white-space:pre-line;margin:8px 0;font-size:14px}',
      '.xtc-news-li{font-size:12px;color:var(--ink-l);padding:3px 0;border-bottom:1px dashed var(--line)}',
      '.xtc-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}',
      '.xtc-tab-b{font-family:var(--font-kai);font-size:13px;padding:4px 12px;border-radius:14px;border:1px solid var(--line);background:var(--paper);color:var(--ink-l);cursor:pointer}',
      '.xtc-tab-b.on{background:var(--qing);color:#f9f5ea;border-color:var(--qing-d)}',
      '.xtc-badge-n{background:var(--danger);color:#fff;font-size:10px;border-radius:8px;padding:0 5px;margin-left:3px}',
      '.xtc-grid-icon{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
      '.xtc-cell{text-align:center;padding:8px 4px;border:1px solid var(--line);border-radius:8px;background:var(--paper);font-size:12px;cursor:pointer}',
      '.xtc-cell .xtc-ci{font-size:22px;display:block;line-height:1.3}',
      '.xtc-cell.dim{opacity:.45;cursor:default;filter:grayscale(1)}',
      '.xtc-ring{width:86px;height:86px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none}',
      '.xtc-ring-in{width:66px;height:66px;border-radius:50%;background:var(--paper);display:flex;align-items:center;justify-content:center;font-weight:bold;color:var(--qing-d);font-size:15px}',
      '.xtc-flash{animation:xtcFlash 1.2s ease-in-out infinite}',
      '.xtc-tcols{display:grid;grid-template-columns:1fr;gap:10px}',
      '.xtc-tnode{border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:8px;background:var(--paper)}',
      '.xtc-tnode.dim{opacity:.5}',
      '.xtc-tnode.max{border-color:var(--gold)}',
      '.xtc-wave{display:flex;justify-content:space-between;gap:6px;font-size:13px;padding:5px 8px;border-bottom:1px dashed var(--line)}',
      '.xtc-wave.pre{opacity:.75}',
      '.xtc-wave.re{opacity:.3}',
      '.xtc-wave.re.show{opacity:1;animation:xtcWaveIn .3s ease}',
      '.xtc-wave.pass{color:var(--qing-d)}',
      '.xtc-wave.fail{color:var(--danger);font-weight:bold}',
      '.xtc-qty{display:inline-flex;align-items:center;gap:6px}',
      '.xtc-qty .btn{padding:2px 10px}',
      '.xtc-io{width:100%;font-family:var(--font-kai);font-size:12px;border:1px solid var(--line);border-radius:6px;background:#fbf7ec;color:var(--ink);padding:6px;resize:vertical}',
      '.xtc-lock{text-align:center;padding:28px 10px;color:var(--ink-l)}',
      '.xtc-mrow{display:flex;justify-content:space-between;font-size:12px;color:var(--ink-l)}',
      '@keyframes xtcFlash{0%,100%{box-shadow:0 0 0 0 rgba(201,160,99,0)}50%{box-shadow:0 0 12px 3px rgba(201,160,99,.8)}}',
      '@keyframes xtcWaveIn{from{transform:translateX(-8px);opacity:0}to{transform:none;opacity:1}}',
      '@media (min-width:768px){.xtc-grid-icon{grid-template-columns:repeat(4,1fr)}.xtc-tcols{grid-template-columns:repeat(3,1fr)}}',
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ==================== 数据小助手 ==================== */
  const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const PILL_TYPE = { atk: '攻', def: '防', hp: '血' };
  const EFF_NAME = {
    cultRatePct: '修炼速度', atkPct: '攻击', defPct: '防御', hpPct: '气血', dropPct: '掉落',
    alchSuccPct: '炼丹成功率', forgeSuccPct: '炼器成功率', breakSuccPct: '突破成功率',
    offlineHours: '离线时长', workPct: '打工效率', atkFlat: '攻击', defFlat: '防御', hpFlat: '气血',
  };
  function personaName(id) {
    const ps = (XG.data && XG.data.fellows && XG.data.fellows.personas) || [];
    for (let i = 0; i < ps.length; i++) if (ps[i] && ps[i].id === id) return ps[i].name;
    return id || '散修';
  }
  function gradeTxt(kind, g) {
    g = g | 0;
    if (kind === 'equip') return ['凡品', '灵品', '宝品', '仙品', '神品'][g] || (g + '品');
    if (kind === 'mat') return ['一阶', '二阶', '三阶', '四阶', '五阶'][g] || (g + '阶');
    if (kind === 'egg' || g <= 0) return '';
    return g + '品';
  }
  function daysAgo(ts) {
    if (!ts) return '—';
    const d = Math.floor((Date.now() - ts) / 86400000);
    return d <= 0 ? '今日相识' : ('相识 ' + d + ' 日');
  }
  function invCount(kind, id) {
    const inv = (XG.state && XG.state.inv) || {};
    const bag = kind === 'pill' ? inv.pill : inv.mat;
    return (bag && bag[id]) || 0;
  }
  function fellowNews(name, n) {
    const arr = (XG.state && XG.state.news) || [];
    const out = [];
    for (let i = 0; i < arr.length && out.length < n; i++) {
      const it = arr[i];
      if (it && it.text && String(it.text).indexOf(name) >= 0) out.push(it);
    }
    return out;
  }
  function rewardText(rw) {
    if (!rw) return '???';
    const parts = [];
    if (rw.lingYu) parts.push('灵玉×' + fmt(rw.lingYu));
    if (rw.lingShi) parts.push('灵石×' + fmt(rw.lingShi));
    if (rw.eff) {
      for (const k in rw.eff) {
        parts.push((EFF_NAME[k] || k) + '+' + rw.eff[k] + (/Pct$/.test(k) ? '%' : ''));
      }
    }
    return parts.length ? parts.join('、') : '无';
  }
  function popReward(rw) {
    if (!rw) return;
    if (rw.lingYu) pop('灵玉+' + fmt(rw.lingYu), 'pop-good');
    if (rw.lingShi) pop('灵石+' + fmt(rw.lingShi), 'pop-good');
  }

  /* ==================== 一、道友 tab ==================== */
  const REL_BADGE = {
    friend: ['挚友', 'xtc-rel-friend'],
    rival: ['宿敌', 'xtc-rel-rival'],
    partner: ['道侣', 'xtc-rel-partner'],
  };
  const F_STATE = { normal: '潜修', stuck: '卡关', surge: '顿悟', trib: '渡劫' };

  function renderFellows(el) {
    const body = R(el, 'body');
    if (!body) return;
    const fs = sys('fellows');
    if (!fs) { body.innerHTML = lockHtml('道友系统尚未载入。'); return; }
    if (!unlocked('fellows')) { body.innerHTML = lockHtml('道友：炼气 8 层解锁。下山之前，先夯实道基。'); return; }

    let html = '';
    /* ---- 求助卡置顶 ---- */
    let helps = [];
    try { helps = fs.listHelp() || []; } catch (e) { helps = []; }
    const pend = helps.filter(function (h) { return h && h.done === 0; });
    if (pend.length) {
      html += '<div class="card"><h3 class="card-title">📮 道友求助（' + pend.length + '）</h3>';
      pend.forEach(function (h) {
        html += '<div style="border-bottom:1px dashed var(--line);padding:6px 0;display:flex;gap:8px;align-items:flex-start">'
          + '<div style="flex:1;min-width:0"><div><b>' + esc(h.name) + '</b>：' + esc(h.text) + '</div>'
          + '<div class="muted">需 ' + esc(h.icon || '') + ' ' + esc(h.itemName) + ' ×' + h.n
          + '（现有 ' + fmtInt(invCount(h.kind, h.id)) + '）</div></div>'
          + '<div style="flex:none"><button class="btn btn-primary" data-act="help-ok" data-hid="' + esc(h.hid) + '">赠予</button> '
          + '<button class="btn btn-ghost" data-act="help-no" data-hid="' + esc(h.hid) + '">婉拒</button></div></div>';
      });
      html += '</div>';
    }
    /* ---- 道侣卡 ---- */
    let pi = null;
    try { pi = fs.partnerInfo(); } catch (e) { pi = null; }
    if (pi) {
      html += '<div class="card"><h3 class="card-title">💞 道侣 · ' + esc(pi.name) + '</h3>'
        + '<div class="xtc-kv"><span>境界</span><b>' + esc(pi.realmName) + '</b></div>'
        + '<div class="xtc-kv"><span>好感</span><b>' + fmtInt(pi.favor) + '/100</b></div>'
        + '<div class="muted">道侣在身，修炼速度 +10%。</div>'
        + '<div class="row" style="margin-top:6px">'
        + '<button class="btn btn-primary" data-act="f-dual"' + (pi.canDual ? '' : ' disabled') + '>'
        + (pi.canDual ? '双修（每日一次）' : '今日已双修') + '</button>'
        + '<button class="btn btn-ghost" data-act="f-story">剧情回顾</button></div></div>';
    }
    /* ---- 统计 + 道友列表（sys 已按 关系>好感>境界 排序） ---- */
    let cnt = { total: 0, friend: 0, rival: 0, partner: 0 };
    try { cnt = fs.count() || cnt; } catch (e) {}
    html += '<div class="card-sub" style="margin:4px 2px 8px">道友 ' + fmtInt(cnt.total)
      + ' 人 · 挚友 ' + fmtInt(cnt.friend) + ' · 宿敌 ' + fmtInt(cnt.rival) + ' · 道侣 ' + fmtInt(cnt.partner) + '</div>';
    let list = [];
    try { list = fs.list() || []; } catch (e) { list = []; }
    if (!list.length) html += '<div class="card xtc-lock">四下无人，待境界高深自有机缘结识。</div>';
    html += '<div class="grid">';
    list.forEach(function (f) {
      const rb = REL_BADGE[f.relation];
      html += '<div class="card xtc-click" data-act="f-detail" data-uid="' + esc(f.uid) + '" style="margin-bottom:0">'
        + '<div class="row" style="flex-wrap:nowrap">'
        + '<span style="font-size:24px;flex:none">' + esc(f.schoolIcon || '修') + '</span>'
        + '<div style="flex:1;min-width:0">'
        + '<div><b>' + esc(f.name) + '</b> <span class="muted">' + esc(f.realmName) + '</span>'
        + (rb ? '<span class="xtc-rel ' + rb[1] + '">' + rb[0] + '</span>' : '') + '</div>'
        + '<div class="muted">' + esc(f.schoolName) + ' · ' + esc(f.personaName) + ' · '
        + esc(F_STATE[f.state] || '潜修') + (f.reincarn ? ' · ' + f.reincarn + '世' : '') + '</div>'
        + '<div class="progress xtc-fav"><div class="progress-fill" style="width:' + clampN(f.favor, 0, 100) + '%"></div>'
        + '<div class="progress-text">好感 ' + fmtInt(f.favor) + '/100</div></div>'
        + '</div></div></div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  function showFellowDetail(el, uid, extraHtml) {
    const fs = sys('fellows');
    if (!fs) return;
    let f = null;
    try { f = fs.get(uid); } catch (e) { f = null; }
    if (!f) { toast('查无此人。', 'err'); return; }
    const rb = REL_BADGE[f.relation];
    let html = '<div class="xtc-kv"><span>流派</span><b>' + esc(f.schoolIcon || '') + ' ' + esc(f.schoolName) + '</b></div>'
      + '<div class="xtc-kv"><span>境界</span><b>' + esc(f.realmName) + '</b></div>'
      + '<div class="xtc-kv"><span>性格</span><b>' + esc(f.personaName) + '</b></div>'
      + '<div class="xtc-kv"><span>灵根</span><b>' + esc(f.rootName) + '</b></div>'
      + '<div class="xtc-kv"><span>天资</span><b>×' + (f.talent != null ? Number(f.talent).toFixed(2) : '—') + '</b></div>'
      + '<div class="xtc-kv"><span>战力</span><b>' + fmt(f.power) + '</b></div>'
      + '<div class="xtc-kv"><span>状态</span><b>' + esc(F_STATE[f.state] || '潜修') + '</b></div>'
      + '<div class="xtc-kv"><span>相识</span><b>' + esc(daysAgo(f.metAt)) + '</b></div>'
      + '<div class="progress xtc-fav"><div class="progress-fill" style="width:' + clampN(f.favor, 0, 100) + '%"></div>'
      + '<div class="progress-text">好感 ' + fmtInt(f.favor) + '/100</div></div>';
    if (f.lastNews && f.lastNews.text) html += '<div class="xtc-say">📜 ' + esc(f.lastNews.text) + '</div>';
    if (extraHtml) html += extraHtml;
    const news = fellowNews(f.name, 6);
    if (news.length) {
      html += '<div style="margin-top:8px;border-top:1px dashed var(--line);padding-top:6px"><b class="muted">近日传闻</b>';
      news.forEach(function (n) { html += '<div class="xtc-news-li">' + esc(n.text) + '</div>'; });
      html += '</div>';
    }
    const hasP = !!(XG.state && XG.state.player && XG.state.player.partner);
    const btns = [];
    if (f.relation !== 'partner') {
      btns.push({
        text: f.canDiscuss ? '煮茶论道' : '今日已论道',
        cls: f.canDiscuss ? 'btn-primary' : 'btn-ghost',
        cb: function () { doDiscuss(el, uid); },
      });
      if (!hasP && (f.favor || 0) >= 100) {
        btns.push({ text: '结为道侣', cls: 'btn-primary', cb: function () { doBecomePartner(el, uid); } });
      }
    }
    btns.push({ text: '告辞', cls: 'btn-ghost', cb: function () { closeModal(); } });
    modal({ title: (rb ? '【' + rb[0] + '】' : '') + f.name, html: html, buttons: btns });
  }

  function doDiscuss(el, uid) {
    const fs = sys('fellows');
    if (!fs) return;
    let r = null;
    try { r = fs.discuss(uid); } catch (e) { r = null; }
    if (!r) { toast('论道未成。', 'err'); return; }
    toast(r.msg, r.ok ? undefined : 'err');
    if (r.ok) {
      if (r.cult) pop('修为+' + fmt(r.cult), 'pop-good');
      showFellowDetail(el, uid, r.text ? '<div class="xtc-say">' + esc(r.text) + '</div>' : '');
      renderFellows(el);
    }
  }

  function doBecomePartner(el, uid) {
    const fs = sys('fellows');
    if (!fs) return;
    let r = null;
    try { r = fs.becomePartner(uid); } catch (e) { r = null; }
    if (!r) { toast('结缘未成。', 'err'); return; }
    toast(r.msg, r.ok ? 'gold' : 'err');
    if (r.ok) {
      showFellowDetail(el, uid, r.text ? '<div class="xtc-say">' + esc(r.text) + '</div>' : '');
      renderFellows(el);
    }
  }

  function onFellowClick(e) {
    const t = inRoot(e, 'fellows');
    if (!t) return;
    const el = e.currentTarget;
    const act = t.getAttribute('data-act');
    const fs = sys('fellows');
    if (act === 'f-detail') {
      showFellowDetail(el, t.getAttribute('data-uid'));
    } else if (act === 'help-ok' || act === 'help-no') {
      if (!fs) return;
      const hid = t.getAttribute('data-hid');
      let r = null;
      try { r = act === 'help-ok' ? fs.satisfyHelp(hid) : fs.refuseHelp(hid); } catch (err) { r = null; }
      if (!r) { toast('操作未成。', 'err'); return; }
      toast(r.msg, r.ok ? undefined : 'err');
      if (r.ok && r.text) {
        modal({
          title: '道友回话',
          html: '<div class="xtc-say">' + esc(r.text) + '</div>'
            + (r.gift && r.gift.desc ? '<div class="muted">回赠：' + esc(r.gift.desc) + '</div>' : ''),
          buttons: [{ text: '收下', cls: 'btn-primary', cb: function () { closeModal(); } }],
        });
        if (r.gift && r.gift.ouhuang) pop('欧皇机缘！', 'pop-good');
      }
      renderFellows(el);
    } else if (act === 'f-dual') {
      if (!fs) return;
      let r = null;
      try { r = fs.dualCultivate(); } catch (err) { r = null; }
      if (!r) { toast('双修未成。', 'err'); return; }
      toast(r.msg, r.ok ? 'gold' : 'err');
      if (r.ok) {
        if (r.cult) pop('修为+' + fmt(r.cult), 'pop-good');
        if (r.text) modal({ title: '双修', html: '<div class="xtc-say">' + esc(r.text) + '</div>', buttons: [{ text: '好', cls: 'btn-primary', cb: function () { closeModal(); } }] });
      }
      renderFellows(el);
    } else if (act === 'f-story') {
      if (!fs) return;
      let pi = null;
      try { pi = fs.partnerInfo(); } catch (err) { pi = null; }
      if (!pi) return;
      const news = fellowNews(pi.name, 10);
      let html = news.length ? '' : '<div class="muted">红绸初结，尚无太多故事。</div>';
      news.forEach(function (n) { html += '<div class="xtc-news-li">' + esc(n.text) + '</div>'; });
      modal({ title: '与 ' + pi.name + ' 的点滴', html: html, buttons: [{ text: '关闭', cls: 'btn-ghost', cb: function () { closeModal(); } }] });
    }
  }

  const fellowTab = {
    id: 'fellows', name: '道友', icon: '🤝', order: 60, main: false, sysId: 'fellows',
    mount(el) {
      injectStyle();
      el.innerHTML = '<div class="tab-page xtc-page" data-xtc="fellows"><div data-r="body"></div></div>';
      bindTab(this, el, onFellowClick);
      renderFellows(el);
    },
    update() { const el = this._el; if (el && R(el, 'body')) renderFellows(el); },
    unmount(el) { unbindTab(this, el); },
  };

  /* ==================== 二、坊市 tab ==================== */
  // 由 marketRules 基准价推算「原价」（性格/关系浮动前），用于划线对比
  function marketBase(s) {
    const mr = (XG.data && XG.data.world && XG.data.world.marketRules) || {};
    const bp = (mr.stock && mr.stock.basePrice) || {};
    let b = 0;
    if (s.kind === 'pill') b = (bp.pillPerGrade || 200) * (s.grade || 1);
    else if (s.kind === 'mat') b = bp['matG' + (s.grade || 0)] || 100;
    else if (s.kind === 'equip') b = (bp.equipPerGrade || 800) * Math.max(1, s.grade || 0);
    else if (s.kind === 'frag') b = (bp.fragPerGrade || 1500) * (s.grade || 1);
    else b = bp.egg || 3e4;
    if (s.cur === 'lingYu') b = Math.max(1, Math.round(b / 500));
    else b = Math.max(1, Math.round(b));
    return b;
  }

  function renderMarket(el) {
    const body = R(el, 'body');
    if (!body) return;
    const fs = sys('fellows');
    if (!fs) { body.innerHTML = lockHtml('坊市系统尚未载入。'); return; }
    if (!unlocked('market')) { body.innerHTML = lockHtml('坊市：筑基 5 层解锁。'); return; }
    let m = null;
    try { m = fs.market(); } catch (e) { m = null; }
    if (!m || !m.unlocked) { body.innerHTML = lockHtml('坊市未开，筑基 5 层后再来。'); return; }

    const lingYu = (XG.state && XG.state.res && XG.state.res.lingYu) || 0;
    let html = '<div class="card"><div class="row" style="justify-content:space-between">'
      + '<div>🕐 换新倒计时：<b>' + fmtTime(m.nextInSec) + '</b><div class="muted">每两个时辰自动换新一批</div></div>'
      + '<button class="btn btn-primary" data-act="m-refresh"' + (lingYu >= 5 ? '' : ' disabled') + '>灵玉×5 立即换新</button>'
      + '</div></div>';
    if (!m.slots || !m.slots.length) html += '<div class="card xtc-lock">今日坊市冷清，暂无货色。</div>';
    html += '<div class="grid grid-2">';
    (m.slots || []).forEach(function (s) {
      const base = marketBase(s);
      const g = gradeTxt(s.kind, s.grade);
      html += '<div class="card" style="margin-bottom:0">'
        + '<div class="xtc-mrow"><span>卖家 · ' + esc(s.sellerName) + '</span><span class="xtc-tag">' + esc(personaName(s.persona)) + '</span></div>'
        + '<div class="row" style="margin:6px 0 2px;flex-wrap:nowrap"><span style="font-size:22px;flex:none">' + esc(s.icon || '📦') + '</span>'
        + '<div style="min-width:0"><b>' + esc(s.name) + '</b>' + (g ? '<div class="muted">' + esc(g) + '</div>' : '') + '</div></div>'
        + (s.line ? '<div class="muted" style="font-size:12px">「' + esc(s.line) + '」</div>' : '')
        + '<div style="margin:4px 0">'
        + (base && base !== s.price ? '<span class="xtc-old">' + fmt(base) + '</span>' : '')
        + '<span class="xtc-price">' + fmt(s.price) + '</span> <span class="muted">' + esc(s.curName) + '</span>'
        + '<span class="muted" style="float:right">限量 ×' + fmtInt(s.n) + '</span></div>'
        + '<button class="btn btn-primary" style="width:100%" data-act="m-buy" data-sid="' + esc(s.sid) + '"'
        + (s.sold ? ' disabled' : '') + '>' + (s.sold ? '已售罄' : '买下') + '</button>'
        + '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  function onMarketClick(e) {
    const t = inRoot(e, 'market');
    if (!t) return;
    const el = e.currentTarget;
    const act = t.getAttribute('data-act');
    const fs = sys('fellows');
    if (!fs) return;
    if (act === 'm-buy') {
      let r = null;
      try { r = fs.buyMarket(t.getAttribute('data-sid')); } catch (err) { r = null; }
      if (!r) { toast('买卖未成。', 'err'); return; }
      // msg 内含成交台词（marketLines.deal），直接 toast
      toast(r.msg, r.ok ? undefined : 'err');
      renderMarket(el);
    } else if (act === 'm-refresh') {
      let r = null;
      try { r = fs.refreshMarket(); } catch (err) { r = null; }
      if (!r) { toast('换新未成。', 'err'); return; }
      toast(r.msg, r.ok ? 'gold' : 'err');
      renderMarket(el);
    }
  }

  const marketTab = {
    id: 'market', name: '坊市', icon: '🏮', order: 61, main: false, sysId: 'market',
    mount(el) {
      injectStyle();
      el.innerHTML = '<div class="tab-page xtc-page" data-xtc="market"><div data-r="body"></div></div>';
      bindTab(this, el, onMarketClick);
      renderMarket(el);
    },
    update() { const el = this._el; if (el && R(el, 'body')) renderMarket(el); }, // 每秒刷新倒计时/货栏
    unmount(el) { unbindTab(this, el); },
  };

  /* ==================== 三、图鉴 tab（始终可见） ==================== */
  function renderCodex(el) {
    const body = R(el, 'body');
    if (!body) return;
    const col = sys('collection');
    if (!col) { body.innerHTML = lockHtml('图鉴系统尚未载入。'); return; }
    const st = el._cx || (el._cx = { kind: 'gongfa', sig: '' });
    let sum = null;
    try { sum = col.getCodexSummary(); } catch (e) { sum = null; }
    if (!sum) { body.innerHTML = lockHtml('图鉴空空如也。'); return; }

    let html = '<div class="card"><div class="row" style="flex-wrap:nowrap;align-items:center">'
      + '<div class="xtc-ring" style="background:conic-gradient(var(--gold) ' + clampN(sum.pct * 3.6, 0, 360) + 'deg, rgba(43,43,43,.12) 0)">'
      + '<div class="xtc-ring-in">' + sum.pct + '%</div></div>'
      + '<div style="flex:1;min-width:0"><b>图鉴总完成度</b> <span class="muted">' + fmtInt(sum.collected) + '/' + fmtInt(sum.total) + '</span>';
    (sum.cats || []).forEach(function (c) {
      html += '<div class="xtc-mrow"><span>' + esc(c.icon) + ' ' + esc(c.name) + '</span><span>'
        + fmtInt(c.collected) + '/' + fmtInt(c.total) + '（' + c.pct + '%）</span></div>'
        + '<div class="progress" style="height:6px;margin-bottom:3px"><div class="progress-fill" style="width:' + clampN(c.pct, 0, 100) + '%"></div></div>';
    });
    html += '</div></div></div>';

    html += '<div class="xtc-tabs">';
    (sum.cats || []).forEach(function (c) {
      html += '<button class="xtc-tab-b' + (st.kind === c.kind ? ' on' : '') + '" data-act="cx-tab" data-kind="' + esc(c.kind) + '">'
        + esc(c.icon) + ' ' + esc(c.name) + '</button>';
    });
    html += '</div>';

    let list = [];
    try { list = col.getCodexList(st.kind) || []; } catch (e) { list = []; }
    if (!list.length) html += '<div class="card xtc-lock">此类尚无条目。</div>';
    html += '<div class="xtc-grid-icon">';
    list.forEach(function (it) {
      if (it.got) {
        html += '<div class="xtc-cell" data-act="cx-detail" data-id="' + esc(it.id) + '"><span class="xtc-ci">' + esc(it.icon) + '</span>' + esc(it.name) + '</div>';
      } else {
        html += '<div class="xtc-cell dim"><span class="xtc-ci">❓</span>???</div>';
      }
    });
    html += '</div>';
    body.innerHTML = html;
    st.sig = st.kind + '|' + sum.collected + '|' + sum.total;
  }

  function showCodexDetail(el, id) {
    const col = sys('collection');
    if (!col) return;
    const st = el._cx;
    let list = [];
    try { list = col.getCodexList(st.kind) || []; } catch (e) { list = []; }
    let it = null;
    for (let i = 0; i < list.length; i++) if (list[i].id === id) { it = list[i]; break; }
    if (!it || !it.got) return;
    const catName = (st.kind === 'gongfa' ? '功法' : st.kind === 'pill' ? '丹方' : st.kind === 'pet' ? '灵宠' : st.kind === 'equip' ? '装备' : '道友');
    const g = gradeTxt(st.kind === 'equip' ? 'equip' : st.kind, it.grade);
    let html = '<div style="text-align:center;font-size:40px">' + esc(it.icon) + '</div>'
      + '<div style="text-align:center;margin-bottom:6px"><b>' + esc(it.name) + '</b>'
      + (g ? ' <span class="xtc-tag">' + esc(g) + '</span>' : '') + '</div>'
      + (it.desc ? '<div class="xtc-say">' + esc(it.desc) + '</div>' : '')
      + (it.getHint ? '<div class="muted">获取途径：' + esc(it.getHint) + '</div>' : '');
    modal({ title: '图鉴 · ' + catName, html: html, buttons: [{ text: '关闭', cls: 'btn-ghost', cb: function () { closeModal(); } }] });
  }

  function onCodexClick(e) {
    const t = inRoot(e, 'codex');
    if (!t) return;
    const el = e.currentTarget;
    const act = t.getAttribute('data-act');
    if (act === 'cx-tab') {
      const st = el._cx || (el._cx = { kind: 'gongfa', sig: '' });
      st.kind = t.getAttribute('data-kind') || 'gongfa';
      renderCodex(el);
    } else if (act === 'cx-detail') {
      showCodexDetail(el, t.getAttribute('data-id'));
    }
  }

  const codexTab = {
    id: 'codex', name: '图鉴', icon: '📖', order: 90, main: false,
    mount(el) {
      injectStyle();
      el._cx = { kind: 'gongfa', sig: '' };
      el.innerHTML = '<div class="tab-page xtc-page" data-xtc="codex"><div data-r="body"></div></div>';
      bindTab(this, el, onCodexClick);
      renderCodex(el);
      // 图鉴新增即时刷新
      const self = this;
      this._off = XG.bus && XG.bus.on ? XG.bus.on('codex:new', function () { if (self._el) renderCodex(self._el); }) : null;
    },
    update() {
      const el = this._el;
      if (!el || !R(el, 'body')) return;
      const col = sys('collection');
      if (!col) return;
      let sum = null;
      try { sum = col.getCodexSummary(); } catch (e) { return; }
      const st = el._cx;
      const sig = st.kind + '|' + sum.collected + '|' + sum.total;
      if (sig !== st.sig) renderCodex(el); // 仅完成度变化时重绘
    },
    unmount(el) {
      if (this._off) { try { this._off(); } catch (e) {} this._off = null; }
      unbindTab(this, el);
    },
  };

  /* ==================== 四、成就 tab ==================== */
  function renderAch(el) {
    const body = R(el, 'body');
    if (!body) return;
    const col = sys('collection');
    if (!col) { body.innerHTML = lockHtml('成就系统尚未载入。'); return; }
    const st = el._ac || (el._ac = { cat: '', acc: 0 });
    let sum = null, cats = [], list = [];
    try { sum = col.getAchSummary(); cats = col.getAchCats() || []; list = col.getAchList(st.cat || undefined) || []; } catch (e) { return; }

    let html = '<div class="card"><div class="row" style="justify-content:space-between">'
      + '<div><b>成就</b> <span class="muted">' + fmtInt(sum.done) + '/' + fmtInt(sum.total) + '（' + sum.pct + '%）</span>'
      + '<div class="muted">可领嘉奖 ' + fmtInt(sum.claimable) + ' 项</div></div>'
      + '<button class="btn btn-primary' + (sum.claimable ? ' xtc-flash' : '') + '" data-act="ac-all"' + (sum.claimable ? '' : ' disabled') + '>一键领取</button></div>'
      + '<div class="progress" style="margin-top:6px"><div class="progress-fill" style="width:' + clampN(sum.pct, 0, 100) + '%"></div>'
      + '<div class="progress-text">' + sum.pct + '%</div></div></div>';

    html += '<div class="xtc-tabs"><button class="xtc-tab-b' + (!st.cat ? ' on' : '') + '" data-act="ac-tab" data-cat="">全部</button>';
    cats.forEach(function (c) {
      html += '<button class="xtc-tab-b' + (st.cat === c.cat ? ' on' : '') + '" data-act="ac-tab" data-cat="' + esc(c.cat) + '">'
        + esc(c.name) + (c.claimable ? '<span class="xtc-badge-n">' + c.claimable + '</span>' : '') + '</button>';
    });
    html += '</div>';

    // 可领置顶 → 未达成按进度 → 已领垫底
    list = list.slice().sort(function (a, b) {
      const ra = a.canClaim ? 0 : (a.done ? 2 : 1);
      const rb = b.canClaim ? 0 : (b.done ? 2 : 1);
      if (ra !== rb) return ra - rb;
      return (b.progress || 0) - (a.progress || 0);
    });
    if (!list.length) html += '<div class="card xtc-lock">此类暂无成就。</div>';
    list.forEach(function (a) {
      html += '<div class="card" style="margin-bottom:8px"><div class="row" style="flex-wrap:nowrap;align-items:flex-start">'
        + '<span style="font-size:22px;flex:none">' + esc(a.icon) + '</span>'
        + '<div style="flex:1;min-width:0"><div><b>' + esc(a.name) + '</b>' + (a.hidden ? ' <span class="xtc-tag">隐</span>' : '') + '</div>'
        + '<div class="muted">' + esc(a.desc) + '</div>';
      if (a.cur != null && a.target != null) {
        html += '<div class="progress" style="margin:4px 0"><div class="progress-fill" style="width:' + clampN(Math.round((a.progress || 0) * 100), 0, 100) + '%"></div>'
          + '<div class="progress-text">' + fmtInt(a.cur) + '/' + fmtInt(a.target) + '</div></div>';
      }
      html += '<div class="muted">嘉奖：' + esc(rewardText(a.reward)) + '</div></div>'
        + '<div style="flex:none">';
      if (a.canClaim) html += '<button class="btn btn-primary xtc-flash" data-act="ac-claim" data-id="' + esc(a.id) + '">领取</button>';
      else if (a.claimed) html += '<button class="btn btn-ghost" disabled>已领取</button>';
      html += '</div></div></div>';
    });
    body.innerHTML = html;
  }

  function onAchClick(e) {
    const t = inRoot(e, 'ach');
    if (!t) return;
    const el = e.currentTarget;
    const act = t.getAttribute('data-act');
    const col = sys('collection');
    if (!col) return;
    if (act === 'ac-tab') {
      const st = el._ac || (el._ac = { cat: '', acc: 0 });
      st.cat = t.getAttribute('data-cat') || '';
      renderAch(el);
    } else if (act === 'ac-claim') {
      let r = null;
      try { r = col.claim(t.getAttribute('data-id')); } catch (err) { r = null; }
      if (!r) { toast('领取未成。', 'err'); return; }
      toast(r.msg, r.ok ? 'gold' : 'err');
      if (r.ok) popReward(r.reward);
      renderAch(el);
    } else if (act === 'ac-all') {
      let r = null;
      try { r = col.claimAll(); } catch (err) { r = null; }
      if (!r) { toast('领取未成。', 'err'); return; }
      toast(r.msg, r.ok ? 'gold' : 'err');
      if (r.ok) popReward(r.reward);
      renderAch(el);
    }
  }

  const achTab = {
    id: 'ach', name: '成就', icon: '🏆', order: 91, main: false,
    mount(el) {
      injectStyle();
      el._ac = { cat: '', acc: 0 };
      el.innerHTML = '<div class="tab-page xtc-page" data-xtc="ach"><div data-r="body"></div></div>';
      bindTab(this, el, onAchClick);
      renderAch(el);
      const self = this;
      this._off = XG.bus && XG.bus.on ? XG.bus.on('ach:done', function () { if (self._el) renderAch(self._el); }) : null;
    },
    update(dt) {
      const el = this._el;
      if (!el || !R(el, 'body')) return;
      const st = el._ac;
      st.acc = (st.acc || 0) + (dt || 1);
      if (st.acc >= 2) { st.acc = 0; renderAch(el); } // 2s 节流刷新进度条
    },
    unmount(el) {
      if (this._off) { try { this._off(); } catch (e) {} this._off = null; }
      unbindTab(this, el);
    },
  };

  /* ==================== 五、轮回 tab ==================== */
  function clearTimers(st) {
    if (!st || !st.timers) return;
    st.timers.forEach(function (id) { clearTimeout(id); });
    st.timers = [];
  }
  function pillSelCount(st) {
    let n = 0;
    for (const k in st.pillSel) n += st.pillSel[k] | 0;
    return n;
  }
  function realmNameOf(rl) {
    if (!rl) return '凡尘';
    const r = (XG.cfg && XG.cfg.REALMS && XG.cfg.REALMS[rl.realmIdx]) || null;
    return (r ? r.name : '?') + ' ' + (rl.layer || 1) + ' 层';
  }
  function rootText(root) {
    if (!root) return '—';
    const rs = (XG.data && XG.data.gongfa && XG.data.gongfa.roots) || [];
    function nm(id) {
      for (let i = 0; i < rs.length; i++) if (rs[i] && rs[i].id === id) return rs[i].name;
      return id || '?';
    }
    return nm(root.type) + ' ' + (root.grade || '?') + '品' + (root.mut ? ' · 变异·' + nm(root.mut) : '');
  }

  function renderReinHead(el) {
    const box = R(el, 'rnhead');
    if (!box) return;
    const rc = sys('reincarn');
    if (!rc) { box.innerHTML = lockHtml('轮回系统尚未载入。'); return; }
    let rp = { rp: 0, rpTotal: 0, nextRpGain: 0, reincarn: 0 }, idt = null;
    try { rp = rc.getRpInfo() || rp; idt = rc.getIdentity ? rc.getIdentity() : null; } catch (e) {}
    let html = '<div class="card"><h3 class="card-title">☯️ 轮回</h3>'
      + '<div class="xtc-kv"><span>轮回次数</span><b>' + fmtInt(rp.reincarn) + ' 世</b></div>'
      + '<div class="xtc-kv"><span>轮回点 rp</span><b>' + fmtInt(rp.rp) + '</b></div>'
      + '<div class="xtc-kv"><span>累计获得 rp</span><b>' + fmtInt(rp.rpTotal) + '</b></div>'
      + '<div class="xtc-kv"><span>此刻转世可得</span><b>+' + fmtInt(rp.nextRpGain) + ' rp</b></div>';
    if (idt) {
      html += '<div class="xtc-say">' + esc(idt.icon || '🎭') + ' <b>' + esc(idt.name) + '</b>（本世身份）<br>'
        + '<span class="muted">' + esc(idt.desc || '') + '</span>'
        + (idt.modsText ? '<br><span class="muted">' + esc(idt.modsText) + '</span>' : '') + '</div>';
    } else {
      html += '<div class="muted" style="margin-top:4px">尚未转世。渡过九重天劫，方开启轮回。</div>';
    }
    html += '</div>';
    box.innerHTML = html;
  }

  function renderReinTalents(el) {
    const box = R(el, 'rntalent');
    if (!box) return;
    const rc = sys('reincarn');
    if (!rc) return;
    let tree = [];
    try { tree = rc.getTalentTree() || []; } catch (e) { tree = []; }
    if (!tree.length) { box.innerHTML = ''; return; }
    const byId = {};
    tree.forEach(function (n) { byId[n.id] = n; });
    const brs = [['cult', '修炼'], ['battle', '战斗'], ['luck', '机缘']];
    let html = '<div class="card"><h3 class="card-title">🌳 轮回天赋</h3><div class="xtc-tcols">';
    brs.forEach(function (br) {
      html += '<div><div class="card-sub" style="text-align:center;margin-bottom:6px">【' + br[1] + '】</div>';
      tree.filter(function (n) { return n.br === br[0]; }).forEach(function (n) {
        const maxed = n.costNext == null;
        const dim = !n.needOk;
        html += '<div class="xtc-tnode' + (dim ? ' dim' : '') + (maxed ? ' max' : '') + '">'
          + '<div><b>' + esc(n.icon || '') + ' ' + esc(n.name) + '</b> <span class="muted">' + fmtInt(n.lv) + '/' + fmtInt(n.max) + '</span></div>'
          + (n.effText ? '<div class="muted" style="font-size:12px">' + esc(n.effText) + '</div>' : '')
          + (n.desc ? '<div class="muted" style="font-size:12px">' + esc(n.desc) + '</div>' : '');
        if (dim && n.need && n.need.length) {
          const nn = n.need.map(function (id) { return byId[id] ? byId[id].name : id; }).join('、');
          html += '<div class="muted" style="font-size:12px">前置：' + esc(nn) + ' 满级</div>';
        }
        if (maxed) html += '<div class="muted" style="font-size:12px">已臻圆满</div>';
        else {
          html += '<div class="row" style="margin-top:4px;justify-content:space-between"><span class="muted">消耗 ' + fmtInt(n.costNext) + ' rp</span>'
            + '<button class="btn btn-primary" data-act="rn-up" data-id="' + esc(n.id) + '"'
            + ((n.canUp && n.needOk) ? '' : ' disabled') + '>加点</button></div>';
        }
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div></div>';
    box.innerHTML = html;
  }

  function renderReinChallenge(el) {
    const box = R(el, 'rnchal');
    if (!box) return;
    const rc = sys('reincarn');
    if (!rc) return;
    const st = el._rn;
    let ci = null;
    try { ci = rc.getChallengeInfo(); } catch (e) { ci = null; }
    if (!ci || !ci.open) { box.innerHTML = '<div class="card xtc-lock">天劫未至，且修且行。</div>'; return; }
    let html = '<div class="card"><h3 class="card-title">⚡ 渡劫挑战</h3>'
      + '<div class="xtc-kv"><span>当前战力</span><b>' + fmt(ci.power) + '</b></div>'
      + '<div class="xtc-kv"><span>历史最佳</span><b>' + fmtInt(ci.bestWave || 0) + '/9 重</b></div>'
      + '<div class="xtc-kv"><span>本世失败</span><b>' + fmtInt(ci.fails || 0) + ' 次（保底 +' + (ci.pityPct || 0) + '%）</b></div>'
      + '<div style="margin:6px 0">';
    (ci.waves || []).forEach(function (w, i) {
      html += '<div class="xtc-wave pre"><span>第' + CN_NUM[i + 1] + '重 · ' + esc(w.name) + '</span>'
        + '<span>' + esc(w.reqFmt || fmt(w.req)) + ' · ' + Math.round((w.chance || 0) * 100) + '%</span></div>';
    });
    html += '</div>';
    // 祭丹选择
    let pills = [];
    try { pills = rc.previewPills() || []; } catch (e) { pills = []; }
    const maxP = ci.maxPills || 0;
    html += '<div class="card-sub">祭丹（每颗临时增益战力，至多 ' + maxP + ' 颗）</div>';
    if (!pills.length) html += '<div class="muted">袋中无可用战斗丹药。</div>';
    pills.forEach(function (p) {
      const q = st.pillSel[p.id] || 0;
      html += '<div class="xtc-kv" style="align-items:center"><span>' + esc(p.icon || '💊') + ' ' + esc(p.name) + (p.mut ? '★' : '')
        + ' <span class="muted">' + esc(PILL_TYPE[p.type] || p.type) + '+' + p.val + '% · 存 ' + fmtInt(p.count) + '</span></span>'
        + '<span class="xtc-qty"><button class="btn btn-ghost" data-act="rn-pill-minus" data-id="' + esc(p.id) + '">−</button>'
        + '<b>' + q + '</b>'
        + '<button class="btn btn-ghost" data-act="rn-pill-plus" data-id="' + esc(p.id) + '" data-max="' + p.count + '">＋</button></span></div>';
    });
    const selCount = pillSelCount(st);
    html += '<div class="muted" style="margin:4px 0">已选祭丹 ' + selCount + '/' + maxP + '</div>'
      + '<div class="row" style="margin-top:6px">'
      + '<button class="btn btn-danger" data-act="rn-go"' + (ci.canChallenge ? '' : ' disabled') + '>引动天劫</button>'
      + '<button class="btn btn-ghost" data-act="rn-keep">保留/重置预览</button></div>';
    if (!ci.canChallenge && ci.reason) html += '<div class="muted" style="margin-top:4px">' + esc(ci.reason) + '</div>';
    html += '</div>';
    box.innerHTML = html;
  }

  function renderReincarn(el) {
    const rc = sys('reincarn');
    let open = unlocked('tribulation');
    if (rc && rc.isOpen) { try { open = rc.isOpen(); } catch (e) {} }
    if (!open) {
      const h = R(el, 'rnhead');
      if (h) h.innerHTML = lockHtml('轮回：大乘 1 层方见渡劫之兆。');
      ['rntalent', 'rnchal', 'rnres'].forEach(function (r) { const b = R(el, r); if (b) b.innerHTML = ''; });
      return;
    }
    renderReinHead(el);
    renderReinTalents(el);
    renderReinChallenge(el);
  }

  // 逐波 reveal 动画后展示结果
  function playWaves(el, r) {
    const st = el._rn;
    clearTimers(st);
    const box = R(el, 'rnres');
    if (!box) { st.animating = false; return; }
    const waves = r.waves || [];
    let html = '<div class="card"><h3 class="card-title">天劫九重 · 逐波印证</h3>';
    waves.forEach(function (w, i) {
      html += '<div class="xtc-wave re" data-w="' + i + '"><span>第' + CN_NUM[i + 1] + '重 · ' + esc(w.name) + '</span>'
        + '<span data-wt="' + i + '">雷云积聚…</span></div>';
    });
    html += '<div data-r="rnsum"></div></div>';
    box.innerHTML = html;

    waves.forEach(function (w, i) {
      st.timers.push(setTimeout(function () {
        const row = box.querySelector('[data-w="' + i + '"]');
        const txt = box.querySelector('[data-wt="' + i + '"]');
        if (row) row.classList.add('show', w.pass ? 'pass' : 'fail');
        if (txt) {
          txt.textContent = w.pass
            ? '渡过（战力 ' + fmt(w.pow) + '）'
            : '溃败（天威 ' + Math.round((w.roll != null ? w.roll : 0) * 100) + '%）';
        }
        if (XG.ui && XG.ui.fx && XG.ui.fx.shake) { try { XG.ui.fx.shake(); } catch (e) {} }
      }, 550 * (i + 1)));
    });

    st.timers.push(setTimeout(function () {
      st.animating = false;
      const sum = box.querySelector('[data-r="rnsum"]');
      if (r.success) {
        if (sum) sum.innerHTML = '<div class="xtc-say">九雷尽渡，霞举飞升！</div>';
        if (XG.ui && XG.ui.fx && XG.ui.fx.breakthrough) { try { XG.ui.fx.breakthrough(); } catch (e) {} }
        toast('九雷尽渡，飞升转世！', 'gold');
        showReincarnResult(r);
      } else {
        const at = (r.failedAt != null ? r.failedAt : 0);
        if (sum) {
          sum.innerHTML = '<div class="xtc-say">第' + CN_NUM[Math.min(9, at + 1)] + '重天雷将你劈落凡尘……'
            + '跌落至 ' + esc(realmNameOf(r.dropTo)) + '，保底 +' + (r.pityPct || 0) + '%。</div>';
        }
        toast('渡劫失败，道基受损。', 'err');
      }
      st.pillSel = {};
      renderReincarn(el); // 成功则已转世：刷新头卡/天赋/挑战区
    }, 550 * waves.length + 700));
  }

  function showReincarnResult(r) {
    const rc = r.reincarn || {};
    const idt = rc.identity || {};
    let html = '<div style="text-align:center;font-size:38px">' + esc(idt.icon || '🌅') + '</div>'
      + '<div style="text-align:center;margin-bottom:6px"><b>第 ' + fmtInt(rc.count) + ' 世 · ' + esc(idt.name || '新生') + '</b></div>'
      + (idt.desc ? '<div class="xtc-say">' + esc(idt.desc) + '</div>' : '')
      + (rc.root ? '<div class="xtc-kv"><span>新生灵根</span><b>' + esc(rootText(rc.root)) + '</b></div>' : '')
      + '<div class="xtc-kv"><span>获得轮回点</span><b>+' + fmtInt(rc.rpGain) + ' rp</b></div>'
      + '<div class="xtc-kv"><span>继承灵玉</span><b>' + fmt(rc.keepLingYu) + '</b></div>';
    if (rc.petReleased) html += '<div class="muted">灵宠 ' + fmtInt(rc.petReleased) + ' 只已放归山林。</div>';
    if (rc.grants && rc.grants.length) {
      html += '<div style="margin-top:6px"><b>开局机缘</b>';
      rc.grants.forEach(function (g) { html += '<div class="xtc-news-li">' + esc(g) + '</div>'; });
      html += '</div>';
    }
    modal({ title: '飞升成功 · 转世轮回', html: html, buttons: [{ text: '踏入新生', cls: 'btn-primary', cb: function () { closeModal(); } }] });
  }

  function doChallenge(el) {
    const rc = sys('reincarn');
    if (!rc) return;
    const st = el._rn;
    let ci = null;
    try { ci = rc.getChallengeInfo(); } catch (e) { ci = null; }
    if (!ci || !ci.canChallenge) { toast((ci && ci.reason) || '机缘未到。', 'err'); return; }
    const pillIds = [];
    for (const id in st.pillSel) {
      const q = st.pillSel[id] | 0;
      for (let i = 0; i < q; i++) pillIds.push(id);
    }
    let r = null;
    try { r = rc.startChallenge(pillIds); } catch (e) { r = null; }
    if (!r) { toast('天劫感应失败。', 'err'); return; }
    if (!r.ok) { toast(r.msg || '无法引动天劫。', 'err'); return; }
    st.animating = true;
    playWaves(el, r);
  }

  function onReinClick(e) {
    const t = inRoot(e, 'reincarn');
    if (!t) return;
    const el = e.currentTarget;
    const act = t.getAttribute('data-act');
    const rc = sys('reincarn');
    if (!rc) return;
    const st = el._rn;
    if (st.animating && act !== 'rn-keep') return; // 动画期间锁定操作

    if (act === 'rn-up') {
      let r = null;
      try { r = rc.upgradeTalent(t.getAttribute('data-id')); } catch (err) { r = null; }
      if (!r) { toast('加点未成。', 'err'); return; }
      toast(r.msg, r.ok ? 'gold' : 'err');
      renderReincarn(el);
    } else if (act === 'rn-pill-plus' || act === 'rn-pill-minus') {
      const id = t.getAttribute('data-id');
      let maxP = 12;
      try { const ci = rc.getChallengeInfo(); if (ci && ci.maxPills) maxP = ci.maxPills; } catch (err) {}
      if (act === 'rn-pill-plus') {
        const ownMax = parseInt(t.getAttribute('data-max') || '0', 10) || 0;
        const q = st.pillSel[id] || 0;
        if (q >= ownMax) { toast('此丹存量不足。', 'err'); return; }
        if (pillSelCount(st) >= maxP) { toast('祭丹至多 ' + maxP + ' 颗。', 'err'); return; }
        st.pillSel[id] = q + 1;
      } else {
        const q = st.pillSel[id] || 0;
        if (q > 0) st.pillSel[id] = q - 1;
        if (!st.pillSel[id]) delete st.pillSel[id];
      }
      renderReinChallenge(el);
    } else if (act === 'rn-go') {
      confirmBox('引动天劫，九雷加身，成败在此一举。可要祭丹齐备？', function () { doChallenge(el); });
    } else if (act === 'rn-keep') {
      let k = null;
      try { k = rc.getKeepInfo(); } catch (err) { k = null; }
      if (!k) { toast('尚无法预览。', 'err'); return; }
      let html = '<div class="xtc-kv"><span>灵玉保留</span><b>' + (k.lingYuKeepPct || 0) + '%</b></div>'
        + '<div class="xtc-kv"><span>此刻转世可得 rp</span><b>+' + fmtInt(k.rpGain) + '</b></div>'
        + '<div class="xtc-kv"><span>境界累计 / 成就数</span><b>' + fmtInt(k.realmCount) + ' / ' + fmtInt(k.achCount) + '</b></div>'
        + '<div style="margin-top:6px"><b>转世可保留</b>';
      (k.keep || []).forEach(function (s) { html += '<div class="xtc-news-li">' + esc(s) + '</div>'; });
      html += '</div><div style="margin-top:6px"><b>将被重置</b>';
      (k.reset || []).forEach(function (s) { html += '<div class="xtc-news-li">' + esc(s) + '</div>'; });
      html += '</div>';
      modal({ title: '保留与重置', html: html, buttons: [{ text: '知晓了', cls: 'btn-primary', cb: function () { closeModal(); } }] });
    }
  }

  const reinTab = {
    id: 'reincarn', name: '轮回', icon: '☯️', order: 92, main: false, sysId: 'tribulation',
    mount(el) {
      injectStyle();
      el._rn = { pillSel: {}, animating: false, timers: [] };
      el.innerHTML = '<div class="tab-page xtc-page" data-xtc="reincarn">'
        + '<div data-r="rnhead"></div><div data-r="rntalent"></div><div data-r="rnchal"></div><div data-r="rnres"></div></div>';
      bindTab(this, el, onReinClick);
      renderReincarn(el);
    },
    update() {
      const el = this._el;
      if (!el || !el._rn) return;
      if (el._rn.animating) return; // 逐波动画期间不重绘
      if (R(el, 'rnhead')) renderReincarn(el);
    },
    unmount(el) {
      if (el && el._rn) { clearTimers(el._rn); el._rn.animating = false; }
      unbindTab(this, el);
    },
  };

  /* ==================== 六、设置 tab ==================== */
  const SYS_LABEL = {
    gongfa: '功法', adventure: '奇遇', pets: '灵宠', fellows: '道友', cave: '洞府',
    expedition: '历练派遣', alchemy: '炼丹', market: '坊市', forge: '炼器',
    dungeon_tower: '镇妖塔', pvp: '论剑', petBreed: '灵宠繁殖', gongfaCreate: '自创功法',
    dungeon_guard: '守关', dungeon_hunt: '限时寻宝', hiddenMaps: '隐藏区域',
    tribulation: '渡劫', reincarn: '轮回',
  };

  function unlockListHtml() {
    const u = (XG.cfg && XG.cfg.UNLOCKS) || {};
    let html = '';
    Object.keys(u).forEach(function (k) {
      const c = u[k] || {};
      let cond;
      if (c.days) cond = '创角 ' + c.days + ' 日';
      else {
        const r = XG.cfg && XG.cfg.REALMS && XG.cfg.REALMS[c.realmIdx];
        cond = (r ? r.name : '?') + ' ' + (c.layer || 1) + ' 层';
      }
      const ok = unlocked(k);
      html += '<div class="xtc-kv"><span>' + (ok ? '🟢' : '⚪') + ' ' + esc(SYS_LABEL[k] || k) + '</span>'
        + '<span class="muted">' + esc(cond) + (ok ? '' : ' · 未解锁') + '</span></div>';
    });
    return html;
  }

  function fillExport(el) {
    const ta = el.querySelector('[data-r="stexp"]');
    if (!ta) return;
    let s = '';
    try { s = XG.save && XG.save.export ? XG.save.export() : ''; } catch (e) { s = ''; }
    ta.value = s || '';
  }

  function copyText(text, ta) {
    function done(ok) { toast(ok ? '已复制到剪贴板。' : '复制失败，请手动长按选择复制。', ok ? undefined : 'err'); }
    function legacy() {
      try {
        if (ta) { ta.focus(); ta.select(); }
        document.execCommand('copy');
        done(true);
      } catch (e) { done(false); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, legacy);
    } else legacy();
  }

  function renderSettings(el) {
    const body = R(el, 'body');
    if (!body) return;
    const p = (XG.state && XG.state.player) || {};
    const st = (XG.state && XG.state.settings) || {};
    let html = '<div class="card"><h3 class="card-title">✒️ 道号</h3>'
      + '<div class="row"><input class="xtc-io" style="flex:1" data-r="stname" maxlength="12" value="' + esc(p.name || '') + '" placeholder="请输入新的道号">'
      + '<button class="btn btn-primary" data-act="st-rename">改名</button></div>'
      + '<div class="muted" style="margin-top:4px">传闻中韩立、叶凡、王林、石昊、萧炎等名讳，或藏一线天机……</div></div>';

    html += '<div class="card"><h3 class="card-title">💾 存档</h3>'
      + '<div class="muted">导出（可抄写转移至他处）：</div>'
      + '<textarea class="xtc-io" rows="4" readonly data-r="stexp"></textarea>'
      + '<div class="row" style="margin:6px 0"><button class="btn btn-primary" data-act="st-export">生成/刷新导出</button>'
      + '<button class="btn btn-ghost" data-act="st-copy">复制</button></div>'
      + '<div class="muted">导入（粘贴存档串，将覆盖当前进度）：</div>'
      + '<textarea class="xtc-io" rows="3" data-r="stimp" placeholder="在此粘贴 base64 存档串"></textarea>'
      + '<div class="row" style="margin-top:6px"><button class="btn btn-primary" data-act="st-import">导入存档</button></div></div>';

    html += '<div class="card"><h3 class="card-title">📜 传闻</h3>'
      + '<label class="row" style="cursor:pointer"><input type="checkbox" data-act="st-news"' + (st.newsCollapsed ? ' checked' : '') + '> 折叠顶部传闻滚动条</label></div>';

    html += '<div class="card"><h3 class="card-title">ℹ️ 关于</h3>'
      + '<div class="xtc-kv"><span>版本</span><b>放置修仙 v1（存档 ver ' + ((XG.state && XG.state.ver) || 1) + '）</b></div>'
      + '<div class="card-sub" style="margin:6px 0 4px">系统解锁进度一览</div>'
      + '<div data-r="stunlock">' + unlockListHtml() + '</div></div>';

    html += '<div class="card" style="border-color:var(--danger)"><h3 class="card-title" style="color:var(--danger)">⚠️ 危险操作</h3>'
      + '<button class="btn btn-danger" data-act="st-reset">重置存档（重入轮回）</button>'
      + '<div class="muted" style="margin-top:4px">将抹去全部修为、器物与机缘，不可挽回。</div></div>';

    body.innerHTML = html;
    fillExport(el);
  }

  function onSettingsClick(e) {
    const t = inRoot(e, 'settings');
    if (!t) return;
    const el = e.currentTarget;
    const act = t.getAttribute('data-act');

    if (act === 'st-rename') {
      const inp = el.querySelector('[data-r="stname"]');
      const v = ((inp && inp.value) || '').trim();
      if (!v) { toast('道号不可为空。', 'err'); return; }
      if (!XG.state || !XG.state.player) return;
      XG.state.player.name = v;
      try { XG.bus.emit('save:dirty'); XG.bus.emit('res:changed'); } catch (err) {}
      if (XG.ui && XG.ui.refreshTop) { try { XG.ui.refreshTop(); } catch (err) {} }
      const eggs = (XG.data && XG.data.names && XG.data.names.egg) || [];
      if (eggs.indexOf(v) >= 0) toast('此名讳似曾相识……似有玄机！', 'gold');
      else toast('已改道号为「' + v + '」。');
      if (inp) inp.value = v;
    } else if (act === 'st-export') {
      fillExport(el);
      toast('存档串已生成。');
    } else if (act === 'st-copy') {
      const ta = el.querySelector('[data-r="stexp"]');
      const v = (ta && ta.value) || '';
      if (!v) { toast('请先生成导出串。', 'err'); return; }
      copyText(v, ta);
    } else if (act === 'st-import') {
      const ta = el.querySelector('[data-r="stimp"]');
      const v = ((ta && ta.value) || '').trim();
      if (!v) { toast('请先粘贴存档串。', 'err'); return; }
      confirmBox('导入将覆盖当前全部进度，确定导入？', function () {
        let r = null;
        try { r = XG.save.import(v); } catch (err) { r = { ok: false, err: '导入异常' }; }
        if (r && r.ok) {
          toast('导入成功，正在重开……', 'gold');
          setTimeout(function () { try { location.reload(); } catch (err) {} }, 900);
        } else {
          toast((r && r.err) || '导入失败。', 'err');
        }
      });
    } else if (act === 'st-news') {
      const on = !!t.checked;
      XG.state.settings = XG.state.settings || {};
      XG.state.settings.newsCollapsed = on;
      try { XG.bus.emit('save:dirty'); } catch (err) {}
      try {
        const tk = document.getElementById('news-ticker');
        if (tk) tk.classList.toggle('collapsed', on);
      } catch (err) {}
      toast(on ? '传闻条已折叠。' : '传闻条已展开。');
    } else if (act === 'st-reset') {
      confirmBox('确定要重置存档？全部修为与机缘将烟消云散。', function () {
        confirmBox('此操作不可挽回！真要重入轮回？', function () {
          try { XG.save.reset(); } catch (err) {}
          toast('存档已重置，正在重开……');
          setTimeout(function () { try { location.reload(); } catch (err) {} }, 900);
        });
      });
    }
  }

  const setTab = {
    id: 'settings', name: '设置', icon: '⚙️', order: 99, main: false,
    mount(el) {
      injectStyle();
      el.innerHTML = '<div class="tab-page xtc-page" data-xtc="settings"><div data-r="body"></div></div>';
      bindTab(this, el, onSettingsClick);
      renderSettings(el);
    },
    update() {
      const el = this._el;
      if (!el) return;
      // 输入中不重绘任何区域（守则 3）
      const ae = document.activeElement;
      if (ae && el.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      const box = el.querySelector('[data-r="stunlock"]');
      if (box) box.innerHTML = unlockListHtml(); // 仅刷新解锁一览
    },
    unmount(el) { unbindTab(this, el); },
  };

  /* ==================== 注册 ==================== */
  reg(fellowTab);
  reg(marketTab);
  reg(codexTab);
  reg(achTab);
  reg(reinTab);
  reg(setTab);
})();
