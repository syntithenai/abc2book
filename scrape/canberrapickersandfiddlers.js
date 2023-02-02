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
    await page.goto('https://canberrapickersandfiddlers.netlify.app/tunes/alphabetical/');
    await page.setViewport({ width: 1440, height: 744 });
    await navigationPromise;
    var toScrape = {}
    //var seenTitles = {}
    let links = await page.$$eval('.mt-6 a', titles => {
      return titles.map(title => title.href);
    });
    let titles = await page.$$eval('.mt-6 a', loaded_titles => {
      return loaded_titles.map(title => title.innerText);
    });
    
    links.forEach(function(link,i) {
        //if (!seenTitles[titles[i]]) {
          toScrape[link] = {title: titles[i]}
          //seenTitles[titles[i]] = 1
        //}
    })
    
    
    await page.goto('https://canberrapickersandfiddlers.netlify.app/tunes/bykey/');
    
    let links2 = await page.$$eval('.text-2xl a', titles => {
      return titles.map(title => title.href);
    });
    let titles2 = await page.$$eval('.text-2xl a', loaded_titles => {
      return loaded_titles.map(title => title.innerText);
    });
    links2.forEach(function(link,i) {
      //if (!seenTitles[titles[i]]) {
        toScrape[link] = {title: titles2[i]}
        //seenTitles[titles2[i]] = 1
      //}
    })
    //console.log(toScrape)
    var abcBlobs = []
    var pages = Object.keys(toScrape)
    for (var linkNum in pages) {
        var link = pages[linkNum]
        //console.log('load  '+link)
         //console.log('loaded  '+i+'/'+link.length+' ' +link)
         let abc = null
         try {
             await page.goto(link);
         } catch (e) {
             console.log(e)
         }
         
         try {
         
            abc = await page.$$eval('textarea', textareas => {
                 //console.log('load  ',textareas)
                 var loaded_codes = textareas.map(function(t) { 
                     //console.log('script  ',t)
                     return t.value
                     //return t.innerText.split("\n")[2]
                 })
                 //var finalRecord = {abc: code, links: []}
                 
                 return loaded_codes.join("\n\n")
             });
         } catch (e) {
             console.log(e)
         }
         //console.log('codes got  ')
         let YTlinks = null
         try {
             YTlinks = await page.$$eval('div.my-alternate-classname', frames => {
             //console.log('iframes  ',frames)
             return frames.map(function(l) {
                 //element.getAttribute 
                 //console.log('iframe  ',l,l.getAttribute('id'))
                 return 'https://www.youtube.com/watch?v='+l.getAttribute('id')
             })
            });
         } catch (e) {
            console.log(e)
         }
         //console.log('links',YTlinks,abc.slice(0,10))
        var title = toScrape[link] ? toScrape[link].title : ''
        var abcParts = []
            
        if (YTlinks && YTlinks.length > 0 && abc && abc.trim().length === 0 ) {
            //console.log('NOABC',abc.slice(0,10))
            abcParts.push('X: '+linkNum)
            abcParts.push('T: '+title)
           
            YTlinks.forEach(function(link,lk) {
                abcParts.push('% abcbook-link-'+lk+' '+ link)
                abcParts.push('% abcbook-link-title-'+lk)
            })
            
        } else if (YTlinks && YTlinks.length > 0 || abc && abc.trim().length > 0 ) {
            //abcParts.push(abc)
            //YTlinks.forEach(function(link,lk) {
                //abcParts.push('% abcbook-link-'+lk+' '+ link)
                //abcParts.push('% abcbook-link-title-'+lk)
            //})
            
        }
        //console.log('TUNE',abcParts.join("\n"))
        abcBlobs.push(abcParts.join("\n"))
    }
    //var abcBlobs = []
    //for (var i=links.length - 1; i >= 0; i--) {
        //var link = links[i]
        //var t = titles[i]
        //var linkParts = link.split("/")
        //var t = linkParts.length > 1 ? linkParts[linkParts.length - 2] : ''
        //if (true ) {
            ////console.log('load  '+t)
            
             //if (!abc) abc = ''
             ////console.log('code  ',codes, links)
             ////codes.forEach(function(abc,ck) {
                 //try {
                    ////var abc = eval(code + ' ;  abc'  )
                    //if (links.length > 0) {
                        //links.forEach(function(link,lk) {
                            //abc = abc + "\n% abcbook-link-"+lk+" "+ link
                            //abc = abc + "\n% abcbook-link-title-"+lk+" "
                        //})
                    //}
                    //abcBlobs.push(abc)
                    //if (abc && abc.trim()) { 
                        //fs.writeFile(dir + '/'+t+'.abc', abc + "\n", err => {
                          //if (err) {
                            //console.error(err)
                            //return
                          //}
                          ////file written successfully
                        //})
                    //} else {
                        //fs.appendFile(dir + '/errors.txt', link + "\n" + code +"\n", err => {
                          //if (err) {
                            //console.error(err)
                            //return
                          //}
                          ////file written successfully
                        //})
                    //}

                 //} catch (e) {
                     //console.log(e)
                 //}
            ////})
        //}
    //}
    console.log(abcBlobs.join("\n\n\n"))
                    
    await browser.close();
  } catch (e) {
    console.log(e);
  }
})();
