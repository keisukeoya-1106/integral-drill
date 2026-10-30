(function () {
  const app = document.getElementById("app");
  const summary = document.getElementById("summary");
  const barFill = document.getElementById("bar-fill");
  const bottomNav = document.getElementById("bottom-nav");
  const KEY = "intdrill.v1";
  const MAX_LEVEL = 4;
  const WD = ["日", "月", "火", "水", "木", "金", "土"];

  // ---------- 日付 ----------
  const pad = n => String(n).padStart(2, "0");
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmt(d); };
  // ?date=YYYY-MM-DD で「今日」を差し替えられる(動作確認用)
  const qd = new URLSearchParams(location.search).get("date");
  const TODAY = qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : fmt(new Date());
  let viewDate = TODAY;

  // ---------- 進捗 { "YYYY-MM-DD": { "0": "done" | "peek" } } ----------
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) { /* 保存できなくても動作は続ける */ } }
  let progress = load();
  const stOf = (date, i) => (progress[date] || {})[i];
  function setSt(date, i, v) {
    progress[date] = progress[date] || {};
    if (progress[date][i] === "done" && v !== "done") return; // 正解済みは上書きしない
    progress[date][i] = v;
    save();
  }
  // ---------- 出題の固定 ----------
  // 日ごとの5題を、初めて表示したときにそのまま保存する。以後は保存内容を表示するので、
  // あとから出題コード(タイプの追加など)を変えても、過去の日の問題は変わらない。
  const SNAP_KEY = "intdrill.snap.v1";
  const SNAP_KEEP_DAYS = 400;
  function loadSnaps() { try { return JSON.parse(localStorage.getItem(SNAP_KEY)) || {}; } catch (e) { return {}; } }
  let snaps = loadSnaps();
  function saveSnaps() { try { localStorage.setItem(SNAP_KEY, JSON.stringify(snaps)); return true; } catch (e) { return false; } }
  function pruneSnaps() {
    const keys = Object.keys(snaps).sort(); // 日付の昇順
    const limit = addDays(TODAY, -SNAP_KEEP_DAYS);
    keys.filter(k => k < limit).forEach(k => delete snaps[k]);
    // 容量オーバーのときは古い日から消す(今日の分は残す)
    while (!saveSnaps()) {
      const old = Object.keys(snaps).sort().filter(k => k !== TODAY);
      if (!old.length) break;
      delete snaps[old[0]];
    }
  }
  function getSet(date) {
    if (snaps[date]) return snaps[date];
    const set = IntegralGen.dailySet(date).map(p => ({
      id: p.id, catLabel: p.catLabel, level: p.level, hint: p.hint, tex: p.tex, ans: p.ans, steps: p.steps
    }));
    if (date <= TODAY) { snaps[date] = set; pruneSnaps(); } // 未来の日は固定しない
    return set;
  }

  const doneCount = date => [0, 1, 2, 3, 4].filter(i => stOf(date, i) === "done").length;
  function streak() {
    let d = TODAY, n = 0;
    if (doneCount(d) < 5) d = addDays(d, -1); // 今日がまだ途中なら昨日から数える
    while (doneCount(d) === 5) { n++; d = addDays(d, -1); }
    return n;
  }

  // ---------- 描画ヘルパ ----------
  function typeset(el) {
    if (window.renderMathInElement) {
      renderMathInElement(el, {
        delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
        throwOnError: false
      });
    }
  }
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function dots(level) {
    let s = '<span class="dots" aria-label="難易度' + level + '">';
    for (let i = 1; i <= MAX_LEVEL; i++) s += `<i class="${i <= level ? "on" : ""}"></i>`;
    return s + "</span>";
  }
  function updateSummary() {
    const n = doneCount(viewDate);
    summary.innerHTML = `<b>${n}</b> / 5 問 正解`;
    barFill.style.width = n / 5 * 100 + "%";
  }
  const dateLabel = s => { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`; };

  // ---------- 一覧 ----------
  function showList() {
    updateSummary();
    bottomNav.hidden = true;
    app.replaceChildren();
    window.scrollTo(0, 0);
    const set = getSet(viewDate);
    const wrap = el("div", { class: "fade-in" });

    const nav = el("div", { class: "datenav" });
    const prev = el("button", { class: "iconbtn", "aria-label": "前の日" }, "‹");
    const next = el("button", { class: "iconbtn", "aria-label": "次の日" }, "›");
    next.disabled = viewDate >= TODAY;
    prev.addEventListener("click", () => { viewDate = addDays(viewDate, -1); showList(); });
    next.addEventListener("click", () => { viewDate = addDays(viewDate, 1); showList(); });
    const mid = el("div", { class: "date" }, `${dateLabel(viewDate)}<small>${viewDate === TODAY ? "TODAY" : "REVIEW"}</small>`);
    if (viewDate !== TODAY) {
      const t = el("button", { class: "today-btn" }, "今日へ戻る");
      t.addEventListener("click", () => { viewDate = TODAY; showList(); });
      mid.appendChild(t);
    }
    nav.append(prev, mid, next);
    wrap.appendChild(nav);

    const sk = streak();
    if (sk > 0) wrap.appendChild(el("div", { class: "streak" }, `<span>連続達成</span><b>${sk}</b><span>日</span>`));
    if (doneCount(viewDate) === 5) wrap.appendChild(el("div", { class: "all-clear" }, "この日の5題はすべて正解です。"));

    wrap.appendChild(el("div", { class: "section-label" }, "今日の5題"));
    const list = el("div", { class: "list" });
    set.forEach((p, i) => {
      const st = stOf(viewDate, i) || "todo";
      const mark = st === "done" ? "✓" : st === "peek" ? "👁" : "";
      const b = el("button", { class: "item", "data-st": st },
        `<span class="num">${i + 1}</span>
         <span style="min-width:0"><span class="item-integral">$${p.tex}$</span>
           <span class="item-meta">${dots(p.level)}</span></span>
         <span class="status" aria-hidden="true">${mark}</span>`);
      b.addEventListener("click", () => showProblem(i));
      list.appendChild(b);
    });
    wrap.appendChild(list);

    const foot = el("div", { class: "list-foot" });
    const reset = el("button", { class: "link" }, "記録をリセット");
    reset.addEventListener("click", () => {
      if (confirm("すべての日の記録を消しますか？")) { progress = {}; save(); showList(); }
    });
    foot.appendChild(reset);
    wrap.appendChild(foot);
    app.appendChild(wrap);
    typeset(list);
  }

  // ---------- 問題 ----------
  function showProblem(i) {
    const set = getSet(viewDate);
    const p = set[i];
    updateSummary();
    app.replaceChildren();
    window.scrollTo(0, 0);
    const wrap = el("div", { class: "fade-in" });

    const crumbs = el("div", { class: "crumbs" });
    const backBtn = el("button", { class: "back-btn", type: "button", "aria-label": "5題の一覧に戻る" }, "☰ 一覧へ戻る");
    backBtn.addEventListener("click", showList);
    crumbs.appendChild(backBtn);
    crumbs.appendChild(el("span", { class: "chip" }, dateLabel(viewDate)));
    crumbs.appendChild(el("span", { class: "chip plain" }, `難易度 ${dots(p.level)}`));
    wrap.appendChild(crumbs);

    const q = el("section", { class: "panel" });
    q.appendChild(el("div", { class: "q-no" }, `QUESTION ${i + 1}`));
    q.appendChild(el("p", { class: "q-body" }, "次の定積分を計算せよ。"));
    q.appendChild(el("div", { class: "integral" }, `$$${p.tex}$$`));
    const hintRow = el("div", { class: "hint-row" });
    const hintBtn = el("button", { class: "link" }, "ヒントを見る");
    const hintBox = el("div");
    hintBtn.addEventListener("click", () => {
      if (hintBox.firstChild) return;
      hintBox.appendChild(el("div", { class: "hint-box" }, `<b>${p.catLabel}</b>　${p.hint}`));
      typeset(hintBox);
      hintBtn.remove();
    });
    hintRow.appendChild(hintBtn);
    q.append(hintRow, hintBox);
    wrap.appendChild(q);

    const a = el("section", { class: "panel" });
    const labelRow = el("div", { class: "label-row" });
    labelRow.appendChild(el("label", { class: "field-label", for: "ans" }, "あなたの答え"));
    const helpLink = el("button", { type: "button", class: "help-link" }, "入力方法の説明はページ下部");
    helpLink.addEventListener("click", () => document.getElementById("input-help").scrollIntoView({ behavior: "smooth", block: "center" }));
    labelRow.appendChild(helpLink);
    a.appendChild(labelRow);
    const input = el("input", { type: "text", id: "ans", inputmode: "none", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "下のキーで入力" });
    const preview = el("div", { class: "preview" });
    // 関数電卓風キーパッド(5列)。type: 種別ごとに色を変える
    const KEYS = [
      ["π", "π", "fn"], ["e", "e", "fn"], ["√", "√(", "fn"], ["ln", "ln(", "fn"], ["logₐ", "log_(", "fn"], ["xⁿ", "^", "fn"],
      ["7", "7"], ["8", "8"], ["9", "9"], ["(", "(", "op"], [")", ")", "op"], ["⌫", "@del", "ctl"],
      ["4", "4"], ["5", "5"], ["6", "6"], ["×", "×", "op"], ["/", "/", "op"], ["◀", "@left", "ctl"],
      ["1", "1"], ["2", "2"], ["3", "3"], ["+", "+", "op"], ["−", "-", "op"], ["▶", "@right", "ctl"],
      ["0", "0", "span2"], [".", "."], ["すべて消す", "@clear", "ctl span3"]
    ];
    const kbd = el("div", { class: "kbd", role: "group", "aria-label": "入力キー" });
    KEYS.forEach(([label, ins, type]) => {
      const b = el("button", { type: "button", class: type || "" }, label);
      b.addEventListener("pointerdown", e => e.preventDefault()); // 入力欄のカーソル位置を保つ
      b.addEventListener("click", () => {
        if (ins === "@left") moveCursor(-1);
        else if (ins === "@right") moveCursor(1);
        else if (ins === "@del") backspace();
        else if (ins === "@clear") { input.value = ""; input.dispatchEvent(new Event("input")); }
        else insertText(ins);
      });
      kbd.appendChild(b);
    });
    const del = el("div", { class: "kbd-tools" });
    const sysBtn = el("button", { type: "button", class: "link" }, "⌨ 通常のキーボードで入力");
    sysBtn.addEventListener("click", () => {
      const sys = input.getAttribute("inputmode") === "none";
      input.setAttribute("inputmode", sys ? "text" : "none");
      sysBtn.textContent = sys ? "⌨ 電卓キーパッドに戻す" : "⌨ 通常のキーボードで入力";
      input.blur(); input.focus();
    });
    del.append(sysBtn);
    const judge = el("button", { class: "btn block", style: "margin-top:12px" }, "答え合わせ");
    const peek = el("button", { class: "link peek-btn", style: "display:block;margin:6px auto 0" }, "答えを見る");
    const result = el("div");
    a.append(input, preview, kbd, del, judge, peek, result,
      el("p", { class: "tip", id: "input-help" }, "分数は /(例: 1/2)、ルートは √( )、累乗は xⁿ(例: e^2)。ln は自然対数、logₐ は底つき(例: log_(2)(3) は log₂3)。入力した式は上に数式で表示されます。"));
    wrap.appendChild(a);

    const explain = el("div");
    wrap.appendChild(explain);
    app.appendChild(wrap);

    function insertText(s) {
      const st = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, st) + s + input.value.slice(en);
      const pos = st + s.length;
      input.setSelectionRange(pos, pos);
      input.dispatchEvent(new Event("input"));
    }
    function moveCursor(d) {
      const pos = Math.max(0, Math.min(input.value.length, (input.selectionStart ?? input.value.length) + d));
      input.setSelectionRange(pos, pos);
    }
    function backspace() {
      const st = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? input.value.length;
      if (st !== en) { input.value = input.value.slice(0, st) + input.value.slice(en); input.setSelectionRange(st, st); }
      else if (st > 0) { input.value = input.value.slice(0, st - 1) + input.value.slice(st); input.setSelectionRange(st - 1, st - 1); }
      input.dispatchEvent(new Event("input"));
    }

    function renderPreview() {
      if (!input.value.trim()) { preview.innerHTML = ""; return; }
      const r = ExprParse.evaluate(input.value);
      if (!r.ok) { preview.innerHTML = `<span class="lab">${r.error || "入力中…"}</span>`; return; }
      preview.innerHTML = `<span class="lab">入力</span><span>$${r.tex}$</span>`;
      typeset(preview);
    }
    input.addEventListener("input", () => { result.replaceChildren(); input.classList.remove("ok"); renderPreview(); });

    function showExplain() {
      if (explain.firstChild) return;
      const box = el("section", { class: "panel explain" }, `<h3>解説　<span style="letter-spacing:0;font-weight:500;color:var(--muted)">${p.catLabel}</span></h3>${p.steps}`);
      explain.appendChild(box);
      typeset(box);
      setTimeout(() => box.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    }
    function setResult(cls, icon, html) {
      result.replaceChildren();
      const r = el("div", { class: "result " + cls }, `<span class="ico">${icon}</span><span>${html}</span>`);
      result.appendChild(r);
      typeset(r);
    }
    function mark(status) { setSt(viewDate, i, status); updateSummary(); }

    function check() {
      if (!input.value.trim()) { input.focus(); return; }
      const j = ExprParse.judge(input.value, p.ans.val);
      if (j.status === "invalid") setResult("ng", "!", j.error || "式を読み取れませんでした");
      else if (j.status === "correct") {
        input.classList.add("ok");
        setResult("ok", "✓", "正解です");
        mark("done");
        showExplain();
      } else if (j.status === "approx") setResult("ng", "≒", "近い値です。小数ではなく、π や ln を使った正確な形で答えてください");
      else setResult("ng", "✕", "惜しい、もう一度考えてみましょう");
    }
    judge.addEventListener("click", check);
    input.addEventListener("keydown", e => { if (e.key === "Enter") check(); });
    peek.addEventListener("click", () => {
      setResult("peek", "👁", `答え　$${p.ans.tex}$`);
      mark("peek");
      showExplain();
    });

    // 下部ナビ
    bottomNav.hidden = false;
    bottomNav.replaceChildren();
    const inner = el("div", { class: "bottom-inner" });
    const bp = el("button", { class: "btn ghost" }, "← 前へ");
    const pager = el("button", { class: "list-btn", type: "button", "aria-label": "5題の一覧に戻る" }, `<span>☰ 一覧へ</span><small>${i + 1} / 5</small>`);
    const bn = el("button", { class: "btn next" }, "次へ →");
    bp.disabled = i === 0;
    bn.disabled = i === 4;
    bp.addEventListener("click", () => showProblem(i - 1));
    bn.addEventListener("click", () => showProblem(i + 1));
    pager.addEventListener("click", showList);
    inner.append(bp, pager, bn);
    bottomNav.appendChild(inner);

    typeset(q);
  }

  // 画面上部のタイトルを押すと、今日の一覧(最初のページ)に戻る
  const titleEl = document.querySelector(".site-header h1");
  if (titleEl) {
    titleEl.setAttribute("role", "button");
    titleEl.setAttribute("tabindex", "0");
    titleEl.setAttribute("aria-label", "今日の一覧に戻る");
    const goHome = () => { viewDate = TODAY; showList(); };
    titleEl.addEventListener("click", goHome);
    titleEl.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goHome(); } });
  }

  // KaTeXは defer 読み込みのため、全スクリプトが揃う load 後に描画する
  window.addEventListener("load", showList);
})();
