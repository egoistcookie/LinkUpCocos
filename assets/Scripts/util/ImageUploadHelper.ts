import { ImageAsset, Sprite, SpriteFrame, Texture2D, assetManager, sys } from 'cc';

/** 浏览器预览：选择本地图片，返回可交给 loadRemote 的 URL（blob）。 */
export function pickLocalImageUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
        if (typeof document === 'undefined') {
            reject(new Error('document 不可用'));
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
            const f = input.files?.[0];
            if (!f) {
                reject(new Error('未选择文件'));
                return;
            }
            resolve(URL.createObjectURL(f));
        };
        input.click();
    });
}

/** 将图片 URL（含 blob、微信临时路径）加载到 Sprite。 */
export function loadImageUrlToSprite(sprite: Sprite, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        assetManager.loadRemote<ImageAsset>(url, { ext: '.png' }, (err, img) => {
            if (err || !img) {
                reject(err ?? new Error('loadRemote 失败'));
                return;
            }
            try {
                const sf = spriteFrameFromImageAsset(img);
                sprite.spriteFrame = sf;
                resolve();
            } catch (e) {
                reject(e instanceof Error ? e : new Error(String(e)));
            }
        });
    });
}

function spriteFrameFromImageAsset(img: ImageAsset): SpriteFrame {
    const anySf = SpriteFrame as unknown as { createWithImage?: (a: ImageAsset) => SpriteFrame };
    if (typeof anySf.createWithImage === 'function') {
        return anySf.createWithImage(img);
    }
    const tex = new Texture2D();
    (tex as unknown as { image: ImageAsset }).image = img;
    const sf = new SpriteFrame();
    sf.texture = tex;
    return sf;
}

/** 是否为微信小游戏环境（可接 wx.chooseImage / wx.chooseMedia）。 */
export function isWeChatMiniGame(): boolean {
    return sys.platform === sys.Platform.WECHAT_GAME;
}
