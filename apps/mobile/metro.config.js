const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');
const fs = require('fs');

/**
 * Metro configuration for mobile2.
 * https://reactnative.dev/docs/metro
 *
 * 适配 BookDock pnpm monorepo：
 * - watchFolders 包含 workspace 根，便于 packages/* 变更触发 reload
 * - nodeModulesPaths 显式声明项目和 workspace 两个 node_modules 路径
 * - disableHierarchicalLookup = true，强制 metro 走 pnpm symlink 解析
 *
 * 额外补丁：
 * - `react-native-markdown-display@7.0.2` 锁死依赖 `markdown-it@10.0.0`，而 markdown-it@10
 *   在 `lib/common/entities.js` 里写了 `require('entities/lib/maps/entities.json')`。
 *   这是 pre-exports 时代的 require 路径，Metro + pnpm 严格 hoist 组合下找不到。
 *   mobile（expo）默认 `unstable_enablePackageExports: false`，expo 的 metro resolver
 *   会沿 pnpm symlink 自动找到 .pnpm/<pkg>/node_modules/entities/...，所以没事。
 *   mobile2 用 @react-native/metro-config（默认 exports on + 严格 nodeModulesPaths），
 *   所以挂一个 resolveRequest hook 精准把这条 legacy require 指到真实文件。
 */

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = {
  // 只 watch workspaceRoot 就够了 —— workspaceRoot 已经覆盖 packages/ 子目录
  // 同时 watch 'packages' 会让 metro 把 projectRoot 下的 assets/* 错误归类成 packages 下的资产
  // (asset httpServerLocation 路径变成 "/assets/assets" 而不是 "/assets/apps/mobile2/assets")
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
      // 让 metro 能跟 pnpm symlink 找到 packages/* 源文件。
      // mobile2 的 LoginScreen 1:1 移植后第一次引用 @bookdock/api-client 时触发了
      // "Unable to resolve module ./packages/api-client/src/index" 错根因就是
      // packages/ 不在 nodeModulesPaths 里,disableHierarchicalLookup=true 阻止 metro
      // 自动向上查找。加这一行让 metro 能解析 @bookdock/* workspace 包的 TS 源码。
      path.resolve(workspaceRoot, 'packages'),
    ],
    disableHierarchicalLookup: true,
    resolveRequest: (context, moduleName, platform) => {
      // markdown-it@10 legacy require：'entities/lib/maps/entities.json'
      if (moduleName === 'entities/lib/maps/entities.json') {
        // 在 .pnpm 真实存储里搜 entities@2.x（无 exports 字段的那个老版本）的 maps 目录
        const pnpmDir = path.resolve(workspaceRoot, 'node_modules/.pnpm');
        if (fs.existsSync(pnpmDir)) {
          for (const entry of fs.readdirSync(pnpmDir)) {
            if (!/^entities@\d+\.\d+\.\d+/.test(entry)) continue;
            const candidate = path.join(
              pnpmDir,
              entry,
              'node_modules',
              'entities',
              'lib',
              'maps',
              'entities.json',
            );
            if (fs.existsSync(candidate)) {
              return {type: 'sourceFile', filePath: candidate};
            }
          }
        }
        // 找不到就走默认解析（让 Metro 报更精确的错）
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);