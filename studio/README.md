# Sky Music Studio · 当前开发工程

本工程从 v0.4 基线继续开发，原始版本记录保留在 `README_v0.4.md`，当前行为以本 README 和 `docs/PLAYER_TEMPLATE.md` 为准。未重标原始交付版本。

## 运行与使用

双击 `SkyMusicStudio_Standalone.html`、中文独立版或 `Start_Windows.cmd`。模块化入口为 `app/index.html`，开发时用本机 HTTP 服务打开。

- 首页使用独立“云海乐屿”插图、蓝青 UI 与缓慢呼吸光晕；桌面三列、两行卡片高度随窗口调整，更多曲目向下滚动。
- 每次进入单曲从0开始，刷新回音乐库首页；已保存的曲谱、主题与试听参数保留。
- 单曲默认只读。点击“曲谱编辑”打开独立控制台，即刻录制、精细修改、谱面生成共用同一工作副本。关闭必须选择保存、另存为或不保存。
- 控制台与主播放器的进度、卷帘起点和窗口相互独立。单曲页8×4逐拍谱；控制台分A/B两个8×2段。
- 内置曲目不能删除；副本、另存与导入曲目有独立身份，可删除。原曲库键和旧文件兼容路径保持不变。
- 音域、音色、倍速等均使用共享控件。音域横向循环滚动；音量初始25%，按0–100%线性缩放，延音调节释放与混响。

## 六款主题

圣诞雪夜、星光沙漠、霞谷落日、云野浮岛、雨林幽光、禁阁星图继承同一 [主题模板和参数规范](docs/THEMES.md)。主题配置包含颜色深浅、渐变、高亮、卷帘配色、场景/挂件与单曲点击粒子，不包含谱面或独立交互处理器。控制台不生成粒子。

`config/themes/template.json` 是主题共同起点，`config/themes/elements.json` 是素材/配色元素库。新增主题只改参数与引用，不复制播放器页面。图片的生成方式、路径和完整提示词见 [素材记录](docs/ASSET_PROMPTS.md)。

歌曲数字谱、主题、交互规则分别存放在 [独立配置目录](config/README.md)。`.skymusic` 传播完整单曲，内嵌 `.skytrack` 全文并引用平台录入的 `.skytheme`；旧ZIP文件继续兼容。

## 构建与验证

在本目录运行：

```powershell
python -X utf8 scripts/build.py
python -X utf8 scripts/configuration.py --check
python -X utf8 scripts/verify.py
python -X utf8 tests/validate_project.py
node --check app/js/studio.js
node tests/v04-interactions.cjs
```

浏览器回归需要 Playwright 和 Edge；`tests/theme_system.py`、`tests/layout_rhythm.py`、`tests/config_separation.py` 均通过 `--output <新的目录>` 保存结果，不覆盖历史截图。旧测试可能仍引用已删除的旧控件，不能把旧脚本断言当作当前行为。

音频/视频自动识谱仍是需人工校对的实验功能；自动化验证不等于人工听感或 Gear Link 验收。
