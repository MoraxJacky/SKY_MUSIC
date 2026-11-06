# 音色、12 大调与光遇基准

## 新音色

离线：原有经典钢琴，加竖琴、八音盒、长笛、尼龙吉他。后四种来自 FluidR3 GM 的 CC BY 3.0 US MP3 渲染，每种内嵌 C4–B6 共 36 个半音。无需网络即可在独立 HTML 使用。

在线：保留 Yamaha C5 / Salamander，新增电钢琴、小提琴、大提琴、弦乐合奏、合唱。后五种按需加载同一固定版本的 FluidR3 GM 单音文件，每种加载 36 个半音；不执行外部音源 JavaScript。Yamaha 使用已有的 12 个小三度间隔采样。原有经典钢琴使用已有的 20 个采样。需要的非采样根音通过十二平均律重采样得到。

C 大调到 B 大调的 15 键实际覆盖 MIDI 60–95。各音色使用同一个 `noteMidi()`，按 `2 ** ((目标 MIDI - 采样根 MIDI) / 12)` 计算播放速率，不把升降音近似到白键。在线音色必须完整加载后才启用；失败回退经典钢琴并提示，不以部分样本冒充加载成功。网络服务未来的可用性不作永久保证。

## 光遇原调的范围

新增 `sky-original` 预设，明确表示**普通钢琴 C4–C6 基准**，与 C 大调同音高。它与 12 个大调共存；旧工程 `sky` 值仍沿用既有归一化为 C 的兼容规则，不改历史文件。

官方教程确认常规谱面是 15 音、2 个八度；Sky Music 制谱项目说明普通钢琴使用 C4–C6，而部分其他乐器有不同八度。没有找到能证明“所有光遇乐器和季节都共享一个固定原调”的官方资料，因此不将 C4–C6 宣称为所有乐器的绝对音域，也不按季节名自动切调。

社区记录的规则是：实际调性随背景音乐或选中的乐谱变化。作为手动选择的参考，Queendom 对应 D♭；Hidden Dance / Waltz of the Plains 对应 D；Waltzing in the Rain 对应 E♭；Soft Blanket 对应 E。这些属于社区记录，游戏更新后需要重新核对，不能推断整季所有乐谱同调。

来源（查询于 2026-11-06）：

- 官方乐谱教程：https://thatgamecompany.helpshift.com/hc/en/19-sky-pc-steam/faq/1347-how-do-i-use-music-sheets-in-sky/
- Sky Music 基准说明：https://github.com/sky-music/sky-python-music-sheet-maker/blob/master/README.md
- 社区调性记录：https://sky-children-of-the-light.fandom.com/wiki/Music_Key
- 采样来源与许可：https://github.com/gleitz/midi-js-soundfonts/blob/gh-pages/README.md
- Salamander 作者与许可：https://github.com/Tonejs/audio/blob/master/salamander/README

## 选择器和验证

音色选择器采用共用播放器主题变量。展开框以原音色按钮为固定中心，上下最多各显示两个选项；滚动时基准框不移动，到首末项时边界收至基准框，不补空白；滚轮输入按小幅距离累积并平滑收敛，停下后对齐就近完整格，不滚动外侧页面。选定、Escape、点击外侧和返回音乐库都会关闭。音域与音色面板互斥打开。

新增模块：`src/18-instruments.js`。构建会嵌入 `app/js/instrument-samples.js`。更新新增采样时，先运行 `python -X utf8 scripts/fetch_instruments.py`，再运行 `--verify` 检查原文件、内嵌数据及清单一致，最后运行常规构建。原 `piano-samples.js`、内置乐谱与历史基线不改。

测试记录写入外层新建的 validation 目录。样本解码、Web Audio 节点和播放速率验证不等同于人工听感验收；在线真实请求和故障回退分别记录。

真实采样检查发现上游 FluidR3 小提琴的 B♭6（MIDI 94）MP3 是静音。加载器逐个检测有效声音，静音项由最近有效根音按等温半音比离线重采样补齐，并记录 `repairedNotes`；原始下载文件不被改写。这样所有大调的高音均有实际声音，不把文件存在当成音色完整。

配置拆分后，`18-instruments.js` 保留音色目录和加载；选择器、共用平滑滚轮和单曲事件绑定统一位于 `39-player-interactions.js`，交互参数来自 `config/player-interactions.json`。
