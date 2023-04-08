const puppeteer = require('puppeteer');
const fs = require('fs');
//const urlList = require('./australianbushtrad.urllist.txt')

  
  
(async () => {
    var output = []
    var urlList = fs.readFileSync('./australianbushtrad.urllist.txt', {encoding:'utf8', flag:'r'})
    var urls = urlList.split("\n")
    //console.log(urlList,urls)
  
      try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(20000); 
        const navigationPromise = page.waitForNavigation();
        var start = 1
        var limit = 600000
        var maxErrors = 100
        var maxEmpty = 1000
        var a = start
        var continuousErrors = 0
        var continuousEmpty = 0
        //var dir = __dirname + '/empty';
        //if (!fs.existsSync(dir)) {
            //fs.mkdirSync(dir, 0744);
        //}
        var startTime = new Date().getTime()
        
        //var founddir = __dirname+'/folktunefinder/'
        //var founddone = {}
        //var fileNames = fs.readdirSync(dir)
        //console.log('FILENAMES',fileNames.length)
        //for (var filenameKey in fileNames)  {
            //var fileName = fileNames[filenameKey]
            //var fileNumber = fileName.slice(24,-4)
            ////console.log('foundfile',fileNumber, fileName)
            //founddone[fileNumber] = true
        //}
        //console.log('complete',Object.keys(founddone).length)
        //var emptydir = __dirname+'/empty/'
        //var emptydone = {}
        //var emptyFileNames = fs.readdirSync(emptydir)
        //for (var filenameKey in emptyFileNames)  {
            //var fileName = emptyFileNames[filenameKey]
            //var fileNumber = fileName.slice(24,-4)
            ////console.log('emptyfile',fileNumber, fileName)
            //emptydone[fileNumber] = true
        //}
        //console.log('empty',Object.keys(emptydone).length)
        
        for  (var urlKey in urls) {
            var url = urls[urlKey]
            console.log('URL',url)
            // 
            if (true) {
                try {
                    console.log('start '+url)
                    await page.goto(url);
                    console.log('goto')
                    await page.setViewport({ width: 1440, height: 744 });
                    console.log('loading')
                    await navigationPromise;
                    console.log('nav ok')
                    
                    //await page.waitForSelector('pre');
                    //console.log('sel ok')
                    //await page.waitForSelector('pre');
                    let abc = await page.$$eval('.abctext', abcs => {
                      return abcs.map(title => title);
                    });
                    if (abc && abc.length > 0) {
                        console.log('nav ok2', abc[0].abctext_)
                        output.push(abc[0].abctext_)
                    }
                    //let features = []
                    //test.map(function(title) {
                          ////console.log('title', title)
                          //if (title && title.startsWith('https://www.folktunefinder.com/tunes?features=')) {
                              //features.push(title.slice(46))
                          //}
                          //return
                    //});
                    ////console.log('features',features)
                    
                    //if (abcBlobs.length  > 0) {
                        //var results = abcBlobs[0] + "\nS:https://www.folktunefinder.com/tunes/"+a +"\n" 
                        //var seen = []
                        //sourceLink.map(function(link) {
                            //if (link && link.trim().length > 0 && seen[link] !== true) {
                                //var linkParts = link.split("\n")
                                //linkParts.forEach(function(linkLine) {
                                    //results += "S:"+linkLine + "\n"
                                    //seen[link] = true
                                //})
                            //}
                            //return
                        //})
                        //var seenFeature = []
                        //features.map(function(feature) {
                            //if (feature && feature.trim().length > 0 && seenFeature[feature] !== true) {
                                ////results += "U:"+feature + "\n"
                                //var featureParts = feature.split(":")
                                //var regexp = /%20/g
                                //results += "% "+featureParts[0].replace(regexp,'_') + " " + featureParts.slice(1).join(":").replace(regexp,' ') + "\n"
                                //seenFeature[feature] = true
                            //}
                            //return
                        //})
                        //fs.writeFile(__dirname + "/folktunefinder/" + generateFileName(a), results, err => {
                          //if (err) {
                            //console.error(err)
                            //return
                          //}
                          ////file written successfully
                          ////console.log('OK '+ a)
                        //})
                        
                        //continuousEmpty = 0
                    //} else {
                        //// write empty file
                        //fs.writeFile(__dirname + '/empty/'+generateFileName(a), '', err => {
                          //if (err) {
                            //console.error(err)
                            //return
                          //}
                          ////file written successfully
                        //})
                        //console.log('EMPTY RESULT')
                        //continuousEmpty++
                    //}
                    //continuousErrors = 0
                } catch (e) {
                  if (e ) { //instanceof puppeteer.errors.TimeoutError) {
                    // Do something if this is a timeout.
                    //continuousErrors ++
                    console.log('ERR',e)
                  }
                }
                //console.log('ERRS:',continuousErrors)
                //console.log('EMPTY:',continuousEmpty)
                fs.writeFile('traditionalaustralianmusicwiki.abc', output.join("\n\n"), err => {
                  if (err) {
                    console.error(err)
                    return
                  }
                  //file written successfully
                })    
            } else {
                console.log('SKIP '+a)
            }
            a++
            
        }
        await browser.close();
      } catch (e) {
        console.log(`Error  ${e.message}`);
      }
})();

////});
