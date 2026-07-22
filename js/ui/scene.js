/* scene.js：修炼主页水墨场景（契约 §12 画风：青#3a7d6b / 墨#2b2b2b / 金#c9a063，楷体）
 * 自包含模块：IIFE + strict，不依赖构建，不修改任何其他文件。
 * 挂载机制：每秒轮询 #scene-root（仅主页存在），出现则挂载、消失则卸载清理（退订事件/清定时器/撤样式）。
 * 实现：内联 SVG 静景（远山/淡日/石台蒲团/打坐小人/光核/光环/灵气粒子）+ 注入式 <style id="xgs-style">；
 *       动画全部纯 CSS keyframes 驱动，JS 只切状态 class 与 CSS 变量（transform/opacity，移动优先性能友好）。
 * 状态机（容器 class 切换）：
 *   ① 打坐 xgs-st-dazuo（默认，呼吸起伏 3s）
 *   ② 闭关 xgs-st-biguan（state.player.cultivateMode=='biguan'：深青茧形光罩包裹，粒子变慢变少）
 *   ③ 顿悟 xgs-dunwu（bus 'dunwu:start'/'dunwu:end' 与 cultivation.getDunwuInfo 双通道：金光爆闪、粒子加速螺旋、光核变金）
 *   ④ 突破 xgs-break（bus 'fx:breakthrough'：小人升空+光环冲击扩散一次，2.5s 后复位）
 *   ⑤ 吐纳 xgs-tuona（bus 'tuona' {gain} 或点击小人手动吐纳：胸口亮起+粒子迸出+飘「灵气+X」小字 2s）
 * 境界十色：按 state.player.realmIdx 改 --xgs-ring/--xgs-core/--xgs-pc；粒子数随小境界 layer 微增（8~12）。
 * 灵宠环绕：XG.sys.pets.teamList()（防御性）出战 emoji ≤3 只坐石台边缘，错相位上下浮动。
 * 昼夜氛围：本地 6~18 点暖白，其余靛蓝夜色+星光，class 切换，过渡 2s。
 * 奇遇气泡：每 2s 查 XG.sys.adventure.getPending()（防御性），有待决则头顶金色「！」弹跳，点击 toast。
 * 手动吐纳：点击小人防御性调 XG.sys.cultivation.tuona()，ok 触发吐纳动画；接口不存在/冷却失败静默小脉动。
 * 首次提示「点击吐纳」：localStorage 键 xgs_hint，仅显示一次。
 */
(function () {
  'use strict';
  const XG = (window.XG = window.XG || {});

  // ============================ 常量 ============================
  // 境界十色（炼气青白→筑基青→金丹金→元婴橙→化神赤→炼虚紫→合体靛→大乘银→渡劫雷紫→飞升虹金）
  const REALM_COLORS = [
    { ring: '#a9cec0', core: '#e2f2eb', pc: '#cfe8dc' }, // 0 炼气 青白
    { ring: '#3a7d6b', core: '#8fd0bc', pc: '#a8dcc9' }, // 1 筑基 青
    { ring: '#c9a063', core: '#f0d090', pc: '#ecd3a0' }, // 2 金丹 金
    { ring: '#d9813c', core: '#f5b46a', pc: '#f2c493' }, // 3 元婴 橙
    { ring: '#b0413a', core: '#e08a7a', pc: '#e5a297' }, // 4 化神 赤
    { ring: '#8e6cc9', core: '#c4aef0', pc: '#cbb8ee' }, // 5 炼虚 紫
    { ring: '#46589e', core: '#93a5e0', pc: '#aab8e8' }, // 6 合体 靛
    { ring: '#9fb2ba', core: '#e6eef1', pc: '#d5e2e6' }, // 7 大乘 银
    { ring: '#7a3fd1', core: '#c07df2', pc: '#c89bf0' }, // 8 渡劫 雷紫
    { ring: '#e0b84f', core: '#ffe89a', pc: '#f5d98a' }, // 9 飞升 虹金（另加 hue 旋彩）
  ];
  const PET_POS = [[112, 181], [248, 181], [148, 186]]; // 石台边缘三宠位（错相位浮动）
  const HINT_KEY = 'xgs_hint'; // localStorage：首次「点击吐纳」提示标记

  // ============================ 注入样式（xgs- 前缀） ============================
  const CSS = `
  /* ===== 容器（移动优先，viewBox 360x220 自适应缩放） ===== */
  .xgs-wrap {
    position: relative; width: 100%; max-width: 560px; margin: 0 auto 10px;
    aspect-ratio: 360/220; overflow: hidden; user-select: none;
    border: 1px solid var(--gold, #c9a063); border-radius: 10px;
    background: linear-gradient(180deg, #f8f3e4 0%, #f1e8d2 62%, #e9ddc0 100%);
    box-shadow: 0 2px 8px rgba(43, 43, 43, .12);
    --xgs-ring: #a9cec0; --xgs-core: #e2f2eb; --xgs-pc: #cfe8dc;
  }
  .xgs-svg { display: block; width: 100%; height: 100%; }
  /* 不拦截点击的装饰层 */
  .xgs-parts, .xgs-burst, .xgs-pets, .xgs-flash, .xgs-shock, .xgs-cocoon, .xgs-ring { pointer-events: none; }
  .xgs-hit { cursor: pointer; }

  /* ===== 小人剪影（墨色填充）与呼吸 ===== */
  .xgs-ink { fill: #2b2b2b; }
  .xgs-ink2 { fill: #3d3a35; }
  .xgs-ink-stroke { stroke: #2b2b2b; stroke-width: 1.4; stroke-linecap: round; fill: none; }
  .xgs-fold { stroke: #4c4842; stroke-width: 1; fill: none; opacity: .7; }
  .xgs-person {
    transform-box: fill-box; transform-origin: 50% 100%;
    animation: xgsBreath 3s ease-in-out infinite; /* ① 打坐呼吸 3s */
  }
  @keyframes xgsBreath {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-1.6px) scale(1.018); }
  }
  /* ④ 突破：小人短暂升空（2.5s 一次，随后 class 移除复位） */
  .xgs-break .xgs-lift { animation: xgsRise 2.5s ease-in-out; }
  @keyframes xgsRise {
    0% { transform: translateY(0); }
    28% { transform: translateY(-26px); }
    62% { transform: translateY(-26px); }
    100% { transform: translateY(0); }
  }
  /* ④ 突破：光环冲击扩散一次 */
  .xgs-shock {
    fill: none; stroke: #e9c46a; stroke-width: 2.4; opacity: 0;
    transform-box: fill-box; transform-origin: 50% 50%;
  }
  .xgs-break .xgs-shock { animation: xgsShock 2.5s ease-out; }
  @keyframes xgsShock {
    0% { transform: scale(.25); opacity: .9; }
    100% { transform: scale(3.4); opacity: 0; }
  }

  /* ===== 光环（同心虚线，呼吸脉冲 + 阵纹缓转） ===== */
  .xgs-ring {
    fill: none; stroke: var(--xgs-ring); stroke-width: 1.4; stroke-dasharray: 7 6; opacity: .5;
    transform-box: fill-box; transform-origin: 50% 50%;
    animation: xgsRingPulse 3.6s ease-in-out infinite, xgsDash 26s linear infinite;
  }
  .xgs-ring2 { animation-duration: 4.6s, 34s; stroke-width: 1.2; opacity: .42; }
  .xgs-ring3 { animation-duration: 5.8s, 44s; stroke-width: 1; opacity: .34; animation-direction: normal, reverse; }
  @keyframes xgsRingPulse {
    0%, 100% { opacity: .3; transform: scale(1); }
    50% { opacity: .8; transform: scale(1.035); }
  }
  @keyframes xgsDash { to { stroke-dashoffset: -104; } } /* 13 的整数倍，无缝衔接 */

  /* ===== 灵气光核（径向渐变，呼吸脉动） ===== */
  .xgs-core {
    transform-box: fill-box; transform-origin: 50% 50%;
    animation: xgsCorePulse 3s ease-in-out infinite;
  }
  @keyframes xgsCorePulse {
    0%, 100% { transform: scale(1); opacity: .85; }
    50% { transform: scale(1.22); opacity: 1; }
  }
  .xgs-stop-core0 { stop-color: var(--xgs-core); stop-opacity: .98; }
  .xgs-stop-core1 { stop-color: var(--xgs-core); stop-opacity: .5; }
  .xgs-stop-core2 { stop-color: var(--xgs-core); stop-opacity: 0; }
  /* 点击吐纳未开放/冷却时的静默小脉动（自然过渡，不报错） */
  .xgs-tap .xgs-core { animation: xgsTap .65s ease-out; }
  @keyframes xgsTap {
    0% { transform: scale(1); }
    40% { transform: scale(1.32); }
    100% { transform: scale(1); }
  }

  /* ===== 上浮灵气粒子（随机大小/时长/左右漂移，无限循环） ===== */
  .xgs-p { fill: var(--xgs-pc); opacity: 0; animation: xgsFloat var(--dur, 8s) linear infinite; }
  @keyframes xgsFloat {
    0% { transform: translate(0, 0); opacity: 0; }
    12% { opacity: .95; }
    80% { opacity: .55; }
    100% { transform: translate(var(--dx, 0px), -118px); opacity: 0; }
  }
  /* 顿悟螺旋轨迹 */
  @keyframes xgsFloatS {
    0% { transform: translate(0, 0); opacity: 0; }
    12% { opacity: 1; }
    32% { transform: translate(calc(var(--dx, 0px) * -0.7), -38px); }
    56% { transform: translate(var(--dx, 0px), -70px); }
    78% { transform: translate(calc(var(--dx, 0px) * -0.55), -98px); }
    100% { transform: translate(var(--dx, 0px), -128px); opacity: 0; }
  }

  /* ===== ② 闭关：深青茧形光罩 + 粒子变慢变少 ===== */
  .xgs-cocoon {
    opacity: 0; transition: opacity .9s ease;
    transform-box: fill-box; transform-origin: 50% 100%;
  }
  .xgs-st-biguan .xgs-cocoon { opacity: .92; animation: xgsCocoon 4.5s ease-in-out infinite; }
  @keyframes xgsCocoon {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.03); }
  }
  .xgs-st-biguan .xgs-p { animation-duration: calc(var(--dur, 8s) * 1.9); }
  .xgs-st-biguan .xgs-p:nth-child(n+7) { display: none; }

  /* ===== ③ 顿悟：金光爆闪 + 粒子加速螺旋 + 光核变金 ===== */
  .xgs-flash { opacity: 0; }
  .xgs-dunwu .xgs-flash { animation: xgsFlash .95s ease-in-out infinite; }
  @keyframes xgsFlash {
    0%, 100% { opacity: .16; }
    50% { opacity: .72; }
  }
  .xgs-dunwu .xgs-p { animation-name: xgsFloatS; animation-duration: calc(var(--dur, 8s) * .42); fill: #f2d189; }
  .xgs-dunwu .xgs-ring { stroke: #e6b84f; }
  .xgs-dunwu .xgs-stop-core0 { stop-color: #ffdf8e; }
  .xgs-dunwu .xgs-stop-core1 { stop-color: #f5c95e; }
  .xgs-dunwu .xgs-stop-core2 { stop-color: #eec25a; }

  /* ===== ⑤ 吐纳：胸口亮起 + 粒子迸出 + 浮字 ===== */
  .xgs-chest { fill: #ffd873; opacity: 0; }
  .xgs-tuona .xgs-chest { animation: xgsChest 1.25s ease-out; }
  @keyframes xgsChest {
    0% { opacity: 0; }
    18% { opacity: .95; }
    100% { opacity: 0; }
  }
  .xgs-b { fill: #f0d492; opacity: 0; animation: xgsBurst 1.15s ease-out forwards; }
  @keyframes xgsBurst {
    0% { transform: translate(0, 0) scale(.5); opacity: 0; }
    14% { opacity: 1; }
    100% { transform: translate(var(--bx, 0px), var(--by, -40px)) scale(1.05); opacity: 0; }
  }
  .xgs-float {
    position: absolute; top: 52%; left: 50%; transform: translate(-50%, 0);
    font-size: 13px; font-weight: bold; color: #a8834a; white-space: nowrap;
    text-shadow: 0 1px 2px rgba(255, 255, 255, .7); pointer-events: none; z-index: 4;
    animation: xgsFloatText 2s ease-out forwards;
  }
  @keyframes xgsFloatText {
    0% { transform: translate(-50%, 0); opacity: 0; }
    15% { opacity: 1; }
    100% { transform: translate(-50%, -48px); opacity: 0; }
  }

  /* ===== 灵宠（石台边缘，错相位轻浮动） ===== */
  .xgs-pet {
    font-size: 15px;
    transform-box: fill-box; transform-origin: 50% 50%;
    animation: xgsBob 2.6s ease-in-out infinite;
  }
  @keyframes xgsBob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3.5px); }
  }

  /* ===== 昼夜氛围（暖白 / 靛蓝夜色 + 星光，过渡 2s） ===== */
  .xgs-sun {
    transform-box: fill-box; transform-origin: 50% 50%;
    animation: xgsSun 7s ease-in-out infinite; transition: opacity 2s;
  }
  @keyframes xgsSun {
    0%, 100% { opacity: .85; }
    50% { opacity: 1; }
  }
  .xgs-night .xgs-sun { opacity: .38; animation: none; }
  .xgs-stars circle { fill: #e8ecff; opacity: 0; transition: opacity 2s; }
  .xgs-night .xgs-stars circle { opacity: .85; animation: xgsTwinkle 2.8s ease-in-out infinite; }
  .xgs-night .xgs-stars circle:nth-child(2) { animation-delay: .5s; }
  .xgs-night .xgs-stars circle:nth-child(3) { animation-delay: 1.1s; }
  .xgs-night .xgs-stars circle:nth-child(4) { animation-delay: .3s; }
  .xgs-night .xgs-stars circle:nth-child(5) { animation-delay: 1.6s; }
  .xgs-night .xgs-stars circle:nth-child(6) { animation-delay: .8s; }
  .xgs-night .xgs-stars circle:nth-child(7) { animation-delay: 1.9s; }
  .xgs-night .xgs-stars circle:nth-child(8) { animation-delay: .2s; }
  .xgs-night .xgs-stars circle:nth-child(9) { animation-delay: 1.4s; }
  @keyframes xgsTwinkle {
    0%, 100% { opacity: .25; }
    50% { opacity: .95; }
  }
  .xgs-tint {
    position: absolute; inset: 0; pointer-events: none; z-index: 2;
    background: #fff3d6; opacity: .05;
    transition: background-color 2s ease, opacity 2s ease;
  }
  .xgs-night .xgs-tint { background: #16203a; opacity: .36; }

  /* ===== 飞升虹金：光环/光核 hue 旋彩 ===== */
  .xgs-rainbow .xgs-rings, .xgs-rainbow .xgs-core-wrap { animation: xgsHue 6s linear infinite; }
  @keyframes xgsHue {
    from { filter: hue-rotate(0deg); }
    to { filter: hue-rotate(360deg); }
  }

  /* ===== ⑥ 奇遇「！」气泡（金色弹跳） ===== */
  .xgs-bubble {
    position: absolute; left: calc(50% - 13px); top: 31%; width: 26px; height: 26px;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: bold; color: #5a4318;
    background: radial-gradient(circle at 35% 30%, #f3d897, #c9a063);
    border: 1px solid #a8834a; box-shadow: 0 0 10px rgba(201, 160, 99, .65);
    cursor: pointer; z-index: 3;
    opacity: 0; pointer-events: none; transform: scale(.5);
    transition: opacity .3s ease, transform .3s ease;
  }
  .xgs-bubble.xgs-on { opacity: 1; pointer-events: auto; transform: scale(1); animation: xgsBubble .75s ease-in-out infinite; }
  @keyframes xgsBubble {
    0%, 100% { transform: scale(1) translateY(0); }
    40% { transform: scale(1.06) translateY(-6px); }
  }

  /* ===== 首次「点击吐纳」提示（仅一次） ===== */
  .xgs-hint {
    position: absolute; left: 50%; bottom: 5%; transform: translateX(-50%);
    padding: 2px 10px; border-radius: 12px; white-space: nowrap;
    background: rgba(43, 43, 43, .72); color: #f3d897; font-size: 11px;
    pointer-events: none; z-index: 3; opacity: 0; transition: opacity .6s ease;
  }
  .xgs-hint.xgs-on { opacity: .95; animation: xgsHint 1.6s ease-in-out infinite; }
  @keyframes xgsHint {
    0%, 100% { opacity: .95; }
    50% { opacity: .55; }
  }

  /* ===== 减弱动态偏好：全部动画静止 ===== */
  @media (prefers-reduced-motion: reduce) {
    .xgs-wrap * { animation: none !important; transition: none !important; }
  }
  `;

  // ============================ 内联 SVG 场景（viewBox 360x220） ============================
  const SVG_HTML = '' +
    '<svg class="xgs-svg" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
    '<defs>' +
    '<radialGradient id="xgs-gCore" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" class="xgs-stop-core0"/><stop offset="55%" class="xgs-stop-core1"/><stop offset="100%" class="xgs-stop-core2"/>' +
    '</radialGradient>' +
    '<radialGradient id="xgs-gSun" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#f3dfa4" stop-opacity=".95"/>' +
    '<stop offset="60%" stop-color="#efd9a0" stop-opacity=".45"/>' +
    '<stop offset="100%" stop-color="#eed9a8" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<radialGradient id="xgs-gFlash" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#ffe9a8" stop-opacity=".95"/>' +
    '<stop offset="55%" stop-color="#f5cf7a" stop-opacity=".5"/>' +
    '<stop offset="100%" stop-color="#f0c96e" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<radialGradient id="xgs-gCocoon" cx="50%" cy="42%" r="62%">' +
    '<stop offset="0%" stop-color="#2e6254" stop-opacity=".06"/>' +
    '<stop offset="62%" stop-color="#2e6254" stop-opacity=".42"/>' +
    '<stop offset="100%" stop-color="#244f40" stop-opacity=".82"/>' +
    '</radialGradient>' +
    '<linearGradient id="xgs-gMFar" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#3a7d6b" stop-opacity=".3"/>' +
    '<stop offset="100%" stop-color="#3a7d6b" stop-opacity=".05"/>' +
    '</linearGradient>' +
    '<linearGradient id="xgs-gMMid" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#3a7d6b" stop-opacity=".42"/>' +
    '<stop offset="100%" stop-color="#3a7d6b" stop-opacity=".1"/>' +
    '</linearGradient>' +
    '<linearGradient id="xgs-gMNear" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#2e6254" stop-opacity=".55"/>' +
    '<stop offset="100%" stop-color="#2e6254" stop-opacity=".16"/>' +
    '</linearGradient>' +
    '<linearGradient id="xgs-gPlat" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#5a564e"/>' +
    '<stop offset="100%" stop-color="#2b2b2b"/>' +
    '</linearGradient>' +
    '</defs>' +
    // 淡日
    '<circle class="xgs-sun" cx="292" cy="44" r="17" fill="url(#xgs-gSun)"/>' +
    // 星光（夜间可见）
    '<g class="xgs-stars">' +
    '<circle cx="36" cy="26" r="1.3"/><circle cx="74" cy="44" r="1.6"/><circle cx="118" cy="20" r="1.2"/>' +
    '<circle cx="160" cy="34" r="1.5"/><circle cx="210" cy="18" r="1.2"/><circle cx="248" cy="40" r="1.4"/>' +
    '<circle cx="300" cy="24" r="1.3"/><circle cx="330" cy="50" r="1.5"/><circle cx="140" cy="52" r="1.1"/>' +
    '</g>' +
    // 水墨远山三层（青色渐淡）
    '<path d="M0 152 L0 116 C28 100 52 76 84 90 C108 101 126 68 156 80 C184 91 204 64 234 78 C260 90 284 72 312 86 C332 97 348 94 360 88 L360 152 Z" fill="url(#xgs-gMFar)"/>' +
    '<path d="M0 166 L0 136 C24 126 46 104 76 116 C102 126 120 94 150 106 C176 117 194 90 224 104 C250 116 274 98 304 112 C326 122 344 118 360 114 L360 166 Z" fill="url(#xgs-gMMid)"/>' +
    '<path d="M0 184 L0 158 C34 146 58 128 90 140 C118 150 138 122 170 134 C198 145 220 120 252 134 C280 146 304 130 330 144 C344 151 353 149 360 146 L360 184 Z" fill="url(#xgs-gMNear)"/>' +
    // 地面淡墨晕染
    '<ellipse cx="180" cy="196" rx="130" ry="13" fill="#2b2b2b" opacity=".07"/>' +
    // 石台
    '<path d="M130 172 L230 172 C237 172 241 176 240 181 L238 191 C237 196 232 198 225 198 L135 198 C128 198 123 196 122 191 L120 181 C119 176 123 172 130 172 Z" fill="url(#xgs-gPlat)"/>' +
    // 蒲团
    '<ellipse cx="180" cy="172" rx="35" ry="7.5" fill="#2e6254"/>' +
    '<ellipse cx="180" cy="171" rx="26" ry="5.5" fill="#3a7d6b" opacity=".8"/>' +
    // 三道虚线光环（聚灵阵）
    '<g class="xgs-rings">' +
    '<ellipse class="xgs-ring xgs-ring1" cx="180" cy="174" rx="42" ry="12"/>' +
    '<ellipse class="xgs-ring xgs-ring2" cx="180" cy="174" rx="58" ry="16.5"/>' +
    '<ellipse class="xgs-ring xgs-ring3" cx="180" cy="174" rx="74" ry="21"/>' +
    '</g>' +
    // 身后淡墨圆光
    '<circle cx="180" cy="127" r="24" fill="none" stroke="#2b2b2b" stroke-width="1" opacity=".12"/>' +
    // 盘腿打坐小人（lift=突破升空层，person=呼吸层）
    '<g class="xgs-lift"><g class="xgs-person">' +
    '<ellipse cx="180" cy="98" rx="4" ry="5" class="xgs-ink"/>' + // 发髻
    '<path d="M173 99 L187 97.5" class="xgs-ink-stroke"/>' + // 簪子
    '<circle cx="180" cy="111" r="9.5" class="xgs-ink"/>' + // 头
    '<path d="M176 118 L184 118 L184 126 L176 126 Z" class="xgs-ink"/>' + // 颈
    '<path d="M180 122 C171 122 165 127 161 133 C155 142 149 153 146 163 C144 170 148 176 156 178 C164 180 172 181 180 181 C188 181 196 180 204 178 C212 176 216 170 214 163 C211 153 205 142 199 133 C195 127 189 122 180 122 Z" class="xgs-ink"/>' + // 道袍宽袖盘坐
    '<path d="M159 141 C163 151 167 160 173 168" class="xgs-fold"/>' + // 左袖纹
    '<path d="M201 141 C197 151 193 160 187 168" class="xgs-fold"/>' + // 右袖纹
    '<ellipse cx="180" cy="166" rx="8" ry="4.2" class="xgs-ink2"/>' + // 结印双手
    '<circle class="xgs-chest" cx="180" cy="148" r="6"/>' + // 胸口灵光（吐纳）
    '</g></g>' +
    // 身前灵气光核
    '<g class="xgs-core-wrap"><circle class="xgs-core" cx="180" cy="150" r="11" fill="url(#xgs-gCore)"/></g>' +
    // 闭关茧形光罩
    '<ellipse class="xgs-cocoon" cx="180" cy="138" rx="48" ry="54" fill="url(#xgs-gCocoon)"/>' +
    // 顿悟金光爆闪
    '<circle class="xgs-flash" cx="180" cy="148" r="66" fill="url(#xgs-gFlash)"/>' +
    // 突破冲击环
    '<ellipse class="xgs-shock" cx="180" cy="174" rx="42" ry="12"/>' +
    // 点击热区（手动吐纳）
    '<circle class="xgs-hit" id="xgs-hit" cx="180" cy="142" r="48" fill="#ffffff" opacity="0"/>' +
    // 灵气粒子 / 迸出粒子 / 灵宠（JS 动态填充）
    '<g class="xgs-parts" id="xgs-parts"></g>' +
    '<g class="xgs-burst" id="xgs-burst"></g>' +
    '<g class="xgs-pets" id="xgs-pets"></g>' +
    '</svg>';

  // ============================ 模块内部状态 ============================
  let mounted = false;      // 是否已挂载
  let rootEl = null;        // 当前挂载的 #scene-root
  let wrapEl = null;        // 场景根 .xgs-wrap（状态 class 挂这里）
  let partsG = null, petsG = null, burstG = null, bubbleEl = null, hintEl = null;
  let busOffs = [];         // bus 退订函数列表
  let breakT = 0, tuonaT = 0, tapT = 0; // 一次性动画复位定时器
  let dunwuFlag = false;    // bus 通道顿悟标记（与 getDunwuInfo 双通道取或）
  let curRealm = -1, curLayer = -1;     // 已应用的境界/层数（变更才重绘）
  let petSig = '';          // 灵宠签名（防每秒重绘）
  let advFlip = false;      // 奇遇 2s 轮询节拍
  let advOn = false;        // 奇遇气泡当前状态

  // ============================ 小工具 ============================
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmt(n) {
    try { return (XG.util && XG.util.fmt) ? XG.util.fmt(n) : String(n); }
    catch (e) { return String(n); }
  }
  function injectStyle() {
    if ($('xgs-style')) return;
    const el = document.createElement('style');
    el.id = 'xgs-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }
  function removeStyle() {
    const el = $('xgs-style');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ============================ 挂载 / 卸载 ============================
  function mount(root) {
    rootEl = root;
    injectStyle();
    root.innerHTML =
      '<div class="xgs-wrap xgs-day xgs-st-dazuo">' + SVG_HTML +
      '<div class="xgs-tint"></div>' +
      '<div class="xgs-bubble" id="xgs-bubble">！</div>' +
      '<div class="xgs-hint" id="xgs-hint">点击小人 · 吐纳灵气</div>' +
      '</div>';
    wrapEl = root.firstChild;
    partsG = $('xgs-parts'); burstG = $('xgs-burst'); petsG = $('xgs-pets');
    bubbleEl = $('xgs-bubble'); hintEl = $('xgs-hint');
    // 状态复位
    curRealm = -1; curLayer = -1; petSig = ''; advOn = false; dunwuFlag = false;
    // 交互绑定
    const hit = $('xgs-hit');
    if (hit) hit.addEventListener('click', onPersonClick);
    if (bubbleEl) bubbleEl.addEventListener('click', onBubbleClick);
    // 总线订阅（卸载时全部退订）
    if (XG.bus && typeof XG.bus.on === 'function') {
      busOffs.push(XG.bus.on('dunwu:start', function () { setDunwu(true); }));
      busOffs.push(XG.bus.on('dunwu:end', function () { setDunwu(false); }));
      busOffs.push(XG.bus.on('fx:breakthrough', function () { playBreak(); }));
      busOffs.push(XG.bus.on('tuona', function (p) {
        playTuona(p && typeof p.gain === 'number' ? p.gain : 0);
      }));
    }
    // 首次「点击吐纳」提示（localStorage 仅一次；读不了就当已见过，不打扰）
    let seen = true;
    try { seen = window.localStorage.getItem(HINT_KEY) === '1'; } catch (e) { seen = true; }
    if (!seen && hintEl) hintEl.classList.add('xgs-on');
    mounted = true;
    sync(true);
  }
  function unmount() {
    mounted = false;
    for (const off of busOffs) { try { if (typeof off === 'function') off(); } catch (e) { /* 忽略 */ } }
    busOffs = [];
    clearTimeout(breakT); clearTimeout(tuonaT); clearTimeout(tapT);
    breakT = tuonaT = tapT = 0;
    removeStyle();
    if (rootEl) rootEl.innerHTML = '';
    rootEl = wrapEl = partsG = petsG = burstG = bubbleEl = hintEl = null;
  }

  // ============================ 每秒状态同步 ============================
  function sync(first) {
    if (!wrapEl) return;
    const p = (XG.state && XG.state.player) || {};
    // ① 打坐 / ② 闭关
    const biguan = p.cultivateMode === 'biguan';
    wrapEl.classList.toggle('xgs-st-biguan', biguan);
    wrapEl.classList.toggle('xgs-st-dazuo', !biguan);
    // ③ 顿悟（bus 标记 或 系统查询，双通道取或）
    let dw = dunwuFlag;
    try {
      const c = XG.sys && XG.sys.cultivation;
      if (c && typeof c.getDunwuInfo === 'function') {
        const di = c.getDunwuInfo();
        if (di && di.active) dw = true;
      }
    } catch (e) { /* 忽略 */ }
    wrapEl.classList.toggle('xgs-dunwu', dw);
    // 境界十色（变更才写 CSS 变量）
    const ri = clamp(p.realmIdx | 0, 0, REALM_COLORS.length - 1);
    if (ri !== curRealm) { curRealm = ri; applyRealm(ri); }
    // 粒子数随小境界微增（8~12，变更才重绘）
    const layer = clamp((p.layer | 0) || 1, 1, 10);
    if (layer !== curLayer) { curLayer = layer; renderParticles(); }
    // ④ 灵宠环绕（签名变更才重绘）
    const icons = [];
    try {
      const ps = XG.sys && XG.sys.pets;
      if (ps && typeof ps.teamList === 'function') {
        const tl = ps.teamList() || [];
        for (let i = 0; i < tl.length && icons.length < 3; i++) icons.push((tl[i] && tl[i].icon) || '🐾');
      }
    } catch (e) { /* 忽略 */ }
    const sig = icons.join('|');
    if (sig !== petSig) { petSig = sig; renderPets(icons); }
    // ⑤ 昼夜（本地 6~18 点暖白，其余靛蓝夜色）
    const h = new Date().getHours();
    const day = h >= 6 && h < 18;
    wrapEl.classList.toggle('xgs-day', day);
    wrapEl.classList.toggle('xgs-night', !day);
    // ⑥ 奇遇气泡（每 2s 一查）
    advFlip = !advFlip;
    if (first || advFlip) checkAdventure();
  }

  // ============================ 各状态动画触发 ============================
  // 境界十色 → CSS 变量（飞升加虹金旋彩）
  function applyRealm(ri) {
    const c = REALM_COLORS[ri];
    wrapEl.style.setProperty('--xgs-ring', c.ring);
    wrapEl.style.setProperty('--xgs-core', c.core);
    wrapEl.style.setProperty('--xgs-pc', c.pc);
    wrapEl.classList.toggle('xgs-rainbow', ri === REALM_COLORS.length - 1);
  }
  // 顿悟开关（bus 通道）
  function setDunwu(on) {
    dunwuFlag = on;
    if (wrapEl) wrapEl.classList.toggle('xgs-dunwu', on);
  }
  // ④ 突破：升空 + 冲击环，2.5s 复位
  function playBreak() {
    if (!wrapEl) return;
    wrapEl.classList.remove('xgs-break');
    void wrapEl.offsetWidth; // 强制 reflow，重启动画
    wrapEl.classList.add('xgs-break');
    clearTimeout(breakT);
    breakT = setTimeout(function () { if (wrapEl) wrapEl.classList.remove('xgs-break'); }, 2500);
  }
  // ⑤ 吐纳：胸口亮 + 粒子迸出 + 浮字
  // （cultivation.tuona() 成功时既返回 {ok,gain} 又 emit bus 'tuona'，150ms 内去重防双触发）
  let lastTuonaPlay = 0;
  function playTuona(gain) {
    if (!wrapEl) return;
    const now = Date.now();
    if (now - lastTuonaPlay < 150) return;
    lastTuonaPlay = now;
    wrapEl.classList.remove('xgs-tuona');
    void wrapEl.offsetWidth;
    wrapEl.classList.add('xgs-tuona');
    clearTimeout(tuonaT);
    tuonaT = setTimeout(function () { if (wrapEl) wrapEl.classList.remove('xgs-tuona'); }, 1300);
    spawnBurst();
    spawnFloat(gain > 0 ? '灵气+' + fmt(gain) : '吐纳纳新');
  }
  // 吐纳迸出粒子簇（一次性）
  function spawnBurst() {
    if (!burstG) return;
    let html = '';
    for (let i = 0; i < 6; i++) {
      const bx = Math.round(Math.random() * 76 - 38);
      const by = -Math.round(26 + Math.random() * 42);
      const r = (1.6 + Math.random() * 1.8).toFixed(1);
      const delay = (Math.random() * 0.12).toFixed(2);
      html += '<circle class="xgs-b" cx="180" cy="150" r="' + r +
        '" style="--bx:' + bx + 'px;--by:' + by + 'px;animation-delay:' + delay + 's"/>';
    }
    burstG.innerHTML = html;
    setTimeout(function () { if (burstG) burstG.innerHTML = ''; }, 1400);
  }
  // 自绘小浮字（2s 消失）
  function spawnFloat(text) {
    if (!wrapEl) return;
    const el = document.createElement('div');
    el.className = 'xgs-float';
    el.style.left = (44 + Math.random() * 12).toFixed(1) + '%';
    el.textContent = text;
    wrapEl.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2000);
  }
  // 吐纳未开放/冷却失败：静默小脉动，过渡自然
  function softTap() {
    if (!wrapEl) return;
    wrapEl.classList.remove('xgs-tap');
    void wrapEl.offsetWidth;
    wrapEl.classList.add('xgs-tap');
    clearTimeout(tapT);
    tapT = setTimeout(function () { if (wrapEl) wrapEl.classList.remove('xgs-tap'); }, 700);
  }

  // ============================ 动态元素重绘 ============================
  function renderParticles() {
    if (!partsG) return;
    const n = 8 + clamp(curLayer - 1, 0, 4); // 8~12 粒，随小境界 layer 微增
    let html = '';
    for (let i = 0; i < n; i++) {
      const cx = Math.round(138 + Math.random() * 84);
      const cy = Math.round(166 + Math.random() * 8);
      const r = (1.4 + Math.random() * 2.1).toFixed(1);
      const dx = Math.round(Math.random() * 40 - 20);
      const dur = (6 + Math.random() * 5).toFixed(2);
      const delay = (-Math.random() * Number(dur)).toFixed(2);
      html += '<circle class="xgs-p" cx="' + cx + '" cy="' + cy + '" r="' + r +
        '" style="--dx:' + dx + 'px;--dur:' + dur + 's;animation-delay:' + delay + 's"/>';
    }
    partsG.innerHTML = html;
  }
  function renderPets(icons) {
    if (!petsG) return;
    let html = '';
    for (let i = 0; i < icons.length && i < 3; i++) {
      html += '<text class="xgs-pet" x="' + PET_POS[i][0] + '" y="' + PET_POS[i][1] +
        '" text-anchor="middle" style="animation-delay:' + (i * 0.45).toFixed(2) + 's">' + icons[i] + '</text>';
    }
    petsG.innerHTML = html;
  }

  // ============================ 奇遇气泡 ============================
  function checkAdventure() {
    let on = false;
    try {
      const a = XG.sys && XG.sys.adventure;
      if (a && typeof a.getPending === 'function') on = !!a.getPending();
    } catch (e) { on = false; }
    if (on !== advOn) {
      advOn = on;
      if (bubbleEl) bubbleEl.classList.toggle('xgs-on', on);
    }
  }
  function onBubbleClick() {
    try { if (XG.ui && XG.ui.toast) XG.ui.toast('有奇遇待决，请见页首提醒', 'gold'); } catch (e) { /* 忽略 */ }
  }

  // ============================ 点击小人 = 手动吐纳 ============================
  function onPersonClick() {
    hideHint();
    let r = null;
    try {
      const c = XG.sys && XG.sys.cultivation;
      if (c && typeof c.tuona === 'function') r = c.tuona(); // 防御性：接口可能不存在
    } catch (e) { r = null; }
    if (r && r.ok) playTuona(typeof r.gain === 'number' ? r.gain : 0);
    else softTap(); // 不存在或冷却失败：不报错，自然过渡
  }
  function hideHint() {
    if (hintEl) hintEl.classList.remove('xgs-on');
    try { window.localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* 忽略 */ }
  }

  // ============================ 每秒轮询 #scene-root（出现挂载 / 消失卸载） ============================
  function tick() {
    try {
      const root = $('scene-root');
      if (root && root !== rootEl) { if (mounted) unmount(); mount(root); }
      else if (!root && mounted) unmount();
      if (mounted) sync(false);
    } catch (e) { /* 场景异常静默，绝不拖累主界面 */ }
  }
  setInterval(tick, 1000);
})();
