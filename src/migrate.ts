import fs from 'fs';
import path from 'path';
import { parse } from '@vue/compiler-sfc';
import * as babelParser from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';

// @ts-ignore
const traverse = _traverse.default;
// @ts-ignore
const generate = _generate.default;

/**
 * 老项目迁移工具
 * 目的：将 t('key.path') 转换回 '原始中文文本'
 * 这对于将现有项目迁移到使用自动翻译插件非常有用。
 */

interface MigrationOptions {
  srcDir: string;
  langMapPath: string;
  extensions: string[];
  excludeDirs: string[];
}

async function migrate() {
  const options: MigrationOptions = {
    srcDir: path.resolve(process.cwd(), 'src'),
    langMapPath: path.resolve(process.cwd(), 'src/locales/zh-CN.ts'),
    extensions: ['.vue', '.ts', '.js', '.tsx', '.jsx'],
    excludeDirs: ['node_modules', 'dist', 'locale']
  };

  console.log('🚀 开始迁移...');

  // 1. 加载语言映射文件
  let langMap: any = {};
  try {
    const content = fs.readFileSync(options.langMapPath, 'utf-8');
    // 从 "export default { ... }" 中提取对象内容
    const match = content.match(/export\s+default\s+([\s\S]+)/);
    if (match) {
      // 提取内容并尝试解析为 JS 对象
      const entry = match[1].trim().replace(/;$/, '');
      try {
        // 使用 eval 解析简单的对象结构
        langMap = eval(`(${entry})`);
      } catch (e) {
        console.error('❌ 语言映射文件解析失败。请确保它是标准的 JS 对象结构。');
        return;
      }
    }
  } catch (e) {
    console.error(`❌ 未找到语言映射文件：${options.langMapPath}`);
    return;
  }

  // 辅助函数：解析嵌套 Key，例如 'a.b.c' -> langMap['a']['b']['c']
  const getTranslation = (key: string) => {
    if (!key) return null;
    try {
      return key.split('.').reduce((obj, k) => obj && obj[k], langMap);
    } catch (e) {
      return null;
    }
  };

  // 2. 处理文件
  const files = getAllFiles(options.srcDir, options.extensions, options.excludeDirs);
  console.log(`共找到 ${files.length} 个文件需要处理。`);

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    let newContent = content;

    if (file.endsWith('.vue')) {
      newContent = processVueFile(file, content, getTranslation);
    } else {
      newContent = processJsLikeFile(content, getTranslation) || content;
    }

    if (newContent !== content) {
      fs.writeFileSync(file, newContent, 'utf-8');
      console.log(`✅ 已更新：${path.relative(options.srcDir, file)}`);
    }
  });

  console.log('✨ 迁移完成！');
}

/**
 * 递归获取目录下所有符合条件的文件
 */
function getAllFiles(dir: string, exts: string[], excludes: string[]): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (!excludes.includes(file)) {
        results = results.concat(getAllFiles(filePath, exts, excludes));
      }
    } else {
      if (exts.includes(path.extname(file))) {
        results.push(filePath);
      }
    }
  });
  return results;
}

/**
 * 处理类 JS 文件（.js, .ts, .jsx, .tsx）
 */
function processJsLikeFile(content: string, getTranslation: (key: string) => string | null): string | null {
  try {
    const ast = babelParser.parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });

    let changed = false;
    traverse(ast, {
      CallExpression(path: any) {
        const { callee, arguments: args } = path.node;
        // 匹配 t('key')
        if (callee.name === 't' && args.length > 0 && args[0].type === 'StringLiteral') {
          const key = args[0].value;
          const translation = getTranslation(key);
          if (translation) {
            // 将 t('key') 替换为 '原始文本'
            path.replaceWith({
              type: 'StringLiteral',
              value: translation
            });
            changed = true;
          }
        }
      }
    });

    if (changed) {
      return generate(ast, { jsescOption: { minimal: true } }).code;
    }
  } catch (e) {
    // 忽略解析失败的文件
  }
  return null;
}

/**
 * 处理 Vue 文件
 */
function processVueFile(filePath: string, content: string, getTranslation: (key: string) => string | null): string {
  const { descriptor } = parse(content);
  let newContent = content;

  // 1. 处理 Template 部分
  if (descriptor.template) {
    let templateContent = descriptor.template.content;
    
    // 还原 {{ t('key') }}
    const mustacheRegex = /\{\{\s*t\(['"]([^'"]+)['"]\)\s*\}\}/g;
    templateContent = templateContent.replace(mustacheRegex, (_, key) => {
      return getTranslation(key) || `{{ t('${key}') }}`;
    });

    // 还原 :attr="t('key')" 为 attr="中文"
    const attrRegex = /:([a-zA-Z0-9-]+)=['"]t\(['"]([^'"]+)['"]\)['"]/g;
    templateContent = templateContent.replace(attrRegex, (match, attr, key) => {
      const translation = getTranslation(key);
      return translation ? `${attr}="${translation}"` : match;
    });

    newContent = newContent.replace(descriptor.template.content, templateContent);
  }

  // 2. 处理 Script 部分
  const script = descriptor.scriptSetup || descriptor.script;
  if (script) {
    const newScript = processJsLikeFile(script.content, getTranslation);
    if (newScript) {
      newContent = newContent.replace(script.content, newScript);
    }
  }

  return newContent;
}

migrate();
