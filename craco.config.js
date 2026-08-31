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
