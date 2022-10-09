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
import Accordion from 'react-bootstrap/Accordion';

 //<Accordion defaultActiveKey="0">
      //<Accordion.Item eventKey="0">
        //<Accordion.Header>Accordion Item #1</Accordion.Header>
        //<Accordion.Body>

export default function BooksPage(props) {
    
    function getShowParam() {
        if (window.location.hash && window.location.hash.indexOf('?show=') !== -1) {
            return window.location.hash.slice(window.location.hash.indexOf('?show=') + 6)
        }
        return ''
    }
    // collate curations by group
    var collatedCurated = {}
    var notCollatedCurated = {}
    Object.keys(curated).forEach(function(bookTitle) {
        if (curated[bookTitle].group) {
            if (!collatedCurated.hasOwnProperty(curated[bookTitle].group)) collatedCurated[curated[bookTitle].group] = {}
            collatedCurated[curated[bookTitle].group][bookTitle] = curated[bookTitle]
        } else {
            if (!notCollatedCurated.hasOwnProperty(curated[bookTitle].group)) notCollatedCurated[curated[bookTitle].group] = {}
            notCollatedCurated[bookTitle] = curated[bookTitle]
        }
    })
    console.log(notCollatedCurated)
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
                            <img style={{height:'50px'}} src={"/book_images/"+option.replaceAll(" ","")+".jpg"} onerror="this.style.display='none'" />
                        </Button>
                    } else {
                        return null
                    }
                })}</div>
            </div>}

            <span style={{float:'right',  padding:'0.2em', clear:'both'}} id="tunebookbuttons" >
                <AddSongModal tunes={props.tunes} show={getShowParam()} forceRefresh={function() {}} filter={''} setFilter={function() {}}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
                <ImportOptionsModal show={showImport}  tunesHash={props.tunesHash}  forceRefresh={props.forceRefresh}   tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
            </span>
            
            {Object.keys(curated).length > 0 && <div style={{marginTop:'1em'}} ><h4>Import a Book</h4>
                
                <Accordion defaultActiveKey={Number('0')} >
                    {Object.keys(collatedCurated).map(function(groupTitle,gk) {
                    var groupItems = collatedCurated[groupTitle]
                    return <Accordion.Item eventKey={Number(gk)}>
                        <Accordion.Header  style={{marginTop:'0.3em'}} >{groupTitle}</Accordion.Header>
                        <Accordion.Body>{Object.keys(groupItems).map(function(bookTitle,ok) {
                            if (groupItems[bookTitle].link) {
                                return <Link  to={'/importlink/' + encodeURIComponent(groupItems[bookTitle].link) + (groupItems[bookTitle].book ? "/book/"+encodeURIComponent(groupItems[bookTitle].book) : "")} key={ok} style={{textDecoration:'none'}} ><Button style={{marginTop:'0.4em'}} onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >
                                {groupItems[bookTitle].image ? <img src={groupItems[bookTitle].image} style={{height:'50px'}}  /> : null}
                                &nbsp;{bookTitle}
                                </Button>&nbsp;&nbsp;</Link>
                            } else if (groupItems[bookTitle].googleDocumentId) {
                                return <Link  to={'/importdoc/' + groupItems[bookTitle].googleDocumentId  + (groupItems[bookTitle].book ? "/book/"+encodeURIComponent(groupItems[bookTitle].book) : "")} key={ok} style={{textDecoration:'none'}} ><Button style={{marginTop:'0.4em'}} onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >{groupItems[bookTitle].image ? <img src={groupItems[bookTitle].image} style={{height:'50px'}}  /> : null}
                                &nbsp;{bookTitle}</Button>&nbsp;&nbsp;</Link>
                            }
                        })}</Accordion.Body>
                    </Accordion.Item>})}
                    {Object.keys(notCollatedCurated).length > 0 && <Accordion.Item eventKey="other">
                         <Accordion.Header style={{marginTop:'0.3em'}}>Other</Accordion.Header>
                         <Accordion.Body>{Object.keys(notCollatedCurated).map(function(bookTitle,ok) {
                            if (notCollatedCurated[bookTitle].link) {
                                return <Link  to={'/importlink/' + encodeURIComponent(notCollatedCurated[bookTitle].link) + (notCollatedCurated[bookTitle].book ? "/book/"+encodeURIComponent(notCollatedCurated[bookTitle].book) : "")} key={ok} style={{textDecoration:'none'}} ><Button style={{marginTop:'0.4em'}} onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >
                                {notCollatedCurated[bookTitle].image ? <img src={notCollatedCurated[bookTitle].image} style={{height:'50px'}}  /> : null}
                                &nbsp;{bookTitle}
                                </Button>&nbsp;&nbsp;</Link>
                            } else if (notCollatedCurated[bookTitle].googleDocumentId) {
                                return <Link  to={'/importdoc/' + notCollatedCurated[bookTitle].googleDocumentId  + (notCollatedCurated[bookTitle].book ? "/book/"+encodeURIComponent(notCollatedCurated[bookTitle].book) : "")} key={ok} style={{textDecoration:'none'}} ><Button style={{marginTop:'0.4em'}} onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >{notCollatedCurated[bookTitle].image ? <img src={notCollatedCurated[bookTitle].image} style={{height:'50px'}}  /> : null}
                                &nbsp;{bookTitle}</Button>&nbsp;&nbsp;</Link>
                            }
                        })}</Accordion.Body>
                     </Accordion.Item>

                 
                 }</Accordion>
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
        
