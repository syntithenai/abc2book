    import {Link , useNavigate , useParams} from 'react-router-dom'
import {useState, useEffect} from 'react'
import {Button, Modal} from 'react-bootstrap'
import axios from 'axios'

export default function ImportLinkPage({tunebook, token, refresh, mediaPlaylist, setMediaPlaylist, autoplay, setCurrentTuneBook, setTunes, forceRefresh, setTagFilter}) {
    var navigate = useNavigate()
    var params = useParams()
    //console.log(params)
    const [error,setError] = useState('')
    const [clickToStart, setClickToStart] = useState(false)
    //if (curated.hasOwnProperty(params.curation)) {
        //console.log("D",params.curation) //curated[params.curation])
    //} 
    const [agree, setAgree] = useState(false)
    const [show, setShow] = useState(false)
    
    function handleCloseAgree() {
        //console.log('close',params)
        if (params.tuneId) {
            navigate("/tunes/")
        } else {
            navigate("/tunes")
        }
    }
    
    function onClose() {
        //console.log('onClose')
        //props.setCurrentTuneBook(params.googleDocumentId)
        navigate("/tunes")
    }
    
    
    useEffect(function() {
      //console.log('impo go usef',params.googleDocumentId,token)
      if (!params.link) {
          navigate("/tunes")
      } else {
          //if (token) {
              // load document 
              //console.log('ldd DO',params.link, params)
              axios.get(params.link).then(function(res) {
                  if (res.data) {
                      //console.log("gotres",res.data.length)
                      var results = tunebook.importAbc(res.data,null,params.tuneId,params.bookName, params.tagName)
                      //console.log("gotreeees",results)
                      if (!tunebook.showImportWarning(results)) {
                          //console.log("no show warning", autoplay , setMediaPlaylist)
                          tunebook.applyMergeData(results).then(function(mergedTunes) {
                                //console.log('applied', mergedTunes)
                              if (autoplay && setMediaPlaylist && mergedTunes) {
                                    var tunes=[]
                                    //forceRefresh()
                                    //console.log('aplay tunes from book',tunes)
                                    //setTunes(tunes)
                                    setCurrentTuneBook('')
                                    if (params.bookName) {
                                    //setTimeout(function() {
                                        setCurrentTuneBook(params.bookName)
                                    }
                                    setTagFilter([])
                                    if (params.tagName) {
                                        setTagFilter([params.tagName])
                                        //tunes = tunebook.mediaFromTag(params.tagName)
                                    }
                                     //else {
                                        //tunes = tunebook.mediaFromBook(params.bookName, mergedTunes)
                                    //}
                                    
                                    var firstTuneId = tunebook.fillMediaPlaylist(
                                        params.bookName,
                                        (Array.isArray(results) ? results.map(function(result) {
                                            return result.id
                                        }).join(","): ''), (params.tagName && params.tagName.trim() ? params.tagName : []),mergedTunes) 
                                    navigate("/tunes"+(firstTuneId ? "/" + firstTuneId + '/playMedia' : ''))
                                    //setMediaPlaylist({currentTune: 0, book:params.bookName, tunes:tunes})
                                        //setClickToStart(true)
                                    //}, 200)
                              } else {  
                                  setTagFilter([])
                                  if (params.tagName) {
                                    setTagFilter([params.tagName])
                                  }
                                  setCurrentTuneBook('')
                                    if (params.bookName) {
                                    //setTimeout(function() {
                                        setCurrentTuneBook(params.bookName)
                                    }
                                    if (params.bookName || params.tagName) {
                                        navigate("/tunes")
                                    } else {
                                        navigate("/books")
                                    }
                                  //console.log("GO TO ",params.bookName  )
                                  
                              }
                          })
                      }
                      
                  } else {
                      setError("Unable to load import source")
                  }
              }).catch(function(e) {
                  console.log(e)
                    setError("Error loading import source")    
              })
              //docs.getDocument(params.googleDocumentId).then(function(fullSheet) {
                  //console.log('ldd',fullSheet)
                  //if (fullSheet) {
                      //tunebook.importAbc(fullSheet)
                      //navigate("/tunes")
                  //} else {
                      //setError("Unable to load import source")
                  //}
              //})
            //}
      }
    }, [])
    if (clickToStart) {
        return <div style={{width:'80%', margin:'5em', padding:'5em', backgroundColor:'lightgreen'}} >
            <Button size='lg' variant="success" onClick={function() {
                setClickToStart(false); 
                //console.log("MP",mediaPlaylist)
                if (mediaPlaylist && mediaPlaylist.tunes) {
                    navigate("/tunes")
                } else {
                   navigate("/tunes")
                }
            }} >Start the Playlist</Button>
            </div>
    } else {
        return <>{(params.link && params.link.trim()) ? <div className="App-import">
         <h1>Import a Shared Tune Book </h1>
         {(!error) && <>Loading..</>}
         {(error) && <>{error}</>}
        </div> : null}</>
    }
}
//{agree 
         //? <ImportCollectionModal autoStart={params.curation && params.curation.trim() ? params.curation : false} forceRefresh={props.forceRefresh}  tunebook={props.tunebook}   currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={handleCloseAgree} /> 
         //: <Modal show={!agree} onHide={handleCloseAgree}>
        //<Modal.Header closeButton>
          //<Modal.Title>Import a Book</Modal.Title>
          
        //</Modal.Header>
       
        //<Modal.Body> 
        //Do you want to import the book <i>{params.curation}</i>? 
        //<div style={{fontWeight: 'bold'}} >This will override any changes you have made to prior imports.</div>
        //</Modal.Body>
        //<Modal.Footer>
        //<Button onClick={function(e) {setAgree(true)}} variant="success" >OK</Button>
        //<Button onClick={function(e) {navigate('/tunes')}} variant="danger" >Cancel</Button>
        
        //</Modal.Footer>
      //</Modal>
     //}
