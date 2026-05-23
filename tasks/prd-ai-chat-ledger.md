# PRD: AI 对话记账应用 (MoneyChat)

## Introduction

MoneyChat 是一款基于 AI 对话的手机记账应用。用户通过与 AI 智能体自然对话完成记账，无需手动填写表单。应用使用 UniApp (Vue3) 开发，前后端一体，所有数据（记账记录、API 配置、用户设置）均存储在用户本地设备上，去中心化，无需任何服务器。API Key 通过 Android/iOS 原生安全存储机制加密保护。

## Goals

- 用户通过自然语言对话完成记账，AI 自动识别金额、分类、备注
- AI 能读取近期记账数据并据此点评消费行为，回答用户关于账单的提问时像真人一样自然回应
- 首次使用时 AI 主动提问，引导用户设置基本信息
- 每轮对话结束后自动清除对话消息上下文，记账数据持久化保留
- 每次发消息给 AI 时，将近期记账数据注入上下文，让 AI 了解消费情况
- 支持预配置主流 AI 平台（OpenAI/通义千问/DeepSeek/智谱/Kimi），用户只需填 API Key，同时保留自定义模型选项
- 内置 8 大默认消费分类 + 允许用户自定义 + AI 自动识别分类
- 提供时间/分类筛选的图表统计功能
- 支持导出 Excel 表格
- API Key 通过 Android Keystore / iOS Keychain 加密存储，不暴露在代码或日志中
- 底部三个 Tab：对话记账、统计数据、设置
- 对话界面双方头像和昵称可自定义
- 最终产出可安装的 Android APK

## User Stories

### US-001: 初始化项目
**Description:** As a developer, I need to initialize the UniApp project so that the app structure is ready.

**Acceptance Criteria:**
- [ ] 创建 UniApp (Vue3) 项目，配置好项目结构
- [ ] 项目可正常编译运行到 H5 浏览器预览
- [ ] 项目目录结构清晰：`pages/`、`components/`、`utils/`、`store/` 等

### US-002: API Key 安全存储与直连调用
**Description:** As a user, I want my API Key to be encrypted and stored safely on my device, and the app to call AI APIs directly without any intermediary server.

**Acceptance Criteria:**
- [ ] API Key 使用 Android Keystore / iOS Keychain 原生安全存储（通过 uni-app native 插件调用）
- [ ] 前端代码中不硬编码任何 API Key
- [ ] 应用直接调用 AI API（不经过任何代理服务器）
- [ ] 请求头中 Authorization 字段从安全存储中读取
- [ ] 支持流式返回（SSE）以实现打字机效果
- [ ] 网络请求日志中不打印完整 API Key

### US-003: 预配置 AI 平台列表
**Description:** As a user, I want to select from a list of popular AI platforms and just fill in my API Key, so that I don't need to know the Base URL and model names.

**Acceptance Criteria:**
- [ ] 内置平台列表：OpenAI、通义千问、DeepSeek、智谱 GLM、Kimi（Moonshot）
- [ ] 每个平台预填 Base URL 和可选模型列表
- [ ] 用户选择平台后，只需填 API Key 即可使用
- [ ] 保留"自定义模型"选项，用户可手动填 Base URL + Model Name + API Key
- [ ] 平台配置保存在本地，支持新增/编辑/删除

### US-004: 设置页面 — API 配置与提示词管理
**Description:** As a user, I want to configure my AI model and system prompt in the Settings tab so that I can customize the AI behavior.

**Acceptance Criteria:**
- [ ] 设置页面包含「模型配置」和「系统提示词」两个区域
- [ ] 模型配置：选择预配置平台或自定义 → 填 API Key → 保存（Key 加密存入本地安全存储）
- [ ] 系统提示词：有默认值，用户可编辑保存，支持重置为默认
- [ ] 配置变更后即时生效，无需重启应用
- [ ] API Key 输入框使用密码遮蔽，有"显示/隐藏"切换

### US-005: 对话记账主界面 — UI 框架
**Description:** As a user, I want a clean, beautiful chat interface so that recording expenses feels like chatting with a friend.

**Acceptance Criteria:**
- [ ] 底部 Tab 栏三个入口：对话记账、统计数据、设置
- [ ] 聊天气泡样式：用户消息靠右，AI 消息靠左
- [ ] 双方显示头像和昵称
- [ ] 底部输入框支持文本输入和发送按钮
- [ ] 界面简洁美观，无多余元素
- [ ] Verify in browser using dev-browser skill

### US-006: 头像与昵称自定义
**Description:** As a user, I want to customize the avatar and nickname for both myself and the AI assistant so that the chat feels personal.

**Acceptance Criteria:**
- [ ] 设置页面提供"个人资料"区域：用户头像、昵称
- [ ] 设置页面提供"AI 助手"区域：AI 头像、昵称
- [ ] 头像支持从手机相册选择或拍照
- [ ] 修改后对话界面实时更新显示
- [ ] 默认有预设头像和昵称（如"我"和"小记"）

### US-007: AI 对话与记账数据提取
**Description:** As a user, I want the AI to understand my expense descriptions and automatically save them as records, so that I don't need to fill forms manually.

**Acceptance Criteria:**
- [ ] 用户输入自然语言（如"午饭花了 35 块"），AI 回复确认信息并给出消费点评
- [ ] AI 返回结构化 JSON 数据（金额、分类、日期、备注），前端解析并存储
- [ ] 记账数据存储到本地 SQLite 数据库
- [ ] 支持一次性记录多笔（如"早餐 10 块，打车 25 块"）
- [ ] AI 无法识别时，友好提示用户补充信息

### US-008: AI 读取近期记账并智能回复
**Description:** As a user, I want the AI to know my recent spending and give me helpful commentary, so that I can better manage my finances.

**Acceptance Criteria:**
- [ ] 每次发送消息时，前端将最近 7 天记账数据摘要（总金额、分类分布）注入请求
- [ ] AI 记账后给出自然语言点评（如"今天餐饮已经花了 80 块了，注意控制哦"）
- [ ] 用户问"我最近花了多少"等账单问题时，AI 用自然语言回复（如"这周你花了 520 块，主要是吃饭和打车"），而非返回原始表格
- [ ] 系统提示词指导 AI 以朋友口吻分析消费，不做机械的数据罗列
- [ ] 近期记账数据的注入不影响对话上下文的清除机制

### US-009: 首次使用引导对话
**Description:** As a new user, I want the AI to ask me some questions to understand my basic info when I first open the app, so that the experience is personalized.

**Acceptance Criteria:**
- [ ] 首次打开对话界面，AI 自动发送欢迎消息和引导问题
- [ ] 引导问题包括：称呼偏好、月预算（可选）、常用消费分类
- [ ] 用户回答后信息存储到本地
- [ ] 引导完成后进入正常对话模式
- [ ] 后续可在设置中重新触发引导

### US-010: 对话上下文清除机制
**Description:** As a user, I want the chat context to be cleared after each conversation round so that the AI doesn't waste tokens on old messages, but my expense data is always kept.

**Acceptance Criteria:**
- [ ] AI 回复完成后视为一轮对话结束，自动清除对话消息上下文
- [ ] 下次发消息时不携带历史对话消息，仅携带当前消息 + 近期记账摘要
- [ ] 记账数据不受影响，持久保存在本地数据库
- [ ] 对话界面保留本轮对话的视觉显示
- [ ] "新对话"按钮可手动触发上下文清除

### US-011: 消费分类管理
**Description:** As a user, I want default expense categories plus the ability to add custom ones, so that I can organize my spending the way I want.

**Acceptance Criteria:**
- [ ] 默认 8 大分类：餐饮、交通、购物、住房、娱乐、医疗、教育、其他
- [ ] 每个分类有对应图标和颜色
- [ ] 用户可在设置中新增自定义分类（名称 + 选择图标）
- [ ] 支持删除自定义分类（默认分类不可删除）
- [ ] AI 记账时自动匹配到最合适的分类，也识别自定义分类

### US-012: 本地数据存储层
**Description:** As a developer, I need a local database schema to store expense records, user settings, and AI config.

**Acceptance Criteria:**
- [ ] 使用 uni-app 本地存储方案（SQLite 插件或 Vuex 持久化）
- [ ] 表结构：`expenses`（id, amount, category, date, note, created_at）
- [ ] 表结构：`settings`（key, value）— 存储提示词、用户资料、平台选择
- [ ] 表结构：`categories`（id, name, icon, color, is_custom）
- [ ] API Key 单独使用 Android Keystore / iOS Keychain 存储，不混入普通 settings
- [ ] CRUD 操作封装为统一的 service 层

### US-013: 记账数据查询与列表
**Description:** As a user, I want to browse and search my expense records so that I can review my spending history.

**Acceptance Criteria:**
- [ ] 统计数据页面提供记账记录列表，按日期倒序
- [ ] 支持按日期范围筛选（今天/本周/本月/自定义）
- [ ] 支持按消费分类筛选
- [ ] 每条记录显示：金额、分类、日期、备注
- [ ] 支持删除单条记录（带确认弹窗）
- [ ] 支持编辑单条记录

### US-014: 统计图表 — 月度概览
**Description:** As a user, I want to see visual charts of my spending so that I can understand my financial patterns.

**Acceptance Criteria:**
- [ ] 统计数据页面顶部显示月度总支出金额
- [ ] 饼图：按消费分类占比显示
- [ ] 柱状图：按日/周显示支出趋势
- [ ] 支持切换月份查看历史数据
- [ ] 使用 uCharts 或 qiun-data-charts 图表库
- [ ] Verify in browser using dev-browser skill

### US-015: 统计图表 — 分类筛选与详情
**Description:** As a user, I want to filter charts by category and time range so that I can analyze specific spending areas.

**Acceptance Criteria:**
- [ ] 图表上方有分类筛选器（可多选）
- [ ] 图表上方有时间范围选择器（本月/近三月/近半年/自定义）
- [ ] 筛选条件改变后图表实时更新
- [ ] 点击饼图某个分类片段，跳转到该分类的明细列表

### US-016: 导出 Excel 表格
**Description:** As a user, I want to export my expense data to an Excel file so that I can use it for further analysis or backup.

**Acceptance Criteria:**
- [ ] 统计数据页面有"导出 Excel"按钮
- [ ] 导出内容包含：日期、分类、金额、备注
- [ ] 支持按时间范围导出（全部/本月/自定义）
- [ ] 导出的 `.xlsx` 文件可保存到手机或分享
- [ ] 使用 xlsx（SheetJS）库生成文件

### US-017: Android APK 打包与签名
**Description:** As a user, I want to install the app as a signed APK on my Android phone.

**Acceptance Criteria:**
- [ ] 使用 uni-app 的云打包或本地打包生成 APK
- [ ] 配置好应用图标、名称、包名
- [ ] APK 已签名，可直接安装到 Android 设备
- [ ] 安装后可正常使用全部功能

## Functional Requirements

- **FR-1:** 应用底部三个 Tab：对话记账、统计数据、设置
- **FR-2:** 对话界面为聊天气泡样式，用户右 AI 左，双方显示头像昵称
- **FR-3:** 用户头像和昵称可自定义（从相册选择/拍照，手动输入昵称）
- **FR-4:** AI 头像和昵称可自定义
- **FR-5:** 首次打开 AI 自动发送引导对话，了解用户基本信息
- **FR-6:** 用户通过自然语言输入消费信息，AI 返回结构化记账数据
- **FR-7:** 每轮对话结束自动清除对话消息上下文，记账数据持久化保存
- **FR-8:** 提供"新对话"按钮手动清除上下文
- **FR-9:** 每次发送消息时，将最近 7 天记账摘要（总金额、分类分布）注入 AI 请求上下文
- **FR-10:** AI 记账后应给出自然语言消费点评（如提醒超支、鼓励节约等）
- **FR-11:** 用户问账单相关问题时，AI 以自然语言回复（如"这周花了 520"），不返回表格
- **FR-12:** 记账数据存储在本地 SQLite 数据库
- **FR-13:** 设置页面支持选择预配置 AI 平台（OpenAI/通义千问/DeepSeek/智谱/Kimi）或自定义模型
- **FR-14:** 用户只需填 API Key 即可使用预配置平台，自定义模式需填 Base URL + Model Name + API Key，所有配置存储在本地
- **FR-15:** API Key 通过 Android Keystore / iOS Keychain 加密存储，前端不暴露明文
- **FR-16:** 应用直接调用 AI API，不经任何代理服务器，请求日志不打印完整 Key
- **FR-17:** 设置页面可编辑系统提示词，有默认值，支持重置
- **FR-18:** 默认 8 大消费分类 + 支持用户自定义分类
- **FR-19:** AI 自动识别消费分类（含自定义分类）
- **FR-20:** 统计数据页面提供记账记录列表，支持按日期/分类筛选
- **FR-21:** 统计数据页面提供饼图（分类占比）和柱状图（日/周趋势）
- **FR-22:** 图表支持切换月份和筛选分类
- **FR-23:** 支持导出 Excel（.xlsx），可选择时间范围
- **FR-24:** 支持删除和编辑单条记账记录
- **FR-25:** 最终输出可安装的签名 Android APK

## Non-Goals

- 不支持 iOS 首发（后续可扩展，本次仅 Android）
- 不做多用户/账号系统，纯单机本地应用
- 不做预算管理/提醒功能（V1 不含）
- 不做云端数据同步
- 不做多币种支持
- 不做语音输入记账
- 不对接银行/支付平台自动记账

## Design Considerations

- **UI 风格：** 简约现代，参考微信聊天界面风格
- **主题色：** 主色 #FFFFFF（白），辅色 #2B7CFF（蓝），背景 #F5F7FA（浅灰蓝）
- **底部 Tab：** 图标 + 文字，选中态蓝色高亮，未选中灰色，使用线性图标风格
- **聊天气泡：** 圆角，用户气泡蓝色（#2B7CFF 白字），AI 气泡白色（浅灰边框）
- **图表：** 使用 uCharts（uni-app 生态图表库），配色与主题蓝/白统一
- **输入框：** 底部固定，圆角，蓝色发送按钮，支持多行输入
- **整体风格：** 白底为主，蓝色点缀（按钮、选中态、强调文字），干净清爽
- **分类图标：** 使用统一风格的线性图标库（如 iconfont），每个分类配专属颜色
- **响应式：** 适配主流 Android 屏幕尺寸（360px ~ 414px 宽度）

## Technical Considerations

- **框架：** UniApp (Vue3)，前后端一体，无服务器依赖
- **前端：** Vue3 Composition API + Pinia 状态管理
- **本地存储：** uni-app 本地存储 API + SQLite（通过 nativejs 插件）
- **API Key 安全存储：** 通过 uni-app native 插件调用 Android Keystore / iOS Keychain
- **图表库：** uCharts 或 qiun-data-charts
- **Excel 导出：** xlsx (SheetJS) 库
- **AI 接口调用：** 前端直接调用，OpenAI Chat Completions API 兼容格式
- **流式响应：** 前端直接处理 SSE（Server-Sent Events）流式返回
- **记账数据注入：** 每次请求时前端查询最近 7 天记账摘要，拼入 system prompt 的专门段落
- **打包：** uni-app 云打包或 Android Studio 本地打包
- **签名：** 使用 uni-app 内置签名或自定义 keystore

## Success Metrics

- 用户从打开应用到完成第一笔记账 ≤ 2 分钟
- AI 识别自然语言记账的准确率 ≥ 90%
- AI 消费点评的自然度和相关性让用户满意
- 导出 Excel 文件可正常在 WPS/Excel 中打开
- 图表加载时间 ≤ 2 秒
- 应用安装包大小 ≤ 30MB
- API Key 不在前端代码、日志、或任何网络请求明文中暴露

## Open Questions

- 是否需要支持离线记账（无网络时手动输入，联网后同步到 AI 分析）？
- 是否需要记账数据的搜索功能（按备注关键词搜索）？
