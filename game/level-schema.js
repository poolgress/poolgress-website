// ★ 本檔為 table_2/level-schema.js 的副本（遊戲端代碼表單一來源）。table_2 升級此檔時要重新複製同步。
// 關卡資料 schema：驗證、穩定代碼、輸出組裝（純邏輯，無 DOM）。
// 瀏覽器掛在 window.LevelSchema；Node 測試用 module.exports。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LevelSchema = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SCHEMA_VERSION = 2;
  const COORD_SYSTEM = { unit: "star", xMax: 8, yMax: 4, origin: "top-left-cushion-nose" };

  // 關卡選項穩定代碼：索引與 app.js 的 LEVEL_SUBOPTS 一一對應。
  // ★ 契約凍結：只能在陣列尾端新增，不可插入或重排。
  const OPT_CODES = {
    repeat: ["classic_fixed", "object_only", "object_moves", "cue_moves", "eight_nine", "escape"],
    pattern: ["pattern_object_only_ordered", "pattern_ordered", "pattern_any_order"],
    infinite: ["infinite_one", "infinite_two"],
  };
  const V1_SUPPORTED_OPTS = ["classic_fixed", "object_only", "cue_moves"];
  function optCode(type, optIdx) { return (OPT_CODES[type] || [])[optIdx] || null; }

  // v1 要求選單（三選項）：索引與 app.js 的 REQ_BALL3 一一對應
  //（REQ_BALL3 由本升級計畫的選單縮減任務從 REQ_BALL6 建立；舊存檔的七選項索引由 migrateReqs 轉換）。
  const REQ_CODES = ["stay_on_table", "pot_target_pocket", "stay_in_target_zone"];
  const REQ_LABELS = ["要在桌上", "進目標袋口", "停留在目標區塊"];
  // 額外提醒（不判定，純提示）：索引 0＝「沒有」→ null
  const EXTRA3_CODES = [null, "edge_ball_touch_rail", "edge_ball_no_touch_rail"];
  const EXTRA2_CODES = [null, "cue_no_rail_contact"];

  // 由 GRID 邊界建立 fraction→顆星 轉換器（同 app.js starX/starY 的公式）
  function makeStar(grid) {
    const ux = (grid.right - grid.left) / 8;
    const uy = (grid.bottom - grid.top) / 4;
    const r3 = (n) => Math.round(n * 1000) / 1000;
    return { ux, uy, x: (fx) => r3((fx - grid.left) / ux), y: (fy) => r3((fy - grid.top) / uy) };
  }

  // 區塊座標正規化：(x1,y1)=左上、(x2,y2)=右下（拖曳方向不拘）
  function normalizeZone(z) {
    return {
      x1: Math.min(z.x1, z.x2), y1: Math.min(z.y1, z.y2),
      x2: Math.max(z.x1, z.x2), y2: Math.max(z.y1, z.y2),
      side: z.side || "ball",
    };
  }

  // 欄位值（可能是字串或空字串）→ number 或 null（空/未填）
  function toNum(v) {
    const s = String(v == null ? "" : v).trim();
    return s === "" ? null : Number(s);
  }
  const isInt = (n) => Number.isInteger(n);

  // 過關條件（M/N）與星星門檻驗證。回傳 { errors:[], warnings:[] }。
  function validateNote(note) {
    const errors = [], warnings = [];
    if (!note || note.type === "infinite") return { errors, warnings }; // 無限關卡無 M/N
    const pass = toNum(note.pass), total = toNum(note.total);
    if (pass == null || total == null) errors.push("過關條件未填完整（M / N 都必填）");
    else if (!isInt(pass) || !isInt(total)) errors.push("過關條件必須是整數");
    else {
      if (total < 1) errors.push("總挑戰次數 N 必須 ≥ 1");
      if (pass < 1 || pass > total) errors.push("需成功次數 M 必須介於 1 與 N 之間");
    }
    const s1 = toNum(note.star1), s2 = toNum(note.star2), s3 = toNum(note.star3);
    const filled = [s1, s2, s3].filter((s) => s != null).length;
    if (filled > 0 && filled < 3) errors.push("星星獎勵要嘛三個都填、要嘛全空（全空＝此關無星星）");
    else if (filled === 3) {
      if (![s1, s2, s3].every(isInt)) errors.push("星星門檻必須是整數");
      else {
        if (!(s1 >= 0 && s1 <= s2 && s2 <= s3)) errors.push("星星門檻必須遞增（一星 ≤ 兩星 ≤ 三星）");
        else if (total != null && s3 > total) errors.push("三星門檻不可大於總挑戰次數 N");
        if (pass != null && s1 < pass) warnings.push("一星門檻低於過關分數 M（未過關一律不給星，此設定會出現「達一星分數卻未過關」）");
      }
    }
    return { errors, warnings };
  }

  // 與 app.js reqTemplateKey 完全同步的模板分派。★ 兩邊要一起改。
  function templateKey(type, optIdx) {
    if (type === "repeat") { if (optIdx === 1) return "D"; if (optIdx === 4) return "E"; if (optIdx === 5) return "F"; return "A"; }
    if (type === "pattern") return optIdx === 0 ? "D" : "G";
    if (type === "infinite") return optIdx === 0 ? "A" : "C";
    return null;
  }

  // 由 serializeState() 的 state 取出要求代碼 { ball, cue?, extra:[] }。
  // 索引基準＝新三選項選單（REQ_CODES）。缺值預設：子球=進目標袋口、母球=要在桌上。
  function codesFromState(state) {
    const note = (state && state.note) || {};
    const reqs = note.reqs || {};
    const key = templateKey(note.type, note.opt);
    const idx = (name, def) => { const v = Number(reqs[name]); return Number.isFinite(v) ? v : def; };
    const pick = (name, def) => REQ_CODES[idx(name, def)] || REQ_CODES[def];
    const out = { ball: pick("req_ball", 1), extra: [] };
    if (key !== "D") out.cue = (key === "C" || key === "G") ? "stay_on_table" : pick("req_cue", 0);
    const e3 = EXTRA3_CODES[idx("req_extra3", 0)]; if (e3) out.extra.push(e3);
    const e2 = EXTRA2_CODES[idx("req_extra2", 0)]; if (e2) out.extra.push(e2);
    return out;
  }

  // v1 舊存檔的要求索引（REQ_BALL6 七選項）→ 新三選項索引。
  // 對不上的（不要求/進六袋/經過線段/複合）：母球類→0 要在桌上、子球類→1 進目標袋口。
  // 註：C/G/F 模板的舊選單索引與 REQ_BALL6 不同，遷移結果為近似值（皆超出 v1 範圍，可接受）。
  function migrateReqIndex(oldIdx, isCue) {
    const map = { 1: 0, 2: 1, 5: 2 };
    if (map[oldIdx] !== undefined) return map[oldIdx];
    return isCue ? 0 : 1;
  }
  function migrateReqs(reqs) {
    const out = {};
    Object.keys(reqs || {}).forEach((name) => {
      if (name === "req_extra3" || name === "req_extra2") { out[name] = reqs[name]; return; }
      out[name] = migrateReqIndex(Number(reqs[name]) || 0, name.indexOf("cue") >= 0);
    });
    return out;
  }

  // 種類×擺球交叉驗證＋要求×目標存在性（spec M2/M9）。
  function validateContent(state) {
    const errors = [], warnings = [];
    const note = (state && state.note) || {};
    const code = optCode(note.type, note.opt);
    const balls = state.balls || [];
    const cues = balls.filter((b) => b.id === "cue").length;
    const objs = balls.length - cues;
    if (code === "object_only") {
      if (cues > 0) errors.push("純子球關卡不可擺母球，請將母球移除");
      if (objs !== 1) errors.push("純子球關卡必須恰好 1 顆子球（目前 " + objs + " 顆）");
    } else if (code === "classic_fixed") {
      if (cues !== 1) errors.push("經典關卡必須恰好 1 顆母球（目前 " + cues + " 顆）");
      if (objs !== 1) errors.push("經典關卡必須恰好 1 顆子球（目前 " + objs + " 顆）");
    } else if (code === "cue_moves") {
      if (cues < 1) errors.push("母球換位置關卡至少要擺 1 個母球位置");
      if (objs !== 1) errors.push("母球換位置關卡必須恰好 1 顆子球（目前 " + objs + " 顆）");
    } else {
      warnings.push("此關卡種類/選項 v1 遊戲尚未支援，輸出僅供保存");
      return { errors, warnings }; // 未支援選項不做進一步要求驗證
    }
    // 要求×目標存在性
    const reqs = codesFromState(state);
    const hasPocket = (side) => (state.pockets || []).some((p) => p === side);
    const hasZone = (side) => (state.zones || []).some((z) => (z.side || "ball") === side);
    const check = (side, label, req) => {
      if (req === "pot_target_pocket" && !hasPocket(side)) errors.push(label + "要求「進目標袋口」，但沒有標記任何" + label + "目標袋口");
      if (req === "stay_in_target_zone" && !hasZone(side)) errors.push(label + "要求「停留在目標區塊」，但沒有畫任何" + label + "目標區塊");
    };
    check("ball", "子球", reqs.ball);
    if (reqs.cue) check("cue", "母球", reqs.cue);
    return { errors, warnings };
  }

  // 總驗證入口：note 驗證 + 內容驗證
  function validateLevel(state) {
    const n = validateNote((state && state.note) || {});
    const c = validateContent(state || {});
    return { errors: n.errors.concat(c.errors), warnings: n.warnings.concat(c.warnings) };
  }

  // 母球打點 CSS 百分比（"62.5%"）→ 球心為 0、範圍 -1~1
  function parseStrikePct(s, fallback) {
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(((n - 50) / 50) * 1000) / 1000;
  }

  // 遊戲用輸出 JSON（乾淨子集：無編輯器 UI 欄位）。
  // state = serializeState() 的輸出（fraction 座標）
  // geo = { grid, pockets:[{fx,fy}×6], pocketRadiusFraction, ballWidthFraction, levelId }
  function buildGameExport(state, geo) {
    const star = makeStar(geo.grid);
    const r3 = (n) => Math.round(n * 1000) / 1000;
    const P = (fx, fy) => ({ x: star.x(fx), y: star.y(fy) });
    const note = (state && state.note) || {};
    const ballDiameterStar = r3((geo.ballWidthFraction || 0) / star.ux);
    let cueN = 0;
    const balls = (state.balls || []).map((b) => {
      const p = P(b.fx, b.fy);
      return b.id === "cue"
        ? { id: b.id, cueIndex: ++cueN, x: p.x, y: p.y }   // 陣列順序＝挑戰順序，明確輸出編號
        : { id: b.id, x: p.x, y: p.y };
    });
    const stars3 = [toNum(note.star1), toNum(note.star2), toNum(note.star3)];
    return {
      schemaVersion: SCHEMA_VERSION,
      levelId: geo.levelId || null,
      coordSystem: COORD_SYSTEM,
      meta: {
        ballDiameterStar,
        placeToleranceStar: r3(ballDiameterStar / 2), // 擺球容錯預設＝球半徑
        pockets: (geo.pockets || []).map((p) => {      // 索引 0~5 凍結：左上/右上/左下/右下/上中/下中
          const q = P(p.fx, p.fy);
          return { x: q.x, y: q.y, radiusStar: r3((geo.pocketRadiusFraction || 0) / star.ux) };
        }),
      },
      note: {
        name: note.name || "", desc: note.desc || "",
        type: note.type || "infinite",
        opt: optCode(note.type, note.opt),
        pass: toNum(note.pass), total: toNum(note.total),
        stars: stars3.every((s) => s == null) ? null : stars3,
        reqs: codesFromState(state),
      },
      balls,
      paths: (state.paths || []).map((pa) => {
        const src = (state.balls || [])[pa.ball];
        const head = src ? [Object.assign(P(src.fx, src.fy), { ghost: false })] : []; // 起點＝球心
        const rest = (pa.vertices || []).map((v) => Object.assign(P(v.fx, v.fy), { ghost: !!v.ghost }));
        return { ball: pa.ball, vertices: head.concat(rest) };
      }),
      pockets: (state.pockets || []).slice(),
      lines: (state.lines || []).map((l) => {
        const a = P(l.x1, l.y1), b = P(l.x2, l.y2);
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, side: l.side || "ball" };
      }),
      zones: (state.zones || []).map(normalizeZone).map((z) => {
        const a = P(z.x1, z.y1), b = P(z.x2, z.y2);
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, side: z.side };
      }),
      strike: state.cue && state.cue.shown
        ? { x: parseStrikePct(state.cue.sx, 0), y: parseStrikePct(state.cue.sy, 0) }
        : null,
    };
  }

  return {
    SCHEMA_VERSION, COORD_SYSTEM, OPT_CODES, V1_SUPPORTED_OPTS,
    REQ_CODES, REQ_LABELS, EXTRA3_CODES, EXTRA2_CODES, optCode,
    makeStar, normalizeZone, toNum, validateNote,
    templateKey, codesFromState, migrateReqIndex, migrateReqs,
    validateContent, validateLevel, parseStrikePct, buildGameExport,
  };
});
