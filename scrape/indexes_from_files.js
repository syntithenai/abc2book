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


function isAliasLine(line) {
    return (line.startsWith("N: AKA: "))
}

function isMetaLine(line) {
    if (line[1] === ":" && line[0] !== "|" && line[2] !== "|" ) {
        // avoid alias lines
        return isAliasLine(line) ? false : true
        
    } else {
        return false
    }
}


function getNotesFromAbc(abc) {
    //console.log("GET NOTES FROM ABC",abc)
    if (!abc) return ''
    var parts = abc.split('\n')
    var noteLines = []
    parts.forEach(function(line) { 
        //console.log('try',line)
        if (line !== undefined && line !== null && !line.startsWith('%') && !isMetaLine(line) && !isAliasLine(line) && (line.trim().length > 0)) {
            //console.log('try OK', line.startsWith('% ') , isMetaLine(line), isAliasLine(line))
            noteLines.push(line)
        }    
    })
    var notes = noteLines
    //console.log('GET ABC',noteLines)
    try {
        notes = abcjs.extractMeasures("X:9\nK:G\n"+noteLines.join("\n"))
        //console.log('GET ABC',m)
        if (notes.trim().length === 0) {
            notes = noteLines
        }
    } catch(e) {
        notes = noteLines
    }
    //console.log('Gna',abc,noteLines)
    return notes.join("\n")
}

function stripText(text) {
    var result = ''
    if (text && text.trim) {
        result = text.trim().replace(/[^a-zA-Z0-9 ]/g, ' ').toLowerCase().trim()
    }
   return result
}
var settings={}
function pushSetting(title,id) {
    if (!Array.isArray(settings[title])) settings[title] = []
    settings[title].push(id)
}
const cyrb53 = function(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
    h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1>>>0);
};
var index = {tokens: {}, lookups: {}}
var files = []
var count = 0
var limit = 50000000
var seenNotesHash = {}
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
          //
          var tunebook = new abcjs.TuneBook(data)
          //console.log(tunebook)
          tunebook.tunes.forEach(function(tune) {
            //console.log(tune)  
          //var parts = data.split("\nT:")
          //if (parts.length > 1) {
            //var innerParts = parts[1].split("\n")
            var title = tune.title //innerParts[0].trim()
            var notes = getNotesFromAbc(tune.abc)
            // skip if notes have been seen before
            var hash = cyrb53(notes)
            //console.log(title,notes)
            if (!seenNotesHash[hash] && title && title.length > 0 && id && id.length > 0) {
                seenNotesHash[hash] = true
                index.lookups[id] = title
                var titleParts = title.split(' ')
                titleParts.forEach(function(tokenDirty) {
                    var token  = stripText(tokenDirty)
                    //console.log(tokenDirty,"R", token)
                    var existing = index.tokens[token]
                    if (!Array.isArray(existing)) {
                        existing = []
                    }
                    existing.push(id)
                    index.tokens[token] = existing
                })
                pushSetting(stripText(title), id)
            }
          })
        } catch (err) {
          console.error(err)
        }
    }
    count++
    if (count > limit) break;

//if (isFile) files.push({ filepath, name, ext, stat });
};
index.settings = settings
fs.writeFileSync(__dirname.split("/").slice(0,-1).join("/") + "/textsearch_index.json"  , JSON.stringify(index));

//console.log('index', index)
