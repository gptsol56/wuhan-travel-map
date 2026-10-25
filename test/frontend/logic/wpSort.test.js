import { describe, expect, it } from 'vitest';
import { loadPart } from '../helpers/loadAppPart.js';

/* 行程智能排序（F3）：合成坐标验证贪心 + 2-opt。
   布局：A(0,0) B(0,1) C(0,2) D(1,0) E(1,1) F(1,2) —— 2 行 3 列网格。
   从 A 出发的最优路径是沿网格走（如 A→B→C→F→E→D），任何大折返都更长。 */
const GRID = [
  { name: 'A', lat: 30.0000, lng: 114.0000 },
  { name: 'B', lat: 30.0000, lng: 114.0010 },
  { name: 'C', lat: 30.0000, lng: 114.0020 },
  { name: 'D', lat: 30.0010, lng: 114.0000 },
  { name: 'E', lat: 30.0010, lng: 114.0010 },
  { name: 'F', lat: 30.0010, lng: 114.0020 },
];

const mod = loadPart({
  parts: ['distMeters', 'sortWaypointsNearest'],
  stubs: {},
  exports: ['sortWaypointsNearest'],
});
const sort = mod.sortWaypointsNearest;

const routeLen = (names) => {
  let d = 0;
  for (let i = 1; i < names.length; i++) {
    const a = GRID.find((s) => s.name === names[i - 1]);
    const b = GRID.find((s) => s.name === names[i]);
    d += Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((30 * Math.PI) / 180));
  }
  return d;
};

describe('sortWaypointsNearest（真实源码执行）', () => {
  it('首点保持不动（起点语义）', () => {
    expect(sort(['D', 'A', 'B', 'C', 'E', 'F'], GRID)[0]).toBe('D');
  });

  it('乱序输入 → 总路程不劣于输入（贪心+2-opt 有效）', () => {
    const messy = ['C', 'A', 'F', 'B', 'E', 'D'];
    const out = sort(messy, GRID);
    expect(out).toHaveLength(6);
    expect(new Set(out).size).toBe(6);                    // 不丢站不重站
    expect(routeLen(out)).toBeLessThanOrEqual(routeLen(messy) + 1e-9);
  });

  it('网格布局给出就近顺序（无大折返）', () => {
    const out = sort(['A', 'F', 'C', 'E', 'B', 'D'], GRID);
    // 最优巡回（A 出发）长度 = 4 条短边 + 1 条长边 ≈ 4*0.001 + 0.001*cos... 用上界锁：不超过最优的 1.02 倍
    const optimal = 4 * 0.0010 + 0.0010 * Math.cos((30 * Math.PI) / 180);
    expect(routeLen(out)).toBeLessThanOrEqual(optimal * 1.02 + 1e-9);
  });

  it('不足 3 站原样返回（浅拷贝，不改入参）', () => {
    const src = ['A', 'B'];
    const out = sort(src, GRID);
    expect(out).toEqual(['A', 'B']);
    expect(out).not.toBe(src);
  });

  it('失效站名（不在 spots 里）被剔除', () => {
    const out = sort(['A', '故宫', 'B', 'C'], GRID);
    expect(out).toEqual(['A', 'B', 'C']);
  });
});
