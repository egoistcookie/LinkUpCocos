/** 棋盘/卡组共享常量（独立模块，避免 util ↔ game 循环依赖） */

/** 棋盘格子贴图槽位数；索引 0 对应 typeId 1 */
export const TILE_SPRITE_SLOTS = 40;

/** 开始游戏 / 卡组最少可选方块种类 */
export const MIN_DECK_TYPE_COUNT = 30;

/** 卡组最多可选方块种类（通常等于 {@link TILE_SPRITE_SLOTS}） */
export const MAX_DECK_TYPE_COUNT = 40;
