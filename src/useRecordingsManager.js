import * as localForage from "localforage";
localForage.setItem('key', 'value').then(function () {
  return localForage.getItem('key');
}).then(function (value) {
  // we got our value
  console.log('lfok')
}).catch(function (err) {
  console.log('lferr',err)
  // we got an error
});

export default function useRecordingsManager() {
  var store = localForage.createInstance({
    name: "recordings"
  });
  
  function generateObjectId(otherId) {
      var timestamp = otherId ? otherId.toString(16) : (new Date().getTime() / 1000 | 0).toString(16);
      
      return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function() {
          return (Math.random() * 16 | 0).toString(16);
      }).toLowerCase();
  }
  
  async function loadRecording(recordingId) {
      store.getItem(recordingId).then(function (item) {
        return localForage.getItem('key');
      }).then(function (value) {
        // we got our value
        console.log('lfok')
      }).catch(function (err) {
        console.log('lferr',err)
        // we got an error
      });
  }
  
  async function saveRecording(recording,tuneId) {
    if (recording) {
      if (!recording.id)  recording.id = generateObjectId()
      store.setItem(recording.id, recording).then(function (item) {
        return recording;
      }).then(function (value) {
        // we got our value
        console.log('lfok')
      }).catch(function (err) {
        console.log('lferr',err)
        // we got an error
      });
    }
  }
  async function deleteRecording(recordingId) {
      store.removeItem(recordingId).then(function (item) {
        return recording;
      })
  }
  
  function startRecording() {}
  function stopRecording() {}
  
  function listRecordings() {
    localforage.keys().then(function(keys) {
        // An array of all the key names.
        console.log(keys);
    }).catch(function(err) {
        // This code runs if there were any errors
        console.log(err);
    });
  }
  
  return {}
  
}
