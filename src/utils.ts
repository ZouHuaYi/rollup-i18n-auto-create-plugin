import crypto from 'crypto';
import fs from 'fs';
import JSON5 from 'json5';

// 中文字符匹配函数（判断字符串是否包含中文字符）
export function containsChinese(str: string) {
  return /[\u4e00-\u9fa5]/.test(str);
}

// 对正则表达式中的特殊字符进行转义
export function escapeRegExp(str: string) {
  return str.replace(/[.*+?^=!:${}()|\[\]\/\\]/g, '\\$&');
}

// 收集字符串中的字符, '我的测试' + ’abc‘ + ‘测试呀’, 针对这种字符串的拼接处理
export function extractQuotedStrings(str: string) {
  // 如果是 `这种拼接的`
  const regex = /(["'])(.*?)\1/g;
  let match;
  const matches: string[] = [];
  while ((match = regex.exec(str)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

// 对js 字符串的模板进行处理 类似 `我的测试`
export function extractTransformString(str: string) {
  // 正则表达式匹配 ${variable} 中的内容
  const regex = /\$\{([^}]+)\}/g;
  if (!regex.test(str)) {
    return
  }
  const placeholders: string[] = [];
  let index = 1;

  let transformedStr = str.replace(regex, (match, p1) => {
    placeholders.push(`name${index}: ${p1}`);
    const placeholder = `{name${index}}`;
    index++;
    return placeholder;
  }).replace(/\`/g, '');
  return {
    key: transformedStr,
    data: placeholders.join(', ')
  }
}

// 生成唯一key
function generateKey(chineseStr: string) {
  const hash = crypto.createHmac('sha256', 'i18n').update(chineseStr).digest('hex');
  // 保留加密结果的前16位
  return hash.slice(0, 16)
}

// 获取和收集key
export function getchinseKey (text: string) {
  let key = '';
  if (containsChinese(text)) {
    const chineseText = text.trim().replace(/^&%&/, '');
    key = generateKey(chineseText);
    if (!translationsMap[key]) {
      addTranslations.push({
        key,
        value: chineseText
      })
    }
    // 这里一定是 use key ,使用的key值，修改中文和书写中文的时候会一个 标注
    translationsMap[key] = chineseText
  }
  let isKey = false 
  if (text) {
    // 使用正则的方法进行判断
    isKey = /^\&%\&/.test(text)
  }
  return {
    key,
    isKey
  }
}

// 读取文件映射相关的内容
export function getFileJson(filePath: string) {
  // 读取文件内容
  const fileContent = fs.readFileSync(filePath, 'utf8');
  // 使用贪婪模式匹配到最后一个 }
  const objectStr = fileContent.replace(/export\s+default\s+/, '').trim()
  try {
    // 解析对象
    return JSON5.parse(objectStr);
  } catch (e) {
    console.log('解析语言映射文件报错')
    return {}
  }
}

// 更新文件中的json
export function updateJSONInFile(filePath: string, obj: any) {
  // 生成新的对象字符串
  const newObjectStr = JSON.stringify(obj, null, 2);
  // 替换回文件内容
  const newFileContent = `export default ${newObjectStr}`;
  // 保存文件
  fs.writeFileSync(filePath, newFileContent, 'utf8');
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null;

  return function (...args: Parameters<T>) {
    //@ts-ignore
    const context = this;

    const later = () => {
      timeout = null;
      if (!immediate) {
        func.apply(context, args);
      }
    };

    const callNow = immediate && !timeout;

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);

    if (callNow) {
      func.apply(context, args);
    }
  };
}
