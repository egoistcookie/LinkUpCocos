import { SpriteFrame } from 'cc';
import { TILE_SPRITE_SLOTS } from '../game/LinkUpBoard';
import { BLOCK_PRICE } from './PlayerResourceStorage';

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

export const SHOP_SLOTS_PER_GROUP = 6;
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
    for (let i = 0; i < list.length; i++) {
        const sf = list[i];
        if (!sf) continue;
        items.push({
            shopKey: makeShopKey(groupKey, i),
            groupKey,
            indexInGroup: i,
            sprite: sf,
            price: BLOCK_PRICE,
        });
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

export function getDefaultOwnedShopKeys(groups: ShopCatalogGroup[]): string[] {
    const keys: string[] = [];
    for (const g of groups) {
        for (const item of g.items) {
            if (item.indexInGroup < SHOP_SLOTS_PER_GROUP) keys.push(item.shopKey);
        }
    }
    return [...new Set(keys)];
}

export function findCatalogItem(groups: ShopCatalogGroup[], shopKey: string): ShopCatalogItem | null {
    for (const g of groups) {
        const it = g.items.find((x) => x.shopKey === shopKey);
        if (it) return it;
    }
    return null;
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
