import {Button} from 'react-bootstrap'

export default function AbcPlayButton({started, ready, isPlaying, clickInit, clickPlay, clickStopPlaying, tunebook}) {
    //console.log('button',tunebook)
    if (!started) {
      return  <Button  className='btn-secondary' size="lg"  style={{float:'right'}} onClick={function(e) { e.stopPropagation();  clickInit(e)}}  >
        {tunebook.icons.start}
      </Button>
             
    } else {
        if (!ready) {
          if (!isPlaying) {
            return <Button  className='btn-secondary' size="lg"  style={{float:'right'}}   >
              {tunebook.icons.timer}
              {tunebook.icons.start}
            </Button>
          } else {
            return <Button className='btn-secondary' size="lg" style={{float:'right'}} onClick={clickStopPlaying} >
              {tunebook.icons.timer}
              {tunebook.icons.stop}
            </Button>
          }
        } else {
          if (!isPlaying) {
            return <Button  className='btn-success' size="lg" style={{float:'right'}} onClick={function(e) {clickPlay() }} >
              {tunebook.icons.start}
            </Button>
          } else {
            return <Button className='btn-danger' size="lg"  style={{float:'right'}} onClick={clickStopPlaying} >
              {tunebook.icons.stop}
            </Button>
          }
        }
    }
  }
