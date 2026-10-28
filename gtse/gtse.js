// Interactive visualizations for the GTSE project page.
(function () {
  var ACCENT = '#641e16', ACCENT2 = '#c27c73', NEXT = '#d4883e', GREY = '#c9c9c9', INK = '#111', MUTED = '#888';
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function niceStep(x) {
    var p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function npdf(x, m, v) { return Math.exp(-(x - m) * (x - m) / (2 * v)) / Math.sqrt(2 * Math.PI * v); }
  // Seeded RNG so the page looks the same on every load.
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function randn(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
  function sample(r, probs) {
    var u = r() * probs.reduce(function (a, b) { return a + b; }, 0), c = 0;
    for (var i = 0; i < probs.length; i++) { c += probs[i]; if (u <= c) return i; }
    return probs.length - 1;
  }
  // Run fn only while root is on screen.
  function whenVisible(root, onShow, onHide) {
    if (!('IntersectionObserver' in window)) { onShow(); return; }
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.isIntersecting ? onShow() : onHide(); });
    }, { threshold: 0.15 }).observe(root);
  }

  // ---------------------------------------------------------------------------
  // 1. Occupancy measure: animated rollouts of the paper's 5-step toy MDP in R^2.
  //    a_t = eta_t for t < 2 and b*mu + eta_t for t >= 2, s_{t+1} = s_t + a_t + eps_t.
  // ---------------------------------------------------------------------------
  function initOccupancy() {
    var cv = document.getElementById('occ-canvas');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var W = 760, H = 470, XMIN = -4, XMAX = 4, YMIN = -2.47, YMAX = 2.47;
    var dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
    var MU = [1.0, 0.42], SIG = 0.12, SIGA = 0.18, V = SIG * SIG + SIGA * SIGA;
    var GW = 152, GH = 94, grids = [], counts = [0, 0, 0, 0, 0];
    for (var t = 0; t < 5; t++) grids.push(new Float32Array(GW * GH));
    var off = document.createElement('canvas'); off.width = GW; off.height = GH;
    var octx = off.getContext('2d'), img = octx.createImageData(GW, GH);
    var R = rng(7), gamma = 0.6, particles = [], playing = true, rollouts = 0, hover = null;

    var gSl = document.getElementById('occ-gamma'), gOut = document.getElementById('occ-gamma-val');
    var wbars = document.getElementById('occ-wbars'), pastOut = document.getElementById('occ-past');
    var hoverOut = document.getElementById('occ-hover'), countOut = document.getElementById('occ-count');
    var play = document.getElementById('occ-play');
    var barEls = [];
    for (var b = 0; b < 5; b++) {
      var d = document.createElement('div'); d.className = 'wbar' + (b >= 2 ? ' past' : '');
      var s = document.createElement('span'); d.appendChild(s); wbars.appendChild(d); barEls.push(s);
    }

    function px(x) { return (x - XMIN) / (XMAX - XMIN) * W; }
    function py(y) { return (YMAX - y) / (YMAX - YMIN) * H; }
    function weights() {
      var w = [], z = 0;
      for (var t = 0; t < 5; t++) { w.push(Math.pow(gamma, t)); z += w[t]; }
      return w.map(function (v) { return v / z; });
    }
    // Exact occupancy density: step j = t + 1 is N(0, jV) before the branch and 0.5 N(+-(j-2)mu, jV) after.
    function density(x, y) {
      var w = weights(), d = 0;
      for (var t = 0; t < 5; t++) {
        var j = t + 1, v = j * V, c = 1 / (2 * Math.PI * v), m = Math.max(0, j - 2);
        if (m === 0) d += w[t] * c * Math.exp(-(x * x + y * y) / (2 * v));
        else for (var sgn = -1; sgn <= 1; sgn += 2) {
          var dx = x - sgn * m * MU[0], dy = y - sgn * m * MU[1];
          d += w[t] * 0.5 * c * Math.exp(-(dx * dx + dy * dy) / (2 * v));
        }
      }
      return d;
    }
    function rollout() {
      var br = R() < 0.5 ? -1 : 1, pts = [[0, 0]];
      for (var t = 0; t < 5; t++) {
        var p = pts[t], ax = SIGA * randn(R), ay = SIGA * randn(R);
        if (t >= 2) { ax += br * MU[0]; ay += br * MU[1]; }
        pts.push([p[0] + ax + SIG * randn(R), p[1] + ay + SIG * randn(R)]);
      }
      return { pts: pts, t: 0, done: 0 };
    }
    function deposit(step, x, y) {
      var gx = (x - XMIN) / (XMAX - XMIN) * GW, gy = (YMAX - y) / (YMAX - YMIN) * GH, g = grids[step];
      var cx = Math.round(gx), cy = Math.round(gy);
      for (var i = -2; i <= 2; i++) for (var j = -2; j <= 2; j++) {
        var X = cx + i, Y = cy + j;
        if (X < 0 || Y < 0 || X >= GW || Y >= GH) continue;
        var ddx = X - gx, ddy = Y - gy;
        g[Y * GW + X] += Math.exp(-(ddx * ddx + ddy * ddy) / 2.4);
      }
      counts[step]++;
    }
    function paintHeat() {
      var w = weights(), field = new Float32Array(GW * GH), mx = 1e-9, i;
      for (var t = 0; t < 5; t++) {
        if (!counts[t]) continue;
        var c = w[t] / counts[t], g = grids[t];
        for (i = 0; i < field.length; i++) field[i] += c * g[i];
      }
      for (i = 0; i < field.length; i++) if (field[i] > mx) mx = field[i];
      var data = img.data;
      for (i = 0; i < field.length; i++) {
        var v = Math.pow(field[i] / mx, 0.4);
        data[4 * i] = 252 + (100 - 252) * v; data[4 * i + 1] = 252 + (30 - 252) * v; data[4 * i + 2] = 252 + (22 - 252) * v; data[4 * i + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, W, H);
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      paintHeat();
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
      for (var gx = -3; gx <= 3; gx++) { ctx.beginPath(); ctx.moveTo(px(gx), 0); ctx.lineTo(px(gx), H); ctx.stroke(); }
      for (var gy = -2; gy <= 2; gy++) { ctx.beginPath(); ctx.moveTo(0, py(gy)); ctx.lineTo(W, py(gy)); ctx.stroke(); }
      // rollouts
      particles.forEach(function (p) {
        var k = Math.floor(p.t), f = p.t - k, a = p.pts[k], b = p.pts[Math.min(k + 1, 5)];
        var x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
        ctx.strokeStyle = 'rgba(100,30,22,0.18)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px(0), py(0));
        for (var j = 1; j <= k; j++) ctx.lineTo(px(p.pts[j][0]), py(p.pts[j][1]));
        ctx.lineTo(px(x), py(y)); ctx.stroke();
        ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(px(x), py(y), 3, 0, 2 * Math.PI); ctx.fill();
      });
      // start state and labels
      ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px(0), py(0), 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.font = '14px Barlow, sans-serif'; ctx.fillStyle = INK; ctx.fillText('(s, a)', px(0) + 10, py(0) - 10);
      ctx.fillStyle = '#777'; ctx.font = '13px Barlow, sans-serif';
      ctx.fillText('branch b = +1', px(2.3), py(1.45));
      ctx.fillText('branch b = −1', px(-3.6), py(-0.75));
      ctx.fillText('future state s⁺ ∈ ℝ²', 10, H - 10);
      if (hover) {
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px(hover[0]), py(hover[1]), 9, 0, 2 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px(hover[0]) - 14, py(hover[1])); ctx.lineTo(px(hover[0]) + 14, py(hover[1]));
        ctx.moveTo(px(hover[0]), py(hover[1]) - 14); ctx.lineTo(px(hover[0]), py(hover[1]) + 14); ctx.stroke();
      }
    }
    function updatePanel() {
      gOut.textContent = gamma.toFixed(2); gSl.value = gamma;
      var w = weights(), mx = Math.max.apply(null, w);
      barEls.forEach(function (s, i) { s.style.height = (w[i] / mx * 100) + '%'; });
      pastOut.textContent = Math.round((w[2] + w[3] + w[4]) * 100) + '%';
      hoverOut.textContent = hover ? density(hover[0], hover[1]).toFixed(3) : '–';
      countOut.textContent = rollouts + ' rollouts';
    }
    function step(dt) {
      if (particles.length < 70 && Math.random() < dt * 16) { particles.push(rollout()); }
      particles.forEach(function (p) {
        p.t = Math.min(5, p.t + dt * 2.2);
        while (p.done < Math.floor(p.t)) { p.done++; deposit(p.done - 1, p.pts[p.done][0], p.pts[p.done][1]); }
      });
      var before = particles.length;
      particles = particles.filter(function (p) { return p.t < 5; });
      rollouts += before - particles.length;
    }

    var raf = null, last = 0, visible = false;
    function tick(ts) {
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (playing) step(dt);
      draw(); updatePanel();
      raf = visible ? requestAnimationFrame(tick) : null;
    }
    function kick() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }

    gSl.addEventListener('input', function () { gamma = +gSl.value; updatePanel(); if (!raf) draw(); });
    play.addEventListener('click', function () { playing = !playing; play.textContent = playing ? 'Pause' : 'Play'; });
    document.getElementById('occ-ff').addEventListener('click', function () {
      for (var i = 0; i < 1000; i++) { var p = rollout(); for (var j = 1; j <= 5; j++) deposit(j - 1, p.pts[j][0], p.pts[j][1]); }
      rollouts += 1000; draw(); updatePanel();
    });
    document.getElementById('occ-clear').addEventListener('click', function () {
      grids.forEach(function (g) { g.fill(0); }); counts = [0, 0, 0, 0, 0]; particles = []; rollouts = 0; draw(); updatePanel();
    });
    cv.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect();
      hover = [XMIN + (e.clientX - r.left) / r.width * (XMAX - XMIN), YMAX - (e.clientY - r.top) / r.height * (YMAX - YMIN)];
      updatePanel(); if (!raf) draw();
    });
    cv.addEventListener('pointerleave', function () { hover = null; updatePanel(); if (!raf) draw(); });

    // seed the heatmap so it is never empty
    for (var i = 0; i < 400; i++) { var p0 = rollout(); for (var j = 1; j <= 5; j++) deposit(j - 1, p0.pts[j][0], p0.pts[j][1]); }
    rollouts = 400;
    updatePanel(); draw();
    whenVisible(cv, function () { visible = true; kick(); }, function () { visible = false; });
  }

  // ---------------------------------------------------------------------------
  // 2. Time-score explorer: 1D occupancy measure on a variance-preserving path.
  //    p_k(x) = sum_i w_i N(x; a_k mu_i, a_k^2 sd_i^2 + 1 - a_k^2), a_k = k.
  // ---------------------------------------------------------------------------
  var MIX = { w: [0.17, 0.13, 0.2, 0.5], mu: [-3.0, -1.2, 0.8, 2.7], sd: [0.35, 0.3, 0.3, 0.22] };
  var KMAX = 0.999;

  function logpk(x, k) {
    var a = Math.min(k, KMAX), s = 0;
    for (var i = 0; i < MIX.w.length; i++) {
      var v = a * a * MIX.sd[i] * MIX.sd[i] + 1 - a * a, d = x - a * MIX.mu[i];
      s += MIX.w[i] * Math.exp(-d * d / (2 * v)) / Math.sqrt(2 * Math.PI * v);
    }
    return Math.log(Math.max(s, 1e-300));
  }
  function timeScore(x, k) {
    var h = 1e-4, k0 = Math.max(0, k - h), k1 = Math.min(KMAX, k + h);
    return (logpk(x, k1) - logpk(x, k0)) / (k1 - k0);
  }

  function initExplorer() {
    var root = document.getElementById('ts-explorer');
    if (!root) return;
    var kSl = document.getElementById('ts-k'), gSl = document.getElementById('ts-g'), nSl = document.getElementById('ts-n');
    var kOut = document.getElementById('ts-k-val'), gOut = document.getElementById('ts-g-val'), nOut = document.getElementById('ts-n-val');
    var play = document.getElementById('ts-play'), readout = document.getElementById('ts-readout');

    var W = 520, H = 260, M = { l: 40, r: 14, t: 18, b: 34 };
    var XMIN = -4.5, XMAX = 4.5;

    // Left: density p_k(x)
    var sL = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ts-svg' }, document.getElementById('ts-density'));
    var pw = W - M.l - M.r, ph = H - M.t - M.b;
    var YMAX = 1.0;
    function sx(x) { return M.l + (x - XMIN) / (XMAX - XMIN) * pw; }
    function sy(y) { return M.t + ph - Math.min(y, YMAX) / YMAX * ph; }
    el('line', { x1: M.l, y1: M.t + ph, x2: M.l + pw, y2: M.t + ph, stroke: '#bbb' }, sL);
    for (var t = -4; t <= 4; t += 2) {
      el('text', { x: sx(t), y: M.t + ph + 16, 'text-anchor': 'middle', class: 'ts-tick' }, sL).textContent = t;
    }
    el('text', { x: M.l + pw / 2, y: H - 2, 'text-anchor': 'middle', class: 'ts-axis' }, sL).textContent = 'future state s⁺';
    var target = el('path', { fill: 'none', stroke: '#bbb', 'stroke-dasharray': '4 3', 'stroke-width': 1.2 }, sL);
    var area = el('path', { fill: 'rgba(100,30,22,0.10)', stroke: 'none' }, sL);
    var curve = el('path', { fill: 'none', stroke: ACCENT, 'stroke-width': 2 }, sL);
    var gLine = el('line', { stroke: ACCENT, 'stroke-dasharray': '3 3', 'stroke-width': 1 }, sL);
    var gDot = el('circle', { r: 6, fill: '#c0392b', stroke: '#fff', 'stroke-width': 1.5, class: 'ts-drag' }, sL);
    var gLab = el('text', { class: 'ts-glab', 'text-anchor': 'middle' }, sL);
    var kLab = el('text', { x: M.l + 6, y: M.t + 6, class: 'ts-klab' }, sL);
    var legT = el('text', { x: M.l + pw, y: M.t + 6, 'text-anchor': 'end', class: 'ts-tick' }, sL);
    legT.textContent = '- - target d(s⁺ | s, a)';

    var xs = [];
    for (var i = 0; i <= 240; i++) xs.push(XMIN + (XMAX - XMIN) * i / 240);
    function pathFor(k) {
      return xs.map(function (x, j) { return (j ? 'L' : 'M') + sx(x).toFixed(1) + ',' + sy(Math.exp(logpk(x, k))).toFixed(1); }).join('');
    }
    target.setAttribute('d', pathFor(1));

    // Right: time score over k
    var sR = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ts-svg' }, document.getElementById('ts-score'));
    function kx(k) { return M.l + k * pw; }
    var yAxis = el('g', {}, sR);
    var zero = el('line', { stroke: '#bbb' }, sR);
    var bars = el('g', {}, sR);
    var shade = el('path', { fill: 'rgba(100,30,22,0.12)', stroke: 'none' }, sR);
    var scoreCurve = el('path', { fill: 'none', stroke: ACCENT, 'stroke-width': 2 }, sR);
    var kCursor = el('line', { stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '3 3' }, sR);
    var kDot = el('circle', { r: 4.5, fill: ACCENT }, sR);
    for (var tk = 0; tk <= 1.0001; tk += 0.25) {
      el('text', { x: kx(tk), y: M.t + ph + 16, 'text-anchor': 'middle', class: 'ts-tick' }, sR).textContent = tk.toFixed(2);
    }
    el('text', { x: M.l + pw / 2, y: H - 2, 'text-anchor': 'middle', class: 'ts-axis' }, sR).textContent = 'probability-path time k';
    el('text', { x: M.l + 6, y: M.t + 6, class: 'ts-klab' }, sR).textContent = '∂ₖ log pₖ(g⁺ | s, a)';

    var state = { k: 0.5, g: 2.7, n: 20, playing: false };
    var ks = [];
    for (var q = 0; q <= 300; q++) ks.push(q / 300 * 0.995);

    function render() {
      var k = state.k, g = state.g, n = state.n;
      kOut.textContent = k.toFixed(2); gOut.textContent = g.toFixed(2); nOut.textContent = n;
      kSl.value = k; gSl.value = g; nSl.value = n;

      // left panel
      var d = pathFor(k);
      curve.setAttribute('d', d);
      area.setAttribute('d', d + 'L' + sx(XMAX) + ',' + sy(0) + 'L' + sx(XMIN) + ',' + sy(0) + 'Z');
      var pg = Math.exp(logpk(g, k));
      gLine.setAttribute('x1', sx(g)); gLine.setAttribute('x2', sx(g));
      gLine.setAttribute('y1', sy(0)); gLine.setAttribute('y2', sy(pg));
      gDot.setAttribute('cx', sx(g)); gDot.setAttribute('cy', sy(pg));
      gLab.setAttribute('x', sx(g)); gLab.setAttribute('y', sy(pg) - 11); gLab.textContent = 'g⁺';
      kLab.textContent = 'pₖ(s⁺ | s, a),  k = ' + k.toFixed(2);

      // right panel: time score curve for this goal
      var vals = ks.map(function (kk) { return timeScore(g, kk); });
      var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
      var pad = 0.08 * (hi - lo || 1); lo -= pad; hi += pad;
      function ty(v) { return M.t + ph - (v - lo) / (hi - lo) * ph; }
      clear(yAxis);
      var step = niceStep((hi - lo) / 4);
      for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) {
        el('text', { x: M.l - 6, y: ty(v) + 4, 'text-anchor': 'end', class: 'ts-tick' }, yAxis).textContent = +v.toFixed(2);
        el('line', { x1: M.l, x2: M.l + pw, y1: ty(v), y2: ty(v), stroke: '#f0f0f0' }, yAxis);
      }
      zero.setAttribute('x1', M.l); zero.setAttribute('x2', M.l + pw); zero.setAttribute('y1', ty(0)); zero.setAttribute('y2', ty(0));
      scoreCurve.setAttribute('d', ks.map(function (kk, j) { return (j ? 'L' : 'M') + kx(kk).toFixed(1) + ',' + ty(vals[j]).toFixed(1); }).join(''));
      var sh = 'M' + kx(0) + ',' + ty(0);
      for (var j = 0; j < ks.length && ks[j] <= k; j++) sh += 'L' + kx(ks[j]).toFixed(1) + ',' + ty(vals[j]).toFixed(1);
      sh += 'L' + kx(Math.min(k, ks[ks.length - 1])).toFixed(1) + ',' + ty(0) + 'Z';
      shade.setAttribute('d', sh);
      var sk = timeScore(g, Math.min(k, 0.995));
      kCursor.setAttribute('x1', kx(k)); kCursor.setAttribute('x2', kx(k)); kCursor.setAttribute('y1', M.t); kCursor.setAttribute('y2', M.t + ph);
      kDot.setAttribute('cx', kx(Math.min(k, 0.995))); kDot.setAttribute('cy', ty(sk));

      // N-point Riemann sum of the time score (left endpoints i/N, as in the paper)
      clear(bars);
      var est = 0, bw = pw / n;
      for (var b = 0; b < n; b++) {
        var kb = b / n, vb = timeScore(g, kb);
        est += vb / n;
        el('rect', { x: kx(kb) + 0.5, width: Math.max(bw - 1, 0.5), y: Math.min(ty(vb), ty(0)), height: Math.abs(ty(vb) - ty(0)), fill: 'rgba(0,0,0,0.07)' }, bars);
      }
      var lp0 = logpk(g, 0), truth = logpk(g, 1), partial = logpk(g, k);
      readout.innerHTML =
        '<span>log p₀(g⁺) + ∫₀<sup>' + k.toFixed(2) + '</sup> time score = <b>' + partial.toFixed(2) + '</b></span>' +
        '<span>N = ' + n + ' estimate of log d(g⁺ | s, a): <b>' + (lp0 + est).toFixed(2) + '</b></span>' +
        '<span>true log d(g⁺ | s, a): <b>' + truth.toFixed(2) + '</b></span>';
    }

    kSl.addEventListener('input', function () { state.k = +kSl.value; stop(); render(); });
    gSl.addEventListener('input', function () { state.g = +gSl.value; render(); });
    nSl.addEventListener('input', function () { state.n = +nSl.value; render(); });

    // drag the goal on the density panel
    var dragging = false;
    function svgX(evt) {
      var r = sL.getBoundingClientRect();
      var x = (evt.clientX - r.left) / r.width * W;
      return Math.max(XMIN + 0.05, Math.min(XMAX - 0.05, XMIN + (x - M.l) / pw * (XMAX - XMIN)));
    }
    sL.addEventListener('pointerdown', function (e) { dragging = true; sL.setPointerCapture(e.pointerId); state.g = Math.round(svgX(e) * 100) / 100; render(); });
    sL.addEventListener('pointermove', function (e) { if (dragging) { state.g = Math.round(svgX(e) * 100) / 100; render(); } });
    sL.addEventListener('pointerup', function () { dragging = false; });
    // scrub k on the time-score panel
    var scrubbing = false;
    function svgK(evt) {
      var r = sR.getBoundingClientRect();
      return Math.max(0, Math.min(1, ((evt.clientX - r.left) / r.width * W - M.l) / pw));
    }
    sR.addEventListener('pointerdown', function (e) { scrubbing = true; stop(); sR.setPointerCapture(e.pointerId); state.k = svgK(e); render(); });
    sR.addEventListener('pointermove', function (e) { if (scrubbing) { state.k = svgK(e); render(); } });
    sR.addEventListener('pointerup', function () { scrubbing = false; });

    var raf = null, last = 0;
    function tick(ts) {
      if (!state.playing) return;
      if (last) state.k += (ts - last) / 4000;
      last = ts;
      if (state.k > 1) state.k = 0;
      render();
      raf = requestAnimationFrame(tick);
    }
    function start() { state.playing = true; last = 0; play.textContent = 'Pause'; raf = requestAnimationFrame(tick); }
    function stop() { state.playing = false; play.textContent = 'Play'; if (raf) cancelAnimationFrame(raf); }
    play.addEventListener('click', function () { state.playing ? stop() : start(); });

    render();
    // autoplay only while visible
    if ('IntersectionObserver' in window) {
      var started = false;
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !started) { started = true; start(); } else if (!e.isIntersecting && state.playing) stop(); });
      }, { threshold: 0.4 }).observe(root);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. GTSE loss on a 1D corridor. Data: A -> B and B -> C segments, never A -> C.
  //    The fixed point of the loss is D = (1-g) P + g P D; each "TD update" applies it once.
  // ---------------------------------------------------------------------------
  function initTD() {
    var root = document.getElementById('td-card');
    if (!root) return;
    var NX = 113, DX = 14 / (NX - 1), XV = 10.5, xs = [];  // simulate on [0, 14], plot [0, 10.5]
    for (var i = 0; i < NX; i++) xs.push(i * DX);
    var DRIFT = 0.6, SD = 0.3, GAMMA = 0.93, A = 1, B = 5, C = 8.5, iA = Math.round(A / DX);
    function z(x) { return (x - 5) / 2.5; }  // rescale positions to roughly unit scale for the path
    var P = xs.map(function (x) {
      var r = xs.map(function (y) { return npdf(y, x + DRIFT, SD * SD); }), s = r.reduce(function (a, b) { return a + b; });
      return r.map(function (v) { return v / s; });
    });
    function bellman(D, rows) {
      return rows.map(function (i) {
        var Pi = P[i], fut = new Float64Array(NX), nxt = new Float64Array(NX);
        for (var j = 0; j < NX; j++) {
          var p = Pi[j]; if (p < 1e-12) continue;
          var Dj = D[j];
          for (var m = 0; m < NX; m++) fut[m] += p * Dj[m];
        }
        for (var m2 = 0; m2 < NX; m2++) { nxt[m2] = (1 - GAMMA) * Pi[m2]; fut[m2] *= GAMMA; }
        return { next: nxt, fut: fut };
      });
    }
    var ALL = xs.map(function (_, i) { return i; });
    function apply(D) { return bellman(D, ALL).map(function (c) { return c.next.map(function (v, m) { return v + c.fut[m]; }); }); }
    var truth = P; for (var it = 0; it < 500; it++) truth = apply(truth);
    // Monte Carlo: futures only within the same A -> B trajectory (it ends once it passes B).
    var mc = new Float64Array(NX), q = P[iA].map(function (v, m) { return xs[m] <= B ? v : 0; }), gt = 1;
    for (var t = 0; t < 300; t++) {
      for (var m = 0; m < NX; m++) mc[m] += gt * q[m];
      gt *= GAMMA;
      var nq = new Float64Array(NX);
      for (var j = 0; j < NX; j++) if (q[j] > 1e-14) for (var m3 = 0; m3 < NX; m3++) nq[m3] += q[j] * P[j][m3];
      q = Array.prototype.map.call(nq, function (v, m4) { return xs[m4] <= B ? v : 0; });
    }
    var mcSum = mc.reduce(function (a, b) { return a + b; }); mc = Array.prototype.map.call(mc, function (v) { return v / mcSum; });
    function massC(row) { var s = 0; for (var m = 0; m < NX; m++) if (Math.abs(xs[m] - C) <= 0.5) s += row[m]; return s; }
    var trueC = massC(truth[iA]);

    var D, n, comp;  // D_n for all rows; comp = next / future split of row A
    // Start from a single next-state term, (1-g) P, so mass fills in from A outward with each update.
    function reset() {
      D = P.map(function (r) { return r.map(function (v) { return (1 - GAMMA) * v; }); }); n = 0;
      comp = { next: D[iA].slice(), fut: new Array(NX).fill(0) }; batch = [];
    }
    function update() { comp = bellman(D, [iA])[0]; D = apply(D); n++; batch = []; }

    // ----- top panel: occupancy from A -----
    var W = 760, H = 250, M = { l: 44, r: 12, t: 14, b: 40 }, pw = W - M.l - M.r, ph = H - M.t - M.b;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'bar-svg' }, document.getElementById('td-density'));
    function sx(x) { return M.l + x / XV * pw; }
    var axisG = el('g', {}, svg), areaN = el('path', { fill: NEXT, opacity: 0.85 }, svg), areaF = el('path', { fill: ACCENT, opacity: 0.85 }, svg);
    var tLine = el('path', { fill: 'none', stroke: INK, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, svg);
    var mLine = el('path', { fill: 'none', stroke: '#999', 'stroke-width': 2, 'stroke-dasharray': '2 3' }, svg);
    el('line', { x1: M.l, x2: M.l + pw, y1: M.t + ph, y2: M.t + ph, stroke: '#bbb' }, svg);
    [['A', A], ['B', B], ['C', C]].forEach(function (p) {
      el('line', { x1: sx(p[1]), x2: sx(p[1]), y1: M.t, y2: M.t + ph, stroke: '#ddd', 'stroke-dasharray': '2 3' }, svg);
      el('text', { x: sx(p[1]), y: M.t + ph + 16, 'text-anchor': 'middle', class: 'bar-lab', style: 'font-weight:500; fill:#111' }, svg).textContent = p[0];
    });
    function seg(x0, x1, y, lab) {
      el('line', { x1: sx(x0) + 8, x2: sx(x1) - 8, y1: y, y2: y, stroke: '#999', 'stroke-width': 1.2, 'marker-end': 'url(#td-arrow)' }, svg);
      el('text', { x: (sx(x0) + sx(x1)) / 2, y: y - 4, 'text-anchor': 'middle', class: 'ts-tick' }, svg).textContent = lab;
    }
    var defs = el('defs', {}, svg), mk = el('marker', { id: 'td-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#999' }, mk);
    seg(A, B, M.t + ph + 32, 'data: A → B'); seg(B, XV, M.t + ph + 32, 'data: B → C');
    var mcBox = document.getElementById('td-mc'), readout = document.getElementById('td-readout');

    function areaPath(base, top, y) {
      var d = '';
      var last = Math.floor(XV / DX);
      for (var m = 0; m <= last; m++) d += (m ? 'L' : 'M') + sx(xs[m]).toFixed(1) + ',' + y(top[m] / DX).toFixed(1);
      for (var m2 = last; m2 >= 0; m2--) d += 'L' + sx(xs[m2]).toFixed(1) + ',' + y(base[m2] / DX).toFixed(1);
      return d + 'Z';
    }
    function linePath(row, y) {
      var d = '';
      for (var m = 0; m < NX && xs[m] <= XV; m++) d += (m ? 'L' : 'M') + sx(xs[m]).toFixed(1) + ',' + y(row[m] / DX).toFixed(1);
      return d;
    }
    function renderTop() {
      var total = comp.next.map(function (v, m) { return v + comp.fut[m]; });
      function vmax(row) { var v = 0; for (var m = 0; m < NX; m++) if (xs[m] <= XV && row[m] > v) v = row[m]; return v; }
      var hi = Math.max(vmax(total), vmax(truth[iA]), mcBox.checked ? vmax(mc) : 0) / DX * 1.08;
      function y(v) { return M.t + ph - v / hi * ph; }
      clear(axisG);
      var st = niceStep(hi / 4);
      for (var v = st; v <= hi; v += st) {
        el('line', { x1: M.l, x2: M.l + pw, y1: y(v), y2: y(v), stroke: '#f0f0f0' }, axisG);
        el('text', { x: M.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ts-tick' }, axisG).textContent = +v.toFixed(2);
      }
      var zeros = new Array(NX).fill(0);
      areaN.setAttribute('d', areaPath(zeros, comp.next, y));
      areaF.setAttribute('d', areaPath(comp.next, total, y));
      tLine.setAttribute('d', linePath(truth[iA], y));
      mLine.setAttribute('d', linePath(mc, y)); mLine.style.display = mcBox.checked ? '' : 'none';
      document.getElementById('td-mc-leg').style.opacity = mcBox.checked ? 1 : 0.35;
      readout.innerHTML = '<span>TD updates: <b>' + n + '</b></span>' +
        '<span>d̂(C | A) as % of true, TD: <b>' + Math.round(massC(total) / trueC * 100) + '%</b></span>' +
        '<span>Monte Carlo: <b>' + Math.round(massC(mc) / trueC * 100) + '%</b></span>';
    }

    // ----- bottom panel: one minibatch of the loss at noise level k -----
    var R = rng(11), k = 0.7, batch = [];
    var kSl = document.getElementById('td-k'), kOut = document.getElementById('td-k-val'), bOut = document.getElementById('td-batch-readout');
    // Time score at (y, k) of the occupancy row (a mixture of point masses at z(x)) along the VP path, alpha_k = k.
    function score(row, y, kk) {
      var v = 1 - kk * kk, p = 0, dp = 0;
      for (var m = 0; m < NX; m++) {
        if (row[m] < 1e-10) continue;
        var x = z(xs[m]), e = y - kk * x, nn = row[m] * Math.exp(-e * e / (2 * v));
        p += nn; dp += nn * (kk / v + e * x / v - kk * e * e / (v * v));
      }
      return p > 1e-300 ? dp / p : 0;
    }
    function drawBatch() {
      batch = [];
      var v = 1 - k * k, sv = Math.sqrt(v);
      for (var b = 0; b < 48; b++) {
        var j = sample(R, P[iA]), eps = randn(R);
        if (R() < 1 - GAMMA) {
          // next: noise the observed s' and use the closed-form conditional time score (Eq. 3, dim = 1, alpha' = 1)
          var xp = z(xs[j]), y = k * xp + sv * eps;
          batch.push({ y: y, t: k / v * (1 - eps * eps) + eps * xp / sv, kind: 'next' });
        } else {
          // future: s+ from the model at s', target is the model's own time score at s'
          var mm = sample(R, D[j]), y2 = k * z(xs[mm]) + sv * eps;
          batch.push({ y: y2, t: score(D[j], y2, k), kind: 'fut' });
        }
      }
      setRange();
    }
    var W2 = 760, H2 = 230, M2 = { l: 44, r: 12, t: 12, b: 34 }, pw2 = W2 - M2.l - M2.r, ph2 = H2 - M2.t - M2.b;
    var svg2 = el('svg', { viewBox: '0 0 ' + W2 + ' ' + H2, class: 'bar-svg' }, document.getElementById('td-batch'));
    var YL = -2.6, YH = 2.6;
    function setRange() {
      if (!batch.length) return;
      var ys = batch.map(function (s) { return s.y; }).sort(function (a, b) { return a - b; });
      YL = ys[0] - 0.15; YH = ys[ys.length - 1] + 0.15;
    }
    function bx(y) { return M2.l + (y - YL) / (YH - YL) * pw2; }
    var ax2 = el('g', {}, svg2), resG = el('g', {}, svg2), cNow = el('path', { fill: 'none', stroke: ACCENT, 'stroke-width': 2.5 }, svg2);
    var cTgt = el('path', { fill: 'none', stroke: INK, 'stroke-width': 1.5, 'stroke-dasharray': '2 3' }, svg2), dotG = el('g', {}, svg2);
    el('text', { x: M2.l + pw2 / 2, y: H2 - 2, 'text-anchor': 'middle', class: 'ts-axis' }, svg2).textContent = 'noised future state s⁺ₖ (rescaled)';
    function renderBatch() {
      kOut.textContent = k.toFixed(2); kSl.value = k;
      var ys = [], now = [], tgt = [], rowA = D[iA], nextRow = bellman(D, [iA])[0];
      var after = nextRow.next.map(function (v, m) { return v + nextRow.fut[m]; });
      for (var i = 0; i <= 160; i++) { var y = YL + (YH - YL) * i / 160; ys.push(y); now.push(score(rowA, y, k)); tgt.push(score(after, y, k)); }
      var ts = batch.map(function (s) { return s.t; }).sort(function (a, b) { return a - b; });
      var all = now.concat(tgt);
      if (ts.length) all = all.concat([ts[Math.floor(ts.length * 0.02)], ts[Math.ceil(ts.length * 0.98) - 1]]);
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = 0.12 * (hi - lo || 1);
      lo -= pad; hi += pad;
      function ty(v) { return M2.t + ph2 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * ph2; }
      clear(ax2);
      var st = niceStep((hi - lo) / 4);
      for (var v = Math.ceil(lo / st) * st; v <= hi; v += st) {
        el('line', { x1: M2.l, x2: M2.l + pw2, y1: ty(v), y2: ty(v), stroke: Math.abs(v) < 1e-9 ? '#bbb' : '#f0f0f0' }, ax2);
        el('text', { x: M2.l - 6, y: ty(v) + 4, 'text-anchor': 'end', class: 'ts-tick' }, ax2).textContent = +v.toFixed(1);
      }
      for (var tt = Math.ceil(YL * 2) / 2; tt <= YH; tt += 0.5) el('text', { x: bx(tt), y: M2.t + ph2 + 14, 'text-anchor': 'middle', class: 'ts-tick' }, ax2).textContent = tt;
      cNow.setAttribute('d', ys.map(function (y, i) { return (i ? 'L' : 'M') + bx(y).toFixed(1) + ',' + ty(now[i]).toFixed(1); }).join(''));
      cTgt.setAttribute('d', ys.map(function (y, i) { return (i ? 'L' : 'M') + bx(y).toFixed(1) + ',' + ty(tgt[i]).toFixed(1); }).join(''));
      clear(resG); clear(dotG);
      var loss = 0, cnt = 0, nNext = 0;
      batch.forEach(function (s) {
        if (s.y < YL || s.y > YH) return;
        var pred = score(rowA, s.y, k);
        loss += (s.t - pred) * (s.t - pred); cnt++; if (s.kind === 'next') nNext++;
        el('line', { x1: bx(s.y), x2: bx(s.y), y1: ty(pred), y2: ty(s.t), stroke: s.kind === 'next' ? NEXT : ACCENT, 'stroke-opacity': 0.35 }, resG);
        el('circle', { cx: bx(s.y), cy: ty(s.t), r: s.kind === 'next' ? 4.5 : 3.5, fill: s.kind === 'next' ? NEXT : ACCENT, 'fill-opacity': s.kind === 'next' ? 1 : 0.6 }, dotG);
      });
      bOut.innerHTML = cnt ? '<span>minibatch: <b>' + cnt + '</b> targets (<span class="c-next">' + nNext + ' next</span>, <span class="c-fut">' + (cnt - nNext) + ' future</span>)</span>' +
        '<span>squared error vs. current s<sub>θ</sub>: <b>' + (loss / cnt).toFixed(2) + '</b></span>' : '<span>Draw a minibatch to see the regression targets.</span>';
    }

    function render() { renderTop(); renderBatch(); }
    var timer = null, runBtn = document.getElementById('td-play');
    function stopRun() { if (timer) clearInterval(timer); timer = null; runBtn.textContent = 'Run'; }
    document.getElementById('td-step').addEventListener('click', function () { stopRun(); update(); drawBatch(); render(); });
    runBtn.addEventListener('click', function () {
      if (timer) return stopRun();
      runBtn.textContent = 'Pause';
      timer = setInterval(function () { update(); drawBatch(); render(); if (n >= 60) stopRun(); }, 280);
    });
    document.getElementById('td-reset').addEventListener('click', function () { stopRun(); reset(); render(); });
    document.getElementById('td-sample').addEventListener('click', function () { drawBatch(); renderBatch(); });
    kSl.addEventListener('input', function () { k = +kSl.value; drawBatch(); renderBatch(); });
    mcBox.addEventListener('change', renderTop);
    reset(); drawBatch(); render();
  }

  // ---------------------------------------------------------------------------
  // 4. Estimator gallery: panels cropped from the toy-MDP rank plot (rank_final.png).
  // ---------------------------------------------------------------------------
  var PANELS = {
    'CRL': [0, 0], 'FB': [1, 0], 'TD-JEPA': [2, 0], 'TMD': [3, 0], 'BYOL-γ': [4, 0], 'Dual GR': [5, 0], 'TD-flows': [6, 0],
    'GTSE-b₀': [0, 1], 'GTSE-b₂': [1, 1], 'GTSE-b₁₀': [2, 1], 'GTSE-b': [3, 1], 'GTSE-r': [4, 1], 'GTSE': [5, 1]
  };
  var TOY_RHO = { 'CRL': 0.78, 'FB': 0.19, 'TD-JEPA': 0.09, 'TMD': 0.78, 'BYOL-γ': 0.45, 'Dual GR': 0.19, 'TD-flows': 0.78,
    'GTSE-b₀': 0.82, 'GTSE-b₂': 0.88, 'GTSE-b₁₀': 0.88, 'GTSE-b': 0.96, 'GTSE-r': 0.95, 'GTSE': 0.96 };
  var rankImg = new Image();
  rankImg.src = 'rank_final.png';
  function drawPanel(cv, name) {
    var c = PANELS[name], sx = c[0] * 341, sy = c[1] ? 380 : 0, sh = c[1] ? 366 : 373;
    cv.width = 340; cv.height = sh;
    function go() { var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 340, sh); ctx.drawImage(rankImg, sx, sy, 340, sh, 0, 0, 340, sh); }
    rankImg.complete && rankImg.naturalWidth ? go() : rankImg.addEventListener('load', go);
  }
  function colorFor(name) {
    if (name === 'GTSE') return ACCENT;
    if (name.indexOf('GTSE') === 0) return ACCENT2;
    return GREY;
  }

  function initGallery() {
    var root = document.getElementById('gal-all');
    if (!root) return;
    var cv = document.createElement('canvas'); root.appendChild(cv);
    var side = document.createElement('div'); side.className = 'g-bars'; root.appendChild(side);
    var names = Object.keys(TOY_RHO).sort(function (a, b) { return TOY_RHO[b] - TOY_RHO[a]; });
    var W = 640, rowH = 24, M = { l: 84, r: 44, t: 22 }, H = M.t + names.length * rowH + 6, pw = W - M.l - M.r;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H }, side);
    el('text', { x: M.l, y: 11, class: 'ts-tick' }, svg).textContent = 'Spearman ρ on the toy MDP (click or hover)';
    var rows = {}, sel = 'CRL';
    names.forEach(function (nm, i) {
      var y = M.t + i * rowH, g = el('g', { class: 'g-row' }, svg);
      var bg = el('rect', { x: 0, y: y, width: W, height: rowH, fill: 'transparent' }, g);
      var lab = el('text', { x: M.l - 8, y: y + 15, 'text-anchor': 'end', class: 'bar-lab' + (nm.indexOf('GTSE') === 0 ? ' ours' : '') }, g); lab.textContent = nm;
      var bar = el('rect', { x: M.l, y: y + 4, height: rowH - 8, width: TOY_RHO[nm] * pw, rx: 2, fill: colorFor(nm) }, g);
      el('text', { x: M.l + TOY_RHO[nm] * pw + 5, y: y + 15, class: 'bar-val' }, g).textContent = TOY_RHO[nm].toFixed(2);
      g.addEventListener('mouseenter', function () { show(nm); });
      g.addEventListener('mouseleave', function () { show(sel); });
      g.addEventListener('click', function () { sel = nm; show(nm); });
      rows[nm] = { bg: bg, bar: bar };
    });
    function show(nm) {
      drawPanel(cv, nm);
      names.forEach(function (k) {
        rows[k].bg.setAttribute('fill', k === nm ? '#fdf3f1' : 'transparent');
        rows[k].bar.setAttribute('opacity', k === nm ? 1 : 0.55);
      });
    }
    show(sel);
  }

  // Legendre truncation: GTSE-b_L for L = 0, 2, 10, infinity.
  function initLegendre() {
    var root = document.getElementById('leg-toggle');
    if (!root) return;
    var Ls = [
      { lab: 'L = 0', name: 'GTSE-b₀', rank: 'δ', toy: 0.82, far: 0.50, sr: '12±5' },
      { lab: 'L = 2', name: 'GTSE-b₂', rank: '3δ', toy: 0.88, far: 0.51, sr: '21±10' },
      { lab: 'L = 10', name: 'GTSE-b₁₀', rank: '11δ', toy: 0.88, far: 0.52, sr: '19±9' },
      { lab: 'L = ∞', name: 'GTSE-b', rank: 'unbounded', toy: 0.96, far: 0.53, sr: '25±4' }
    ];
    var cv = document.getElementById('leg-canvas'), stats = document.getElementById('leg-stats');
    var btns = Ls.map(function (d, i) {
      var b = document.createElement('button'); b.className = 'seg-btn'; b.textContent = d.lab;
      b.addEventListener('click', function () { show(i); }); root.appendChild(b); return b;
    });
    var W = 640, H = 230, M = { l: 40, r: 16, t: 22, b: 30 }, pw = W - M.l - M.r, ph = H - M.t - M.b;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H }, document.getElementById('leg-chart'));
    var LO = 0.7, HI = 1.0;
    function y(v) { return M.t + ph - (v - LO) / (HI - LO) * ph; }
    function x(i) { return M.l + (i + 0.5) / Ls.length * pw; }
    [0.7, 0.8, 0.9, 1.0].forEach(function (v) {
      el('line', { x1: M.l, x2: M.l + pw, y1: y(v), y2: y(v), stroke: '#f0f0f0' }, svg);
      el('text', { x: M.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ts-tick' }, svg).textContent = v.toFixed(1);
    });
    el('line', { x1: M.l, x2: M.l + pw, y1: y(0.78), y2: y(0.78), stroke: '#999', 'stroke-dasharray': '4 3' }, svg);
    el('text', { x: M.l + 4, y: y(0.78) + 13, class: 'ts-tick' }, svg).textContent = 'best baseline 0.78';
    el('line', { x1: M.l, x2: M.l + pw, y1: y(0.96), y2: y(0.96), stroke: ACCENT, 'stroke-dasharray': '4 3', 'stroke-opacity': 0.5 }, svg);
    el('text', { x: M.l + 4, y: y(0.96) - 5, class: 'ts-tick' }, svg).textContent = 'GTSE 0.96';
    el('path', { d: Ls.map(function (d, i) { return (i ? 'L' : 'M') + x(i) + ',' + y(d.toy); }).join(''), fill: 'none', stroke: ACCENT2, 'stroke-width': 2 }, svg);
    var dots = Ls.map(function (d, i) {
      el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'ts-tick' }, svg).textContent = d.lab;
      var c = el('circle', { cx: x(i), cy: y(d.toy), r: 5, fill: '#fff', stroke: ACCENT, 'stroke-width': 2, style: 'cursor:pointer' }, svg);
      c.addEventListener('click', function () { show(i); });
      return c;
    });
    el('text', { x: M.l, y: 10, class: 'ts-tick' }, svg).textContent = 'toy-MDP ρ vs. truncation order';
    function show(i) {
      var d = Ls[i];
      btns.forEach(function (b, j) { b.classList.toggle('is-active', j === i); });
      dots.forEach(function (c, j) { c.setAttribute('fill', j === i ? ACCENT : '#fff'); c.setAttribute('r', j === i ? 6.5 : 5); });
      drawPanel(cv, d.name);
      stats.innerHTML = [['rank ≤ (L+1)δ', d.rank], ['toy-MDP ρ', d.toy.toFixed(2)], ['pointmaze ρ (far)', d.far.toFixed(2)], ['pointmaze success', d.sr + '%']]
        .map(function (s) { return '<div class="stat"><div class="v">' + s[1] + '</div><div class="k">' + s[0] + '</div></div>'; }).join('');
    }
    show(0);
  }

  // ---------------------------------------------------------------------------
  // 5. Bar charts linked to result tables, with segmented toggles.
  // ---------------------------------------------------------------------------
  // Parses "38±4" or "0.55" into {v, ci}.
  function parseCell(txt) {
    var t = txt.replace(/−/g, '-').trim(), parts = t.split('±');
    return { v: parseFloat(parts[0]), ci: parts.length > 1 ? parseFloat(parts[1]) : null };
  }

  function barChart(rootId, tableId, opts) {
    var root = document.getElementById(rootId), table = document.getElementById(tableId);
    if (!root || !table) return;
    var heads = Array.prototype.slice.call(table.querySelectorAll('thead th')).slice(1);
    var methods = heads.map(function (th) { return th.getAttribute('data-name') || th.textContent.trim(); });
    var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    var groups = rows.map(function (tr) {
      var cells = Array.prototype.slice.call(tr.children);
      return { name: cells[0].textContent.trim(), vals: cells.slice(1).map(function (c) { return parseCell(c.textContent); }), tr: tr };
    });

    // segmented toggle
    var seg = document.createElement('div');
    seg.className = 'seg-toggle';
    groups.forEach(function (g, i) {
      var b = document.createElement('button');
      b.className = 'seg-btn' + (i === (opts.initial || 0) ? ' is-active' : '');
      b.textContent = (opts.label && opts.label(g.name)) || g.name;
      b.addEventListener('click', function () { show(i); });
      seg.appendChild(b);
    });
    root.appendChild(seg);

    var W = 760, H = opts.height || 250, M = { l: 44, r: 10, t: 22, b: 58 };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'bar-svg' }, root);
    var pw = W - M.l - M.r, ph = H - M.t - M.b;
    var gridG = el('g', {}, svg), barsG = el('g', {}, svg);
    el('text', { x: 12, y: M.t + ph / 2, transform: 'rotate(-90 12 ' + (M.t + ph / 2) + ')', 'text-anchor': 'middle', class: 'ts-axis' }, svg).textContent = opts.yLabel || '';

    var n = methods.length, slot = pw / n, bw = Math.min(38, slot * 0.62);
    var items = methods.map(function (m, j) {
      var g = el('g', { class: 'bar-item' }, barsG);
      var rect = el('rect', { x: M.l + j * slot + (slot - bw) / 2, width: bw, rx: 2, fill: colorFor(m) }, g);
      var whisk = el('line', { stroke: '#555', 'stroke-width': 1.2 }, g);
      var val = el('text', { 'text-anchor': 'middle', class: 'bar-val' }, g);
      var lab = el('text', { 'text-anchor': 'end', class: 'bar-lab' + (m.indexOf('GTSE') === 0 ? ' ours' : '') }, g);
      var lx = M.l + j * slot + slot / 2, ly = M.t + ph + 12;
      lab.setAttribute('transform', 'translate(' + lx + ',' + ly + ') rotate(-35)');
      lab.textContent = m;
      g.addEventListener('mouseenter', function () { hover(j); });
      g.addEventListener('mouseleave', function () { hover(null); });
      return { g: g, rect: rect, whisk: whisk, val: val };
    });

    function show(i) {
      Array.prototype.forEach.call(seg.children, function (b, k) { b.classList.toggle('is-active', k === i); });
      groups.forEach(function (g, k) { g.tr.classList.toggle('row-active', k === i); });
      var vals = groups[i].vals;
      var hi = opts.max || Math.max.apply(null, vals.map(function (d) { return d.v + (d.ci || 0); }));
      var lo = Math.min(0, Math.min.apply(null, vals.map(function (d) { return d.v; })));
      hi = hi <= 1 ? 1 : 100;
      function y(v) { return M.t + ph - (v - lo) / (hi - lo) * ph; }
      clear(gridG);
      var step = hi <= 1 ? 0.2 : hi <= 50 ? 10 : 20;
      for (var t = 0; t <= hi + 1e-9; t += step) {
        el('line', { x1: M.l, x2: M.l + pw, y1: y(t), y2: y(t), stroke: t === 0 ? '#bbb' : '#eee', 'stroke-dasharray': t === 0 ? '' : '3 3' }, gridG);
        el('text', { x: M.l - 6, y: y(t) + 4, 'text-anchor': 'end', class: 'ts-tick' }, gridG).textContent = hi <= 1 ? t.toFixed(1) : t;
      }
      items.forEach(function (it, j) {
        var d = vals[j], top = y(Math.max(d.v, 0)), bot = y(Math.min(d.v, 0));
        it.rect.setAttribute('y', top); it.rect.setAttribute('height', Math.max(bot - top, 0.5));
        var cx = M.l + j * slot + slot / 2;
        if (d.ci) {
          it.whisk.setAttribute('x1', cx); it.whisk.setAttribute('x2', cx);
          it.whisk.setAttribute('y1', y(Math.max(d.v - d.ci, lo))); it.whisk.setAttribute('y2', y(Math.min(d.v + d.ci, hi)));
          it.whisk.style.display = '';
        } else it.whisk.style.display = 'none';
        it.val.setAttribute('x', cx);
        it.val.setAttribute('y', (d.ci ? y(Math.min(d.v + d.ci, hi)) : top) - 5);
        it.val.textContent = hi <= 1 ? d.v.toFixed(2) : (d.v % 1 ? d.v.toFixed(1) : d.v);
      });
    }

    function hover(j) {
      items.forEach(function (it, k) { it.g.style.opacity = (j === null || j === k) ? '1' : '0.3'; });
      Array.prototype.forEach.call(table.querySelectorAll('tr'), function (tr) {
        Array.prototype.forEach.call(tr.children, function (c, k) {
          if (k === 0) return;
          c.classList.toggle('col-hot', j !== null && k - 1 === j);
          c.classList.toggle('col-dim', j !== null && k - 1 !== j);
        });
      });
    }
    // hovering a table column highlights the bar too
    Array.prototype.forEach.call(table.querySelectorAll('tr'), function (tr) {
      Array.prototype.forEach.call(tr.children, function (c, k) {
        if (k === 0) return;
        c.addEventListener('mouseenter', function () { hover(k - 1); });
        c.addEventListener('mouseleave', function () { hover(null); });
      });
      tr.addEventListener('click', function () {
        var idx = rows.indexOf(tr);
        if (idx >= 0) show(idx);
      });
    });

    show(opts.initial || 0);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initOccupancy();
    initExplorer();
    initTD();
    initGallery();
    initLegendre();
    barChart('pm-chart', 'pm-table', { yLabel: 'value', initial: 2, label: function (n) { return n.replace('ρ (near)', 'ρ near goals').replace('ρ (far)', 'ρ far goals'); } });
    barChart('gcrl-chart', 'gcrl-table', { yLabel: 'success rate (%)', initial: 7, height: 270 });
    barChart('rew-chart', 'rew-table', { yLabel: 'success rate (%)', initial: 5, max: 100 });
  });
})();
