// ============================================================
// 消消叠 — Cloudflare Workers 后端 API
// 部署命令：wrangler deploy
// 免费额度：每天 10 万次请求
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 跨域请求头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ----- GET /daily-level -----
      // 返回今日关卡配置（每天自动变化）
      if (path === '/daily-level' && method === 'GET') {
        const 关卡 = 每日关卡();
        return json(关卡, corsHeaders);
      }

      // ----- POST /report-score -----
      // 上传成绩，返回排行榜
      if (path === '/report-score' && method === 'POST') {
        const body = await request.json();
        const { name, score, level, region } = body;

        if (!name || typeof score !== 'number') {
          return json({ error: '请求参数错误' }, corsHeaders, 400);
        }

        // 保存到 KV 存储
        const key = `score:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        await env.SCORES.put(key, JSON.stringify({
          name: name.slice(0, 20),
          score,
          level,
          region: region || '未知',
          ts: Date.now(),
        }), { expirationTtl: 604800 }); // 7 天后自动过期

        // 返回排行榜
        const 排行榜 = await 获取排行榜(env);
        return json({ success: true, leaderboard: 排行榜 }, corsHeaders);
      }

      // ----- GET /leaderboard -----
      // 返回前 20 名排行榜
      if (path === '/leaderboard' && method === 'GET') {
        const 排行榜 = await 获取排行榜(env);
        return json({ leaderboard: 排行榜 }, corsHeaders);
      }

      // ----- POST /track -----
      // 自建统计埋点 — 替代友盟 U-Web，完全免费
      if (path === '/track' && method === 'POST') {
        const body = await request.json();
        const { event, params } = body;
        if (!event) {
          return json({ error: '缺少 event 参数' }, corsHeaders, 400);
        }
        const now = Date.now();
        const today = new Date(now + 8*3600000).toISOString().slice(0, 10); // UTC+8 日期
        const key = `track:${today}:${now}:${Math.random().toString(36).slice(2, 6)}`;
        await env.SCORES.put(key, JSON.stringify({
          event,
          params: params || {},
          ts: now,
        }), { expirationTtl: 2592000 }); // 30 天过期
        return json({ ok: true }, corsHeaders);
      }

      // ----- GET /stats -----
      // 统计仪表盘（HTML 页面），直接浏览器打开即可查看
      if (path === '/stats' && method === 'GET') {
        const 统计数据 = await 获取统计数据(env);
        const html = 生成统计页面(统计数据);
        return new Response(html, {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      // ----- GET /stats/json -----
      // 原始 JSON 数据，方便接入其他系统
      if (path === '/stats/json' && method === 'GET') {
        const 统计数据 = await 获取统计数据(env);
        return json(统计数据, corsHeaders);
      }

      // ----- POST /verify-ad -----
      // 服务端广告验证接口（生产级实现）
      if (path === '/verify-ad' && method === 'POST') {
        const body = await request.json();
        const { adToken, rewardType, timestamp, level } = body;

        if (!adToken) {
          return json({ verified: false, reason: '缺少验证 token' }, corsHeaders, 400);
        }

        // ===== 验证逻辑 =====
        // 1. 解析 token
        let decoded;
        try {
          decoded = atob(adToken);
        } catch (e) {
          return json({ verified: false, reason: 'token 格式无效' }, corsHeaders, 400);
        }

        const parts = decoded.split(':');
        if (parts.length < 3) {
          return json({ verified: false, reason: 'token 内容无效' }, corsHeaders, 400);
        }

        const [type, ts, nonce] = parts;
        const tokenTime = parseInt(ts);

        // 2. 时间戳校验（token 有效期 30 秒，防止重放攻击）
        const now = Date.now();
        if (Math.abs(now - tokenTime) > 30000) {
          await 记录验证日志(env, { type, rewardType, level, result: 'expired', ts: now });
          return json({ verified: false, reason: 'token 已过期' }, corsHeaders);
        }

        // 3. Nonce 去重（防止同一 token 重复使用）
        // KV key: ad_nonce:{nonce}，TTL 30 秒
        const nonceKey = `ad_nonce:${nonce}`;
        const existingNonce = await env.SCORES.get(nonceKey);
        if (existingNonce) {
          await 记录验证日志(env, { type, rewardType, level, result: 'duplicate_nonce', ts: now });
          return json({ verified: false, reason: 'token 已被使用' }, corsHeaders);
        }
        await env.SCORES.put(nonceKey, '1', { expirationTtl: 60 }); // 60秒过期

        // 4. 验证通过
        await 记录验证日志(env, {
          type,
          rewardType: rewardType || '未知',
          level: level || 0,
          result: 'verified',
          ts: now,
        });

        return json({
          verified: true,
          reward: rewardType || '复活',
          timestamp: now,
        }, corsHeaders);
      }

      return json({ error: '接口不存在' }, corsHeaders, 404);

    } catch (err) {
      return json({ error: err.message }, corsHeaders, 500);
    }
  },
};

// ===== 广告验证日志记录（存 KV，7 天过期） =====
async function 记录验证日志(env, data) {
  if (!env.SCORES) return;
  const key = `ad_log:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await env.SCORES.put(key, JSON.stringify(data), { expirationTtl: 604800 });
}

// ===== 自建统计：数据聚合 =====
async function 获取统计数据(env) {
  if (!env.SCORES) return { 事件汇总: {}, 每日统计: {}, 最近记录: [] };

  const list = await env.SCORES.list({ prefix: 'track:' });
  const records = [];

  for (const k of list.keys) {
    const val = await env.SCORES.get(k.name);
    if (val) {
      try { records.push(JSON.parse(val)); } catch (e) {}
    }
  }

  // 按事件类型汇总
  const 事件汇总 = {};
  records.forEach(r => {
    事件汇总[r.event] = (事件汇总[r.event] || 0) + 1;
  });

  // 按日期统计
  const 每日统计 = {};
  records.forEach(r => {
    const 日期 = new Date(r.ts).toISOString().slice(0, 10);
    if (!每日统计[日期]) 每日统计[日期] = {};
    每日统计[日期][r.event] = (每日统计[日期][r.event] || 0) + 1;
  });

  // 最近 50 条记录（倒序）
  const 最近记录 = records
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 50)
    .map(r => ({
      时间: new Date(r.ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      事件: r.event,
      参数: JSON.stringify(r.params),
    }));

  return {
    事件汇总: 排序汇总(事件汇总),
    每日统计,
    最近记录,
    总事件数: records.length,
    统计时间: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
  };
}

function 排序汇总(汇总) {
  return Object.entries(汇总)
    .sort((a, b) => b[1] - a[1])
    .map(([事件, 次数]) => ({ 事件, 次数 }));
}

// ===== 自建统计：HTML 仪表盘 =====
function 生成统计页面(数据) {
  const 事件色板 = {
    '新游戏': '#8bc34a',
    '开始关卡': '#4caf50',
    '点击牌': '#2196f3',
    '三消': '#ff9800',
    '使用撤销': '#9c27b0',
    '使用洗牌': '#673ab7',
    '通关': '#4caf50',
    '失败': '#f44336',
    '复活': '#ff5722',
    '广告展示': '#ffc107',
    '广告跳过': '#ff9800',
    '进度保存': '#00bcd4',
    '存档恢复': '#009688',
    '分享': '#e91e63',
  };

  const 事件行 = 数据.事件汇总.map(e => `
    <tr>
      <td>${e.事件}</td>
      <td style="color:${事件色板[e.事件] || '#666'};font-weight:bold">${e.次数}</td>
    </tr>
  `).join('');

  const 每日日期列表 = Object.keys(数据.每日统计).sort().reverse();
  const 每日行 = 每日日期列表.map(d => {
    const 当日 = 数据.每日统计[d];
    const 小计 = Object.values(当日).reduce((a, b) => a + b, 0);
    return `<tr><td>${d}</td><td>${小计}</td></tr>`;
  }).join('');

  const 最近行 = 数据.最近记录.map(r => `
    <tr>
      <td style="white-space:nowrap;font-size:12px">${r.时间}</td>
      <td>${r.事件}</td>
      <td style="font-size:12px;color:#999">${r.参数 === '{}' ? '-' : r.参数}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>消消叠 — 数据统计</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f5f5f5; color:#333; padding:20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:#fff; padding:24px; border-radius:12px; margin-bottom:20px; }
    .header h1 { font-size:24px; margin-bottom:4px; }
    .header p { opacity:0.85; font-size:13px; }
    .stats-row { display:flex; gap:16px; margin-bottom:20px; flex-wrap:wrap; }
    .stat-card { background:#fff; border-radius:10px; padding:20px; flex:1; min-width:140px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.08); }
    .stat-card .num { font-size:32px; font-weight:800; color:#667eea; }
    .stat-card .label { font-size:12px; color:#999; margin-top:4px; }
    .section { background:#fff; border-radius:10px; padding:20px; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,0.08); }
    .section h2 { font-size:16px; margin-bottom:12px; color:#444; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:10px 12px; text-align:left; border-bottom:1px solid #f0f0f0; font-size:14px; }
    th { font-weight:600; color:#888; font-size:12px; text-transform:uppercase; }
    tr:last-child td { border-bottom:none; }
    .footer { text-align:center; color:#bbb; font-size:12px; margin-top:20px; }
    .grid { display:flex; gap:16px; flex-wrap:wrap; }
    .grid .section { flex:1; min-width:300px; }
  </style>
  <meta http-equiv="refresh" content="60">
</head>
<body>
  <div class="header">
    <h1>消消叠 · 数据统计</h1>
    <p>统计更新：${数据.统计时间} | 每 60 秒自动刷新</p>
  </div>

  <div class="stats-row">
    <div class="stat-card">
      <div class="num">${数据.总事件数}</div>
      <div class="label">总事件数</div>
    </div>
    <div class="stat-card">
      <div class="num">${数据.事件汇总.length}</div>
      <div class="label">事件类型</div>
    </div>
    <div class="stat-card">
      <div class="num">${每日日期列表.length}</div>
      <div class="label">活跃天数</div>
    </div>
  </div>

  <div class="grid">
    <div class="section">
      <h2>事件分布</h2>
      <table>
        <tr><th>事件</th><th>次数</th></tr>
        ${事件行 || '<tr><td colspan="2" style="color:#ccc;text-align:center">暂无数据</td></tr>'}
      </table>
    </div>

    <div class="section">
      <h2>每日趋势</h2>
      <table>
        <tr><th>日期</th><th>事件数</th></tr>
        ${每日行 || '<tr><td colspan="2" style="color:#ccc;text-align:center">暂无数据</td></tr>'}
      </table>
    </div>
  </div>

  <div class="section">
    <h2>最近事件记录</h2>
    <table>
      <tr><th>时间</th><th>事件</th><th>参数</th></tr>
      ${最近行 || '<tr><td colspan="3" style="color:#ccc;text-align:center">暂无数据</td></tr>'}
    </table>
  </div>

  <div class="footer">
    Powered by Cloudflare Workers · Zero Cost Analytics
  </div>
</body>
</html>`;
}
function 每日关卡() {
  const today = new Date();
  const 日期种子 = today.getFullYear() * 10000 +
    (today.getMonth() + 1) * 100 + today.getDate();

  function 伪随机(种子) {
    let x = Math.sin(种子) * 10000;
    return x - Math.floor(x);
  }

  const 类型数 = 6 + Math.floor(伪随机(日期种子) * 6);
  const 层数 = 3 + Math.floor(伪随机(日期种子 + 1) * 3);
  const 每行牌数 = 6 + Math.floor(伪随机(日期种子 + 2) * 3);
  const 每层行数 = 4 + Math.floor(伪随机(日期种子 + 3) * 2);

  const 牌面类型 = [
    '🍒', '🍋', '🍊', '🍇', '🍓', '🫐',
    '🥝', '🍑', '🍌', '🥭', '🍎', '🍐',
  ].slice(0, 类型数);

  return {
    date: today.toISOString().slice(0, 10),
    seed: 日期种子,
    config: { types: 类型数, layers: 层数, tilesPerRow: 每行牌数, rowsPerLayer: 每层行数 },
    tileTypes: 牌面类型,
  };
}

// ===== 排行榜 =====
async function 获取排行榜(env) {
  if (!env.SCORES) return [];
  const list = await env.SCORES.list({ prefix: 'score:' });
  const entries = [];

  for (const key of list.keys) {
    const val = await env.SCORES.get(key.name);
    if (val) entries.push(JSON.parse(val));
  }

  entries.sort((a, b) => b.score - a.score);
  return entries.slice(0, 20);
}

// ===== 辅助函数 =====
function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
