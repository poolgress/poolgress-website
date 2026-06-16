// 撞球練習圖 App — 設定檔
//
// 待使用者把圖檔放進 assets/ 後，依實際檔名調整這裡即可。
// 若圖檔不存在，app.js 會自動以 CSS 畫出的暫代圖形（綠檯面 / 色塊球）顯示，
// 方便在還沒有美術圖檔時就能開發與測試。

window.CONFIG = {
  // 球桌底圖路徑（由上往下看的平面圖）
  TABLE_IMAGE: "assets/table.png",

  // 帶格線的球桌圖（開啟格線時用，與 table.png 同尺寸同位置）。
  GRID_IMAGE: "assets/table_grid.png",

  // 庫邊圖層（透明 PNG，永遠疊在球桌上、球之下），與 table.png 同尺寸同位置。
  CUSHION_IMAGE: "assets/cushion.png",

  // 母球打點圖（圓形母球面，用來標示桿頭擊球點）
  CUEBALL_IMAGE: "assets/cueball.png",

  // 六個袋口中心位置（量自 table.png），與目標袋口圈圈半徑（佔球桌寬比例）。
  POCKETS: [
    { fx: 0.0498, fy: 0.0858 }, { fx: 0.9497, fy: 0.0858 },
    { fx: 0.0498, fy: 0.9133 }, { fx: 0.9497, fy: 0.9133 },
    { fx: 0.4998, fy: 0.0605 }, { fx: 0.4998, fy: 0.9387 },
  ],
  POCKET_TARGET_RADIUS: 0.033,

  // 格線交叉點（用於吸附）：量自 table_grid.png。
  // cols/rows = 小格數；left/right/top/bottom = 最外側格線位置（佔球桌比例，庫鼻到庫鼻）。
  // 交叉點 = (cols+1)×(rows+1)，等距分布。
  GRID: { cols: 32, rows: 16, left: 0.0543, right: 0.9453, top: 0.0979, bottom: 0.9014 },

  // 可放置區的「紅色範圍」指引圖：紅色＝可放球的區域（含袋口突起、角落斜切）。
  // 程式會載入它建立遮罩，用實際紅色形狀限制球的位置（非矩形）。
  AMBIT_IMAGE: "assets/table_ambit.png",
  // 判定紅色像素的條件（R 高、G/B 低）
  AMBIT_RED: { rMin: 150, gMax: 110, bMax: 110 },

  // 選取球時的框選環圖（準星）
  PICK_IMAGE: "assets/pick.png",

  // Google 雲端硬碟（每人存自己的存檔）。前端直連，不需後端。
  //   CLIENT_ID   — 在 Google Cloud Console 建立的 OAuth 2.0 用戶端 ID
  //                 （類型：Web 應用程式；已授權 JavaScript 來源加入
  //                  https://poolgress.com 與 http://localhost:4123）。
  //                 填好後「存檔 / 讀取」視窗的雲端分頁即可使用。
  //   FOLDER_NAME — 存檔會放進使用者自己雲端硬碟的這個資料夾。
  GOOGLE: {
    CLIENT_ID: "502126425089-tb6t8n1r9j9oouismccfudqp6kf3ahj8.apps.googleusercontent.com",
    FOLDER_NAME: "Poolgress 撞球練習圖",
  },

  // 矩形後備邊界（僅在紅圖遮罩尚未載入完成前使用；正常情況以 AMBIT_IMAGE 的
  // 實際紅色形狀為準）。值為直線庫邊的庫鼻線；球心再內縮一個半徑使球緣貼齊。
  PLAY_AREA: { top: 0.098, right: 0.055, bottom: 0.0995, left: 0.054 },

  // 球的顯示大小不另外設定比例：直接用原圖檔的像素尺寸對球桌圖的比例
  // （ball.naturalWidth / table.naturalWidth），維持你已調整好的原始比例。

  // 球庫清單：每筆 { id, name, src, color, pathColor }
  //   id        — 唯一識別
  //   name      — 顯示用名稱
  //   src       — 球的圖檔路徑（不存在時用 color 畫暫代球）
  //   color     — 暫代球的顏色（圖檔載入失敗時的後備）
  //   pathColor — 繪製路徑時的線條顏色
  BALLS: [
    { id: "cue", name: "母球", src: "assets/balls/cue.png", color: "#f7f4ec", text: "", pathColor: "#ffffff" },
    { id: "1", name: "1 號", src: "assets/balls/1.png", color: "#f2c14e", text: "1", pathColor: "#faba02" },
    { id: "2", name: "2 號", src: "assets/balls/2.png", color: "#2a6fb0", text: "2", pathColor: "#074282" },
    { id: "3", name: "3 號", src: "assets/balls/3.png", color: "#d1453b", text: "3", pathColor: "#bf000d" },
    { id: "4", name: "4 號", src: "assets/balls/4.png", color: "#6a4c93", text: "4", pathColor: "#d94a66" },
    { id: "5", name: "5 號", src: "assets/balls/5.png", color: "#e08e2b", text: "5", pathColor: "#563f8e" },
    { id: "6", name: "6 號", src: "assets/balls/6.png", color: "#2e8b57", text: "6", pathColor: "#03774d" },
    { id: "7", name: "7 號", src: "assets/balls/7.png", color: "#8c3b2f", text: "7", pathColor: "#964117" },
    { id: "8", name: "8 號", src: "assets/balls/8.png", color: "#1a1a1a", text: "8", pathColor: "#000000" },
    { id: "9", name: "9 號", src: "assets/balls/9.png", color: "#f2c14e", text: "9", stripe: true, pathColor: "#faba02" },
    { id: "10", name: "10 號", src: "assets/balls/10.png", color: "#2a6fb0", text: "10", stripe: true, pathColor: "#074282" },
    { id: "11", name: "11 號", src: "assets/balls/11.png", color: "#d1453b", text: "11", stripe: true, pathColor: "#bf000d" },
    { id: "12", name: "12 號", src: "assets/balls/12.png", color: "#6a4c93", text: "12", stripe: true, pathColor: "#d94a66" },
    { id: "13", name: "13 號", src: "assets/balls/13.png", color: "#e08e2b", text: "13", stripe: true, pathColor: "#563f8e" },
    { id: "14", name: "14 號", src: "assets/balls/14.png", color: "#2e8b57", text: "14", stripe: true, pathColor: "#03774d" },
    { id: "15", name: "15 號", src: "assets/balls/15.png", color: "#8c3b2f", text: "15", stripe: true, pathColor: "#964117" },
  ],
};
