import { describe, expect, it, vi } from 'vitest';
import { loadPart } from '../helpers/loadAppPart.js';

/* P2：ensureOrigin 的定位坐标必须过 wgsToGcj（WGS-84 → GCJ-02），
   否则路线起点偏 50-500m。真实源码执行 ensureOrigin，桩掉 geolocation。 */
const RAW = { latitude: 30.5928, longitude: 114.3055 };   // 武汉原始 WGS-84

const mod = loadPart({
  parts: ['var:myPos', 'var:PI', 'outOfChina', 'transformLat', 'transformLng', 'wgsToGcj', 'ensureOrigin'],
  stubs: {
    // 生产里这些裸数学函数来自 TMap SDK 的 with(math){} 作用域
    sin: Math.sin, cos: Math.cos, sqrt: Math.sqrt, abs: Math.abs, asin: Math.asin, atan2: Math.atan2,
    rpFrom: { value: '' },
    TMap: { LatLng: function (lat, lng) { this.lat = lat; this.lng = lng; } },
    toast: vi.fn(),
  },
  exports: ['myPos', 'wgsToGcj', 'ensureOrigin'],
});

describe('ensureOrigin 坐标转换（真实源码执行）', () => {
  it('定位成功 → myPos 是 GCJ-02（与原始 WGS-84 存在 50m-1km 级偏移）', async () => {
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok) => setTimeout(() => ok({ coords: RAW }), 0) },
    });
    await new Promise((done) => { mod.ensureOrigin(done); });
    expect(mod.myPos).toBeTruthy();
    // 武汉附近 GCJ-02 相对 WGS-84 偏移约 0.002-0.006°：未转换则差值为 0
    const dLng = Math.abs(mod.myPos.lng - RAW.longitude);
    const dLat = Math.abs(mod.myPos.lat - RAW.latitude);
    expect(dLng + dLat).toBeGreaterThan(0.0005);
    expect(dLng).toBeLessThan(0.01);
    expect(dLat).toBeLessThan(0.01);
  });

  it('wgsToGcj 本身可逆性 sanity（同一输入两次调用结果一致，且不是恒等映射）', () => {
    const g1 = mod.wgsToGcj(RAW.latitude, RAW.longitude);
    const g2 = mod.wgsToGcj(RAW.latitude, RAW.longitude);
    expect(g1).toEqual(g2);
    expect(g1.lng).not.toBe(RAW.longitude);
  });
});
