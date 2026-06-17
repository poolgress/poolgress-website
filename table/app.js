// 撞球練習圖 App — 主程式
// 功能：從球庫拖曳放球到桌上、拖動桌上的球、拖出桌面或雙擊刪除。
(function () {
  "use strict";

  const CFG = window.CONFIG;
  const P = CFG.PLAY_AREA;

  const tableWrap = document.getElementById("tableWrap");
  const tableImg = document.getElementById("tableImg");
  const overlay = document.getElementById("ballsOverlay");
  const rackItems = document.getElementById("rackItems");

  // 記錄每個球圖檔是否載入成功（undefined=未知 / true / false）
  const imgAvailable = {};
  // 每顆球圖檔的原始像素寬（用來算「球:球桌」的原始比例）
  const naturalW = {};
  // 桌上的球：{ el, cfg, fx, fy }，fx/fy 為球心相對球桌容器的座標 0~1
  const placedBalls = [];
  // 目前進行中的拖曳狀態
  let drag = null;
  // 目前被選取的球（顯示框選環與對準十字線）
  let selectedBall = null;
  let selUI = null; // 選取相關的 DOM 元素
  // 吸附格線
  let snapOn = false;
  let gridOn = false;    // 格線顯示狀態
  let gridVLines = null; // 垂直格線的 x 位置陣列
  let gridHLines = null; // 水平格線的 y 位置陣列
  // 繪製路徑
  let pathMode = false;
  const paths = [];        // 已完成的路徑：{ ball, vertices:[{fx,fy,ghost}] }（起點＝球心）
  let drawingPath = null;  // 拖曳中的路徑：{ ball, locked:[{fx,fy}], live:{fx,fy}, lastBall }
  let pathLines = null;    // SVG <g> 容器

  // 框選環直接用 pick.png 的原始尺寸對球桌的比例（同球的作法，不另乘倍率）。
  // 十字線從環外緣開始（中間不顯示）。
  let pickNaturalW = 350; // pick.png 原始寬，載入後更新

  // 對準十字線的內縮 = 黑色庫鼻線的內緣（量自 table.png）。
  // 線端剛好貼著庫鼻線、不留縫隙、也不越過到庫邊外。
  const CROSS_INSET = { top: 0.0984, right: 0.0544, bottom: 0.0992, left: 0.0544 };

  // ---------- 工具函式 ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function tableRect() {
    return tableWrap.getBoundingClientRect();
  }

  // 游標是否落在球桌圖範圍內（用來判斷放置/刪除；落在外面＝取消或刪除）
  function isInsideTableWrap(x, y) {
    const r = tableRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  // client 座標 → 球桌容器的相對座標 (0~1，可能 <0 或 >1)
  function clientToWrapFraction(x, y) {
    const r = tableRect();
    return { fx: (x - r.left) / r.width, fy: (y - r.top) / r.height };
  }

  // 球桌相對座標 (0~1) → client 座標（拖曳時把幽靈球擺到夾制後的落點）
  function wrapFractionToClient(fx, fy) {
    const r = tableRect();
    return { x: r.left + fx * r.width, y: r.top + fy * r.height };
  }

  // 球半徑相對球桌容器的比例（球為正方形，垂直方向需乘上球桌長寬比）
  function ballRadiusFractions(cfg) {
    const rx = ballWidthFraction(cfg) / 2; // 佔容器寬
    const aspect = (tableImg.naturalWidth || 1) / (tableImg.naturalHeight || 1);
    return { rx, ry: rx * aspect }; // ry 佔容器高
  }

  // 矩形後備夾制（紅圖遮罩尚未載入時用）：球緣貼齊直線庫邊
  function clampCenterRect(cfg, fx, fy) {
    const { rx, ry } = ballRadiusFractions(cfg);
    return {
      fx: clamp(fx, P.left + rx, 1 - P.right - rx),
      fy: clamp(fy, P.top + ry, 1 - P.bottom - ry),
    };
  }

  // ---------- 紅色可放置區遮罩（來自 AMBIT_IMAGE，含袋口突起/角落斜切） ----------
  // redMask = { W, H, dist }；dist[i] = 該格到「最近非紅格」的距離（格為單位）。
  // 球心合法 ⟺ dist >= 球半徑(格)，代表整顆球都落在紅色內（自動避開袋口黑洞）。
  let redMask = null;
  const MASK_SCALE = 0.15;       // 遮罩解析度（佔原圖比例）
  const MASK_MARGIN_GRID = 1.0;  // 安全邊距（格）：寧可略在內側也不超出邊界

  // 一維平方距離轉換（Felzenszwalb & Huttenlocher，O(n)）
  function edt1d(f, n, d, v, z) {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  }

  // 建立紅色遮罩 + 精確歐氏距離轉換（每格到最近非紅的真實距離）
  function buildRedMask(img) {
    const W = Math.round(img.naturalWidth * MASK_SCALE);
    const H = Math.round(img.naturalHeight * MASK_SCALE);
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const R = CFG.AMBIT_RED;
    const N = W * H;
    const INF = 1e12;
    const g = new Float64Array(N); // 非紅=0，紅=INF
    for (let i = 0; i < N; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      g[i] = (r > R.rMin && gg < R.gMax && b < R.bMax) ? INF : 0;
    }
    const maxWH = Math.max(W, H);
    const f = new Float64Array(maxWH), dd = new Float64Array(maxWH);
    const v = new Int32Array(maxWH), z = new Float64Array(maxWH + 1);
    // 先沿欄(y)，再沿列(x)
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) f[y] = g[y * W + x];
      edt1d(f, H, dd, v, z);
      for (let y = 0; y < H; y++) g[y * W + x] = dd[y];
    }
    for (let y = 0; y < H; y++) {
      const base = y * W;
      for (let x = 0; x < W; x++) f[x] = g[base + x];
      edt1d(f, W, dd, v, z);
      for (let x = 0; x < W; x++) g[base + x] = dd[x];
    }
    const dist = new Float32Array(N);
    for (let i = 0; i < N; i++) dist[i] = Math.sqrt(g[i]); // 平方→歐氏距離
    return { W, H, dist };
  }

  // 球半徑換算成遮罩格數（含安全邊距）
  function ballRadiusGrid(cfg) {
    return (ballWidthFraction(cfg) * redMask.W) / 2 + MASK_MARGIN_GRID;
  }

  // 用紅色遮罩夾制：若球心非法，找最近的合法格貼齊紅色輪廓
  function clampCenterMask(cfg, fx, fy) {
    const { W, H, dist } = redMask;
    const r = ballRadiusGrid(cfg);
    const gx = clamp(Math.round(fx * W), 0, W - 1);
    const gy = clamp(Math.round(fy * H), 0, H - 1);
    if (dist[gy * W + gx] >= r) return { fx, fy }; // 已合法
    // 由內而外一圈圈找最近的合法格（Chebyshev 環）。
    // 上限需涵蓋「庫邊最寬處 + 球半徑」的距離（球拖到桌框邊緣時也找得到落點）。
    const MAX = Math.ceil(r) + Math.round(Math.max(W, H) * 0.18);
    let best = null, bestD = Infinity, stopAt = MAX;
    for (let R = 1; R <= stopAt; R++) {
      for (let dy = -R; dy <= R; dy++) {
        const ay = Math.abs(dy);
        for (let dx = -R; dx <= R; dx++) {
          if (Math.max(Math.abs(dx), ay) !== R) continue; // 只掃最外環
          const x = gx + dx, y = gy + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (dist[y * W + x] >= r) {
            const dd = dx * dx + dy * dy;
            if (dd < bestD) { bestD = dd; best = { x, y }; }
          }
        }
      }
      if (best && stopAt === MAX) stopAt = R + 1; // 多掃一環以取得更近的正交格
    }
    if (!best) return clampCenterRect(cfg, fx, fy); // 極端情況退回矩形
    return { fx: best.x / W, fy: best.y / H };
  }

  // 邊界夾制：有遮罩用遮罩，否則用矩形後備
  function constrainCenter(cfg, fx, fy) {
    return redMask ? clampCenterMask(cfg, fx, fy) : clampCenterRect(cfg, fx, fy);
  }

  // ---------- 球與球不可重疊 ----------
  // 因球桌有長寬比，需換到「等比例座標」u=(fx, fy/aspect)算真正的圓心距離。
  // 兩球(同尺寸)圓心距 < 一個直徑(=ballWidthFraction) 即重疊，推開到剛好相切。
  function tableAspect() {
    return (tableImg.naturalWidth || 1) / (tableImg.naturalHeight || 1);
  }

  // 把 (fx,fy) 推離所有其他球，使彼此不重疊（被拖的球動、其他球不動）
  function separateFromBalls(cfg, fx, fy, exclude) {
    const aspect = tableAspect();
    const D = ballWidthFraction(cfg); // 最小圓心距（u 空間）
    let ux = fx, uy = fy / aspect;
    for (const b of placedBalls) {
      if (b === exclude) continue;
      const bux = b.fx, buy = b.fy / aspect;
      let dx = ux - bux, dy = uy - buy;
      let dist = Math.hypot(dx, dy);
      if (dist < D) {
        if (dist < 1e-9) { dx = 1; dy = 0; dist = 1; } // 完全重合 → 任意方向推開
        ux = bux + (dx / dist) * D;
        uy = buy + (dy / dist) * D;
      }
    }
    return { fx: ux, fy: uy * aspect };
  }

  // ---------- 吸附格線 ----------
  // 吸附磁吸範圍 = 格距的多少倍（每軸獨立；中間留自由區）
  const SNAP_FRAC = 0.33;

  // 建立格線位置：垂直線 x 陣列、水平線 y 陣列
  function buildGridLines() {
    const g = CFG.GRID;
    if (!g) return;
    gridVLines = [];
    for (let i = 0; i <= g.cols; i++) gridVLines.push(g.left + (i * (g.right - g.left)) / g.cols);
    gridHLines = [];
    for (let j = 0; j <= g.rows; j++) gridHLines.push(g.top + (j * (g.bottom - g.top)) / g.rows);
  }

  // 在候選值中找最接近 v 的，且距離 < thr；否則回 null
  function nearestWithin(v, cands, thr) {
    let best = null, bd = thr;
    for (const c of cands) {
      const d = Math.abs(v - c);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // 逐軸吸附：
  //  - X 靠近某條垂直格線 → 吸該 x；Y 靠近某條水平格線 → 吸該 y
  //  - 兩軸同時吸 → 自動落在交叉點（靠近交叉點時優先成立）
  //  - 庫邊：把「球緣貼庫邊」的球心線也當候選，所以也能吸到庫邊
  function snapToLines(cfg, fx, fy) {
    if (!gridVLines) return { fx, fy };
    const g = CFG.GRID;
    const thrX = (SNAP_FRAC * (g.right - g.left)) / g.cols;
    const thrY = (SNAP_FRAC * (g.bottom - g.top)) / g.rows;
    const { rx, ry } = ballRadiusFractions(cfg);
    const vCand = gridVLines.concat([P.left + rx, 1 - P.right - rx]); // +左右庫邊
    const hCand = gridHLines.concat([P.top + ry, 1 - P.bottom - ry]); // +上下庫邊
    const sx = nearestWithin(fx, vCand, thrX);
    const sy = nearestWithin(fy, hCand, thrY);
    return { fx: sx === null ? fx : sx, fy: sy === null ? fy : sy };
  }

  // 邊界 + 球球分離一起解：交替夾制/推開並迭代收斂
  // 開啟吸附時：先逐軸吸到格線/交叉點/庫邊，再走邊界與不重疊。
  function constrainBall(cfg, fx, fy, exclude) {
    if (snapOn && gridVLines) {
      const s = snapToLines(cfg, fx, fy);
      fx = s.fx; fy = s.fy;
    }
    let p = constrainCenter(cfg, fx, fy);
    for (let i = 0; i < 8; i++) {
      const s = separateFromBalls(cfg, p.fx, p.fy, exclude);
      const c = constrainCenter(cfg, s.fx, s.fy);
      if (Math.abs(c.fx - p.fx) < 1e-5 && Math.abs(c.fy - p.fy) < 1e-5) { p = c; break; }
      p = c;
    }
    return p;
  }

  // 球的顯示大小：直接用原圖檔比例（球圖原始寬 / 球桌圖原始寬）
  function ballWidthFraction(cfg) {
    const tW = tableImg.naturalWidth || 1;
    const bW = naturalW[cfg.id] || 60;
    return bW / tW;
  }
  // 球直徑（px）＝該比例 × 目前球桌顯示寬
  function ballDiameterPx(cfg) {
    return ballWidthFraction(cfg) * tableRect().width;
  }

  // ---------- 球的視覺（圖檔，失敗則用 CSS 暫代球）----------
  function buildFallback(cfg) {
    const d = document.createElement("div");
    d.className = "ball-fallback" + (cfg.stripe ? " stripe" : "");
    d.style.setProperty("--ball-color", cfg.color || "#888");
    if (cfg.text) {
      const span = document.createElement("span");
      span.className = "num-badge";
      span.textContent = cfg.text;
      d.appendChild(span);
    }
    return d;
  }

  function buildVisual(cfg) {
    if (imgAvailable[cfg.id] === false) return buildFallback(cfg);
    const img = document.createElement("img");
    img.src = cfg.src;
    img.alt = cfg.name;
    img.draggable = false;
    img.addEventListener("load", () => {
      imgAvailable[cfg.id] = true;
      if (img.naturalWidth) naturalW[cfg.id] = img.naturalWidth;
    });
    img.addEventListener("error", () => {
      imgAvailable[cfg.id] = false;
      img.replaceWith(buildFallback(cfg));
    });
    return img;
  }

  // ---------- 桌上的球：定位 ----------
  // 球心以「球桌容器的相對座標 (fx,fy)」儲存，直接換算成百分比定位
  function applyBallPos(b) {
    b.el.style.left = b.fx * 100 + "%";
    b.el.style.top = b.fy * 100 + "%";
  }

  function placeBall(cfg, fx, fy) {
    const el = document.createElement("div");
    el.className = "ball";
    el.style.width = ballWidthFraction(cfg) * 100 + "%"; // 原圖比例 → 隨球桌縮放
    el.style.aspectRatio = "1 / 1";
    el.style.fontSize = ballDiameterPx(cfg) * 0.4 + "px";
    el.appendChild(buildVisual(cfg));

    const b = { el, cfg, fx, fy };
    applyBallPos(b);

    el.addEventListener("pointerdown", (e) => onBallPointerDown(b, e));
    el.addEventListener("dblclick", () => removeBall(b));

    overlay.appendChild(el);
    placedBalls.push(b);
    return b;
  }

  function removeBall(b) {
    if (b === selectedBall) clearSelection();
    removePathsOfBall(b); // 連同它的路徑一起移除
    b.el.remove();
    const i = placedBalls.indexOf(b);
    if (i >= 0) placedBalls.splice(i, 1);
    renderPaths();
  }

  // ---------- 選取：框選環(pick.png) + 對準十字線(4 段) ----------
  function initSelection() {
    const mk = (cls) => { const d = document.createElement("div"); d.className = "cross-seg " + cls; return d; };
    // 十字線拆成 4 段：左、右(水平)、上、下(垂直)，中間留空給框選環
    const crossL = mk("h"), crossR = mk("h"), crossT = mk("v"), crossB = mk("v");
    const ring = document.createElement("div");
    ring.className = "sel-ring";
    const img = document.createElement("img");
    img.src = CFG.PICK_IMAGE || "assets/pick.png";
    img.alt = "";
    img.draggable = false;
    img.addEventListener("load", () => {
      if (img.naturalWidth) { pickNaturalW = img.naturalWidth; updateSelectionUI(); }
    });
    ring.appendChild(img);
    // 線段先插入（在球之下）；環之後用 z-index 疊在球之上
    overlay.appendChild(crossL);
    overlay.appendChild(crossR);
    overlay.appendChild(crossT);
    overlay.appendChild(crossB);
    overlay.appendChild(ring);
    selUI = { crossL, crossR, crossT, crossB, ring };
    updateSelectionUI();
  }

  // 設定一段十字線（dir: 'h' 設寬、'v' 設高）
  function setSeg(el, leftFrac, topFrac, sizeFrac, dir) {
    el.style.left = leftFrac * 100 + "%";
    el.style.top = topFrac * 100 + "%";
    if (dir === "h") el.style.width = Math.max(0, sizeFrac) * 100 + "%";
    else el.style.height = Math.max(0, sizeFrac) * 100 + "%";
  }

  // 依被選取球的位置擺放框選環與 4 段十字線（線從環外緣開始、延伸到鋪面邊緣）
  function updateSelectionUI() {
    if (!selUI) return;
    const keys = ["crossL", "crossR", "crossT", "crossB", "ring"];
    const show = selectedBall ? "block" : "none";
    keys.forEach((k) => (selUI[k].style.display = show));
    if (!selectedBall) return;
    const b = selectedBall;
    const r = tableRect();
    // 框選環：以球心為中心，大小直接用 pick.png 原圖對球桌的比例
    const ringPx = (pickNaturalW / (tableImg.naturalWidth || 1)) * r.width;
    selUI.ring.style.width = ringPx + "px";
    selUI.ring.style.height = ringPx + "px";
    selUI.ring.style.left = b.fx * 100 + "%";
    selUI.ring.style.top = b.fy * 100 + "%";
    // 環外緣到球心的距離（換成相對座標），十字線由此開始
    const PT = 96 / 72; // 每 pt 的 px
    const extendPx = 0.5 * PT;     // 內端往球中心多延伸 0.5pt（縮小與環的間距）
    const cushionGapPx = 0.5 * PT; // 外端離庫鼻線多留 0.5pt
    // 內端：環半徑再往中心縮 extendPx
    const gxf = (ringPx / 2 - extendPx) / r.width;
    const gyf = (ringPx / 2 - extendPx) / r.height;
    // 外端：庫鼻內緣再往內留 cushionGapPx
    const CI = CROSS_INSET;
    const Lx = CI.left + cushionGapPx / r.width;
    const Rx = 1 - CI.right - cushionGapPx / r.width;
    const Ty = CI.top + cushionGapPx / r.height;
    const By = 1 - CI.bottom - cushionGapPx / r.height;
    setSeg(selUI.crossL, Lx, b.fy, (b.fx - gxf) - Lx, "h");          // 左段
    setSeg(selUI.crossR, b.fx + gxf, b.fy, Rx - (b.fx + gxf), "h");  // 右段
    setSeg(selUI.crossT, b.fx, Ty, (b.fy - gyf) - Ty, "v");          // 上段
    setSeg(selUI.crossB, b.fx, b.fy + gyf, By - (b.fy + gyf), "v");  // 下段
  }

  function selectBall(b) {
    selectedBall = b;
    updateSelectionUI();
  }

  function clearSelection() {
    selectedBall = null;
    updateSelectionUI();
  }

  // ---------- 拖曳：從球庫拖出新球 ----------
  function onRackPointerDown(cfg, e) {
    e.preventDefault();
    const d = ballDiameterPx(cfg);
    const ghost = document.createElement("div");
    ghost.className = "ghost-ball";
    ghost.style.width = d + "px";
    ghost.style.height = d + "px";
    ghost.style.fontSize = d * 0.4 + "px";
    ghost.appendChild(buildVisual(cfg));
    document.body.appendChild(ghost);

    drag = { type: "new", cfg, ghost };
    moveGhost(e.clientX, e.clientY);
    addDragListeners();
  }

  function moveGhost(x, y) {
    drag.ghost.style.left = x + "px";
    drag.ghost.style.top = y + "px";
  }

  // ---------- 拖曳：移動桌上既有的球 ----------
  function onBallPointerDown(b, e) {
    e.preventDefault();
    e.stopPropagation(); // 不要冒泡到球桌的「點空白處取消選取」
    selectBall(b);
    if (pathMode) {
      // 繪製模式：從球心拉出一條路徑（取代該球既有路徑）
      drawingPath = { ball: b, locked: [], live: { fx: b.fx, fy: b.fy }, lastBall: null };
      drag = { type: "path" };
      addDragListeners();
      return;
    }
    b.el.classList.add("dragging");
    drag = { type: "move", ball: b };
    addDragListeners();
  }

  // ---------- 共用：拖曳進行中／結束 ----------
  function onPointerMove(e) {
    if (!drag) return;

    if (drag.type === "path") {
      // 沿途碰球/庫邊鎖定假想球（轉彎點），活動端跟游標
      const f = clientToWrapFraction(e.clientX, e.clientY);
      advanceDrawingPath({ fx: clamp(f.fx, 0, 1), fy: clamp(f.fy, 0, 1) });
      renderPaths();
      return;
    }

    const overTable = isInsideTableWrap(e.clientX, e.clientY);

    if (drag.type === "new") {
      if (overTable) {
        // 在球桌上：幽靈球貼齊夾制後的落點（碰邊界就貼著）
        const raw = clientToWrapFraction(e.clientX, e.clientY);
        const cl = constrainBall(drag.cfg, raw.fx, raw.fy, null); // 新球：避開所有既有球
        const pos = wrapFractionToClient(cl.fx, cl.fy);
        moveGhost(pos.x, pos.y);
        drag.ghost.classList.remove("will-remove");
      } else {
        // 拖到球桌外：跟隨游標並提示將取消
        moveGhost(e.clientX, e.clientY);
        drag.ghost.classList.add("will-remove");
      }
    } else {
      // 移動既有球：永遠夾制在鋪面內（碰邊界就貼著、不出去）
      const b = drag.ball;
      const raw = clientToWrapFraction(e.clientX, e.clientY);
      const cl = constrainBall(b.cfg, raw.fx, raw.fy, b); // 移動：避開其他球（排除自己）
      b.fx = cl.fx;
      b.fy = cl.fy;
      applyBallPos(b);
      if (b === selectedBall) updateSelectionUI(); // 十字線/框選環跟著移動
      renderPaths(); // 路徑起點(球心)跟著移動
      b.el.classList.toggle("will-remove", !overTable);
    }
  }

  function onPointerUp(e) {
    if (!drag) return;
    removeDragListeners();

    if (drag.type === "path") {
      const dp = drawingPath;
      const aspect = tableAspect();
      const verts = dp.locked.map((v) => ({ fx: v.fx, fy: v.fy, ghost: true }));
      verts.push({ fx: dp.live.fx, fy: dp.live.fy, ghost: false });
      let total = 0, prev = { fx: dp.ball.fx, fy: dp.ball.fy };
      for (const v of verts) { total += Math.hypot(v.fx - prev.fx, (v.fy - prev.fy) / aspect); prev = v; }
      removePathsOfBall(dp.ball); // 一顆球只保留一條路徑
      if (total > ballWidthFraction(dp.ball.cfg) * 0.5) paths.push({ ball: dp.ball, vertices: verts });
      drawingPath = null;
      renderPaths();
      drag = null;
      return;
    }

    const overTable = isInsideTableWrap(e.clientX, e.clientY);

    if (drag.type === "new") {
      drag.ghost.remove();
      if (overTable) {
        const raw = clientToWrapFraction(e.clientX, e.clientY);
        const cl = constrainBall(drag.cfg, raw.fx, raw.fy, null); // 放置：避開所有既有球
        const placed = placeBall(drag.cfg, cl.fx, cl.fy); // 落在球桌上 → 放置（已貼齊邊界、不重疊）
        selectBall(placed); // 放好的球即為選取狀態
      }
      // 落在球桌外 → 取消，不放球
    } else {
      const b = drag.ball;
      b.el.classList.remove("dragging", "will-remove");
      if (!overTable) removeBall(b); // 拖出整張球桌 → 刪除（鋪面內只會貼邊不刪）
      // 落在球桌內：拖曳過程已夾制定位，無需處理
    }
    drag = null;
  }

  function addDragListeners() {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }
  function removeDragListeners() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  }

  // 視窗縮放時，更新球上號碼字級（球大小本身用 % 自動縮放）與選取框尺寸
  // 母球打點 / 說明：位置以「相對球桌的比例」儲存（左上角），隨球桌移動/縮放
  let cuePos = { fx: 0.015, fy: 0.04 };
  let notePos = { fx: 0.015, fy: 0.42 };

  function positionFloatingEl(el, pos) {
    const r = tableRect();
    el.style.left = r.left + pos.fx * r.width + "px";
    el.style.top = r.top + pos.fy * r.height + "px";
  }

  // 拖曳後：由目前 left/top 反算相對球桌的比例
  function storeFloatingPos(el, pos) {
    const r = tableRect();
    pos.fx = (parseFloat(el.style.left) - r.left) / r.width;
    pos.fy = (parseFloat(el.style.top) - r.top) / r.height;
  }

  // 整體依球桌比例縮放 + 依比例重新定位（球桌寬 1100 為基準）
  // 讓球桌在「可用寬度」與「可用高度」內都塞得下，且寬高永遠維持原圖比例（不變形）。
  // 高度一律由寬度按固定比例推算，故任何裝置都不會拉伸。球庫寬度同步對齊球桌。
  const TABLE_ASPECT = 11784 / 6534; // = table.png 原始長寬比
  function fitTable() {
    const area = tableWrap.parentElement; // .table-area
    if (!area) return;
    const rack = document.getElementById("rack");
    const controls = document.querySelector(".table-controls");
    const cs = getComputedStyle(area);
    const gap = parseFloat(cs.rowGap || cs.gap) || 12;
    const availW = area.clientWidth;
    let w = Math.min(availW, 1100);
    for (let i = 0; i < 4; i++) {
      tableWrap.style.width = w + "px";
      if (rack) rack.style.width = w + "px";
      document.documentElement.style.setProperty("--ui-scale", w / TARGET_REF_W);
      const rackH = rack ? rack.offsetHeight : 0;       // 量測會觸發 reflow
      const ctrlH = controls ? controls.offsetHeight : 0;
      const availH = area.clientHeight - rackH - ctrlH - gap * 2; // 扣球庫 + 按鈕 + 兩個間距
      const nw = Math.max(160, Math.min(availW, 1100, Math.max(0, availH) * TABLE_ASPECT));
      if (Math.abs(nw - w) < 0.5) { w = nw; break; }
      w = nw;
    }
    tableWrap.style.width = w + "px";
    if (rack) rack.style.width = w + "px";
  }

  function updateFloatingScale() {
    const s = tableRect().width / TARGET_REF_W;
    document.documentElement.style.setProperty("--ui-scale", s); // 下方按鈕等 UI 依球桌比例縮放
    const cw = document.getElementById("cueballWidget");
    const nb = document.getElementById("noteBox");
    if (cw) { cw.style.transformOrigin = "top left"; cw.style.transform = "scale(" + s + ")"; positionFloatingEl(cw, cuePos); }
    if (nb) { nb.style.transformOrigin = "top left"; nb.style.transform = "scale(" + s + ")"; positionFloatingEl(nb, notePos); }
  }

  function onResize() {
    fitTable();
    placedBalls.forEach((b) => (b.el.style.fontSize = ballDiameterPx(b.cfg) * 0.4 + "px"));
    updateSelectionUI();
    renderPaths();
    renderPocketTargets();
    renderTargetLines();
    renderTargetZones();
    updateFloatingScale();
  }

  // ---------- 初始化 ----------
  function initTable() {
    tableImg.addEventListener("error", () => {
      tableImg.style.display = "none";
      tableWrap.classList.add("placeholder");
    });
    tableImg.src = CFG.TABLE_IMAGE;
  }

  // 庫邊圖層：永遠疊在球桌上（格線之上、球之下）
  function initCushion() {
    const el = document.getElementById("cushionImg");
    if (el && CFG.CUSHION_IMAGE) el.src = CFG.CUSHION_IMAGE;
  }

  // ---------- 目標（袋口/線段/區塊）共用 ----------
  // 尺寸基準：球桌寬 1100px(max-width) 時為設定值，其餘依比例縮放 → 與球桌等比例固定
  const TARGET_REF_W = 1100;

  // ---------- 目標袋口 ----------
  let pocketEditOn = false;
  const pocketSelected = (CFG.POCKETS || []).map(() => false); // 哪些袋口被選為目標(綠圈)
  let targetPocketsG = null;

  function renderPocketTargets() {
    if (!targetPocketsG) return;
    const NS = "http://www.w3.org/2000/svg";
    const r = tableRect();
    const s = r.width / TARGET_REF_W; // 與球桌等比例(以 1100px 基準)
    const rad = 11 * s;         // 圈圈半徑
    const strokeW = 5 * s;      // 圈圈粗度
    while (targetPocketsG.firstChild) targetPocketsG.removeChild(targetPocketsG.firstChild);
    (CFG.POCKETS || []).forEach((p, i) => {
      const selected = pocketSelected[i];
      if (!pocketEditOn && !selected) return; // 非編輯時只留已選(綠圈)
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("class", "pocket-target " + (selected ? "sel" : "unsel") + (pocketEditOn ? " clickable" : ""));
      c.setAttribute("cx", p.fx * r.width);
      c.setAttribute("cy", p.fy * r.height);
      c.setAttribute("r", rad);
      c.setAttribute("stroke-width", strokeW);
      if (pocketEditOn) {
        c.addEventListener("click", () => {
          pocketSelected[i] = !pocketSelected[i];
          renderPocketTargets();
        });
      }
      targetPocketsG.appendChild(c);
    });
  }

  function initPocketTarget() {
    targetPocketsG = document.getElementById("targetPockets");
    const btn = document.getElementById("pocketTargetBtn");
    if (!btn || !targetPocketsG) return;
    btn.addEventListener("click", () => {
      pocketEditOn = !pocketEditOn;
      btn.classList.toggle("active", pocketEditOn);
      btn.setAttribute("aria-pressed", String(pocketEditOn));
      renderPocketTargets();
    });
    renderPocketTargets();
  }

  // ---------- 目標線段 ----------
  let lineMode = false;
  const targetLines = [];   // { x1,y1,x2,y2 }（皆為相對座標）
  let drawingLine = null;   // { start:{fx,fy}, end:{fx,fy} }
  let targetLinesG = null;
  // ---------- 目標區塊 ----------
  let zoneMode = false;
  const targetZones = [];   // { x1,y1,x2,y2 }（相對座標，左上/右下）
  let drawingZone = null;
  let targetZonesG = null;

  // 把相對座標吸附到最近的格線交叉點（含庫邊最外圈）
  function nearestIntersection(fx, fy) {
    if (!gridVLines || !gridHLines) return { fx, fy };
    let gx = gridVLines[0], gy = gridHLines[0];
    for (const x of gridVLines) if (Math.abs(x - fx) < Math.abs(gx - fx)) gx = x;
    for (const y of gridHLines) if (Math.abs(y - fy) < Math.abs(gy - fy)) gy = y;
    return { fx: gx, fy: gy };
  }

  function renderTargetLines() {
    if (!targetLinesG) return;
    const NS = "http://www.w3.org/2000/svg";
    const r = tableRect();
    const s = r.width / TARGET_REF_W; // 與球桌等比例
    const strokeW = 8 * s;            // 線粗(6pt @1100)
    while (targetLinesG.firstChild) targetLinesG.removeChild(targetLinesG.firstChild);
    const mk = (ln, num, isPreview) => {
      const el = document.createElementNS(NS, "line");
      el.setAttribute("class", "target-line");
      el.setAttribute("x1", ln.x1 * r.width);
      el.setAttribute("y1", ln.y1 * r.height);
      el.setAttribute("x2", ln.x2 * r.width);
      el.setAttribute("y2", ln.y2 * r.height);
      el.setAttribute("stroke-width", strokeW);
      if (!isPreview) {
        el.addEventListener("dblclick", (ev) => {
          ev.stopPropagation();
          const i = targetLines.indexOf(ln);
          if (i >= 0) targetLines.splice(i, 1); // 刪除後 forEach 重新編號自動往前排
          renderTargetLines();
        });
      }
      targetLinesG.appendChild(el);
      // 線段編號（標在中點）
      const t = document.createElementNS(NS, "text");
      t.setAttribute("class", "target-line-num");
      t.setAttribute("x", ((ln.x1 + ln.x2) / 2) * r.width);
      t.setAttribute("y", ((ln.y1 + ln.y2) / 2) * r.height);
      t.style.fontSize = 16 * s + "px";   // 字級依比例
      t.style.strokeWidth = 3 * s + "px"; // 白邊依比例
      t.textContent = String(num);
      targetLinesG.appendChild(t);
    };
    targetLines.forEach((ln, i) => mk(ln, i + 1, false)); // 編號 = 索引+1
    if (drawingLine) {
      mk({
        x1: drawingLine.start.fx, y1: drawingLine.start.fy,
        x2: drawingLine.end.fx, y2: drawingLine.end.fy,
      }, targetLines.length + 1, true);
    }
  }

  function initLineTarget() {
    targetLinesG = document.getElementById("targetLines");
    const layer = document.getElementById("targetLayer");
    const btn = document.getElementById("lineTargetBtn");
    if (!btn || !targetLinesG || !layer) return;

    btn.addEventListener("click", () => {
      lineMode = !lineMode;
      if (lineMode && zoneMode) disableZoneMode();      // 與目標區塊互斥
      btn.classList.toggle("active", lineMode);
      btn.setAttribute("aria-pressed", String(lineMode));
      layer.classList.toggle("line-edit", lineMode);    // 讓線段可點(雙擊刪除)
      layer.style.pointerEvents = (lineMode || zoneMode) ? "auto" : "none";
      renderTargetLines();
    });

    layer.addEventListener("pointerdown", (e) => {
      if (!lineMode) return;
      if (e.target.classList && e.target.classList.contains("pocket-target")) return; // 讓袋口圈自己處理
      if (e.target.classList && e.target.classList.contains("target-line")) return;    // 點在既有線上(留給雙擊刪除)
      e.preventDefault();
      e.stopPropagation();
      const f = clientToWrapFraction(e.clientX, e.clientY);
      const start = nearestIntersection(f.fx, f.fy);
      drawingLine = { start, end: start };
      const move = (ev) => {
        const ff = clientToWrapFraction(ev.clientX, ev.clientY);
        drawingLine.end = nearestIntersection(ff.fx, ff.fy);
        renderTargetLines();
      };
      const up = (ev) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const ff = clientToWrapFraction(ev.clientX, ev.clientY);
        const end = nearestIntersection(ff.fx, ff.fy);
        if (end.fx !== start.fx || end.fy !== start.fy) {
          targetLines.push({ x1: start.fx, y1: start.fy, x2: end.fx, y2: end.fy });
        }
        drawingLine = null;
        renderTargetLines();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      renderTargetLines();
    });

    renderTargetLines();
  }

  // 互斥：關閉目標線段 / 目標區塊（被另一個開啟時呼叫）
  function disableLineMode() {
    lineMode = false;
    const b = document.getElementById("lineTargetBtn");
    if (b) { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); }
    const layer = document.getElementById("targetLayer");
    if (layer) layer.classList.remove("line-edit");
    renderTargetLines();
  }
  function disableZoneMode() {
    zoneMode = false;
    const b = document.getElementById("zoneTargetBtn");
    if (b) { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); }
    const layer = document.getElementById("targetLayer");
    if (layer) layer.classList.remove("zone-edit");
    renderTargetZones();
  }

  // ---------- 目標區塊：白色半透明方塊 ----------
  function renderTargetZones() {
    if (!targetZonesG) return;
    const NS = "http://www.w3.org/2000/svg";
    const r = tableRect();
    const strokeW = 2 * (r.width / TARGET_REF_W); // 邊框依球桌比例
    while (targetZonesG.firstChild) targetZonesG.removeChild(targetZonesG.firstChild);
    const mk = (z, isPreview) => {
      const x = Math.min(z.x1, z.x2), y = Math.min(z.y1, z.y2);
      const w = Math.abs(z.x2 - z.x1), h = Math.abs(z.y2 - z.y1);
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("class", "target-zone");
      rect.setAttribute("x", x * r.width);
      rect.setAttribute("y", y * r.height);
      rect.setAttribute("width", w * r.width);
      rect.setAttribute("height", h * r.height);
      rect.setAttribute("stroke-width", strokeW);
      if (!isPreview) {
        rect.addEventListener("dblclick", (ev) => {
          ev.stopPropagation();
          const i = targetZones.indexOf(z);
          if (i >= 0) targetZones.splice(i, 1);
          renderTargetZones();
        });
      }
      targetZonesG.appendChild(rect);
    };
    targetZones.forEach((z) => mk(z, false));
    if (drawingZone) {
      mk({ x1: drawingZone.start.fx, y1: drawingZone.start.fy, x2: drawingZone.end.fx, y2: drawingZone.end.fy }, true);
    }
  }

  function initZoneTarget() {
    targetZonesG = document.getElementById("targetZones");
    const layer = document.getElementById("targetLayer");
    const btn = document.getElementById("zoneTargetBtn");
    if (!btn || !targetZonesG || !layer) return;

    btn.addEventListener("click", () => {
      zoneMode = !zoneMode;
      if (zoneMode && lineMode) disableLineMode(); // 與目標線段互斥
      btn.classList.toggle("active", zoneMode);
      btn.setAttribute("aria-pressed", String(zoneMode));
      layer.classList.toggle("zone-edit", zoneMode);
      layer.style.pointerEvents = (zoneMode || lineMode) ? "auto" : "none";
      renderTargetZones();
    });

    // 取點：吸附格線開啟時吸到交叉點(含庫邊)，否則自由
    const pick = (cx, cy) => {
      const f = clientToWrapFraction(cx, cy);
      if (snapOn) return nearestIntersection(f.fx, f.fy);
      return { fx: clamp(f.fx, 0, 1), fy: clamp(f.fy, 0, 1) };
    };

    layer.addEventListener("pointerdown", (e) => {
      if (!zoneMode) return;
      const cl = e.target.classList;
      if (cl && (cl.contains("pocket-target") || cl.contains("target-line") || cl.contains("target-zone"))) return;
      e.preventDefault();
      e.stopPropagation();
      const start = pick(e.clientX, e.clientY);
      drawingZone = { start, end: start };
      const move = (ev) => { drawingZone.end = pick(ev.clientX, ev.clientY); renderTargetZones(); };
      const up = (ev) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const end = pick(ev.clientX, ev.clientY);
        if (Math.abs(end.fx - start.fx) > 0.001 && Math.abs(end.fy - start.fy) > 0.001) {
          targetZones.push({ x1: start.fx, y1: start.fy, x2: end.fx, y2: end.fy });
        }
        drawingZone = null;
        renderTargetZones();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      renderTargetZones();
    });

    renderTargetZones();
  }

  // 說明：白色圓角文字方塊，寬固定 400pt、高度隨文字自動增減，可拖標題列移動
  // 說明視窗的「遊戲規則」單選窗格設定
  const NOTE_RULES = [
    { group: "子球", items: [
      { key: "ballOrder",  label: "順序規則", opts: ["任意順序", "要照順序打"] },
      { key: "ballPlace",  label: "擺球規則", opts: ["不顯示", "邊緣子球不貼顆星邊", "子球凍結球"] },
      { key: "ballPath",   label: "路線要求", opts: ["不顯示", "需要經過目標線段"] },
      { key: "ballPocket", label: "落點要求", opts: ["六個袋都可以打", "打進目標袋口", "停在目標區塊"] },
    ] },
    { group: "母球", items: [
      { key: "cueStart",  label: "起手規則", opts: ["不顯示", "母球自由球"] },
      { key: "cueTouch",  label: "接觸顆星", opts: ["不顯示", "母球不能到碰顆星邊"] },
      { key: "cuePath",   label: "路線要求", opts: ["不顯示", "母球依序經過目標線段"] },
      { key: "cuePocket", label: "落點要求", opts: ["不顯示", "母球停在目標區塊", "母球進入目標袋口"] },
    ] },
  ];

  function buildNoteRules() {
    const root = document.getElementById("noteRules");
    if (!root || root.dataset.built) return;
    let html = '<div class="note-rules-title">遊戲規則：</div>';
    NOTE_RULES.forEach((g) => {
      html += '<div class="note-rules-group">' + g.group + "：</div>";
      g.items.forEach((it) => {
        html += '<div class="note-rule"><span class="note-rule-label">' + it.label + "：</span>";
        html += '<span class="note-rule-opts">';
        it.opts.forEach((o, i) => {
          html += '<label class="note-rule-opt"><input type="radio" name="nr_' + it.key + '" value="' + i + '"' +
            (i === 0 ? " checked" : "") + ">" + o + "</label>";
        });
        html += "</span></div>";
      });
    });
    root.innerHTML = html;
    root.dataset.built = "1";
  }
  function getNoteRules() {
    const out = {};
    NOTE_RULES.forEach((g) => g.items.forEach((it) => {
      const sel = document.querySelector('input[name="nr_' + it.key + '"]:checked');
      out[it.key] = sel ? Number(sel.value) : 0;
    }));
    return out;
  }
  function setNoteRules(rules) {
    NOTE_RULES.forEach((g) => g.items.forEach((it) => {
      const v = rules && rules[it.key] != null ? rules[it.key] : 0;
      const el = document.querySelector('input[name="nr_' + it.key + '"][value="' + v + '"]');
      if (el) el.checked = true;
    }));
  }

  function initNote() {
    const btn = document.getElementById("noteBtn");
    const box = document.getElementById("noteBox");
    const header = document.getElementById("noteHeader");
    const input = document.getElementById("noteInput");
    if (!btn || !box || !header || !input) return;
    buildNoteRules();

    const autoGrow = () => {
      input.style.height = "auto";
      input.style.height = input.scrollHeight + "px"; // 高度跟著文字增減
    };
    input.addEventListener("input", autoGrow);

    btn.addEventListener("click", () => {
      const show = box.hasAttribute("hidden");
      box.toggleAttribute("hidden", !show);
      btn.classList.toggle("active", show);
      btn.setAttribute("aria-pressed", String(show));
      if (show) { autoGrow(); input.focus(); }
    });

    // 拖曳：以「說明：」標題列當把手
    header.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      const offset = { x: e.clientX - r.left, y: e.clientY - r.top };
      const move = (ev) => {
        box.style.left = ev.clientX - offset.x + "px";
        box.style.top = ev.clientY - offset.y + "px";
        storeFloatingPos(box, notePos); // 記住相對球桌位置
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
  }

  // 母球打點：浮動母球面，可拖整顆移動、可在球面上拖曳打點（限制在球內）
  function initCueball() {
    const btn = document.getElementById("cueBtn");
    const widget = document.getElementById("cueballWidget");
    const img = document.getElementById("cueballImg");
    const sp = document.getElementById("strikePoint");
    if (!btn || !widget || !sp) return;
    if (CFG.CUEBALL_IMAGE) img.src = CFG.CUEBALL_IMAGE;

    // 切換顯示
    btn.addEventListener("click", () => {
      const show = widget.hasAttribute("hidden");
      widget.toggleAttribute("hidden", !show);
      btn.classList.toggle("active", show);
      btn.setAttribute("aria-pressed", String(show));
    });

    let mode = null;       // 'widget' | 'strike'
    let offset = { x: 0, y: 0 };

    function onMove(e) {
      const r = widget.getBoundingClientRect();
      if (mode === "strike") {
        // 打點限制在球面內（球半徑 − 打點半徑 − 邊線）
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let dx = e.clientX - cx, dy = e.clientY - cy;
        const maxR = r.width / 2 - sp.getBoundingClientRect().width / 2 - r.width * 0.015; // 含縮放

        const dist = Math.hypot(dx, dy);
        if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
        sp.style.left = 50 + (dx / r.width) * 100 + "%";
        sp.style.top = 50 + (dy / r.height) * 100 + "%";
      } else if (mode === "widget") {
        widget.style.left = e.clientX - offset.x + "px";
        widget.style.top = e.clientY - offset.y + "px";
        storeFloatingPos(widget, cuePos); // 記住相對球桌位置
      }
    }
    function onUp() {
      mode = null;
      widget.classList.remove("dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    function start(which, e) {
      mode = which;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }

    sp.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation(); // 不要觸發整顆母球的拖曳
      start("strike", e);
    });
    widget.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const r = widget.getBoundingClientRect();
      offset = { x: e.clientX - r.left, y: e.clientY - r.top };
      widget.classList.add("dragging");
      start("widget", e);
    });
  }

  // 球桌下方「顯示/隱藏格線」按鈕：切換格線層（透明 PNG，疊在球桌上、球之下）
  function setGrid(on) {
    gridOn = on;
    const gridImg = document.getElementById("gridImg");
    const btn = document.getElementById("gridToggle");
    if (gridImg) gridImg.style.display = on ? "block" : "none";
    if (btn) {
      btn.textContent = "格線";
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    }
  }
  function initGridToggle() {
    const btn = document.getElementById("gridToggle");
    const gridImg = document.getElementById("gridImg");
    if (!btn || !gridImg || !CFG.GRID_IMAGE) return;
    gridImg.src = CFG.GRID_IMAGE; // 預載
    setGrid(false);
    btn.addEventListener("click", () => setGrid(!gridOn));
  }

  // 球桌下方「吸附格線」按鈕：開啟後球會吸附到最近的格線交叉點
  function setSnap(on) {
    snapOn = on;
    const btn = document.getElementById("snapToggle");
    if (btn) {
      btn.textContent = on ? "取消吸附" : "吸附格線";
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    }
  }
  function initSnapToggle() {
    const btn = document.getElementById("snapToggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      setSnap(!snapOn);
      if (snapOn) snapAllBalls(); // 開啟時把現有的球也吸到交叉點
    });
  }

  // 把目前桌上所有球依吸附規則重新定位（吸到最近的格線/交叉點/庫邊）
  function snapAllBalls() {
    placedBalls.forEach((b) => {
      const p = constrainBall(b.cfg, b.fx, b.fy, b);
      b.fx = p.fx; b.fy = p.fy; applyBallPos(b);
    });
    updateSelectionUI();
    renderPaths();
  }

  // ---------- 繪製路徑（多段：碰球/庫邊放假想球當轉彎點）----------
  // 取得一條路徑的頂點陣列（起點之後的點；ghost=true 代表是假想球轉彎點）
  function pathVertices(p) {
    if (p.vertices) return p.vertices; // 已完成的路徑
    return p.locked
      .map((v) => ({ fx: v.fx, fy: v.fy, ghost: true }))
      .concat([{ fx: p.live.fx, fy: p.live.fy, ghost: false }]); // 繪製中：鎖定點 + 活動端
  }

  function renderPaths() {
    if (!pathLines) return;
    const NS = "http://www.w3.org/2000/svg";
    const r = tableRect();
    while (pathLines.firstChild) pathLines.removeChild(pathLines.firstChild);
    const all = drawingPath ? paths.concat([drawingPath]) : paths;
    for (const p of all) {
      if (!p.ball || placedBalls.indexOf(p.ball) < 0) continue; // 球已不在
      const color = (p.ball.cfg && p.ball.cfg.pathColor) || "#ffffff";
      const verts = pathVertices(p);
      const pts = [{ fx: p.ball.fx, fy: p.ball.fy }].concat(verts); // 起點＝球心
      if (pts.length < 2) continue;
      const poly = document.createElementNS(NS, "polyline");
      poly.setAttribute("class", "path-line");
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke", color);
      poly.setAttribute("marker-end", "url(#pathArrow)");
      poly.setAttribute("points", pts.map((v) => `${v.fx * r.width},${v.fy * r.height}`).join(" "));
      pathLines.appendChild(poly);
      // 假想球（轉彎點）：球大小的圓圈
      const radPx = ballDiameterPx(p.ball.cfg) / 2;
      for (const v of verts) {
        if (!v.ghost) continue;
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("class", "ghost-ball-mark");
        c.setAttribute("cx", v.fx * r.width);
        c.setAttribute("cy", v.fy * r.height);
        c.setAttribute("r", radPx);
        c.setAttribute("stroke", color);
        pathLines.appendChild(c);
      }
    }
  }

  // anchor→target 線段上第一個接觸點（球或庫邊）；回 {fx,fy,ball}（ball=null 代表庫邊）或 null。
  // 全程在等比例 u 空間 (x=fx, y=fy/aspect) 計算，距離才正確。
  function firstContact(sourceBall, anchor, target, lastBall) {
    const aspect = tableAspect();
    const D = ballWidthFraction(sourceBall.cfg); // 兩球相切的圓心距
    const { rx, ry } = ballRadiusFractions(sourceBall.cfg);
    const ax = anchor.fx, ay = anchor.fy / aspect;
    let dx = target.fx - ax, dy = target.fy / aspect - ay;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-9) return null;
    dx /= segLen; dy /= segLen;
    const EPS = 1e-4;
    let bestT = segLen, best = null;
    // 與其他球相切
    for (const b of placedBalls) {
      if (b === sourceBall || b === lastBall) continue;
      const ox = ax - b.fx, oy = ay - b.fy / aspect;
      const bq = dx * ox + dy * oy;          // 半線性係數
      const disc = bq * bq - (ox * ox + oy * oy - D * D);
      if (disc < 0) continue;
      const t = -bq - Math.sqrt(disc);        // 進入點（較小根）
      if (t > EPS && t < bestT) { bestT = t; best = { fx: ax + dx * t, fyu: ay + dy * t, ball: b }; }
    }
    // 庫邊：矩形可放置區（球心界）的離開點
    const minX = P.left + rx, maxX = 1 - P.right - rx;
    const minY = (P.top + ry) / aspect, maxY = (1 - P.bottom - ry) / aspect;
    // 六個袋口（四角 + 上下中袋）的位置與判定半徑：落在袋口就不算庫邊接觸（球進袋、不畫假想球）
    const pocketR = D * 1.8;
    const pockets = [
      [minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY], [0.5, minY], [0.5, maxY],
    ];
    const isPocket = (px, py) => pockets.some(([qx, qy]) => Math.hypot(px - qx, py - qy) < pocketR);
    const tryBound = (t) => {
      if (!(t > EPS && t < bestT)) return;
      const px = ax + dx * t, py = ay + dy * t;
      if (px >= minX - 1e-6 && px <= maxX + 1e-6 && py >= minY - 1e-6 && py <= maxY + 1e-6) {
        if (isPocket(px, py)) return; // 袋口：不算接觸 → 不畫假想球
        bestT = t; best = { fx: px, fyu: py, ball: null };
      }
    };
    if (Math.abs(dx) > 1e-12) { tryBound((minX - ax) / dx); tryBound((maxX - ax) / dx); }
    if (Math.abs(dy) > 1e-12) { tryBound((minY - ay) / dy); tryBound((maxY - ay) / dy); }
    if (!best) return null;
    return { fx: best.fx, fy: best.fyu * aspect, ball: best.ball };
  }

  // 活動端：夾在可放置區內（碰到球後可穿過該球，不再卡住）
  function pathLiveEnd(sourceBall, target) {
    const { rx, ry } = ballRadiusFractions(sourceBall.cfg);
    return {
      fx: clamp(target.fx, P.left + rx, 1 - P.right - rx),
      fy: clamp(target.fy, P.top + ry, 1 - P.bottom - ry),
    };
  }

  // 拖曳中推進路徑：沿途碰到球/庫邊就鎖定假想球（轉彎點），活動端跟游標。
  // 剛接觸的那顆球(lastBall)不再重複偵測，因此後續路徑可直接穿過它。
  function advanceDrawingPath(cursor) {
    const dp = drawingPath;
    let anchor = dp.locked.length ? dp.locked[dp.locked.length - 1] : { fx: dp.ball.fx, fy: dp.ball.fy };
    for (let guard = 0; guard < 16; guard++) {
      const c = firstContact(dp.ball, anchor, cursor, dp.lastBall);
      if (!c) break;
      dp.locked.push({ fx: c.fx, fy: c.fy });
      dp.lastBall = c.ball; // 庫邊為 null
      anchor = { fx: c.fx, fy: c.fy };
    }
    dp.live = pathLiveEnd(dp.ball, cursor);
  }

  // 移除某顆球的路徑
  function removePathsOfBall(b) {
    for (let i = paths.length - 1; i >= 0; i--) if (paths[i].ball === b) paths.splice(i, 1);
  }

  function initPathToggle() {
    pathLines = document.getElementById("pathLines");
    const btn = document.getElementById("pathToggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      pathMode = !pathMode;
      btn.textContent = "路線";
      btn.classList.toggle("active", pathMode);
      btn.setAttribute("aria-pressed", String(pathMode));
    });
  }

  // 載入紅色範圍指引圖，建立可放置區遮罩（含袋口突起、角落斜切）
  function initRedMask() {
    if (!CFG.AMBIT_IMAGE) return;
    const img = new Image();
    img.onload = () => {
      try { redMask = buildRedMask(img); }
      catch (e) { console.warn("紅色範圍遮罩建立失敗，改用矩形後備：", e); }
    };
    img.onerror = () => console.warn("找不到 AMBIT_IMAGE，改用矩形後備邊界");
    img.src = CFG.AMBIT_IMAGE;
  }

  function initRack() {
    CFG.BALLS.forEach((cfg) => {
      const item = document.createElement("div");
      item.className = "rack-item";
      item.appendChild(buildVisual(cfg));
      item.addEventListener("pointerdown", (e) => onRackPointerDown(cfg, e));
      rackItems.appendChild(item);
    });
  }

  // 點球桌空白處（非球）→ 取消選取
  function onTablePointerDown(e) {
    if (!e.target.closest(".ball")) clearSelection();
  }

  // ---------- 存檔 / 讀取（localStorage） ----------
  const SAVE_KEY = "poolDiagramSaves";

  function serializeState() {
    const sp = document.getElementById("strikePoint");
    const w = document.getElementById("cueballWidget");
    const nb = document.getElementById("noteBox");
    return {
      v: 1,
      balls: placedBalls.map((b) => ({ id: b.cfg.id, fx: b.fx, fy: b.fy })),
      paths: paths.map((p) => ({
        ball: placedBalls.indexOf(p.ball),
        vertices: p.vertices.map((vx) => ({ fx: vx.fx, fy: vx.fy, ghost: !!vx.ghost })),
      })),
      pockets: pocketSelected.slice(),
      lines: targetLines.map((l) => ({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 })),
      zones: targetZones.map((z) => ({ x1: z.x1, y1: z.y1, x2: z.x2, y2: z.y2 })),
      grid: gridOn,
      snap: snapOn,
      cue: {
        shown: !!(w && !w.hasAttribute("hidden")),
        fx: cuePos.fx, fy: cuePos.fy,
        sx: sp ? sp.style.left || "50%" : "50%",
        sy: sp ? sp.style.top || "50%" : "50%",
      },
      note: {
        shown: !!(nb && !nb.hasAttribute("hidden")),
        fx: notePos.fx, fy: notePos.fy,
        desc: document.getElementById("noteInput").value,
        pass: document.getElementById("noteCondPass").value,
        total: document.getElementById("noteCondTotal").value,
        rules: getNoteRules(),
      },
    };
  }

  function clearAllDrawing() {
    placedBalls.forEach((b) => b.el.remove());
    placedBalls.length = 0;
    paths.length = 0;
    clearSelection();
    for (let i = 0; i < pocketSelected.length; i++) pocketSelected[i] = false;
    targetLines.length = 0;
    targetZones.length = 0;
  }

  // 重置：把桌面清空回到初始狀態（不影響已儲存的檔案）
  function resetAll() {
    clearAllDrawing();
    // 母球打點
    const cw = document.getElementById("cueballWidget");
    const cb = document.getElementById("cueBtn");
    const sp = document.getElementById("strikePoint");
    if (cw) cw.setAttribute("hidden", "");
    if (cb) { cb.classList.remove("active"); cb.setAttribute("aria-pressed", "false"); }
    if (sp) { sp.style.left = "50%"; sp.style.top = "50%"; }
    // 說明
    const nb = document.getElementById("noteBox");
    const nbtn = document.getElementById("noteBtn");
    if (nb) nb.setAttribute("hidden", "");
    if (nbtn) { nbtn.classList.remove("active"); nbtn.setAttribute("aria-pressed", "false"); }
    const ni = document.getElementById("noteInput"); if (ni) ni.value = "";
    const np = document.getElementById("noteCondPass"); if (np) np.value = "";
    const nt = document.getElementById("noteCondTotal"); if (nt) nt.value = "";
    setNoteRules({}); // 規則回到預設（各列第一個選項）
    // 檔名欄
    const sn = document.getElementById("saveName"); if (sn) sn.value = "";
    // 重繪
    renderPaths();
    renderPocketTargets();
    renderTargetLines();
    renderTargetZones();
    updateFloatingScale();
  }

  function initResetBtn() {
    const btn = document.getElementById("resetBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (!confirm("確定要重置嗎？\n目前桌面上的所有球、路徑、目標與說明都會清空。\n（不影響已儲存的檔案）")) return;
      resetAll();
    });
  }

  function deserializeState(st) {
    if (!st) return;
    clearAllDrawing();
    (st.balls || []).forEach((b) => {
      const cfg = CFG.BALLS.find((c) => c.id === b.id);
      if (cfg) placeBall(cfg, b.fx, b.fy);
    });
    (st.paths || []).forEach((p) => {
      const ball = placedBalls[p.ball];
      if (ball) paths.push({ ball, vertices: (p.vertices || []).map((vx) => ({ fx: vx.fx, fy: vx.fy, ghost: !!vx.ghost })) });
    });
    if (st.pockets) st.pockets.forEach((vv, i) => { if (i < pocketSelected.length) pocketSelected[i] = !!vv; });
    (st.lines || []).forEach((l) => targetLines.push({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 }));
    (st.zones || []).forEach((z) => targetZones.push({ x1: z.x1, y1: z.y1, x2: z.x2, y2: z.y2 }));
    setGrid(!!st.grid);
    setSnap(!!st.snap);
    // 母球打點
    if (st.cue) {
      cuePos = { fx: st.cue.fx, fy: st.cue.fy };
      const sp = document.getElementById("strikePoint");
      const w = document.getElementById("cueballWidget");
      const cb = document.getElementById("cueBtn");
      if (sp) { sp.style.left = st.cue.sx || "50%"; sp.style.top = st.cue.sy || "50%"; }
      if (w) w.toggleAttribute("hidden", !st.cue.shown);
      if (cb) { cb.classList.toggle("active", !!st.cue.shown); cb.setAttribute("aria-pressed", String(!!st.cue.shown)); }
    }
    // 說明
    if (st.note) {
      notePos = { fx: st.note.fx, fy: st.note.fy };
      const nb = document.getElementById("noteBox");
      const nbtn = document.getElementById("noteBtn");
      const ta = document.getElementById("noteInput");
      ta.value = st.note.desc || "";
      document.getElementById("noteCondPass").value = st.note.pass || "";
      document.getElementById("noteCondTotal").value = st.note.total || "";
      setNoteRules(st.note.rules);
      if (nb) nb.toggleAttribute("hidden", !st.note.shown);
      if (nbtn) { nbtn.classList.toggle("active", !!st.note.shown); nbtn.setAttribute("aria-pressed", String(!!st.note.shown)); }
      if (st.note.shown) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }
    }
    renderPaths();
    renderPocketTargets();
    renderTargetLines();
    renderTargetZones();
    updateFloatingScale();
  }

  function loadSaves() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); } catch (e) { return {}; } }
  function writeSaves(obj) { localStorage.setItem(SAVE_KEY, JSON.stringify(obj)); }

  // ───────── Google 雲端硬碟（前端直連，每人存自己的） ─────────
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  const Cloud = {
    tokenClient: null,
    accessToken: null,
    tokenExpiry: 0,
    folderId: null,        // 主資料夾 id（root）
    signedIn: false,
    folders: [],           // 分類子資料夾 [{id,name}]
    currentFolderId: null, // 目前檢視的資料夾；null = 未分類（root 直屬檔案）
    contentCache: {},      // fileId -> {modifiedTime, content}（含縮圖，避免重複下載）
  };

  function cloudConfigured() {
    return !!(CFG.GOOGLE && CFG.GOOGLE.CLIENT_ID && CFG.GOOGLE.CLIENT_ID.trim());
  }
  function cloudFolderName() {
    return (CFG.GOOGLE && CFG.GOOGLE.FOLDER_NAME) || "Poolgress 撞球練習圖";
  }
  function gisReady() {
    return typeof google !== "undefined" && google.accounts && google.accounts.oauth2;
  }

  function ensureTokenClient() {
    if (Cloud.tokenClient || !gisReady() || !cloudConfigured()) return Cloud.tokenClient;
    Cloud.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CFG.GOOGLE.CLIENT_ID.trim(),
      scope: DRIVE_SCOPE,
      callback: () => {}, // 每次請求前覆寫
    });
    return Cloud.tokenClient;
  }

  // 取得 access token。interactive=true 會跳出 Google 登入/授權視窗。
  function requestToken(interactive) {
    return new Promise((resolve, reject) => {
      const client = ensureTokenClient();
      if (!client) { reject(new Error(gisReady() ? "尚未設定 Google Client ID" : "Google 登入元件尚未載入，請稍候再試")); return; }
      client.callback = (resp) => {
        if (resp && resp.error) { reject(new Error(resp.error)); return; }
        Cloud.accessToken = resp.access_token;
        Cloud.tokenExpiry = Date.now() + ((resp.expires_in || 3600) * 1000) - 60000;
        Cloud.signedIn = true;
        resolve(Cloud.accessToken);
      };
      try {
        client.requestAccessToken({ prompt: interactive ? "consent" : "" });
      } catch (e) { reject(e); }
    });
  }

  async function ensureToken() {
    if (Cloud.accessToken && Date.now() < Cloud.tokenExpiry) return Cloud.accessToken;
    return requestToken(false).catch(() => requestToken(true));
  }

  async function driveApi(path, opts = {}) {
    const token = await ensureToken();
    const r = await fetch("https://www.googleapis.com/" + path, {
      ...opts,
      headers: { Authorization: "Bearer " + token, ...(opts.headers || {}) },
    });
    if (r.status === 401) { // token 失效 → 重新授權再試一次
      Cloud.accessToken = null;
      const t2 = await requestToken(true);
      const r2 = await fetch("https://www.googleapis.com/" + path, {
        ...opts,
        headers: { Authorization: "Bearer " + t2, ...(opts.headers || {}) },
      });
      if (!r2.ok) throw new Error("Drive API " + r2.status + "：" + (await r2.text()));
      return r2;
    }
    if (!r.ok) throw new Error("Drive API " + r.status + "：" + (await r.text()));
    return r;
  }

  async function ensureFolder() {
    if (Cloud.folderId) return Cloud.folderId;
    const name = cloudFolderName().replace(/'/g, "\\'");
    const q = encodeURIComponent(
      "name='" + name + "' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    );
    const res = await driveApi("drive/v3/files?q=" + q + "&fields=files(id,name)&spaces=drive");
    const data = await res.json();
    if (data.files && data.files.length) { Cloud.folderId = data.files[0].id; return Cloud.folderId; }
    const create = await driveApi("drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cloudFolderName(), mimeType: "application/vnd.google-apps.folder" }),
    });
    Cloud.folderId = (await create.json()).id;
    return Cloud.folderId;
  }

  // ── 縮圖擷取：把球桌各圖層合成成一張 JPEG dataURL ──
  function layerVisible(el) {
    return el && el.naturalWidth > 0 && getComputedStyle(el).display !== "none";
  }
  function svgToImage(svgEl, w, h) {
    return new Promise((resolve) => {
      if (!svgEl) { resolve(null); return; }
      const clone = svgEl.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", w);
      clone.setAttribute("height", h);
      clone.setAttribute("viewBox", "0 0 " + w + " " + h);
      const str = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
    });
  }
  async function captureThumbnail() {
    try {
      const W = tableWrap.clientWidth, H = tableWrap.clientHeight;
      if (!W || !H) return null;
      const TW = 280, scale = TW / W, TH = Math.round(H * scale);
      const canvas = document.createElement("canvas");
      canvas.width = TW; canvas.height = TH;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0e0f12"; ctx.fillRect(0, 0, TW, TH);
      if (layerVisible(tableImg)) ctx.drawImage(tableImg, 0, 0, TW, TH);
      const gridImg = document.getElementById("gridImg");
      if (layerVisible(gridImg)) ctx.drawImage(gridImg, 0, 0, TW, TH);
      const cushionImg = document.getElementById("cushionImg");
      if (layerVisible(cushionImg)) ctx.drawImage(cushionImg, 0, 0, TW, TH);
      const pathImg = await svgToImage(document.getElementById("pathLayer"), W, H);
      if (pathImg) ctx.drawImage(pathImg, 0, 0, TW, TH);
      const wr = tableWrap.getBoundingClientRect();
      placedBalls.forEach((b) => {
        const img = b.el.querySelector("img");
        if (!img || !img.naturalWidth) return;
        const r = b.el.getBoundingClientRect();
        ctx.drawImage(img, (r.left - wr.left) * scale, (r.top - wr.top) * scale, r.width * scale, r.height * scale);
      });
      const tgtImg = await svgToImage(document.getElementById("targetLayer"), W, H);
      if (tgtImg) ctx.drawImage(tgtImg, 0, 0, TW, TH);
      return canvas.toDataURL("image/jpeg", 0.62);
    } catch (e) { return null; }
  }

  // ── 資料夾（Drive 子資料夾當分類） ──
  function currentParentId() { return Cloud.currentFolderId || Cloud.folderId; }

  async function cloudListFolders() {
    const root = await ensureFolder();
    const q = encodeURIComponent(
      "'" + root + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    );
    const res = await driveApi("drive/v3/files?q=" + q + "&fields=files(id,name)&orderBy=name&pageSize=200");
    Cloud.folders = (await res.json()).files || [];
    return Cloud.folders;
  }
  async function cloudCreateFolder(name) {
    const root = await ensureFolder();
    const res = await driveApi("drive/v3/files?fields=id,name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, mimeType: "application/vnd.google-apps.folder", parents: [root] }),
    });
    return res.json();
  }
  async function cloudDeleteFolder(folderId) {
    // 先把資料夾內檔案搬回未分類（root），再刪掉資料夾
    const root = await ensureFolder();
    const files = await cloudList(folderId);
    for (const f of files) await cloudMoveFile(f.id, folderId, root);
    await driveApi("drive/v3/files/" + folderId, { method: "DELETE" });
  }

  // ── 檔案（限定在某資料夾內） ──
  async function cloudList(parentId) {
    const q = encodeURIComponent(
      "'" + parentId + "' in parents and trashed=false and mimeType='application/json'"
    );
    const res = await driveApi(
      "drive/v3/files?q=" + q + "&fields=files(id,name,modifiedTime,parents)&orderBy=modifiedTime desc&pageSize=200"
    );
    return (await res.json()).files || [];
  }

  async function cloudFindByName(fileName, parentId) {
    const q = encodeURIComponent(
      "'" + parentId + "' in parents and name='" + fileName.replace(/'/g, "\\'") + "' and trashed=false"
    );
    const res = await driveApi("drive/v3/files?q=" + q + "&fields=files(id)");
    const files = (await res.json()).files || [];
    return files.length ? files[0].id : null;
  }

  async function cloudSave(name, dataObj, thumb, parentId) {
    const fileName = name + ".json";
    const content = JSON.stringify({ v: 1, data: dataObj, savedAt: Date.now(), thumb: thumb || "" });
    const existId = await cloudFindByName(fileName, parentId);
    if (existId) {
      await driveApi("upload/drive/v3/files/" + existId + "?uploadType=media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: content,
      });
      delete Cloud.contentCache[existId];
      return existId;
    }
    const boundary = "poolgress_boundary_" + name.length + "_" + content.length;
    const metadata = { name: fileName, parents: [parentId], mimeType: "application/json" };
    const body =
      "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      "\r\n--" + boundary + "\r\nContent-Type: application/json\r\n\r\n" +
      content +
      "\r\n--" + boundary + "--";
    const res = await driveApi("upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { "Content-Type": "multipart/related; boundary=" + boundary },
      body,
    });
    return (await res.json()).id;
  }

  async function cloudMoveFile(fileId, fromId, toId) {
    if (fromId === toId) return;
    await driveApi(
      "drive/v3/files/" + fileId + "?addParents=" + toId + "&removeParents=" + fromId + "&fields=id",
      { method: "PATCH" }
    );
  }

  async function cloudLoad(fileId) {
    const res = await driveApi("drive/v3/files/" + fileId + "?alt=media");
    return res.json();
  }
  async function cloudGetContent(file) {
    const c = Cloud.contentCache[file.id];
    if (c && c.modifiedTime === file.modifiedTime) return c.content;
    const content = await cloudLoad(file.id);
    Cloud.contentCache[file.id] = { modifiedTime: file.modifiedTime, content };
    return content;
  }

  async function cloudDelete(fileId) {
    await driveApi("drive/v3/files/" + fileId, { method: "DELETE" });
    delete Cloud.contentCache[fileId];
  }

  // 雲端 UI ───────────────────────────────────────────────
  function setCloudStatus(text) {
    const el = document.getElementById("cloudStatus");
    if (el) el.textContent = text;
  }
  function setCloudBusy(busy) {
    ["cloudAuthBtn", "cloudSaveBtn"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.disabled = busy || (id === "cloudSaveBtn" && !Cloud.signedIn);
    });
  }

  // 資料夾列（chips）
  function renderCloudFolders() {
    const bar = document.getElementById("cloudFolders");
    if (!bar) return;
    bar.innerHTML = "";
    if (!Cloud.signedIn) return;
    const mkChip = (label, id) => {
      const chip = document.createElement("button");
      chip.className = "cloud-folder-chip" + (Cloud.currentFolderId === id ? " active" : "");
      chip.textContent = label;
      chip.addEventListener("click", () => { Cloud.currentFolderId = id; refreshCloudList(); });
      // 非「未分類」可刪除
      if (id) {
        const x = document.createElement("span");
        x.className = "cloud-folder-x"; x.textContent = "×"; x.title = "刪除資料夾（內含檔案會移回未分類）";
        x.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm('刪除資料夾「' + label + '」？\n裡面的檔案會移回「未分類」。')) return;
          try {
            await cloudDeleteFolder(id);
            if (Cloud.currentFolderId === id) Cloud.currentFolderId = null;
            await refreshCloudList();
          } catch (err) { alert("刪除資料夾失敗：" + err.message); }
        });
        chip.appendChild(x);
      }
      return chip;
    };
    bar.appendChild(mkChip("未分類", null));
    Cloud.folders.forEach((f) => bar.appendChild(mkChip(f.name, f.id)));
    const add = document.createElement("button");
    add.className = "cloud-folder-add"; add.textContent = "＋ 新資料夾";
    add.addEventListener("click", async () => {
      const name = (prompt("新資料夾名稱：") || "").trim();
      if (!name) return;
      try { await cloudCreateFolder(name); await cloudListFolders(); renderCloudFolders(); }
      catch (e) { alert("建立資料夾失敗：" + e.message); }
    });
    bar.appendChild(add);
  }

  function renderCloudList(files) {
    const list = document.getElementById("cloudList");
    if (!list) return;
    list.innerHTML = "";
    if (!Cloud.signedIn) { list.innerHTML = '<div class="save-empty">登入後即可看到雲端存檔</div>'; return; }
    if (!files || !files.length) { list.innerHTML = '<div class="save-empty">這個資料夾還沒有存檔</div>'; return; }
    const root = Cloud.folderId;
    files.forEach((f) => {
      const name = f.name.replace(/\.json$/i, "");
      const card = document.createElement("div"); card.className = "cloud-card";
      const thumb = document.createElement("div"); thumb.className = "cloud-thumb";
      const timg = document.createElement("img"); timg.alt = ""; timg.loading = "lazy";
      thumb.appendChild(timg);
      // 點縮圖 = 讀取
      thumb.addEventListener("click", () => loadCloudFile(f, name));
      const nm = document.createElement("div"); nm.className = "cloud-card-name"; nm.textContent = name; nm.title = name;
      const tm = document.createElement("div"); tm.className = "cloud-card-time";
      tm.textContent = f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : "";
      const actions = document.createElement("div"); actions.className = "cloud-card-actions";
      const loadB = document.createElement("button"); loadB.className = "ctrl-btn"; loadB.textContent = "讀取";
      loadB.addEventListener("click", () => loadCloudFile(f, name));
      // 移動到…
      const sel = document.createElement("select"); sel.className = "cloud-move";
      const cur = (f.parents && f.parents[0]) || root;
      const opt0 = document.createElement("option"); opt0.value = "__move__"; opt0.textContent = "移動到…"; opt0.disabled = true; opt0.selected = true;
      sel.appendChild(opt0);
      const dests = [{ id: root, name: "未分類" }].concat(Cloud.folders);
      dests.forEach((d) => {
        if (d.id === cur) return;
        const o = document.createElement("option"); o.value = d.id; o.textContent = "→ " + d.name; sel.appendChild(o);
      });
      sel.addEventListener("change", async () => {
        const to = sel.value; if (to === "__move__") return;
        sel.disabled = true;
        try { await cloudMoveFile(f.id, cur, to); await refreshCloudList(); }
        catch (e) { alert("移動失敗：" + e.message); sel.disabled = false; sel.value = "__move__"; }
      });
      const delB = document.createElement("button"); delB.className = "ctrl-btn"; delB.textContent = "刪除";
      delB.addEventListener("click", async () => {
        if (!confirm('刪除雲端存檔「' + name + '」？')) return;
        delB.disabled = true;
        try { await cloudDelete(f.id); await refreshCloudList(); }
        catch (e) { alert("刪除失敗：" + e.message); delB.disabled = false; }
      });
      actions.appendChild(loadB); actions.appendChild(sel); actions.appendChild(delB);
      card.appendChild(thumb); card.appendChild(nm); card.appendChild(tm); card.appendChild(actions);
      list.appendChild(card);
      // 非同步載入縮圖
      cloudGetContent(f).then((obj) => {
        if (obj && obj.thumb) timg.src = obj.thumb;
        else thumb.classList.add("no-thumb");
      }).catch(() => thumb.classList.add("no-thumb"));
    });
  }

  async function loadCloudFile(f, name) {
    try {
      const obj = await cloudGetContent(f);
      deserializeState(obj && obj.data ? obj.data : obj);
      document.getElementById("saveName").value = name;
      document.getElementById("saveModal").setAttribute("hidden", "");
    } catch (e) { alert("讀取失敗：" + e.message); }
  }

  async function refreshCloudList() {
    const list = document.getElementById("cloudList");
    if (!Cloud.signedIn) { renderCloudFolders(); renderCloudList(null); return; }
    if (list) list.innerHTML = '<div class="save-empty">讀取中…</div>';
    try {
      await cloudListFolders();
      // 若目前資料夾已被刪除，退回未分類
      if (Cloud.currentFolderId && !Cloud.folders.some((x) => x.id === Cloud.currentFolderId)) Cloud.currentFolderId = null;
      renderCloudFolders();
      const files = await cloudList(currentParentId());
      renderCloudList(files);
    } catch (e) {
      if (list) list.innerHTML = '<div class="save-empty">讀取失敗：' + e.message + "</div>";
    }
  }

  async function cloudSignIn() {
    if (!cloudConfigured()) { alert("尚未設定 Google Client ID（請填入 config.js 的 GOOGLE.CLIENT_ID）"); return; }
    setCloudBusy(true);
    setCloudStatus("登入中…");
    try {
      await requestToken(true);
      Cloud.signedIn = true;
      setCloudStatus("已連線");
      const sBtn = document.getElementById("cloudSaveBtn"); if (sBtn) sBtn.disabled = false;
      const aBtn = document.getElementById("cloudAuthBtn"); if (aBtn) aBtn.textContent = "重新登入";
      await refreshCloudList();
    } catch (e) {
      Cloud.signedIn = false;
      setCloudStatus("登入失敗");
      alert("Google 登入失敗：" + e.message);
    } finally { setCloudBusy(false); }
  }

  function renderSaveList() {
    const list = document.getElementById("saveList");
    if (!list) return;
    const all = loadSaves();
    const names = Object.keys(all).sort((a, b) => (all[b].savedAt || 0) - (all[a].savedAt || 0));
    list.innerHTML = "";
    if (!names.length) { list.innerHTML = '<div class="save-empty">尚無存檔</div>'; return; }
    names.forEach((name) => {
      const row = document.createElement("div");
      row.className = "save-item";
      const info = document.createElement("div");
      info.className = "save-item-info";
      const nm = document.createElement("span"); nm.className = "save-item-name"; nm.textContent = name;
      const tm = document.createElement("span"); tm.className = "save-item-time";
      tm.textContent = all[name].savedAt ? new Date(all[name].savedAt).toLocaleString() : "";
      info.appendChild(nm); info.appendChild(tm);
      const loadB = document.createElement("button"); loadB.className = "ctrl-btn"; loadB.textContent = "讀取";
      loadB.addEventListener("click", () => {
        deserializeState(all[name].data);
        document.getElementById("saveName").value = name;
        document.getElementById("saveModal").setAttribute("hidden", "");
      });
      const delB = document.createElement("button"); delB.className = "ctrl-btn"; delB.textContent = "刪除";
      delB.addEventListener("click", () => {
        if (!confirm('刪除存檔「' + name + '」？')) return;
        const a = loadSaves(); delete a[name]; writeSaves(a); renderSaveList();
      });
      row.appendChild(info); row.appendChild(loadB); row.appendChild(delB);
      list.appendChild(row);
    });
  }

  function initSaveLoad() {
    const openBtn = document.getElementById("saveLoadBtn");
    const modal = document.getElementById("saveModal");
    const closeBtn = document.getElementById("saveCloseBtn");
    const doBtn = document.getElementById("saveDoBtn");
    const nameInput = document.getElementById("saveName");
    if (!openBtn || !modal) return;
    openBtn.addEventListener("click", () => { renderSaveList(); modal.removeAttribute("hidden"); nameInput.focus(); });
    if (closeBtn) closeBtn.addEventListener("click", () => modal.setAttribute("hidden", ""));
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.setAttribute("hidden", ""); });
    if (doBtn) doBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) { alert("請先輸入檔名"); return; }
      const all = loadSaves();
      if (all[name] && !confirm('已存在同名存檔，要覆蓋嗎？')) return;
      all[name] = { data: serializeState(), savedAt: Date.now() };
      writeSaves(all);
      renderSaveList();
    });

    // 分頁切換：本機 / 雲端
    const tabLocal = document.getElementById("tabLocal");
    const tabCloud = document.getElementById("tabCloud");
    const panelLocal = document.getElementById("panelLocal");
    const panelCloud = document.getElementById("panelCloud");
    function showTab(which) {
      const cloud = which === "cloud";
      if (tabLocal) tabLocal.classList.toggle("active", !cloud);
      if (tabCloud) tabCloud.classList.toggle("active", cloud);
      if (panelLocal) panelLocal.toggleAttribute("hidden", cloud);
      if (panelCloud) panelCloud.toggleAttribute("hidden", !cloud);
      if (cloud) {
        if (!cloudConfigured()) setCloudStatus("尚未設定 Client ID");
        else if (!Cloud.signedIn) setCloudStatus("尚未登入");
        if (Cloud.signedIn) refreshCloudList(); else renderCloudList(null);
      }
    }
    if (tabLocal) tabLocal.addEventListener("click", () => showTab("local"));
    if (tabCloud) tabCloud.addEventListener("click", () => showTab("cloud"));

    // 雲端：登入
    const authBtn = document.getElementById("cloudAuthBtn");
    if (authBtn) authBtn.addEventListener("click", cloudSignIn);

    // 雲端：儲存
    const cloudSaveBtn = document.getElementById("cloudSaveBtn");
    if (cloudSaveBtn) cloudSaveBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) { alert("請先輸入檔名"); return; }
      if (!Cloud.signedIn) { await cloudSignIn(); if (!Cloud.signedIn) return; }
      cloudSaveBtn.disabled = true;
      const old = cloudSaveBtn.textContent; cloudSaveBtn.textContent = "儲存中…";
      try {
        await ensureFolder();
        const parent = currentParentId();
        const fLabel = Cloud.currentFolderId
          ? ((Cloud.folders.find((x) => x.id === Cloud.currentFolderId) || {}).name || "資料夾")
          : "未分類";
        const existId = await cloudFindByName(name + ".json", parent).catch(() => null);
        if (existId && !confirm('「' + fLabel + '」已有同名存檔「' + name + '」，要覆蓋嗎？')) return;
        const thumb = await captureThumbnail();
        await cloudSave(name, serializeState(), thumb, parent);
        await refreshCloudList();
      }
      catch (e) { alert("雲端儲存失敗：" + e.message); }
      finally { cloudSaveBtn.textContent = old; cloudSaveBtn.disabled = !Cloud.signedIn; }
    });
  }

  initTable();
  initCushion();
  initCueball();
  initNote();
  initPocketTarget();
  initLineTarget();
  initZoneTarget();
  initGridToggle();
  buildGridLines();
  initSnapToggle();
  initPathToggle();
  initRedMask();
  initSelection();
  initRack();
  initSaveLoad();
  initResetBtn();
  tableWrap.addEventListener("pointerdown", onTablePointerDown);
  fitTable();
  updateFloatingScale();
  window.addEventListener("resize", onResize);
  window.addEventListener("load", onResize); // 圖檔/字體載入後再校正一次，避免初次量測誤差
})();
