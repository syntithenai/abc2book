const fs = require('fs')
const path = require('path')
var dir = __dirname+'/cassidy/'
var fileNames = fs.readdirSync(dir)
var count = 0
for (var filenameKey in fileNames)  {
    count++
    var filename = fileNames[filenameKey]
    if (filename.endsWith('cho')) {
        var final = []
        try {
              const data = fs.readFileSync(dir + filename, 'utf8')
              var parts = data.split("\n")
              for (var partKey in parts) {
                var part = parts[partKey]
                if (part.startsWith("{title:")) {
                    var end = part.indexOf("}")
                    if (end > 7) {
                        console.log("X: " + count)
                        console.log("T: " + part.slice(7,end))
                        
                    } else {
                        console.log("X: " + count)
                        console.log("T: " + part.slice(7))
                    }
                } else if (part.startsWith("{key:") || part.startsWith("{tempo:")) {
                    //ignore
                } else {
                    console.log('W:' + unescape(part))
                }
                
              }
            } catch (err) {
              console.error(err)
            }
        }
    //}
    //count++
    //if (count > limit) break;

//if (isFile) files.push({ filepath, name, ext, stat });
};

//console.log(fixed,ignored, ids)
