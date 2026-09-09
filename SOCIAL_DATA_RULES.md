# 雲南慢時光｜社群資料採集與來源追溯規則

> 適用範圍：小紅書（Xiaohongshu / RED）、Instagram，以及日後其他以貼文／Reel／短影音／社群筆記為主的來源。
>
> 核心原則：**任何由社群內容衍生並寫入正式旅遊資料的資訊，都必須能反查到來源。沒有 `sourceRefs` 的社群衍生內容，不得直接進入正式 `trip-data.json`。**
>
> 本文件規範的是資料格式與維護流程，不代表允許繞過登入、CAPTCHA、反爬、付費牆或平台存取限制。優先使用公開頁面、官方 API／匯出能力或使用者合法提供的資料；不得為了採集而規避技術限制。

---

## 1. 建議檔案結構

社群原始來源與正式旅遊資料分離：

```text
html/
├── data/
│   ├── trip-data.json          # 網站正式資料
│   ├── social-sources.json     # 社群 Source Record
│   └── source-index.json       # 選用：來源索引／統計／最後檢查狀態
├── SOCIAL_DATA_RULES.md
└── ...
```

規則：

- `trip-data.json` 只保存網站要使用的整理後資料及來源引用。
- `social-sources.json` 保存每一篇來源的追溯資訊。
- 不要把大量貼文全文、HTML、影片或圖片二進位資料塞進 `trip-data.json`。
- 日後如果來源量很大，可以按平台或月份拆檔，例如：

```text
data/social/
├── xhs-2026-09.json
├── instagram-2026-09.json
└── source-index.json
```

---

## 2. Source Record 是不可丟失的基本單位

每一篇來源先建立獨立 Source Record，再做摘要、去重與整合。

### 2.1 必填欄位

```json
{
  "sourceId": "xhs_20260908_0001",
  "platform": "xiaohongshu",
  "url": "https://www.xiaohongshu.com/...",
  "canonicalUrl": "https://www.xiaohongshu.com/...",
  "author": {
    "name": "作者顯示名稱",
    "handle": "作者帳號或 null"
  },
  "retrievedAt": "2026-09-08T11:30:00+08:00",
  "status": "active"
}
```

**以下欄位不得省略：**

- `sourceId`
- `platform`
- `url`
- `author`
- `retrievedAt`
- `status`

抓不到的資料填 `null`，**不可自行猜測**。

### 2.2 建議完整格式

```json
{
  "sourceId": "xhs_20260908_0001",
  "platform": "xiaohongshu",
  "url": "https://www.xiaohongshu.com/...",
  "canonicalUrl": "https://www.xiaohongshu.com/...",
  "postId": "abc123",
  "contentType": "post",
  "author": {
    "name": "雲南旅行筆記",
    "handle": "user_xxxx",
    "profileUrl": "https://www.xiaohongshu.com/user/..."
  },
  "publishedAt": "2026-08-20T10:30:00+08:00",
  "retrievedAt": "2026-09-08T11:30:00+08:00",
  "lastSeenAt": "2026-09-08T11:30:00+08:00",
  "status": "active",
  "language": "zh-Hans",
  "title": "大理喜洲半日散步",
  "excerpt": "喜洲古鎮早上人較少，適合先逛轉角樓與稻田一帶。",
  "tags": ["大理", "喜洲", "拍照"],
  "entities": ["喜洲古鎮", "稻田"],
  "collection": {
    "method": "public-page",
    "collector": "manual-or-approved-tool",
    "parserVersion": "1.0",
    "notes": null
  }
}
```

Instagram 只需改平台與貼文欄位：

```json
{
  "sourceId": "ig_20260908_0001",
  "platform": "instagram",
  "url": "https://www.instagram.com/p/XXXX/",
  "postId": "XXXX",
  "contentType": "reel",
  "author": {
    "name": "Example Travel",
    "handle": "@exampletravel"
  },
  "publishedAt": "2026-07-15T18:00:00+08:00",
  "retrievedAt": "2026-09-08T11:40:00+08:00",
  "lastSeenAt": "2026-09-08T11:40:00+08:00",
  "status": "active",
  "excerpt": "麗江古城西側傍晚較適合拍日落。"
}
```

---

## 3. `sourceId` 命名規則

固定格式：

```text
{platform}_{YYYYMMDD}_{序號}
```

例如：

```text
xhs_20260908_0001
xhs_20260908_0002
ig_20260908_0001
official_20260908_0001
web_20260908_0001
```

規則：

- `sourceId` 一旦建立就不可因 URL、標題或作者改名而更換。
- 不使用 URL 當主鍵。
- 不使用貼文標題當主鍵。
- 同一篇貼文重新檢查時更新原 Source Record，不建立新的 Source Record。
- 明確判定為不同貼文，即使內容相同也要使用不同 `sourceId`。

---

## 4. 正式資料如何引用來源

### 4.1 卡片級：`sourceRefs`

任何由社群內容整理出的正式景點、美食、購物、夜遊、拍照、故事內容，都要保存來源：

```json
{
  "id": "xizhou-old-town",
  "name": "喜洲古鎮",
  "summary": "白族民居與轉角樓集中，早晨較適合慢逛與拍照。",
  "sourceRefs": [
    "xhs_20260908_0001",
    "ig_20260908_0003"
  ]
}
```

### 4.2 欄位級：`fieldSources`

對可能變動、容易出錯或需要追溯的欄位，優先記錄欄位來源：

```json
{
  "sourceRefs": [
    "xhs_20260908_0001",
    "ig_20260908_0003",
    "official_20260908_0001"
  ],
  "fieldSources": {
    "summary": ["xhs_20260908_0001", "ig_20260908_0003"],
    "photoTips": ["xhs_20260908_0001"],
    "bestTime": ["ig_20260908_0003"],
    "openingHours": ["official_20260908_0001"]
  }
}
```

建議優先使用 `fieldSources` 的欄位：

- `openingHours`
- `price`
- `address`
- `bestTime`
- `photoTips`
- `transportTips`
- `recommendedFood`
- `shoppingTips`
- `summary`

---

## 5. 社群資訊不是官方事實

社群來源很適合：

- 拍照角度
- 人潮體感
- 實際旅遊經驗
- 口味感受
- 哪段路好逛
- 夜間氣氛
- 個人踩雷／推薦經驗

但不可單靠社群貼文直接視為高可信官方資訊：

- 官方營業時間
- 即時票價
- 封路／停業
- 景區政策
- 飯店入住規則
- 航班／交通時刻

建議把整理出的 Claim 分類：

```json
{
  "text": "早上八點前通常較安靜。",
  "type": "experience",
  "confidence": "medium",
  "sourceRefs": [
    "xhs_20260908_0001",
    "xhs_20260908_0008"
  ]
}
```

官方來源：

```json
{
  "text": "開放時間 08:00~18:00。",
  "type": "official_fact",
  "confidence": "high",
  "sourceRefs": ["official_20260908_0001"]
}
```

建議 `type`：

- `experience`
- `recommendation`
- `observation`
- `official_fact`
- `historical_context`

建議 `confidence`：

- `low`
- `medium`
- `high`

---

## 6. 多篇貼文合併時不得丟來源

例如三篇都提到「沙溪古鎮早上較安靜」，整理後不能只留下其中一篇：

```json
{
  "text": "早晨通常較安靜，適合散步與拍照。",
  "sourceRefs": [
    "xhs_20260908_0012",
    "xhs_20260908_0017",
    "ig_20260908_0006"
  ],
  "sourceCount": 3
}
```

規則：

- 合併 Claim 時來源取聯集。
- 不因內容相似就只保留「代表性來源」。
- 可另設 `primarySourceRef` 作主要展示來源，但不能刪掉其他 `sourceRefs`。
- 網站日後可利用 `sourceCount` 顯示「3 個旅遊分享都提到」。

---

## 7. 去重規則

來源去重與景點去重是兩回事。

### 7.1 Source Record 去重

優先依序判斷：

1. 平台 + `postId`
2. `canonicalUrl`
3. 原始 URL
4. 作者 + 發布時間 + 內容指紋

若只是同一貼文不同分享 URL，不建立第二筆來源。

### 7.2 正式 Entity 去重

例如以下名稱可能是同一地點：

- 麗江古城
- 大研古城
- 麗江古城／大研古城

來源可以是多篇，但正式 `places` 應盡量合併成同一 Entity，並讓不同 Source Record 都引用該 Entity。

無法確認是否同一地點時，不要強行合併；標記 `needsReview: true`。

---

## 8. 圖片、影片與著作權規則

**能看到／能下載，不代表有權重新發布。**

社群圖片／影片預設只當研究來源，不當作網站可公開部署素材。

若需要保存媒體來源資訊，可記：

```json
{
  "mediaRefs": [
    {
      "type": "image",
      "sourceId": "ig_20260908_0003",
      "sourceUrl": "https://www.instagram.com/p/XXXX/",
      "author": "@exampletravel",
      "usage": "reference-only"
    }
  ]
}
```

網站正式圖片優先使用：

- 自己拍攝
- 明確授權素材
- Wikimedia Commons
- CC 授權來源
- 官方明確允許使用的媒體

**沒有獨立授權時，不把社群圖片複製進公開網站 ZIP。**

若有合法授權，才新增到 `photos` 並完整保存：

- 作者
- 原始 URL
- License／授權方式
- 抓取／下載日期
- 是否經裁切

---

## 9. 已刪除／失效／轉私人貼文：永遠保留 Source Record

這是硬性規則：

> **來源貼文後來被刪除、改成私人、登入後才能看、URL 失效或平台回傳不可用，都不得刪除既有 Source Record。**

只更新狀態。

### 9.1 狀態值

建議 `status`：

- `active`：目前仍可正常查看
- `unavailable`：目前無法存取，但原因未確定
- `deleted`：已確認貼文被刪除
- `private`：帳號／貼文轉私人
- `login_required`：需要登入才能存取
- `blocked`：平台或地區限制
- `moved`：已確認搬到新 URL

### 9.2 失效後保存格式

```json
{
  "sourceId": "xhs_20260908_0001",
  "platform": "xiaohongshu",
  "url": "https://www.xiaohongshu.com/...",
  "canonicalUrl": "https://www.xiaohongshu.com/...",
  "author": {
    "name": "雲南旅行筆記",
    "handle": "user_xxxx"
  },
  "publishedAt": "2026-08-20T10:30:00+08:00",
  "retrievedAt": "2026-09-08T11:30:00+08:00",
  "lastSeenAt": "2026-09-10T08:00:00+08:00",
  "unavailableAt": "2026-09-12T09:15:00+08:00",
  "status": "deleted",
  "statusReason": "原 URL 回傳貼文不存在",
  "lastKnown": {
    "title": "大理喜洲半日散步",
    "excerpt": "喜洲古鎮早上人較少，適合先逛轉角樓與稻田一帶。",
    "tags": ["大理", "喜洲", "拍照"]
  }
}
```

失效後必須保留：

- `sourceId`
- 原 `url` / `canonicalUrl`
- 平台
- 作者（最後已知值）
- `publishedAt`（若原先有）
- `retrievedAt`
- `lastSeenAt`
- `unavailableAt`
- `status`
- `statusReason`
- 原本已建立的 `sourceRefs` 關係
- 已經整理出的 Claim 與其來源關聯

### 9.3 正式資料不能因來源失效就自動刪除

例如：

```json
{
  "id": "xizhou-old-town",
  "summary": "早晨通常較安靜。",
  "sourceRefs": ["xhs_20260908_0001"]
}
```

當 `xhs_20260908_0001` 變成 `deleted`：

- 不自動刪掉 `summary`。
- 不刪除 `sourceRefs`。
- 可降低該 Claim 的 freshness / confidence。
- 若屬於容易變動的資訊（營業時間、價格、政策），應標記需要重新驗證。
- 若屬於歷史描述或個人旅遊經驗，可繼續保留，但 UI／維護工具應能看出來源已不可用。

### 9.4 不可偷偷換來源

原來源失效後，找到新的相似貼文：

**錯誤：**

```text
把舊 sourceId 直接改成新 URL
```

**正確：**

1. 舊 Source Record 保留且標記 `deleted` / `unavailable`。
2. 新貼文建立新的 `sourceId`。
3. 正式 Claim 的 `sourceRefs` 加入新來源。
4. 若新來源能獨立驗證原 Claim，再調整 confidence。

### 9.5 可保存「最後已知資料」，但不要默認保存整篇受著作權保護內容

允許保存作為來源追溯所需的：

- 標題
- 作者
- URL
- 發布時間
- 少量摘要／excerpt
- 已抽取 Entity / Claim
- Tags
- 內容 hash / fingerprint
- 採集時間與狀態歷史

除非內容是使用者自己的、已授權或另有合法保存依據，**不要把整篇社群貼文全文、整組圖片或影片當作永久鏡像保存**。

若有合法授權的本地證據，可另記：

```json
{
  "evidence": {
    "contentHash": "sha256:...",
    "localArchive": "archives/xhs_20260908_0001.json",
    "archiveRights": "authorized"
  }
}
```

---

## 10. 狀態歷史建議保留

如果要做長期維護，建議保存狀態歷史：

```json
{
  "status": "deleted",
  "statusHistory": [
    {
      "status": "active",
      "checkedAt": "2026-09-08T11:30:00+08:00"
    },
    {
      "status": "active",
      "checkedAt": "2026-09-10T08:00:00+08:00"
    },
    {
      "status": "deleted",
      "checkedAt": "2026-09-12T09:15:00+08:00",
      "reason": "原 URL 回傳貼文不存在"
    }
  ]
}
```

這樣可以知道資料什麼時候開始失效，而不是只看到現在的狀態。

---

## 11. 抓取 → 候選 → 正式資料流程

禁止：

```text
小紅書 / Instagram
        ↓
直接覆蓋 trip-data.json
```

正確流程：

```text
小紅書 / Instagram
        ↓
建立 / 更新 Source Record
        ↓
social-sources.json
        ↓
抽取候選 Entity / Claim
        ↓
去重、來源合併、可信度判定
        ↓
人工或規則確認
        ↓
trip-data.json
```

社群採集永遠是「候選資料來源」，不是直接覆蓋正式行程資料的權限來源。

---

## 12. 禁止自動覆蓋的欄位

以下欄位不得只因新社群貼文出現就直接覆蓋正式值：

- `pdfScheduled`
- PDF 行程安排
- 航班時間
- 正式飯店
- 已人工核實座標
- 已人工核實地址
- 官方營業時間
- 官方票價
- 已有明確授權的圖片 Attribution / License

新社群資訊只能新增候選 Claim 或標記 `needsReview`。

---

## 13. 建議候選資料格式

```json
{
  "candidateId": "candidate_20260908_0001",
  "entityType": "place",
  "entityName": "喜洲古鎮",
  "proposedFields": {
    "bestTime": "上午較安靜",
    "photoTips": "轉角樓與稻田方向適合拍照"
  },
  "sourceRefs": [
    "xhs_20260908_0001",
    "ig_20260908_0003"
  ],
  "status": "pending_review",
  "createdAt": "2026-09-08T12:00:00+08:00"
}
```

建議候選狀態：

- `pending_review`
- `accepted`
- `rejected`
- `merged`
- `needs_verification`

---

## 14. 採集器必須保存的技術 Metadata

方便日後知道「這筆資料怎麼來的」：

```json
{
  "collection": {
    "method": "public-page",
    "collector": "manual-or-approved-tool",
    "parserVersion": "1.2.0",
    "retrievedAt": "2026-09-08T11:30:00+08:00",
    "httpStatus": 200,
    "notes": null
  }
}
```

若資料是人工貼給工具解析，可以用：

```json
"method": "user-provided"
```

若透過官方 API：

```json
"method": "official-api"
```

不要把不同採集方式混在一起卻不記錄。

---

## 15. UI 顯示來源的最低要求

網站不一定要把完整 Source Record 全部露給一般使用者，但應至少保留可追溯入口。

建議 Detail Reader 顯示：

```text
來源：小紅書 · @作者
查看原貼文 →
```

多來源可顯示：

```text
參考 4 則旅遊分享
小紅書 3 · Instagram 1
```

若來源已失效：

```text
原始貼文目前不可用 · 最後確認 2026-09-10
```

**不要把失效來源假裝成仍可點開的有效連結。**

---

## 16. 資料更新時的 Freshness 規則

容易變動的資訊應設較短驗證週期：

- 營業時間
- 價格
- 店家是否仍存在
- 交通限制
- 景區開放狀態

相對穩定的內容可較長：

- 拍照角度
- 街區特色
- 歷史背景
- 文化故事
- 個人旅遊體驗

可以增加：

```json
{
  "lastVerifiedAt": "2026-09-08T11:30:00+08:00",
  "verificationStatus": "needs_recheck"
}
```

來源刪除後，容易變動欄位應優先進入 `needs_recheck`。

---

## 17. 採集與平台存取安全規則

- 不繞過 CAPTCHA。
- 不繞過登入或付費牆。
- 不偽造登入狀態。
- 不繞過平台反自動化控制。
- 不大量、高頻請求造成服務負擔。
- 能用公開頁面／官方 API／合法匯出時優先使用。
- 使用者提供的貼文內容要記錄 `collection.method = "user-provided"`。
- 如平台條款或技術條件不允許自動取得，改用人工匯入／使用者提供連結，不以規避方式處理。

---

## 18. 每次社群資料匯入 Checklist

### Source Record

- [ ] 每篇都有唯一 `sourceId`
- [ ] 保存平台
- [ ] 保存原 URL
- [ ] 保存作者
- [ ] 保存 `retrievedAt`
- [ ] 有發布時間就保存，沒有就 `null`
- [ ] `status` 正確
- [ ] 同一篇沒有重複建立 Source Record

### 正式資料

- [ ] 所有社群衍生內容都有 `sourceRefs`
- [ ] 重要欄位有 `fieldSources`
- [ ] 多篇來源合併後沒有丟來源
- [ ] 社群經驗沒有被誤標成官方事實
- [ ] 不會自動覆蓋 `pdfScheduled`
- [ ] 不會自動覆蓋已核實官方資訊

### 圖片／媒體

- [ ] 社群圖片預設只標 `reference-only`
- [ ] 沒有授權就不複製到公開網站
- [ ] 有授權時保存作者、URL、License

### 已刪除／失效來源

- [ ] **沒有刪除舊 Source Record**
- [ ] 更新 `status`
- [ ] 保存 `lastSeenAt`
- [ ] 保存 `unavailableAt`
- [ ] 保存 `statusReason`
- [ ] 原 `sourceRefs` 沒有被移除
- [ ] 新來源使用新的 `sourceId`，沒有覆蓋舊來源
- [ ] 容易變動的 Claim 已標記重新驗證

---

## 19. 最重要的不可退化規則

1. **任何社群衍生正式內容沒有 `sourceRefs`，不得寫入正式 JSON。**
2. **一篇來源一個永久 `sourceId`；URL、作者、標題變動都不重新編號。**
3. **已刪除／失效／轉私人貼文永遠保留 Source Record，只改狀態，不刪記錄。**
4. **原來源失效後不得偷偷用新貼文覆蓋舊 `sourceId`。**
5. **合併多篇貼文時，來源必須取聯集，不得只留一篇代表來源。**
6. **社群經驗不能自動升格為官方營業時間、票價、政策。**
7. **社群圖片沒有獨立授權時，只能當參考，不得因為能下載就直接公開部署。**
8. **爬取結果先進來源／候選層，不直接覆蓋 `trip-data.json`。**
9. **不得為採集而繞過 CAPTCHA、登入、付費牆或平台技術限制。**
10. **修改資料結構後，同步更新本文件及 `MAINTENANCE_RULES.md`。**

