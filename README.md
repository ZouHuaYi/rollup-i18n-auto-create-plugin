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
      reserveKeys: ['test']
    }),
  ]
})
```

## 选项说明
- i18nPath: 语言文件的路径。
- langPath: 打包的时候处理语言文件的路径数组。
- tempText: （可选）模板文本。
- excludes： (可选) 排除文件名称。
- jsText: （可选）JavaScript 模板文本。
- regi18n: 判断是否要出入以来的文本，如果已经有就不需要插入，存在如果是注释的时候没有办法兼容。
- injectToJS: （可选）要注入到 JavaScript 中的文本。
- delay: （可选）处理文件之间的延迟时间，默认为 1000。
- reserveKeys: (可选) 需要保留的key
- runBuild: (可选) 打包的时候是否需要执行整理多语言文件。

```javascript
i18nPath: string
langPath: string[]
regi18n: string
excludes: string[]
tempText: string
jsText: string
injectToJS?: string
delay: number
reserveKeys: string[]
runBuild: boolean
```

## 工作原理
插件使用 @vue/compiler-sfc 解析 Vue 文件，并递归遍历 AST 以提取中文文本。对于 JavaScript 脚本，插件使用 Babel 解析和遍历 AST。提取的中文文本将被替换为国际化函数调用。

## 注意
> 该项目的默认配置是针对 [element-plus-admin](https://element-plus-admin.cn/) 项目，
> 在其他项目中没有认真测试过

1、针对 element-plus-admin 的项目修改
- src/hooks/web/useI18n.ts
![img.png](img.png)

2、在开发环境中使用该插件项目会比较卡顿，而且在修改中文的时候整个页面会在1s后才刷新因为这里我用了防抖，所以建议在生成环境中才开启

- 配置整理多语言文件
> 在打包环境下配置 runBuild: true, 会自动对语言文件进行整理


## 老项目转化
> 如果你是一个老的项目这种情况下要想愉快的使用该插件那么你就要把原来写的t(key)
转化成中文，我写了一份转化的代码，可供大家参考

下面转化代码不是万能的，这里只是针对了，大部分情况转化，组件属性比如 :title=t(key)，无法转化，剩余的自己手动处理吧！

```javascript

/*
* 把你的中文映射文案的文件整理出来
* */

const fs = require('fs');
const path = require('path');
const { parse  } = require('@vue/compiler-sfc');
const babelParser = require('@babel/parser');
const babelTraverse = require('@babel/traverse').default;
const jsgenerate = require('@babel/generator').default;
const langMap = require('./zh-CN')

// 处理vue文件
function dwVueFile (file) {
  let vueFileContent = fs.readFileSync(file, 'utf-8')
  const { descriptor, errors } = parse(vueFileContent);

  // 如果解析时发生错误，打印错误信息
  if (errors && errors.length) {
    console.error('Errors occurred while parsing the Vue file:', vuePath);
    return;
  }
  const temp = dvVueCentent(descriptor.template)
  if (temp) {
    vueFileContent = vueFileContent.replace(descriptor.template.content, temp)
  }
  const dsScript = descriptor.script || descriptor.scriptSetup
  let scriptTemp = dvTsCentent(dsScript.content)
  if (scriptTemp) {
    vueFileContent = vueFileContent.replace(dsScript.content, scriptTemp)
  }
  fs.writeFileSync(file, vueFileContent, 'utf-8');
}

// 处理js, ts，jsx等文件
function dvTsFile (file) {
  const content = fs.readFileSync(file, 'utf-8')
  const code = dvTsCentent(content)
  if (code) {
    fs.writeFileSync(file, code, 'utf-8');
  }
}

function dvTsCentent (content) {
  if (!content) return;
  const ast = babelParser.parse(content, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
  let flag = false
  babelTraverse(ast, {
    CallExpression(path) {
      try {
        if (path.node.callee.name === 't') {
          const pkey = objToStr(path.node.arguments[0].value)
          if (pkey) {
            if (path.parent.type === 'JSXExpressionContainer') {
              if (path.parentPath.parent.type === 'JSXElement') {
                // jsx 中的中文会带上双引号和单引号
                path.parentPath.replaceWithSourceString(pkey)
              } else {
                // 这个是属性，和函数一类
                path.parentPath.replaceWith({
                  type: 'StringLiteral',
                  value: pkey
                })
              }

            } else {
              path.replaceWithSourceString("'" + pkey + "'")
            }
            flag = true
          }
        }
      } catch (e) { }
    }
  })
  if (flag) {
    return jsgenerate(ast, {
      jsescOption: { minimal: true },
    }).code
  }
}

function dvVueCentent (template) {
  if (!template || !template.content) {
    console.log('No template content found.');
    return;
  }
  let templateContent = template.content
  // 全局替换正则
  templateContent = templateContent.replace(/{{\s*t\('([^']+)'\)\s*}}/g, (_, matched) => {
    return objToStr(matched) || '没有key'
  });
  return templateContent
}

// 替换为字符的函数和方法
function objToStr (key) {
  if (!key) return
  try {
    const keys = key?.split('.')
    let objstr = langMap[keys[0]]
    for (let i = 1; i < keys.length; i++) {
      objstr = objstr[keys[i]]
    }
    return objstr
  } catch (e) {
    return `没有key ${key}`
  }
}

// 读取文件夹中的.vue 文件
function readVueFiles(dir) {
  const vueFiles = [];
  const jsFiles = []
  // 递归函数来遍历目录
  function traverseDirectory(currentPath) {
    const files = fs.readdirSync(currentPath);
    files.forEach(file => {
      const filePath = path.join(currentPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        // 如果是目录，则递归遍历
        traverseDirectory(filePath);
      } else if (path.extname(file) === '.vue') {
        vueFiles.push(filePath);
      } else if (['.ts', '.tsx', '.js'].includes(path.extname(file)) && !filePath.includes('locale')) {
        jsFiles.push(filePath)
      }
    });
  }
  // 开始遍历
  traverseDirectory(dir);
  return {vue: vueFiles, js: jsFiles}
}

function init (dir) {
  const {js, vue} = readVueFiles(dir)
  js.forEach(file => {
    dvTsFile(file)
  })
  vue.forEach(file => {
    dwVueFile(file)
  })
}

// 目录
init('file\\src')

```

## 许可证
MIT

```javascript
请根据实际情况调整上述内容。如果您有其他需要添加的信息或者有特定的格式要求，请告诉我。
```
