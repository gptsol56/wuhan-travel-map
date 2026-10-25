import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadPart } from '../helpers/loadAppPart.js';

/* 收藏/心愿单（F1）：真实源码执行。
   toggleFav 依赖 toast / applyFilters / saveFavs / syncPopupFav / popupContent，
   全部桩掉，只测状态翻转与持久化边界。 */
const SPOTS = [
  { name: '黄鹤楼', cat: '地标', crowd: '高', zone: '武昌' },
  { name: '汉口江滩', cat: '江景', crowd: '中', zone: '汉口' },
];

function loadFavs() {
  const mod = loadPart({
    parts: ['var:FAVS_KEY', 'var:favs', 'loadFavs', 'saveFavs', 'isFav', 'toggleFav'],
    stubs: {
      SPOTS,
      lsSet: vi.fn(),
      toast: vi.fn(),
      applyFilters: vi.fn(),
      syncPopupFav: vi.fn(),
      popupContent: null,
      spotByName: () => SPOTS[0],
    },
    exports: ['FAVS_KEY', 'favs', 'isFav', 'toggleFav', 'saveFavs'],
  });
  return mod;
}

describe('收藏（F1）', () => {
  it('toggleFav：加 → 删 两个方向', () => {
    const mod = loadFavs();
    mod.favs = [];
    mod.toggleFav(SPOTS[0]);
    expect(mod.isFav(SPOTS[0])).toBe(true);
    mod.toggleFav(SPOTS[0]);
    expect(mod.isFav(SPOTS[0])).toBe(false);
  });

  it('isFav 只看名字精确匹配', () => {
    const mod = loadFavs();
    mod.favs = ['黄鹤楼'];
    expect(mod.isFav(SPOTS[0])).toBe(true);
    expect(mod.isFav(SPOTS[1])).toBe(false);
  });

  it('FAVS_KEY 独立于行程 prefs（高频小操作不污染行程存档）', () => {
    const mod = loadFavs();
    expect(mod.FAVS_KEY).toBe('wuhan_map_favs');
  });
});

describe('收藏进分享链接（fav 参数）', () => {
  const stubs = {
    SPOTS,
    lsSet: vi.fn(),
    toast: vi.fn(),
    saveFavs: vi.fn(),
    applyFilters: vi.fn(),
    syncAddButtons: vi.fn(),
    setRoutePanel: vi.fn(),
    renderWaypoints: vi.fn(),
    document: { getElementById: () => null },
    zoneF: '', metroF: '', resF: '', sortBy: '', waypoints: [], curMode: 'driving',
    RESERVE_TXT: { need_reserve: 1, need_ticket: 1, free: 1 },
    ZONE_OK_LIST: ['武昌', '汉口', '汉阳', '远郊'],
    SORT_OK_LIST: ['dist', 'heat'],
  };
  const mod = loadPart({
    parts: ['var:favs', 'buildShareHash', 'applyShareHash'],
    stubs,
    exports: ['favs', 'buildShareHash', 'applyShareHash'],
  });

  it('有收藏 → fav= 名单（逗号分隔，URL 编码）', () => {
    mod.favs = ['黄鹤楼', '汉口江滩'];
    expect(mod.buildShareHash()).toBe('#fav=' + encodeURIComponent('黄鹤楼,汉口江滩'));
  });

  it('伪造/过期名字被白名单滤掉，只导入仍存在的', () => {
    mod.favs = [];
    const touched = mod.applyShareHash('#fav=' + encodeURIComponent('黄鹤楼,故宫,不存在'));
    expect(touched).toBe(true);
    expect(mod.favs).toEqual(['黄鹤楼']);
  });

  it('名单全是假名字 → 整个参数忽略，不动现有收藏', () => {
    mod.favs = ['黄鹤楼'];
    expect(mod.applyShareHash('#fav=' + encodeURIComponent('故宫,圆明园'))).toBe(false);
    expect(mod.favs).toEqual(['黄鹤楼']);
  });
});
