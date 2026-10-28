// Interactive visualizations for the GTSE project page.
(function () {
  var ACCENT = '#641e16', ACCENT2 = '#c27c73', GREY = '#c9c9c9', INK = '#111', MUTED = '#888';
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
  // Seeded RNG so the page looks the same on every load.
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Occupancy measure on a tabular maze with a random-walk policy.
  //    A rollout takes action a, follows pi, and stops after each step w.p. 1 - gamma;
  //    its stopping cell is a sample from d(. | s, a). Cells are shaded by stopping frequency.
  // ---------------------------------------------------------------------------
  var MAZE = [
    '#################',
    '#.......#.......#',
    '#.#####.#.#####.#',
    '#.#...........#.#',
    '#.#.###.#.###.#.#',
    '#...#...#...#...#',
    '###.#.#####.#.###',
    '#.....#...#.....#',
    '#.###.#.#.#.###.#',
    '#.....#.#.......#',
    '#################'
  ];

  function initOccupancy() {
    var cv = document.getElementById('occ-canvas');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var NR = MAZE.length, NC = MAZE[0].length, W = 760, CS = W / NC, H = Math.round(NR * CS);
    var dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
    var DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];  // up, right, down, left
    var cells = [], idx = {};
    MAZE.forEach(function (row, r) { for (var c = 0; c < NC; c++) if (row[c] === '.') { idx[r * NC + c] = cells.length; cells.push([r, c]); } });
    function at(r, c) { return MAZE[r] && MAZE[r][c] === '.' ? idx[r * NC + c] : -1; }
    var nbr = cells.map(function (rc) { return DIRS.map(function (d) { return at(rc[0] + d[0], rc[1] + d[1]); }).filter(function (j) { return j >= 0; }); });
    function move(i, a) { var j = at(cells[i][0] + DIRS[a][0], cells[i][1] + DIRS[a][1]); return j >= 0 ? j : i; }

    var R = rng(5), start = at(3, 3), act = 1, gamma = 0.9, exact = [], counts = [], landed = 0;
    var playing = true, hover = -1;
    function computeExact() {
      var v = new Float64Array(cells.length), d = new Float64Array(cells.length), w = 1 - gamma;
      v[move(start, act)] = 1;
      for (var t = 0; t < 3000 && w > 1e-9; t++) {
        for (var i = 0; i < v.length; i++) d[i] += w * v[i];
        var nv = new Float64Array(cells.length);
        for (var j = 0; j < v.length; j++) if (v[j]) { var nb = nbr[j], p = v[j] / nb.length; for (var q = 0; q < nb.length; q++) nv[nb[q]] += p; }
        v = nv; w *= gamma;
      }
      exact = d;
    }
    function reset() {
      computeExact(); counts = new Float64Array(cells.length); landed = 0;
      for (var i = 0; i < 100; i++) rollout();  // start from a coarse histogram instead of a blank maze
    }
    function rollout() { var i = move(start, act); while (R() < gamma) i = nbr[i][Math.floor(R() * nbr[i].length)]; counts[i]++; landed++; }

    var gSl = document.getElementById('occ-gamma'), gOut = document.getElementById('occ-gamma-val');
    var hoverOut = document.getElementById('occ-hover'), hoverEst = document.getElementById('occ-hover-est');
    var countOut = document.getElementById('occ-count'), play = document.getElementById('occ-play'), exactBox = document.getElementById('occ-exact');
    var pad = document.getElementById('occ-dpad');

    function cx(i) { return (cells[i][1] + 0.5) * CS; }
    function cy(i) { return (cells[i][0] + 0.5) * CS; }
    var NAVY = '#0b2545';
    function draw() {
      ctx.clearRect(0, 0, W, H);
      var field = exactBox.checked ? exact : counts, mx = 1e-12;
      for (var i = 0; i < field.length; i++) if (field[i] > mx) mx = field[i];
      ctx.fillStyle = '#c9d3de'; ctx.fillRect(0, 0, W, H);
      cells.forEach(function (rc, i) {
        var v = Math.pow(field[i] / mx, 0.5);
        ctx.fillStyle = 'rgb(' + Math.round(247 + (31 - 247) * v) + ',' + Math.round(250 + (78 - 250) * v) + ',' + Math.round(253 + (121 - 253) * v) + ')';
        ctx.fillRect(rc[1] * CS + 0.5, rc[0] * CS + 0.5, CS - 1, CS - 1);
      });
      if (hover >= 0) { ctx.strokeStyle = NAVY; ctx.lineWidth = 1.5; ctx.strokeRect(cells[hover][1] * CS + 2, cells[hover][0] * CS + 2, CS - 4, CS - 4); }
      // start state and action
      var sx = cx(start), sy = cy(start), d0 = DIRS[act];
      ctx.strokeStyle = NAVY; ctx.fillStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, CS * 0.3, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = NAVY; ctx.font = '500 14px Barlow, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('s', sx, sy + 1);
      var ax = sx + d0[1] * CS * 0.3, ay = sy + d0[0] * CS * 0.3, bx = sx + d0[1] * CS * 0.78, by = sy + d0[0] * CS * 0.78;
      // action arrow: white with a navy outline so it reads on both light and dark cells
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx - d0[1] * 6, by - d0[0] * 6);
      ctx.strokeStyle = NAVY; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + d0[1] * 2, by + d0[0] * 2);
      ctx.lineTo(bx - d0[1] * 9 - d0[0] * 7, by - d0[0] * 9 + d0[1] * 7); ctx.lineTo(bx - d0[1] * 9 + d0[0] * 7, by - d0[0] * 9 - d0[1] * 7); ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = NAVY; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
    }
    function updatePanel() {
      gOut.textContent = gamma.toFixed(2); gSl.value = gamma;
      Array.prototype.forEach.call(pad.children, function (bt) { bt.classList.toggle('is-active', +bt.getAttribute('data-a') === act); });
      if (hover >= 0) {
        hoverOut.textContent = exact[hover].toFixed(3);
        hoverEst.textContent = landed ? 'estimate from rollouts: ' + (counts[hover] / landed).toFixed(3) : '';
      } else { hoverOut.textContent = '–'; hoverEst.textContent = ''; }
      countOut.textContent = landed + ' rollouts';
    }
    var owed = 0;
    var AUTO = 1000;  // automatic rollouts stop here; the +1000 button can add more
    function step(dt) { owed += dt * 150; while (owed >= 1 && landed < AUTO) { rollout(); owed--; } }

    var raf = null, last = 0, visible = false;
    function tick(ts) {
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (playing) step(dt);
      draw(); updatePanel();
      raf = visible ? requestAnimationFrame(tick) : null;
    }
    function redraw() { updatePanel(); if (!raf) draw(); }

    gSl.addEventListener('input', function () { gamma = +gSl.value; reset(); redraw(); });
    Array.prototype.forEach.call(pad.children, function (bt) { bt.addEventListener('click', function () { act = +bt.getAttribute('data-a'); reset(); redraw(); }); });
    play.addEventListener('click', function () { playing = !playing; play.textContent = playing ? 'Pause' : 'Play'; });
    document.getElementById('occ-ff').addEventListener('click', function () { for (var i = 0; i < 1000; i++) rollout(); redraw(); });
    exactBox.addEventListener('change', redraw);
    function cellAt(e) {
      var r = cv.getBoundingClientRect();
      return at(Math.floor((e.clientY - r.top) / r.height * NR), Math.floor((e.clientX - r.left) / r.width * NC));
    }
    cv.addEventListener('pointermove', function (e) { hover = cellAt(e); redraw(); });
    cv.addEventListener('pointerleave', function () { hover = -1; redraw(); });
    cv.addEventListener('click', function (e) { var c = cellAt(e); if (c >= 0) { start = c; reset(); redraw(); } });

    reset(); updatePanel(); draw();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { visible = e.isIntersecting; if (visible && !raf) { last = 0; raf = requestAnimationFrame(tick); } });
      }, { threshold: 0.15 }).observe(cv);
    } else { visible = true; raf = requestAnimationFrame(tick); }
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
    var play = document.getElementById('ts-play');

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
      var bw = pw / n;
      for (var b = 0; b < n; b++) {
        var kb = b / n, vb = timeScore(g, kb);
        el('rect', { x: kx(kb) + 0.5, width: Math.max(bw - 1, 0.5), y: Math.min(ty(vb), ty(0)), height: Math.abs(ty(vb) - ty(0)), fill: 'rgba(0,0,0,0.07)' }, bars);
      }
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
  // 3. Interactive main figure: densities along the probability path, with the
  //    finite-difference view of the time score between k_i and k_i + dk.
  // ---------------------------------------------------------------------------
  function initPathFigure() {
    var root = document.getElementById('pf');
    if (!root) return;
    var kSl = document.getElementById('pf-k'), dkSl = document.getElementById('pf-dk'), gSl = document.getElementById('pf-g');
    var kOut = document.getElementById('pf-k-val'), dkOut = document.getElementById('pf-dk-val'), gOut = document.getElementById('pf-g-val');
    var formula = document.getElementById('pf-formula');
    var state = { k: 0.75, dk: 0.15, g: 2.7 };

    // k_i and k_i + dk are the two large panels; k = 0 and k = 1 are small panels at the ends of the path-time axis.
    var W = 1000, H = 310, AY = 262, AX0 = 140, AX1 = 860;
    var SLOTS = [10, 170, 560, 880], PWS = [110, 270, 270, 110], PB = [AY + 18, 175, 175, AY + 18], PHS = [55, 150, 150, 55];
    var XMIN = -4.5, XMAX = 4.5;
    var strip = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ts-svg' }, document.getElementById('pf-strip'));
    function ax(k) { return AX0 + k * (AX1 - AX0); }
    function px(slot, x) { return SLOTS[slot] + (x - XMIN) / (XMAX - XMIN) * PWS[slot]; }
    var xs = []; for (var i = 0; i <= 160; i++) xs.push(XMIN + (XMAX - XMIN) * i / 160);
    var panels = SLOTS.map(function (left, s) {
      var g = el('g', {}, strip), PW = PWS[s];
      el('line', { x1: left, x2: left + PW, y1: PB[s], y2: PB[s], stroke: '#999' }, g);
      return {
        fill: el('path', { fill: 'rgba(100,30,22,0.08)' }, g), line: el('path', { fill: 'none', stroke: ACCENT, 'stroke-width': 2 }, g),
        gl: el('line', { stroke: '#c0392b', 'stroke-dasharray': '2 3', 'stroke-width': 1.5 }, g), gd: el('circle', { r: 5.5, fill: '#c0392b' }, g),
        gt: el('text', { class: 'ts-glab', style: 'fill:#2e7d32' }, g),
        lab: el('text', { x: left + PW / 2, y: PB[s] + (s === 1 || s === 2 ? 24 : 20), 'text-anchor': 'middle', class: 'ts-axis', style: 'font-size:' + (s === 1 || s === 2 ? 16 : 13) + 'px; fill:#111' }, g)
      };
    });
    var dl1 = el('line', { stroke: INK, 'stroke-dasharray': '5 4' }, strip), dl2 = el('line', { stroke: INK, 'stroke-dasharray': '5 4' }, strip);
    var dArrow = el('line', { stroke: '#c0392b', 'stroke-width': 3, 'stroke-linecap': 'round' }, strip);
    // path-time axis
    el('line', { x1: AX0, x2: AX1, y1: AY, y2: AY, stroke: INK, 'stroke-width': 2.5 }, strip);
    el('text', { x: (AX0 + AX1) / 2, y: AY + 28, 'text-anchor': 'middle', class: 'ts-axis', style: 'font-size:15px' }, strip).textContent = 'probability-path time k   (drag kᵢ)';
    var conn = [1, 2].map(function () { return el('line', { stroke: '#ccc', 'stroke-dasharray': '2 3' }, strip); });
    var ticks = [0, 1, 2, 3].map(function () { return el('line', { stroke: INK, 'stroke-width': 2 }, strip); });
    var handle = el('circle', { r: 8, fill: ACCENT, stroke: '#fff', 'stroke-width': 2, style: 'cursor:ew-resize' }, strip);

    function tex(node, src) {
      if (window.katex) window.katex.render(src, node, { throwOnError: false, displayMode: true });
      else node.textContent = src;
    }
    function render() {
      var g = state.g, K = [0, state.k, Math.min(state.k + state.dk, 1), 1];
      kSl.value = state.k; kOut.textContent = K[1].toFixed(2); dkSl.value = state.dk; dkOut.textContent = state.dk.toFixed(2);
      gSl.value = g; gOut.textContent = g.toFixed(2);
      // k_i and k_i + dk share a y-scale so the two density heights at g+ compare directly
      var dens = K.map(function (k) { return xs.map(function (x) { return Math.exp(logpk(x, k)); }); });
      var mx = dens.map(function (d) { return Math.max.apply(null, d); });
      mx[1] = mx[2] = Math.max(mx[1], mx[2]);
      var labs = ['k = 0:  N(0, I)', 'kᵢ = ' + K[1].toFixed(2), 'kᵢ + Δk = ' + K[2].toFixed(2), 'k = 1:  d(· | s, a)'], gy = [];
      panels.forEach(function (p, s) {
        function py(v) { return PB[s] - v / mx[s] * PHS[s] * 0.9; }
        var d = xs.map(function (x, j) { return (j ? 'L' : 'M') + px(s, x).toFixed(1) + ',' + py(dens[s][j]).toFixed(1); }).join('');
        p.line.setAttribute('d', d);
        p.fill.setAttribute('d', d + 'L' + px(s, XMAX) + ',' + PB[s] + 'L' + px(s, XMIN) + ',' + PB[s] + 'Z');
        var y = py(Math.exp(logpk(g, K[s]))); gy.push(y);
        p.gd.setAttribute('cx', px(s, g)); p.gd.setAttribute('cy', y);
        p.gl.setAttribute('x1', px(s, g)); p.gl.setAttribute('x2', px(s, g)); p.gl.setAttribute('y1', y); p.gl.setAttribute('y2', PB[s]);
        p.gt.setAttribute('x', px(s, g) + 9); p.gt.setAttribute('y', y - 6); p.gt.textContent = 'g⁺';
        p.lab.textContent = labs[s];
      });
      // dashed levels at p_{k_i}(g+) and p_{k_i+dk}(g+), red arrow between them in the gap
      var x1 = px(1, g), x2 = px(2, g), mid = (SLOTS[1] + PWS[1] + SLOTS[2]) / 2;
      dl1.setAttribute('x1', x1); dl1.setAttribute('x2', mid + 30); dl1.setAttribute('y1', gy[1]); dl1.setAttribute('y2', gy[1]);
      dl2.setAttribute('x1', mid - 30); dl2.setAttribute('x2', x2); dl2.setAttribute('y1', gy[2]); dl2.setAttribute('y2', gy[2]);
      dArrow.setAttribute('x1', mid); dArrow.setAttribute('x2', mid); dArrow.setAttribute('y1', gy[1]); dArrow.setAttribute('y2', gy[2]);
      K.forEach(function (k, s) {
        ticks[s].setAttribute('x1', ax(k)); ticks[s].setAttribute('x2', ax(k)); ticks[s].setAttribute('y1', AY - 8); ticks[s].setAttribute('y2', AY + 8);
        if (s === 1 || s === 2) { var c = conn[s - 1]; c.setAttribute('x1', ax(k)); c.setAttribute('x2', SLOTS[s] + PWS[s] / 2); c.setAttribute('y1', AY - 9); c.setAttribute('y2', PB[s] + 32); }
      });
      handle.setAttribute('cx', ax(K[1])); handle.setAttribute('cy', AY);
    }

    tex(formula, '\\log \\frac{p_{k+\\Delta k}(g^+ \\mid s,a)}{p_{k}(g^+ \\mid s,a)} \\Big/ \\Delta k \\;\\approx\\; \\partial_k \\log p_k(g^+ \\mid s,a)');
    kSl.addEventListener('input', function () { state.k = +kSl.value; render(); });
    dkSl.addEventListener('input', function () { state.dk = +dkSl.value; render(); });
    gSl.addEventListener('input', function () { state.g = +gSl.value; render(); });
    // drag g+ in any panel, drag k_i on the axis
    var drag = null;
    function svgPt(e) { var r = strip.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
    function apply(e) {
      var p = svgPt(e);
      if (drag === 'k') state.k = Math.max(0, Math.min(0.95, (p[0] - AX0) / (AX1 - AX0)));
      else {
        var s = 0; for (var i = 0; i < 4; i++) if (p[0] >= SLOTS[i] - 10) s = i;
        state.g = Math.max(-4.4, Math.min(4.4, XMIN + (p[0] - SLOTS[s]) / PWS[s] * (XMAX - XMIN)));
      }
      render();
    }
    strip.addEventListener('pointerdown', function (e) {
      var p = svgPt(e);
      drag = p[1] > AY - 22 && p[0] > AX0 - 10 && p[0] < AX1 + 10 ? 'k' : 'g';
      strip.setPointerCapture(e.pointerId); apply(e);
    });
    strip.addEventListener('pointermove', function (e) { if (drag) apply(e); });
    strip.addEventListener('pointerup', function () { drag = null; });
    render();
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
  // Panel left edges and size measured from rank_final.png (white gaps between subplots).
  var PANEL_X = [8, 348, 689, 1029, 1370, 1710, 2050], PANEL_Y = [0, 378], PANEL_W = 343, PANEL_H = 368;
  function drawPanel(cv, name) {
    var c = PANELS[name], sx = PANEL_X[c[0]], sy = PANEL_Y[c[1]];
    cv.width = PANEL_W; cv.height = PANEL_H;
    function go() { var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PANEL_W, PANEL_H); ctx.drawImage(rankImg, sx, sy, PANEL_W, PANEL_H, 0, 0, PANEL_W, PANEL_H); }
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
      { lab: 'L = 0', name: 'GTSE-b₀', toy: 0.82 },
      { lab: 'L = 2', name: 'GTSE-b₂', toy: 0.88 },
      { lab: 'L = 10', name: 'GTSE-b₁₀', toy: 0.88 },
      { lab: 'L = ∞', name: 'GTSE-b', toy: 0.96 }
    ];
    var cv = document.getElementById('leg-canvas');
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
    initPathFigure();
    initGallery();
    initLegendre();
    barChart('pm-chart', 'pm-table', { yLabel: 'value', initial: 2, label: function (n) { return n.replace('ρ (near)', 'ρ near goals').replace('ρ (far)', 'ρ far goals'); } });
    barChart('gcrl-chart', 'gcrl-table', { yLabel: 'success rate (%)', initial: 7, height: 270 });
    barChart('rew-chart', 'rew-table', { yLabel: 'success rate (%)', initial: 5, max: 100 });
  });
})();
