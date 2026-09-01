const path = require('path')
const ESLintPlugin = require('eslint-webpack-plugin')

const youtubePlayerOriginal = path.resolve(
  __dirname,
  'node_modules/youtube-player/dist/index.js'
)
const youtubePlayerSafe = path.resolve(
  __dirname,
  'src/youtubePlayerSafeFactory.js'
)

function isModuleScopePlugin(plugin) {
  return !!(
    plugin
    && plugin.constructor
    && plugin.constructor.name === 'ModuleScopePlugin'
  )
}

module.exports = {
  webpack: {
    alias: {
      'youtube-player': youtubePlayerSafe,
      'youtube-player-original': youtubePlayerOriginal,
    },
    configure: function(webpackConfig) {
      webpackConfig.ignoreWarnings = [
        function(warning) {
          return /Failed to parse source map/.test(warning.message)
        },
      ]

      // Allow the safe wrapper to require the real package (outside src/).
      // Match by constructor name — `instanceof` fails when CRACO and CRA load
      // separate copies of react-dev-utils/ModuleScopePlugin.
      if (Array.isArray(webpackConfig.resolve && webpackConfig.resolve.plugins)) {
        webpackConfig.resolve.plugins.forEach(function(plugin) {
          if (!isModuleScopePlugin(plugin)) return
          if (plugin.allowedFiles && typeof plugin.allowedFiles.add === 'function') {
            plugin.allowedFiles.add(youtubePlayerOriginal)
          }
          if (Array.isArray(plugin.allowedPaths)) {
            const allowedDir = path.dirname(youtubePlayerOriginal)
            if (plugin.allowedPaths.indexOf(allowedDir) === -1) {
              plugin.allowedPaths.push(allowedDir)
            }
          }
        })
      }

      // CRA's ESLint plugin prints every warning on each compile (~900 legacy
      // no-unused-vars hits). Keep errors in dev; suppress warning noise.
      if (process.env.NODE_ENV === 'development' && Array.isArray(webpackConfig.plugins)) {
        webpackConfig.plugins = webpackConfig.plugins.map(function(plugin) {
          if (plugin instanceof ESLintPlugin) {
            return new ESLintPlugin(Object.assign({}, plugin.options, {
              emitWarning: false,
            }))
          }
          return plugin
        })
      }

      // jspdf -> canvg ESM imports omit .js on @babel/runtime helpers; webpack 5
      // treats those as fully specified and fails to resolve them otherwise.
      webpackConfig.module.rules.push({
        test: /\.m?js$/,
        include: /node_modules[\\/](canvg|jspdf|html2canvas|fast-png|iobuffer)/,
        resolve: {
          fullySpecified: false,
        },
      })

      return webpackConfig
    },
  },
}
