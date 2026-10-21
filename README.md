# skymoni 对应源码

这里公开 skymoni 网站使用版本的前端、服务端和社区服务源码，以及历史版本的源码下载。

网站：[skymoni.com](https://skymoni.com/) · [开源许可](https://skymoni.com/open-source.html) · [源码版本下载](https://github.com/skyjjgw/skymoni-source/releases)

## 当前版本

| 组件 | 在线版本对应源码 | 浏览目录 |
| --- | --- | --- |
| 前端 | [社区搜索框修复版，2026-10-21](https://github.com/skyjjgw/skymoni-source/releases/download/frontend-archives-20261021/frontend-source-skymoni-community-search-focus-20261021.zip) | [frontend/web](frontend/web) |
| 服务端 | [v1.0.0-rc.39-skymoni.162-creator-live-access](https://github.com/skyjjgw/skymoni-source/releases/download/backend-archives-20261021/backend-source-skymoni-creator-live-access-20261020.tar.gz) | [backend](backend) |
| 独立社区服务 | 随当前前端源码包提供 | [frontend/community-service](frontend/community-service) |

目录按组件保留公开源码包的结构。编译后的 `dist` 不提交到 Git；原始版本压缩包完整保存在 Releases，下载内容与原网站提供的文件一致。

## 构建

前端需要 Node.js 22+ 和 pnpm：

```sh
cd frontend/web
pnpm install --frozen-lockfile
pnpm build
```

前端构建会使用 `frontend/moni` 与 `frontend/pkg` 内随包提供的构建数据，保留这些目录的相对位置。

服务端需要 Go 1.25.1+。先构建上述前端，再将其 `dist` 内容放入 `backend/web/dist`，然后：

```sh
cd backend
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X github.com/QuantumNous/new-api/common.Version=v1.0.0-rc.39-skymoni.162-creator-live-access" -o new-api .
```

独立社区服务的构建与运行文件位于 `frontend/community-service`。各组件内原有构建说明及修改记录一并保留；较早说明中的旧版本号对应当时的修改。

部署所需的数据库、运行配置和密钥由部署者自行提供。

## 历史版本与校验

历史包按[服务端](https://github.com/skyjjgw/skymoni-source/releases/tag/backend-archives-20261021)、[前端](https://github.com/skyjjgw/skymoni-source/releases/tag/frontend-archives-20261021)、[移动端](https://github.com/skyjjgw/skymoni-source/releases/tag/mobile-archives-20261021)分组。

[SOURCE_ARCHIVES.json](SOURCE_ARCHIVES.json) 记录每个文件的下载地址、大小和 SHA-256；[SHA256SUMS](SHA256SUMS) 可用于验证下载。网站原有的版本化源码链接会跳转到对应的 GitHub 下载。

后续发布请同步更新对应组件的源码目录，并将版本源码包上传到新的 GitHub Release，记录文件大小与 SHA-256。网站的源码入口应指向该版本，旧地址保留跳转；服务器仅保留索引和跳转配置，不再长期存放源码压缩包。

## 许可与来源

基于 [QuantumNous/new-api](https://github.com/QuantumNous/new-api)，保留 New API contributors 的版权及组件声明。本站修改按原项目的 AGPL-3.0-or-later 条款提供；完整许可见 [LICENSE](LICENSE)。独立组件及第三方素材同时遵循各自文件中的许可声明。

此仓库仅发布原网站已经提供的对应源码。私有恢复仓库、线上账号、运行数据库和运维凭据不属于本仓库。
