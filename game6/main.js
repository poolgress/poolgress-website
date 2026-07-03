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
  function condText(note) { return "過關條件：成功 " + note.pass + " / 共 " + note.total + " 次"; }
  function starsText(note) {
    return note.stars ? "星星：★ 成功 " + note.stars[0] + " 次　★★ 成功 " + note.stars[1] + " 次　★★★ 成功 " + note.stars[2] + " 次" : "此關無星星";
  }
  // 球型圖（編輯器「開始流程」嵌入的 image dataURL；選配欄位，無則隱藏）
  function setImage(id, level) {
    const img = document.getElementById(id);
    if (!img) return;
    const src = level && typeof level.image === "string" && level.image.indexOf("data:image/") === 0 ? level.image : "";
    img.hidden = !src;
    if (src) img.src = src;
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
    setImage("infoImage", en.level);
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
      onChange: (st) => { window.GameRender.update(st); window.GameAudio.onState(st); window.CvMock.setPlaced(st.allPlaced); },
      onFinish: (results) => setTimeout(() => showEnd(results), 600),
    });
    window.CvMock.onEvent((ev) => machine.handle(ev));
    window.GameAudio.unlock(); // 使用者手勢（開始遊戲/再玩一次按鈕）內解鎖音訊
    // 機器不發初始 emit：手動跑一次初始狀態（PLACING 提示大字＋「請擺球」音效）
    const st0 = machine.getState();
    window.GameRender.update(st0);
    window.GameAudio.onState(st0);
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
    document.getElementById("endName").textContent = note.name || current.name;
    // 大星星（成功次數對 stars 門檻；未過關不給星）
    const nStars = calcStars(note, score, passed);
    const starsEl = document.getElementById("endStarsBig");
    starsEl.innerHTML = note.stars
      ? [0, 1, 2].map((i) => '<span class="' + (i < nStars ? "on" : "off") + '">★</span>').join("")
      : "";
    setImage("endImage", current.level); // 球型圖（編輯器嵌入）
    const box = document.getElementById("endAttempts");
    window.GameRender.renderAttempts(box, results, note.total, 0, "done");
    // 逐桿表情列（流程網頁樣式：😀 成功／😢 失敗），點單顆顯示原因
    let reasonEl = document.getElementById("endReason");
    if (!reasonEl) { reasonEl = document.createElement("p"); reasonEl.id = "endReason"; box.after(reasonEl); }
    reasonEl.textContent = "";
    Array.from(box.children).forEach((c, i) => {
      if (results[i]) c.textContent = results[i].success ? "😀" : "😢";
      c.addEventListener("click", () => {
        const r = results[i];
        reasonEl.textContent = "第 " + (i + 1) + " 次：" + (r.success ? "成功" : "失敗——" + (window.GameRender.REASON_TEXT[r.reason] || r.reason));
      });
    });
    document.getElementById("endScore").textContent = "成功 " + score + " / 共 " + note.total + " 次";
    document.getElementById("endPass").textContent = passed ? "🎉 過關！" : "未過關（需成功 " + note.pass + " 次）";
    show("screenEnd");
  }

  // ── 事件接線 ──
  document.getElementById("infoBack").addEventListener("click", () => show("screenList"));
  document.getElementById("startBtn").addEventListener("click", startGame);
  // 返回鍵 → 放棄確認彈窗（流程圖側分支：放棄→回該關說明頁、繼續玩→回原狀態）
  document.getElementById("playBack").addEventListener("click", () => {
    document.getElementById("quitOverlay").hidden = false;
  });
  document.getElementById("quitStay").addEventListener("click", () => {
    document.getElementById("quitOverlay").hidden = true; // 繼續玩：狀態機不動
  });
  document.getElementById("quitYes").addEventListener("click", () => {
    document.getElementById("quitOverlay").hidden = true;
    machine = null; // 放棄＝丟棄本關進度（母規格 §4.4）
    openInfo(current); // 回該關說明頁
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
