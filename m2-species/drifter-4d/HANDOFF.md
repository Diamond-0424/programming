# 截游體交接紀錄

## 接手摘要（2026-11-05 更新）

目前完成 Three.js 實驗版與量測工具；下一步是實際瀏覽器驗證和三組效能比較。尚無瀏覽器 FPS 數據，正式入口仍為 p5.js。

### 接手順序與完成條件

1. 在 `m2-species` 執行 `git branch --show-current`、`git status --short`，確認分支及未提交內容。此工作樹同時含先前 Rust/Wasm 更新與本次繪圖實驗；保留兩批變更，提交、合併或推送前另向使用者確認。
2. 切換到 `drifter-4d`，執行 `node serve.cjs`。若 8080 已被占用，先確認既有服務是否正提供此目錄；前次啟動的服務不保證跨工作階段仍存活。
3. 開啟 `http://127.0.0.1:8080/three.html`，與 `index.html` 對照。確認畫面能載入且無 shader／模組錯誤，再檢查巡游、追捕合籠、碎裂、真正截面、旋轉、縮放、暫停、重設及非空白截圖。記錄實際觀察；Node 測試替身不能作為此步通過證據。
4. 開啟 `http://127.0.0.1:8080/performance.html`，同一分頁依序跑原版 p5、低特效 p5、低特效 Three。每組三輪，每輪暖機 5 秒、記錄 30 秒；下載三份含逐幀資料的 JSON。保留瀏覽器、運算後端與顯示設定，確認各組可比較。
5. 分開評估畫質調降和引擎更換的收益。低特效 p5 → Three 的 P95 幀時間降低至少 20% 才算達本次門檻；若受螢幕更新率限制，報告提交時間與卡頓比例。將實際數據、畫面差異及採用與否補進 README／notes／本交接；未達標也保留實驗結果。

### 修改位置

| 檔案 | 接手用途 |
| --- | --- |
| `sketch.js` | 共用生態更新、繪圖流程與 p5 入口；保留 JS 備援 |
| `three-main.js`、`three-renderer.js` | Three 啟動、控制、批次線段、節點 shader、截圖與釋放 |
| `experiment-config.js`、`benchmark.js` | 品質選項、固定亂數、暖機、量測與 JSON 匯出 |
| `performance.html`、`performance-report.js` | 三組測試入口與結果比較 |
| `vendor/three/` | 固定版本原始依賴、MIT 授權及雜湊清單 |
| `README.md` 的 Three.js 實驗章節 | 完整使用方法、研究來源、已知差異及 AI 揭露 |

### 驗證指令

以下指令從 `drifter-4d` 執行：

```powershell
node tests/render-paths.cjs
node tests/benchmark.cjs
node tests/rust-parity.cjs
node tests/rust-core.cjs
node --check sketch.js
Get-Content -Raw three-main.js | node --input-type=module --check
Get-Content -Raw three-renderer.js | node --input-type=module --check
git diff --check
```

前次實作的通過證據見下方實驗紀錄；本次僅整理交接文件，沒有重新執行程式測試。修改生態或特效後，再執行相關 `tests/*.cjs` 回歸。

### 尚待解決的限制

前次 Windows Computer Use 因無法可靠辨識目前瀏覽器 URL 而停止。接手時先確認工具是否恢復；若仍不可用，請使用者在實際瀏覽器完成觀察與下載量測結果，並如實保留未驗證狀態。

固定亂數但使用實際幀間隔，效能不同可能導致軌跡差異；Three 圓環、透明交疊與拖曳手感也尚待目視核對。這些都是比較結果需交代的限制。

以下保留歷史紀錄；目前工作範圍以本摘要為準。

## 2026-11-05 GitHub 同步準備

- 本次整理 2026-10-22 留下的更新：Rust/Wasm 批次物理與幾何運算、單一截游體、18 隻小生物及 6 種形體；出芽已移除。
- Rust 原始碼、bridge.js 與 drifter_core.wasm 必須一起保存；JS 備援仍保留。
- 本次執行 sketch.js 語法檢查、git diff --check 與 tests/*.cjs 全部成功，包含 1,200 步 JS/Wasm 狀態比對。
- 效能基準本次為 JS 約 394 ms、Rust 約 112 ms；僅為 Node CPU 計算，不代表瀏覽器 FPS。
- 尚需作者在瀏覽器確認追捕、合籠、碎片與暫停的實際視覺效果。
- 使用者已要求將這批更新提交並推送至 origin/main。

## 2026-11-05 Three.js 流暢度實驗

- 目前分支 `experiment/three-render-performance`；保留原有未提交變更，本次未 commit／merge／push。上節同步授權屬先前工作，本次以不自動提交為準。
- 原入口 `index.html` 保留 p5；`three.html` 為低特效 Three；`performance.html` 為三組比較導覽。執行 `node serve.cjs`，8080 本機 HTTP。
- `sketch.js` 抽出 updateSimulation / renderSimulation；ThreeRenderer 只讀繪圖狀態，renderCreature 轉交實例節點，特殊效果沿用共用幾何。Rust 原始碼／bridge／Wasm 未因本次繪圖實驗更動。
- Three 0.180.0 固定本機，附 MIT LICENSE、下載 URL 與 SHA-256。線段按線寬批次、GPU 節點圓環、擴容及離頁資源釋放、截圖即時繪製。
- 原有所有測試通過；新增 render-paths.cjs：真實 Three 幾何模組、GPU 替身，JS/Wasm 各 420 幀入口狀態一致；benchmark.cjs：三輪 5+30 秒與暫停／隱藏排除通過。Node 計算一次 JS 395 ms / Wasm 116 ms，不能當 FPS。
- 量測入口固定 900×600，等待後端就緒、重設種子與相機；兩引擎 rAF 排程（p5 量測目標 1000，避免預設 60 上限混淆）。原始逐幀 JSON 可下載，結果暫存在同一分頁 sessionStorage。三次統計取中位數，低特效 p5→Three P95 降低 20% 為門檻。
- **尚未完成**：真實瀏覽器 WebGL 執行／目視、三組 30 秒×3 效能數據、非空白截圖。Computer Use 因無法可靠辨識 Windows 瀏覽器目前 URL 而停止，不再操作或繞過限制。不能聲稱達標或正式採用。
- 後續先在使用者實際瀏覽器跑比較頁，逐組下載 JSON；檢查巡游、合籠、碎裂、截面、方向、遮擋、縮放、暫停、重設及截圖。留意 shader 圓環抗鋸齒、透明疊加和拖曳手感。特殊效果圓環仍在 CPU 計算，若未達標再依量測找瓶頸。

## 最新補充：2026-11-05 養殖箱環境分支

目前分支 experiment/tank-environment，承接上方 Three.js 實驗與原有未提交修改；沒有新增 commit／push。sketch.js 新增 TankEnvironment、TANK 參數及共用更新／繪圖掛點，tests/environment.cjs 驗證獨立環境生命週期。正式與 Three 入口均顯示淡角框、微流和捕食擾動；低特效繪製半量粒子。沒有修改生物物理或 Rust。

environment、interaction、ecosystem（三組種子各五分鐘）、render-paths（JS/Wasm）、rust-parity（1200 步）、語法與 diff 檢查通過。瀏覽器視覺及 FPS 未驗證，下一步請確認兩入口亮度／遮擋及捕食擾動，再重新量測；先前效能結果不能當本版結果。環境可用 TANK.enabled 關閉繪製。完整說明與 AI 揭露見 README 最新章節。

### 2026-11-05 後續回報

使用者回報粒子太淡且卡頓。已提高粒子亮度／線寬／短線長度，移除逐粒子 stroke 切換，加入兩入口的環境更新／繪圖開關（基準量測時鎖定）。瀏覽器存取 host 不可用，卡頓未重現或定因，不能聲稱效能修復；下一步先確認使用者入口與環境開／關對照。README 有本次 AI 揭露與驗證限制。

### 2026-11-05 環境流暢版後續修正

已找到並修正 Three 繪圖批次隨動態線寬不斷累積：固定 420 幀由 153 組降至 6 組，額外 10,000 次變化仍最多 16 組。three-renderer.js 將線寬量化為 .25～4、間距 .25；tests/render-paths.cjs 有回歸驗證。three.html 標為環境流暢版，index.html 新增入口連結。環境、互動及 JS/Wasm 繪圖狀態比對通過；尚無實際瀏覽器 FPS，不能將批次減少比例當成加速比例。使用 HTTP 入口，勿直接雙擊 three.html。

### 2026-11-12 小生物行為與空間放大

見 README 最新章節。重點：`SPACE=1.5`（sketch.js 與 three-renderer.js 的鏡頭各一處）、小生物 27 隻、`prey_step` 已改且 wasm 已重編（改 Rust 後需 `node rust-core/build.cjs`）。bridge 傳「alive」到槽 14 以對齊 JS 的鄰居判斷。測試全過；瀏覽器畫面、FPS、群聚手感待使用者目視確認，參數集中在 `FLOCK`／`STROKE`／`BODY`。
