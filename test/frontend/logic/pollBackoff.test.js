import { describe, expect, it } from 'vitest';
import { loadPart } from '../helpers/loadAppPart.js';

/* 轮询退避（P1）：nextPollDelay 纯函数 —— 10min 起步，失败翻倍，2h 封顶。 */
const mod = loadPart({
  parts: ['var:POLL_BASE', 'nextPollDelay'],
  stubs: {},
  exports: ['nextPollDelay', 'POLL_BASE', 'POLL_CAP'],
});

const MIN = 60 * 1000;

describe('nextPollDelay（真实源码执行）', () => {
  it('无失败 → 基频 10 分钟', () => {
    expect(mod.nextPollDelay(0)).toBe(10 * MIN);
  });

  it('失败指数退避：10 → 20 → 40 → 80 分钟', () => {
    expect(mod.nextPollDelay(1)).toBe(20 * MIN);
    expect(mod.nextPollDelay(2)).toBe(40 * MIN);
    expect(mod.nextPollDelay(3)).toBe(80 * MIN);
  });

  it('封顶 2 小时，不再增长', () => {
    expect(mod.nextPollDelay(4)).toBe(120 * MIN);
    expect(mod.nextPollDelay(10)).toBe(120 * MIN);
    expect(mod.nextPollDelay(100)).toBe(120 * MIN);
  });

  it('常量本身钉死（10min 基频 / 2h 封顶的对外契约）', () => {
    expect(mod.POLL_BASE).toBe(10 * MIN);
    expect(mod.POLL_CAP).toBe(120 * MIN);
  });
});
