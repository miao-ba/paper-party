# 紙上派對 Paper Party

**一群朋友的小遊戲間——開瀏覽器就能玩、手機優先、不用註冊。**
開一間房、把 4 個字母的房號丟給朋友就開打；人不夠？電腦會補位。

而且它是為了「一直加新遊戲」而設計的：**一個遊戲就是一個資料夾**。把你的點子講給 AI coding agent 聽，
專案內建的 [`add-game` skill](.claude/skills/add-game/SKILL.md) 會帶它從點子一路做到「測試過、能玩」的遊戲。

[English](README.md)

---

## 功能

- **房間**：房號、分享連結、QR code，可以選擇公開在大廳列表
- **每間 2–16 人**、觀戰、踢人、轉讓房主
- **每個遊戲都有電腦玩家**（簡單／普通／困難）；單人模式完全在瀏覽器裡跑，離線也能玩
- **斷線不怕**：遊戲中重新整理會接續；房主離開會自動換人當房主
- **手機優先**：直式／橫式版面、震動、音效、可以加到主畫面（PWA）
- **雙語**：繁體中文與英文，隨時切換
- **一個小小的 Node server**，沒有資料庫、沒有帳號——任何能跑 Node 的地方都能部署

## 內建遊戲（也是範例）

| | 遊戲 | 人數 | 示範什麼 |
|---|---|---|---|
| 🎲 | **吹牛骰**：喊你看不到的骰子，抓吹牛的人 | 2–6 | 隱藏手牌、自動進入下一回合、會算機率的電腦 |
| 💣 | **終極密碼**：輪流猜數字，範圍越縮越小，猜中密碼的人爆炸 | 2–10 | 最簡單的回合制 + 秘密 |
| ⚡ | **快手**：看到「拔槍！」就點，最快的得分，小心假訊號 | 2–8 | 即時遊戲與對時 |
| #️⃣ | **最小獨特數**：大家同時選 1–7，沒撞號的最小數字得分 | 2–12 | 同時秘密出手 |

刻意寫得很小：拿去讀、拿去抄、拿去換掉。

**兩人經典**（紙上派對的前身「兩人小遊戲間」的遊戲，遊戲內文字目前是中文）：

| | 遊戲 | |
|---|---|---|
| 🎯 | **摺紙狙擊** | 畫點、摺紙、敲下去，蓋到對面火柴人 |
| 🌊 | **過橋** | 壓筆把圈圈滑過河，撞掉對面的 |
| 🤠 | **牛仔決鬥** | 一對一比拔槍 |
| 🧩 | **一起拼圖** | 自己的照片、自訂片數與形狀，進度存在 server |
| 🐦 | **盲飛** | 一人盲飛、一人看全圖報路（要開語音，也能用聲音飛） |
| 🪢 | **拔河** | 狂點拉繩，哨子響要放手 |
| ✍️ | **一起一筆畫** | 一人管左右、一人管上下，合力描圖 |
| 🐢 | **烏龜對對碰** | 同一袋盲袋，比誰擺得好、開得巧 |

它們透過 `@sdk/duo` 相容層執行、都有電腦玩家，見 [docs/porting-2p-games.md](docs/porting-2p-games.md)。

## 開始

```bash
npm install
npm run dev          # server :3330 + Vite :5330
```

打開 <http://localhost:5330>。同一台電腦要當第二個玩家，另開 <http://127.0.0.1:5330>（不同網域＝不同名字）。

正式使用：

```bash
npm run build
npm start            # 單一程序，:3330（或 $PORT），全部都由它提供
```

同一個 Wi-Fi／Tailscale／ZeroTier 的朋友開 `http://<你的 IP>:3330` 就能加入。要放到網路上，看
[docs/deploy.md](docs/deploy.md)（Docker、Render／Railway／Fly、VPS + Caddy）。

## 加你自己的遊戲

### 交給 AI agent（推薦）

用 Claude Code 打開這個專案，直接描述遊戲：

> 「加一個 3–8 人的遊戲：每個人偷偷寫一個數字，最接近平均值三分之二的人贏這回合，玩五回合。電腦在困難模式要聰明一點。」

`add-game` skill 會讓 agent 先定規格、產生骨架、寫純邏輯規則與電腦玩家、做手機版畫面、跑測試（測試會讓電腦把你的遊戲自動對打幾百局），
再開兩個分頁實際玩過。其他 agent（Codex、Cursor、Copilot、Gemini…）透過 [AGENTS.md](AGENTS.md) 走同一套流程。

### 自己寫

```bash
npm run new-game -- space-race --name "太空競賽" --en "Space Race"
```

`src/games/space-race/` 會出現一個能玩的小遊戲，而且已經出現在大廳。回合制遊戲的規則就是幾個純函式
（`setup / act / turn / result / bot`），平台負責在房主那邊執行、同步給所有人、讓電腦補位、重新整理後接續、顯示結算畫面。
教學：[docs/adding-a-game.md](docs/adding-a-game.md)，API：[docs/sdk.md](docs/sdk.md)。

### 搬舊的兩人遊戲

從兩人版小遊戲間來的遊戲，用 `@sdk/duo` 相容層，大多只要改 import：[docs/porting-2p-games.md](docs/porting-2p-games.md)。

## 原理

Server 只當郵差：知道有哪些房間、座位、誰是房主，訊息原封不動轉送。遊戲規則都在瀏覽器裡跑——用狀態引擎的遊戲在房主的瀏覽器裡執行，
再把狀態廣播出去（有秘密時每個人收到的是遮過的版本）。電腦玩家也在房主那邊跑。細節：[docs/architecture.md](docs/architecture.md)。

> 信任模型：給朋友玩的。沒有帳號、沒有防作弊；有心的人看得到網路封包。

## 目錄

```
server/            轉發 + 房間（rooms.ts）、通用儲存（storage.ts）——沒有任何遊戲程式
shared/            socket 協定型別與上限
src/sdk/           遊戲 import 的東西：房間訊息、狀態引擎、對時、UI 元件、i18n、音效
src/platform/      大廳、等待室、設定、戰績、連線
src/games/<id>/    一個遊戲一個資料夾 + registry.ts
templates/         `npm run new-game` 的起點
test/              每個遊戲的電腦自動對打、規則測試、server 整合測試
docs/              SDK、新增遊戲、架構、部署、移植兩人遊戲
.claude/skills/    給 AI agent 用的 add-game skill
```

## 授權

MIT。音效來自 [Kenney](https://kenney.nl)（CC0）。字型 Klee One、Noto Sans TC（SIL OFL，Google Fonts）。圖示 [Lucide](https://lucide.dev)（ISC）。
