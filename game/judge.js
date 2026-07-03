// 判定引擎：一次挑戰的事件流（時間窗 W）→ { success, reason }。
// 按鈕粒度實作母規格 §5.2 三種要求代碼；無 DOM，node 可測。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GameJudge = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // level: 已驗證關卡；events: W 內事件（含起始 strike、結尾 stopped 或 touch）。
  // 注意：judgeAttempt 不驗證 events 形狀合法性——合法性由唯一呼叫端 machine.js 的封閉流程保證。
  function judgeAttempt(level, events) {
    if (events.some((e) => e.type === "touch")) return { success: false, reason: "touch_foul" };
    const stopped = events.filter((e) => e.type === "stopped").pop() || { zoneResults: {} };
    const targets = (side) => (level.pockets || []).map((v, i) => (v === side ? i : -1)).filter((i) => i >= 0);

    // 兩套球別命名刻意不同源：role＝CVSource 事件的 e.ball 欄位值（"object"/"cue"，辨識端用語）；
    // side＝關卡資料 pockets/zones 的歸屬標記與 zoneResults 的鍵（"ball"/"cue"，編輯器沿用「子球=ball」舊詞彙）。
    // 呼叫時的對應固定為：子球 → role "object" + side "ball"；母球 → role "cue" + side "cue"。
    function reqOk(req, role, side) {
      const pe = events.find((e) => e.type === "pocket" && e.ball === role);
      const isLost = events.some((e) => e.type === "lost" && e.ball === role);
      if (isLost) return false; // 離桌：任何要求都不成立
      if (req === "stay_on_table") return !pe;
      if (req === "pot_target_pocket") return !!pe && targets(side).indexOf(pe.pocketIndex) >= 0; // 進錯袋＝失敗
      if (req === "stay_in_target_zone") return !pe && (stopped.zoneResults || {})[side] === true;
      return false;
    }
    const wasLost = (role) => events.some((e) => e.type === "lost" && e.ball === role);
    const reqs = level.note.reqs;
    if (!reqOk(reqs.ball, "object", "ball")) return { success: false, reason: wasLost("object") ? "off_table" : "ball_req_failed" };
    if (level.note.opt !== "object_only" && !reqOk(reqs.cue, "cue", "cue")) {
      return { success: false, reason: wasLost("cue") ? "off_table" : "cue_req_failed" };
    }
    return { success: true, reason: null };
  }

  return { judgeAttempt };
});
