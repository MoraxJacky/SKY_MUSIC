# 六主题插画素材 v2

2026-11-07 使用内置 `image_gen` 生成18张新图：每套一个场景、一张含两位角色的小景、一张物件挂件。工具未开放模型选择，不能确认底层是否标识为用户提到的 image-2.6。图片是生成的主题演绎，不是官方游戏截图或素材提取。

| 主题 | 场景、装扮和物件 | 双人小景 |
|---|---|---|
| 圣诞雪夜 | 雪屋、冰湖、烛光、冬青、雪花斗篷 | 红色冬装光之子与雪花斗篷光之子，一起堆雪小人 |
| 星光沙漠 | 紫蓝沙丘、遗迹、玻璃罩玫瑰、狐狸、黄围巾 | 小王子弹尤克里里，光之子抱狐狸相伴 |
| 霞谷落日 | 落日冰湖、天文星环、红色赛旗、暖金建筑 | 双子发型意象的两位光之子，拉琴与打拍子 |
| 云野浮岛 | 圣岛钟群、云海、瀑布、遥鲲和金色蝴蝶 | 竖琴光之子与遥鲲斗篷光之子 |
| 雨林幽光 | 树屋、雨幕、发光菌菇、水母、伞与灯 | 两位光之子共伞，其中一位持灯 |
| 禁阁星图 | 悬浮石台、星图、灵鲲、记忆灯 | 持灯与读书的两位光之子 |

## 取材依据

选材结合场景资料和社区反复出现的讨论，不声称统计出“讨论最多”的热度排名。具体人物姿势、组合、材质与构图属于本项目的生成设计。

- 圣诞活动的雪屋、冬装和雪花斗篷：[Days of Feast](https://sky-children-of-the-light.fandom.com/wiki/Days_of_Feast)、[2025活动和雪小人讨论](https://www.reddit.com/r/SkyGame/comments/1pei7w2/blogpost_frozen_fun_during_days_of_feast/)。
- 玫瑰、小王子、狐狸与音乐任务：[Season of The Little Prince](https://sky-children-of-the-light.fandom.com/wiki/Season_of_The_Little_Prince)、[星光沙漠](https://sky-children-of-the-light.fandom.com/wiki/Starlight_Desert)。
- 霞谷冰湖、城堡与长老意象：[Valley of Triumph](https://sky-children-of-the-light.fandom.com/wiki/Valley_of_Triumph)。双人装扮是长老发型意象，不将两位小人标为游戏长老本体。
- 云野圣岛的钟群和遥鲲：[Sanctuary Islands](https://sky-children-of-the-light.fandom.com/wiki/Sanctuary_Islands)、[社区钟群讨论](https://www.reddit.com/r/SkyGame/comments/ynnar9)。
- 雨林菌菇、树屋和共伞：[Hidden Forest](https://sky-children-of-the-light.fandom.com/wiki/Hidden_Forest)、[Season of Assembly](https://sky-children-of-the-light.fandom.com/wiki/Season_of_Assembly)、[雨林与伞的社区讨论](https://www.reddit.com/r/SkyGame/comments/cz4l01)。
- 禁阁灵鲲及记忆灯联系：[Mantas](https://sky-children-of-the-light.fandom.com/wiki/Mantas)。

## 文件和生成记录

发布资源为 `app/assets/themes/v2/<主题ID>-scene-v2.webp`、`-companions-v2.webp`、`-charm-v2.webp`。六个场景原尺寸1672×941，双人/挂件原尺寸1536×1024；12位角色是人工查看生成结果后的记录，不是自动识别人像的测试结论。

原始PNG完整复制到项目外层 `SkyMusicStudio/artwork/2026-11-07/theme-art-v2/`，保留原生成文件；未覆盖旧素材。WebP只作网页编码，质量92、原生尺寸，没有裁切、重绘、调色或修改Alpha；18张发布资源合计3,434,762字节。原图和发布图的SHA-256、尺寸、路径记录在 [素材清单](../sources/theme-art-v2-manifest.json)。完整18条提示词保存在 [提示词集](../sources/theme-art-v2-prompts.json)，原图目录也留存同一提示词集。

## 接入与兼容

六个预设分别通过 `elementRefs` 引用新场景、双人和挂件；封面与舞台共用同一场景。旧元素ID如 `christmas.cover` 映射到新版预设素材，已保存卡片无需迁移。旧PNG/SVG/WebP和24帧圣诞动画文件均保留，独立HTML继续携带旧帧库供旧主题兼容。

共用 `decorations.layout` 只声明 `sceneFit` 与角色/挂件的百分比宽高和位置。构建和导入白名单校验后由同一个模板应用，不绑定歌曲、播放时间、事件或编辑历史；无布局字段的旧主题使用原来的contain和小人尺寸。用户自定义舞台图片仍按contain展示。

主页面舞台、首页主题横幅和主题设置预览读取同一资源。`.skytheme` 导出打包当前场景、双人、挂件并保留布局；导入后仍通过原平台注册流程，不自动修改曲库。舞台和挂件层均不接受指针事件。

## 验证范围

`tests/theme_art_assets.py --output <新目录>` 检查18张发布图的哈希、原生尺寸、透明通道和六套独立引用；若本机原图存在，同时检查原图哈希及Alpha逐字节保留。`theme_system.py` 检查六主题暂停时卷帘刷新、相同控件事件、音乐与定位隔离、完整铺图、主题资源/布局往返与按键反馈；`config_separation.py` 检查三首歌×六套主题共享交互；`home_experience.py` 检查首页及预览。实际图像主题辨识和两位角色的造型由逐张视觉检查确认，自动化不代替审美验收。
