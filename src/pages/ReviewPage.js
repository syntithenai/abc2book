import {Link , useParams , useNavigate} from 'react-router-dom'
import {Button, ButtonGroup, ListGroup} from 'react-bootstrap'
import {useEffect, useState} from 'react'
import useUtils from '../useUtils'
import BoostSettingsModal from '../components/BoostSettingsModal'
import ReviewNavigationModal from '../components/ReviewNavigationModal'
import Abc from '../components/Abc'
import BookSelectorModal from '../components/BookSelectorModal'
import {useSwipeable} from 'react-swipeable'

export default function ReviewPage(props) {
  var utils = useUtils()  
  let params = useParams()
  let navigate = useNavigate()
  const [reviewItems, setReviewItems] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  let [isWaiting, setIsWaiting] = useState(false)
  var [ready, setReady] = useState(false)
  let [seekTo, setSeekTo] = useState(false)
  const [playCount, setPlayCount] = useState(0)
  const handlers = useSwipeable({
      onSwipedRight: (eventData) => {
          navigate('/review/'+props.tunebook.utils.nextNumber(getCurrentReviewIndex(), (reviewItems ? reviewItems.length : 1)))
      },
      onSwipedLeft: (eventData) => {
          navigate('/review/'+props.tunebook.utils.previousNumber(getCurrentReviewIndex(), (reviewItems ? reviewItems.length : 1)))
      }
    });  
  //function audioCallback(event) {
        //console.log('cab',event) 
        ////return 
        //if (event ==='ended' || event ==='error' || event === 'stop') {
            //setIsPlaying(false)
            //setIsWaiting(false)
        //} else if (event === 'started') {
            //setIsWaiting(false)
        //} else if (event === 'ready') {
            //setReady(true)
        //} 
    //}
  
function getReviewWarp(tune) {
      //console.log('RT',tune)
      var final = 100
      if (tune) {
        var boost = tune.boost > 0 ? tune.boost : 0
        var useBoost = boost > 20 ? 20 : boost
        var boostPercent = 1 + ((useBoost - 15)/30)
        //console.log('RT',boostPercent)
        return parseInt(boostPercent*100)/100
      } else {
          //console.log('RT def 1')
          return 1
      }
      
  } 
  
  function getReviewTempo(tune) {
      //console.log('RT',tune)
      var final = 100
      if (tune) {
        var boost = tune.boost > 0 ? tune.boost : 0
        var useBoost = boost > 20 ? 20 : boost
        var boostPercent = 1 + ((useBoost - 15)/30)
        // 15 = tune speed
        // 20 = 50% faster
        // 10 = half speed
        // 5 = quarter speed
        var cleanTempo = props.tunebook.abcTools.cleanTempo(tune.tempo)
        var useTempo = 100 * boostPercent
        if (cleanTempo > 0) {
            useTempo = cleanTempo * boostPercent
        }
        //Math.min(boost,50)
        //var tempo = 30 + useBoost * 5
        //tempo+= 300 // testing
        final = useTempo;
      } else {
        final = 100
      }
      if (final > 200) final = 200
      if (final < 30) final = 30
      //console.log('get review tempo ',boost, useBoost, boostPercent, cleanTempo, useTempo, final)
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
      if (boost > 0) { // && !utils.hasPlayedInLast24Hours(tune.id)) {
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
    //console.log('gen review items',final)
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
    
    function onEnded(progress, start, stop ,seek) {
        //console.log('review ended')
        //props.tunebook.utils.saveLastPlayed(tune.id)
        //tune.boost = (!isNaN(parseInt(tune.boost)))  ? parseInt(tune.boost) + 1 : 1
        //props.tunebook.saveTune(tune)
        navigate('/review/'+props.tunebook.utils.nextNumber(getCurrentReviewIndex(), (reviewItems ? reviewItems.length : 1)))
        //if (playCount < 3) {
            //setPlayCount(playCount + 1)
            //seek(0)
            //start()
        //} else {
            //setPlayCount(playCount + 1)
        //}
    }
    
    //console.log('rev',getCurrentReviewIndex(), reviewItems) //, currentReviewItem,getReviewItemNumber(currentReviewItem))
    //if (reviewItems && reviewItems.length > 0) {
        
    var tune = reviewItems && reviewItems.length > getCurrentReviewIndex() ? reviewItems[getCurrentReviewIndex()] : null
   const [autoStart,setAutoStart] = useState(false)
   //console.log('RR FOUND TUNE', tune , abc)
    if (!tune) {
        return <div>
        
        
        <br/>You have seen all your boosted tunes in the last 24 hours. 
        <br/>
        Boost more tunes to add them to your list or try a a different book.
        <br/>
        <br/>
          <ButtonGroup variant="primary" style={{ marginLeft:'1em',float:'left', width: 'fit-content'}}    >
              {props.currentTuneBook ?<Button  onClick={function(e) {props.setCurrentTuneBook(''); props.forceRefresh();  }} >{props.tunebook.icons.closecircle}</Button>
              : ''}
              <BookSelectorModal forceRefresh={props.forceRefresh} title={'Select a book to review'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} onChange={function(val) {props.setCurrentTuneBook(val); props.forceRefresh(); }} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button style={{marginLeft:'0.1em', color:'black'}} >{props.tunebook.icons.book} {(props.currentTuneBook ? <b>{(props.currentTuneBook.length > 15 ? props.currentTuneBook.slice(0,15)+'...' : props.currentTuneBook)}</b> : '')} </Button>} />
            </ButtonGroup>
        </div>
    } else  {
        var abc = props.tunebook.abcTools.json2abc(tune)
        return <div className="App-review">
          
           <ReviewNavigationModal reviewItems={reviewItems} currentReviewItem={getCurrentReviewIndex()} tunebook={props.tunebook} />
           <Link to={'/editor/'+tune.id}><Button  variant="warning" style={{float:'left'}} >{props.tunebook.icons.pencil}</Button></Link>
           <span style={{float:'left'}}><BoostSettingsModal tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} /></span  >
           
           <ButtonGroup variant="primary" style={{ marginLeft:'1em',float:'left', width: 'fit-content'}}    >
           {props.currentTuneBook ? 
                <Button  onClick={function(e) {props.setCurrentTuneBook(''); props.forceRefresh();  }} >{props.tunebook.icons.closecircle}</Button>
            : ''}
            <BookSelectorModal forceRefresh={props.forceRefresh} title={'Select a book to review'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} onChange={function(val) {props.setCurrentTuneBook(val); props.forceRefresh(); }} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button style={{marginLeft:'0.1em', color:'black'}} >{props.tunebook.icons.book} {(props.currentTuneBook ? <b>{(props.currentTuneBook.length > 15 ? props.currentTuneBook.slice(0,15)+'...' : props.currentTuneBook)}</b> : '')} </Button>} />
           </ButtonGroup>
           
           <div {...handlers} >
           <Abc autoPrime={true} autoScroll={true} metronomeCountIn={true} speakTitle={true} repeat={tune.repeats} autoStart={autoStart} tunebook={props.tunebook}  abc={abc} tempo={tune.tempo} warp={getReviewWarp(tune)} meter={tune.meter} onStopped={function() { setAutoStart(false)}} onStarted={function() { setAutoStart(true)}}  onEnded={onEnded} />
            </div>
        </div>
    }
    //} else {
        
    //}
}
//getReviewTempo(tune)

//audioCallback={audioCallback} tempo={props.tunebook.tempo} milliSecondsPerMeasure={(props.tunebook.abcTools.getMilliSecondsPerMeasure(tune, props.tunebook.tempo))}
    
