import {Link , Outlet } from 'react-router-dom'
import {Button, ButtonGroup, Tabs, Tab} from 'react-bootstrap'
import MusicLayout from '../components/MusicLayout'
import ImportCollectionsAccordion from '../components/ImportCollectionsAccordion'
import FeaturedTune from '../components/FeaturedTune'
//import curated from '../CuratedTuneBooks'
import {useEffect, useState} from 'react'
import AddSongModal from '../components/AddSongModal'
import ImportOptionsModal from '../components/ImportOptionsModal'
import TuneBookOptionsModal from '../components/TuneBookOptionsModal'
//import Accordion from 'react-bootstrap/Accordion';
import {useNavigate} from 'react-router-dom'
import VennDiagram from '../components/VennDiagram'
 //<Accordion defaultActiveKey="0">
      //<Accordion.Item eventKey="0">
        //<Accordion.Header>Accordion Item #1</Accordion.Header>
        //<Accordion.Body>

export default function BooksPage(props) {
    const navigate = useNavigate()
    const [searchFilter, setSearchFilter ] = useState('') 
    const [searchTagFilter, setSearchTagFilter ] = useState('') 
    function getShowParam() {
        if (window.location.hash && window.location.hash.indexOf('?show=') !== -1) {
            return window.location.hash.slice(window.location.hash.indexOf('?show=') + 6)
        }
        return ''
    }
    //var buttonGroupStyle={marginLeft:'0.2em',backgroundColor:'#0d6efd', border:'1px solid black', borderRadius:'10px'}
                    
   
    //console.log(notCollatedCurated)
    const showImport = (getShowParam() === "importList" || getShowParam() === "importAbc" || getShowParam() === "importCollection")
    //const [imageIsHidden, setImageIsHidden] = useState({})
    //function hideImage(key) {
        //var v = imageIsHidden
        //v[key] = true
        //setImageIsHidden(v)
    //}
    const [tagImageIsHidden, setTagImageIsHidden] = useState({})
    function hideTagImage(key) {
        var v = tagImageIsHidden
        v[key] = true
        setTagImageIsHidden(v)
    }
    const [myBookImageIsHidden, setMyBookImageIsHidden] = useState({})
    function hideMyBookImage(key) {
        var v = myBookImageIsHidden
        v[key] = true
        setMyBookImageIsHidden(v)
    }
    
   
    
    var tbOptions = Object.keys(props.tunebook.getTuneBookOptions())
    var tagOptions = Object.keys(props.tunebook.getTuneTagOptions())
    tbOptions.sort(function(a,b) {if (a > b) return 1; else return -1})
    tagOptions.sort(function(a,b) {if (a > b) return 1; else return -1})
    return <div className="App-books">
        <div style={{clear:'both', width:'100%', marginTop: '1em'}}>
            {tbOptions.length == 0 && <div>
                <h4>Import a Book</h4>
                 <div style={{float:'left'}} >
                    <hr/>
                    <div style={{marginTop:'1em'}} >
                    This tune book software helps musicians collect and organise and practice their music.
                    </div>
                     <div style={{marginTop:'1em'}} >
                    The software helps you to find and manage lyrics and music from the Internet and provides tools to help tidy up those resources into something you can play along with. 
                    </div>
                     <div style={{marginTop:'1em',marginBottom:'1em'}} >
                    Import one of the curated tunebooks to get started.
                    </div>
                    
                    <ImportCollectionsAccordion tunebook={props.tunebook} />
                    
                </div>
            </div>}
        
            {tbOptions.length > 0 && <div>
                <span style={{float:'right',  padding:'0.2em', clear:'both'}} id="tunebookbuttons" >
                    <AddSongModal tunes={props.tunes} show={getShowParam()} forceRefresh={function() {}} filter={''} setFilter={function() {}}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
                    <ImportOptionsModal  token={props.token} show={showImport}  tunesHash={props.tunesHash}  forceRefresh={props.forceRefresh}   tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
                    <Button variant="info" title="Download" style={{color:'white', float:'right'}} onClick={function(e) { props.tunebook.downloadTuneBookAbc();}}  >
                    {props.tunebook.icons.save} Download
                </Button>
                </span>

                <Tabs defaultActiveKey="books" >
                    <Tab  eventKey="books" title="Your Books">
                        <input style={{float:'left'}} type='search'  value={searchFilter} onChange={function(e) {setSearchFilter(e.target.value)}} />
                        <div style={{clear:'both'}} > </div>
                        <div style={{float:'left'}}>{tbOptions.map(function(option, ok) {
                            if (option && option.trim().length > 0 && ((searchFilter.trim && searchFilter.trim() === '') || searchFilter.trim && option.trim().indexOf(searchFilter.trim())!== -1 )) { 
                                return <ButtonGroup key={ok} style={{minHeight:'65px', backgroundColor: '#0d6efd', borderRadius:'5px', marginTop:'0.4em', marginLeft:'0.2em'}} onClick={function(e) {props.setCurrentTuneBook(option); props.setTagFilter(''); props.setFilter('')}} >
                                    <TuneBookOptionsModal tunebook={props.tunebook} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} googleDocumentId={props.googleDocumentId} token={props.token} fillMediaPlaylist={props.tunebook.fillMediaPlaylist} fillAbcPlaylist={props.tunebook.fillAbcPlaylist} tunebookOption={option} user={props.user} />
                                    <Link  to='/tunes' key={ok} style={{color:'white', textDecoration:'none'}} ><Button style={{height: '90px', verticalAlign:'text-top', fontWeight:'bold', fontSize:'1.3em'}} >{option}&nbsp;&nbsp; {!myBookImageIsHidden[ok] && <img style={{height:'80px'}} src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideMyBookImage(ok)}} />}
                                    {myBookImageIsHidden[ok] && <img style={{height:'80px'}} src={"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdj4M37+x8ABHwCeNvV2gcAAAAASUVORK5CYII="} />}
                                    </Button></Link>
                                    <Button onClick={function() {props.tunebook.fillMediaPlaylist(option); navigate("/tunes")}} variant={"primary"} size="small" >{props.tunebook.icons.youtube}</Button>
                                </ButtonGroup>
                            } else {
                                return null
                            }
                        })}</div>
                    </Tab>
                    
                    <Tab eventKey="tags" title="Your Tags">
                        <input style={{float:'left'}} type='search'  value={searchTagFilter} onChange={function(e) {setSearchTagFilter(e.target.value)}} />
                        <div style={{clear:'both'}} ></div>
                        <div style={{float:'left'}}>{tagOptions.map(function(option, ok) {
                            if (option && option.trim().length > 0 && ((searchTagFilter.trim && searchTagFilter.trim() === '') || searchTagFilter.trim && option.trim().indexOf(searchTagFilter.trim())!== -1 )) { 
                                return <ButtonGroup key={ok} style={{color:'white',minHeight:'65px', backgroundColor: '#0d6efd', borderRadius:'5px', marginTop:'0.4em', marginLeft:'0.2em', height: '90px', verticalAlign:'text-top'}}  >
                                <Button style={{fontWeight:'bold', fontSize:'1.3em'}} onClick={function(e) {props.setTagFilter([option]); props.setCurrentTuneBook(''); props.setFilter(''); navigate('/tunes')}}>{option}</Button>
                                {!tagImageIsHidden[ok] && <img style={{height:'80px'}} src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideTagImage(ok)}} />}
                                {tagImageIsHidden[ok] && <img style={{height:'80px'}} src={"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdj4M37+x8ABHwCeNvV2gcAAAAASUVORK5CYII="} />}
                                &nbsp;
                                
                                <Button onClick={function() {
                                    //props.setTagFilter([option]);
                                    //props.setCurrentTuneBook(''); 
                                    //props.setFilter(''); 
                                    props.tunebook.fillMediaPlaylistFromTag(option);
                                    navigate("/tunes")
                                }} variant={"primary"} size="small" >{props.tunebook.icons.youtube}</Button>
                                    
                            </ButtonGroup>
                                
                            } else {
                                return null
                            }
                        })}
                        </div>
                    </Tab>
                    
                  </Tabs>      
     
            </div>}

            
          
            <div style={{float:'left', width:'100%'}} >
                <hr/>
              
                <div style={{marginTop:'1em',  float:'right'}}>
                The Tune Book is <br/>
                <a target='_new'  href='https://github.com/syntithenai/abc2book/' ><Button><img style={{maxHeight:'1.5em'}} src="opensource.svg" /> Open Source Software</Button></a>
                </div>
            </div>
        </div>
        
       
        
    </div>
}
  //<div style={{marginTop:'1em'}}>
                //Checkout the <Link to="/help" ><Button>Help</Button></Link> section for some tips and tricks.
                //</div>
 //<Tab eventKey="tagsoverview" title="Tags Overview">
                    //<VennDiagram />
                    //</Tab>
                     
 //<ImportOptionsModal  token={props.token}show={showImport}  tunesHash={props.tunesHash}  forceRefresh={props.forceRefresh}   tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
  
            //{Object.keys(curated).length > 0 && <div style={{marginTop:'1em', float:'left'}} ><h4>Import a Book</h4>
                 //<div style={{float:'left'}} >
                    //<hr/>
                    //<div style={{marginTop:'1em'}} >
                    //This tune book software helps musicians collect and organise and practice their music.
                    //</div>
                     //<div style={{marginTop:'1em'}} >
                    //The software helps you to find lyrics and music from the Internet and provides tools to help tidy up those resources into something you can play along with. The importable books below have mostly been curated to ensure formatting and include chords and youtube links.
                    //</div>
                //</div>
                
             
            //</div>}      
