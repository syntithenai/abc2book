
var midiBuffer = null


function addAudioControls(element, visualObj, songNumber, tune) {
  // PLAYBACK CONTROLS
  //console.log('add audio', searchString)
  var boost = tune.boost > 0 ? tune.boost : 0
  //getMetaValueFromSongline('B',searchString)
  //boost = boost > 0 ? boost : 0
  $("#controls_"+songNumber).remove()
  var startButton = $('<button style="float: right" class="actionbutton activate-audio playbutton" ><svg  role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="button" ><title>Start Playing</title><path fill="none" d="M0 0h24v24H0z"/><path d="M16.394 12L10 7.737v8.526L16.394 12zm2.982.416L8.777 19.482A.5.5 0 0 1 8 19.066V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832z"/></svg></button>')
  startButton.click(function() { 
    $(".activate-audio").show(); 
    $(this).hide(); 
    $(".stop-audio").hide(); 
    $(".stop-audio",$(this).parent()).show(); 
    $("#playallbutton").hide()
    $("#stopplayingallbutton").show()
    playSongNumber(songNumber)
    
    //startPlaying(visualObj)
  })
  var stopButton = $('<button  style="float: right" class="button stopplayingbutton actionbutton stop-audio"  ><svg class="button" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="button" ><title>Stop Playing</title><path fill="none" d="M0 0h24v24H0z"/><path d="M7 7v10h10V7H7zM6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg></button>')
  stopButton.click(function() { 
    $(".playbutton").show(); 
    $("#playallbutton").show()
    $("#stopplayingallbutton").hide()
    $(this).hide(); 
    stopPlaying()
  })

  // SEARCH CONTROLS
  var sc = getSearchCache(songNumber)
  sc = sc ? sc : []
  var ss = getSettings(songNumber)
  ss = ss ? ss : []
  var tune = getTuneFromCache(songNumber)
  var useSetting = tune && tune.useSetting > 0 ? parseInt(tune.useSetting).mod(ss.length) : 0
    
  
  
  
  var findAbcControls = $('<div style="display: inline; margin-right: 0.1em;" ></div>')
  var findAbcButton = $('<button style="display: inline; margin-right: 0.1em;"  id="findabcbutton" ><svg role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="button" ><title>Search for an arrangement</title><path fill="none" d="M0 0h24v24H0z"/><path d="M18.031 16.617l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z"/></svg></button>')
  var findAbcSelector = $(`<div  id="wrong_abc_selector_`+songNumber+`" class="overlay" style="position: relative; top: -40px; min-width: 600px; margin-left: 1em;" >
    <div><label>Search for abc resources</label><form onSubmit ="return false" ><input class="wrong_abc_input" id="wrong_abc_input_`+songNumber+`" value="`+tune.forceTitle+`" type="text" onKeyup="delayedUpdateSearchAbcResults(`+songNumber+`);"   ><svg class='button' style="display: inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="none" d="M0 0h24v24H0z"/><path d="M18.031 16.617l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z"/></svg></form>
    
    </div>
  </div>`)
  var findAbctListWrap = $("<div class='wrong_abc_selector_items_wrap' ></div>")
  var findAbctList = $('<ul class="wrong_abc_selector_items" style="min-width: 600px" class="list-group"   ></ul>')
  //sc.map(function(v) {
    //if (v) {
      //findAbctList.append('<li class="list-group-item abc_selector_option" ><a  href="#" onClick="updateTuneId(' + songNumber + ', ' + v.id + '); return false;" >'+v.name+'</a></li>')
    //}
    //return false
  //})
  findAbctListWrap.append(findAbctList)
  findAbcSelector.append(findAbctListWrap)
  findAbcButton.click(function(e) {
    e.stopPropagation()
    delayedUpdateSearchAbcResults(songNumber,0);
  })
  findAbcSelector.hide()
  findAbcControls.append(findAbcButton)
  findAbcControls.append(findAbcSelector)
  findAbcButton.click(function() {
    findAbcSelector.show()
    return false;
  })
  
  
  
  
  
  
  
  
  var wrongTuneControls = $('<div style="display: inline; margin-right: 0.1em;" ></div>')
  var wrongTuneButton = $('<button id="wrongtunebutton" ><svg role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="button" ><path fill="none" d="M0 0h24v24H0z"/><title>Link to thesession.org</title><path d="M18.364 15.536L16.95 14.12l1.414-1.414a5 5 0 1 0-7.071-7.071L9.879 7.05 8.464 5.636 9.88 4.222a7 7 0 0 1 9.9 9.9l-1.415 1.414zm-2.828 2.828l-1.415 1.414a7 7 0 0 1-9.9-9.9l1.415-1.414L7.05 9.88l-1.414 1.414a5 5 0 1 0 7.071 7.071l1.414-1.414 1.415 1.414zm-.708-10.607l1.415 1.415-7.071 7.07-1.415-1.414 7.071-7.07z"/></svg></button>')
  var wrongTuneSelector = $(`<div  id="wrong_tune_selector_`+songNumber+`" class="overlay" style="position: relative; top: -40px; min-width: 600px; margin-left: 1em;" >
    <div><label>Search thesession.org</label><form onSubmit ="return false" ><input class="wrong_tune_input" id="wrong_tune_input_`+songNumber+`" value="`+tune.forceTitle+`" type="text" onKeyup="delayedUpdateSearchResults(`+songNumber+`);"   ><svg class='button' style="display: inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="none" d="M0 0h24v24H0z"/><path d="M18.031 16.617l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z"/></svg></form>
    
    </div>
  </div>`)
  var tListWrap = $("<div class='wrong_tune_selector_items' ></div>")
  var tList = $('<ul class="wrong_tune_selector_items" style="min-width: 600px" class="list-group"   ></ul>')
  sc.map(function(v) {
    if (v) {
      tList.append('<li class="list-group-item tune_selector_option" ><a  href="#" onClick="updateTuneId(' + songNumber + ', ' + v.id + '); return false;" >'+v.name+'</a></li>')
    }
    return false
  })
  tListWrap.append(tList)
  wrongTuneSelector.append(tListWrap)
  wrongTuneButton.click(function(e) {
    e.stopPropagation()
    delayedUpdateSearchResults(songNumber,0);
  })
  wrongTuneSelector.hide()
  wrongTuneControls.append(wrongTuneButton)
  wrongTuneControls.append(wrongTuneSelector)
  wrongTuneButton.click(function() {
    wrongTuneSelector.show()
    return false;
  })
  var wrongSettingButtonUp = $('<button style="z-index: 50 ; margin-left: 0.4em" class="actionbutton wrong-setting-up"  ><svg class="button"  xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"  ><path fill="none" d="M0 0h24v24H0z"/><path d="M13 7.828V20h-2V7.828l-5.364 5.364-1.414-1.414L12 4l7.778 7.778-1.414 1.414L13 7.828z"/></svg></button>')
  var wrongSettingButtonDown = $('<button style="z-index: 50 ; margin-left: 0.2em" class="actionbutton wrong-setting-down"  ><svg class="button"  xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"  ><path fill="none" d="M0 0h24v24H0z"/><path d="M13 16.172l5.364-5.364 1.414 1.414L12 20l-7.778-7.778 1.414-1.414L11 16.172V4h2v12.172z"/></svg></button>')
  wrongSettingButtonUp.click(function() {
    var tune = getTuneFromCache(songNumber)
    var useSetting = tune && tune.useSetting > 0 ? parseInt(tune.useSetting).mod(ss.length) : 0
    updateTuneSetting(songNumber, (useSetting + 1).mod(ss.length))
    $('#use_setting_'+songNumber).text((useSetting + 1).mod(ss.length) + 1)
    scrollTo('controls_'+songNumber)
  })
  wrongSettingButtonDown.click(function() {
    var tune = getTuneFromCache(songNumber)
    var useSetting = tune && tune.useSetting > 0 ? parseInt(tune.useSetting).mod(ss.length) : 0
    updateTuneSetting(songNumber, (useSetting - 1).mod(ss.length))
    $('#use_setting_'+songNumber).text((useSetting - 1).mod(ss.length) + 1)
    scrollTo('controls_'+songNumber)
  })
  var wrongSettingButton = $('<span style="background-color: #e3f0f4; padding: 15px; margin-left: 0.2em; "><svg role="image" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><title>Settings/Arrangements</title><path fill="none" d="M0 0h24v24H0z"/><path d="M20 3v14a4 4 0 1 1-2-3.465V6H9v11a4 4 0 1 1-2-3.465V3h13z"/></svg><span class="badge bg-secondary" ><span id="use_setting_'+songNumber+'" >'+ (useSetting + 1) +'</span></span></span>')
  wrongSettingButton.append(wrongSettingButtonUp)
  wrongSettingButton.append(wrongSettingButtonDown)
  
  var newSettingButton = $('<button style="margin-left:0.2em" ><svg  role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="button" ><title>New Setting</title><path fill="none" d="M0 0h24v24H0z"/><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg></button>')
  newSettingButton.click(function() {
    const cb = navigator.clipboard;
    cb.writeText(tune.settings[tune.useSetting].abc).then(function() {
       if (confirm('Copied! Next a window will open where you can paste the ABC text, edit the music and submit a new setting for this tune.')) {
         var a = window.open('https://thesession.org/tunes/'+tune.id+"/add",'submitwindow')
         a.focus()
       }
    }).catch(function(e) {
        console.log(e)
    });
  })
  
  $("#controls_"+songNumber).remove()
  var boostButtons = $(`<div id="boostbuttons" style="padding: 0.3em; background-color: #e1ffe1; float: right; margin-right: 0.2em" ><svg role="img" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 463 463" height="24px" width="24px" style="enable-background:new 0 0 463 463;" xml:space="preserve">
   <title>Review</title>
<g>
	<path d="M151.245,222.446C148.054,237.039,135.036,248,119.5,248c-4.142,0-7.5,3.357-7.5,7.5s3.358,7.5,7.5,7.5
		c23.774,0,43.522-17.557,46.966-40.386c14.556-1.574,27.993-8.06,38.395-18.677c2.899-2.959,2.85-7.708-0.109-10.606
		c-2.958-2.897-7.707-2.851-10.606,0.108C184.947,202.829,172.643,208,159.5,208c-26.743,0-48.5-21.757-48.5-48.5
		c0-4.143-3.358-7.5-7.5-7.5s-7.5,3.357-7.5,7.5C96,191.715,120.119,218.384,151.245,222.446z"/>
	<path d="M183,287.5c0-4.143-3.358-7.5-7.5-7.5c-35.014,0-63.5,28.486-63.5,63.5c0,0.362,0.013,0.725,0.019,1.088
		C109.23,344.212,106.39,344,103.5,344c-4.142,0-7.5,3.357-7.5,7.5s3.358,7.5,7.5,7.5c26.743,0,48.5,21.757,48.5,48.5
		c0,4.143,3.358,7.5,7.5,7.5s7.5-3.357,7.5-7.5c0-26.611-16.462-49.437-39.731-58.867c-0.178-1.699-0.269-3.418-0.269-5.133
		c0-26.743,21.757-48.5,48.5-48.5C179.642,295,183,291.643,183,287.5z"/>
	<path d="M439,223.5c0-17.075-6.82-33.256-18.875-45.156c1.909-6.108,2.875-12.426,2.875-18.844
		c0-30.874-22.152-56.659-51.394-62.329C373.841,91.6,375,85.628,375,79.5c0-19.557-11.883-36.387-28.806-43.661
		C317.999,13.383,287.162,0,263.5,0c-13.153,0-24.817,6.468-32,16.384C224.317,6.468,212.653,0,199.5,0
		c-23.662,0-54.499,13.383-82.694,35.839C99.883,43.113,88,59.943,88,79.5c0,6.128,1.159,12.1,3.394,17.671
		C62.152,102.841,40,128.626,40,159.5c0,6.418,0.965,12.735,2.875,18.844C30.82,190.244,24,206.425,24,223.5
		c0,13.348,4.149,25.741,11.213,35.975C27.872,270.087,24,282.466,24,295.5c0,23.088,12.587,44.242,32.516,55.396
		C56.173,353.748,56,356.626,56,359.5c0,31.144,20.315,58.679,49.79,68.063C118.611,449.505,141.965,463,167.5,463
		c27.995,0,52.269-16.181,64-39.674c11.731,23.493,36.005,39.674,64,39.674c25.535,0,48.889-13.495,61.71-35.437
		c29.475-9.385,49.79-36.92,49.79-68.063c0-2.874-0.173-5.752-0.516-8.604C426.413,339.742,439,318.588,439,295.5
		c0-13.034-3.872-25.413-11.213-36.025C434.851,249.241,439,236.848,439,223.5z M167.5,448c-21.029,0-40.191-11.594-50.009-30.256
		c-0.973-1.849-2.671-3.208-4.688-3.751C88.19,407.369,71,384.961,71,359.5c0-3.81,0.384-7.626,1.141-11.344
		c0.702-3.447-1.087-6.92-4.302-8.35C50.32,332.018,39,314.626,39,295.5c0-8.699,2.256-17.014,6.561-24.379
		C56.757,280.992,71.436,287,87.5,287c4.142,0,7.5-3.357,7.5-7.5s-3.358-7.5-7.5-7.5C60.757,272,39,250.243,39,223.5
		c0-14.396,6.352-27.964,17.428-37.221c2.5-2.09,3.365-5.555,2.14-8.574C56.2,171.869,55,165.744,55,159.5
		c0-26.743,21.757-48.5,48.5-48.5s48.5,21.757,48.5,48.5c0,4.143,3.358,7.5,7.5,7.5s7.5-3.357,7.5-7.5
		c0-33.642-26.302-61.243-59.421-63.355C104.577,91.127,103,85.421,103,79.5c0-13.369,8.116-24.875,19.678-29.859
		c0.447-0.133,0.885-0.307,1.308-0.527C127.568,47.752,131.447,47,135.5,47c12.557,0,23.767,7.021,29.256,18.325
		c1.81,3.727,6.298,5.281,10.023,3.47c3.726-1.809,5.28-6.296,3.47-10.022c-6.266-12.903-18.125-22.177-31.782-25.462
		C165.609,21.631,184.454,15,199.5,15c13.509,0,24.5,10.99,24.5,24.5v97.051c-6.739-5.346-15.25-8.551-24.5-8.551
		c-4.142,0-7.5,3.357-7.5,7.5s3.358,7.5,7.5,7.5c13.509,0,24.5,10.99,24.5,24.5v180.279c-9.325-12.031-22.471-21.111-37.935-25.266
		c-3.999-1.071-8.114,1.297-9.189,5.297c-1.075,4.001,1.297,8.115,5.297,9.189C206.8,343.616,224,366.027,224,391.5
		C224,422.654,198.654,448,167.5,448z M395.161,339.807c-3.215,1.43-5.004,4.902-4.302,8.35c0.757,3.718,1.141,7.534,1.141,11.344
		c0,25.461-17.19,47.869-41.803,54.493c-2.017,0.543-3.716,1.902-4.688,3.751C335.691,436.406,316.529,448,295.5,448
		c-31.154,0-56.5-25.346-56.5-56.5c0-2.109-0.098-4.2-0.281-6.271c0.178-0.641,0.281-1.314,0.281-2.012V135.5
		c0-13.51,10.991-24.5,24.5-24.5c4.142,0,7.5-3.357,7.5-7.5s-3.358-7.5-7.5-7.5c-9.25,0-17.761,3.205-24.5,8.551V39.5
		c0-13.51,10.991-24.5,24.5-24.5c15.046,0,33.891,6.631,53.033,18.311c-13.657,3.284-25.516,12.559-31.782,25.462
		c-1.81,3.727-0.256,8.214,3.47,10.022c3.726,1.81,8.213,0.257,10.023-3.47C303.733,54.021,314.943,47,327.5,47
		c4.053,0,7.933,0.752,11.514,2.114c0.422,0.22,0.86,0.393,1.305,0.526C351.883,54.624,360,66.13,360,79.5
		c0,5.921-1.577,11.627-4.579,16.645C322.302,98.257,296,125.858,296,159.5c0,4.143,3.358,7.5,7.5,7.5s7.5-3.357,7.5-7.5
		c0-26.743,21.757-48.5,48.5-48.5s48.5,21.757,48.5,48.5c0,6.244-1.2,12.369-3.567,18.205c-1.225,3.02-0.36,6.484,2.14,8.574
		C417.648,195.536,424,209.104,424,223.5c0,26.743-21.757,48.5-48.5,48.5c-4.142,0-7.5,3.357-7.5,7.5s3.358,7.5,7.5,7.5
		c16.064,0,30.743-6.008,41.939-15.879c4.306,7.365,6.561,15.68,6.561,24.379C424,314.626,412.68,332.018,395.161,339.807z"/>
	<path d="M359.5,240c-15.536,0-28.554-10.961-31.745-25.554C358.881,210.384,383,183.715,383,151.5c0-4.143-3.358-7.5-7.5-7.5
		s-7.5,3.357-7.5,7.5c0,26.743-21.757,48.5-48.5,48.5c-13.143,0-25.447-5.171-34.646-14.561c-2.898-2.958-7.647-3.007-10.606-0.108
		s-3.008,7.647-0.109,10.606c10.402,10.617,23.839,17.103,38.395,18.677C315.978,237.443,335.726,255,359.5,255
		c4.142,0,7.5-3.357,7.5-7.5S363.642,240,359.5,240z"/>
	<path d="M335.5,328c-2.89,0-5.73,0.212-8.519,0.588c0.006-0.363,0.019-0.726,0.019-1.088c0-35.014-28.486-63.5-63.5-63.5
		c-4.142,0-7.5,3.357-7.5,7.5s3.358,7.5,7.5,7.5c26.743,0,48.5,21.757,48.5,48.5c0,1.714-0.091,3.434-0.269,5.133
		C288.462,342.063,272,364.889,272,391.5c0,4.143,3.358,7.5,7.5,7.5s7.5-3.357,7.5-7.5c0-26.743,21.757-48.5,48.5-48.5
		c4.142,0,7.5-3.357,7.5-7.5S339.642,328,335.5,328z"/>
</g>
</svg> <span class="badge bg-secondary" id="tune_boost_`+songNumber+`" >`+boost+`</span> 
  <button id="tune_boost_up_`+songNumber+`" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="button" ><path fill="none" d="M0 0h24v24H0z"/><path d="M13 7.828V20h-2V7.828l-5.364 5.364-1.414-1.414L12 4l7.778 7.778-1.414 1.414L13 7.828z"/></svg></button>
  <button  id="tune_boost_down_`+songNumber+`" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="button" ><path fill="none" d="M0 0h24v24H0z"/><path d="M13 16.172l5.364-5.364 1.414 1.414L12 20l-7.778-7.778 1.414-1.414L11 16.172V4h2v12.172z"/></svg></button>  
  </div>`)
  
  var removeButton = $('<button style="margin-right: 0.5em" id="removebutton" ><svg role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="button" ><title>Remove from tune book</title><path fill="none" d="M0 0h24v24H0z"/><path d="M17 6h5v2h-2v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8H2V6h5V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v3zm1 2H6v12h12V8zm-9 3h2v6H9v-6zm4 0h2v6h-2v-6zM9 4v2h6V4H9z"/></svg></button>')
  removeButton.click(function() {
    if (confirm('Really remove this tune from your book ?')) {
      removeTune(songNumber)
    }
  })
  var chatStuff = $('<div style="float: right" ></div>')
  var chatButton = $(`<button class="chathistorybutton" style="float: right; margin-right: 0.2em" ><svg class="button" role="image" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" >
    <title>Comments</title>
    <path fill="none" d="M0 0h24v24H0z"/><path d="M7.291 20.824L2 22l1.176-5.291A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10a9.956 9.956 0 0 1-4.709-1.176zm.29-2.113l.653.35A7.955 7.955 0 0 0 12 20a8 8 0 1 0-8-8c0 1.334.325 2.618.94 3.766l.349.653-.655 2.947 2.947-.655z"/></svg></button>`)
  chatButton.click(function(e) {
    e.stopPropagation()
    $('#chathistory_'+songNumber).show()
  }) 
  var chatHistory = $('<div class="overlay chathistory" style="position: absolute; margin-left:0.5em; display: none;  width: 95%"  id="chathistory_'+songNumber+'" >')
  var chatList = $('<ul class="list-group" ></ul>')
  Array.isArray(tune.comments) && tune.comments.map(function(comment) {
    chatList.append('<li class="list-group-item"   >'+comment.content+'</div>')
  })
  chatHistory.append(chatList)
  //chatStuff.append(chatButton)
  //chatStuff.append(chatHistory)
  
  var editButton = $('<button style="margin-right: 0.2em" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="button" ><path fill="none" d="M0 0h24v24H0z"/><path d="M15.728 9.686l-1.414-1.414L5 17.586V19h1.414l9.314-9.314zm1.414-1.414l1.414-1.414-1.414-1.414-1.414 1.414 1.414 1.414zM7.242 21H3v-4.243L16.435 3.322a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414L7.243 21z"/></svg></button>') 
  editButton.click(function() {
     //console.log('edit '+songNumber)
     var allAbc = $('#longabc').val().split('X:').slice(1)
     //console.log($('#longabc').val())
     showContentSection('edit')
     $('#buttonblock').hide()
     $('.playblock').hide()
     $('#editorsongnumber').val(songNumber)
     
     initialiseEditor('X:' + allAbc[songNumber], songNumber)
     setTimeout(function() {
      scrollTo('topofpage')
     }, 50)
  })
  var controls = $('<div class="controls" id="controls_'+songNumber+'" style="clear: both; border-top: 1px solid black; " ></div>')
  if (tune.comments && tune.comments.length > 0) controls.append(chatHistory)
  controls.append(editButton)
  controls.append(wrongTuneControls)
  controls.append(findAbcControls)
  //controls.append(newSettingButton)
  if (tune.settings && tune.settings.length > 1) controls.append(wrongSettingButton)
  controls.append(startButton)
  controls.append(stopButton)
  controls.append(boostButtons)
  controls.append(removeButton)
  if (tune.comments && tune.comments.length > 0) controls.append(chatButton)
  //console.log('app contreols',controls)
  $(element).before(controls)
  $('#tune_boost_up_'+songNumber).click(function() {
    //console.log('progress up')
       progressUp(songNumber )
  })
  $('#tune_boost_down_'+songNumber).click(function() {
    //$('#tune_boost_'+songNumber).text(parseInt($('#tune_boost_'+songNumber).text()) - 1)
    progressDown(songNumber)
  })
  
}

var abcjsEditor;
var abcEditorTimeout = null
function initialiseEditor (abc, songNumber) {
  $("#editor").val(abc)
  $("#editor").keyup(function(e) {
      // debounce
       console.log('keyup' )
      if (abcEditorTimeout) clearTimeout(abcEditorTimeout)
      abcEditorTimeout = setTimeout(function() {
        console.log('keyup GO' )
        console.log(e.target.value)
        var tunes = loadLocalObject('abc2book_tunes')
        if (tunes[songNumber] && tunes[songNumber].settings && tunes[songNumber].settings.length > tunes[songNumber].useSetting) {   
          var notes = getNotesFromAbc(e.target.value)
          console.log('set tune setting abc', meta)
          tunes[songNumber].settings[tunes[songNumber].useSetting].abc =  notes
        }
        console.log('SAVE TUNES', tunes)
        saveLocalObject('abc2book_tunes',tunes)
        generateAndRenderSingle(songNumber,tunes[songNumber])
      },500)
  })
  abcjsEditor = new ABCJS.Editor("editor", {
    canvas_id: "editormusic",
    warnings_id: "editorwarnings",
    responsive: "resize",
    add_classes: true,
    staffwidth: 900,
    scale: 0.9,
    synth: {
      el: "#editoraudio",
      options: { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true }
    },
    abcjsParams: {
      add_classes: true,
      clickListener: clickListener
    },
    selectionChangeCallback: selectionChangeCallback
  });
};

function clickListener(abcElem, tuneNumber, classes, analysis, drag, mouseEvent) {
  var lastClicked = abcElem.midiPitches;
  if (!lastClicked)
    return;

  //ABCJS.synth.playEvent(lastClicked, abcElem.midiGraceNotePitches, abcjsEditor.millisecondsPerMeasure()).then(function (response) {
    ////console.log("note played");
  //}).catch(function (error) {
    //console.log("error playing note", error);
  //});
}

function selectionChangeCallback(start, end) {
  if (abcjsEditor) {
    var el = abcjsEditor.tunes[0].getElementFromChar(start);
    console.log(el);
  }
}




var midiBuffer = new ABCJS.synth.CreateSynth();
    
function playSongNumber(songNumber)  {
  $('#forcestop').val('')
  $('.playbutton').hide()
  $('#playallbutton').hide()
  $('#stopplayingallbutton').show()
 
  if (renderResult.length > songNumber) {
    var tunes = loadLocalObject('abc2book_tunes')
    if (tunes && tunes[songNumber] && tunes[songNumber].name) {
      speak(tunes[songNumber].name, {speed: 140, amplitude: 120} )
      setTimeout(function() {
        if ($('#forcestop').val() !== "true") {
          
          startPlaying(renderResult[songNumber], songNumber)
          scrollTo('music_'+songNumber)
        }
      }, 1200)
    }
  }
}

function finishPlaying(songNumber) {
  console.log('FINISH ',songNumber)
  if ($('#forcestop').val() !== "true") {
    // start next track after delay to avoid double callback
    //console.log('MPW PLAY '+(songNumber + 1))
    var songlist = loadLocalObject('abc2book_tunes')
    var found = null
    var count = songNumber + 1
    while (found === null && count < songlist.length) {
      console.log('FINISH check',count)
      if (!$('#music_'+count).is(':hidden')) {
        found = count
      }
      count++ 
    }
    console.log('FINISH found',found)
    
    if (found != null && found < songlist.length) {
      playSongNumber(parseInt(found) )
      scrollTo('controls_'+found)
    } else {
      stopPlaying()
    }
  } else {
    //$('#forcestop').val('')
    stopPlaying()
  }
}

      
function startPlaying(visualObj, songNumber) {
  if (!midiBuffer) midiBuffer = new ABCJS.synth.CreateSynth();
  if (ABCJS.synth.supportsAudio()) {
    window.AudioContext = window.AudioContext ||
      window.webkitAudioContext ||
      navigator.mozAudioContext ||
      navigator.msAudioContext;
    var audioContext = new window.AudioContext();
    audioContext.resume().then(function () {
      if (midiBuffer) {
        midiBuffer.stop();
      }
      // midiBuffer.init preloads and caches all the notes needed. There may be significant network traffic here.
      // HACK onEnded is called twice so skip first invocation
      var count = 0
      var onEnded = function(d) {
        console.log('ONENDED ',d)
        count = count + 1;
        // TODO USE THIS HOOK TO START NEXT TRACK IF PLAY ALL trackId IS ACTIVE
        //if (count > 1) {
          finishPlaying(songNumber)
          onEnded = null
        //}
      }
      var tune = getTuneFromCache(songNumber)
      var initOptions = {
        visualObj: visualObj,
        audioContext: audioContext,
        millisecondsPerMeasure: visualObj.millisecondsPerMeasure(),
        //debugCallback: function(d) {
          //console.log('DC',d)
        //},
        options: {
          onEnded: onEnded
        }
      }
      var tempoSetting = $("#tempovalue").val()
      // testing
      //tempo = tempo * 3
      if (tempoSetting) { 
        // rough first cut assume 4 beats per bar   
        // millisecondsPerBeat = 60000/bpm
        initOptions.millisecondsPerMeasure = getMillisecondsPerMeasureForTempo(tempoSetting,tune) //60000/tempoSetting * 4
      } else {
        initOptions.millisecondsPerMeasure = getMillisecondsPerMeasureForTempo(120, tune)
      }
      return midiBuffer.init(initOptions).then(function (response) {
        // midiBuffer.prime actually builds the output buffer.
        return midiBuffer.prime();
      }).then(function (response) {
        // At this point, everything slow has happened. midiBuffer.start will return very quickly and will start playing very quickly without lag.
        midiBuffer.start();
        //midiBuffer.seek(0.9);
        return Promise.resolve();
      }).catch(function (error) {
          console.warn("synth error", error);
      });
    });
  }
}
  
function stopPlaying() {
  reviewStopPlaying()
  if (midiBuffer) midiBuffer.stop();
  $('.playbutton').show()
  $('#playallbutton').show()
  $('#stopplayingallbutton').hide()
  $('#stopplayingbutton').hide()
  $('.stopplayingbutton').hide()
  $('#playallvalue').val('')
  $('#forcestop').val('true')
  midiBuffer = null
}  

function playAll() {
  $('#playallbutton').hide()
  $('#stopplayingallbutton').show()
 
  $('#playallvalue').val('true')
  // find first available tune
  var songlist = loadLocalObject('abc2book_tunes')
  var found = null
  var count = 0
  while (found === null && count < songlist.length) {
    if (!$('#music_'+count).is(':hidden')) {
      found = count
    }
    count++ 
  }
  console.log('play',count)
  playSongNumber(count-1)
  $('#forcestop').val('')

}


