// 手動操作面板（取代 MockCVSource）：三步驟——擺球／擊球／判斷。
// 介面與 CV 來源相同：onEvent(fn) 收 { type, seq, ... }；判定結果由「成功/失敗」按鈕手動宣告。
// 正式版接攝影機時，由 RealCVSource 取代本模組（狀態機介面不變）。
window.CvManual = (function () {
  "use strict";
  let seq = 0, listener = null;
  let hasCue = true;
  let marks = { object: false, cue: false }; // 就位標記（子球/母球）
  let manualResult = null;                    // 「成功/失敗」按鈕設定，judgeResult 消費
  let btns = {};                              // { object, cue, strike, ok, fail }
  let lastPhase = null;

  function fire(type, data) { if (listener) listener(Object.assign({ type, seq: ++seq }, data || {})); }
  function allMarked() { return marks.object && (!hasCue || marks.cue); }

  function el(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

  function markBtnUI(kind) {
    const b = btns[kind];
    if (b) { b.classList.toggle("done", marks[kind]); b.textContent = (kind === "object" ? "子球就位" : "母球就位") + (marks[kind] ? " ✓" : ""); }
  }
  function resetMarks() {
    marks.object = false; marks.cue = false;
    markBtnUI("object"); markBtnUI("cue");
    if (window.GameRender.resetPlacedMarks) window.GameRender.resetPlacedMarks();
  }

  // 依關卡建三步驟面板（純子球關卡不出母球鈕）
  function buildPanel(container, level) {
    container.innerHTML = "";
    hasCue = level.note.opt !== "object_only";
    marks = { object: false, cue: false };
    manualResult = null;
    lastPhase = null;
    btns = {};

    const row = (label) => { const r = el("div", "step-row"); r.appendChild(el("span", "step-label", label)); container.appendChild(r); return r; };

    // 第一步驟擺球：子球就位／母球就位 → 圈圈變綠框＋勾
    const r1 = row("第一步驟擺球：");
    const mkPlace = (kind, label) => {
      const b = el("button", "step-btn", label);
      b.addEventListener("click", () => {
        if (b.disabled) return;
        marks[kind] = !marks[kind];
        markBtnUI(kind);
        window.GameRender.setPlacedMark(kind, marks[kind]);
        fire("placement", { allPlaced: allMarked() }); // 全就位→進入就位確認；取消→退回擺球
      });
      btns[kind] = b; r1.appendChild(b);
    };
    mkPlace("object", "子球就位");
    if (hasCue) mkPlace("cue", "母球就位");

    // 第二步驟擊球
    const r2 = row("第二步驟擊球：");
    btns.strike = el("button", "step-btn strike", "擊球");
    btns.strike.addEventListener("click", () => { if (!btns.strike.disabled) fire("strike"); });
    r2.appendChild(btns.strike);

    // 第三步驟判斷：成功／失敗（手動宣告，經 stopped 事件觸發判定）
    const r3 = row("第三步驟判斷：");
    btns.ok = el("button", "step-btn ok", "成功");
    btns.fail = el("button", "step-btn fail", "失敗");
    btns.ok.addEventListener("click", () => { if (btns.ok.disabled) return; manualResult = { success: true, reason: null }; fire("stopped", {}); });
    btns.fail.addEventListener("click", () => { if (btns.fail.disabled) return; manualResult = { success: false, reason: "manual_fail" }; fire("stopped", {}); });
    r3.appendChild(btns.ok); r3.appendChild(btns.fail);

    setEnabled("placing");
  }

  // 判定回呼（main.js 傳給狀態機的 judge）：回傳手動宣告的結果
  function judgeResult() {
    const r = manualResult || { success: false, reason: "manual_fail" };
    manualResult = null;
    return r;
  }

  // 依狀態機相位啟用/停用各步驟
  function setEnabled(ph) {
    const placingLike = ph === "placing" || ph === "clearing" || ph === "arming" || ph === "ready";
    ["object", "cue"].forEach((k) => { if (btns[k]) btns[k].disabled = !placingLike; });
    if (btns.strike) btns.strike.disabled = ph !== "ready";
    const judging = ph === "rolling";
    if (btns.ok) btns.ok.disabled = !judging;
    if (btns.fail) btns.fail.disabled = !judging;
  }

  // 狀態機 onChange：相位轉換時重置/啟停
  function sync(state) {
    const ph = state.phase;
    // 進入下一輪擺球（result→clearing）或被退回擺球且機器記錄未就位 → 重置就位標記
    const enteredClearing = ph === "clearing" && lastPhase !== "clearing";
    const retreated = ph === "placing" && lastPhase && lastPhase !== "placing" && !state.allPlaced && allMarked();
    if (enteredClearing || retreated) resetMarks();
    lastPhase = ph;
    setEnabled(ph);
  }

  function onEvent(fn) { listener = fn; }

  return { onEvent, buildPanel, sync, judgeResult, fire };
})();
