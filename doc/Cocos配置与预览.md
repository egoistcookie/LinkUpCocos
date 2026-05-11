# 连连看 MVP — Cocos Creator 配置与预览

本文说明在本仓库脚本与目录就绪后，如何在 **Cocos Creator 3.8.x（与当前编辑器 3.8.8 一致即可）** 中完成场景挂载、设计分辨率、浏览器预览，以及 **发布到微信小游戏** 的要点。

## 1. 用 Creator 打开工程

1. 启动 **Cocos Dashboard**，选择 **打开其他项目**，指向本仓库根目录 `LinkUpCocos`（包含 `assets` 文件夹的目录）。
2. 若这是首次作为 Creator 工程打开，编辑器会为 `assets` 下资源生成 `.meta` 文件，属正常现象；请将工程加入版本管理时注意一并提交 `.meta`，避免 UUID 错乱。

## 2. 项目与预览基础设置

1. 菜单 **项目 → 项目设置**：
   - **功能裁剪**：**不要**在未确认依赖的情况下大面积关闭 **3D / 几何 / Primitive** 等模块。场景默认带 **Skybox（天空盒）**，激活时会走网格相关逻辑；若裁剪掉对应引擎能力，预览阶段容易出现 **`Cannot read properties of undefined (reading 'createMesh')`**（栈在 `Skybox.activate`）。纯 2D 连连看可保留默认裁剪，或按下文「常见问题」关闭天空盒后再按需裁剪。
2. 菜单 **项目 → 构建发布** 以外的日常预览：
   - 菜单 **Cocos Creator → 偏好设置**（Windows 为 **文件 → 偏好设置**）中可配置默认浏览器等。

## 3. 设计分辨率（竖屏连连看）

1. 菜单 **项目 → 项目设置 → 通用 → 设计分辨率**：
   - 建议 **宽 720、高 1280**，**适配屏幕宽度**（或按团队规范选择 **Fit Height** / **Show All**，与 UI 的 `Widget` 配合即可）。
2. 本 MVP 的 `GameApp`、`HomeView`、`GameView` 使用 `view.getVisibleSize()` 与 `Widget` 做全屏拉伸，在常见竖屏比例下可铺满画布。

## 4. 创建场景并挂载入口脚本

1. **资源管理器** 中在 `assets` 下新建文件夹 `scene`（若尚无），右键 **创建 → Scene**，命名为 `Main`（或任意名）。
2. 打开该场景。若使用 **新建空场景**，只需有 **Main Camera**（或任意摄像机）即可，**不必**手工建 Canvas：`GameApp` 会在运行时创建 **Canvas** 并把 **App** 移入其下。
3. 在场景根（或 Canvas 下）创建空节点 **App**（与 `doc/节点路径.md` 一致）。
4. 选中 **App**，在 **属性检查器** 底部 **添加组件 → 自定义脚本 → `GameApp`**。
5. （可选）在 **GameApp** 上为 **Home Background**（`homeBackground`）拖入一张 **SpriteFrame**（如从 `resources` 或图集中选图），作为首页默认背景；不赋值则为 **纯白** 底图，仍可在运行时用「上传首页背景图」覆盖。
6. **保存场景**，菜单 **文件 → 保存场景**。
7. 菜单 **项目 → 项目设置 → 通用 → 默认场景**：将 **启动场景** 设为刚保存的 `Main` 场景，便于预览时自动进入。

## 5. 浏览器预览

1. 点击编辑器上方 **预览**（浏览器图标），或菜单 **项目 → 预览**。
2. 若首页白屏、无按钮，打开开发者工具 **Console**，在过滤框输入 **`[LinkUp]`**，将相关日志复制给协作者排查（由 `LinkUpDebug` + `GameApp` / `HomeView` / `ViewSize` 输出）。
3. 首页 **上传背景 / 上传开始按钮** 使用浏览器 `<input type="file">`，仅在 **Web 预览** 下可用；真机微信请改用 `wx.chooseImage` / `wx.chooseMedia` 等（代码里已预留 `isWeChatMiniGame()`，可在 `ImageUploadHelper` 中扩展）。

## 6. 脚本与资源目录说明

| 路径 | 说明 |
|------|------|
| `assets/Scripts/` | TypeScript 逻辑（与美术资源分离） |
| `assets/Scripts/GameApp.ts` | 入口：首页 ↔ 游戏页切换 |
| `assets/Scripts/game/` | 首页、游戏 UI、棋盘与寻路 |
| `assets/Scripts/util/` | 白贴图、本地选图等工具 |
| `assets/resources/` | 可选动态加载资源目录（`resources.load`）；当前 MVP 主要用代码生成 UI，可不放置贴图 |

在 `resources` 下放贴图时，路径写法见 `doc/节点路径.md`。

## 7. 发布微信小游戏（概要）

1. 安装并配置 **微信开发者工具**，注册 **小游戏 AppID**。
2. 菜单 **项目 → 构建发布**：
   - **发布平台** 选择 **微信小游戏**；
   - 填写 **AppID**、**构建路径**（如 `build/wechatgame`）；
   - 首次构建前在 **游戏名称 / 图标** 等处按微信要求填写。
3. 点击 **构建**，完成后点击 **打开构建文件夹**，用 **微信开发者工具** 导入该目录进行真机预览与上传审核。
4. 注意：
   - 小游戏对包体、域名白名单、用户隐私接口（选图等）有单独要求，需在 **微信公众平台** 与 **微信开发者工具** 中按官方文档配置。
   - 若使用 `loadRemote` 加载用户图片，需符合微信对 **本地临时路径 / 网络资源** 的规范。

## 8. 常见问题

- **预览报错：`Cannot read properties of undefined (reading 'createMesh')`，栈里有 `Skybox.activate`**  
  - **原因**：场景全局里的 **天空盒（Skybox）** 在启用时会创建网格；功能裁剪关掉了相关模块、或环境与引擎版本不匹配时，内部用到的 `createMesh` 可能未注入。  
  - **处理（任选其一，推荐前两条）**：  
    1. **关闭天空盒**：在 **层级管理器** 中选中根 **Scene**（或点击场景空白使 **属性检查器** 显示「场景」全局设置），找到 **Skybox / 天空盒**，**取消勾选启用**。  
    2. **恢复功能裁剪**：菜单 **项目 → 项目设置 → 功能裁剪**，对 **3D / Mesh / Primitive** 等与渲染相关的项先恢复默认或重新勾选，再预览。  
    3. 本仓库已提交的 **`assets/scene.scene`** 中已将 **`SkyboxInfo._enabled` 设为 `false`**，若你使用自己新建的场景，请同样关闭 Skybox 或复制该设置。  

- **只有灰色背景、没有 UI，控制台有 `Can not find class 'cc.DirectionalLight'`**  
  - **原因**：功能裁剪去掉光照模块后，场景里仍带 **Main Light（平行光）** 会反序列化失败；且 **App 若不在 Canvas 下**，2D UI 不会绘制，只能看到主摄像机清屏灰。  
  - **处理**：使用本仓库已处理的 **`assets/scene.scene`**（已去掉 Main Light），并确保使用带 **`GameApp._ensureAppUnderCanvas`** 的脚本版本；或自己在编辑器删除 **Main Light**，并保证 **App 挂在 Canvas 下**。  

- **预览只有灰色、没有按钮，控制台无 Cocos 报错（或仅有扩展的 `runtime.lastError`）**  
  - **常见原因**：代码把 UI 放在 **`UI_2D`** 层，而默认 **Main Camera** 的 **Visibility** 往往**不包含** `UI_2D`，结果整棵 UI 树不被渲染。  
  - **处理**：使用当前仓库里的 **`GameApp`**（已改为 **`DEFAULT`** 层，与默认摄像机一致）；或在编辑器里把 **Main Camera → Visibility** 勾上 **UI_2D**。  

- **全屏 UI 异常：只剩灰底 + 一小块白三角 / 白块**  
  - **常见原因**：**Canvas** 使用 **Screen Space Overlay** 时，与场景里 **透视主摄**、动态生成的 **SpriteFrame** 组合，可能出现裁切或网格异常。  
  - **处理**：`GameApp` 会为 **Canvas** 挂 **正交 `UICamera`**，并把渲染模式设为 **屏幕空间 - 摄像机**（与新建 2D 工程一致）；同时白贴图 `SpriteFrame` 会设置 **`originalSize`**。  

- **控制台 `Unchecked runtime.lastError: Could not establish connection. Receiving end does not exist.`**  
  - 多来自 **Chrome 扩展**（与 Cocos 无关），可忽略或换无痕/禁用扩展后预览。  

- **界面全黑或没有按钮**：检查 **GameApp** 是否挂在 **App** 上、启动场景是否已保存并设为默认场景；预览层级中应出现自动创建的 **Canvas**。
- **按钮无响应**：确认 **Canvas** 上存在 **UI** 相关模块；本工程棋盘格子使用 **Button** 接收点击。
- **TypeScript 报错**：确认 Creator 版本与引擎自带的 `tsconfig` / 类型声明一致；勿删除工程内由 Creator 生成的 `temp` / `library` 中的类型引用配置（以本机 Creator 为准）。仓库根目录的 `npm install` + `@cocos/creator-types` 仅用于 **Cursor/VS Code** 内识别 `cc` 模块，与 Creator 内置编译可并存；类型包目前常见最高版本为 **3.8.7**，与 **3.8.8** 编辑器一般兼容。

完成以上步骤即可在编辑器内完成 **配置与预览**；微信侧以 **构建发布 + 微信开发者工具** 为最终验证环境。
