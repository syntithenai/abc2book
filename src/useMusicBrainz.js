import axios from 'axios'

 //return new Promise(function(resolve, reject) {
            ////console.log('MB SEARCH ARTIST',query)
            //if (query) {
                //clearTimeout(searchTimeout)
                //searchTimeout = setTimeout(function() {
                  //axios.get('https://musicbrainz.org/ws/2/artist?query='+query+'&fmt=json', axiosOptions).then(function(results) {
                    ////console.log('MB SEARCH ARTIST result ',results )
                    //resolve(results && results.data && results.data.artists ? results.data.artists : [])
                  //})
                //},500)
            //}
        //})

//https://musicbrainz.org/ws/2/works?fmt=json&query=
//https://musicbrainz.org/ws/2/artist/f2154126-dd68-4f02-8821-0d4508d87a57
function useMusicBrainz() {
    
    var searchTimeout = null
    var axiosOptions =  {
      //headers: { 'User-Agent':'tunebook.net/1.0.0 (syntithenai@gmail.com)' }
    }
    
    
    function worksByArtist(artistId) {
        const chunkSize = 100
         return new Promise(function(resolve, reject) {
            //console.log('MB SEARCH works by ARTIST',artistId)
            if (artistId) {
                //clearTimeout(searchTimeout)
                //searchTimeout = setTimeout(function() {
                  axios.get('https://musicbrainz.org/ws/2/work?query=' + artistId + '&limit='+chunkSize+'&fmt=json', axiosOptions).then(function(results) {
                      console.log('MB SEARCH ARTIST works init result ',results )
                      if (results && results.data && Array.isArray(results.data.works) && results.data['work-count'] > 0) {
                          if (results.data.works.length < results.data['work-count']) {
                              //console.log('MB SEARCH ARTIST works parital result ',artistId,results )
                              //resolve(results && results.data && results.data.works ? results.data.works : [])
                              var promises = []
                              const chunks = parseInt((results.data['work-count'] - 1) / chunkSize)
                              //console.log('CUNKS',chunks)
                              for (var i = 1; i <= chunks ; i++) {
                                  //console.log('PPPROm',i,chunks)
                                  function aa(i) {
                                      promises.push(new Promise(function(resolve,reject) {
                                          setTimeout(function() {
                                              axios.get('https://musicbrainz.org/ws/2/work?query=' + artistId + '&limit='+chunkSize+'&fmt=json&offset=' + i, axiosOptions).then(function(res) {
                                                  resolve(res && res.data && Array.isArray(res.data.works) ? res.data.works : [])
                                               })
                                            },1000*i)
                                      }))
                                  }
                                  aa(i)
                              }
                              Promise.all(promises).then(function(resultsArray) {
                                //console.log(resultsArray)    
                                //console.log('MB SEARCH ARTIST collated extras ',resultsArray )
                                var final = {}
                                if (results && results.data && Array.isArray(results.data.works)) {
                                    results.data.works.forEach(function(work) {
                                        if (work.title) final[work.title] = work
                                    })
                                }
                                resultsArray.forEach(function(resultSet) {
                                    resultSet.forEach(function(result) {
                                        if (result.title) final[result.title] = result
                                    })
                                })
                                //console.log("FINAL",final)
                                resolve(Object.values(final))
                                
                              })
                          } else {
                              //console.log('MB SEARCH ARTIST works result ',artistId,results )
                              resolve(results && results.data && results.data.works ? results.data.works : [])
                          }
                      } else {
                          resolve([])
                      }
                      
                    
                  })
                //},500)
            }
        })
    }
    
    
    function searchArtist(query) {
        return new Promise(function(resolve, reject) {
            //console.log('MB SEARCH ARTIST',query)
            if (query) {
                clearTimeout(searchTimeout)
                searchTimeout = setTimeout(function() {
                  axios.get('https://musicbrainz.org/ws/2/artist?query='+query+'&fmt=json', axiosOptions).then(function(results) {
                    //console.log('MB SEARCH ARTIST result ',results )
                    resolve(results && results.data && results.data.artists ? results.data.artists : [])
                  })
                },500)
            }
        })
    }
    
    async function artistOptions(filter) {
      var artists = await searchArtist(filter)
      var final = []
      var seen = {}
      artists.forEach(function(a) {
          if (a.name && !seen.hasOwnProperty(a.name)) {
            final.push( {value: a.id, label: a.name}  )
            seen[a.name] = true
          }
      })
      final.sort(function(a,b) {
        return (a && a.label && b && b.label && b.label > a.label) ? -1 : 1
      })
      return final
  }
  
  return {searchArtist, artistOptions, worksByArtist}
}
export default useMusicBrainz



