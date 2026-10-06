# Poolgress 關卡 JSON：App 重現與流程實作規格

文件版本：2026-10-05（線段疊加 UI 與球體接觸語意確認，schema 不變）。對照網站提交 `e6e1e68` 與 `model.js?v=20261001-2`。本文已整合目標線段必要條件；精簡對照另見 [目標線段規則](TARGET_LINE_RULES.md)。

本文件提供給 App 端工程師或 AI，目標是讀取工作台匯出的完整關卡 JSON，重現：

- 球桌與球位
- 每顆球的教學路線
- 子球／母球的袋口、停球區與必要接觸線段
- 五種關卡流程
- 每一次、每一輪、每一局的擺球、擊球、判定、重擺與計分

請以 `format = "poolgress.coach-level"`、`version = 1` 為格式識別。不要使用 `legacyEditorExtras` 當作 App 執行規則；它只用於舊 Table7 編輯資料的保存與回匯。

---

## 1. 最重要的執行原則

1. `setup.balls` 是整份題目的「完整球位資料」，不代表每一種流程都要把所有球同時擺上桌。
2. 實際每輪擺哪些球，由 `flow.template` 決定：
   - A：每次只擺本次要直接擊打的子球；成功或失敗後換下一次。
   - B：每次擺一顆固定母球和一顆固定子球；一桿後全部重擺。
   - C：直接使用 `setup.rounds[n].balls`；每輪只擺該陣列中的球。
   - D：開局同時擺全部子球；合法進球後不重擺，從現況繼續清檯。
   - E：每輪同時擺全部球；合法進球後不重擺，清完才算一輪成功，然後重擺整副球進入下一輪。
3. `diagram.paths` 是教學與動畫資料，不是判分規則。`diagram.lines` 是必要接觸目標；實際成功與否必須合併袋口、停球區、留桌、線段、犯規與流程狀態判斷。
4. 球進袋後要從當前桌面狀態移除。只有流程要求進入下一次／下一輪時才依初始球位重擺。
5. D、E 流程的合法進球是「原位續桿」，不是每進一顆就立刻把所有球重擺。

---

## 2. 頂層 JSON

```json
{
  "format": "poolgress.coach-level",
  "version": 1,
  "id": "關卡唯一 ID",
  "name": "關卡標題",
  "flow": {},
  "setup": {},
  "objectRules": {},
  "cueRules": {},
  "shotRules": null,
  "fouls": {},
  "scoring": {},
  "diagram": {},
  "teaching": "教學說明／建議桿法",
  "source": "資料來源",
  "legacyEditorExtras": {}
}
```

| 欄位 | 用途 |
|---|---|
| `format` | 固定為 `poolgress.coach-level`。 |
| `version` | 目前固定為 `1`；不認識的版本應拒絕載入。 |
| `id` | 關卡唯一識別字串。 |
| `name` | 顯示給玩家的關卡名稱。 |
| `flow` | 流程模板與成功／失敗後的動作。 |
| `setup` | 擊球方式、母球來源、球位與 C 類輪次。 |
| `objectRules` | 一般或第一桿的子球目標。 |
| `cueRules` | 一般或第一桿的母球目標。 |
| `shotRules` | E 類第一桿／第二桿的個別規則；其他流程為 `null`。 |
| `fouls` | 碰動其他子球與一桿多球等犯規。 |
| `scoring` | 計分單位、總數、過關與星等門檻。 |
| `diagram` | 停球區、必要目標線段、教學球路、格線顯示。不能因為位於 diagram 就忽略目標判定。 |
| `teaching` | 人工輸入的教學說明／建議桿法，不直接參與判分。 |
| `legacyEditorExtras` | 舊編輯器資料。App runtime 應忽略。 |

---

## 3. 座標系統

### 3.1 球位

每顆球同時帶兩套座標：

```json
{
  "id": "1",
  "fx": 0.4998,
  "fy": 0.6000875,
  "x": 4,
  "y": 2.5
}
```

- `fx`、`fy`：整張球桌圖片的 0–1 比例座標，適合直接畫 UI。
- `x`、`y`：8 × 4 星座標，原點是左上方庫鼻，適合遊戲與相機邏輯。
- App 擺球建議優先使用 `x`、`y`；繪製原始圖面時可使用 `fx`、`fy`。

有效庫鼻範圍：

```text
left   = 0.0543
right  = 0.9453
top    = 0.0979
bottom = 0.9014
```

換算公式：

```text
x = (fx - left) / (right - left) * 8
y = (fy - top)  / (bottom - top) * 4

fx = left + x / 8 * (right - left)
fy = top  + y / 4 * (bottom - top)
```

### 3.2 路線、停球區與線段

`diagram.paths[].vertices` 使用 `fx,fy`；`diagram.zones[]` 與 `diagram.lines[]` 使用 `x1,y1,x2,y2`，但後兩者仍是圖片比例座標，並非星座標。計算距離前，兩端都必須套用上面的公式換成星座標。

### 3.3 球 ID

- `cue`：母球。
- `1`–`15`：編號子球。
- `gray`、`red`：無編號灰球、紅球，可重複出現。

同色球可能重複，必須以 `setup.balls` 的陣列索引識別，不能只用 `id` 當唯一鍵。

---

## 4. 袋口代碼

| 代碼 | 中文 | 大致位置 `(fx, fy)` |
|---|---|---|
| `top_left` | 左上袋 | `(0.0498, 0.0858)` |
| `top_right` | 右上袋 | `(0.9497, 0.0858)` |
| `bottom_left` | 左下袋 | `(0.0498, 0.9133)` |
| `bottom_right` | 右下袋 | `(0.9497, 0.9133)` |
| `top_center` | 上中袋 | `(0.4998, 0.0605)` |
| `bottom_center` | 下中袋 | `(0.4998, 0.9387)` |

規則中的 `pockets` 是允許進入的袋口集合。若目標為 `pocket`，球進入集合以外的袋口應判失敗或犯規。

---

## 5. 球路 `diagram.paths`

```json
{
  "ball": 1,
  "style": "dashed",
  "vertices": [
    { "fx": 0.29, "fy": 0.52, "ghost": true },
    { "fx": 0.14, "fy": 0.25, "ghost": false }
  ]
}
```

- `ball`：`setup.balls` 的零起算陣列索引，不是球號。
- 路線起點：該球在 `setup.balls[ball]` 的位置，不會重複寫入 `vertices`。
- `vertices`：球依序經過的點。
- `ghost = true`：繪圖器自動鎖定的碰球點或碰庫點。
- `ghost = false`：教練手動畫出的普通轉折點或終點。
- `style`：`dashed` 或 `solid`；缺省時按 `dashed` 顯示。

App 顯示方式：

1. 從球心畫到第一個 vertex。
2. 再依序連接所有 vertices。
3. 最後一段顯示箭頭。
4. 路線只供教學與動畫，不得拿來取代實際球位偵測。
5. 目標是進袋的球到達目標袋口時直接隱藏，不做縮小動畫。
6. 有固定母球時，先播放母球；母球到達碰撞點後才播放被撞子球。
7. E 類連續兩桿的教學動畫：第一桿結束後母球原地停 2 秒，再播放下一桿。
8. `cuePlacement = free` 時沒有固定母球起點，不播放自動球路動畫，只顯示靜態球形。

`ghost` 沒有提供碰撞對象 ID，因此高精度物理模擬仍應由 App 的物理引擎依球位重新求解。若只重現教學動畫，沿 polyline 插值即可。

---

## 6. 停球區 `diagram.zones`

```json
{
  "side": "cue",
  "shot": 1,
  "x1": 0.20,
  "y1": 0.30,
  "x2": 0.35,
  "y2": 0.45
}
```

- `side = ball`：子球停球區。
- `side = cue`：母球停球區。
- `shot = 1`：第一桿規則。
- `shot = 2`：第二桿規則。
- 舊資料可能沒有 `shot`；目前工作台將其視為共用區塊。E 流程在該桿 target 需要 zone 時套用，不能只因缺少 shot 就限定第一桿。
- 判定時先正規化矩形：`minX ≤ fx ≤ maxX` 且 `minY ≤ fy ≤ maxY`。
- 球心落在矩形內才算成功；不要用球外緣與矩形相交作為成功。

---

## 7. 目標規則

`objectRules.target`、`cueRules.target` 與 E 類 `shotRules` 使用相同代碼：

| target | 判定 |
|---|---|
| `pocket` | 球必須進入指定 `pockets` 之一。 |
| `zone` | 球不得進袋，停止後球心必須位於對應停球區。 |
| `stay` | 球必須留在桌面上；洗袋失敗。 |
| `pocket_or_zone` | 進指定袋口或停在對應區塊，任一成立即可。 |
| `none` | 此關不使用該球；目前用於無母球關卡的 `cueRules.target`。 |

子球與母球都必須各自通過規則。一桿只有子球成功但母球失敗，整桿仍算失敗。每一方的 `lineRequirement` 是上述終點條件之外的必要條件。

### 7.1 目標線段與 lineRequirement

幾何資料範例（第 3 關，黃色上庫線段）：

```json
{
  "side": "ball",
  "shot": 1,
  "x1": 0.6668625,
  "y1": 0.0979,
  "x2": 0.7782375,
  "y2": 0.0979
}
```

`side` 為 `ball`（本桿目標子球）或 `cue`（母球）。`shot` 在 E 模板篩選第一／第二桿；缺少時兩桿共用。A–D 每一桿套用同球種全部線段。畫面編號依球種分別從 1 開始，不表示接觸順序。

每組子球／母球規則新增：

```json
{
  "lineRequirement": {
    "required": true,
    "lineIndexes": [0],
    "match": "all",
    "order": "any",
    "event": "ball_body_touches_segment",
    "scope": "current_shot",
    "combineWithTarget": "and"
  }
}
```

- `lineIndexes` 指向 `diagram.lines` 的零起算索引，不是畫面顯示編號。
- 本桿指定球必須碰到全部適用線段，顺序不限；其他子球不能代替完成。同一條碰多次只算一次。
- 以球體接觸有限線段（含端點）判定，不要求球心穿越。每桿起始清空接觸紀錄，擺球移動不計入。
- `required:false` 搭配空索引表示無此要求。線段由編輯器新增／刪除時，規則及索引自動重新產生。
- E 應讀 `shotRules.first.object/cue.lineRequirement` 或 `shotRules.second.object/cue.lineRequirement`。頂層規則只對應一般／第一桿，不得用來覆蓋第二桿。

```text
球類條件 = 終點 target 成立 AND 本桿必要線段全部接觸
shotSuccess = 子球條件 AND 母球條件（若使用母球）AND 無犯規
```

例如 `pocket_or_zone` 是「進袋或區塊」任一成立，再 AND 線段；不能把碰線當作第三種成功選項。D/E 漏碰必要線段，即使有進球仍走失敗分支。

載入相容策略：舊檔缺少 lineRequirement 時，依 diagram.lines 的球種／桿次建立同樣要求；缺少 diagram.lines 則視為空集合。工作台可從舊檔 legacyEditorExtras.lines 移轉，但 App 應先完成資料正規化，再用新的 diagram.lines 執行。新版若索引越界、side／shot 不符、重複索引、未知 event 或 required 與索引內容矛盾，停止載入並要求修正，不可略過必要條件。

### 7.2 第 3、4 關補齊後的條件

| 關卡 | 接觸線段（星座標） | 最後停球區（星座標） | 一次成功 |
|---|---|---|---|
| 3 | 上庫 (5.5,0) → (6.5,0) | x=5.5–6.5、y=2–4 | 本桿子球碰到上庫線段，並最後停在下方區塊 |
| 4 | 左庫 (0,1.5) → (0,2.5) | x=5.5–8、y=1.5–2.5 | 本桿子球碰到左庫線段，並最後停在右方區塊 |

兩關均無母球，10 次挑戰，成功 8 次過關，8／9／10 次為一／二／三星，每次判定後重擺。這些線段依原題反彈路線與區塊寬度補入；旧下载檔不會自動更新，請重新下載第 3、4 關。舊題庫可能共用 level ID；匯入 20 關時暫以題庫關卡序號另建資料庫唯一鍵，避免按 id 覆蓋關卡。

### E 類的第一／第二桿

E 類必須優先讀 `shotRules`：

```text
shotIndex = 1 → shotRules.first
shotIndex = 2 → shotRules.second
```

目前 19、20 關每輪都是兩顆子球，因此一輪正好兩桿。若未來擴充到第三桿以上，在 schema 升版前暫時沿用 `second` 規則，但建議未來新增明確的逐桿陣列。

---

## 8. 五種流程狀態機

## A：只有子球

用途：沒有母球，球桿直接擊打子球。

```text
START
  → 建立挑戰序列
  → 擺本次的一顆子球
  → 等待一桿完成
  → 判定子球目標
  → 記錄成功／失敗
  → 清除本次球
  → 擺下一顆或下一次
  → 達 scoring.total 後結算
```

挑戰序列：

- 只有一顆子球：重複同一位置直到完成 `scoring.total` 次。
- 有多顆子球且 `order = ascending`：依球號由小到大，每次只擺一顆；打完才擺下一顆。
- 有多顆且 `order = any`：可按 JSON 順序或由玩家選下一顆，但一次只處理一顆。
- 成功或失敗後都進入下一次，對應 `flow.onSuccess/onFailure = next_attempt`。

## B：固定位置擊球

用途：固定母球＋固定子球，每次只打一桿。

```text
START
  → 依 setup.balls 擺母球與子球
  → 等待一桿完成
  → 同時判定子球規則、母球規則、犯規
  → 記錄成功／失敗
  → 清桌並按初始位置重擺兩球
  → 達 scoring.total 後結算
```

不論上一桿球停在哪裡，下一次都回到 JSON 初始位置。

## C：子／母球換位練習

用途：每輪只擺一顆母球與一顆子球，其中一方逐輪換位置。

`setup.rounds` 已經是 App 可直接執行的完整輪次表：

```json
{
  "round": 1,
  "balls": [
    { "id": "cue", "x": 2, "y": 2.5 },
    { "id": "1", "x": 3, "y": 1.25 }
  ]
}
```

```text
START
  → roundIndex = 0
  → 清桌
  → 擺 setup.rounds[roundIndex].balls
  → 等待一桿完成
  → 判定子球、母球與犯規
  → 記錄成功／失敗
  → roundIndex += 1
  → 還有 round：擺下一輪
  → 無 round：結算
```

- `rotation = object`：子球位置／球號改變，母球固定。
- `rotation = cue`：母球位置改變，子球固定。
- `cycles` 已展開在 `setup.rounds`；App 不要再額外乘一次。
- 每一輪不論成功或失敗都換下一輪。

## D：球形挑戰

用途：單局連續清檯。

```text
START
  → 同時擺 setup.balls 中全部子球
  → cuePlacement = free 時讓玩家放母球
  → 等待一桿完成
  → 檢查合法進球、母球留桌、擊球順序與犯規
  ├─ 合法進球且桌上仍有子球：移除進袋球，其他球保持現況，原位續桿
  ├─ 全部子球清完：過關並結算
  └─ 失誤／犯規：立刻結束本局，不重擺續打
```

- `flow.onSuccess = continue_until_clear`。
- `flow.onFailure = end_game`。
- `scoring.unit = balls`，但本模板的通關條件是全清。
- 若 `objectRules.order = ascending`，每桿第一個合法接觸／進袋目標必須是桌上剩餘的最小號球。

## E：打一顆做一顆

用途：多輪連續清檯；目前 19、20 關是一輪兩顆子球。

```text
START
  → completedRounds = 0、attemptedRounds = 0
  → 依 setup.balls 重擺整副球
  → shotIndex = 1
  → 打第一顆
  → 用 shotRules.first 判定
  ├─ 第一桿成功：移除進袋子球，母球及其餘球保持現況，shotIndex = 2
  │                  → 下一桿不得重擺母球或剩餘子球
  └─ 第一桿失敗：本輪失敗
  → 打第二顆
  → 用 shotRules.second 判定
  ├─ 第二桿成功且清檯：completedRounds += 1
  └─ 第二桿失敗：本輪失敗
  → attemptedRounds += 1
  → 清桌，按 setup.balls 重擺整副球
  → attemptedRounds < scoring.total：開始下一輪
  → 否則結算
```

關鍵規則：

- 第一顆進袋後，只移除第一顆；母球停留在實際位置，第二顆也維持原位。
- 第一桿成功後不能把母球放回初始位置。
- 一輪必須清完全部子球才增加一次 `cleared_rounds`。
- 任一桿失誤即結束該輪；不是結束整個關卡，應重擺後進入下一輪。
- 19、20 關按球號小到大，先 1 號、再 2 號。
- 教學動畫在兩桿之間讓母球原地停 2 秒；實際遊玩則等待玩家準備下一桿，不需要強制倒數。

---

## 9. 犯規

```json
{
  "otherObjectBallsMustNotMove": true,
  "multipleObjectPotsForbidden": true
}
```

- `otherObjectBallsMustNotMove = true`：本桿目標球以外的子球不得發生明顯位移。
- `multipleObjectPotsForbidden = true`：一桿不可進兩顆以上子球。
- 母球未符合 `cueRules`／`shotRules.*.cue` 也算該桿失敗。
- 進錯袋、打錯順序、洗袋、目標球未達區域，都應依流程進入 failure 分支。

若 App 使用影像辨識，需設定位移容差，避免攝影噪聲被誤判為碰動。

---

## 10. 計分與星等

```json
{
  "unit": "successful_shots",
  "total": 10,
  "pass": 7,
  "stars": [7, 9, 10]
}
```

| unit | 分數增加時機 |
|---|---|
| `successful_shots` | A、B、C 每次／每輪成功時加 1。 |
| `balls` | D 合法進袋一顆加 1；目前必須全清才過關。 |
| `cleared_rounds` | E 只有完整清完一輪才加 1。 |

結算：

```text
passed = score >= scoring.pass

score >= stars[2] → 3 星
score >= stars[1] → 2 星
score >= stars[0] → 1 星
否則              → 0 星
```

`scoring.total` 的意義依 unit 不同：

- `successful_shots`：總挑戰次數／輪次數。
- `balls`：本局需清掉的子球數。
- `cleared_rounds`：總共要進行的完整輪數，不是總球數。

---

## 11. 20 關的流程對照

| 關卡 | 模板 | 本輪擺球與輪次規則 |
|---:|:---:|---|
| 1 | A | 每次擺同一顆子球，直接擊球；共 10 次。 |
| 2 | A | 1–7 號依序，一次只擺一顆；進袋／判定後才擺下一顆。 |
| 3 | A | 子球須碰上庫線段，最後停在下方目標區；共 10 次，每次重擺。 |
| 4 | A | 子球須碰左庫線段，最後停在右方目標區；共 10 次，每次重擺。 |
| 5–10 | B | 每次擺固定母球＋固定子球，只打一桿；每桿後兩球重擺，共 10 次。 |
| 11 | C | 4 個子球位置依 `setup.rounds` 輪換；每輪固定母球＋當輪子球。 |
| 12 | C | 4 個母球位置循環 2 次，共 8 輪；每輪固定子球＋當輪母球。 |
| 13 | C | 5 個子球位置依 `setup.rounds` 輪換，共 5 輪。 |
| 14–18 | D | 全部子球同時上桌，開局母球自由球；合法進球後原位續桿，失誤即結束本局。 |
| 19 | E | 每輪同時擺母球、1 號、2 號；1 號進袋後保持母球與 2 號現況，再打 2 號；清完才成功一輪，共 10 輪。 |
| 20 | E | 同第 19 關；第一桿母球須停目標區，第二桿只需留桌；兩顆依號碼清完才成功一輪，共 10 輪。 |

---

## 12. 建議的 App runtime 資料結構

載入 JSON 後建立獨立的 runtime，不要直接修改原始 spec：

```ts
type Runtime = {
  spec: CoachLevelSpec;
  phase: 'setup' | 'ready' | 'balls_moving' | 'judging' | 'round_end' | 'game_end';
  attemptIndex: number;
  roundIndex: number;
  shotIndex: number;
  score: number;
  activeBalls: RuntimeBall[];
  pocketedBallIndexes: number[];
};
```

每桿結束的統一處理順序：

```text
1. 等所有球完全停止。
2. 收集：進袋球、最先接觸球、所有球最終座標、明顯移動球，以及本桿可靠軌跡／線段接觸證據。
3. 依 shotIndex 取得當桿子球／母球規則。
4. 檢查擊球順序。
5. 檢查子球目標。
6. 檢查母球目標。
7. 檢查子球、母球的 lineRequirement 與 fouls；線段證據不足時進人工覆核，不猜成功或失敗。
8. 合併為 shotSuccess。
9. 交給 A/B/C/D/E 狀態機決定續桿、重擺、下一輪或結算。
```

---

## 13. 必做驗收案例

1. 第 2 關開局只出現 1 號球；完成後才擺 2 號，直到 7 號。
2. 第 5 關子球與母球都進上中袋才成功；下一次恢復初始球位。
3. 第 11 關每輪只出現一顆母球與一顆子球，不可把四顆候選子球同時擺出。
4. 第 12 關執行 8 輪，而不是 4 輪或 16 輪。
5. 第 14–18 關進一顆後其他球不重擺；失誤立即結束本局。
6. 第 19 關第一顆進袋後，母球使用實際停球點接續第二桿；清完兩顆才記一輪成功。
7. 第 20 關第一桿檢查母球停球區，第二桿不再檢查該區，但母球不可洗袋。
8. 路線終點進袋的動畫直接隱藏球，不縮小。
9. 自由母球關卡不自動播放固定起點動畫。
10. 星等以實際 score 對照 `[一星, 二星, 三星]`，不得用擊球動畫播放次數計分。
11. 第 3、4 關只停進區塊但未碰線段必須失敗；碰線但最後停區外也失敗；兩者成立才成功。
12. E 第二桿不得繼承第一桿已碰線段的旗標；子球與母球不能互相代替。
13. 無線段的舊題保持原本判定；有線段但缺少 lineRequirement 的舊題正規化後仍需碰線。

---

## 14. Schema 目前的限制

- 路線是教學 polyline，不是完整物理參數，沒有力道、旋轉、摩擦係數與明確碰撞對象 ID。
- E 類目前只有 `first`、`second` 兩組逐桿規則。
- 2 秒停頓是目前動畫播放器的 E 類呈現規則，尚未獨立存成 JSON 欄位。
- JSON 不包含相機偵測容差；App 端需自行定義球停止、進袋及明顯位移門檻。
- `legacyEditorExtras` 可能很大且含舊欄位，App runtime 應忽略。

若未來需要更完整的物理動畫或三桿以上逐桿規則，建議升級為 `version: 2`，不要在 version 1 偷加不同語意。

## 2026-10-05 交接補充

工作台「經過目標線段」標記為可疊加條件。球體與有限線段接觸即可；不要求球心穿越。終點與必要線段使用 AND，不新增 target 代碼。下方人工流程預覽有使用者指出的重大失誤，尚未驗收；不可將預覽程式當作正式狀態機實作規格。


## 第 02 關流程修正（2026-10-05）
保留 A 模板與 direct 擊球。開局擺七顆子球，依 1–7 號直接打進上中袋；成功只移除當前球，剩餘球原位繼續；任一桿失敗立即結束。重新挑戰重擺七顆。JSON：onSuccess=continue_until_clear、onFailure=end_game、scoring.unit=balls、total=pass=7。工作台 A 模板新增「整組依序清檯」選項；其餘 A 關卡仍逐次重擺。這次只確認第 02 關分支，其餘先前擱置的流程問題仍未驗收。
