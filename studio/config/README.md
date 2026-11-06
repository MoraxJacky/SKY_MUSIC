# 三类独立配置

| 修改目标 | 主文件 | 不应放入的内容 |
|---|---|---|
| 每首歌的数字谱 | `scores/<谱面ID>.json` | 主题、装饰、按钮和事件处理代码 |
| 所有单曲共用的交互规则 | `player-interactions.json`，入口 `src/39-player-interactions.js` | 歌曲 ID、具体音符、主题 ID、主题配色 |
| 预设配色、装饰、舞台资源 | `themes/<主题ID>.json`；精确旧版样式在 `themes/style-rules.json` | 数字音符、歌曲 ID、播放/编辑处理器 |

`library.json` 索引 `songs/*.json` 创作清单：歌曲元数据、卡片、`music` 谱面文件和 `theme` 主题文件引用。构建时将数字谱完整内嵌到主传播文件，主题仍只引用平台主题 ID。清单是源码组合配置，不是对外交换格式。

## 对外文件格式

| 后缀 | 职责 | 内容 |
|---|---|---|
| `.skymusic` | 完整单曲，主要传播文件 | `format: skymusic`、`schemaVersion: 2`；歌曲信息、首页卡片、播放初值、完整内嵌 `music` 谱面对象、`theme: {id}` |
| `.skytrack` | 独立数字谱面 | `format: skytrack`、`schemaVersion: 1`；15 键数字音符、毫秒时间、长度、力度、网格间隔、调性；不含主题或交互 |
| `.skytheme` | 平台主题 | 主题定义、元素编号映射、配色、装饰与资源；先在首页“主题仓库”导入，歌曲才可引用其 ID |

`.skymusic` 的 `music` 对象就是 `.skytrack` 全文，不依赖接收方额外找到谱面文件；`theme` 仅允许一个 `id`，不携带主题定义、资源或脚本。主题未录入时导入失败且不新增歌曲。六个内置主题预先安装。新主题使用独立 ID，不能以同 ID 静默覆盖已有主题。用户主题独立保存在 `sky-music-studio-themes-v1`；原曲库键保持不变。浏览器存储容量不足时录入会失败，不会假装成功。

主题使用 `elementRefs` 引用已声明的图像、符号、舞台帧、配色和效果元素。主题只是数据，沿用同一播放器和交互处理器，不执行主题脚本。自定义外观须先导出为新的 `.skytheme`，在平台录入后再分享单曲；完整单曲不会暗中创建主题。旧版 ZIP `.skymusic` 仍可导入；新导出主入口使用上述 JSON 格式。旧主题包继续保留编辑器兼容读写接口，不作为新主题注册格式。

生成的示例位于 `app/library/*.skymusic`、`app/library/scores/*.skytrack` 和 `app/library/themes/*.skytheme`。图像资源随平台内置；独立分享主题请用应用的 `.skytheme` 导出，包含实际资源。双击版也内嵌注册配置和资源，无需加载旁边文件。

## 换歌

1. 在 `scores/` 新建数字谱 JSON。格式参照现有文件，音符仍使用 1–15 数字编号。
2. 在 `songs/<ID>.json` 添加歌曲、卡片、`music: scores/<谱面ID>.skytrack` 和 `theme: themes/<主题ID>.skytheme`，再把清单路径加入 `library.json` 的 `entries`。
3. 重新构建。无需复制播放器页面或修改交互模块。

已有浏览器曲库中，同 ID 的已保存项目仍优先保留，避免覆盖用户修改。发布替换曲目时请分配新的歌曲 ID；仅修改源码文件不会迁移或清空个人曲库。

## 换主题

1. 修改已有 `themes/<ID>.json`，或复制一份后更换 `id`、`displayName`、配色和装饰。文件名与 ID 一致。
2. `appearance` 是共用颜色变量；`decorations` 决定图标、树、符号舞台/帧动画及资源路径。新增主题会自动进入主题选择器。
3. `defaults` 是一般主题初值；`initialOverrides` 保存原有首载外观的差异，同样集中在主题文件，不再写入歌曲清单。用户保存过的个人主题覆盖值仍优先保留。
4. 若要精确修改旧 v7 的专用样式，修改 `style-rules.json`。基础排版仍在 `app/styles.css`；其中的 `THEME_STYLE` 标记保留原级联位置，不要删除。

## 改交互

`player-interactions.json` 控制共用快捷键、卷帘窗口、细分格及选择器平滑滚动/可见范围。`src/39-player-interactions.js` 负责统一绑定、音域和音色选择器；播放引擎在 `20-audio.js`，编辑工作副本/保存实现复用 `45-workspace.js` 和 `47-edit-session.js`。这些模块服务全部歌曲和主题。

15 键和 8×4 逐拍布局目前是保留的产品约束，构建会校验。不要通过随意改网格数引入未实现的布局。

## 构建与生成物

在 `current/` 运行：

```powershell
python -X utf8 scripts/build.py
python -X utf8 scripts/configuration.py --check
```

构建会从独立配置生成：

- `app/js/studio-config.js`：交互参数和主题注册表。
- `app/js/builtins.js`：组合后的内置项目数据。
- `app/player-styles.css`：基础样式与独立主题样式的合成结果。
- `app/js/studio.js` 和两个独立 HTML：运行包。

上述合并是发布打包，不表示配置主源互相绑定。不要直接编辑生成文件。

原 `samples/*.json` 和便携样本保留为兼容导入/历史回归材料，不再作为内置曲库主源。新主文件按上面的完整单曲契约输出，旧 ZIP 格式继续兼容导入；已有个人库不会被文件拆分替换。

## 验证

`tests/config_separation.py --output <新的输出目录>` 检查：

- 单独修改谱面不会改主题或交互配置。
- 单独修改主题不会改谱面；修改交互不会改谱面或样式。
- 三首歌与六套主题的十八种组合复用相同播放和逐拍导航。
- 仅新增主题文件即可在真实 HTTP 页面中发现并应用，不改交互处理器。

旧版的原始交付、素材和历史验证记录仍保留在外层基线目录。

音量同属共用交互：`player-interactions.json.volume` 定义默认 25%、独立的整体输出增益 10（始终按 0–100% 线性缩放，初始值不参与标定）、25ms 过渡和 UI 控件 ID；具体值保存在单曲 `playback.volume`，无需为主题或歌曲新增处理器。UI 识别契约见 `docs/PLAYER_TEMPLATE.md` 的“音量交互和 UI 识别”。

谱面编辑弹窗共用 `editor.entry` 指向的 `src/46-score-console.js`，初始模式为 `editor.initialMode`。录制、单音符精细修改与数字谱生成复用相同工作副本及主题模板，新增歌曲无需新写编辑页面。

## 统一主题模板

新增主题先复制一份预设 JSON，继承 `themes/template.json`，只调整配色、材质、素材元素引用和 `keyFeedback` 参数。规范、兼容边界、六款主题对照和素材来源见 [THEMES.md](../docs/THEMES.md)。主题没有单独播放器、点击处理器或谱面；主页面按键点击统一通知外观渲染器，编辑控制台统一禁用粒子。

## 平台首页交互

`home-interactions.json` 单独保存首页轮播计时、卡片弹簧/翻转/视差、卡片进入播放器与播放器返回主页的展开/显露计时与噪声光雾参数，入口为 `src/41-home-experience.js`。它不包含数字谱、播放器状态或主题处理器；主题横幅仅读取六款平台预设作展示，不更改歌曲主题。详细行为见 [HOME_EXPERIENCE.md](../docs/HOME_EXPERIENCE.md)。

六主题插画v2的资源索引在 `themes/elements.json`，每套预设通过 `elementRefs` 引用自己的场景、双人小景和挂件。`decorations.layout` 只控制场景填充与角色/挂件百分比构图，由共享模板校验并应用；不能携带音乐或处理器。详细路径、来源及提示词见 [THEME_ART_V2.md](../docs/THEME_ART_V2.md)。

音量与延音共用 `valuePicker` 的单格竖向平滑选取；0–100 有界、不循环。`volume.controlId` / `sustain.controlId` 指向可识别的 spinbutton。通知生命周期归共用交互 `notifications`，颜色由模板解析器独立提供；倍速末端 `selectors.speedMinimumRows` 保留两个真实选项。

`player-interactions.json.scoreEntrance` 控制卡片过渡后的谱面视觉入场时序、上浮距离与盖章幅度。该配置不含歌曲ID、音符或主题颜色；六主题共用一套展示逻辑。用户操作立即结束入场，音乐位置与编辑行为由既有控制器继续处理。
