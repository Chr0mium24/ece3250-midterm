/* ECE3250 期中速成 · 计算核心
   精确有理数（BigInt）、多项式、表达式解析、Routh、Kharitonov、极点配置、
   状态空间 ↔ 传递函数、部分分式。浏览器里挂在 window.CM，node 里 module.exports。 */
(function (root) {
  'use strict';

  /* ---------------- BigInt 有理数 ---------------- */
  const babs = (a) => (a < 0n ? -a : a);
  function bgcd(a, b) { a = babs(a); b = babs(b); while (b) { [a, b] = [b, a % b]; } return a; }
  function bitlen(a) { a = babs(a); return a === 0n ? 0 : a.toString(2).length; }

  class Q {
    constructor(n, d = 1n) {
      if (d === 0n) throw new Error('除以零 / division by zero');
      if (d < 0n) { n = -n; d = -d; }
      const g = bgcd(n, d) || 1n;
      this.n = n / g; this.d = d / g;
    }
    static of(x) {
      if (x instanceof Q) return x;
      if (typeof x === 'bigint') return new Q(x, 1n);
      if (typeof x === 'number') {
        if (!isFinite(x)) throw new Error('数值不是有限数 / not a finite number');
        if (Number.isInteger(x) && Math.abs(x) < 9e15) return new Q(BigInt(x), 1n);
        return Q.parse(String(x));
      }
      return Q.parse(String(x));
    }
    static parse(str) {
      const s = String(str).trim();
      const fr = /^([+-]?\d+)\s*\/\s*(\d+)$/.exec(s);
      if (fr) return new Q(BigInt(fr[1]), BigInt(fr[2]));
      const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
      if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) throw new Error('无法解析数字 / cannot parse number: ' + s);
      const sign = m[1] === '-' ? -1n : 1n;
      const ip = m[2] || '0', fp = m[3] || '';
      let n = BigInt(ip + fp) * sign, d = 10n ** BigInt(fp.length);
      const e = m[4] ? parseInt(m[4], 10) : 0;
      if (e > 0) n *= 10n ** BigInt(e); else if (e < 0) d *= 10n ** BigInt(-e);
      return new Q(n, d);
    }
    add(o) { o = Q.of(o); return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { o = Q.of(o); return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { o = Q.of(o); return new Q(this.n * o.n, this.d * o.d); }
    div(o) { o = Q.of(o); if (o.n === 0n) throw new Error('除以零 / division by zero'); return new Q(this.n * o.d, this.d * o.n); }
    neg() { return new Q(-this.n, this.d); }
    inv() { return new Q(this.d, this.n); }
    isZero() { return this.n === 0n; }
    isOne() { return this.n === 1n && this.d === 1n; }
    isInt() { return this.d === 1n; }
    sign() { return this.n > 0n ? 1 : this.n < 0n ? -1 : 0; }
    eq(o) { o = Q.of(o); return this.n === o.n && this.d === o.d; }
    cmp(o) { return this.sub(o).sign(); }
    abs() { return this.n < 0n ? this.neg() : this; }
    toNumber() {
      let n = this.n, d = this.d;
      const sh = Math.max(bitlen(n), bitlen(d)) - 1000;
      if (sh > 0) { n >>= BigInt(sh); d >>= BigInt(sh); if (d === 0n) return n > 0n ? Infinity : -Infinity; }
      return Number(n) / Number(d);
    }
    toString() { return this.d === 1n ? this.n.toString() : this.n + '/' + this.d; }
  }
  Q.ZERO = new Q(0n); Q.ONE = new Q(1n);

  /* ---------------- 数字排版 ---------------- */
  // 浮点数 → 尽量识别成简单分数，否则保留有效数字
  function niceFrac(x, maxDen = 2000) {
    if (!isFinite(x)) return null;
    if (Math.abs(x - Math.round(x)) < 1e-9 * Math.max(1, Math.abs(x))) return [Math.round(x), 1];
    let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
    for (let i = 0; i < 30; i++) {
      const a = Math.floor(b);
      [h1, h0] = [a * h1 + h0, h1]; [k1, k0] = [a * k1 + k0, k1];
      if (k1 > maxDen) return null;
      if (Math.abs(x - h1 / k1) < 1e-9 * Math.max(1, Math.abs(x))) return [h1, k1];
      if (b - a < 1e-12) return null;
      b = 1 / (b - a);
    }
    return null;
  }
  function fmtDec(x, sig = 5) {
    if (x === 0 || Math.abs(x) < 1e-13) return '0';
    const ax = Math.abs(x);
    let s;
    if (ax >= 1e6 || ax < 1e-4) {
      s = x.toExponential(sig - 1).replace(/\.?0+e/, 'e');
      return s;
    }
    s = x.toPrecision(sig);
    if (s.includes('e')) s = String(Number(s));
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  function expTeX(s) { // 1.2e-5 → 1.2\times10^{-5}
    const m = /^(-?[\d.]+)e([+-]?\d+)$/.exec(s);
    if (!m) return s;
    return m[1] + '\\times 10^{' + parseInt(m[2], 10) + '}';
  }
  // 数字 → TeX；frac=true 时尝试分数
  function numTeX(x, opts = {}) {
    if (Math.abs(x) < 1e-12) return '0';
    const fr = opts.frac === false ? null : niceFrac(x, opts.maxDen || 1000);
    if (fr) {
      const [p, q] = fr;
      if (q === 1) return String(p);
      return (p < 0 ? '-' : '') + '\\tfrac{' + Math.abs(p) + '}{' + q + '}';
    }
    return expTeX(fmtDec(x, opts.sig || 5));
  }
  function numTxt(x, sig = 5) {
    if (Math.abs(x) < 1e-12) return '0';
    const fr = niceFrac(x, 1000);
    if (fr) return fr[1] === 1 ? String(fr[0]) : fr[0] + '/' + fr[1];
    return fmtDec(x, sig);
  }
  // 精确有理数 → TeX；分母太大就转小数
  function qTeX(q, opts = {}) {
    q = Q.of(q);
    if (q.d === 1n) {
      const s = q.n.toString();
      return s.length > 12 ? expTeX(fmtDec(q.toNumber(), 6)) : s;
    }
    if (q.d > 999n || babs(q.n) > 99999n) return expTeX(fmtDec(q.toNumber(), opts.sig || 6)); // 分数太丑就用小数
    const neg = q.n < 0n;
    return (neg ? '-' : '') + (opts.inline ? babs(q.n) + '/' + q.d : '\\frac{' + babs(q.n) + '}{' + q.d + '}');
  }

  /* ---------------- 有理系数一元多项式（升幂数组） ---------------- */
  const P = {};
  P.trim = (a) => { let i = a.length; while (i > 0 && a[i - 1].isZero()) i--; return a.slice(0, i); };
  P.deg = (a) => P.trim(a).length - 1;
  P.isZero = (a) => P.trim(a).length === 0;
  P.const = (c) => P.trim([Q.of(c)]);
  P.x = () => [Q.ZERO, Q.ONE];
  P.fromDesc = (arr) => P.trim(arr.map(Q.of).reverse());
  P.toDesc = (a) => { const t = P.trim(a); return t.length ? t.slice().reverse() : [Q.ZERO]; };
  P.add = (a, b) => { const n = Math.max(a.length, b.length), r = []; for (let i = 0; i < n; i++) r.push((a[i] || Q.ZERO).add(b[i] || Q.ZERO)); return P.trim(r); };
  P.neg = (a) => a.map((c) => c.neg());
  P.sub = (a, b) => P.add(a, P.neg(b));
  P.scale = (a, k) => { k = Q.of(k); return P.trim(a.map((c) => c.mul(k))); };
  P.mul = (a, b) => {
    a = P.trim(a); b = P.trim(b);
    if (!a.length || !b.length) return [];
    const r = new Array(a.length + b.length - 1).fill(Q.ZERO);
    for (let i = 0; i < a.length; i++) if (!a[i].isZero()) for (let j = 0; j < b.length; j++) r[i + j] = r[i + j].add(a[i].mul(b[j]));
    return P.trim(r);
  };
  P.pow = (a, k) => { let r = [Q.ONE]; for (let i = 0; i < k; i++) r = P.mul(r, a); return r; };
  P.lead = (a) => { const t = P.trim(a); return t.length ? t[t.length - 1] : Q.ZERO; };
  P.divmod = (a, b) => {
    a = P.trim(a); b = P.trim(b);
    if (!b.length) throw new Error('多项式除以零 / polynomial division by zero');
    const r = a.slice(); const db = b.length - 1, lb = b[db];
    const q = new Array(Math.max(0, r.length - db)).fill(Q.ZERO);
    for (let k = r.length - 1 - db; k >= 0; k--) {
      const c = r[k + db].div(lb);
      q[k] = c;
      if (!c.isZero()) for (let i = 0; i <= db; i++) r[i + k] = r[i + k].sub(c.mul(b[i]));
    }
    return { q: P.trim(q), r: P.trim(r.slice(0, db)) };
  };
  P.monic = (a) => { const t = P.trim(a); return t.length ? P.scale(t, t[t.length - 1].inv()) : []; };
  P.gcd = (a, b) => {
    a = P.trim(a); b = P.trim(b);
    while (b.length) { const { r } = P.divmod(a, b); a = b; b = r; }
    return a.length ? P.monic(a) : [Q.ONE];
  };
  P.deriv = (a) => P.trim(a.slice(1).map((c, i) => c.mul(i + 1)));
  P.evalQ = (a, x) => { x = Q.of(x); let r = Q.ZERO; for (let i = a.length - 1; i >= 0; i--) r = r.mul(x).add(a[i]); return r; };
  P.toNum = (a) => a.map((c) => c.toNumber()); // 不 trim：降幂数组末尾的 0 是常数项
  P.descNum = (a) => P.toDesc(a).map((c) => c.toNumber());
  P.eq = (a, b) => P.isZero(P.sub(a, b));
  // 整系数化：返回 {poly(整系数), k}，使 poly = k·a
  P.integerize = (a) => {
    a = P.trim(a); if (!a.length) return { poly: [], k: Q.ONE };
    let l = 1n; for (const c of a) l = (l * c.d) / bgcd(l, c.d);
    let g = 0n; for (const c of a) g = bgcd(g, c.n * (l / c.d));
    let k = new Q(l, g || 1n);
    if (a[a.length - 1].sign() < 0) k = k.neg();
    return { poly: P.scale(a, k), k };
  };
  P.squarefree = (a) => { // Yun：返回 [[f1,1],[f2,2],...]，a = lead·Π fi^i
    a = P.monic(a); const out = [];
    if (P.deg(a) < 1) return out;
    let b = P.gcd(a, P.deriv(a)), c = P.divmod(a, b).q, d = P.sub(P.divmod(P.deriv(a), b).q, P.deriv(c)), i = 1;
    while (P.deg(c) >= 1) {
      const g = P.gcd(c, d);
      if (P.deg(g) >= 1) out.push([P.monic(g), i]);
      c = P.divmod(c, g).q; d = P.sub(P.divmod(d, g).q, P.deriv(c)); i++;
      if (i > 60) break;
    }
    return out;
  };
  // 有理根（有理根定理），系数不太大时可用
  function divisors(n) {
    n = babs(n); if (n === 0n) return [];
    if (n > 10n ** 12n) return null;
    const N = Number(n), out = [];
    for (let i = 1; i * i <= N; i++) if (N % i === 0) { out.push(i); if (i * i !== N) out.push(N / i); }
    return out.length > 4000 ? null : out;
  }
  P.rationalRoots = (a) => { // 返回 {roots:[Q...], rest}
    let { poly } = P.integerize(a); const roots = [];
    while (poly.length > 1 && poly[0].isZero()) { roots.push(Q.ZERO); poly = poly.slice(1); }
    let changed = true;
    while (changed && P.deg(poly) >= 1) {
      changed = false;
      const ps = divisors(poly[0].n), qs = divisors(poly[poly.length - 1].n);
      if (!ps || !qs) break;
      outer: for (const p of ps) for (const q of qs) for (const sg of [1n, -1n]) {
        const r = new Q(sg * BigInt(p), BigInt(q));
        if (P.evalQ(poly, r).isZero()) {
          roots.push(r); poly = P.integerize(P.divmod(poly, [r.neg(), Q.ONE]).q).poly; changed = true; break outer;
        }
      }
    }
    return { roots, rest: poly };
  };
  // TeX：降幂排列
  P.toTeX = (a, v = 's', opts = {}) => {
    const t = P.trim(a);
    if (!t.length) return '0';
    let s = '';
    for (let i = t.length - 1; i >= 0; i--) {
      const c = t[i]; if (c.isZero()) continue;
      const neg = c.sign() < 0, ab = c.abs();
      let cs = (ab.isOne() && i > 0) ? '' : qTeX(ab, opts);
      if (cs.includes('\\times')) cs = '(' + cs + ')';
      const vs = i === 0 ? '' : i === 1 ? v : v + '^{' + i + '}';
      s += (s ? (neg ? ' - ' : ' + ') : (neg ? '-' : '')) + cs + vs;
    }
    return s;
  };

  /* ---------------- 浮点多项式求根（Durand–Kerner） ---------------- */
  const C = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
    abs: (a) => Math.hypot(a[0], a[1]),
  };
  function hornerC(desc, z) { let r = [0, 0]; for (const c of desc) r = C.add(C.mul(r, z), [c, 0]); return r; }
  function rootsNum(desc) { // desc: 浮点降幂系数
    let a = desc.slice(); while (a.length && Math.abs(a[0]) === 0) a.shift();
    const out = [];
    while (a.length > 1 && Math.abs(a[a.length - 1]) === 0) { out.push([0, 0]); a.pop(); }
    const n = a.length - 1; if (n < 1) return out;
    const lc = a[0]; a = a.map((c) => c / lc);
    if (n === 1) { out.push([-a[1], 0]); return out; }
    if (n === 2) {
      const b = a[1], c = a[2], D = b * b - 4 * c;
      if (D >= 0) { const r1 = (-b - Math.sign(b || 1) * Math.sqrt(D)) / 2; const r2 = r1 !== 0 ? c / r1 : -b - r1; out.push([r1, 0], [r2, 0]); }
      else out.push([-b / 2, Math.sqrt(-D) / 2], [-b / 2, -Math.sqrt(-D) / 2]);
      return out;
    }
    let R = 0; for (let i = 1; i <= n; i++) R = Math.max(R, Math.pow(Math.abs(a[i]), 1 / i));
    R = 2 * R || 1;
    let z = []; for (let k = 0; k < n; k++) { const th = 2 * Math.PI * k / n + 0.4; z.push([R * Math.cos(th), R * Math.sin(th)]); }
    for (let it = 0; it < 3000; it++) {
      let delta = 0;
      for (let i = 0; i < n; i++) {
        let den = [1, 0];
        for (let j = 0; j < n; j++) if (j !== i) den = C.mul(den, C.sub(z[i], z[j]));
        const w = C.div(hornerC(a, z[i]), den);
        z[i] = C.sub(z[i], w); delta = Math.max(delta, C.abs(w) / (1 + C.abs(z[i])));
      }
      if (delta < 1e-15) break;
    }
    // 牛顿精修
    const da = a.slice(0, -1).map((c, i) => c * (n - i));
    z = z.map((r) => { for (let k = 0; k < 4; k++) { const f = hornerC(a, r), fp = hornerC(da, r); if (C.abs(fp) < 1e-300) break; const st = C.div(f, fp); if (!isFinite(st[0])) break; r = C.sub(r, st); } return r; });
    for (const r of z) { if (Math.abs(r[1]) < 1e-9 * Math.max(1, Math.abs(r[0]))) r[1] = 0; out.push(r); }
    return out;
  }
  function sortRoots(rs) { return rs.slice().sort((x, y) => (x[0] - y[0]) || (y[1] - x[1])); }
  function rootTeX(r) {
    if (r[1] === 0) return numTeX(r[0]);
    const re = Math.abs(r[0]) < 1e-12 ? '' : numTeX(r[0]);
    const im = numTeX(Math.abs(r[1]));
    return re + (r[1] < 0 ? '-' : (re ? '+' : '')) + 'j' + (im === '1' ? '' : im);
  }
  function rootsTeX(rs) { // 共轭对合并成 a ± jb
    const out = [], used = new Array(rs.length).fill(false);
    rs = sortRoots(rs);
    for (let i = 0; i < rs.length; i++) {
      if (used[i]) continue; used[i] = true;
      const r = rs[i];
      if (r[1] !== 0) {
        for (let j = i + 1; j < rs.length; j++) if (!used[j] && Math.abs(rs[j][0] - r[0]) < 1e-7 * (1 + Math.abs(r[0])) && Math.abs(rs[j][1] + r[1]) < 1e-7 * (1 + Math.abs(r[1]))) { used[j] = true; break; }
        const re = Math.abs(r[0]) < 1e-12 ? '' : numTeX(r[0]); const im = numTeX(Math.abs(r[1]));
        out.push(re + '\\pm j' + (im === '1' ? '' : im));
      } else out.push(numTeX(r[0]));
    }
    return out;
  }

  /* ---------------- 表达式解析 ---------------- */
  const MULTI = ['KP', 'KI', 'KD', 'Kp', 'Ki', 'Kd', 'tau', 'Mp', 'Mc', 'Ra', 'La', 'Kf'];
  function tokenize(src) {
    let s = String(src)
      .replace(/[−–—]/g, '-').replace(/[·×∙]/g, '*').replace(/÷/g, '/')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4').replace(/⁵/g, '^5')
      .replace(/\*\*/g, '^');
    const toks = []; let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
        toks.push({ t: 'num', v: m[0] }); i += m[0].length; continue;
      }
      if ('+-*/^()'.includes(ch)) { toks.push({ t: ch }); i++; continue; }
      if (/[A-Za-zα-ωΑ-Ω]/.test(ch)) {
        const rest = s.slice(i);
        let name = null;
        for (const mname of MULTI) if (rest.startsWith(mname) && !/^[0-9_]/.test(rest.slice(mname.length))) { name = mname; break; }
        if (!name) { const m = /^[A-Za-zα-ωΑ-Ω](_?\d+)?/.exec(rest); name = m[0]; }
        toks.push({ t: 'id', v: name.replace('_', '') }); i += name.length; continue;
      }
      throw new Error('无法识别的字符 / unexpected character: ' + ch);
    }
    return toks;
  }
  function parse(src) {
    const toks = tokenize(src); let p = 0;
    const peek = () => toks[p], eat = (t) => { if (!toks[p] || toks[p].t !== t) throw new Error('表达式语法错误 / syntax error (expected ' + t + '）'); return toks[p++]; };
    function expr() {
      let n = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) { const op = toks[p++].t; n = { k: op, a: n, b: term() }; }
      return n;
    }
    function term() {
      let n = unary();
      for (;;) {
        const t = peek();
        if (t && (t.t === '*' || t.t === '/')) { p++; n = { k: t.t, a: n, b: unary() }; }
        else if (t && (t.t === 'num' || t.t === 'id' || t.t === '(')) { n = { k: '*', a: n, b: power() }; }
        else break;
      }
      return n;
    }
    function unary() {
      const t = peek();
      if (t && t.t === '-') { p++; return { k: 'neg', a: unary() }; }
      if (t && t.t === '+') { p++; return unary(); }
      return power();
    }
    function power() {
      const base = atom();
      if (peek() && peek().t === '^') {
        p++;
        let neg = false; if (peek() && peek().t === '-') { neg = true; p++; }
        const e = peek();
        let ex;
        if (e && e.t === 'num') { p++; ex = Number(e.v); }
        else if (e && e.t === '(') { p++; const t2 = eat('num'); eat(')'); ex = Number(t2.v); }
        else throw new Error('指数必须是非负整数 / exponent must be a non-negative integer');
        if (neg || !Number.isInteger(ex) || ex < 0 || ex > 40) throw new Error('指数必须是非负整数 / exponent must be a non-negative integer');
        return { k: '^', a: base, n: ex };
      }
      return base;
    }
    function atom() {
      const t = peek();
      if (!t) throw new Error('表达式不完整 / incomplete expression');
      if (t.t === 'num') { p++; return { k: 'num', v: t.v }; }
      if (t.t === 'id') { p++; return { k: 'id', v: t.v }; }
      if (t.t === '(') { p++; const e = expr(); eat(')'); return e; }
      throw new Error('表达式语法错误 / syntax error (unexpected ' + t.t + '）');
    }
    if (!toks.length) throw new Error('表达式为空 / empty expression');
    const tree = expr();
    if (p < toks.length) throw new Error('表达式语法错误 / syntax error (extra ' + (toks[p].v || toks[p].t) + '）');
    return tree;
  }
  function idsIn(tree, set = new Set()) {
    if (tree.k === 'id') set.add(tree.v);
    for (const key of ['a', 'b']) if (tree[key]) idsIn(tree[key], set);
    return set;
  }

  // 精确求值：得到“s 的多项式，系数是参数 K 的多项式”（升幂二维数组）
  const SK = {
    trim: (a) => { let i = a.length; while (i > 0 && P.isZero(a[i - 1])) i--; return a.slice(0, i).map(P.trim); },
    add: (a, b) => { const n = Math.max(a.length, b.length), r = []; for (let i = 0; i < n; i++) r.push(P.add(a[i] || [], b[i] || [])); return SK.trim(r); },
    neg: (a) => a.map(P.neg),
    mul: (a, b) => {
      if (!a.length || !b.length) return [];
      const r = []; for (let i = 0; i < a.length + b.length - 1; i++) r.push([]);
      for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = P.add(r[i + j], P.mul(a[i], b[j]));
      return SK.trim(r);
    },
    isConst: (a) => { a = SK.trim(a); return a.length <= 1 && (a.length === 0 || P.deg(a[0]) <= 0); },
    constVal: (a) => { a = SK.trim(a); return a.length ? (P.trim(a[0])[0] || Q.ZERO) : Q.ZERO; },
  };
  function evalSK(tree, param, svar = 's') {
    switch (tree.k) {
      case 'num': return SK.trim([P.const(Q.parse(tree.v))]);
      case 'id':
        if (tree.v === svar) return [[], [Q.ONE]];
        if (param && tree.v === param) return [[Q.ZERO, Q.ONE]];
        throw new Error('未知符号 / unknown symbol “' + tree.v + '”' + (param ? '' : '（只允许 ' + svar + '）/ only ' + svar + ' allowed'));
      case 'neg': return SK.neg(evalSK(tree.a, param, svar));
      case '+': return SK.add(evalSK(tree.a, param, svar), evalSK(tree.b, param, svar));
      case '-': return SK.add(evalSK(tree.a, param, svar), SK.neg(evalSK(tree.b, param, svar)));
      case '*': return SK.mul(evalSK(tree.a, param, svar), evalSK(tree.b, param, svar));
      case '/': {
        const b = evalSK(tree.b, param, svar);
        if (!SK.isConst(b)) throw new Error('除法只允许除以常数，分子分母请分别填写 / only division by constants — enter numerator and denominator separately');
        const c = SK.constVal(b); if (c.isZero()) throw new Error('除以零 / division by zero');
        return SK.trim(evalSK(tree.a, param, svar).map((k) => P.scale(k, c.inv())));
      }
      case '^': { let r = [[Q.ONE]]; const b = evalSK(tree.a, param, svar); for (let i = 0; i < tree.n; i++) r = SK.mul(r, b); return r; }
    }
    throw new Error('内部错误 / internal error');
  }
  // 解析为 s 的有理系数多项式（升幂）
  function polyS(src, svar = 's') {
    const sk = evalSK(parse(src), null, svar);
    return P.trim(sk.map((k) => (P.trim(k)[0] || Q.ZERO)));
  }
  // 解析为 s 的多项式，系数为 K 的多项式（降幂外层，便于 Routh）
  function polySK(src, param) {
    const sk = evalSK(parse(src), param);
    return sk;
  }
  // 浮点求值（二维稳定区域用）：编译成函数 env → 降幂浮点系数
  function compileNum(src, svar = 's') {
    const tree = parse(src);
    const addA = (a, b) => { const n = Math.max(a.length, b.length), r = new Array(n).fill(0); for (let i = 0; i < n; i++) r[i] = (a[i] || 0) + (b[i] || 0); return r; };
    const mulA = (a, b) => { const r = new Array(a.length + b.length - 1).fill(0); for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j]; return r; };
    function ev(t, env) {
      switch (t.k) {
        case 'num': return [Number(t.v)];
        case 'id': if (t.v === svar) return [0, 1]; if (!(t.v in env)) throw new Error('未知符号 / unknown symbol “' + t.v + '”'); return [env[t.v]];
        case 'neg': return ev(t.a, env).map((x) => -x);
        case '+': return addA(ev(t.a, env), ev(t.b, env));
        case '-': return addA(ev(t.a, env), ev(t.b, env).map((x) => -x));
        case '*': return mulA(ev(t.a, env), ev(t.b, env));
        case '/': { const b = ev(t.b, env); if (b.some((x, i) => i > 0 && x !== 0)) throw new Error('除法只允许除以常数 / only division by constants'); return ev(t.a, env).map((x) => x / b[0]); }
        case '^': { let r = [1]; const b = ev(t.a, env); for (let i = 0; i < t.n; i++) r = mulA(r, b); return r; }
      }
    }
    const ids = [...idsIn(tree)].filter((v) => v !== svar);
    return { ids, f: (env) => { const a = ev(tree, env); let i = a.length; while (i > 1 && a[i - 1] === 0) i--; return a.slice(0, i).reverse(); } };
  }

  /* ---------------- Routh 表（课程版本） ---------------- */
  // 通用实现：ops 提供 zero/isZero/sub/mul/div
  function routhGeneric(desc, ops) {
    const n = desc.length - 1;
    const rows = [];
    rows.push(desc.filter((_, i) => i % 2 === 0));
    if (n >= 1) rows.push(desc.filter((_, i) => i % 2 === 1));
    const len = (i) => Math.floor((n - i) / 2) + 1;
    const get = (i, j) => (rows[i] && j < rows[i].length ? rows[i][j] : ops.zero);
    let stopAt = null;
    for (let i = 2; i <= n; i++) {
      const piv = get(i - 1, 0);
      if (ops.isZero(piv)) { stopAt = i; break; }
      const row = [];
      for (let j = 0; j < len(i); j++) row.push(ops.div(ops.sub(ops.mul(piv, get(i - 2, j + 1)), ops.mul(get(i - 2, 0), get(i - 1, j + 1))), piv));
      rows.push(row);
    }
    return { n, rows, stopAt };
  }
  const opsQ = { zero: Q.ZERO, isZero: (a) => a.isZero(), sub: (a, b) => a.sub(b), mul: (a, b) => a.mul(b), div: (a, b) => a.div(b) };
  function routhQ(descIn) {
    let desc = descIn.map(Q.of);
    while (desc.length > 1 && desc[0].isZero()) desc.shift();
    let flipped = false;
    if (desc[0].sign() < 0) { desc = desc.map((c) => c.neg()); flipped = true; }
    const tab = routhGeneric(desc, opsQ);
    let bad = null;
    for (let i = 0; i < tab.rows.length && !bad; i++) for (let j = 0; j < tab.rows[i].length; j++) if (tab.rows[i][j].sign() <= 0) { bad = { i, j, v: tab.rows[i][j] }; break; }
    const firstCol = tab.rows.map((r) => r[0]);
    let changes = 0;
    if (!tab.stopAt && firstCol.every((c) => !c.isZero())) for (let i = 1; i < firstCol.length; i++) if (firstCol[i].sign() !== firstCol[i - 1].sign()) changes++;
    const stable = !bad && !tab.stopAt;
    return { ...tab, desc, flipped, bad, stable, rhp: (tab.stopAt || firstCol.some((c) => c.isZero())) ? null : changes };
  }
  function routhFloat(desc) { // 二维扫描用，快速判断
    let a = desc.slice(); while (a.length > 1 && a[0] === 0) a.shift();
    if (a.length < 2) return a.length === 1 && a[0] !== 0;
    if (a[0] < 0) a = a.map((x) => -x);
    const scale = Math.max(...a.map(Math.abs)) || 1;
    const tol = 1e-12;
    if (a.some((x) => x / scale <= tol)) return false;
    const n = a.length - 1;
    let r0 = a.filter((_, i) => i % 2 === 0), r1 = a.filter((_, i) => i % 2 === 1);
    for (let i = 2; i <= n; i++) {
      const piv = r1[0];
      if (!(piv > tol * scale)) return false;
      const L = Math.floor((n - i) / 2) + 1, r2 = [];
      for (let j = 0; j < L; j++) r2.push((piv * (r0[j + 1] || 0) - r0[0] * (r1[j + 1] || 0)) / piv);
      if (r2[0] <= tol * scale) return false;
      r0 = r1; r1 = r2;
    }
    return r1[0] > 0;
  }

  /* ---------------- K 的有理函数 & 含参 Routh ---------------- */
  const RF = {
    make(n, d) {
      n = P.trim(n); d = P.trim(d);
      if (!d.length) throw new Error('除以零 / division by zero');
      if (!n.length) return { n: [], d: [Q.ONE] };
      const g = P.gcd(n, d);
      if (P.deg(g) >= 1) { n = P.divmod(n, g).q; d = P.divmod(d, g).q; }
      // 整系数、分母首项为正
      let l = 1n; for (const c of n.concat(d)) l = (l * c.d) / bgcd(l, c.d);
      n = P.scale(n, new Q(l)); d = P.scale(d, new Q(l));
      let g2 = 0n; for (const c of n.concat(d)) g2 = bgcd(g2, c.n);
      if (g2 > 1n) { n = P.scale(n, new Q(1n, g2)); d = P.scale(d, new Q(1n, g2)); }
      if (P.lead(d).sign() < 0) { n = P.neg(n); d = P.neg(d); }
      if (P.deg(d) === 0) { n = P.scale(n, d[0].inv()); d = [Q.ONE]; }
      return { n, d };
    },
    of: (p) => RF.make(p, [Q.ONE]),
    isZero: (a) => P.isZero(a.n),
    sub: (a, b) => RF.make(P.sub(P.mul(a.n, b.d), P.mul(b.n, a.d)), P.mul(a.d, b.d)),
    mul: (a, b) => RF.make(P.mul(a.n, b.n), P.mul(a.d, b.d)),
    div: (a, b) => RF.make(P.mul(a.n, b.d), P.mul(a.d, b.n)),
    evalQ: (a, k) => { const d = P.evalQ(a.d, k); if (d.isZero()) return null; return P.evalQ(a.n, k).div(d); },
    toTeX: (a, v) => {
      const nt = P.toTeX(a.n, v);
      if (P.deg(a.d) <= 0) return nt;
      return '\\dfrac{' + nt + '}{' + P.toTeX(a.d, v) + '}';
    },
  };
  RF.zero = { n: [], d: [Q.ONE] };
  const opsRF = { zero: RF.zero, isZero: RF.isZero, sub: RF.sub, mul: RF.mul, div: RF.div };

  // 多项式实根：精确（有理/二次根式）+ 数值
  function sqrtTeXInt(D) { // D: BigInt>0 → {out, inn} 使 √D = out√inn
    let out = 1n, inn = D;
    if (D > 10n ** 14n) return null;
    for (let f = 2n; f * f <= inn; f++) while (inn % (f * f) === 0n) { inn /= f * f; out *= f; }
    return { out, inn };
  }
  function realRootsExact(poly) { // 返回 [{x:number, tex}]
    const res = [];
    if (P.deg(poly) < 1) return res;
    const sf = P.squarefree(poly);
    for (const [f] of sf) {
      const { roots, rest } = P.rationalRoots(f);
      for (const r of roots) res.push({ x: r.toNumber(), tex: qTeX(r) });
      const d = P.deg(rest);
      if (d === 2) {
        const [c, b, a] = P.integerize(rest).poly.map((q) => q.n);
        const D = b * b - 4n * a * c;
        if (D > 0n) {
          const sq = sqrtTeXInt(D);
          const xs = [-1, 1].map((sg) => (-Number(b) + sg * Math.sqrt(Number(D))) / (2 * Number(a)));
          if (sq) {
            let g = bgcd(bgcd(b, sq.out), 2n * a); if (a < 0n) g = -g;
            const B = -b / g, K = sq.out / g, A2 = (2n * a) / g;
            for (const sg of [-1, 1]) {
              const kk = K === 1n ? '' : K.toString();
              const num = (B === 0n ? (sg < 0 ? '-' : '') : B.toString() + (sg < 0 ? '-' : '+')) + kk + '\\sqrt{' + sq.inn + '}';
              res.push({ x: (-Number(b) + sg * Math.sqrt(Number(D))) / (2 * Number(a)), tex: A2 === 1n ? num : '\\frac{' + num + '}{' + A2 + '}' });
            }
          } else xs.forEach((x) => res.push({ x, tex: numTeX(x, { frac: false }) }));
        }
      } else if (d >= 1) {
        for (const r of rootsNum(P.toNum(P.toDesc(rest)).map((x) => x))) if (r[1] === 0) res.push({ x: r[0], tex: numTeX(r[0], { frac: false, sig: 6 }) });
      }
    }
    return res;
  }
  function routhParam(src, param) {
    const sk = polySK(src, param); // 升幂，每项是 K 的多项式
    if (!sk.length) throw new Error('多项式为零 / zero polynomial');
    const desc = sk.slice().reverse().map((k) => RF.of(k));
    const tab = routhGeneric(desc, opsRF);
    const firstCol = tab.rows.map((r) => r[0]);
    // 临界点
    const crit = [];
    const cond = firstCol.filter((rf) => !(P.deg(rf.n) === 0 && P.deg(rf.d) === 0));
    for (const rf of firstCol) for (const p of [rf.n, rf.d]) for (const r of realRootsExact(p)) if (!crit.some((c) => Math.abs(c.x - r.x) < 1e-10 * (1 + Math.abs(r.x)))) crit.push(r);
    crit.sort((a, b) => a.x - b.x);
    const tests = [];
    if (!crit.length) tests.push(0);
    else {
      tests.push(crit[0].x - 1 - Math.abs(crit[0].x));
      for (let i = 0; i + 1 < crit.length; i++) tests.push((crit[i].x + crit[i + 1].x) / 2);
      tests.push(crit[crit.length - 1].x + 1 + Math.abs(crit[crit.length - 1].x));
    }
    const stableAt = (kq) => {
      if (tab.stopAt) return false;
      let sg = 0;
      for (const rf of firstCol) {
        const v = RF.evalQ(rf, kq); if (!v || v.isZero()) return false;
        if (!sg) sg = v.sign(); else if (v.sign() !== sg) return false;
      }
      return true;
    };
    const ivals = tests.map((t, i) => ({ lo: i === 0 ? null : crit[i - 1], hi: i < crit.length ? crit[i] : null, ok: stableAt(Q.of(Number(t.toPrecision(12)))) }));
    const points = crit.filter((c) => stableAt(Q.of(Number(c.x.toPrecision(15)))) && Number.isFinite(c.x));
    return { tab, firstCol, crit, ivals, cond, desc, points };
  }

  /* ---------------- Kharitonov ---------------- */
  // 课程写法：从最高次 a0 开始，四个多项式的上下界模式（L=下界, U=上界）
  const KH_PAT = [['L', 'L', 'U', 'U'], ['L', 'U', 'U', 'L'], ['U', 'L', 'L', 'U'], ['U', 'U', 'L', 'L']];
  function kharitonov(intervals) { // [[lo,hi], ...] 对应 a0..an（降幂）
    return KH_PAT.map((pat) => intervals.map(([lo, hi], i) => (pat[i % 4] === 'L' ? Q.of(lo) : Q.of(hi))));
  }

  /* ---------------- 线性方程组（精确） ---------------- */
  function solveQ(M, rhs) {
    const m = M.length, n = M[0].length;
    const A = M.map((row, i) => row.map(Q.of).concat([Q.of(rhs[i])]));
    const piv = []; let r = 0;
    for (let c = 0; c < n && r < m; c++) {
      let k = -1; for (let i = r; i < m; i++) if (!A[i][c].isZero()) { k = i; break; }
      if (k < 0) continue;
      [A[r], A[k]] = [A[k], A[r]];
      const inv = A[r][c].inv(); for (let j = c; j <= n; j++) A[r][j] = A[r][j].mul(inv);
      for (let i = 0; i < m; i++) if (i !== r && !A[i][c].isZero()) { const f = A[i][c]; for (let j = c; j <= n; j++) A[i][j] = A[i][j].sub(f.mul(A[r][j])); }
      piv.push(c); r++;
    }
    for (let i = r; i < m; i++) if (!A[i][n].isZero()) return { status: 'none', rank: r };
    const x = new Array(n).fill(Q.ZERO);
    piv.forEach((c, i) => { x[c] = A[i][n]; });
    const free = []; for (let c = 0; c < n; c++) if (!piv.includes(c)) free.push(c);
    return { status: free.length ? 'infinite' : 'unique', x, free, rank: r };
  }

  /* ---------------- 期望极点 → c(s) ---------------- */
  function polesToPoly(src) {
    const s = String(src).replace(/[−–—]/g, '-').replace(/\s+/g, '').replace(/\+-|±/g, '±').replace(/i/g, 'j');
    if (!s) throw new Error('请填写期望极点 / enter the desired poles');
    const parts = s.split(/[,;，；]/).filter(Boolean);
    let poly = [Q.ONE]; let count = 0; const list = [];
    for (const part of parts) {
      let m = /^([+-]?[\d.]*)\s*(±|\+|-)\s*(?:j([\d.]*)|([\d.]*)j)$/.exec(part);
      if (m && (m[1] !== '' && m[1] !== '+' && m[1] !== '-')) {
        const a = Q.parse(m[1]); const bs = m[3] !== undefined ? m[3] : m[4]; const b = bs === '' ? Q.ONE : Q.parse(bs);
        if (b.isZero()) { poly = P.mul(poly, [a.neg(), Q.ONE]); poly = P.mul(poly, [a.neg(), Q.ONE]); count += 2; list.push(qTeX(a), qTeX(a)); continue; }
        // (s-a)^2 + b^2
        poly = P.mul(poly, [a.mul(a).add(b.mul(b)), a.mul(-2), Q.ONE]); count += 2;
        list.push((a.isZero() ? '' : qTeX(a)) + '\\pm j' + (b.isOne() ? '' : qTeX(b)));
        continue;
      }
      m = /^(±|\+|-)?j([\d.]*)$|^(±|\+|-)?([\d.]+)j$/.exec(part);
      if (m) { const bs = m[2] !== undefined ? m[2] : m[4]; const b = bs === '' ? Q.ONE : Q.parse(bs); poly = P.mul(poly, [b.mul(b), Q.ZERO, Q.ONE]); count += 2; list.push('\\pm j' + (b.isOne() ? '' : qTeX(b))); continue; }
      const mult = /^(.+?)(?:\(x(\d+)\)|\^(\d+))$/.exec(part);
      let val = part, times = 1;
      if (mult) { val = mult[1]; times = parseInt(mult[2] || mult[3], 10); }
      const r = Q.parse(val);
      for (let t = 0; t < times; t++) { poly = P.mul(poly, [r.neg(), Q.ONE]); count++; list.push(qTeX(r)); }
    }
    return { poly, count, list };
  }

  /* ---------------- 极点配置（Diophantine / Sylvester） ---------------- */
  // T(a, k)：(n+k)×k Toeplitz；a 为降幂系数 a0..an
  function toeplitz(desc, k) {
    const n = desc.length - 1, M = [];
    for (let i = 0; i < n + k; i++) { const row = []; for (let j = 0; j < k; j++) { const idx = i - j; row.push(idx >= 0 && idx <= n ? desc[idx] : Q.ZERO); } M.push(row); }
    return M;
  }
  function polePlace({ a, b, m, strict, c }) {
    // a, b: 升幂多项式（P = b/a）；c: 期望闭环特征多项式（升幂）
    const n = P.deg(a);
    if (n < 1) throw new Error('a(s) 至少一阶 / a(s) must have degree ≥ 1');
    if (P.deg(b) > n) throw new Error('P(s) 必须 proper / P(s) must be proper (deg b ≤ deg a)');
    const aD = P.toDesc(a), bD = []; const bt = P.toDesc(b); for (let i = 0; i < n + 1 - bt.length; i++) bD.push(Q.ZERO); bD.push(...bt);
    const dc = P.deg(c);
    if (dc !== n + m) throw new Error('期望特征多项式应为 n+m = ' + (n + m) + ' 阶，现在是 ' + dc + ' 阶 / desired polynomial must have degree n+m = ' + (n + m) + ', got ' + dc);
    const cD = P.toDesc(c);
    const k = m + 1;
    const Ta = toeplitz(aD, k), Tb = toeplitz(bD, k);
    let S = Ta.map((row, i) => row.concat(Tb[i]));
    let names = []; for (let i = 0; i <= m; i++) names.push('p_{' + i + '}'); for (let i = 0; i <= m; i++) names.push('q_{' + i + '}');
    let cols = names.map((_, i) => i);
    if (strict) { cols = cols.filter((i) => i !== m + 1); S = S.map((row) => cols.map((i) => row[i])); names = cols.map((i) => names[i]); }
    const sol = solveQ(S, cD);
    let p = null, q = null;
    if (sol.status !== 'none') {
      const full = new Array(2 * m + 2).fill(Q.ZERO); cols.forEach((ci, j) => { full[ci] = sol.x[j]; });
      p = P.fromDesc(full.slice(0, m + 1)); q = P.fromDesc(full.slice(m + 1));
    }
    let check = null;
    if (p) check = P.add(P.mul(a, p), P.mul(b, q));
    return { n, m, S, names, rhs: cD, sol, p, q, check, aD, bD };
  }

  /* ---------------- 状态空间 → 传递函数 ---------------- */
  function parseMatrix(src) {
    const rows = String(src).replace(/[\[\]]/g, '').trim().split(/\s*[;\n]\s*/).filter((r) => r.trim() !== '');
    const M = rows.map((r) => r.trim().split(/[\s,]+/).filter(Boolean).map((x) => Q.parse(x.replace(/[−–]/g, '-'))));
    if (!M.length) throw new Error('矩阵为空 / empty matrix');
    const w = M[0].length; if (M.some((r) => r.length !== w)) throw new Error('矩阵各行长度不一致 / rows have different lengths');
    return M;
  }
  const Mx = {
    mul: (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s.add(x.mul(B[k][j])), Q.ZERO))),
    add: (A, B) => A.map((r, i) => r.map((x, j) => x.add(B[i][j]))),
    scale: (A, k) => A.map((r) => r.map((x) => x.mul(k))),
    eye: (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? Q.ONE : Q.ZERO))),
    trace: (A) => A.reduce((s, r, i) => s.add(r[i]), Q.ZERO),
  };
  function ss2tf(A, b, c, d) {
    const n = A.length;
    if (A.some((r) => r.length !== n)) throw new Error('A 必须是方阵 / A must be square');
    if (b.length !== n || b.some((r) => r.length !== 1)) throw new Error('b 应为 / b must be ' + n + '×1');
    if (c.length !== 1 || c[0].length !== n) throw new Error('c 应为 / c must be 1×' + n);
    d = Q.of(d);
    let B = Mx.eye(n); const coef = [Q.ONE]; const numD = [];
    for (let k = 1; k <= n; k++) {
      numD.push(Mx.mul(Mx.mul(c, B), b)[0][0]); // c B_{k-1} b → s^{n-k}
      const AB = Mx.mul(A, B);
      const ak = Mx.trace(AB).div(k).neg(); coef.push(ak);
      B = Mx.add(AB, Mx.scale(Mx.eye(n), ak));
    }
    const den = P.fromDesc(coef);
    let num = P.fromDesc([Q.ZERO].concat(numD));
    num = P.add(num, P.scale(den, d));
    return { num, den };
  }
  // 课程的控制器型 / 观测器型实现（a0≠0）
  function realizations(num, den) {
    const aD = P.toDesc(den), n = aD.length - 1;
    if (P.deg(num) > n) throw new Error('传递函数必须 proper / transfer function must be proper');
    const bt = P.toDesc(num), bD = []; for (let i = 0; i < n + 1 - bt.length; i++) bD.push(Q.ZERO); bD.push(...bt);
    const a0 = aD[0];
    const ar = aD.map((x) => x.div(a0)), b0a = bD[0].div(a0);
    const cvec = []; for (let k = 1; k <= n; k++) cvec.push(bD[k].sub(bD[0].mul(aD[k]).div(a0)));
    const Actrl = [], Aobs = [];
    for (let i = 0; i < n; i++) {
      const r1 = [], r2 = [];
      for (let j = 0; j < n; j++) {
        r1.push(i === 0 ? ar[j + 1].neg() : (j === i - 1 ? Q.ONE : Q.ZERO));
        r2.push(j === 0 ? ar[i + 1].neg() : (j === i + 1 ? Q.ONE : Q.ZERO));
      }
      Actrl.push(r1); Aobs.push(r2);
    }
    const Bctrl = Array.from({ length: n }, (_, i) => [i === 0 ? a0.inv() : Q.ZERO]);
    const Cobs = [Array.from({ length: n }, (_, i) => (i === 0 ? a0.inv() : Q.ZERO))];
    return {
      ctrl: { A: Actrl, B: Bctrl, C: [cvec], D: b0a },
      obs: { A: Aobs, B: cvec.map((x) => [x]), C: Cobs, D: b0a },
    };
  }
  function matTeX(M) { return '\\begin{bmatrix}' + M.map((r) => r.map((x) => qTeX(x)).join(' & ')).join(' \\\\ ') + '\\end{bmatrix}'; }

  /* ---------------- 部分分式 ---------------- */
  function partialFractions(num, den) {
    num = P.trim(num); den = P.trim(den);
    if (!den.length) throw new Error('分母为零 / zero denominator');
    // 约分
    const g = P.gcd(num, den);
    let cancelled = null;
    if (P.deg(g) >= 1) { cancelled = g; num = P.divmod(num, g).q; den = P.divmod(den, g).q; }
    const lc = P.lead(den);
    num = P.scale(num, lc.inv()); den = P.monic(den);
    let direct = [];
    if (P.deg(num) >= P.deg(den)) { const dm = P.divmod(num, den); direct = dm.q; num = dm.r; }
    const sf = P.squarefree(den);
    const poles = []; // {p:[re,im], r, exact:Q|null}
    for (const [f, mult] of sf) {
      const { roots, rest } = P.rationalRoots(f);
      for (const r of roots) poles.push({ p: [r.toNumber(), 0], r: mult, exact: r });
      if (P.deg(rest) >= 1) for (const z of rootsNum(P.toNum(P.toDesc(rest)))) poles.push({ p: z, r: mult, exact: null });
    }
    const numDesc = P.toNum(P.toDesc(num));
    const denDesc = P.toNum(P.toDesc(den));
    const taylor = (desc, z, k) => { // 前 k 个 Taylor 系数 f^{(i)}(z)/i!
      let a = desc.map((x) => [x, 0]); const out = [];
      for (let i = 0; i < k; i++) {
        // synthetic division by (s - z)
        const q = []; let acc = [0, 0];
        for (let j = 0; j < a.length; j++) { acc = C.add(C.mul(acc, z), a[j]); q.push(acc); }
        out.push(q[q.length - 1]); a = q.slice(0, -1);
        if (!a.length) { for (let t = i + 1; t < k; t++) out.push([0, 0]); break; }
      }
      return out;
    };
    const terms = [];
    for (const pole of poles) {
      // R(s) = den / (s-p)^r：合成除法 r 次
      let R = denDesc.map((x) => [x, 0]);
      for (let t = 0; t < pole.r; t++) { const q = []; let acc = [0, 0]; for (let j = 0; j < R.length; j++) { acc = C.add(C.mul(acc, pole.p), R[j]); q.push(acc); } R = q.slice(0, -1); }
      const nT = taylor(numDesc.length ? numDesc : [0], pole.p, pole.r);
      const rT = (() => { let a = R.slice(); const out = []; for (let i = 0; i < pole.r; i++) { const q = []; let acc = [0, 0]; for (let j = 0; j < a.length; j++) { acc = C.add(C.mul(acc, pole.p), a[j]); q.push(acc); } out.push(q[q.length - 1] || [0, 0]); a = q.slice(0, -1); if (!a.length) { while (out.length < pole.r) out.push([0, 0]); break; } } return out; })();
      const h = [];
      for (let k = 0; k < pole.r; k++) { let s = nT[k]; for (let j = 1; j <= k; j++) s = C.sub(s, C.mul(rT[j], h[k - j])); h.push(C.div(s, rT[0])); }
      for (let j = 1; j <= pole.r; j++) {
        const cc = h[pole.r - j];
        terms.push({ p: pole.p, j, c: [Math.abs(cc[0]) < 1e-11 ? 0 : cc[0], Math.abs(cc[1]) < 1e-11 ? 0 : cc[1]], exact: pole.exact });
      }
    }
    return { num, den, direct, poles, terms, cancelled };
  }
  function fact(k) { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; }
  // 系数 × 主体（处理 1、-1）
  function coefMul(c, body) { if (!body) return c; if (c === '1') return body; if (c === '-1') return '-' + body; return c + body; }
  function withSign(str) { return str.startsWith('-') ? str : '+' + str; }
  // (s - p) 的 TeX
  function sMinus(re, exact) {
    if (exact) { if (exact.isZero()) return 's'; const m = exact.neg(); return 's' + (m.sign() > 0 ? '+' : '-') + qTeX(m.abs()); }
    if (Math.abs(re) < 1e-12) return 's';
    return 's' + (re < 0 ? '+' : '-') + numTeX(Math.abs(re));
  }
  function pfTeX(pf) {
    const sTerms = [], tTerms = [];
    const dd = P.trim(pf.direct);
    for (let i = dd.length - 1; i >= 0; i--) {
      if (dd[i].isZero()) continue;
      const c = qTeX(dd[i]);
      sTerms.push(withSign(coefMul(c, i === 0 ? '' : i === 1 ? 's' : 's^{' + i + '}')));
      tTerms.push(withSign(coefMul(c, i === 0 ? '\\delta(t)' : i === 1 ? '\\dot\\delta(t)' : '\\delta^{(' + i + ')}(t)')));
    }
    const done = new Set();
    const expT = (re) => { if (Math.abs(re) < 1e-12) return ''; const r = numTeX(re); return 'e^{' + (r === '-1' ? '-' : r === '1' ? '' : r) + 't}'; };
    const tPow = (j) => (j === 1 ? '' : j === 2 ? 't' : 't^{' + (j - 1) + '}');
    pf.terms.forEach((T, idx) => {
      if (done.has(idx)) return;
      const [re, im] = T.p;
      if (im === 0) {
        const c = T.c[0];
        if (Math.abs(c) < 1e-12) return;
        const base = sMinus(re, T.exact);
        const den = T.j === 1 ? base : (base === 's' ? 's^{' + T.j + '}' : '(' + base + ')^{' + T.j + '}');
        const fr = niceFrac(Math.abs(c), 1000);
        let term;
        if (fr) {
          const dstr = fr[1] === 1 ? den : fr[1] + (base === 's' || T.j > 1 ? den : '(' + den + ')');
          term = '\\frac{' + fr[0] + '}{' + dstr + '}';
        } else term = '\\frac{' + numTeX(Math.abs(c)) + '}{' + den + '}';
        sTerms.push((c < 0 ? '-' : '+') + term);
        tTerms.push(withSign(coefMul(numTeX(c / fact(T.j - 1)), tPow(T.j) + expT(re))));
      } else if (im > 0) {
        const conjIdx = pf.terms.findIndex((U, k) => k !== idx && !done.has(k) && U.j === T.j && Math.abs(U.p[0] - re) < 1e-7 * (1 + Math.abs(re)) && Math.abs(U.p[1] + im) < 1e-7 * (1 + im));
        if (conjIdx >= 0) done.add(conjIdx);
        const x = T.c[0], y = T.c[1];
        const quad = 's^{2}' + (Math.abs(re) < 1e-12 ? '' : (re < 0 ? '+' : '-') + numTeX(Math.abs(2 * re)) + 's') + '+' + numTeX(re * re + im * im);
        if (T.j === 1) {
          const A = 2 * x, B = -2 * (x * re + y * im);
          let nu = '';
          if (Math.abs(A) > 1e-12) nu += coefMul(numTeX(A), 's');
          if (Math.abs(B) > 1e-12) nu += (B > 0 && nu ? '+' : '') + numTeX(B);
          if (nu) sTerms.push('+\\frac{' + nu + '}{' + quad + '}');
        } else {
          const cp = (sg) => '(' + numTeX(x) + (y * sg < 0 ? '-' : '+') + 'j' + numTeX(Math.abs(y)) + ')';
          const b = numTeX(im) === '1' ? '' : numTeX(im);
          const sp = sMinus(re, null);
          sTerms.push('+\\frac{' + cp(1) + '}{(' + sp + '-j' + b + ')^{' + T.j + '}}+\\frac{' + cp(-1) + '}{(' + sp + '+j' + b + ')^{' + T.j + '}}');
        }
        const w = numTeX(im) === '1' ? '' : numTeX(im);
        const f = fact(T.j - 1), A = 2 * x / f, B = -2 * y / f;
        const parts = [];
        if (Math.abs(A) > 1e-12) parts.push(coefMul(numTeX(A), '\\cos ' + w + 't'));
        if (Math.abs(B) > 1e-12) parts.push(coefMul(numTeX(B), '\\sin ' + w + 't'));
        if (!parts.length) return;
        let inner = parts[0] + (parts[1] ? withSign(parts[1]) : '');
        const pre = tPow(T.j) + expT(re);
        if (pre) {
          // 公共负号提出来更好看
          if (parts.every((p) => p.startsWith('-'))) inner = '-' + pre + '\\left(' + inner.replace(/^-/, '').replace(/-(?=\\|\d|\\tfrac)/g, '+') + '\\right)';
          else inner = pre + '\\left(' + inner + '\\right)';
        }
        tTerms.push(withSign(inner));
      }
    });
    const join = (arr) => { const s = arr.join(''); return s.startsWith('+') ? s.slice(1) : s || '0'; };
    return { s: join(sTerms), t: join(tTerms) };
  }

  /* ---------------- 精确优先的求根（带重数） ---------------- */
  // 返回 [{re, im, mult, tex}]，复根只列 im>0 的一个（tex 写成 a±jb），实根各一项
  function rootsExact(poly) {
    const out = [];
    poly = P.trim(poly);
    if (P.deg(poly) < 1) return out;
    const decTeX = (x) => expTeX(fmtDec(x, 5));
    for (const [f, mult] of P.squarefree(poly)) {
      const { roots, rest } = P.rationalRoots(f);
      for (const r of roots) out.push({ re: r.toNumber(), im: 0, mult, tex: qTeX(r) });
      const d = P.deg(rest);
      if (d === 2) {
        const [C0, B0, A0] = P.integerize(rest).poly.map((q) => q.n);
        const D = B0 * B0 - 4n * A0 * C0;
        const sq = sqrtTeXInt(D < 0n ? -D : D);
        const reQ = new Q(-B0, 2n * A0);
        if (D < 0n) {
          const im = Math.sqrt(Number(-D)) / (2 * Math.abs(Number(A0)));
          let imT;
          if (sq) { const den = 2n * babs(A0), g = bgcd(sq.out, den); const o = sq.out / g, dd = den / g; const core = (sq.inn === 1n ? o.toString() : (o === 1n ? '' : o.toString()) + '\\sqrt{' + sq.inn + '}'); imT = dd === 1n ? core : '\\frac{' + core + '}{' + dd + '}'; } else imT = decTeX(im);
          if (imT === '1') imT = '';
          out.push({ re: reQ.toNumber(), im, mult, tex: (reQ.isZero() ? '' : qTeX(reQ)) + '\\pm j' + imT });
        } else {
          for (const r of realRootsExact(rest)) out.push({ re: r.x, im: 0, mult, tex: r.tex });
        }
      } else if (d >= 1) {
        const rs = rootsNum(P.toDesc(rest).map((c) => c.toNumber()));
        for (const r of rs) {
          if (r[1] < 0) continue;
          const imT = decTeX(r[1]) === '1' ? '' : decTeX(r[1]);
          out.push({ re: r[0], im: r[1], mult, tex: r[1] === 0 ? decTeX(r[0]) : (Math.abs(r[0]) < 1e-12 ? '' : decTeX(r[0])) + '\\pm j' + imT });
        }
      }
    }
    out.sort((a, b) => a.re - b.re || b.im - a.im);
    return out;
  }
  // 全部根（复根两个都列，含重数），供稳定性判断
  function rootsQ(poly) {
    const out = [];
    for (const r of rootsExact(poly)) for (let k = 0; k < r.mult; k++) { if (r.im) out.push([r.re, r.im], [r.re, -r.im]); else out.push([r.re, 0]); }
    return out;
  }
  function rootsExactTeX(poly) {
    return rootsExact(poly).map((r) => r.tex + (r.mult > 1 ? '\\ (\\times' + r.mult + ')' : ''));
  }

  /* ---------------- 导出 ---------------- */
  const CM = {
    Q, P, RF, SK, C, parse, polyS, polySK, compileNum, idsIn,
    routhQ, routhFloat, routhParam, kharitonov, KH_PAT, solveQ, polesToPoly, toeplitz, polePlace,
    parseMatrix, Mx, ss2tf, realizations, matTeX, partialFractions, pfTeX,
    rootsNum, rootsTeX, rootTeX, sortRoots, realRootsExact, rootsExact, rootsQ, rootsExactTeX,
    numTeX, numTxt, qTeX, fmtDec, niceFrac,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CM; else root.CM = CM;
})(typeof window !== 'undefined' ? window : globalThis);
