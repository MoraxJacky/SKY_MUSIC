# 2026-11-07 共享交互与主题一致性修复

本次为current增量更新，历史交付与截图未覆盖。

通过隔离Edge自动测试（证据目录均在validation/2026-11-07）：
- home-chrome-final：首页桌面/窄屏固定导航与实际滚动渐隐、筛选键盘交互、计数对比度、导入卡片简化居中、主题按钮阴影。
- shared-roll-speed-002：六主题×四窗口，自动播放、全局进度、谱面拖动、自然结束均固定完整末屏；三种宽度静止鼠标可持续滚动倍速末端。
- shared-roll-tail-002、shared-roll-playback-002、stable-speed-002：既有卷帘与倍速回归。
- center-key-entrance-002：六主题按键以各自中心缩放，入口/中断与谱面数据保持。
- theme-surface-context-003：六主题图例色差与对比、导出/歌曲信息/保存弹窗同步（含雨林纯色材质）、首页恢复平台配色。
- save-export-layout-001：六主题统一留白与边界对齐；卡片标签/中英标题；另存为后实际下载两种文件、谱面一致、原曲不变、稍后导出及返回首页。
- shared-polish-notifications-001、shared-polish-controls-001：显式通知与播放器控件回归。

configuration --check、verify、validate_project、node --check和v04-interactions均通过。浏览器测试使用隔离临时用户目录；当前沙箱内浏览器启动挂起，转用允许的隔离进程执行后通过，未接触日常浏览器存储。首次测试的启动时序与雨林纯色材质断言已修正，失败目录保留。实际听感、Gear Link与Windows宏未重新验收。
