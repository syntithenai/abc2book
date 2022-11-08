import {Link , Outlet } from 'react-router-dom'
import {Button, ButtonGroup} from 'react-bootstrap'
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
import {useNavigate} from 'react-router-dom'
 //<Accordion defaultActiveKey="0">
      //<Accordion.Item eventKey="0">
        //<Accordion.Header>Accordion Item #1</Accordion.Header>
        //<Accordion.Body>

export default function BooksPage(props) {
    const navigate = useNavigate()
    function getShowParam() {
        if (window.location.hash && window.location.hash.indexOf('?show=') !== -1) {
            return window.location.hash.slice(window.location.hash.indexOf('?show=') + 6)
        }
        return ''
    }
    var buttonGroupStyle={marginLeft:'0.2em',backgroundColor:'#0d6efd', border:'1px solid black', borderRadius:'10px'}
                    
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
    const [imageIsHidden, setImageIsHidden] = useState({})
    function hideImage(key) {
        imageIsHidden[key] = true
    }
    
    function fillMediaPlaylist(book) {
        var tunes=props.tunebook.mediaFromBook(book)
        props.setMediaPlaylist({currentTune: 0, book:book, tunes:tunes})
    }
    var tbOptions = Object.keys(props.tunebook.getTuneBookOptions())
    tbOptions.sort(function(a,b) {if (a > b) return 1; else return -1})
    return <div className="App-books">
        
        <div style={{clear:'both', width:'100%', marginTop: '1em'}}>
            {Object.keys(props.tunebook.getTuneBookOptions()).length > 0 && <div>
                <Button variant="success" title="Download" style={{color:'black', float:'right'}} onClick={function(e) { props.tunebook.downloadTuneBookAbc();}}  >
                    {props.tunebook.icons.save}
                </Button>
                <h4>Your Books</h4>
                <div>{tbOptions.map(function(option, ok) {
                    if (option && option.trim().length > 0) { 
                        return <ButtonGroup style={{minHeight:'65px', backgroundColor: '#0d6efd', borderRadius:'5px', marginTop:'0.4em', marginLeft:'0.2em'}} onClick={function(e) {props.setCurrentTuneBook(option)}} >
                            <TuneBookOptionsModal tunebook={props.tunebook} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} googleDocumentId={props.googleDocumentId} token={props.token} fillMediaPlaylist={fillMediaPlaylist} tunebookOption={option} />
                            <Link  to='/tunes' key={ok} style={{color:'white', textDecoration:'none'}} ><Button>{option} {!imageIsHidden[ok] && <img style={{height:'50px'}} src={"/book_images/"+option.replaceAll(" ","")+".jpg"} onError={function() {hideImage(ok)}} />}</Button></Link>
                            <Button onClick={function() {fillMediaPlaylist(option); navigate("/tunes")}} variant={"primary"} size="small" >{props.tunebook.icons.youtube}</Button>
                        </ButtonGroup>
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
                    var groupOptions = Object.keys(groupItems)
                    groupOptions.sort(function(a,b) {if (a > b) return 1; else return -1})
                    return <Accordion.Item key={gk}  eventKey={Number(gk)}>
                        <Accordion.Header  style={{marginTop:'0.3em'}} >{groupTitle}</Accordion.Header>
                        <Accordion.Body>{groupOptions.map(function(bookTitle,ok) {
                            if (groupItems[bookTitle].link) {
                                return <ButtonGroup style={buttonGroupStyle} variant="primary"><Link key={ok}  to={'/importlink/' + encodeURIComponent(groupItems[bookTitle].link) + (groupItems[bookTitle].book ? "/book/"+encodeURIComponent(groupItems[bookTitle].book) : "")} key={ok} style={{textDecoration:'none'}} ><Button  onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >
                                <img src={"/book_images/"+bookTitle.replaceAll(" ","")+".jpg"} style={{height:'50px'}}  />
                                &nbsp;{bookTitle}
                                </Button></Link><Link key={ok} to={'/importlink/' + encodeURIComponent(groupItems[bookTitle].link) + (groupItems[bookTitle].book ? "/book/"+encodeURIComponent(groupItems[bookTitle].book)+ "/play" : "")} key={ok} style={{textDecoration:'none'}} ><Button  variant={"primary"} size="small" >{props.tunebook.icons.youtube}</Button></Link></ButtonGroup>
                            } else if (groupItems[bookTitle].googleDocumentId) {
                                return <ButtonGroup style={buttonGroupStyle} variant="primary" ><Link key={ok} to={'/importdoc/' + groupItems[bookTitle].googleDocumentId  + (groupItems[bookTitle].book ? "/book/"+encodeURIComponent(groupItems[bookTitle].book) : "")} key={ok} style={{textDecoration:'none'}} ><Button style={{marginTop:'0.4em'}} onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} ><img src={"/book_images/"+bookTitle.replaceAll(" ","")+".jpg"} style={{height:'50px'}}  />
                                &nbsp;{bookTitle}</Button></Link><Link key={ok} to={'/importlink/' + encodeURIComponent(groupItems[bookTitle].link) + (groupItems[bookTitle].book ? "/book/"+encodeURIComponent(groupItems[bookTitle].book) + "play" : "")} key={ok} style={{textDecoration:'none'}} ><Button  variant={"primary"} size="small" >{props.tunebook.icons.youtube}</Button></Link></ButtonGroup>
                            }
                        })}</Accordion.Body>
                    </Accordion.Item>})}
                    {Object.keys(notCollatedCurated).length > 0 && <Accordion.Item eventKey="other">
                         <Accordion.Header style={{marginTop:'0.3em'}}>Other</Accordion.Header>
                         <Accordion.Body>{Object.keys(notCollatedCurated).map(function(bookTitle,ok) {
                            if (notCollatedCurated[bookTitle].link) {
                                return <ButtonGroup style={buttonGroupStyle} variant="success"><Link  key={ok} to={'/importlink/' + encodeURIComponent(notCollatedCurated[bookTitle].link) + (notCollatedCurated[bookTitle].book ? "/book/"+encodeURIComponent(notCollatedCurated[bookTitle].book) : "")} key={ok} style={{textDecoration:'none'}} ><Button onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >
                                {notCollatedCurated[bookTitle].image ? <img src={notCollatedCurated[bookTitle].image} style={{height:'50px'}}  /> : null}
                                &nbsp;{bookTitle}
                                </Button>&nbsp;&nbsp;</Link><Link  key={ok} to={'/importlink/' + encodeURIComponent(notCollatedCurated[bookTitle].link) + (notCollatedCurated[bookTitle].book ? "/book/"+encodeURIComponent(notCollatedCurated[bookTitle].book) + "/play" : "")} key={ok} style={{textDecoration:'none'}} ><Button  variant={"primary"} size="small" >{props.tunebook.icons.youtube}</Button></Link></ButtonGroup>
                            } else if (notCollatedCurated[bookTitle].googleDocumentId) {
                                return <ButtonGroup style={buttonGroupStyle} variant="primary"><Link key={ok} to={'/importdoc/' + notCollatedCurated[bookTitle].googleDocumentId  + (notCollatedCurated[bookTitle].book ? "/book/"+encodeURIComponent(notCollatedCurated[bookTitle].book) : "")} key={ok} style={{textDecoration:'none'}} ><Button onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >{notCollatedCurated[bookTitle].image ? <img src={notCollatedCurated[bookTitle].image} style={{height:'50px'}}  /> : null}
                                &nbsp;{bookTitle}</Button>&nbsp;&nbsp;</Link><Link  key={ok} to={'/importlink/' + encodeURIComponent(notCollatedCurated[bookTitle].link) + (notCollatedCurated[bookTitle].book ? "/book/"+encodeURIComponent(notCollatedCurated[bookTitle].book) + "/play" : "")} key={ok} style={{textDecoration:'none'}} ><Button  variant={"primary"} size="small" >{props.tunebook.icons.youtube}</Button></Link></ButtonGroup>
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
            Song and tunes can be organised into books. A song can be in many books. 
            <br/>
            At this stage, I have a book for each of my musical friends which is helpful remembering songs we all know at sessions. 
            </div>
            <div style={{marginTop:'1em'}}>
            Checkout the <Link to="/help" ><Button>Help</Button></Link> section for some tips and tricks.
            </div>
            <div style={{marginTop:'1em',  float:'right'}}>
            The Tune Book is <br/>
            <a target='_new'  href='https://github.com/syntithenai/abc2book/' ><Button><img style={{maxHeight:'1.5em'}} src="opensource.svg" /> Open Source Software</Button></a>
            </div>
        </div>
        
       
        
    </div>
}
 //<ImportOptionsModal show={showImport}  tunesHash={props.tunesHash}  forceRefresh={props.forceRefresh}   tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
        
