var useUtils = () => {
    /**
     *  Load a local storage key and parse it as JSON 
     *  @return {}
     */
    function loadLocalObject(localStorageKey) {
      var dataText = localStorage.getItem(localStorageKey)
      var data = {}
      try {
        data = JSON.parse(dataText)
      } catch (e) {
        
      }
      if (!data) {
        data = {}
      }
      return data
    }

    /**
     * JSONify and save data to local storage
     */
    function saveLocalObject(localStorageKey, data) {
      localStorage.setItem(localStorageKey,JSON.stringify(data))
    }
    
    function toSearchText(text) {
      return text ? text.toLowerCase().trim() : ''
    }
    
        
    function scrollTo(id, offset) {
        var element = document.getElementById(id);
        if (element) {
          var headerOffset = offset ? offset : 10;
          var elementPosition = element.offsetTop;
          var offsetPosition = elementPosition - headerOffset;
          document.documentElement.scrollTop = offsetPosition;
          document.body.scrollTop = offsetPosition; // For Safari
        }
    }

        
    function generateObjectId(otherId) {
        var timestamp = otherId ? otherId.toString(16) : (new Date().getTime() / 1000 | 0).toString(16);
        
        return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function() {
            return (Math.random() * 16 | 0).toString(16);
        }).toLowerCase();
    }

    return {loadLocalObject, saveLocalObject, toSearchText, scrollTo, generateObjectId}
}
export default useUtils;
