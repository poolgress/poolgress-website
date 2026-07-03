// 球桌渲染：直式旋轉容器＋SVG overlay＋挑戰圈列＋狀態列（原型 spec §6）。
window.GameRender = (function () {
  "use strict";
  const CFG = window.GAME_CONFIG;
  const NS = "http://www.w3.org/2000/svg";
  const VW = 1000, VH = Math.round(1000 * CFG.TABLE_ASPECT); // SVG 畫布＝橫式桌圖比例
  let level = null;

  const REASON_TEXT = {
    touch_foul: "滾動中碰球", off_table: "球離桌",
    ball_req_failed: "子球未達成要求", cue_req_failed: "母球未達成要求",
    manual_fail: "判定失敗",
  };
  const STATUS = {
    placing: { text: "擺球中：請把球擺到虛線位置", cls: "" },
    arming: { text: "就位確認中…請將手移開", cls: "" },
    ready: { text: "可以擊球！", cls: "ready" },
    rolling: { text: "判定中，請勿靠近桌面", cls: "rolling" },
    clearing: { text: "整理中：可自由移動球，擺回位置自動繼續", cls: "" },
    done: { text: "已完成，前往結算…", cls: "" },
  };

  function starToFraction(x, y) {
    const g = CFG.GRID;
    return { fx: g.left + (x / 8) * (g.right - g.left), fy: g.top + (y / 4) * (g.bottom - g.top) };
  }
  function px(x, y) { const f = starToFraction(x, y); return { x: f.fx * VW, y: f.fy * VH }; }
  function ballRadiusPx() { // 球半徑（viewBox 單位）＝ballDiameterStar × 每顆星寬 / 2
    const g = CFG.GRID;
    return (level.meta.ballDiameterStar * ((g.right - g.left) / 8) * VW) / 2;
  }
  function svgEl(tag, attrs, cls) {
    const e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    if (cls) e.setAttribute("class", cls);
    return e;
  }

  function sizeRotor() {
    const outer = document.getElementById("tableOuter");
    const rotor = document.getElementById("tableRotor");
    const wp = outer.clientWidth;             // 直式寬＝桌短邊
    const hp = wp / CFG.TABLE_ASPECT;         // 直式高＝桌長邊
    outer.style.height = hp + "px";
    rotor.style.width = hp + "px";            // rotor 是橫式：寬=直式高
    rotor.style.height = wp + "px";
  }

  // 依關卡建立整個 overlay（每次進關卡/再玩一次呼叫）
  function init(lv) {
    level = lv;
    lastShotShown = 0; // 重玩時重置宣告去重，避免第一桿宣告被吃掉
    const sm = document.getElementById("shotMsg"); if (sm) { sm.hidden = true; sm.className = "shot-msg"; }
    document.getElementById("tableImg").src = CFG.TABLE_IMAGE;
    document.getElementById("cushionImg").src = CFG.CUSHION_IMAGE;
    sizeRotor();
    window.addEventListener("resize", sizeRotor);

    const svg = document.getElementById("overlay");
    svg.setAttribute("viewBox", "0 0 " + VW + " " + VH);
    svg.innerHTML = "";
    const gTargets = svgEl("g", { id: "gTargets" });
    const gPaths = svgEl("g", { id: "gPaths" });
    const gPlace = svgEl("g", { id: "gPlace" });
    svg.appendChild(gTargets); svg.appendChild(gPaths); svg.appendChild(gPlace);
    const r = ballRadiusPx();

    // 目標：袋口圈（用 meta.pockets 幾何）＋線段＋區塊
    (lv.pockets || []).forEach((side, i) => {
      if (!side) return;
      const pk = lv.meta.pockets[i];
      const p = px(pk.x, pk.y);
      const rr = pk.radiusStar * ((CFG.GRID.right - CFG.GRID.left) / 8) * VW;
      gTargets.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: rr }, "pocket-ring " + side));
    });
    (lv.lines || []).forEach((l) => {
      const a = px(l.x1, l.y1), b = px(l.x2, l.y2);
      gTargets.appendChild(svgEl("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, "target-line " + l.side));
    });
    (lv.zones || []).forEach((z) => {
      const a = px(z.x1, z.y1), b = px(z.x2, z.y2);
      gTargets.appendChild(svgEl("rect", { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }, "target-zone " + z.side));
    });

    // 參考路線（vertices[0]＝球心起點；ghost 頂點畫空心圈）。
    // 顏色依所屬球別（沿用編輯器視覺語言：母球白、子球黃）——SVG 無預設 stroke，必須明確指定。
    // 母球的路線包進帶 data-cueindex 的群組：母球換位關卡逐輪只顯示本輪母球的路線。
    (lv.paths || []).forEach((pa) => {
      const owner = (lv.balls || [])[pa.ball];
      const isCue = owner && owner.id === "cue";
      const stroke = isCue ? "#ffffff" : "#f2dc4e";
      const grp = svgEl("g", {});
      if (isCue) grp.dataset.cueindex = String(owner.cueIndex || 1);
      const pts = pa.vertices.map((v) => px(v.x, v.y));
      grp.appendChild(svgEl("polyline", { points: pts.map((p) => p.x + "," + p.y).join(" "), stroke: stroke }, "path-line"));
      pa.vertices.forEach((v, i) => {
        if (v.ghost) { const p = pts[i]; grp.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: r, stroke: stroke }, "ghost-mark path-line")); }
      });
      gPaths.appendChild(grp);
    });

    // 擺球虛線圈（母球圈帶 data-cueindex，供換位關卡逐次顯示）
    (lv.balls || []).forEach((b) => {
      const p = px(b.x, b.y);
      const c = svgEl("circle", { cx: p.x, cy: p.y, r: r }, "place-circle " + (b.id === "cue" ? "place-cue" : "place-object"));
      if (b.id === "cue") c.dataset.cueindex = String(b.cueIndex || 1);
      gPlace.appendChild(c);
    });
  }

  function show(id, on) { const e = document.getElementById(id); if (e) e.style.display = on ? "" : "none"; }

  // 就位標記：kind = "object"|"cue" → 該類擺球圈變綠框＋打勾（cv-manual 的第一步驟）
  function setPlacedMark(kind, on) {
    const sel = kind === "cue" ? ".place-cue" : ".place-object";
    document.querySelectorAll("#gPlace " + sel).forEach((c) => {
      c.classList.toggle("placed", on);
      const g = c.parentNode;
      // 打勾符號：跟著該圈建立/移除（text 反轉 rotor 的 90° 讓勾正立）
      let mark = g.querySelector('.place-check[data-for="' + kind + '"][data-cx="' + c.getAttribute("cx") + '"]');
      if (on && !mark) {
        const cx = Number(c.getAttribute("cx")), cy = Number(c.getAttribute("cy")), rr = Number(c.getAttribute("r"));
        mark = svgEl("text", { x: cx, y: cy, "font-size": rr * 1.4, "text-anchor": "middle", "dominant-baseline": "central", transform: "rotate(-90 " + cx + " " + cy + ")" }, "place-check");
        mark.dataset.for = kind; mark.dataset.cx = c.getAttribute("cx");
        mark.textContent = "✓";
        g.appendChild(mark);
      } else if (!on && mark) mark.remove();
    });
  }
  function resetPlacedMarks() {
    document.querySelectorAll("#gPlace .place-circle.placed").forEach((c) => c.classList.remove("placed"));
    document.querySelectorAll("#gPlace .place-check").forEach((m) => m.remove());
  }

  // 球桌大字提示（流程圖 6.3/6.5）：擺球脈動、可擊球閃爍
  function setHint(ph) {
    const el = document.getElementById("tableHint");
    if (!el) return;
    if (ph === "placing" || ph === "clearing") { el.textContent = "請把球放在圈圈中"; el.className = "table-hint pulse"; el.hidden = false; }
    else if (ph === "ready") { el.textContent = "開始擊球"; el.className = "table-hint blink"; el.hidden = false; }
    else el.hidden = true;
  }
  // 本桿結果宣告（流程圖 6.9）：大字 1.5s 淡出；同一桿只觸發一次
  let lastShotShown = 0;
  function setShotMsg(state) {
    const el = document.getElementById("shotMsg");
    if (!el) return;
    if (state.phase !== "result") return;
    const n = state.results.length;
    if (n === lastShotShown) return; // 同一結果重複 emit 不重播
    lastShotShown = n;
    const r = state.results[n - 1];
    el.className = "shot-msg " + (r.success ? "ok" : "no");
    el.innerHTML = (r.success ? "本桿成功" : "本桿失敗") + '<br><span class="shot-face">' + (r.success ? "😀" : "😢") + "</span>";
    el.hidden = false;
    void el.offsetWidth;       // 重排以重新觸發淡出動畫
    el.classList.add("show");
  }

  // 每次狀態機 onChange 呼叫
  function update(state) {
    const ph = state.phase;
    const placingLike = ph === "placing" || ph === "arming" || ph === "ready" || ph === "clearing";
    show("gPlace", placingLike);
    show("gPaths", placingLike);       // 結果顯示時隱藏無關標記（母規格 §4.2 RESULT）
    show("gTargets", true);
    // 母球換位：只顯示本次作用的母球圈與其路線（其他母球和對應路線不出現）
    document.querySelectorAll("#gPlace .place-cue").forEach((c) => {
      c.style.display = (placingLike && Number(c.dataset.cueindex) === state.cueSlot) ? "" : "none";
    });
    document.querySelectorAll("#gPaths g[data-cueindex]").forEach((g) => {
      g.style.display = Number(g.dataset.cueindex) === state.cueSlot ? "" : "none";
    });
    // 狀態列
    const bar = document.getElementById("statusBar");
    if (ph === "result") {
      const r = state.results[state.results.length - 1];
      bar.textContent = "第 " + state.results.length + " 次：" + (r.success ? "成功！" : "失敗（" + (REASON_TEXT[r.reason] || r.reason) + "）");
      bar.className = r.success ? "result-ok" : "result-fail";
    } else {
      const s = STATUS[ph] || { text: ph, cls: "" };
      bar.textContent = (ph === "placing" && state.attempt > 0 ? "第 " + state.attempt + " 次挑戰　" : "") + s.text;
      bar.className = s.cls;
    }
    // 一次性提示（搶打）
    const nb = document.getElementById("noticeBar");
    nb.hidden = !state.notice;
    if (state.notice) nb.textContent = state.notice;
    // 大字提示與本桿宣告（體驗層）
    setHint(ph);
    setShotMsg(state);
    // 挑戰圈列
    renderAttempts(document.getElementById("attemptRow"), state.results, state.total, state.attempt, ph);
  }

  // container 內畫 total 個圈；results 已有的畫勾叉；current 高亮
  function renderAttempts(container, results, total, attempt, phase) {
    container.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const d = document.createElement("div");
      d.className = "attempt";
      if (results[i]) { d.classList.add(results[i].success ? "ok" : "fail"); d.textContent = results[i].success ? "✓" : "✕"; }
      else if (i === attempt - 1 && phase !== "done") d.classList.add("current");
      container.appendChild(d);
    }
  }

  return { init, update, renderAttempts, setPlacedMark, resetPlacedMarks, REASON_TEXT };
})();
