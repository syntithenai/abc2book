const fs = require('fs')
const path = require('path')
const tools = require('../abc2book.converters.js')
//console.log('tools',tools)
const abcjs = require('abcjs');
//console.log('abcjs',abcjs)
// create index from files containing abc format
// index format where 
// - tokens are all the space seperated strings containing an array of matching tune ids
// - lookups is an object keyed by tune ids and containing their string titles (for picklist)
// eg
//{
    //"tokens": {"cat":[1001,1004,1003],"dog":[1002], "who": [1003]},
    //"lookups": {"1001": "joe cat", "1004": "cat my arse", "1003": "who cat", "1002": "dog gone"}
//}

function stripText(text) {
  return text ? text.trim().replace(/[^\w\s]/g,'').toLowerCase() : ''
}


var index = {tokens: {}, lookups: {}}
var files = []
var count = 0
var limit = 50000000
var dir = __dirname+'/folktunefinder/'
var fileNames = fs.readdirSync(dir)
for (var filenameKey in fileNames)  {
    var filename = fileNames[filenameKey]
    //console.log('filename', filename)
    if (filename.startsWith('abc_tune_folktunefinder_')) {
        var id = filename.slice(24, -4).trim()
        //console.log('filename match', filename)
        //const name = path.parse(filename).name;
        //const ext = path.parse(filename).ext;
        //const filepath = path.resolve(dir, filename);
        //const stat = fs.statSync(filepath);
        //const isFile = stat.isFile();
        var data = null
        try {
          const data = fs.readFileSync(dir + filename, 'utf8')
          //console.log(data)
          var parts = data.split("\nT:")
          if (parts.length > 1) {
            var innerParts = parts[1].split("\n")
            var title = innerParts[0].trim()
            if (title.length > 0 && id && id.length > 0) {
                index.lookups[id] = title
                var titleParts = stripText(title).split(' ')
                titleParts.forEach(function(token) {
                    var existing = index.tokens[token]
                    if (!Array.isArray(existing)) {
                        existing = []
                    }
                    existing.push(id)
                    index.tokens[token] = existing
                })
                
            }
          }
        } catch (err) {
          console.error(err)
        }
    }
    count++
    if (count > limit) break;

//if (isFile) files.push({ filepath, name, ext, stat });
};
fs.writeFileSync(__dirname.split("/").slice(0,-1).join("/") + "/textsearch_index.json"  , JSON.stringify(index));

console.log('index', index)
