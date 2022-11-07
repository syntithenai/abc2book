var fs = require('fs')
var sw = fs.readFileSync(__dirname + '/to_convert.abc', 'utf8')
var output = []
var parts = sw.split("\n")
for (var part in parts) {
    if (parts[part].startsWith('% abcbook-lastupdated ')) {
        current=parseInt(parts[part].slice(22))
        output.push('% abcbook-lastupdated '+(current + 1))
    } else {
        output.push(parts[part])
    }
}
var sw = fs.writeFileSync(__dirname + '/from_convert.abc', output.join("\n"), 'utf8')

