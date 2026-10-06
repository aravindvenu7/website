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

  // ---------------------------------------------------------------------------
  // 1. Time-score explorer: 1D occupancy measure on a variance-preserving path.
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
      while (yAxis.firstChild) yAxis.removeChild(yAxis.firstChild);
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
      while (bars.firstChild) bars.removeChild(bars.firstChild);
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
    function niceStep(x) {
      var p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
      return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
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
  // 2. Bar charts linked to result tables, with segmented toggles.
  // ---------------------------------------------------------------------------
  function colorFor(name) {
    if (name === 'GTSE') return ACCENT;
    if (name.indexOf('GTSE') === 0) return ACCENT2;
    return GREY;
  }

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

    var cur = 0;
    function show(i) {
      cur = i;
      Array.prototype.forEach.call(seg.children, function (b, k) { b.classList.toggle('is-active', k === i); });
      groups.forEach(function (g, k) { g.tr.classList.toggle('row-active', k === i); });
      var vals = groups[i].vals;
      var hi = opts.max || Math.max.apply(null, vals.map(function (d) { return d.v + (d.ci || 0); }));
      var lo = Math.min(0, Math.min.apply(null, vals.map(function (d) { return d.v; })));
      hi = hi <= 1 ? 1 : 100;
      function y(v) { return M.t + ph - (v - lo) / (hi - lo) * ph; }
      while (gridG.firstChild) gridG.removeChild(gridG.firstChild);
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
    initExplorer();
    barChart('pm-chart', 'pm-table', { yLabel: 'value', initial: 2, label: function (n) { return n.replace('ρ (near)', 'ρ near goals').replace('ρ (far)', 'ρ far goals'); } });
    barChart('gcrl-chart', 'gcrl-table', { yLabel: 'success rate (%)', initial: 7, height: 270 });
    barChart('rew-chart', 'rew-table', { yLabel: 'success rate (%)', initial: 5, max: 100 });
  });
})();
