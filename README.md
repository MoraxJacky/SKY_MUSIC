# SKY_MUSIC · Sky Music Studio

[打开音乐馆](https://moraxjacky.github.io/SKY_MUSIC/)

光遇 15 键音乐工作台，包含音乐库、钢琴试听、卷帘、逐拍谱、只读/编辑会话与项目导入导出。播放器采用原 v7 的字体比例、面板材质、4×8 清晰点阵和播放高亮。

圣诞、星光、暮光及自定义主题共用一份播放器模板，更换主题不会复制布局与交互代码。详细说明见 [模板与主题配置](studio/docs/PLAYER_TEMPLATE.md)，可导入 [海边月夜主题示例](studio/samples/moonlight-template.skytheme)。

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

构建后将 `studio/SkyMusicStudio_Standalone.html` 复制到根 `index.html`，提交推送 `main` 即由 GitHub Pages 发布。请先检查生成物和有关测试。构建不会自动重新生成 `builtins.js` 或钢琴嵌入数据，修改源数据时需保持一致。

本地 Codex 项目使用 `SkyMusicStudio/current/` 开发，经过测试后同步到本仓库。仓库保留原网站提交历史。自动音频/视频识谱仍是需要人工校对的实验功能，在线 Yamaha 音源依赖网络。
