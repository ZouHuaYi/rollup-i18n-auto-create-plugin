import { parse } from '@vue/compiler-sfc';
import fs from 'fs';
import { resolve } from 'path';
import * as babelParser from '@babel/parser';
import _generate from '@babel/generator';
import _traverse from '@babel/traverse';
import crypto from 'crypto';
import JSON5 from 'json5';

// 中文字符匹配函数（判断字符串是否包含中文字符）
function containsChinese(str) {
    return /[\u4e00-\u9fa5]/.test(str);
}
// 收集字符串中的字符, '我的测试' + ’abc‘ + ‘测试呀’, 针对这种字符串的拼接处理
function extractQuotedStrings(str) {
    // 如果是 `这种拼接的`
    const regex = /(["'])(.*?)\1/g;
    let match;
    const matches = [];
    while ((match = regex.exec(str)) !== null) {
        matches.push(match[0]);
    }
    return matches;
}
// 对js 字符串的模板进行处理 类似 `我的测试`
function extractTransformString(str) {
    // 正则表达式匹配 ${variable} 中的内容
    const regex = /\$\{([^}]+)\}/g;
    if (!regex.test(str)) {
        return;
    }
    const placeholders = [];
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
    };
}
// 生成唯一key
function generateKey(chineseStr) {
    const hash = crypto.createHmac('sha256', globalThis.cryptoKey || 'i18n').update(globalThis.preText + chineseStr).digest('hex');
    // 保留加密结果的前N位，N由配置中的keyLength决定
    const len = globalThis.keyLength || 16;
    return hash.slice(0, len);
}
// 获取和收集key
function getchinseKey(text) {
    let key = '';
    if (containsChinese(text)) {
        const chineseText = text.trim().replace(/^&%&/, '');
        key = generateKey(chineseText);
        if (!translationsMap[key]) {
            addTranslations.push({
                key,
                value: chineseText
            });
        }
        // 这里一定是 use key ,使用的key值，修改中文和书写中文的时候会一个 标注
        translationsMap[key] = chineseText;
    }
    let isKey = false;
    if (text) {
        // 使用正则的方法进行判断
        isKey = /^\&%\&/.test(text);
    }
    return {
        key,
        isKey
    };
}
// 读取文件映射相关的内容
function getFileJson(filePath) {
    // 读取文件内容
    const fileContent = fs.readFileSync(filePath, 'utf8');
    // 使用贪婪模式匹配到最后一个 }
    const objectStr = fileContent.replace(/export\s+default\s+/, '').trim();
    try {
        // 解析对象
        return JSON5.parse(objectStr);
    }
    catch (e) {
        console.log('解析语言映射文件报错');
        return {};
    }
}
// 更新文件中的json
function updateJSONInFile(filePath, obj) {
    // 生成新的对象字符串
    const newObjectStr = JSON.stringify(obj, null, 2);
    // 替换回文件内容
    const newFileContent = `export default ${newObjectStr}`;
    // 保存文件
    fs.writeFileSync(filePath, newFileContent, 'utf8');
}
function debounce(func, wait, immediate = false) {
    let timeout;
    return function (...args) {
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

//@ts-ignore
const traverse = _traverse.default;
//@ts-ignore
const generate = _generate.default;
// 提取 script 中的中文
function extractChineseFromScript(content, jsText) {
    if (!content)
        return;
    let flag = false; // 是否有更新
    const ast = babelParser.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
    });
    traverse(ast, {
        StringLiteral(path) {
            // 单独处理 JSX 的属性值
            const parent = path.parent;
            // 排除打印等代码的中文文案
            if (parent.type === 'CallExpression') {
                const callee = parent.callee;
                if ((callee.type === 'MemberExpression' &&
                    callee.object.name === 'console') ||
                    (callee.type === 'Identifier' && callee.name === 'alert')) {
                    return;
                }
            }
            const { key, isKey } = getchinseKey(path.node.value);
            if (key) {
                if (parent.type === 'JSXAttribute') {
                    if (isKey) {
                        path.node.extra.raw = `'${key}'`;
                    }
                    else {
                        path.node.extra.raw = `{${jsText}('${key}')}`;
                    }
                }
                else {
                    // 其他的jsx 基本就是直接替换
                    if (isKey) {
                        path.node.extra.raw = `'${key}'`;
                    }
                    else {
                        path.node.extra.raw = `${jsText}('${key}')`;
                    }
                }
                flag = true;
            }
        },
        // 处理js 字符串模板的代码，我的测试${test}你在哪里啊？,
        TemplateLiteral(path) {
            // 存储转换后的模板字符串和占位符对象
            let transformedTemplate = '';
            const placeholders = {};
            let placeholderCounter = 0;
            const rawTemplate = path.node.quasis.map((q) => q.value.raw).join('.{.*?}');
            if (containsChinese(rawTemplate)) {
                // 遍历模板字符串的静态部分和插值表达式
                path.node.quasis.forEach((quasi, index) => {
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
                const { key, isKey } = getchinseKey(transformedTemplate);
                const keyData = JSON.stringify(placeholders).replace(/\"/g, '');
                if (isKey) {
                    path.replaceWithSourceString(`'${key}&%&${keyData}'`);
                }
                else {
                    path.replaceWithSourceString(`${jsText}('${key}',${keyData})`);
                }
                flag = true;
            }
        },
        JSXElement(path) {
            path.traverse({
                // 处理jsx中标签包含的文本
                JSXText(node) {
                    const { key } = getchinseKey(node.node.value);
                    if (key) {
                        node.node.value = `{${jsText}('${key}')}`;
                        flag = true;
                    }
                },
            });
        },
    });
    // 是否有更新
    if (flag) {
        return generate(ast).code;
    }
}

// 对拼接的字符串进行处理整理
function concatenatedString(str, tempText) {
    const strList = extractQuotedStrings(str);
    if (!strList.length)
        return;
    if (strList.length) {
        let strSource = str;
        strList.forEach((item) => {
            const { key } = getchinseKey(item.replace(/'|"/g, ''));
            if (key) {
                strSource = strSource.replace(item, `${tempText}('${key}')`);
            }
        });
        return strSource;
    }
}
// 提取 template 中的中文, 基本完成
function extractChineseFromTemplate(content, tempText) {
    if (!content) {
        return;
    }
    let templateContent = content;
    // // 使用@vue/compiler-sfc来解析模板
    const descriptor = parse(`<template>${content}</template>`).descriptor;
    // 获取模板的AST
    const ast = descriptor.template?.ast;
    if (!ast)
        return content;
    // 定义一个函数来递归遍历AST并收集所有文本节点和插值节点
    // AST 逆向 template 存在者问题这里使用替换的方式进行处理
    function extractNodes(node, source) {
        // 这是中的类型 {{ }}, 事件，也就是模板解析的都在这里
        if (node.type === 5 && containsChinese(node.content?.content)) {
            const tempStr = extractTransformString(node.content.content);
            if (tempStr) {
                const { key } = getchinseKey(tempStr.key);
                if (key) {
                    const results = source.replace(node.content?.content.trim(), `${tempText}('${key}', { ${tempStr.data} })`);
                    templateContent = templateContent.replace(source, results);
                }
            }
            else {
                const strSource = concatenatedString(node.content.content, tempText);
                if (strSource) {
                    const results = source.replace(node.content?.content.trim(), strSource);
                    templateContent = templateContent.replace(source, results);
                }
            }
        }
        // 这是 TEXT 类型
        if (node.type === 2) {
            const { key } = getchinseKey(node.content);
            if (key) {
                const results = source.replace(node.content.trim(), `{{${tempText}('${key}')}}`);
                templateContent = templateContent.replace(source, results);
            }
        }
        if (node.children) {
            let pstr = node.loc.source;
            // 优先处理属性值
            if (node?.props?.length) {
                // 这里是处理属性值的地方
                node.props.forEach((item) => {
                    if (item.type === 6) {
                        // 这个是纯的属性类型 title="我的测试"
                        const { key } = getchinseKey(item?.value?.content);
                        if (key) {
                            pstr = pstr.replace(item.loc.source, `:${item.name}="${tempText}('${key}')"`);
                        }
                    }
                    else if (item.type === 7 && item.exp?.content) {
                        // 这里是一个bind 这里统一对 等号后面的字符串提取出来处理
                        const strSource = concatenatedString(item.exp.content, tempText);
                        if (strSource) {
                            pstr = pstr.replace(item.exp.content, strSource);
                        }
                    }
                });
                templateContent = templateContent.replace(node.loc.source, pstr);
            }
            // 同级的children 值
            node.children.forEach((item) => {
                // res 修改的值就是父级的值，父级的 source
                extractNodes(item, pstr);
            });
        }
    }
    // 检查 AST 的有效性
    if (ast.children && ast.children.length > 0) {
        ast.children.forEach((child) => {
            extractNodes(child, ast.source);
        });
        return templateContent;
    }
}

globalThis.translationsMap = {};
globalThis.addTranslations = [];
globalThis.useTranslations = [];
globalThis.keyLength = 16;
function RollupI18nCreatePlugin(options) {
    let root = '';
    let isPro = false;
    // 配置
    const configOption = {
        ...options,
        injectToJS: options.injectToJS ? `\n${options.injectToJS}\n` : `\nimport { useI18n } from '@/hooks/web/useI18n'\nconst { t } = useI18n()\n`,
        i18nPath: options.i18nPath || 'src/locales/zh-CN.ts',
        langPath: options.langPath || ['src/locales/en.ts'],
        regi18n: options.regi18n || 'useI18n',
        excludes: options.excludes || ['locale', 'useI18n'],
        tempText: options.tempText || 't',
        jsText: options.jsText || 't',
        delay: options.delay || 1000,
        reserveKeys: options.reserveKeys || [],
        runBuild: options.runBuild || false,
        keyLength: options.keyLength || 16,
        cryptoKey: options.cryptoKey || 'i18n',
        preText: options.preText || '',
    };
    const dealWithLangFile = debounce((i18nPath) => {
        updateJSONInFile(i18nPath, translationsMap);
    }, configOption.delay);
    return {
        name: 'rollup-i18n-auto-create-plugin', // 插件名称
        enforce: 'pre', // 插件执行阶段（pre/normal/post）
        configResolved(config) {
            root = config.root;
            isPro = config.isProduction;
            translationsMap = {};
            globalThis.keyLength = configOption.keyLength;
            globalThis.cryptoKey = configOption.cryptoKey;
            if (!isPro) {
                // 开发环境保留所有字段不进行任何的优化
                const obj = getFileJson(resolve(root, configOption.i18nPath));
                // 映射到全局之中去，反向映射出来
                Object.keys(obj).forEach(key => {
                    translationsMap[key] = obj[key];
                });
            }
            else if (configOption?.reserveKeys?.length) {
                // 生产环境下对代码, 对保留的key 不进行处理的key进行了处理
                const obj = getFileJson(resolve(root, configOption.i18nPath));
                Object.keys(obj).forEach(key => {
                    if (configOption.reserveKeys.includes(key)) {
                        translationsMap[key] = obj[key];
                    }
                });
            }
        },
        transform(code, id) {
            // 不是 vue 文件的时候不进行处理
            if (configOption.excludes.some(i => id.includes(i)) ||
                id.includes('node_modules') ||
                id.includes('\x00')) {
                return code;
            }
            let rewrittenScript = code;
            if (id.endsWith('.vue')) {
                rewrittenScript = processVueFile(id, configOption) || '';
            }
            else if (['.ts', '.js', '.jsx', '.tsx'].some(i => id.split('?')[0].endsWith(i))) {
                rewrittenScript = proesssJsFile(id, configOption);
            }
            const langFile = resolve(root, configOption.i18nPath);
            if (!isPro && addTranslations.length) {
                dealWithLangFile(langFile);
                addTranslations = [];
            }
            return {
                code: rewrittenScript,
                map: null
            };
        },
        buildEnd() {
            // 打包构建的时候执行该代码, 这是打包阶段的了也是我们测试的时候使用
            if (configOption.runBuild) {
                const langFile = resolve(root, options.i18nPath);
                // 这里整理所有的语言数据，所有的都是新的语言包，
                updateJSONInFile(langFile, translationsMap);
                // 处理其他语言包的映射关系
                if (options.langPath) {
                    options.langPath.forEach(item => {
                        const lf = resolve(root, item);
                        const lm = getFileJson(lf);
                        const obj = {};
                        const endList = [];
                        // 将未翻译的语言包也加入到最后
                        Object.keys(translationsMap).forEach(key => {
                            if (lm[key]) {
                                obj[key] = lm[key];
                            }
                            else {
                                // 新增的key 直接加入到末尾
                                endList.push({
                                    key: key,
                                    value: translationsMap[key]
                                });
                            }
                        });
                        endList.forEach((item) => {
                            obj[item.key] = item.value;
                        });
                        updateJSONInFile(lf, obj);
                    });
                }
            }
        }
    };
}
function proesssJsFile(jsFilePath, options) {
    const jsFileContent = fs.readFileSync(jsFilePath, 'utf-8');
    let scriptTemp = extractChineseFromScript(jsFileContent, options.jsText);
    if (scriptTemp) {
        // 排除如果没有引入的值直接不处理
        if (options.regi18n && !jsFileContent.includes(options.regi18n)) {
            scriptTemp = `${options.injectToJS}${scriptTemp}`;
        }
        return scriptTemp;
    }
    return jsFileContent;
}
function processVueFile(vueFilePath, options) {
    // 获取文件中的内容数据
    let vueFileContent = fs.readFileSync(vueFilePath, 'utf-8');
    // 使用 @vue/compiler-sfc 解析 Vue 文件
    const { descriptor, errors } = parse(vueFileContent);
    // 如果解析时发生错误，打印错误信息
    if (errors && errors.length) {
        console.error('Errors occurred while parsing the Vue file:', vueFilePath);
        return;
    }
    const vueTemplate = extractChineseFromTemplate(descriptor.template?.content || '', options.tempText);
    if (vueTemplate && descriptor.template?.content) {
        vueFileContent = vueFileContent.replace(descriptor.template.content, vueTemplate);
    }
    const dsScript = descriptor.script || descriptor.scriptSetup;
    if (dsScript?.content) {
        let scriptTemp = extractChineseFromScript(dsScript.content, options.jsText);
        if (scriptTemp) {
            // 这里对字符串进行判断是否要注入js在里面, 如果文本没有修改
            if (options.regi18n && !scriptTemp.includes(options.regi18n)) {
                scriptTemp = `${options.injectToJS}${scriptTemp}`;
            }
            vueFileContent = vueFileContent.replace(dsScript.content, scriptTemp);
        }
        else if (vueTemplate !== descriptor.template?.content) {
            // 这里对字符串进行判断是否要注入js在里面, 如果文本没有修改
            let strcontent = dsScript.content;
            if (options.regi18n && !strcontent.includes(options.regi18n)) {
                strcontent = `${options.injectToJS}${strcontent}`;
            }
            vueFileContent = vueFileContent.replace(dsScript.content, strcontent);
        }
    }
    return vueFileContent;
}

export { RollupI18nCreatePlugin as default };
//# sourceMappingURL=index.esm.js.map
