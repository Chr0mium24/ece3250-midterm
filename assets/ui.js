/* 共享 UI：导航、中/EN/对照切换、模糊搜索、KaTeX 渲染、目录、稳定区域绘图 */
(function () {
  'use strict';
  const PAGES = [
    ['index.html', '速览', 'Overview'],
    ['lectures.html', '讲义', 'Lectures'],
    ['homework.html', '作业', 'Homework'],
    ['methods.html', '题目处理', 'Problem types'],
    ['calc.html', '计算器', 'Calculators'],
  ];
  const MACROS = { '\\R': '\\mathbb{R}', '\\L': '\\mathcal{L}' };
  const LANG_KEY = 'ece3250-lang';
  const bi = (zh, en) => '<span class="zh">' + zh + '</span><span class="en">' + en + '</span>';

  /* ---------- 语言 ---------- */
  function getLang() { try { return localStorage.getItem(LANG_KEY) || 'zh'; } catch (e) { return 'zh'; } }
  function setLang(l) {
    const root = document.documentElement;
    root.classList.remove('L-zh', 'L-en', 'L-both');
    root.classList.add('L-' + l);
    root.setAttribute('lang', l === 'en' ? 'en' : 'zh-CN');
    try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* file:// 下可能不可用 */ }
    document.querySelectorAll('.langsw button').forEach((b) => b.classList.toggle('on', b.dataset.l === l));
    const q = document.getElementById('q');
    if (q) q.placeholder = l === 'en' ? 'Search… (⌘K)' : '搜索 / Search（⌘K）';
    document.dispatchEvent(new CustomEvent('langchange', { detail: l }));
  }
  setLang(getLang());

  function buildNav() {
    const host = document.getElementById('topnav');
    if (!host) return;
    const here = decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
    host.className = 'topnav';
    host.innerHTML =
      '<a class="brand" href="index.html">ECE<b>3250</b> ' + bi('期中速成', 'Midterm') + '</a><nav>' +
      PAGES.map(([href, zh, en]) => '<a href="' + href + '"' + (here === href ? ' class="on"' : '') + '>' + bi(zh, en) + '</a>').join('') +
      '</nav>' +
      '<div class="search"><input id="q" type="search" autocomplete="off" spellcheck="false" aria-label="search"><div class="results" hidden></div></div>' +
      '<div class="langsw" role="group" aria-label="language"><button data-l="zh">中</button><button data-l="en">EN</button><button data-l="both">中+EN</button></div>';
    host.querySelectorAll('.langsw button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.l)));
    setLang(getLang());
    initSearch();
  }

  /* ---------- 模糊搜索 ---------- */
  const PAGE_NAME = Object.fromEntries(PAGES.map(([h, zh, en]) => [h, [zh, en]]));
  const CJK = /[㐀-鿿]/;
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFKC')
      .replace(/\\[a-z]+/g, ' ').replace(/[{}^_$\\]/g, '')
      .replace(/(\d)\.(?=\d)/g, '$1§')
      .replace(/[\s\-–—·,.;:()（），。；：、!！?？'"“”‘’`|/<>=+*[\]]+/g, ' ').replace(/§/g, '.').trim();
  }
  function lev(a, b, max) { // Damerau-Levenshtein（相邻交换），超过 max 提前退出
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        rowMin = Math.min(rowMin, d[i][j]);
      }
      if (rowMin > max) return max + 1;
    }
    return d[a.length][b.length];
  }
  const ALIAS = {
    '劳斯': 'routh', '劳思': 'routh', '赫尔维茨': 'hurwitz', '霍尔维茨': 'hurwitz', '哈里托诺夫': 'kharitonov', '西尔维斯特': 'sylvester',
    '丢番图': 'diophantine', '拉普拉斯': 'laplace', '拉式': '拉氏', '磁悬浮': 'maglev', '磁浮': 'maglev', '倒立摆': 'ipendulum', '传函': '传递函数',
    '终值': 'final value', '直流增益': 'dc gain', '稳态增益': 'dc gain', '可控标准型': 'controller form', '能控标准型': 'controller form', '能观标准型': 'observer form',
    '可观标准型': 'observer form', '比例积分': 'pi', '四个传递函数': 'gang of four', '四兄弟': 'gang of four', '冲击响应': '冲激响应', '阶越': '阶跃',
    '根轨迹': 'root locus', '马格列夫': 'maglev', '作业一': 'hw1', '作业二': 'hw2', '作业1': 'hw1', '作业2': 'hw2',
  };
  function variants(t) {
    const out = [t];
    for (const [k, v] of Object.entries(ALIAS)) if (t.includes(k)) out.push(t.replace(k, ' ' + v + ' ').trim());
    return out;
  }
  // 一个检索词（可能被别名展开成多个词）对一条记录的得分：取各变体的最高分，多词变体取平均
  function scoreVariant(x, tv) {
    const ws = tv.split(/\s+/).filter(Boolean);
    if (ws.length === 1) return scoreTerm(x, ws[0]);
    const sc = ws.map((w) => scoreTerm(x, w));
    return sc.some((v) => !v) ? 0 : sc.reduce((a, b) => a + b, 0) / ws.length;
  }
  function subseq(q, w) { let i = 0; for (const ch of w) if (ch === q[i]) i++; return i === q.length; }
  function bigrams(s) { const t = s.replace(/\s+/g, ''); const out = new Set(); for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2)); if (t.length === 1) out.add(t); return out; }
  let IDX = null;
  function prepIndex() {
    if (IDX || !window.SEARCH_INDEX) return IDX;
    IDX = window.SEARCH_INDEX.map((e) => {
      const title = norm(e.tz + ' ' + e.te), kw = norm(e.kw || ''), body = norm(e.z + ' ' + e.e + ' ' + (e.m || ''));
      const words = new Set((title + ' ' + kw + ' ' + body).split(' ').filter((w) => w.length >= 3 && !CJK.test(w)));
      const twords = new Set((title + ' ' + kw).split(' ').filter((w) => w.length >= 2 && !CJK.test(w)));
      const cj = (x) => bigrams(x.replace(/[^㐀-鿿]/g, ''));
      return { e, title, kw, body, words, twords, tcjk: cj(title + kw), cjk: cj(body) };
    });
    return IDX;
  }
  function scoreTerm(x, t) {
    if (x.title.includes(t)) return 30 + (x.title.startsWith(t) ? 8 : 0);
    if (x.kw.includes(t)) return 22;
    if (x.body.includes(t)) return 10;
    if (CJK.test(t)) {
      if (t.length < 2) return 0;
      const g = bigrams(t.replace(/[^㐀-鿿]/g, '')); if (!g.size) return 0;
      let th = 0, bh = 0; g.forEach((b) => { if (x.tcjk.has(b)) th++; if (x.cjk.has(b)) bh++; });
      const rt = th / g.size, rb = bh / g.size;
      return Math.max(rt >= 0.5 ? 20 * rt : 0, rb >= 0.5 ? 7 * rb : 0);
    }
    if (t.length < 3) return 0;
    let best = 0;
    for (const w of x.twords) {
      if (w.startsWith(t)) best = Math.max(best, 18);
      else if (t.length >= 4 && lev(t, w.slice(0, t.length + 1), 2) <= (t.length >= 7 ? 2 : 1)) best = Math.max(best, 12);
      else if (t.length >= 4 && subseq(t, w)) best = Math.max(best, 7);
    }
    if (best) return best;
    for (const w of x.words) {
      if (w.startsWith(t)) return 9;
      if (t.length >= 4 && lev(t, w, t.length >= 7 ? 2 : 1) <= (t.length >= 7 ? 2 : 1)) best = Math.max(best, 6);
    }
    return best;
  }
  function search(q) {
    const idx = prepIndex(); if (!idx) return [];
    const qn = norm(q); if (!qn) return [];
    // 中文连续串按整体处理，同时允许空格分词
    const terms = qn.split(' ').filter(Boolean);
    const res = [];
    for (const x of idx) {
      let s = 0, miss = 0;
      for (const t of terms) { const v = Math.max(...variants(t).map((tv) => scoreVariant(x, tv))); if (v) s += v; else miss++; }
      if (!s) continue;
      if (terms.length > 1 && x.title.includes(qn)) s += 25;
      s -= miss * 12; if (miss === terms.length) continue;
      s += (x.e.l === 2 ? 2 : 0);
      res.push({ x, s, miss });
    }
    res.sort((a, b) => a.miss - b.miss || b.s - a.s);
    return res.slice(0, 14);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function snippet(text, q) {
    if (!text) return '';
    const lower = text.toLowerCase();
    const terms = norm(q).split(' ').filter(Boolean).sort((a, b) => b.length - a.length);
    let pos = -1, len = 0;
    for (const t of terms) { const p = lower.indexOf(t); if (p >= 0) { pos = p; len = t.length; break; } }
    if (pos < 0) return esc(text.slice(0, 90)) + (text.length > 90 ? '…' : '');
    const a = Math.max(0, pos - 36), b = Math.min(text.length, pos + len + 60);
    return (a > 0 ? '…' : '') + esc(text.slice(a, pos)) + '<mark>' + esc(text.slice(pos, pos + len)) + '</mark>' + esc(text.slice(pos + len, b)) + (b < text.length ? '…' : '');
  }
  function initSearch() {
    const input = document.getElementById('q'); if (!input) return;
    const box = input.parentElement.querySelector('.results');
    let sel = 0, items = [];
    const lang = () => (document.documentElement.classList.contains('L-en') ? 'en' : 'zh');
    function render() {
      const q = input.value;
      if (!q.trim()) { box.hidden = true; return; }
      if (!window.SEARCH_INDEX) { box.hidden = false; box.innerHTML = '<div class="r-empty">' + bi('搜索索引未加载', 'Search index not loaded') + '</div>'; return; }
      items = search(q); sel = 0;
      box.hidden = false;
      if (!items.length) { box.innerHTML = '<div class="r-empty">' + bi('没找到，换个关键词试试（中英文都行）', 'No match — try another keyword (English or Chinese)') + '</div>'; return; }
      const L = lang();
      box.innerHTML = items.map(({ x }, i) => {
        const e = x.e, pn = PAGE_NAME[e.p] || [e.p, e.p];
        const title = L === 'en' ? (e.te || e.tz) : (e.tz || e.te);
        const sub = L === 'en' ? snippet(e.e || e.z, q) : snippet(e.z || e.e, q);
        return '<a class="r' + (i === sel ? ' sel' : '') + '" href="' + e.p + '#' + e.id + '"><span class="r-page">' + (L === 'en' ? pn[1] : pn[0]) + '</span><span class="r-title">' + esc(title) + '</span><span class="r-snip">' + sub + '</span></a>';
      }).join('');
    }
    function move(d) {
      const links = box.querySelectorAll('a.r'); if (!links.length) return;
      sel = (sel + d + links.length) % links.length;
      links.forEach((a, i) => a.classList.toggle('sel', i === sel));
      links[sel].scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { const a = box.querySelectorAll('a.r')[sel]; if (a) { e.preventDefault(); a.click(); } }
      else if (e.key === 'Escape') { box.hidden = true; input.blur(); }
    });
    box.addEventListener('click', (e) => {
      const a = e.target.closest('a.r'); if (!a) return;
      box.hidden = true;
      const [page, id] = a.getAttribute('href').split('#');
      const here = decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
      if (page === here) { e.preventDefault(); goTo(id); history.replaceState(null, '', '#' + id); }
    });
    document.addEventListener('click', (e) => { if (!input.parentElement.contains(e.target)) box.hidden = true; });
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName))) { e.preventDefault(); input.focus(); input.select(); }
    });
    document.addEventListener('langchange', () => { if (!box.hidden) render(); });
  }
  function goTo(id) {
    const el = document.getElementById(id); if (!el) return;
    let p = el.parentElement; while (p) { if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; }
    el.scrollIntoView({ block: 'start' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  /* ---------- KaTeX ---------- */
  function renderMath(el) {
    if (!window.renderMathInElement) return;
    window.renderMathInElement(el || document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
      macros: MACROS,
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
    });
  }
  function tex(s, display) {
    if (!window.katex) return s;
    return window.katex.renderToString(s, { displayMode: !!display, throwOnError: false, macros: MACROS });
  }

  /* ---------- 目录 ---------- */
  function buildToc() {
    const toc = document.querySelector('.toc[data-auto]');
    if (!toc) return;
    const main = document.querySelector('main');
    const hs = [...main.querySelectorAll('h2[id], h3[id][data-toc]')];
    toc.innerHTML = '<div class="toc-title">' + bi('目录', 'Contents') + '</div>' + hs.map((h) => {
      let label;
      if (h.dataset.zh || h.dataset.en) label = bi(h.dataset.zh || '', h.dataset.en || h.dataset.zh || '');
      else { const c = h.cloneNode(true); c.querySelectorAll('.tags,.lno').forEach((n) => n.remove()); label = (h.querySelector('.lno') ? h.querySelector('.lno').textContent + ' ' : '') + c.innerHTML; }
      return '<a href="#' + h.id + '"' + (h.tagName === 'H3' ? ' class="sub"' : '') + '>' + label + '</a>';
    }).join('');
    const links = [...toc.querySelectorAll('a')];
    const onScroll = () => {
      let cur = null;
      for (const h of hs) { if (h.getBoundingClientRect().top < 120) cur = h.id; else break; }
      links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function wireToolbar() {
    document.querySelectorAll('[data-expand]').forEach((b) => b.addEventListener('click', () => {
      const open = b.getAttribute('data-expand') === 'open';
      document.querySelectorAll('main details').forEach((d) => { d.open = open; });
    }));
  }

  /* ---------- 二参数稳定区域图 ---------- */
  function niceStep(range) {
    const raw = range / 6, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function regionPlot(canvas, opt) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 540, H = canvas.clientHeight || Math.round(W * 0.78);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = { l: 52, r: 14, t: 12, b: 40 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const [x0, x1] = opt.xr, [y0, y1] = opt.yr;
    const X = (x) => m.l + ((x - x0) / (x1 - x0)) * pw;
    const Y = (y) => m.t + (1 - (y - y0) / (y1 - y0)) * ph;
    ctx.clearRect(0, 0, W, H);
    const N = opt.res || 170, NY = Math.round(N * ph / pw);
    ctx.fillStyle = css('--green') || '#1d7a4b'; ctx.globalAlpha = 0.32;
    let count = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < NY; j++) {
      const x = x0 + ((i + 0.5) / N) * (x1 - x0), y = y1 - ((j + 0.5) / NY) * (y1 - y0);
      let st = false; try { st = opt.f(x, y); } catch (e) { st = false; }
      if (st) { count++; ctx.fillRect(m.l + (i * pw) / N, m.t + (j * ph) / NY, pw / N + 0.6, ph / NY + 0.6); }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css('--line') || '#ddd'; ctx.fillStyle = css('--muted') || '#666';
    ctx.lineWidth = 1; ctx.font = '12px -apple-system, sans-serif';
    const sx = niceStep(x1 - x0), sy = niceStep(y1 - y0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx) {
      const px = X(v); ctx.beginPath(); ctx.moveTo(px, m.t); ctx.lineTo(px, m.t + ph); ctx.stroke();
      ctx.fillText(+v.toPrecision(6) + '', px, m.t + ph + 5);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy) {
      const py = Y(v); ctx.beginPath(); ctx.moveTo(m.l, py); ctx.lineTo(m.l + pw, py); ctx.stroke();
      ctx.fillText(+v.toPrecision(6) + '', m.l - 6, py);
    }
    ctx.strokeStyle = css('--ink') || '#222'; ctx.lineWidth = 1.3;
    if (x0 <= 0 && x1 >= 0) { ctx.beginPath(); ctx.moveTo(X(0), m.t); ctx.lineTo(X(0), m.t + ph); ctx.stroke(); }
    if (y0 <= 0 && y1 >= 0) { ctx.beginPath(); ctx.moveTo(m.l, Y(0)); ctx.lineTo(m.l + pw, Y(0)); ctx.stroke(); }
    ctx.strokeRect(m.l, m.t, pw, ph);
    (opt.curves || []).forEach((cv) => {
      ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
      ctx.strokeStyle = cv.color || css('--red'); ctx.lineWidth = 2; ctx.setLineDash(cv.dash || [6, 4]);
      ctx.beginPath(); let started = false;
      for (let i = 0; i <= 600; i++) {
        const x = x0 + (i / 600) * (x1 - x0), y = cv.f(x);
        if (!isFinite(y) || y < y0 - 3 * (y1 - y0) || y > y1 + 3 * (y1 - y0)) { started = false; continue; }
        if (!started) { ctx.moveTo(X(x), Y(y)); started = true; } else ctx.lineTo(X(x), Y(y));
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    });
    // 自动边界：每个条件 g(x,y)=0 的等值线（marching squares），只画两侧稳定性不同的那一段
    if (opt.contours && opt.contours.length) {
      const NX = N, NYc = NY;
      const gx = (i) => x0 + (i / NX) * (x1 - x0), gy = (j) => y1 - (j / NYc) * (y1 - y0);
      const px = (i) => m.l + (i / NX) * pw, py = (j) => m.t + (j / NYc) * ph;
      const test = (i, j) => { const x = gx(i), y = gy(j); if (x < x0 || x > x1 || y < y0 || y > y1) return null; try { return !!opt.f(x, y); } catch (e) { return null; } };
      ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
      ctx.strokeStyle = css('--red') || '#b3122e'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (const g of opt.contours) {
        const V = [];
        for (let j = 0; j <= NYc; j++) { const row = new Float64Array(NX + 1); for (let i = 0; i <= NX; i++) { let v = NaN; try { v = g(gx(i), gy(j)); } catch (e) { v = NaN; } row[i] = v; } V.push(row); }
        ctx.beginPath();
        for (let j = 0; j < NYc; j++) for (let i = 0; i < NX; i++) {
          const c = [[i, j, V[j][i]], [i + 1, j, V[j][i + 1]], [i + 1, j + 1, V[j + 1][i + 1]], [i, j + 1, V[j + 1][i]]];
          if (c.some((q) => !isFinite(q[2]))) continue;
          const pts = [];
          for (let k = 0; k < 4; k++) {
            const [ai, aj, av] = c[k], [bi, bj, bv] = c[(k + 1) % 4];
            if ((av > 0) !== (bv > 0)) { const t = av / (av - bv); pts.push([ai + t * (bi - ai), aj + t * (bj - aj)]); }
          }
          for (let k = 0; k + 1 < pts.length; k += 2) {
            const [p1, p2] = [pts[k], pts[k + 1]];
            const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
            let nx = -(p2[1] - p1[1]), ny = p2[0] - p1[0]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
            const sA = test(mx + 1.2 * nx, my + 1.2 * ny), sB = test(mx - 1.2 * nx, my - 1.2 * ny);
            if (sA === null || sB === null || sA === sB) continue; // 不是稳定区域的边界就不画
            ctx.moveTo(px(p1[0]), py(p1[1])); ctx.lineTo(px(p2[0]), py(p2[1]));
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = css('--ink') || '#222'; ctx.font = 'italic 14px "Times New Roman", serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(opt.xl || 'x', m.l + pw - 4, m.t + ph - 4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(opt.yl || 'y', m.l + 6, m.t + 4);
    if (opt.readout) {
      canvas.onmousemove = (e) => {
        const r = canvas.getBoundingClientRect();
        const x = x0 + ((e.clientX - r.left - m.l) / pw) * (x1 - x0), y = y1 - ((e.clientY - r.top - m.t) / ph) * (y1 - y0);
        if (x < x0 || x > x1 || y < y0 || y > y1) { opt.readout.textContent = ''; return; }
        let st = false; try { st = opt.f(x, y); } catch (err) { st = false; }
        const en = document.documentElement.classList.contains('L-en');
        opt.readout.textContent = (opt.xl || 'x') + ' = ' + x.toFixed(3) + ',  ' + (opt.yl || 'y') + ' = ' + y.toFixed(3) + '  →  ' + (st ? (en ? 'stable' : '稳定') : (en ? 'unstable' : '不稳定'));
      };
    }
    return count;
  }

  // 比所在段落还宽的行内公式：单独给它横向滚动，不撑破版面
  function markWide() {
    document.querySelectorAll('main .katex:not(.katex-display .katex)').forEach((k) => {
      k.classList.remove('wide');
      const host = k.parentElement && k.parentElement.closest('p, li, td, div, summary');
      if (host && host.clientWidth && k.getBoundingClientRect().width > host.clientWidth - 4) k.classList.add('wide');
    });
  }

  window.UI = { tex, renderMath, regionPlot, PAGES, bi, setLang, getLang, search, goTo };
  document.addEventListener('DOMContentLoaded', () => {
    buildNav(); buildToc(); wireToolbar(); renderMath(document.querySelector('main') || document.body);
    markWide(); window.addEventListener('resize', markWide);
    document.addEventListener('toggle', markWide, true);
    if (location.hash) setTimeout(() => goTo(decodeURIComponent(location.hash.slice(1))), 60);
    document.body.dataset.ready = '1';
  });
  window.addEventListener('error', (e) => { document.body.dataset.errs = (document.body.dataset.errs || '') + (e.message || 'err') + ' | '; });
})();
