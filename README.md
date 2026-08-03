# 2026 年青職特會報名

正式前端：<https://khya31.github.io/2026conference/>

## 架構

- GitHub Pages：`index.html`、`report.html`、`styles.css`、`app.js`，只負責畫面與使用者互動。
- Google Apps Script：保管試算表 ID、計價規則、早鳥核對、活動名額、報名寫入、報表登入與 Excel 匯出。
- 前後端通訊：GitHub Pages 以跨網域 POST 表單呼叫 GAS；GAS 執行後以 `postMessage` 將結果回傳。瀏覽器不需要開放寬鬆的 CORS，也不會在 GitHub 儲存試算表權限或管理密碼。

## 前端設定

GAS 部署網址集中在 `config.js`。若 GAS 產生新的部署 ID，只需更新 `apiUrl`。

## 發布

推送到 `main` 後，`.github/workflows/pages.yml` 會使用 GitHub 官方 Pages Actions 發布靜態網站。

## 後端原始碼

後端位於本機專案的 `work/gas-backend`，不存放在公開 GitHub 儲存庫。部署時使用該資料夾的 `.clasp.json` 更新既有 Apps Script 專案。
