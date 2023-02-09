//# https://abcnotation.com/tunes



const fs = require('fs')
const path = require('path')
const useAbcTools = require('./abctools')
//const tools = require('../abc2book.converters.js')
const tools = useAbcTools()
//console.log('tools',tools)
//const abcjs = require('abcjs');
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
    //try {
        //notes = abcjs.extractMeasures("X:9\nK:G\n"+noteLines.join("\n"))
        //console.log('GET ABC notes',m)
        //if (notes.trim().length === 0) {
            //notes = noteLines
        //}
    //} catch(e) {
        //notes = noteLines
    //}
    //console.log('Gna',abc,noteLines)
    return notes.join("\n")
}

function stripText(text) {
    var result = ''
    if (text && text.trim) {
        //0-9
        result = text.trim().replace(/[^a-zA-Z ]/g, ' ').toLowerCase().trim()
    }
   return result
}
var settings={}
function pushSetting(title,id) {
    //console.log("push settings",title,id)
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
var duplicates = {}

function processFile(filename, dir,folderIndex,folderKey, forceDups = false) {
        var parts = filename.split(".")
        var parts2 = parts[0].split('_')
        var id = parts2[parts2.length - 1]
        try {
          const data = fs.readFileSync(dir + filename, 'utf8')
          var tunebook = tools.abc2Tunebook(data)
          //console.log(tunebook)
          tunebook.forEach(function(tune,tuneKey) {
            var title = tools.stripText(tune.name) //innerParts[0].trim()
            if (title && title.toLowerCase().trim().endsWith(", the")) {
                title = "The "+title.slice(0,-5)
                //console.log('HACK TITLE',title)
            }
            if (title && title.toLowerCase().trim().endsWith(" the")) {
                title = "The "+title.slice(0,-4)
                //console.log('HACK TITLE',title)
            }
            var titleParts = title.split(' ').filter(function(item) {
               return   (item.trim().length > 1) ? true : false
            }).map(function(item) {
                if (item.length > 1) {
                    return item.slice(0,1).toUpperCase() + item.slice(1)  
                } else {
                    return item
                }
            })
            title = titleParts.join(' ')
            
            //console.log('TITLE',title)
            var notes = JSON.stringify(tune.voices)
            // skip if notes have been seen before
            var hash = cyrb53(notes)
            //console.log(title,notes)
            if ((forceDups || !seenNotesHash[hash]) && title && title.length > 0 && id && id.length > 0) {
                seenNotesHash[hash] = true
                var tk = folderIndex+'-'+id + "-" + tuneKey
                index.lookups[tk] = title
                var titleParts = stripText(title).split(' ')
                titleParts.forEach(function(tokenDirty) {
                    var token  = tokenDirty.trim()
                    if (token.length > 1 && token !== "the") {
                        //console.log(tokenDirty,"R", token)
                        var existing = Array.isArray(index.tokens[token]) ? index.tokens[token] : []
                        existing.push(tk)
                        index.tokens[token] = existing
                        if (token.endsWith('s')) {
                            var key = token.slice(0,-1)
                            var existingS = Array.isArray(index.tokens[key]) ? index.tokens[key] : []
                            existingS.push(tk)
                            index.tokens[key] = existingS
                        }
                        if (token.endsWith('ing')) {
                            var key = token.slice(0,-3)
                            var existingS = Array.isArray(index.tokens[key]) ? index.tokens[key] : []
                            existingS.push(tk)
                            index.tokens[key] = existingS
                        }
                        if (token.endsWith('ed')) {
                            var key = token.slice(0,-2)
                            var existingS = Array.isArray(index.tokens[key]) ? index.tokens[key] : []
                            existingS.push(tk)
                            index.tokens[key] = existingS
                        }
                        
                    }
                })
                pushSetting(stripText(title), tk)
             } else {
                 duplicates[dir+"-"+title] = duplicates[dir+"-"+title] > 0 ? duplicates[dir+"-"+title] + 1 : 1
             }
          })
        } catch (err) {
          console.error(err)
        }
        //console.log("SSS",settings)
}

var folderKey = 'folktunefinder'
var folderIndex = 0
var dir = __dirname+'/'+folderKey+'/'
var fileNames = fs.readdirSync(dir)
for (var filenameKey in fileNames)  {
    var filename = fileNames[filenameKey]
    //console.log('filename', filename)
    if (filename.startsWith('abc_tune_')) {
        processFile(filename,dir,folderIndex,folderKey)
    }
    count++
    if (count > limit) break;

//if (isFile) files.push({ filepath, name, ext, stat });
};

folderKey = 'thesession'
folderIndex = 1
dir = __dirname+'/'+folderKey+'/'
fileNames = fs.readdirSync(dir)
for (var filenameKey in fileNames)  {
    var filename = fileNames[filenameKey]
    //console.log('filename', filename)
    if (filename.startsWith('abc_tune_')) {
       processFile(filename,dir,folderIndex,folderKey)
    }
    count++
    if (count > limit) break;

//if (isFile) files.push({ filepath, name, ext, stat });
};


folderKey = 'jimsroots'
folderIndex = 2
dir = __dirname+'/'+folderKey+'/'
fileNames = fs.readdirSync(dir)
for (var filenameKey in fileNames)  {
    var filename = fileNames[filenameKey]
    //console.log('filename', filename)
    if (filename.endsWith('.abc')) {
       processFile(filename,dir,folderIndex,folderKey)
    }
    count++
    if (count > limit) break;

//if (isFile) files.push({ filepath, name, ext, stat });
};

folderKey = 'misc'
folderIndex = 3
dir = __dirname+'/'+folderKey+'/'
fileNames = fs.readdirSync(dir)
for (var filenameKey in fileNames)  {
    var filename = fileNames[filenameKey]
    //console.log('filename', filename)
    if (filename.endsWith('.abc')) {
       processFile(filename,dir,folderIndex,folderKey, true)
    }
    count++
    if (count > limit) break;

//if (isFile) files.push({ filepath, name, ext, stat });
};

folderKey = 'norbeck'
folderIndex = 4
dir = __dirname+'/'+folderKey+'/'
fileNames = fs.readdirSync(dir)
for (var filenameKey in fileNames)  {
    var filename = fileNames[filenameKey]
    //console.log('filename', filename)
    if (filename.endsWith('.abc')) {
       processFile(filename,dir,folderIndex,folderKey, true)
    }
    count++
    if (count > limit) break;

//if (isFile) files.push({ filepath, name, ext, stat });
};

folderKey = 'folkinfo'
folderIndex = 5
dir = __dirname+'/'+folderKey+'/'
fileNames = fs.readdirSync(dir)
for (var filenameKey in fileNames)  {
    var filename = fileNames[filenameKey]
    //console.log('filename', filename)
    if (filename.endsWith('.abc')) {
       processFile(filename,dir,folderIndex,folderKey, true)
    }
    count++
    if (count > limit) break;

//if (isFile) files.push({ filepath, name, ext, stat });
};


index.settings = settings

fs.writeFileSync(__dirname.split("/").slice(0,-1).join("/") + "/textsearch_index.json"  , JSON.stringify(index));

//console.log('index', index.tokens)
console.log("duplicates",duplicates)
