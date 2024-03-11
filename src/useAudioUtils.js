import {useState, useEffect, useRef} from 'react'

export default function useAudioUtils() {

	var mediaRecorder = useRef(null)
	let chunks = [];

	var outputvolume = 1.0
	let speakerContext = null
	var speakerGainNode = null;
	var bufferSource = null;
	var audio = useRef(null)
	const [isRecording, setIsRecording] = useState(false)
	const [isPlaying, setIsPlaying] = useState(false)
	
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
	
	function onPlayEnded() {
		setIsPlaying(false)
	}
    
   
    
    function startRecording(tune, timeout=0) { 
		//console.log('start recprdomg')
      return new Promise(function(resolve,reject) {
        if (navigator.mediaDevices.getUserMedia) {
          const constraints = { audio: true };
          navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
			setIsRecording(true)
			mediaRecorder.current = new MediaRecorder(stream);
            mediaRecorder.current.onstop = function(e) {
				console.log('stop recprdomg',chunks)
				setIsRecording(false)
				const blob = new Blob(chunks, { 'type' : 'audio/wav' });
				chunks = [];
				resolve(blob)
            }
            mediaRecorder.current.start();
            mediaRecorder.current.ondataavailable = function(e) {
				if (e.data.size > 0) {
				  chunks.push(e.data);
				}
            }
            if (timeout > 0) setTimeout(function() {
				stopRecording()
			}, timeout);
            //resolve()
            
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
   
	function playRecording(data) {
		var url = window.URL.createObjectURL(data) //rec.data) //rec.data);
		audio.current = new Audio(url);
		audio.current.onended = onPlayEnded
		setIsPlaying(true)
		audio.current.play();
	}
    
    
    function stopPlayRecording() {
      //console.log('stop play rec',audio.current)
      setIsPlaying(false)
      if (audio.current) {
        audio.current.pause()
        audio.currentTime = 0;
      }
    }

	function downloadRecording (data, fileName) {
		var url = URL.createObjectURL(data) //rec.data);
		var a = document.createElement("a");
		document.body.appendChild(a);
		a.style = "display: none";
		a.href = url;
		a.download = fileName ? fileName : "sample.wav";
		a.click();
		window.URL.revokeObjectURL(url);
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

  
  return {startRecording, stopRecording, playRecording, stopPlayRecording,  downloadRecording, isRecording, isPlaying}
  
}
