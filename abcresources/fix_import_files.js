const fs = require('fs')
const path = require('path')
//const tools = require('../abc2book.converters.js')
//console.log('tools',tools)
//const abcjs = require('abcjs');
//console.log('abcjs',abcjs)
// fix import files
var index = {tokens: {}, lookups: {}}
var files = []
var count = 0
var limit = 600000000
var fixed = 0
var ignored = 0
var nofile = 0
var dir = __dirname+'/abcfiles/'
var ids = []
var fileNames = fs.readdirSync(dir)
for (var filenameKey in fileNames)  {
    var filename = fileNames[filenameKey]
    //console.log('filename', filename)
    if (filename.startsWith('abc_tune_folktunefinder_')) {
        var id = filename.slice(24, -4).trim()
        ids.push(id)
        //console.log('filename match', filename)
        //const name = path.parse(filename).name;
        //const ext = path.parse(filename).ext;
        //const filepath = path.resolve(dir, filename);
        //const stat = fs.statSync(filepath);
        //const isFile = stat.isFile();
        var data = null
        var final = []
        try {
          const data = fs.readFileSync(dir + filename, 'utf8')
          //console.log(data)
          // look for U:key:data
          // convert to % key data
          // allow for many
          var changed = false;
          var parts = data.split("\n")
          for (var partKey in parts) {
            var part = parts[partKey]
            if (part.startsWith('U:')) {
                //var lineParts = part.split(":")
                //if (lineParts.length >= 3) {
                    //fixed++
                    //changed = true;
                    //var key = lineParts[1].trim()
                    //var value = lineParts[2].trim()
                    //var regexp = /%20/g
                    //parts[partKey] = "% "+key.replace(regexp,'_') + " " + value.replace(regexp,' ')
                //} else {
                  //ignored++   
                //}
            }  else {
                changed = true
                final.push(part)
            }
          }
          if (changed)  {
            fs.writeFileSync(dir + filename, final.join("\n"), function(err) {
                if(err) {
                    return console.log(err);
                }
            }); 
          } 
        } catch (err) {
          console.error(err)
        }
    }
    count++
    if (count > limit) break;

//if (isFile) files.push({ filepath, name, ext, stat });
};

console.log(fixed,ignored, ids)
