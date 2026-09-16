# 旅拍指南｜來源實拍與機位研究

此檔由 `data/trip-data.json > photoSpots > poseTips` 與統一 `images` registry 自動生成，不可手改。

## 使用原則

- Pose 本身只保存 `imageId` 與姿勢／鏡頭／機位研究資料；圖片來源、作者、授權、local 與 remote 全部只放在 `images[imageId]`。
- 唯一流程是 `imageId → local → remote → 無此圖`。`remote` 本地化後仍永久保留，`SYNC_IMAGES.bat` 只下載該 exact URL。
- 同一拍照場景的不同 Pose 必須使用不同 imageId 與不同 exact remote URL。
- 第三方圖片的來源標示不等於取得再利用授權；本專案只作私人旅程拍照參考。

目前共 **17** 組 Pose 參考。

| 地點 | Pose | Image ID | 本地檔 | exact remote | 來源頁／作者 | 機位研究 |
| --- | --- | --- | --- | --- | --- | --- |
| 鳳陽邑・有風小院外觀 | 古院門口・靠牆留白 | `pose-fengyang-01` | `images/pose/fengyang-01.webp` | [remote](https://ak-d.tripcdn.com/images/1mi5r12000gej5c15BC75.jpg?proc=source%2Ftrip) | [Trip.com](https://hk.trip.com/moments/detail/dali-city-1445616-125800550/) | [抖音](https://www.douyin.com/shipin/7328558222930102282) |
| 喜洲・轉角樓、稻田與有風大樹 | 芒草田・撐傘站姿 | `pose-xizhou-01` | `images/pose/xizhou-01.webp` | [remote](https://dimg04.c-ctrip.com/images/0103t1200091z661h47E7_W_640_0_Q90.jpg?proc=autoorient) | [大理無違旅行](https://you.ctrip.com/travels/2124466/4035789.html) | [攜程攻略](https://you.ctrip.com/travels/2124466/4035789.html) |
| 喜洲・轉角樓、稻田與有風大樹 | 芒草近景・側身抬手 | `pose-xizhou-02` | `images/pose/xizhou-02.webp` | [remote](https://dimg04.c-ctrip.com/images/0101a1200091z651t07D0_W_640_0_Q90.jpg?proc=autoorient) | [大理無違旅行](https://you.ctrip.com/travels/2124466/4035789.html) | [攜程攻略](https://you.ctrip.com/travels/2124466/4035789.html) |
| 喜洲・轉角樓、稻田與有風大樹 | 稻田俯身・低角度抓拍 | `pose-xizhou-03` | `images/pose/xizhou-03.webp` | [remote](https://dimg04.c-ctrip.com/images/0106r1200091z670wD375_W_640_0_Q90.jpg?proc=autoorient) | [大理無違旅行](https://you.ctrip.com/travels/2124466/4035789.html) | [攜程攻略](https://you.ctrip.com/travels/2124466/4035789.html) |
| 沙溪・寺登街與古戲台 | 古戲台街景・人在畫面一側 | `pose-sideng-01` | `images/pose/sideng-01.webp` | [remote](https://ak-d.tripcdn.com/images/1mi16224x8zs812n12E62.jpg?proc=source%2Ftrip) | [Trip.com](https://sg.trip.com/moments/theme/destination-shaxi-town-2025134-attraction-993137/) | [抖音](https://jingxuan.douyin.com/m/video/7628619417974292443) |
| 沙溪・玉津橋 | 玉津橋全景・人小橋大 | `pose-yujin-01` | `images/pose/yujin-01.webp` | [remote](https://ak-d.tripcdn.com/images/1mi04224x9443yq4g4D5D_Q90.jpg?proc=source%2Ftrip) | [Trip.com](https://my.trip.com/moments/detail/jianchuan-2215-134850704?locale=en-MY) | [抖音](https://jingxuan.douyin.com/m/video/7628619417974292443) |
| 藍月谷・水色與雪山 | 雪山與湖面・人物靠側邊 | `pose-blue-01` | `images/pose/blue-01.webp` | [remote](https://ak-d.tripcdn.com/images/1mi6n224x90hj2m6jB20A.jpg?proc=source%2Ftrip) | [Trip.com](https://hk.trip.com/moments/theme/poi-blue-moon-valley-departure-point-145474108-guides-993135/) | [抖音](https://www.douyin.com/video/7637315779297398035) |
| 麗江古城・屋瓦與水巷 | 四方街・廣場邊緣抓拍 | `pose-lijiang-01` | `images/pose/lijiang-01.webp` | [remote](https://dimg04.c-ctrip.com/images/0104n1200086t0l1z1554_W_640_0_Q90.jpg?proc=autoorient) | [攜程攻略](https://you.ctrip.com/travels/Lijiang32/3977296.html) | [公開來源](https://commons.wikimedia.org/wiki/File:%E4%B8%BD%E6%B1%9F%E5%9B%9B%E6%96%B9%E8%A1%97.JPG) |
| 麗江古城・屋瓦與水巷 | 屋瓦層次・人物放角落 | `pose-lijiang-02` | `images/pose/lijiang-02.webp` | [remote](https://ak-d.tripcdn.com/images/1mi3a224x98k04lak79F0.jpg?proc=source%2Ftrip) | [Trip.com](https://hk.trip.com/moments/detail/lijiang-32-142727762?locale=en-HK) | [公開來源](https://commons.wikimedia.org/wiki/File:Lijiang_Yunnan_Old-town-01.jpg) |
| 理想邦・白色階梯與洱海框景 | 白色建築・人小景大 | `pose-ideal-01` | `images/pose/ideal-01.webp` | [remote](https://dimg04.c-ctrip.com/images/1me3j12000ro7ko9c237C_R_640_10000_Q90.jpg?proc=source%2Ftripcommunity) | [攜程攻略](https://gs.ctrip.com/html5/you/sight/dalicity1445616/5708581.html) | [抖音](https://www.douyin.com/shipin/7333880045604636724) |
| 雲杉坪・雪山草甸與杉林 | 草甸大景・人物放下方 | `pose-spruce-01` | `images/pose/spruce-01.webp` | [remote](https://ak-d.tripcdn.com/images/1mi6z12000qr7agt0FD1D.webp?proc=source%2Ftrip) | [Trip.com](https://sg.trip.com/moments/theme/poi-yulong-snow-mountain-75919-outfit-styling-tips-990474/) | [抖音](https://www.douyin.com/video/7564445014941240635) |
| 甘海子・雪山腳下大景 | 地標石＋雪山大景 | `pose-ganhaizi-01` | `images/pose/ganhaizi-01.webp` | [remote](https://ak-d.tripcdn.com/images/1mi6a224x97u33mrs3550.jpg?proc=source%2Ftrip) | [Trip.com](https://my.trip.com/moments/detail/yulong-1446279-140235111?locale=en-MY) | [抖音](https://jingxuan.douyin.com/m/video/7598474662066748793) |
| 虎跳峽・人小峽谷大 | 峽谷大景・人物放角落 | `pose-tiger-01` | `images/pose/tiger-01.webp` | [remote](https://images.squarespace-cdn.com/content/v1/62f1cb15a2cb083186ccd6d1/47e67160-5ca7-46ce-90a7-fddb48409770/9B1B2342-540D-4652-B4D1-FC569811EEF7-2209-000000DAB2284851.jpg?format=1500w) | [Feastography](https://www.feastographyblog.com/blog/tiger-leaping-gorge) | [抖音](https://www.douyin.com/video/7490488001194233107) |
| 松贊林寺・層疊金頂 | 寺院全景・人物放底部 | `pose-songzanlin-01` | `images/pose/songzanlin-01.webp` | [remote](https://ak-d.tripcdn.com/images/1mi5y224x8x6z43duBD76.jpg?proc=source%2Ftrip) | [Trip.com](https://my.trip.com/moments/detail/shangri-la-106-125732812?locale=en-MY) | [抖音](https://www.douyin.com/shipin/7308225177497487412) |
| 獨克宗・龜山大轉經筒 | 低角度拍轉經筒・人物放底部 | `pose-dukezong-01` | `images/pose/dukezong-01.webp` | [remote](https://ak-d.tripcdn.com/images/1mi3o12000pn3cy0iB6B4_W_640_0_R5_Q80.jpg?proc=source%2Ftrip) | [Trip.com](https://hk.trip.com/moments/detail/shangri-la-106-137830554/) | [抖音](https://www.douyin.com/shipin/7350937894229428276) |
| 普達措・湖、草地與森林 | 湖岸大景・人物放側邊 | `pose-pudacuo-01` | `images/pose/pudacuo-01.webp` | [remote](https://static.wixstatic.com/media/d5e5c4_f9a9867b037448d38ac3a94d2ebc1401~mv2.jpg/v1/fill/w_568%2Ch_758%2Cal_c%2Cq_85%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/d5e5c4_f9a9867b037448d38ac3a94d2ebc1401~mv2.jpg) | [Mamakajima](https://jxuantai.wixsite.com/mamakajima/single-post/china-yunanshangrila-%E4%B8%AD%E5%9C%8B%E9%9B%B2%E5%8D%97%E9%A6%99%E6%A0%BC%E9%87%8C%E6%8B%89-%E6%99%AE%E9%81%94%E6%8E%AA%E5%9C%8B%E5%AE%B6%E5%85%AC%E5%9C%92-%E8%B7%91%E6%AF%92%E6%97%A5%E8%AA%8C) | [抖音](https://www.douyin.com/shipin/7643258814623451182) |
| 束河古鎮・青石路與水巷 | 青石路慢走 | `pose-shuhe-01` | `images/pose/shuhe-01.webp` | [remote](https://dimg04.c-ctrip.com/images/1mf3m12000ehj1jk43860_W_640_0_Q90.jpg?proc=autoorient) | [攜程攻略](https://you.ctrip.com/travels/lijiang32/4137872.html) | [大眾點評](https://www.dianping.com/shop/5253400/photos/album) |

## 維護

更新旅拍來源後執行：

```bash
python tools/generate_pose_sources.py
python tools/generate_image_sources.py
python tools/validate_project.py
```
