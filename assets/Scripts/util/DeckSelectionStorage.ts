import { SpriteFrame, sys } from 'cc';
import { loadPurchasedShopKeys } from './PlayerResourceStorage';
import type { ShopCatalogGroup } from './ShopCatalog';
import { buildTileFacesFromDeckKeys, deckShopKeysToTypeIds } from './ShopCatalog';

const TILE_SPRITE_SLOTS = 40;

const STORAGE_KEY = 'linkup_v1_deck_type_ids';
const DECK_SHOP_KEYS = 'linkup_v1_deck_shop_keys';

export const MIN_DECK_TYPE_COUNT = 30;
export const MAX_DECK_TYPE_COUNT = 40;

export type DeckEntry = { shopKey: string; sprite: SpriteFrame };

export function getConfiguredTypeIds(tileFaces: Array<SpriteFrame | null> | null | undefined): number[] {
    const faces = tileFaces ?? [];
    const out: number[] = [];
    for (let i = 0; i < TILE_SPRITE_SLOTS; i++) {
        if (faces[i] != null) out.push(i + 1);
    }
    return out;
}

export function getPurchasedDeckEntries(groups: ShopCatalogGroup[]): DeckEntry[] {
    const owned = new Set(loadPurchasedShopKeys());
    const out: DeckEntry[] = [];
    for (const g of groups) {
        for (const it of g.items) {
            if (owned.has(it.shopKey)) out.push({ shopKey: it.shopKey, sprite: it.sprite });
        }
    }
    return out;
}

export function loadDeckShopKeysRaw(groups: ShopCatalogGroup[]): string[] {
    const allowed = new Set(getPurchasedDeckEntries(groups).map((e) => e.shopKey));
    let raw: unknown = null;
    try {
        const s = sys.localStorage.getItem(DECK_SHOP_KEYS);
        if (s) raw = JSON.parse(s);
    } catch {
        raw = null;
    }
    if (Array.isArray(raw)) {
        return [...new Set(raw.map((x) => String(x)).filter((k) => allowed.has(k)))];
    }
    return [];
}

export function saveDeckShopKeys(keys: string[]): void {
    try {
        sys.localStorage.setItem(DECK_SHOP_KEYS, JSON.stringify([...new Set(keys)]));
    } catch {
        /* 忽略 */
    }
}

/** 商店模式：返回对局用 typeId 列表；无效时 null */
export function loadDeckTypeIdsForGameShop(groups: ShopCatalogGroup[]): number[] | null {
    const keys = loadDeckShopKeysRaw(groups);
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
