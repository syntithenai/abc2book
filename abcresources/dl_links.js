var fs = require('fs')
const useAbcTools = require('./abctools')
//const tools = require('../abc2book.converters.js')
const tools = useAbcTools()
//const { exec } = require('node:child_process');
const { exec } = require('child_process');



function recursiveDownload(links,callback) {
    console.log("Download "+ links.length)
    if (Array.isArray(links) && links.length > 0) {
       var link = links[0] 
        
        //var cmd = 'yt-dlp -xv --audio-format wav  -o audio-'+key+'.wav -- '+link
        console.log(link.dlCmd)
        console.log(link.mp3Cmd)
        exec(link.dlCmd, (error, stdout, stderr) => {
              if (error) {
                console.error(`error: ${error.message}`);
                //return;
              }

              if (stderr) {
                console.error(`stderr: ${stderr}`);
                //return;
              }

              console.log(`stdout:\n${stdout}`);
              console.log('downloaded '+link.link)
              exec(link.mp3Cmd, (error, stdout, stderr) => {
                  if (error) {
                    console.error(`error: ${error.message}`);
                    //return;
                  }

                  if (stderr) {
                    console.error(`stderr: ${stderr}`);
                    //return;
                  }

                  console.log(`stdout:\n${stdout}`);
                  console.log('encoded '+link.link)
                  fs.unlinkSync(link.dlFile)
                  //setTimeout(function() {
                  var toProcessLinks = links.slice(1)
                  if (toProcessLinks.length > 0) {
                      recursiveDownload(toProcessLinks, callback)
                  }
            })
              //},Math.floor(Math.random() * 10000))
         });
       } else {
           callback()
       }
    }

console.log(process.argv)
if (process.argv.length > 2 && process.argv[2].toLowerCase().endsWith('.abc') && fs.existsSync(process.argv[2])) {
    var sw = fs.readFileSync(process.argv[2], 'utf8')
    var tunebook = tools.abc2Tunebook(sw)
    var fileNameParts = process.argv[2].split("/")
    var fileName = fileNameParts[fileNameParts.length - 1]
    var folderNameParts = fileName.split(".")
    var folderName = ''
    if (folderNameParts.length > 1) {
        folderName = './mp3_' + folderNameParts.slice(0,-1).join(".")
    } else {
        folderName = './mp3_' + folderNameParts[0]
    }
    folderName = String(folderName).replace(new RegExp(' ' , 'g'),'')
    if (!fs.existsSync(folderName)) fs.mkdirSync(folderName)
    //console.log(tunebook)
    var links = []
    tunebook.forEach(function(tune,tuneKey) {
        if (tune.links && tune.links.length > 0) {
            //console.log(tune ? tune.id + ":" + tune.name : '')
            tune.links.forEach(function(link,linkNumber) {
                console.log(link)
                if (link.link && link.link.trim()) {
                    var key = tune.id+'-'+linkNumber
                    
                    // already downloaded ?
                    if (!fs.existsSync(folderName+'/audio-'+key+'.mp3'))  {
                        var dlCmd = 'yt-dlp -xv --audio-format wav  -o audio-'+key+'.wav -- "'+link.link +'"'
                        var startAt = link.startAt > 0 ? link.startAt : 0
                        var endAt = link.endAt > 0 ? link.endAt : 0
                        var duration = endAt - startAt
                        var mp3TagFlags = '-movflags use_metadata_tags  -map_metadata 0 -metadata title="'+(tune.name ? tune.name.trim() : '')+'"  -metadata artist="'+(tune.composer ? tune.composer.trim() : '')+'"'
                        var mp3Cmd = 'ffmpeg '+(startAt > 0 ? '-ss '+startAt : '' )+(duration > 0 ? ' -t '+duration : '' )+' -i audio-'+key+'.wav -ac 1 '+mp3TagFlags + ' '+folderName+'/audio-'+key+'.mp3' 
                        
                        links.push({key:key, link: link.link, dlCmd:dlCmd, mp3Cmd: mp3Cmd, dlFile: 'audio-'+key+'.wav'})
                    }
                }
            })
        }
    }) 
    //links.forEach(function(link) {
        //console.log(link.dlCmd)
        //console.log(link.mp3Cmd)
    //})
    recursiveDownload(links,function() {
        console.log('ALL DONE')
        })
    //links.forEach(function(link) {
        //console.log(link.mp3Cmd)
    //})
    
    //var originalNameParts = process.argv[2].split(".")
    //var newFileName = process.argv.length > 3 ? process.argv[3] : originalNameParts.slice(0,-1).join(".") + '-embedded.abc'
    //var out = fs.writeFileSync(newFileName, output.join("\n"), 'utf8')
} else {
    console.log("Usage:\n nodejs embed_links.js <input file name>.abc <OPTIONAL output filename> \n\n Output filename defaults to appending -embed to name")
}
