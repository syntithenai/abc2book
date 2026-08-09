function html2canvas() {
  return Promise.resolve({
    width: 794 * 3,
    height: 1123 * 3,
    toDataURL: function() {
      return 'data:image/png;base64,abc'
    },
  })
}

html2canvas.default = html2canvas
module.exports = html2canvas
