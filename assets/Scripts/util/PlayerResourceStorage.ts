import { sys } from 'cc';

const COINS_KEY = 'linkup_v1_coins';
const PURCHASED_SHOP_KEYS = 'linkup_v1_purchased_shop_keys';
const PROPS_KEY = 'linkup_v1_props';
const SHOP_DEFAULTS_KEY = 'linkup_v1_shop_defaults_applied';

export type PurchaseResult = 'success' | 'already_owned' | 'insufficient_coins' | 'invalid';

export const PROP_PRICE = 50;
export const BLOCK_PRICE = 10;

export type PropKind = 'hint' | 'refresh' | 'eliminate';

type PropCounts = Record<PropKind, number>;

function readJson<T>(key: string, fallback: T): T {
    try {
        const s = sys.localStorage.getItem(key);
        if (!s) return fallback;
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
    const raw = readJson<unknown>(PURCHASED_SHOP_KEYS, []);
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((x) => String(x)).filter((s) => s.includes(':')))].sort();
}

export function isShopBlockOwned(shopKey: string): boolean {
    return loadPurchasedShopKeys().includes(shopKey);
}

export function purchaseShopBlock(shopKey: string): PurchaseResult {
    if (!shopKey || !shopKey.includes(':')) return 'invalid';
    const set = new Set(loadPurchasedShopKeys());
    if (set.has(shopKey)) return 'already_owned';
    const after = spendCoins(BLOCK_PRICE);
    if (after == null) return 'insufficient_coins';
    set.add(shopKey);
    writeJson(PURCHASED_SHOP_KEYS, [...set].sort());
    return 'success';
}

/** 首次启用商店：默认拥有各分组前 6 种；已购列表会合并补全 */
export function ensureDefaultShopOwnership(defaultKeys: string[]): void {
    if (defaultKeys.length === 0) return;
    const existing = new Set(loadPurchasedShopKeys());
    let changed = false;
    for (const k of defaultKeys) {
        if (!existing.has(k)) {
            existing.add(k);
            changed = true;
        }
    }
    if (changed) {
        writeJson(PURCHASED_SHOP_KEYS, [...existing].sort());
    }
    try {
        if (sys.localStorage.getItem(SHOP_DEFAULTS_KEY) !== '1') {
            sys.localStorage.setItem(SHOP_DEFAULTS_KEY, '1');
        }
    } catch {
        /* 忽略 */
    }
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
