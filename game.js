// ============================================================
// 消消叠（Tile Stack）— 核心游戏逻辑 + 广告管理 + 埋点 + 存档 + BGM
// ============================================================

(function () {
  'use strict';

  // ===== 配置 =====
  const API_BASE = 'https://tile-stack-api.1070066278.workers.dev';

  // 牌面图案（emoji 通用图标，全球玩家都能看懂）
  const 牌面类型 = [
    '🍒', '🍋', '🍊', '🍇', '🍓', '🫐',
    '🥝', '🍑', '🍌', '🥭', '🍎', '🍐',
    '⭐', '🔥', '💧', '🌿', '💎', '🌙'
  ];

  const 最大槽位 = 7;

  // ===== 自建统计埋点模块（替代友盟，零成本） =====
  const 埋点 = {
    _队列: [],
    _发送中: false,
    _最大队列: 50,     // 队列上限，超出丢弃最早的
    _批量间隔: 3000,   // 每 3 秒批量发送一次
    _定时器: null,

    // 启动定时发送
    启动() {
      if (this._定时器) return;
      this._定时器 = setInterval(() => this._刷新队列(), this._批量间隔);
    },

    // 记录事件（放入队列）
    事件(事件名, 参数 = {}) {
      this._队列.push({ event: 事件名, params: 参数, ts: Date.now() });
      // 队列溢出时丢弃最早的
      if (this._队列.length > this._最大队列) {
        this._队列.shift();
      }
    },

    // 页面浏览事件
    页面浏览(页面名) {
      this.事件('页面浏览', { 页面: 页面名 });
    },

    // 批量发送到后台
    async _刷新队列() {
      if (this._队列.length === 0 || this._发送中) return;
      this._发送中 = true;
      const 批次 = this._队列.splice(0, this._队列.length);

      try {
        // 逐条发送（保持简单，不做批量接口）
        await Promise.all(批次.map(item =>
          fetch(`${API_BASE}/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: item.event, params: item.params }),
          }).catch(() => {}) // 网络失败静默忽略
        ));
      } catch (e) {}

      this._发送中 = false;
    },
  };

  // ===== BGM 模块 =====
  // 使用 Web Audio API 在线生成欢快的 8-bit 风格旋律
  const BGM = {
    _音频上下文: null,
    _主音量: null,
    _主旋律振荡器: null,
    _副旋律振荡器: null,
    _当前播放中: false,
    _旋律索引: 0,
    _旋律定时器: null,
    _用户已交互: false,  // 浏览器要求用户交互后才能播放音频

    // 欢快的 8-bit 风格旋律（音符频率 Hz + 时长 ms）
    // 使用五声音阶 C-D-E-G-A，轻快愉悦
    _旋律: [
      // ---- 小节 1 ----
      { 频率: 523, 时长: 200 },  // C5
      { 频率: 659, 时长: 200 },  // E5
      { 频率: 784, 时长: 200 },  // G5
      { 频率: 1047, 时长: 400 }, // C6
      { 频率: 0, 时长: 200 },    // 休止
      { 频率: 784, 时长: 200 },  // G5
      { 频率: 659, 时长: 200 },  // E5
      { 频率: 523, 时长: 200 },  // C5
      // ---- 小节 2 ----
      { 频率: 587, 时长: 200 },  // D5
      { 频率: 659, 时长: 200 },  // E5
      { 频率: 880, 时长: 200 },  // A5
      { 频率: 1175, 时长: 400 }, // D6
      { 频率: 0, 时长: 200 },
      { 频率: 880, 时长: 200 },  // A5
      { 频率: 784, 时长: 200 },  // G5
      { 频率: 659, 时长: 200 },  // E5
      // ---- 小节 3 ----
      { 频率: 784, 时长: 200 },  // G5
      { 频率: 1047, 时长: 200 }, // C6
      { 频率: 1319, 时长: 200 }, // E6
      { 频率: 1568, 时长: 400 }, // G6
      { 频率: 0, 时长: 200 },
      { 频率: 1319, 时长: 200 }, // E6
      { 频率: 1047, 时长: 200 }, // C6
      { 频率: 784, 时长: 200 },  // G5
      // ---- 小节 4（结尾） ----
      { 频率: 659, 时长: 300 },  // E5
      { 频率: 784, 时长: 300 },  // G5
      { 频率: 1047, 时长: 600 }, // C6
      { 频率: 0, 时长: 800 },    // 休止（循环分界）
    ],

    // bass 副旋律（低音垫）
    _bass旋律: [
      { 频率: 131, 时长: 800 },  // C3
      { 频率: 0, 时长: 800 },
      { 频率: 147, 时长: 800 },  // D3
      { 频率: 0, 时长: 800 },
      { 频率: 196, 时长: 800 },  // G3
      { 频率: 0, 时长: 800 },
      { 频率: 165, 时长: 800 },  // E3
      { 频率: 0, 时长: 800 },
    ],

    // 获取或创建 AudioContext
    获取上下文() {
      if (!this._音频上下文) {
        this._音频上下文 = new (window.AudioContext || window.webkitAudioContext)();
        this._主音量 = this._音频上下文.createGain();
        this._主音量.gain.value = 0.08; // 音量较小作为背景
        this._主音量.connect(this._音频上下文.destination);
      }
      // 恢复上下文（浏览器自动暂停策略）
      if (this._音频上下文.state === 'suspended') {
        this._音频上下文.resume();
      }
      return this._音频上下文;
    },

    // 播放单个音符
    播放音符(频率, 起始时间, 持续时长, 振荡器类型 = 'square') {
      if (频率 <= 0) return; // 休止符
      const ctx = this.获取上下文();
      const osc = ctx.createOscillator();
      const env = ctx.createGain();

      osc.type = 振荡器类型;
      osc.frequency.setValueAtTime(频率, 起始时间);

      // 包络线：快速进入，缓慢衰减，让音符更柔和
      env.gain.setValueAtTime(0, 起始时间);
      env.gain.linearRampToValueAtTime(0.12, 起始时间 + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, 起始时间 + 持续时长);

      osc.connect(env);
      env.connect(this._主音量);

      osc.start(起始时间);
      osc.stop(起始时间 + 持续时长 + 0.05);
    },

    // 开始播放循环旋律
    开始() {
      if (this._当前播放中) return;
      this._当前播放中 = true;

      const ctx = this.获取上下文();
      const 每拍时长 = 0.22; // 基础节拍时长（秒）

      // 先播放一段主旋律
      this._播放循环(ctx, 0, 每拍时长);

      // 同时启动 bass 线
      this._播放Bass(ctx, 0, 每拍时长);
    },

    _播放循环(ctx, 起始偏移, 每拍时长) {
      if (!this._当前播放中) return;

      const 旋律总时长 = this._旋律.reduce((sum, n) => sum + (n.时长 * 每拍时长 / 200), 0);

      this._旋律.forEach((音符) => {
        const 实际时长 = 音符.时长 * 每拍时长 / 200;
        this.播放音符(音符.频率, 起始偏移, 实际时长 * 0.85, 'square');
        this.播放音符(音符.频率 * 0.5, 起始偏移, 实际时长 * 0.3, 'triangle'); // 轻叠加
        起始偏移 += 实际时长;
      });

      // 循环播放
      this._旋律定时器 = setTimeout(() => {
        this._播放循环(ctx, 起始偏移, 每拍时长);
      }, 旋律总时长 * 1000);
    },

    _播放Bass(ctx, 起始偏移, 每拍时长) {
      if (!this._当前播放中) return;

      const bass总时长 = this._bass旋律.reduce((sum, n) => sum + (n.时长 * 每拍时长 / 200), 0);

      this._bass旋律.forEach((音符) => {
        const 实际时长 = 音符.时长 * 每拍时长 / 200;
        this.播放音符(音符.频率, 起始偏移, 实际时长 * 0.9, 'triangle');
        起始偏移 += 实际时长;
      });

      setTimeout(() => {
        this._播放Bass(ctx, 起始偏移, 每拍时长);
      }, bass总时长 * 1000);
    },

    // 停止播放
    停止() {
      this._当前播放中 = false;
      if (this._旋律定时器) {
        clearTimeout(this._旋律定时器);
        this._旋律定时器 = null;
      }
    },

    // 切换开关
    切换() {
      if (this._当前播放中) {
        this.停止();
        return false;
      } else {
        this._用户已交互 = true;
        this.开始();
        return true;
      }
    },

    // 检查并恢复状态
    同步开关UI(开启状态) {
      const btn = $('#btn-music');
      if (btn) {
        btn.textContent = 开启状态 ? '🔊' : '🔇';
      }
    },
  };

  // ===== 游戏存档模块 =====
  const 存档 = {
    存储键: 'tilestack_save',

    // 保存当前游戏进度
    保存() {
      if (!状态.游戏进行中) return false;

      const 数据 = {
        关卡: 状态.当前关卡,
        牌堆: 状态.牌堆.map(牌 => ({
          id: 牌.id,
          类型: 牌.类型,
          列: 牌.列,
          行: 牌.行,
          层: 牌.层,
          x: 牌.x,
          y: 牌.y,
          已移除: 牌.已移除,
        })),
        槽位: [...状态.槽位],
        撤销栈: [...状态.撤销栈],
        剩余牌数: 状态.剩余牌数,
        保存时间: Date.now(),
      };

      try {
        localStorage.setItem(this.存储键, JSON.stringify(数据));
        埋点.事件('进度保存', { 关卡: 状态.当前关卡 + 1 });
        return true;
      } catch (e) {
        return false;
      }
    },

    // 检查是否有存档
    有存档() {
      try {
        return !!localStorage.getItem(this.存储键);
      } catch (e) {
        return false;
      }
    },

    // 加载存档
    加载() {
      try {
        const 原始 = localStorage.getItem(this.存储键);
        if (!原始) return null;
        return JSON.parse(原始);
      } catch (e) {
        return null;
      }
    },

    // 删除存档
    删除() {
      try {
        localStorage.removeItem(this.存储键);
      } catch (e) {}
    },

    // 从存档恢复游戏
    恢复游戏() {
      const 数据 = this.加载();
      if (!数据) return false;

      状态.当前关卡 = 数据.关卡;
      状态.槽位 = 数据.槽位;
      状态.撤销栈 = 数据.撤销栈;
      状态.剩余牌数 = 数据.剩余牌数;
      状态.游戏进行中 = true;
      状态.动画处理中 = false;

      // 恢复牌堆
      状态.牌堆 = 数据.牌堆.map(p => ({
        id: p.id,
        类型: p.类型,
        列: p.列,
        行: p.行,
        层: p.层,
        x: p.x,
        y: p.y,
        已移除: p.已移除,
        元素: null,
      }));

      const 配置 = 关卡配置[Math.min(状态.当前关卡, 关卡配置.length - 1)];
      $('#level-label').textContent = 配置.标签;
      $('#tiles-left').textContent = `Tiles: ${状态.剩余牌数}`;

      显示页面('游戏');

      requestAnimationFrame(() => {
        渲染牌堆();
        渲染槽位();
      });

      埋点.事件('存档恢复', { 关卡: 状态.当前关卡 + 1 });
      return true;
    },
  };

  // ===== 广告模块 =====
  const ADSENSE_ID = 'ca-pub-6156180492735752';

  const 广告 = {
    已初始化: false,
    横幅已加载: false,
    插屏计数器: 0,

    初始化() {
      if (this.已初始化) return;
      this.已初始化 = true;
      try {
        (adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {}
    },

    展示插屏(回调) {
      this.插屏计数器++;
      if (this.插屏计数器 % 2 !== 0) { 回调(); return; }

      页面.广告 = $('#screen-ad');
      $('#btn-skip-ad').style.display = 'none';
      显示页面('广告');

      try {
        const adEl = document.querySelector('.ad-interstitial');
        if (adEl) {
          adEl.removeAttribute('data-ad-status');
          adEl.innerHTML = '';
          (adsbygoogle = window.adsbygoogle || []).push({});
        }
      } catch (e) {}

      let 倒计时 = 5;
      $('.ad-timer-text').textContent = `Skip in ${倒计时}s...`;
      const timer = setInterval(() => {
        倒计时--;
        if (倒计时 <= 0) {
          clearInterval(timer);
          $('.ad-timer-text').textContent = '';
          $('#btn-skip-ad').style.display = 'block';
        } else {
          $('.ad-timer-text').textContent = `Skip in ${倒计时}s...`;
        }
      }, 1000);

      埋点.事件('广告展示', { 类型: '插屏', 关卡差距: this.插屏计数器 });

      $('#btn-skip-ad').onclick = () => {
        clearInterval(timer);
        埋点.事件('广告跳过', { 类型: '插屏' });
        回调();
      };
    },

    展示激励广告(回调) {
      广告.展示插屏(回调);
      // ⚡ 服务端验证
      广告验证.发送验证('revive');
    },
  };

  // ===== 服务端广告验证模块 =====
  const 广告验证 = {
    验证密钥: 'tile-stack-secret-key-2026', // ⚠ 请替换为随机生成的强密钥

    // 生成验证 token
    生成Token(类型) {
      const 时间戳 = Date.now();
      const 随机数 = Math.random().toString(36).slice(2, 10);
      const payload = `${类型}:${时间戳}:${随机数}`;
      return btoa(payload);
    },

    // 发送验证请求到后端
    async 发送验证(类型) {
      if (!API_BASE) return false;
      try {
        const token = this.生成Token(类型);
        const resp = await fetch(`${API_BASE}/verify-ad`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adToken: token,
            rewardType: 类型,
            timestamp: Date.now(),
            level: 状态.当前关卡 + 1,
          }),
        });
        const data = await resp.json();
        return data.verified === true;
      } catch (e) {
        return false; // 验证失败不阻止游戏体验
      }
    },
  };

  // ===== 关卡配置 =====
  const 关卡配置 = [
    { 类型: 3, 层数: 2, 列: 5, 行: 3, 标签: 'LEVEL 1' },
    { 类型: 5, 层数: 3, 列: 6, 行: 4, 标签: 'LEVEL 2' },
    { 类型: 7, 层数: 4, 列: 7, 行: 4, 标签: 'LEVEL 3' },
    { 类型: 9, 层数: 4, 列: 8, 行: 5, 标签: 'LEVEL 4' },
    { 类型: 11, 层数: 5, 列: 8, 行: 5, 标签: 'LEVEL 5' },
  ];

  // ===== 游戏状态 =====
  let 状态 = {
    当前关卡: 0,
    牌堆: [],
    槽位: [],
    撤销栈: [],
    剩余牌数: 0,
    游戏进行中: false,
    动画处理中: false,
    点击次数: 0,
    消除次数: 0,
    撤销次数: 0,
    洗牌次数: 0,
  };

  // ===== 页面元素 =====
  const $ = (s) => document.querySelector(s);

  const 页面 = {};

  function 显示页面(名称) {
    Object.values(页面).forEach(p => p.classList.remove('active'));
    if (页面[名称]) {
      页面[名称].classList.add('active');
    }
    // 友盟页面浏览埋点
    const 页面名映射 = {
      '标题': 'title', '说明': 'how_to_play', '游戏': 'game',
      '通关': 'level_clear', '失败': 'game_over', '广告': 'ad_interstitial',
    };
    埋点.页面浏览(页面名映射[名称] || 名称);
  }

  // ===== 牌的大小计算 =====
  function 计算牌面尺寸() {
    const 区域 = $('#stack-area');
    if (!区域) return 48;
    const 宽 = 区域.clientWidth || 360;
    return 宽 < 380 ? 38 : (宽 < 500 ? 46 : 54);
  }

  // ===== 关卡生成 =====
  function 生成关卡(关卡序号) {
    const 配置 = 关卡配置[Math.min(关卡序号, 关卡配置.length - 1)];
    const 可用类型 = 牌面类型.slice(0, 配置.类型);

    let 总牌数 = 配置.列 * 配置.行 * 配置.层数;
    总牌数 = Math.floor(总牌数 / 3) * 3;

    const 牌池 = [];
    let 类型序号 = 0;
    for (let i = 0; i < 总牌数 / 3; i++) {
      const 类型 = 可用类型[类型序号 % 可用类型.length];
      牌池.push(类型, 类型, 类型);
      类型序号++;
    }

    for (let i = 牌池.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [牌池[i], 牌池[j]] = [牌池[j], 牌池[i]];
    }

    const 牌堆 = [];
    const 堆叠区域 = $('#stack-area');
    const 区域宽 = 堆叠区域.clientWidth || 360;
    const 区域高 = 堆叠区域.clientHeight || 400;
    const 牌大小 = 计算牌面尺寸();
    const 间距 = 3;
    const 层偏移X = 6;
    const 层偏移Y = 6;

    let 序号 = 0;
    for (let 层 = 0; 层 < 配置.层数; 层++) {
      const 网格宽 = 配置.列 * (牌大小 + 间距) - 间距;
      const 网格高 = 配置.行 * (牌大小 + 间距) - 间距;
      const 基准X = (区域宽 - 网格宽) / 2 + 层 * 层偏移X;
      const 基准Y = (区域高 - 网格高) / 2 + 层 * 层偏移Y - (配置.层数 - 1) * 层偏移Y / 2;

      for (let r = 0; r < 配置.行 && 序号 < 牌池.length; r++) {
        for (let c = 0; c < 配置.列 && 序号 < 牌池.length; c++) {
          牌堆.push({
            id: 序号,
            类型: 牌池[序号],
            列: c, 行: r, 层: 层,
            x: 基准X + c * (牌大小 + 间距),
            y: 基准Y + r * (牌大小 + 间距),
            已移除: false,
            元素: null,
          });
          序号++;
        }
      }
    }

    return { 牌堆, 总牌数 };
  }

  // ===== 遮盖判定 =====
  function 是否被遮盖(牌) {
    if (牌.已移除) return true;
    const 牌大小 = 计算牌面尺寸();
    for (const 其他 of 状态.牌堆) {
      if (其他.已移除 || 其他.id === 牌.id) continue;
      if (其他.层 <= 牌.层) continue;
      if (Math.abs(牌.x - 其他.x) < 牌大小 * 0.75 &&
          Math.abs(牌.y - 其他.y) < 牌大小 * 0.75) {
        return true;
      }
    }
    return false;
  }

  function 刷新遮盖显示() {
    状态.牌堆.forEach(牌 => {
      if (牌.元素 && !牌.已移除) {
        牌.元素.classList.toggle('blocked', 是否被遮盖(牌));
      }
    });
  }

  // ===== 渲染牌堆 =====
  function 渲染牌堆() {
    const 区域 = $('#stack-area');
    if (!区域) return;
    区域.innerHTML = '';

    const 排序后 = [...状态.牌堆]
      .filter(牌 => !牌.已移除)
      .sort((a, b) => a.层 - b.层);

    const 牌大小 = 计算牌面尺寸();

    排序后.forEach(牌 => {
      const 元素 = document.createElement('div');
      元素.className = 'tile' + (是否被遮盖(牌) ? ' blocked' : '');
      元素.textContent = 牌.类型;
      元素.style.left = 牌.x + 'px';
      元素.style.top = 牌.y + 'px';
      元素.style.width = 牌大小 + 'px';
      元素.style.height = 牌大小 + 'px';
      元素.style.fontSize = (牌大小 * 0.52) + 'px';
      元素.style.zIndex = 牌.层 * 10 + 1;

      元素.addEventListener('click', () => 点击牌(牌));
      区域.appendChild(元素);
      牌.元素 = 元素;
    });
  }

  // ===== 渲染槽位 =====
  function 渲染槽位() {
    for (let i = 0; i < 最大槽位; i++) {
      const 元素 = $(`#slot-${i}`);
      if (!元素) continue;
      if (i < 状态.槽位.length) {
        元素.textContent = 状态.槽位[i];
        元素.classList.add('filled');
      } else {
        元素.textContent = '';
        元素.classList.remove('filled');
      }
    }
  }

  // ===== 点击牌的逻辑 =====
  function 点击牌(牌) {
    if (!状态.游戏进行中 || 状态.动画处理中) return;
    if (牌.已移除) return;
    if (是否被遮盖(牌)) return;
    if (状态.槽位.length >= 最大槽位) return;

    牌.已移除 = true;
    if (牌.元素) {
      牌.元素.classList.add('selected');
      setTimeout(() => { if (牌.元素) 牌.元素.remove(); }, 300);
    }

    状态.撤销栈.push({ 牌ID: 牌.id, 类型: 牌.类型 });
    状态.点击次数++;

    智能插入槽位(牌.类型);

    状态.剩余牌数--;
    $('#tiles-left').textContent = `Tiles: ${状态.剩余牌数}`;

    埋点.事件('点击牌', { 类型: 牌.类型, 层级: 牌.层 });

    setTimeout(() => 刷新遮盖显示(), 50);
    setTimeout(() => 检测三消(), 100);
  }

  // ===== 智能插入 =====
  function 智能插入槽位(类型) {
    let 插入位置 = 状态.槽位.length;
    for (let i = 状态.槽位.length - 1; i >= 0; i--) {
      if (状态.槽位[i] === 类型) {
        插入位置 = i + 1;
        break;
      }
    }
    状态.槽位.splice(插入位置, 0, 类型);
    渲染槽位();
  }

  // ===== 三消检测 =====
  function 检测三消() {
    const 计数 = {};
    状态.槽位.forEach(t => { 计数[t] = (计数[t] || 0) + 1; });

    for (const 类型 in 计数) {
      if (计数[类型] >= 3) {
        状态.动画处理中 = true;
        状态.消除次数++;
        埋点.事件('三消', { 消除类型: 类型, 总消除: 状态.消除次数 });

        let 消除数量 = 0;
        for (let i = 0; i < 状态.槽位.length && 消除数量 < 3; i++) {
          if (状态.槽位[i] === 类型) {
            const 元素 = $(`#slot-${i}`);
            if (元素) 元素.classList.add('match-highlight');
            消除数量++;
          }
        }

        setTimeout(() => {
          let 已移除 = 0;
          状态.槽位 = 状态.槽位.filter(t => {
            if (t === 类型 && 已移除 < 3) { 已移除++; return false; }
            return true;
          });
          渲染槽位();
          状态.动画处理中 = false;

          if (状态.剩余牌数 <= 0) {
            setTimeout(() => 通关(), 300);
          } else if (状态.槽位.length >= 最大槽位) {
            setTimeout(() => 失败(), 300);
          }
        }, 500);
        return;
      }
    }

    if (状态.槽位.length >= 最大槽位) {
      setTimeout(() => 失败(), 300);
    }
    if (状态.剩余牌数 <= 0) {
      setTimeout(() => 通关(), 300);
    }
  }

  // ===== 撤销操作 =====
  function 撤销() {
    if (状态.撤销栈.length === 0 || !状态.游戏进行中) return;
    const 上一步 = 状态.撤销栈.pop();
    状态.撤销次数++;

    for (let i = 状态.槽位.length - 1; i >= 0; i--) {
      if (状态.槽位[i] === 上一步.类型) {
        状态.槽位.splice(i, 1);
        break;
      }
    }

    const 牌 = 状态.牌堆.find(t => t.id === 上一步.牌ID);
    if (牌) {
      牌.已移除 = false;
      状态.剩余牌数++;
    }

    渲染牌堆();
    渲染槽位();
    $('#tiles-left').textContent = `Tiles: ${状态.剩余牌数}`;
    埋点.事件('使用撤销', { 剩余撤销: 状态.撤销栈.length });
  }

  // ===== 洗牌 =====
  function 洗牌() {
    if (!状态.游戏进行中) return;
    const 剩余 = 状态.牌堆.filter(t => !t.已移除);
    const 类型列表 = 剩余.map(t => t.类型);
    状态.洗牌次数++;

    for (let i = 类型列表.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [类型列表[i], 类型列表[j]] = [类型列表[j], 类型列表[i]];
    }

    剩余.forEach((t, i) => { t.类型 = 类型列表[i]; });
    渲染牌堆();
    埋点.事件('使用洗牌', { 洗牌次数: 状态.洗牌次数 });
  }

  // ===== 退出并保存 =====
  function 退出并保存() {
    if (!状态.游戏进行中) return;

    const 成功 = 存档.保存();
    if (成功) {
      状态.游戏进行中 = false;
      显示页面('标题');
      // 更新标题页显示"继续游戏"按钮
      更新继续按钮();
    }
  }

  function 更新继续按钮() {
    const 继续按钮 = $('#btn-continue');
    if (继续按钮) {
      继续按钮.style.display = 存档.有存档() ? 'block' : 'none';
    }
  }

  function 继续游戏() {
    const 恢复了 = 存档.恢复游戏();
    if (!恢复了) {
      // 存档可能损坏，清除并从头开始
      存档.删除();
      更新继续按钮();
    }
  }

  // ===== 通关 =====
  function 通关() {
    状态.游戏进行中 = false;
    存档.删除(); // 通关后删除存档

    if (状态.当前关卡 === 0) {
      $('#win-msg').textContent = "Nice warmup! Ready for the real challenge?";
    } else {
      $('#win-msg').textContent = `Level ${状态.当前关卡 + 1} cleared!`;
    }
    显示页面('通关');
    上报成绩(状态.当前关卡 + 1);

    埋点.事件('通关', {
      关卡: 状态.当前关卡 + 1,
      点击次数: 状态.点击次数,
      消除次数: 状态.消除次数,
      撤销次数: 状态.撤销次数,
      洗牌次数: 状态.洗牌次数,
    });
  }

  // ===== 失败 =====
  function 失败() {
    状态.游戏进行中 = false;
    显示页面('失败');
    埋点.事件('失败', {
      关卡: 状态.当前关卡 + 1,
      剩余牌数: 状态.剩余牌数,
      槽位数: 状态.槽位.length,
    });
  }

  // ===== 开始关卡 =====
  function 开始关卡(关卡序号) {
    状态.当前关卡 = 关卡序号;
    状态.槽位 = [];
    状态.撤销栈 = [];
    状态.游戏进行中 = true;
    状态.动画处理中 = false;
    状态.点击次数 = 0;
    状态.消除次数 = 0;
    状态.撤销次数 = 0;
    状态.洗牌次数 = 0;

    const { 牌堆, 总牌数 } = 生成关卡(关卡序号);
    状态.牌堆 = 牌堆;
    状态.剩余牌数 = 总牌数;

    const 配置 = 关卡配置[Math.min(关卡序号, 关卡配置.length - 1)];
    $('#level-label').textContent = 配置.标签;
    $('#tiles-left').textContent = `Tiles: ${状态.剩余牌数}`;

    显示页面('游戏');
    广告.初始化();

    埋点.事件('开始关卡', { 关卡: 关卡序号 + 1, 牌数: 总牌数 });

    requestAnimationFrame(() => {
      渲染牌堆();
      渲染槽位();
    });
  }

  // ===== 看广告复活 =====
  function 复活() {
    广告.展示激励广告(() => {
      状态.槽位.splice(-3, 3);
      状态.游戏进行中 = true;
      渲染槽位();
      显示页面('游戏');
      刷新遮盖显示();
      埋点.事件('复活', { 关卡: 状态.当前关卡 + 1 });
    });
  }

  // ===== 上报成绩 =====
  async function 上报成绩(分数) {
    if (!API_BASE) return;
    try {
      const 昵称 = localStorage.getItem('tilestack_name') || 'Anonymous';
      await fetch(`${API_BASE}/report-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 昵称,
          score: 分数,
          level: 状态.当前关卡,
          region: navigator.language,
        }),
      });
    } catch (e) { /* 静默失败 */ }
  }

  // ===== 分享成绩 =====
  function 分享成绩() {
    const 文案 = `I cleared Level ${状态.当前关卡 + 1} in Tile Stack! Can you beat me? ${window.location.href}`;
    埋点.事件('分享', { 关卡: 状态.当前关卡 + 1 });

    if (navigator.share) {
      navigator.share({ title: 'Tile Stack', text: 文案, url: window.location.href });
    } else {
      navigator.clipboard.writeText(文案).then(() => {
        alert('Link copied!');
      });
    }
  }

  // ===== BGM 开关按钮 =====
  function 切换BGM() {
    const 开启状态 = BGM.切换();
    BGM.同步开关UI(开启状态);

    // 持久化 BGM 偏好
    try {
      localStorage.setItem('tilestack_bgm', 开启状态 ? 'on' : 'off');
    } catch (e) {}

    // 如果开启了，标记用户已交互（满足浏览器音频策略）
    if (开启状态) {
      BGM._用户已交互 = true;
    }
  }

  // ===== 初始化 =====
  function 初始化() {
    // 启动统计埋点（定时批量发送，替代友盟）
    埋点.启动();

    // 恢复 BGM 偏好
    const bgm偏好 = localStorage.getItem('tilestack_bgm');
    BGM.同步开关UI(bgm偏好 === 'on');

    // 更新继续按钮状态
    更新继续按钮();
  }

  // ===== 事件绑定 =====
  document.addEventListener('DOMContentLoaded', () => {
    页面.标题 = $('#screen-title');
    页面.说明 = $('#screen-how');
    页面.游戏 = $('#screen-game');
    页面.通关 = $('#screen-win');
    页面.失败 = $('#screen-lose');

    // 标题页
    $('#btn-play').addEventListener('click', () => {
      // 新游戏时删除旧存档
      存档.删除();
      更新继续按钮();
      埋点.事件('新游戏');
      开始关卡(0);
    });
    $('#btn-how').addEventListener('click', () => 显示页面('说明'));
    $('#btn-how-back').addEventListener('click', () => 显示页面('标题'));
    $('#btn-continue').addEventListener('click', 继续游戏);

    // 游戏页
    $('#btn-next-level').addEventListener('click', () => {
      广告.展示插屏(() => 开始关卡(状态.当前关卡 + 1));
    });
    $('#btn-retry').addEventListener('click', () => 开始关卡(状态.当前关卡));
    $('#btn-revive').addEventListener('click', 复活);
    $('#btn-undo').addEventListener('click', 撤销);
    $('#btn-shuffle').addEventListener('click', 洗牌);
    $('#btn-save-exit').addEventListener('click', 退出并保存);
    $('#btn-music').addEventListener('click', 切换BGM);

    // 通关 / 分享
    $('#btn-share-win').addEventListener('click', 分享成绩);

    // 用户首次交互时尝试恢复 BGM（满足浏览器自动播放策略）
    const 尝试播放BGM = () => {
      if (bgm偏好 === 'on' && !BGM._当前播放中) {
        BGM.开始();
        BGM.同步开关UI(true);
      }
      // 只执行一次
      document.removeEventListener('click', 尝试播放BGM);
      document.removeEventListener('touchstart', 尝试播放BGM);
    };
    document.addEventListener('click', 尝试播放BGM);
    document.addEventListener('touchstart', 尝试播放BGM);

    初始化();
  });

  // 窗口大小变化时重新渲染
  let 延迟定时器;
  window.addEventListener('resize', () => {
    clearTimeout(延迟定时器);
    延迟定时器 = setTimeout(() => {
      if (状态.游戏进行中) 渲染牌堆();
    }, 200);
  });

})();
