//import {Fraction} from './Fraction'
//import abcjs from "abcjs";
//import useUtils from './useUtils'

var useAbcTools = () => {
    //var utils = useUtils()
    var requiredHeaders = ['X','K','M','L','T','R','B']

        
    function generateObjectId(otherId) {
        var timestamp = otherId ? otherId.toString(16) : (new Date().getTime() / 1000 | 0).toString(16);
        
        return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function() {
            return (Math.random() * 16 | 0).toString(16);
        }).toLowerCase();
    }

    const utilhash = function(str, seed = 0) {
      //cyrb53 
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
        h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1>>>0);
    };
    
    function isCommentLine(line) {
        return ((line.startsWith('% ') || line.startsWith('%%')) && !isDataLine(line) && !line.startsWith('%%MIDI '))
    }
    
    function isDataLine(line) {
        return (line.startsWith('% abcbook-'))
    }
    
    function isNoteLine(line) {
        return (!isCommentLine(line) && !isDataLine(line) && !isMetaLine(line))
    }
    
    function justNotes(text) {
        return text.split("\n").filter(function(line) {
            return line.trim() === "" || isNoteLine(line)
        }).join("\n")
    }
    
    function isMetaLine(line) {
        //console.log('ismeta', line[0],line[1])
        return (line.length > 1 && line[1] === ":" && line[0] !=='|')
    }
    
    function pushMeta(meta,key,line) {
        //console.log('pushemeta',meta,key,line)
        if (!meta) meta = {}
        if (!(meta.hasOwnProperty(key) && Array.isArray(meta[key]))) {
            meta[key] = []
        }
        meta[key] = line
        return meta
    }
    
    
    function renderOtherHeaders(tune) {
        //console.log('RNoTER',tune.meta,tune)
      if (tune && tune.meta) {
        return Object.keys(tune.meta).map(function(key) {
          // exclude required headers
          if (Array.isArray(tune.meta[key])) {
            return tune.meta[key].map(function(metaLine) {
              return key + ": "+metaLine + "\n"
            }).join("")
          } else return ""
        }).join("")
      } else {
         return "" 
      }
    }

    function renderWordHeaders(tune) {
      if (tune && tune.words && Array.isArray(tune.words)) {
        return tune.words.map(function(wordLine) {
              return "W: "+wordLine + "\n"
        }).join("")
      } else {
         return "" 
      }
    }
    
    function getBeatLength(meter) {
          switch (meter) {
            case '2/2':
              return '1/2'
            case '3/2':
              return '1/2'
            case '4/2':
              return '1/2'
            case '3/8':
              return '3/8'
            case '6/8':
              return '3/8'
            case '9/8':
              return '3/8'
            case '12/8':
              return '3/8'
            case '2/4':
              return '1/4'
            case '3/4':
              return '1/4'
            case '4/4':
              return '1/4'
            case '6/4':
              return '3/4'
            case '9/4':
              return '3/4'
          }
          return '1/4'
        
    }

    
    function abc2json(abc) {
        //console.log('abc2json',abc)
      if (abc && abc.trim().length > 0) {
        var tune = {id: null, name: null,books:[],voices:{'1':{meta:'',notes:[]}}, tempo: 100, rhythm:null, noteLength: null, meter: null,key:null, boost: 0, aliases:[],abccomments:[], notes:[], words: [] , meta: {}}
        var currentVoice = '1'
        var links = {}
         var files = {}
         abc.split("\n").forEach(function(line) {
            //console.log('LINE', line)
            if (isCommentLine(line)) {
                tune.abccomments.push(line)
            } else if (isMetaLine(line)) {
                var key = line[0]
                switch (key) {
                    case "W":
                        tune.words.push(line.slice(2).trim())
                        break
                    case "V":
                        var parts = line.slice(2).trim().split(' ')
                        if (parts[0]) {
                            tune.voices[parts[0]] = {meta: parts.slice(1).join(' '), notes:[]}
                            //console.log('LINE Vvoice meta real',parts[0],tune.voices[parts[0]],tune.voices)
                            currentVoice = parts[0]
                        }
                        //console.log('LINE Vvoice meta',parts[0], line)
                        break
                    case "T":
                        // only the first one, subsequent go into meta arrays
                        if (!tune.name) {
                            tune.name = line.slice(2)
                        } else {
                            tune.meta = pushMeta(tune.meta, "T", line.slice(2))
                        }
                        break
                    case "B":
                        //if (!Array.isArray(tune.books)) tune.books = []
                        tune.books.push(line.slice(2).trim().toLowerCase())
                        break
                    case "M":
                        // only the first one
                        if (!tune.meter) {
                            tune.meter = line.slice(2).trim()
                        }
                        break
                    case "R":
                        if (!tune.rhythm) {
                            tune.rhythm = line.slice(2).trim()
                        }
                        break
                    case "L":
                        if (!tune.noteLength) {
                            tune.noteLength = line.slice(2).trim()
                        }
                        break
                    case "C":
                        if (!tune.composer) {
                            tune.composer = line.slice(2).trim()
                        }
                        break
                    case "K":
                        if (!tune.key) tune.key = line.slice(2).trim()
                        break
                    case "Q":
                        tune.tempo = cleanTempo(line.slice(2).trim())
                        break
                    default:
                        tune.meta = pushMeta(tune.meta, key, line.slice(2).trim())
                        break
                }
            } else if (isDataLine(line)) {
                //console.log('data line',line)
                if (line.startsWith('% abcbook-tune_id')) {
                    tune.id = line.slice(17).trim()
                    //console.log('FOUNDID',tune.id,line)
                } else if (line.startsWith('% abcbook-tune_composer_id')) {
                    tune.composerId = line.slice(26).trim()
                    //console.log('FOUNDID',tune.id,line)
                } else if (line.startsWith('% abcbook-boost')) {
                    tune.boost = parseInt(line.slice(16).trim())
                } else if (line.startsWith('% abcbook-difficulty')) {
                    tune.difficulty = parseInt(line.slice(21).trim())
                } else  if (line.startsWith('% abcbook-tablature')) {
                    tune.tablature = line.slice(20).trim()
                } else  if (line.startsWith('% abcbook-transpose')) {
                    tune.transpose = line.slice(20).trim()
                } else  if (line.startsWith('% abcbook-tuning')) {
                    tune.tuning = line.slice(17).trim()
                } else  if (line.startsWith('% abcbook-tags')) {
                    tune.tags = line.slice(14).trim() ? line.slice(14).trim().split(",") : []
                } else  if (line.startsWith('% abcbook-lastupdated')) {
                    tune.lastUpdated = line.slice(22).trim()
                } else  if (line.startsWith('% abcbook-soundfonts')) {
                    tune.soundFonts = line.slice(21).trim()
                } else  if (line.startsWith('% abcbook-repeats')) {
                    tune.repeats = line.slice(17).trim()
               
                } else  if (line.startsWith('% abcbook-file-')) {
                    if (line.startsWith('% abcbook-file-type-')) {
                        var parts = line.trim().split('% abcbook-file-type-')
                        //console.log('TTs',parts)
                        if (parts.length > 1) {
                            var numberParts = parts[1].split(' ')
                            //console.log('TTs','numparts',numberParts)
                            if (numberParts.length > 1) {
                                if (!files[numberParts[0]]) files[numberParts[0]] = {}
                                files[numberParts[0]].type = numberParts.slice(1).join(' ')
                            }
                        }
                    } else {
                        var parts = line.trim().split('% abcbook-file-')
                        //console.log(parts)
                        if (parts.length > 1) {
                            var numberParts = parts[1].split(' ')
                            //console.log('numparts',numberParts)
                            if (numberParts.length > 1) {
                                if (!files[numberParts[0]]) files[numberParts[0]] = {}
                                files[numberParts[0]].data = numberParts[1]
                            }
                        }
                    }
                } else  if (line.startsWith('% abcbook-link-')) {
                    if (line.startsWith('% abcbook-link-title-')) {
                        var parts = line.trim().split('% abcbook-link-title-')
                        //console.log('TTs',parts)
                        if (parts.length > 1) {
                            var numberParts = parts[1].split(' ')
                            //console.log('TTs','numparts',numberParts)
                            if (numberParts.length > 1) {
                                if (!links[numberParts[0]]) links[numberParts[0]] = {}
                                links[numberParts[0]].title = numberParts.slice(1).join(' ')
                            }
                        }
                    } else if (line.startsWith('% abcbook-link-start-at-')) {
                        var parts = line.trim().split('% abcbook-link-start-at-')
                        //console.log('TTs',parts)
                        if (parts.length > 1) {
                            var numberParts = parts[1].split(' ')
                            //console.log('TTs','numparts',numberParts)
                            if (numberParts.length > 1) {
                                if (!links[numberParts[0]]) links[numberParts[0]] = {}
                                links[numberParts[0]].startAt = numberParts.slice(1).join(' ')
                            }
                        }
                    } else if (line.startsWith('% abcbook-link-end-at-')) {
                        var parts = line.trim().split('% abcbook-link-end-at-')
                        //console.log('TTs',parts)
                        if (parts.length > 1) {
                            var numberParts = parts[1].split(' ')
                            //console.log('TTs','numparts',numberParts)
                            if (numberParts.length > 1) {
                                if (!links[numberParts[0]]) links[numberParts[0]] = {}
                                links[numberParts[0]].endAt = numberParts.slice(1).join(' ')
                            }
                        }
                    } else {
                        var parts = line.trim().split('% abcbook-link-')
                        //console.log(parts)
                        if (parts.length > 1) {
                            var numberParts = parts[1].split(' ')
                            //console.log('numparts',numberParts)
                            if (numberParts.length > 1) {
                                if (!links[numberParts[0]]) links[numberParts[0]] = {}
                                links[numberParts[0]].link = numberParts.slice(1).join(' ')
                            }
                        }
                    }
                }
          
            } else if (isNoteLine(line)) {
                //console.log('LINE ISNOTE', line)
                if (line.trim().length > 0) {
                    if (line.startsWith('%%MIDI transpose')) {
                        tune.transpose = line.slice(16)
                    } else if (line.trim().startsWith('[V:') && line.indexOf(']') !== -1 ) {
                        var key = line.slice(1,line.indexOf(']'))
                        //console.log(key)
                        var voiceNotes = line.slice(line.indexOf(']')+1)
                        //tune.notes.push(line.trim())
                        if (!tune.voices.hasOwnProperty(key)) tune.voices[key] = {meta:'',notes:[]}
                        tune.voices[key].notes.push(voiceNotes)
                    } else {
                        //tune.notes.push(line.trim())
                        if (!tune.voices.hasOwnProperty(currentVoice) ) tune.voices[currentVoice] = {meta:'',notes:[]}
                        tune.voices[currentVoice].notes.push(line)
                    }
                }
            } 
        })
        //if (Object.keys(links).length > 0) console.log('FOUND TUNE LINKS',links)
        tune.links = Object.values(links)
        tune.files = Object.values(files)
        if (tune.id === null)  tune.id = generateObjectId()
          //console.log('LINE Vm ABC2JSON single',tune)
          return tune
      }
      return {}
    }
    
    /**
     * TO ABC
     */
    
    /**
     * Append metadata for song title,.. to abc string
     * for rendering complete tunes
     * @return multiline abc string starting with \nX:<tuneid>\n suitable for tune book 
     */
    function json2abc(tune) {
      //console.log('json2abc',tune)
      //var bookData = {}
      if (tune) {
        var aliasText = ''
        if (Array.isArray(tune.aliases) && tune.aliases.length > 0) {
           var aliasChunks = sliceIntoChunks(tune.aliases,5)
           aliasChunks.forEach(function(chunk) {
             aliasText += 'N: AKA: '  +chunk.join(", ")+"\n"
           })
        }
        var boost = tune.boost > 0 ? tune.boost : 0
        var tuneNumber = tune && tune.meta && parseInt(tune.meta.X) !== NaN && tune.meta.X >= 0 ? tune.meta.X : parseInt(Math.random()*100000)
        var books = Array.isArray(tune.books) && tune.books.length > 0 ? tune.books.map(function(book) {
          //bookData[ensureText(book).toLowerCase()] = {}
          
          return  'B: '+ensureText(book).toLowerCase()
        }).join("\n") + "\n": ''
        function ensure(test,text) {
            if (test) {
                return text
            } else {
                return ''
            }
        }
        var tempoLine = ''
        if (cleanTempo(tune.tempo) > 0) {
             tempoLine = "Q: "+ getBeatLength(tune.meter)+'='+ (cleanTempo(tune.tempo) > 0 ? cleanTempo(tune.tempo) : '100') + "\n" 
        }
        var voicesAndNotes=[]
        if (tune.voices && Object.keys(tune.voices).length > 0) {
            Object.keys(tune.voices).forEach(function(voice) {
                if (Array.isArray(tune.voices[voice].notes)) {
                    voicesAndNotes.push("V:"+voice+" "+tune.voices[voice].meta)
                    tune.voices[voice].notes.forEach(function(noteLine) {
                        voicesAndNotes.push(noteLine)
                    })
                }
            })
        } 
        var linksRendered = []
        if (Array.isArray(tune.links)&& tune.links.length > 0) {
            tune.links.forEach(function(link,k) {
                if (link.link) {
                    
                    linksRendered.push("% abcbook-link-"+k + ' ' +  ensureText(link.link,"") )
                    if (link.title) {
                        linksRendered.push("% abcbook-link-title-"+k + ' ' +  ensureText(link.title,"") )
                    }
                    if (link.startAt) {
                        linksRendered.push("% abcbook-link-start-at-"+k + ' ' +  ensureText(link.startAt,"") )
                    }
                    if (link.endAt) {
                        linksRendered.push("% abcbook-link-end-at-"+k + ' ' +  ensureText(link.endAt,"") )
                    }
                    //console.log("TOABC",link.link,JSON.stringify(linksRendered))
                }
                
            })
        }
        var filesRendered = []
        if (Array.isArray(tune.file)&& tune.file.length > 0) {
            tune.files.forEach(function(file,k) {
                if (file.data) {
                    filesRendered.push("% abcbook-file-"+k + ' ' +  ensureText(file.data,"") )
                    if (file.type) {
                        linksRendered.push("% abcbook-file-type-"+k + ' ' +  ensureText(file.type,"") )
                    }
                }
            })
        }
        //if (voicesAndNotes.length === 0) {
            //voicesAndNotes.push('V:default')
            //voicesAndNotes.push('|')
        //}
        var otherHeaders = renderOtherHeaders(tune)
       
        //console.log(otherHeaders)
        //console.log('voicesandnotes',tune.voices,voicesAndNotes)
        //console.log('JSON2abc tempo',tune.tempo,cleanTempo(tune.tempo), tempoLine)
        var finalAbc = "\nX: "+tuneNumber + "\n" 
                    + ensure(tune.name,"T: " + ensureText(tune.name) + "\n" )
                    + ensure(tune.composer, "C:" + ensureText(tune.composer) + "\n" )
                    + books
                    + ensure(tune.meter,"M:"+ensureText(tune.meter)+ "\n" )
                    + ensure(tune.noteLength, "L:" + ensureText(tune.noteLength) + "\n" )
                    + ensure(tune.rhythm, "R: "+  ensureText(tune.rhythm) + "\n" )
                    + tempoLine
                    + otherHeaders
                    + aliasText 
                    + ensure(tune.key, "K:"+ensureText(tune.key)+ "\n" )
                    + ((voicesAndNotes.length > 0) ? voicesAndNotes.join("\n") + "\n" : '')
                    + renderWordHeaders(tune)
                    + "% abcbook-tune_id " + ensureText(tune.id) + "\n" 
                    + "% abcbook-tune_composer_id " + ensureText(tune.composerId) + "\n" 
                    + ((linksRendered.length > 0) ? linksRendered.join("\n") + "\n" : '')
                    + ((filesRendered.length > 0) ? filesRendered.join("\n") + "\n" : '')
                    + "% abcbook-boost " +  ensureInteger(boost,0) + "\n" 
                    + "% abcbook-difficulty " +  ensureInteger(tune.difficulty,0) + "\n" 
                    + "% abcbook-tags " +  ((Array.isArray(tune.tags) && tune.tags.length > 0) ? tune.tags.join(",") : '') + "\n" 
                    + "% abcbook-tablature " +  ensureText(tune.tablature) + "\n"
                    + "% abcbook-transpose " +  ensureText(tune.transpose) + "\n" 
                    + "% abcbook-tuning " +  ensureText(tune.tuning) + "\n" 
                    + "% abcbook-lastupdated " +  ensureInteger(tune.lastUpdated) + "\n" 
                    + "% abcbook-soundfonts " +  ensureText(tune.soundFonts) + "\n" 
                    + "% abcbook-repeats " +  ensureText(tune.repeats,"1") + "\n" 
                    //+ "% abcbook-lastHash " +  ensureInteger(tune.lastHash,0) + "\n" 
                    + ((tune.transpose < 0 || tune.transpose > 0) ? '%%MIDI transpose '+tune.transpose + "\n" : '')
                    + ensureText((Array.isArray(tune.abccomments) ? tune.abccomments.join("\n")  + "\n" : "\n")) 
                    
        
        //console.log('ABC OUT', finalAbc)
        return finalAbc
      } else {
        return ''
      }
    }
    
    function cleanTempo(tempoIn) {
        //console.log('clean tempo',tempoIn)
        var tempo = new String(tempoIn)
        if (tempo && tempo.trim)  {
            var parts = tempo.trim().split('=')
            //console.log('clean tempo',parts)
            if (parts.length > 0) {
                var t = parseInt(parts[parts.length-1])
                //console.log('clean tempot',t, t > 0)
                if (t > 0) return t
                else return 100 
            } else return ''
        } else return ''
    }
     function json2abc_print(tune) {
      if (tune) {
        var aliasText = ''
        if (Array.isArray(tune.aliases) && tune.aliases.length > 0) {
           var aliasChunks = sliceIntoChunks(tune.aliases,5)
           aliasChunks.forEach(function(chunk) {
            aliasText += 'N: AKA: '  +chunk.join(", ")+"\n"
          })
        }
        var voicesAndNotes=[]
        if (tune.voices) {
            Object.keys(tune.voices).forEach(function(voice) {
                if (Array.isArray(tune.voices[voice].notes)) {
                    voicesAndNotes.push("V:"+voice+" "+tune.voices[voice].meta)
                    tune.voices[voice].notes.forEach(function(noteLine) {
                        voicesAndNotes.push(noteLine)
                    })
                }
            })
        }
        var tuneNumber = tune && tune.meta && parseInt(tune.meta.X) !== NaN && tune.meta.X >= 0 ? tune.meta.X : parseInt(Math.random()*100000)
        var finalAbc = "\nX: "+tuneNumber + "\n" 
                    + "T: " + ensureText(tune.name) + "\n" 
                    + (tune.composer ? "C:" + tune.composer + "\n" :  '' )
                    + "M:"+ensureText(tune.meter)+ "\n" 
                    + "L:" + ensureText(tune.noteLength) + "\n" 
                    + "R: "+  ensureText(tune.rhythm) + "\n" 
                    + (cleanTempo(tune.tempo) > 0 ?  "Q: "+ getBeatLength(tune.meter)+'='+ ensureText(cleanTempo(tune.tempo)) + "\n"  : "")
                    + aliasText 
                    + "K:"+ensureText(tune.key)+ "\n" 
                    + ((voicesAndNotes.length > 0) ? voicesAndNotes.join("\n") + "\n" : '')
                    //+ renderWordHeaders(tune)
                    + "% abcbook-tablature " +  tune.tablature + "\n" 
                    + "% abcbook-transpose " +  ensureText(tune.transpose) + "\n"
                    + "% abcbook-tune_id " + ensureText(tune.id) + "\n" 
        //console.log('ABC OUT', finalAbc)
        return finalAbc
      } else {
        return ''
      }
    }
    

     function json2abc_cheatsheet(tune) {
      if (tune) {
        var voicesAndNotes=[]
        if (tune.voices) {
            Object.keys(tune.voices).forEach(function(voice) {
                if (Array.isArray(tune.voices[voice].notes)) {
                    //voicesAndNotes.push("V:"+voice+" "+tune.voices[voice].meta)
                    tune.voices[voice].notes.forEach(function(noteLine) {
                        voicesAndNotes.push(noteLine)
                    })
                    
                    //voicesAndNotes.push(firstBars.slice(4).join("|"))
                    
                }
            })
        }
        var firstBars = voicesAndNotes.join("").trim().split("|").slice(0,6)
        var tuneNumber = tune && tune.meta && parseInt(tune.meta.X) !== NaN && tune.meta.X >= 0 ? tune.meta.X : parseInt(Math.random()*100000)
        var finalAbc = "\nX: "+tuneNumber + "\n" 
                    + "T: " + ensureText(tune.name) + "\n" 
                    + "M:"+ensureText(tune.meter)+ "\n" 
                    + "L:" + ensureText(tune.noteLength) + "\n" 
                    + (cleanTempo(tune.tempo) > 0 ?  "Q: "+ getBeatLength(tune.meter)+'='+ ensureText(cleanTempo(tune.tempo)) + "\n"  : "")
                    + "R: "+  ensureText(tune.rhythm) + "\n" 
                    + "K:"+ensureText(tune.key)+ "\n" 
                    + firstBars.join("|")
                    + "% abcbook-transpose " +  ensureText(tune.transpose) + "\n"
                    + "% abcbook-tune_id " + ensureText(tune.id) + "\n" 
                    
        
        //console.log('ABC OUT', finalAbc)
        return finalAbc
      } else {
        return ''
      }
    }

    //// JUST FIRST THREE BARS AND NO CHORDS
    //function json2shortabc(tune) { 
      //if (tune) {
        //var setting = settingFromTune(tune)
        //var abc = setting.abc
        
        //if (!abc || !abc.trim) {
          //return emptyABC(getTuneName(tune))
        //}
       
          //abc = abc.trim()
          //// remove strings from abc
          //var next = abc.indexOf('"')
          //while (next !== -1) {
            //var nextClose = abc.indexOf('"', next+1)
            //if ((nextClose !== -1) && (nextClose > next)) {
              //abc = abc.slice(0,next) + abc.slice(nextClose+1)
            //} else {
              //abc = abc.slice(0,next) + abc.slice(next + 1)
            //}
            //next = abc.indexOf('"')
          //}
          //// strip start repeats
          //abc = abc.replace("|:","|")
          //// first three bars
          //var shortAbcParts = []
          //shortAbcParts = abc.split("|").slice(0,4)
          //var shortAbc = ''
          //// handle placement of text(song title)
          //if (shortAbcParts.length > 3) {
            //// tune starts at first bar
            //if (shortAbcParts[0].trim() === '') {
              //var ts = getTuneMeter(tune)
              //if (ts !== '') {
                //shortAbc = shortAbc + "[M:"+ts+ "] "
              //} 
              //shortAbc = shortAbc + "[K:"+setting.key+ "] "
              //// tune title 
              //shortAbc = shortAbc  + '"' + songNumberForDisplay(songNumber) + '. '+getTuneName(tune)+ '"' +  shortAbcParts.slice(1).join("|") 
              //// lead in note
            //} else {
              //var ts = getTuneMeter(tune)
              //if (ts !== '') {
                //shortAbc = shortAbc + "[M:"+ts+ "] "
              //} 
              //shortAbc = shortAbc + "[K:"+setting.key+ "] "
              //shortAbc = shortAbc  + '"' + songNumberForDisplay(songNumber) + '. ' +getTuneName(tune)+ '"' +  shortAbcParts.join("|") 
            //}
          //}
          //shortAbc = "\nX: "+songNumber + "\n" + shortAbc + "\n"
          //return shortAbc
      //} else {
        //return ''
      //}
       
    //}


    function sliceIntoChunks(arr, chunkSize) {
        const res = [];
        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize);
            res.push(chunk);
        }
        return res;
    }



    //function settingFromTune(tune) {
        //var useSetting = parseInt(tune.useSetting) > 0 ? parseInt(tune.useSetting) : 0
        //if (tune && tune.settings && tune.settings.length > useSetting) {
          //return tune.settings[useSetting]
        //} else {
            //return {key:'', abc: ''}
        //}
    //}


    function getTextFromSongline(songline) {
        if (!songline) return
        var last = songline.lastIndexOf(']')
        if (last !== -1) {
            return songline.slice(last + 1)
        } else {
            return songline
        }
    }

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
    
    function getTimeSignatureTypes() {
        return ['2/4','3/4','4/4','6/8','9/8','12/8','3/2']
    }

    function timeSignatureFromTuneType(type) {
      var types = getRhythmTypes()
      if (types.hasOwnProperty(type)) {
        return types[type]
      } else {
        return ''
      }
    }

    function emptyABC(name, number = 0) {
      return "\nX:"+number+"\n" + 'T:' +name +  '' + "\n"
    }

    function songNumberForDisplay(tune) {
      if (tune && parseInt(tune.songNumber) > 0) {
        return  parseInt(tune.songNumber) + 1
      }
      return 1
    }

    function stripText(text) {
      var result = ''
      if (text && text.trim) {
          result = text.trim().replace(/[^a-zA-Z ]/g, ' ').toLowerCase().trim()
      }
      return result
    }




    /**
     * TO JSON
     */

    function abc2Tunebook(abc) {
      var parts = abc.split('X:')
      var final = []
      var tuneBook = parts.forEach(function(v,k) {
        if (v && v.trim().length > 0) {
          final.push(abc2json('X:'+v))
        } 
      })
      return final
    }

    //function isAliasLine(line) {
        //return (line.startsWith("N: AKA: "))
    //}

    //function isMetaLine(line) {
        //if (line[1] === ":" && line[0] !== "|" && line[2] !== "|" ) {
            //// avoid alias lines
            //return isAliasLine(line) ? false : true
            
        //} else {
            //return false
        //}
    //}


    //function getMetaFromAbc(abc) {
      //var parts = abc.split("\n")
      //var meta = {}
      //function stashMeta(key,val) {
          //if (meta.hasOwnProperty(key)) {
              //meta[key] = meta[key] + "\n" + val
          //} else {
              //meta[key] = val
          //}
      //}
      
      //parts.map(function(part) {
        //if (isMetaLine(part) && !isAliasLine(part)) {
            //if (part[0] === 'T') {
                //stashMeta(part[0],stripLeadingNumber(part.slice(2).trim()))
            //} else {
                //stashMeta(part[0],part.slice(2).trim())
            //}
           
        //}
      //})
      //return meta
      
    //}


    function getCommentsFromAbc(abc) {
        if (!abc) return
        var parts = abc.split('\n')
        return parts.map(function(line) { 
            // exclude custom comments
            if (line.startsWith('% ') && !line.startsWith('% abc-')) {
                return line + "\n"
            } else {
                return ''
            }    
        }).join("")
    }

   

    //function getAliasesFromAbc(abc) {
        //if (!abc) return
        //var aliases=[]
        //var first = abc.indexOf('N: AKA: ')
        //while (first !== -1) {
            //var parts = abc.slice(first + 7).split("\n")
            //var aliasParts = parts[0].split(",")
            //aliasParts.forEach(function(aliasPart) {
              //aliases.push(aliasPart.trim())
            //})
            //first = abc.indexOf('N: AKA:', first + 1)
        //} 
        //return aliases
    //}



    function getMetaValueFromAbc(key,abc) {
        var found = null
        try {
            var parts = abc.split("\n")
            for (var partKey in parts) {
                var part = parts[partKey]
                if (part.startsWith(key + ':')) {
                    //if (part[0] === 'T') {
                        //found = stripLeadingNumber(part.slice(2).trim())
                    //} else {
                        found = part.slice(2).trim()
                    //}
                    break;
                }
            }
        } catch (e) {
            console.log(e)
        }
        return found
    }

    function getKeyedCommentFromAbc(key,abc) {
        if (!abc) return ''
        var first = abc.indexOf('% abc-'+key)
        if (first === 0) {
            var parts = abc.slice(first + 6 + key.length).split("\n")
            return ensureText(parts[0].trim())
        } else {
            return ''
        }
    }
    
    function getSettingCommentsFromAbc(abc) {
        if (!abc) return
        var parts = abc.split('\n')
        return parts.map(function(line) { 
            // exclude custom comments
            if (line.startsWith('% ') && !line.startsWith('% abc-')) {
                return line + "\n"
            } else {
                return ''
            }    
        }).join("")
    }

    function removeAbcInnerStrings(abc) {
        //console.log('removeinner',abc)
      if (abc ) {
            // remove strings from abc notes
          abc = new String(abc).trim()
          var next = abc.indexOf('"')
          while (next !== -1) {
            var nextClose = abc.indexOf('"', next+1)
            if ((nextClose !== -1) && (nextClose > next)) {
              // strip string
              abc = abc.slice(0,next) + abc.slice(nextClose+1)
            } else {
              abc = abc.slice(0,next) + abc.slice(next + 1)
            }
            next = abc.indexOf('"')
          }
      }
      return abc ? abc : ''
    }
    
    function hasChords(abc) {
      var chords = getInnerStrings(abc)
      var haveChords = false;
      // any match success
      chords.map(function(chord,k) {
          if (chord.indexOf('"') !== -1) {
              haveChords = true;
          }
         //if (isChord(chord)) {
            //haveChords = true;
         //}
      })
      return haveChords
    }
    
    function getInnerStrings(abc) {
        var s = []
      if (abc) {
            // remove strings from abc
          abc = abc.trim()
          var next = abc.indexOf('"')
          while (next !== -1) {
            var nextClose = abc.indexOf('"', next+1)
            if ((nextClose !== -1) && (nextClose > next)) {
              // strip string
              s.push(abc.slice(next+1,nextClose))
              abc = abc.slice(0,next) + abc.slice(nextClose+1)
            } else {
              abc = abc.slice(0,next) + abc.slice(next + 1)
            }
            next = abc.indexOf('"')
          }
      }
      return s
    }



    function safeString(text) {
        if (text) {
            text = text.replaceAll(" ",'_')
            text = text.replaceAll(",",'_')
            text = text.replaceAll(".",'_')
            text = text.replaceAll("[",'_')
            text = text.replaceAll("]",'_')
            text = text.replaceAll("(",'_')
            text = text.replaceAll(")",'_')
            text = text.replaceAll("?",'_')
        }
        return  text
    }


    /**
     * Manipulate timing of abc string
     * eg multiplier=2 then  A2 b/ b/2 => A b b 
     */
      
    function isOctaveModifier(letter) {
        return (letter === ',' || letter === "'") 
    }
  

    

    function generateAbcFromMeasures(measures) {
        return measures.map(function(measure) {
            var abc = measure.abc
            return abc 
        }).join(" ")
    }

    // eg /4 becomes 0.25, /2 becomes 0.5, 4 becomes 4.0
    function symbolsToFraction(a,b,c) {
        if (isSlash(a)) {
            if (isDigit(b)) {
                if (isDigit(c)) {
                    var combined = parseInt(b + '' + c)
                    return {symbolsUsed: 3, number: {top: 1, bottom: combined}}
                } else {
                    return {symbolsUsed: 2, number: {top: 1, bottom: b}}
                }
            } else {
                return {symbolsUsed: 1, number: {top: 1, bottom: 2}}
            }
        } else {
            if (isDigit(a)) {
                if (isDigit(b)) {
                    var combined = parseInt(a + '' + b)
                    return {symbolsUsed: 2, number: {top: combined, bottom: 1}}
                } else {
                    return {symbolsUsed: 1, number: {top: a, bottom: 1}}
                }
            } else {
                return {symbolsUsed: 0, number: {top: 1, bottom: 1}}
            }
        }
    }

    function gcd(a, b) {
        return (b) ? gcd(b, a % b) : a;
    }

    var decimalToFraction = function (_decimal) {
        if (_decimal == parseInt(_decimal)) {
            var a = {
                top: parseInt(_decimal),
                bottom: 1,
                display: parseInt(_decimal) + '/' + 1
            };
            return a
        }
        else {
            var top = _decimal.toString().includes(".") ? _decimal.toString().replace(/\d+[.]/, '') : 0;
            var bottom = Math.pow(10, top.toString().replace('-','').length);
            if (_decimal >= 1) {
                top = +top + (Math.floor(_decimal) * bottom);
            }
            else if (_decimal <= -1) {
                top = +top + (Math.ceil(_decimal) * bottom);
            }

            var x = Math.abs(gcd(top, bottom));
            var a = {
                top: (top / x),
                bottom: (bottom / x),
                display: (top / x) + '/' + (bottom / x)
            };
            return a
        }
    }

    function abcFraction(top, bottom) {
        if (bottom === 1) {
            if (top === 1) {
                return ''
            } else {
                return top
            }
        } else {
            if (bottom === 2) {
                return "/"
            } else {
                return "/" + bottom
            }
        }
    }


    function isNoteLetter(a) {
        if ("zabcdefgABCDEFG".indexOf(a) !== -1) {
            return true
        } else {
            return false
        }
    }
    function isDigit(a) {
        if ("123456789".indexOf(a) !== -1) {
            return true
        } else {
            return false
        }
    }
    function isSlash(a) {
        if (a === "/") {
            return true
        } else {
            return false
        }
    }


    //function getTuneId(tune) {
        //if (tune && tune.meta && tune.meta.hasOwnProperty("X")) {
            //return ensureText(tune.meta["X"],tune.id)
        //} else return tune.id
    //}

    //function getTuneName(tune) {
        //if (tune && tune.meta && tune.meta.hasOwnProperty("T")) {
            //return ensureText(tune.meta["T"],tune.name)
        //} else return tune.name
    //}
    
    //function getTuneBookName(tune) {
        //if (tune && tune.meta && tune.meta.hasOwnProperty("B")) {
            //return ensureText(tune.meta["B"],tune.book)
        //} else return tune.book
    //}
    
    //function getTuneType(tune) {
        //if (tune && tune.meta && tune.meta.hasOwnProperty("R")) {
            //return ensureText(tune.meta["R"],tune.type)
        //} else return tune.type
    //}

    //function getTuneNoteLength(tune) {
        //if (tune && tune.meta && tune.meta.hasOwnProperty("L")) {
            //return ensureText(tune.meta["L"],'1/8')
        //} else return '1/8'
    //}
    function getTuneMeter(tune) {
        return ensureText(tune.meter,timeSignatureFromTuneType(tune.type))
    }

    function cleanMetaData(meta) {
        var final = {}
        if (meta) Object.keys(meta).forEach(function(key) {
          if (requiredHeaders.indexOf(key) !== -1) {
              final[key] = meta[key]
          }
        })
        return final
    }

     function ensureText(val, defaultVal) {
        if (val !== null && val !== undefined && (val && String(val).trim().length > 0)) {
          return String(val).trim()
        } else {
          return defaultVal && defaultVal.trim ? defaultVal.trim() : ''
        }
    }

    function ensureInteger(val) {
        if (val && val > 0) {
          return val
        } else {
          return 0
        }
    }
    function stripLeadingNumber(text) {
      if (text && text.split) {
        var tParts = text ? text.split(".") : []
        var name = ensureText(tParts.length > 1 ? tParts[1].trim() : text.trim())
        return name
      } else {
        return text
      }
    }


    function getBeatDuration(meter) {
        var parts = meter ? meter.split("/") : null
        var duration = parts && parts.length > 1 && parts[1] > 0 ? parseInt(parts[1]) : 0
        return duration
    }
    
    function getBeatsPerBar(meter) {
        var parts = meter ? meter.split("/") : null
        var bpb = parts && parts.length > 1 ? parseInt(parts[0]) : 0
        return bpb
    }
      //switch (meter) {
        //case '2/2':
          //return 2
        //case '3/2':
          //return 3
        //case '4/2':
          //return 4
        //case '3/8':
          //return 3
        //case '6/8':
          //return 2
        //case '9/8':
          //return 3
        //case '12/8':
          //return 4
        //case '2/4':
          //return 2
        //case '3/4':
          //return 3
        //case '4/4':
          //return 4
        //case '6/4':
          //return 6
        //case '9/4':
          //return 3
        
      //}
      //return 4
    //}
    

    function getTempo(tune) {
        //console.log('gettempo',tune)
        var tempo = 100
        var tempoString = tune && tune.tempo ? tune.tempo : '1/4=100'
        var tempoStringParts = removeAbcInnerStrings(tempoString).split("=")
        if (tempoStringParts.length > 1) {
            tempo = parseInt(tempoStringParts[1])
            if (!tempo > 0) tempo = 100
        } else {
            tempo = parseInt(tempoStringParts[0])
            if (!tempo > 0) tempo = 100
        }
        //console.log('GET TEMPO',tempoString,tempoStringParts,tempo)
        return tempo
    }

    //function getM
    //function getMilliSecondsPerMeasure(tune, forceTempo) {
       //var meter = ensureText(getTuneMeter(tune), '4/4')
       //var beats = getBeatsPerBar(meter)
       //var tempo = forceTempo ? forceTempo : getTempo(tune)
       ////console.log('beats',beats, meter, tempo, tune)
       //return 60000/tempo * beats
    //}

    //function getReviewTempo(tune) {
      //console.log('get tempo ',tune)
      //if (tune) {
        //var boost = tune.boost > 0 ? tune.boost : 0
        //var useBoost = boost > 20 ? 20 : boost
        ////Math.min(boost,50)
        //var tempo = 30 + useBoost * 5
        ////tempo+= 300 // testing
          
        //return tempo;
      //} else {
        //return 100
      //}
    //}
    
        
    function isChord(chord) {
      var chordMatches = [
          'A','B','C','D','E','F','G',  
          'Am','Bm','Cm','Dm','Em','Fm','Gm',
          'Amin','Bmin','Cmin','Dmin','Emin','Fmin','Gmin',
          'Amaj','Bmaj','Cmaj','Dmaj','Emaj','Fmaj','Gmaj',
          'Adim','Bdim','Cdim','Ddim','Edim','Fdim','Gdim',
          'Aaug','Baug','Caug','Daug','Eaug','Faug','Gaug',
          'Asus','Bsus','Csus','Dsus','Esus','Fsus','Gsus',
          'A7','B7','C7','D7','E7','F7','G7',
          'A9','B9','C9','D9','E9','F9','G9',
          
          'Ab','Bb','Cb','Db','Eb','Fb','Gb',  
          'Abm','Bbm','Cbm','Dbm','Ebm','Fbm','Gbm',
          'Abmin','Bbmin','Cbmin','Dbmin','Ebmin','Fbmin','Gbmin',
          'Abmaj','Bbmaj','Cbmaj','Dbmaj','Ebmaj','Fbmaj','Gbmaj',
          'Abdim','Bbdim','Cbdim','Dbdim','Ebdim','Fbdim','Gbdim',
          'Abaug','Bbaug','Cbaug','Dbaug','Ebaug','Fbaug','Gbaug',
          'Absus','Bbsus','Cbsus','Dbsus','Ebsus','Fbsus','Gbsus',
          'Ab7','Bb7','Cb7','Db7','Eb7','Fb7','Gb7',
          'Ab9','Bb9','Cb9','Db9','Eb9','Fb9','Gb9',
          
          'A#','B#','C#','D#','E#','F#','G#',  
          'A#m','B#m','C#m','D#m','E#m','F#m','G#m',
          'A#min','B#min','C#min','D#min','E#min','F#min','G#min',
          'A#maj','B#maj','C#maj','D#maj','E#maj','F#maj','G#maj',
          'A#dim','B#dim','C#dim','D#dim','E#dim','F#dim','G#dim',
          'A#aug','B#aug','C#aug','D#aug','E#aug','F#aug','G#aug',
          'A#sus','B#sus','C#sus','D#sus','E#sus','F#sus','G#sus',
          'A#7','B#7','C#7','D#7','E#7','F#7','G#7',
          'A#9','B#9','C#9','D#9','E#9','F#9','G#9'
      ]
      return chordMatches.indexOf(chord.trim()) !== -1
    }
    
    
    const tablatureConfig = {
        'violin': {
          instrument: "violin",
          tuning: ["G,", "D", "A", "e"],
        },
        'guitar': {
          instrument: "guitar",
          tuning: ["E,", "A,", "D", "G", "B", "e"]
        }
      }
  
  function getTuneHash(tune) {
    if (tune) {
        var voicesAndNotes=[]
        if (tune.voices) {
            Object.keys(tune.voices).forEach(function(voice) {
                if (Array.isArray(tune.voices[voice].notes)) {
                    //voicesAndNotes.push("V:"+voice+" "+tune.voices[voice].meta)
                    tune.voices[voice].notes.forEach(function(noteLine) {
                        voicesAndNotes.push(noteLine)
                    })
                }
            })
        }
        const hashString = tune.title + tune.tempo+tune.meter+tune.transpose+tune.key+tune.soundFonts + (voicesAndNotes.join("\n") )
        //console.log("HASH",hashString)
        var hash = utilhash(hashString)
        return hash
    } else {
        return utilhash(new String(Math.random()*100000000000000000).toString())
    }
  }
  
  function getTuneImportHash(tune) {
    if (tune) {
        var voicesAndNotes=[]
        if (tune.voices) {
            Object.keys(tune.voices).forEach(function(voice) {
                if (Array.isArray(tune.voices[voice].notes)) {
                    //voicesAndNotes.push("V:"+voice+" "+tune.voices[voice].meta)
                    tune.voices[voice].notes.forEach(function(noteLine) {
                        voicesAndNotes.push(noteLine)
                    })
                }
            })
        }
        
        const hashString = tune.title + tune.tempo+tune.meter+tune.transpose+tune.key+tune.soundFonts + (voicesAndNotes.join("\n") + (tune.words ? tune.words.join("\n") : '') )
        //console.log("HASH",hashString)
        var hash = utilhash(hashString)
        return hash
    } else {
        return utilhash(new String(Math.random()*100000000000000000).toString())
    }
  }
  
  //function getTuneAllHash(tune) {
    //var hash = utilhash(JSON.stringify(tune))
    //return hash
  //}

  function tunesToAbc(tunes) {
    //console.log('to abc',book, tunes)
    var res = Object.values(tunes).map(function(tune, k) {
      //var newTune = tune
     // console.log(tune)
      if (tune && tune.meta) tune.meta.X = k
      return json2abc(tune)
    }).join("\n")
    //console.log('to abc res',res)
    return res

  }
  
  
    
    
   
    
    function renderAllChordsAndNotes(chords, notes, preTexts) {
        //console.log("renall",chords, notes)
        // all arrays should be same structure 
        // if overriding with chords, which one is longer and fill?
        return notes.map(function(line,lineNumber) {
            // iterate bars
                //console.log("CL",chords[lineNumber])
                return line.map(function(beats,cbk) {
                    //console.log('CBB',lineNumber,cbk,beats)
                    if (Array.isArray(beats)) {
                        // iterate beats in bar
                        var beatsOut= []
                        
                        for (var beatNumber = 0; beatNumber < beats.length; beatNumber++) {
                            var chord = Array.isArray(chords[lineNumber]) && Array.isArray(chords[lineNumber][cbk]) && Array.isArray(chords[lineNumber][cbk][beatNumber]) ? chords[lineNumber][cbk][beatNumber].join('') : ''
                            
                            var note = Array.isArray(notes[lineNumber]) && Array.isArray(notes[lineNumber][cbk]) && Array.isArray(notes[lineNumber][cbk][beatNumber]) ? notes[lineNumber][cbk][beatNumber].join('') : ''
                            
                            var preText = Array.isArray(preTexts[lineNumber]) && Array.isArray(preTexts[lineNumber][cbk]) && Array.isArray(preTexts[lineNumber][cbk][beatNumber]) ? preTexts[lineNumber][cbk][beatNumber].join('') : ''
                            //console.log('ALL',lineNumber,cbk, beatNumber,chord,note)
                            
                            if (preText) beatsOut.push(preText)
                            if (chord && chord !== '.') beatsOut.push('"' + chord + '"')
                            if (note && note.length > 0) {
                                beatsOut.push(note)
                            } 
                            //else {
                                //beatsOut.push('z')
                            //}
                        }
                        var postText = Array.isArray(preTexts[lineNumber]) && Array.isArray(preTexts[lineNumber][cbk]) && Array.isArray(preTexts[lineNumber][cbk][beats.length]) ? preTexts[lineNumber][cbk][beats.length].join('') : ''
                        if (postText) beatsOut.push(postText)
                        
                        return beatsOut.join("")
                    
                    } else {
                        return ''
                    }
                }).join("")
            }).join("\n").replace("|\n\n","||\n\n") //+ "||"
    }
    

    return {abc2json, json2abc, abc2Tunebook, ensureText, ensureInteger, isNoteLine, isCommentLine, isMetaLine, isDataLine, justNotes, getRhythmTypes, timeSignatureFromTuneType,  getTempo, hasChords, getBeatsPerBar, getBeatDuration, cleanTempo, getBeatLength, tablatureConfig, getTuneHash, tunesToAbc, isNoteLetter, isOctaveModifier, isChord, getTuneImportHash, getTimeSignatureTypes, stripText}
}
module.exports = useAbcTools;
