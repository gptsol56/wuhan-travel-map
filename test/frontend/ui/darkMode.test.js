import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const CSS = fs.readFileSync(path.join(ROOT, 'src/style.css'), 'utf8');

const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

// 一段声明里最亮的白色不透明度。'.07' 必须按 0.07 算 —— 直接 Number('.07'.slice(1))
// 会得到 7，之前的版本就栽在这里。
const WHITE = /rgba\(255,\s*255,\s*255,\s*\.\s*(\d+)\)/g;
function maxWhiteAlpha(decls) {
  let max = 0;
  for (const m of decls.matchAll(WHITE)) max = Math.max(max, Number(`0.${m[1]}`));
  return max;
}

// 同一条选择器可能有多条规则，CSS 里后写的赢，所以取最后一条（实际生效的那条）。
function lastRule(re) {
  const all = [...CODE.matchAll(new RegExp(re.source, 'g'))];
  return all.length ? all[all.length - 1][1] : null;
}
const rule = (sel) => lastRule(new RegExp(`(?:^|[}\\n])\\s*${sel.replace(/[.\[\]]/g, '\\$&')}\\{([^}]*)\\}`));

// 夜间之前只改各组件自己的 background，从没管叠在上面的 ::before / ::after，
// 于是那些白色透明渐变原封不动盖在深色面板上 —— 用户报的
// 「夜间模式被白色透明渐变遮挡」。
describe('夜间模式：压在深色面板上的白色覆盖层都压下去了', () => {
  // 扁平材质重做（2026-11-04）后，这些大面积柔光 ::before 已被整体移除：
  // 表面改为纯色 + 细边 + 单投影，不再靠白色渐变伪元素做玻璃质感。
  // 所以现在的守卫是反向的 —— 谁也别把它们加回来。
  const highlights = [
    ['.measure-panel::before', '测距面板顶部 30%'],
    ['.p-head::before', '侧栏标题栏顶部 6px'],
    ['.pp-inner::before', '弹窗正中间横糊一条（旧 90deg bug）'],
  ];

  for (const [sel, why] of highlights) {
    it(`${sel} 已移除（原 ${why}，扁平材质不再要柔光层）`, () => {
      expect(rule(sel), `${sel} 又出现了，夜间会被它盖一层白`).toBeNull();
      expect(rule(`body.dark ${sel}`), `${sel} 的夜间覆盖也该一并删干净`).toBeNull();
    });
  }

  it('棱镜描边夜间整体压暗（--prism 令牌），不是一圈白边', () => {
    // mask 版 ::after 棱镜已全量换成双背景 border-box 技法（遮罩修复），
    // 压暗策略随之从「::after opacity .35 名单」迁到 body.dark 的 --prism 令牌。
    const m = CODE.match(/body\.dark\{[^}]*--prism:([^;}]+)/);
    expect(m, 'body.dark 未重定义 --prism').not.toBeNull();
    const peaks = [...m[1].matchAll(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\s*\)/g)].map(x => Number(x[1]));
    expect(peaks.length, '夜间 --prism 里没解析到 rgba').toBeGreaterThan(0);
    expect(Math.max(...peaks), '夜间棱镜最高透明度应 ≤ .4').toBeLessThanOrEqual(0.4);
  });

  it('夜间没有任何光斑 ::before 残留（hover 反馈全部交给 background）', () => {
    // 旧方案是给 .btn/.chip/.rp-mode/… 的 ::before 挂径向渐变，深色下还得单独调暗一次。
    // 整块光斑已移除，hover 统一落在 background 上，这里守住「别又被加回来」。
    const spotTiers = [...CODE.matchAll(/(?<!body\.dark\.violet )[^{}]*:where\([^)]*\)::before\{[^}]*radial-gradient\(circle/g)];
    expect(spotTiers, '又出现了跟随鼠标的光斑 ::before').toHaveLength(0);
  });

  it('浅色下的悬停反馈规则都还在（移除光斑不能连 hover 一起删）', () => {
    // 注意别用上面的 rule() 助手：它只转义 [.\[\]]，不转义 : 和 (，
    // 塞 :where(.a,.b):hover 这种选择器进去正则会直接编不过（返回 null，误报缺失）。
    for (const sel of [
      ':where\\(\\.rp-mode,\\.b-chip\\):hover',
      ':where\\(\\.zoom-btn,\\.zoom-help,\\.pp-close\\):hover',
    ]) {
      expect(CODE.match(new RegExp(sel + '\\{[^}]*background:')), `${sel} 缺失，小控件 hover 将完全无反馈`).not.toBeNull();
    }
  });
});

describe('夜间模式：白色 hover 底都有对应覆盖', () => {
  // 这些 hover 在浅色下是正常反馈，夜里不压就是一块突兀的白斑
  const hovers = [
    '.f-toggle:hover',
    '.mi-btn:hover',
    '.route-panel .rp-title button:hover',
    '.help-x:hover',
  ];

  for (const sel of hovers) {
    it(`${sel} 有夜间覆盖`, () => {
      expect(rule(`body.dark ${sel}`), `${sel} 没有夜间覆盖，深色下会闪一块白`).not.toBeNull();
    });
  }

  // 光斑调暗之后 hover 反馈就得靠背景补，否则夜里看不出有没有命中
  it('光斑调暗后补了低透明 hover 底', () => {
    expect(CSS).toMatch(/body\.dark :where\([^)]*\):hover\{background:rgba\(255,255,255,\.\d+\)\}/);
  });
});
