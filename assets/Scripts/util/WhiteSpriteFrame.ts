import { Rect, SpriteFrame, Texture2D } from 'cc';

let cached: SpriteFrame | null = null;

/** 1×1 白色贴图，用于纯色 Sprite（着色用 Sprite.color）。 */
export function getWhiteSpriteFrame(): SpriteFrame {
    if (cached) return cached;
    const tex = new Texture2D();
    tex.reset({
        width: 1,
        height: 1,
        format: Texture2D.PixelFormat.RGBA8888,
    });
    tex.uploadData(new Uint8Array([255, 255, 255, 255]));
    const sf = new SpriteFrame();
    sf.texture = tex;
    sf.rect = new Rect(0, 0, 1, 1);
    sf.packable = false;
    cached = sf;
    return sf;
}
