# 社群與網頁來源資料契約

本文件只定義 V1 現行的來源追溯規則。正式來源紀錄存於 `data/social-sources.json`，引用關係由 `sourceRefs` / `fieldSources` 表示；`data/source-index.json` 是 generated file。

## 1. Source Record

每筆來源以 `sourceId` 為永久識別。V1 的正式紀錄至少維持下列欄位：

```json
{
  "sourceId": "web_YYYYMMDD_0001",
  "platform": "web",
  "url": "https://example.com/page",
  "canonicalUrl": "https://example.com/page",
  "postId": null,
  "contentType": "webpage",
  "author": {
    "name": "來源名稱",
    "handle": null,
    "profileUrl": null
  },
  "publishedAt": null,
  "retrievedAt": "ISO-8601 timestamp",
  "lastSeenAt": "ISO-8601 timestamp",
  "status": "active",
  "language": "zh-Hant",
  "title": "頁面標題",
  "excerpt": null,
  "tags": [],
  "collection": {
    "method": "public-web-search",
    "collector": "collector name",
    "parserVersion": "v1",
    "notes": null
  }
}
```

`retrievedAt`、`publishedAt`、`lastSeenAt` 等日期是來源證據，必須保留。

## 2. `sourceId` 規則

- `sourceId` 建立後不可改作另一個來源。
- 可使用 `web_YYYYMMDD_NNNN`、`official_YYYYMMDD_NNNN` 等可辨識格式；日期是識別的一部分。
- 同一 URL / 同一內容重複採集時，應先去重，不建立沒有必要的第二筆紀錄。
- 新來源即使補強同一結論，也建立新的 `sourceId`，不得覆寫既有來源。

## 3. 正式資料引用

卡片／entity 級使用 `sourceRefs`：

```json
"sourceRefs": ["official_YYYYMMDD_0001", "web_YYYYMMDD_0002"]
```

需要指出特定欄位證據時使用 `fieldSources`，而且其中每個 ID 也必須出現在同一 entity 的 `sourceRefs`：

```json
"fieldSources": {
  "openingHours": ["official_YYYYMMDD_0001"],
  "summary": ["web_YYYYMMDD_0002"]
}
```

多篇來源合併時取來源聯集，不因整理成一張卡片而丟失 refs。

## 4. 官方資料、社群資料與推論

- 官方頁面優先支撐名稱、地址、電話、票務、營業時間、交通規則等可核實資訊。
- 社群／一般網頁可支撐體驗、拍照角度、熱門時段、排隊感受等經驗性資訊，但不能自動升格成官方事實。
- 二次整理頁只能記錄為二次來源；沒有取得可驗證原始貼文 URL 時，不建立假的原始平台來源紀錄。
- 同一結論出現衝突時不靜默合併；正式內容要採較可靠來源，必要時保留差異說明。

## 5. 來源失效

建議 status 使用：`active`、`unavailable`、`deleted`、`private`。

來源失效時：

1. 保留原 `sourceId`、URL、retrieved metadata 與最後已知狀態。
2. 更新 `status` / `lastSeenAt`，需要時增加失效時間或 notes。
3. 不因來源暫時失效就自動刪除正式 entity。
4. 找到替代來源時建立新的 Source Record，再把新 ID 加入正式資料；不要把原 ID 指向新 URL。

不保存或散佈不必要的整篇受著作權保護內容；只保留追溯所需 metadata、短摘要與必要 notes。

## 6. 圖片與媒體

- 社群貼文可作為「這個地方／內容存在」的資料來源，不代表貼文圖片可直接部署。
- 網頁截圖、訂房平台照片、社群照片都不等於取得可重用授權。
- 網站真正使用的圖片授權與來源由 `trip-data.json > photos` 管理，並生成 `PHOTO_SOURCES.md`。
- 沒有可接受圖片時寧可顯示無圖，不用錯誤地點或同城圖片填補。

## 7. 採集與存取界線

- 只使用可正常公開存取的來源。
- 不繞過 CAPTCHA、登入限制、付費牆或平台安全機制。
- 不把搜尋摘要或模型推論偽裝成已取得的原始貼文。
- 採集器至少保留取得時間、來源 URL、collection method 與 parser/collector 資訊。

## 8. Generated Index 與驗證

`data/source-index.json` 只用於反查與統計，由：

```bash
python tools/generate_source_index.py
```

從 `trip-data.json` 的 `sourceRefs` / `fieldSources` 和 `social-sources.json` 生成。不得手改。

正式修改後執行：

```bash
python tools/validate_project.py
```

Validator 會檢查來源 ID 是否存在、`fieldSources` 是否包含於 `sourceRefs`、Source Record key / `sourceId` 是否一致，以及 generated index 是否同步。

## 9. 不可退化的核心規則

1. 來源紀錄可以失效，但不可失去追溯鏈。
2. 新來源不覆寫既有 `sourceId`。
3. 正式 entity 的來源合併取聯集。
4. 官方事實與社群經驗分開判讀。
5. 圖片來源證據不等於圖片部署授權。
6. Generated index 不人工維護。
