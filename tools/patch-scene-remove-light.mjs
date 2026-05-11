/**
 * 从 scene.scene 移除 Main Light（cc.DirectionalLight）子树，并把 __id__ 引用整体减 3。
 * 在仓库根目录执行: node tools/patch-scene-remove-light.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const scenePath = path.join(root, 'assets', 'scene.scene');

const arr = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
if (!Array.isArray(arr) || arr.length < 10) {
    console.error('Unexpected scene format');
    process.exit(1);
}

const n2 = arr[2];
if (n2?.__type__ !== 'cc.Node' || n2._name !== 'Main Light') {
    console.log('Skip: index 2 is not Main Light (already patched or different scene).');
    process.exit(0);
}

// 删除索引 2–4：Main Light 节点、DirectionalLight、StaticLightSettings
arr.splice(2, 3);

function patchRef(obj) {
    if (obj === null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
        obj.forEach(patchRef);
        return;
    }
    if (Object.keys(obj).length === 1 && typeof obj.__id__ === 'number') {
        const v = obj.__id__;
        obj.__id__ = v >= 5 ? v - 3 : v;
        return;
    }
    for (const k of Object.keys(obj)) patchRef(obj[k]);
}

patchRef(arr);

// Scene 的 _children：去掉已删的 Main Light，并改写引用
const scene = arr[1];
if (scene.__type__ !== 'cc.Scene' || !Array.isArray(scene._children)) {
    console.error('cc.Scene not at index 1');
    process.exit(1);
}
scene._children = [
    { __id__: 2 },
    { __id__: 4 },
]; // Main Camera 节点、App 节点（删光后新下标）

fs.writeFileSync(scenePath, JSON.stringify(arr, null, 2) + '\n', 'utf8');
console.log('Patched:', scenePath);
