//import InlineWorker from "inline-worker";
//import mp3worker from './mp3encodingworker'
//import lamejs from 'lamejs'

export default function MP3Converter(config) {
  
      
      
    function audioBufferToWav(aBuffer) {
        let numOfChan = aBuffer.numberOfChannels,
            btwLength = aBuffer.length * numOfChan * 2 + 44,
            btwArrBuff = new ArrayBuffer(btwLength),
            btwView = new DataView(btwArrBuff),
            btwChnls = [],
            btwIndex,
            btwSample,
            btwOffset = 0,
            btwPos = 0;
        setUint32(0x46464952); // "RIFF"
        setUint32(btwLength - 8); // file length - 8
        setUint32(0x45564157); // "WAVE"
        setUint32(0x20746d66); // "fmt " chunk
        setUint32(16); // length = 16
        setUint16(1); // PCM (uncompressed)
        setUint16(numOfChan);
        setUint32(aBuffer.sampleRate);
        setUint32(aBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 2); // block-align
        setUint16(16); // 16-bit
        setUint32(0x61746164); // "data" - chunk
        setUint32(btwLength - btwPos - 4); // chunk length

        for (btwIndex = 0; btwIndex < aBuffer.numberOfChannels; btwIndex++)
            btwChnls.push(aBuffer.getChannelData(btwIndex));

        while (btwPos < btwLength) {
            for (btwIndex = 0; btwIndex < numOfChan; btwIndex++) {
                // interleave btwChnls
                btwSample = Math.max(-1, Math.min(1, btwChnls[btwIndex][btwOffset])); // clamp
                btwSample = (0.5 + btwSample < 0 ? btwSample * 32768 : btwSample * 32767) | 0; // scale to 16-bit signed int
                btwView.setInt16(btwPos, btwSample, true); // write 16-bit sample
                btwPos += 2;
            }
            btwOffset++; // next source sample
        }

        let wavHdr = window.lamejs.WavHeader.readHeader(new DataView(btwArrBuff));
        let wavSamples = new Int16Array(btwArrBuff, wavHdr.dataOffset, wavHdr.dataLen / 2);

        return wavToMp3(wavHdr, wavSamples);

        function setUint16(data) {
            btwView.setUint16(btwPos, data, true);
            btwPos += 2;
        }

        function setUint32(data) {
            btwView.setUint32(btwPos, data, true);
            btwPos += 4;
        }
    }

    function wavToMp3(wav, samples) {
        var buffer = [];
        var channels = wav.channels
        var sampleRate = wav.sampleRate
        var mp3enc = new window.lamejs.Mp3Encoder(1, sampleRate, 128);
        var remaining = samples.length;
        var samplesPerFrame = 1152;
        var mp3Encoder, maxSamples = 1152, samplesLeft, config, dataBuffer, samplesRight;
        //var wav = window.lamejs.WavHeader.readHeader(samples);
        //console.log('wave:', wav);
        //var wav = {dataOffset:0, dataLen: samples.length/channels}
        
        var dataView = new Int16Array(samples, wav.dataOffset, wav.dataLen / 2);
        samplesLeft = wav.channels === 1 ? dataView : new Int16Array(wav.dataLen / (2 * wav.channels));
        samplesRight = wav.channels === 2 ? new Int16Array(wav.dataLen / (2 * wav.channels)) : undefined;
        if (wav.channels > 1) {
          for (var i = 0; i < samplesLeft.length; i++) {
            samplesLeft[i] = dataView[i * 2];
            samplesRight[i] = dataView[i * 2 + 1];
          }
        }
        
        //console.log('wav2mp3',channels,sampleRate,samples,remaining,mp3enc,samplesLeft,samplesRight)
        for (var i = 0; remaining >= samplesPerFrame; i += samplesPerFrame) {
            //var mono = samples.subarray(i, i + samplesPerFrame);
            var leftChunk = samplesLeft.subarray(i, i + samplesPerFrame);
            var rightChunk = samplesRight ? samplesRight.subarray(i, i + samplesPerFrame) : null
            //var mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
            
            //console.log("mono",mono)
            //if (mono) {
              try {
                var mp3buf = mp3enc.encodeBuffer(leftChunk,rightChunk);
                if (mp3buf.length > 0) {
                    buffer.push(new Int8Array(mp3buf));
                }
              } catch (e) {
                console.log(e)
              }
            //}
            remaining -= samplesPerFrame;
        }
        var d = mp3enc.flush();
        if(d.length > 0){
            buffer.push(new Int8Array(d));
        }

        var mp3Blob = new Blob(buffer, {type: 'audio/mp3'});
        //console.log('mp3blob',mp3Blob)
        return mp3Blob
        //var bUrl = window.URL.createObjectURL(mp3Blob);

        //// send the download link to the console
        //console.log('mp3 download:', bUrl);

    }

  
  
  
    config = config || {};
    var busy = false;
    //var mp3Worker = new InlineWorker(mp3worker) //
    var mp3Worker = new Worker('/mp3encodingworker.js');

    this.isBusy = function () {
      return busy
    };

    this.convert = function (blob) {
      var conversionId = 'conversion_' + Date.now(),
        tag = conversionId + ":"
        ;
      var opts = [];
      for(var i=1; i < arguments.length;i++){
        opts.push(arguments[i]);
      }
      //console.log(tag, 'Starting conversion');
      var preferredConfig = {}, onSuccess, onProgress, onError;
      if (typeof opts[0] == 'object') {
          preferredConfig = opts.shift();
      }
 

      onSuccess = opts.shift();
      onProgress = opts.shift();
      onError = opts.shift();

      if (busy) {
        throw ("Another conversion is in progress");
      }

      var initialSize = blob.size,
        fileReader = new FileReader(),
        startTime = Date.now();

      fileReader.onload = function (e) {
        //console.log(tag, "Passed to BG process",e.target.result,preferredConfig);
        mp3Worker.postMessage({
          cmd: 'init',
          config: preferredConfig
        });
        
        mp3Worker.postMessage({cmd: 'encode', rawInput: e.target.result});
        mp3Worker.postMessage({cmd: 'finish'});

        mp3Worker.onmessage = function (e) {
          if (e.data.cmd == 'end') {
            //console.log(tag, "Done converting to Mp3");
            var mp3Blob = new Blob(e.data.buf, {type: 'audio/mp3'});
            //console.log(tag, "Conversion completed in: " + ((Date.now() - startTime) / 1000) + 's');
            var finalSize = mp3Blob.size;
            //console.log(tag +
              //"Initial size: = " + initialSize + ", " +
              //"Final size = " + finalSize
              //+ ", Reduction: " + Number((100 * (initialSize - finalSize) / initialSize)).toPrecision(4) + "%");

            busy = false;

            if(onProgress && typeof onProgress=='function'){
              onProgress(1);
            }

            if (onSuccess && typeof onSuccess === 'function') {
              onSuccess(mp3Blob);
            }
          } else if(e.data.cmd == 'progress'){
            //post progress
            if(onProgress && typeof onProgress=='function'){
              onProgress(e.data.progress);
            }
          } else if(e.data.cmd == 'error'){

          }
        };
      };
      busy = true;
      fileReader.readAsArrayBuffer(blob);
    }
    
  

    this.convertAudioBuffer = function(aBuffer) {
      return new Promise(function(resolve,reject) {
        var converted = audioBufferToWav(aBuffer)
        //console.log('convertAudioBuffer',converted)
        resolve(converted)
      })
        //console.log('convertAudioBuffer',aBuffer)
         
        //let numOfChan = aBuffer.numberOfChannels,
            //btwLength = aBuffer.length * numOfChan * 2 + 44,
            //btwArrBuff = new ArrayBuffer(btwLength),
            //btwView = new DataView(btwArrBuff),
            //btwChnls = [],
            //btwIndex,
            //btwSample,
            //btwOffset = 0,
            //btwPos = 0;
        
        //function setUint16(data) {
            //btwView.setUint16(btwPos, data, true);
            //btwPos += 2;
        //}

        //function setUint32(data) {
            //btwView.setUint32(btwPos, data, true);
            //btwPos += 4;
        //}

        ////function wavToMp3(channels, sampleRate, samples) {
            ////var buffer = [];
            ////var mp3enc = new lamejs.Mp3Encoder(channels, sampleRate, 128);
            ////var remaining = samples.length;
            ////var samplesPerFrame = 1152;
            ////for (var i = 0; remaining >= samplesPerFrame; i += samplesPerFrame) {
                ////var mono = samples.subarray(i, i + samplesPerFrame);
                ////var mp3buf = mp3enc.encodeBuffer(mono);
                ////if (mp3buf.length > 0) {
                    ////buffer.push(new Int8Array(mp3buf));
                ////}
                ////remaining -= samplesPerFrame;
            ////}
            ////var d = mp3enc.flush();
            ////if(d.length > 0){
                ////buffer.push(new Int8Array(d));
            ////}

            ////var mp3Blob = new Blob(buffer, {type: 'audio/mp3'});
            ////return mp3Blob
            
            //////var bUrl = window.URL.createObjectURL(mp3Blob);

            //////// send the download link to the console
            //////console.log('mp3 download:', bUrl);

        ////}
       
        //setUint32(0x46464952); // "RIFF"
        //setUint32(btwLength - 8); // file length - 8
        //setUint32(0x45564157); // "WAVE"
        //setUint32(0x20746d66); // "fmt " chunk
        //setUint32(16); // length = 16
        //setUint16(1); // PCM (uncompressed)
        //setUint16(numOfChan);
        //setUint32(aBuffer.sampleRate);
        //setUint32(aBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        //setUint16(numOfChan * 2); // block-align
        //setUint16(16); // 16-bit
        //setUint32(0x61746164); // "data" - chunk
        //setUint32(btwLength - btwPos - 4); // chunk length

        //for (btwIndex = 0; btwIndex < aBuffer.numberOfChannels; btwIndex++)
            //btwChnls.push(aBuffer.getChannelData(btwIndex));

        //while (btwPos < btwLength) {
            //for (btwIndex = 0; btwIndex < numOfChan; btwIndex++) {
                //// interleave btwChnls
                //btwSample = Math.max(-1, Math.min(1, btwChnls[btwIndex][btwOffset])); // clamp
                //btwSample = (0.5 + btwSample < 0 ? btwSample * 32768 : btwSample * 32767) | 0; // scale to 16-bit signed int
                //btwView.setInt16(btwPos, btwSample, true); // write 16-bit sample
                //btwPos += 2;
            //}
            //btwOffset++; // next source sample
        //}

        //let wavHdr = window.lamejs.WavHeader.readHeader(new DataView(btwArrBuff));
        //let wavSamples = new Int16Array(btwArrBuff, wavHdr.dataOffset, wavHdr.dataLen / 2);
        //console.log('wavsamples',wavHdr,wavSamples)
        //return this.convert(new Blob(wavSamples,{type:'audio/wav'}))
        ////return wavToMp3(wavHdr.channels, wavHdr.sampleRate, wavSamples);

    }
};
