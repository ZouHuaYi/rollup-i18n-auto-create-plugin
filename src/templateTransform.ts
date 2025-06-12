import { parse } from '@vue/compiler-sfc';
import {
  containsChinese,
  extractQuotedStrings,
  extractTransformString,
  getchinseKey
} from './utils';

// 对拼接的字符串进行处理整理
export function concatenatedString (str: string, tempText: string) {
  const strList = extractQuotedStrings(str)
  if (!strList.length) return
  if (strList.length) {
    let strSource = str
    strList.forEach((item:string) => {
      const { key } = getchinseKey(item.replace(/'|"/g, ''))
      if (key) {
        strSource = strSource.replace(item, `${tempText}('${key}')`)
      }
    })
    return strSource
  }
}

// 提取 template 中的中文, 基本完成
export function extractChineseFromTemplate(content:string, tempText: string) {
  if (!content) {
    return;
  }

  let templateContent = content

  // // 使用@vue/compiler-sfc来解析模板
  const descriptor = parse(`<template>${content}</template>`).descriptor;
  // 获取模板的AST
  const ast = descriptor.template?.ast;
  if (!ast) return content
  // 定义一个函数来递归遍历AST并收集所有文本节点和插值节点
  // AST 逆向 template 存在者问题这里使用替换的方式进行处理
  function extractNodes(node: any, source: string) {
    // 这是中的类型 {{ }}, 事件，也就是模板解析的都在这里
    if (node.type === 5 && containsChinese(node.content?.content)) {
      const tempStr = extractTransformString(node.content.content)
      if (tempStr) {
        const { key } = getchinseKey(tempStr.key)
        if (key) {
         const results = source.replace(node.content?.content.trim(), `${tempText}('${key}', { ${tempStr.data} })`)
          templateContent = templateContent.replace(source, results)
        }
      } else {
        const strSource = concatenatedString(node.content.content, tempText)
        if (strSource) {
          const results = source.replace(node.content?.content.trim(), strSource)
          templateContent = templateContent.replace(source, results)
        }
      }
    }
    // 这是 TEXT 类型
    if (node.type === 2) {
      const { key } = getchinseKey(node.content)
      if (key) {
        const results = source.replace(node.content.trim(), `{{${tempText}('${key}')}}`)
        templateContent = templateContent.replace(source, results)
      }
    }
    if (node.children) {
      let pstr = node.loc.source
      // 优先处理属性值
      if (node?.props?.length) {
        // 这里是处理属性值的地方
        node.props.forEach((item: any) => {
          if (item.type === 6) {
            // 这个是纯的属性类型 title="我的测试"
            const { key } = getchinseKey(item?.value?.content)
            if (key) {
              pstr = pstr.replace(item.loc.source, `:${item.name}="${tempText}('${key}')"`)
            }
          } else if (item.type === 7 && item.exp?.content) {
            // 这里是一个bind 这里统一对 等号后面的字符串提取出来处理
            const strSource = concatenatedString(item.exp.content, tempText)
            if (strSource) {
              pstr = pstr.replace(item.exp.content, strSource)
            }
          }
        })
        templateContent = templateContent.replace(node.loc.source, pstr)
      }
      // 同级的children 值
      node.children.forEach((item: any) => {
        // res 修改的值就是父级的值，父级的 source
        extractNodes(item, pstr)
      })
    }
  }
  // 检查 AST 的有效性
  if (ast.children && ast.children.length > 0) {
    ast.children.forEach((child: any) => {
      extractNodes(child, ast.source)
    })
    return templateContent;
  }
}
