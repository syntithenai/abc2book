var fs = require('fs')

function renameFolder(key) {
    var folder = __dirname + '/' + key
    var fileNames = fs.readdirSync(folder)
    var found = 0
    var max = 0
    for (var filenameKey in fileNames)  {
        var parts = fileNames[filenameKey].split(".")
        var parts1 = parts[0].split("_")
        var num = parseInt(parts1[parts1.length -1])
        if (num > max) max = num
    }
    var offset = max //fileNames.length
    
    for (var filenameKey in fileNames)  {
        var filename = fileNames[filenameKey]
        //console.log('filename', filename)
        if (filename.endsWith('.abc') && !filename.startsWith('abc_tune_'+key)) {
            found = found + 1
            //console.log('filename key', fileNames.length + found - 1)
            
            if (!fs.existsSync(folder + '/' +  'abc_tune_'+key + '_'+(offset + found) +".abc"))  {
                console.log('rename',folder + '/' + filename,'to',folder + '/' +  'abc_tune_'+key + '_'+(offset + found ) +".abc")
            
                fs.rename(folder + '/' + filename, folder + '/' +  'abc_tune_'+key+'_'+(offset + found )+".abc", function(err) {
                    if ( err ) console.log('ERROR: ' + err);
                });
            } else {
                console.log('Failed rename: file exists copying ',folder + '/' + filename,'to',folder + '/' +  'abc_tune_'+key + '_'+(offset + found) +".abc")
            }
        }
    }
}

renameFolder('misc')
renameFolder('jimsroots')
renameFolder('norbeck')
renameFolder('folkinfo')
