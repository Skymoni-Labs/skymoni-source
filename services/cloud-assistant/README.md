# 小云网站助手

与主 API 后端分开运行的 Python 3.11+ 服务，仅监听 127.0.0.1:18886。
不依赖第三方 Python 包。通过固定的 DeepSeek 官方接口使用 `deepseek-flash`，关闭思考模式。

## 知识和回答

`knowledge.json` 是 36 篇公开教程和 15 项操作流程的启动快照。
后台每五分钟重新读取本站 `/api/docs/public` 及各文章详情；读取失败保留上次完整资料。
检索时参考当前问题和最近追问，向模型提供相关章节，回复附教程来源。
涉及模型时读取公开 `/api/pricing`，最多缓存一分钟。金额以模型广场为准，
不从内部计费表达式推算报价。不读取账户、钱包、订单或调用日志，不执行账户操作。
无法解决的问题引导至现有人工 QQ 群和邮箱。

## 部署

1. 将本目录的 `server.py`、`knowledge.json`、`nginx.locations` 安装到
   `/opt/skymoni-cloud-assistant`，由 root 管理且服务只读。
2. 参照 `config.example.json` 创建 `/etc/skymoni-cloud-assistant/config.json`，
   目录 0700、文件 0600。生成至少 48 字符随机签名密钥，并填入网站承担费用的 DeepSeek key。
   **实际配置、使用数据库和密钥不能放进前端、源码仓库或发行包。**
3. 安装配套 systemd unit，通过 `LoadCredential` 传递配置，使用动态用户、独立持久状态目录。
4. 在现有 TLS server 中包含 `nginx.locations`；本网站通过 PROXY protocol 获取真实 IP，
   其他环境必须根据自己的可信代理设置调整 `X-Real-IP`。
5. 验证 Nginx 配置后平滑 reload，启用服务，检查 `/health` 和公开 status。

浏览器先 GET `/api/cloud-assistant/status` 取得签名的 HttpOnly/Secure cookie，
再 POST `/api/cloud-assistant/chat`，使用 `X-Skymoni-Assistant: 1`。
网页同时发送 `Accept: text/event-stream`，服务按 SSE 返回 `start`、`delta`（脱敏文本快照）、
`done`（最终回答、来源与剩余用量）或 `error`。未请求 SSE 的客户端仍可获取普通 JSON。
Nginx 对此独立路由关闭缓冲、缓存与压缩，文本随上游到达直接显示。
只接受本站 Origin，不提供跨域访问。请求必须包含随机 `request_id`、`message`，
可带最多 8 条 `user`/`assistant` 历史和当前公开页面路径。

## 用量和隐私

初始配置：每访客及同 IP 每北京时间自然日最多 20 次，全站最多 200 次，
全站每日最多 300000 预留/已计量 Token，每次最多输出 900 Token，
同 IP 每分钟最多 3 次，最多两个模型请求同时执行。
各项独立生效，可能先达到其中一项；这不是人民币金额预算。
不同访客共享 IP 时共同受到 IP 限额约束。修改配置后重启服务，保留 SQLite 数据库。

SQLite 在事务内先预留次数和保守 Token 预算，再调用模型，成功后以实际 usage 结算。
失败或未知用量保留预留值，重启不重置预算。上游超出预留或输出预算时暂停当天咨询。
同一访客重试已成功的 request_id 返回原答案，不重复调用；处理中返回稍后重试。
确认失败后由用户主动发起新的尝试。不存在后台付费重试。
浏览器断线后，服务仍完成当前有上限的请求以取得用量与最终答案；重试同一 ID 可取回结果。
上游流式内容未正常结束时按失败处理并保留预算，不将部分文本当成成功回答。

前端仅在当前页面内存保留对话，刷新/新建对话会清除。服务不保存问题和完整对话；
为限额和安全重试保存签名访客 ID、IP 的 HMAC、时间、计量及脱敏后的回答，最多保留八天。
发送给 DeepSeek 的内容包含当前问题、最近对话和公开教程；明显格式的 API key 和邮箱
会在前后端过滤，但用户仍应避免发送密码、验证码和个人凭据。
日志只记录请求 ID、完成状态和上游 HTTP 状态。

## 检查

在仓库根运行：

```sh
python -m unittest discover -s services/cloud-assistant -v
cd frontend/web
node --test scripts/__tests__/cloud-companion.test.mjs
```

测试使用临时数据库和模拟上游，不调用付费模型。
