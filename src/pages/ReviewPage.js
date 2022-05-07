import {Link , useParams , useNavigate} from 'react-router-dom'
import {Button, ListGroup} from 'react-bootstrap'
import {useEffect, useState} from 'react'
import useUtils from '../useUtils'
import BoostSettingsModal from '../components/BoostSettingsModal'
import ReviewNavigationModal from '../components/ReviewNavigationModal'
import Abc from '../components/Abc'
import BookSelectorModal from '../components/BookSelectorModal'

export default function ReviewPage(props) {
  var utils = useUtils()  
  let params = useParams()
  let navigate = useNavigate()
  const [reviewItems, setReviewItems] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  let [isWaiting, setIsWaiting] = useState(false)
  var [ready, setReady] = useState(false)
  let [seekTo, setSeekTo] = useState(false)
    
  function audioCallback(event) {
        console.log('cab',event) 
        //return 
        if (event ==='ended' || event ==='error' || event === 'stop') {
            setIsPlaying(false)
            setIsWaiting(false)
        } else if (event === 'started') {
            setIsWaiting(false)
        } else if (event === 'ready') {
            setReady(true)
        } 
    }
  
  function getReviewTempo(tune) {
      var final = 100
      if (tune) {
        var boost = tune.boost > 0 ? tune.boost : 0
        var useBoost = boost > 20 ? 20 : boost
        //Math.min(boost,50)
        var tempo = 30 + useBoost * 5
        //tempo+= 300 // testing
        final = tempo;
      } else {
        final = 100
      }
      //console.log('get review tempo ',final)
      return final
  } 

  function getCurrentReviewIndex() {
    let currentReviewItem = params.tuneId > 0 ? params.tuneId : 0
    //currentReviewItem = currentReviewItem % reviewItems.length
    return parseInt(currentReviewItem) !== NaN ? parseInt(currentReviewItem) : 0;
  }
  
  //function getReviewItemNumber(index) {
      //var count = 0
      //var item = null
      //if (reviewItems) {
          //Object.values(reviewItems).forEach(function(reviewBand) {
              //reviewBand.forEach(function(itemId) {
                //if (count === index) {
                    //item = props.tunebook.tunes[itemId]
                //}
                //count += 1
              //})
          //})
      //}
      //console.log('gri',index,item, reviewItems)
      //return item ? item : {abc:'',title:''}
  //}
      
  function shuffleArray(array) {
    let currentIndex = array.length,  randomIndex;
    while (currentIndex != 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
    return array;
  }

  function generateReviewList() {
      //console.log('gen review',props.currentTuneBook)
    var reviewable = {}
   //var counter = 0
    if (props.tunes) Object.keys(props.tunes).forEach(function(tuneKey) {
      var tune = props.tunes[tuneKey]
      var boost = tune ? tune.boost : 0
      if (boost > 0 && !utils.hasPlayedInLast24Hours(tune.id)) {
        if (!Array.isArray(reviewable[boost]))  reviewable[boost] = []
        if (!props.currentTuneBook || Array.isArray(tune.books) && tune.books.indexOf(props.currentTuneBook) !== -1) {
            reviewable[boost].push(tuneKey)
        }
      }
    })
    Object.keys(reviewable).forEach(function(boost) {
      // randomise from this boost band
      shuffleArray(reviewable[boost])
    })
    var final = []
    var count = 0
    Object.values(reviewable).forEach(function(reviewIds) {
        reviewIds.forEach(function(itemId) {
            //console.log('ff',itemId, props.tunebook.tunes[itemId] )
           final[count] = props.tunes[itemId] 
           count ++
        });
    })
    console.log('gen review items',final)
    setReviewItems(final)
  }
  
  
    useEffect(function() {
        
       //if (!Array.isArray(reviewItems)) {
           //setReviewItems(
           generateReviewList()
           //console.log('caaa INI',currentReviewItem)
       //}
       //setMusicItem(getReviewItemNumber(currentReviewItem))
    },[props.currentTuneBook])
    
    //useEffect(function() {
        //console.log('caaa',currentReviewItem)
        //setMusicItem(getReviewItemNumber(currentReviewItem))
    //},[currentReviewItem])
    
    console.log('rev',getCurrentReviewIndex(), reviewItems) //, currentReviewItem,getReviewItemNumber(currentReviewItem))
    //if (reviewItems && reviewItems.length > 0) {
        
        var tune = reviewItems && reviewItems.length > getCurrentReviewIndex() ? reviewItems[getCurrentReviewIndex()] : {abc:'',title:''}
        return <div className="App-review">
          
           <ReviewNavigationModal reviewItems={reviewItems} currentReviewItem={getCurrentReviewIndex()} tunebook={props.tunebook} />
           <Link to={'/editor/'+tune.id}><Button className='btn-secondary' style={{float:'left'}} >{props.tunebook.icons.pencil}</Button></Link>
           <span style={{float:'left'}}><BoostSettingsModal tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} /></span  >
           <div style={{ float:'left',backgroundColor: '#3f81e3', borderRadius:'10px' , width: 'fit-content'}}    >
           {props.currentTuneBook ? <Button  onClick={function(e) {props.setCurrentTuneBook(''); props.forceRefresh();  }} >{props.tunebook.icons.closecircle}</Button> : ''}<BookSelectorModal forceRefresh={props.forceRefresh} title={'Select a book to review'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} onChange={function(val) {props.setCurrentTuneBook(val); props.forceRefresh(); }} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button style={{marginLeft:'0.1em', color:'black'}} >Book {(props.currentTuneBook ? <b>{(props.currentTuneBook.length > 15 ? props.currentTuneBook.slice(0,15)+'...' : props.currentTuneBook)}</b> : '')} </Button>} />
           </div>
           
           
           <Abc tunebook={props.tunebook}  abc={props.tunebook.abcTools.json2abc(tune)} tempo={getReviewTempo()} meter={tune.meter}   />
                
            
        </div>
    //} else {
        //return <div><br/>You have seen all your boosted tunes in the last 24 hours. 
        //<br/>
        //Boost more tunes to add them to your list.
        
        //</div>
    //}
}
//audioCallback={audioCallback} tempo={props.tunebook.tempo} milliSecondsPerMeasure={(props.tunebook.abcTools.getMilliSecondsPerMeasure(tune, props.tunebook.tempo))}
