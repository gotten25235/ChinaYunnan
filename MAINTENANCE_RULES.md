
## 探索地點 Rail 正式架構（2026-09-09）

- 手機 `#map-list` 與「當地必吃／雲南必買」共用 CSS Grid 橫向 Rail：`grid-auto-flow:column`、`grid-auto-columns:clamp(258px,76vw,282px)`、Native horizontal scroll；探索地點專用 `scroll-snap-type:none`，滑到哪就停在哪，不吸附卡片。
- `.map-strip-card` 使用 `<article role="button" tabindex="0">`，不得恢復成整張大型 `<button>`。
- Touch / Pen 橫向滑動完全由瀏覽器原生 Scroll 負責，不加入 JS Touch Drag、Pointer Capture 或 `preventDefault()` 滑動接管。
- `bindMapCardInteractionController()` 同時負責短按、鍵盤與最小化長按；長按只看按住時間與指標移動距離，不取得 Gesture ownership。
- 長按流程：Touch / Pen / Mouse 左鍵 `pointerdown` 後直接開始約 520 ms 計時；Touch / Pen 任一方向移動超過約 12 px、Mouse 超過約 8 px，或收到 `pointercancel` 即取消。520 ms 成立後，放手才開啟 Map Detail Reader。
- 桌面 `#map-list` 使用 `bindHorizontalScroller(mapStrip,{mouseDrag:true,wheel:false})`，以左鍵抓取自由水平拖曳；放手後維持當前 scrollLeft，不做卡片吸附；不攔截垂直 Mouse Wheel。

## 1. 專案基本原則

- 網站是純靜態網站：`HTML + CSS + JavaScript + JSON`。
- 主要資料來源固定為：`data/trip-data.json`。
- 不恢復成 `js/data.js` 內嵌資料。
- `app.js` 使用 `fetch('data/trip-data.json')` 載入資料，因此本機測試必須透過 HTTP server；不要直接以 `file://` 雙擊 `index.html`。
- Windows 使用者可直接執行 `START.bat` 開啟本機網站。
- 使用者個人狀態（收藏、自定義地圖清單）只存在 `localStorage`，不可寫回 JSON。

目前重要檔案：

```text
html/
├── index.html
├── css/style.css
├── js/app.js
├── data/trip-data.json
├── images/
├── PHOTO_SOURCES.md
├── MAINTENANCE_RULES.md
└── START.bat
```

---

## 2. JSON 資料規則

### 2.1 ID 是資料關聯的主鍵

- `places`、`foods`、`shopping`、`photoSpots` 等項目都必須有唯一 `id`。
- `days[*].itinerary / foods / shopping / nightRecommendations / hotel` 只放 ID，不複製完整物件。
- 刪除或改 ID 前，必須先檢查所有 `days` 與 UI 關聯，避免斷鏈。

### 2.2 `pdfScheduled` 是唯一的 PDF 已安排判定欄位

每個可安排項目使用：

```json
"pdfScheduled": true
```

或：

```json
"pdfScheduled": false
```

規則：

- 《手冊定案版.pdf》正式行程／住宿中明確出現 → `true`。
- 額外推薦、延伸夜遊、額外美食、拍照提案、候選購物等 → `false`。
- **不可因為項目被 `days` 引用就自動視為已安排。**
- 同一地點的不同用途卡片要分開判斷。例如正式景點可為 `true`，額外拍照卡仍可為 `false`。
- 目前不使用 `specialNote`；除非之後明確需求，不要自行新增該欄位。

### 2.3 座標規則

- 座標格式：WGS84 十進位 `lat` / `lng`。
- 無法確認的座標使用 `null`，不要用城市中心假裝精確位置。
- `coordinateNote` 用來說明「入口／地區參考／待核實」等狀態。
- `addressVerified: false` 代表地址不是已核實入口，不可在 UI 文案中暗示為精確入口。

### 2.4 圖片規則

- 卡片以 `photoId` 關聯 `photos`。
- 只有能直接對應該景點／飯店／餐點／商品／故事主題的圖片，才可作為正式 `photoId` 顯示。
- 只有參考價值但不是該項目本身的圖片，保留在來源紀錄或 `photoReferenceId`，前端不當正式圖片顯示。
- 沒有可靠圖片，或遠端圖片載入失敗時，保留原圖片槽位尺寸並顯示 `無此圖`；不以其他地點圖片補位。
- 新增開放授權圖片時，要保留作者、來源、License，並同步維護 `PHOTO_SOURCES.md`。
- 圖片區應預留固定比例，避免載入造成 Layout Shift。

### 2.5 營業時間顯示規則

- 有明確時段才顯示，例如 `08:00~17:00`。
- `24hr / 24 小時 / 全天` 不在小卡右上重複顯示。
- 不知道營業時間時保持空白，不自行推測。

---

## 3. 主分頁（Tabs）規則

主分頁包括：旅程總覽、探索地圖、夜間逍遙、當地必吃、雲南必買、我的收藏、拍照／故事等。

### 3.1 主分頁捲動與切換

- 桌面使用固定 App Stage；各 Tab panel 保持掛載，切換時保留各 panel 內部狀態與 `scrollTop`。
- 手機 `<=600px` 使用單一 document 垂直捲動；切換主 Tab 一律回到該分頁內容最上方，並扣除 Sticky Tab 實際高度。
- 手機切換主 Tab 不恢復上次停留的垂直 Scroll 位置。
- Reader／故事／地圖完整內容彈窗關閉後，仍恢復開啟前的閱讀位置；此規則不經過主 Tab 回頂流程。
- 切回探索地圖要保留地圖中心、Zoom、選中 Marker 等狀態。
- 點擊主 Tab 不使用大幅飛入動畫；手機左右拖曳切換時例外使用跟手式 View Swipe，放手後只做短距離完成／回彈動畫。

### 3.2 主分頁只負責分類，不負責閱讀跳轉

原則：

> **主分頁負責「去哪一類內容」，彈窗負責「閱讀某一筆內容」。**

因此 Day 內的美食、故事、購物、景點詳情，不應為了閱讀而把使用者切去別的主 Tab。

---

## 4. 統一閱讀彈窗規則

除「地圖直接操作／導航」外，大部分完整閱讀內容應留在目前脈絡中，以彈窗閱讀。

### 4.1 哪些內容使用彈窗

- 行程內單一景點／飯店完整內容。
- 「這一站必吃」。
- 「這一天，也有故事」。
- 「順路選購」。
- 一般美食／購物／夜遊／故事卡的完整內容。
- 探索地圖下方卡片的長壓完整內容。

### 4.2 哪些操作不要改成閱讀彈窗

- 地圖 Marker 點選：直接選取地點／顯示左側地點卡。
- 地圖縮放、拖曳、日期與分類篩選。
- 「開啟導航」：直接開導航。
- 「地圖看位置」：切到／聚焦地圖。

### 4.3 不要疊多層 Modal

- 使用單一閱讀器維護內部 history stack。
- 例如：`Day 2 → 喜洲古鎮 → 喜洲必吃`。
- 「← 回上一層」回閱讀器內上一層。
- `×` 一次關閉整個閱讀器，回到原頁面。

### 4.4 關閉彈窗必須保持原位置

Reader 開啟前由共用 return-state 保存實際閱讀脈絡，關閉後由共用 restore 流程還原：

- 手機：`window.scrollY`。
- 桌面：目前 active Tab panel 的 `scrollTop`；必要時同時保存 `window.scrollY`。
- 行程橫向卡片、地圖下方卡片等必要的 `scrollLeft`。
- 原 opener focus，使用 `focus({preventScroll:true})` 還原。

按 `×`、Esc 或其他關閉方式都使用同一套 return-state；不得把 Reader 關閉誤當成主 Tab 切換。

## 5. 探索地圖下方卡片手勢

### 5.1 Rail 與短按

- `#map-list` 使用與 Content Rail 相同的手機原生橫向滑動骨架；不得另建 Map 專用 Touch Drag。
- 地點卡使用 `<article role="button" tabindex="0">`。
- 普通短按由 `bindMapCardInteractionController()` 呼叫 `activateMapStripCard()`，同步下方選中卡、Marker、地圖內地點卡與 Nearby；有座標時使用桌面約 Zoom 16、手機約 Zoom 15 聚焦。
- Enter / Space 使用同一個短按入口。
- 桌面左鍵抓取拖曳由 `bindHorizontalScroller(mapStrip,{mouseDrag:true,wheel:false})` 處理；Touch / Pen 完全不受此 Controller 影響。

### 5.2 被動式長按

- 長按是 Rail 上的**被動偵測器**，不是滑動 Controller。不得使用 Pointer Capture、`preventDefault()`、JS `scrollLeft` 拖曳、Rail `scroll` / `scrollLeft` 判定或 `contextmenu` fallback。
- Touch / Pen / Mouse 左鍵 `pointerdown` 後直接開始 **520 ms** 長按計時；不再有 110 ms 靜止觀察、Swipe-first 分段門檻或 Scroll 偵測。
- Touch / Pen 任一方向位移超過約 **12 px**、Mouse 超過約 **8 px**，或收到 `pointercancel`，即取消長按。約 **180 ms** 顯示「按住…」進度；520 ms 成立後顯示「放開查看完整」，放手才開 Reader。
- 總按住約 **520 ms** 後才視為成立；**放手**才呼叫 `openMapDetailDialog()`。
- 長按成立後只抑制該次瀏覽器合成 Click，避免 Reader 開啟後又觸發一次短按定位；下一次正常 Click 不受影響。
- 長按視覺恢復原本的「按住…」進度條與 `放開查看完整` 狀態；動畫只使用 transform / pseudo element，不改 layout，手機滑動手感仍必須與「當地必吃／雲南必買」一致。

## 6. 旅程總覽規則

### 6.1 兩種模式

旅程總覽保留：

1. **預設橫向滑動 Day 卡**。
2. **展開完整行程**。

「展開這一天」關閉後必須回到**使用者原本進入時的模式**：

- 從橫向卡進入 → 關閉回橫向卡。
- 從完整行程進入 → 關閉仍留在完整行程。
- 不可擅自切換另一模式。

### 6.2 Day 卡高度必須完全一致

所有 Day 卡使用固定槽位，不依內容多少改變底部位置：

- 圖片。
- 日期／城市。
- 標題。
- 路線。
- 最多 4 筆行程預覽。
- `＋N 個行程` 固定槽位。
- 住宿固定槽位。
- 「展開這一天」固定槽位。

即使沒有 `＋N 個行程` 或沒有飯店，也必須保留同等高度空白，確保：

- 住宿分隔線同高。
- 住宿文字同高。
- 最下方按鈕同高。
- 卡片底部同高。

### 6.3 行程時刻表

- 上方有 Day 1–8 橫向時刻表。
- 左側站序欄與右側 Day 區要分離，橫向捲到最左時 Day 1 必須完整可見。
- `檢視完整` 打開後，整張八天時刻表應先縮放到視窗可完整看見。
- `下載圖片` 必須下載完整原始尺寸 PNG，不是只截目前可見區域。
- PDF 未提供固定時間的活動，顯示「時間依領隊公告」，不要自行編時間。

### 6.4 行程項目縮圖

- 展開 Day 後的既定行程，每一站**右側**顯示縮圖。
- 左側仍保留名稱、說明、地圖、導航等操作。
- 縮圖只是視覺辨識，不取代既有操作。

---

## 7. 探索地圖規則

### 7.1 日期滑動列與日期／分類切換的自動 Fit

日期 UI 使用「全部 + Day 01–08」橫向滑動列，不再以可見下拉選單作為主要操作。

- 手機可左右滑；桌面可滑鼠滾輪橫向移動。
- 日期卡使用 scroll-snap。
- 使用者滑動時不要每經過一張就重算地圖；滑動停止、吸附到最近日期後才真正切換一次。
- 點日期卡或左右箭頭可直接切換。
- 目前選中的日期要有明確 active 樣式，並盡量自動置中。
- 「全部」代表完整八天。
- 行程當天可顯示「今天」提示，但不得強制自動切換。

切換日期或分類時：

- 取「目前實際顯示的 Marker」計算 `fitBounds()`。
- 讓當天所有可見地點盡量同時出現在地圖中。
- 不要縮得比必要更遠。
- 全部點很近時限制最大 Zoom（目前約 `14`），避免放到過細街巷級。
- 只有一個點時用合理固定 Zoom，不要放到最大級。

使用者自己拖曳／縮放或點 Marker 後，不要自動再拉回全部範圍；只有再次切日期／分類時才重新 Fit。

### 7.2 左側地點卡

- **沒有選中實際地點時，左側卡完全不顯示。**
- 不顯示「請點選 Marker」的大型空白綠卡。
- 點 Marker → 左卡出現。
- 按 `×` → 整張左卡完全隱藏。
- 關閉後，切日期、分類或操作其他非 Marker UI，不應自動強制重新顯示。
- 再次點地圖 Marker 才重新顯示。
- 左卡隱藏時，自動 Fit 使用完整地圖寬度；左卡顯示時，桌面版 Fit 要預留左側遮擋空間。

### 7.3 Marker 規則

- Marker 不只用顏色，必須有類別圖示：景點、飯店、晚上、美食、購物、拍照等。
- 同座標多筆資料可合併成一個 Marker，右上數字表示同座標項目數。
- 點 Marker 切換左側地點卡。

### 7.4 地圖下方滑動卡片

- 維持橫向滑動。
- 短按：只以該卡片的參考座標更新「這附近有什麼可玩？」清單。**不得**等同 Marker 單擊；不得因此移動地圖、切換／高亮 Marker、或重新顯示／更換左側地點卡。
- 長壓：開完整內容彈窗。
- 小卡上方：左上類別、右上明確營業時段。
- 卡片內容顯示 GROUP。
- 使用者已開定位時顯示距離；未開定位不顯示距離。

### 7.5 「全部／已安排／自定義」Tab

- **全部**：合併目前日期／分類下的正式地圖項目與自定義項目；先排除與「已安排」重複的自定義項目，再依 `id` 去重。
- **已安排**：只以 `pdfScheduled === true` 判斷。
- **自定義**：使用者自行加入、且沒有與「已安排」重複的地點。若同一地點已存在 `pdfScheduled === true` 的正式項目，自定義版本不得再次顯示。
- 「滑動探索地點」預設 Tab 必須維持 **已安排**，不得因新增「全部」而改成預設全部。
- 自定義儲存在：`yunnan-2026-custom-map-v1`。
- 自定義不可改寫 JSON。
- 自定義去重除了相同 `id`，還要比對同城市的地點名稱；夜遊／夜間／晚上／夜景／散步等顯示性尾綴可先正規化後比對。例如「大理古城夜遊」與 PDF 已安排「大理古城」視為同地點，自定義不顯示。
- 去重只影響 UI 顯示，不刪除 `localStorage` 內原始自定義紀錄，避免使用者資料被靜默移除。

### 7.6 附近清單縮圖

「這附近有什麼可玩？」：

- 可由「點地圖」或「短按地圖下方滑動卡片」更新；下方卡片短按只負責附近查詢，不代表 Marker 選取。
- 每列**左側**顯示縮圖。
- 中間顯示名稱／分類／簡介。
- 右側顯示距離。
- 點列可聚焦地圖。

---

## 8. 故事／美食／購物的閱讀規則

### 8.1 「這一天，也有故事」

- Day 內以橫向故事卡呈現。
- 點故事 → 彈窗閱讀，不切主分頁。
- 可上一則／下一則，手機可左右 Swipe。
- 關閉後精準回原 Day 閱讀位置。

### 8.2 「這一站必吃」

- 點擊直接開美食完整內容彈窗。
- 同一天多道美食可左右切換。
- 不跳到「當地必吃」主分頁。

### 8.3 「順路選購」

- 點擊直接開購物完整內容彈窗。
- 不跳到「雲南必買」主分頁。

主分頁「當地必吃／雲南必買／故事資料庫」仍保留，作為使用者主動瀏覽全部內容的入口。

---

## 9. 定位、距離與導航規則

- 定位只能由使用者主動按「我的位置」後啟用。
- 不保存 GPS 位置到 JSON 或 localStorage。
- 使用 HTTPS 部署，否則手機瀏覽器可能禁止定位。
- 顯示距離時是座標直線距離，不等於步行／開車路線。
- 中國境內 Google Maps 可能不可用；保留「複製中文地址／搜尋詞」供高德／百度使用。
- 導航屬直接操作，不應先套閱讀彈窗。

---

## 10. localStorage Key

目前固定使用：

```text
yunnan-2026-favorites-v1
```

收藏。

```text
yunnan-2026-custom-map-v1
```

地圖「自定義」清單。

日後若更換 key，必須考慮舊使用者資料遷移；不要無故改名。

---

## 11. 響應式規則

- 桌面：地圖左側卡可懸浮於地圖上。
- 手機：避免大卡遮住主要地圖；完整閱讀器可使用接近全螢幕模式。
- 使用 `100dvh` 而非只用 `100vh` 處理手機瀏覽器網址列伸縮。
- 橫向卡片列在手機以 Touch Swipe 為主，桌面支援滾輪轉橫向／左右箭頭。
- 不要因某個窄寬 media query 再度破壞 Day 卡等高規則。

---

## 12. 修改程式時的「不可退化」檢查

每次改版至少確認以下項目：

### 資料

- [ ] `trip-data.json` 可正常 parse。
- [ ] 所有 Day 引用 ID 都存在。
- [ ] PDF 正式安排只由 `pdfScheduled` 判斷。
- [ ] 新圖有 `photoId` 與授權／來源資訊。
- [ ] 不確定座標沒有被假裝成精確地址。

### 主分頁

- [ ] 在「行程／地圖／美食／購物」間快速切換，畫面不明顯上下跳。
- [ ] 桌面回原 Tab 保留 panel scroll；手機切主 Tab 回分頁頂部並扣 Sticky Tab 高度。
- [ ] 切回地圖保留 Zoom／中心／選取狀態。

### 旅程總覽

- [ ] Day 1–8 橫向卡全部等高。
- [ ] 無 `＋N` 的 Day 仍保留 `＋N` 槽位。
- [ ] 無飯店的 Day 仍保留住宿槽位。
- [ ] 「展開這一天」關閉後回原本模式。
- [ ] 展開 Day 採單一垂直閱讀流，不因縮圖拆成左右主欄。
- [ ] 每站右側縮圖不會把景點名稱擠成逐字換行。
- [ ] 完整時刻表一打開即可完整看見。
- [ ] 完整 PNG 下載內容包含 Day 1–8 全表。

### 地圖

- [ ] 切 Day／分類可 Fit 當前可見 Marker。
- [ ] 手動拖地圖後不會自己跳回。
- [ ] 沒選 Marker 時沒有空白左側卡。
- [ ] 關閉左卡後，只有點 Marker 才重開。
- [ ] 附近清單左側縮圖存在。
- [ ] 地圖下方小卡短按同步選中卡／Marker／地點卡／Nearby，並以桌面約 Zoom 16、手機約 Zoom 15 聚焦；不重新 fit 整天範圍。
- [ ] 已安排 Tab 只顯示 `pdfScheduled === true`。
- [ ] 滑動探索地點有「全部／已安排／自定義」三個 Tab，且預設仍為已安排。
- [ ] 自定義 Tab 不顯示任何已安排重複地點；「全部」也只保留正式已安排版本一份。

### 彈窗／長壓

- [ ] 探索地圖地點卡：短按定位、左右滑動、長按放手開 Map Detail Reader 三者互不誤觸。
- [ ] 左右滑卡片不容易誤觸長壓。
- [ ] 明確 CTA 使用短按直接開彈窗。
- [ ] 關閉彈窗不改變原本頁面垂直位置。
- [ ] 閱讀內容不會無故切到另一主分頁。
- [ ] 內層閱讀使用單一 Reader + Back stack，不疊多層 Modal。

### 手機

- [ ] Sticky Tab 可橫向滑。
- [ ] `100dvh` 高度正常。
- [ ] Dialog 可上下讀、左右切，但不互相衝突。
- [ ] 長壓後下一次點擊仍正常。

---

## 13. 建議的維護流程

1. 先修改 `trip-data.json` 資料，不要把內容硬寫進 `app.js`。
2. 若改互動，先確認本文件對應規則是否要更新。
3. 修改 `app.js / style.css` 後，至少做一次桌面與手機寬度測試。
4. 檢查 Tab 切換、長壓、Modal 關閉、地圖 Fit、Day 卡等高。
5. 再重新打包 ZIP。
6. 若某次需求明確推翻既有規則，**先更新本文件，再更新程式**，避免日後維護者把新行為誤判成 bug。

---

## 14. 規則優先順序

發生衝突時，以以下順序判斷：

1. 使用者最新明確需求。
2. 《手冊定案版.pdf》對正式行程的內容。
3. 本 `MAINTENANCE_RULES.md`。
4. 目前 `trip-data.json`。
5. 舊 `README.md`／舊 ZIP／歷史版程式。


---

## 15. Detail Reader 首屏版型

旅程總覽、故事、美食、購物、景點等統一 Detail Reader 應遵守：

- 桌面／平板彈窗 Header 的標題必須以「整個彈窗」幾何中心對齊，不可因左側返回按鈕較寬而偏右或偏左。
- Header 左、右操作區使用等寬 Grid 欄；返回／關閉按鈕各自在左右欄對齊。
- Reader 首圖使用固定 **16:10 橫向 Media Frame**；這是顯示框比例，不修改原始圖片檔。
- Reader 圖片一律使用 `object-fit: contain`，完整保留原圖，不裁切人物、建築或文字。
- Media Frame 背景固定為黑色；直式／正方形照片不足的左右空間以黑邊補齊，橫式照片若比例不同也以黑邊完整容納。
- Content Reader 與 Map Detail Reader 套用同一條 Reader Media 規則；卡片仍使用固定橫向 Slot + `cover`，Reader 則使用固定橫框 + `contain`。
- 圖片載入失敗時仍在同尺寸 Frame 置中顯示「無此圖」，不得改用不相符的替代圖片。

### 縮圖尺寸不可由原圖撐開

- 「探索地圖 → 這附近有什麼可玩？」的左側縮圖，以及「旅程總覽 → 展開這一天 → 既定行程」的右側縮圖，都必須使用 `item-thumbnail` 基礎 class。
- 尺寸由 `.nearby-thumb` / `.timeline-thumb` 控制；容器必須 `display:block`、`overflow:hidden`，內部圖片必須 `width:100%`、`height:100%`、`object-fit:cover`。
- 產生縮圖 HTML 時，自訂尺寸 class **不能取代** `item-thumbnail`；兩者必須同時存在，例如 `class="item-thumbnail timeline-thumb"`。
- 不可讓圖片檔本身的 `width` / `height` intrinsic size 參與版面尺寸，否則可能把文字擠窄並產生巨大圖片。
- 修改縮圖或圖片 helper 後，至少檢查一次「附近清單」和「既定行程」兩處。


### 旅程總覽展開區：單一垂直閱讀流 + 每站右側縮圖
- 「展開這一天」採**單一垂直閱讀流**：既定行程 → 今晚住宿 → 三餐 → 當日備註 → 飯店步行散步 → 必吃／購物／故事／航班等內容依序往下閱讀。
- **不得**為了縮圖把整個 `.day-detail` 拆成左右兩個主欄；這會造成某天只有一兩站時左欄大量留白，也會迫使視線在行程與住宿之間左右跳。
- 「既定行程」每一站本身可以使用兩欄：`minmax(0,1fr) + 固定縮圖欄`，縮圖固定在該站右側，只影響該站，不影響飯店、餐食、故事等其他區塊。
- 桌面行程縮圖目前約 `92×70px`；手機約 `76×58px`。縮圖不可參與 intrinsic sizing，也不可把文字欄擠到逐字換行。
- 今晚住宿維持獨立橫向卡片；桌面可用「左側住宿縮圖 + 右側文字／操作」，窄螢幕再自動改為較緊湊或上下排列。
- Day 首圖若保留，必須是緊湊輔助圖，不可在單欄版型中放大成佔據整個內容寬度的大圖；目前限制約 `160–220px` 高。
- 修改行程展開版型時，至少檢查 Day 1（站點少）與 Day 2/3（站點多）兩種情況，確認內容自然往下接續且沒有大面積無意義空白。

### 旅程總覽 Day 卡開關

- DAY 01～08（包含橫向滑動 Day 卡與完整行程 Day 標題列）維持原本行程樣式，**不得因長壓或點擊卡片本體跳出 Detail Reader**。
- 橫向 Day 卡只透過「展開這一天」進入該日行程；完整行程 Day 標題列只負責單擊展開／收合。
- 「展開這一天」與「展開完整行程」只走 `bindItineraryExpansionController()` 的單一 `click` 控制路徑；不建立第二套 Tap／Swipe 判定。
- 手機 Day 卡滑動完全交給瀏覽器原生橫向 scrolling / scroll-snap；CTA 是普通 button click，滑動容器不得攔截它。
- Day 內部的景點、美食、故事、購物等內容仍可依既定規則使用統一 Content Reader。
- 完整行程模式的 Day 標題列直接使用原生 `<summary>` / `<details>` 開啟與收合，不以 JavaScript 人工翻轉 `details.open`。
- DAY 01～08 標題列**不使用長壓彈窗**；Day 本身維持行程內展開／收合。正常短按不得被要求雙擊。
- 右側 `＋ / ×` 屬於同一個 summary 點擊區域，操作規則相同。



### 旅程總覽「既定行程」右側縮圖尺寸
- 展開 Day 01–08 後，每一站的縮圖固定在該站內容右側，不得改成整頁雙欄。
- 桌面／平板標準尺寸：約 **96 × 72 px（4:3）**。
- `<=700px`：約 **80 × 60 px**。
- `<=430px`：約 **72 × 54 px**。
- 必須使用固定裁切容器與 `object-fit: cover`，不得讓原圖 intrinsic size 撐開版面。
- 此規則只影響旅程總覽站點縮圖；探索地圖 nearby 縮圖尺寸不得連帶修改。


### 探索地圖：上下同步選取規則（2026-09-07 更新）

- 「滑動探索地點」下方小卡的**單擊**與上方地圖必須維持同步狀態。
- 單擊下方小卡後，必須同時：
  1. 將該小卡設為目前聚焦／選中卡片。
  2. 高亮對應 Marker；有座標時以桌面約 Zoom 16、手機約 Zoom 15 聚焦，並用 `panInside` 避免桌面左側地點卡遮住 Marker。
  3. 顯示或更新地圖左側地點小卡；若先前按 `×` 收起，單擊下方小卡可重新顯示。
  4. 以同一座標更新「這附近有什麼可玩？」3 公里提案。
- 上方 Marker 單擊後也必須同步更新下方卡片選中狀態與附近提案。
- Map Detail Reader 由 `bindMapCardInteractionController()` 的被動式長按入口開啟；普通短按仍同步地圖。
- 若某卡片沒有可用座標，仍可聚焦下方卡片並顯示左側內容，但不得虛構 Marker 或座標；附近提案需明確顯示無法計算。


## 手機探索地圖與 Reader 版型

- `<=600px` 使用單一 document 垂直捲動；`.workspace` 為自然高度，只有 active `.view` 參與文件流。
- 主 Tab 可 Sticky；日期 Rail 不另做垂直 Sticky。
- 探索地圖標題、日期、分類、定位、地圖、Featured Locations、Nearby 使用同一內容邊界。
- 地圖容器目前寬度約 **88%**；`<=430px` 高度約 **335–375px**，431–600px 約 **345–390px**，保留左右頁面空間供垂直手勢。
- 地圖內已選地點面板保留桌面相同資訊結構，固定靠左下，寬約地圖 **40%**、`height:auto`、`max-height:70%`；內容超過上限時只讓面板內容區垂直捲動。
- 面板圖片、字體、Padding、按鈕使用真正響應式尺寸，不以整卡 `transform:scale()` 模擬桌面。
- Featured Locations 與其他橫向卡列使用原生 Touch momentum / scroll-snap；Android 保留 `-webkit-text-size-adjust:100%` 與 `text-size-adjust:100%`。
- 一般 Content Reader / Map Detail Reader 固定於 viewport 幾何中心，手機高度約 `80dvh` 並保留四周留白；完整八天時刻表預覽可全螢幕。
- 手機 Reader 不顯示左右視覺箭頭時，左右 Swipe 導航仍保留；上下閱讀仍是原生捲動。
- 底部手機導覽可 fixed；active view / footer 必須預留 safe-area 與 bottom-nav 空間。

## 旅程總覽：橫向滑動與深色時刻表（2026-09-08）

- 「行程時刻表」Day 欄位與「旅程總覽」橫向 Day 卡都必須能左右移動。
- 手機／Touch／Pen **完全使用瀏覽器原生 `overflow-x` + momentum + `scroll-snap`**，JavaScript 不接管 Touch 的 `scrollLeft`。
- 桌面滑鼠由唯一的 `bindHorizontalScroller()` 提供拖曳；垂直滑鼠滾輪可在可橫移區域轉換成水平移動。
- 桌面滑鼠真正完成拖曳後才抑制該次 click，避免拖卡誤開內容；一般短按不得被攔截。
- 深色模式下「行程時刻表」使用專屬深色配色，不可依賴瀏覽器自動反色；活動、交通、住宿仍要保有不同色系與足夠文字對比。
- 這些規則只影響旅程總覽/時刻表，不應改動探索地圖或其他既有互動。

## 完整行程時刻表：預覽與下載必須一致

- 「檢視完整」與「下載完整 PNG」必須共用同一個時刻表影像產生流程，不可一個顯示 SVG、另一個另行產生 PNG。
- 完整預覽必須先產生與下載相同的 PNG Blob，再把該 PNG 顯示在預覽視窗中；預覽視窗內按「下載完整 PNG」時，優先下載同一個 Blob，確保像素與配色一致。
- 配色依目前 `prefers-color-scheme` 決定：淺色模式輸出淺色版，深色模式輸出深色版。預覽與下載必須使用同一個 theme 值。
- 預覽 `<img>` 不可再套額外 `filter`、透明度、混合模式或 forced-color 調色；否則會再次造成「預覽顏色與下載不同」。

### 15.4 手機 Reader 左右滑動可靠性

- 行程、夜遊、美食、購物、收藏、拍照與故事都使用同一個 `Content Reader`；探索地圖完整內容使用 `Map Detail Reader`，兩者共同綁定唯一的 `bindPopupReaderNavigation()` Swipe 引擎。
- 手機版左右視覺箭頭可隱藏，但**不能因此失去 Swipe 導航**。
- Reader 內容區統一使用 `touch-action: pan-y pinch-zoom`：上下手勢保留原生閱讀捲動，明確水平手勢交由同一個 Popup Swipe 引擎切換內容。
- `bindPopupReaderNavigation()` 同時監聽 Pointer 與 Touch；Pointer 是主路徑，若瀏覽器取消 Pointer，Touch end 可完成同一手勢。此 Touch completion path 只存在共用引擎一次。
- 同一個實體手勢不得因 Pointer + Touch 重複事件而一次跳兩篇；共用引擎必須以短時間 duplicate guard 保證最多導航一次。
- 從按鈕、連結、輸入控制項開始的手勢不應觸發 Reader 左右切換。

## 卡片架構：手機主分頁瀏覽規則（2026-09-08）

全站卡片正式收斂為四套 Card System；不得再為單一 Tab 新增第五套獨立卡片骨架。

1. **Content Card**：夜間逍遙、當地必吃、雲南必買、我的收藏、拍照・有風、風俗與故事。
2. **Journey Card**：旅程總覽 Day 01–08 滑動卡、展開完整行程的 Day 卡。
3. **Compact Card**：探索地圖下方地點 Rail、每日行程裡的故事 Rail。
4. **Utility Card**：日期 Rail、行程時刻表事件、地圖浮動資訊、導航設定、航班。

### Content Card 手機規則

- 六個內容型主分頁全部使用同一 HTML Slot 結構與同一 `.content-card` CSS。差異只能透過 `content-card--night / --food / --shopping / --photo / --story` Variant 表達。
- 手機使用 `overflow-x:auto` + `scroll-snap`，卡寬固定為約 `clamp(258px,76vw,282px)`，讓 360px 寬螢幕可看到約 1.2 張。
- 同一滑動列的卡片使用同一高度與固定 Slot；內容少時以留白補足，不能讓短卡自行縮短。
- 所有 Content Card 使用固定 **16:10 橫向 Media Slot**；原圖以 `object-fit: cover` 裁切，缺圖保留相同比例並置中顯示「無此圖」。
- 標題最多 2 行、摘要固定 2 行、資訊區固定四格、強調列固定一列、Footer 固定高度。完整長文交給 Detail Reader。
- 手機只縮小真實 Padding／字級／Gap；禁止用 `transform:scale()`。
- `出發提醒` 不屬 Content Card Carousel，維持直向資訊清單。

### Content Card Renderer

- 一般內容只由 `contentCard()` 產生。
- 風俗與故事只由 `contentStoryCard()` 產生，但 HTML Slot 必須與 Content Card 相同。
- Variant 專屬資訊只能放在 `contentCardDetails()` 的四格資訊與強調列，不得插入任意長段落撐高卡片。
- 卡片用途是快速掃描；圖片來源、授權、完整交通、地址、拍攝長文與故事全文全部放 Reader。

## 自定義研究候選與來源追溯

- `trip-data.json.customMapDefault` 只作「第一次開啟且 localStorage 尚無自定義資料」的預設候選。不得覆蓋使用者既有 `yunnan-2026-custom-map-v1`。
- 研究候選必須 `pdfScheduled: false`，不得因加入自定義而變成 PDF 已安排。
- 研究候選可使用 `days: [N]` 指定與哪一天相鄰；自定義 Tab 在選定 Day 時應只顯示該日候選，選「全部」顯示全批。
- 「打車 20 分鐘」只能當研究篩選條件，不是交通保證。正式資料要保留 `taxiAnchorId`、`taxiEstimate`、`taxiEstimateBasis`、`straightLineKm`，並提示以當日即時導航為準。
- 每筆外部研究資料必須保留 `sourceRefs`；地址、營業時間、交通估算等易變欄位優先保留 `fieldSources`。
- 社群來源與失效來源的保存方式遵循 `SOCIAL_DATA_RULES.md`。



## 導航地圖規則（2026-09-08）

- 所有「導航」按鈕共用同一個導航服務偏好。
- 預設導航服務固定為 **高德地圖（Amap）**。
- 使用者可切換為 **Google 地圖**；偏好儲存在 `localStorage`：`yunnan-2026-map-provider-v1`。
- 切換導航服務後，頁面上已經渲染的導航連結也必須同步更新，不得只影響新渲染卡片。
- 高德導航入口優先使用官方 `https://uri.amap.com/search`，以中文地名／地址搜尋，並設定 `callnative=1` 嘗試在手機喚起高德 App。
- 不直接把現有 `lat/lng` 當作 GCJ-02 傳給高德；若未來要用高德座標導航，必須先在資料中明確保存 `coordinateSystem` 並正確轉換。
- Google 地圖維持官方 Maps Search URL。
- UI 顯示名稱應隨偏好變成「高德地圖導航」或「Google 地圖導航」。
- `trip-data.json.navigation.defaultProvider` 是網站預設值；使用者本機偏好優先於預設值。

## 22. 地圖右下控制列

- Leaflet 的 `+ / −` Zoom 控制固定放在地圖 **右下角**，不得恢復左上角。
- 「定位到我的位置」使用同一個右下控制區，位置在 Zoom 控制上方。
- 地圖上方不再重複顯示「我的位置」主按鈕；只保留定位狀態／HTTPS 提示及定位中可用的「停止定位」。
- 已在定位時再次按右下定位圖示，只重新置中到目前裝置位置，不重複建立 geolocation watch。
- 此規則桌面與手機共用。

## 住宿附近／夜間活動研究規則

- `今晚去哪` 應以 **當晚住宿地點** 為中心，而不是只依城市名稱推薦。
- 優先順序：住宿步行可達 > 短程打車 > 同城其他熱門夜生活。
- 短程打車的研究上限為 **20 分鐘**；JSON 內的 `taxiEstimate` 只屬研究估計，出發前一定以高德即時導航為準。
- 住宿附近活動優先尋找：古城夜遊、夜市／小吃、廣場鍋莊／打跳、Live／民謠、夜景散步、文化演藝、可晚間參與的在地體驗。
- Day 1 若深夜抵達、Day 8 若返程，禁止為了湊數硬塞夜遊。
- 每個研究型夜間項目應保存 `hotelRef` / `hotelRefs`、`sourceRefs`、`fieldSources`、`taxiEstimate`、`taxiEstimateBasis`、`researchCheckedAt`。
- 住宿附近研究批次目前記錄於 `customResearch.hotelNightBatch`；研究摘要見 `HOTEL_NIGHT_RESEARCH_20260908.md`。
- 此批住宿附近夜間項目屬 `pdfScheduled:false`、`customResearch:true`，應出現在「自定義」而不是「已安排」。
- 更新版本若新增住宿附近推薦，可用一次性 localStorage migration 合併到既有自定義清單；不得清空或覆蓋使用者原有自定義資料。


## 2026-09-08：航班航空公司標籤與共用日期列

- `flights[*].outbound/inbound[*]` 必須保存 `airline`、`airlineCode`、`flightNo`；UI 不可只顯示班號。
- 國泰航空 `CX` 在窄版 UI 可顯示「國泰航空」；中國東方航空 `MU` 的短標籤可顯示「東方航空」，JSON 正式名稱仍保存「中國東方航空」。
- 航空公司標籤需同步出現在航班清單、行程時刻表摘要、Detail Reader 航班資訊與完整 PNG 時刻表相關文字。
- 「探索地圖」與「今晚去哪」共用同一個旅程日期狀態；任一分頁切換 Day，另一分頁再次開啟時必須是同一天。
- 「今晚去哪」日期 UI 必須與探索地圖使用同款三行 Date Rail：`日期 / DAY / 城市`，支援全部、點擊、左右滑動、Snap、鍵盤與左右箭頭。
- Date Rail 滑動中不得逐卡重算內容；停下吸附或明確點擊後才更新。

### 探索地圖：桌面左側地點卡內容對齊
- 桌面版浮動地點卡外框維持固定高度時，內部不得再完全依內容自然流動。
- `標題 / 描述 / 推薦資訊 / 座標備註 / 同座標提案` 應使用固定或最小內容槽位，避免切換 Marker 時按鈕整段上下跳動。
- 最下方 `導航 / 下方卡片 / 自定義` 操作列應固定貼近卡片底部。
- 手機版仍採自然高度 + max-height 規則，不套用桌面固定槽位。

### 探索地圖：下方小卡聚焦與近距離 Marker（2026-09-08 最新）

- 「滑動探索地點」下方小卡單擊後仍維持上下同步：選中卡、Marker、左側地點卡與 Nearby 必須指向同一地點。
- 小卡單擊屬於「聚焦地點」操作，不再只 `panTo`：桌面以約 Zoom 16、手機以約 Zoom 15 將該地點帶到合適閱讀尺度；不得重新 `fitBounds()` 整天範圍。
- 桌面左側地點卡可見時，聚焦後需使用 padding / `panInside`，避免 Marker 被左側面板遮住。
- 不同實際地點不得只因畫面縮得太遠而互相蓋住。Marker 在目前 Zoom 下若中心距離小於約 46px，可做純顯示用途的小幅放射錯位；放大後要回到各自真實座標附近。
- 「同一實際座標的多張卡」仍可合併為單一 Marker + 數字，不需要拆成假座標。
- 座標缺失的正式地點若要顯示獨立 Marker，必須先查證座標並保存來源；不得使用城市中心假裝位置。
- 大理洋人街目前使用高德「洋人街中心廣場」GCJ-02 座標作來源，轉為 WGS84 近似值後供 OpenStreetMap 顯示；來源紀錄不得刪除。


## 探索地圖：分類篩選可多選（2026-09-08）

- 分類 `景點 / 飯店 / 晚上 / 美食 / 購物 / 拍照・有風` 放在「滑動探索地點」區塊內，位置固定在 `全部 / 已安排 / 自定義` 三個 Tab **上方**，不得再放回地圖上方；並且必須支援**多選**。
- 多選採 **OR** 邏輯：例如同時選「飯店＋晚上」，只顯示飯店或晚上類型的項目。
- `全部` 為獨立狀態：點「全部」會清除其他分類選擇。
- 從 `全部` 點任一分類時，切換成該分類；之後可繼續加選其他分類。
- 取消最後一個已選分類後，自動回到 `全部`，不可留下無分類的空白狀態。
- 分類狀態必須同步影響：地圖 Marker、狀態計數、日期切換後的 `fitBounds()`、滑動探索地點的「全部 / 已安排 / 自定義」。
- 日期跳轉或從其他內容要求「在地圖查看某天」時，可依既有流程重設為 `全部`。

## 圖片準確性（2026-09-08 新規則）

- **不得為了填滿卡片而使用不相符、同城替代、附近景點替代或情境參考圖。**
- 只有能直接對應該景點／飯店／餐點／商品／故事主題的圖片，才可放在 `photoId`。
- 只有參考價值、但不是該項目本身的圖片，保留在 `photoReferenceId`（或來源紀錄）即可，前端不得當成正式圖片顯示。
- 沒有可靠圖片時，所有圖片槽位仍要**保留原本尺寸**，顯示 `無此圖`，不得把卡片高度縮掉。
- 遠端圖片載入失敗時，也顯示同尺寸 `無此圖`；**禁止改用另一張不相關的替代圖**。
- 行程 Day 封面不得自動借用「當天第一個有圖的景點」來補圖；只有 Day 本身明確設定 `photoId` 才顯示。
- 新增圖片前先確認「圖片內容是否就是此項目」，若無法確認，寧可留白。


## 探索地圖：分類控制位置（2026-09-08）

- `#map-filters` 必須位於「FEATURED LOCATIONS / 滑動探索地點」內。
- 排列順序固定為：區塊標題 → 分類多選（全部／景點／飯店／晚上／美食／購物／拍照・有風）→ 清單 Tab（全部／已安排／自定義）→ 橫向地點卡。
- 地圖本體上方只保留日期／導航供應商、狀態與必要定位提示，不再放分類 Chips。

## 主導覽：夜間逍遙入口

- 首頁／Topbar 右上角不再另外顯示「夜間逍遙」捷徑按鈕。
- 主 Tab 的夜間視覺提示固定使用月牙符號 `☾`，並放在文字左側：「☾ 夜間逍遙」。
- 手機底部導覽的夜間入口文字固定為「夜遊」。
- 此規則只影響入口呈現；`data-view="night"` 的分頁切換與底部手機導覽維持原功能。
- 後續不要同時恢復 Topbar「夜間逍遙」按鈕，避免同一功能在主導覽重複出現。


## Card Architecture 定案（2026-09-08）

### 1. Content Card

- 使用位置：夜間逍遙、當地必吃、雲南必買、我的收藏、拍照・有風、風俗與故事。
- 固定結構：**16:10 橫向圖片 → Badge／標題／Meta → 2 行摘要 → 四格資訊 → 強調列 → Footer**。
- 六個分頁共用同一 `.content-card` 骨架；不得再為單一分頁建立另一套獨立內容卡版型。
- 夜間 Variant 的強調列顯示飯店距離，卡面只顯示 `約 x.xxkm`；完整距離、交通與入口說明留在 Reader。
- Food／Shopping／Photo／Story 的長描述、拍攝細節、來源連結與全文一律不進卡片 Slot。
- 圖片下方不顯示作者／授權；Reader 內顯示完整圖片說明。

### 2. Journey Card

- 使用位置：Day 01–08 橫向旅程總覽與展開完整行程的 `<details>` Day 卡。
- 兩種版型可因承載資訊量不同而不同尺寸，但共用 Border、Radius、Shadow、圖片缺圖語言與 Typography Token。
- 旅程總覽卡本身不得因點擊卡面開 Reader；只有明確 CTA「展開這一天」進入完整 Day。

### 3. Compact Card

- 使用位置：探索地圖地點 Rail、每日行程故事 Rail。
- 固定原則：窄卡、圖片優先、1–2 行標題、最少 Meta；完整內容必須交給 Reader。
- 探索地圖地點 Rail 與 Content Rail 共用原生滑動骨架；短按定位、被動式長按 Reader 與桌面左鍵抓取拖曳共存。

### 4. Utility Card

- 使用位置：日期卡、時刻表事件、Map Feature、導航設定、航班。
- Utility Card 只統一 Border／Radius／互動狀態／Dark Mode 語言；不強迫使用圖片＋摘要結構。

### 卡片圖片與缺圖

- Content Card 圖片使用固定 16:10 橫向 Media Slot，卡片不依原圖直橫比例增高。
- Journey／Compact 各自維持其功能所需比例，但同一系統內不得任意變更。
- 沒有可靠圖片時保持原 Slot 尺寸，置中顯示「無此圖」，禁止使用不相符替代圖。
- 旅程總覽右側縮圖缺圖時同樣保留縮圖尺寸並置中顯示「無此圖」。

## 2026-09-08 事件架構定案

正式責任邊界如下：

- **主 Tab**：`showView()` 仍是唯一真正切換 View 的入口。桌面保留 panel 狀態；手機完成主 Tab 切換後回該分頁頂部並扣 Sticky Tab 高度。`bindMainViewSwipeController()` 只負責手機的「跟手拖曳預覽」：約 9 px 後判斷手勢意圖，水平位移需大於垂直位移約 1.3 倍；拖曳過程目前頁與相鄰頁跟著手指移動，放手後超過畫面約 28% 或水平速度約 0.45 px/ms 即完成切換，否則回彈；首尾不循環。
- **主 View Swipe 邊界**：一般文字、標題、段落、頁尾與普通文字連結都可作為拖曳起點；短按連結仍照常開啟。Content/Journey/Compact/Utility Card、所有橫向 Rail、旅程 Day Carousel、行程時刻表、地圖、日期列、按鈕/表單及任何開啟中的 Reader/Dialog 保留自己的手勢優先權，不啟動主 View Swipe。水平意圖成立前不得阻止原生上下捲動；成立後才 `preventDefault()` 接管該次手勢。
- **主 View Swipe 動畫**：Sticky 主 Tab 與 Bottom Nav 固定不跟著移動；僅主內容區使用臨時視覺 clone 做 `translate3d()` 跟手動畫。完成切換後仍只呼叫一次既有 `showView()`，待既有手機回頂流程完成後才移除 preview layer；不得建立第二套 Tab 狀態。
- **旅程總覽**：Touch／Pen 由原生 scroll + scroll-snap；桌面滑鼠由 idempotent `bindHorizontalScroller()`；展開控制只由 `bindItineraryExpansionController()`；Day 開合使用原生 `<details>`。
- **Day 關閉返回**：`#days` 父層只有一個 `toggle` capture listener，負責回到來源 Carousel 與原 `scrollLeft`。
- **行程時刻表／橫向列**：`bindHorizontalScroller()` 是唯一桌面拖曳／wheel controller；Touch／Pen 不進入 JS Drag。
- **Popup 閱讀**：Content Reader 與 Map Detail Reader 共用 `bindPopupReaderNavigation()`；Pointer 主路徑 + Touch completion path 共用 duplicate guard。
- **Reader 返回位置**：共用 `captureReaderReturnState()` / `restoreReaderReturnStateStable()` 保存垂直位置、必要橫向位置與 opener focus。
- **日期 Rail**：探索地圖與夜間逍遙共用 `buildDateRail()` / `syncDateRail()`；以 `WeakMap` 保存 Controller 狀態，重 render 不重複綁定。
- **探索地圖下方卡片**：`bindMapCardInteractionController()` 負責 click / Enter / Space 與被動式長按；桌面抓取拖曳共用 `bindHorizontalScroller(mapStrip,{mouseDrag:true,wheel:false})`，手機滑動仍完全原生。
- **隱藏 Day select**：`#map-day` / `#night-day` 只作狀態鏡像，沒有 `change` render 路徑。
- **全域 click delegate**：只做未被本地 Controller 擁有的動態 Action routing，依 `handleItineraryUiButton()` / `handleReaderUiButton()` / `handleMapUiButton()` / `handleLibraryUiButton()` 分責。
- **本地 Controller 邊界**：行程展開、Date Rail、Map Strip 會在本地 Click Controller 結束冒泡，避免同一 Click 再進 document router。
- **CSS Gesture Contract**：`style.css` 檔案最末 `EVENT ARCHITECTURE` 區塊是全站唯一 `touch-action` 定義位置。
- **維護原則**：功能只有一個 Owner；新增互動先擴充既有 Controller，不建立第二條相同手勢判斷路徑。

### 事件修改驗收

修改任何 Gesture／Reader／Carousel 後至少確認：

1. S24 尺寸 Touch：主 Tab 點擊回頂；一般內容／頁尾左右拖時頁面需跟手露出相鄰 Tab，超過門檻完成、未達門檻回彈；普通連結短按仍可用；卡片／Rail／地圖／Reader 上左右滑不誤切；Day 卡原生滑、時刻表原生滑、Reader 上下讀／左右切。
2. 「展開完整行程」「展開這一天」單擊正常；滑 Day 卡不誤開。
3. 探索地圖卡：S24 橫向滑動須與 Content Rail 同樣順暢；短按同步地圖；靜止長按約 520 ms 後放手開 Reader；桌面可用左鍵抓取拖曳水平移動。
4. Reader 關閉回原閱讀位置；主 Tab 切換規則不被 Reader return-state 影響。
5. Date Rail 重建或重新 render 不增加 listener；本地 Click 不再進 document router。
6. `node --check js/app.js`、JSON parse、`touch-action` 唯一區塊與 MD 函式名稱掃描皆通過。



## Photo matching
- Places, attractions, hotels, businesses, stories and photo spots require an exact/verified subject before `photoId` is assigned.
- Broad food/shopping category cards may use a representative example only when the caption makes the example clear.
- If no reliable match is found, keep `photoId: null` and display `無此圖`; never substitute an unrelated scenic image.
- Every displayed web image must retain source, author, license and any cropping/resizing note in `data/trip-data.json` and `PHOTO_SOURCES.md`.

## 飯店／航空圖片規則（2026-09-09）

- 手冊指定住宿應優先補代表照片；不得因 Wikimedia 無圖就直接判定「無此圖」。
- 飯店照片先以「名稱 + 分店 + 地址／電話」交叉核對住宿實體，再設定正式 `photoId`；不同分店不得互相代圖。
- 優先順序：酒店官方／品牌官方 → 可確認同一住宿的訂房平台 → 其他可核對來源。可取得原圖時優先本地化；只能取得頁面顯示時可記錄來源後暫用遠端圖或內部截圖，但不得把「能截圖」當成已取得公開再利用授權。
- `images/airlines/` 只保存寬版本地 fallback。Day 1 去程與 Day 8 回程示意圖綁定正式 `photoId`，正常連網優先使用 Wikimedia Commons 寬幅圖；後續不得為同一圖片重建 ID。
- 航空圖片按航空公司即可，不要求與航班實際機型一致；但 UI、alt、caption 必須註明「代表照片／非本次航班實際機型確認」，且主視覺優先使用橫向寬圖。
- 「出發提醒」航班 Utility Card 禁止放飛機照片，只保留航空公司、班號、航線與時間；航空示意圖僅用於 Day 1／Day 8 與相關 Reader。
- 每批新增圖同步更新 `PHOTO_SOURCES.md`；酒店來源若未標示可重用授權，必須如實記為「未標示可重用授權」，不得自行改寫為 CC／Public domain。

## 省流量 / Service Worker 快取架構（2026-09-09）

### Cache ownership

- `sw.js` 是唯一 Service Worker 快取控制器。
- `APP_CACHE` 負責 HTML / CSS / JS / JSON 及必要 runtime，策略為 `stale-while-revalidate`。
- `IMAGE_CACHE` 負責圖片，策略為 `cache-first`。
- App cache 與 image cache 必須使用不同 cache name；一般程式版本更新不得順便刪除圖片 cache。
- `activate` 僅可自動清除 `yunnan-app-*` 舊版本；不得用廣泛的 `caches.keys().map(caches.delete)` 清空所有 Cache Storage。

### 圖片流量規則

- 不可在 install 階段 precache 全部照片。照片維持「第一次實際顯示才下載」。
- Content Card / Compact Card 延續 `loading="lazy"`；Reader 的大圖只在 Reader 被建立／打開後載入。
- `images/` 本地圖片與可正常取得的遠端照片都可進 `IMAGE_CACHE`。
- `tile.openstreetmap.org` 地圖瓦片永遠排除於照片長效快取，避免地圖平移造成 Cache Storage 無限制膨脹。
- 若替換既有圖片內容，優先改檔名或圖片 URL 形成新的 cache key；不要只為一張圖任意 bump `IMAGE_CACHE`，否則所有已看過的照片會重新消耗流量。

### App 更新規則

- 修改 `index.html`、`css/style.css`、`js/app.js`、`data/trip-data.json` 等核心程式後，必須同步更新 `sw.js` 的 `APP_CACHE` 版本。
- 若 CSS / JS query string 有更新，`index.html` 與 `sw.js` `APP_SHELL` 必須完全一致。
- `APP_SHELL` 只放核心程式資源，不放大量圖片。
- Service Worker 功能只在 secure context（HTTPS；localhost 例外）生效。不要用 `file://` 測試離線快取並據此判斷功能失敗。
