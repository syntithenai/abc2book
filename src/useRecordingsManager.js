import * as localForage from "localforage";
import {useState, useEffect, useRef} from 'react'

export default function useRecordingsManager({recordingTools}) {
  var store = localForage.createInstance({
    name: "recordings"
  });
  
  
    var mediaRecorder = useRef(null)
    let chunks = [];
    
    var outputvolume = 1.0
    let speakerContext = null
    var speakerGainNode = null;
    var bufferSource = null;
    var audio = useRef(null)
    

 //console.log('userecman',recordingTools)  
  function generateObjectId(otherId) {
      var timestamp = otherId ? otherId.toString(16) : (new Date().getTime() / 1000 | 0).toString(16);
      
      return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function() {
          return (Math.random() * 16 | 0).toString(16);
      }).toLowerCase();
  }
  
  async function loadRecording(recordingId) {
    //console.log('load',recordingId)
    return new Promise(function(resolve,reject) {
      store.getItem(recordingId).then(function (value) {
        //return localForage.getItem(recordingId);
        //console.log('lfok',value)
        resolve(value)
      }).catch(function (err) {
        console.log('lferr',err)
        // we got an error
        resolve(null)
      })
    })
  }
  
  function newRecording(title) {
    return new Promise(function(resolve,reject) {
      var recording = {}
      recording.title = title
      recording.id = generateObjectId()
      recording.createdTimestamp = new Date().getTime()
      store.setItem(recording.id, recording).then(function (item) {
        if (recordingTools && recordingTools.createRecording) {
          recordingTools.createRecording(recording).then(function(newId) {
            recording.googleId = newId
            store.setItem(recording.id, recording).then(function (item) {
              resolve(recording)
            })
          })
        } else {
          resolve(null)
        }
        
      }).catch(function (err) {
        console.log('serr',err)
        // we got an error
        resolve(null)
      });
    })
  }
  function updateRecordingTitle(recording) {
    return new Promise(function(resolve,reject) {
      console.log('uprectit',recording)
      if (recording && recording.id && recording.title) {
        recording.createdTimestamp = new Date().getTime()
        store.setItem(recording.id, recording).then(function (item) {
          console.log('uprectit into store',recording)
          if (recordingTools && recordingTools.updateRecordingTitle) {
            if (recording.googleId) {
              console.log('uprectit have google id',recording)
              recordingTools.updateRecordingTitle(recording).then(function(newId) {
                console.log('uprectit done online')
                resolve()
              })
            } else {
              resolve()
            }
          } else {
            resolve()
          }
          //return recording;
        }).catch(function (err) {
          console.log('serr',err)
          resolve()
          // we got an error
        });
      } else {
        resolve()
      }
    })
  }
  async function saveRecording(recording) {
    if (recording) {
      if (!recording.id)  {
        recording.id = generateObjectId()
      }
      recording.createdTimestamp = new Date().getTime()
      store.setItem(recording.id, recording).then(function (item) {
        if (recordingTools && recordingTools.createRecording && recordingTools.updateRecording) {
          if (!recording.googleId) {
            recordingTools.createRecording(recording).then(function(newId) {
              recording.googleId = newId
              store.setItem(recording.id, recording).then(function (item) {
                return recording;
              })
            })
          } else {
            recordingTools.updateRecording(recording.googleId, recording.data)
          }
        }
        return recording;
      }).catch(function (err) {
        console.log('serr',err)
        // we got an error
      });
    }
  }
  async function deleteRecording(recording) {
    if (window.confirm('Really delete this recording?')) {
        store.removeItem(recording.id).then(function (item) {
          if (recordingTools && recordingTools.deleteRecording) {
            recordingTools.deleteRecording(recording.googleId)
          }
          return item;
        })
    }
  }
  
  
  function listRecordings() {
    //console.log('list');
    return new Promise(function(resolve,reject) {
      //resolve([
        //{id:'234234', title:'test1', data: [], tuneId: '22222', createdTimestamp : new Date().getTime()},
        //{id:'33234234', title:'test2', data: [], tuneId: '22223', createdTimestamp : new Date().getTime() + 368988}
      //])
      var final = []
      store.iterate(function(value, key, iterationNumber) {
          //console.log([key, value]);
          if (value) {
            value.bitLength = value.data ? value.data.size : 0
            delete value.data  // don't return data with list
            final.push(value)
          }
      }).then(function() {
          //console.log('list all has completed', final);
          resolve(final)
      }).catch(function(err) {
          // This code runs if there were any errors
          console.log(err);
          reject()
      })
    })
  }
  
  function listRecordingsByTuneId(tuneId) {
    //console.log('list id',tuneId);
    return new Promise(function(resolve,reject) {
      var final = []
      store.iterate(function(value, key, iterationNumber) {
          //console.log([key, value]);
          if (value && value.tuneId && value.tuneId === tuneId) {
            value.bitLength = value.data ? value.data.size : 0
            delete value.data  // don't return data with list
            final.push(value)
          }
      }).then(function() {
          //console.log('search tuneid has completed', final);
          resolve(final)
      }).catch(function(err) {
          // This code runs if there were any errors
          console.log(err);
          reject()
      });
    })
  }
  
  function searchRecordingsByTitle(title) {
    //console.log('list searc',title);
    return new Promise(function(resolve,reject) {
      var final = []
      store.iterate(function(value, key, iterationNumber) {
          //console.log([key, value]);
          if (value && value.title && value.title === title) {
             value.bitLength = value.data ? value.data.size : 0
             delete value.data  // don't return data with list
             final.push(value)
          }
      }).then(function() {
          //console.log('search name has completed', final);
          resolve(final)
      }).catch(function(err) {
          // This code runs if there were any errors
          console.log(err);
          reject()
      });
    })
  }
 
    function stopRecording() {
      return new Promise(function(resolve,reject) {
        if (mediaRecorder.current) mediaRecorder.current.stop();
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
              const blob = new Blob(chunks, { 'type' : 'audio/ogg; codecs=opus' });
              chunks = [];
              if (tune && tune.id) {
                saveRecording({data: blob, title: tune.name, tuneId: tune.id}).then(function() {
                })
              }
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
        loadRecording(recordingId).then(function(rec) {
            //console.log('play',rec, rec.data)
            //if (rec) {
              var url = window.URL.createObjectURL(rec.data) //rec.data);
              audio.current = new Audio(url);
              audio.current.onended = onEnded
              audio.current.play();
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
        //if (blob == null) {
          //console.log('noblob')
            //return;
        //}
        
         //var url = URL.createObjectURL(blob);

        //var a = document.createElement("a");
        //document.body.appendChild(a);
        //a.style = "display: none";
        //a.href = url;
        //a.download = "sample.wav";
        //a.click();
        //window.URL.revokeObjectURL(url);
        
        
      loadRecording(recordingId).then(function(rec) {
        console.log('DL',rec, rec.data)
       
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

  
  return {loadRecording, saveRecording,newRecording,  deleteRecording, listRecordings, listRecordingsByTuneId, searchRecordingsByTitle, startRecording, stopRecording, playRecording,stopPlayRecording,  downloadRecording, updateRecordingTitle}
  
}
