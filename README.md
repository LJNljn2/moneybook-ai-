# MoneyBook AI

> 用聊天的方式记录每一笔消费 — AI Conversational Expense Tracker

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Vue](https://img.shields.io/badge/Vue-3.4+-green.svg)](https://vuejs.org/)
[![UniApp](https://img.shields.io/badge/UniApp-3.0-orange.svg)](https://uniapp.dcloud.net.cn/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue.svg)](https://www.typescriptlang.org/)

---

## 🇨🇳 中文介绍

**MoneyBook AI** 是一款 AI 驱动的对话式记账应用。你只需像平时聊天一样告诉 AI 你的消费记录，它就能自动提取金额、分类、日期和备注，并帮你妥善记录。

### ✨ 功能特性

- **💬 对话记账** — 用自然语言说「午饭花了 35 块」，AI 自动解析并记录
- **🤖 多模型支持** — 支持 OpenAI、Claude、Gemini、DeepSeek、通义千问、智谱 GLM、Moonshot、Doubao、文心一言、OpenRouter 等
- **🧠 思考过程** — 支持 Claude 等模型的 thinking blocks，可查看 AI 的分析过程
- **📊 统计分析** — 饼图 + 柱状图可视化消费数据，支持按周/月/范围查询
- **🔒 隐私优先** — 所有数据本地存储，不经过任何服务器；API Key 安全存储在设备密钥库中
- **📱 跨平台** — 支持 Android、iOS、H5 网页、微信小程序等多个平台
- **🎯 智能提醒** — 自动分类消费、预算追踪、消费趋势分析

### 🚀 快速开始

#### 环境要求

- Node.js >= 18
- HBuilderX 或 uni-app CLI

#### 安装依赖

```bash
npm install
```

#### 开发运行

```bash
# H5 网页端
npm run dev:h5

# Android 端
npm run dev:app

# 微信小程序
npm run dev:mp-weixin

# 其他平台参见 package.json 中的 scripts
```

#### 构建发布

```bash
# Android APK
npm run build:app

# H5 网页
npm run build:h5

# 微信小程序
npm run build:mp-weixin
```

### 📋 支持的 AI 模型

| 提供商 | 模型 | 流式 | 思考过程 |
|--------|------|------|----------|
| OpenAI | gpt-4o, gpt-4-turbo, gpt-3.5-turbo | ✅ | ❌ |
| Claude | claude-3.5, claude-4 | ✅ | ✅ |
| Gemini | gemini-2.0, gemini-2.5 | ✅ | ✅ |
| DeepSeek | deepseek-chat, deepseek-reasoner | ✅ | ✅ |
| 通义千问 | qwen-turbo, qwen-plus | ✅ | ❌ |
| 智谱 GLM | glm-4, glm-4-plus | ✅ | ❌ |
| Moonshot | moonshot-v1, moonshot-v1-8k | ✅ | ❌ |
| Doubao | doubao-pro, doubao-lite | ✅ | ❌ |
| 文心一言 | ernie-4.0, ernie-3.5 | ✅ | ❌ |
| OpenRouter | 多种模型 | ✅ | ✅ |

### 🛠 技术栈

- **前端框架**: UniApp (Vue 3 + Composition API)
- **构建工具**: Vite 5
- **类型系统**: TypeScript
- **图表**: 纯 CSS 实现的饼图和柱状图组件
- **存储**: uni-storage (Android/iOS 本地) + localStorage (H5)
- **测试**: Vitest (单元测试) + Playwright (E2E 测试)

---

## 🇺🇸 English

**MoneyBook AI** is an AI-powered conversational expense tracker. Simply tell the AI about your expenses in natural language — like "lunch cost 35 bucks" — and it will automatically extract the amount, category, date, and notes, then record everything for you.

### ✨ Features

- **💬 Chat-to-book**: Tell your expenses naturally, AI parses and records automatically
- **🤖 Multi-model support**: OpenAI, Claude, Gemini, DeepSeek, Qwen, GLM, Moonshot, Doubao, Ernie, OpenRouter
- **🧠 Thinking process**: View AI analysis with thinking blocks (Claude, DeepSeek, Gemini)
- **📊 Analytics**: Pie + bar charts with weekly/monthly/range queries
- **🔒 Privacy-first**: All data stored locally; API keys secured in device keystore/keychain
- **📱 Cross-platform**: Android, iOS, H5, WeChat Mini Program, and more
- **🎯 Smart tools**: Auto-categorization, budget tracking, spending insights

### 🚀 Quick Start

#### Prerequisites

- Node.js >= 18
- HBuilderX or uni-app CLI

#### Install

```bash
npm install
```

#### Development

```bash
# H5 Web
npm run dev:h5

# Android
npm run dev:app

# WeChat Mini Program
npm run dev:mp-weixin

# See package.json for other platform scripts
```

#### Build

```bash
# Android APK
npm run build:app

# H5 Web
npm run build:h5

# WeChat Mini Program
npm run build:mp-weixin
```

### 📋 Supported AI Models

| Provider | Models | Streaming | Thinking |
|----------|--------|-----------|----------|
| OpenAI | gpt-4o, gpt-4-turbo, gpt-3.5-turbo | ✅ | ❌ |
| Claude | claude-3.5, claude-4 | ✅ | ✅ |
| Gemini | gemini-2.0, gemini-2.5 | ✅ | ✅ |
| DeepSeek | deepseek-chat, deepseek-reasoner | ✅ | ✅ |
| Qwen | qwen-turbo, qwen-plus | ✅ | ❌ |
| GLM | glm-4, glm-4-plus | ✅ | ❌ |
| Moonshot | moonshot-v1, moonshot-v1-8k | ✅ | ❌ |
| Doubao | doubao-pro, doubao-lite | ✅ | ❌ |
| Ernie | ernie-4.0, ernie-3.5 | ✅ | ❌ |
| OpenRouter | Various models | ✅ | ✅ |

### 🛠 Tech Stack

- **Frontend**: UniApp (Vue 3 + Composition API)
- **Build**: Vite 5
- **Language**: TypeScript
- **Charts**: Pure CSS PieChart and BarChart components
- **Storage**: uni-storage (Android/iOS) + localStorage (H5)
- **Testing**: Vitest (unit) + Playwright (E2E)

### 📱 Screenshots

> Screenshots will be added once the app is built.

### 📄 License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

---

## 👤 Author

**leonan** — Built with 💰
