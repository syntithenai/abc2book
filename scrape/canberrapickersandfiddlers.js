const puppeteer = require('puppeteer');
const fs = require('fs');
            
(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15000); 
    const navigationPromise = page.waitForNavigation();
   
    var dir = __dirname + '/canberrapickersandfiddlers';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, 0744);
    }
    var startTime = new Date().getTime()
    //console.log('start '+'https://www.folktunefinder.com/tunes/'+a)
    await page.goto('https://canberrapickersandfiddlers.netlify.app/tunes/alphabetical//');
    await page.setViewport({ width: 1440, height: 744 });
    await navigationPromise;
    let links = await page.$$eval('.columns-2 a', titles => {
      return titles.map(title => title.href);
    });
    let titles = await page.$$eval('.columns-2 a', loaded_titles => {
      return loaded_titles.map(title => title.innerText);
    });
    
    //console.log(links)
    var abcBlobs = []
    for (var i=links.length - 1; i >= 0; i--) {
        var link = links[i]
        var t = titles[i]
        var linkParts = link.split("/")
        var t = linkParts.length > 1 ? linkParts[linkParts.length - 2] : ''
        if (true ) {
            //console.log('load  '+t)
            //console.log('load  '+link)
             await page.goto(link);
             console.log('loaded  '+i+'/'+link.length+' ' +link)
             let abc = await page.$$eval('textarea', textareas => {
                 //console.log('load  ',textareas)
                 var loaded_codes = textareas.map(function(t) { 
                     //console.log('script  ',t)
                     return t.value
                     //return t.innerText.split("\n")[2]
                 })
                 //var finalRecord = {abc: code, links: []}
                 
                 return loaded_codes.join("\n\n")
             });
             //console.log('codes got  ')
             let links = await page.$$eval('div.my-alternate-classname', frames => {
                 //console.log('iframes  ',frames)
                 return frames.map(function(l) {
                     //element.getAttribute 
                     //console.log('iframe  ',l,l.getAttribute('id'))
                     return 'https://www.youtube.com/watch?v='+l.getAttribute('id')
                 })
             });
             //console.log('links',links)
             
             //console.log('code  ',codes, links)
             //codes.forEach(function(abc,ck) {
                 try {
                    //var abc = eval(code + ' ;  abc'  )
                    if (links.length > 0) {
                        links.forEach(function(link,lk) {
                            abc = abc + "\n% abcbook-link-"+lk+" "+ link
                            abc = abc + "\n% abcbook-link-title-"+lk+" "
                        })
                    }
                    abcBlobs.push(abc)
                    if (abc && abc.trim()) { 
                        fs.writeFile(dir + '/'+t+'.abc', abc + "\n", err => {
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
            //})
        }
    }
    console.log('FINAL',abcBlobs.join("\n\n"))
                    
    await browser.close();
  } catch (e) {
    console.log(e);
  }
})();
