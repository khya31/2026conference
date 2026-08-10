# 2026 青職特會報名系統前端

版本：2026.08.10-r54

## 正式 API

前端 API 設定唯一來源為 `config.js`。

- GAS Web App：`https://script.google.com/macros/s/AKfycbxGp7gwzzWHHBCwPN801EgjBTOwYYGRWCv91uS54zY9zn8O5RBouGuj38JsQNFimYHxjw/exec`
- 預期 GAS API 版本：`2026.08.10-r54`

## 部署

GitHub Pages 直接覆蓋本資料夾全部檔案。若未來 GAS Web App URL 改變，只修改 `config.js` 的 `apiUrl` 與 `apiDeploymentId`，並同步更新前後端版本。
