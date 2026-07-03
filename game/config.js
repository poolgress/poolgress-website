// 遊戲原型設定。GRID 值抄自 table_2/config.js（底圖是同一張 table.png，量測值相同）。
window.GAME_CONFIG = {
  TABLE_IMAGE: "assets/table.png",
  CUSHION_IMAGE: "assets/cushion.png",
  GRID: { left: 0.0543, right: 0.9453, top: 0.0979, bottom: 0.9014 },
  TABLE_ASPECT: 6534 / 11784, // 桌圖 高/寬（橫式）
  ARMING_MS: 1500,  // 就位穩定計時（母規格 §4.2）
  RESULT_MS: 3000,  // 結果顯示後自動進整理模式
};
