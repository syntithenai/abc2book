import {useState, useEffect} from 'react'
import {Button, Modal, ButtonGroup} from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'
import {useNavigate} from 'react-router-dom'
import CreatableSelect from 'react-select/creatable';
import useUtils from '../useUtils'
function ImportFilesModal(props) {
  const navigate = useNavigate()
  const utils = useUtils()
  const [show, setShow] = useState(false);
  const [list, setList] = useState([]);
  const handleClose = () => {
      //setMessage(null)
      //setList('')
      //setDuplicates(null)
      setShow(false);
      if (props.closeParent) props.closeParent()
      //props.forceRefresh()
  }
  const handleShow = () => setShow(true);
  var [message, setMessage] = useState(null)
  
  var [selectNameOptions, setSelectNameOptions] = useState([])
  
  useEffect(function() {
	//console.log('tunes or list change',props.tunes)
		if (props.tunes && list) {
		  var nameHash = {}
		  Object.values(props.tunes).map(function(tune) {
				if (tune.name) nameHash[tune.name.trim()] = tune.id
		  })
		  var listHash = {}
		  if (Array.isArray(list)) list.forEach(function(listItem) {
			if (listItem.name) listHash[listItem.name.trim()] = 1
		  })
		  var options = []
		  
		  Object.keys(listHash).sort().forEach(function(type, key) {
			  options.push({value:'list_'+key, label: type})
		  })
		  options.push({value:'None', label: '------------------'})
		  Object.keys(nameHash).sort().forEach(function(type, key) {
			  options.push({value:'tune_'+nameHash[type], label: type})
		  })
		  //console.log('tunes or list change end',nameHash, options)
		}
	  //['aa','bb'].map(function(type,key) {
									//return {value:type, label: type}
								//})
	    setSelectNameOptions(options)
  },[list,props.tunes])
 
	function saveImportFiles() {
		//console.log('save',props.currentTuneBook, list)
		
		// collate file updates by id (or name for newTunes)
		var changedTunes = {}
		var newTunes = {}
		
		list.forEach(function(listItem) {
			//console.log('process item', listItem)
			if (listItem && listItem.tuneId) { 
				// update existing tune
				var tuneId = listItem.tuneId
				var tune = changedTunes[tuneId] ? changedTunes[tuneId] : props.tunes[tuneId]
				if (tune) {
					tune.files = Array.isArray(tune.files) ? tune.files : []
					tune.files.push({name: listItem.name, type:listItem.type, data: listItem.data})
					tune.books.push(props.currentTuneBook)
					tune.books = utils.uniquifyArray(tune.books)
					//console.log('attach file to tune', tune)
					changedTunes[tuneId] = tune
				} else {
					console.log('invalid tune id', tuneId, props.tunes)
				}
			} else {
				// create new tune
				var tk = (listItem.name ? listItem.name : 'none')
				var tune = {}
				if (newTunes[tk]) {
					tune = newTunes[tk]
					tune.files = Array.isArray(tune.files) ? tune.files : []
					tune.files.push({name: listItem.name, type:listItem.type, data: listItem.data})
					tune.books = [props.currentTuneBook]
					//console.log('new update', tune, 'b',props.currentTuneBook,'BB')
					
				} else {
					tune = {name: listItem.name ? listItem.name : '', books:[props.currentTuneBook], files:[{name:listItem.name, data: listItem.data,type: listItem.type}]} 
					//console.log('new new', tune, 'b',props.currentTuneBook,'BB')
					
				}
				newTunes[tk] = tune
			}
				
				//
		})
		//console.log('COLLATED CHANGES',changedTunes, newTunes)
		// save updated tunes
		Object.values(changedTunes).forEach(function(tune) {
			props.tunebook.saveTune(tune)
		})
		Object.values(newTunes).forEach(function(tune) {
			props.tunebook.saveTune(tune)
		})
		handleClose()
		navigate('tunes')
	}
	
	function labelChanged(val, itemKey) {
		var newList = JSON.parse(JSON.stringify(list))
		newList[itemKey].name = val.label
		// set tune id based on val.value 
		if (val.value && val.value.startsWith('tune_')) {
			var parts = val.value.split('_')
			if (parts.length > 1 && parts[1].length > 0) {
				//console.log('setfrom tune id',newList[itemKey].tuneId)
				newList[itemKey].tuneId = parts[1]
			}
		} else if (val.value && val.value.startsWith('list_')) {
			// check if referenced list has a proper tuneId
			var lkParts = val.value.split('_')
			var lkKey = lkParts.length > 1 ? lkParts[1] : null
			//console.log('link parts',val,  lkKey, lkParts)
			// yay found in list with tuneId
			if (lkKey && list[lkKey] && list[lkKey].tuneId) {
				var useTuneId = list[lkKey].tuneId
				//console.log('attach file to tune linked', useTuneId,props.tunes[useTuneId])
				//var tune = changedTunes[useTuneId] ? changedTunes[useTuneId] : props.tunes[useTuneId]
				newList[itemKey].tuneId = props.tunes[useTuneId].id
			} else {
				newList[itemKey].tuneId = ''
			}
		} else {
			newList[itemKey].tuneId = ''
		}
		
		setList(newList)
		//tune.rhythm = val.label;   tune.id = params.tuneId; saveTune(tune)  
	}
	
	function deleteListItem(itemKey) {
		//console.log('delete')
		var nl = JSON.parse(JSON.stringify(list))
		nl.splice(itemKey,1); 
		//console.log('deleted ', list, nl)
		setList(nl)
	}
     
	function fileSelected (event) {
		var validFiles = Array.isArray(list) ? list : []
		//console.log ('FILESel',event,event.target.files, validFiles);
		//console.log ('TUNESW',props.tunes)
		var promises = []
		setMessage('Thinking')
			
		Object.values(event.target.files).forEach(function(file) {
			//console.log(file)
			if (file && ((file.type.startsWith('image/') && file.type !== 'image/svg+xml') || file.type==='application/pdf')) {
				var tags = []
				if (file.webkitRelativePath) {
					var parts = file.webkitRelativePath.split("/").slice(0,-1)
					tags = parts.map(function(part) {
						return part.toLowerCase()
					})
				}
				var name = file && file.name && file.name.split('.').length > 1 ? file.name.split('.').slice(0,-1).join('.') :  file ? file.name : ''
						
				if (file && (file.type.startsWith('image/') && file.type !== 'image/svg+xml')) {
					validFiles.push({name:name, type:'image', tags: tags})
				} else if (file.type==='application/pdf') {
					validFiles.push({name:name, type:'pdf', tags: tags})
				}
				promises.push(readFile(file, validFiles.length - 1))
			}
			
		})
		//console.log('set list',validFiles)
		Promise.all(promises).then(function(res) {
			//console.log('alol promises',res)
			var final = res.map(function(fileData) {
				if (Array.isArray(fileData) && fileData.length === 2) {
					validFiles[fileData[1]].data = fileData[0]
				}
			})
			setList(validFiles)
			setMessage(null)
			setTimeout(function() {setMessage(null)},500)
		})
	}
      //const fileList = event.target.files;
	function readFile(file, fileIndex){
		return new Promise(function(resolve,reject) {
			var reader = new FileReader();
			reader.onloadend = function(){
				//console.log("read"+reader.result.length , fileIndex)
				resolve([reader.result, fileIndex])
			}
			if(file){
				reader.readAsDataURL(file);
			} else resolve()
		})
  
      //readFile(event.target.files[0])
  }
  
  function moveListItemDown(itemKey) {
	    setMessage('Thinking')
		var nl = JSON.parse(JSON.stringify(list))
		if (itemKey + 1 < nl.length) {
			var tmp = nl[itemKey]
			nl[itemKey] = nl[itemKey + 1]
			nl[itemKey + 1] = tmp
		}
		//console.log('moved down ',itemKey, JSON.stringify(list.map(function(i) {return i ? i.name : null})))
		//console.log('moved down TO ', JSON.stringify(nl.map(function(i) {return i ? i.name : null})) )
		setList(nl)
		setTimeout(function() {
			setMessage(null)
		},100)
  }
   
  function moveListItemUp(itemKey) {
		setMessage('Thinking')
		var nl = JSON.parse(JSON.stringify(list))
		if (itemKey > 0) {
			var tmp = nl[itemKey]
			nl[itemKey] = nl[itemKey - 1]
			nl[itemKey - 1] = tmp
		}
		//console.log('moved up ',itemKey, JSON.stringify(list.map(function(i) {return i ? i.name : null})))
		//console.log('moved up TO ',JSON.stringify(nl.map(function(i) {return i ? i.name : null})) )
		setList(nl)
		setTimeout(function() {
			setMessage(null)
		},100)
  } 
 
	function rotateImage(inputBase64, toward='right') {
		//console.log('ROTATE',toward,inputBase64)
		return new Promise(function(resolve,reject) {
		  
		  if (!inputBase64) {
			alert('Please enter a base64 data string.');
			return;
		  }

		  // Create an Image object from the base64 string
		  const img = new Image();
		  img.src = inputBase64; //'data:image/png;base64,' + 

		  img.onload = function() {
			// Create a canvas element
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');

			// Set canvas dimensions to match the image
			canvas.width = img.width;
			canvas.height = img.height;

			// Rotate the image to the right
			context.translate(canvas.width / 2, canvas.height / 2);
			if (toward === 'right') context.rotate((90 * Math.PI) / 180); // Rotate 90 degrees to the right
			if (toward === 'left') context.rotate(-1 * (90 * Math.PI) / 180); // Rotate 90 degrees to the left
			context.drawImage(img, -img.width / 2, -img.height / 2);

			// Convert the rotated image to base64
			const rotatedBase64 = canvas.toDataURL('image/png') //.split(',')[1];
			//console.log('ROTATED')
			resolve(rotatedBase64)
		  };
		})
	}
  
  	function rotateLeft(itemKey) {
		//console.log('rotate left')
		var nl = JSON.parse(JSON.stringify(list))
		if (nl[itemKey] && nl[itemKey].data) {
			rotateImage(nl[itemKey].data,'left').then(function(res) {
				nl[itemKey].data = res
				//console.log('rotated ', list, nl)
				setList(nl)
			})
		}
		
	}
    
    function rotateRight(itemKey) {
		//console.log('rotacte right')
		var nl = JSON.parse(JSON.stringify(list))
		if (nl[itemKey] && nl[itemKey].data) {
			rotateImage(nl[itemKey].data).then(function(res) {
				nl[itemKey].data = res
				//console.clog('rotated r', list, nl)
				setList(nl)
			})
		}
		
	}
   
   
  return (
    <>
		
      <Button  style={{color:'black', marginRight:'3em'}}  variant="success" onClick={handleShow}>
        {props.tunebook.icons.folderin} Files
      </Button>

      <Modal show={show} onHide={handleClose}  backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>Import Image And PDF Files</Modal.Title>
        </Modal.Header>
        {(!message) ? <Modal.Body>
			  <div style={{ padding:'0.3em', minHeight:'50em'}} >
			 	  <div style={{borderBottom:'1px solid black', marginBottom:'1em', padding:'0.3em'}} > 
					Import into &nbsp;&nbsp;
					<ButtonGroup variant="primary"  style={{ backgroundColor: '#3f81e3', borderRadius:'10px' , width: 'fit-content'}}>{props.currentTuneBook ? <Button  onClick={function(e) {props.setCurrentTuneBook('');  props.forceRefresh(); }} >{props.tunebook.icons.closecircle}</Button> : ''}<BookSelectorModal  forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} value={props.currentTuneBook} onChange={function(val) { props.setCurrentTuneBook(val)}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions}   triggerElement={<Button variant="primary" >{props.tunebook.icons.book} {props.currentTuneBook ? <b>{props.currentTuneBook}</b> : ''}</Button>}  /></ButtonGroup>
					<Button style={{float:'right'}} onClick={saveImportFiles}  variant="success" disabled={list && list.length > 0 ? false : true} >Save</Button>
						
				  </div>
				  {props.currentTuneBook && <span style={{marginLeft:'0.5em',width:'100%', float:'left'}} >
					<label><input  style={{float:'left', width:'150px'}} className='custom-file-input' variant="primary" type="file"  multiple onChange={fileSelected} /></label>
					<label><input style={{float:'left',width:'150px'}}  type="file" className='custom-folder-input'  id="filepicker" name="fileList" directory="" webkitdirectory=""  onChange={fileSelected}  /></label>
					<hr/>
					{(Array.isArray(list) && list.length > 0) && <div >
						<h4 style={{marginBottom:'1em'}} >Create or Link tunes</h4>
						{list.map(function(item, itemKey) { 
						return (<div style={{borderBottom:'2px solid black'}}>
							<Button style={{marginRight:'0.3em', marginBottom:'0.3em'}} variant="danger" onClick={function() {
								deleteListItem(itemKey)
							}} >{props.tunebook.icons.deletebin}</Button>
							
							<Button style={{marginRight:'0.3em', marginBottom:'0.3em'}} disabled={itemKey > 0 ? false : true} variant="primary" onClick={function() {
								moveListItemUp(itemKey)
							}} >{props.tunebook.icons.arrowup}</Button>
							<Button style={{marginRight:'0.3em', marginBottom:'0.3em'}} disabled={itemKey + 1 < list.length ? false : true} variant="primary" onClick={function() {
								moveListItemDown(itemKey)
							}} >{props.tunebook.icons.arrowdown}</Button>
						
							{(item && item.tuneId) && <Button style={{float:'right'}} variant='outline-success'>Linked {item.tuneId}</Button>}
							{!(item && item.tuneId) && <Button style={{float:'right'}} variant='outline-primary'>New Tune</Button>}
							<div style={{clear:'both'}}>
							<CreatableSelect
								defaultInputValue={item.name}
								onChange={function(val) {labelChanged(val,itemKey)}}
								options={selectNameOptions}
								isClearable={false}
								blurInputOnSelect={true}
								createOptionPosition={"first"}
								allowCreateWhileLoading={true}
								
							/>
							</div>
							
							{(item && item.type === 'image' && item.data) && <img style={{height:'100px'}} src={item.data} />}
							{(item && item.type === 'pdf' && item.data) && <iframe style={{height:'100px'}} src={item.data} />}
							
							{item.type === 'image' && <div style={{marginTop:'0.3em', marginBottom:'0.3em'}}>
							<Button onClick={function() {
								rotateLeft(itemKey)
							}} >{props.tunebook.icons.anticlockwise}</Button>
							<Button onClick={function() {
								rotateRight(itemKey)
							}} >{props.tunebook.icons.clockwise}</Button>
							</div>}
							
							{item.tags && Object.values(item.tags).map(function(tag, tagKey) {
								return <Button variant="warning" style={{marginLeft:'0.2em'}} onClick={function() {
									var newList = JSON.parse(JSON.stringify(list))
									var newTags = Array.isArray(newList[itemKey].tags) ? newList[itemKey].tags : []
									newTags.splice(tagKey)
									//console.log(tagKey)
									//newList[itemKey].name = val.label
									//if (val.value && val.value.startsWith('tune_')) {
										//newList[itemKey].tuneId = val.value
									//} else if (val.value && val.value.startsWith('list_')) {
										//newList[itemKey].tuneId = val.value
									//}
									newList[itemKey].tags = newTags
									setList(newList)
								}} >{props.tunebook.icons.closecircle} {tag} </Button>	
							})}
						</div>)
					})}</div>}
					
				  </span>}
				  
			  </div>
			 
        </Modal.Body> : ''}
        
        
        {message &&
        <>
        <Modal.Body> 
          {message}
        </Modal.Body> 
        <Modal.Footer>
          <Button  variant="success" onClick={handleClose} >OK</Button>
        </Modal.Footer>
        </>}
      </Modal>
    </>
  );
}
export default ImportFilesModal

//<!DOCTYPE html>
//<html lang="en">
//<head>
  //<meta charset="UTF-8">
  //<meta name="viewport" content="width=device-width, initial-scale=1.0">
  //<title>Rotate Image</title>
//</head>
//<body>
  //<textarea id="inputBase64" placeholder="Enter base64 data here"></textarea>
  //<button onclick="rotateImage()">Rotate Right</button>
  //<img id="outputImage" alt="Output Image">

  //<script>
    
  //</script>
//</body>
//</html>



//{list.length} tune{list.length> 1 ? 's' : ''}
//var tuneId = listKeyParts.length > 1 ? listKeyParts[1] : null
				//console.log('process list', listType, "ID", tuneId)
				//// linked to tune
				//if (listType === 'tune' && tuneId && props.tunes[tuneId]) {
					//// save file to tune and ensure book
					//var tune = changedTunes[tuneId] ? changedTunes[tuneId] : props.tunes[tuneId]
					//tune.files = Array.isArray(tune.files) ? tune.files : []
					//tune.files.push({name: listItem.name, type:listItem.type, data: listItem.data})
					//tune.books.push(props.currentTuneBook)
					//tune.books = utils.uniquifyArray(tune.books)
					//console.log('attach file to tune', tune)
					//changedTunes[tuneId] = tune
				//// linked to list item	
				//} else if (listType === 'list' && tuneId && list[tuneId] && list[tuneId].tuneId) { // && list[tuneId].tuneId && props.tunes[list[tuneId].tuneId]) { 
					//var lkParts = list[tuneId].tuneId.split('_')
					//var lkTuneId = lkParts.length > 1 ? lkParts[1] : null
					//console.log('link parts', lkParts)
					//if (lkTuneId && props.tunes[lkTuneId]) {
						//console.log('attach file to tune linked', list[tuneId], list[tuneId].tuneId ,props.tunes[list[tuneId].tuneId])
						//var tune =  props.tunes[list[tuneId].tuneId]
						//if (tune) {
							//tune.files = Array.isArray(tune.files) ? tune.files : []
							//tune.files.push({name: listItem.name, type:listItem.type, data: listItem.data})
							//tune.books.push(props.currentTuneBook)
							//tune.books = utils.uniquifyArray(tune.books)
							//console.log('attach file to tune linked', tune)
						//}
						////changedTunes[list[tuneId].tuneId] = tune
					//} else {
						//console.log('invalid list link')
					//}
				//} else {
					//console.log('invalid link')
				//}
			//// not linked
			//} else {
				//// create new tune
				//var tk = (listItem.name ? listItem.name : 'none')
				//var tune = {}
				//if (newTunes[tk]) {
					//tune = newTunes[tk]
					//tune.files = Array.isArray(tune.files) ? tune.files : []
					//tune.files.push({name: listItem.name, type:listItem.type, data: listItem.data})
					//console.log('new update', tune)
					
				//} else {
					//tune = {name: listItem.name ? listItem.name : '', files:[{name:listItem.name, data: listItem.data,type: listItem.type, books:[props.currentTuneBook]}]} 
					//console.log('new new', tune)
					
				//}
				//newTunes[tk] = tune
			//}
			
			
			
			
  
  //function doImport(list) {
    //console.log('import',list)
      ////console.log("gotres",res.data.length)
          //var results = props.tunebook.importAbc(list,props.currentTuneBook)
      //console.log("gotreeees",results,props.tunebook.showImportWarning(results))
      //if (!props.tunebook.showImportWarning(results)) {
          //props.tunebook.applyImportData(results).then(function() {
              ////setTimeout(function() {
                  //if (props.currentTuneBook) {
                      //navigate("/blank")
                      //setTimeout(function() {
                        //navigate("/tunes")
                      //},200)
                  //} else {
                    //navigate("/books")
                  //}
              ////},800)
         //})
          
      //}
   //handleClose()
  //}
