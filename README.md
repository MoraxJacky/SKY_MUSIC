# SKY_MUSIC · Sky Music Studio

[打开音乐馆](https://moraxjacky.github.io/SKY_MUSIC/)

完整半音、多音轨乐理工作台，保留原15键主题播放页，点击曲谱编辑进入全屏编曲页，支持音乐时间、变速/拍号、三种录制、多轨混音及MIDI导入导出。旧15键谱继续可读，光遇适配生成独立副本。详见[工作台说明](studio/docs/MUSICAL_WORKBENCH.md)。

六款光遇意象预设（圣诞雪夜、星光沙漠、霞谷落日、云野浮岛、雨林幽光、禁阁星图）及自定义主题共用一份播放器模板，更换主题不会复制布局与交互代码。首页使用独立的云海插图、蓝青 UI、呼吸光晕与两行自适应卡片。详细说明见 [模板与主题配置](studio/docs/PLAYER_TEMPLATE.md)，可导入 [海边月夜主题示例](studio/samples/moonlight-template.skytheme)。

提供 5 种离线、6 种在线音色，支持全部 12 大调及普通光遇钢琴 C4–C6 基准。完整工作台按轨设置音色、音量和静音/独奏；调性与移调分开控制。来源、许可和基准边界见 [音色说明](studio/docs/INSTRUMENTS_AND_SKY.md)。

数字谱、共用交互、主题分别由 [config/](studio/config/README.md) 的独立文件控制。新增歌曲或主题后重新构建即可，无需复制单曲页面与处理器。

## 工程

- `index.html`：GitHub Pages 的完整独立网页。
- `studio/src/`：应用源码，包含共用模板 `38-player-template.js`。
- `studio/app/`：开发页面、样式、内置数据与素材。
- `studio/samples/`：三首内置曲谱、项目包和主题示例。
- `studio/tests/`：数据、交互、浏览器、音频和共享模板检查。
- `studio/legacy/`：v7 原始备份。
- `studio/licenses/`、`studio/sources/`：音源来源与许可。

## 开发

```sh
cd studio
python -X utf8 scripts/build.py
python -X utf8 scripts/verify.py
node tests/v04-interactions.cjs
```

构建后将 `studio/SkyMusicStudio_Standalone.html` 复制到根 `index.html`，提交推送 `main` 即由 GitHub Pages 发布。请先检查生成物和有关测试。构建会从 `studio/config/` 生成内置曲库、主题/交互注册表及合成样式；用 `scripts/configuration.py --check` 校验一致性。音源嵌入数据仍需独立生成/检查。

本地 Codex 项目使用 `SkyMusicStudio/current/` 开发，经过测试后同步到本仓库。仓库保留原网站提交历史。自动音频/视频识谱仍是需要人工校对的实验功能，在线音色依赖网络，失败时回退经典钢琴。

单曲传播格式：`.skymusic` 内嵌 `.skytrack` 数字谱并仅引用已录入的 `.skytheme` ID。开发与字段说明见 [配置指南](studio/config/README.md)。

主题均继承 [统一参数模板](studio/config/themes/template.json)，深浅、渐变、高亮、卷帘、挂件和单曲点击粒子均为独立外观数据。控制台不生成粒子。规范与 [生成素材/提示词](studio/docs/ASSET_PROMPTS.md) 见 [主题说明](studio/docs/THEMES.md)。
