# skymoni 对应源码

这里公开 skymoni 网站使用版本的前端、服务端和社区服务源码，以及历史版本的源码下载。

网站：[skymoni.com](https://skymoni.com/) · [开源许可](https://skymoni.com/open-source.html) · [源码版本下载](https://github.com/skyjjgw/skymoni-source/releases)

## 当前版本

| 组件 | 在线版本对应源码 | 浏览目录 |
| --- | --- | --- |
| 前端 | [App 登录与更新版，2026-10-22](https://github.com/skyjjgw/skymoni-source/releases/download/app-native-login-20261022/source-skymoni-app-native-login-20261022.zip) | [frontend/web](frontend/web) |
| 服务端 | [v1.0.0-rc.39-skymoni.165-app-native-login](https://github.com/skyjjgw/skymoni-source/releases/download/app-native-login-20261022/source-skymoni-app-native-login-20261022.zip) | [backend](backend) |
| 独立社区服务 | 随当前前端源码包提供 | [frontend/community-service](frontend/community-service) |

目录按组件保留公开源码包的结构。编译后的 `dist` 不提交到 Git；原始版本压缩包完整保存在 Releases，下载内容与原网站提供的文件一致。

## 构建

前端需要 Node.js 22+ 和 Bun，使用仓库的 `bun.lock`：

```sh
cd frontend/web
bun install --frozen-lockfile --ignore-scripts
bun run build
```

安装应使用空的 `node_modules`，不要向其他包管理器创建的依赖树叠装。开发和构建命令会先校验 React 与 renderer 版本及所有已安装 React 使用方的实际解析路径，拒绝重复运行时。校验脚本的回归测试可用 `bun run test:react-runtime` 执行。

前端构建会使用 `frontend/moni` 与 `frontend/pkg` 内随包提供的构建数据，保留这些目录的相对位置。

服务端需要 Go 1.25.1+。先构建上述前端，再将其 `dist` 内容放入 `backend/web/dist`，然后：

```sh
cd backend
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X github.com/QuantumNous/new-api/common.Version=v1.0.0-rc.39-skymoni.163-app-beta" -o new-api .
```

独立社区服务的构建与运行文件位于 `frontend/community-service`。各组件内原有构建说明及修改记录一并保留；较早说明中的旧版本号对应当时的修改。

部署所需的数据库、运行配置和密钥由部署者自行提供。

## App 内测（2026-10-22）

社区账号可申请内测，管理员在用户管理的“App 内测管理”中审核、手动分配或调整额度。注册、申请不赠送内测额度；余额、冻结预扣、实际使用及审计流水均位于独立的 `app_beta_*` 表，不回退到中转钱包或订阅。重复管理员操作、结算和退款通过唯一操作键保持幂等，管理员变更同时校验版本。意外中止留下的冻结请求保留审计，不自动猜测费用或赠送余额。

专用入口默认关闭。只有配置 `SKYMONI_APP_BETA_ENABLED=1`、`SKYMONI_APP_BETA_CERT_SHA256`（正式 App 签名证书 SHA-256，支持逗号分隔轮换）和 `SKYMONI_APP_BETA_MODELS=*` 后才接收设备注册。`*` 跟随中转已发布聊天模型及账号可用分组；也可填写模型 ID 列表缩小范围。图像、嵌入、重排和音视频专用模型不作为文字聊天入口。兼容 Chat Completions 与 Responses-only 模型，使用既有定价和额度换算。

Android 包名固定为 `com.skyjjgw.independent.ski`。在服务端验证 Android 官方证明链、撤销列表、TEE/StrongBox、锁定验证启动、包名与固定签名后才发出待绑定设备会话。用户须在已开通内测的社区账号内确认 App 显示的五分钟配对码。每次请求签名覆盖方法、路径、时间、随机 nonce、正文散列和会话散列；只有 bearer token、普通 API Key、请求头或来源标记均不能使用内测钱包。最多三台设备，网页可移除；账号停用/内测暂停即时拦截，重新审核需重新绑定。所有凭据仅通过 HTTPS，私钥不可导出，正式部署不能信任公共 debug 签名。

本期接口仅开放文字聊天，上限为每请求 128 条消息、256 KiB 正文、4096 输出 tokens。设备不支持受信任证明或撤销服务不可达时拒绝准入，不降级为可伪造的标记。Keystore 证明与请求签名提高 App 身份保证，不承诺对已完全受控的合法设备提供绝对防滥用保证。

安全参考：[Android Key Attestation](https://developer.android.com/privacy-and-security/security-key-attestation)、[OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)、[Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[ASVS 5.0.0](https://owasp.org/projects/asvs)。本次只验证相关鉴权、授权、过期、防重放、额度隔离与并发/退款控制，不声明整站已完成 ASVS 认证。

## 历史版本与校验

历史包按[服务端](https://github.com/skyjjgw/skymoni-source/releases/tag/backend-archives-20261021)、[前端](https://github.com/skyjjgw/skymoni-source/releases/tag/frontend-archives-20261021)、[移动端](https://github.com/skyjjgw/skymoni-source/releases/tag/mobile-archives-20261021)分组。

[SOURCE_ARCHIVES.json](SOURCE_ARCHIVES.json) 记录每个文件的下载地址、大小和 SHA-256；[SHA256SUMS](SHA256SUMS) 可用于验证下载。网站原有的版本化源码链接会跳转到对应的 GitHub 下载。

后续发布请同步更新对应组件的源码目录，并将版本源码包上传到新的 GitHub Release，记录文件大小与 SHA-256。网站的源码入口应指向该版本，旧地址保留跳转；服务器仅保留索引和跳转配置，不再长期存放源码压缩包。

## 许可与来源

基于 [QuantumNous/new-api](https://github.com/QuantumNous/new-api)，保留 New API contributors 的版权及组件声明。本站修改按原项目的 AGPL-3.0-or-later 条款提供；完整许可见 [LICENSE](LICENSE)。独立组件及第三方素材同时遵循各自文件中的许可声明。

此仓库仅发布原网站已经提供的对应源码。私有恢复仓库、线上账号、运行数据库和运维凭据不属于本仓库。
## Skivu App account and update interfaces

The native account authorization, narrow chat and fixed APK update contracts are
documented in [docs/SKIVU_APP_API.md](docs/SKIVU_APP_API.md). Native account
sessions retain ordinary relay session limits. Chat can select the existing
wallet/subscription preference or the administrator-approved account-beta ledger;
the separate legacy hardware-attested API gate is unchanged.
