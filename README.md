# 消消叠 — 完整部署与上架指南

## 快速开始（5 分钟）

1. 用浏览器打开 `index.html` — 游戏即可运行
2. 本地测试就这么简单

---

## 一、前端部署（免费）

### 方案 A：GitHub Pages（推荐）

```bash
# 1. 创建一个 GitHub 仓库
# 2. 推送游戏文件
git init
git add .
git commit -m "消消叠 v1.0"
git remote add origin https://github.com/你的用户名/tile-stack-game.git
git push -u origin main

# 3. 去仓库 Settings → Pages → Source: main 分支 → / (root)
# 4. 游戏上线：https://你的用户名.github.io/tile-stack-game/
```

### 方案 B：Itch.io

1. 访问 https://itch.io/ → 注册（免费，无需企业资质）
2. 创建新项目 → 选择 "HTML" 游戏类型
3. 将游戏文件（index.html + style.css + game.js）打包成 zip → 上传
4. 设置 "此文件将在浏览器中运行"
5. 发布 — 立即上线

### 方案 C：Netlify Drop（最快）

1. 打开 https://app.netlify.com/drop
2. 把整个 `tile-stack-game` 文件夹拖进去
3. 完成 — 立刻获得一个在线地址（免费）

---

## 二、后端部署（Cloudflare Workers — 免费）

### 前置条件

- 已安装 Node.js
- 已有 Cloudflare 账号（免费注册）

### 步骤

```bash
# 1. 安装 Wrangler 命令行工具
npm install -g wrangler

# 2. 登录 Cloudflare
wrangler login

# 3. 创建 KV 命名空间
cd backend
wrangler kv:namespace create "SCORES"
# 复制输出中的 ID，粘贴到 wrangler.toml 中

# 4. 部署
wrangler deploy

# API 上线：https://tile-stack-api.你的子域名.workers.dev
```

### 连接游戏与后端

在 `game.js` 第 10 行设置你的 API 地址：

```javascript
const API_BASE = 'https://tile-stack-api.你的子域名.workers.dev';
```

设置后，游戏将自动：
- 上传成绩到云端排行榜
- 获取每日关卡配置
- 验证广告观看

---

## 三、广告接入（IAA 变现）

### 方案 A：Google AdSense（最简单 — 适用于网页）

**要求**：个人 Google 账号，初始设置不需要企业资质

**步骤**：
1. 访问 https://www.google.com/adsense/
2. 用你的游戏地址（GitHub Pages 或 Itch.io）申请
3. 等待审核通过（通常 1-7 天）
4. 将广告代码添加到 `index.html`：

```html
<!-- 自动广告（关卡间展示横幅广告） -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-你的ID"
  crossorigin="anonymous"></script>

<!-- 激励视频广告（用于复活） -->
<script>
  function showRewardedAd(onReward) {
    // Google AdSense 原生不支持激励视频
    // 需要使用 Google AdMob 或 Unity Ads / ironSource
  }
</script>
```

**收入**：约 $2-8 / 千次展示（视地区而定，欧美远高于亚洲）

### 方案 B：Google AdMob（适合移动端网页/打包应用）

**要求**：Google 账号 + 已验证地址（用于收款）

**更适合**：后续打包为移动端 App 时使用

### 方案 C：CrazyGames 广告 SDK（H5 游戏门户）

**要求**：游戏需先在 CrazyGames 上发布

**步骤**：
1. 提交游戏到 https://developer.crazygames.com/
2. 审核通过后，接入他们的广告 SDK：

```html
<script src="https://sdk.crazygames.com/crazygames-sdk-v1.js"></script>
<script>
  const sdk = CRAZYGAMES_SDK.getInstance();
  
  // 激励广告（用于复活）
  async function showRewardedAd(onReward) {
    sdk.requestAd('rewarded', 'revive', {
      adStarted: () => {},
      adFinished: () => onReward(),
      adError: () => {},
    });
  }

  // 横幅广告
  sdk.requestAd('banner', 'bottom-banner', {});
</script>
```

**分成比例**：CrazyGames 约 30%，你拿 70%

### 方案 D：Poki

与 CrazyGames 类似 — 提交游戏、接入 SDK、收入分成。

---

## 四、收款方式

### 网页广告（AdSense）

| 项目 | 详情 |
|------|------|
| 收款方式 | **银行电汇**或支票 |
| 最低提现额 | $100 |
| 税务信息 | 需要填写 W-8BEN 表格（非美国用户）— 个人身份即可，无需公司 |
| 付款周期 | 每月结算，次月约 21 日到账 |

### H5 门户广告（CrazyGames / Poki）

| 项目 | 详情 |
|------|------|
| 收款方式 | **PayPal** 或银行电汇 |
| 最低提现额 | 各平台不同（通常 $50-100） |
| 税务信息 | 在平台后台填写个人信息即可 |
| 付款周期 | Net-30 或 Net-60 |

### 推荐收款路径（最简方案）

```
个人银行卡（支持美元收款）
       ↑
   PayPal（中转）
       ↑
   CrazyGames / Itch.io 打款
       ↑
   游戏收入
```

**国内收款说明**：
1. 注册 PayPal 账号，绑定中国银行卡
2. 或者使用支持美元电汇的银行卡（大多数国内银行都支持）
3. 银行结汇（外汇结算）— 小额度无需特殊许可，标准流程

---

## 五、上架清单

| 序号 | 操作 | 费用 | 需要企业资质？ |
|------|------|------|---------------|
| 1 | 部署游戏到 GitHub Pages / Itch.io | 免费 | 不需要 |
| 2 | 提交到 CrazyGames | 免费 | 不需要 |
| 3 | 提交到 Poki | 免费 | 不需要 |
| 4 | 发到 Reddit（r/instant_games, r/webgames）| 免费 | 不需要 |
| 5 | 申请 Google AdSense | 免费 | 不需要 |
| 6 | 配置 PayPal 收款 | 免费 | 不需要 |
| 7 | 部署 Cloudflare Workers 后端 | 免费 | 不需要 |
| 8 | （后续）注册个体工商户 | ~300 元 | 可选，用于进入国内微信/抖音市场 |

---

## 六、免费推广渠道

### 零成本渠道

1. **Reddit**：发到 r/instant_games、r/webgames、r/HTML5 — 附上可玩链接
2. **Twitter/X**：带 #html5game #indiegame #puzzle 标签发推 — 配一段游戏录屏
3. **Discord**：加入 H5 游戏开发 Discord 群组，分享你的游戏
4. **Product Hunt**：上线当天发布 — 带来第一波流量高峰
5. **Hacker News**：发 "Show HN: 我做了一款叠消解谜小游戏"
6. **TikTok / 短视频**：录制游戏过程 + "你能过第二关吗？" 钩子文案
7. **知乎 / B 站**：写开发心得分享文章，末尾带游戏链接

### 游戏已内置的裂变机制

- 通关页分享按钮（Web Share API，一键分享到社交平台）
- "你能超过我吗？" 竞争性文案
- 每日关卡（让玩家每天回来挑战，增加分享频率）

### 进阶（有收入后）

- 用 TikTok/Reddit 投小额广告测试（$5-10/天）
- 提交更多 H5 门户：GameDistribution、GamePix、Playsaurus
- 添加推荐追踪（分享链接中带 UTM 参数，分析裂变效果）

---

## 七、项目文件结构

```
tile-stack-game/
├── index.html          # 游戏主页面
├── style.css           # 样式表
├── game.js             # 核心游戏逻辑
├── README.md           # 本文档
└── backend/
    ├── worker.js        # Cloudflare Workers API
    └── wrangler.toml    # Workers 配置文件
```
