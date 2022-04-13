function generateIndexesFromTunes() {
  resetIndexes()
  var tunes = loadLocalObject('abc2book_tunes')
  var index = loadLocalObject('abc2book_index')
  var keyIndex = loadLocalObject('abc2book_indexbykey')
  var typeIndex = loadLocalObject('abc2book_indexbytype')
    
  if (tunes) {
    Object.keys(tunes).map(function(k) {
      var tune = tunes[k]
      if (tune) {
        var setting = tune && tune.settings && tune.settings.length > tune.useSetting ? tune.settings[tune.useSetting] : {}
        addTuneToIndexes(k, tune, setting, tune.forceTitle, index, keyIndex, typeIndex)
      }
    })
    saveLocalObject('abc2book_index', index)
    saveLocalObject('abc2book_indexbykey', keyIndex)
    saveLocalObject('abc2book_indexbytype', typeIndex) 
  }
  //console.log('gen indexes', tunes, index, keyIndex, typeIndex)
  
}

/** 
 * Add newly loaded tune to indexed data structures in localStorage 
 * 
 */
function addTuneToIndexes(songNumber, tune, setting, tuneName, index, keyIndex, typeIndex) {
  if (setting && setting.key) {
    //console.log('addTuneToIndexes',songNumber, tune, setting, tuneName)
    //var index = loadLocalObject('abc2book_index')
    //var keyIndex = loadLocalObject('abc2book_indexbykey')
    //var typeIndex = loadLocalObject('abc2book_indexbytype')
    index[songNumber] = tuneName
    if (!keyIndex.hasOwnProperty(setting.key)) {
     keyIndex[setting.key] = []
    }
    keyIndex[setting.key].push(tuneName)
    if (!typeIndex.hasOwnProperty(tune.type)) {
     typeIndex[tune.type] = []
    }
    typeIndex[tune.type].push(tuneName)
    saveLocalObject('abc2book_index', index)
    saveLocalObject('abc2book_indexbykey', keyIndex)
    saveLocalObject('abc2book_indexbytype', typeIndex) 
  }
}

/**
 * Render and collate all indexes
 */
function renderIndexes() {
  renderIndexFromTunes()
  renderIndexByKeyFromTunes()
  renderIndexByTypeFromTunes()
  sortAndCollateMainIndex()
  sortOtherIndexes()
}

/**
 * Clear all indexes
 */
function resetIndexes() {
  localStorage.setItem('abc2book_index',null)
  localStorage.setItem('abc2book_indexbytype',null)
  localStorage.setItem('abc2book_indexbykey',null)
  $('#index').html('')
  $('#indexbytype').html('')
  $('#indexbykey').html('');
}


/**
 * Render indexes from localStorage data
 */
function renderIndexFromTunes() {
  var index = loadLocalObject('abc2book_index')
  $('#index').html("")
  if (index) {
    Object.keys(index).map(function(tuneNumber) {
      var tuneTitle = index[tuneNumber]
      
      $('#index').append(`<div >` + (parseInt(tuneNumber) + 1) + '. ' +tuneTitle + "</div>")
    })
  }
}

function renderIndexByKeyFromTunes() {
  var index = loadLocalObject('abc2book_indexbykey')
  $('#indexbykey').html("")
  if (index) {
    Object.keys(index).map(function(tuneKey) {
      var tunes = index[tuneKey]
      if (Array.isArray(tunes)) {
        tunes.map(function(tuneName) {
          addToCollation('indexbykey', tuneKey, tuneKey.slice(0,1)+' ' +tuneKey.slice(1), tuneName)
        })
       }
    })
  }
}

function renderIndexByTypeFromTunes() {
  var index = loadLocalObject('abc2book_indexbytype')
  $('#indexbytype').html("")
  if (index) {
    Object.keys(index).map(function(tuneType) {
      var tunes = index[tuneType]
      if (Array.isArray(tunes)) {
        tunes.map(function(tuneName) {
          addToCollation('indexbytype', tuneType, tuneType, tuneName)
        })
      }
    })
  }
}

/**
 * END Render indexes from localStorage data
 */




/**
 * Append a div (or div and parent collation key div) 
 * @param collationId DOM element id for whole index
 * @param key - key value for nested container
 * @param keyText - label for this key
 * @param value  - value to add
 * */
function addToCollation(collationId, key,keyText, value) {
    var container = $("#"+collationId)
    var useKey = key.replace(' ','_')
    var keyContainer = $("#"+useKey, container)
    if (keyContainer.length == 0) {
      container.append('<div style="float: left; width: 32%" id="'+useKey+'"><h4>'+keyText+'</h4><div>'+value+'</div></div>')
    } else {
      keyContainer.append('<div>'+value+'</div>')
    }
}


/**
 * Collate and sort rendered indexes 
 */
function sortAndCollateMainIndex() {
  // sort the main index and split into columns of 40, 3 cols per page
    var lookups = {}
    $("#index div").map(function(a,d) {
        var lParts = $(d).text().split(".")
        var number = lParts[0]
        if (lParts.length > 1) {
          var name = lParts[1].trim()
          lookups[name] = $(d).text()
        }
    })
    var sorted = []
    var sortedKeys = Object.keys(lookups).sort()
    sortedKeys.map(function(a) {
      sorted.push(lookups[a])
    })  
    
    $('#index').html(sorted.map(function(a) {
      var parts = a.split('.')
      var link = $(`<a href='#'>`+a+"</a>")
      link.click(function(e) {
        e.stopPropagation()
        $('#music').show()
        $('.controls').show()
        //console.log('click',parts, parseInt(parts[0]))
        showContentSection('music')
        setTimeout(function() {
          scrollTo("controls_"+(parseInt(parts[0]) -1))
        }, 300)
        
      })
      var d = $(`<div></div>`)
      d.append(link)
      return d
    }) )
    collateMainIndex()
}

function sortOtherIndexes() {
  // Sort indexes
  $('#indexbytype').sortChildren(function(a, b) {
      // Compare amount of children
      return $(b).children().length - $(a).children().length;
  });
  $('#indexbykey').sortChildren(function(a, b) {
      // Compare amount of children
      return $(b).children().length - $(a).children().length;
  });
}

function collateMainIndex() {
    var num_cols = 3,
    forceMinItemsPerColumn = 50,
    container = $('#index'),
    listItem = 'div',
    listClass = 'sub-list';
    container.each(function() {
        var items_per_col = new Array(),
        items = $(this).find(listItem),
        min_items_per_col = Math.max(forceMinItemsPerColumn,Math.floor(items.length / num_cols)),
        difference = items.length - (min_items_per_col * num_cols);
        for (var i = 0; i < num_cols; i++) {
            if (i < difference) {
                items_per_col[i] = min_items_per_col + 1;
            } else {
                items_per_col[i] = min_items_per_col;
            }
        }
        for (var i = 0; i < num_cols; i++) {
            $(this).append($('<div></div>').addClass(listClass));
            for (var j = 0; j < items_per_col[i]; j++) {
                var pointer = 0;
                for (var k = 0; k < i; k++) {
                    pointer += items_per_col[k];
                }
                $(this).find('.' + listClass).last().append(items[j + pointer]);
            }
        }
    });

}

