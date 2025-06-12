import * as babelParser from '@babel/parser';

import _generate from "@babel/generator";
import _traverse from "@babel/traverse";
//@ts-ignore
const traverse = _traverse.default;
//@ts-ignore
const generate = _generate.default;

import {
  containsChinese,
  getchinseKey
} from './utils';

// 提取 script 中的中文
export function extractChineseFromScript(content: string, jsText: string) {
  if (!content) return;

  let flag = false // 是否有更新
  const ast = babelParser.parse(content, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  traverse(ast, {
    StringLiteral(path: any) {
      // 单独处理 JSX 的属性值
      const parent = path.parent;
      // 排除打印等代码的中文文案
      if (parent.type === 'CallExpression') {
        const callee = parent.callee
        if (
          (callee.type === 'MemberExpression' &&
            callee.object.name === 'console') ||
          (callee.type === 'Identifier' && callee.name === 'alert')
        ) {
          return
        }
      }
      const { key, isKey } = getchinseKey(path.node.value)
      if (key) {
        if (parent.type === 'JSXAttribute') {
          if (isKey) {
            path.node.extra.raw = `'${key}'`
          } else {
            path.node.extra.raw = `{${jsText}('${key}')}`
          }
        } else {
          // 其他的jsx 基本就是直接替换
          if (isKey) {
            path.node.extra.raw = `'${key}'`
          } else {
            path.node.extra.raw = `${jsText}('${key}')`
          }
        }
        flag = true
      }
    },
    // 处理js 字符串模板的代码，我的测试${test}你在哪里啊？,
    TemplateLiteral(path:any) {
      // 存储转换后的模板字符串和占位符对象
      let transformedTemplate = '';
      const placeholders: any = {};
      let placeholderCounter = 0
      const rawTemplate = path.node.quasis.map((q:any) => q.value.raw).join('.{.*?}');
      if (containsChinese(rawTemplate)) {
        // 遍历模板字符串的静态部分和插值表达式
        path.node.quasis.forEach((quasi:any, index: number) => {
          // 添加静态部分到转换后的模板字符串
          transformedTemplate += quasi.value.raw;
          // 如果当前不是最后一个元素，则添加插值表达式的占位符
          if (index < path.node.expressions.length) {
            // 生成唯一的占位符名称
            const placeholderName = `name${++placeholderCounter}`;
            // 添加占位符到转换后的模板字符串
            transformedTemplate += `{${placeholderName}}`;
            // 添加占位符对象，其键为占位符名称，值为插值表达式的源代码
            placeholders[placeholderName] = generate(path.node.expressions[index]).code;
          }
        });
        // 中文模板的不进行处理
        const { key, isKey } = getchinseKey(transformedTemplate)
        const regex = new RegExp('`' + rawTemplate + '`');
        const keyData = JSON.stringify(placeholders).replace(/\"/g, '')
        if (isKey) { 
          path.replaceWithSourceString(`'${key}&%&${keyData}'`)
        } else {
          path.replaceWithSourceString(`${jsText}('${key}',${keyData})`)
        }
        flag = true
      }
    },
    JSXElement(path: any) {
      path.traverse({
        // 处理jsx中标签包含的文本
        JSXText(node: any) {
          const { key } = getchinseKey(node.node.value)
          if (key) {
            node.node.value = `{${jsText}('${key}')}`
            flag = true
          }
        },
      });
    },
  });
  // 是否有更新
  if (flag) {
    return generate(ast).code
  }
}
