# Rollup I18n Auto Create Plugin (Vite Plugin)

这是一个针对 Vue3 + Vite 开发环境设计的 i18n 自动化插件。它能够自动识别项目代码（.vue, .js, .ts, .jsx, .tsx）中的中文字符串，将其替换为国际化调用函数（如 `t('key')`），并自动维护语言映射文件。

## 功能特点

- **全场景支持**：支持 Vue 模板、Script 脚本、JSX/TSX 语法。
- **智能替换**：自动处理普通字符串、模板字符串（Template Literals）以及 JSX 属性/文本。
- **自动化维护**：开发环境下实时提取并更新 `zh-CN` 映射文件；打包时可同步整理多语言包。
- **安全过滤**：自动排除 `console.log`、`alert` 中的中文，避免干扰调试。
- **特殊符号兼容**：自动转义 `@` 符号（`@@`），完美兼容 `vue-i18n` 的链接消息语法。
- **高度可定制**：支持自定义 Key 生成规则（长度、加密密钥、前缀等）。

## 安装

```bash
npm install rollup-i18n-auto-create-plugin -D
# 或者
pnpm add rollup-i18n-auto-create-plugin -D
```

## 使用方法

在 `vite.config.ts` 中配置：

```typescript
import RollupI18nCreatePlugin from 'rollup-i18n-auto-create-plugin'

export default defineConfig({
  plugins: [
    RollupI18nCreatePlugin({
      i18nPath: 'src/locales/zh-CN.ts',
      langPath: ['src/locales/en.ts'],
      injectToJS: `import { useI18n } from '@/hooks/web/useI18n'\nconst { t } = useI18n()`,
      excludes: ['locale', 'useI18n', 'node_modules'],
      jsText: 't',
      tempText: 't',
      regi18n: 'useI18n',
      delay: 1000,
      runBuild: true,
      // 新增配置项
      keyLength: 16,
      cryptoKey: 'your-secret-key',
      preText: 'APP_'
    }),
  ]
})
```

## 配置项说明

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `i18nPath` | `string` | `src/locales/zh-CN.ts` | 主语言文件（通常是中文）的存储路径 |
| `langPath` | `string[]` | `['src/locales/en.ts']` | 其他语言文件的路径数组（打包时同步更新 Key） |
| `tempText` | `string` | `t` | 模板中生成的国际化函数名 |
| `jsText` | `string` | `t` | JS/TS 脚本中生成的国际化函数名 |
| `regi18n` | `string` | `useI18n` | 用于判断文件是否已引入国际化钩子的标识符 |
| `injectToJS` | `string` | (详见说明) | 自动注入到 Script 顶部的引入代码 |
| `excludes` | `string[]` | `['locale', 'useI18n']` | 排除的文件名或路径片段 |
| `delay` | `number` | `1000` | 开发环境下处理文件的防抖延迟（ms） |
| `reserveKeys` | `string[]` | `[]` | 生产环境下需要保留（不被清理）的 Key |
| `runBuild` | `boolean` | `false` | 打包时是否执行语言文件整理和同步 |
| `keyLength` | `number` | `16` | 生成 Key 的哈希长度 |
| `cryptoKey` | `string` | `i18n` | 用于生成哈希的 HMAC 密钥 |
| `preText` | `string` | `''` | 生成 Key 前在原文前增加的固定前缀 |

## 工作原理

1. **解析阶段**：利用 `@vue/compiler-sfc` 解析 `.vue` 文件，使用 Babel (`@babel/parser`) 解析 JS/TS/JSX 代码。
2. **提取阶段**：递归遍历 AST（抽象语法树），识别所有未被排除的中文字符串。
3. **生成阶段**：
    - 根据原文 + `preText` + `cryptoKey` 生成唯一哈希作为 Key。
    - 将原文内容存入 `i18nPath` 指定的文件。
    - 针对包含 `@` 的文本自动转义为 `@@`，防止 `vue-i18n` 报错。
4. **替换阶段**：将代码中的中文字符串改写为配置的 `t('key')` 调用。

## 注意事项

- **开发环境刷新**：由于为了性能考虑加入了 1s 的防抖处理，修改中文后页面刷新会有微小延迟。
- **@ 符号处理**：插件会自动处理文本中的 `@` 符号，确保在 `vue-i18n` 中能正常渲染为原样文本。
- **老项目迁移**：如果你需要将已有的 `t('key')` 代码还原回中文，可以参考 `src/migrate.ts` 迁移脚本。

## 迁移工具

如果你需要将一个已经手动写满 `t('key')` 的老项目转化回中文（以便配合本插件使用），可以使用 `src/migrate.ts` 脚本。

该脚本已进行优化，支持：
1. **递归扫描**：自动遍历 `src` 目录下的所有 `.vue, .ts, .js, .tsx, .jsx` 文件。
2. **插值表达式还原**：将 `{{ t('key') }}` 还原为中文。
3. **属性绑定还原**：将 `:title="t('key')"` 还原为静态属性 `title="中文"`（原版文档中提到的无法转化的问题已解决）。
4. **脚本代码还原**：将 Script 或 JS 文件中的 `t('key')` 调用还原为字符串 `'中文'`。

**使用说明：**
由于每个项目的路径配置不同，请在使用前修改 `src/migrate.ts` 中的 `options` 配置（如语言包路径、源码目录等）。

## 许可证

MIT
