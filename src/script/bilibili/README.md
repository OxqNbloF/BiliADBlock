# Bilibili 增强

本仓库的自定义功能在 `dev` 分支维护，`master` 用于对齐上游 `kokoryh/Sparkle`。Loon 用户请使用 [播放兼容版配置](https://raw.githubusercontent.com/OxqNbloF/BiliADBlock/refs/heads/dev/release/loon/plugin/bilibili-playback-compatible.lpx)；配置中的自定义脚本同样从 `dev` 加载。旧的 `master` 订阅地址需要手动更换。

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

- **排查版播放恢复，但视频下方又出现广告**

  使用 `release/loon/plugin/bilibili-playback-compatible.lpx`（“哔哩哔哩增强·播放兼容版”）。它以排查版为基础，增加独立的 `dist/bilibili.video-ads.js`，只处理视频详情和相关推荐的明确广告字段、广告卡片及商品模块。普通推荐、未知字段和播放相关配置保留；没有广告或解析失败时原样放行，改写时保留原有 gRPC 压缩方式，不覆盖响应头和 HTTP/2 trailers。

  兼容版保留标准版的“我的”页精简（含 iPad），使用同一份 `bilibili.mine.jq`，仅匹配 `/x/v2/account/mine` 和 `/x/v2/account/mine/ipad` 响应。

  兼容版不启用空降助手、请求代发、播放地址/播放进度/弹幕改写、gRPC 模拟响应或 P2P 拦截。它需要为视频详情响应重新加入 `grpc.biliapi.net` 的 MitM，因此仍需真机验证。评论区广告暂不在此版本处理范围内。

  先停用标准版和排查版，再单独启用兼容版。新配置必须配合新 `bilibili.video-ads.js` 使用；如果代码尚未发布，远程脚本地址不会自动获得本地修改，需要在 Loon 中绑定本地新脚本。不要同时启用多份 B 站插件。

  2026-09-02 提供的非排查版 HAR 共 206 条记录：`ViewProgress` 用时 184 ms，两次 `DmView` 用时 83/245 ms，Chronos 下载地址没有被改成 GitHub；`Teenagers/ModeStatus` 与 `Search/DefaultWords` 的模拟响应却返回 HTTP 404、空正文。抓包未包含 `View`、`PlayView` 和视频媒体分片，不能据此确定唯一阻塞点，也不能用该抓包验证广告字段；广告过滤使用合成 Protobuf 样本验证，抓包用于回放验证被排除的接口原样放行。HAR 文件未复制到仓库。

- **Loon 打开视频后一直转圈**

  若标准版仍卡住，可改用同目录的 `bilibili-playback-safe.lpx`（显示名称为“哔哩哔哩增强·播放排查版”）。先关闭原插件及其他 B 站改写插件，再单独启用排查版，完全退出哔哩哔哩后测试同一视频。不要同时启用标准版和排查版。

  排查版保留首页排序、热搜开关、开屏和首页信息流去广告；移除了所有 gRPC 请求/响应脚本及模拟响应，不再替换 Chronos 组件，也不干预 P2P。空降助手、评论过滤、视频页去广告、后台播放/投屏增强等标准版功能不包含在排查版中。它仅为首页和搜索保留 `app.bilibili.com`、`api.bilibili.com` 的 MitM 主机名，不会取消其他插件或主配置已有的 MitM 设置。

  标准版代码包含替换 Chronos ZIP 地址、MD5 和签名的逻辑，但上述 HAR 未观察到这项替换，因此不能认定它是本次卡顿根因。排查版恢复播放后，应以它为基线逐项恢复需要的功能；配置测试通过不能证明真机起播恢复。

  当前配置已移除对 `api.biliapi.com`、`app.biliapi.com`、`api.biliapi.net`、`app.biliapi.net` 的整域拒绝规则，并将“优化评论区加载”限定为评论接口。视频详情请求由 App 正常发起，不再由脚本代发和重试；详情响应的去广告处理仍保留。

  这是配置修复，需要替换正在使用的 `.lpx` 或 `.sgmodule` 文件，仅刷新 JS 不会生效。未发布的本地配置也不会通过远程订阅更新自动获取。更新后完全退出哔哩哔哩，再打开视频测试。若仍转圈，暂时关闭“空降助手”进行对比，并记录 `View/View`、`PlayViewUnite` 和 `DmSegMobile` 请求的耗时与错误信息，以区分详情接口、播放接口和弹幕等待。

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
