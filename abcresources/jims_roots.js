const puppeteer = require('puppeteer');
const fs = require('fs');
                
//function generateFileName(id) {
    //return 'abc_tune_folktunefinder_'+id+".txt"
//}                
                
(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15000); 
    const navigationPromise = page.waitForNavigation();
   
    var dir = __dirname + '/jimsroots';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, 0744);
    }
    var startTime = new Date().getTime()
    //console.log('start '+'https://www.folktunefinder.com/tunes/'+a)
    await page.goto('http://jimsrootsandblues.com/fiddle-tune-notation/');
    await page.setViewport({ width: 1440, height: 744 });
    await navigationPromise;
    let links = await page.$$eval('.fiddle a', titles => {
      return titles.map(title => title.href);
    });
    
    //console.log(links)
    var abcBlobs = []
    for (var i=0; i < links.length; i++) {
        var link = links[i]
        var linkParts = link.split("/")
        var t = linkParts.length > 1 ? linkParts[linkParts.length - 2] : ''
        if (true || t > 'golden-slippers-2') {
            //console.log('load  '+t)
            //console.log('load  '+link)
             await page.goto(link);
             console.log('loaded  '+i+'/'+links.length+' ' +link)
             let codes = await page.$$eval('.entry-content script', scripts => {
                 console.log('load  ',scripts)
                 var code = scripts.map(function(script) { 
                     console.log('script  ',script)
                     return script.innerText.split("\n")[2]
                 })
                 return code
             });
             console.log('code  ',codes)
             codes.forEach(function(code,ck) {
                 try {
                    var abc = eval(code + ' ;  abc'  )
                    
                    if (abc && abc.trim()) { 
                        fs.writeFile(dir + '/'+t+'_'+ck+'.abc', abc + "\n", err => {
                          if (err) {
                            console.error(err)
                            return
                          }
                          //file written successfully
                        })
                    } else {
                        fs.appendFile(dir + '/errors.txt', link + "\n" + code +"\n", err => {
                          if (err) {
                            console.error(err)
                            return
                          }
                          //file written successfully
                        })
                    }

                 } catch (e) {
                     console.log(e)
                 }
            })
        }
    }
 
    await browser.close();
  } catch (e) {
    console.log(e);
  }
})();
