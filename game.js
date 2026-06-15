// ============================================================
// 消消叠（Tile Stack）— 核心游戏逻辑 + 广告管理
// 广告模块：底部横幅 / 关卡间插屏 / 复活激励广告
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

  // ===== 广告模块 =====
  // AdSense publisher ID（审核通过后替换）
  const ADSENSE_ID = 'ca-pub-6156180492735752';

  const 广告 = {
    已初始化: false,
    横幅已加载: false,
    插屏计数器: 0,         // 每 N 关展示一次插屏

    // 初始化 AdSense
    初始化() {
      if (this.已初始化) return;
      this.已初始化 = true;
      // 加载底部横幅广告
      try {
        (adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {}
    },

    // 展示插屏广告（关卡间）
    展示插屏(回调) {
      this.插屏计数器++;
      if (this.插屏计数器 % 2 !== 0) { 回调(); return; } // 每2关播一次

      // 显示广告插屏页面
      页面.广告 = $('#screen-ad');
      $('#btn-skip-ad').style.display = 'none';
      显示页面('广告');

      // 加载插屏广告
      try {
        const adEl = document.querySelector('.ad-interstitial');
        if (adEl) {
          adEl.removeAttribute('data-ad-status');
          adEl.innerHTML = '';
          (adsbygoogle = window.adsbygoogle || []).push({});
        }
      } catch (e) {}

      // 5秒后可跳过
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

      // 跳过按钮
      $('#btn-skip-ad').onclick = () => {
        clearInterval(timer);
        回调();
      };
    },

    // 激励广告（复活用）
    展示激励广告(回调) {
      // 复用插屏展示，但有明确的奖励回调
      this.展示插屏(回调);
    },
  };

  // 关卡配置：类型数、层数、行列网格
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
    槽位: [],       // 字符串数组，最多 7 个
    撤销栈: [],
    剩余牌数: 0,
    游戏进行中: false,
    动画处理中: false,
  };

  // ===== 页面元素 =====
  const $ = (s) => document.querySelector(s);

  const 页面 = {};

  // 页面切换
  function 显示页面(名称) {
    Object.values(页面).forEach(p => p.classList.remove('active'));
    页面[名称].classList.add('active');
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

    // 总牌数 = 列 × 行 × 层，必须是 3 的倍数（三消规则）
    let 总牌数 = 配置.列 * 配置.行 * 配置.层数;
    总牌数 = Math.floor(总牌数 / 3) * 3;

    // 创建牌池：每种类型出现 3 的倍数次
    const 牌池 = [];
    let 类型序号 = 0;
    for (let i = 0; i < 总牌数 / 3; i++) {
      const 类型 = 可用类型[类型序号 % 可用类型.length];
      牌池.push(类型, 类型, 类型);
      类型序号++;
    }

    // Fisher-Yates 洗牌算法
    for (let i = 牌池.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [牌池[i], 牌池[j]] = [牌池[j], 牌池[i]];
    }

    // 牌面布局：层层叠加，每层微微偏移
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

    // 标记为已移除
    牌.已移除 = true;
    if (牌.元素) {
      牌.元素.classList.add('selected');
      setTimeout(() => { if (牌.元素) 牌.元素.remove(); }, 300);
    }

    // 保存到撤销栈
    状态.撤销栈.push({ 牌ID: 牌.id, 类型: 牌.类型 });

    // 智能插入：将同类型牌放在一起
    智能插入槽位(牌.类型);

    状态.剩余牌数--;
    $('#tiles-left').textContent = `Tiles: ${状态.剩余牌数}`;

    // 刷新遮盖状态
    setTimeout(() => 刷新遮盖显示(), 50);

    // 检测是否可消除
    setTimeout(() => 检测三消(), 100);
  }

  // ===== 智能插入 =====
  function 智能插入槽位(类型) {
    // 找到最后一个同类型牌的位置
    let 插入位置 = 状态.槽位.length; // 默认放末尾
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
    // 统计每种类型的数量
    const 计数 = {};
    状态.槽位.forEach(t => { 计数[t] = (计数[t] || 0) + 1; });

    for (const 类型 in 计数) {
      if (计数[类型] >= 3) {
        状态.动画处理中 = true;

        // 高亮要消除的 3 张牌
        let 消除数量 = 0;
        for (let i = 0; i < 状态.槽位.length && 消除数量 < 3; i++) {
          if (状态.槽位[i] === 类型) {
            const 元素 = $(`#slot-${i}`);
            if (元素) 元素.classList.add('match-highlight');
            消除数量++;
          }
        }

        // 动画完成后移除
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

    // 没有能消除的 — 检测失败或通关
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

    // 从槽位中移除
    for (let i = 状态.槽位.length - 1; i >= 0; i--) {
      if (状态.槽位[i] === 上一步.类型) {
        状态.槽位.splice(i, 1);
        break;
      }
    }

    // 恢复牌面
    const 牌 = 状态.牌堆.find(t => t.id === 上一步.牌ID);
    if (牌) {
      牌.已移除 = false;
      状态.剩余牌数++;
    }

    渲染牌堆();
    渲染槽位();
    $('#tiles-left').textContent = `Tiles: ${状态.剩余牌数}`;
  }

  // ===== 洗牌 =====
  function 洗牌() {
    if (!状态.游戏进行中) return;
    const 剩余 = 状态.牌堆.filter(t => !t.已移除);
    const 类型列表 = 剩余.map(t => t.类型);

    for (let i = 类型列表.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [类型列表[i], 类型列表[j]] = [类型列表[j], 类型列表[i]];
    }

    剩余.forEach((t, i) => { t.类型 = 类型列表[i]; });
    渲染牌堆();
  }

  // ===== 通关 =====
  function 通关() {
    状态.游戏进行中 = false;
    if (状态.当前关卡 === 0) {
      $('#win-msg').textContent = "Nice warmup! Ready for the real challenge?";
    } else {
      $('#win-msg').textContent = `Level ${状态.当前关卡 + 1} cleared!`;
    }
    显示页面('win');
    上报成绩(状态.当前关卡 + 1);
  }

  // ===== 失败 =====
  function 失败() {
    状态.游戏进行中 = false;
    显示页面('lose');
  }

  // ===== 开始关卡 =====
  function 开始关卡(关卡序号) {
    状态.当前关卡 = 关卡序号;
    状态.槽位 = [];
    状态.撤销栈 = [];
    状态.游戏进行中 = true;
    状态.动画处理中 = false;

    const { 牌堆, 总牌数 } = 生成关卡(关卡序号);
    状态.牌堆 = 牌堆;
    状态.剩余牌数 = 总牌数;

    const 配置 = 关卡配置[Math.min(关卡序号, 关卡配置.length - 1)];
    $('#level-label').textContent = 配置.标签;
    $('#tiles-left').textContent = `Tiles: ${状态.剩余牌数}`;

    显示页面('game');

    // 首次启动时初始化广告
    广告.初始化();

    requestAnimationFrame(() => {
      渲染牌堆();
      渲染槽位();
    });
  }

  // ===== 看广告复活 =====
  function 复活() {
    // 通过广告模块展示激励广告，看完后执行复活逻辑
    广告.展示激励广告(() => {
      状态.槽位.splice(-3, 3);
      状态.游戏进行中 = true;
      渲染槽位();
      显示页面('游戏');
      刷新遮盖显示();
    });

    // 调用后端广告验证接口
    if (API_BASE) {
      fetch(`${API_BASE}/verify-ad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adToken: 'demo', rewardType: 'revive' }),
      }).catch(() => {});
    }
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
    if (navigator.share) {
      navigator.share({ title: 'Tile Stack', text: 文案, url: window.location.href });
    } else {
      navigator.clipboard.writeText(文案).then(() => {
        alert('Link copied!');
      });
    }
  }

  // ===== 事件绑定 =====
  document.addEventListener('DOMContentLoaded', () => {
    页面.标题 = $('#screen-title');
    页面.说明 = $('#screen-how');
    页面.游戏 = $('#screen-game');
    页面.通关 = $('#screen-win');
    页面.失败 = $('#screen-lose');

    $('#btn-play').addEventListener('click', () => 开始关卡(0));
    $('#btn-how').addEventListener('click', () => 显示页面('说明'));
    $('#btn-how-back').addEventListener('click', () => 显示页面('标题'));
    // 下一关：先插屏广告再开始
    $('#btn-next-level').addEventListener('click', () => {
      广告.展示插屏(() => 开始关卡(状态.当前关卡 + 1));
    });
    $('#btn-retry').addEventListener('click', () => 开始关卡(状态.当前关卡));
    $('#btn-revive').addEventListener('click', 复活);
    $('#btn-undo').addEventListener('click', 撤销);
    $('#btn-shuffle').addEventListener('click', 洗牌);
    $('#btn-share-win').addEventListener('click', 分享成绩);
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
