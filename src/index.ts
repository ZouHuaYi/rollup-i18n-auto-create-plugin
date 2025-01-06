import { Plugin } from 'vite';
import { OptionsType } from "./types";
import fs from "fs";
import { resolve } from 'path';
import { parse } from '@vue/compiler-sfc';
import { extractChineseFromTemplate } from './templateTransform'
import { extractChineseFromScript } from './scriptTransform'
import {dealWithLangFile, getFileJson, updateJSONInFile} from './utils'

globalThis.translationsMap = {}
globalThis.addTranslations = []
globalThis.useTranslations = []

export default function RollupI18nCreatePlugin(options: OptionsType): Plugin {
  let root = '';
  let isPro = false
  let isLang = false

  const configOption: OptionsType = {
    ...options,
    injectToJS: options.injectToJS || `\nimport { useI18n } from '@/hooks/web/useI18n'\nconst { t } = useI18n()\n`,
    i18nPath: options.i18nPath || 'src/locales/zh-CN.ts',
    langPath: options.langPath || ['src/locales/en.ts'],
    regi18n: options.regi18n || 'useI18n',
    excludes: options.excludes || ['locale', 'useI18n'],
    tempText: options.tempText || 't',
    jsText: options.jsText || 't'
  }

  return {
    name: 'rollup-i18n-auto-create-plugin', // 插件名称
    enforce: 'pre', // 插件执行阶段（pre/normal/post）
    configResolved(config) {
      root = config.root;
      isPro = config.isProduction
      isLang = config.mode === 'lang'
      translationsMap = {}
      if (!isPro) {
        const obj = getFileJson(resolve(root, configOption.i18nPath))
        // 映射到全局之中去，反向映射出来
        Object.keys(obj).forEach(key => {
          translationsMap[key] = obj[key]
        })
      }
    },
    transform(code, id) {
      // 不是 vue 文件的时候不进行处理
      if (
        configOption.excludes.some(i => id.includes(i)) ||
        id.includes('node_modules') ||
        id.includes('\x00'))
      {
        return code;
      }
      let rewrittenScript = code
      if (id.endsWith('.vue')) {
        rewrittenScript = processVueFile(id, configOption) || ''
      } else if (['.ts', '.js', '.jsx', '.tsx'].some(i => id.split('?')[0].endsWith(i))) {
        rewrittenScript = proesssJsFile(id, configOption)
      }
      const langFile = resolve(root, configOption.i18nPath)
      if (!isPro && addTranslations.length) {
        dealWithLangFile(langFile)
        addTranslations = []
      }
      return {
        code: rewrittenScript,
        map: null
      }
    },
    buildEnd() {
      // 打包构建的时候执行该代码, 这是打包阶段的了也是我们测试的时候使用
      if (isLang) {
        const langFile = resolve(root, options.i18nPath)
        // 这里整理所有的语言数据，所有的都是新的语言包，
        updateJSONInFile(langFile, translationsMap)
        // 处理其他语言包的映射关系
        if (options.langPath) {
          options.langPath.forEach(item => {
            const lf = resolve(root, item)
            const lm = getFileJson(lf)
            const obj: any = {}
            Object.keys(translationsMap).forEach(key => {
              obj[key] = lm[key] || translationsMap[key]
            })
            updateJSONInFile(lf, obj)
          })
        }
      }
    }
  };
}

function proesssJsFile(jsFilePath: string, options: OptionsType) {
  const jsFileContent = fs.readFileSync(jsFilePath, 'utf-8')
  let scriptTemp = extractChineseFromScript(jsFileContent, options.jsText)
  if (scriptTemp) {
    // 排除如果没有引入的值直接不处理
    if (options.regi18n && !jsFileContent.includes(options.regi18n)) {
      scriptTemp = `${options.injectToJS}${scriptTemp}`
    }
    return scriptTemp
  }
  return jsFileContent
}

function processVueFile(vueFilePath: string, options: OptionsType) {
  // 获取文件中的内容数据
  let vueFileContent = fs.readFileSync(vueFilePath, 'utf-8')
  // 使用 @vue/compiler-sfc 解析 Vue 文件
  const { descriptor, errors } = parse(vueFileContent);
  // 如果解析时发生错误，打印错误信息
  if (errors && errors.length) {
    console.error('Errors occurred while parsing the Vue file:', vueFilePath);
    return;
  }
  const vueTemplate = extractChineseFromTemplate(descriptor.template?.content || '', options.tempText)
  if (vueTemplate && descriptor.template?.content) {
    vueFileContent = vueFileContent.replace(descriptor.template.content, vueTemplate)
  }
  const dsScript = descriptor.script || descriptor.scriptSetup
  if (dsScript?.content) {
    let scriptTemp = extractChineseFromScript(dsScript.content, options.jsText)
    if (scriptTemp) {
      // 这里对字符串进行判断是否要注入js在里面, 如果文本没有修改
      if (options.regi18n && !scriptTemp.includes(options.regi18n)) {
        scriptTemp = `${options.injectToJS}${scriptTemp}`
      }
      vueFileContent = vueFileContent.replace(dsScript.content, scriptTemp)
    } else if (vueTemplate !== descriptor.template?.content) {
      // 这里对字符串进行判断是否要注入js在里面, 如果文本没有修改
      let strcontent = dsScript.content
      if (options.regi18n && !strcontent.includes(options.regi18n)) {
        strcontent = `${options.injectToJS}${strcontent}`
      }
      vueFileContent = vueFileContent.replace(dsScript.content, strcontent)
    }
  }
  return vueFileContent
}


