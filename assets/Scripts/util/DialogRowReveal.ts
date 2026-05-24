import { Component } from 'cc';

/** 弹窗列表逐行出现间隔（游戏发牌逐格 0.014s，逐行更快） */
export const DIALOG_ROW_INTERVAL = 0.008;
/** 单行方块落位动画时长（游戏单格 0.07s） */
export const DIALOG_ROW_POP_DURATION = 0.04;

/** 在 Component.update 中驱动，按行依次执行 spawn 回调 */
export class RowRevealRunner {
    private _owner: Component;
    private _fns: Array<() => void> = [];
    private _index = 0;
    private _accum = 0;
    private _active = false;
    private _session = 0;

    constructor(owner: Component) {
        this._owner = owner;
    }

    start(spawnRowFns: Array<() => void>) {
        this._session++;
        this._fns = spawnRowFns;
        this._index = 0;
        this._accum = 0;
        this._active = spawnRowFns.length > 0;
        if (this._active) {
            spawnRowFns[0]();
            this._index = 1;
        }
    }

    stop() {
        this._session++;
        this._active = false;
        this._fns = [];
        this._index = 0;
        this._accum = 0;
    }

    get active() {
        return this._active;
    }

    tick(dt: number) {
        if (!this._active || !this._owner.isValid) return;
        this._accum += dt;
        while (this._accum >= DIALOG_ROW_INTERVAL && this._index < this._fns.length) {
            this._accum -= DIALOG_ROW_INTERVAL;
            const fn = this._fns[this._index++];
            fn();
        }
        if (this._index >= this._fns.length) {
            this._active = false;
        }
    }
}
