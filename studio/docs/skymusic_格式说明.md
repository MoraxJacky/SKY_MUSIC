# `.skymusic` 与 `.skytheme` 文件协议 · v0.3

- 兼容：`schemaVersion=1`。容器为标准 ZIP；导出采用未压缩 STORE，导入支持 STORE / Chromium 的部分 DEFLATE。
- 必需文件：`manifest.json`、`score.json`、`playback.json`、`scene.json`。
- 可选素材：`assets/stage.webp`；不执行 ZIP 内脚本，禁止目录穿越和过量文件。

## `manifest.json`

```json
{"format":"skymusic-project","schemaVersion":1,"id":"song-unique","title":"曲名","subtitle":"副标题","author":"作者","durationMs":60000,"keyCount":15,"assets":[]}
```

## `score.json`

```json
{"mode":"free","gridIntervalMs":167,"events":[{"timeMs":0,"notes":[1,5,10],"durationMs":220,"velocity":88,"confidence":"user-corrected"}]}
```

- `timeMs`：从曲首计时的绝对毫秒时间；支持非均匀节奏。
- `notes`：1..15琴键，可多音同刻触发；空数组代表休止位置。
- `durationMs`：发音持续时间的估计值，**不等于视频原始按键持续时间**。
- `velocity`：MIDI式力度，1..127。原始 v7 数据没有独立力度，缺省为85。
- `confidence`：记录来源和人工修改状态，不保证自动识别正确。

## `playback.json`

```json
{"tuning":"C","rate":1,"sustain":0.45,"instrument":"piano"}
```

调性 `C`、`G` 和 `sky`（只针对原上传视频的参考音准，不是所有光遇场景固定音调）；速度0.25到2倍。

## `scene.json`

```json
{"id":"christmas","name":"CHRISTMAS NIGHT","accent":"#e8c88a","backgroundColor":"#1b2d45","snow":50,"glow":58,"motion":"ambient","customStage":false}
```

主题 id：`christmas` / `starlight` / `citylights`。可添加 `image:"assets/stage.webp"` 和 `customStage:true`，导入后自动加载歌曲对应背景。`citylights` 是原创测试主题，并非某部电影官方视觉素材。

## 单独主题包 `.skytheme`

ZIP 内只有 `manifest.json`（`format:"skytheme"`）和 `scene.json`，以及可选 `assets/stage.webp`。用于复用场景，不包含音乐。舞台图片由用户提供，建议先确认素材使用许可。

## 兼容注意

- MIDI / MusicXML 中的半音、跨八度和复杂和声必须适配15键，可能发生近似与八度折返。
- 导出再导入应尽可能保留绝对时间、和弦和力度；自动识别算法的正确性不由文件格式保证。
- 本地缓存不等于便携备份；跨设备分享请导出完整 `.skymusic`。
