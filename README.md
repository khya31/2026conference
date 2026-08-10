# 2026 年青職特會報名系統

版本：`2026.08.10-r52`

## 檔案用途

- `index.html`：使用者報名頁。
- `report.html`：管理報表與 Excel 匯出頁。
- `app.js`：前端互動、表單驗證、後端 RPC 與報表渲染。
- `styles.css`：手機與電腦版共用樣式。
- `config.js`：GAS Web App 部署網址與前端版本。

## 正式規則來源

活動、住宿、房型、旅遊、午餐、保險、票價及活動費均由 GAS `getInitialData` 回傳。前端不另外保存一套計價規則。

## 部署

1. 將本資料夾完整覆蓋 GitHub Pages 儲存庫。
2. 若 GAS 重新部署後網址改變，只修改 `config.js` 的 `apiUrl`。
3. 推送至 `main`，由 `.github/workflows/pages.yml` 發布。
