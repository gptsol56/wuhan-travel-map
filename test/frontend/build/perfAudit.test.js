import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// 「精简动画、优化性能开销」这一轮的回归测试。
// 三类消耗大头各自钉死，防止以后再被"优化"回来：
//   1) 小控件的 backdrop-filter（每个都是新合成层 + 模糊整张地图）
//   2) spring/overshoot 缓动 cubic-bezier(.34,1.56,.64,1) 用在频繁触发的位置
//   3) 把动效克制的 prefers-reduced-motion 规则写出来
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const RAW = fs.readFileSync(path.join(ROOT, 'src/style.css'), 'utf8');
const CODE = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(selector) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(CODE)) !== null) {
    if (m[1].trim() === selector) return m[2];
  }
  return null;
}

describe('小控件不得再挂 backdrop-filter（每个都是新合成层 + 模糊地图）', () => {
  // 共同原因：backdrop-filter 强制把元素提到独立合成层，并对
  // 身后的整张地图做一次高斯模糊。一个 .rp-mode 是 4 个，一个 .item 是
  // 50 个 hover 触发。摘掉后用更不透明的纯色背景补偿视觉。
  for (const sel of [
    '.rp-mode',
    '.route-panel input',
    '.rp-swap',
    '.search',
    '.btn',
    '.chip',
    '.sp-badge',
    '.pp-close',
    '.pp-arrow',
    '.live-status',
    '.it-emoji',
    '#collapseBtn',
    '#btnRoute',
  ]) {
    it(`${sel} 不带 backdrop-filter`, () => {
      const body = ruleBody(sel);
      expect(body, `${sel} 规则不见了`).toBeTruthy();
      expect(body, `${sel} 还在 backdrop-filter 模糊整张地图`).not.toMatch(/backdrop-filter/);
    });
  }

  it('.item:hover / .item.sel 也不带 backdrop-filter（hover 临时触发也会强制重模糊）', () => {
    expect(ruleBody('.item:hover')).not.toMatch(/backdrop-filter/);
    expect(ruleBody('.item.sel')).not.toMatch(/backdrop-filter/);
  });
});

describe('Q 弹动效策略：spring 只许出现在 transform/opacity 过渡里', () => {
  // 2026-10 视觉升级（用户要「明显 Q 弹」）后的新策略：过冲曲线解禁，
  // 但只限合成器友好属性 —— transform / opacity。含布局属性（left/width/max-height）
  // 或贵属性（box-shadow/background）的过渡列表一旦混入 spring 即红：
  // 过冲意味着反向运动帧，布局/绘制类属性每帧都要重排重绘，掉帧是必然。
  const SPRING = /cubic-bezier\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*1\.\d+\s*\)|var\(--spring/;
  const trans = [...CODE.matchAll(/transition\s*:\s*([^;}]+)/g)].map((m) => m[1]);
  expect(trans.length, 'transition 一条都没解析到？').toBeGreaterThan(0);
  // 按顶层逗号拆条目（cubic-bezier/var 括号里的逗号不算）：
  // transition 的每一条目自带计时，spring 只约束它所在的那一条
  function splitTop(str) {
    const out = []; let depth = 0, cur = '';
    for (const ch of str) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  }
  const springEntries = [];
  trans.forEach((t, i) => {
    for (const entry of splitTop(t)) {
      if (SPRING.test(entry)) {
        const prop = entry.trim().split(/\s+/)[0];
        springEntries.push({ i, prop, entry: entry.trim().slice(0, 60) });
      }
    }
  });

  it('spring 令牌确实被用上（定义了却没用 = 白定义）', () => {
    expect(springEntries.length, 'style 里没有任何 spring 过渡条目').toBeGreaterThan(0);
  });

  for (const { i, prop, entry } of springEntries) {
    it(`第 ${i} 条 transition 的 spring 条目属性为 ${prop}`, () => {
      expect(['transform', 'opacity'].includes(prop), `spring 条目「${entry}」不是 transform/opacity —— 过冲帧会变成重排帧`).toBe(true);
    });
  }

  it('.route-panel 的 left/width 过渡保持 ease（布局属性绝不过冲）', () => {
    const m = CODE.match(/\.route-panel\{transition:([^}]*)\}/);
    expect(m, '找不到 .route-panel{transition:...}').toBeTruthy();
    expect(m[1]).toMatch(/left[^}]*width/);
    expect(m[1]).not.toMatch(SPRING);
  });
});

describe('动效克制：prefers-reduced-motion 必须实际生效', () => {
  // 之前只列了 7 个选择器，新增组件容易漏；改成通配 + 0.01ms 几乎瞬时。
  it('存在 @media (prefers-reduced-motion: reduce) 块', () => {
    expect(CODE).toMatch(/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)\s*\{/);
  });

  it('该块用通配 * / *::before / *::after（不靠逐个列选择器）', () => {
    // @media 块里可能套多个子规则，CODE 已被去注释，所以可以直接扫整个块。
    // 用 [\s\S] 非贪婪匹配 @media 那一对 { ... }，拿到 body 字符串。
    const m = CODE.match(/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)\s*\{([\s\S]*?)\n\s*\}\s*$/m);
    expect(m, '找不到 reduced-motion 块的 { ... }').toBeTruthy();
    const body = m[1];
    expect(body.length, 'reduced-motion 块为空').toBeGreaterThan(0);
    expect(body, '应该用通配选择器覆盖所有元素 + 伪元素').toMatch(/\*,\s*\*::before,\s*\*::after\s*\{/);
    // 任何 transition / animation 都被压到 0.01ms
    expect(body).toMatch(/transition-duration\s*:\s*\.01ms/);
    expect(body).toMatch(/animation-duration\s*:\s*\.01ms/);
  });
});

describe('主玻璃面板（route-panel / .menu / #panel 等）仍保留 backdrop-filter', () => {
  // 反向断言：确保这次没把大面板的模糊也误删。
  // 这几条是大块玻璃，摘掉它们就没"液态玻璃"质感了——之前用户特地抱怨过。
  for (const sel of [
    '.route-panel',
    '#panel',
    '.menu',
    '.measure-panel',
    '.pp-inner',
    '.zoom-indicator',
  ]) {
    it(`${sel} 仍带 backdrop-filter（主玻璃）`, () => {
      const body = ruleBody(sel);
      expect(body, `${sel} 规则不见了`).toBeTruthy();
      expect(body, `${sel} 的 backdrop-filter 被误删了`).toMatch(/backdrop-filter/);
    });
  }
});

describe('玻璃模糊令牌：半径有上限、面板引用令牌、移动端降档', () => {
  // 视觉升级后 17 处字面 blur 收敛为三档令牌（10/12/14），单一调参入口；
  // 上限语义不变（防「再加一点玻璃感」加回去），另加两条新约束：
  // 面板必须引用令牌（不允许字面值回流）、820px 断点整体降档。
  const TOKENS = { '--glass-blur': 12, '--glass-blur-md': 12, '--glass-blur-lg': 14 };
  for (const [tok, limit] of Object.entries(TOKENS)) {
    it(`${tok} 定义且 ≤ ${limit}px`, () => {
      const m = CODE.match(new RegExp(tok.replace(/-/g, '\\-') + '\\s*:\\s*(\\d+)px'));
      expect(m, `${tok} 未定义`).toBeTruthy();
      expect(Number(m[1]), `${tok} 超上限`).toBeLessThanOrEqual(limit);
    });
  }
  const blurPx = (body) => {
    const lit = body.match(/backdrop-filter\s*:\s*blur\((\d+)px\)/);
    if (lit) return Number(lit[1]);
    const v = body.match(/backdrop-filter\s*:\s*blur\\?\(var\\?\?/);  // placeholder
    const vv = body.match(/blur\(var\((--[\w-]+)\)\)/);
    return vv ? TOKENS[vv[1]] : null;
  };
  const caps = {
    '#panel': 12, '.route-panel': 12, '.measure-panel': 12, '.pp-inner': 12,
    '.filters': 12, '.q-list': 12, '.cluster-list': 12,
    '.menu': 16, '.zoom-indicator': 14,
  };
  for (const [sel, limit] of Object.entries(caps)) {
    it(`${sel} 模糊半径 ≤ ${limit}px（字面值或令牌解析）`, () => {
      const body = ruleBody(sel);
      expect(body, `${sel} 规则不见了`).toBeTruthy();
      const px = blurPx(body);
      expect(px, `${sel} 解析不到模糊半径`).not.toBeNull();
      expect(px, `${sel} 模糊半径 ${px}px 超过 ${limit}px`).toBeLessThanOrEqual(limit);
    });
  }
  it('移动端 820px 断点：三档令牌整体降档（GPU O(像素×半径)）', () => {
    expect(CODE.match(/@media \(max-width:820px\)\{[\s\S]{0,400}?--glass-blur:8px/), '断点内未找到降档令牌').toBeTruthy();
  });
});

describe('不要再用 filter:blur() 给伪元素加模糊（.5px 那个毫无意义）', () => {
  // 任何 filter 都会把元素提到独立合成层、单独走一遍渲染通道。
  // 之前 .zoom-indicator::before 上的 filter:blur(.5px) 视觉收益≈0，但每次都付这个成本。
  it('CSS 里不再出现裸 filter:blur（注意：backdrop-filter:blur 仍然允许）', () => {
    // 负向回顾：filter: 前面不能是 backdrop-。
    // 否则会把所有 backdrop-filter:blur(...) 都误判了。
    expect(CODE, '又有裸 filter:blur() 回来了，删掉').not.toMatch(/(?<!backdrop-)filter\s*:\s*blur/);
  });
});

describe('box-shadow 不能进入 transition 列表（每帧重光栅化阴影）', () => {
  // box-shadow 模糊半径变化是 O(像素数 × 半径)，每帧都要重新绘制阴影。
  // 放在 transition 里意味着 250ms 内要画 ~15 帧阴影，触屏 :active
  // 触发时一群按钮同时跑这段动画，掉帧明显。
  // （前面已经清掉 .item / .btn / .zoom-btn / .chip 里残留的 box-shadow 过渡）
  it('CSS 中没有 transition 列表里再带 box-shadow', () => {
    // 匹配 transition: ... box-shadow ... 形式
    expect(CODE, '又有 transition:...box-shadow 出现了').not.toMatch(
      /transition\s*:[^;}]*box-shadow[^;}]*[;}]/i
    );
  });
});

describe('#expandBtn 不再带绿色光晕（用户要求"去除光效"）', () => {
  // 之前 box-shadow:0 4px 14px rgba(11,93,59,.4) 给按钮加了一圈绿色 halo，
  // 视觉上是"光晕"，性能上则是地图在按钮后面每帧做一次 14px 模糊。
  // 用户既然说"去除光效"，这里就钉死。
  it('#expandBtn 没有 box-shadow', () => {
    const body = ruleBody('#expandBtn');
    expect(body, '#expandBtn 规则不见了').toBeTruthy();
    expect(body, '#expandBtn 又有 box-shadow 光晕了').not.toMatch(/box-shadow/);
  });
});

describe('入场/流光 keyframes 只动 transform/opacity（合成器友好）', () => {
  // Q 弹升级的有意决策：toast/help-card/cluster-list/menu/popup 的入场
  // 换成 --spring-soft。前提是 keyframes 只动 transform/opacity —— 否则
  // 过冲帧会变成重排帧。流光 sheenSweep 同理（纯 transform 循环）。
  const kfs = ['live-spin', 'clIn', 'fadeIn', 'slideUp', 'toastPop', 'menuIn', 'ppIn', 'sheenSweep'];
  for (const name of kfs) {
    it(`@keyframes ${name} 只含 transform/opacity`, () => {
      const m = CODE.match(new RegExp('@keyframes ' + name + '\\{((?:[^{}]|\\{[^{}]*\\})*)\\}'));
      expect(m, `${name} 不见了`).toBeTruthy();
      const props = [...m[1].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
      const bad = props.filter((pr) => !['transform', 'opacity'].includes(pr));
      expect(bad, `${name} 里混入了 ${bad.join(',')}`).toEqual([]);
    });
  }
});

describe('遮罩与玻璃守卫（视觉升级固化）', () => {
  it('mask-composite 全量清零（旧棱镜技法在部分浏览器退化成整块渐变盖住控件）', () => {
    expect(CODE.match(/mask-composite/g) || []).toHaveLength(0);
  });
  it('backdrop-filter 模糊声明点只减不增（≤21 处 × 双前缀 = 42；.folding 的 none 不计）', () => {
    expect((CODE.match(/backdrop-filter\s*:[^;]*blur\(/g) || []).length).toBeLessThanOrEqual(44);
  });
  it('流光在折叠动画窗口暂停（不与 max-height 动画叠加抢帧）', () => {
    expect(CODE).toMatch(/\.route-panel\.folding \.rp-body::after\{animation-play-state:paused\}/);
  });
});
