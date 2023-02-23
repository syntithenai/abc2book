import curated from '../CuratedTuneBooks'
import Accordion from 'react-bootstrap/Accordion';
import {Link , Outlet } from 'react-router-dom'
import {Button, ButtonGroup, Tabs, Tab} from 'react-bootstrap'
import {useNavigate} from 'react-router-dom'
import {useState} from 'react'

export default function ImportCollectionsAccordion(props) {
    const navigate = useNavigate()
    const [imageIsHidden, setImageIsHidden] = useState({})
    function hideImage(key) {
        var v = imageIsHidden
        v[key] = true
        setImageIsHidden(v)
    }
    var baseImageLink = window.location.origin + "/book_images/"
    var baseImportLink = window.location.origin === "http://localhost:3000" ? "http://localhost:4000/scrape/" : window.location.origin + "/scrape/"
    var buttonGroupStyle={marginBottom:'0.2em',marginLeft:'0.2em',backgroundColor:'#0d6efd', border:'1px solid black', borderRadius:'10px'}
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
    
    return <Accordion defaultActiveKey={Number('0')} >
                    {Object.keys(collatedCurated).map(function(groupTitle,gk) {
                    var groupItems = collatedCurated[groupTitle]
                    var groupOptions = Object.keys(groupItems)
                    groupOptions.sort(function(a,b) {if (a > b) return 1; else return -1})
                    return <Accordion.Item key={gk}  eventKey={Number(gk)}>
                        <Accordion.Header  style={{marginTop:'0.3em'}} >{groupTitle}</Accordion.Header>
                        <Accordion.Body>{groupOptions.map(function(bookTitle,ok) {
                            if (groupItems[bookTitle].link) {
                                return <ButtonGroup style={buttonGroupStyle} variant="primary">
                                <Link key={'nc-'+ok}  to={'/importlink/' + encodeURIComponent(baseImportLink + groupItems[bookTitle].link) + (groupItems[bookTitle].book ? "/book/"+encodeURIComponent(groupItems[bookTitle].book) : "") + (groupItems[bookTitle].tag ? "/tag/"+encodeURIComponent(groupItems[bookTitle].tag) : "")} style={{textDecoration:'none'}} >
                                
                                <Button  onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >
                                {groupItems[bookTitle].image && !imageIsHidden[ok] && <img style={{height:'80px'}} src={baseImageLink + groupItems[bookTitle].image} onError={function() {hideImage(ok)}} />}
                                {imageIsHidden[ok] && <img style={{height:'80px'}} src={"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdj4M37+x8ABHwCeNvV2gcAAAAASUVORK5CYII="} />}
                                &nbsp;{bookTitle}
                                </Button></Link><Link key={'nM-'+ok} to={'/importlink/' + encodeURIComponent(baseImportLink + groupItems[bookTitle].link) + (groupItems[bookTitle].book ? "/book/"+encodeURIComponent(groupItems[bookTitle].book)+  (groupItems[bookTitle].tag ? "/tag/"+encodeURIComponent(groupItems[bookTitle].tag) : "") + "/play" : "")}  style={{textDecoration:'none'}} ><Button  variant={"primary"} size="small" >{props.tunebook.icons.play}</Button></Link></ButtonGroup>
                            } else if (groupItems[bookTitle].googleDocumentId) {
                                return <ButtonGroup style={buttonGroupStyle} variant="primary" ><Link key={'nc-'+ok} to={'/importdoc/' + groupItems[bookTitle].googleDocumentId  + (groupItems[bookTitle].book ? "/book/"+encodeURIComponent(groupItems[bookTitle].book) : "")} style={{textDecoration:'none'}} ><Button style={{marginTop:'0.4em', align:'top'}} onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >{groupItems[bookTitle].image && !imageIsHidden[ok] && <img style={{height:'80px'}} src={baseImageLink + groupItems[bookTitle].image} onError={function() {hideImage(ok)}} />}
                                {imageIsHidden[ok] && <img style={{height:'80px'}} src={"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdj4M37+x8ABHwCeNvV2gcAAAAASUVORK5CYII="} />}
                                &nbsp;{bookTitle}</Button></Link><Link  to={'/importlink/' + encodeURIComponent(groupItems[bookTitle].link) + (groupItems[bookTitle].book ? "/book/"+encodeURIComponent(groupItems[bookTitle].book) + "play" : "")} key={'nm-'+ok} style={{textDecoration:'none'}} ><Button  variant={"primary"} size="small" >{props.tunebook.icons.play}</Button></Link></ButtonGroup>
                            }
                        })}</Accordion.Body>
                    </Accordion.Item>})}
                    {Object.keys(notCollatedCurated).length > 0 && <Accordion.Item eventKey="other">
                         <Accordion.Header style={{marginTop:'0.3em'}}>Other</Accordion.Header>
                         <Accordion.Body>{Object.keys(notCollatedCurated).map(function(bookTitle,ok) {
                            if (notCollatedCurated[bookTitle].link) {
                                return <ButtonGroup style={buttonGroupStyle} variant="success"><Link  key={'nc-'+ok} to={'/importlink/' + encodeURIComponent(notCollatedCurated[bookTitle].link) + (notCollatedCurated[bookTitle].book ? "/book/"+encodeURIComponent(notCollatedCurated[bookTitle].book) : "")}  style={{textDecoration:'none'}} ><Button onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >
                                {notCollatedCurated[bookTitle].image ? <img src={notCollatedCurated[bookTitle].image} style={{height:'80px'}}  /> : null}
                                &nbsp;{bookTitle}
                                </Button>&nbsp;&nbsp;</Link><Link  key={'nm-'+ok} to={'/importlink/' + encodeURIComponent(notCollatedCurated[bookTitle].link) + (notCollatedCurated[bookTitle].book ? "/book/"+encodeURIComponent(notCollatedCurated[bookTitle].book) + "/play" : "")} key={ok} style={{textDecoration:'none'}} ><Button  variant={"primary"} size="small" >{props.tunebook.icons.play}</Button></Link></ButtonGroup>
                            } else if (notCollatedCurated[bookTitle].googleDocumentId) {
                                return <ButtonGroup style={buttonGroupStyle} variant="primary"><Link key={'nc-'+ok} to={'/importdoc/' + notCollatedCurated[bookTitle].googleDocumentId  + (notCollatedCurated[bookTitle].book ? "/book/"+encodeURIComponent(notCollatedCurated[bookTitle].book) : "")}  style={{textDecoration:'none'}} ><Button onClick={function(e) {props.setCurrentTuneBook(bookTitle)}} >{notCollatedCurated[bookTitle].image ? <img src={notCollatedCurated[bookTitle].image} style={{height:'80px'}}  /> : null}
                                &nbsp;{bookTitle}</Button>&nbsp;&nbsp;</Link><Link  key={'nm-'+ok} to={'/importlink/' + encodeURIComponent(notCollatedCurated[bookTitle].link) + (notCollatedCurated[bookTitle].book ? "/book/"+encodeURIComponent(notCollatedCurated[bookTitle].book) + "/play" : "")} style={{textDecoration:'none'}} ><Button  variant={"primary"} size="small" >{props.tunebook.icons.play}</Button></Link></ButtonGroup>
                            }
                        })}</Accordion.Body>
                     </Accordion.Item>

                 
                 }</Accordion>
                 
                 
}                
