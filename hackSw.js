var fs = require('fs')
var sw = fs.readFileSync(__dirname + '/sw.js', 'utf8')
const path = require('path');

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
'favicon.png',
'apple-touch-icon.png',
'tunebook-icon.svg',
'tunebook-icon-header.svg',
'tunebook-icon-launcher.svg',
'manifest.json',
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
'spinner.svg',
'spinner.gif',
'beer.png',
'playlist-follow-icon.png',
'opensource.svg',
'notation-key-signature.png',
'notation-time-signature.png',
// Helper libraries loaded directly by index.html. They are pulled in with
// async/defer so a fresh offline install would otherwise miss them, breaking
// the tuner/pitch detection (aubio), MP3 export (lame) and QR codes (qrcode).
'aubio.js',
'lame.min.js',
'qrcode.js',
// Workers / worklets referenced by absolute public URLs (not webpack-bundled).
'pdf.worker.min.js',
'mp3encodingworker.js',
'practiceAubioPitchWorker.js',
'practice-capture-processor.js',
]

// Small static asset trees needed for core UI / playalong offline.
var assetDirs = [
  'icons',
  'drums',
  'helpimages',
  'book_images',
  'feed_images',
]

function shouldPrecacheStaticFile(file) {
  // Source maps and license sidecars bloat the install (~50MB+) and are unused offline.
  if (file.endsWith('.map')) return false
  if (file.endsWith('.LICENSE.txt')) return false
  return true
}

function listFilesRecursive(absDir, urlPrefix, out) {
  var entries
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true })
  } catch (e) {
    return
  }
  entries.forEach(function (entry) {
    var abs = path.join(absDir, entry.name)
    var rel = urlPrefix + '/' + entry.name
    if (entry.isDirectory()) {
      listFilesRecursive(abs, rel, out)
    } else if (entry.isFile()) {
      out.push(rel)
    }
  })
}

var cache = []

function getCacheFiles(callback) {
    fs.readdir(path.join(__dirname, 'static','js'), function (err, files) {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }
        files.forEach(function (file) {
            if (shouldPrecacheStaticFile(file)) {
              cache.push('static/js/'+file)
            }
        });
        fs.readdir(path.join(__dirname, 'static','css'), function (err, files) {
            if (err) {
                return console.log('Unable to scan directory: ' + err);
            }
            files.forEach(function (file) {
                if (shouldPrecacheStaticFile(file)) {
                  cache.push('static/css/'+file)
                }
            });
            notes.forEach(function(file) {cache.push('midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/'+file)})
            var selectionInstruments = [
                'acoustic_grand_piano',
                'acoustic_guitar_nylon',
                'acoustic_guitar_steel',
                'acoustic_bass',
                'cello',
                'flute',
                'orchestral_harp',
                'pizzicato_strings',
                'string_ensemble_1',
                'violin',
                'brass_section',
                'slap_bass_1',
            ]
            selectionInstruments.forEach(function(instrument) {
                notes.forEach(function(file) {
                    cache.push('midi-js-soundfonts/selection/MusyngKite/' + instrument + '-mp3/' + file)
                })
                cache.push('midi-js-soundfonts/selection/MusyngKite/' + instrument + '-mp3.js')
            })
            mainFiles.forEach(function(file) {cache.push(file)})
            assetDirs.forEach(function (dir) {
              listFilesRecursive(path.join(__dirname, dir), dir, cache)
            })
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

        fs.writeFileSync(__dirname + '/sw.js', parts.join(marker))
        console.log('written latest files to service worker', filePaths.length, 'entries')
    })
}
