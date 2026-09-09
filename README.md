# 雲南慢時光 · JSON 網站版

> 維護互動與資料規則請優先閱讀 [`MAINTENANCE_RULES.md`](MAINTENANCE_RULES.md)。


## 1. 專案結構

這個版本已把行程資料從 `js/data.js` 改成真正的 JSON。網站介面與互動仍由 `js/app.js` 負責。

```text
html/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
├── data/
│   └── trip-data.json   # 行程、景點、美食、購物、飯店、圖片來源等主要資料
├── images/              # 原有本地圖片
└── README.md
```

主要資料入口是 `data/trip-data.json`。JSON 為 UTF-8，可用 VS Code、文字編輯器或後續程式直接處理。

## 2. 上傳網路

這是純靜態網站，不需要資料庫、Node 或建置流程。把 `html` 資料夾內的全部檔案上傳到 GitHub Pages、Netlify、Vercel、Cloudflare Pages 或一般 HTTPS 靜態空間即可。

`app.js` 會用 `fetch('data/trip-data.json')` 讀取 JSON，因此**不要直接雙擊 `index.html` 用 `file://` 預覽**；瀏覽器通常會阻擋本機 JSON fetch。

本機預覽可在 `html` 資料夾執行：

```bash
python -m http.server 8000
```

再開啟 `http://localhost:8000/`。

## 3. 修改資料

直接編輯 `data/trip-data.json`：

- `days`：Day 1–8 日期、城市、飯店、景點、夜遊、美食、購物、餐食與備註。
- `places`：景點、飯店、夜遊、購物地點。
- `foods`：料理卡片。
- `shopping`：購物卡片。
- `flights`：去回程航班。
- `photos`：圖片網址／本地路徑、圖說、作者、來源及授權。
- `photoSpots`：拍照點。
- `culture`：歷史、文化、傳說故事卡。
- `tips`、`sources`：提醒及資料來源。

JSON 不允許註解、尾逗號、函式或 `push()`。新增資料時必須維持合法 JSON 格式；所有被 `days` 引用的 ID 也必須存在於對應資料集合。

## 4. 圖片顯示與來源

原有已下載照片放在 `images/`；遠端開放授權圖片由 `photos[*].src` 載入。每張正式圖片都應保存作者、來源與授權資訊。

目前採嚴格圖片比對：

- 只有能直接對應該景點／飯店／餐點／商品／故事主題的圖片才作為正式 `photoId`。
- 沒有可靠圖片時保留原圖片槽位並顯示 `無此圖`。
- 遠端圖片載入失敗時也顯示 `無此圖`，不自動換成另一張地點圖片。
- 只有參考價值但不是項目本身的圖片，可保留在來源紀錄，不作正式卡片圖片。
- 新增 Commons 等開放授權圖片時，保留 attribution 並同步更新 `PHOTO_SOURCES.md`。

## 5. 新增景點範例

在 `places` 物件加入：

```json
"my-place": {
  "id": "my-place",
  "name": "新景點",
  "city": "大理",
  "type": "itinerary",
  "description": "景點簡介",
  "duration": "依團體安排",
  "rating": null,
  "photoId": "dali-old-town-open",
  "address": "雲南省 大理 新景點",
  "addressVerified": false,
  "lat": null,
  "lng": null,
  "coordinateNote": "TODO：座標待核實"
}
```

再把 `"my-place"` 加入對應 `days[n].itinerary`。

## 6. 座標、地圖與收藏

座標使用 WGS84 十進位緯度／經度。未知座標保留 `null`，不要用城市中心假裝店址。中國境內實際導航可複製中文地址／搜尋詞到高德或百度；網站既有 Google Maps 導航連結不代表中國境內一定可用。

Leaflet 及 OpenStreetMap 圖磚需要網路。收藏仍儲存在目前瀏覽器的 `localStorage`，不會寫入 JSON，也不會自動跨裝置同步。

手機定位只在使用者主動啟動後使用瀏覽器定位 API，不保存位置；部署時建議使用 HTTPS。

## 7. 來源與內容界線

既定行程依原先提供的旅行手冊整理；網站未加入原 PDF、乘車／分房名單、人名、私人電話等私人內容。夜遊、美食、停留時間與星等是旅程規劃資訊，不等同即時營業、即時評分或預訂狀態。出發前仍應核對航班、交通、景區公告與飯店資訊。

新增圖片的授權資料均保存在 `data/trip-data.json` 的 `photos` 中。一般瀏覽卡不在圖片下顯示授權文字；完整圖片說明、作者、來源與授權改由 Detail Reader 顯示，風俗與故事頁仍保留照片來源清單。CC BY-SA 等圖片仍依各自原授權使用。

## 8. 建議上線前檢查

1. 用 HTTP/HTTPS 開啟首頁，確認 JSON 成功載入。
2. 展開 Day 1–8，確認圖片正確；沒有可靠圖片的項目保留尺寸並顯示「無此圖」。
3. 測試七個頁籤、日期切換、地圖篩選、收藏、地址複製。
4. 用手機寬度檢查底部導覽與圖片裁切。
5. 在實際旅途中要用的網路環境測試 Wikimedia、Leaflet CDN 與地圖圖磚是否可連線。

## 2026-09 地圖介面更新

- 地圖左下新增「選取地點小卡」：點選任一有座標標記，小卡會即時切換照片、名稱、類型、簡介、導航與收藏。
- 同一座標若有多個提案，小卡內可直接切換，不需打開傳統 Leaflet popup。
- 地圖標記改為「類別圖示 + 類別色」的圓形圖標：景點、住宿、夜遊、美食、購物、拍照各有不同 pictogram，不再只靠顏色辨識。
- 地圖下方保留「附近 3 公里」與完整卡片清單。
- 手機版選取地點卡仍覆蓋在地圖內，使用約 40% 地圖寬度、自然高度與最大 70% 高度。

## 2026-09 地圖滑動清單 Tab 更新

- 地圖下方滑動卡片新增「已安排」與「自定義」兩個 Tab。
- 「已安排」依目前日期與分類篩選顯示行程內的地點。
- 「自定義」由使用者自行加入；點地圖標記後，可從左側小卡按「＋ 自定義」加入或移除。
- 自定義清單儲存在瀏覽器 `localStorage` 的 `yunnan-2026-custom-map-v1`，不會改寫 `trip-data.json`。
- 兩個 Tab 都沿用橫向滑動卡片；點卡片仍會同步地圖標記與左側小卡。


## 下方地點卡片完整內容
- 下方橫向地點卡片：短按會同步地圖與左側小卡。
- **探索地點正式沿用 Content Rail 同骨架。** 手機版 `#map-list` 與「當地必吃／雲南必買」共用 CSS Grid + `grid-auto-flow:column` + 76vw 欄寬 + Native horizontal scroll；探索地點本身採自由水平滑動，不做 scroll-snap 停靠；地點卡使用 `<article role="button" tabindex="0">`。短按同步地圖；長按只看「按住時間」與「是否明顯移動」：Touch / Pen 約 12 px、Mouse 約 8 px 即取消；約 180 ms 顯示進度、520 ms 成立，放手開 Map Detail Reader。桌面版採與行程時刻表一致的左鍵抓取拖曳：按住地點 Rail 左右拖動，超過拖曳門檻後取消長按與短按；放手後停在當前位置，不吸附卡片。手機 Touch / Pen 仍完全使用原生橫向滑動。
- 彈窗會完整顯示可用的說明、分類、GROUP、停留時間、營業時間、地址／座標備註，以及夜遊／美食／拍照等類型的專屬欄位。
## 資料來源與研究規則

- `MAINTENANCE_RULES.md`：網站維護與互動規則。
- `SOCIAL_DATA_RULES.md`：小紅書／Instagram／社群來源追溯規則。
- `CUSTOM_RESEARCH_20260908.md`：本次「打車約 20 分鐘內」自定義地點研究批次。
- `data/social-sources.json`：來源 Source Record。
- `data/source-index.json`：來源引用索引。



### 導航地圖

網站預設使用 **高德地圖** 開啟地點／導航，並可切換成 Google 地圖。導航偏好會保存在目前瀏覽器，不會寫回行程 JSON。

### 住宿附近夜間活動研究

- `HOTEL_NIGHT_RESEARCH_20260908.md`：以每晚住宿為中心的步行／20 分鐘內打車夜遊研究與來源說明。

### 圖片顯示原則
網站現在採嚴格圖片比對：只有確認對應項目的圖片才顯示；沒有可靠圖片時保留版面尺寸並顯示「無此圖」。不再使用同城或情境圖硬補。


### 四套 Card System 與 Detail Reader

前端卡片現在只維護四套正式系統：

- **Content Card**：夜間逍遙、當地必吃、雲南必買、我的收藏、拍照・有風、風俗與故事。六個分頁共用同一骨架：16:10 橫向圖片、標題／Meta、2 行摘要、四格資訊、強調列、Footer。
- **Journey Card**：旅程總覽 Day 卡與展開完整行程 Day 卡。
- **Compact Card**：探索地圖地點 Rail 與每日故事 Rail。
- **Utility Card**：日期、時刻表事件、地圖資訊、導航設定與航班。

Content Card 只保留掃描所需摘要；照片來源／授權、完整交通、地址、拍攝細節與故事全文放 Detail Reader。夜間卡的飯店距離只顯示簡式公里數（例如 `約 0.30km`）。所有 Content Card 使用固定 16:10 橫向 Media Slot，卡片原圖以 `cover` 裁切並維持等高；Content Reader 與 Map Detail Reader 則使用固定 16:10 黑底橫框 + `object-fit: contain`，讓直式照片完整顯示並以左右黑邊補滿。旅程總覽縮圖缺圖時仍保留尺寸並置中顯示「無此圖」。

## 2026-09-08 事件架構定案

- 主 Tab 仍由 `showView()` 唯一真正切換。手機另由單一 `bindMainViewSwipeController()` 提供跟手式 View Swipe：一般文字、內容區、頁尾與普通文字連結都可開始左右拖曳；約 9px 後才判斷水平意圖（水平/垂直 > 1.3），拖動時目前頁與相鄰頁會同步跟手位移，超過畫面約 28% 或快速 Flick（約 0.45px/ms）才完成切換，否則回彈。卡片、橫向 Rail、地圖、日期列、時刻表、按鈕/表單與 Reader 保留自己的手勢優先權。完成後仍呼叫同一個 `showView()`，新 Tab 回頂並扣 Sticky Tab 高度；首尾不循環，Reader 關閉仍回原閱讀位置。
- Content Reader 與 Explore Map Detail Reader 共用 `bindPopupReaderNavigation()`；Pointer 為主，Touch end 可在 Pointer 被取消時完成同一手勢，並以 duplicate guard 防止一次跳兩篇。
- 「展開完整行程／展開這一天」由 `bindItineraryExpansionController()` 負責；Day 關閉返回由 `#days` 單一 `toggle` Controller 處理。
- 行程卡、時刻表與橫向列：手機使用原生 Touch momentum / scroll-snap；桌面拖曳與 wheel 統一使用 idempotent `bindHorizontalScroller()`。
- Explore Map 下方卡片由 `bindMapCardInteractionController()` 統一處理普通短按、Enter/Space 與最小化長按：`pointerdown` 開始 520 ms 計時；Touch / Pen 移動超過約 12 px、Mouse 移動超過約 8 px 即取消，約 180 ms 顯示進度，520 ms 成立後放手開 Reader。它不監聽 Rail scroll、不檢查 `scrollLeft`、不做靜止觀察，也不用 Pointer Capture；手機 Rail 完全 Native Scroll；桌面用既有 `bindHorizontalScroller(mapStrip,{mouseDrag:true,wheel:false})` 提供與時刻表一致的左鍵抓取拖曳，不把垂直 Mouse Wheel 轉成水平捲動。
- Map / Night 日期列共用 idempotent Date Rail Controller；重 render 不會重複綁 Listener。
- Reader 關閉共用 return-state 還原閱讀位置；主 Tab 回頂是獨立流程。
- `style.css` 最末 `EVENT ARCHITECTURE` 區塊是唯一 `touch-action` 契約。
- 維護細節以 `MAINTENANCE_RULES.md` 為準。


## Web image fill
- Current photo registry: 83 photo records.
- Missing-place placeholders are filled only when a reliable subject match is found; unresolved items intentionally remain `無此圖`.
- Broad food/shopping category cards can use a clearly captioned representative product example.


## 飯店與航空公司代表照片

- 六間行程住宿已補代表照片，住宿身分先依手冊名稱、分店、地址或電話交叉核對。
- 「出發提醒」的去／回程航班 Utility Card 僅顯示航空公司、班號、航線與時間，不放飛機照片。
- Day 1 去程與 Day 8 回程示意圖使用 Wikimedia Commons 寬幅航空代表照片；國泰使用 A350 寬圖，中國東方航空使用 787-9 16:9 寬圖，均不代表實際執飛機型。
- 航空示意圖優先讀取 Wikimedia Commons 寬幅圖；`images/airlines/` 只保留寬版本地 fallback，離線或遠端圖片載入失敗時才使用。

## 手機省流量與離線快取（2026-09-09）

本版新增根目錄 `sw.js`，並在 HTTPS／localhost 環境自動註冊 Service Worker：

- `yunnan-app-v1-20260909-offline-cache1`：HTML、CSS、JS、JSON 與執行時程式資源採 **stale-while-revalidate**。先顯示本機快取，再於背景更新。
- `yunnan-images-v1`：網站圖片採 **Cache First**。第一次看到圖片才下載，之後優先直接讀手機 Cache Storage。
- 圖片快取與程式快取分離；更新 HTML／JS／CSS 時只淘汰舊 `yunnan-app-*`，**不清除 `yunnan-images-v1`**。
- 不預先下載全部圖片；現有 `<img loading="lazy">` 繼續按需載入。Reader 圖片也只在開啟對應內容時建立與載入。
- OpenStreetMap 地圖瓦片特別排除在圖片長效快取之外，避免拖動地圖後累積大量 tile 佔用手機儲存空間。
- Service Worker 只在 HTTPS 或 localhost / 127.0.0.1 可使用；直接用 `file://` 開啟網站時不會啟用。

若未來只修改程式碼，更新 `APP_CACHE` 版本與 `index.html` 的 CSS/JS query version 即可；不要任意修改 `IMAGE_CACHE`。若同一路徑的圖片檔案內容被替換而必須強制所有裝置重新抓圖，應改圖片檔名／URL，或經明確決策後再升級 `IMAGE_CACHE`。
