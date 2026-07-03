// 音效模組：狀態機時機 → mp3（spec 2026-07-04 game6 §2）。
// 手勢解鎖（開始遊戲按鈕）、同一時機不重播、載入/播放失敗靜默降級。
window.GameAudio = (function () {
  "use strict";
  const FILES = {
    place: "assets/audio/請擺球.mp3", // 進入擺球（含每輪 clearing）
    ready: "assets/audio/請開始.mp3", // 可以擊球
    ok: "assets/audio/漂亮.mp3",      // 本桿成功
    fail: "assets/audio/加油.mp3",    // 本桿失敗
  };
  const clips = {};
  let unlocked = false;
  let lastTag = null; // 去重：同一時機（phase×第幾次）只播一次

  // 在使用者手勢（開始遊戲按鈕）中呼叫：建立並解鎖所有音檔
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    Object.keys(FILES).forEach((k) => {
      const a = new Audio(FILES[k]);
      a.preload = "auto";
      clips[k] = a;
      // 靜音播一下取得播放權，隨即復原（部分行動瀏覽器需要）
      a.muted = true;
      const p = a.play();
      if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
                        .catch(() => { a.muted = false; });
      else a.muted = false;
    });
    lastTag = null; // 每次進關重新計（unlock 由開始遊戲按鈕觸發）
  }

  function play(key) {
    const a = clips[key];
    if (!a) return;
    try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 靜默降級 */ }
  }

  // 由狀態機 onChange 呼叫。PLACING/CLEARING＝該輪擺球、READY＝開始擊球、RESULT＝成功/失敗。
  function onState(st) {
    let key = null;
    if (st.phase === "placing" || st.phase === "clearing") key = "place";
    else if (st.phase === "ready") key = "ready";
    else if (st.phase === "result") {
      const r = st.results[st.results.length - 1];
      key = r && r.success ? "ok" : "fail";
    }
    if (!key) return;
    // 以（音效×已判定桿數×目前挑戰序）當標籤：同輪同狀態重複 emit 不重播
    const tag = key + ":" + (st.results ? st.results.length : 0) + ":" + (st.attempt || 0);
    if (tag === lastTag) return;
    lastTag = tag;
    play(key);
  }

  return { unlock, onState, play, _clips: clips };
})();
