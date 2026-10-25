import { describe, expect, it, vi } from 'vitest';
import { loadPart } from '../helpers/loadAppPart.js';

/* 「现在适合去」榜单分区（F2）：真实源码执行 boardPartitions，
   openState / crowdForecast 桩掉（分区逻辑本身才是被测对象）。 */
const mk = (name, opts = {}) => Object.assign({ name, emoji: '📍', crowd: '中', hours: '09:00-17:00' }, opts);

function loadBoard() {
  return loadPart({
    parts: ['boardPartitions'],
    stubs: {
      SPOTS: [],
      openState: (s) => (s._os === undefined ? { cls: 'open' } : s._os),
      crowdForecast: (s) => [{ h: 1, lv: s._lv, now: true }],
      getSpotIndex: (s) => 0,
      esc: (t) => t,
    },
    exports: ['boardPartitions'],
  });
}

describe('boardPartitions（真实源码执行）', () => {
  it('低等级排前、中级其后；高等级进「避开」', () => {
    const { boardPartitions } = loadBoard();
    const list = [mk('中a', { _lv: 1 }), mk('低a', { _lv: 0 }), mk('高a', { _lv: 2 }), mk('低b', { _lv: 0 })];
    const p = boardPartitions(list);
    expect(p.good.map((s) => s.name)).toEqual(['低a', '低b', '中a']);   // 等级升序，同级按名
    expect(p.bad.map((s) => s.name)).toEqual(['高a']);
  });

  it('未开放 / 已闭馆不上「适合去」榜单', () => {
    const { boardPartitions } = loadBoard();
    const list = [
      mk('闭馆', { _os: { cls: 'closed' }, _lv: 0 }),
      mk('未开', { _os: { cls: 'off' }, _lv: 0 }),
      mk('开放', { _os: { cls: 'open' }, _lv: 0 }),
      mk('无时段', { _os: null, _lv: 1 }),       // 全天开放（openState 返回 null）也允许上榜
    ];
    const p = boardPartitions(list);
    expect(p.good.map((s) => s.name)).toEqual(['开放', '无时段']);
    expect(p.bad).toEqual([]);
  });

  it('高级别即使闭馆也不进「避开」（闭馆本身就是更强的避开信号）', () => {
    const { boardPartitions } = loadBoard();
    const p = boardPartitions([mk('高但闭', { _os: { cls: 'closed' }, _lv: 2 })]);
    expect(p.good).toEqual([]);
    expect(p.bad).toEqual([]);
  });
});
