// 關卡載入與驗證閘（母規格 §6.4 的遊戲端）。
// UMD 純邏輯部分 node 可測；瀏覽器端載入器在檔尾（node 不執行）。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./level-schema.js"));
  else root.GameLevelValidate = factory(root.LevelSchema);
})(typeof self !== "undefined" ? self : this, function (LS) {
  "use strict";
  const isPosInt = (n) => Number.isInteger(n) && n >= 1;

  // 回傳錯誤訊息陣列；空陣列＝合法可玩
  function validateGameLevel(lv) {
    const errs = [];
    if (!lv || typeof lv !== "object") return ["不是有效的關卡物件"];
    if (lv.schemaVersion !== 2) errs.push("schemaVersion 必須是 2（請用升級後的編輯器輸出）");
    const note = lv.note || {};
    if (LS.V1_SUPPORTED_OPTS.indexOf(note.opt) < 0) errs.push("關卡選項 v1 不支援（僅經典/純子球/母球換位）");
    if (!isPosInt(note.total)) errs.push("total 必須是正整數");
    if (!isPosInt(note.pass) || (isPosInt(note.total) && note.pass > note.total)) errs.push("pass 必須是 1..total 的整數");
    if (note.stars != null) {
      const s = note.stars;
      if (!Array.isArray(s) || s.length !== 3 || !s.every(Number.isInteger)) errs.push("stars 必須是 null 或三個整數");
      else if (!(s[0] <= s[1] && s[1] <= s[2]) || (isPosInt(note.total) && s[2] > note.total)) errs.push("stars 必須遞增且三星 ≤ total");
    }
    const reqs = note.reqs || {};
    if (LS.REQ_CODES.indexOf(reqs.ball) < 0) errs.push("子球要求代碼不合法");
    const balls = lv.balls || [];
    const cues = balls.filter((b) => b.id === "cue");
    if (balls.length - cues.length !== 1) errs.push("必須恰好 1 顆子球");
    if (note.opt === "object_only") {
      if (cues.length !== 0) errs.push("純子球關卡不可含母球");
      if (reqs.cue != null) errs.push("純子球關卡不應有母球要求");
    } else {
      if (LS.REQ_CODES.indexOf(reqs.cue) < 0) errs.push("母球要求代碼不合法");
      if (note.opt === "classic_fixed" && cues.length !== 1) errs.push("經典關卡必須恰好 1 顆母球");
      if (note.opt === "cue_moves") {
        if (cues.length < 1) errs.push("母球換位關卡至少 1 個母球位置");
        const idx = cues.map((c) => c.cueIndex).sort((a, b) => a - b);
        if (!idx.every((v, i) => v === i + 1)) errs.push("母球 cueIndex 必須是 1..k 連續");
      }
    }
    const hasPocket = (side) => (lv.pockets || []).some((p) => p === side);
    const hasZone = (side) => (lv.zones || []).some((z) => z.side === side);
    const chk = (req, side, label) => {
      if (req === "pot_target_pocket" && !hasPocket(side)) errs.push(label + "要求進目標袋但沒有標記" + label + "目標袋口");
      if (req === "stay_in_target_zone" && !hasZone(side)) errs.push(label + "要求停留區塊但沒有" + label + "目標區塊");
    };
    chk(reqs.ball, "ball", "子球");
    if (note.opt !== "object_only") chk(reqs.cue, "cue", "母球");
    if (!lv.meta || !(lv.meta.ballDiameterStar > 0)) errs.push("缺少 meta.ballDiameterStar（球尺寸）");
    return errs;
  }

  return { validateGameLevel };
});

// ── 瀏覽器端載入器（node --test 不執行這段）──
if (typeof window !== "undefined") {
  window.GameLevels = (function () {
    "use strict";
    const LS_KEY = "poolgressGameImports";
    const V = window.GameLevelValidate;
    function readImports() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { return []; } }
    // 回傳 [{ name, level, errors }]：內建（manifest）＋匯入（localStorage）
    async function loadAll() {
      const out = [];
      try {
        const names = await (await fetch("levels/manifest.json")).json();
        for (const name of names) {
          try {
            const lv = await (await fetch("levels/" + name)).json();
            out.push({ name, level: lv, errors: V.validateGameLevel(lv) });
          } catch (e) { out.push({ name, level: null, errors: ["讀取失敗：" + e.message] }); }
        }
      } catch (e) { /* 沒有 manifest：只列匯入的 */ }
      readImports().forEach((lv, i) => out.push({ name: "匯入 " + (i + 1), level: lv, errors: V.validateGameLevel(lv) }));
      return out;
    }
    function importJson(text) {
      let lv;
      try { lv = JSON.parse(text); } catch (e) { return { ok: false, errors: ["JSON 解析失敗：" + e.message] }; }
      const errors = V.validateGameLevel(lv);
      if (errors.length) return { ok: false, errors };
      const arr = readImports(); arr.push(lv);
      try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
      catch (e) { return { ok: false, errors: ["儲存失敗：" + e.message] }; } // quota 超限/隱私模式
      return { ok: true, errors: [] };
    }
    return { loadAll, importJson };
  })();
}
