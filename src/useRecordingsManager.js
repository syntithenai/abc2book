import * as localForage from "localforage";
import {useState, useEffect, useRef} from 'react'
import useGoogleDocument from './useGoogleDocument'
import useUtils from './useUtils'
import MP3Converter from './MP3Converter'
//import useFileManager from './useFileManager'
export default function useRecordingsManager(token, logout, fileManager) {
  //var store = localForage.createInstance({
    //name: "recordings"
  //});
  //var fileManager = useFileManager('recordings',token,logout)
    //console.log('rec man ',token)
  //var docs = useGoogleDocument(token, logout)
  var utils = useUtils()
  var mediaRecorder = useRef(null)
  let chunks = [];
  
  var outputvolume = 1.0
  let speakerContext = null
  var speakerGainNode = null;
  var bufferSource = null;
  var audio = useRef(null)
    

  async function loadRecording(recordingId) {
    console.log('load',recordingId)
    var file = await fileManager.load(recordingId)
    console.log('load',file)
    
    return  file
        //return new Promise(function(resolve,reject) {
      //store.getItem(recordingId).then(function (value) {
        ////return localForage.getItem(recordingId);
        ////console.log('lfok',value)
        //resolve(value)
      //}).catch(function (err) {
        //console.log('lferr',err)
        //// we got an error
        //resolve(null)
      //})
    //})
  }
  
  //function newRecording(title, audioData) {
    //return new Promise(function(resolve,reject) {
      //var recording = {}
      //recording.title = title
      //recording.id = utils.generateObjectId()
      //recording.data = audioData
      //recording.createdTimestamp = new Date().getTime()
      //store.setItem(recording.id, recording).then(function (item) {
        //docs.createDocument(title, audioData,'audio/wav','Audio recording from Abc2Book').then(function(newId) {
          //recording.googleId = newId
          //store.setItem(recording.id, recording).then(function (item) {
            //resolve(recording)
          //})
        //})
      //}).catch(function (err) {
        //console.log('serr',err)
        //// we got an error
        //resolve(null)
      //});
    //})
  //}
  //function updateRecordingTitle(recording) {
    //return new Promise(function(resolve,reject) {
      ////console.log('uprectit',recording)
      //if (recording && recording.id && recording.title) {
        //recording.createdTimestamp = new Date().getTime()
        //store.setItem(recording.id, recording).then(function (item) {
          ////console.log('uprectit into store',recording)
          //if (recording.googleId) {
            ////console.log('uprectit have google id',recording)
            //docs.updateDocument(recording.googleId,{name: recording.title}).then(function(newId) {
              ////console.log('uprectit done online')
              //resolve()
            //})
          //} else {
            //resolve()
          //}
        //}).catch(function (err) {
          //console.log('serr',err)
          //resolve()
          //// we got an error
        //});
      //} else {
        //resolve()
      //}
    //})
  //}
  
	function saveRecording(recording) {
		return new Promise(function(resolve,reject) {
			fileManager.save(recording).then(function(r) {
				resolve(r)
			})
		})
	  
	}
	
    //return new Promise(function(resolve,reject) {
      ////console.log('AAAsave rec',recording,"dd", token,"dd")
      //if (recording) {
        
        //if (!recording.id)  {
          //recording.id = utils.generateObjectId() 
        //}
        //recording.createdTimestamp = new Date().getTime()
        ////console.log('AAAsave 2rec',recording)
        //store.setItem(recording.id, recording).then(function (item) {
          ////console.log('AAAsave rec set',recording)
          //if (token) {
            //if (!recording.googleId) {
              ////console.log('AAAsave noid so create',recording)
              //docs.createDocument(recording.title, recording.data,'audio/wav','Audio recording from Abc2Book').then(function(newId) {
                //recording.googleId = newId
                ////console.log('created doc',recording.googleId,"REC",recording, "gooRES",newId)
                //store.setItem(recording.id, recording).then(function (item) {
                  //resolve(recording)
                //})
              //}).catch(function(err) {
                ////console.log('failed created online doc')
                //store.setItem(recording.id, recording).then(function (item) {
                  //resolve(recording)
                //})
              //})
            //} else {
              ////console.log('update doc',recording.googleId,recording.data,recording)
              //docs.updateDocumentData(recording.googleId, recording.data).then(function(result) {
                ////console.log('updated doc',recording.googleId,recording,result)
                //resolve(recording)
              //})
            //}
          //}
        //}).catch(function (err) {
          //console.log('serr',err)
          //resolve(recording)
          //// we got an error
        //});
      //} else {
        //resolve(recording)
      //}
    //})
  //}
  //async function deleteRecording(recording) {
    //if (window.confirm('Really delete this recording?')) {
        //store.removeItem(recording.id).then(function (item) {
          //docs.deleteDocument(recording.googleId)
          //return item;
        //})
    //}
  //}

  
  //function listRecordings() {
    ////console.log('list');
    //return new Promise(function(resolve,reject) {
      ////resolve([
        ////{id:'234234', title:'test1', data: [], tuneId: '22222', createdTimestamp : new Date().getTime()},
        ////{id:'33234234', title:'test2', data: [], tuneId: '22223', createdTimestamp : new Date().getTime() + 368988}
      ////])
      //var final = []
      //store.iterate(function(value, key, iterationNumber) {
          ////console.log([key, value]);
          //if (value) {
            //value.bitLength = value.data ? value.data.size : 0
            //delete value.data  // don't return data with list
            //final.push(value)
          //}
      //}).then(function() {
          ////console.log('list all has completed', final);
          //resolve(final)
      //}).catch(function(err) {
          //// This code runs if there were any errors
          //console.log(err);
          //reject()
      //})
    //})
  //}
  
  //function listRecordingsByTuneId(tuneId) {
    ////console.log('list id',tuneId);
    //return new Promise(function(resolve,reject) {
      //var final = []
      //store.iterate(function(value, key, iterationNumber) {
          ////console.log([key, value]);
          //if (value && value.tuneId && value.tuneId === tuneId) {
            //value.bitLength = value.data ? value.data.size : 0
            //delete value.data  // don't return data with list
            //final.push(value)
          //}
      //}).then(function() {
          ////console.log('search tuneid has completed', final);
          //resolve(final)
      //}).catch(function(err) {
          //// This code runs if there were any errors
          //console.log(err);
          //reject()
      //});
    //})
  //}
  
  //function searchRecordingsByTitle(title) {
    ////console.log('list searc',title);
    //return new Promise(function(resolve,reject) {
      //var final = []
      //store.iterate(function(value, key, iterationNumber) {
          ////console.log([key, value]);
          //if (value && value.title && value.title === title) {
             //value.bitLength = value.data ? value.data.size : 0
             //delete value.data  // don't return data with list
             //final.push(value)
          //}
      //}).then(function() {
          ////console.log('search name has completed', final);
          //resolve(final)
      //}).catch(function(err) {
          //// This code runs if there were any errors
          //console.log(err);
          //reject()
      //});
    //})
  //}
 
    function stopRecording() {
      return new Promise(function(resolve,reject) {
        try {
          if (mediaRecorder.current) mediaRecorder.current.stop();
        } catch (e) {
          console.log(e)
        }
        resolve()
      })
    }
    
    function startRecording(tune) { 
      return new Promise(function(resolve,reject) {
        if (navigator.mediaDevices.getUserMedia) {
          const constraints = { audio: true };
          navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            mediaRecorder.current = new MediaRecorder(stream);
            mediaRecorder.current.onstop = function(e) {
              const blob = new Blob(chunks, { 'type' : 'audio/wav' });
              chunks = [];
              saveRecording({data: blob, title: tune.name, tuneId: tune.id})
              //if (tune && tune.id) {
                  //if (blob.size > 0) {
                    //var converter = new MP3Converter()
                    //converter.convert(blob, {
                        //bitRate: 96
                    //}, function (blob) {
                        ////log blog
                        //if (blob) {
                          //saveRecording({data: blob, title: tune.name, tuneId: tune.id})
                        //} else {
                          //// fallback to save wav
                          //saveRecording({data: blob, title: tune.name, tuneId: tune.id})
                        //}
                    //}, function (progress) {
                    //});
                  //} else {
                    //// save empty wav data
                    //saveRecording({data: blob, title: tune.name, tuneId: tune.id})
                  //}
              //}
            }
            mediaRecorder.current.start();
            mediaRecorder.current.ondataavailable = function(e) {
              chunks.push(e.data);
            }
            resolve()
            
          }, 
          function(err) {
            console.log('The following error occured: ' + err);
            resolve()
          });

        } else {
           console.log('getUserMedia not supported on your browser!');
           resolve()
        }
      })
    }
   
    function playRecording(recordingId, onEnded) {
      //downloadRecording(recordingId)
        //if (blob == null) {
            //return;
        //}
        
			console.log('play',recordingId)
			loadRecording(recordingId).then(function(rec) {
				console.log('play',rec, rec.data)
				//if (rec) {
				  var url = window.URL.createObjectURL(utils.dataURItoBlob(rec.data, rec.type) ) //rec.data);
				  audio.current = new Audio(url);
				  audio.current.onended = onEnded
				  audio.current.onerror = function(e) {console.log('ddlay error',e);  return false} //e.stopImmediatePropagation(); e.preventDefault();
				  audio.current.play().catch (function(e) {
						console.log('play erroR',e)
				  })
				//}
				//playBytes(rec.data)
			})
    }
    
    
    function stopPlayRecording() {
      //console.log('stop play rec',audio.current)
      if (audio.current) {
        audio.current.pause()
        audio.currentTime = 0;
      }
    }

    function downloadRecording (recordingId) {
      loadRecording(recordingId).then(function(rec) {
        //console.log('DL',rec, rec.data)
       
        var url = URL.createObjectURL(rec.data);

        var a = document.createElement("a");
        document.body.appendChild(a);
        a.style = "display: none";
        a.href = url;
        a.download = "sample.wav";
        a.click();
        window.URL.revokeObjectURL(url);
      })
    }

  function flattenArray(channelBuffer, recordingLength) {
      var result = new Float32Array(recordingLength);
      var offset = 0;
      for (var i = 0; i < channelBuffer.length; i++) {
          var buffer = channelBuffer[i];
          result.set(buffer, offset);
          offset += buffer.length;
      }
      return result;
  }

  function interleave(leftChannel, rightChannel) {
      var length = leftChannel.length + rightChannel.length;
      var result = new Float32Array(length);

      var inputIndex = 0;

      for (var index = 0; index < length;) {
          result[index++] = leftChannel[inputIndex];
          result[index++] = rightChannel[inputIndex];
          inputIndex++;
      }
      return result;
  }

  function writeUTFBytes(view, offset, string) {
      for (var i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
      }
  }

  
  return {startRecording, stopRecording, playRecording,stopPlayRecording,  downloadRecording }
  
}

//loadRecording, saveRecording,newRecording,  deleteRecording, listRecordings, listRecordingsByTuneId, searchRecordingsByTitle, updateRecordingTitle
