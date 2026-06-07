# Contributing to MoneyBook AI

We welcome contributions! Whether it's bug fixes, feature improvements, translations, or documentation — every contribution matters.

## 🇨🇳 中文贡献指南

### 开发环境搭建

```bash
# 1. 克隆仓库
git clone <repo-url>
cd moneybook-ai

# 2. 安装依赖
npm install

# 3. 开发运行
npm run dev:h5   # H5 网页
npm run dev:app  # Android
npm run dev:mp-weixin  # 微信小程序
```

### 提交前检查

- 确保 `npm run type-check` 通过
- 确保 `npm run test` 测试通过
- 代码风格保持与现有代码一致

### 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
feat: 添加新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构代码
test: 测试相关
chore: 构建/工具链相关
```

## 🇺🇸 English

### Setting up the dev environment

```bash
# 1. Clone the repo
git clone <repo-url>
cd moneybook-ai

# 2. Install dependencies
npm install

# 3. Run in development mode
npm run dev:h5   # H5 Web
npm run dev:app  # Android
npm run dev:mp-weixin  # WeChat Mini Program
```

### Pre-submission checklist

- `npm run type-check` passes
- `npm run test` passes
- Code style matches existing codebase

### Commit conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix a bug
docs: documentation update
style: code formatting
refactor: code refactoring
test: testing related
chore: build/tooling
```

### How to contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Make** your changes
4. **Test** your changes
5. **Commit** using conventional commits
6. **Push** to the branch (`git push origin feature/amazing-feature`)
7. **Open** a Pull Request

### Reporting bugs

Please open an [issue](../../issues) with:
- A clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Your device/OS information

### Feature requests

We welcome feature suggestions! Please describe:
- What problem the feature solves
- How you envision it working
- Any relevant screenshots or mockups

### Code style

- Use TypeScript for new code
- Follow Vue 3 Composition API patterns
- Use Chinese comments for UI-related code (matching existing codebase)
- Keep functions focused and concise
- Add meaningful error messages
