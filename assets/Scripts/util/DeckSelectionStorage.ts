import { SpriteFrame, sys } from 'cc';
import { MAX_DECK_TYPE_COUNT, MIN_DECK_TYPE_COUNT, TILE_SPRITE_SLOTS } from './DeckConstants';
import { loadEpicCubeIds, loadPurchasedShopKeys } from './PlayerResourceStorage';
import type { ShopCatalogGroup } from './ShopCatalog';
import {
    buildTileFacesFromDeckKeys,
    deckShopKeysToTypeIds,
    getDefaultOwnedEntries,
    getDefaultOwnedShopKeys,
    makeEpicShopKey,
} from './ShopCatalog';
import { ensureDefaultShopOwnership } from './PlayerResourceStorage';

export { MAX_DECK_TYPE_COUNT, MIN_DECK_TYPE_COUNT };

const STORAGE_KEY = 'linkup_v1_deck_type_ids';
const DECK_SHOP_KEYS = 'linkup_v1_deck_shop_keys';

export type DeckEntry = { shopKey: string; sprite: SpriteFrame };

export function getConfiguredTypeIds(tileFaces: Array<SpriteFrame | null> | null | undefined): number[] {
    const faces = tileFaces ?? [];
    const out: number[] = [];
    for (let i = 0; i < TILE_SPRITE_SLOTS; i++) {
        if (faces[i] != null) out.push(i + 1);
    }
    return out;
}

export function getPurchasedDeckEntries(
    groups: ShopCatalogGroup[],
    /** 额外视为已拥有的 key（如刚赠送的列表，不依赖 storage 是否写成功） */
    extraOwnedKeys?: string[] | null,
): DeckEntry[] {
    const owned = new Set(loadPurchasedShopKeys().map((k) => String(k)));
    if (extraOwnedKeys) {
        const extra = extraOwnedKeys as unknown as { length?: number };
        const n = Array.isArray(extraOwnedKeys)
            ? extraOwnedKeys.length
            : Number(extra?.length) || 0;
        for (let i = 0; i < n; i++) {
            const k = String((extraOwnedKeys as string[])[i] ?? '');
            if (k.includes(':')) owned.add(k);
        }
    }
    const out: DeckEntry[] = [];
    for (const g of groups) {
        for (const it of g.items) {
            const key = String(it.shopKey ?? '');
            if (owned.has(key)) out.push({ shopKey: key, sprite: it.sprite });
        }
    }
    return out;
}

/**
 * 赠送 + 已购买 合并后的卡组可选列表。
 * 赠送条目直接拷贝进数组（不用 Map），避免微信端 key 异常时 35 条被合并成 1 条。
 */
export function collectDeckEntriesForUi(groups: ShopCatalogGroup[]): DeckEntry[] {
    const giftEntries = getDefaultOwnedEntries(groups);
    const giftKeys: string[] = [];
    const out: DeckEntry[] = [];
    const seen: Record<string, number> = Object.create(null);
    for (let i = 0; i < giftEntries.length; i++) {
        const e = giftEntries[i];
        const k = String(e.shopKey);
        giftKeys.push(k);
        if (seen[k]) continue;
        seen[k] = 1;
        out.push({ shopKey: k, sprite: e.sprite });
    }
    ensureDefaultShopOwnership(giftKeys);

    // 已购买但不在赠送列表中的，按目录补上
    const purchased = getPurchasedDeckEntries(groups, giftKeys);
    for (let i = 0; i < purchased.length; i++) {
        const e = purchased[i];
        const k = String(e.shopKey);
        if (seen[k]) continue;
        seen[k] = 1;
        out.push({ shopKey: k, sprite: e.sprite });
    }
    return out;
}

/**
 * 尚未配置卡组（或不足最少种类）时：默认选中前 {@link MIN_DECK_TYPE_COUNT} 种。
 * @param preferredKeys 优先顺序（一般为卡组 UI 列表顺序 / 赠送顺序）
 */
export function ensureDefaultDeckSelection(
    groups: ShopCatalogGroup[],
    preferredKeys?: string[] | null,
): void {
    const prefer =
        preferredKeys && preferredKeys.length > 0
            ? preferredKeys.map((k) => String(k))
            : getDefaultOwnedShopKeys(groups);
    if (prefer.length < MIN_DECK_TYPE_COUNT) return;
    const current = loadDeckShopKeysRaw(groups, prefer);
    if (current.length >= MIN_DECK_TYPE_COUNT) return;
    // 默认只勾选前 30 种（最少开局种类）
    saveDeckShopKeys(prefer.slice(0, MIN_DECK_TYPE_COUNT));
}

type DeckKeysCacheHost = { __linkupDeckShopKeys?: string[] | null };
const _deckKeysHost = globalThis as unknown as DeckKeysCacheHost;

/** 读取未过滤的原始卡组 key（优先 localStorage，避免缓存被其它路径过滤污染） */
function readRawDeckShopKeys(): unknown {
    let fromStorage: unknown = null;
    try {
        const s = sys.localStorage.getItem(DECK_SHOP_KEYS) as unknown;
        if (s == null || s === '') fromStorage = null;
        else if (typeof s !== 'string') fromStorage = s;
        else fromStorage = JSON.parse(s);
    } catch {
        fromStorage = null;
    }
    if (Array.isArray(fromStorage)) {
        // 以磁盘为准回填缓存，修复曾被过滤写回的内存缓存
        _deckKeysHost.__linkupDeckShopKeys = fromStorage.map((x) => String(x ?? ''));
        return fromStorage;
    }
    return _deckKeysHost.__linkupDeckShopKeys;
}

export function loadDeckShopKeysRaw(
    groups: ShopCatalogGroup[],
    extraOwnedKeys?: string[] | null,
): string[] {
    // 允许：已购 + 传入额外 + 默认赠送 + 已拥有史诗（避免开始游戏时把默认卡组 key 滤空）
    const allowed: Record<string, number> = Object.create(null);
    const mark = (k: string) => {
        if (k) allowed[k] = 1;
    };
    const purchased = getPurchasedDeckEntries(groups, extraOwnedKeys);
    for (let i = 0; i < purchased.length; i++) mark(String(purchased[i].shopKey));
    if (extraOwnedKeys) {
        for (let i = 0; i < extraOwnedKeys.length; i++) mark(String(extraOwnedKeys[i] ?? ''));
    }
    const gifts = getDefaultOwnedShopKeys(groups);
    for (let i = 0; i < gifts.length; i++) mark(String(gifts[i]));
    const epicIds = loadEpicCubeIds();
    for (let i = 0; i < epicIds.length; i++) mark(makeEpicShopKey(epicIds[i]));

    const raw = readRawDeckShopKeys();
    if (Array.isArray(raw)) {
        const keys: string[] = [];
        const seen: Record<string, number> = Object.create(null);
        for (let i = 0; i < raw.length; i++) {
            const k = String(raw[i] ?? '');
            if (!k || !allowed[k] || seen[k]) continue;
            seen[k] = 1;
            keys.push(k);
        }
        // 注意：不要把「按当前 allowed 过滤后的子集」写回缓存/磁盘，
        // 否则未传入史诗 key 的调用方会把已保存的 epic:* 冲掉。
        return keys;
    }
    return [];
}

export function saveDeckShopKeys(keys: string[]): void {
    const uniq = [...new Set(keys.map((k) => String(k)).filter(Boolean))];
    _deckKeysHost.__linkupDeckShopKeys = uniq;
    try {
        sys.localStorage.setItem(DECK_SHOP_KEYS, JSON.stringify(uniq));
    } catch {
        /* 忽略 */
    }
}

/** 商店模式：返回对局用 typeId 列表；无效时 null。会自动补默认前 30 种。 */
export function loadDeckTypeIdsForGameShop(groups: ShopCatalogGroup[]): number[] | null {
    const prefer = getDefaultOwnedShopKeys(groups);
    ensureDefaultDeckSelection(groups, prefer);
    let keys = loadDeckShopKeysRaw(groups, prefer);
    if (keys.length < MIN_DECK_TYPE_COUNT && prefer.length >= MIN_DECK_TYPE_COUNT) {
        keys = prefer.slice(0, MIN_DECK_TYPE_COUNT);
        saveDeckShopKeys(keys);
    }
    if (keys.length < MIN_DECK_TYPE_COUNT || keys.length > MAX_DECK_TYPE_COUNT) return null;
    const ids = deckShopKeysToTypeIds(keys, groups);
    if (ids.length < MIN_DECK_TYPE_COUNT) return null;
    return ids;
}

export function buildGameTileFacesForShopDeck(
    groups: ShopCatalogGroup[],
    deckTypeIds: number[] | null,
): Array<SpriteFrame | null> {
    const keys = loadDeckShopKeysRaw(groups);
    if (keys.length >= MIN_DECK_TYPE_COUNT) {
        return buildTileFacesFromDeckKeys(groups, keys);
    }
    const faces: Array<SpriteFrame | null> = [];
    for (let i = 0; i < TILE_SPRITE_SLOTS; i++) faces.push(null);
    return faces;
}

export function getDeckSelectableTypeIds(
    tileFaces: Array<SpriteFrame | null> | null | undefined,
    shopEnabled: boolean,
): number[] {
    if (!shopEnabled) return getConfiguredTypeIds(tileFaces);
    return [];
}

export function loadDeckTypeIdsForGame(
    tileFaces: Array<SpriteFrame | null> | null | undefined,
    shopEnabled = false,
    shopGroups?: ShopCatalogGroup[],
): number[] | null {
    if (shopEnabled && shopGroups) {
        return loadDeckTypeIdsForGameShop(shopGroups);
    }
    const selectable = getConfiguredTypeIds(tileFaces);
    if (selectable.length < MIN_DECK_TYPE_COUNT) return null;
    let raw: unknown = null;
    try {
        const s = sys.localStorage.getItem(STORAGE_KEY);
        if (s) raw = JSON.parse(s);
    } catch {
        raw = null;
    }
    const allowed = new Set(selectable);
    if (Array.isArray(raw)) {
        const uniq = [...new Set(raw.map((x) => Number(x)).filter((n) => allowed.has(n)))].sort((a, b) => a - b);
        if (uniq.length >= MIN_DECK_TYPE_COUNT && uniq.length <= MAX_DECK_TYPE_COUNT) return uniq;
    }
    if (selectable.length >= MIN_DECK_TYPE_COUNT) return [...selectable].slice(0, MAX_DECK_TYPE_COUNT);
    return null;
}

export function loadDeckTypeIdsRaw(
    tileFaces: Array<SpriteFrame | null> | null | undefined,
    shopEnabled = false,
    shopGroups?: ShopCatalogGroup[],
): number[] {
    if (shopEnabled && shopGroups) {
        const keys = loadDeckShopKeysRaw(shopGroups);
        return deckShopKeysToTypeIds(keys, shopGroups);
    }
    const selectable = getConfiguredTypeIds(tileFaces);
    const allowed = new Set(selectable);
    let raw: unknown = null;
    try {
        const s = sys.localStorage.getItem(STORAGE_KEY);
        if (s) raw = JSON.parse(s);
    } catch {
        raw = null;
    }
    if (Array.isArray(raw)) {
        const uniq = [...new Set(raw.map((x) => Number(x)).filter((n) => allowed.has(n)))].sort((a, b) => a - b);
        if (uniq.length > 0) return uniq;
    }
    return shopEnabled ? [] : [...selectable];
}

export function saveDeckTypeIds(ids: number[]): void {
    try {
        sys.localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)].sort((a, b) => a - b)));
    } catch {
        /* 忽略 */
    }
}

export function isDeckSelectionValid(count: number): boolean {
    return count >= MIN_DECK_TYPE_COUNT && count <= MAX_DECK_TYPE_COUNT;
}
