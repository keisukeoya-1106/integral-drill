// 数学III 定積分の問題生成。日付から毎日5題(5分野から1題ずつ)を決める。
// - 各タイプはパラメータの組合せごとに別の問題になる(TYPES)。
// - 分野ごとに「問題プール」を作り、日付から決まる順列で1日1題ずつ消化する。
//   プールを使い切るまで同じ問題は出ず、周回の境目でも同じ問題が90日未満で再登場しない。
// 各問題は { tex, ans:{tex,val}, steps, f, lo, hi } を持ち、f を数値積分して val と一致することを check.js で確認する。
(function (root) {
  "use strict";

  // ---------- 乱数 ----------
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    const r = mulberry32(seed);
    return {
      next: r,
      int: (a, b) => a + Math.floor(r() * (b - a + 1)),
      pick: arr => arr[Math.floor(r() * arr.length)]
    };
  }

  // ---------- 分数 ----------
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
  function F(n, d) {
    if (d === undefined) d = 1;
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1;
    return { n: n / g, d: d / g };
  }
  const fadd = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
  const fmul = (a, b) => F(a.n * b.n, a.d * b.d);
  const fneg = a => F(-a.n, a.d);
  const fval = a => a.n / a.d;

  // ---------- 記号(係数に掛ける無理数など) ----------
  const PI = { tex: "\\pi", val: Math.PI };
  const PI2 = { tex: "\\pi^{2}", val: Math.PI * Math.PI };
  const SQ2 = { tex: "\\sqrt{2}", val: Math.SQRT2 };
  const SQ3 = { tex: "\\sqrt{3}", val: Math.sqrt(3) };
  const SQ6 = { tex: "\\sqrt{6}", val: Math.sqrt(6) };
  const LN2 = { tex: "\\ln 2", val: Math.LN2 };
  const LN3 = { tex: "\\ln 3", val: Math.log(3) };
  function lnR(p, q) {
    const g = gcd(p, q); p /= g; q /= g;
    return q === 1
      ? { tex: `\\ln ${p}`, val: Math.log(p) }
      : { tex: `\\ln\\dfrac{${p}}{${q}}`, val: Math.log(p / q) };
  }
  // e の j 乗(j は負も可)
  function eP(j) { return { tex: j === 1 ? "e" : `e^{${j}}`, val: Math.exp(j) }; }
  const eNeg = k => eP(-k);

  // terms: [{c:分数, f:[記号...]}] → { tex, val }
  function lin(terms) {
    const ts = terms.filter(t => t.c.n !== 0);
    if (!ts.length) return { tex: "0", val: 0 };
    let tex = "", val = 0;
    ts.forEach((t, i) => {
      const fs = t.f || [];
      const sym = fs.map(x => x.tex).join("");
      const abs = Math.abs(t.c.n), neg = t.c.n < 0;
      let body;
      if (!sym) {
        body = t.c.d === 1 ? `${abs}` : `\\dfrac{${abs}}{${t.c.d}}`;
      } else {
        const coef = abs === 1 ? "" : `${abs}`;
        if (sym.includes("dfrac")) body = t.c.d === 1 ? `${coef}${sym}` : `\\dfrac{${abs}}{${t.c.d}}${sym}`;
        else body = t.c.d === 1 ? `${coef}${sym}` : `\\dfrac{${coef}${sym}}{${t.c.d}}`;
      }
      tex += i === 0 ? (neg ? "-" : "") + body : (neg ? " - " : " + ") + body;
      val += fval(t.c) * fs.reduce((p, x) => p * x.val, 1);
    });
    return { tex, val };
  }

  // 値 r + s√3 (r, s は分数) の算術。sin, cos の π/6 の倍数での値に使う
  const SIN_TAB = [
    [F(0), F(0)], [F(1, 2), F(0)], [F(0), F(1, 2)], [F(1), F(0)], [F(0), F(1, 2)], [F(1, 2), F(0)],
    [F(0), F(0)], [F(-1, 2), F(0)], [F(0), F(-1, 2)], [F(-1), F(0)], [F(0), F(-1, 2)], [F(-1, 2), F(0)]
  ];
  const sinM = m => SIN_TAB[((m % 12) + 12) % 12]; // sin(mπ/6)
  const cosM = m => sinM(m + 3);                    // cos(mπ/6)
  const mulS = (A, B) => [fadd(fmul(A[0], B[0]), fmul(F(3), fmul(A[1], B[1]))), fadd(fmul(A[0], B[1]), fmul(A[1], B[0]))];
  const cubeS = A => mulS(A, mulS(A, A));
  function pushS(terms, S, c, extra) {
    if (S[0].n) terms.push({ c: fmul(c, S[0]), f: extra.slice() });
    if (S[1].n) terms.push({ c: fmul(c, S[1]), f: extra.concat([SQ3]) });
  }

  const fracTex = f => (f.d === 1 ? `${f.n}` : f.n < 0 ? `-\\dfrac{${-f.n}}{${f.d}}` : `\\dfrac{${f.n}}{${f.d}}`);
  const sq3Tex = c => (c.d === 1 ? `${c.n === 1 ? "" : c.n}\\sqrt{3}` : `\\dfrac{${c.n === 1 ? "" : c.n}\\sqrt{3}}{${c.d}}`);
  const piOver = h => (h === 1 ? "\\pi" : `\\dfrac{\\pi}{${h}}`);
  function piM(m) { // mπ/6
    const f = F(m, 6);
    return f.d === 1 ? (f.n === 1 ? "\\pi" : `${f.n}\\pi`) : (f.n === 1 ? `\\dfrac{\\pi}{${f.d}}` : `\\dfrac{${f.n}\\pi}{${f.d}}`);
  }
  const coefTex = c => (c === 1 ? "" : c === -1 ? "-" : `${c}`);
  function linTex(p, q) {
    let s = "";
    if (p !== 0) s += (p === 1 ? "" : p === -1 ? "-" : p) + "x";
    if (q !== 0) s += s ? (q > 0 ? "+" : "-") + Math.abs(q) : q;
    return s || "0";
  }
  const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); };
  const dfact = n => { let r = 1; for (let i = n; i > 1; i -= 2) r *= i; return r; };
  // 積分の上下端の分数は縦に伸びないよう \frac にする
  const lim = s => s.replace(/\\dfrac/g, "\\frac");
  const integ = (lo, hi, body) => `\\displaystyle\\int_{${lim(lo)}}^{${lim(hi)}} ${body}\\,dx`;

  // ---------- 問題の型 ----------
  const CATS = [
    { key: "sub", label: "置換積分" },
    { key: "trig", label: "三角関数" },
    { key: "frac", label: "分数関数" },
    { key: "ibp", label: "部分積分" },
    { key: "irr", label: "無理関数・円" }
  ];
  const TYPES = [];
  function def(cat, level, hint, make) { TYPES.push({ cat, level, hint, make }); }
  // ピタゴラス数 [a, L, c]: a²+L²=c²
  const TRI = [[3, 4, 5], [4, 3, 5], [5, 12, 13], [12, 5, 13], [6, 8, 10], [8, 6, 10], [9, 12, 15], [12, 9, 15], [8, 15, 17], [15, 8, 17], [7, 24, 25], [24, 7, 25]];

  // =====================================================================
  // 置換積分
  // =====================================================================
  def("sub", 1, "$x^2+a$ のかたまりを $u$ と置く", r => {
    const a = r.int(1, 5), n = r.int(2, 5), b = r.int(1, 2);
    const ans = lin([{ c: F((b * b + a) ** (n + 1) - a ** (n + 1), 2 * (n + 1)), f: [] }]);
    return {
      body: String.raw`x\left(x^{2}+${a}\right)^{${n}}`, loTex: "0", hiTex: `${b}`, lo: 0, hi: b,
      f: x => x * (x * x + a) ** n, ans,
      steps: String.raw`$u=x^{2}+${a}$ とおくと $du=2x\,dx$。$x:0\to${b}$ のとき $u:${a}\to${b * b + a}$。
$$\int_0^{${b}} x(x^2+${a})^{${n}}dx=\frac12\int_{${a}}^{${b * b + a}}u^{${n}}\,du=\frac12\left[\frac{u^{${n + 1}}}{${n + 1}}\right]_{${a}}^{${b * b + a}}=${ans.tex}$$`
    };
  });
  def("sub", 2, "ルートの中身 $x+a$ を $u$ と置く", r => {
    const p = r.pick([2, 3]), q = r.int(p + 1, 5), a = r.int(1, 4);
    const lo = p * p - a, hi = q * q - a;
    const ans = lin([{ c: fadd(F(2 * (q ** 5 - p ** 5), 5), fneg(F(2 * a * (q ** 3 - p ** 3), 3))), f: [] }]);
    return {
      body: String.raw`x\sqrt{x+${a}}`, loTex: `${lo}`, hiTex: `${hi}`, lo, hi,
      f: x => x * Math.sqrt(x + a), ans,
      steps: String.raw`$u=x+${a}$ とおくと $x=u-${a}$、$dx=du$。$x:${lo}\to${hi}$ のとき $u:${p * p}\to${q * q}$。
$$\int_{${lo}}^{${hi}} x\sqrt{x+${a}}\,dx=\int_{${p * p}}^{${q * q}}(u-${a})u^{\frac12}du=\left[\frac25u^{\frac52}-\frac{${2 * a}}{3}u^{\frac32}\right]_{${p * p}}^{${q * q}}=${ans.tex}$$`
    };
  });
  def("sub", 1, "分母の微分が分子に現れる(分母を $u$ と置く)", r => {
    const c = r.int(1, 5), k = r.pick([1, 2, 3, 4, 5, 6]), hi = r.int(1, 2);
    const ans = lin([{ c: F(k, 2), f: [lnR(hi * hi + c, c)] }]);
    return {
      body: String.raw`\dfrac{${k === 1 ? "" : k}x}{x^{2}+${c}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => k * x / (x * x + c), ans,
      steps: String.raw`$u=x^{2}+${c}$ とおくと $du=2x\,dx$。$x:0\to${hi}$ のとき $u:${c}\to${hi * hi + c}$。
$$\int_0^{${hi}}\frac{${k === 1 ? "" : k}x}{x^2+${c}}dx=\frac{${k}}{2}\int_{${c}}^{${hi * hi + c}}\frac{du}{u}=\frac{${k}}{2}\Bigl[\ln u\Bigr]_{${c}}^{${hi * hi + c}}=${ans.tex}$$`
    };
  });
  def("sub", 1, "$\\ln x=t$ と置く", r => {
    const n = r.int(1, 5), m = r.int(1, 4);
    const ans = lin([{ c: F(m ** (n + 1), n + 1), f: [] }]);
    const hiTex = m === 1 ? "e" : `e^{${m}}`;
    return {
      body: n === 1 ? String.raw`\dfrac{\ln x}{x}` : String.raw`\dfrac{(\ln x)^{${n}}}{x}`, loTex: "1", hiTex, lo: 1, hi: Math.exp(m),
      f: x => Math.log(x) ** n / x, ans,
      steps: String.raw`$t=\ln x$ とおくと $dt=\dfrac{1}{x}dx$。$x:1\to${hiTex}$ のとき $t:0\to${m}$。
$$\int_1^{${hiTex}}\frac{(\ln x)^{${n}}}{x}dx=\int_0^{${m}}t^{${n}}dt=\left[\frac{t^{${n + 1}}}{${n + 1}}\right]_0^{${m}}=${ans.tex}$$`
    };
  });
  def("sub", 1, "$x^2$ の部分を $u$ と置く", r => {
    const k = r.int(1, 6), s = r.pick([1, -1]), hi = s > 0 ? 1 : r.int(1, 2);
    const j = s * k * hi * hi;
    const c = F(1, 2 * s * k);
    const ans = lin([{ c, f: [eP(j)] }, { c: fneg(c), f: [] }]);
    const ex = `${s < 0 ? "-" : ""}${k === 1 ? "" : k}x^{2}`;
    return {
      body: String.raw`xe^{${ex}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => x * Math.exp(s * k * x * x), ans,
      steps: String.raw`$u=${ex}$ とおくと $du=${2 * s * k}x\,dx$。$x:0\to${hi}$ のとき $u:0\to${j}$。
$$\int_0^{${hi}}xe^{${ex}}dx=\frac{1}{${2 * s * k}}\int_0^{${j}}e^u\,du=\frac{1}{${2 * s * k}}\Bigl[e^u\Bigr]_0^{${j}}=${ans.tex}$$`
    };
  });
  def("sub", 2, "$e^x+a=u$ と置く", r => {
    const a = r.int(1, 6), hi = r.int(1, 2);
    const ans = { tex: String.raw`\ln\dfrac{${hi === 1 ? "e" : "e^{2}"}+${a}}{${1 + a}}`, val: Math.log((Math.exp(hi) + a) / (1 + a)) };
    const eh = hi === 1 ? "e" : "e^{2}";
    return {
      body: String.raw`\dfrac{e^{x}}{e^{x}+${a}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => Math.exp(x) / (Math.exp(x) + a), ans,
      steps: String.raw`$u=e^{x}+${a}$ とおくと $du=e^x\,dx$。$x:0\to${hi}$ のとき $u:${1 + a}\to ${eh}+${a}$。
$$\int_0^{${hi}}\frac{e^x}{e^x+${a}}dx=\int_{${1 + a}}^{${eh}+${a}}\frac{du}{u}=\Bigl[\ln u\Bigr]_{${1 + a}}^{${eh}+${a}}=${ans.tex}$$
($\ln(${eh}+${a})-\ln ${1 + a}$ のままでも正解です)`
    };
  });
  def("sub", 3, "$t=\\sqrt{x+1}$ と置く", r => {
    const m = r.int(2, 7);
    const hi = m * m - 1;
    const ans = lin([{ c: F(2 * (m - 1)), f: [] }, { c: F(-2), f: [lnR(m + 1, 2)] }]);
    return {
      body: String.raw`\dfrac{1}{\sqrt{x+1}+1}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => 1 / (Math.sqrt(x + 1) + 1), ans,
      steps: String.raw`$t=\sqrt{x+1}$ とおくと $x=t^2-1$、$dx=2t\,dt$。$x:0\to${hi}$ のとき $t:1\to${m}$。
$$\int_0^{${hi}}\frac{dx}{\sqrt{x+1}+1}=\int_1^{${m}}\frac{2t}{t+1}dt=2\int_1^{${m}}\Bigl(1-\frac{1}{t+1}\Bigr)dt=2\Bigl[t-\ln(t+1)\Bigr]_1^{${m}}=${ans.tex}$$`
    };
  });
  def("sub", 2, "分母の $\\sin x$ か $\\cos x$ を $u$ と置く", r => {
    const a = r.int(1, 5), kind = r.pick(["cs", "sc", "cs2"]);
    const range = String.raw`$x:0\to\frac{\pi}{2}$`;
    let body, f, ans, steps;
    if (kind === "cs") {
      body = String.raw`\dfrac{\cos x}{${a}+\sin x}`; f = x => Math.cos(x) / (a + Math.sin(x));
      ans = lin([{ c: F(1), f: [lnR(a + 1, a)] }]);
      steps = String.raw`$u=${a}+\sin x$ とおくと $du=\cos x\,dx$。${range} のとき $u:${a}\to${a + 1}$。
$$\int_0^{\frac{\pi}{2}}\frac{\cos x}{${a}+\sin x}dx=\int_{${a}}^{${a + 1}}\frac{du}{u}=\Bigl[\ln u\Bigr]_{${a}}^{${a + 1}}=${ans.tex}$$`;
    } else if (kind === "sc") {
      body = String.raw`\dfrac{\sin x}{${a}+\cos x}`; f = x => Math.sin(x) / (a + Math.cos(x));
      ans = lin([{ c: F(1), f: [lnR(a + 1, a)] }]);
      steps = String.raw`$u=${a}+\cos x$ とおくと $du=-\sin x\,dx$。${range} のとき $u:${a + 1}\to${a}$。
$$\int_0^{\frac{\pi}{2}}\frac{\sin x}{${a}+\cos x}dx=-\int_{${a + 1}}^{${a}}\frac{du}{u}=\Bigl[\ln u\Bigr]_{${a}}^{${a + 1}}=${ans.tex}$$`;
    } else {
      body = String.raw`\dfrac{\cos x}{(${a}+\sin x)^{2}}`; f = x => Math.cos(x) / (a + Math.sin(x)) ** 2;
      ans = lin([{ c: F(1, a * (a + 1)), f: [] }]);
      steps = String.raw`$u=${a}+\sin x$ とおくと $du=\cos x\,dx$。${range} のとき $u:${a}\to${a + 1}$。
$$\int_0^{\frac{\pi}{2}}\frac{\cos x}{(${a}+\sin x)^2}dx=\int_{${a}}^{${a + 1}}u^{-2}du=\Bigl[-\frac{1}{u}\Bigr]_{${a}}^{${a + 1}}=${ans.tex}$$`;
    }
    return { body, loTex: "0", hiTex: "\\dfrac{\\pi}{2}", lo: 0, hi: Math.PI / 2, f, ans, steps };
  });
  def("sub", 2, "$x^3+a$ のかたまりを $u$ と置く", r => {
    const a = r.int(1, 4), n = r.int(2, 4), b = r.int(1, 2);
    const ans = lin([{ c: F((b ** 3 + a) ** (n + 1) - a ** (n + 1), 3 * (n + 1)), f: [] }]);
    return {
      body: String.raw`x^{2}\left(x^{3}+${a}\right)^{${n}}`, loTex: "0", hiTex: `${b}`, lo: 0, hi: b,
      f: x => x * x * (x ** 3 + a) ** n, ans,
      steps: String.raw`$u=x^{3}+${a}$ とおくと $du=3x^2\,dx$。$x:0\to${b}$ のとき $u:${a}\to${b ** 3 + a}$。
$$\int_0^{${b}}x^2(x^3+${a})^{${n}}dx=\frac13\int_{${a}}^{${b ** 3 + a}}u^{${n}}du=\frac13\Bigl[\frac{u^{${n + 1}}}{${n + 1}}\Bigr]_{${a}}^{${b ** 3 + a}}=${ans.tex}$$`
    };
  });
  def("sub", 2, "$e^x+1$ を $u$ と置く", r => {
    const a = r.int(2, 6), n = r.int(2, 4);
    const ans = lin([{ c: F((a + 1) ** (n + 1) - 2 ** (n + 1), n + 1), f: [] }]);
    return {
      body: String.raw`e^{x}\left(e^{x}+1\right)^{${n}}`, loTex: "0", hiTex: `\\ln ${a}`, lo: 0, hi: Math.log(a),
      f: x => Math.exp(x) * (Math.exp(x) + 1) ** n, ans,
      steps: String.raw`$u=e^{x}+1$ とおくと $du=e^x\,dx$。$x:0\to\ln ${a}$ のとき $u:2\to${a + 1}$。
$$\int_0^{\ln ${a}}e^x(e^x+1)^{${n}}dx=\int_2^{${a + 1}}u^{${n}}du=\Bigl[\frac{u^{${n + 1}}}{${n + 1}}\Bigr]_2^{${a + 1}}=${ans.tex}$$`
    };
  });
  def("sub", 2, "$a+\\ln x$ を $t$ と置く", r => {
    const a = r.int(1, 4), m = r.int(1, 4);
    const ans = lin([{ c: F(1), f: [lnR(a + m, a)] }]);
    const hiTex = m === 1 ? "e" : `e^{${m}}`;
    return {
      body: String.raw`\dfrac{1}{x(${a}+\ln x)}`, loTex: "1", hiTex, lo: 1, hi: Math.exp(m),
      f: x => 1 / (x * (a + Math.log(x))), ans,
      steps: String.raw`$t=${a}+\ln x$ とおくと $dt=\dfrac{1}{x}dx$。$x:1\to${hiTex}$ のとき $t:${a}\to${a + m}$。
$$\int_1^{${hiTex}}\frac{dx}{x(${a}+\ln x)}=\int_{${a}}^{${a + m}}\frac{dt}{t}=\Bigl[\ln t\Bigr]_{${a}}^{${a + m}}=${ans.tex}$$`
    };
  });
  def("sub", 2, "$x^2+c$ を $u$ と置く(分母が累乗)", r => {
    const c = r.int(1, 4), n = r.int(2, 4);
    const ans = lin([{ c: F(1, 2 * (n - 1)) , f: [] }].map(t => ({ c: fadd(fmul(t.c, F(1, c ** (n - 1))), fneg(fmul(t.c, F(1, (1 + c) ** (n - 1))))), f: [] })));
    return {
      body: String.raw`\dfrac{x}{(x^{2}+${c})^{${n}}}`, loTex: "0", hiTex: "1", lo: 0, hi: 1,
      f: x => x / (x * x + c) ** n, ans,
      steps: String.raw`$u=x^{2}+${c}$ とおくと $x\,dx=\dfrac{du}{2}$。$x:0\to1$ のとき $u:${c}\to${1 + c}$。
$$\int_0^1\frac{x}{(x^2+${c})^{${n}}}dx=\frac12\int_{${c}}^{${1 + c}}u^{-${n}}du=\frac12\Bigl[-\frac{1}{${n - 1}u^{${n - 1}}}\Bigr]_{${c}}^{${1 + c}}=${ans.tex}$$`
    };
  });

  // =====================================================================
  // 三角関数
  // =====================================================================
  def("trig", 1, "半角の公式で次数を下げる", r => {
    const k = r.int(1, 3), h = r.pick([1, 2, 3, 4, 6, 12]), kind = r.pick(["sin", "cos"]);
    const sg = kind === "sin" ? -1 : 1;
    const m = 12 * k / h; // 2k·(π/h) = m·π/6
    const t = [{ c: F(1, 2 * h), f: [PI] }];
    pushS(t, sinM(m), F(sg, 4 * k), []);
    const ans = lin(t), KN = "\\" + kind, kx = k === 1 ? "x" : `${k}x`;
    return {
      body: String.raw`${KN}^{2}${kx}`, loTex: "0", hiTex: piOver(h), lo: 0, hi: Math.PI / h,
      f: x => (kind === "sin" ? Math.sin(k * x) : Math.cos(k * x)) ** 2, ans,
      steps: String.raw`半角の公式 $${KN}^2${kx}=\dfrac{1${sg < 0 ? "-" : "+"}\cos ${2 * k === 1 ? "" : 2 * k}x}{2}$ より
$$\int_0^{${piOver(h)}}${KN}^2${kx}\,dx=\Bigl[\frac{x}{2}${sg < 0 ? "-" : "+"}\frac{\sin ${2 * k}x}{${4 * k}}\Bigr]_0^{${piOver(h)}}=${ans.tex}$$`
    };
  });
  def("trig", 2, "奇数乗の側から $\\sin x$ か $\\cos x$ を1つ取り出して置換", r => {
    const [m, n] = r.pick([[1, 1], [1, 2], [2, 1], [1, 3], [3, 1], [2, 3], [3, 2], [1, 4], [4, 1], [3, 3], [2, 5], [5, 2], [4, 3], [3, 4], [1, 5], [5, 1], [5, 3], [3, 5], [4, 5], [5, 4], [6, 1], [1, 6]]);
    const oddCos = n % 2 === 1;
    const k = ((oddCos ? n : m) - 1) / 2, e = oddCos ? m : n;
    let v = 0;
    for (let j = 0; j <= k; j++) v += (j % 2 ? -1 : 1) * C(k, j) / (e + 2 * j + 1);
    let d = 1; for (let j = 0; j <= k; j++) d = d * (e + 2 * j + 1) / gcd(d, e + 2 * j + 1);
    const ans = lin([{ c: F(Math.round(v * d), d), f: [] }]);
    const pw = (s, p) => "\\" + s + (p === 1 ? " x" : `^{${p}}x`);
    const tName = oddCos ? "\\sin x" : "\\cos x", oddName = oddCos ? "\\cos" : "\\sin";
    return {
      body: pw("sin", m) + String.raw`\,` + pw("cos", n), loTex: "0", hiTex: "\\dfrac{\\pi}{2}", lo: 0, hi: Math.PI / 2,
      f: x => Math.sin(x) ** m * Math.cos(x) ** n, ans,
      steps: String.raw`$t=${tName}$ とおくと $dt=${oddCos ? "" : "-"}${oddName} x\,dx$。$x:0\to\frac{\pi}{2}$ のとき $t:${oddCos ? "0\\to1" : "1\\to0"}$。
$${oddName}^{${oddCos ? n : m}}x=(1-t^2)^{${k}}${oddName} x$ と書き換えて
$$\int_0^{\frac{\pi}{2}}\sin^{${m}}x\cos^{${n}}x\,dx=\int_0^1t^{${e}}(1-t^2)^{${k}}dt=${ans.tex}$$
($(1-t^2)^{${k}}$ を展開して項別に積分する)`
    };
  });
  const cosk = k => [1, 0, -1, 0][((k % 4) + 4) % 4];
  const sink = k => [0, 1, 0, -1][((k % 4) + 4) % 4];
  const tx = a => (a === 1 ? "x" : `${a}x`);
  def("trig", 2, "積和の公式で和の形に直す", r => {
    const [a, b] = r.pick([[2, 1], [3, 1], [3, 2], [4, 1], [4, 2], [4, 3], [5, 2], [5, 3], [5, 1], [5, 4], [6, 1], [6, 5]]);
    const kind = r.pick(["sc", "cc", "ss"]);
    const p = a + b, q = a - b;
    let v, body, formula, anti;
    if (kind === "sc") {
      v = fmul(F(1, 2), fadd(F(1 - cosk(p), p), F(1 - cosk(q), q)));
      body = String.raw`\sin ${tx(a)}\cos ${tx(b)}`;
      formula = String.raw`\sin ${tx(a)}\cos ${tx(b)}=\frac12\{\sin ${tx(p)}+\sin ${tx(q)}\}`;
      anti = String.raw`\frac12\Bigl[-\frac{\cos ${tx(p)}}{${p}}-\frac{\cos ${tx(q)}}{${q}}\Bigr]_0^{\frac{\pi}{2}}`;
    } else if (kind === "cc") {
      v = fmul(F(1, 2), fadd(F(sink(p), p), F(sink(q), q)));
      body = String.raw`\cos ${tx(a)}\cos ${tx(b)}`;
      formula = String.raw`\cos ${tx(a)}\cos ${tx(b)}=\frac12\{\cos ${tx(p)}+\cos ${tx(q)}\}`;
      anti = String.raw`\frac12\Bigl[\frac{\sin ${tx(p)}}{${p}}+\frac{\sin ${tx(q)}}{${q}}\Bigr]_0^{\frac{\pi}{2}}`;
    } else {
      v = fmul(F(1, 2), fadd(F(sink(q), q), fneg(F(sink(p), p))));
      body = String.raw`\sin ${tx(a)}\sin ${tx(b)}`;
      formula = String.raw`\sin ${tx(a)}\sin ${tx(b)}=\frac12\{\cos ${tx(q)}-\cos ${tx(p)}\}`;
      anti = String.raw`\frac12\Bigl[\frac{\sin ${tx(q)}}{${q}}-\frac{\sin ${tx(p)}}{${p}}\Bigr]_0^{\frac{\pi}{2}}`;
    }
    const ans = lin([{ c: v, f: [] }]);
    const fn = kind === "sc" ? (x => Math.sin(a * x) * Math.cos(b * x)) : kind === "cc" ? (x => Math.cos(a * x) * Math.cos(b * x)) : (x => Math.sin(a * x) * Math.sin(b * x));
    return {
      body, loTex: "0", hiTex: "\\dfrac{\\pi}{2}", lo: 0, hi: Math.PI / 2, f: fn, ans,
      steps: String.raw`積和の公式 $${formula}$ より
$$\int_0^{\frac{\pi}{2}}${body}\,dx=${anti}=${ans.tex}$$`
    };
  });
  def("trig", 2, "$\\tan x$ の積分、$\\tan^2x=\\dfrac{1}{\\cos^2x}-1$、$\\tan x=u$ の置換", r => {
    const h = r.pick([6, 4, 3]), kind = r.pick(["tan", "tan2", "sec2", "tan3", "tansec2"]);
    const TB = {
      tan: { 6: [{ c: F(1), f: [LN2] }, { c: F(-1, 2), f: [LN3] }], 4: [{ c: F(1, 2), f: [LN2] }], 3: [{ c: F(1), f: [LN2] }] },
      tan2: { 6: [{ c: F(1, 3), f: [SQ3] }, { c: F(-1, 6), f: [PI] }], 4: [{ c: F(1), f: [] }, { c: F(-1, 4), f: [PI] }], 3: [{ c: F(1), f: [SQ3] }, { c: F(-1, 3), f: [PI] }] },
      sec2: { 6: [{ c: F(1, 3), f: [SQ3] }], 4: [{ c: F(1), f: [] }], 3: [{ c: F(1), f: [SQ3] }] },
      tan3: { 6: [{ c: F(1, 6), f: [] }, { c: F(1, 2), f: [LN3] }, { c: F(-1), f: [LN2] }], 4: [{ c: F(1, 2), f: [] }, { c: F(-1, 2), f: [LN2] }], 3: [{ c: F(3, 2), f: [] }, { c: F(-1), f: [LN2] }] },
      tansec2: { 6: [{ c: F(1, 6), f: [] }], 4: [{ c: F(1, 2), f: [] }], 3: [{ c: F(3, 2), f: [] }] }
    };
    const ans = lin(TB[kind][h]);
    const hi = Math.PI / h, P = piOver(h);
    const body = { tan: String.raw`\tan x`, tan2: String.raw`\tan^{2}x`, sec2: String.raw`\dfrac{1}{\cos^{2}x}`, tan3: String.raw`\tan^{3}x`, tansec2: String.raw`\dfrac{\tan x}{\cos^{2}x}` }[kind];
    const stp = {
      tan: String.raw`$\tan x=\dfrac{\sin x}{\cos x}$ で、分母の微分が分子に現れる。$$\int_0^{${P}}\tan x\,dx=\Bigl[-\ln\cos x\Bigr]_0^{${P}}=${ans.tex}$$`,
      tan2: String.raw`$\tan^2x=\dfrac{1}{\cos^2x}-1$ より $$\int_0^{${P}}\tan^2x\,dx=\Bigl[\tan x-x\Bigr]_0^{${P}}=${ans.tex}$$`,
      sec2: String.raw`$(\tan x)'=\dfrac{1}{\cos^2x}$ より $$\int_0^{${P}}\frac{dx}{\cos^2x}=\Bigl[\tan x\Bigr]_0^{${P}}=${ans.tex}$$`,
      tan3: String.raw`$\tan^3x=\tan x\Bigl(\dfrac{1}{\cos^2x}-1\Bigr)$ と分けて $$\int_0^{${P}}\tan^3x\,dx=\Bigl[\frac{\tan^2x}{2}+\ln\cos x\Bigr]_0^{${P}}=${ans.tex}$$`,
      tansec2: String.raw`$t=\tan x$ とおくと $dt=\dfrac{dx}{\cos^2x}$。$$\int_0^{${P}}\frac{\tan x}{\cos^2x}dx=\int_0^{\tan\frac{\pi}{${h}}}t\,dt=\Bigl[\frac{t^2}{2}\Bigr]=${ans.tex}$$`
    }[kind];
    const fn = { tan: Math.tan, tan2: x => Math.tan(x) ** 2, sec2: x => 1 / Math.cos(x) ** 2, tan3: x => Math.tan(x) ** 3, tansec2: x => Math.tan(x) / Math.cos(x) ** 2 }[kind];
    return { body, loTex: "0", hiTex: P, lo: 0, hi, f: fn, ans, steps: stp };
  });
  def("trig", 2, "偶数乗は半角の公式、奇数乗は置換(ウォリス型)", r => {
    const n = r.int(2, 9), kind = r.pick(["sin", "cos"]);
    const even = n % 2 === 0;
    const ans = even ? lin([{ c: F(dfact(n - 1), dfact(n) * 2), f: [PI] }]) : lin([{ c: F(dfact(n - 1), dfact(n)), f: [] }]);
    const KN = "\\" + kind;
    return {
      body: String.raw`${KN}^{${n}}x`, loTex: "0", hiTex: "\\dfrac{\\pi}{2}", lo: 0, hi: Math.PI / 2,
      f: x => (kind === "sin" ? Math.sin(x) : Math.cos(x)) ** n, ans,
      steps: even
        ? String.raw`半角の公式 $${KN}^2x=\dfrac{1${kind === "sin" ? "-" : "+"}\cos2x}{2}$ を使って次数を下げていく(2乗ずつ減らす)。
$$\int_0^{\frac{\pi}{2}}${KN}^{${n}}x\,dx=${ans.tex}$$`
        : String.raw`$${KN}^{${n}}x=${KN}^{${n - 1}}x\cdot${KN}x$ と分け、偶数乗を $${kind === "sin" ? "\\cos" : "\\sin"}x$ の式に直して $t=${kind === "sin" ? "\\cos" : "\\sin"}x$ と置換する。
$$\int_0^{\frac{\pi}{2}}${KN}^{${n}}x\,dx=${ans.tex}$$`
    };
  });
  def("trig", 2, "$\\cos x$(または $\\sin x$)を $u$ と置く", r => {
    const n = r.int(2, 7), form = r.pick(["A", "B"]);
    const ans = lin([{ c: F(2 ** (n - 1) - 1, n - 1), f: [] }]);
    const A = form === "A";
    return {
      body: A ? String.raw`\dfrac{\sin x}{\cos^{${n}}x}` : String.raw`\dfrac{\cos x}{\sin^{${n}}x}`,
      loTex: A ? "0" : "\\dfrac{\\pi}{6}", hiTex: A ? "\\dfrac{\\pi}{3}" : "\\dfrac{\\pi}{2}",
      lo: A ? 0 : Math.PI / 6, hi: A ? Math.PI / 3 : Math.PI / 2,
      f: A ? (x => Math.sin(x) / Math.cos(x) ** n) : (x => Math.cos(x) / Math.sin(x) ** n), ans,
      steps: A
        ? String.raw`$u=\cos x$ とおくと $du=-\sin x\,dx$。$x:0\to\frac{\pi}{3}$ のとき $u:1\to\frac12$。
$$\int_0^{\frac{\pi}{3}}\frac{\sin x}{\cos^{${n}}x}dx=\int_{\frac12}^{1}u^{-${n}}du=\Bigl[-\frac{1}{${n - 1}u^{${n - 1}}}\Bigr]_{\frac12}^{1}=${ans.tex}$$`
        : String.raw`$u=\sin x$ とおくと $du=\cos x\,dx$。$x:\frac{\pi}{6}\to\frac{\pi}{2}$ のとき $u:\frac12\to1$。
$$\int_{\frac{\pi}{6}}^{\frac{\pi}{2}}\frac{\cos x}{\sin^{${n}}x}dx=\int_{\frac12}^{1}u^{-${n}}du=\Bigl[-\frac{1}{${n - 1}u^{${n - 1}}}\Bigr]_{\frac12}^{1}=${ans.tex}$$`
    };
  });
  def("trig", 3, "$1\\pm\\cos x$ を半角の公式で $2\\cos^2\\dfrac{x}{2}$ か $2\\sin^2\\dfrac{x}{2}$ に直す", r => {
    const plus = r.pick([true, false]);
    if (plus) {
      const h = r.pick(["2", "3", "2p3"]);
      const hi = { "2": Math.PI / 2, "3": Math.PI / 3, "2p3": 2 * Math.PI / 3 }[h];
      const hiTex = { "2": "\\dfrac{\\pi}{2}", "3": "\\dfrac{\\pi}{3}", "2p3": "\\dfrac{2\\pi}{3}" }[h];
      const half = { "2": "\\frac{\\pi}{4}", "3": "\\frac{\\pi}{6}", "2p3": "\\frac{\\pi}{3}" }[h];
      const ans = h === "2" ? lin([{ c: F(1), f: [] }]) : h === "3" ? lin([{ c: F(1, 3), f: [SQ3] }]) : lin([{ c: F(1), f: [SQ3] }]);
      return {
        body: String.raw`\dfrac{1}{1+\cos x}`, loTex: "0", hiTex, lo: 0, hi, f: x => 1 / (1 + Math.cos(x)), ans,
        steps: String.raw`$1+\cos x=2\cos^2\dfrac{x}{2}$ より
$$\int_0^{${hiTex}}\frac{dx}{1+\cos x}=\int_0^{${hiTex}}\frac{dx}{2\cos^2\frac{x}{2}}=\Bigl[\tan\frac{x}{2}\Bigr]_0^{${hiTex}}=\tan${half}=${ans.tex}$$`
      };
    }
    const pair = r.pick(["3-2", "3-23", "2-23"]);
    const ang = { "3": ["\\dfrac{\\pi}{3}", Math.PI / 3, "\\frac{\\pi}{6}", [F(0), F(1)]], "2": ["\\dfrac{\\pi}{2}", Math.PI / 2, "\\frac{\\pi}{4}", [F(1), F(0)]], "23": ["\\dfrac{2\\pi}{3}", 2 * Math.PI / 3, "\\frac{\\pi}{3}", [F(0), F(1, 3)]] };
    const [lk, hk] = pair.split("-");
    const L = ang[lk], H = ang[hk];
    const t = [];
    pushS(t, L[3], F(1), []); pushS(t, H[3], F(-1), []);
    const ans = lin(t);
    return {
      body: String.raw`\dfrac{1}{1-\cos x}`, loTex: L[0], hiTex: H[0], lo: L[1], hi: H[1], f: x => 1 / (1 - Math.cos(x)), ans,
      steps: String.raw`$1-\cos x=2\sin^2\dfrac{x}{2}$ より
$$\int_{${L[0]}}^{${H[0]}}\frac{dx}{1-\cos x}=\int\frac{dx}{2\sin^2\frac{x}{2}}=\Bigl[-\frac{1}{\tan\frac{x}{2}}\Bigr]_{${L[0]}}^{${H[0]}}=${ans.tex}$$`
    };
  });
  def("trig", 3, "$\\sin x\\cos x=\\dfrac12\\sin2x$ と倍角の公式", r => {
    const h = r.pick([1, 2, 3, 4, 6, 12]);
    const t = [{ c: F(1, 8 * h), f: [PI] }];
    pushS(t, sinM(24 / h), F(-1, 32), []);
    const ans = lin(t);
    return {
      body: String.raw`\sin^{2}x\cos^{2}x`, loTex: "0", hiTex: piOver(h), lo: 0, hi: Math.PI / h,
      f: x => Math.sin(x) ** 2 * Math.cos(x) ** 2, ans,
      steps: String.raw`$\sin^2x\cos^2x=\dfrac14\sin^22x=\dfrac{1-\cos4x}{8}$ より
$$\int_0^{${piOver(h)}}\sin^2x\cos^2x\,dx=\Bigl[\frac{x}{8}-\frac{\sin4x}{32}\Bigr]_0^{${piOver(h)}}=${ans.tex}$$`
    };
  });
  def("trig", 2, "3乗は $\\sin^2x=1-\\cos^2x$ などで次数を下げる", r => {
    const h = r.pick([1, 2, 3, 6]), kind = r.pick(["sin", "cos"]);
    const m = 6 / h;
    const t = [];
    if (kind === "sin") { t.push({ c: F(2, 3), f: [] }); pushS(t, cosM(m), F(-1), []); pushS(t, cubeS(cosM(m)), F(1, 3), []); }
    else { pushS(t, sinM(m), F(1), []); pushS(t, cubeS(sinM(m)), F(-1, 3), []); }
    const ans = lin(t), KN = "\\" + kind;
    return {
      body: String.raw`${KN}^{3}x`, loTex: "0", hiTex: piOver(h), lo: 0, hi: Math.PI / h,
      f: x => (kind === "sin" ? Math.sin(x) : Math.cos(x)) ** 3, ans,
      steps: kind === "sin"
        ? String.raw`$\sin^3x=(1-\cos^2x)\sin x$ より $$\int_0^{${piOver(h)}}\sin^3x\,dx=\Bigl[-\cos x+\frac{\cos^3x}{3}\Bigr]_0^{${piOver(h)}}=${ans.tex}$$`
        : String.raw`$\cos^3x=(1-\sin^2x)\cos x$ より $$\int_0^{${piOver(h)}}\cos^3x\,dx=\Bigl[\sin x-\frac{\sin^3x}{3}\Bigr]_0^{${piOver(h)}}=${ans.tex}$$`
    };
  });

  // =====================================================================
  // 分数関数
  // =====================================================================
  def("frac", 2, "分母を因数分解して部分分数に分ける", r => {
    const a = r.int(1, 3), b = r.int(a + 1, 4);
    const A = r.pick([1, 2, 3, -1, -2, -3]), B = r.pick([1, 2, 3, -1, -2, -3]);
    const p = A + B, q = A * b + B * a, hi = r.pick([1, 2]);
    const ans = lin([{ c: F(A), f: [lnR(hi + a, a)] }, { c: F(B), f: [lnR(hi + b, b)] }]);
    return {
      body: String.raw`\dfrac{${linTex(p, q)}}{x^{2}+${a + b}x+${a * b}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => (p * x + q) / ((x + a) * (x + b)), ans,
      steps: String.raw`分母は $(x+${a})(x+${b})$ と因数分解できる。$\dfrac{${linTex(p, q)}}{(x+${a})(x+${b})}=\dfrac{A}{x+${a}}+\dfrac{B}{x+${b}}$ とおいて分子を比べると $A=${A}$、$B=${B}$。
$$\int_0^{${hi}}\Bigl(\frac{${A}}{x+${a}}+\frac{${B}}{x+${b}}\Bigr)dx=\Bigl[${coefTex(A)}\ln(x+${a})${B < 0 ? "-" : "+"}${Math.abs(B) === 1 ? "" : Math.abs(B)}\ln(x+${b})\Bigr]_0^{${hi}}=${ans.tex}$$`
    };
  });
  def("frac", 2, "$x=m\\tan\\theta$ と置く", r => {
    const m = r.int(1, 6), root3 = r.pick([false, true]), cc = r.pick([1, 2, 3]);
    const ans = lin([{ c: F(cc, (root3 ? 3 : 4) * m), f: [PI] }]);
    const L = root3 ? m * Math.sqrt(3) : m;
    const hiTex = root3 ? (m === 1 ? "\\sqrt{3}" : `${m}\\sqrt{3}`) : `${m}`;
    return {
      body: String.raw`\dfrac{${cc === 1 ? "1" : cc}}{x^{2}+${m * m}}`, loTex: "0", hiTex, lo: 0, hi: L,
      f: x => cc / (x * x + m * m), ans,
      steps: String.raw`$x=${m === 1 ? "" : m}\tan\theta$ とおくと $dx=\dfrac{${m === 1 ? "" : m}}{\cos^2\theta}d\theta$、$x^2+${m * m}=\dfrac{${m * m}}{\cos^2\theta}$。$x:0\to${hiTex}$ のとき $\theta:0\to\dfrac{\pi}{${root3 ? 3 : 4}}$。
$$\int_0^{${hiTex}}\frac{${cc}\,dx}{x^2+${m * m}}=\frac{${cc}}{${m}}\int_0^{\frac{\pi}{${root3 ? 3 : 4}}}d\theta=${ans.tex}$$`
    };
  });
  def("frac", 2, "分子を割り算して(整式)+(分数)の形にする", r => {
    const a = r.int(1, 5), hi = r.int(1, 2);
    const ans = lin([{ c: F(hi * hi - 2 * a * hi, 2), f: [] }, { c: F(a * a), f: [lnR(hi + a, a)] }]);
    return {
      body: String.raw`\dfrac{x^{2}}{x+${a}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => x * x / (x + a), ans,
      steps: String.raw`割り算して $\dfrac{x^2}{x+${a}}=x-${a}+\dfrac{${a * a}}{x+${a}}$。
$$\int_0^{${hi}}\Bigl(x-${a}+\frac{${a * a}}{x+${a}}\Bigr)dx=\Bigl[\frac{x^2}{2}-${a}x+${a * a}\ln(x+${a})\Bigr]_0^{${hi}}=${ans.tex}$$`
    };
  });
  def("frac", 3, "分母を平方完成して $x+a=t$ と置く", r => {
    const a = r.int(1, 4), m = r.int(1, 3), root3 = r.pick([false, true]);
    const ans = lin([{ c: F(1, (root3 ? 3 : 4) * m), f: [PI] }]);
    const hi = root3 ? -a + m * Math.sqrt(3) : m - a;
    const hiTex = root3 ? `-${a}+${m === 1 ? "" : m}\\sqrt{3}` : `${m - a}`;
    const Ltex = root3 ? (m === 1 ? "\\sqrt{3}" : `${m}\\sqrt{3}`) : `${m}`;
    return {
      body: String.raw`\dfrac{1}{x^{2}+${2 * a}x+${a * a + m * m}}`, loTex: `-${a}`, hiTex, lo: -a, hi,
      f: x => 1 / ((x + a) ** 2 + m * m), ans,
      steps: String.raw`$x^2+${2 * a}x+${a * a + m * m}=(x+${a})^2+${m * m}$。$t=x+${a}$ とおくと $x:-${a}\to${hiTex}$ のとき $t:0\to${Ltex}$。
$$\int_{-${a}}^{${hiTex}}\frac{dx}{(x+${a})^2+${m * m}}=\int_0^{${Ltex}}\frac{dt}{t^2+${m * m}}=\frac{1}{${m}}\cdot\frac{\pi}{${root3 ? 3 : 4}}=${ans.tex}$$`
    };
  });
  def("frac", 1, "分子が分母の微分になっている", r => {
    const k = r.int(1, 4), c = r.int(1, 5), hi = r.int(1, 2);
    const ans = lin([{ c: F(1), f: [lnR(hi * hi + k * hi + c, c)] }]);
    const den = `x^{2}+${k === 1 ? "" : k}x+${c}`;
    return {
      body: String.raw`\dfrac{2x+${k}}{${den}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => (2 * x + k) / (x * x + k * x + c), ans,
      steps: String.raw`$(${den})'=2x+${k}$ だから
$$\int_0^{${hi}}\frac{2x+${k}}{${den}}dx=\Bigl[\ln(${den})\Bigr]_0^{${hi}}=\ln ${hi * hi + k * hi + c}-\ln ${c}=${ans.tex}$$`
    };
  });
  def("frac", 2, "分子を割り算して(整式)+(分数)の形にする", r => {
    const a = r.int(1, 5), hi = r.int(1, 2);
    const ans = lin([{ c: F(hi * hi, 2), f: [] }, { c: F(-a, 2), f: [lnR(hi * hi + a, a)] }]);
    return {
      body: String.raw`\dfrac{x^{3}}{x^{2}+${a}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => x ** 3 / (x * x + a), ans,
      steps: String.raw`割り算して $\dfrac{x^3}{x^2+${a}}=x-\dfrac{${a}x}{x^2+${a}}$。
$$\int_0^{${hi}}\Bigl(x-\frac{${a}x}{x^2+${a}}\Bigr)dx=\Bigl[\frac{x^2}{2}-\frac{${a}}{2}\ln(x^2+${a})\Bigr]_0^{${hi}}=${ans.tex}$$`
    };
  });
  def("frac", 3, "$1=\\dfrac{(e^x+a)-e^x}{a}$ と分けて考える", r => {
    const a = r.int(1, 6);
    const sym = { tex: String.raw`\ln\dfrac{e+${a}}{${1 + a}}`, val: Math.log((Math.E + a) / (1 + a)) };
    const ans = lin([{ c: F(1, a), f: [] }, { c: F(-1, a), f: [sym] }]);
    return {
      body: String.raw`\dfrac{1}{e^{x}+${a}}`, loTex: "0", hiTex: "1", lo: 0, hi: 1,
      f: x => 1 / (Math.exp(x) + a), ans,
      steps: String.raw`$\dfrac{1}{e^x+${a}}=\dfrac{1}{${a}}\Bigl(1-\dfrac{e^x}{e^x+${a}}\Bigr)$ と変形する。
$$\int_0^1\frac{dx}{e^x+${a}}=\frac{1}{${a}}\Bigl[x-\ln(e^x+${a})\Bigr]_0^1=${ans.tex}$$`
    };
  });
  def("frac", 2, "$\\dfrac{x^2}{x^2+a^2}=1-\\dfrac{a^2}{x^2+a^2}$ と分ける", r => {
    const a = r.int(1, 4), root3 = r.pick([false, true]);
    const t = root3 ? [{ c: F(a), f: [SQ3] }, { c: F(-a, 3), f: [PI] }] : [{ c: F(a), f: [] }, { c: F(-a, 4), f: [PI] }];
    const ans = lin(t);
    const hiTex = root3 ? (a === 1 ? "\\sqrt{3}" : `${a}\\sqrt{3}`) : `${a}`;
    return {
      body: String.raw`\dfrac{x^{2}}{x^{2}+${a * a}}`, loTex: "0", hiTex, lo: 0, hi: root3 ? a * Math.sqrt(3) : a,
      f: x => x * x / (x * x + a * a), ans,
      steps: String.raw`$\dfrac{x^2}{x^2+${a * a}}=1-\dfrac{${a * a}}{x^2+${a * a}}$。$x=${a === 1 ? "" : a}\tan\theta$ の置換で後ろの項を計算する。
$$\int_0^{${hiTex}}\frac{x^2}{x^2+${a * a}}dx=\Bigl[x\Bigr]_0^{${hiTex}}-${a * a}\cdot\frac{1}{${a}}\cdot\frac{\pi}{${root3 ? 3 : 4}}=${ans.tex}$$`
    };
  });
  def("frac", 3, "$\\dfrac{1}{x^2-a^2}=\\dfrac{1}{2a}\\Bigl(\\dfrac{1}{x-a}-\\dfrac{1}{x+a}\\Bigr)$", r => {
    const a = r.int(1, 4), d = r.int(1, 3);
    const lo = a + 1, hi = lo + d;
    const ans = lin([{ c: F(1, 2 * a), f: [lnR(hi - a, hi + a)] }, { c: F(-1, 2 * a), f: [lnR(lo - a, lo + a)] }]);
    return {
      body: String.raw`\dfrac{1}{x^{2}-${a * a}}`, loTex: `${lo}`, hiTex: `${hi}`, lo, hi,
      f: x => 1 / (x * x - a * a), ans,
      steps: String.raw`$\dfrac{1}{x^2-${a * a}}=\dfrac{1}{${2 * a}}\Bigl(\dfrac{1}{x-${a}}-\dfrac{1}{x+${a}}\Bigr)$ と部分分数に分ける。
$$\int_{${lo}}^{${hi}}\frac{dx}{x^2-${a * a}}=\frac{1}{${2 * a}}\Bigl[\ln\frac{x-${a}}{x+${a}}\Bigr]_{${lo}}^{${hi}}=${ans.tex}$$`
    };
  });

  // =====================================================================
  // 部分積分
  // =====================================================================
  def("ibp", 2, "$x$ を微分する側、指数を積分する側にして部分積分", r => {
    const k = r.pick([1, 2, 3, 4, -1, -2, -3]), hi = r.int(1, 2);
    const ans = lin([{ c: F(hi * k - 1, k * k), f: [eP(k * hi)] }, { c: F(1, k * k), f: [] }]);
    const ex = k === 1 ? "x" : k === -1 ? "-x" : `${k}x`;
    return {
      body: String.raw`xe^{${ex}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => x * Math.exp(k * x), ans,
      steps: String.raw`$$\int_0^{${hi}}xe^{${ex}}dx=\Bigl[x\cdot\frac{e^{${ex}}}{${k}}\Bigr]_0^{${hi}}-\int_0^{${hi}}\frac{e^{${ex}}}{${k}}dx=\Bigl[\frac{xe^{${ex}}}{${k}}-\frac{e^{${ex}}}{${k * k}}\Bigr]_0^{${hi}}=${ans.tex}$$`
    };
  });
  const P2C = [];
  [1, 2, 3].forEach(k => [1, 2, 3, 4, 6, 12].forEach(h => { if ((6 * k) % h === 0) P2C.push({ k, h, m: 6 * k / h }); }));
  def("ibp", 2, "$x$ を微分する側にして部分積分", r => {
    const { k, h, m } = r.pick(P2C), kind = r.pick(["sin", "cos"]);
    const t = [], sS = sinM(m), cS = cosM(m);
    if (kind === "sin") { pushS(t, cS, F(-1, h * k), [PI]); pushS(t, sS, F(1, k * k), []); }
    else { pushS(t, sS, F(1, h * k), [PI]); pushS(t, cS, F(1, k * k), []); t.push({ c: F(-1, k * k), f: [] }); }
    const ans = lin(t), KN = "\\" + kind, kx = k === 1 ? "x" : `${k}x`, P = piOver(h);
    return {
      body: String.raw`x${KN}${kx}`, loTex: "0", hiTex: P, lo: 0, hi: Math.PI / h,
      f: x => x * (kind === "sin" ? Math.sin(k * x) : Math.cos(k * x)), ans,
      steps: kind === "sin"
        ? String.raw`$$\int_0^{${P}}x\sin ${kx}\,dx=\Bigl[-\frac{x\cos ${kx}}{${k}}\Bigr]_0^{${P}}+\frac{1}{${k}}\int_0^{${P}}\cos ${kx}\,dx=\Bigl[-\frac{x\cos ${kx}}{${k}}+\frac{\sin ${kx}}{${k * k}}\Bigr]_0^{${P}}=${ans.tex}$$`
        : String.raw`$$\int_0^{${P}}x\cos ${kx}\,dx=\Bigl[\frac{x\sin ${kx}}{${k}}\Bigr]_0^{${P}}-\frac{1}{${k}}\int_0^{${P}}\sin ${kx}\,dx=\Bigl[\frac{x\sin ${kx}}{${k}}+\frac{\cos ${kx}}{${k * k}}\Bigr]_0^{${P}}=${ans.tex}$$`
    };
  });
  def("ibp", 2, "$\\ln x$ の側を微分する側にして部分積分", r => {
    const n = r.int(0, 4), m = r.int(1, 2);
    const ans = lin([{ c: F(m * (n + 1) - 1, (n + 1) ** 2), f: [eP(m * (n + 1))] }, { c: F(1, (n + 1) ** 2), f: [] }]);
    const body = n === 0 ? String.raw`\ln x` : n === 1 ? String.raw`x\ln x` : String.raw`x^{${n}}\ln x`;
    const hiTex = m === 1 ? "e" : "e^{2}";
    return {
      body, loTex: "1", hiTex, lo: 1, hi: Math.exp(m),
      f: x => x ** n * Math.log(x), ans,
      steps: String.raw`$x^{${n}}$ を積分する側にして
$$\int_1^{${hiTex}}${body}\,dx=\Bigl[\frac{x^{${n + 1}}}{${n + 1}}\ln x-\frac{x^{${n + 1}}}{${(n + 1) ** 2}}\Bigr]_1^{${hiTex}}=${ans.tex}$$`
    };
  });
  def("ibp", 3, "部分積分を繰り返して $\\ln x$ の次数を下げる", r => {
    const p = r.pick([2, 3]), m = r.int(1, 3);
    const co = p === 2 ? m * m - 2 * m + 2 : m ** 3 - 3 * m * m + 6 * m - 6;
    const ans = lin([{ c: F(co), f: [eP(m)] }, { c: F(p === 2 ? -2 : 6), f: [] }]);
    const hiTex = m === 1 ? "e" : `e^{${m}}`;
    return {
      body: String.raw`(\ln x)^{${p}}`, loTex: "1", hiTex, lo: 1, hi: Math.exp(m),
      f: x => Math.log(x) ** p, ans,
      steps: p === 2
        ? String.raw`$\int(\ln x)^2dx=x(\ln x)^2-\int2\ln x\,dx=x\{(\ln x)^2-2\ln x+2\}$。$$\int_1^{${hiTex}}(\ln x)^2dx=\Bigl[x\{(\ln x)^2-2\ln x+2\}\Bigr]_1^{${hiTex}}=${ans.tex}$$`
        : String.raw`部分積分を3回行うと $\int(\ln x)^3dx=x\{(\ln x)^3-3(\ln x)^2+6\ln x-6\}$。$$\int_1^{${hiTex}}(\ln x)^3dx=\Bigl[x\{(\ln x)^3-3(\ln x)^2+6\ln x-6\}\Bigr]_1^{${hiTex}}=${ans.tex}$$`
    };
  });
  def("ibp", 3, "同じ形に戻るまで部分積分を2回行う", r => {
    const s = r.pick([1, -1]), kind = r.pick(["sin", "cos"]), mi = r.pick([3, 6, 9, 12]);
    const hi = mi * Math.PI / 6;
    const sv = fval(sinM(mi)[0]), cv = fval(cosM(mi)[0]);
    const hiExp = { 3: "\\frac{\\pi}{2}", 6: "\\pi", 9: "\\frac{3\\pi}{2}", 12: "2\\pi" }[mi];
    const E = { tex: `e^{${s < 0 ? "-" : ""}${hiExp}}`, val: Math.exp(s * hi) };
    let ce, cc;
    if (s > 0) { ce = kind === "sin" ? sv - cv : sv + cv; cc = kind === "sin" ? 1 : -1; }
    else { ce = kind === "sin" ? -(sv + cv) : sv - cv; cc = 1; }
    const ans = lin([{ c: F(ce, 2), f: [E] }, { c: F(cc, 2), f: [] }]);
    const KN = "\\" + kind, hiTex = piM(mi);
    const anti = s > 0 ? (kind === "sin" ? "\\frac{e^x(\\sin x-\\cos x)}{2}" : "\\frac{e^x(\\sin x+\\cos x)}{2}") : (kind === "sin" ? "-\\frac{e^{-x}(\\sin x+\\cos x)}{2}" : "\\frac{e^{-x}(\\sin x-\\cos x)}{2}");
    return {
      body: String.raw`e^{${s < 0 ? "-" : ""}x}${KN}x`, loTex: "0", hiTex, lo: 0, hi,
      f: x => Math.exp(s * x) * (kind === "sin" ? Math.sin(x) : Math.cos(x)), ans,
      steps: String.raw`$I=\int e^{${s < 0 ? "-" : ""}x}${KN}x\,dx$ とおき、部分積分を2回行うと $I$ がもう一度現れて、$I=${anti}$ を得る。
$$\int_0^{${hiTex}}e^{${s < 0 ? "-" : ""}x}${KN}x\,dx=\Bigl[${anti}\Bigr]_0^{${hiTex}}=${ans.tex}$$`
    };
  });
  def("ibp", 2, "部分積分を2回行う($e^{kx}$ を積分する側に)", r => {
    const k = r.pick([1, 2, 3, -1, -2]), hi = r.int(1, 3);
    const ans = lin([{ c: F(hi * hi * k * k - 2 * hi * k + 2, k ** 3), f: [eP(k * hi)] }, { c: F(-2, k ** 3), f: [] }]);
    const ex = k === 1 ? "x" : k === -1 ? "-x" : `${k}x`;
    return {
      body: String.raw`x^{2}e^{${ex}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => x * x * Math.exp(k * x), ans,
      steps: String.raw`部分積分を2回行うと $\int x^2e^{${ex}}dx=e^{${ex}}\Bigl(\dfrac{x^2}{${k}}-\dfrac{2x}{${k * k}}+\dfrac{2}{${k ** 3}}\Bigr)$。
$$\int_0^{${hi}}x^2e^{${ex}}dx=${ans.tex}$$`
    };
  });
  def("ibp", 3, "$x^2$ を微分する側にして部分積分を2回", r => {
    const mi = r.pick([2, 3, 4, 6, 9, 12]), kind = r.pick(["sin", "cos"]);
    const t = [], tt = F(mi, 6), sS = sinM(mi), cS = cosM(mi);
    if (kind === "sin") { pushS(t, cS, fneg(fmul(tt, tt)), [PI2]); pushS(t, sS, fmul(F(2), tt), [PI]); pushS(t, cS, F(2), []); t.push({ c: F(-2), f: [] }); }
    else { pushS(t, sS, fmul(tt, tt), [PI2]); pushS(t, cS, fmul(F(2), tt), [PI]); pushS(t, sS, F(-2), []); }
    const ans = lin(t), KN = "\\" + kind, hiTex = piM(mi);
    return {
      body: String.raw`x^{2}${KN}x`, loTex: "0", hiTex, lo: 0, hi: mi * Math.PI / 6,
      f: x => x * x * (kind === "sin" ? Math.sin(x) : Math.cos(x)), ans,
      steps: kind === "sin"
        ? String.raw`部分積分を2回行うと $\int x^2\sin x\,dx=-x^2\cos x+2x\sin x+2\cos x$。
$$\int_0^{${hiTex}}x^2\sin x\,dx=\Bigl[-x^2\cos x+2x\sin x+2\cos x\Bigr]_0^{${hiTex}}=${ans.tex}$$`
        : String.raw`部分積分を2回行うと $\int x^2\cos x\,dx=x^2\sin x+2x\cos x-2\sin x$。
$$\int_0^{${hiTex}}x^2\cos x\,dx=\Bigl[x^2\sin x+2x\cos x-2\sin x\Bigr]_0^{${hiTex}}=${ans.tex}$$`
    };
  });
  def("ibp", 3, "$x=\\Bigl(\\dfrac{x^2-a^2}{2}\\Bigr)'$ とみて部分積分", r => {
    const a = r.int(1, 6), hi = r.int(1, 2);
    const t = [{ c: F(hi * hi - a * a, 2), f: [lnR(hi + a, 1)] }];
    if (a > 1) t.push({ c: F(a * a, 2), f: [lnR(a, 1)] });
    t.push({ c: F(2 * a * hi - hi * hi, 4), f: [] });
    const ans = lin(t);
    return {
      body: String.raw`x\ln(x+${a})`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => x * Math.log(x + a), ans,
      steps: String.raw`$x=\Bigl(\dfrac{x^2-${a * a}}{2}\Bigr)'$ とみて部分積分する。
$$\int_0^{${hi}}x\ln(x+${a})dx=\Bigl[\frac{x^2-${a * a}}{2}\ln(x+${a})\Bigr]_0^{${hi}}-\int_0^{${hi}}\frac{x-${a}}{2}dx=${ans.tex}$$`
    };
  });
  def("ibp", 2, "$\\dfrac{1}{x^n}$ を積分する側にして部分積分", r => {
    const n = r.int(2, 6), m = r.int(1, 2);
    const ans = lin([{ c: F(1, (n - 1) ** 2), f: [] }, { c: F(-(m * (n - 1) + 1), (n - 1) ** 2), f: [eNeg((n - 1) * m)] }]);
    const hiTex = m === 1 ? "e" : "e^{2}";
    return {
      body: String.raw`\dfrac{\ln x}{x^{${n}}}`, loTex: "1", hiTex, lo: 1, hi: Math.exp(m),
      f: x => Math.log(x) / x ** n, ans,
      steps: String.raw`$\dfrac{1}{x^{${n}}}$ の原始関数 $-\dfrac{1}{${n - 1}x^{${n - 1}}}$ を使って
$$\int_1^{${hiTex}}\frac{\ln x}{x^{${n}}}dx=\Bigl[-\frac{\ln x}{${n - 1}x^{${n - 1}}}\Bigr]_1^{${hiTex}}+\frac{1}{${n - 1}}\int_1^{${hiTex}}x^{-${n}}dx=${ans.tex}$$`
    };
  });

  // =====================================================================
  // 無理関数・円
  // =====================================================================
  def("irr", 3, "$x=a\\sin\\theta$ と置く(または円の面積)", r => {
    const a = r.int(1, 6), mode = r.pick(["quarter", "half", "part", "tail"]);
    let lo = 0, hi = a, loTex = "0", hiTex = `${a}`, t, th;
    if (mode === "quarter") { t = [{ c: F(a * a, 4), f: [PI] }]; th = String.raw`\theta:0\to\dfrac{\pi}{2}`; }
    else if (mode === "half") { lo = -a; loTex = `-${a}`; t = [{ c: F(a * a, 2), f: [PI] }]; th = String.raw`\theta:-\dfrac{\pi}{2}\to\dfrac{\pi}{2}`; }
    else if (mode === "part") { hi = a / 2; hiTex = fracTex(F(a, 2)); t = [{ c: F(a * a, 12), f: [PI] }, { c: F(a * a, 8), f: [SQ3] }]; th = String.raw`\theta:0\to\dfrac{\pi}{6}`; }
    else { lo = a / 2; loTex = fracTex(F(a, 2)); t = [{ c: F(a * a, 6), f: [PI] }, { c: F(-a * a, 8), f: [SQ3] }]; th = String.raw`\theta:\dfrac{\pi}{6}\to\dfrac{\pi}{2}`; }
    const ans = lin(t);
    const body = String.raw`\sqrt{${a * a}-x^{2}}`;
    return {
      body, loTex, hiTex, lo, hi, f: x => Math.sqrt(a * a - x * x), ans,
      steps: String.raw`$x=${a === 1 ? "" : a}\sin\theta$ とおくと $dx=${a === 1 ? "" : a}\cos\theta\,d\theta$、$\sqrt{${a * a}-x^2}=${a === 1 ? "" : a}\cos\theta$。$${th}$。
$$\int${body}\,dx=\int${a * a}\cos^2\theta\,d\theta=\frac{${a * a}}{2}\int(1+\cos2\theta)\,d\theta$$
これを $\theta$ の範囲で計算して $${ans.tex}$。` + (mode === "quarter" || mode === "half" ? "(半径 $" + a + "$ の円の面積から求めてもよい)" : "")
    };
  });
  def("irr", 2, "$x=a\\sin\\theta$ と置くと $\\theta$ の積分になる", r => {
    const a = r.int(1, 6), kind = r.int(1, 4);
    const half = F(a, 2);
    let lo, hi, loTex, hiTex, t, th;
    if (kind === 1) { lo = 0; hi = a / 2; loTex = "0"; hiTex = fracTex(half); t = [{ c: F(1, 6), f: [PI] }]; th = "0\\to\\frac{\\pi}{6}"; }
    else if (kind === 2) { lo = 0; hi = (a / 2) * Math.sqrt(3); loTex = "0"; hiTex = sq3Tex(half); t = [{ c: F(1, 3), f: [PI] }]; th = "0\\to\\frac{\\pi}{3}"; }
    else if (kind === 3) { lo = -a / 2; hi = a / 2; loTex = "-" + fracTex(half); hiTex = fracTex(half); t = [{ c: F(1, 3), f: [PI] }]; th = "-\\frac{\\pi}{6}\\to\\frac{\\pi}{6}"; }
    else { lo = a / 2; hi = (a / 2) * Math.sqrt(3); loTex = fracTex(half); hiTex = sq3Tex(half); t = [{ c: F(1, 6), f: [PI] }]; th = "\\frac{\\pi}{6}\\to\\frac{\\pi}{3}"; }
    const ans = lin(t);
    const body = String.raw`\dfrac{1}{\sqrt{${a * a}-x^{2}}}`;
    return {
      body, loTex, hiTex, lo, hi, f: x => 1 / Math.sqrt(a * a - x * x), ans,
      steps: String.raw`$x=${a === 1 ? "" : a}\sin\theta$ とおくと $dx=${a === 1 ? "" : a}\cos\theta\,d\theta$、$\sqrt{${a * a}-x^2}=${a === 1 ? "" : a}\cos\theta$。$\theta:${th}$。
$$\int_{${loTex}}^{${hiTex}}${body}\,dx=\int_{${th.split("\\to")[0]}}^{${th.split("\\to")[1]}}d\theta=${ans.tex}$$`
    };
  });
  def("irr", 2, "ルートの中身 $x^2+a^2$ を $u$ と置く", r => {
    const [a, L, c] = r.pick(TRI);
    const ans = lin([{ c: F(c - a), f: [] }]);
    return {
      body: String.raw`\dfrac{x}{\sqrt{x^{2}+${a * a}}}`, loTex: "0", hiTex: `${L}`, lo: 0, hi: L,
      f: x => x / Math.sqrt(x * x + a * a), ans,
      steps: String.raw`$\left(\sqrt{x^2+${a * a}}\right)'=\dfrac{x}{\sqrt{x^2+${a * a}}}$ より
$$\int_0^{${L}}\frac{x}{\sqrt{x^2+${a * a}}}dx=\Bigl[\sqrt{x^2+${a * a}}\Bigr]_0^{${L}}=\sqrt{${L * L + a * a}}-\sqrt{${a * a}}=${c}-${a}=${ans.tex}$$`
    };
  });
  def("irr", 2, "$u=x^2+a^2$ と置く", r => {
    const [a, L, c] = r.pick(TRI);
    const ans = lin([{ c: F(c ** 3 - a ** 3, 3), f: [] }]);
    return {
      body: String.raw`x\sqrt{x^{2}+${a * a}}`, loTex: "0", hiTex: `${L}`, lo: 0, hi: L,
      f: x => x * Math.sqrt(x * x + a * a), ans,
      steps: String.raw`$u=x^2+${a * a}$ とおくと $du=2x\,dx$。$x:0\to${L}$ のとき $u:${a * a}\to${L * L + a * a}$。
$$\int_0^{${L}}x\sqrt{x^2+${a * a}}\,dx=\frac12\int_{${a * a}}^{${L * L + a * a}}u^{\frac12}du=\frac12\Bigl[\frac23u^{\frac32}\Bigr]_{${a * a}}^{${L * L + a * a}}=\frac13(${c}^3-${a}^3)=${ans.tex}$$`
    };
  });
  def("irr", 1, "ルートの中身 $a^2-x^2$ を $u$ と置く", r => {
    if (r.next() < 0.4) {
      const a = r.int(2, 9);
      const ans = lin([{ c: F(a ** 3, 3), f: [] }]);
      return {
        body: String.raw`x\sqrt{${a * a}-x^{2}}`, loTex: "0", hiTex: `${a}`, lo: 0, hi: a,
        f: x => x * Math.sqrt(a * a - x * x), ans,
        steps: String.raw`$u=${a * a}-x^2$ とおくと $du=-2x\,dx$。$x:0\to${a}$ のとき $u:${a * a}\to0$。
$$\int_0^{${a}}x\sqrt{${a * a}-x^2}\,dx=\frac12\int_0^{${a * a}}u^{\frac12}du=\frac12\Bigl[\frac23u^{\frac32}\Bigr]_0^{${a * a}}=${ans.tex}$$`
      };
    }
    const [a, L, c] = r.pick(TRI);
    const ans = lin([{ c: F(c ** 3 - a ** 3, 3), f: [] }]);
    return {
      body: String.raw`x\sqrt{${c * c}-x^{2}}`, loTex: "0", hiTex: `${L}`, lo: 0, hi: L,
      f: x => x * Math.sqrt(c * c - x * x), ans,
      steps: String.raw`$u=${c * c}-x^2$ とおくと $du=-2x\,dx$。$x:0\to${L}$ のとき $u:${c * c}\to${a * a}$。
$$\int_0^{${L}}x\sqrt{${c * c}-x^2}\,dx=\frac12\int_{${a * a}}^{${c * c}}u^{\frac12}du=\frac12\Bigl[\frac23u^{\frac32}\Bigr]_{${a * a}}^{${c * c}}=\frac13(${c}^3-${a}^3)=${ans.tex}$$`
    };
  });
  def("irr", 3, "公式 $\\int\\dfrac{dx}{\\sqrt{x^2+A}}=\\ln|x+\\sqrt{x^2+A}|$", r => {
    const [a, L, c] = r.pick(TRI);
    const ans = lin([{ c: F(1), f: [lnR(L + c, a)] }]);
    return {
      body: String.raw`\dfrac{1}{\sqrt{x^{2}+${a * a}}}`, loTex: "0", hiTex: `${L}`, lo: 0, hi: L,
      f: x => 1 / Math.sqrt(x * x + a * a), ans,
      steps: String.raw`$\Bigl(\ln\bigl(x+\sqrt{x^2+${a * a}}\bigr)\Bigr)'=\dfrac{1}{\sqrt{x^2+${a * a}}}$ より
$$\int_0^{${L}}\frac{dx}{\sqrt{x^2+${a * a}}}=\Bigl[\ln\bigl(x+\sqrt{x^2+${a * a}}\bigr)\Bigr]_0^{${L}}=\ln(${L}+${c})-\ln ${a}=${ans.tex}$$`
    };
  });
  def("irr", 3, "$u=x^2+a$ と置き、$x^3dx=x^2\\cdot x\\,dx$ と分ける", r => {
    const [p, q] = r.pick([[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]);
    const a = p * p, hi2 = q * q - a;
    const ans = lin([{ c: fadd(F(q ** 5 - p ** 5, 5), fneg(F(a * (q ** 3 - p ** 3), 3))), f: [] }]);
    return {
      body: String.raw`x^{3}\sqrt{x^{2}+${a}}`, loTex: "0", hiTex: `\\sqrt{${hi2}}`, lo: 0, hi: Math.sqrt(hi2),
      f: x => x ** 3 * Math.sqrt(x * x + a), ans,
      steps: String.raw`$u=x^2+${a}$ とおくと $x\,dx=\dfrac{du}{2}$、$x^2=u-${a}$。$x:0\to\sqrt{${hi2}}$ のとき $u:${a}\to${q * q}$。
$$\int_0^{\sqrt{${hi2}}}x^3\sqrt{x^2+${a}}\,dx=\frac12\int_{${a}}^{${q * q}}(u-${a})u^{\frac12}du=\frac12\Bigl[\frac25u^{\frac52}-\frac{${2 * a}}{3}u^{\frac32}\Bigr]_{${a}}^{${q * q}}=${ans.tex}$$`
    };
  });
  def("irr", 1, "ルートの中身 $a-x$ を $u$ と置く", r => {
    const p = r.int(2, 6), q = r.int(1, p - 1);
    const a = p * p, hi = p * p - q * q;
    if (r.next() < 0.5) {
      const ans = lin([{ c: F(2 * (p - q)), f: [] }]);
      return {
        body: String.raw`\dfrac{1}{\sqrt{${a}-x}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
        f: x => 1 / Math.sqrt(a - x), ans,
        steps: String.raw`$\Bigl(-2\sqrt{${a}-x}\Bigr)'=\dfrac{1}{\sqrt{${a}-x}}$ より
$$\int_0^{${hi}}\frac{dx}{\sqrt{${a}-x}}=\Bigl[-2\sqrt{${a}-x}\Bigr]_0^{${hi}}=${ans.tex}$$`
      };
    }
    const ans = lin([{ c: F(4 * p ** 3 - 6 * p * p * q + 2 * q ** 3, 3), f: [] }]);
    return {
      body: String.raw`\dfrac{x}{\sqrt{${a}-x}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => x / Math.sqrt(a - x), ans,
      steps: String.raw`$u=${a}-x$ とおくと $x=${a}-u$、$dx=-du$。$x:0\to${hi}$ のとき $u:${a}\to${q * q}$。
$$\int_0^{${hi}}\frac{x}{\sqrt{${a}-x}}dx=\int_{${q * q}}^{${a}}(${a}-u)u^{-\frac12}du=\Bigl[${2 * a}\sqrt{u}-\frac23u^{\frac32}\Bigr]_{${q * q}}^{${a}}=${ans.tex}$$`
    };
  });
  def("irr", 2, "$t=\\sqrt{x}$ と置く", r => {
    const [p, q] = r.pick([[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]);
    const ans = lin([{ c: F(2), f: [lnR(1 + q, 1 + p)] }]);
    return {
      body: String.raw`\dfrac{1}{\sqrt{x}\left(1+\sqrt{x}\right)}`, loTex: `${p * p}`, hiTex: `${q * q}`, lo: p * p, hi: q * q,
      f: x => 1 / (Math.sqrt(x) * (1 + Math.sqrt(x))), ans,
      steps: String.raw`$t=\sqrt{x}$ とおくと $dx=2t\,dt$。$x:${p * p}\to${q * q}$ のとき $t:${p}\to${q}$。
$$\int_{${p * p}}^{${q * q}}\frac{dx}{\sqrt{x}(1+\sqrt{x})}=\int_{${p}}^{${q}}\frac{2\,dt}{1+t}=2\Bigl[\ln(1+t)\Bigr]_{${p}}^{${q}}=${ans.tex}$$`
    };
  });
  def("irr", 2, "ルートの中身 $x+a$ を $u$ と置く", r => {
    const p = r.int(1, 3), q = r.int(p + 1, p + 3), a = p * p;
    const hi = q * q - a;
    const ans = lin([{ c: fadd(F(2 * (q ** 3 - p ** 3), 3), fneg(F(2 * a * (q - p)))), f: [] }]);
    return {
      body: String.raw`\dfrac{x}{\sqrt{x+${a}}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => x / Math.sqrt(x + a), ans,
      steps: String.raw`$u=x+${a}$ とおくと $x=u-${a}$。$x:0\to${hi}$ のとき $u:${a}\to${q * q}$。
$$\int_0^{${hi}}\frac{x}{\sqrt{x+${a}}}dx=\int_{${a}}^{${q * q}}\Bigl(u^{\frac12}-${a}u^{-\frac12}\Bigr)du=\Bigl[\frac23u^{\frac32}-${2 * a}u^{\frac12}\Bigr]_{${a}}^{${q * q}}=${ans.tex}$$`
    };
  });
  def("irr", 3, "$1\\pm\\cos x$ を半角の公式でルートの外に出す", r => {
    const plus = r.pick([true, false]), hk = r.pick([3, 23, 6]);
    const ang = { 3: ["\\dfrac{\\pi}{3}", Math.PI / 3], 23: ["\\dfrac{2\\pi}{3}", 2 * Math.PI / 3], 6: ["\\pi", Math.PI] }[hk];
    let t;
    if (plus) t = hk === 3 ? [{ c: F(1), f: [SQ2] }] : hk === 23 ? [{ c: F(1), f: [SQ6] }] : [{ c: F(2), f: [SQ2] }];
    else t = hk === 3 ? [{ c: F(2), f: [SQ2] }, { c: F(-1), f: [SQ6] }] : hk === 23 ? [{ c: F(1), f: [SQ2] }] : [{ c: F(2), f: [SQ2] }];
    const ans = lin(t);
    return {
      body: plus ? String.raw`\sqrt{1+\cos x}` : String.raw`\sqrt{1-\cos x}`, loTex: "0", hiTex: ang[0], lo: 0, hi: ang[1],
      f: plus ? (x => Math.sqrt(1 + Math.cos(x))) : (x => Math.sqrt(1 - Math.cos(x))), ans,
      steps: plus
        ? String.raw`$1+\cos x=2\cos^2\dfrac{x}{2}$ で、$0\leqq x\leqq\pi$ では $\cos\dfrac{x}{2}\geqq0$ だから $\sqrt{1+\cos x}=\sqrt2\cos\dfrac{x}{2}$。
$$\int_0^{${ang[0]}}\sqrt{1+\cos x}\,dx=\Bigl[2\sqrt2\sin\frac{x}{2}\Bigr]_0^{${ang[0]}}=${ans.tex}$$`
        : String.raw`$1-\cos x=2\sin^2\dfrac{x}{2}$ で、$0\leqq x\leqq\pi$ では $\sin\dfrac{x}{2}\geqq0$ だから $\sqrt{1-\cos x}=\sqrt2\sin\dfrac{x}{2}$。
$$\int_0^{${ang[0]}}\sqrt{1-\cos x}\,dx=\Bigl[-2\sqrt2\cos\frac{x}{2}\Bigr]_0^{${ang[0]}}=${ans.tex}$$`
    };
  });

  // =====================================================================
  // 追加タイプ(第3弾)
  // =====================================================================
  const piFrac = f => (f.d === 1 ? (f.n === 1 ? "\\pi" : `${f.n}\\pi`) : (f.n === 1 ? `\\dfrac{\\pi}{${f.d}}` : `\\dfrac{${f.n}\\pi}{${f.d}}`));
  const expTex = k => `${k < 0 ? "-" : ""}${Math.abs(k) === 1 ? "" : Math.abs(k)}`;

  // ----- 置換積分 -----
  def("sub", 3, "$kx^2=u$ と置換してから部分積分", r => {
    const k = r.pick([1, 2, 3, 4, 5, -1, -2, -3, -4]), hi = k > 0 ? 1 : r.int(1, 2);
    const j = k * hi * hi;
    const ans = lin([{ c: F(j - 1, 2 * k * k), f: [eP(j)] }, { c: F(1, 2 * k * k), f: [] }]);
    const ex = `${expTex(k)}x^{2}`;
    return {
      body: String.raw`x^{3}e^{${ex}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => x ** 3 * Math.exp(k * x * x), ans,
      steps: String.raw`$u=${ex}$ とおくと $x\,dx=\dfrac{du}{${2 * k}}$、$x^2=\dfrac{u}{${k}}$。$x:0\to${hi}$ のとき $u:0\to${j}$。
$$\int_0^{${hi}}x^3e^{${ex}}dx=\frac{1}{${2 * k * k}}\int_0^{${j}}ue^u\,du=\frac{1}{${2 * k * k}}\Bigl[(u-1)e^u\Bigr]_0^{${j}}=${ans.tex}$$`
    };
  });
  def("sub", 2, "$\\ln x=t$ と置く(三角関数の中に $\\ln x$)", r => {
    const m = r.int(1, 12), kind = r.pick(["sin", "cos"]);
    const t = [];
    if (kind === "sin") { t.push({ c: F(1), f: [] }); pushS(t, cosM(m), F(-1), []); }
    else pushS(t, sinM(m), F(1), []);
    const ans = lin(t), KN = "\\" + kind, hiTex = `e^{${piM(m)}}`;
    return {
      body: String.raw`\dfrac{${KN}(\ln x)}{x}`, loTex: "1", hiTex, lo: 1, hi: Math.exp(m * Math.PI / 6),
      f: x => (kind === "sin" ? Math.sin(Math.log(x)) : Math.cos(Math.log(x))) / x, ans,
      steps: String.raw`$t=\ln x$ とおくと $dt=\dfrac{dx}{x}$。$x:1\to${hiTex}$ のとき $t:0\to${piM(m)}$。
$$\int_1^{${hiTex}}\frac{${KN}(\ln x)}{x}dx=\int_0^{${piM(m)}}${KN}t\,dt=${ans.tex}$$`
    };
  });
  def("sub", 2, "$\\sin x$ か $\\cos x$ を $u$ と置く(指数の中)", r => {
    const a = r.int(1, 6), form = r.pick(["s", "c"]);
    const ans = lin([{ c: F(1, a), f: [eP(a)] }, { c: F(-1, a), f: [] }]);
    const ex = a === 1 ? "" : `${a}`;
    return {
      body: form === "s" ? String.raw`e^{${ex}\sin x}\cos x` : String.raw`e^{${ex}\cos x}\sin x`,
      loTex: "0", hiTex: "\\dfrac{\\pi}{2}", lo: 0, hi: Math.PI / 2,
      f: form === "s" ? (x => Math.exp(a * Math.sin(x)) * Math.cos(x)) : (x => Math.exp(a * Math.cos(x)) * Math.sin(x)), ans,
      steps: form === "s"
        ? String.raw`$u=\sin x$ とおくと $du=\cos x\,dx$。$x:0\to\frac{\pi}{2}$ のとき $u:0\to1$。
$$\int_0^{\frac{\pi}{2}}e^{${ex}\sin x}\cos x\,dx=\int_0^1e^{${ex}u}du=\Bigl[\frac{e^{${ex}u}}{${a}}\Bigr]_0^1=${ans.tex}$$`
        : String.raw`$u=\cos x$ とおくと $du=-\sin x\,dx$。$x:0\to\frac{\pi}{2}$ のとき $u:1\to0$。
$$\int_0^{\frac{\pi}{2}}e^{${ex}\cos x}\sin x\,dx=\int_0^1e^{${ex}u}du=\Bigl[\frac{e^{${ex}u}}{${a}}\Bigr]_0^1=${ans.tex}$$`
    };
  });
  def("sub", 2, "$\\ln x=t$ と置く(分母に $\\ln x$)", r => {
    const m = r.int(2, 6), n = r.int(1, 4);
    const ans = n === 1 ? lin([{ c: F(1), f: [lnR(m, 1)] }]) : lin([{ c: F(1, n - 1), f: [] }, { c: F(-1, (n - 1) * m ** (n - 1)), f: [] }]);
    return {
      body: n === 1 ? String.raw`\dfrac{1}{x\ln x}` : String.raw`\dfrac{1}{x(\ln x)^{${n}}}`, loTex: "e", hiTex: `e^{${m}}`, lo: Math.E, hi: Math.exp(m),
      f: x => 1 / (x * Math.log(x) ** n), ans,
      steps: String.raw`$t=\ln x$ とおくと $dt=\dfrac{dx}{x}$。$x:e\to e^{${m}}$ のとき $t:1\to${m}$。
$$\int_e^{e^{${m}}}\frac{dx}{x(\ln x)^{${n}}}=\int_1^{${m}}t^{-${n}}dt=${n === 1 ? String.raw`\Bigl[\ln t\Bigr]_1^{${m}}` : String.raw`\Bigl[-\frac{1}{${n - 1}t^{${n - 1}}}\Bigr]_1^{${m}}`}=${ans.tex}$$`
    };
  });

  // ----- 三角関数 -----
  def("trig", 2, "$\\sin^2x$ か $\\cos^2x$ を $u$ と置く", r => {
    const a = r.int(1, 6), kind = r.pick(["sc", "s2"]);
    const ans = lin([{ c: kind === "sc" ? F(1, 2) : F(1), f: [lnR(a + 1, a)] }]);
    return {
      body: kind === "sc" ? String.raw`\dfrac{\sin x\cos x}{${a}+\sin^{2}x}` : String.raw`\dfrac{\sin 2x}{${a}+\cos^{2}x}`,
      loTex: "0", hiTex: "\\dfrac{\\pi}{2}", lo: 0, hi: Math.PI / 2,
      f: kind === "sc" ? (x => Math.sin(x) * Math.cos(x) / (a + Math.sin(x) ** 2)) : (x => Math.sin(2 * x) / (a + Math.cos(x) ** 2)), ans,
      steps: kind === "sc"
        ? String.raw`$u=\sin^2x$ とおくと $du=2\sin x\cos x\,dx$。$x:0\to\frac{\pi}{2}$ のとき $u:0\to1$。
$$\int_0^{\frac{\pi}{2}}\frac{\sin x\cos x}{${a}+\sin^2x}dx=\frac12\int_0^1\frac{du}{${a}+u}=\frac12\Bigl[\ln(${a}+u)\Bigr]_0^1=${ans.tex}$$`
        : String.raw`$u=\cos^2x$ とおくと $du=-\sin2x\,dx$。$x:0\to\frac{\pi}{2}$ のとき $u:1\to0$。
$$\int_0^{\frac{\pi}{2}}\frac{\sin2x}{${a}+\cos^2x}dx=\int_0^1\frac{du}{${a}+u}=\Bigl[\ln(${a}+u)\Bigr]_0^1=${ans.tex}$$`
    };
  });
  def("trig", 3, "$x\\to\\dfrac{\\pi}{2}-x$ と置換して、もとの式と足す", r => {
    const n = r.int(1, 6), form = r.pick(["sc", "tan"]);
    const ans = lin([{ c: F(1, 4), f: [PI] }]);
    return {
      body: form === "sc"
        ? (n === 1 ? String.raw`\dfrac{\sin x}{\sin x+\cos x}` : String.raw`\dfrac{\sin^{${n}}x}{\sin^{${n}}x+\cos^{${n}}x}`)
        : (n === 1 ? String.raw`\dfrac{1}{1+\tan x}` : String.raw`\dfrac{1}{1+\tan^{${n}}x}`),
      loTex: "0", hiTex: "\\dfrac{\\pi}{2}", lo: 0, hi: Math.PI / 2,
      f: form === "sc" ? (x => Math.sin(x) ** n / (Math.sin(x) ** n + Math.cos(x) ** n)) : (x => 1 / (1 + Math.tan(x) ** n)), ans,
      steps: String.raw`求める値を $I$ とし、$x=\dfrac{\pi}{2}-t$ と置換した積分も $I$ に等しい。2つを足すと被積分関数が $1$ になるので $2I=\dfrac{\pi}{2}$。
$$I=${ans.tex}$$`
    };
  });
  def("trig", 2, "展開して $\\sin2x$ を作る", r => {
    const h = r.pick([1, 2, 3, 4, 6, 12]), plus = r.pick([true, false]);
    const t = [{ c: F(1, h), f: [PI] }];
    pushS(t, cosM(12 / h), F(plus ? -1 : 1, 2), []);
    t.push({ c: F(plus ? 1 : -1, 2), f: [] });
    const ans = lin(t);
    return {
      body: String.raw`(\sin x${plus ? "+" : "-"}\cos x)^{2}`, loTex: "0", hiTex: piOver(h), lo: 0, hi: Math.PI / h,
      f: x => (Math.sin(x) + (plus ? 1 : -1) * Math.cos(x)) ** 2, ans,
      steps: String.raw`$(\sin x${plus ? "+" : "-"}\cos x)^2=1${plus ? "+" : "-"}\sin2x$ より
$$\int_0^{${piOver(h)}}(\sin x${plus ? "+" : "-"}\cos x)^2dx=\Bigl[x${plus ? "-" : "+"}\frac{\cos2x}{2}\Bigr]_0^{${piOver(h)}}=${ans.tex}$$`
    };
  });
  def("trig", 1, "周期ごとに符号を調べて区間を分ける(絶対値)", r => {
    const k = r.int(1, 4), n = r.int(1, 4), kind = r.pick(["sin", "cos"]);
    const ans = lin([{ c: F(2 * n, k), f: [] }]);
    const KN = "\\" + kind, hi = n * Math.PI / k, hiTex = piFrac(F(n, k));
    return {
      body: String.raw`\left|${KN}${k === 1 ? "" : " " + k}x\right|`, loTex: "0", hiTex, lo: 0, hi,
      f: x => Math.abs(kind === "sin" ? Math.sin(k * x) : Math.cos(k * x)), ans,
      steps: String.raw`$|${KN}${k === 1 ? " " : " " + k}x|$ は周期 $\dfrac{\pi}{${k}}$ で、1周期分の面積は $\dfrac{2}{${k}}$。区間 $[0,${hiTex}]$ には ${n} 周期分が入る。
$$\int_0^{${hiTex}}\left|${KN}${k === 1 ? "" : " " + k}x\right|dx=${n}\times\frac{2}{${k}}=${ans.tex}$$`
    };
  });

  // ----- 分数関数 -----
  def("frac", 2, "分子を $x$ の項と定数項に分ける", r => {
    const p = r.pick([1, 2, 3, 4, -1, -2, -3]), q = r.pick([1, 2, 3, 4, -1, -2, -3]), c = r.int(1, 3);
    const ans = lin([{ c: F(p, 2), f: [LN2] }, { c: F(q, 4 * c), f: [PI] }]);
    return {
      body: String.raw`\dfrac{${linTex(p, q)}}{x^{2}+${c * c}}`, loTex: "0", hiTex: `${c}`, lo: 0, hi: c,
      f: x => (p * x + q) / (x * x + c * c), ans,
      steps: String.raw`$\dfrac{${linTex(p, q)}}{x^2+${c * c}}=\dfrac{${p === 1 ? "" : p === -1 ? "-" : p}x}{x^2+${c * c}}${q < 0 ? "-" : "+"}\dfrac{${Math.abs(q)}}{x^2+${c * c}}$ と分ける。前半は分母を $u$ と置換、後半は $x=${c === 1 ? "" : c}\tan\theta$。
$$\int_0^{${c}}\frac{${linTex(p, q)}}{x^2+${c * c}}dx=\frac{${p}}{2}\ln 2+\frac{${q}}{${c}}\cdot\frac{\pi}{4}=${ans.tex}$$`
    };
  });
  def("frac", 3, "部分分数に分ける(分母に2乗)", r => {
    const a = r.int(1, 4), lo = r.int(1, 2), hi = lo + r.int(1, 2);
    const ans = lin([{ c: F(1, a * a), f: [lnR(hi * (lo + a), lo * (hi + a))] }, { c: fadd(F(1, a * (hi + a)), fneg(F(1, a * (lo + a)))), f: [] }]);
    return {
      body: String.raw`\dfrac{1}{x(x+${a})^{2}}`, loTex: `${lo}`, hiTex: `${hi}`, lo, hi,
      f: x => 1 / (x * (x + a) ** 2), ans,
      steps: String.raw`$\dfrac{1}{x(x+${a})^2}=\dfrac{1}{${a * a}}\Bigl(\dfrac{1}{x}-\dfrac{1}{x+${a}}\Bigr)-\dfrac{1}{${a}(x+${a})^2}$ と分解する。
$$\int_{${lo}}^{${hi}}\frac{dx}{x(x+${a})^2}=\Bigl[\frac{1}{${a * a}}\ln\frac{x}{x+${a}}+\frac{1}{${a}(x+${a})}\Bigr]_{${lo}}^{${hi}}=${ans.tex}$$`
    };
  });
  def("frac", 3, "$x=a\\tan\\theta$ と置く(分母が2乗)", r => {
    const a = r.int(1, 4), root3 = r.pick([false, true]);
    const ans = root3 ? lin([{ c: F(1, 6 * a ** 3), f: [PI] }, { c: F(1, 8 * a ** 3), f: [SQ3] }]) : lin([{ c: F(1, 8 * a ** 3), f: [PI] }, { c: F(1, 4 * a ** 3), f: [] }]);
    const hiTex = root3 ? (a === 1 ? "\\sqrt{3}" : `${a}\\sqrt{3}`) : `${a}`;
    return {
      body: String.raw`\dfrac{1}{(x^{2}+${a * a})^{2}}`, loTex: "0", hiTex, lo: 0, hi: root3 ? a * Math.sqrt(3) : a,
      f: x => 1 / (x * x + a * a) ** 2, ans,
      steps: String.raw`$x=${a === 1 ? "" : a}\tan\theta$ とおくと $dx=\dfrac{${a === 1 ? "" : a}}{\cos^2\theta}d\theta$、$(x^2+${a * a})^2=\dfrac{${a ** 4}}{\cos^4\theta}$。
$$\int_0^{${hiTex}}\frac{dx}{(x^2+${a * a})^2}=\frac{1}{${a ** 3}}\int_0^{${root3 ? "\\frac{\\pi}{3}" : "\\frac{\\pi}{4}"}}\cos^2\theta\,d\theta=${ans.tex}$$`
    };
  });
  def("frac", 1, "$\\dfrac{x}{(x+a)^2}=\\dfrac{1}{x+a}-\\dfrac{a}{(x+a)^2}$", r => {
    const a = r.int(1, 5), hi = r.int(1, 3);
    const ans = lin([{ c: F(1), f: [lnR(hi + a, a)] }, { c: F(-hi, hi + a), f: [] }]);
    return {
      body: String.raw`\dfrac{x}{(x+${a})^{2}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => x / (x + a) ** 2, ans,
      steps: String.raw`$\dfrac{x}{(x+${a})^2}=\dfrac{1}{x+${a}}-\dfrac{${a}}{(x+${a})^2}$ と分ける。
$$\int_0^{${hi}}\Bigl(\frac{1}{x+${a}}-\frac{${a}}{(x+${a})^2}\Bigr)dx=\Bigl[\ln(x+${a})+\frac{${a}}{x+${a}}\Bigr]_0^{${hi}}=${ans.tex}$$`
    };
  });
  def("frac", 3, "$e^x=t$ と置く", r => {
    const pair = r.pick(["m0", "0p", "mp"]), form = r.pick(["A", "B"]);
    const L = Math.log(Math.sqrt(3));
    const lo = pair === "0p" ? 0 : -L, hi = pair === "m0" ? 0 : L;
    const loTex = pair === "0p" ? "0" : "-\\ln\\sqrt{3}", hiTex = pair === "m0" ? "0" : "\\ln\\sqrt{3}";
    const ans = lin([{ c: pair === "mp" ? F(1, 6) : F(1, 12), f: [PI] }]);
    return {
      body: form === "A" ? String.raw`\dfrac{e^{x}}{e^{2x}+1}` : String.raw`\dfrac{1}{e^{x}+e^{-x}}`, loTex, hiTex, lo, hi,
      f: form === "A" ? (x => Math.exp(x) / (Math.exp(2 * x) + 1)) : (x => 1 / (Math.exp(x) + Math.exp(-x))), ans,
      steps: String.raw`${form === "B" ? "分母分子に $e^x$ を掛けると $\\dfrac{e^x}{e^{2x}+1}$。" : ""}$t=e^x$ とおくと $dt=e^x\,dx$。
$$\int_{${loTex}}^{${hiTex}}\frac{e^x}{e^{2x}+1}dx=\int\frac{dt}{t^2+1}=\Bigl[\arctan t\Bigr]=${ans.tex}$$
($e^x=\dfrac{1}{\sqrt3},1,\sqrt3$ のとき $\arctan e^x=\dfrac{\pi}{6},\dfrac{\pi}{4},\dfrac{\pi}{3}$)`
    };
  });

  // ----- 部分積分 -----
  def("ibp", 2, "$1\\cdot\\ln(x+a)$ とみて部分積分", r => {
    const a = r.int(1, 5), hi = r.int(1, 3);
    const t = [{ c: F(hi + a), f: [lnR(hi + a, 1)] }];
    if (a > 1) t.push({ c: F(-a), f: [lnR(a, 1)] });
    t.push({ c: F(-hi), f: [] });
    const ans = lin(t);
    return {
      body: String.raw`\ln(x+${a})`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
      f: x => Math.log(x + a), ans,
      steps: String.raw`$$\int_0^{${hi}}\ln(x+${a})dx=\Bigl[(x+${a})\ln(x+${a})-x\Bigr]_0^{${hi}}=${ans.tex}$$`
    };
  });
  def("ibp", 3, "$x^{\\pm\\frac12}$ を積分する側にして部分積分", r => {
    const q = r.int(2, 7), kind = r.pick(["inv", "sqrt"]);
    const t = kind === "inv"
      ? [{ c: F(4 * q), f: [lnR(q, 1)] }, { c: F(-4 * q + 4), f: [] }]
      : [{ c: F(4 * q ** 3, 3), f: [lnR(q, 1)] }, { c: F(-4 * (q ** 3 - 1), 9), f: [] }];
    const ans = lin(t);
    return {
      body: kind === "inv" ? String.raw`\dfrac{\ln x}{\sqrt{x}}` : String.raw`\sqrt{x}\ln x`, loTex: "1", hiTex: `${q * q}`, lo: 1, hi: q * q,
      f: kind === "inv" ? (x => Math.log(x) / Math.sqrt(x)) : (x => Math.sqrt(x) * Math.log(x)), ans,
      steps: kind === "inv"
        ? String.raw`$\dfrac{1}{\sqrt{x}}$ の原始関数 $2\sqrt{x}$ を使って
$$\int_1^{${q * q}}\frac{\ln x}{\sqrt{x}}dx=\Bigl[2\sqrt{x}\ln x-4\sqrt{x}\Bigr]_1^{${q * q}}=${ans.tex}$$`
        : String.raw`$\sqrt{x}$ の原始関数 $\dfrac23x^{\frac32}$ を使って
$$\int_1^{${q * q}}\sqrt{x}\ln x\,dx=\Bigl[\frac23x^{\frac32}\ln x-\frac49x^{\frac32}\Bigr]_1^{${q * q}}=${ans.tex}$$`
    };
  });
  def("ibp", 3, "$\\dfrac{1}{\\cos^2x}=(\\tan x)'$ とみて部分積分", r => {
    const h = r.pick([4, 3, 6]);
    const T = { 4: [{ c: F(1, 4), f: [PI] }, { c: F(-1, 2), f: [LN2] }], 3: [{ c: F(1, 3), f: [PI, SQ3] }, { c: F(-1), f: [LN2] }], 6: [{ c: F(1, 18), f: [PI, SQ3] }, { c: F(1, 2), f: [LN3] }, { c: F(-1), f: [LN2] }] };
    const ans = lin(T[h]);
    return {
      body: String.raw`\dfrac{x}{\cos^{2}x}`, loTex: "0", hiTex: piOver(h), lo: 0, hi: Math.PI / h,
      f: x => x / Math.cos(x) ** 2, ans,
      steps: String.raw`$$\int_0^{${piOver(h)}}\frac{x}{\cos^2x}dx=\Bigl[x\tan x\Bigr]_0^{${piOver(h)}}-\int_0^{${piOver(h)}}\tan x\,dx=\Bigl[x\tan x+\ln\cos x\Bigr]_0^{${piOver(h)}}=${ans.tex}$$`
    };
  });
  def("ibp", 3, "分数関数の微分の形を見抜く", r => {
    const form = r.pick(["A", "B"]);
    if (form === "A") {
      const hi = r.int(1, 5);
      const ans = lin([{ c: F(1, hi + 1), f: [eP(hi)] }, { c: F(-1), f: [] }]);
      return {
        body: String.raw`\dfrac{xe^{x}}{(x+1)^{2}}`, loTex: "0", hiTex: `${hi}`, lo: 0, hi,
        f: x => x * Math.exp(x) / (x + 1) ** 2, ans,
        steps: String.raw`$\Bigl(\dfrac{e^x}{x+1}\Bigr)'=\dfrac{e^x(x+1)-e^x}{(x+1)^2}=\dfrac{xe^x}{(x+1)^2}$ だから
$$\int_0^{${hi}}\frac{xe^x}{(x+1)^2}dx=\Bigl[\frac{e^x}{x+1}\Bigr]_0^{${hi}}=${ans.tex}$$`
      };
    }
    const hi = r.int(2, 6);
    const ans = lin([{ c: F(1, hi), f: [eP(hi)] }, { c: F(-1), f: [eP(1)] }]);
    return {
      body: String.raw`\dfrac{(x-1)e^{x}}{x^{2}}`, loTex: "1", hiTex: `${hi}`, lo: 1, hi,
      f: x => (x - 1) * Math.exp(x) / (x * x), ans,
      steps: String.raw`$\Bigl(\dfrac{e^x}{x}\Bigr)'=\dfrac{e^xx-e^x}{x^2}=\dfrac{(x-1)e^x}{x^2}$ だから
$$\int_1^{${hi}}\frac{(x-1)e^x}{x^2}dx=\Bigl[\frac{e^x}{x}\Bigr]_1^{${hi}}=${ans.tex}$$`
    };
  });

  // ----- 無理関数・円 -----
  def("irr", 3, "$x=a\\sin\\theta$ と置く($\\sin^2\\theta\\cos^2\\theta$ や $\\cos^4\\theta$ の積分)", r => {
    const a = r.int(1, 6), form = r.pick(["x2", "p32"]);
    const ans = lin([{ c: F(form === "x2" ? a ** 4 : 3 * a ** 4, 16), f: [PI] }]);
    return {
      body: form === "x2" ? String.raw`x^{2}\sqrt{${a * a}-x^{2}}` : String.raw`\left(${a * a}-x^{2}\right)^{\frac{3}{2}}`, loTex: "0", hiTex: `${a}`, lo: 0, hi: a,
      f: form === "x2" ? (x => x * x * Math.sqrt(a * a - x * x)) : (x => (a * a - x * x) ** 1.5), ans,
      steps: String.raw`$x=${a === 1 ? "" : a}\sin\theta$ とおくと $dx=${a === 1 ? "" : a}\cos\theta\,d\theta$、$x:0\to${a}$ のとき $\theta:0\to\dfrac{\pi}{2}$。
$$${form === "x2" ? String.raw`\int_0^{${a}}x^2\sqrt{${a * a}-x^2}\,dx=${a ** 4}\int_0^{\frac{\pi}{2}}\sin^2\theta\cos^2\theta\,d\theta` : String.raw`\int_0^{${a}}(${a * a}-x^2)^{\frac32}dx=${a ** 4}\int_0^{\frac{\pi}{2}}\cos^4\theta\,d\theta`}=${ans.tex}$$`
    };
  });
  def("irr", 2, "展開して $x$ と $\\dfrac{1}{x}$ の和にする", r => {
    const [p, q] = r.pick([[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]), plus = r.pick([true, false]);
    const ans = lin([{ c: fadd(F(q ** 4 - p ** 4, 2), F((plus ? 2 : -2) * (q * q - p * p))), f: [] }, { c: F(2), f: [lnR(q, p)] }]);
    return {
      body: String.raw`\left(\sqrt{x}${plus ? "+" : "-"}\dfrac{1}{\sqrt{x}}\right)^{2}`, loTex: `${p * p}`, hiTex: `${q * q}`, lo: p * p, hi: q * q,
      f: x => (Math.sqrt(x) + (plus ? 1 : -1) / Math.sqrt(x)) ** 2, ans,
      steps: String.raw`$\left(\sqrt{x}${plus ? "+" : "-"}\dfrac{1}{\sqrt{x}}\right)^2=x${plus ? "+" : "-"}2+\dfrac{1}{x}$ より
$$\int_{${p * p}}^{${q * q}}\Bigl(x${plus ? "+" : "-"}2+\frac1x\Bigr)dx=\Bigl[\frac{x^2}{2}${plus ? "+" : "-"}2x+\ln x\Bigr]_{${p * p}}^{${q * q}}=${ans.tex}$$`
    };
  });

  // =====================================================================
  // 問題プールと日替わりスケジュール
  // =====================================================================
  const CAP = 30;       // 1タイプがプールに出す問題数の上限(特定のタイプに偏らないように)
  const GAP = 90;       // 同じ問題が再び出るまでの最短日数
  const EPOCH = Date.UTC(2026, 0, 1) / 86400000;
  const pools = {}, orders = {};

  // 分野のプール: [{ ti: タイプ番号, s: シード }]。同じ問題(tex が同じ)は1つにまとめる
  function poolOf(cat) {
    if (pools[cat]) return pools[cat];
    const out = [];
    const seen = new Set(); // 分野内で同じ式の問題を重複させない(別タイプが同じ問題を作る場合がある)
    TYPES.forEach((type, ti) => {
      if (type.cat !== cat) return;
      let cnt = 0, miss = 0;
      for (let s = 1; s <= 3000 && cnt < CAP && miss < 150; s++) {
        const p = type.make(makeRng(hashStr(`${ti}:${s}`)));
        const key = integ(p.loTex, p.hiTex, p.body);
        if (seen.has(key)) { miss++; continue; }
        seen.add(key); cnt++; miss = 0;
        out.push({ ti, s });
      }
    });
    return (pools[cat] = out);
  }
  const range = n => Array.from({ length: n }, (_, i) => i);
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  // k 周目の出題順(プール番号の並び)。直前の周と照らして、同じ問題が GAP 日未満で再登場しないようにする
  function orderOf(cat, k) {
    const key = cat + ":" + k;
    if (orders[key]) return orders[key];
    const N = poolOf(cat).length;
    const rng = makeRng(hashStr("perm:" + key));
    let arr;
    if (k <= 0) arr = shuffle(range(N), rng);
    else {
      const prev = orderOf(cat, k - 1), G = Math.min(GAP, N - 1);
      const prevPos = new Array(N);
      prev.forEach((id, p) => { prevPos[id] = p; });
      const earliest = id => Math.max(0, prevPos[id] - (N - G)); // この位置より前には置けない
      const remaining = range(N);
      arr = [];
      for (let i = 0; i < N; i++) {
        const cands = remaining.filter(id => earliest(id) <= i);
        const pick = cands[Math.floor(rng.next() * cands.length)];
        arr.push(pick);
        remaining.splice(remaining.indexOf(pick), 1);
      }
    }
    return (orders[key] = arr);
  }
  function dayIndex(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000 - EPOCH);
  }
  function build(type, rng, id) {
    const p = type.make(rng);
    const cat = CATS.find(c => c.key === type.cat);
    return {
      id, cat: type.cat, catLabel: cat.label, level: type.level, hint: type.hint,
      tex: integ(p.loTex, p.hiTex, p.body), ans: p.ans, steps: p.steps, f: p.f, lo: p.lo, hi: p.hi
    };
  }
  // 分野 cat の dateStr の問題
  function problemOf(cat, dateStr) {
    const pool = poolOf(cat), N = pool.length, di = dayIndex(dateStr);
    const k = Math.floor(di / N), pos = di - k * N;
    const e = pool[orderOf(cat, k)[pos]];
    return build(TYPES[e.ti], makeRng(hashStr(`${e.ti}:${e.s}`)), `${dateStr}:${cat}`);
  }
  function dailySet(dateStr) {
    const order = shuffle(CATS.map(c => c.key), makeRng(hashStr("order:" + dateStr)));
    return order.map((cat, i) => {
      const p = problemOf(cat, dateStr);
      p.id = `${dateStr}#${i}`;
      return p;
    });
  }

  const api = { dailySet, problemOf, poolOf, TYPES, CATS, makeRng, build, hashStr, GAP };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IntegralGen = api;
})(typeof window !== "undefined" ? window : globalThis);
