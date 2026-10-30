// 答えの式パーサー。入力文字列 → { ok, value, tex } または { ok:false, error }
// 対応: 数, π/pi, e, + - * / ^, 括弧, √/sqrt, ln/log(自然対数), exp, 暗黙の乗算(2π, 3√2 など)
(function (root) {
  "use strict";

  function normalize(s) {
    return s
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[（]/g, "(").replace(/[）]/g, ")")
      .replace(/[｛{]/g, "(").replace(/[｝}]/g, ")")
      .replace(/[／÷]/g, "/")
      .replace(/[−－ー]/g, "-")
      .replace(/[＋]/g, "+")
      .replace(/[×＊・·]/g, "*")
      .replace(/[＾]/g, "^")
      .replace(/²/g, "^2").replace(/³/g, "^3")
      // 添字の数字(log₂ など)は、底として括弧付きに直す
      .replace(/[₀-₉]+/g, m => "_(" + m.replace(/[₀-₉]/g, c => String(c.charCodeAt(0) - 0x2080)) + ")")
      .replace(/\s+/g, "");
  }

  const WORDS = ["sqrt", "exp", "log", "ln", "pi", "π", "√", "e"];

  function tokenize(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/[0-9.]/.test(ch)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        const t = s.slice(i, j);
        if (!/^\d+(\.\d+)?$/.test(t)) throw new Error("数の書き方が正しくありません");
        out.push({ t: "num", v: t });
        i = j;
      } else if ("+-*/^()_".includes(ch)) {
        out.push({ t: ch });
        i++;
      } else {
        const w = WORDS.find(k => s.toLowerCase().startsWith(k, i));
        if (!w) throw new Error(`「${ch}」は使えません`);
        out.push({ t: "id", v: w === "π" ? "pi" : w === "√" ? "sqrt" : w }); // log は底の有無で意味が変わるので、そのまま残す
        i += w.length;
      }
    }
    return out;
  }

  // 構文木: {k:'num',v} {k:'pi'} {k:'e'} {k:'neg',a} {k:'bin',op,a,b} {k:'pow',a,b} {k:'fn',f,a} {k:'paren',a}
  function parse(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];
    const eat = () => tokens[pos++];

    function startsPrimary(tk) {
      return tk && (tk.t === "num" || tk.t === "(" || tk.t === "id");
    }
    function expr() {
      let left = term();
      while (peek() && (peek().t === "+" || peek().t === "-")) {
        const op = eat().t;
        left = { k: "bin", op, a: left, b: term() };
      }
      return left;
    }
    function term() {
      let left = unary();
      for (;;) {
        const tk = peek();
        if (tk && (tk.t === "*" || tk.t === "/")) {
          eat();
          left = { k: "bin", op: tk.t, a: left, b: unary() };
        } else if (startsPrimary(tk)) {
          left = { k: "bin", op: "imp", a: left, b: unary() }; // 暗黙の乗算
        } else break;
      }
      return left;
    }
    function unary() {
      const tk = peek();
      if (tk && tk.t === "-") { eat(); return { k: "neg", a: unary() }; }
      if (tk && tk.t === "+") { eat(); return unary(); }
      return power();
    }
    function power() {
      const base = primary();
      if (peek() && peek().t === "^") {
        eat();
        const tk = peek();
        let exp;
        if (tk && tk.t === "-") { eat(); exp = { k: "neg", a: power() }; }
        else exp = power();
        return { k: "pow", a: base, b: exp };
      }
      return base;
    }
    function primary() {
      const tk = eat();
      if (!tk) throw new Error("式が途中で終わっています");
      if (tk.t === "num") return { k: "num", v: tk.v };
      if (tk.t === "(") {
        const inner = expr();
        if (peek() && peek().t === ")") eat();
        else if (peek()) throw new Error("括弧が閉じていません");
        // 式の末尾で足りない閉じ括弧は、関数電卓と同じく自動で補う
        return { k: "paren", a: inner };
      }
      if (tk.t === "id") {
        if (tk.v === "pi") return { k: "pi" };
        if (tk.v === "e") return { k: "e" };
        // 関数: 括弧付き、または直後の1つの項(√3, ln2 など)
        let fname = tk.v, base = null;
        if (fname === "log") {
          if (peek() && peek().t === "_") { // 底つき: log_2(3), log_(2)(3), log_e 2
            eat();
            if (!startsPrimary(peek())) throw new Error("log の底を入力してください");
            base = primary();
          } else fname = "ln"; // 底なしの log は自然対数
        }
        const nx = peek();
        if (!startsPrimary(nx) || (nx.t === "id" && !["pi", "e", "sqrt", "ln", "log", "exp"].includes(nx.v))) {
          throw new Error(`${base ? "log の真数" : fname} のあとに値がありません`);
        }
        const arg = nx.t === "(" ? primary() : power();
        return base ? { k: "log", base, a: arg } : { k: "fn", f: fname, a: arg };
      }
      throw new Error("式の形が正しくありません");
    }

    const tree = expr();
    if (pos < tokens.length) throw new Error("式の形が正しくありません");
    return tree;
  }

  function evalTree(n) {
    switch (n.k) {
      case "num": return parseFloat(n.v);
      case "pi": return Math.PI;
      case "e": return Math.E;
      case "paren": return evalTree(n.a);
      case "neg": return -evalTree(n.a);
      case "pow": return Math.pow(evalTree(n.a), evalTree(n.b));
      case "log": return Math.log(evalTree(n.a)) / Math.log(evalTree(n.base));
      case "fn": {
        const x = evalTree(n.a);
        if (n.f === "sqrt") return Math.sqrt(x);
        if (n.f === "ln") return Math.log(x);
        if (n.f === "exp") return Math.exp(x);
        return NaN;
      }
      case "bin": {
        const a = evalTree(n.a), b = evalTree(n.b);
        if (n.op === "+") return a + b;
        if (n.op === "-") return a - b;
        if (n.op === "/") return a / b;
        return a * b; // * と暗黙の乗算
      }
    }
    return NaN;
  }

  const isAtom = n => n.k === "num" || n.k === "pi" || n.k === "e" || n.k === "paren" || n.k === "fn" || n.k === "log";
  function tex(n) {
    switch (n.k) {
      case "num": return n.v;
      case "pi": return "\\pi";
      case "e": return "e";
      case "paren": return `\\left(${tex(n.a)}\\right)`;
      case "neg": return `-${n.a.k === "bin" && (n.a.op === "+" || n.a.op === "-") ? `\\left(${tex(n.a)}\\right)` : tex(n.a)}`;
      case "pow": {
        const base = isAtom(n.a) && n.a.k !== "fn" ? tex(n.a) : `\\left(${tex(n.a)}\\right)`;
        return `${base}^{${tex(n.b)}}`;
      }
      case "log": {
        const inner = n.a.k === "num" || n.a.k === "pi" || n.a.k === "e" ? tex(n.a) : `\\left(${tex(stripParen(n.a))}\\right)`;
        return `\\log_{${tex(stripParen(n.base))}} ${inner}`;
      }
      case "fn": {
        if (n.f === "sqrt") return `\\sqrt{${tex(stripParen(n.a))}}`;
        if (n.f === "exp") return `e^{${tex(stripParen(n.a))}}`;
        const inner = n.a.k === "num" || n.a.k === "pi" || n.a.k === "e" ? tex(n.a) : `\\left(${tex(stripParen(n.a))}\\right)`;
        return `\\ln ${inner}`;
      }
      case "bin": {
        if (n.op === "/") return `\\dfrac{${tex(stripParen(n.a))}}{${tex(stripParen(n.b))}}`;
        if (n.op === "+") return `${tex(n.a)}+${tex(n.b)}`;
        if (n.op === "-") return `${tex(n.a)}-${paren(n.b, true)}`;
        // 積
        const l = paren(n.a, false);
        const r = paren(n.b, false);
        const rStartsNum = /^[0-9.]/.test(r);
        return n.op === "*" || rStartsNum ? `${l}\\times ${r}` : `${l}${r}`;
      }
    }
    return "";
  }
  function stripParen(n) { return n.k === "paren" ? stripParen(n.a) : n; }
  // 和・差は括弧でくくる
  function paren(n, isSubRight) {
    if (n.k === "bin" && (n.op === "+" || n.op === "-")) return `\\left(${tex(n)}\\right)`;
    if (isSubRight) return tex(n);
    return tex(n);
  }

  function evaluate(input) {
    try {
      const s = normalize(String(input));
      if (!s) return { ok: false, error: "" };
      const tree = parse(tokenize(s));
      const value = evalTree(tree);
      if (!Number.isFinite(value)) return { ok: false, error: "値を計算できません" };
      return { ok: true, value, tex: tex(tree) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // 厳密一致(相対誤差 1e-9)と、近似値かどうかの判定
  function judge(input, expected) {
    const r = evaluate(input);
    if (!r.ok) return { status: "invalid", error: r.error };
    const tol = 1e-9 * Math.max(1, Math.abs(expected));
    const diff = Math.abs(r.value - expected);
    if (diff <= tol) return { status: "correct", tex: r.tex };
    if (diff <= 1e-3 * Math.max(1, Math.abs(expected))) return { status: "approx", tex: r.tex };
    return { status: "wrong", tex: r.tex };
  }

  const api = { evaluate, judge, normalize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ExprParse = api;
})(typeof window !== "undefined" ? window : globalThis);
