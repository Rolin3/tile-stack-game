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
      // 请求体：{ name: 玩家名, score: 分数, level: 关卡, region: 地区 }
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

      // ----- POST /verify-ad -----
      // 广告观看验证接口（占位）
      // 生产环境需接入广告平台的服务端回调验证
      if (path === '/verify-ad' && method === 'POST') {
        const body = await request.json();
        // TODO: 接入 Google AdMob 或 Unity Ads 的服务端验证
        return json({
          verified: true,
          reward: body.rewardType || '复活',
        }, corsHeaders);
      }

      return json({ error: '接口不存在' }, corsHeaders, 404);

    } catch (err) {
      return json({ error: err.message }, corsHeaders, 500);
    }
  },
};

// ===== 每日关卡生成 =====
// 根据当天日期生成确定性的关卡配置
function 每日关卡() {
  const today = new Date();
  const 日期种子 = today.getFullYear() * 10000 +
    (today.getMonth() + 1) * 100 + today.getDate();

  function 伪随机(种子) {
    let x = Math.sin(种子) * 10000;
    return x - Math.floor(x);
  }

  const 类型数 = 6 + Math.floor(伪随机(日期种子) * 6);     // 6-11 种
  const 层数 = 3 + Math.floor(伪随机(日期种子 + 1) * 3);    // 3-5 层
  const 每行牌数 = 6 + Math.floor(伪随机(日期种子 + 2) * 3); // 6-8
  const 每层行数 = 4 + Math.floor(伪随机(日期种子 + 3) * 2); // 4-5

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
  const list = await env.SCORES.list();
  const entries = [];

  for (const key of list.keys) {
    const val = await env.SCORES.get(key.name);
    if (val) entries.push(JSON.parse(val));
  }

  // 按分数降序排列，取前 20 名
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
