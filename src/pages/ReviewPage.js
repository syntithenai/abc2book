import {Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {useEffect, useState} from 'react'

function shuffleArray(array) {
  let currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {

    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}

function hasPlayedInLast24Hours(tuneId) {
  var lastPlayeds =  {}
  try {
      lastPlayeds = JSON.parse(localStorage.getItem('bookstorage_lastplayed'))
  } catch (e) {}
  
  var now = new Date().getTime()
  if (lastPlayeds && lastPlayeds[tuneId] && now - lastPlayeds[tuneId] < 86400000) {
    return true
  } else {
    return false
  }
}

function saveLastPlayed(tuneId) {
var lastPlayeds =  {}
  try {
      lastPlayeds = JSON.parse(localStorage.getItem('bookstorage_lastplayed'))
  } catch (e) {}
  if (!lastPlayeds) lastPlayeds = {}
  lastPlayeds[tuneId] = new Date().getTime()
  localStorage.setItem('bookstorage_lastplayed',JSON.stringify(lastPlayeds))
}

export default function ReviewPage(props) {
    const [reviewList, setReviewList] = useState([])
    const [currentItem, setCurrentItem] = useState(0)
    useEffect(function() {
        
    })
    var reviewable = {}
   //var counter = 0
    Object.keys(props.tunebook.tunes).forEach(function(tuneKey) {
      var tune = props.tunebook.tunes[tuneKey]
      var boost = tune ? tune.boost : 0
      if (boost > 0 && !hasPlayedInLast24Hours(tune.id)) {
        if (!Array.isArray(reviewable[boost]))  reviewable[boost] = []
        reviewable[boost].push(tuneKey)
      }
    })
    Object.keys(reviewable).forEach(function(boost) {
      // randomise from this boost band
      shuffleArray(reviewable[boost])
    })
    console.log('rev',reviewable)
    return <div className="App-review">
    review
        {props.children}
    </div>
}
