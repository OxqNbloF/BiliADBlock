# Bilibili 增强

## 参数说明

| 参数             | 可选值 / 格式               | 默认值 | 说明                                                                     |
| ---------------- | --------------------------- | ------ | ------------------------------------------------------------------------ |
| 动态最常访问     | `auto` / `show` / `hide`    | `auto` | `auto`：仅当列表中存在直播状态时显示；`show`：始终显示；`hide`：始终隐藏 |
| 显示热搜         | `0` / `1`（Loon 使用开关） | `0` | 关闭时隐藏热搜；开启时保留搜索广场原始响应 |
| 首页标签顺序     | 标签名，以 `>` 或逗号分隔 | `live>recommend>popular>anime>film` | 支持英文或中文标签名；重复项去重，未知项忽略，漏填项按默认顺序追加 |
| 创作中心         | `0` / `1`                   | `0`    | `0`：隐藏；`1`：显示                                                     |
| 过滤置顶评论广告 | `0` / `1`                   | `1`    | `0`：关闭；`1`：开启                                                     |
| 优化评论区加载   | 配置为 `#` 时关闭           | 开启   | 默认开启；配置为 `#` 时关闭                                              |
| 空降助手         | 配置为 `#` 时关闭           | 开启   | 默认开启；配置为 `#` 时关闭                                              |
| 空降助手策略     | 策略名称                    | DIRECT | 默认直连；建议配置为代理策略（视网络环境而定）                           |
| 日志等级         | `1` / `2` / `3` / `4` / `5` | `4`    | `1`：DEBUG；`2`：INFO；`3`：WARN；`4`：ERROR；`5`：OFF                   |

## 常见问题

- **如何调整首页排序和热搜？**

  在插件参数中设置“首页标签顺序”，例如 Surge 填写 `recommend>live>popular>anime>film`，Loon 填写 `recommend,live,popular,anime,film`。中文标签名支持“推荐、直播、热门、动画、影视”（输入时使用逗号或 `>` 分隔）。默认仍选中“推荐”标签，排序不会更改默认选中项。

  “显示热搜”默认关闭；Surge 设置为 `1`、Loon 打开开关即可显示。该开关控制搜索广场内容，不控制搜索框默认提示词。

  两项功能仅修改首页标签和搜索广场响应，不发起额外网络请求，不改动播放地址、视频详情、弹幕或媒体分片。异常响应会原样放行。

  更新时需要同时更新插件配置和 `dist/bilibili.json.js`，仅刷新旧配置引用的脚本无法恢复参数。首页规则引用本仓库 `OxqNbloF/BiliADBlock` 的脚本；尚未发布时，需先将该规则的脚本路径替换为本地修订脚本，才能测试本地版本。更新后完全退出哔哩哔哩再打开，避免旧页面缓存影响结果。

- **不显示弹幕**

  卸载重装最新商店版哔哩哔哩APP，MitM添加主机名 `-raw.githubusercontent.com` 后重试

- **是否支持Script Hub？**

  不支持

## 支持的APP

| Surge                                                                                                                  | Loon                                                                                                                                                                                   | Egern                                                                                                                                                                               | QuantumultX | Shadowrocket |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------ |
| [模块地址](https://raw.githubusercontent.com/kokoryh/Sparkle/refs/heads/master/release/surge/module/bilibili.sgmodule) | [一键安装](https://www.nsloon.com/openloon/import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Fkokoryh%2FSparkle%2Frefs%2Fheads%2Fmaster%2Frelease%2Floon%2Fplugin%2Fbilibili.lpx) | [一键安装](https://egernapp.com/modules/new?url=https%3A%2F%2Fraw.githubusercontent.com%2Fkokoryh%2FSparkle%2Frefs%2Fheads%2Fmaster%2Frelease%2Fsurge%2Fmodule%2Fbilibili.sgmodule) | 不支持      | 不支持       |

## 特别鸣谢

- [@app2smile](https://github.com/app2smile/rules)
- [@BiliUniverse](https://github.com/BiliUniverse/Universe)
- [@Maasea](https://github.com/Maasea/sgmodule)
