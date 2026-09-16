# 雲南慢時光 · 專案維護手冊

根目錄 `README.md` 只說明網站使用方式。本文件是**唯一的人工作程規格主文件**，集中描述架構、資料契約、PUBLIC / DEV、來源追溯、圖片本地化、版本、Cache、驗證與已知工程決策。

文件維護原則：除 generated ledger、必要證據清單，以及使用者明確指定獨立維護的動態橫幅文件 `docs/YUNNAN_BANNER.md` 外，不再為單一主題新增 MD；新的工程規則優先合併進本文件，避免規格分散與互相矛盾。

動態橫幅的行為、動畫安全、暫停狀態與整合邊界以 `docs/YUNNAN_BANNER.md` 為專屬規格；若與本文件的一般規則衝突，仍以本文件的版本、Cache、PUBLIC / DEV 與資料契約為上位規則。

## 1. 專案結構

```text
/
├── index.html
├── README.md                       # 使用者說明
├── css/banner.css                  # 動態雲霧橫幅樣式（yn- 命名空間）
├── js/banner.js                    # 動態雲霧橫幅互動／WebGL
├── images/places/blue-moon-valley.webp # 橫幅與藍月谷共用同一 registry 圖片
├── START.bat
├── SYNC_IMAGES.bat
├── sw.js
├── owner-insights.html             # unlinked owner-only analytics entry
├── manifest.webmanifest
├── offline-manifest.json           # generated
├── icons/
├── css/style.css
├── js/
│   ├── network.js
│   ├── core.js
│   ├── analytics.js
│   ├── weather.js
│   ├── offline.js
│   ├── settings.js
│   ├── reader.js
│   ├── journey.js
│   ├── map.js
│   ├── library.js
│   └── app.js
├── data/
│   ├── trip-data.json
│   ├── analytics-config.json       # optional, not trip content
│   ├── social-sources.json
│   └── source-index.json           # generated
├── images/
│   ├── food/                       # 美食
│   ├── shopping/                   # 伴手禮／購物
│   ├── hotels/                     # 飯店
│   ├── places/                     # 景點／文化／交通／手冊裁圖
│   └── pose/                       # 旅拍 Pose
├── tools/
│   ├── release.json
│   ├── release.py
│   ├── sync_images.py
│   ├── generate_source_index.py
│   ├── generate_image_sources.py
│   ├── generate_offline_manifest.py
│   ├── validate_project.py
│   ├── media_dev.py
│   └── optimize_media.py
└── docs/
    ├── PROJECT.md                  # 人工維護的工程主文件
    ├── YUNNAN_BANNER.md            # 使用者指定獨立維護的動態橫幅規格
    └── sources/
        ├── IMAGE_SOURCES.md        # generated 圖片來源帳本
        └── HANDBOOK_IMAGE_CROPS.md # 手冊裁圖證據清單
```

網站是純靜態 HTML/CSS/JS/JSON，不需要 build tool。`data/trip-data.json` 是主要旅程資料唯一來源，維持單檔。

## 2. 資料契約

- `trip-data.json`：旅程、Day、地點、美食、購物、照片 metadata 等正式資料。
- `analytics-config.json`：純技術性、可選的匿名統計設定，不屬於旅程正式資料；預設 `enabled:false`。
- `days[*]` 只引用 ID，不複製完整 entity。
- `pdfScheduled: true` 表示原始旅行手冊已安排的內容；Day itinerary 與住宿必須維持此契約。
- 地址或座標無法核實時保持不確定，不用城市中心或猜測座標補洞。
- 收藏、自定義地圖、導航偏好只存在瀏覽器，不寫回正式 JSON。
- `social-sources.json` 保存來源紀錄；正式 entity 以 `sourceRefs` / `fieldSources` 引用。
- `source-index.json` 由正式資料與來源紀錄推導，不可手改。
- `trip-data.json > images` 是全站圖片 registry、來源 metadata 與授權資訊的唯一來源；內容 entity 只以 `imageId` 引用。`IMAGE_SOURCES.md` 由工具生成。
- `foods[*].priority` 只在需要優先排序時使用 `必吃`；`shopping[*].priority` 使用 `必買`，且必買商品的 `group` 也必須是 `必買`。Priority 是本次旅程內容排序，不改寫 `pdfScheduled`。
- 所有 `foods[*]` 與可食用／可飲用的 `shopping[*]` 使用 `foodReview`：`verdict`、`aroma`、`flavor`、`texture`、`bestWay`、`caution`、`forWhom`，以及 `scores`（香氣／口感／味道層次／地方特色／回購度，各 1–5）。購物品項另以 `edible: true` 標示。評鑑屬典型風味整理，不宣稱特定店家或品牌實測。
- `culture[*].kind: "鄉野奇談"` 只收錄有可追溯地方傳說／民俗／信仰來源的故事；文字必須明確區分傳說與史實，不把靈異說法寫成已證實事件。

### 版面名稱約定

- **電腦版**：桌機／筆電上的正常寬版。
- **手機版**：手機上的 responsive 版，為預設。
- **手機電腦版**：手機選擇「電腦版」後，以固定桌面 viewport 自動縮放至手機寬度；不是第三個可選 preference。

## 3. 來源與查核資料契約

正式來源紀錄存於 `data/social-sources.json`，引用關係由 `sourceRefs` / `fieldSources` 表示；`data/source-index.json` 是 generated file。

### Source Record

每筆來源以 `sourceId` 為永久識別。V1 正式紀錄至少維持：`sourceId`、`platform`、`url`、`canonicalUrl`、`postId`、`contentType`、`author`、`publishedAt`、`retrievedAt`、`lastSeenAt`、`status`、`language`、`title`、`excerpt`、`tags`、`collection`。`retrievedAt`、`publishedAt`、`lastSeenAt` 等日期是來源證據，必須保留。

`collection` 至少能追溯採集方式、collector、parserVersion 與 notes；只使用可正常公開存取的來源，不繞過 CAPTCHA、登入限制、付費牆或平台安全機制。

### `sourceId` 與正式資料引用

- `sourceId` 建立後不可改作另一個來源；可使用 `web_YYYYMMDD_NNNN`、`official_YYYYMMDD_NNNN` 等可辨識格式。
- 同一 URL / 同一內容重複採集時先去重，不建立無必要的第二筆紀錄。
- 新來源即使補強同一結論，也建立新的 `sourceId`，不得覆寫既有來源。
- Entity 級使用 `sourceRefs`；欄位級證據使用 `fieldSources`，且其中每個 ID 也必須存在同一 entity 的 `sourceRefs`。
- 多篇來源合併時取來源聯集，不因整理成一張卡片而丟失 refs。

### 官方、社群、推論與失效來源

- 官方頁面優先支撐名稱、地址、電話、票務、營業時間、交通規則等可核實資訊。
- 社群／一般網頁可支撐體驗、拍照角度、熱門時段、排隊感受等經驗性資訊，但不能自動升格成官方事實。
- 二次整理頁只能記錄為二次來源；沒有可驗證原始貼文 URL 時，不建立假的原始平台來源紀錄。
- 同一結論出現衝突時不靜默合併；正式內容採較可靠來源，必要時保留差異說明。
- 來源狀態建議使用 `active`、`unavailable`、`deleted`、`private`。失效時保留原 `sourceId`、URL、retrieved metadata 與最後已知狀態；替代來源建立新 ID，不把舊 ID 指向新 URL。
- 不保存或散佈不必要的整篇受著作權保護內容，只保留追溯所需 metadata、短摘要與必要 notes。

### 拍照／Pose 社群研究來源

「旅拍指南」的機位與 Pose 研究固定優先搜尋 **小紅書、抖音、大眾點評**；必要時再以一般網頁、官方景區或其他公開社群補強。這三個平台的角色如下：
- 旅拍指南同一場景的不同 Pose 參考圖必須互不重複；若只有一張可用來源圖，就只保留一個 Pose，不以同圖補數量。

- **小紅書**：找近期打卡機位、人物 Pose、季節實拍與「同款」路線。若搜尋引擎只能取得二次索引、無法穩定核對原貼 URL，依來源契約只保存二次來源，不建立假的 `xiaohongshu` Source Record。
- **抖音**：找近期現場影片、走動 Pose、拍攝機位與人流／天候下的真實畫面；採用時保存可公開核對的原影片 URL。
- **大眾點評**：看一般遊客會員相冊與景點實拍，補足「不是專業旅拍也能拍到什麼」的視角；會員圖片只作研究，不視為可重用授權。
- **Threads**：可搜尋，但不是固定必須來源；若沒有足以改變建議的有效內容，不為湊平台而建立紀錄。

拍照資料把社群結論整理成 `poseTips`（Pose、攝影者位置、鏡頭／倍率、研究 URL），每個 Pose 只保存 `imageId` 來引用全站 `images` registry；圖片本身的來源頁、作者、授權、local 與 remote 一律只記在對應 image record。PUBLIC ONLY 顯示可追溯的來源實拍與來源資訊；小紅書／抖音／大眾點評仍可作機位研究來源。圖片讀取與同步不得另外使用 `sourceImage` 特例，也不得在同步時搜尋替代圖。

### 圖片與媒體來源界線

所有 managed 圖片都由 `trip-data.json > images` 管理，不再區分「一般圖片 metadata」與「Pose 圖片 metadata」兩套資料。`poseTips` 只描述拍法與研究連結，真正顯示的圖片來源、作者、授權、精確 remote 與 local 都由 `images[imageId]` 提供。第三方圖片的來源標示不代表取得再利用授權；來源失效時可以更換該 image record，但不得用相似圖靜默替代同一 imageId。

`data/source-index.json` 由 `python tools/generate_source_index.py` 生成，不得手改。Validator 會檢查來源 ID、`fieldSources ⊆ sourceRefs`、Source Record key / `sourceId` 與 generated index 同步。

不可退化的來源規則：**來源可失效但追溯鏈不可消失；新來源不覆寫舊 `sourceId`；正式 entity 合併取來源聯集；官方事實與社群經驗分開；圖片來源證據不等於部署授權；generated index 不人工維護。**

## 4. PUBLIC / DEV 顯示模式

本專案只有兩個顯示層級，**共用同一份資料、同一套網站與同一套圖片**；差別只在開發／維護資訊是否可見。命名採最少規則：網址只使用 `dev=1`，JavaScript 只使用 `isDev`；PUBLIC 為預設，不另外建立 `publicMode` / `publicOnly` / `isPublic` 等重複狀態。

### PUBLIC ONLY（預設）

- 正常網址就是 PUBLIC ONLY，不需要 query parameter。
- Settings 只顯示純版本號，例如 `版本 1.1.2`。
- **不顯示**「版本格式：驕傲．預設．羞恥。」這類維護規則。
- 圖片來源區直接從標準 registry 欄位 `caption`、`author`、`source`、`license`、`licenseUrl` 產生旅客可讀 attribution；不另設 `public*` 圖片欄位。
- 不曝光 `changes`、內部修正紀錄、下載 cache/hash、source parser 等工程資訊。
- 天氣卡顯示「本次資料來源」與可閱讀的完整天氣入口；不顯示 API 文件與 provider 工程說明。

### DEV ONLY

以網址 query `?dev=1` 啟用，例如：

```text
https://example.com/?dev=1
```

DEV ONLY 在不改變正式資料的前提下額外顯示：

- 圖片完整 `caption`、`author/source`、`license/licenseUrl`、`changes`。
- Settings 的「版本格式：驕傲．預設．羞恥。」說明。
- 旅拍詳情中的 Image System / `SYNC_IMAGES.bat` 工程提示。
- 天氣 provider 欄位優先順序、三家 API 文件與服務能力說明。
- 其他明確設計為 DEV ONLY 的開發／維護資訊。

舊的 `photoMeta` 顯示模式已移除，也不做相容層。**PUBLIC ONLY 是產品介面，DEV ONLY 是開發／維護介面，不是兩套內容。**

## 5. Module / State Ownership

| Module | Ownership |
| --- | --- |
| `network.js` | 國際版／大陸版 profile（預設大陸版）、Leaflet runtime loader、OSM／高德底圖選擇、WGS84 ↔ GCJ-02 顯示座標轉換；同時提供 QWeather Grid 所需 converter |
| `core.js` | Image System、Travel Utils、Favorites Store、Navigation Service、Date Rail、Horizontal Scroller；Image System 固定執行 `imageId → local 本地 WebP → remote（同一張精確原圖）→ 無此圖`，不做跨地點／同類商品／搜尋替代圖 fallback |
| `analytics.js` | 可選 Umami tracker loader、匿名事件 queue 與 persistent anonymous browser ID；不記姓名、表單內容／精確定位；未啟用或本機開發時不載入外部 tracker |
| `weather.js` | 高德 → QWeather Grid → Open-Meteo 欄位優先合併、API credential local settings、1 小時 cache、offline fallback、weather alert、Journey／Map weather slots；旅程總覽簡易卡顯示溫度／天氣 + 第二列 compact metrics（🏔 海拔、☂ 降雨、UV emoji + 指數）；可用 provider 並行請求，高順位既有欄位不被低順位覆蓋；另由 Open-Meteo / Copernicus DEM 90 m 維護每個 weather point 的座標海拔，與天氣 provider 優先合併分離。 UV 指數顯示共用標準分級 emoji：0–2 👩🏻‍🦲、3–5 👩🏼‍🦲、6–7 👩🏽‍🦲、8–10 👩🏾‍🦲、11+ 👩🏿‍🦲。PUBLIC ONLY 顯示本次資料來源、約略海拔與完整天氣入口（高德使用站內實況／短期檢視器，Open-Meteo 使用站內 16 天／24 小時檢視器），DEV ONLY 顯示 API 文件、Elevation API、欄位優先順序、海拔原始值與查詢座標；同時集中管理小紅書搜尋詞、Deeplink 與共用確認彈窗 |
| `offline.js` | PWA 選擇式離線準備、Service Worker bridge、Cache 完整性檢查、缺失清單、只重試失敗照片、安裝提示、收藏／偏好匯出匯入；不保存天氣 API Key |
| `settings.js` | Settings View 的顯示主題與介面版面 preference owner；主題支援 `system / light / dark`，版面支援 `mobile / desktop`；使用 `yunnan-2026-color-theme-v1` 與 `yunnan-2026-ui-layout-v1` |
| `reader.js` | Content Reader、stack、return state、Reader swipe；每個 Item Reader 操作列向 Weather/XHS helper 取得對應搜尋資料並顯示 `📕 小紅書` 按鈕 |
| `journey.js` | Day 01–08、Day 展開、時刻表、PNG export、航班／住宿 Journey UI |
| `map.js` | Leaflet、Map filters、Map Rail、Map Detail、定位、自定義地點、長按；無底圖時提供離線地標簡圖與純座標 Nearby |

### 探索地圖地標顯示規則

- 探索地圖預設使用「全部」，地圖標記與下方卡片清單必須使用同一組可見資料。
- 切換「全部／已安排／自定義」時，Leaflet 標記、離線簡圖與下方卡片必須同步重繪；不得只切換卡片清單而讓地圖仍停留在上一組標記。
- `customMapDefault` 內且符合當日 `days` 的地點，在「全部」與「自定義」中都必須可見。2026-09-16 新增的大理北門菜市場、總統兵馬大元帥府、南詔十二時辰對既有 localStorage 做一次性補種，避免舊裝置因曾開過網站而漏掉新地標。
- 使用者之後手動移除自定義地點仍以 localStorage 為準；一次性補種不重複執行。
| `library.js` | Content/Story Card、Night/Food/Shopping/Favorites/Photo/Culture state/render |
| `app.js` | JSON bootstrap、`VIEW_REGISTRY`、App Shell、shared day coordinator、單一 action router、全版面 Main Tab swipe |

主要 state 只由各自 Owner 寫入：App 擁有 `currentView`；Network 擁有 profile；Core 擁有 Favorites IDs 與 navigation provider；Analytics 擁有 tracker runtime 與匿名 V-ID；Weather 擁有 provider credentials/cache；Offline 擁有離線選取與準備狀態；Settings 擁有顯示主題與介面版面；Journey／Map／Library／Reader 各自持有 Domain state。Map / Night 共用日期由 App 只做協調，不建立第三份 Domain state。

小紅書天氣實況屬 Weather UI：今日／昨日按鈕先開啟站內確認彈窗，彈窗明示「需已安裝小紅書 App；未安裝無法直接使用」，並顯示完整搜尋詞。使用者再按「開啟小紅書」時才以官方 `xhsdiscover://search/result?keyword=...&target_search=notes&source=deeplink` 嘗試喚起 App，避免使用會被風控阻擋的 Web 搜尋頁；同一彈窗保留一鍵「複製搜尋詞」備援。今日／昨日入口點擊事件由 App 的單一 router 送出 `weather_live_search`，payload 僅記錄 `range=today/yesterday`、地點標籤、實況日期與旅程 Day，不讀取小紅書結果或使用者帳號。

Detail Reader 的小紅書入口共用同一彈窗與 Deeplink，不在圖卡表面增加按鈕。每個 Item Reader 都顯示 `📕 小紅書`：`photo` 使用「拍照／機位／構圖／姿勢」、`food` 使用「推薦／好吃／避雷」、`shopping` 使用「推薦／哪裡買」、`hotel` 使用「實拍／早餐／隔音」、`night` 使用「夜遊／實況／攻略」，一般 itinerary 使用「攻略／實況／避雷」。只有一般景點／天氣型卡片（玉龍雪山、雲杉坪、藍月谷、甘海子、虎跳峽、松贊林寺、普達措）視為 `live` 並使用今天／昨天日期；旅拍指南卡片一律維持拍照查詢，不再切成天氣實況搜尋。Reader 入口事件另送 `xhs_search_open`（`id/type/mode`）。

## 6. View Registry / Action Router

`app.js > VIEW_REGISTRY` 是主 View 的唯一登記處，合法 View、導覽順序與主頁 swipe 順序都由它推導。 固定順序為：**旅程總覽 → 探索地圖 → 夜間逍遙 → 當地必吃 → 雲南必買 → 我的收藏 → 旅拍指南 → 風俗與故事 → 不負責任專區 → 出發提醒 → 設定**。非地圖 View 在啟動時建立穩定 DOM；圖片仍由 Image System 使用原生 lazy loading 控制下載。Map 是唯一延後初始化的 View，必須先切成可見狀態，再於下一個 layout frame 建立或更新 Leaflet。

中央 `document click` 只保留一個，順序為：Offline → Weather → Journey → Reader → Map → Library → App shared actions。局部 gesture controller 只處理自己的 boundary，不再建立第二套 document-level router。

App shared actions 同時維護通用文字複製 fallback：若直接 Clipboard API 失敗，開啟「中文地址／搜尋文字」彈窗；彈窗內仍有一鍵「複製」與可手動選取的 textarea，不要求使用者只能長按。

## 7. Card / Rail / Reader

網站只維護四套 Card System：

| Card | Owner / 用途 |
| --- | --- |
| Content Card | Library；夜遊、必吃、必買、收藏、拍照、故事 |
| Journey Card | Journey；Day Carousel、完整 Day |
| Compact Card | Map / Story；地點 Rail、Day Story Rail |
| Utility Card | 對應 Domain；日期、時刻表、航班、設定、Tips |

Rail 規則：`.rail--snap` 用於需要停靠；`.rail--free` 自由停留；`.rail--mouse-drag` 提供桌面左鍵抓取。Touch / Pen 一律用 Native Scroll。Main View swipe 只由 App pager 擁有；只有當 Rail／Timetable 當下真的 `scrollWidth > clientWidth` 時才攔截水平手勢，桌面 Grid 不因保留 `.rail` class 形成死區。Map、Button/Link/Form、Dialog 固定 blocked。

Reader 關閉後回原本 window scroll、Rail scroll 與 focus。Content Reader 使用內部 stack，不疊多層 modal。

**當地必吃**的「必吃排序／口感評鑑」說明維持與「風俗與故事」頁首相同的輕量 `.muted` 文字樣式。**夜間逍遙**的綠色 `.note` 摘要固定放在頁面標題正下方、日期切換之前；切換到單日時只更新該摘要文字，不把提示框移回內容區。**旅拍指南**則先顯示輕量 `.muted` 日期／Pose 說明，再緊接綠色 `.note` 來源／排序提示，兩者都位於日期切換之前。

可點擊的 Content / Story / Journey summary 圖卡區必須在圖卡區上方提供一致的小字操作提示（例如「點一下圖卡，看更多內容」）；純展示卡不顯示，避免誤導。提示屬於 Card Group，不屬於整個頁面：固定放在「該組圖卡的群組標題正下方、第一張圖卡正上方」。夜間逍遙放在「城市 · 今晚住宿附近」下方；雲南必買放在每個目前可見的「必買／可以買／建議當地吃」群組標題下方；旅拍指南放在每個「城市 · 當天拍照清單」下方。日期列、分類篩選器與頁首說明文字附近不得放置這句提示；分類篩選不另外顯示「篩選必買」標題。探索地圖的「滑動探索地點」為特殊互動：短按圖卡用於定位與附近提案，長按約半秒後放開才開完整 Reader，因此圖卡前提示固定使用「長壓一下圖卡，看更多內容」，不得寫成一般的「點一下」。Journey Day Carousel 的整張摘要卡可點擊／鍵盤 Enter 或 Space 展開當天內容，卡片內既有按鈕仍可獨立操作。拍照頁只有目前日期（或全部八天）真的含 `drama:true` 卡片時才顯示《去有風的地方》篩選；不提供「必拍」篩選，優先機位以資料中的 `priority` 排序在前，但 PUBLIC ONLY 圖卡不另外顯示「必拍」標籤。

## 8. Image System / Mobile Traffic / 圖片同步

全站 managed `<img>` 只由 `core.js > createImageSystem()` 管理。景點、飯店、美食、購物、故事、Hero 與旅拍 Pose 都走同一份 registry、同一個錯誤降級流程。

### 唯一 Image Registry schema

正式 registry 位於 `trip-data.json > images`。內容 entity、Day、Hero 與 `poseTips` 只引用 `imageId`；不在其他位置重複保存圖片 URL、來源或授權資料。

每一筆 image record **固定只能有以下 11 個欄位**：

```json
{
  "images": {
    "souvenir-tamarind": {
      "local": "images/shopping/souvenir-tamarind.webp",
      "remote": "https://example.com/exact-image.jpg",
      "alt": "酸角果實",
      "caption": "酸角／羅望子果實實拍",
      "source": "https://example.com/source-page",
      "author": "Ivar Leidus",
      "license": "CC BY-SA 4.0",
      "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
      "width": 1280,
      "height": 720,
      "changes": "縮放並轉為 WebP；未修改內容。"
    }
  }
}
```

欄位責任：

- `local`：專案內 WebP，且只能位於 `images/food/`、`images/shopping/`、`images/hotels/`、`images/places/`、`images/pose/`、`images/airlines/`、`images/handbook/`。
- `remote`：**必填**。即使 local 已本地化也永久保留；必須是與 local 同一張圖的精確 HTTP(S) 圖片 URL，用於 runtime fallback 與 `SYNC_IMAGES.bat`。
- `source`：**必填**的可追溯來源頁；它不是 runtime 圖片 URL，也不得拿來猜 fallback 圖。
- `author`、`license`、`licenseUrl`：權利與歸屬資訊。來源頁未標示可重用授權時必須如實記錄，不推定授權。
- `alt`、`caption`：無障礙文字與來源說明。
- `width`、`height`：local WebP 實際尺寸；local 尚未同步時使用 `0 × 0`，同步成功後由工具自動回寫。
- `changes`：裁切、縮放、WebP 轉檔或其他處理說明。

`images` object 的 key 本身就是 imageId，因此 record 內禁止再放 `id`。舊欄位 `src`、`remoteSrc`、`sourceImage`、`fallbackSrc`、`sourceUrl`、`originalUrl`、`originalSource`、`captureSource`、`capturePage`、`publicCaption` 等全部淘汰，不做舊格式兼容。

### 唯一讀圖流程

```text
imageId
  ↓
images[imageId].local
  ↓ 載入失敗／檔案尚未同步
images[imageId].remote
  ↓ 載入失敗
無此圖
```

Service Worker 可以快取成功載入的圖片，但 Cache 不能改變圖片身分。程式不得因下載失敗改抓附近景點、同城市、同類商品、來源頁第一張圖、搜尋結果或舊不明檔案。

### 實體資料夾

```text
images/
├── food/
├── shopping/
├── hotels/
├── places/
├── pose/
├── airlines/
└── handbook/
```

`images/airlines/` 專門保留航空公司／航班示意圖；`images/handbook/` 專門保留由旅遊手冊裁出的圖片。兩者保留獨立分類，不併入 `places/`。舊的 `images/library/`、`images/remote/` 不保留；手冊裁圖頁碼證據仍由 `docs/sources/HANDBOOK_IMAGE_CROPS.md` 保存。

### `SYNC_IMAGES.bat` 精確同步

`SYNC_IMAGES.bat` 先處理 Windows / Anaconda 常見 SSL、Pillow 與 WebP 環境，再呼叫 `tools/sync_images.py`。因為每一筆 image record 都必須有 `remote`，同步器可以用完全一致的流程處理所有圖片：

```text
images[*].remote（精確 URL）
  ↓
直接下載；不搜尋、不代理換圖、不猜替代來源
  ↓
解碼／轉成 WebP，最長邊 1280px、quality 82
  ↓
SHA-256 + remote URL + local path 寫入 image-sync-cache
  ↓
原子寫入 images[*].local
  ↓
回寫 local 的實際 width / height
```

已打包且 cache 能證明 `remote + local + SHA-256` 一致的檔案只做 VERIFIED，不重抓。若 local 無法證明與目前 remote 一致，而此次遠端同步又失敗，工具會把未驗證 local 移到 `images/_quarantine/`，讓網站退回 exact remote；不得保留可能是錯圖的 local 來假裝成功。

同步後輸出 `sync_images.log`、`sync_failures.txt`（若有）與 `docs/IMAGE_SYNC_REPORT.html`；報告依 `images/` 第一層資料夾分組，每區顯示 record 數與 `SYNCED / VERIFIED / FAILED` 統計，頁首提供分組快速跳轉與總統計。若本輪真的新增／替換／移除 local 圖或更新 registry 尺寸，`sync_images.py` 必須呼叫 `release.py --new-build`，確保已安裝客戶端可由 `build.json + imageHashes` 偵測圖片變更；若全部只是 VERIFIED 則維持既有 Build。之後重建 `IMAGE_SOURCES.md` → `POSE_SCREENSHOT_SOURCES.md` → `offline-manifest.json` → build manifest → validator。只有所有 pending local 都同步完成時才建立 `*_all_local.zip`。 最後一定另外輸出 `sync_summary.txt` 與英文終端統計：`Total`＝本輪 remote-backed image records；`Success`＝本輪新下載並轉檔成功的 `SYNCED`；`Ignored`＝exact remote + local + SHA-256 已驗證一致的 `VERIFIED`，因此不重抓；`Failed`＝個別圖片下載／解碼／轉檔失敗、仍使用 exact remote fallback；`Errors`＝同步流程、generated artifacts、validator 或 ZIP 等工具層級異常。

### 旅拍 Pose

Pose 不再保存 `sourceImage` 或 `sourcePlatform/sourceTitle/sourceUrl/sourceAuthor/sourceDate/sourceAlt/sourceCaptured` 等第二套圖片 metadata。每個 Pose 只保存自己的 `imageId`；其來源頁、作者、授權、local 與 exact remote 全部由 `images[imageId]` 提供。現有 29 個 Pose 的 remote 保留目前已確認的精確來源圖，本地化後 remote 也不刪除。

這個設計直接避免先前錯誤：**遠端顯示 A，本地化後卻因搜尋、舊檔或錯誤對應變成 B。** 同一 imageId 永遠只有一個核准的 remote 身分。

### 酸角／野生菌精釀啤酒

舊的小紅書伴手禮榜單裁切圖不再使用。`酸角` 現在引用新的 `souvenir-tamarind` registry record（Wikimedia Commons 可追溯果實實拍）；`野生菌精釀啤酒` 引用新的 `souvenir-wild-mushroom-beer` record（FoodTalks 公開商品／場景圖）。兩者 local 都位於 `images/shopping/`；尚未同步時使用各自 exact remote。

### 離線 manifest 與 Cache

`generate_offline_manifest.py` 對每筆 record：local 實際存在時列入 `imageAssets`；local 不存在時列入 `remoteImages`。因為 `remote` 永遠必填，所以不再存在「local 與 remote 都沒有」的合法狀態。

「設定 → 離線準備」會依 manifest 準備 Image Cache。一般 build 更新不無條件重抓全部圖片；圖片真正替換時必須更新 registry 的 remote/source/changes，並讓 local 與 cache 重新驗證。

### 驗證規則

Validator 至少檢查：

- 每一筆 `images[*]` **剛好只有 11 個核准欄位**，缺一或多一都 ERROR。
- `local` 必須位於七個核准資料夾（`food / shopping / hotels / places / pose / airlines / handbook`）且為 WebP；`remote`、`source`、`licenseUrl` 都必須是 HTTP(S)。
- local 存在時 `width/height` 必須與實際 WebP 尺寸一致；local 不存在時必須是 `0/0`。
- 所有內容 entity 只以 `imageId` 指向 registry；`imageUnavailable` 與舊圖片欄位禁止。
- Pose imageId 必須獨立，local 位於 `images/pose/`，且不同 Pose 不得共用 exact remote。
- `images/` 不得殘留 `library/`、`remote/` 等舊目錄；`handbook/`、`airlines/` 為正式保留分類。
- `IMAGE_SOURCES.md` 與 `POSE_SCREENSHOT_SOURCES.md` 必須由目前 registry 重新生成並與資料一致。

## 9. Anonymous Analytics / Owner Insights

`analytics.js` 只在 HTTPS 線上環境且 `analytics-config.json` 有合法 Umami Website ID、`enabled:true` 時載入 tracker。本機 `file://`、localhost / 127.0.0.1 不送統計。首次進站產生 80-bit 隨機 V-ID，優先存 localStorage，再呼叫 `umami.identify(V-ID)`；tracker 關閉 auto pageview，先 identify 再手動送首個 pageview。

主 App 只送低敏感度事件：`tab_view`、`item_open`、`story_open`、`navigation_open`、`favorite_click`、`map_geolocate`、`nearby_open`、`weather_refresh`、`offline_prepare`、`timetable_download`，以及新 V-ID 首次建立時一次 `anonymous_visitor_created`。不可加入姓名、電話、Email、備註內容、API Key、GPS 經緯度或其他個人資料。

`owner-insights.html` 不出現在主導覽／footer / README 快速入口，並使用 `noindex,nofollow`。Umami Share URL 不可明文寫進 repo；Owner setup 使用 PBKDF2-SHA256 + AES-GCM 加密後再產生 `analytics-config.json`。這是 unlisted secret-link gate，不取代 Umami 帳號權限。

`analytics-config.json` 不納入離線核心完整性判定；Service Worker 對它採 network-only，失敗等同 analytics disabled。V-ID 是「瀏覽器身分」而不是保證的一人一 ID。

## 10. CSS

`css/style.css` 維持單檔，以 Domain / Card / Rail Ownership 區塊維護。現有 cascade 與手機 gesture 關聯很深，不做無目的的大規模排序或拆檔。

修改 `touch-action`、`scroll-snap`、`overflow-x` 前先確認 Rail owner；新規則放回所屬區塊，不使用日期式 patch 區塊累積 override。

設定頁 UI 順序固定為：**連網模式 → 預設導航地圖 → 介面版面 → 顯示主題**，其後再接天氣與離線相關設定。

顯示主題由 `settings.js` 擁有：`system` 為預設並跟隨 `prefers-color-scheme`，`light` / `dark` 可強制固定。解析後的實際主題寫入 `html[data-theme="light|dark"]`；偏好寫入 `data-theme-preference`。既有 dark media rules 在固定主題時由 Settings 同步啟用／停用，避免「固定淺色」仍被作業系統深色規則污染。

## 11. Release Version / Schema / Cache / Generated Data

`tools/release.json` 保存對外軟體版本，格式為三段十進位整數。三段依專案內部約定分別是 proud / default / shame，且**獨立累加、不做 SemVer 式歸零**。UI 顯示細節依本文件「PUBLIC / DEV 顯示模式」執行。

對外 Release Version、內部 Build ID 與 storage/schema 契約分離：HTML 同時保存 `data-app-version` 與 `data-app-build`；CSS / JS 使用 `?b=<Build ID>` 做部署級 cache busting，App Cache 使用 Release Version + Build ID。Build ID 可在對外版本固定時獨立更新；Favorites / Map / Network / UI theme / UI layout / Weather / Offline / Source parser 等 storage/schema key 維持 `v1`。只有真正做資料格式 migration 時才升 schema，不因一般 build 更新清除收藏、偏好或圖片快取。

Cache 契約：

- App Cache：`yunnan-app-<release version>-<build id>`。`build.json` 是日常唯一更新探針；HTML navigation 為 Network First、離線才退回 App Cache；JS / CSS / JSON 仍由 build-aware App Cache 管理。
- 新 build 安裝時讀 `asset-manifest.json` 的 SHA-256；雖然 CSS / JS URL 使用新的 `?b=<Build ID>`，仍會按去除 query 後的實體檔路徑比對前後 hash，未變 App Shell 從上一個 App Cache 直接複製，只有 hash 改變的核心檔才重新抓取。第一個導入 Build ID 的 legacy migration 會自動重載一次既有頁面。
- 更新確認採 Worker handshake：Service Worker 回應 `GET_BUILD_INFO`，前台只有在目前 active/controller 回報的 `version + build` 與 `build.json` 目標完全相同時才 reload。若 GitHub Pages 部署暫時不同步，維持現有可用版本並 15 秒後重試；不再用固定 timeout 後無條件 reload，也不會因未成功接管而進入舊版重載循環。
- Image Cache：`yunnan-images-v1`，Runtime 仍為 Cache First；`offline-manifest.json > imageHashes` 保存每張 packaged local WebP 的 SHA-256。新 build 安裝或使用「強制重新載入」時，只檢查目前已快取的 local 圖片：hash 相同保留、不同才重抓、已從 manifest 移除才刪除。
- Offline Meta Cache：`yunnan-offline-v1`；可見準備時間另存在 `yunnan-offline-prep-state-v1`。
- Weather cache：`yunnan-weather-cache-v1`；provider 設定：`yunnan-weather-provider-config-v1`。
- Network profile 切換後 App reload 一次，重建 Image System、Leaflet source 與底圖座標系。
- 地圖 tiles 永不納入完整離線包；無網路時 `map.js` 依正式 WGS84 座標產生離線簡圖。

Generated files：

- `data/source-index.json` ← `trip-data.json + social-sources.json`
- `docs/sources/IMAGE_SOURCES.md` ← `trip-data.json > images`
- `offline-manifest.json` ← core assets + 每張照片單一路徑清單 + packaged local 圖片 `imageHashes`；manifest schemaVersion 仍是 `v1`
- `build.json` ← 對外版本 + Build ID；前台每次開啟／回前景／重新連線時只用這個小檔案判斷是否需要更新
- `asset-manifest.json` ← App Shell 每個資源的 SHA-256；只有偵測到新 build、Service Worker 安裝時才使用

常用命令：

```bash
python tools/generate_source_index.py
python tools/generate_image_sources.py
python tools/generate_offline_manifest.py
python tools/generate_build_manifest.py
python tools/media_dev.py
python tools/optimize_media.py
python tools/validate_project.py

# 不升公開版本，只重建／驗證目前 version + build
python tools/release.py

# 發布內容有修改但公開版本維持不變：更新 Build ID
python tools/release.py --new-build

# 三種升版（正式發布時仍應搭配 --new-build）
python tools/release.py --bump proud --new-build --zip
python tools/release.py --bump default --new-build --zip
python tools/release.py --bump shame --new-build --zip
```

`release.py` 依需要累加指定版本段或產生新的 Build ID，同步 HTML / Service Worker、重建 Source / Photo / Offline / Build generated files、執行 validator，最後依需要產生 ZIP。公開部署只要內容有變，即使版本號固定，也應使用 `--new-build`。

## 12. 最低驗證

每次正式修改至少執行：

1. `python tools/validate_project.py`，必須 0 error。
2. Generated files 必須與正式資料一致。
3. `node --check` 必須通過全部 JS 與 `sw.js`。
4. ZIP 必須通過完整性測試。
5. Gesture 相關修改只有真的拿實機測過時，才能宣稱已完成特定手機實測。

## 13. 已知難題與最佳處理方式

這一章保留目前工程決策，不是修改歷史。遇到同類問題時，以「最佳處理」為預設方案。

| 問題 | 不採用的方式 | 最佳處理 |
| --- | --- | --- |
| 手機橫向卡片與主分頁 swipe 衝突 | JS Touch Drag、Pointer Capture、用 `preventDefault()` 接管一般滑動 | Touch/Pen 用 Native Scroll；主 swipe 只由 App pager 處理，只有實際水平 overflow 的 Rail 起點 blocked，桌面 Grid 不形成死區 |
| Map 卡片要短按、長按又能左右滑 | 用 `scrollLeft` 判定 swipe、放手強制 snap | Rail 自由滑動；長按只觀察時間與位移，超過門檻即取消 |
| CSS 手機修正互相破壞 | 日期式 patch、檔尾持續 override、任意拆 CSS | 維持單一 CSS；按 Ownership 放規則，小範圍調整 cascade 並 regression |
| 主 View 增加後多份清單 | whitelist、`VIEW_ORDER`、初始化 render 各自手寫 | 全部由 `VIEW_REGISTRY` 推導 |
| Leaflet 首次空白或尺寸錯誤 | 在 inactive View 先建立地圖 | 先顯示 Map View，再用 `requestAnimationFrame` 建立；之後顯示時 `invalidateSize()` |
| 中國大陸國際服務失效 | 假設 OSM / Wikimedia / Google 一定可達，或把 WGS84 直接畫到高德 | Network Profile：國際版 OSM；大陸版高德 + WGS84→GCJ-02；圖片固定本地→同圖 remote→無圖 |
| 天氣單一來源失效／精度不足 | 只依賴單一 API 或低優先來源覆蓋高優先來源 | `weather.js` 固定高德 → QWeather Grid → Open-Meteo，以欄位優先＋補缺方式合併；可用 provider 並行請求；海拔獨立固定使用 Open-Meteo / Copernicus DEM 90 m，不和天氣欄位混合 |
| Nearby 大量 `0.0 km` | 共用參考座標當精確店址、或硬補假座標 | 排除同項／別名；共用原點顯示「同區域」，1 km 內用公尺，其餘用直線公里 |
| 手機主分頁 swipe 掉幀 | `touchmove` 中 render 目標 View 或初始化 Leaflet | gesture 期間只做位移、clone 既有 DOM 與 commit 判斷 |
| 手機圖片流量過大 | 重複 render／重抓同圖／保留大型 JPEG/PNG | 穩定 View DOM + lazy loading + Image System + WebP + Image Cache First |
| Release / Build 與 schema 混在一起 | 每次部署連 storage key / image cache / schema 一起改 | `release.json` 分開保存 public version + build；schema `v1` 只有資料 migration 才升；圖片 cache 不跟 build 走 |
| Source Index 不同步 | 手改 `source-index.json` | 由正式資料自動生成並由 validator 驗證 |
| 圖片授權文件不同步 | 同時手改 JSON 與長篇 MD | `trip-data.json > images` 為 source of truth，MD 自動生成 |
| 來源失效／被刪除 | 覆寫既有 `sourceId`、偷換 URL、直接刪紀錄 | 保留原 Source Record 與狀態；替代來源建立新 ID |
| 地址／座標查不到 | 用城市中心或猜測座標填洞 | 保持待定位，核實後才寫正式座標 |
| 新功能不知道放哪 | renderer/state 塞進 `app.js` 或建第二套全域 handler | 先決定 Domain Owner；App 只做 bootstrap、協調與 router |
| 天氣重複流量 | 每次切 Day／Map 都重新呼叫 API | `weather.js` 單一 owner；每點 1 小時 cache，離線沿用最後成功資料 |
| 小紅書實況日期過期／誤用行程未來日期 | 把旅程日期寫進搜尋詞，或固定保存幾天前的「最新實況」 | 搜尋日期只取目前雲南日期；今日／昨日入口先顯示搜尋確認彈窗，再由使用者主動喚起小紅書 App；彈窗明示未安裝 App 無法直接使用並提供複製搜尋詞。跨日只重算內容，不觸發天氣 API 或重新發布 Build；絕不產生未來日期搜尋 |
| 手機一直停舊版／同版號重抓流量／圖片更新後仍看到舊圖 | HTML 與圖片都只 Cache First，或每次 reload 清掉整個 cache | HTML navigation Network First；CSS/JS 用 `?b=<Build ID>`；App Shell 用 asset hash、圖片用 `imageHashes`，只刷新內容真的變更的已快取檔；設定頁另提供「檢查更新／強制重新載入」並保留使用者資料；兩個動作都必須立即呈現按鈕 busy 狀態與 Toast，無 Service Worker 時仍以 build.json + cache-busting navigation 工作 |
| 以為「開過一次」就一定離線完整 | 只靠 lazy image / stale cache | `offline.js` 明確觸發 `PREPARE_OFFLINE`、檢查缺失並可只重試失敗照片 |
| UI 相似就全部共用 | 萬用 CardFactory + 大量 variant/options | 維持四套 Card；共用 service / 語意，不強迫共用所有 markup |
| 工程文件越拆越多 | 每個功能再新增一份 MD，規則交叉重複 | 人工規格只放 `PROJECT.md`；使用者說明放 README；sources 只保留 generated/evidence ledger |


### 2026-09-16 大理／香格里拉補充
- Day 2 夜間逍遙新增「南詔十二時辰」；既有「人民路」改為「人民路・聽歌散步」。
- Day 2 探索地圖新增「總統兵馬大元帥府（杜文秀帥府）」。
- Day 5「獨克宗四方街・鍋莊舞」改為「獨克宗・鍋莊打跳」，並在詳情說明：四方街自發鍋莊不等於保證有篝火；篝火晚會多見於另行付費的藏家／土司宴類體驗，先向導遊確認是否與 Day 6 藏民家訪重複。
- 上述卡片可用 `xhsQuery` 覆寫通用小紅書關鍵字，避免機械套用卡片名稱。

- Day 2 大理補充：床單廠藝術區加入「附近」清單；新增北門菜市場（高德「大理古城集貿市場」錨點）與「玉米大叔・鮮榨玉米汁」。北門菜市場／玉米汁主圖目前只使用明確標示的「大理古城市井情境參考」，不冒充指定攤位實拍。


### Pose 圖片完整性

- 旅拍 Pose 與全站共用同一 Image Registry；`poseTips` 只保存 `imageId` 與拍攝研究資料。
- 每個 Pose 的 `images[imageId]` 必須保存自己的 `local`、exact `remote`、`source`、作者與授權；本地化後 remote 仍保留。
- 同一旅拍場景不同 Pose 不得共用 imageId 或 exact remote。
- `images/pose-guides/`、`sourceImage` 與 pose 專屬來源欄位都屬舊格式，不得復活。
- 來源頁只負責追溯，不代表來源圖片具備可重用授權。


### Price Intel / 不負責任專區

- View key：`priceintel`；PUBLIC ONLY 對使用者顯示網友價格情報卡，資料位於 `trip-data.json > priceIntel[]`。
- 第一批資料來源為 `user_20260916_0001` / `docs/sources/reference/price-intel-xhs-20260916.jpg`；原始小紅書短連結記錄為 `https://xhslink.cn/o/9jqROa82iEe`，截圖顯示作者「葡萄西柚」。卡片價格是網友當時分享，不得當作官方固定價格；PUBLIC ONLY 在專區頁首用與「🛍 雲南必買」相同的綠色 `.note shopping-source-note` 顯示「查看原始貼文／查看來源截圖」，不再把來源截圖藏在每張卡的 DEV ONLY footer。
- 手動 browser reload 除 Build 檢查外，若 HTML 與 Service Worker 已是目前 Build，還會執行 `RECONCILE_IMAGES` 核對已快取圖片，並以 Toast 明確回報結果；不得因此清除整批 Image Cache 或使用者設定。
