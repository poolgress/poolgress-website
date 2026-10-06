# Poolgress 工程師交接包

更新日期：2026-10-05。對照網站：https://www.poolgress.com/level_engine/ 。本次發布：工作台 v20261005-stackable；JSON 格式維持 poolgress.coach-level version 1，model/presets 規則維持 v20261001-2。

## 閱讀順序

1. [APP_JSON_IMPLEMENTATION_GUIDE.md](APP_JSON_IMPLEMENTATION_GUIDE.md)：JSON 欄位、座標、目標、五種流程、20 關對照與 UI 重現。
2. [VISION_AND_LEVEL_ENGINE_HANDOFF.md](VISION_AND_LEVEL_ENGINE_HANDOFF.md)：影像追蹤、逐桿觀測、線段接觸證據、三態判定與狀態機。
3. [TARGET_LINE_RULES.md](TARGET_LINE_RULES.md)：本次線段規則的精簡對照。
4. [第 3 關](handoff-examples/level-03.json)、[第 4 關](handoff-examples/level-04.json)、[第 20 關](handoff-examples/level-20.json)：直接由目前工作台模型產出的完整 JSON，無另外手改規則。

## 本次必做

- diagram.paths 是教學路線；diagram.lines 是必要接觸目標。
- 球成功 = 終點條件 AND 該球本桿所有必要線段接觸。整桿還須符合另一球規則及犯規限制。
- 接觸以真實球體與有限線段判定，不要求球心穿越庫鼻。
- E 分別讀 first／second 的 lineRequirement，每桿重設接觸旗標。
- 第 3 關上庫、第 4 關左庫已補線段；請替換舊關卡 JSON。
- 第 20 關範例用於對照兩桿規則隔離，本身沒有目標線段。
- 有線段的舊檔缺少 lineRequirement 時需正規化；必要條件不得因未知欄位被略過。

## 實作狀態

工作台已支援畫線段、必要規則匯出、題目說明及第 3、4 關更新。影像辨識、接觸事件產生、真人過關運算是 App 工程端需完成的部分；文件中的介面及容差建議並非已上線的辨識系統。

舊題庫部分關卡共用 id，不可直接將此 id 當作 20 關匯入的資料庫唯一鍵。請以檔案關卡序號建立獨立鍵並保留原 id。

全 20 關請由網站「下載 20 關 JSON」取得；此交接包的三份範例供重點驗收。文件例示 TypeScript 是介面片段，需由工程端整合型別與實作。

## 2026-10-05 工作台更新

- 子球、母球及 E 第二桿的「經過目標線段」均標記為「可疊加條件」，使用獨立加號按鈕與底色，區別於終點單選選項。
- 已畫線時顯示「已疊加 N 條」；沒有線段時顯示「未畫線段」。僅進入畫線工具時顯示「畫線中・尚未設定」，不能視為已啟用必要條件。
- 進袋／停區／留桌規則不會被線段按鈕替換。線段全部接觸與終點條件使用 AND；pocket_or_zone 則是 (指定袋口 OR 停球區) AND 全部必要線段。
- 使用者已確認「經過」定義為球體碰到有限線段即可，含端點，不要求球心穿越；保留 event = ball_body_touches_segment。
- 工作台設定可直接同步至下方內嵌預覽；套用範例立即帶入。移除載入資訊、說明、選地點三個流程步驟，從模板與球桌標記開始。
- 原網站 /workflow/ 保留；新版預覽在 /level_engine/workflow/，交接文件及 ZIP 在 /level_engine/handoff/。

## 已知問題與交接優先級

使用者已指出下方關卡流程有重大失誤，要求先擱置。內嵌流程目前只是人工操作的未驗收示範，不是 App 正式狀態機規格；本次只更新上方工作台及線段疊加提示，沒有宣告流程問題已解決。

流程模組測試只代表現有程式行為符合測試案例，不能代表已符合教練最終需求。工程端不得直接照搬預覽作為正式過關判定；應以使用者確認的球類規則與 APP_JSON_IMPLEMENTATION_GUIDE.md、VISION_AND_LEVEL_ENGINE_HANDOFF.md 接觸證據規格為基礎，待流程逐項重新確認後再驗收。

交接包：Poolgress-工程交接-20261005.zip。包含完整 20 關 JSON、三份重點範例、規則文件、工作台／流程程式及檢查腳本。


## 第 02 關流程修正（2026-10-05）
保留 A 模板與 direct 擊球。開局擺七顆子球，依 1–7 號直接打進上中袋；成功只移除當前球，剩餘球原位繼續；任一桿失敗立即結束。重新挑戰重擺七顆。JSON：onSuccess=continue_until_clear、onFailure=end_game、scoring.unit=balls、total=pass=7。工作台 A 模板新增「整組依序清檯」選項；其餘 A 關卡仍逐次重擺。這次只確認第 02 關分支，其餘先前擱置的流程問題仍未驗收。
