const fs = require('fs');
const data = fs.readFileSync( __dirname+'/thesession.org.json', 'utf8')
const tunes = JSON.parse(data)
var output = []

 function getRhythmTypes() {
        return {
        'jig': '6/8',
        'reel':  '4/4',
        'slip jig':  '9/8',
        'hornpipe':  '4/4',
        'polka':  '2/4',
        'slide':  '12/8',
        'waltz':  '3/4',
        'barndance':  '4/4',
        'strathspey':  '4/4',
        'three-two':  '3/2',
        'mazurka':  '3/4'
      }
    }

    function timeSignatureFromTuneType(type) {
      var types = getRhythmTypes()
      if (types.hasOwnProperty(type)) {
        return types[type]
      } else {
        return ''
      }
    }

var bookNumber = 0
for (var tuneKey in tunes) {
    var tune = tunes[tuneKey]
    if (tune) {
        output.push('X: '+tuneKey)
        output.push('T: '+tune.name)
        output.push('R: '+tune.type)
        output.push('M: '+timeSignatureFromTuneType(tune.type))
        output.push('K: '+tune.mode)
        output.push(tune.abc)
        output.push('')
        output.push('')
    }
    //if (parseInt(tuneKey/3000) !== bookNumber) {
        fs.writeFileSync( __dirname+'/thesession/abc_tune_thesession_' + (bookNumber + 1) + '.abc',output.join("\n"), 'utf8')
        bookNumber++
        output = []
    //}
}
//fs.writeFileSync('thesession.org.final.abc',output.join("\n"), 'utf8')
        


