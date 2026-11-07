# 乐理工作台验证 · 2026-11-07

自动验证通过：configuration.py --check、verify.py、validate_project.py、node --check app/js/studio.js、v04-interactions.cjs。

使用独立无头Edge及真实WebAudio运行以下测试（均不覆盖历史输出）：

| 测试 | 证据目录（SkyMusicStudio/validation/2026-11-07/） | 范围 |
|---|---|---|
| tests/music_workbench.py | music-workbench-release-001 | Tick反算、变速、旧曲毫秒、MIDI往返、XML三连音/连接、真实多键和弦、映射、新建、导出、移动端 |
| tests/music_gestures.py | music-gestures-release-001 | 鼠标绘制、移动、拉长、框选、多选、复制粘贴、参数、撤销、BPM与非法拍号 |
| tests/music_recording.py | music-recording-release-001 | 自由/节拍录制、独立松开、覆写边界、双音源、静音独奏、连接、循环清音 |
| tests/music_safety.py | music-safety-release-001 | 正常过渡、六主题、旧库备份、坏记录保留、坏JSON防覆盖、2万音符性能 |
| tests/music_adaptation_fallback.py | music-extra-release-003 | 独立光遇副本、和弦不同长度保留、网络阻断音源离线回退 |

复现浏览器测试：python -X utf8 tests/对应脚本.py --output 新的绝对输出目录。需要Playwright及Edge。每次使用新目录。

尚需人工：扬声器/耳机长音音质、节拍器听感同步、多音色平衡、真实键盘录制延迟、触屏真机与Gear Link。自动测试记录了声音调度和清音，但不能证明听感、设备延迟或光遇游戏实际表现。复杂XML重复/装饰不自动演奏展开；详情见MUSICAL_WORKBENCH.md。


## 播放页与编辑台边界修正

2026-11-07：原单曲播放布局恢复，完整工作台仅从曲谱编辑打开。测试脚本已按此入口修正，不再将全屏工作台当成默认播放页。新增player_editor_boundary.py覆盖六主题、进入/退出、原始谱不被放弃操作改写、编辑与播放位置隔离、保存/另存为、完整音符调度与停止清音。证据player-editor-boundary-001；编曲回归player-restored-model-001、player-restored-gestures-001、player-restored-recording-001、player-restored-adaptation-001。原播放页的15键图样为完整谱的显示投影，未改写或量化权威谱面。
