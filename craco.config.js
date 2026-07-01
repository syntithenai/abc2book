const ESLintPlugin = require('eslint-webpack-plugin')

module.exports = {
  webpack: {
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

      return webpackConfig
    },
  },
}
