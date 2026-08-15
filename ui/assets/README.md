# 素材資料夾（public/assets/）

放在這裡的檔案，網頁用 `/assets/…` 就能取用（部署到子路徑時 Vite 會自動處理）。

## 資料夾與建議尺寸

| 資料夾 | 用途 | 建議尺寸 | 格式 |
|---|---|---|---|
| `courses/` | 課程封面 | 1280×720（16:9） | jpg / webp |
| `challenges/` | Challenge 情境圖 | 1280×720（16:9） | jpg / webp |
| `coach/` | 教練照片 | 800×1066（3:4 直式） | jpg / webp |
| `venues/` | 合作場館照片 | 1280×720（16:9） | jpg / webp |
| `hero/` | 首頁 Hero 圖／影片 | 圖 1920×1080／影片 1080p | jpg、mp4 |
| `og/` | 社群分享預覽圖 | 1200×630 | jpg / png |

## 命名建議

用小寫英文與連字號，並與資料檔的 id 對應，例如：

- 課程 id `course-tbd-1` → `courses/course-tbd-1.jpg`
- Challenge id `challenge-1` → `challenges/challenge-1.jpg`

## 怎麼接上

放好檔案後，到對應的資料檔填入路徑（**開頭要有斜線**）：

```ts
// src/data/courses.ts
cover: '/assets/courses/course-tbd-1.jpg',   // 原本是 null

// src/data/challenges.ts
image: '/assets/challenges/challenge-1.jpg',

// src/data/venues.ts
image: '/assets/venues/xxx.jpg',
```

沒有填（維持 `null`）或圖片載入失敗時，畫面會自動顯示品牌漸層佔位，版面不會壞掉。

## 影片

課程單元影片在 `src/content/course.ts` 的單元資料填 `videoUrl`：

- 自架檔案：放 `public/assets/` 下，填 `/assets/xxx.mp4`
- 外部平台（Vimeo／YouTube／課程平台）：目前的播放器是原生 `<video>`，
  若要嵌入外部平台，需改 `src/LearnApp.tsx` 的播放區為 iframe（已標註位置）。

## 版權提醒

只放你擁有授權的素材。專案內不含任何外部下載圖片。
