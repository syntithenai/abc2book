var fs = require('fs')
var sw = fs.readFileSync(__dirname + '/sw.js', 'utf8')
//console.log(typeof sw, sw)
//requiring path and fs modules
const path = require('path');
//joining path of directory 
var notes = [
'A0.mp3',
'A1.mp3',
'A2.mp3',
'A3.mp3',
'A4.mp3',
'A5.mp3',
'A6.mp3',
'A7.mp3',
'Ab1.mp3',
'Ab2.mp3',
'Ab3.mp3',
'Ab4.mp3',
'Ab5.mp3',
'Ab6.mp3',
'Ab7.mp3',
'B0.mp3',
'B1.mp3',
'B2.mp3',
'B3.mp3',
'B4.mp3',
'B5.mp3',
'B6.mp3',
'B7.mp3',
'Bb0.mp3',
'Bb1.mp3',
'Bb2.mp3',
'Bb3.mp3',
'Bb4.mp3',
'Bb5.mp3',
'Bb6.mp3',
'Bb7.mp3',
'C1.mp3',
'C2.mp3',
'C3.mp3',
'C4.mp3',
'C5.mp3',
'C6.mp3',
'C7.mp3',
'C8.mp3',
'D1.mp3',
'D2.mp3',
'D3.mp3',
'D4.mp3',
'D5.mp3',
'D6.mp3',
'D7.mp3',
'Db1.mp3',
'Db2.mp3',
'Db3.mp3',
'Db4.mp3',
'Db5.mp3',
'Db6.mp3',
'Db7.mp3',
'E1.mp3',
'E2.mp3',
'E3.mp3',
'E4.mp3',
'E5.mp3',
'E6.mp3',
'E7.mp3',
'Eb1.mp3',
'Eb2.mp3',
'Eb3.mp3',
'Eb4.mp3',
'Eb5.mp3',
'Eb6.mp3',
'Eb7.mp3',
'F1.mp3',
'F2.mp3',
'F3.mp3',
'F4.mp3',
'F5.mp3',
'F6.mp3',
'F7.mp3',
'G1.mp3',
'G2.mp3',
'G3.mp3',
'G4.mp3',
'G5.mp3',
'G6.mp3',
'G7.mp3',
'Gb1.mp3',
'Gb2.mp3',
'Gb3.mp3',
'Gb4.mp3',
'Gb5.mp3',
'Gb6.mp3',
'Gb7.mp3',
]

var mainFiles = [
'favicon.ico',
'home-appicon.png',
'home-small.png',
'index.html',
'logo192.png',
'logo512.png',
'robots.txt',
'speakClient.js',
'speakGenerator.js',
'speakWorker.js',
'textsearch_index.json',
'close.png',
'arrow-up.png',
]



var cache = []
    
function getCacheFiles(callback) {
    console.log('load dyn',cache)
    fs.readdir(path.join(__dirname, 'static','js'), function (err, files) {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        } 
        //listing all files using forEach
        files.forEach(function (file) {
            // Do whatever you want to do with the file
            //console.log(file); 
            cache.push('static/js/'+file)
        });
        //console.log('load dyn',cache)
        fs.readdir(path.join(__dirname, 'static','css'), function (err, files) {
            if (err) {
                return console.log('Unable to scan directory: ' + err);
            } 
            console.log('load dyndd',files)
            //listing all files using forEach
            files.forEach(function (file) {
                // Do whatever you want to do with the file
                console.log('F',file); 
                cache.push('static/css/'+file)
            });
            notes.forEach(function(file) {cache.push('midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/'+file)})
            mainFiles.forEach(function(file) {cache.push(file)})
            console.log('load dyn',cache)
            callback(cache)
        });

    });
    return cache
}


var marker ='//// RESOURCES_LIST_MARKER'
var parts = sw.split(marker)
if (parts.length === 2) {
    getCacheFiles(function(filePaths) {
        parts[0] = "const RESOURCES_LIST = ["
        + filePaths.map(function(file) { return "'" + file + "'" }).join(", ")
        + "]"

        // plus dynamic from static folder
        
        
        fs.writeFileSync(__dirname + '/sw.js', parts.join(marker))
        console.log('written latest files to service worker',filePaths, parts[0])
    })
}




