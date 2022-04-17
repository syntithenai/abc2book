
function preventClickThrough() {
  $('#sessionsearchbutton').click(function(e) {
    e.stopPropagation()
    return false
  })
   $('.wrong_tune_input').click(function(e) {
    e.stopPropagation()
  })
   $('.wrong_abc_input').click(function(e) {
    e.stopPropagation()
  })
   $('.overlay').click(function(e) {
    e.stopPropagation()
  })
}


function domInit() {
    if (window.mobileAndTabletCheck()) {
    $("#pagewrapper").addClass('is_mobile')
  } 
  
  //loadSongList()
  $("#stopbutton").show()
  //$('#songlistmanager').hide()
  //$("#helpbutton").hide()
  //$("#reviewbuttons").hide()
  generateAndRender()
  // hide overlays on bg click
  $('body').click(function() {
    $('.overlay').hide()
  })
  $('#waiting').hide()
  renderSonglistPicker()
  $('.stopplayingbutton').hide()
  $('#stopbutton').hide()
  $('#downloadbutton').click(function(e) {
    e.stopPropagation()
    $('#downloadselector').show()
  })
  $('#reviewbutton').click(function(e) {
    review()
  })
  $('#reviewlistbutton').click(function(e) {
    e.stopPropagation()
    showReviewList()
  })
  $('#reviewsearchinput').click(function(e) {
    e.stopPropagation()
    //showReviewList()
  })
  $('#moremenubutton').click(function(e) {
    e.stopPropagation()
    $("#viewoptions").hide()
    $("#moremenu").show()
  })  
  $('#editsonglistbutton').click(function(e) {
    showContentSection('songlistmanager')
    $("#moremenu").hide()
    $('#songlistmanager').show()
  })  
  $('#welcomecreatenewbutton').click(function(e) {
    showContentSection('songlistmanager')
    $('#songlistmanager').show()
  }) 
  $('#songlistpickerbutton').click(function(e) {
    e.stopPropagation()
    $('#songlistpicker').show()
  }) 
  $('#showviewoptionsbutton').click(function(e) {
    e.stopPropagation()
    $('#moremenu').hide()
    $('#viewoptions').show()
  })   
   $('#welcomeimportbutton').click(function() {
     showContentSection('longabcwrapper')
   })
  
  
   $('#welcomeaddtunebutton').click(function() {
     var searchText = prompt('What is the name of the tune?')
     if (searchText) addNewTuneToStartOfList(searchText)
   })
   $('#addtunebutton').click(function() {
     var searchText = prompt('What is the name of the tune?')
     if (searchText) addNewTuneToStartOfList(searchText)
   })
   $('#searchfilterresetbutton').click(function() {
     $('#musicsearchfilter').val(''); 
     filterMusicList('')
     $('#searchfilterresetbutton').hide()
      $('#searchfilterbutton').show()
   })
   $('#searchfilterbutton').click(function() {
     $('#musicsearchfilter').focus()
   })
       
  preventClickThrough() 
   $('#showwizardsbutton').click(function(e) {
     console.log('#showwizardsbutton')
    e.stopPropagation()
    showElement('wizards')
  })

  $('#doublenotelengthsbutton').click(function(e) {
      e.stopPropagation()
      var tune = singleAbc2json($('#editor').val())
      tune.settings[tune.useSetting].abc = multiplyAbcTiming(2,$('#editor').val())
      var abc = json2abc(tune.songNumber,tune)
      console.log('abc half ',abc)
      $('#editor').val(abc)
      $('#editor').keyup()
      $('#wizards').hide()
  })  
  $('#halvenotelengthsbutton').click(function(e) {
      e.stopPropagation()
      var tune = singleAbc2json($('#editor').val())
      tune.settings[tune.useSetting].abc = multiplyAbcTiming(0.5,$('#editor').val())
      var abc = json2abc(tune.songNumber,tune)
      console.log('abc half ',abc)
      $('#editor').val(abc)
      $('#editor').keyup()
      $('#wizards').hide()
  })  
  
  
 
  $('#openabcbutton').click(function(e) {
      console.log('OPEN ABC')
      generateAbcFromTunes()
      $('#moremenu').hide()
    //e.stopPropagation()
    console.log('OPEN ABC show wrapper')
    $("#longabcwrapper").show()
    showContentSection('longabcwrapper')
  })
  const fileSelector = document.getElementById('selecttunebookfilebutton');
  fileSelector.addEventListener('change', (event) => {
    const fileList = event.target.files;
    function readFile() {
        var file = document.getElementById("selecttunebookfilebutton").files[0];
        var reader = new FileReader();
        reader.onloadend = function(){
           $('#longabc').val(reader.result)
           if (confirm('Do you really want to replace your current tune book with the version shown in the text area')) {updateTunesFromLongAbc()} 
        }
        if(file){
            reader.readAsText(file);
        }else{
        }
    }
    readFile()
  });
    

   
  var reviewSearchClickTimeout = null
  $('#reviewsearchinput').keyup(function(e) {
    
    
    if (reviewSearchClickTimeout) clearTimeout(reviewSearchClickTimeout)
    reviewSearchClickTimeout = setTimeout(function() {
      renderReviewList()
    },300)
    //showReviewList()
  })
  
  var musicSearchTimeout = null
  $('#musicsearchfilter').keyup(function(e) {
    console.log(e.target.value.trim())
    if (e.target.value.trim().length > 0) { 
      $('#searchfilterresetbutton').show()
      $('#searchfilterbutton').hide()
    } else {
      $('#searchfilterresetbutton').hide()
      $('#searchfilterbutton').show()
    }
    if (musicSearchTimeout) clearTimeout(musicSearchTimeout)
    musicSearchTimeout = setTimeout(function() {
      console.log('SRC',e.target.value,$('#musicsearchfilter').val())
      filterMusicList($('#musicsearchfilter').val())
    },300)
    //showReviewList()
  })  
  
  bindCopy($('#copyshortabc'),function() {
      generateShortAbcFromTunes()
      return $('#shortabc').val()
  })
  bindCopy($('#copylongabc'),function() {
      generateAbcFromTunes()
      return $('#longabc').val()
  })
  bindCopy($('#copysongtitles'),function() {
      generateAbcFromTunes()
      return getSongTitles()
  })
  //bindCopy($('#copysongtexts'),function() {
      //return getSearchTexts()
  //})
  // no sleep
  document.addEventListener('click', function enableNoSleep() {
  document.removeEventListener('click', enableNoSleep, false);
    var ns = new window.NoSleep()
    ns.enable();
  }, false);  
 
  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register(
          '/abc2book/sw.js',
          {
            scope: '/abc2book/',
          }
        );
        if (registration.installing) {
          console.log('Service worker installing');
        } else if (registration.waiting) {
          console.log('Service worker installed');
        } else if (registration.active) {
          console.log('Service worker active');
        }
      } catch (error) {
        console.error(`Registration failed with ${error}`);
      }
    }
  };

  
}



function scrollTo(id) {
    var element = document.getElementById(id);
  //console.log('scroll to '+id,element)
    var headerOffset = 60;
    var elementPosition = element.offsetTop;
    var offsetPosition = elementPosition - headerOffset;
    document.documentElement.scrollTop = offsetPosition;
    document.body.scrollTop = offsetPosition; // For Safari
}




function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

function printPage() {
  filterMusicList('')
  $('#musicsearchfilter').val()
  $('#indexes').show()
  $('#music').show()
  $('#cheatsheet_music_container').show()
  $('#songlistmanager').show()
  window.print()
}
function showTuneControls() {
    $("#stopbutton").hide()
    $("#generatebutton").show()
    $('#downloadbutton').show()
    $('#printbutton').show()
    $('#cheatsheetbutton').show()
    $('#indexbutton').show()
    $('#playallbutton').show()
    $('#tempo').show()
}
function hideTuneControls() {
    $("#generatebutton").hide()
    $('#downloadbutton').hide()
    $('#printbutton').hide()
    $('#cheatsheetbutton').hide()
    $('#indexbutton').hide()
    $('#playallbutton').hide()
    $('#tempo').hide()
}

function showContentSection(contentId) {
    var contentTypes = ['cheatsheet_music_container','indexes','music','help','review','edit','songlistmanager','welcometext','longabcwrapper']
    $(".overlay").hide()
    if (contentId === 'review') {
      $('#reviewbuttons').show()
    } else {
      $('#reviewbuttons').hide()
    }
    $("#reviewbuttons").hide()
    $('#buttonblock').show()
    $('.playblock').show()
    if (contentId === 'music') {
      $('#musiclistbuttons').show()
    } else {
      $('#musiclistbuttons').hide()
    }
    
    if (contentId == 'home') {
         contentTypes.map(function(type) {
            $("#"+type).hide()
         })
         $('#musiclistbuttons').show()
         //$('#helptext').show()
        // $('#songlistbutton').show()
         $('#errors').show()
         $("#music").show()
         //$("#welcometext").show()
         scrollTo('topofpage')
    } else {
        
             
        contentTypes.map(function(type) {
          if (contentId !== type) {
              $("#"+type).hide()
          } else {
              $("#"+type).show()
          }  
        })
        //$('#helptext').hide()
        //$('#songlistbutton').hide()
        $('#errors').hide()
       // $('#songlistmanager').hide()
        scrollTo('topofpage')
    }
    
}

/**
 * Set flag to stop rendering lookups.
 */

function setStopNow(val) {
   $("#stopbuttonvalue").val("true")
   $("#stopbutton").hide()
   $("#generatebutton").show()
}


function downloadLongAbc() {
  generateAbcFromTunes()
  download('tunebook.abc', $("#longabc").val())
}

function downloadShortAbc() {
  generateShortAbcFromTunes()
  download('tunebook_cheatsheet.abc', $("#shortabc").val())
}




function renderSonglistPicker() {
   var pickerItems = $('<ul class="list-group"  ></ul>')
   Object.keys(getSongLists()).map(function(listName) {
       pickerItems.append('<li class="list-group-item" ><a href="#" onClick="selectSongList(\''+listName+'\'); " >'+listName+'</a></li>')
   })
   $('#songlistpicker').html(pickerItems.html())
   $('#songlistpickerbutton').click(function(e) {
      e.stopPropagation()
    })
   
   
}

