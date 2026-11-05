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
  // 保存済みの問題にも、表示の誤り(\cosx など)の修正と、自然対数の log 表記を当てる(何度当てても同じ結果)
  function migrateSet(set) {
    if (!Array.isArray(set)) return set;
    const fx = IntegralGen.polish;
    return set.map(p => ({ ...p, tex: fx(p.tex), hint: fx(p.hint), steps: fx(p.steps), ans: { tex: fx(p.ans.tex), val: p.ans.val } }));
  }
  function loadSnaps() {
    try {
      const s = JSON.parse(localStorage.getItem(SNAP_KEY)) || {};
      Object.keys(s).forEach(k => { s[k] = migrateSet(s[k]); });
      return s;
    } catch (e) { return {}; }
  }
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

  // ---------- 復習リスト ----------
  // 間違えた問題(答えを見た場合も含む)を問題データごと保存する。同じ問題は1件にまとめ、
  // 正解が2回連続したらリストから外す。間違えると連続回数は0に戻る。
  // { 問題のtex: { tex, hint, steps, ans, catLabel, level, from, streak, at } }
  const REVIEW_KEY = "intdrill.review.v1";
  const REVIEW_NEED = 2;     // この回数だけ連続で正解したら外す
  const REVIEW_MAX = 500;    // 容量の目安。超えたら間違えた日が古いものから消す
  function loadReview() {
    try {
      const r = JSON.parse(localStorage.getItem(REVIEW_KEY)) || {};
      const fx = IntegralGen.polish; // 表示の修正は保存済みの問題にも当てる
      Object.keys(r).forEach(k => {
        const v = r[k];
        r[k] = { ...v, tex: fx(v.tex), hint: fx(v.hint), steps: fx(v.steps), ans: { tex: fx(v.ans.tex), val: v.ans.val } };
      });
      return r;
    } catch (e) { return {}; }
  }
  let review = loadReview();
  function saveReview() { try { localStorage.setItem(REVIEW_KEY, JSON.stringify(review)); } catch (e) { /* 保存できなくても動作は続ける */ } }
  const reviewList = () => Object.keys(review).map(k => ({ k, ...review[k] })).sort((a, b) => b.at - a.at);
  // 間違えた問題を登録する。新しく加わったときだけ true
  function reviewAdd(p, date) {
    const isNew = !review[p.tex];
    review[p.tex] = {
      tex: p.tex, hint: p.hint, steps: p.steps, ans: p.ans, catLabel: p.catLabel, level: p.level,
      from: date, streak: 0, at: Date.now()
    };
    const keys = Object.keys(review);
    if (keys.length > REVIEW_MAX) {
      keys.sort((a, b) => review[a].at - review[b].at).slice(0, keys.length - REVIEW_MAX).forEach(k => delete review[k]);
    }
    saveReview();
    return isNew;
  }
  // 正解を記録する。リストから外れたとき "removed"、連続回数が増えたとき "up"、対象外は null
  function reviewCorrect(p) {
    const r = review[p.tex];
    if (!r) return null;
    r.streak++;
    if (r.streak >= REVIEW_NEED) { delete review[p.tex]; saveReview(); return "removed"; }
    saveReview();
    return "up";
  }
  function reviewRemove(tex) { delete review[tex]; saveReview(); }

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
  let mode = "daily"; // "daily" = 今日の5題、"review" = 復習リスト
  function tabs() {
    const t = el("div", { class: "tabs", role: "tablist" });
    const a = el("button", { class: "tab", role: "tab", "aria-selected": String(mode === "daily") }, "今日の5題");
    const n = Object.keys(review).length;
    const b = el("button", { class: "tab", role: "tab", "aria-selected": String(mode === "review") }, `復習リスト${n ? `<span class="tab-n">${n}</span>` : ""}`);
    a.addEventListener("click", () => { if (mode !== "daily") { viewDate = TODAY; showList(); } });
    b.addEventListener("click", () => { if (mode !== "review") showReview(); });
    t.append(a, b);
    return t;
  }
  function updateSummary() {
    if (mode === "review") {
      summary.innerHTML = `復習 <b>${Object.keys(review).length}</b> 問`;
      barFill.style.width = "0%";
      return;
    }
    const n = doneCount(viewDate);
    summary.innerHTML = `<b>${n}</b> / 5 問 正解`;
    barFill.style.width = n / 5 * 100 + "%";
  }
  const dateLabel = s => { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`; };

  // ---------- 一覧 ----------
  function showList() {
    mode = "daily";
    updateSummary();
    bottomNav.hidden = true;
    app.replaceChildren();
    window.scrollTo(0, 0);
    const set = getSet(viewDate);
    const wrap = el("div", { class: "fade-in" });
    wrap.appendChild(tabs());

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
      const mark = st === "done" ? "✓" : st === "wrong" ? "✕" : st === "peek" ? "👁" : "";
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
    renderProblem(set[i], {
      chip: dateLabel(viewDate), back: showList, backAria: "5題の一覧に戻る",
      pos: i + 1, total: set.length, go: d => showProblem(i + d),
      // 正解済みの問題を間違えても、復習には足さない(解き直しの確認だったと見なす)
      isWrongNew: () => stOf(viewDate, i) !== "done",
      mark: status => { setSt(viewDate, i, status); updateSummary(); },
      date: viewDate
    });
  }

  function renderProblem(p, ctx) {
    const i = ctx.pos - 1;
    updateSummary();
    app.replaceChildren();
    window.scrollTo(0, 0);
    const wrap = el("div", { class: "fade-in" });

    const crumbs = el("div", { class: "crumbs" });
    const backBtn = el("button", { class: "back-btn", type: "button", "aria-label": ctx.backAria }, "☰ 一覧へ戻る");
    backBtn.addEventListener("click", ctx.back);
    crumbs.appendChild(backBtn);
    crumbs.appendChild(el("span", { class: "chip" }, ctx.chip));
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
    a.appendChild(el("div", { class: "field-label" }, "ノートに解いてから、答えを見ましょう"));
    const reveal = el("button", { type: "button", class: "btn block" }, "答えを見る");
    const slot = el("div");
    const result = el("div");
    a.append(reveal, slot, result);
    wrap.appendChild(a);

    const explain = el("div");
    wrap.appendChild(explain);
    app.appendChild(wrap);

    function showExplain() {
      if (explain.firstChild) return;
      const box = el("section", { class: "panel explain" }, `<h3>解説　<span style="letter-spacing:0;font-weight:500;color:var(--muted)">${p.catLabel}</span></h3>${p.steps}`);
      explain.appendChild(box);
      typeset(box);
    }
    function setResult(cls, icon, html) {
      result.replaceChildren();
      const r = el("div", { class: "result " + cls }, `<span class="ico">${icon}</span><span>${html}</span>`);
      result.appendChild(r);
      typeset(r);
    }
    const mark = ctx.mark;
    // 間違い(近似の答えを含む)は復習リストへ。登録の旨は結果の下に小さく添える
    let solved = false; // この画面で正解したあとは、連続回数の加算も復習への追加もしない
    function noteWrong() {
      if (solved || !ctx.isWrongNew()) return;
      const had = !!review[p.tex];
      reviewAdd(p, ctx.date);
      if (!had) result.appendChild(el("div", { class: "rv-note" }, "復習リストに追加しました"));
    }

    // 答えを見る → 自分で〇/×を付ける。×は復習リストに入る
    let judged = false;
    reveal.addEventListener("click", () => {
      reveal.remove();
      slot.appendChild(el("div", { class: "self-ans" }, `<span class="lab">答え</span><div class="self-fm">$${p.ans.tex}$</div>`));
      slot.appendChild(el("div", { class: "self-q" }, "あなたの答えは合っていましたか？"));
      const row = el("div", { class: "self-judge" });
      const o = el("button", { type: "button", class: "sj o" }, "〇　合っていた");
      const x = el("button", { type: "button", class: "sj x" }, "×　間違えた");
      const fin = ok => {
        if (judged) return;
        judged = true;
        o.disabled = x.disabled = true;
        (ok ? o : x).classList.add("picked");
        if (ok) {
          const rv = solved ? null : reviewCorrect(p);
          solved = true;
          setResult("ok", "✓", "〇　正解として記録しました");
          if (rv === "removed") result.appendChild(el("div", { class: "rv-note ok" }, `${REVIEW_NEED}回連続で正解したので、復習リストから外しました`));
          else if (rv === "up") result.appendChild(el("div", { class: "rv-note ok" }, `復習リスト: 連続正解 ${review[p.tex].streak} / ${REVIEW_NEED}`));
          mark("done");
        } else {
          setResult("ng", "✕", "×　不正解として記録しました");
          noteWrong();
          mark("wrong");
        }
        showExplain();
      };
      o.addEventListener("click", () => fin(true));
      x.addEventListener("click", () => fin(false));
      row.append(o, x);
      slot.appendChild(row);
      typeset(slot);
      setTimeout(() => row.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    });

    // 下部ナビ
    bottomNav.hidden = false;
    bottomNav.replaceChildren();
    const inner = el("div", { class: "bottom-inner" });
    const bp = el("button", { class: "btn ghost" }, "← 前へ");
    const pager = el("button", { class: "list-btn", type: "button", "aria-label": ctx.backAria }, `<span>☰ 一覧へ</span><small>${ctx.pos} / ${ctx.total}</small>`);
    const bn = el("button", { class: "btn next" }, "次へ →");
    bp.disabled = ctx.pos === 1;
    bn.disabled = ctx.pos === ctx.total;
    bp.addEventListener("click", () => ctx.go(-1));
    bn.addEventListener("click", () => ctx.go(1));
    pager.addEventListener("click", ctx.back);
    inner.append(bp, pager, bn);
    bottomNav.appendChild(inner);

    typeset(q);
  }

  // ---------- 復習リスト画面 ----------
  let reviewFilter = "all"; // "all" または分野名(catLabel)
  function showReview() {
    mode = "review";
    updateSummary();
    bottomNav.hidden = true;
    app.replaceChildren();
    window.scrollTo(0, 0);
    const wrap = el("div", { class: "fade-in" });
    wrap.appendChild(tabs());

    const all = reviewList();
    const cats = IntegralGen.CATS.map(c => c.label);
    if (reviewFilter !== "all" && !all.some(r => r.catLabel === reviewFilter)) reviewFilter = "all"; // 絞り込み先が空になったら全てへ
    if (all.length) {
      const chips = el("div", { class: "filters", role: "group", "aria-label": "分野で絞り込む" });
      [["all", "すべて", all.length]].concat(cats.map(c => [c, c, all.filter(r => r.catLabel === c).length])).forEach(([key, label, n]) => {
        if (key !== "all" && n === 0) return; // 該当のない分野は出さない
        const b = el("button", { class: "filter", "aria-pressed": String(reviewFilter === key) }, `${label}<span>${n}</span>`);
        b.addEventListener("click", () => { reviewFilter = key; showReview(); });
        chips.appendChild(b);
      });
      wrap.appendChild(chips);
    }

    const rows = reviewFilter === "all" ? all : all.filter(r => r.catLabel === reviewFilter);
    wrap.appendChild(el("div", { class: "section-label" }, "間違えた問題　" + `${REVIEW_NEED}回連続で正解すると外れます`));
    if (!rows.length) {
      wrap.appendChild(el("div", { class: "empty" }, all.length ? "この分野の問題はありません。" : "復習する問題はありません。間違えた問題は自動でここにたまります。"));
    }
    const list = el("div", { class: "list" });
    rows.forEach((r, idx) => {
      const row = el("div", { class: "rv-row" });
      let pips = "";
      for (let n = 0; n < REVIEW_NEED; n++) pips += `<i class="${n < r.streak ? "on" : ""}"></i>`;
      const b = el("button", { class: "item", "data-st": r.streak > 0 ? "done" : "todo" },
        `<span class="num">${idx + 1}</span>
         <span style="min-width:0"><span class="item-integral">$${r.tex}$</span>
           <span class="item-meta">${dots(r.level)}<span>${r.catLabel}</span><span>${dateLabel(r.from)}</span></span></span>
         <span class="pips" aria-label="連続正解 ${r.streak} / ${REVIEW_NEED}">${pips}</span>`);
      b.addEventListener("click", () => showReviewProblem(rows, idx));
      const del = el("button", { class: "rv-del", type: "button", "aria-label": "復習リストから外す" }, "×");
      del.addEventListener("click", () => {
        if (confirm("この問題を復習リストから外しますか？")) { reviewRemove(r.tex); showReview(); }
      });
      row.append(b, del);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    app.appendChild(wrap);
    typeset(list);
  }

  function showReviewProblem(rows, idx) {
    const r = rows[idx];
    renderProblem(r, {
      chip: `復習　${dateLabel(r.from)}の問題`, back: showReview, backAria: "復習リストに戻る",
      pos: idx + 1, total: rows.length, go: d => showReviewProblem(rows, idx + d),
      isWrongNew: () => true,
      mark: () => updateSummary(), // 日ごとの記録(正解/答えを見た)は動かさず、件数表示だけ更新する
      date: r.from
    });
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
