# Poolgress 影像辨識與關卡流程引擎接手規格

文件版本：2026-10-02。對照網站提交 `e6e1e68`、`model.js?v=20261001-2`。本文已整合線段接觸證據、Rule Engine 必要條件與第 3、4 關驗收；精簡版另見 [目標線段規則](TARGET_LINE_RULES.md)。

以下 TypeScript 與演算法是待工程端實作的介面契約，不代表影像辨識引擎已完成。工作台目前已完成規則編輯、匯出與題目說明。

本文件提供給負責「球桌影像辨識」與「關卡流程運算」的工程師或 AI。目標不是只把 JSON 畫出來，而是讓系統能可靠完成：

1. 校正球桌座標。
2. 辨識球、球號、位置、移動、碰撞與進袋。
3. 判斷一次擊球何時開始、何時完全結束。
4. 依關卡 JSON 判斷本桿成功、失敗或犯規。
5. 依 A～E 流程決定續桿、重擺、換下一球、換下一輪或結算。
6. 將可解釋的結果與證據回傳 App UI。

JSON 欄位的完整說明另見 [APP_JSON_IMPLEMENTATION_GUIDE.md](./APP_JSON_IMPLEMENTATION_GUIDE.md)。本文件聚焦 runtime 架構、影像事件契約與狀態機整合。

---

## 1. 系統責任邊界

建議拆成四個互不耦合的模組：

```text
Camera / Video
      ↓
Vision Pipeline
  校正、球偵測、追蹤、進袋、停止判定
      ↓ 只輸出客觀事件與證據
Shot Aggregator
  把逐幀結果整理成一桿 ShotObservation
      ↓
Rule Engine
  依 JSON 判斷目標、犯規與本桿結果
      ↓
Flow Engine
  依 A～E 決定續桿、重擺、換輪、計分、結算
      ↓
App UI / Audio / Storage
```

重要原則：

- Vision 不應知道第幾關，也不應直接判斷「過關」。
- Rule Engine 不應讀取原始影像，只處理結構化辨識結果。
- Flow Engine 不應自行猜球位，只接受 Rule Engine 的本桿判定。
- `diagram.paths` 是教學示意，不是影像辨識必須符合的軌跡。
- `diagram.lines` 是實際必要接觸目標；要與終點條件合併判定。
- `teaching` 是顯示文字，不參與自動判分。
- `legacyEditorExtras` 不得作為 runtime 規則來源。

---

## 2. 輸入關卡格式

只接受：

```json
{
  "format": "poolgress.coach-level",
  "version": 1
}
```

載入前先做 schema validation。未知版本應停止載入，不能用猜測方式執行。

流程引擎主要讀取：

```text
flow.template
flow.onSuccess
flow.onFailure
setup.strikeMode
setup.cuePlacement
setup.balls
setup.rounds
objectRules
cueRules
shotRules
fouls
scoring
diagram.zones
diagram.lines
objectRules.lineRequirement
cueRules.lineRequirement
shotRules.first.object.lineRequirement
shotRules.first.cue.lineRequirement
shotRules.second.object.lineRequirement
shotRules.second.cue.lineRequirement
```

不要使用 `diagram.paths` 判定玩家是否打對桿法或走對路線。

---

## 3. 統一座標

### 3.1 Runtime 一律使用星座標

內部建議統一為左上庫鼻原點的 `8 × 4` 星座標：

```text
(0, 0) ---------------- (8, 0)
  |                        |
  |                        |
(0, 4) ---------------- (8, 4)
```

JSON 中球位已有星座標 `x,y`。路線頂點為圖片比例 `fx,fy`；停球區與線段雖命名為 `x1,y1,x2,y2`，仍是圖片比例座標。每一端先換算再做等距幾何計算：

```text
left   = 0.0543
right  = 0.9453
top    = 0.0979
bottom = 0.9014

x = (fx - left) / (right - left) * 8
y = (fy - top)  / (bottom - top) * 4
```

### 3.2 相機校正

每個安裝環境需保存一組桌面 homography：

```ts
type TableCalibration = {
  calibrationId: string;
  cameraWidth: number;
  cameraHeight: number;
  imageToTableHomography: number[]; // 3×3，共 9 個值
  tablePolygonPx: PointPx[];
  pocketRegionsPx: Record<PocketCode, PolygonPx>;
  validFrom: string;
  reprojectionErrorPx: number;
};
```

校正流程至少要標出四個庫鼻角點；更好的做法是六袋口＋庫鼻特徵共同校正。校正後所有偵測中心先轉成星座標，再交給規則引擎。

若相機移動、縮放、旋轉或 reprojection error 超標，必須要求重新校正，不得繼續判分。

---

## 4. 影像辨識輸出契約

### 4.1 每幀輸出

```ts
type VisionFrame = {
  frameId: number;
  timestampMs: number;
  calibrationId: string;
  tableVisible: boolean;
  occlusionScore: number; // 0–1，越高遮擋越嚴重
  balls: BallDetection[];
};

type BallDetection = {
  trackId: string;       // 跨幀追蹤 ID
  classId: 'cue' | 'gray' | 'red' | `${1|2|3|4|5|6|7|8|9|10|11|12|13|14|15}`;
  classConfidence: number;
  centerPx: { x: number; y: number };
  table: { x: number; y: number }; // 8×4 星座標
  radiusPx: number;
  positionConfidence: number;
  velocityStarsPerSec: { x: number; y: number };
  speedStarsPerSec: number;
  visible: boolean;
};
```

### 4.2 一桿彙整輸出

Rule Engine 的唯一正式輸入應是完成的一桿資料：

```ts
type ShotObservation = {
  shotId: string;
  startedAtMs: number;
  endedAtMs: number;
  setupSnapshot: BallSnapshot[];
  finalSnapshot: BallSnapshot[];
  movements: BallMovement[];
  pocketEvents: PocketEvent[];
  contacts: ContactEvent[];
  trajectories: BallTrajectory[]; // 本桿實測軌跡；不是 diagram.paths
  firstCueObjectContact?: string; // 被母球首先碰到的 trackId
  allBallsStopped: boolean;
  visionQuality: VisionQuality;
};

type BallSnapshot = {
  trackId: string;
  classId: string;
  table: { x: number; y: number };
  confidence: number;
};

type BallMovement = {
  trackId: string;
  classId: string;
  start: { x: number; y: number };
  end?: { x: number; y: number };
  maxDisplacement: number;
  pathLength: number;
  startedMovingAtMs?: number;
  stoppedAtMs?: number;
};

type BallTrajectory = {
  trackId: string;
  samples: Array<{
    frameId: number;
    timestampMs: number;
    x: number; y: number;             // 校正後等距星座標
    radiusStars: number;             // 真實球半徑；不可使用 UI 放大值
    positionErrorStars: number;      // 位置與校正誤差估計
    confidence: number;
    continuousFromPrevious: boolean; // 遮擋／失追／ID 交換時 false
  }>;
  coverage: 'complete' | 'incomplete';
  gaps: Array<{ fromMs: number; toMs: number; reason: string }>;
};

type PocketEvent = {
  trackId: string;
  classId: string;
  pocket: PocketCode;
  timestampMs: number;
  confidence: number;
};

type ContactEvent = {
  aTrackId: string;
  bTrackId?: string;
  kind: 'ball_ball' | 'ball_cushion';
  timestampMs: number;
  confidence: number;
};

type VisionQuality = {
  usable: boolean;
  meanConfidence: number;
  maxOcclusionScore: number;
  missingExpectedBalls: string[];
  reasons: string[];
};
```

### 4.3 不確定結果

辨識不確定時不能自動判玩家失敗。Rule Engine 必須支援第三種結果：

```text
SUCCESS
FAILURE
REVIEW_REQUIRED
```

以下情況至少回傳 `REVIEW_REQUIRED`：

- 擊球期間大面積遮擋。
- 球消失但無法確認進入哪個袋口。
- 同色重複球的 track identity 發生交換。
- 母球與子球接觸順序信心不足。
- 球尚未完全停止。
- 預期球在擊球前就缺失。
- 校正失效。
- 必要線段附近有追蹤缺口，無法確認是否接觸；不能只因「沒有接觸事件」判定未碰到。

---

## 5. 球的身分與追蹤

### 5.1 編號球

1–15 號球可用球號作為語意 ID，但仍需保留 `trackId`，避免遮擋後錯接。

### 5.2 母球、灰球、紅球可重複

JSON 允許 `cue`、`gray`、`red` 重複出現。不能只用 `classId` 識別，必須在 setup verification 階段將每個偵測 track 配對至關卡中的球位索引：

```ts
type BallBinding = {
  specBallIndex: number;
  trackId: string;
  classId: string;
};
```

建議使用 class 相同且距預期起點最近的最小成本匹配。若兩顆同色球位置過近導致配對不唯一，要求人工確認。

### 5.3 進袋後

球進袋事件成立後，該 track 應標成 `pocketed`，不可因袋口附近短暫再偵測到反光而重新生成同一顆球。

---

## 6. 擺球完成判定

進入每一次或每一輪前，Flow Engine 產生 `ExpectedSetup`：

```ts
type ExpectedSetup = {
  requiredBalls: Array<{
    runtimeKey: string;
    specBallIndex: number;
    classId: string;
    expectedPosition?: { x: number; y: number };
    positionMode: 'fixed' | 'free';
  }>;
  forbiddenExtraBalls: boolean;
};
```

擺球完成條件：

1. 所有 requiredBalls 都被辨識。
2. 固定球中心在起點容差內。
3. 自由母球在合法桌面範圍內且不與其他球重疊。
4. 不存在多餘球。
5. 所有球靜止一段 debounce 時間。

建議預設值（必須可遠端設定，不要寫死）：

```json
{
  "setupPositionToleranceStars": 0.18,
  "stationarySpeedThresholdStarsPerSec": 0.025,
  "stationaryHoldMs": 700,
  "minimumBallSeparationStars": 0.16
}
```

這些是初始工程建議，不是關卡 JSON 的正式規則；上線前需用真實影片校準。

---

## 7. 一桿的開始與結束

### 7.1 開始

只有在 `READY_FOR_SHOT` 狀態才能偵測新的一桿。

建議開始條件：任一允許被擊打的球速度連續超過 movement threshold，且之前所有球已靜止。A 流程沒有母球，子球開始移動即視為擊球開始；B–E 通常由母球開始移動。

### 7.2 結束

一桿結束必須同時滿足：

- 所有仍在桌上的球速度低於停止門檻。
- 狀態持續 `allBallsStoppedHoldMs`。
- 最近一個疑似進袋事件已完成確認。
- 沒有嚴重遮擋。

建議初始值：

```json
{
  "movementStartThresholdStarsPerSec": 0.06,
  "stationarySpeedThresholdStarsPerSec": 0.025,
  "allBallsStoppedHoldMs": 900,
  "pocketConfirmationWindowMs": 500,
  "shotTimeoutMs": 30000
}
```

`shotTimeoutMs` 到期仍未穩定時回傳 `REVIEW_REQUIRED`，不要硬判失敗。

---

## 8. 進袋辨識

袋口代碼：

```ts
type PocketCode =
  | 'top_left'
  | 'top_right'
  | 'bottom_left'
  | 'bottom_right'
  | 'top_center'
  | 'bottom_center';
```

一個可靠的進袋事件至少應同時考慮：

1. 球軌跡進入該袋口 ROI。
2. 球在袋口方向持續運動。
3. 球之後從桌面區消失。
4. 消失不是被手、球桿或玩家遮擋造成。
5. 在 confirmation window 內沒有重新出現在桌面。

只憑「球不見了」不能判定進袋。

袋口圈的 UI 位置可能為了視覺效果稍微外移；影像辨識必須使用相機校正的真實 pocket ROI，不要使用畫面標示圈的位置。

---

## 9. 停球區與留桌判定

### 9.1 停球區

`diagram.zones` 使用矩形：

```text
min(x1, x2) ≤ ballCenter.fx ≤ max(x1, x2)
min(y1, y2) ≤ ballCenter.fy ≤ max(y1, y2)
```

只使用球心，不使用球外緣。必須等整桿結束且球完全停止後才判定。

若位置落在邊界附近且誤差範圍跨越邊界，回傳 `REVIEW_REQUIRED`，或使用經實測決定的 zone edge tolerance。

### 9.2 留在桌面

`stay` 的意思是該球沒有進袋，整桿結束時仍被可靠辨識在合法桌面範圍內。球短暫被遮擋不能直接判洗袋。

### 9.3 pocket_or_zone

以下任一成立即通過終點條件（仍須另外滿足 lineRequirement）：

- 進入允許袋口。
- 最終球心位於對應停球區。

進錯袋不能因原先路徑經過 zone 而成功。

### 9.4 目標線段：球體接觸，而非球心穿越

所有適用目標線段都必須接觸，顺序不限。線段的零起算索引由當桿規則 `lineRequirement.lineIndexes` 給出，幾何讀取 `diagram.lines[index]`。先依 specBallIndex ↔ trackId 配對，子球只能由本桿目標子球完成，母球只能由母球完成；不能把不同球各碰一條合併成成功。

有限線段 A→B 的瞬時接觸候選：

```text
AB = B - A
t = clamp(dot(P-A, AB) / dot(AB, AB), 0, 1)
Q = A + t * AB
d = length(P-Q)
候選接觸 = d <= 真實球半徑 r + 已校準 contactTolerance
```

端點也有效，無限延長線不算。零長線段應在載入時拒絕。誤差帶跨越判定門檻時進 REVIEW_REQUIRED，不能只擴大容差讓所有近接都算成功。應保存最小距離、半徑、誤差與門檻以供覆核。

相鄰可靠影格 P0→P1 可用「球心軌跡有限線段與目標有限線段的最短距離 <= r + 容差」檢查掃掠圓盤，避免高速移動跨過細線卻沒有取樣點落在線上。必須先確認時間間隔、速度與 track identity 連續；不可跨遮擋補長直線，也不可把碰庫前後兩点直接連成不符合反彈的軌跡。證據不足時覆核。

在庫邊的目標線段，球心距庫鼻約一個半徑即可能接觸；不能要求球心穿越庫鼻。顯示線寬與「球放大 1.3×」皆不參與幾何。

### 9.5 線段事件與三態結果

Vision 提供通用實測 trajectories。Rule Engine 內的幾何檢查器依當桿線段產生下列證據；Vision 不需要讀取關卡或決定過關：

```ts
type LineContactEvidence = {
  shotId: string;
  lineIndex: number;
  specBallIndex: number;
  trackId: string;
  fromFrameId: number;
  toFrameId: number;
  timestampMs: number;
  minDistanceStars: number;
  radiusStars: number;
  toleranceStars: number;
  confidence: number;
};
type LineRequirementResult = {
  status: 'SATISFIED' | 'NOT_SATISFIED' | 'UNCERTAIN';
  requiredLineIndexes: number[];
  touchedLineIndexes: number[];
  missingLineIndexes: number[];
  uncertainLineIndexes: number[];
  evidence: LineContactEvidence[];
};
```

- 擊球開始清空當桿旗標；只處理 startedAtMs 到 endedAtMs 的球運動證據，擺球時的接觸不計入。
- 每條線確認碰到後在本桿內保留旗標，多次碰到去重。
- 全部必要線段都有可信證據 → SATISFIED。
- 至少一條確定未碰，且有完整可靠覆蓋可排除漏判 → NOT_SATISFIED。
- 尚缺證據且可能漏判 → UNCERTAIN。空集合直接 SATISFIED。
- 下一桿、重擺、下一輪都清空；不得累積整輪或整關碰線次數。
- E 第一／第二桿分別讀 shotRules；同一條沒有 shot 的共用線，每桿仍需重新碰到。

線段 JSON 契約、舊版正規化及索引校驗見 App 文件第 7.1 節。舊檔只有 diagram.lines 時，須推導相同必要條件；未知 event 或壞索引需拒絕載入。

---

## 10. 每桿規則運算順序

```ts
type ShotDecision = {
  status: 'SUCCESS' | 'FAILURE' | 'REVIEW_REQUIRED';
  reasonCodes: string[];
  objectResult: TargetResult;
  cueResult: TargetResult;
  objectLineResult: LineRequirementResult;
  cueLineResult: LineRequirementResult;
  foulResult: FoulResult;
  acceptedPocketEvents: PocketEvent[];
  scoreDelta: number;
  evidence: unknown;
};
```

固定順序：

```text
1. 檢查 visionQuality；不可靠 → REVIEW_REQUIRED。
2. 取得本桿適用規則：
   E 且 shotIndex=1 → shotRules.first
   E 且 shotIndex≥2 → shotRules.second
   其他            → objectRules + cueRules
3. 決定本桿應打的目標球。
4. 檢查 firstCueObjectContact／直接擊球對象。
5. 檢查進袋球與指定袋口。
6. 檢查子球最終目標。
7. 檢查母球最終目標。
8. 檢查本桿子球、母球 lineRequirement，輸出接觸證據及三態結果。
9. 檢查其他子球是否被碰動、一桿是否進多顆子球。
10. 合併終點、線段與犯規條件；判定所需證據不確定 → REVIEW_REQUIRED。
    證據充分但任一必要條件失敗 → FAILURE；全部成立 → SUCCESS。
11. 將 ShotDecision 交給 Flow Engine，不在 Rule Engine 內重擺。
```

建議 reason code：

```text
OBJECT_WRONG_POCKET
OBJECT_NOT_POCKETED
OBJECT_OUTSIDE_ZONE
OBJECT_SHOULD_STAY_ON_TABLE
CUE_SCRATCH
CUE_WRONG_POCKET
CUE_OUTSIDE_ZONE
WRONG_FIRST_CONTACT
WRONG_BALL_ORDER
OTHER_OBJECT_MOVED
MULTIPLE_OBJECT_POTS
EXPECTED_BALL_MISSING
VISION_UNCERTAIN
CALIBRATION_INVALID
SHOT_TIMEOUT
OBJECT_TARGET_LINE_MISSED
CUE_TARGET_LINE_MISSED
TARGET_LINE_CONTACT_UNCERTAIN
INVALID_TARGET_LINE_RULE
```

UI 顯示文字應由 App 依 reason code 本地化，不要把中文句子寫死在辨識模組。

---

## 11. 順序與目標球

當 `objectRules.order = ascending`：

- 當前目標是桌上尚未進袋的最小編號子球。
- B、C 通常每輪只有一顆子球，不需要額外順序判定。
- A 多球題仍是一顆一顆擺；按升冪建立 attempt sequence。
- D、E 必須檢查母球第一次碰到的子球是否為當前目標。
- 若同桿進入非目標球，即使目標球也進袋，仍依犯規／錯球處理。

灰球與紅球沒有號碼，合法 JSON 不會同時使用 `ascending`。

---

## 12. 犯規判定

### 12.1 其他子球不得移動

當 `fouls.otherObjectBallsMustNotMove = true`：

- 當前目標球可以移動。
- 其他子球若 `maxDisplacement` 超過移動容差，判 `OTHER_OBJECT_MOVED`。
- 影像追蹤 jitter 不算移動。

建議初始位移容差：`0.06 星`，需由真實影片調整。

### 12.2 一桿不可進多顆子球

當 `multipleObjectPotsForbidden = true`，同一 ShotObservation 中子球 pocketEvents 超過一個即失敗。

### 12.3 洗袋

只要母球規則不是允許該袋口的 `pocket`／`pocket_or_zone`，母球進袋即 `CUE_SCRATCH`。

---

## 13. Flow Engine 狀態

```ts
type FlowState =
  | 'LOADING_LEVEL'
  | 'WAITING_FOR_SETUP'
  | 'READY_FOR_SHOT'
  | 'SHOT_IN_PROGRESS'
  | 'JUDGING_SHOT'
  | 'WAITING_FOR_CONTINUATION'
  | 'ATTEMPT_COMPLETE'
  | 'ROUND_COMPLETE'
  | 'GAME_COMPLETE'
  | 'REVIEW_REQUIRED';
```

共用 runtime：

```ts
type LevelRuntime = {
  levelId: string;
  template: 'A' | 'B' | 'C' | 'D' | 'E';
  state: FlowState;
  attemptIndex: number;
  roundIndex: number;
  shotIndex: number;
  score: number;
  activeBallBindings: BallBinding[];
  pocketedSpecBallIndexes: number[];
  decisions: ShotDecision[];
  revision: number;
};
```

每次狀態變更都增加 `revision` 並寫入 event log，方便重播、除錯與申訴。

---

## 14. A～E 流程演算法

### A：只有子球

```text
建立 attemptSequence：
  多顆編號球且 ascending → 依球號升冪
  一顆球且 total > 1   → 重複同一球位 total 次
  其他                  → 依題目順序生成 total 次

每一次：
  只要求本次子球上桌
  無母球
  子球開始移動 → shot started
  球停止／進袋 → 判定
  成功 score +1，失敗不加分
  不論結果，清除本次球並進入下一次
```

第 2 關特別重要：不能一開始同時擺 1–7 號；必須 1 號完成後才要求擺 2 號。

第 3 關須碰上庫線段 (5.5,0)→(6.5,0)，並最後停在 x=5.5–6.5、y=2–4 的區塊；第 4 關須碰左庫線段 (0,1.5)→(0,2.5)，並最後停在 x=5.5–8、y=1.5–2.5 的區塊。只符合其中一項仍失敗。兩關皆 10 次，8 次過關，8／9／10 次為一／二／三星；不論成功失敗，每次都重擺。

### B：固定位置擊球

```text
每一次：
  要求固定母球＋固定子球位
  完成一桿
  同時判定子球與母球
  成功 score +1
  不論結果，回 WAITING_FOR_SETUP
  下一次重新擺回 JSON 初始位置
```

### C：換位練習

只使用 `setup.rounds`：

```text
round = setup.rounds[roundIndex]
只要求 round.balls 上桌
一桿後判定
成功 score +1
不論結果 roundIndex +1
回 WAITING_FOR_SETUP
```

`cycles` 已經展開在 `setup.rounds`，不可再乘一次。第 12 關必須正好 8 輪。

### D：單局清檯

```text
開局：全部子球同時上桌
cuePlacement=free：要求玩家在合法位置放母球

每桿：
  成功且仍有子球：
    移除已進袋球
    其他球保持實際位置
    母球保持實際位置
    shotIndex +1
    READY_FOR_SHOT（不重擺）

  成功且已清檯：
    GAME_COMPLETE

  失敗或犯規：
    GAME_COMPLETE
```

D 的 `flow.onFailure = end_game`。不可失誤後重擺繼續同局。

### E：多輪連續清檯

```text
每輪開始：
  重擺 setup.balls 全部球
  shotIndex = 1

第一桿成功：
  移除進袋的 1 號
  母球保留實際停點
  2 號保留實際位置
  shotIndex = 2
  READY_FOR_SHOT（不重擺）

第二桿成功且清檯：
  score += 1 cleared_round
  本輪成功

任一桿失敗：
  本輪失敗，score 不增加

本輪結束：
  roundIndex += 1
  roundIndex < scoring.total → 清桌、重擺、下一輪
  否則 → GAME_COMPLETE
```

第 20 關：

- 第一桿用 `shotRules.first`，母球必須停在指定 cue zone。
- 第二桿用 `shotRules.second`，母球只需留在桌面。
- 第一桿成功後絕對不能把母球重設到初始位置。
- 教學動畫有 2 秒停頓；真人遊玩只要等待下一桿，不需自動等待 2 秒。

---

## 15. Setup 與 shot 的防重複處理

相機事件可能重複到達。所有命令需具 idempotency：

```text
同一 shotId 只能結算一次。
同一 pocket event 只能移除一顆球一次。
同一 revision 不能重複加分。
App 重連後應從 event log 還原 runtime，而不是重新猜測。
```

建議事件：

```ts
type RuntimeEvent =
  | { type: 'SETUP_CONFIRMED'; revision: number; bindings: BallBinding[] }
  | { type: 'SHOT_STARTED'; revision: number; shotId: string }
  | { type: 'SHOT_OBSERVED'; revision: number; observation: ShotObservation }
  | { type: 'SHOT_DECIDED'; revision: number; decision: ShotDecision }
  | { type: 'FLOW_ADVANCED'; revision: number; from: FlowState; to: FlowState }
  | { type: 'MANUAL_REVIEW_RESOLVED'; revision: number; resolution: string };
```

---

## 16. 對 App UI 的輸出

Flow Engine 每次更新應回傳：

```ts
type LevelViewState = {
  phase: FlowState;
  instructionCode: string;
  expectedSetup: ExpectedSetup;
  currentTargetBall?: string;
  attemptNumber: number;
  roundNumber: number;
  shotNumber: number;
  score: number;
  total: number;
  pass: number;
  stars: [number, number, number];
  lastDecision?: ShotDecision;
  canShoot: boolean;
  requiresManualReview: boolean;
};
```

建議 instruction code：

```text
PLACE_OBJECT_BALL
PLACE_CUE_AND_OBJECT
PLACE_ROUND_BALLS
PLACE_ALL_OBJECTS
PLACE_FREE_CUE
SETUP_POSITION_INCORRECT
REMOVE_EXTRA_BALL
READY_TO_SHOOT
WAIT_FOR_BALLS_TO_STOP
CONTINUE_FROM_CURRENT_POSITION
RESET_FOR_NEXT_ATTEMPT
RESET_FOR_NEXT_ROUND
LEVEL_COMPLETE
MANUAL_REVIEW_REQUIRED
```

---

## 17. 記錄與可追溯性

每桿至少保存：

- level ID、JSON version、runtime revision。
- calibration ID。
- 擊球前與停止後球位。
- 所有進袋事件與袋口。
- 首次母球接觸對象及信心值。
- Rule Engine reason codes。
- Flow Engine 前後狀態。
- 使用的容差設定版本。
- 各必要線段的接觸／未接觸／不確定結果、對應 track、影格、距離及本桿規則快照。
- 若隱私政策允許，保存短影片片段或關鍵幀引用。

不可只存「成功／失敗」，否則無法調查誤判。

---

## 18. 建議設定檔

```json
{
  "visionConfigVersion": "1.0",
  "setupPositionToleranceStars": 0.18,
  "zoneBoundaryReviewMarginStars": 0.04,
  "movementDisplacementToleranceStars": 0.06,
  "movementStartThresholdStarsPerSec": 0.06,
  "stationarySpeedThresholdStarsPerSec": 0.025,
  "stationaryHoldMs": 700,
  "allBallsStoppedHoldMs": 900,
  "pocketConfirmationWindowMs": 500,
  "shotTimeoutMs": 30000,
  "minimumClassConfidence": 0.8,
  "minimumPositionConfidence": 0.85,
  "maximumOcclusionScore": 0.35
}
```

以上數值是啟動測試的初始值，不是已驗證的產品參數。需用不同光線、球布顏色、相機角度與遮擋情境建立資料集後調校。

線段接觸另外需設定真實球半徑校正、contactToleranceStars、可靠軌跡最大影格間隔及接觸信心門檻，並記錄設定版本。本次未提供已驗證數值，不可直接以 UI 球半徑取代。

---

## 19. 必做測試

### Vision 單元測試

1. 球靜止時不因畫面抖動產生 movement。
2. 球進袋與人手遮擋能分辨。
3. 同色球交叉後 trackId 不交換；不確定時進人工審核。
4. 母球洗袋可正確識別袋口。
5. 球停在 zone 邊界時依誤差策略處理。
6. 相機移動後停止判分並要求重校正。
7. 球外緣接觸庫邊線段可識別；球心不必穿越。
8. 高速跨線以連續軌跡掃掠檢查；遮擋斷軌不得假造跨線。

### Rule Engine 單元測試

1. 正確袋、錯袋、未進袋。
2. 母球 stay、zone、pocket、pocket_or_zone。
3. ascending 正確／錯誤首次接觸。
4. otherObjectBallsMustNotMove。
5. multipleObjectPotsForbidden。
6. 不確定辨識回 REVIEW_REQUIRED，不回 FAILURE。
7. 第 3、4 關：碰線且停區內成功；只停區內或只碰線失敗。
8. 多條同球種線段全部碰到才通過；接觸順序不限，別顆球不能代替。
9. 只靠近延長線不通過；碰有限端點可通過，邊界證據不確定需覆核。
10. pocket_or_zone 加線段時為 (pocket OR zone) AND lines，不是三選一。
11. E 第一／第二桿線段分開；下一桿不得沿用上一桿旗標。
12. 無線段舊檔保持原規則，有線段舊檔正規化後必須檢查；壞索引與未知 event 拒絕載入。

### Flow Engine 整合測試

1. 第 2 關一次只要求一顆球，1→7。
2. 第 5 關每桿後母球與子球都回初始位置。
3. 第 11 關每輪只擺 `setup.rounds[n].balls`。
4. 第 12 關正好 8 輪。
5. 第 14–18 關合法進球後不重擺；失敗立即結束。
6. 第 19 關第一桿後保留母球終點，第二桿清完才加一輪分數。
7. 第 20 關只在第一桿檢查 cue zone，第二桿檢查 stay。
8. 重複送入同一 shotId 不重複加分。
9. App 中途關閉重開可從 event log 恢復。
10. 人工審核改判後，狀態與分數可確定性重算。

---

## 20. 建議交付順序

### Phase 1：離線 Rule／Flow Engine

- 讀 JSON。
- 以人工建立的 ShotObservation 跑完 20 關。
- 所有狀態轉移與計分通過自動測試。

### Phase 2：錄影辨識

- 固定錄影檔輸入。
- 產生 BallDetection、PocketEvent、ShotObservation。
- 可重播且結果確定一致。

### Phase 3：即時相機

- 校正、遮擋、重連與 timeout。
- 加入 REVIEW_REQUIRED 與人工覆核。

### Phase 4：App 整合

- UI 只消費 LevelViewState。
- Flow Engine 不依賴畫面元件。
- 建立真實球桌端到端驗收影片集。

---

## 21. 完成定義

影像辨識與流程引擎只有在以下條件全部成立時才算完成：

- 可讀取 version 1 完整關卡 JSON。
- 20 關擺球順序與重擺時機全部正確。
- 每桿都能產生有證據的 ShotObservation 與 ShotDecision。
- 不確定辨識不會被誤當玩家失敗。
- D、E 能從球的實際終點原位續桿。
- 第 19、20 關能正確執行兩桿一輪。
- 第 3、4 關能以實測接觸證據與停球區共同判定，全部模板支援 lineRequirement。
- 分數、過關與星等可由事件記錄確定性重算。
- 所有門檻可設定、有版本，且經真實影片資料驗證。
