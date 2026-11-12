# Three.js 本機依賴

- 套件：three **0.180.0**（r180），MIT 授權，全文見 `LICENSE`。
- 來源：npm 官方 three 套件透過 jsDelivr 下載，未修改上游內容。
- `manifest.json` 記錄每個本機檔案的完整固定版本 URL 與 SHA-256。
- `build/three.module.js` 與 `three.core.js`、三個 lines 附加模組及 OrbitControls 必須一起保存。
- `three.html` 的 import map 將附加元件的 `three` 匯入解析至同一個本機版本；執行時不需要 CDN。
- 不把套件宣稱為最新版本；本次刻意固定版本，避免基準比較時依賴漂移。
