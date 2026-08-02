import { SpriteFrame } from 'cc';
import { TILE_SPRITE_SLOTS } from './DeckConstants';
import { BLOCK_PRICE } from './PlayerResourceStorage';

/** 初始赠送目标总数（各组额度用完后从其余种类补足） */
export const DEFAULT_OWNED_TARGET = 35;

export type ShopSpriteGroupKey =
    | 'landAnimals'
    | 'aquaticAnimals'
    | 'fruits'
    | 'snacks'
    | 'vegetables'
    | 'pastries';

export type ShopCatalogItem = {
    shopKey: string;
    groupKey: ShopSpriteGroupKey;
    indexInGroup: number;
    sprite: SpriteFrame;
    price: number;
};

export type ShopCatalogGroup = {
    title: string;
    groupKey: ShopSpriteGroupKey;
    items: ShopCatalogItem[];
};

export type ShopCatalogBuildInput = {
    tileFaces: Array<SpriteFrame | null>;
    landAnimals: SpriteFrame[];
    aquaticAnimals: SpriteFrame[];
    fruits: SpriteFrame[];
    snacks: SpriteFrame[];
    vegetables: SpriteFrame[];
    pastries: SpriteFrame[];
};

export type ShopCatalogResult = {
    groups: ShopCatalogGroup[];
};

/** 初始赠送：各组取前 N 种（未列出的组为 0）；合计 35 */
const DEFAULT_OWNED_COUNT: Partial<Record<ShopSpriteGroupKey, number>> = {
    landAnimals: 5,
    pastries: 10,
    vegetables: 10,
    snacks: 5,
    fruits: 5,
};
export const SHOP_COLS_PER_ROW = 5;

const GROUP_DEFS: { title: string; key: ShopSpriteGroupKey }[] = [
    { title: '陆地动物方块', key: 'landAnimals' },
    { title: '水生动物方块', key: 'aquaticAnimals' },
    { title: '水果方块', key: 'fruits' },
    { title: '零食方块', key: 'snacks' },
    { title: '蔬菜方块', key: 'vegetables' },
    { title: '面点方块', key: 'pastries' },
];

export function makeShopKey(groupKey: ShopSpriteGroupKey, indexInGroup: number): string {
    return `${groupKey}:${indexInGroup}`;
}

function groupItems(title: string, groupKey: ShopSpriteGroupKey, sprites: SpriteFrame[]): ShopCatalogGroup {
    const items: ShopCatalogItem[] = [];
    const list = sprites ?? [];
    /** 仅对非空贴图递增，保证「前 N 种」与 shopKey 序号一致 */
    let slot = 0;
    for (let i = 0; i < list.length; i++) {
        const sf = list[i];
        if (!sf) continue;
        items.push({
            shopKey: makeShopKey(groupKey, slot),
            groupKey,
            indexInGroup: slot,
            sprite: sf,
            price: BLOCK_PRICE,
        });
        slot += 1;
    }
    return { title, groupKey, items };
}

export function buildShopCatalog(input: ShopCatalogBuildInput): ShopCatalogResult {
    const groups: ShopCatalogGroup[] = [];
    for (const def of GROUP_DEFS) {
        const g = groupItems(def.title, def.key, input[def.key] ?? []);
        if (g.items.length > 0) groups.push(g);
    }
    return { groups };
}

export function hasShopCatalog(groups: ShopCatalogGroup[]): boolean {
    return groups.some((g) => g.items.length > 0);
}

export type DefaultOwnedEntry = { shopKey: string; sprite: SpriteFrame };

/**
 * 初始赠送条目（含贴图）：shopKey 一律现场生成 groupKey:index，
 * 不读取 item.shopKey（微信端曾出现 shopKey 异常导致 35 条挤成 1 个 key）。
 */
export function getDefaultOwnedEntries(groups: ShopCatalogGroup[]): DefaultOwnedEntry[] {
    const out: DefaultOwnedEntry[] = [];
    const used: Record<string, number> = Object.create(null);
    const tryPush = (groupKey: ShopSpriteGroupKey, indexInGroup: number, sprite: SpriteFrame | null | undefined) => {
        if (!sprite) return;
        const k = makeShopKey(groupKey, indexInGroup);
        if (used[k]) return;
        used[k] = 1;
        out.push({ shopKey: k, sprite });
    };
    for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const n = DEFAULT_OWNED_COUNT[g.groupKey] ?? 0;
        if (n <= 0) continue;
        const take = Math.min(n, g.items.length);
        // 用 items 下标作为序号（与 groupItems 的 slot 一致），勿读可能被污染的 item.shopKey
        for (let i = 0; i < take; i++) {
            tryPush(g.groupKey, i, g.items[i].sprite);
        }
    }
    if (out.length < DEFAULT_OWNED_TARGET) {
        for (let gi = 0; gi < groups.length; gi++) {
            const g = groups[gi];
            for (let i = 0; i < g.items.length; i++) {
                tryPush(g.groupKey, i, g.items[i].sprite);
                if (out.length >= DEFAULT_OWNED_TARGET) break;
            }
            if (out.length >= DEFAULT_OWNED_TARGET) break;
        }
    }
    return out;
}

/** 初始赠送 shopKey 列表 */
export function getDefaultOwnedShopKeys(groups: ShopCatalogGroup[]): string[] {
    return getDefaultOwnedEntries(groups).map((e) => e.shopKey);
}

export function findCatalogItem(groups: ShopCatalogGroup[], shopKey: string): ShopCatalogItem | null {
    const want = String(shopKey ?? '');
    if (!want) return null;
    for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        for (let i = 0; i < g.items.length; i++) {
            const it = g.items[i];
            // 以 groupKey:下标 为准（兼容 item.shopKey 被污染的情况）
            const canonical = makeShopKey(g.groupKey, i);
            if (canonical === want || String(it.shopKey) === want) return it;
        }
    }
    return null;
}

/** 按 deckEntries（含 sprite）直接生成对局 typeId，不依赖目录反查 */
export function deckEntriesToTypeIds(
    entries: Array<{ shopKey: string; sprite: SpriteFrame }>,
): number[] {
    const n = Math.min(entries.length, TILE_SPRITE_SLOTS);
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
        if (entries[i]?.sprite) ids.push(i + 1);
    }
    return ids;
}

/** 按 entries 顺序写入棋盘贴图槽 */
export function buildTileFacesFromDeckEntries(
    entries: Array<{ shopKey: string; sprite: SpriteFrame }>,
): Array<SpriteFrame | null> {
    const faces: Array<SpriteFrame | null> = [];
    for (let i = 0; i < TILE_SPRITE_SLOTS; i++) faces.push(null);
    const n = Math.min(entries.length, TILE_SPRITE_SLOTS);
    for (let i = 0; i < n; i++) {
        faces[i] = entries[i].sprite ?? null;
    }
    return faces;
}

/** 根据卡组 shopKey 列表生成棋盘贴图槽位（索引 0 对应 typeId 1） */
export function buildTileFacesFromDeckKeys(
    groups: ShopCatalogGroup[],
    deckShopKeys: string[],
): Array<SpriteFrame | null> {
    const faces: Array<SpriteFrame | null> = [];
    for (let i = 0; i < TILE_SPRITE_SLOTS; i++) faces.push(null);
    let slot = 0;
    for (const key of deckShopKeys) {
        if (slot >= TILE_SPRITE_SLOTS) break;
        const it = findCatalogItem(groups, key);
        if (it) {
            faces[slot] = it.sprite;
            slot++;
        }
    }
    return faces;
}

/** 卡组 shopKey 顺序 → 对局 typeId 列表（1…n） */
export function deckShopKeysToTypeIds(deckShopKeys: string[], groups: ShopCatalogGroup[]): number[] {
    const ids: number[] = [];
    let slot = 0;
    for (const key of deckShopKeys) {
        if (slot >= TILE_SPRITE_SLOTS) break;
        if (findCatalogItem(groups, key)) {
            ids.push(slot + 1);
            slot++;
        }
    }
    return ids;
}
