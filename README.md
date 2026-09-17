# 雲南慢時光 · 8 日雲南旅程

這是一個為手機與電腦使用設計的 8 日雲南旅程網頁，包含每日行程、探索地圖、住宿附近夜遊、美食、購物、收藏、拍照／故事、天氣與出發提醒。

## 開啟網站

建議使用 HTTPS 網址。手機可加入主畫面；電腦本機版請解壓 ZIP 後執行 `START.bat`，不要直接雙擊 `index.html`，因為 `file://` 無法完整使用 PWA / Service Worker。

### 出國前先做一次離線準備

1. 在有網路時開啟網站。
2. 到 **設定 → 離線準備**，選擇要下載的內容後按 **「下載已選內容」**。網頁核心固定必選；旅行照片與天氣可取消。
3. 等畫面顯示 **「✓ 已選內容準備完成」**。
4. 建議切成飛航模式重新開啟一次，確認離線內容可用。

離線時，行程、飯店、景點、美食、故事、收藏、自定義地標與探索地圖的離線地標簡圖仍可使用；天氣顯示最後一次成功資料。道路底圖、即時天氣與真正導航仍需要網路或地圖 App。

## 主要分頁

- **旅程總覽**：首頁以動態雲霧橫幅呈現雲南路線，可點擊撥雲放晴、拖曳產生輕量視差；下方提供 Day 01–08 路線、住宿、行程與旅程日天氣。
- **探索地圖**：行程地點、附近提案與導航。
- **夜間逍遙**：依日期查看飯店附近晚間活動；綠色行動提示固定放在頁面標題下方，切換日期時只更新文字。
- **當地必吃**：雲南料理、小吃、典型口感與踩雷提醒；必吃排序／口感評鑑使用輕量文字說明。
- **雲南必買**：伴手禮、適合當地享用的品項與可食用品評鑑。
- **我的收藏**：集中查看已收藏內容。
- **旅拍指南**：依旅行日期查看當日拍照機位、Pose 與《去有風的地方》取景參考；日期與探索地圖、夜間逍遙同步。只有當天確實有相關取景內容時，才顯示《去有風的地方》篩選。頁首順序固定為：輕量灰色日期／Pose 說明 → 綠色來源／排序提示 → 日期切換。
- **風俗與故事**：文化背景、地方故事與鄉野奇談。
- **出發提醒**：航班、旅行提醒與內容來源查核。
- **設定**：依序提供連網模式、預設導航地圖、介面版面、顯示主題，後接天氣 API 與離線準備。

## 手機與電腦操作

一般頁面支援左右滑動切換主分頁。手機使用觸控；電腦可用滑鼠拖曳或 precision touchpad 水平手勢。地圖、真正可水平捲動的卡片列、表單、按鈕與連結保留自己的操作，不會被主分頁手勢搶走。

有可點擊圖卡的分頁會以小字顯示「點一下圖卡」提示；提示固定貼在它所描述的圖卡群組標題下方、第一張圖卡上方。一般內容圖卡點一下即可開啟完整內容。

「探索地圖 → 滑動探索地點」是例外：圖卡上方固定顯示「長壓一下圖卡，看更多內容」。短按地點卡只負責定位／查看附近內容；長按約半秒後放開才會開完整 Reader；左右滑動可自由瀏覽卡片。Reader 關閉後會回到原本閱讀位置。

## 介面版面

文件固定使用三個名稱：

| 名稱 | 定義 |
| --- | --- |
| **電腦版** | 桌機／筆電上的正常寬版。 |
| **手機版** | 手機一般 responsive 介面，也是預設。 |
| **手機電腦版** | 手機在「設定 → 介面版面」選電腦版後，以桌面畫布比例縮放到手機。 |

設定中只有 **手機版（預設） / 電腦版** 兩個選項；「手機電腦版」是手機選到電腦版後的實際狀態，不是第三個選項。

## 顯示主題

設定提供三種外觀：**系統預設 / 淺色主題 / 深色主題**。先把偏好解析成唯一的實際主題 `light` / `dark`，再由該實際主題統一控制頁面色票、原生表單 `color-scheme`、`meta[name="color-scheme"]`、瀏覽器 `theme-color` 與 iOS PWA status-bar style。固定「淺色主題」時，即使手機系統為深色，網站可控制的區域仍固定淺色；固定「深色主題」亦同理。Android / iOS 的系統導覽列、鍵盤、通知中心等真正的裝置 UI 仍由作業系統控制。主題偏好保存在此瀏覽器，並與離線／PWA 模式共用。

## 地圖與導航

網站提供 **大陸版（預設） / 國際版** 連網模式。大陸版使用高德底圖與 GCJ-02 顯示座標校正；國際版使用 OpenStreetMap。正式旅程座標仍維持 WGS84。

導航預設為高德地圖，也可切換 Google 地圖。中國大陸一般網路下建議使用高德。地點、營業資訊與路況仍以現場、官方公告及導航 App 即時資訊為準。

若瀏覽器無法直接寫入剪貼簿，「中文地址／搜尋文字」彈窗會保留可選取文字，並另外提供一鍵「複製」按鈕與「完成」關閉鍵。

## 天氣

天氣固定採 **高德 → QWeather Weather v1 → Open-Meteo** 的欄位優先順序。可用 provider 會並行取得資料；同一天、同一欄位若高順位已有值，就不會被低順位覆蓋，低順位只補空缺。若未設定高德／QWeather Key 或個別來源失敗，仍由其他可用來源補資料。

QWeather provider 使用 **Weather v1**：`/weather/v1/daily/{latitude}/{longitude}` 直接以 weather point 經緯度查詢。API Host 使用帳號專屬 `*.qweatherapi.com`，靜態前端以官方支援的 `key` query parameter 認證；API Key 只保存在使用者瀏覽器。主資料取每日預報欄位。

天氣自動更新間隔為 1 小時；按「↻ 更新」可隨時手動強制更新。離線時使用最後一次成功快取。 天氣卡 UV 指數前會依標準等級顯示膚色漸深的禿頭女性 emoji：0–2 👩🏻‍🦲、3–5 👩🏼‍🦲、6–7 👩🏽‍🦲、8–10 👩🏾‍🦲、11+ 👩🏿‍🦲。每個 weather point 另外保存 Open-Meteo / Copernicus DEM 90 m 的座標海拔，PUBLIC ONLY 顯示「海拔：約 N m」；這是查詢座標的地形高度，不代表整座城市或景區所有位置。玉龍雪山／雲杉坪、普達措等高海拔地點有獨立 weather point；跨城日也會保留出發地／沿途主要城市的 weather point：9/20「大理 → 沙溪 → 麗江」除麗江主天氣外另顯示大理，9/24「麗江 → 昆明」除昆明主天氣外另顯示麗江。出發當天仍應以最新氣象與現場公告為準。

旅程總覽簡易天氣會在最高／最低溫與天氣狀況下方同步顯示 **🏔 海拔約 N m · ☂ 降雨機率 · UV emoji + 指數**；缺少某欄資料時只省略該欄，不顯示假值。

PUBLIC ONLY 會直接顯示「本次資料來源」，並提供「查看完整天氣：高德天氣 / QWeather / Open-Meteo / Open-Meteo (CMA)」。高德與兩個 Open-Meteo 入口都使用站內完整天氣視窗：高德直接使用已設定的 Web Service Key 顯示實況與短期逐日預報；若尚未設定 Key，視窗會提示到天氣 API 設定完成設定。QWeather 仍連到可閱讀的城市天氣頁。一般 Open-Meteo 顯示目前狀況、未來 16 天逐日預報與接下來 24 小時逐時預報；Open-Meteo (CMA) 固定使用 CMA GRAPES GFS，顯示最長約 10 天與約 24 小時模型時次，僅供模型對照，不加入主資料合併。站內完整天氣視窗會顯示同一 weather point 的約略海拔；海拔固定由 Open-Meteo Elevation / Copernicus DEM 90 m 提供，不參與高德 → QWeather → Open-Meteo 的天氣欄位優先合併。DEV ONLY 額外顯示高德、QWeather、Open-Meteo、CMA 與 Elevation API 文件、provider 欄位優先順序、海拔原始值與查詢座標。

每個天氣定位點旁另提供 **小紅書近期實況**：搜尋日期永遠以目前雲南日期為準，不會因行程日是未來日期而搜尋未來內容。例如 9/15 查看 9/21 玉龍雪山，仍搜尋 `9.15 玉龙雪山 云杉坪 实况 穿搭 天气`。點「今日實況」或「資料少？看昨天」會先開啟站內確認彈窗，顯示實際搜尋詞與「需已安裝小紅書 App」提示；使用者再按「開啟小紅書」時，才以官方 `xhsdiscover://search/result` Deeplink 嘗試喚起 App。搜尋流程固定使用 App Deeplink，不使用 Web 搜尋網址。彈窗同時提供一鍵「複製搜尋詞」備援；日期跨日後會在前台自動更新，不需要重新發布網站。

所有可開啟 **更多內容 / Detail Reader** 的圖卡，在操作列加入 `📕 小紅書`。景點、飯店、美食、伴手禮、夜遊與旅拍會依類型產生不同搜尋詞；只有玉龍雪山、雲杉坪、藍月谷、甘海子、虎跳峽、松贊林寺、普達措等即時型景點會使用目前雲南日期，並在彈窗內提供「資料少？改搜昨天」。旅拍指南的小紅書搜尋固定使用「拍照／機位／構圖／姿勢」類關鍵字，不使用天氣實況模式。按鈕只開站內確認彈窗，不會在未確認前直接跳 App；`xhs_search_open` 會記錄圖卡 ID、類型與搜尋模式。


## 圖片與省流量

全站圖片只使用一套 **Image System**，景點、飯店、美食、伴手禮、文化與旅拍 Pose 都是同一條規則：

```text
imageId → local 本地 WebP → remote 同一張精確遠端圖 → 無此圖
```

正式資料只放在 `trip-data.json > images`。內容卡片、Day、旅拍 Pose 與 Hero 都只保存 `imageId`；圖片路徑、遠端 fallback、來源、作者、授權與轉檔紀錄不在內容 entity 重複保存。

每一筆 Image Registry 固定只有 11 個欄位：`local`、`remote`、`alt`、`caption`、`source`、`author`、`license`、`licenseUrl`、`width`、`height`、`changes`。**即使 local 已經本地化，remote 也必須永久保留。** `remote` 是同一張圖的 runtime fallback／同步目標；`source` 才是用來追溯來源頁與權利資訊的頁面。兩者不可混用。

本地圖片實體依用途分八類：

```text
images/
├─ food/
├─ shopping/
├─ hotels/
├─ places/
├─ culture/
├─ pose/
├─ airlines/
└─ handbook/
```

`images/culture/` 是「風俗與故事」圖片的 canonical asset；其他 Domain 若需要同一張圖，直接引用既有 `culture-*` imageId，不在 `images/places/` 再存一份。`images/airlines/` 保存航空公司／航班示意圖，`images/handbook/` 保存由旅遊手冊裁出的實景圖；手冊裁圖的頁碼與裁切證據記錄在 `docs/sources/HANDBOOK_IMAGE_CROPS.md`。

`SYNC_IMAGES.bat` 只會下載 registry 中指定的 exact `remote`，轉成 WebP 後寫入該筆 `local`；不搜尋、不換圖、不拿來源頁第一張圖，也不用未驗證快取圖冒充。同步後會回寫 local WebP 的實際 `width` / `height`。只要本輪真的新增／替換／移除 local 圖或更新 registry 尺寸，`SYNC_IMAGES.bat` 會自動產生新的 Build ID，再重建圖片來源文件、Pose 來源文件、離線 manifest 與 build manifest，最後執行 validator；若全部只是 VERIFIED、沒有網站內容變更，就不製造無意義的新 Build。同步結果可在 `docs/IMAGE_SYNC_REPORT.html` 逐張檢查；報告會依 `images/food/`、`shopping/`、`hotels/`、`places/`、`culture/`、`pose/`、`airlines/`、`handbook/` 分組，每區顯示筆數與 `SYNCED / VERIFIED / FAILED` 統計，頁首另提供資料夾快速跳轉與總統計。 執行結束時固定輸出英文統計：`Total / Success / Ignored / Failed / Errors`，並寫入 `sync_summary.txt`；其中 Success＝本次實際 SYNCED、Ignored＝已由 cache 驗證 local + exact remote + SHA-256 一致而不重抓、Failed＝單張圖片下載／解碼／轉檔失敗、Errors＝同步流程／衍生檔生成／validator／ZIP 等工具層級錯誤。

旅拍 Pose 目前保留 29 個可追溯的精確遠端圖片網址，仍與全站共用同一套 registry。若 `images/pose/*.webp` 尚未建立，前台直接讀該筆 `remote`；同步成功後優先讀 local，但 `remote` 不刪除。


## 自動更新與省流量

網站對外版本與內部 Build ID 分開。每次開啟網站、從背景回到前景或重新連上網路時，只先檢查很小的 `build.json`；手機／瀏覽器明確重新整理時，HTML navigation 採 **Network First**，有網路就先確認伺服器入口，離線才回到目前 App Cache。CSS / JS 使用 `?b=<Build ID>`，避免同一對外版本下連續部署時混用舊資源。

若偵測到新 build，Service Worker 才更新 App Shell；`asset-manifest.json` 以 SHA-256 比對核心檔，未變資源直接沿用上一個 App Cache，只有內容真的改變的檔案重新下載。前台會等待 active Worker 與 `build.json` 目標 Build 完全一致後才 reload；GitHub Pages 正在部署時則保留目前可用版本並稍後重試。

旅行圖片使用獨立的 `yunnan-images-v1` Cache。`offline-manifest.json` 為每張已打包 local WebP 保存 SHA-256；新 build 會只檢查已快取圖片，**沒變就保留、變更才重抓、已刪除才清除**，不會整批重新下載。「設定 → 版本」提供「檢查更新」與「強制重新載入」。**強制重新載入不能只看 Build ID**：即使遠端 `version + build` 與目前完全相同，也必須重新抓取 App Shell（HTML / CSS / JS / JSON / manifest），覆寫目前 App Cache，再用圖片 SHA-256 對 Image Cache 做一致性確認；圖片仍只刷新真正變更的檔案。收藏、偏好、API Key 與其他使用者資料不得清除。重新整理時會以 Toast 顯示「正在檢查更新／已是最新版／發現新版／目前離線」等狀態。

### 發布與快取更新硬性規則

1. 只要公開 ZIP／GitHub Pages 內容有任何可見或執行層變更（`index.html`、`css/`、`js/`、`data/*.json`、圖片、manifest、Service Worker 等），**必須產生新的 Build ID**；即使對外版本仍是同一個 `1.6.9` 也一樣。
2. 發布流程固定使用 `python tools/release.py --new-build --zip <輸出檔>`；`release.py --zip` 本身也會啟用 publish guard，自動產生新 Build，避免人工忘記。
3. 新 Build 後必須同步更新 HTML 的 `?b=<Build ID>`、`sw.js` 的 `BUILD_ID`、`build.json`、`offline-manifest.json`、`asset-manifest.json`，並執行 validator 後才可打 ZIP。
4. **禁止「檔案內容已變但 Build ID 沒變」的發布**。這會造成已安裝手機出現「新 HTML + 舊 CSS/JS」的半更新狀態；無痕模式正常而一般模式異常通常就是這類快取身分錯配。
5. 一般更新依 `build.json` 判斷新 Build；「強制重新載入」則是不信任目前 App Cache 的救援路徑，必須在同 Build 下也能重新抓取 App Shell。
6. 圖片仍與 App Shell 分流：App Shell 強制重抓時，Image Cache 不整批清空，仍由 `imageHashes` 只更新內容變更或已刪除的圖片。

## 離線 PWA

「設定 → 離線準備」可分別準備網頁核心、旅行照片與天氣資料，並可清除照片／天氣／全部離線下載。這些清除操作不會刪除收藏、自定義地標、連網模式、導航偏好與天氣 API Key。

Android Chrome 若支援會提供安裝到主畫面；iPhone / iPad 請使用 Safari「分享 → 加入主畫面」。瀏覽器仍可能因系統儲存空間管理清除網站資料，因此重要收藏可使用「備份我的收藏與自定義」匯出 JSON。

## 收藏與內容說明

收藏只保存在目前瀏覽器，不會自動同步到其他裝置。美食與購物會把「必吃／必買」優先項目排前；可食用品的風味評鑑是依典型做法、既有來源與公開旅客評價整理，不代表特定店家或品牌實測，也不代表保證可攜帶入境。

「鄉野奇談」屬地方傳說／民俗閱讀，會與史實或已證實資訊分開標示。

「旅拍指南」的 Pose 與機位會搜尋小紅書、抖音、大眾點評等公開內容做研究；PUBLIC ONLY 前台顯示可追溯的來源實拍與來源頁，再搭配人物姿勢、攝影位置與鏡頭倍率。Pose 圖片與全站其他圖片共用同一套 `imageId → local → remote → 無此圖` 流程。完整清單見 `docs/sources/POSE_SCREENSHOT_SOURCES.md`。工程細節只在 DEV ONLY 顯示；PUBLIC ONLY 為預設旅客介面。

## 出發提醒

頁首保留「準備好，慢慢玩。」並加入可點擊的晴天娃娃祈晴小彩蛋；太陽會由下方升起、逐步推散雲層並隨連點把天空照亮。彩蛋以永久累積祈晴總數每 7 次循環，序列為第 1／3／5／7、8／10／12／14、15／17／19／21…次；正式 UI 不再用文字解說彩蛋，改以太陽脈衝、彎眼笑臉、明顯放晴與散雲直接呈現，且笑臉會完整取代一般臉部線條，不再重疊。左下只保留 `🙏 N` 累積祈晴次數，純粹是好玩的紀錄，沒有完成度或實質意義；不再顯示完成輪數、本輪次數或下一個彩蛋提示。`🙏 N` 寫入瀏覽器 localStorage，重新整理、關閉後再開啟仍會保留；只有清除該網站的瀏覽器網站資料／儲存空間時才會歸零。正式卡片不提供重置按鈕或主題 toggle。晴天娃娃為自行繪製 SVG，造型參考來源會公開列在「內容來源與查核」。

「內容來源與查核」預設閉合，需要時可展開。航班、景區、交通、飯店與營業時間可能變動，出發前仍應再確認票券、官方公告與旅行社通知。

## 維護文件

一般使用只需閱讀本 README。開發架構、PUBLIC / DEV、圖片本地化、來源契約、版本、Cache 與驗證規則統一放在 `docs/PROJECT.md`。純開發規格、示範頁與參考素材集中放在 `dev/`：晴天娃娃為 `dev/sunwish/README.md`，動態雲霧橫幅為 `dev/yunnan-banner/`。正式網站不依賴 `dev/` 內容；圖片來源帳本與手冊裁圖證據仍保留在 `docs/sources/`。


### 探索地圖

探索地圖預設顯示「全部」，地圖上的地標與下方卡片清單會隨「全部／已安排／自定義」同步切換。自定義地標保存在瀏覽器 localStorage。


### 旅拍 Pose 圖片完整性

旅拍 Pose 與一般圖片完全共用 Image Registry。每個 Pose 只在 `poseTips` 保存 `imageId` 與姿勢／鏡頭／機位研究資料；圖片來源、作者、授權、local、remote 全部只存在 `images[imageId]`。`remote` 本地化後仍保留，validator 會檢查 Pose imageId、`images/pose/*.webp` 路徑與 exact remote 唯一性，確保本地與遠端圖片身分一致。


## 不負責任專區

主導覽固定順序：**旅程總覽 → 探索地圖 → 夜間逍遙 → 當地必吃 → 雲南必買 → 我的收藏 → 旅拍指南 → 風俗與故事 → 不負責任專區 → 出發提醒 → 設定**；主 Tab 左右滑動順序一致。

「💸 不負責任專區」以價格圖卡整理網友分享的氧氣瓶、松贊林寺票價與獨克宗古城紀念品行情。價格不是官方公告；每張卡固定標示更新月份與「價格僅供參考」，頁首提供原始小紅書貼文與來源截圖。

天氣排序規則：同一天有多個 weather point 時，依 itinerary 實際先後排序；只在住宿／抵達點出現的城市排後。旅程總覽簡易天氣、完整天氣卡與來源入口共用同一順序。
