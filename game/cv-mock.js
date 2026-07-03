// MockCVSource：按鈕面板，發出與真辨識相同介面的事件（原型 spec §3）。
// 正式版由 RealCVSource（WebSocket 接主機）取代——介面：onEvent(fn) 收 { type, seq, ...payload }。
window.CvMock = (function () {
  "use strict";
  const POCKET_NAMES = ["左上", "右上", "左下", "右下", "上中", "下中"];
  let seq = 0, listener = null, placed = false, placedBtn = null;

  function fire(type, data) { if (listener) listener(Object.assign({ type, seq: ++seq }, data || {})); }
  function el(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

  // 依關卡內容建面板：純子球隱藏母球控制；只有區塊要求時才顯示區塊勾選
  function buildPanel(container, level) {
    container.innerHTML = "";
    placed = false;
    const hasCue = level.note.opt !== "object_only";
    const reqs = level.note.reqs || {};

    const head = el("div", "cv-head", "模擬辨識（正式版由攝影機取代）");
    const collapse = el("button", "cv-collapse", "收合");
    head.appendChild(collapse);
    container.appendChild(head);
    const body = el("div", "cv-body");
    container.appendChild(body);
    collapse.addEventListener("click", () => { body.hidden = !body.hidden; collapse.textContent = body.hidden ? "展開" : "收合"; });

    // 就位切換 + 擊球
    placedBtn = el("button", "cv-btn", "球全部就位");
    placedBtn.addEventListener("click", () => { setPlaced(!placed); fire("placement", { allPlaced: placed }); });
    body.appendChild(placedBtn);
    const strikeBtn = el("button", "cv-btn cv-strike", "擊球");
    strikeBtn.addEventListener("click", () => fire("strike"));
    body.appendChild(strikeBtn);

    // 進袋（附袋口選單，索引 0~5 凍結）
    function pocketRow(label, ball) {
      const row = el("div", "cv-row");
      const btn = el("button", "cv-btn", label);
      const sel = document.createElement("select");
      POCKET_NAMES.forEach((n, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = n; sel.appendChild(o); });
      btn.addEventListener("click", () => fire("pocket", { ball, pocketIndex: Number(sel.value) }));
      row.appendChild(btn); row.appendChild(sel);
      return row;
    }
    body.appendChild(pocketRow("子球進袋→", "object"));
    if (hasCue) body.appendChild(pocketRow("母球進袋→", "cue"));

    // 全停（有區塊要求才顯示對應勾選）
    const stopRow = el("div", "cv-row");
    const stopBtn = el("button", "cv-btn", "全部停止");
    stopRow.appendChild(stopBtn);
    const zoneChecks = {};
    function zoneCheck(key, label) {
      const lab = el("label", "cv-check");
      const cb = document.createElement("input"); cb.type = "checkbox";
      lab.appendChild(cb); lab.appendChild(document.createTextNode(label));
      zoneChecks[key] = cb;
      stopRow.appendChild(lab);
    }
    if (reqs.ball === "stay_in_target_zone") zoneCheck("ball", "子球停在目標區塊內");
    if (hasCue && reqs.cue === "stay_in_target_zone") zoneCheck("cue", "母球停在目標區塊內");
    stopBtn.addEventListener("click", () => {
      const zr = {};
      if (zoneChecks.ball) zr.ball = zoneChecks.ball.checked;
      if (zoneChecks.cue) zr.cue = zoneChecks.cue.checked;
      fire("stopped", { zoneResults: zr });
    });
    body.appendChild(stopRow);

    // 犯規／離桌
    const foulRow = el("div", "cv-row");
    const touchBtn = el("button", "cv-btn", "碰球犯規");
    touchBtn.addEventListener("click", () => fire("touch"));
    foulRow.appendChild(touchBtn);
    const lostBall = el("button", "cv-btn", "子球離桌");
    lostBall.addEventListener("click", () => fire("lost", { ball: "object" }));
    foulRow.appendChild(lostBall);
    if (hasCue) {
      const lostCue = el("button", "cv-btn", "母球離桌");
      lostCue.addEventListener("click", () => fire("lost", { ball: "cue" }));
      foulRow.appendChild(lostCue);
    }
    body.appendChild(foulRow);
  }

  // 與狀態機同步就位鈕外觀（例如整理模式自動重設為未就位）
  function setPlaced(v) {
    placed = !!v;
    if (placedBtn) {
      placedBtn.textContent = placed ? "有球離位" : "球全部就位";
      placedBtn.classList.toggle("active", placed);
    }
  }
  function onEvent(fn) { listener = fn; }

  return { onEvent, buildPanel, setPlaced, fire };
})();
