var fs = require('fs')
const useAbcTools = require('./abctools')
//const tools = require('../abc2book.converters.js')
const tools = useAbcTools()


//console.log(process.argv)
var final = []
if (process.argv.length > 2 && process.argv[2].toLowerCase().endsWith('.abc') && fs.existsSync(process.argv[2])) {
    var sw = fs.readFileSync(process.argv[2], 'utf8')
    var tunebook = tools.abc2Tunebook(sw)
    //console.log(tunebook)
    var links = []
    tunebook.forEach(function(tune,tuneKey) {
        if (tune.links && tune.links.length > 0) {
            //console.log(tune ? tune.id + ":" + tune.name : '')
            //if (tune.links.length > 1) {
                
                //if (parseInt(tune.links[1].link) > 0) {
                    
                //}
            //}
            var linkMeta = {}
            var lastGoodLink = 0
            if (Array.isArray(tune.links)) {
                tune.links.forEach(function(link,linkNumber) {
                    if (link && link.link) {
                        //console.log(link,linkNumber) //.link)
                        //var clearLinks = {}
                        if ((link.link.indexOf('http') === -1) && parseInt(link.link) > 0 ) {
                            //console.log('FOUND BAD LINKS',tune.id,JSON.stringify(tune.links))
                            if (linkMeta[lastGoodLink] && Array.isArray(linkMeta[lastGoodLink].numbers))  {
                                linkMeta[0].numbers.push(link.link)
                            }
                            //if (startAt[lastGoodLink] > 0) {
                                //endAt[linkNumber] = parseInt(link.link)
                            //} else {
                                //startAt[linkNumber] = parseInt(link.link)
                            //}
                            //clearLinks[linkNumber] = true
                            //console.log(JSON.stringify(tune.links))
                        } else {
                            lastGoodLink = linkNumber
                            linkMeta[lastGoodLink] = {numbers:[],link:link.link, title: link.title}
                        }
                    }
                    //if (Object.keys(linkMeta).length > 0) console.log("AAA",linkMeta)
                    //JSON.stringify(startAt),JSON.stringify(endAt),JSON.stringify(tunebook[tuneKey].links))
                    //Object.keys(startAt).forEach(function(s) {
                        //console.log(tunebook[tuneKey].links)
                        //tunebook[tuneKey].links[parseInt(s)].startAt = startAt[s]
                    //})
                    //Object.keys(endAt).forEach(function(e) {
                        //tunebook[tuneKey].links[parseInt(e)].endAt = endAt[e]
                    //})
                    
                    //tunebook[tuneKey].links = tunebook[tuneKey].links.filter(function(link,lc) {
                        //return !(clearLinks[lc])
                    //});
                    
                })
                tunebook[tuneKey].links = Object.keys(linkMeta).map(function(l) {
                    var link = linkMeta[l]
                    var f = {link: link.link, title: link.title}  
                    if (link.numbers.length > 1) {
                        f.startAt = link.numbers[0]
                        f.endAt = link.numbers[1]
                    } else if (link.numbers.length > 0) {
                        f.startAt = link.numbers[0]
                    }
                    return f
                })
            }
            //console.log("AAA",linkMeta)
        }
        //console.log(JSON.stringify(tune))
        var abc = tools.json2abc(tune)
        //console.log(abc)
        final.push(abc)
    })
    //console.log(final.join("\n\n"))
}

console.log(final.join("\n\n"))
