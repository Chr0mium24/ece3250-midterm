/* 计算器页面逻辑（依赖 CM 与 UI） */
(function () {
  'use strict';
  const { Q, P, RF } = CM;
  const $ = (id) => document.getElementById(id);
  const bi = (zh, en) => UI.bi(zh, en);
  const T = (s, d) => UI.tex(s, d);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const VARTEX = { t: '\\tau', tau: '\\tau', 'τ': '\\tau', KP: 'K_P', KI: 'K_I', KD: 'K_D', Kp: 'K_P', Ki: 'K_I', Kd: 'K_D' };
  const vt = (v) => VARTEX[v] || v;
  const lbl = (zh, en) => '<div class="lbl2">' + bi(zh, en) + '</div>';
  const verdict = (cls, zh, en) => '<div class="verdict ' + cls + '">' + bi(zh, en) + '</div>';
  const disp = (s) => '<div class="math-scroll">' + T(s, true) + '</div>';
  const ratTeX = (n, d) => (P.deg(d) <= 0 && P.trim(d).length && P.trim(d)[0].isOne() ? P.toTeX(n) : '\\dfrac{' + P.toTeX(n) + '}{' + P.toTeX(d) + '}');
  const isStableRoots = (rs) => rs.every((r) => r[0] < -1e-10);
  const descNum = (p) => P.toDesc(p).map((c) => c.toNumber());
  const rootsOf = (p) => (P.deg(p) >= 1 ? CM.rootsQ(p) : []);
  const rootsList = (p) => { const r = CM.rootsExactTeX(p); return r.length ? T(r.join(',\\ ')) : '—'; };

  function run(outId, fn) {
    const out = $(outId);
    try { out.innerHTML = fn(); }
    catch (e) {
      const m = String(e.message || e);
      // 核心库的报错是 “中文 / English” 形式，拆开按语言显示
      const i = m.indexOf(' / ');
      const body = m.startsWith('<span') ? m : (i > 0 && /[一-鿿]/.test(m.slice(0, i)) ? bi(esc(m.slice(0, i)), esc(m.slice(i + 3))) : esc(m));
      out.innerHTML = '<p class="err">' + bi('出错：', 'Error: ') + body + '</p>'; console.error(e);
    }
  }

  /* ---------- Routh 表渲染 ---------- */
  function routhTable(tab, cellTeX, bad) {
    const n = tab.n;
    let h = '<div class="tbl-wrap"><table class="routh">';
    tab.rows.forEach((row, i) => {
      h += '<tr><td class="row-h">' + T('s^{' + (n - i) + '}') + '</td>';
      row.forEach((c, j) => {
        const cls = (bad && bad.i === i && bad.j === j) ? 'badcell' : (j === 0 ? 'first' : '');
        h += '<td class="' + cls + '">' + T(cellTeX(c)) + '</td>';
      });
      h += '</tr>';
    });
    if (tab.stopAt) h += '<tr><td class="row-h">' + T('s^{' + (n - tab.stopAt) + '}') + '</td><td class="badcell">' + bi('无法计算', 'undefined') + '</td></tr>';
    return h + '</table></div>';
  }
  function skTeX(sk, param) { // s 的多项式（系数是参数多项式）
    const v = vt(param);
    let s = '';
    for (let i = sk.length - 1; i >= 0; i--) {
      const c = P.trim(sk[i]); if (!c.length) continue;
      const sv = i === 0 ? '' : i === 1 ? 's' : 's^{' + i + '}';
      let ct = P.toTeX(c, v);
      const nterms = c.filter((x) => !x.isZero()).length;
      if (nterms > 1) ct = '(' + ct + ')';
      else if (sv && ct === '1') ct = '';
      else if (sv && ct === '-1') ct = '-';
      if (s && !ct.startsWith('-')) s += '+';
      s += ct + sv;
    }
    return s || '0';
  }

  function routhCalc() {
    const src = $('routh-in').value, param = $('routh-param').value.trim();
    let h = '';
    if (!param) {
      const poly = CM.polyS(src);
      if (P.deg(poly) < 1) throw new Error(bi('多项式至少一阶', 'need degree ≥ 1'));
      const desc = P.toDesc(poly);
      const r = CM.routhQ(desc);
      h += disp('a(s)=' + P.toTeX(poly));
      const nec = desc.every((c) => c.sign() === desc[0].sign());
      h += '<p>' + bi('必要条件（系数同号且不缺项）：', 'Necessary condition (all coefficients same sign, none missing): ') + (nec ? bi('满足', 'satisfied') : '<b class="err">' + bi('不满足 ⟹ 直接判不稳定', 'violated ⟹ unstable') + '</b>') + '</p>';
      if (r.flipped) h += '<p class="muted small">' + bi('首项为负，已整体乘 −1。', 'Leading coefficient negative — multiplied by −1.') + '</p>';
      h += lbl('Routh 表', 'Routh table') + routhTable(r, (c) => CM.qTeX(c), r.bad);
      if (r.stable) h += verdict('ok', '第一列全为正 ⟹ 稳定', 'First column all positive ⟹ stable');
      else if (r.stopAt) h += verdict('bad', '出现 0，表无法继续 ⟹ 不稳定（课程判法）', 'A zero appears and the table stops ⟹ not stable (course rule)');
      else h += verdict('bad', '出现非正元素 ' + T(CM.qTeX(r.bad.v)) + ' ⟹ 不稳定', 'Non-positive entry ' + T(CM.qTeX(r.bad.v)) + ' ⟹ unstable');
      if (r.rhp !== null && !r.stable) h += '<p class="muted small">' + bi('（课外补充）第一列变号 ' + r.rhp + ' 次 = 右半平面根的个数。', '(Extra) ' + r.rhp + ' sign change(s) in the first column = number of RHP roots.') + '</p>';
      h += '<p>' + bi('数值求根核对：', 'Numerical roots for checking: ') + rootsList(poly) + '</p>';
      return h;
    }
    const res = CM.routhParam(src, param);
    const sk = CM.polySK(src, param);
    h += disp('a(s)=' + skTeX(sk, param));
    h += lbl('Routh 表（' + param + ' 的有理函数）', 'Routh table (rational in ' + param + ')') + routhTable(res.tab, (c) => RF.toTeX(c, vt(param)), null);
    if (res.tab.stopAt) return h + verdict('bad', '某个第一列元素恒为 0 ⟹ 对任何 ' + param + ' 都不稳定', 'A first-column entry is identically 0 ⟹ unstable for every ' + param);
    const conds = res.firstCol.filter((rf) => !(P.deg(rf.n) <= 0 && P.deg(rf.d) <= 0));
    const consts = res.firstCol.filter((rf) => P.deg(rf.n) <= 0 && P.deg(rf.d) <= 0);
    if (consts.some((rf) => !P.trim(rf.n).length || P.trim(rf.n)[0].sign() <= 0)) return h + verdict('bad', '第一列有与参数无关的非正常数 ⟹ 对任何参数都不稳定', 'A constant first-column entry is non-positive ⟹ unstable for every value');
    h += lbl('稳定条件（第一列全 > 0）', 'Conditions (first column > 0)');
    h += '<ul>' + conds.map((rf) => '<li>' + T(RF.toTeX(rf, vt(param)) + '>0') + '</li>').join('') + '</ul>';
    // 合并区间
    const iv = res.ivals, ints = [];
    for (let i = 0; i < iv.length; i++) {
      if (!iv[i].ok) continue;
      let lo = iv[i].lo, j = i;
      while (j + 1 < iv.length && iv[j + 1].ok && iv[j].hi && res.points.some((p) => Math.abs(p.x - iv[j].hi.x) < 1e-9)) j++;
      ints.push([lo, iv[j].hi]); i = j;
    }
    const v = vt(param);
    if (!ints.length) h += verdict('bad', '对任何 ' + param + ' 都不稳定', 'Unstable for every ' + param);
    else {
      const txt = ints.map(([lo, hi]) => {
        if (!lo && !hi) return '\\text{all } ' + v;
        if (!lo) return v + '<' + hi.tex;
        if (!hi) return v + '>' + lo.tex;
        return lo.tex + '<' + v + '<' + hi.tex;
      }).join('\\ \\ \\text{or}\\ \\ ');
      h += verdict('ok', '稳定 ⟺ ', 'Stable ⟺ ') + disp(txt);
      const num = ints.map(([lo, hi]) => '(' + (lo ? CM.fmtDec(lo.x, 6) : '−∞') + ', ' + (hi ? CM.fmtDec(hi.x, 6) : '+∞') + ')').join(' ∪ ');
      h += '<p class="muted small">' + bi('数值：', 'Numerically: ') + num + '</p>';
    }
    return h;
  }

  /* ---------- 二参数区域 ---------- */
  // 二参数：只需输入特征多项式，参数自动识别；范围、Routh 表、条件、边界全部自动给出
  const REGION_PRESETS = {
    hw322: { e: 's*(1+t*s)*(1+2*s)+K*(s+2)', axes: ['K', 't'] },
    pi: { e: 's*(s+1)*(s+2)+10*(KP*s+KI)', axes: ['KI', 'KP'] },
    pd: { e: 's*(s+1)*(s+2)+10*(KP+KD*s)', axes: ['KD', 'KP'] },
    ka: { e: 's*(s+1)*(s+a)+K', axes: ['a', 'K'] },
  };
  let regionAxes = null; // [横轴, 纵轴]；null = 按出现顺序
  const texName = (v) => {
    const n = CM.normName(v);
    if (n === 't' || n === 'tau') return '\\tau';
    const m = /^([A-Za-z])([A-Za-z0-9]+)$/.exec(n);
    return m ? m[1] + '_{' + m[2] + '}' : n;
  };
  const plainName = (v) => (CM.normName(v) === 't' || CM.normName(v) === 'tau' ? 'τ' : v);
  function clearRegion() {
    const cv = $('rg-canvas'), ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    cv.onmousemove = null; $('rg-read').textContent = '';
  }
  const fracTeX = (e, names) => (e.den.isConst() && e.den.constVal().isOne() ? e.num.toTeX(names) : '\\dfrac{' + e.num.toTeX(names) + '}{' + e.den.toTeX(names) + '}');
  function sTeX(mp, n, names) { // c(s) 按 s 的降幂整理
    let out = '';
    for (let k = n; k >= 0; k--) {
      const c = mp.coef(0, k); if (c.isZero()) continue;
      const sv = k === 0 ? '' : k === 1 ? 's' : 's^{' + k + '}';
      let ct = c.toTeX(names);
      if (c.terms().length > 1) ct = '(' + ct + ')';
      else if (sv && ct === '1') ct = '';
      else if (sv && ct === '-1') ct = '-';
      out += (out && !ct.startsWith('-') ? '+' : '') + ct + (sv ? '\\,' + sv : '');
    }
    return out || '0';
  }
  function solvedTeX(g, names) { // 某个参数是一次的：解成 “参数 > / < 表达式”
    if (g.isConst()) return null;
    for (const iv of [1, 0]) {
      if (g.deg(iv) !== 1) continue;
      const A = g.coef(iv, 1), B = g.coef(iv, 0), other = [names[1 - iv]], v = names[iv];
      if (B.isZero() && A.isConst()) return null; // 本来就是 v > 0 的形式
      if (A.isConst()) {
        const c = A.constVal(), rhs = B.scale(c.inv().neg());
        return v + (c.sign() > 0 ? ' > ' : ' \\lt ') + rhs.toTeX(other);
      }
      // A·v + B > 0：A > 0 时 v > −B/A，A < 0 时 v < −B/A；把分母化成最高次项为正的形式
      let N = B.neg(), Dn = A;
      const top = Math.max(...Dn.terms().map(([e]) => e.reduce((x, y) => x + y, 0)));
      if (!Dn.terms().some(([e, c]) => e.reduce((x, y) => x + y, 0) === top && c.sign() > 0)) { N = N.neg(); Dn = Dn.neg(); } // 同乘 −1，不等号方向随 Dn 的符号对调
      const flip = !Dn.eq(A); // Dn = −A
      const fr = '\\dfrac{' + N.toTeX(other) + '}{' + Dn.toTeX(other) + '}', dT = Dn.toTeX(other);
      const whenPos = flip ? ' \\lt ' : ' > ', whenNeg = flip ? ' > ' : ' \\lt ';
      return '\\begin{cases}' + v + whenPos + fr + ', & ' + dT + ' > 0\\\\ ' + v + whenNeg + fr + ', & ' + dT + ' \\lt 0\\end{cases}';
    }
    return null;
  }
  function regionCalc() {
    clearRegion(); // 出错时不留旧图
    const src = $('rg-in').value;
    const ids = CM.detectParams(src);
    if (ids.length === 0) throw new Error(bi('表达式里没有参数；纯数值多项式请用上面的 ① Routh 计算器', 'No parameter found — use calculator ① for a numeric polynomial'));
    if (ids.length === 1) throw new Error(bi('只有一个参数 ' + ids[0] + '：请用上面的 ① Routh 计算器（参数名填 ' + ids[0] + '）直接求区间', 'Only one parameter (' + ids[0] + '): use calculator ① with parameter ' + ids[0]));
    if (ids.length > 2) throw new Error(bi('有 ' + ids.length + ' 个参数（' + ids.join(', ') + '），请把多余的代入数值，只留两个；如果是两个字母相乘请写成 P*I', ids.length + ' parameters (' + ids.join(', ') + ') — substitute numbers so only two remain; write products as P*I'));
    if (!regionAxes || regionAxes.map(CM.normName).sort().join() !== ids.slice().sort().join()) regionAxes = ids.slice();
    const [xn, yn] = regionAxes.map(CM.normName);
    $('rg-axes').innerHTML = bi('横轴 ', 'x-axis ') + '<b>' + plainName(xn) + '</b>，' + bi('纵轴 ', 'y-axis ') + '<b>' + plainName(yn) + '</b>';
    $('rg-xl').textContent = plainName(xn); $('rg-yl').textContent = plainName(yn);
    const names = [texName(xn), texName(yn)];
    const cond = CM.twoParamConditions(src, xn, yn);
    const sys = CM.compileNum(src, [xn, yn]);
    const stable = (x, y) => CM.routhFloat(sys.f({ [xn]: x, [yn]: y }));
    // 范围：手动填了就用手动，否则自动
    const num = (id) => { const v = $(id).value.trim(); return v === '' ? NaN : parseFloat(v); };
    const auto = CM.autoWindow(cond.conds, stable);
    const xr = [isFinite(num('rg-x0')) ? num('rg-x0') : auto.xr[0], isFinite(num('rg-x1')) ? num('rg-x1') : auto.xr[1]];
    const yr = [isFinite(num('rg-y0')) ? num('rg-y0') : auto.yr[0], isFinite(num('rg-y1')) ? num('rg-y1') : auto.yr[1]];
    if (!(xr[1] > xr[0]) || !(yr[1] > yr[0])) throw new Error(bi('范围不对：右端要大于左端', 'Bad range: the upper end must exceed the lower end'));
    const manual = ['rg-x0', 'rg-x1', 'rg-y0', 'rg-y1'].some((id) => $(id).value.trim() !== '');
    const cnt = UI.regionPlot($('rg-canvas'), {
      xr, yr, xl: plainName(xn), yl: plainName(yn), readout: $('rg-read'), f: stable,
      contours: cond.conds.filter((g) => !g.isConst()).map((g) => (x, y) => g.evalF([x, y])),
    });
    let h = '';
    h += lbl('特征多项式', 'Characteristic polynomial') + disp('c(s)=' + sTeX(cond.mp, cond.n, names));
    if (cond.flipped) h += '<p class="muted small">' + bi('首项为负，已整体乘 −1。', 'Leading coefficient negative — multiplied by −1.') + '</p>';
    // 完整 Routh 表
    h += lbl('Routh 表（按课件公式逐格计算并化简）', 'Routh table (slide formula, each entry simplified)');
    h += '<div class="tbl-wrap"><table class="routh">';
    cond.table.forEach((row, i) => {
      h += '<tr><td class="row-h">' + T('s^{' + (cond.n - i) + '}') + '</td>' + row.map((e, j) => '<td class="' + (j === 0 ? 'first' : '') + '">' + T(fracTeX(e, names), false) + '</td>').join('') + '</tr>';
    });
    if (cond.stopAt) h += '<tr><td class="row-h">' + T('s^{' + (cond.n - cond.stopAt) + '}') + '</td><td class="badcell">' + bi('无法计算', 'undefined') + '</td></tr>';
    h += '</table></div>';
    if (cond.stopAt) h += verdict('bad', '第一列有一项恒为 0 ⟹ 对任何参数都不稳定', 'A first-column entry is identically 0 ⟹ unstable for all parameter values');
    // 条件
    h += lbl('稳定条件（第一列全 > 0；已乘掉前面已为正的分母）', 'Stability conditions (first column > 0; positive denominators cleared)');
    const shown = cond.conds.filter((g) => !g.isConst());
    if (!cond.a[0].isConst()) h += '<p class="muted small">' + bi('首项系数含参数，这里按首项 > 0 列条件（首项 < 0 时整列反号的情况图中也一并判断了）。', 'The leading coefficient depends on the parameters; conditions assume it is positive (the all-negative case is still tested in the plot).') + '</p>';
    h += '<ol>' + shown.map((g) => { const sv = solvedTeX(g, names); return '<li>' + T(g.toTeX(names) + ' > 0') + (sv ? '　⟺　' + T(sv) : '') + '</li>'; }).join('') + '</ol>';
    if (cond.never && !cond.stopAt) h += verdict('bad', '有一条条件恒不成立 ⟹ 对任何参数都不稳定', 'A condition can never hold ⟹ unstable for all parameter values');
    // 范围说明
    if (auto.empty && !manual) h += verdict('bad', '在搜索范围内没有找到稳定区域', 'No stable region found in the search range');
    h += '<p class="muted small">' + (manual ? bi('手动范围', 'Manual range') : bi('自动范围（由条件的截距、渐近线和稳定区域位置确定；可在上方填数覆盖）', 'Automatic range (from intercepts, asymptotes and where the stable set lies; type numbers above to override)'))
      + '：' + T(names[0] + '\\in[' + CM.fmtDec(xr[0], 4) + ',\\ ' + CM.fmtDec(xr[1], 4) + '],\\ ' + names[1] + '\\in[' + CM.fmtDec(yr[0], 4) + ',\\ ' + CM.fmtDec(yr[1], 4) + ']') + '</p>';
    h += '<p class="muted small">' + bi('绿色 = 稳定（每个格点单独做 Routh），红线 = 稳定区域边界（条件取等号）。稳定格点数：', 'Green = stable (Routh at each grid point), red = boundary of the stable region (a condition = 0). Stable cells: ') + cnt + bi('。鼠标移到图上看坐标和判定。', '. Hover to read values.') + '</p>';
    return h;
  }

  /* ---------- Kharitonov ---------- */
  function kharCalc() {
    const parts = $('kh-in').value.split(/[;；\n]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) throw new Error(bi('至少两个系数', 'need at least two coefficients'));
    const ivs = parts.map((p) => { const xs = p.split(/[,，\s]+/).filter(Boolean); if (xs.length === 1) return [xs[0], xs[0]]; if (xs.length !== 2) throw new Error(bi('格式应为 下界,上界：', 'expected lower,upper: ') + p); const a = Q.parse(xs[0]), b = Q.parse(xs[1]); if (a.cmp(b) > 0) throw new Error(bi('下界大于上界：', 'lower > upper: ') + p); return [xs[0], xs[1]]; });
    const n = ivs.length - 1;
    const iv = ivs.map(([a, b]) => [Q.parse(a), Q.parse(b)]);
    let h = disp('\\mathcal P=\\Big\\{' + iv.map(([a, b], i) => '[' + CM.qTeX(a) + ',' + CM.qTeX(b) + ']' + (n - i ? (n - i === 1 ? 's' : 's^{' + (n - i) + '}') : '')).join('+') + '\\Big\\}');
    if (iv[0][0].sign() <= 0 && iv[0][1].sign() >= 0) h += '<p class="err">' + bi('首项区间包含 0，次数会掉，不适用。', 'The leading interval contains 0 — degree can drop.') + '</p>';
    const ks = CM.kharitonov(ivs);
    let all = true;
    h += '<div class="tbl-wrap"><table><tr><th></th><th>' + bi('模式', 'Pattern') + '</th><th>' + bi('多项式', 'Polynomial') + '</th><th>' + bi('Routh 第一列', 'Routh first column') + '</th><th></th></tr>';
    ks.forEach((desc, k) => {
      const r = CM.routhQ(desc);
      all = all && r.stable;
      const pat = desc.map((_, i) => CM.KH_PAT[k][i % 4]).join('');
      const fc = r.rows.map((row) => CM.qTeX(row[0])).join(',\\ ') + (r.stopAt ? ',\\ \\times' : '');
      h += '<tr><td>' + T('k_' + (k + 1)) + '</td><td><code>' + pat + '</code></td><td>' + T(P.toTeX(P.fromDesc(desc))) + '</td><td>' + T(fc) + '</td><td>' + (r.stable ? '<span class="verdict ok">' + bi('稳定', 'stable') + '</span>' : '<span class="verdict bad">' + bi('不稳定', 'unstable') + '</span>') + '</td></tr>';
    });
    h += '</table></div>';
    h += all ? verdict('ok', '四个 Kharitonov 多项式都稳定 ⟹ 区间内所有多项式稳定', 'All four Kharitonov polynomials stable ⟹ every member is stable')
      : verdict('bad', '有 Kharitonov 多项式不稳定 ⟹ 不是对所有参数都稳定（它就是反例）', 'A Kharitonov polynomial is unstable ⟹ not robustly stable (it is a counterexample)');
    return h;
  }

  /* ---------- 内稳定 ---------- */
  function internalCalc() {
    let b = CM.polyS($('int-b').value), a = CM.polyS($('int-a').value), q = CM.polyS($('int-q').value), p = CM.polyS($('int-p').value);
    if (P.isZero(a) || P.isZero(p)) throw new Error(bi('分母不能为 0', 'denominator is zero'));
    let h = '';
    const notes = [];
    const gP = P.gcd(a, b), gC = P.gcd(p, q);
    if (P.deg(gP) >= 1 && !P.isZero(b)) { notes.push(bi('P 的分子分母有公因子 ', 'P has a common factor ') + T(P.toTeX(gP)) + bi('，已约去（这是 P 内部的隐藏模态，若不稳定则任何控制器都镇定不了）。', ' — cancelled (a hidden mode of P; if unstable, no controller can stabilize it).')); a = P.divmod(a, gP).q; b = P.divmod(b, gP).q; }
    if (P.deg(gC) >= 1 && !P.isZero(q)) { notes.push(bi('C 的分子分母有公因子 ', 'C has a common factor ') + T(P.toTeX(gC)) + bi('，已约去。', ' — cancelled.')); p = P.divmod(p, gC).q; q = P.divmod(q, gC).q; }
    h += disp('P(s)=' + ratTeX(b, a) + ',\\qquad C(s)=' + ratTeX(q, p));
    notes.forEach((n) => { h += '<p class="small">' + n + '</p>'; });
    const properP = P.deg(b) <= P.deg(a), properC = P.deg(q) <= P.deg(p);
    if (!properP || !properC) h += '<p class="err">' + bi('P 或 C 不是 proper，定理前提不满足。', 'P or C is not proper — the theorem does not apply.') + '</p>';
    const inf = (n, d) => (P.deg(n) === P.deg(d) ? P.lead(n).div(P.lead(d)) : Q.ZERO);
    const one = Q.ONE.add(inf(b, a).mul(inf(q, p)));
    const wellPosed = !one.isZero();
    h += '<p>' + T('1+P(\\infty)C(\\infty)=' + CM.qTeX(one)) + ' ⟹ ' + (wellPosed ? bi('适定', 'well-posed') : '<b class="err">' + bi('不适定（闭环 non-proper）', 'ill-posed (closed loop non-proper)') + '</b>') + '</p>';
    const c = P.add(P.mul(a, p), P.mul(b, q));
    h += lbl('特征多项式', 'Characteristic polynomial') + disp('c(s)=a(s)p(s)+b(s)q(s)=' + P.toTeX(c));
    let cStable = false;
    if (P.deg(c) >= 1) {
      const r = CM.routhQ(P.toDesc(c)); cStable = r.stable;
      h += '<p>Routh ' + bi('第一列', 'first column') + '：' + T(r.rows.map((row) => CM.qTeX(row[0])).join(',\\ ') + (r.stopAt ? '\\ \\Rightarrow\\ \\text{stop}' : '')) + ' ⟹ ' + (cStable ? bi('稳定', 'stable') : bi('不稳定', 'unstable')) + '</p>';
      h += '<p>' + bi('闭环极点：', 'Closed-loop poles: ') + rootsList(c) + '</p>';
    } else if (P.deg(c) === 0) { cStable = true; h += '<p>' + bi('c(s) 是非零常数（没有根）。', 'c(s) is a nonzero constant (no roots).') + '</p>'; }
    else h += '<p class="err">c(s) ≡ 0</p>';
    if (P.deg(c) < P.deg(a) + P.deg(p)) h += '<p class="err">' + bi('注意：deg c < deg a + deg p，阶数下降。', 'Note: deg c < deg a + deg p — the degree dropped.') + '</p>';
    // 对消
    const canc = [];
    const g1 = P.gcd(a, q), g2 = P.gcd(b, p);
    if (P.deg(g1) >= 1 && !P.isZero(q)) rootsOf(g1).forEach((z) => canc.push([z, bi('P 的极点 = C 的零点', 'pole of P = zero of C')]));
    if (P.deg(g2) >= 1 && !P.isZero(b)) rootsOf(g2).forEach((z) => canc.push([z, bi('P 的零点 = C 的极点', 'zero of P = pole of C')]));
    if (canc.length) {
      h += lbl('PC 中的零极点对消', 'Pole/zero cancellations in PC') + '<ul>' + canc.map(([z, why]) => '<li>' + T('s=' + CM.rootTeX(z)) + '（' + why + '）' + (z[0] >= -1e-10 ? ' <b class="err">' + bi('不稳定对消！', 'unstable cancellation!') + '</b>' : ' ' + bi('稳定对消，无妨', 'stable, harmless')) + '</li>').join('') + '</ul>';
    } else h += '<p>' + bi('PC 中没有零极点对消。', 'No pole/zero cancellation in PC.') + '</p>';
    // gang of four
    h += lbl('Gang of four（约分后）', 'Gang of four (reduced)');
    const gof = [['\\frac{1}{1+PC}', P.mul(a, p)], ['\\frac{C}{1+PC}', P.mul(a, q)], ['\\frac{P}{1+PC}', P.mul(b, p)], ['\\frac{PC}{1+PC}', P.mul(b, q)]];
    h += '<div class="tbl-wrap"><table>';
    gof.forEach(([name, num]) => {
      if (P.isZero(c)) return;
      let n = num, d = c; const g = P.gcd(n, d);
      if (P.deg(g) >= 1 && !P.isZero(n)) { n = P.divmod(n, g).q; d = P.divmod(d, g).q; }
      let st = '';
      if (P.isZero(n)) st = bi('恒为 0', 'identically 0');
      else if (P.deg(n) > P.deg(d)) st = '<span class="err">' + bi('non-proper ⟹ 不稳定', 'non-proper ⟹ unstable') + '</span>';
      else st = isStableRoots(rootsOf(d)) ? bi('稳定', 'stable') : '<span class="err">' + bi('不稳定', 'unstable') + '</span>';
      h += '<tr><td>' + T(name + '=' + ratTeX(n, d)) + '</td><td>' + st + '</td></tr>';
    });
    h += '</table></div>';
    const ok = wellPosed && cStable && properP && properC && P.deg(c) >= 0 && !P.isZero(c);
    h += ok ? verdict('ok', '适定且 ap+bq 稳定 ⟹ 闭环内稳定', 'Well-posed and ap+bq stable ⟹ internally stable')
      : verdict('bad', '闭环不内稳定', 'Not internally stable');
    return h;
  }

  /* ---------- 极点配置 ---------- */
  function poleCalc() {
    const b = CM.polyS($('pp-b').value), a = CM.polyS($('pp-a').value);
    const m = parseInt($('pp-m').value, 10), strict = $('pp-strict').checked;
    if (!(m >= 0)) throw new Error(bi('阶数 m 应为非负整数', 'm must be a non-negative integer'));
    const csrc = $('pp-c').value.trim();
    let c, polesTeX = null;
    if (/s/.test(csrc)) c = CM.polyS(csrc); else { const r = CM.polesToPoly(csrc); c = r.poly; polesTeX = r.list; }
    const n = P.deg(a);
    let h = '<p>' + T('P(s)=' + ratTeX(b, a)) + '，' + T('n=' + n) + '，' + T('m=' + m) + '，' + (strict ? 'strictly proper ' + T('(q_0=0)') : 'proper') + '</p>';
    const need = strict ? n : n - 1;
    h += '<p class="small">' + bi('任意配置所需最低阶数：', 'Minimum order for arbitrary placement: ') + T('m\\ge ' + need) + (m < need ? ' <b class="err">' + bi('（当前 m 不够，一般无解，除非 c(s) 特殊）', '(m too small: generally no solution unless c(s) is special)') + '</b>' : '') + '</p>';
    if (polesTeX) h += '<p>' + bi('期望极点：', 'Desired poles: ') + T(polesTeX.join(',\\ ')) + '</p>';
    h += disp('c(s)=' + P.toTeX(c));
    const r = CM.polePlace({ a, b, m, strict, c });
    h += lbl('比较系数的线性方程组', 'Coefficient-matching system') + disp(CM.matTeX(r.S) + '\\begin{bmatrix}' + r.names.join('\\\\') + '\\end{bmatrix}=\\begin{bmatrix}' + r.rhs.map((x) => CM.qTeX(x)).join('\\\\') + '\\end{bmatrix}');
    h += '<p class="muted small">' + (strict ? bi('（strictly proper：去掉 q₀ 这一列；课件写法是先 p₀ = c₀/a₀，再解 S(a,b,m)）', '(strictly proper: the q₀ column is removed; the slides first set p₀ = c₀/a₀ and then solve with S(a,b,m))') : bi('（系数矩阵即 Sylvester 矩阵 S(a,b,m+1)）', '(the matrix is the Sylvester matrix S(a,b,m+1))')) + '</p>';
    if (r.sol.status === 'none') return h + verdict('bad', '方程组无解：这个阶数的控制器做不到', 'No solution: a controller of this order cannot do it');
    if (r.sol.status === 'infinite') h += verdict('warn', '无穷多解（自由变量取 0 给出一个解）', 'Infinitely many solutions (free variables set to 0)');
    else h += verdict('ok', '唯一解', 'Unique solution');
    h += disp(r.names.map((nm, i) => nm + '=' + CM.qTeX(r.sol.x[i])).join(',\\ '));
    if (P.isZero(r.p)) return h + '<p class="err">' + bi('p(s) ≡ 0，不是合法控制器。', 'p(s) ≡ 0 — not a valid controller.') + '</p>';
    h += lbl('控制器', 'Controller') + disp('C(s)=' + ratTeX(r.q, r.p));
    h += '<p>' + bi('验算 ', 'Check ') + T('a p+b q=' + P.toTeX(r.check)) + (P.eq(r.check, c) ? ' ✓' : ' ✗') + '</p>';
    const pr = rootsOf(r.p);
    h += '<p>' + bi('控制器极点（p(s) 的根）：', 'Controller poles (roots of p(s)): ') + rootsList(r.p) + ' ⟹ ' + (isStableRoots(pr) ? bi('控制器稳定', 'stable controller') : '<b class="err">' + bi('控制器不稳定（但闭环仍按设计稳定）', 'unstable controller (closed loop still stable as designed)') + '</b>') + '</p>';
    return h;
  }

  /* ---------- 状态空间 ↔ 传递函数 ---------- */
  const SS_PRESETS = {
    L8: { A: '0 1; -1 -2', B: '0; 1', C: '2 1', D: '0', K: '' },
    hw216: { A: '-1.7860 15.9674 -1.6930 13.1487; -1.1773 -15.2644 -1.3548 -14.5145; 3.3427 -6.8798 3.4513 -3.5889; 1.5017 16.7058 1.1717 13.4250', B: '-0.9618; 1.3011; 0.1081; -1.1984', C: '29.8608 35.9450 29.4689 17.7162', D: '0', K: '' },
    motor: { A: '-2 0 -0.5; 0 0 1; 5 0 -1', B: '2; 0; 0', C: '0 1 0', D: '0', K: '' },
  };
  function realizeHTML(num, den) {
    const re = CM.realizations(num, den);
    let h = lbl('控制器型实现（课件 L8）', 'Controller-form realization (slides L8)');
    h += disp('A=' + CM.matTeX(re.ctrl.A) + ',\\ b=' + CM.matTeX(re.ctrl.B) + ',\\ c=' + CM.matTeX(re.ctrl.C) + ',\\ d=' + CM.qTeX(re.ctrl.D));
    h += lbl('观测器型实现', 'Observer-form realization');
    h += disp('A=' + CM.matTeX(re.obs.A) + ',\\ b=' + CM.matTeX(re.obs.B) + ',\\ c=' + CM.matTeX(re.obs.C) + ',\\ d=' + CM.qTeX(re.obs.D));
    return h;
  }
  function tfInfo(num, den) {
    let h = '';
    const g = P.gcd(num, den);
    let n = num, d = den;
    if (P.deg(g) >= 1 && !P.isZero(num)) { n = P.divmod(num, g).q; d = P.divmod(den, g).q; h += '<p class="small">' + bi('分子分母有公因子 ', 'Common factor ') + T(P.toTeX(g)) + bi('（零极点对消），约分后：', ' (pole/zero cancellation); reduced:') + '</p>' + disp('G(s)=' + ratTeX(n, d)); }
    const lead = P.lead(d); const nM = P.scale(n, lead.inv()), dM = P.scale(d, lead.inv());
    h += '<p>' + bi('极点：', 'Poles: ') + rootsList(dM) + '</p><p>' + bi('零点：', 'Zeros: ') + rootsList(nM) + '</p>';
    const d0 = P.evalQ(dM, Q.ZERO);
    const stab = P.deg(n) <= P.deg(d) && isStableRoots(rootsOf(dM));
    h += '<p>' + (P.deg(n) < P.deg(d) ? 'strictly proper' : P.deg(n) === P.deg(d) ? 'bi-proper' : 'non-proper') + '，' + bi('相对阶 ', 'relative degree ') + (P.deg(d) - P.deg(n)) + '，' + (stab ? bi('BIBO 稳定', 'BIBO stable') : bi('不稳定', 'not stable')) + '</p>';
    if (!d0.isZero()) h += '<p>DC gain ' + T('G(0)=' + CM.qTeX(P.evalQ(nM, Q.ZERO).div(d0))) + (stab ? '' : ' <span class="muted small">' + bi('（系统不稳定，阶跃响应没有稳态值）', '(unstable: no steady-state step response)') + '</span>') + '</p>';
    else h += '<p>' + bi('G(0) 无定义（s=0 处有极点）', 'G(0) undefined (pole at s = 0)') + '</p>';
    return { h, n, d };
  }
  function ssCalc() {
    let A = CM.parseMatrix($('ss-A').value), b = CM.parseMatrix($('ss-B').value), c = CM.parseMatrix($('ss-C').value);
    let d = Q.parse($('ss-D').value.trim() || '0');
    if (b.length === 1 && b[0].length > 1) b = b[0].map((x) => [x]);
    let h = '';
    const Ks = $('ss-K').value.trim();
    if (Ks) {
      const K = Q.parse(Ks), den = Q.ONE.add(K.mul(d));
      if (den.isZero()) throw new Error(bi('1+Kd = 0，不适定', '1+Kd = 0: ill-posed'));
      const f = K.div(den);
      const bc = CM.Mx.mul(b, c);
      A = CM.Mx.add(A, CM.Mx.scale(bc, f.neg()));
      b = CM.Mx.scale(b, den.inv()); c = CM.Mx.scale(c, den.inv()); d = d.div(den);
      h += '<p>' + bi('闭环（u = r − Ky）：', 'Closed loop (u = r − Ky): ') + T('A_{cl}=A-\\tfrac{K}{1+Kd}bc') + '</p>' + disp('A_{cl}=' + CM.matTeX(A) + ',\\ b_{cl}=' + CM.matTeX(b) + ',\\ c_{cl}=' + CM.matTeX(c) + ',\\ d_{cl}=' + CM.qTeX(d));
    }
    const tf = CM.ss2tf(A, b, c, d);
    h += disp('G(s)=c(sI-A)^{-1}b+d=' + ratTeX(tf.num, tf.den));
    h += '<p class="muted small">' + bi('分母 = det(sI−A)（Faddeev–LeVerrier 精确计算）。', 'Denominator = det(sI−A) (exact Faddeev–LeVerrier).') + '</p>';
    const info = tfInfo(tf.num, tf.den);
    h += info.h + realizeHTML(info.n, info.d);
    return h;
  }
  function tfCalc() {
    const num = CM.polyS($('tf-n').value), den = CM.polyS($('tf-d').value);
    if (P.isZero(den)) throw new Error(bi('分母为 0', 'zero denominator'));
    let h = disp('G(s)=' + ratTeX(num, den));
    const info = tfInfo(num, den);
    return h + info.h + realizeHTML(info.n, info.d);
  }

  /* ---------- 部分分式 ---------- */
  function pfCalc() {
    const num = CM.polyS($('pf-n').value); let den = CM.polyS($('pf-d').value);
    if (P.isZero(den)) throw new Error(bi('分母为 0', 'zero denominator'));
    const step = $('pf-step').checked;
    const G = { n: num, d: den };
    if (step) den = P.mul(den, P.x());
    let h = disp((step ? 'Y(s)=\\frac{G(s)}{s}=' : 'G(s)=') + ratTeX(num, den));
    const pf = CM.partialFractions(num, den);
    if (pf.cancelled) h += '<p class="small">' + bi('先约去公因子 ', 'Cancelled common factor ') + T(P.toTeX(pf.cancelled)) + '</p>';
    h += '<p>' + bi('极点：', 'Poles: ') + rootsList(pf.den) + '</p>';
    const tx = CM.pfTeX(pf);
    h += lbl('部分分式', 'Partial-fraction expansion') + disp((step ? 'Y(s)=' : 'G(s)=') + tx.s);
    h += lbl(step ? '阶跃响应' : '冲激响应 / 反变换', step ? 'Step response' : 'Impulse response / inverse transform') + disp((step ? 'y(t)=' : 'g(t)=') + '\\Big[' + tx.t + '\\Big]\\sigma(t)');
    // 终值
    const gStable = P.deg(G.n) <= P.deg(G.d) && isStableRoots(rootsOf(P.divmod(G.d, P.gcd(G.n, G.d)).q));
    if (step) {
      h += gStable ? '<p>' + bi('G 稳定，终值定理成立：', 'G is stable, FVT applies: ') + T('y(\\infty)=\\lim_{s\\to0}sY(s)=G(0)=' + CM.qTeX(P.evalQ(G.n, Q.ZERO).div(P.evalQ(G.d, Q.ZERO)))) + '</p>'
        : '<p class="err">' + bi('sY(s) 有极点不在开左半平面，终值定理不能用。', 'sY(s) has poles outside the OLHP — the FVT does not apply.') + '</p>';
    }
    return h;
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    $('routh-go').onclick = () => run('routh-out', routhCalc);
    document.querySelectorAll('[data-routh]').forEach((bt) => bt.onclick = () => { const [e, p] = bt.dataset.routh.split('|'); $('routh-in').value = e; $('routh-param').value = p || ''; run('routh-out', routhCalc); });
    const clearRanges = () => ['rg-x0', 'rg-x1', 'rg-y0', 'rg-y1'].forEach((id) => { $(id).value = ''; });
    $('rg-go').onclick = () => run('rg-out', regionCalc);
    $('rg-swap').onclick = () => {
      if (regionAxes) regionAxes = [regionAxes[1], regionAxes[0]];
      const [a, b, c, d] = ['rg-x0', 'rg-x1', 'rg-y0', 'rg-y1'].map((id) => $(id).value);
      $('rg-x0').value = c; $('rg-x1').value = d; $('rg-y0').value = a; $('rg-y1').value = b;
      run('rg-out', regionCalc);
    };
    let lastIds = '';
    $('rg-in').addEventListener('input', () => { // 参数变了就回到自动：清掉旧的轴顺序和手动范围
      let ids = ''; try { ids = CM.detectParams($('rg-in').value).slice().sort().join(); } catch (e) { return; }
      if (ids !== lastIds) { lastIds = ids; regionAxes = null; clearRanges(); }
    });
    const loadRegion = (k) => { const p = REGION_PRESETS[k]; if (!p) return; $('rg-in').value = p.e; regionAxes = p.axes.slice(); clearRanges(); try { lastIds = CM.detectParams(p.e).slice().sort().join(); } catch (e) { /* ignore */ } run('rg-out', regionCalc); };
    document.querySelectorAll('[data-region]').forEach((bt) => bt.onclick = () => loadRegion(bt.dataset.region));
    $('kh-go').onclick = () => run('kh-out', kharCalc);
    document.querySelectorAll('[data-kh]').forEach((bt) => bt.onclick = () => { $('kh-in').value = bt.dataset.kh; run('kh-out', kharCalc); });
    $('int-go').onclick = () => run('int-out', internalCalc);
    document.querySelectorAll('[data-int]').forEach((bt) => bt.onclick = () => { const [b, a, q, p] = bt.dataset.int.split('|'); $('int-b').value = b; $('int-a').value = a; $('int-q').value = q; $('int-p').value = p; run('int-out', internalCalc); });
    $('pp-go').onclick = () => run('pp-out', poleCalc);
    document.querySelectorAll('[data-pole]').forEach((bt) => bt.onclick = () => { const [b, a, m, st, c] = bt.dataset.pole.split('|'); $('pp-b').value = b; $('pp-a').value = a; $('pp-m').value = m; $('pp-strict').checked = st === '1'; $('pp-c').value = c; run('pp-out', poleCalc); });
    $('ss-go').onclick = () => run('ss-out', ssCalc);
    const loadSS = (k) => { const p = SS_PRESETS[k]; if (!p) return; $('ss-A').value = p.A; $('ss-B').value = p.B; $('ss-C').value = p.C; $('ss-D').value = p.D; $('ss-K').value = p.K; run('ss-out', ssCalc); };
    document.querySelectorAll('[data-ss]').forEach((bt) => bt.onclick = () => loadSS(bt.dataset.ss));
    $('tf-go').onclick = () => run('tf-out', tfCalc);
    $('pf-go').onclick = () => run('pf-out', pfCalc);
    document.querySelectorAll('[data-pf]').forEach((bt) => bt.onclick = () => { const [n, d, st] = bt.dataset.pf.split('|'); $('pf-n').value = n; $('pf-d').value = d; $('pf-step').checked = st === '1'; run('pf-out', pfCalc); });
    document.querySelectorAll('.form input[type=text]').forEach((inp) => inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const btn = inp.closest('section').querySelector('.form button.primary:last-of-type') || inp.closest('section').querySelector('button.primary'); const own = inp.closest('.form').querySelector('button.primary'); (own || btn).click(); }
    }));

    // URL 参数
    const qs = new URLSearchParams(location.search);
    const g = (k) => qs.get(k);
    if (g('routh') !== null) { $('routh-in').value = g('routh'); $('routh-param').value = g('param') || ''; }
    if (g('kh')) $('kh-in').value = g('kh').replace(/;/g, '; ');
    if (g('ia') !== null) { $('int-b').value = g('ib') || '1'; $('int-a').value = g('ia'); $('int-q').value = g('iq') || '1'; $('int-p').value = g('ip') || '1'; }
    if (g('pa') !== null) { $('pp-b').value = g('pb') || '1'; $('pp-a').value = g('pa'); $('pp-m').value = g('pm') || '1'; $('pp-strict').checked = g('strict') === '1'; $('pp-c').value = g('pc') || ''; }
    if (g('A') !== null) { $('ss-A').value = g('A'); $('ss-B').value = g('B') || ''; $('ss-C').value = g('C') || ''; $('ss-D').value = g('D') || '0'; $('ss-K').value = g('K') || ''; }
    if (g('tfn') !== null) { $('tf-n').value = g('tfn'); $('tf-d').value = g('tfd') || '1'; }
    if (g('pfn') !== null) { $('pf-n').value = g('pfn'); $('pf-d').value = g('pfd') || '1'; $('pf-step').checked = g('step') === '1'; }
    const preset = g('preset');
    if (preset && SS_PRESETS[preset]) { const p = SS_PRESETS[preset]; $('ss-A').value = p.A; $('ss-B').value = p.B; $('ss-C').value = p.C; $('ss-D').value = p.D; }
    // 全部先算一遍，页面打开就有示例结果
    run('routh-out', routhCalc); run('kh-out', kharCalc); run('int-out', internalCalc); run('pp-out', poleCalc);
    run('ss-out', ssCalc); run('tf-out', tfCalc); run('pf-out', pfCalc);
    if (preset && REGION_PRESETS[preset]) loadRegion(preset); else loadRegion('hw322');
    window.addEventListener('resize', () => { try { regionCalc(); } catch (e) { /* ignore */ } });
  }
  document.addEventListener('DOMContentLoaded', bind);
})();
