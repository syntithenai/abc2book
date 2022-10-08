import {Link , Outlet } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import MusicLayout from '../components/MusicLayout'
import IndexLayout from '../components/IndexLayout'
import ImportCollectionModal from '../components/ImportCollectionModal'
import FeaturedTune from '../components/FeaturedTune'
import curated from '../CuratedTuneBooks'
import {useEffect, useState} from 'react'
import AddSongModal from '../components/AddSongModal'
import ImportOptionsModal from '../components/ImportOptionsModal'
import TuneBookOptionsModal from '../components/TuneBookOptionsModal'

export default function BooksPage(props) {
    
    function getShowParam() {
        if (window.location.hash && window.location.hash.indexOf('?show=') !== -1) {
            return window.location.hash.slice(window.location.hash.indexOf('?show=') + 6)
        }
        return ''
    }
    
    const showImport = (getShowParam() === "importList" || getShowParam() === "importAbc" || getShowParam() === "importCollection")
    
    return <div className="App-books">
        
        
    
        <div style={{clear:'both', width:'100%', marginTop: '1em'}}>
            {Object.keys(props.tunebook.getTuneBookOptions()).length > 0 && <div>
                <Button variant="success" title="Download" style={{color:'black', float:'right'}} onClick={function(e) { props.tunebook.downloadTuneBookAbc();}}  >
                    {props.tunebook.icons.save}
                </Button>
                <h4>Your Books</h4>
                <div>{Object.keys(props.tunebook.getTuneBookOptions()).map(function(option, ok) {
                    if (option && option.trim().length > 0) { 
                        return <Button style={{marginTop:'0.4em'}} onClick={function(e) {props.setCurrentTuneBook(option)}} >
                            <TuneBookOptionsModal tunebook={props.tunebook} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} googleDocumentId={props.googleDocumentId} token={props.token} />
                            <Link  to='/tunes' key={ok} style={{color:'white', textDecoration:'none'}} >{option} </Link>
                        </Button>
                    } else {
                        return null
                    }
                })}</div>
            </div>}

            <span style={{float:'right',  padding:'0.2em', clear:'both'}} id="tunebookbuttons" >
                <AddSongModal show={getShowParam()} forceRefresh={function() {}} filter={''} setFilter={function() {}}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
                <ImportOptionsModal show={showImport}  tunesHash={props.tunesHash}  forceRefresh={props.forceRefresh}   tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
            </span>
            
            {Object.keys(curated).length > 0 && <div style={{marginTop:'1em'}} ><h4>Import a Book</h4>
                <div>{Object.keys(curated).map(function(bookTitle,ok) {
                    if (curated[bookTitle].link) {
                        return <Link  to={'/importlink/' + encodeURIComponent(curated[bookTitle].link)} key={ok} style={{textDecoration:'none'}} ><Button style={{marginTop:'0.4em'}} onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >
                        {curated[bookTitle].image ? <img src={curated[bookTitle].image} style={{height:'50px'}}  /> : null}
                        &nbsp;{bookTitle}
                        </Button>&nbsp;&nbsp;</Link>
                    } else if (curated[bookTitle].googleDocumentId) {
                        return <Link  to={'/importdoc/' + curated[bookTitle].googleDocumentId} key={ok} style={{textDecoration:'none'}} ><Button style={{marginTop:'0.4em'}} onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >{curated[bookTitle].image ? <img src={curated[bookTitle].image} style={{height:'50px'}}  /> : null}
                        &nbsp;{bookTitle}</Button>&nbsp;&nbsp;</Link>
                    }
                })}</div>
            </div>}
            <hr/>
            <div style={{marginTop:'1em'}} >
            This tune book software helps musicians collect and organise and practice their music.
            </div>
             <div style={{marginTop:'1em'}} >
            The software helps you to find lyrics and music from the Internet and provides tools to help tidy up those resources into something you can play along with. The importable books above have mostly been curated to ensure formatting and include chords.
            </div>
             <div style={{marginTop:'1em'}} >
            Song and tunes can be organised into books. A song can be in many books. I have a book for each of my musical friends which is helpful remembering songs we all know at sessions.
            </div>
            <div style={{marginTop:'1em'}}>
            Checkout the <Link to="/help" ><Button>Help</Button></Link> section for some tips and tricks.
            </div>
        </div>
        
       
        
    </div>
}
 //<ImportOptionsModal show={showImport}  tunesHash={props.tunesHash}  forceRefresh={props.forceRefresh}   tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
        
