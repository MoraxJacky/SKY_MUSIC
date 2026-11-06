# 六款主题与统一外观规范

2026-11-07 插画v2已接入，详见 [18张素材、取材与完整记录](THEME_ART_V2.md)。继承 `config/themes/template.json`，每个预设仅改变参数与素材引用；三个旧主题 ID 保持兼容，`citylights` 的展示名称/意象改为“霞谷落日”。不迁移曲库键，不改旧文件里的音乐数据或自定义名称。

| ID / 名称 | 配色与景物 | 单曲按键反馈 |
|---|---|---|
| christmas / 圣诞雪夜 | 松绿、烛金、冬装双人、雪花斗篷、雪屋冰湖 | 雪花 |
| starlight / 星光沙漠 | 紫蓝、玫瑰粉、小王子与光之子、狐狸和沙丘 | 星芒 |
| citylights / 霞谷落日 | 霞橙、冰湖、天文星环、双人琴乐与赛旗 | 光屑 |
| prairie / 云野浮岛 | 青绿、柔金、圣岛钟群、遥鲲和双人竖琴小景 | 蝴蝶 |
| rainforest / 雨林幽光 | 深青、蓝绿、树屋、伞下双人、发光菌菇与水母 | 雨滴 |
| vault / 禁阁星图 | 靛蓝、旧金、持灯与读书双人、灵鲲、悬浮石台和星图 | 晶星 |

主题意象的参考依据包括官方的 [冬日围巾](https://thatskyshop.com/products/winter-feast-scarf)、[圣诞活动物品记录](https://thatgamecompany.helpshift.com/hc/en/17-sky-children-of-the-light/faq/857-patch-notes---november-18-2021---0-15-5-179535-ios-179644-android-179482-switch-1637266164/)、[雨林与水母](https://www.thatskygame.com/zh/news/days-of-sunlight-2024-relax-in-the-perfect-sky-kid-playground/)及开发者的 [Sky 美术讲座](https://media.gdcvault.com/gdcsummer2020/presentations/Tanabe-Yuichiro-Art%20of%20Sky_%20Children%20of%20the%20Light.pdf)。星光沙漠与玫瑰的联系参照 [thatgamecompany 发行的回归活动新闻稿](https://www.gamespress.com/tr/The-Little-Prince-Returns-for-Days-of-Bloom-in-Sky-Children-of-the-Lig)。本项目新增 SVG 是原创的意象化图形，不是游戏场景截图或官方素材提取。

## 参数结构

`themes/template.json` 是共同起点。复制任一预设，将 ID、名称、元素编号和参数替换即可；不复制 HTML 或事件处理器。构建时展开为完整 `.skytheme` 定义，因此分享主题无需另一份模板文件。

- `appearance`：22 个语义色，包括面板前后色、文字/次文字、音符、和弦、选中前后色、舞台与背景。元素库的 `palette.<id>` 提供每款完整配色，预设 `appearance` 可局部覆盖。
- `materials`：`surfaceGradient` / `activeGradient` 是布尔值，`surfaceAngle` / `activeAngle` 是0–360度；CSS 渲染器统一生成材质，不允许传入任意 CSS/脚本。
- `rollPalette`：`base/light/medium/dark/label/anchor` 六个十六进制颜色。15行按浅—中—深—中—浅重复三次。没有配置的旧主题根据自身 `appearance` 推导，不继承圣诞绿色。
- `keyFeedback`：`enabled`、`element`、`shape`、`colors`、`count`（1–16）、`durationMs`（180–1500）、`sizePx`（6–24）、`spreadPx/risePx`（8–100）。元素库只支持雪花、星芒、光屑、蝴蝶、雨滴、晶星六种安全形状；不是可执行代码。
- `elementRefs`：标识、封面、舞台、挂件 `ornaments`、主题双人小景 `companion`、配色、效果的元素编号。运行包解析为图片路径；元素库支持受限的 `particle` 数据。

正式 JSON 契约见 `schemas/skytheme-v2.schema.json`。主题仍为 `.skytheme` schemaVersion 2，旧包缺少新增字段时使用安全缺省。`.skymusic` 仍只引用平台主题 ID，完整数字谱继续内嵌在单曲文件；新增主题必须通过平台录入。原有项目名、主题自定义字段及存储键保留。SVG/PNG/WebP 资源随主题 ZIP 导出，独立 HTML 内嵌全部预设素材。

## 与交互的边界

`src/38-player-template.js` 只应用颜色/材质/装饰，`src/37-theme-scenes.js` 负责视觉场景与点击粒子，`src/39-player-interactions.js` 继续统一处理音域/音色/倍速/键盘等交互。按键渲染器只通知一次共用视觉函数，主题不绑定自己的点击事件。粒子不写谱面、播放设置、历史或定位；控制台和减少动态效果模式均禁用粒子。装饰不接收指针、不占布局、不参与可访问焦点。

`applyTheme` 必须请求一次 `drawRoll`，即使播放暂停。选择主题前后须校验 score/playback/position/window/selected/page 和已绑定控制器一致；允许在编辑工作副本中记录主题变更以便保存或撤销。

`tests/theme_system.py` 验证六套主题的暂停重绘、实际背景像素、15行配色、同一处理器、主页面粒子/控制台禁用、主题资源往返、均匀面板间距、桌面两行卡片和减少动态效果。`tests/config_separation.py` 验证三首歌 × 六款主题、独立修改配置及新主题发现。此为自动化验证，不能替代人工听感或 Gear Link 验收。

## 素材与平台首页

新增 `app/assets/themes/*.svg` 是可编辑源素材。两张生成图片使用内置 `imagegen` 工具生成，原始输出保留在 Codex 的 generated_images 目录，项目使用未修改的副本：

- `app/assets/platform/sky-pianist-v1.png`，1312×1199，RGBA透明演奏小景；供五款非圣诞主题共用，页面中宽度28%，保持主题场景的辨识度。
- `app/assets/platform/music-islands-v1.png`，1672×941，首页独立“云海乐屿”插图。首页蓝青 UI、云海图片、呼吸/漂移光晕独立于单曲主题；减少动态效果时光晕静止。

生成提示词保存在 [ASSET_PROMPTS.md](ASSET_PROMPTS.md)。对比记录存放在本机新的 validation 目录，不覆盖历史图；最终选择较小的演奏小景版本，避免把背景插画变成页面主体。

2026-11-07起，六套预设使用 `app/assets/themes/v2/` 的18张生成插画，不再共用v1演奏者。旧SVG、共用钢琴小景和24帧动画作为兼容素材保留。`decorations.layout` 的sceneFit及百分比角色/挂件构图参数经白名单校验、导出与导入保留；详见 [v2素材契约](THEME_ART_V2.md)。
