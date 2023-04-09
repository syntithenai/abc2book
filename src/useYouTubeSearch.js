import axios from 'axios'



function useYouTubeSearch() {
    
    function searchYouTube(query) {
      //axios.get('https://youtube.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=' + query + '&key='+process.env.REACT_APP_GOOGLE_API_KEY).then(function(res) {
         //console.log(res) 
          
      //})
      var results = []
      data['items'].forEach(function(item) {
          //console.log(item)
          if (item.id && item.id.kind === "youtube#video") {
            results.push(
                {
                    id: item.id.videoId, 
                    title: item.snippet.title, 
                    description: item.snippet.description, 
                    image: item.snippet.thumbnails['default']
                }
            )
          }
      })
      //console.log(results)
      return results
    }
  
  return {searchYouTube}
}
export default useYouTubeSearch
