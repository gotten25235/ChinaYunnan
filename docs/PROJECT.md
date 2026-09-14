# 雲南慢時光 · 專案維護手冊

根目錄 `README.md` 只說明網站使用方式。本文件是**唯一的人工作程規格主文件**，集中描述架構、資料契約、Public / Audit、來源追溯、圖片本地化、版本、Cache、驗證與已知工程決策。

文件維護原則：除 generated ledger、必要證據清單，以及使用者明確指定獨立維護的動態橫幅文件 `docs/YUNNAN_BANNER.md` 外，不再為單一主題新增 MD；新的工程規則優先合併進本文件，避免規格分散與互相矛盾。

動態橫幅的行為、動畫安全、暫停狀態與整合邊界以 `docs/YUNNAN_BANNER.md` 為專屬規格；若與本文件的一般規則衝突，仍以本文件的版本、Cache、Public / Audit 與資料契約為上位規則。

## 1. 專案結構

```text
/
├── index.html
├── README.md                       # 使用者說明
├── css/banner.css                  # 動態雲霧橫幅樣式（yn- 命名空間）
├── js/banner.js                    # 動態雲霧橫幅互動／WebGL
├── images/blue-moon-valley.webp    # 橫幅與既有藍月谷共用同一授權照片
├── START.bat
├── LOCALIZE_IMAGES_ANACONDA_SSL_FIX.bat
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
├── tools/
│   ├── release.json
│   ├── release.py
│   ├── localize_remote_images.py
│   ├── generate_source_index.py
│   ├── generate_photo_sources.py
│   ├── generate_offline_manifest.py
│   ├── validate_project.py
│   ├── media_audit.py
│   └── optimize_media.py
└── docs/
    ├── PROJECT.md                  # 人工維護的工程主文件
    ├── YUNNAN_BANNER.md            # 使用者指定獨立維護的動態橫幅規格
    └── sources/
        ├── PHOTO_SOURCES.md        # generated 圖片來源帳本
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
- `trip-data.json > photos` 是圖片 metadata 與授權資訊的唯一來源；`PHOTO_SOURCES.md` 由工具生成。
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

- **小紅書**：找近期打卡機位、人物 Pose、季節實拍與「同款」路線。若搜尋引擎只能取得二次索引、無法穩定核對原貼 URL，依來源契約只保存二次來源，不建立假的 `xiaohongshu` Source Record。
- **抖音**：找近期現場影片、走動 Pose、拍攝機位與人流／天候下的真實畫面；採用時保存可公開核對的原影片 URL。
- **大眾點評**：看一般遊客會員相冊與景點實拍，補足「不是專業旅拍也能拍到什麼」的視角；會員圖片只作研究，不視為可重用授權。
- **Threads**：可搜尋，但不是固定必須來源；若沒有足以改變建議的有效內容，不為湊平台而建立紀錄。

拍照資料可以把社群結論整理成 `poseTips`（Pose、攝影者位置、鏡頭／倍率、原參考 URL），並以 `sourceRefs` / `fieldSources` 追溯。**網站 Public 介面只顯示本站已有合法／可部署的景點圖與 Pose 文字整理；社群原圖／影片以外連方式查看，不下載進 ZIP、不截圖重包、不宣稱取得授權。**

### 圖片與媒體來源界線

社群貼文可作為「這個地方／內容存在」的資料來源，但不代表貼文圖片可直接部署。網頁截圖、訂房平台照片、社群照片都不等於取得可重用授權。網站真正使用的圖片授權與來源由 `trip-data.json > photos` 管理並生成 `PHOTO_SOURCES.md`；沒有可接受圖片時寧可無圖，不用錯誤地點或同城圖片填補。

`data/source-index.json` 由 `python tools/generate_source_index.py` 生成，不得手改。Validator 會檢查來源 ID、`fieldSources ⊆ sourceRefs`、Source Record key / `sourceId` 與 generated index 同步。

不可退化的來源規則：**來源可失效但追溯鏈不可消失；新來源不覆寫舊 `sourceId`；正式 entity 合併取來源聯集；官方事實與社群經驗分開；圖片來源證據不等於部署授權；generated index 不人工維護。**

## 4. Public / Audit 顯示模式

本專案只有兩個 metadata 顯示層級，**共用同一份資料、同一套網站與同一套圖片**；差別只在維護資訊是否可見。

### Public（預設）

- 正常網址就是 Public，不需要 query parameter。
- Settings 只顯示純版本號，例如 `版本 1.1.2`。
- **不顯示**「版本格式：驕傲．預設．羞恥。」這類維護規則。
- 圖片來源區只輸出整理過的旅客可讀 attribution：`publicCaption`、`publicAuthor`、`publicSource`、`publicLicense`、`publicLicenseUrl`；缺值時才按 Photo System 的公開欄位規則回退。
- Public 不應曝光 `changes`、內部修正紀錄、下載 cache/hash、source parser 等工程資訊。

### Audit

以網址 query `?photoMeta=audit` 啟用，例如：

```text
https://example.com/?photoMeta=audit
```

Audit 在不改變正式資料的前提下額外顯示：

- 圖片完整 `caption`、`author/source`、`license/licenseUrl`、`changes`。
- Settings 的「版本格式：驕傲．預設．羞恥。」說明。
- 其他明確設計為 audit-only 的查核資訊。

`photoMeta` 只接受 `public` / `audit` 語意；未知值不得創造第三種模式。**Public 是產品介面，Audit 是維護查核介面，不是兩套內容。**

## 5. Module / State Ownership

| Module | Ownership |
| --- | --- |
| `network.js` | 國際版／大陸版 profile（預設大陸版）、Leaflet runtime loader、OSM／高德底圖選擇、WGS84 ↔ GCJ-02 顯示座標轉換；同時提供 QWeather Grid 所需 converter |
| `core.js` | Photo System、Travel Utils、Favorites Store、Navigation Service、Date Rail、Horizontal Scroller；Photo System 固定執行 `src 本地 WebP → remoteSrc（同一張實物圖）→ 無此圖`，不做跨地點／同類商品／自製示意圖 fallback |
| `analytics.js` | 可選 Umami tracker loader、匿名事件 queue 與 persistent anonymous browser ID；不記姓名、表單內容／精確定位；未啟用或本機開發時不載入外部 tracker |
| `weather.js` | 高德 → QWeather Grid → Open-Meteo provider chain、API credential local settings、欄位補缺、1 小時 cache、offline fallback、weather alert、Journey／Map weather slots |
| `offline.js` | PWA 選擇式離線準備、Service Worker bridge、Cache 完整性檢查、缺失清單、只重試失敗照片、安裝提示、收藏／偏好匯出匯入；不保存天氣 API Key |
| `settings.js` | Settings View 的介面版面 preference owner；`mobile` 預設，`desktop` 在手機上固定桌面 viewport；使用 `yunnan-2026-ui-layout-v1` |
| `reader.js` | Content Reader、stack、return state、Reader swipe |
| `journey.js` | Day 01–08、Day 展開、時刻表、PNG export、航班／住宿 Journey UI |
| `map.js` | Leaflet、Map filters、Map Rail、Map Detail、定位、自定義地點、長按；無底圖時提供離線地標簡圖與純座標 Nearby |
| `library.js` | Content/Story Card、Night/Food/Shopping/Favorites/Photo/Culture state/render |
| `app.js` | JSON bootstrap、`VIEW_REGISTRY`、App Shell、shared day coordinator、單一 action router、全版面 Main Tab swipe |

主要 state 只由各自 Owner 寫入：App 擁有 `currentView`；Network 擁有 profile；Core 擁有 Favorites IDs 與 navigation provider；Analytics 擁有 tracker runtime 與匿名 V-ID；Weather 擁有 provider credentials/cache；Offline 擁有離線選取與準備狀態；Settings 擁有介面版面；Journey／Map／Library／Reader 各自持有 Domain state。Map / Night 共用日期由 App 只做協調，不建立第三份 Domain state。

## 6. View Registry / Action Router

`app.js > VIEW_REGISTRY` 是主 View 的唯一登記處，合法 View、導覽順序與主頁 swipe 順序都由它推導。非地圖 View 在啟動時建立穩定 DOM；圖片仍由 Photo System 使用原生 lazy loading 控制下載。Map 是唯一延後初始化的 View，必須先切成可見狀態，再於下一個 layout frame 建立或更新 Leaflet。

中央 `document click` 只保留一個，順序為：Offline → Weather → Journey → Reader → Map → Library → App shared actions。局部 gesture controller 只處理自己的 boundary，不再建立第二套 document-level router。

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

可點擊的 Content / Story / Map / Journey summary 圖卡區必須在區塊前提供一致的小字操作提示（例如「點一下圖卡，看更多內容」）；純展示卡不顯示，避免誤導。Journey Day Carousel 的整張摘要卡可點擊／鍵盤 Enter 或 Space 展開當天內容，卡片內既有按鈕仍可獨立操作。拍照頁只有目前日期（或全部八天）真的含 `drama:true` 卡片時才顯示《去有風的地方》篩選；不提供「必拍」篩選，優先機位以資料中的 `priority` 排序在前，但 Public 圖卡不另外顯示「必拍」標籤。

## 8. Photo / Mobile Traffic / 本地化

所有 managed `<img>` 由 `core.js > createPhotoSystem()` 產生，統一負責 lazy/eager、`fetchpriority`、width/height、錯誤降級、placeholder、Reader/card 圖片 contract 與 Public / Audit metadata。

### Photo metadata contract

每筆 `trip-data.json > photos` 的部署欄位固定為：

```json
{
  "src": "images/remote/example.webp",
  "remoteSrc": "https://example.com/the-exact-same-photo.jpg"
}
```

- `src` **永遠是本地 WebP 路徑**，正式資料不允許切成 `https://...`。
- `remoteSrc` 可選；存在時必須是同一主體、同一用途的網路實物圖。
- `source` / `licenseUrl` 是來源頁與授權查核用途，不等於圖片下載 URL。
- `fallbackSrc` 已淘汰，由 validator 禁止。
- 禁止拿附近景點、同城市、同品牌、同類商品或自製插畫當 runtime fallback。

### 瀏覽器讀圖流程

前台永遠只有一條流程：

```text
src 本地 WebP
  ↓ 載入失敗
remoteSrc（若有）
  ↓ 載入失敗／沒有 remoteSrc
無此圖
```

BAT 前後**不切換前台模式**。本地檔存在就直接使用；本地檔缺少才碰 `remoteSrc`。Network Profile 只影響地圖／相關網路服務，不改圖片主體。

### BAT 本地化流程

`LOCALIZE_IMAGES_ANACONDA_SSL_FIX.bat` 呼叫 `tools/localize_remote_images.py`：

```text
remoteSrc
  ↓
確認 src 是本地 .webp
  ↓
驗證 remote-image-cache 的 remoteSrc + localPath + SHA-256
  ├─ 全部吻合 → 重用本地檔
  └─ 不吻合／無紀錄 → 原始 URL 下載
                          ↓ 失敗
                        wsrv.nl 備援
                          ↓ 成功
                        .part 驗證 WebP
                          ↓
                        原子覆蓋 src
```

只因同名 WebP 存在**不能**判定下載完成。來源 URL 改變或 SHA-256 不符時重新抓取；新檔必須完整下載、成功解碼／轉碼並驗證後才覆蓋舊檔。下載失敗時不刪除原本有效本地圖，BAT 也不修改 `trip-data.json`。

若原本已有有效 WebP而更新失敗，保留原圖並記錄 warning；若本地原本就沒有且所有下載方式失敗，寫入 `localize_failures.txt`、保留其他已成功圖片，且**不建立 `*_all_local.zip`**。網站仍可在線嘗試 `remoteSrc`，兩邊都失敗才顯示「無此圖」。

### 離線 manifest 與 Cache

`generate_offline_manifest.py` 每張照片只選一個離線來源：本地 `src` 存在就放 `photoAssets`；本地不存在且有 `remoteSrc` 才放 `remotePhotos`；兩者都沒有由 validator 報錯。同一張照片不要求同時下載本地與遠端兩份。

Service Worker Image Cache 採 Cache First；OpenStreetMap / 高德 tiles 不進長效 Image Cache。圖片內容真正更換時應改檔名／URL，或加入 Service Worker invalidation 清單。

### 圖片語意與證據

具名主體使用 `exact` / `verified`；交通／無固定場地活動可用 `illustrative`，料理可用 `representative`，文化故事可用 `context`，所有非主體實拍都必須在 UI 標示「示意圖」或「背景圖」。`reference_only` 不作 UI 主圖。

使用者提供手冊中可明確對應景點的照片可裁切成本地 WebP；頁碼與裁切記錄在 `docs/sources/HANDBOOK_IMAGE_CROPS.md`。圖片授權與來源以 `trip-data.json > photos` 為準，`generate_photo_sources.py` 生成 `PHOTO_SOURCES.md`。

### 驗證規則

Validator 檢查：所有 `photo.src` 必須是本地 WebP；`remoteSrc` 若存在必須為 HTTP(S)；不允許 `fallbackSrc`；本地檔缺少時至少要有 `remoteSrc`；具名主體仍遵守 exact / verified 語意規則。

## 9. Anonymous Analytics / Owner Insights

`analytics.js` 只在 HTTPS 線上環境且 `analytics-config.json` 有合法 Umami Website ID、`enabled:true` 時載入 tracker。本機 `file://`、localhost / 127.0.0.1 不送統計。首次進站產生 80-bit 隨機 V-ID，優先存 localStorage，再呼叫 `umami.identify(V-ID)`；tracker 關閉 auto pageview，先 identify 再手動送首個 pageview。

主 App 只送低敏感度事件：`tab_view`、`item_open`、`story_open`、`navigation_open`、`favorite_click`、`map_geolocate`、`nearby_open`、`weather_refresh`、`offline_prepare`、`timetable_download`，以及新 V-ID 首次建立時一次 `anonymous_visitor_created`。不可加入姓名、電話、Email、備註內容、API Key、GPS 經緯度或其他個人資料。

`owner-insights.html` 不出現在主導覽／footer / README 快速入口，並使用 `noindex,nofollow`。Umami Share URL 不可明文寫進 repo；Owner setup 使用 PBKDF2-SHA256 + AES-GCM 加密後再產生 `analytics-config.json`。這是 unlisted secret-link gate，不取代 Umami 帳號權限。

`analytics-config.json` 不納入離線核心完整性判定；Service Worker 對它採 network-only，失敗等同 analytics disabled。V-ID 是「瀏覽器身分」而不是保證的一人一 ID。

## 10. CSS

`css/style.css` 維持單檔，以 Domain / Card / Rail Ownership 區塊維護。現有 cascade 與手機 gesture 關聯很深，不做無目的的大規模排序或拆檔。

修改 `touch-action`、`scroll-snap`、`overflow-x` 前先確認 Rail owner；新規則放回所屬區塊，不使用日期式 patch 區塊累積 override。

## 11. Release Version / Schema / Cache / Generated Data

`tools/release.json` 保存對外軟體版本，格式為三段十進位整數。三段依專案內部約定分別是 proud / default / shame，且**獨立累加、不做 SemVer 式歸零**。UI 顯示細節依本文件「Public / Audit 顯示模式」執行。

對外 Release Version 與內部 storage/schema 契約分離：HTML `data-app-version`、CSS / JS query、App Cache 使用目前 Release Version；Favorites / Map / Network / UI layout / Weather / Offline / Source parser 等 storage/schema key 維持 `v1`。只有真正做資料格式 migration 時才升 schema，不因一般軟體升版清除收藏、偏好或圖片快取。

Cache 契約：

- App Cache：`yunnan-app-<release version>`；新版 release 建立新 App Shell cache 並清理舊版。
- Image Cache：`yunnan-images-v1`，Cache First。
- Offline Meta Cache：`yunnan-offline-v1`；可見準備時間另存在 `yunnan-offline-prep-state-v1`。
- Weather cache：`yunnan-weather-cache-v1`；provider 設定：`yunnan-weather-provider-config-v1`。
- Network profile 切換後 App reload 一次，重建 Photo System、Leaflet source 與底圖座標系。
- 地圖 tiles 永不納入完整離線包；無網路時 `map.js` 依正式 WGS84 座標產生離線簡圖。

Generated files：

- `data/source-index.json` ← `trip-data.json + social-sources.json`
- `docs/sources/PHOTO_SOURCES.md` ← `trip-data.json > photos`
- `offline-manifest.json` ← core assets + 每張照片單一路徑清單；manifest schemaVersion 仍是 `v1`

常用命令：

```bash
python tools/generate_source_index.py
python tools/generate_photo_sources.py
python tools/generate_offline_manifest.py
python tools/media_audit.py
python tools/optimize_media.py
python tools/validate_project.py

# 不升版，只重建／驗證目前版本
python tools/release.py

# 三種升版
python tools/release.py --bump proud --zip
python tools/release.py --bump default --zip
python tools/release.py --bump shame --zip
```

`release.py` 依需要累加指定版本段，同步 HTML / Service Worker、重建 Source / Photo / Offline generated files、執行 validator，最後依需要產生 ZIP。

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
| 天氣單一來源失效／精度不足 | 只依賴單一 API 或低優先來源覆蓋高優先來源 | `weather.js` 固定高德 → QWeather Grid → Open-Meteo，以欄位補缺方式合併 |
| Nearby 大量 `0.0 km` | 共用參考座標當精確店址、或硬補假座標 | 排除同項／別名；共用原點顯示「同區域」，1 km 內用公尺，其餘用直線公里 |
| 手機主分頁 swipe 掉幀 | `touchmove` 中 render 目標 View 或初始化 Leaflet | gesture 期間只做位移、clone 既有 DOM 與 commit 判斷 |
| 手機圖片流量過大 | 重複 render／重抓同圖／保留大型 JPEG/PNG | 穩定 View DOM + lazy loading + Photo System + WebP + Image Cache First |
| Release Version 與 schema 混在一起 | 升版連 storage key / image cache / schema 一起改 | Release 由 `release.json` 管理；schema `v1` 只有 migration 才升 |
| Source Index 不同步 | 手改 `source-index.json` | 由正式資料自動生成並由 validator 驗證 |
| 圖片授權文件不同步 | 同時手改 JSON 與長篇 MD | `trip-data.json > photos` 為 source of truth，MD 自動生成 |
| 來源失效／被刪除 | 覆寫既有 `sourceId`、偷換 URL、直接刪紀錄 | 保留原 Source Record 與狀態；替代來源建立新 ID |
| 地址／座標查不到 | 用城市中心或猜測座標填洞 | 保持待定位，核實後才寫正式座標 |
| 新功能不知道放哪 | renderer/state 塞進 `app.js` 或建第二套全域 handler | 先決定 Domain Owner；App 只做 bootstrap、協調與 router |
| 天氣重複流量 | 每次切 Day／Map 都重新呼叫 API | `weather.js` 單一 owner；每點 1 小時 cache，離線沿用最後成功資料 |
| 以為「開過一次」就一定離線完整 | 只靠 lazy image / stale cache | `offline.js` 明確觸發 `PREPARE_OFFLINE`、檢查缺失並可只重試失敗照片 |
| UI 相似就全部共用 | 萬用 CardFactory + 大量 variant/options | 維持四套 Card；共用 service / 語意，不強迫共用所有 markup |
| 工程文件越拆越多 | 每個功能再新增一份 MD，規則交叉重複 | 人工規格只放 `PROJECT.md`；使用者說明放 README；sources 只保留 generated/evidence ledger |
