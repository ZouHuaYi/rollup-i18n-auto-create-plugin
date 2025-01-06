# Vue3 + Vite 多语言自动替换插件

这是一个 Vue3 + Vite 插件，旨在实现多语言自动替换功能。插件能够自动识别 Vue 组件中的中文文本，并将其替换为相应的国际化函数调用，以支持多语言。

## 功能特点

- 自动提取 Vue 模板和脚本中的中文文本。
- 将提取的中文文本替换为国际化函数调用。
- 支持处理 `.vue`、`.js`、`.ts`、`.jsx` 和 `.tsx` 文件。
- 在开发模式下实时更新语言文件。
- 在构建时创建新的语言包。

## 安装

```javascript
npm install rollup-i18n-auto-create-plugin
# 或者
yarn add rollup-i18n-auto-create-plugin
```
## 使用方法

```javascript
import { defineConfig } from 'vite'
import i18nPlugin from 'rollup-i18n-auto-create-plugin'

export default defineConfig({
  plugins: [
    i18nPlugin({
      i18nPath: 'path/to/your/i18n/file.json', // 语言文件路径
      langPath: ['path/to/your/lang/file.json'], // 其他语言文件路径数组
      injectToJS: 'import { useI18n } from \'vue-i18n\'\n',
      open: true // 是否开启插件功能
    })
  ]
})

```

