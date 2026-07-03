// 畫面切換與接線：levels → info → machine/judge/render/cv-mock → 結算。
(function () {
  "use strict";
  const CFG = window.GAME_CONFIG;
  let current = null; // { name, level }
  let machine = null;

  function show(id) {
    ["screenList", "screenInfo", "screenPlay", "screenEnd"].forEach((s) => {
      document.getElementById(s).hidden = s !== id;
    });
  }
  function condText(note) { return "過關條件：" + note.pass + " / " + note.total + " 分（成功一次＝1 分）"; }
  function starsText(note) {
    return note.stars ? "星星：★ " + note.stars[0] + " 分　★★ " + note.stars[1] + " 分　★★★ " + note.stars[2] + " 分" : "此關無星星";
  }

  // ── 關卡列表 ──
  async function renderList() {
    const box = document.getElementById("levelList");
    box.innerHTML = "";
    const entries = await window.GameLevels.loadAll();
    if (!entries.length) { box.textContent = "沒有關卡：請在下方匯入編輯器輸出的 JSON。"; return; }
    entries.forEach((en) => {
      const card = document.createElement("button");
      card.className = "level-card" + (en.errors.length ? " bad" : "");
      const name = en.level && en.level.note && en.level.note.name ? en.level.note.name : en.name;
      const tag = en.errors.length ? '<span class="tag err">資料錯誤</span>' : '<span class="tag">' + en.level.note.opt + "</span>";
      card.innerHTML = "<b>" + name + "</b>" + tag;
      if (en.errors.length) card.title = en.errors.join("\n");
      else card.addEventListener("click", () => openInfo({ name, level: en.level }));
      box.appendChild(card);
    });
  }

  // ── 關卡說明 ──
  function openInfo(en) {
    current = en;
    document.getElementById("infoName").textContent = en.level.note.name || en.name;
    document.getElementById("infoDesc").textContent = en.level.note.desc || "";
    document.getElementById("infoCond").textContent = condText(en.level.note);
    document.getElementById("infoStars").textContent = starsText(en.level.note);
    show("screenInfo");
  }

  // ── 關卡進行 ──
  function startGame() {
    show("screenPlay");
    const lv = current.level;
    document.getElementById("playTitle").textContent = lv.note.name || current.name;
    window.GameRender.init(lv);
    window.CvMock.buildPanel(document.getElementById("cvPanel"), lv);
    machine = window.GameMachine.createMachine(lv, {
      judge: (evs) => window.GameJudge.judgeAttempt(lv, evs),
      armingMs: CFG.ARMING_MS,
      resultMs: CFG.RESULT_MS,
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      onChange: (st) => { window.GameRender.update(st); window.CvMock.setPlaced(st.allPlaced); },
      onFinish: (results) => setTimeout(() => showEnd(results), 600),
    });
    window.CvMock.onEvent((ev) => machine.handle(ev));
  }

  // ── 結算 ──
  function calcStars(note, score, passed) {
    if (!passed || !note.stars) return 0; // 未過關一律不給星（母規格 §3.3）
    return note.stars.filter((th) => score >= th).length;
  }
  function showEnd(results) {
    const note = current.level.note;
    const score = results.filter((r) => r.success).length;
    const passed = score >= note.pass;
    const box = document.getElementById("endAttempts");
    window.GameRender.renderAttempts(box, results, note.total, 0, "done");
    // 點單圈顯示原因
    let reasonEl = document.getElementById("endReason");
    if (!reasonEl) { reasonEl = document.createElement("p"); reasonEl.id = "endReason"; box.after(reasonEl); }
    reasonEl.textContent = "";
    Array.from(box.children).forEach((c, i) => {
      c.addEventListener("click", () => {
        const r = results[i];
        reasonEl.textContent = "第 " + (i + 1) + " 次：" + (r.success ? "成功" : "失敗——" + (window.GameRender.REASON_TEXT[r.reason] || r.reason));
      });
    });
    document.getElementById("endScore").textContent = "得分：" + score + " / " + note.total;
    document.getElementById("endPass").textContent = passed ? "🎉 過關！" : "未過關（需 " + note.pass + " 分）";
    document.getElementById("endStars").textContent = note.stars ? "星星：" + "★".repeat(calcStars(note, score, passed)).padEnd(3, "☆") : "";
    show("screenEnd");
  }

  // ── 事件接線 ──
  document.getElementById("infoBack").addEventListener("click", () => show("screenList"));
  document.getElementById("startBtn").addEventListener("click", startGame);
  document.getElementById("playBack").addEventListener("click", () => {
    if (confirm("離開將放棄本關進度，確定？")) { machine = null; show("screenList"); } // 母規格 §4.4：退出＝放棄
  });
  document.getElementById("playHelp").addEventListener("click", () => {
    const lv = current.level;
    document.getElementById("helpName").textContent = lv.note.name || "";
    document.getElementById("helpDesc").textContent = lv.note.desc || "";
    document.getElementById("helpCond").textContent = condText(lv.note) + "　" + starsText(lv.note);
    document.getElementById("helpOverlay").hidden = false;
  });
  document.getElementById("helpClose").addEventListener("click", () => (document.getElementById("helpOverlay").hidden = true));
  document.getElementById("replayBtn").addEventListener("click", startGame); // 全新開始（machine 重建）
  document.getElementById("endBack").addEventListener("click", () => show("screenList"));
  document.getElementById("importBtn").addEventListener("click", () => {
    const ta = document.getElementById("importText");
    const res = window.GameLevels.importJson(ta.value);
    document.getElementById("importMsg").textContent = res.ok ? "匯入成功" : "匯入失敗：" + res.errors.join("；");
    if (res.ok) { ta.value = ""; renderList(); }
  });

  renderList();
})();
