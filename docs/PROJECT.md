# 雲南慢時光 · V1 專案說明

根目錄 `README.md` 只說明網站使用方式。本文件只描述 V1 的現行架構、資料契約、維護方式與已知難題。

`v1` 是本專案現行契約的固定識別，不是遞增發版編號；一般修正、內容更新與換圖仍維持 `v1`。

## 1. 專案結構

```text
/
├── index.html
├── README.md
├── START.bat
├── sw.js
├── css/style.css
├── js/
│   ├── network.js
│   ├── core.js
│   ├── weather.js
│   ├── reader.js
│   ├── journey.js
│   ├── map.js
│   ├── library.js
│   └── app.js
├── data/
│   ├── trip-data.json
│   ├── social-sources.json
│   └── source-index.json          # generated
├── images/
├── tools/
│   ├── release.json
│   ├── release.py
│   ├── generate_source_index.py
│   ├── generate_photo_sources.py
│   ├── validate_project.py
│   ├── media_audit.py
│   └── optimize_media.py
└── docs/
    ├── PROJECT.md
    └── sources/
        ├── PHOTO_SOURCES.md       # generated
        └── SOCIAL_DATA_RULES.md
```

網站是純靜態 HTML/CSS/JS/JSON，不需要 build tool。`data/trip-data.json` 是主要旅程資料唯一來源，維持單檔。

## 2. 資料契約

- `trip-data.json`：旅程、Day、地點、美食、購物、照片 metadata 等正式資料。
- `days[*]` 只引用 ID，不複製完整 entity。
- `pdfScheduled: true` 表示原始旅行手冊已安排的內容；Day itinerary 與住宿必須維持此契約。
- 地址或座標無法核實時保持不確定，不用城市中心或猜測座標補洞。
- 收藏、自定義地圖、導航偏好只存在瀏覽器，不寫回正式 JSON。
- `social-sources.json` 保存來源紀錄；正式 entity 以 `sourceRefs` / `fieldSources` 引用。
- `source-index.json` 是由正式資料與來源紀錄推導的索引，不可手改。
- `trip-data.json > photos` 是圖片 metadata 與授權資訊的唯一來源；`PHOTO_SOURCES.md` 由工具生成。
- `foods[*].priority` 只在需要優先排序時使用 `必吃`；`shopping[*].priority` 使用 `必買`，且必買商品的 `group` 也必須是 `必買`。Priority 是本次旅程的內容排序，不改寫 `pdfScheduled`。
- `culture[*].kind: "鄉野奇談"` 只收錄有可追溯地方傳說／民俗／信仰來源的故事；文字必須明確區分傳說與史實，不把靈異說法寫成已證實事件。

## 3. Module / State Ownership

| Module | Ownership |
| --- | --- |
| `network.js` | 國際版／大陸版 profile（預設國際版）、Leaflet runtime loader、OSM／高德底圖選擇、WGS84 ↔ GCJ-02 顯示座標轉換；同時提供 QWeather Grid 所需的 WGS84→GCJ-02 converter |
| `core.js` | Photo System、Travel Utils、Favorites Store、Navigation Service、Date Rail、Horizontal Scroller；Photo System 對兩種 network profile 使用同一張正確主體圖，負責本地／遠端圖、錯誤 placeholder 與示意／背景 badge，不做跨地點 fallback，不持有 Domain 畫面 state |
| `weather.js` | 高德天氣 → QWeather Grid → Open-Meteo provider chain、API credential local settings、欄位優先合併、旅程日 weather point、1 小時 cache、offline fallback、weather alert、Journey／Map weather slots |
| `reader.js` | Content Reader、stack、return state、Reader swipe |
| `journey.js` | Day 01–08、Day 展開、時刻表、PNG export、航班／住宿 Journey UI |
| `map.js` | Leaflet、Map filters、Map Rail、Map Detail、定位、自定義地點、長按 |
| `library.js` | Content/Story Card、Night/Food/Shopping/Favorites/Photo/Culture state/render |
| `app.js` | JSON bootstrap、`VIEW_REGISTRY`、App Shell、shared day coordinator、單一 action router |

主要 state 只由各自 Owner 寫入：

- App：`currentView`。
- Network：network profile。
- Core：Favorites IDs、navigation provider。
- Weather：provider credentials（localStorage）、forecast cache、refresh state。
- Journey：展開 Day、返回位置、Timetable preview。
- Map：map instance、markers、filters、selected place、custom map、geolocation。
- Library：night/food/culture/photo filters。
- Reader：entry、stack、return state。
- Map / Night 共用日期由 App 只做協調，不建立第三份 Domain state。

## 4. View Registry / Action Router

`app.js > VIEW_REGISTRY` 是主 View 的唯一登記處，合法 View、導覽順序與主頁 swipe 順序都由它推導。非地圖 View 在啟動時建立穩定 DOM；圖片仍由 Photo System 使用原生 lazy loading 控制下載。Map 是唯一延後初始化的 View，必須先切成可見狀態，再於下一個 layout frame 建立或更新 Leaflet。

中央 `document click` 只保留一個，順序為：Weather → Journey → Reader → Map → Library → App shared actions。局部 gesture controller 只處理自己的 boundary，不再建立第二套 document-level router。

## 5. Card / Rail / Reader

網站只維護四套 Card System：

| Card | Owner / 用途 |
| --- | --- |
| Content Card | Library；夜遊、必吃、必買、收藏、拍照、故事 |
| Journey Card | Journey；Day Carousel、完整 Day |
| Compact Card | Map / Story；地點 Rail、Day Story Rail |
| Utility Card | 對應 Domain；日期、時刻表、航班、設定、Tips |

Rail 規則：

- `.rail--snap`：需要卡片停靠。
- `.rail--free`：自由停留；Explore Map 使用。
- `.rail--mouse-drag`：桌面左鍵抓取。
- Touch / Pen 一律使用瀏覽器 Native Scroll。
- Main View swipe 只由 App pager 擁有；Rail、Card、Map、Timetable、Button/Form、Dialog 都是 blocked start。

Reader 關閉後要回原本 window scroll、橫向 Rail scroll 與 focus。Content Reader 使用內部 stack，不疊多層 modal。

## 6. Photo / Mobile Traffic

所有 managed `<img>` 由 `core.js > createPhotoSystem()` 產生，統一負責 lazy/eager、`fetchpriority`、width/height、error placeholder 與 Reader/card 圖片 contract。

- 本地正式圖片使用 WebP。
- 兩種連網模式都可使用外部精準實拍 URL；圖片元素由 `loading="lazy"`、低 fetch priority 與瀏覽器可見性判斷延後請求。
- 已本地化 WebP 優先；遠端精準圖在兩種模式都嘗試同一個來源，載入失敗時才顯示無圖。絕不使用同城市／附近景點／同類照片 fallback。
- 具名主體使用 `exact` / `verified`；交通／無固定場地活動可用 `illustrative`、料理可用 `representative`、文化故事可用 `context`，所有非主體實拍都必須在 UI 標示「示意圖」或「背景圖」。`reference_only` 不能作為 UI 主圖。
- 使用者提供的定案手冊若有明確對應景點照片，可裁切成本地 WebP；頁碼與對應記錄放在 `docs/sources/HANDBOOK_IMAGE_CROPS.md`。
- Service Worker 的 Image Cache 使用 Cache First，減少已看過圖片的重複流量。
- OpenStreetMap / 高德 tiles 都不進長效 Image Cache。
- 圖片內容真正換圖時，優先改檔名／URL，避免舊 cache 命中。

圖片授權與來源以 `trip-data.json > photos` 為準；`python tools/generate_photo_sources.py` 產生可讀的 attribution ledger。

## 7. CSS

`css/style.css` 維持單檔，以 Domain / Card / Rail Ownership 區塊維護。現有 cascade 與手機 gesture 關聯很深，不做無目的的大規模排序或拆檔。

修改 `touch-action`、`scroll-snap`、`overflow-x` 前先確認 Rail owner。新規則放回所屬區塊，不使用日期式 patch 區塊累積 override。

## 8. V1 Identification / Cache / Generated Data / Release

`tools/release.json` 只保存固定識別：

```json
{
  "version": "v1"
}
```

所有技術識別統一使用 `v1`：

- CSS / JS query：`?v=v1`
- App Cache：`yunnan-app-v1`
- Image Cache：`yunnan-images-v1`
- Favorites storage：`yunnan-2026-favorites-v1`
- Map provider storage：`yunnan-2026-map-provider-v1`
- Network profile storage：`yunnan-2026-network-profile-v1`
- Custom Map storage：`yunnan-2026-custom-map-v1`
- Source schema / parser identification：`v1`

Cache 契約：

- App Cache 保存 HTML / CSS / JS / JSON。新的 Service Worker install 會把現行 `APP_SHELL` 寫入同一個 `yunnan-app-v1`；不使用 revision cache name。
- Image Cache 固定使用 `yunnan-images-v1` 並採 Cache First。圖片內容真正更換時改檔名／URL，讓資源 identity 自然更新；不使用 image cache 版本升級。
- Weather cache 使用 `yunnan-weather-cache-v1`；provider 設定使用 `yunnan-weather-provider-config-v1`。同設定、同 weather point 1 小時內不重抓。Provider 欄位依固定優先序合併：高德既有欄位最高、QWeather Grid 補缺、Open-Meteo 再補缺。離線時保留最後一次成功資料，不寫回 `trip-data.json`。
- Network profile 切換後由 App reload 一次，讓 Photo System、Leaflet source 與底圖座標系在同一 bootstrap 契約下重建；Weather provider chain 不再依賴 profile，兩個模式都使用高德 → QWeather Grid → Open-Meteo。
- activate 只保留目前兩個 V1 cache；其他同專案 cache 直接清理，不搬移、不轉換資料。
- `v1` 只代表目前正式契約；release tool 不建立遞增版本鏈。

Generated files：

- `data/source-index.json` ← `trip-data.json + social-sources.json`
- `docs/sources/PHOTO_SOURCES.md` ← `trip-data.json > photos`

常用命令：

```bash
python tools/generate_source_index.py
python tools/generate_photo_sources.py
python tools/media_audit.py
python tools/optimize_media.py
python tools/validate_project.py
python tools/release.py
python tools/release.py --zip
```

`release.py` 只做四件事：套用固定 `v1` 識別、重建 generated files、執行 validator、依需要產 ZIP。它不接受版本號，也不維護版本演進。

## 9. 最低驗證

每次正式修改至少執行：

1. `python tools/validate_project.py`，必須 0 error。
2. Generated files 必須與正式資料一致。
3. `node --check` 必須通過全部 JS 與 `sw.js`。
4. ZIP 必須通過完整性測試。
5. Gesture 相關修改只有在真的拿實機測過時，才能宣稱已完成特定手機實測。

## 10. 已知難題與最佳處理方式

這一章保留的是 V1 的工程決策，不是修改歷史。遇到同類問題時，以「最佳處理」為預設方案。

| 問題 | 不採用的方式 | V1 最佳處理 |
| --- | --- | --- |
| 手機橫向卡片與主分頁 swipe 衝突 | JS Touch Drag、Pointer Capture、用 `preventDefault()` 接管一般滑動 | Touch/Pen 用 Native Scroll；主 swipe 只由 App pager 處理，Rail 起點直接 blocked |
| Map 卡片需要短按、長按又要能左右滑 | 用 `scrollLeft` 判定 swipe、放手強制 snap | Rail 自由滑動；長按只觀察時間與位移，超過位移門檻就取消 |
| CSS 手機修正容易互相破壞 | 日期式 patch、同 selector 在檔尾不斷 override、任意拆 CSS | 維持單一 CSS；按 Ownership 放規則，小範圍調整 cascade 並做 regression |
| 主 View 增加後出現多份清單 | whitelist、`VIEW_ORDER`、初始化 render 各自手寫 | 全部由 `VIEW_REGISTRY` 推導 |
| Leaflet 地圖首次開啟空白或尺寸錯誤 | 在 `display:none` / inactive View 內先建立地圖，或首次顯示時跳過 `invalidateSize()` | 先切換 Map View 為可見，再用 `requestAnimationFrame` 後建立 Leaflet；之後顯示時 `invalidateSize()` / render |
| 中國大陸無 VPN 時 OSM／Wikimedia／Google 失效 | 假設國際 CDN / OSM tile 一定可達、或把 WGS84 座標直接畫到高德底圖 | Network Profile：國際版 OSM；大陸版高德 + WGS84→GCJ-02；圖片兩種模式都只嘗試同一張精準來源，已本地化 WebP 優先、遠端失敗才無圖，不做錯圖 fallback；Google/Instagram/Wikimedia 查核連結仍可能受限 |
| 天氣單一來源失效或精度不足 | 只依賴單一 API、把行政區預報硬當高海拔格點、或低優先來源覆蓋高優先來源 | `weather.js` 固定高德 → QWeather Grid → Open-Meteo；以欄位補缺方式合併，單一 provider 失敗即降級，全部失敗才沿用最後成功 cache |
| Nearby 出現大量 `0.0 km` | 把共用古城／景區參考座標當成精確店址距離，或為了消除 0.0 硬補假座標 | 排除目前選取項目與同名同座標別名；共用原點座標顯示「同區域」，1 km 內以公尺顯示，其餘顯示直線公里；Nearby 只代表本站已收錄提案，不是即時商家搜尋 |
| 手機主分頁 swipe 掉幀 | 在 `touchmove` 中 render 目標 View、建立大量 DOM 或初始化 Leaflet | gesture 期間只做位移、clone 已存在 DOM 與 commit 判斷；完整 renderer 不進 `touchstart/touchmove/touchend` |
| 手機圖片流量過大 | 把完整 View renderer 塞進切頁／swipe lifecycle、重抓同圖、保留大型 JPEG/PNG | 穩定 View DOM + 圖片層級 lazy loading + Photo System + WebP + Image Cache First |
| V1 識別與 Cache 容易被各處手改成不同名稱 | 分別改 query、cache revision、image cache version 或建立升版流程 | 固定 `v1` 單一識別；`release.json` 只保存 `v1`，由 `release.py` 同步現行契約 |
| Source Index 與正式資料不同步 | 手改 `source-index.json` | 由正式資料自動生成並由 validator 驗證 |
| 圖片授權文件與 metadata 不同步 | 同時手改 JSON 與長篇 MD | `trip-data.json > photos` 為 source of truth，MD 自動生成 |
| 來源失效或被刪除 | 覆寫既有 `sourceId`、偷換 URL、直接刪除來源紀錄 | 保留原 Source Record 與狀態；新來源建立新 `sourceId`，正式資料維持可追溯 refs |
| 地址／座標查不到 | 用城市中心或猜測座標填滿欄位 | 保持待定位；只有核實後才寫正式座標 |
| 新功能不知道放哪 | 把 renderer/state 塞進 `app.js`、建立第二套全域 handler | 先決定 Domain Owner；App 只做 bootstrap、協調與 router |
| 天氣功能造成手機重複流量 | 每次切 Day／Map 都重新呼叫 API、把預報寫入正式旅程資料 | `weather.js` 單一 owner；固定旅程 weather point、每點 1 小時 cache、離線沿用最後成功資料；Journey／Map 只放 presentation slot |
| UI 看起來相似就全部共用 | 萬用 CardFactory 加大量 variant/options | 維持四套 Card；共用 service / 語意，不強迫共用所有 markup |
