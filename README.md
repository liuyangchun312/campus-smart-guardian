# 校园智护 · 校园后勤保障与劳动权益智能管家

面向保洁、宿管、维修、绿化、食堂员工及勤工助学学生的校园服务工作台。使用 React 19、TypeScript、Vite 和 Node.js，提供带来源的咨询、安全巡检与整改闭环、报修台账及运行分析。

## 在线体验

**推荐入口：[打开校园智护](https://campus-smart-guardian.pages.dev)**

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| Pages | <https://campus-smart-guardian.pages.dev> | 已验证首页、登录和业务接口，推荐使用 |
| Workers | <https://campus-smart-guardian.campuscare.workers.dev> | 保留的直连入口，部分网络可能遇到 DNS 或 HTTPS 连接失败 |

两个入口共用账号、密码、工单和巡检数据；Cookie 与浏览器偏好按域名保存，切换入口后需重新登录。原 `liuyangchun77.workers.dev` 地址已被账号子域名变更替换。

这是支持本机运行及 Cloudflare 部署的场景演示，不代表天津工业大学或其他学校的官方平台，也未接入学校派单、物联网控制或救援系统。工单状态由使用者自行维护。

## Cloudflare 部署

Pages 提供前端静态资源，`/api/*` 由 Pages Functions 的 `CAMPUS` 服务绑定调用现有 Worker；Worker 转发给单个 `Guardian` Durable Object。账号、会话、工作记录和管理员保存的 AI 配置存储在该对象的持久化 SQLite 中。Worker 同时提供自己的静态资源入口。Pages 未创建第二套数据库，应保留现有 Worker 与 Durable Object。

线上请求采用同源校验，登录 Cookie 包含 `Secure`、`HttpOnly` 和 `SameSite=Strict`。本机 `.guardian/` 数据不会自动迁移到线上。

### 更新现有站点

在项目根目录运行（Node.js 24）：

```powershell
npm ci
npx wrangler login
npm test
npm run deploy
```

`npm run deploy` 先构建前端，再更新 Worker 后端和 Pages 前端。两个步骤必须均成功；Pages 失败时可运行 `npm run deploy:pages` 重试。仅更新 Worker 使用 `npm run deploy:worker`，仅发布已构建的 Pages 资源使用 `npm run deploy:pages`。GitHub 推送不会自动发布网站。

Pages 发布脚本固定使用 Wrangler 4.50.0，以保留 `pages.dev` 入口；当前较新版本会将 Pages 命令迁移到 Workers 发布流程。该版本由 `npx` 从 npm 获取。发布脚本不会清空数据库或重新初始化管理员。

### 首次部署到其他账号

先修改根目录 `wrangler.jsonc` 的账号 ID 和 Worker 名称；若更改名称，也须同步 Pages 配置的 `name`、`services[].service` 及 `package.json` 中的 Pages 项目名。登录对应账号；多账号时设置 `CLOUDFLARE_ACCOUNT_ID`。Workers 子域名由账号配置决定，不在仓库中指定。

```powershell
npm ci
npx wrangler login
npx wrangler secret put ADMIN_SETUP_CODE
# 创建 Pages 项目；已存在的项目跳过这一步
npx --yes wrangler@4.50.0 pages project create campus-smart-guardian --production-branch main
npm run deploy
```

`ADMIN_SETUP_CODE` 应设为独立的高强度随机值，首次进入管理员入口时用于初始化管理员；管理员存在后该码不能再次创建管理员。密钥通过 Cloudflare Secrets 设置，不要提交到 Git。现有站点已完成管理员初始化，无需再次设置初始化码。

本次部署的管理员凭据仅保存在本机忽略目录 `.guardian/cloudflare-admin.json`，首次登录后可通过账号菜单修改密码。AI 服务需在网站管理员界面配置和测试，未配置时使用本地规则问答。

### 验证与访问排查

本地检查 Cloudflare 运行环境：`npm run dev:cloudflare`，另一个终端运行 `node cloudflare/smoke.mjs`。Smoke 检查会创建两个测试账号，仅用于本地测试环境。

线上可检查 `/api/health`（应返回 JSON）和 `/api/auth/session`（未登录应返回 `user: null`），再从页面登录验证业务数据。`workers.dev` 出现 DNS、SSL 或连接关闭错误时，先使用 Pages 入口，比较不同网络的结果；这些连接错误不代表账号数据丢失，重复部署不保证修复网络问题。不要关闭 HTTPS 证书校验。

Cloudflare 免费子域名不收域名续费，但 Workers、Pages Functions、Durable Objects 与数据库遵循账号套餐额度；付费套餐超额可能计费。AI 服务由模型服务商另行计费，未配置 AI 仍可使用规则问答和业务功能。最新额度见 [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/) 与 [Durable Objects 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/)。

当前所有账号由单个 Durable Object 处理，适用于小规模演示。正式高并发运行前应评估账号分片、持久化登录限流、备份与恢复，以及邮箱验证和找回密码。部署遵循 Cloudflare 账号当前套餐和用量限制。

## 本地启动

已在 Node.js 24 环境验证。安装 Node.js 24 后，在项目目录运行：

```powershell
npm install
npm run dev
```

- 页面：<http://127.0.0.1:5173>
- 本机 API：<http://127.0.0.1:3001>，由开发服务器代理 `/api` 请求。
- 不配置 AI 也可使用本地规则问答、报修、资料库及工具。页面会标识本地体验模式。
- `Ctrl+C` 停止服务；启动前请确认 5173、3001 端口未被其他程序占用。

## 用户账号、管理员与主题

打开页面后，可选择 **用户入口** 或 **管理员入口**。

- 普通用户：点击“注册用户账号”，设置账号、昵称与至少10个字符的密码；注册后自动进入工作台。账号使用3–32位字母、数字或下划线，不区分大小写。
- 首位管理员：本机版启动API后读取 `.guardian/admin-setup-code.txt`；云端版使用部署时设置的 `ADMIN_SETUP_CODE`。进入“管理员入口 → 初始化管理员”，填写初始化码和自定账号密码。管理员存在后初始化码不能再次创建管理员，本机初始化码文件会删除，没有通用默认密码。普通注册不能获得管理员权限。
- 管理员：通过独立入口登录，使用“管理控制台”搜索用户、查看账号状态和工单/巡检数量、停用或重新启用普通账号，并配置全站AI服务。停用立即撤销该用户已有会话；管理员账号不可从此界面停用。
- 所有账号：点击右上角头像或侧栏姓名，修改密码、退出登录、导出记录或导入旧版浏览器数据。修改密码会撤销其他会话；退出前会等待尚未完成的记录同步。旧数据不会自动归属第一个注册者，需使用者主动确认归属并导入，同编号保留账号已有记录。
- 主题：登录页和工作台右上角提供“浅色 / 深色 / 跟随系统”。偏好保存在当前浏览器，刷新、登录和退出后保持；跟随系统会响应系统外观变化。

本机版账号、密码派生值、会话摘要和各账号工作记录保存在 `.guardian/guardian.sqlite`（SQLite，运行时还可能存在 `-wal`、`-shm` 文件）；整个 `.guardian/` 已忽略。云端版对应数据保存在 Durable Object SQLite。密码使用独立随机盐和scrypt派生值保存，不保存明文；会话使用12小时有效的随机HttpOnly、SameSite=Strict Cookie，服务端只存令牌摘要。登录失败有频率限制，权限与记录所属账号由服务端检查，不能通过改网页角色字段越权。

账号数据在本机版保存到本机服务，在 Cloudflare 版保存到 Durable Object；多窗口编辑使用版本号，冲突或保存失败会明确提示并提供导出与重新载入。本机版不要在服务运行时仅复制SQLite主文件作为备份；停止服务后备份整个 `.guardian` 目录。本机SQLite数据库和AI密钥文件未做静态加密。本机版仍仅监听 `127.0.0.1`，尚未提供邮箱验证或找回密码流程。

## 页面与功能

### 工作台体验升级

首页优先展示紧急报修、逾期整改、等待复查与未解决工单，统计入口可打开对应筛选。优先处理与最近记录直接打开具体工单或巡检，运行看板展示完整待办队列。主导航按工作台、业务办理、咨询与资料分组，方法与文献位于“帮助与方法”。

工单支持桌面紧凑列表/卡片切换、手机卡片、状态/紧急程度/关键词筛选。工单、巡检筛选和运行看板日期范围在当前工作台内切换页面时保留。保存新报修直接打开新记录详情；记录链接使用 `#orders?record=记录编号` 或 `#safety?record=记录编号`，未登录时登录后继续打开，记录所属权限仍由账号服务控制。无效或不属于当前账号的编号显示不可用状态。

保存位置由 `/api/health` 的 `deployment` 标识显示为本地服务或云端服务，未确认时使用中性文案；它与 AI 的规则/模型模式分别显示。所有报修提交和解决状态仍由用户维护，尚未接入学校派单系统。

| 地址片段   | 页面       | 功能                                                       |
| ---------- | ---------- | ---------------------------------------------------------- |
| `#home`    | 工作总览   | 真实待办数量、最近记录、工作入口及实用工具                 |
| `#operations` | 运行看板 | 全量未结事项、7/30天记录范围、分布统计、完成率和CSV导出    |
| `#safety`  | 安全巡检   | 场景清单、可解释风险评分、整改计划、复查与闭环记录         |
| `#knowledge` | 循证检索 | 中文BM25资料检索、摘要、适用条件和原始来源                 |
| `#research` | 方法与文献 | 方法到功能的对应关系、工程简化说明、可复制参考文献        |
| `#admin` | 管理控制台 | 仅管理员可用：账号查询、停用/启用、AI服务配置                 |
| `#chat`    | 智能咨询   | 权益、报修与安全咨询；分步骤建议；复制答复、开始新对话     |
| `#repair`  | 后勤报修   | 提取并核对地点、类型和紧急程度；危险提示；保存标准工单草稿 |
| `#library` | 权益资料库 | 分类、关键词搜索、阅读指引及官方原文链接                   |
| `#orders`  | 我的工单   | 搜索、筛选、复制、删除工单，手动记录提交与解决进度         |

- 加班费参考计算：工资基数 ÷ 21.75 ÷ 8 × 小时数 × 适用倍率，明确标准工时等适用前提。
- 维权证据自查清单：勾选准备情况并复制清单；勾选状态仅在本次弹窗内保留。
- 支持大字模式、移动端导航、键盘操作、弹窗焦点管理与安全求助渠道。
- 报修输入按去除首尾空格后的长度校验，并在错误字段显示原因；地点提取支持校区、楼栋、房号及卫生间等空间，保留已填写的地点供人工核对。
- 尚未保存的报修内容在当前登录期间切换页面时保留，保存工单后清空；刷新页面或退出登录后不保留，请先保存需要留存的工单。
- 本地咨询按规则识别常见场景，并明确劳动关系、工时制、地区政策等核实条件；重大争议仍需向工会或劳动仲裁机构核实。

## 本次功能升级与研究依据

### 先检索，再回答

`shared/knowledge.mjs` 包含9条精选资料摘要，与生成模型分离。中文相邻双字及英文词构成索引，BM25 使用 `k1=1.2, b=0.75`，并以领域词过滤和相对分数阈值减少泛词匹配；这些中文适配与阈值是工程选择。摘要是人工整理，不是原文引用。检索分数不是置信度。来源不足时明确显示未找到匹配资料。

`/api/chat` 在服务端检索当前问题，将受限、可追溯的资料上下文传给配置的模型。来源由应用从可信资料库生成，不能由请求正文或模型任意指定。未连接AI时，本地规则答复也能展示独立检索结果。短句追问如果缺少主题词，可能检索不到依据；没有实现语义向量检索或模型训练。

### 安全巡检与整改

提供保洁化学品、用电设备、高温户外三个场景。检查项初始为“未检查”，须逐项确认；缺项不能当作安全。风险评分采用 FMEA 思路：`RPN = S × O × D`，各项为1–5级并提供文字解释。项目约定 `RPN ≥ 50` 高优先、`20–49` 中优先，其余常规；`S ≥ 4` 或关键项不符合直接高优先，避免严重后果被低乘积掩盖。这些量表、阈值与严重度规则不是行业统一标准。

记录经“登记 → 整改 → 复核 → 闭环”流转，保存责任人、截止日期、控制措施、完成说明、复核人、核验依据与残余风险。高残余风险或关键项未排除时禁止关闭；复核不通过可以退回整改。措施按 NIOSH 的消除、替代、工程控制、管理控制、个人防护层级组织。单条记录可导出Markdown。

### 运行看板与统计口径

待处理报修、紧急未结和逾期整改读取当前账号的全部历史记录；日期筛选不会隐藏旧待办。7/30天按浏览器本地自然日（含今天）筛选创建时间，完成率为该创建范围内记录的当前完成比例，不是期间完成事件数或校方SLA。零分母显示“—”。CSV只导出当前创建时间范围，包含UTF-8 BOM、引号转义和表格公式注入防护。没有预置虚拟业务记录。

### 参考文献

1. Robertson, S.; Zaragoza, H. **The Probabilistic Relevance Framework: BM25 and Beyond.** Foundations and Trends in Information Retrieval, 2009, 4(1–2): 1–174. DOI: [10.1561/1500000019](https://doi.org/10.1561/1500000019).
2. Lewis, P.; Perez, E.; Piktus, A.; et al. **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.** NeurIPS, 2020, 33: 9459–9474. [arXiv:2005.11401](https://arxiv.org/abs/2005.11401).
3. Liu, H.-C.; Liu, L.; Liu, N. **Risk evaluation approaches in failure mode and effects analysis: A literature review.** Expert Systems with Applications, 2013, 40(2): 828–838. DOI: [10.1016/j.eswa.2012.08.010](https://doi.org/10.1016/j.eswa.2012.08.010).
4. NIOSH. **Hierarchy of Controls.** CDC, 2024-04-10. [原文](https://www.cdc.gov/niosh/hierarchy-of-controls/about/index.html).

2026-10-02核对论文题录及NIOSH网页。FMEA综述核对的是出版信息，未声称全文复现。本项目借鉴RAG设计思想，未复现原论文的稠密检索与联合训练，也不声称获得其论文指标。测试验证代码行为，不能替代真实校园场景的准确性或安全有效性评估。

## 连接 AHHil_AI 中转站模型

以管理员账号登录，打开右上角 **“连接 AI”**、侧栏 **“AI 连接设置”** 或管理台的 **“配置 AI 服务”**：

1. 到 [ahhilai.top 控制台](https://ahhilai.top/dashboard) 的“令牌管理”创建 API Key，选择允许访问目标模型的分组。
2. 粘贴令牌。地址已预填 `https://ahhilai.top/v1`，默认模型为模型广场当前列出的 `deepseek-v4.1-flash`，协议 `Chat Completions`；该模型在站点列表中对应“小国模”分组。
3. 点击 **“测试连接并启用 AI”**。只有收到真实模型响应后，设置才会保存并即时生效，无需重启。窗口也提供 `gpt-5.5` + `Responses` 选项，具体权限和可用性以账号为准。

参考：[站点接入文档](https://ahhilai.top/docs#protocol)、[模型广场](https://ahhilai.top/pricing)。模型名称和分组核对日期：2026-10-01。

本机版密钥保存在 `.guardian/ai-config.json` 中，由 Node 后端读取；云端版管理员保存的配置保存在 Durable Object SQLite 中。密钥不写入浏览器存储、不回显到网页。`.guardian/` 已加入 `.gitignore`，本机密钥文件未加密，请勿上传或分享。网页保存的设置优先于环境变量。点击“停用 AI 连接”会清除网页保存的令牌，并持久保持停用状态。

启用后，问题与最近对话会经当前部署的后端发送给配置的中转站。请求失败时显示错误及设置入口，不会用预设指引代替模型答复。未接通时，页面清楚标识为本地参考问答。

模型接口行为通过本地模拟服务验证；本次升级没有用真实站点令牌发起模型请求。真实连接状态与模型可用性以设置窗口的连接测试为准。

### 也可手动配置环境变量

以下 `.env` 方法用于本机版。云端版 AI 密钥可用 `npx wrangler secret put AI_API_KEY` 设置，非敏感的 `AI_BASE_URL`、`AI_MODEL`、`AI_PROTOCOL` 可配置在根目录 `wrangler.jsonc` 的 `vars` 中，然后重新部署 Worker。推荐通过网站管理员界面配置并测试。

复制配置模板：

```powershell
Copy-Item .env.example .env
```

在 `.env` 中填写站点配置：

```dotenv
AI_API_KEY=填写中转站签发的令牌
AI_BASE_URL=https://ahhilai.top/v1
AI_MODEL=deepseek-v4.1-flash
AI_PROTOCOL=chat
```

环境变量在服务启动时读取；手动修改后重启服务并刷新页面。`AI_PROTOCOL=chat` 请求 `/chat/completions`，`AI_PROTOCOL=responses` 请求 `/responses`。配置窗口可以测试环境变量中的密钥，测试时密钥栏留空即可。服务地址使用 HTTPS，本机模型服务可使用 `http://127.0.0.1:端口/v1`。

密钥仅由后端读取，不得使用 `VITE_` 前缀，也不要放入前端代码或提交 `.env`。仓库已忽略 `.env`。启用 AI 后，当前问题与最近对话会经后端发送到配置的服务商；无需提交身份证号、银行卡号等敏感资料。

手动配置的环境变量会标为“尚未测试”；一次成功测试也不保证后续额度或上游服务始终可用。项目已部署云端演示，尚未完成生产负载评估。

## 数据与边界

对话、工单、巡检与整改记录按账号保存在当前部署的SQLite数据库：本机文件或云端 Durable Object。清除浏览器站点数据或退出登录不会删除数据库中的账号记录；主题与大字偏好仍是浏览器设置。旧版浏览器数据保留，可在账号菜单确认归属后导入。咨询页“新对话”会清除当前账号对话，工单详情可删除当前账号单张工单。巡检Markdown、看板CSV与账号JSON导出适合归档查看，尚无文件恢复界面。账号隔离与管理权限已实现，尚未对接校方派单或校内统一认证。

报修单只是本地草稿，复制后仍需通过学校正式渠道提交。“已自行提交”“已标记解决”是使用者记录，不是校方回执。遇到火情、漏电、化学品刺激或其他人身危险，应先避险并联系现场人员或应急服务。

## 构建、测试与预览

```powershell
npm run test
npm run build
```

测试覆盖咨询规则、报修风险分类、中文检索与无匹配场景、来源上下文、风险分级与状态流转、统计日期边界与CSV安全，以及模型连接、两种接口协议、设置持久化、鉴权错误与密钥保护；构建执行 TypeScript 检查并生成 `dist/`。

2026-10-07验收：60项前端业务测试与25项服务端/检索/账号测试通过（共85项），生产构建通过。Cloudflare 本地端到端检查验证了注册、会话、Secure Cookie、账号隔离、工作记录版本冲突、退出与重新登录。Pages 线上入口验证了首页、健康检查、管理员登录、账号列表、工作记录读取及外站来源拒绝，现有账号数据在重新部署后保留。未用真实模型验证回答质量，未进行生产负载测试。

2026-10-02本机界面验收：独立测试数据库与浏览器中验证了注册→保存工单→退出→重登、管理员启停账号、旧记录确认归属后导入、双窗口冲突提示，浅深色切换与系统外观跟随、全页面深色卡片和390px手机布局。原有巡检闭环、来源展开和CSV流程也有验证记录。操作脚本与截图保存在 `output/playwright/`，界面测试数据库在 `output/auth-ui/`，二者已忽略且不含真实业务数据。

本机预览构建结果需要两个终端：

```powershell
# 终端一：运行本机 API
npm run dev:api
```

```powershell
# 终端二：预览已构建的前端
npm run preview
```

打开 <http://127.0.0.1:4173>。`preview` 不会启动 API；修改 `.env` 后需重启 API 服务。

## 主要文件

- `src/App.tsx`：页面导航、对话请求、本地状态与模式标识。
- `src/lib/advisor.ts`、`src/lib/repair.ts`：本地咨询与报修分类规则。
- `src/data/articles.ts`：权益与安全资料、官方来源。
- `src/components/`：页面、工具和弹窗组件。
- `server/index.mjs`：仅监听本机的 Node API 启动入口。
- `server/app.mjs`：本机与云端共用的 AI 代理、连接管理与请求校验。
- `cloudflare/worker.mjs`、`wrangler.jsonc`：Worker 路由、Durable Object SQLite 适配与云端部署配置。
- `cloudflare/pages/`：Pages 入口与调用现有 Worker 的服务绑定。
- `cloudflare/smoke.mjs`、`server/cloud.test.mjs`：Cloudflare 本地端到端检查与云端存储适配测试。
- `server/prompt.mjs`：校园管家的模型系统提示词。
- `src/components/AiSettings.tsx`：模型连接设置与测试窗口。
- `src/types.ts`：对话、工单及资料类型。
- `shared/knowledge.mjs`：前后端共享的资料库、BM25检索与来源上下文。
- `src/lib/safety.ts`：巡检模板、风险评分、流转约束与数据校验。
- `src/lib/operations.ts`：统计范围、待办排序与CSV导出。
- `src/components/Safety.tsx`、`Operations.tsx`：安全台账与运行看板。
- `src/components/Knowledge.tsx`、`Research.tsx`：循证检索与方法文献。
- `server/accounts.mjs`：SQLite账号、会话、权限、工作空间及管理员API。
- `src/components/SessionGate.tsx`、`AccountPanel.tsx`、`Admin.tsx`：登录注册、账号设置与管理台。
- `src/lib/workspace.ts`：自动保存、版本冲突、退出前同步与未保存提示。
- `src/lib/theme.tsx`、`src/theme.css`：主题偏好、系统外观跟随与深色样式。
