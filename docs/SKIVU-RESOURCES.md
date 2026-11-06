# Skivu 资源空间

入口：`https://skymoni.com/skivu-resources`。资源页整合公开 Android 安装包、插件目录、云端壁纸以及文档和内测入口。原 `/skivu/` 品牌展示页和软件中心继续保留；主站导航提供 Skivu 入口，资源页及品牌页提供「中转站首页」。

## 数据来源

- 公开版本：`/api/app-update/latest?platform=android&abi=arm64-v8a&version_code=0`，验证 Skivu 包名和架构后，使用本站 `/api/app-update/download/…/arm64-v8a` 转发下载。版本由服务端现有公开发布记录决定，本地未发布体验版不会出现在下载入口。
- 插件：继续复用软件中心已验证的三份 `/app-plugins/catalog/` 目录及包镜像。支持分类、搜索、兼容版本、权限与来源查看，复用现有 App 内安装指引；网页不伪造安装状态或代替 App 授权。
- 壁纸：`/api/app-wallpapers`。只展示已发布列表，校验同站来源、图片哈希路径、身份、尺寸和大小。支持预览及下载，不写入 App 当前壁纸选择。

各资源独立加载和重试，不依赖管理员账号，也不发送账号凭据。插件授权和各 App 的壁纸选择仍由各自客户端管理。

## 路由与发布

正式入口是主站 SPA 的文件路由 `frontend/web/src/routes/skivu-resources.tsx`。服务器现有 Nginx 前端路径白名单必须包含 `skivu-resources`，并将它送到主站静态 `index.html`；不能交给后端镜像内的旧前端。部署后核对该地址和主站首页返回相同的前端入口文件，并实际打开页面确认，不以 HTTP 200 作为完成标准。

独立本地预览：在 `frontend/web` 运行 `rsbuild dev --config rsbuild.skivu-resources-preview.config.ts`，访问 `http://127.0.0.1:18788/skivu-resources`。该预览入口不在生产路由中使用，避免账号引导流程；资源读取真实公开接口，已有的主站目标在正式域名打开。

本轮 90 项相关回归通过，修正后 19 项改动范围回归再次通过，类型、范围 lint、格式与生产构建通过。桌面 1280×720、手机 390×844、窄屏 320×568 已检查。未进行网页安装插件或 App 真机安装验收。
