import { sys } from 'cc';

const COINS_KEY = 'linkup_v1_coins';
const CURRENT_LEVEL_KEY = 'linkup_v1_current_level';
const PURCHASED_SHOP_KEYS = 'linkup_v1_purchased_shop_keys';
const PROPS_KEY = 'linkup_v1_props';
/** 赠送方案版本；变更后会再次合并补全默认方块 */
const SHOP_DEFAULTS_KEY = 'linkup_v1_shop_defaults_ver';
const SHOP_DEFAULTS_VER = 'gift35-v1';

export type PurchaseResult = 'success' | 'already_owned' | 'insufficient_coins' | 'invalid';

export const PROP_PRICE = 50;
export const BLOCK_PRICE = 10;

export type PropKind = 'hint' | 'refresh' | 'eliminate';

type PropCounts = Record<PropKind, number>;

/**
 * 用 globalThis 存缓存，避免微信分包/多份打包模块各自一份 let 缓存，
 * 出现「刚赠送写入 A 实例、读取却打到 B 实例空缓存」.
 */
type PurchasedCacheHost = { __linkupPurchasedShopKeys?: string[] | null };
const _cacheHost = globalThis as unknown as PurchasedCacheHost;

function readJson<T>(key: string, fallback: T): T {
    try {
        const s = sys.localStorage.getItem(key) as unknown;
        if (s == null || s === '') return fallback;
        // 微信小游戏 storage 有时直接返回对象，而非 JSON 字符串
        if (typeof s !== 'string') return s as T;
        return JSON.parse(s) as T;
    } catch {
        return fallback;
    }
}

function writeJson(key: string, value: unknown): void {
    try {
        sys.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* 忽略 */
    }
}

function normalizePurchasedKeys(raw: unknown): string[] {
    let arr: unknown[] = [];
    if (Array.isArray(raw)) {
        arr = raw;
    } else if (raw && typeof raw === 'object') {
        // 微信端偶发把数组存成 {0:..,1:..}
        arr = Object.values(raw as Record<string, unknown>);
    } else {
        return [];
    }
    return [...new Set(arr.map((x) => String(x)).filter((s) => s.includes(':')))].sort();
}

function savePurchasedShopKeys(keys: string[]): void {
    const normalized = normalizePurchasedKeys(keys);
    _cacheHost.__linkupPurchasedShopKeys = normalized;
    writeJson(PURCHASED_SHOP_KEYS, normalized);
}

export function loadCurrentLevel(): number {
    const n = Number(readJson<number | string>(CURRENT_LEVEL_KEY, 1));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function saveCurrentLevel(level: number): void {
    writeJson(CURRENT_LEVEL_KEY, Math.max(1, Math.floor(level)));
}

export function loadCoins(): number {
    const n = Number(readJson<number | string>(COINS_KEY, 0));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function addCoins(amount: number): number {
    const delta = Math.max(0, Math.floor(amount));
    const next = loadCoins() + delta;
    writeJson(COINS_KEY, next);
    return next;
}

export function spendCoins(amount: number): number | null {
    const cost = Math.max(0, Math.floor(amount));
    const cur = loadCoins();
    if (cur < cost) return null;
    const next = cur - cost;
    writeJson(COINS_KEY, next);
    return next;
}

export function loadPurchasedShopKeys(): string[] {
    // 注意：空数组 [] 也是有效缓存，不能用 if (cached)（空数组为 truthy，但要用 != null 区分未加载）
    if (_cacheHost.__linkupPurchasedShopKeys != null) {
        return _cacheHost.__linkupPurchasedShopKeys.slice();
    }
    const loaded = normalizePurchasedKeys(readJson<unknown>(PURCHASED_SHOP_KEYS, []));
    _cacheHost.__linkupPurchasedShopKeys = loaded;
    return loaded.slice();
}

export function isShopBlockOwned(shopKey: string): boolean {
    const k = String(shopKey ?? '');
    return loadPurchasedShopKeys().indexOf(k) >= 0;
}

export function purchaseShopBlock(shopKey: string): PurchaseResult {
    const k = String(shopKey ?? '');
    if (!k.includes(':')) return 'invalid';
    const set = new Set(loadPurchasedShopKeys());
    if (set.has(k)) return 'already_owned';
    const after = spendCoins(BLOCK_PRICE);
    if (after == null) return 'insufficient_coins';
    set.add(k);
    savePurchasedShopKeys([...set]);
    return 'success';
}

/** 把未知结构规范成 shopKey 字符串列表（兼容微信端伪数组） */
function coerceShopKeyList(defaultKeys: unknown): string[] {
    const out: string[] = [];
    const seen: Record<string, number> = Object.create(null);
    if (defaultKeys == null) return out;
    const pushOne = (raw: unknown) => {
        const k = String(raw ?? '');
        // 只接受 groupKey:数字，避免 UUID/异常值污染
        if (!/^[A-Za-z][A-Za-z0-9]*:\d+$/.test(k)) return;
        if (seen[k]) return;
        seen[k] = 1;
        out.push(k);
    };
    if (Array.isArray(defaultKeys)) {
        for (let i = 0; i < defaultKeys.length; i++) pushOne(defaultKeys[i]);
        return out;
    }
    if (typeof defaultKeys === 'object') {
        const any = defaultKeys as { length?: unknown };
        const n = Number(any.length);
        if (Number.isFinite(n) && n >= 0 && n < 10000) {
            for (let i = 0; i < n; i++) pushOne((defaultKeys as Record<number, unknown>)[i]);
            if (out.length > 0) return out;
        }
        const vals = Object.keys(defaultKeys as Record<string, unknown>);
        for (let i = 0; i < vals.length; i++) {
            pushOne((defaultKeys as Record<string, unknown>)[vals[i]]);
        }
    }
    return out;
}

/**
 * 启用商店时赠送默认方块；已购列表会合并补全。
 * @returns 合并后的已拥有 shopKey 列表（勿仅依赖 storage，微信端可能写失败）
 */
export function ensureDefaultShopOwnership(defaultKeys: unknown): string[] {
    const list = coerceShopKeyList(defaultKeys);
    const existing = loadPurchasedShopKeys();
    const seen: Record<string, number> = Object.create(null);
    const merged: string[] = [];
    const push = (k: string) => {
        if (!k || seen[k]) return;
        seen[k] = 1;
        merged.push(k);
    };
    for (let i = 0; i < list.length; i++) push(list[i]);
    for (let i = 0; i < existing.length; i++) push(existing[i]);
    merged.sort();
    // 赠送列表解析成功时，合并结果不应短于赠送数（防止旧缓存/微信 Set 异常只剩 1 条）
    const result = list.length > 0 && merged.length < list.length ? list.slice().sort() : merged;
    if (result.length > 0) {
        savePurchasedShopKeys(result);
        try {
            sys.localStorage.setItem(SHOP_DEFAULTS_KEY, SHOP_DEFAULTS_VER);
        } catch {
            /* 忽略 */
        }
    }
    return result.length > 0 ? result : list.slice();
}

function defaultPropCounts(): PropCounts {
    return { hint: 0, refresh: 0, eliminate: 0 };
}

export function loadPropCounts(): PropCounts {
    const raw = readJson<Partial<PropCounts>>(PROPS_KEY, {});
    const base = defaultPropCounts();
    for (const k of Object.keys(base) as PropKind[]) {
        const n = Number(raw[k]);
        base[k] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
    return base;
}

export function purchaseProp(kind: PropKind): boolean {
    const after = spendCoins(PROP_PRICE);
    if (after == null) return false;
    const counts = loadPropCounts();
    counts[kind] += 1;
    writeJson(PROPS_KEY, counts);
    return true;
}

export function consumeProp(kind: PropKind): boolean {
    const counts = loadPropCounts();
    if (counts[kind] <= 0) return false;
    counts[kind] -= 1;
    writeJson(PROPS_KEY, counts);
    return true;
}
