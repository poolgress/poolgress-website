// 關卡狀態機（母規格 §4 七狀態；載入檢查在 levels.js、結算畫面在 main.js，這裡管 placing→done）。
// 計時器注入以便測試；無 DOM。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GameMachine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const PHASES = { PLACING: "placing", ARMING: "arming", READY: "ready", ROLLING: "rolling", RESULT: "result", CLEARING: "clearing", DONE: "done" };

  // level: 已驗證關卡；opts: { judge(events), armingMs, resultMs, setTimeout, clearTimeout, onChange(state), onFinish(results) }
  // 注意：state.notice 是一次性事件——消費端必須在每次 onChange 回呼中即時處理，
  // 不可用輪詢 getState() 的方式讀取（下一個事件會同步清空它）。
  function createMachine(level, opts) {
    const setT = opts.setTimeout, clearT = opts.clearTimeout;
    const cueCount = Math.max(1, (level.balls || []).filter((b) => b.id === "cue").length);
    const st = {
      phase: PHASES.PLACING,
      attempt: 1,                    // 1..total
      total: level.note.total,
      results: [],                   // [{ success, reason }]
      allPlaced: false,
      notice: null,                  // 一次性提示（搶打等）
      cueSlot: 1,                    // 母球換位：本次作用的 cueIndex＝((attempt-1) mod k)+1
    };
    let events = [];                 // 本次挑戰時間窗 W 的事件
    let timer = null;

    function snapshot() { return JSON.parse(JSON.stringify(st)); }
    function emit() { st.cueSlot = ((st.attempt - 1) % cueCount) + 1; opts.onChange(snapshot()); }
    function toPlacing() { st.phase = PHASES.PLACING; emit(); }
    function startArming() {
      st.phase = PHASES.ARMING; emit();
      clearT(timer);
      timer = setT(() => { if (st.phase === PHASES.ARMING && st.allPlaced) { st.phase = PHASES.READY; emit(); } }, opts.armingMs);
    }
    function finishAttempt() {
      st.results.push(opts.judge(events.slice()));
      events = [];
      st.phase = PHASES.RESULT; emit();
      clearT(timer);
      timer = setT(() => {
        if (st.phase !== PHASES.RESULT) return; // 守衛：只允許從 RESULT 相位推進（與 startArming 的回呼對稱）
        if (st.results.length >= st.total) { st.phase = PHASES.DONE; emit(); opts.onFinish(st.results.slice()); return; }
        st.attempt = st.results.length + 1;
        st.allPlaced = false;        // 收球重擺，一律回未就位
        st.phase = PHASES.CLEARING; emit();
      }, opts.resultMs);
    }

    function handle(ev) {
      st.notice = null;
      if (st.phase === PHASES.DONE) return;
      switch (ev.type) {
        case "placement":
          st.allPlaced = !!ev.allPlaced;
          if ((st.phase === PHASES.PLACING || st.phase === PHASES.CLEARING) && st.allPlaced) startArming();
          else if ((st.phase === PHASES.ARMING || st.phase === PHASES.READY) && !st.allPlaced) { clearT(timer); toPlacing(); } // 瞄準碰歪：退回、無成本（§4.2）
          else emit();
          break;
        case "strike":
          if (st.phase === PHASES.READY) { events = [ev]; st.phase = PHASES.ROLLING; emit(); }
          else if (st.phase === PHASES.ROLLING) { events.push({ type: "touch", seq: ev.seq }); finishAttempt(); } // 補打＝滾動中碰球（§A4）
          else { // 搶打：一律該次無效、不扣次數（§4.3）
            st.notice = "尚未進入可擊球狀態：此桿無效、不扣次數，請重新擺球";
            if (st.phase === PHASES.RESULT) { emit(); break; } // 結果顯示中：只提示，不得清掉 result→clearing 計時器
            st.allPlaced = false; clearT(timer);
            toPlacing();
          }
          break;
        case "pocket":
        case "lost":
          if (st.phase === PHASES.ROLLING) { events.push(ev); emit(); }
          break;
        case "touch":
        case "stopped":
          if (st.phase === PHASES.ROLLING) { events.push(ev); finishAttempt(); }
          break;
      }
    }

    emit();
    return { handle, getState: snapshot, PHASES };
  }

  return { createMachine, PHASES };
});
