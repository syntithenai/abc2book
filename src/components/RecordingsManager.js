import {Link} from 'react-router-dom'
import {ListGroup, Button, Modal} from 'react-bootstrap'
import useFileManager from '../useFileManager'
import {useState, useEffect, useRef} from 'react'
import useUtils from '../useUtils'
import OpenSheetMusicDisplay from '../components/OpenSheetMusicDisplay'
import PDFPreviewViewer from '../components/PDFPreviewViewer'
import useAudioUtils from '../useAudioUtils'
import QuickPlayButton from '../components/QuickPlayButton'
import FileNameEditorModal from '../components/FileNameEditorModal'

export default function RecordingsManager(props) {
	var allowedMimeTypes = ['audio/*'] //application/musicxml
	var fileManager = props.fileManager //useFileManager('recordings',props.token ? props.token : null, props.logout, props.tune, allowedMimeTypes)
	var utils = useUtils()
	var audioUtils = useAudioUtils()
	var [previewFile, setPreviewFile] = useState(null)
	var [recordingDuration, setRecordingDuration] = useState(0)
	var recordingInterval = null	
	const recordingStartedAt = useRef(0)

	//useEffect(function() {
		
	//},[])

	function displayPreview(file) {
		// load file with data
		fileManager.load(file.id).then(function(loadedFile) {
			setPreviewFile(loadedFile)
		})
	}
	
	function startRecording() {
		recordingStartedAt.current = new Date().getTime()
		setRecordingDuration(0)
		recordingInterval = setInterval(function() {
			//console.log( recordingStartedAt, new Date().getTime())
			setRecordingDuration(parseInt((new Date().getTime() - recordingStartedAt.current)/1000))
		},1000)
		audioUtils.startRecording().then(function(data) {
			clearInterval(recordingInterval)
			console.log('captured', data)
			utils.blobToBase64(data).then(function(b64) {
				fileManager.save({id: utils.generateObjectId(), name:'Recording '+new Date().toLocaleString(), data: b64, createdTimestamp : new Date(), updatedTimestamp : new Date(),  type:'audio/wav', tuneId : props.tune ? props.tune.id : null, tuneName: props.tune ? props.tune.name : null}).then(function(file) {
					fileManager.addFiles([file])
				})
			})
		})
	}
	
//(previewFile && previewFile.id) && 
	return <div>
		 {<Modal show={(previewFile && fileManager.allowMime(previewFile.type))} onHide={function() { setPreviewFile(null)}} > 
			 
			<Modal.Header closeButton>
			  <Modal.Title>Preview</Modal.Title>
			</Modal.Header>
			<Modal.Body>
			 {(previewFile && previewFile.type === 'text/plain' && previewFile.data) && <pre>{previewFile.data.slice(0,500)}</pre>}
							
			{(previewFile && previewFile.type.startsWith('image/') && previewFile.data) && <div><img src={previewFile.data} style={{width:'100%'}} /></div>}
			
			{(previewFile && previewFile.type === 'application/pdf' && previewFile.data) && <div><PDFPreviewViewer tunebook={props.tunebook} width='350'  style={{width:'100%'}} src={previewFile.data} />  </div>}
			
			{(previewFile && previewFile.type === 'application/musicxml' && previewFile.data) && <div style={{textAlign:'center'}} >
				<OpenSheetMusicDisplay file={previewFile.data} />
			</div>}
			
			{(previewFile && previewFile.type.startsWith('audio/')  && previewFile.data) && <div><audio controls={true} src={previewFile.data} style={{width:'100%'}} /></div>}
			
			</Modal.Body>	 
			 
		</Modal>}
		 <div style={{backgroundColor:'#1900ff1a', padding:'0.5em', border:'1px solid black'}} > 
		 <h3>Recordings</h3>
		<Button variant="outline-success" size="sm" style={{float:'right'}} onClick={fileManager.pasteFiles} >{props.tunebook.icons.paste}</Button>
		
		<span style={{marginRight:'1em', width:'4em', overflow:'hidden', float:'right'}} ><input multiple={true} type='file'  className='custom-file-input-button' accept={Array.isArray(allowedMimeTypes) ? allowedMimeTypes.join(",") : '*'}  onChange={fileManager.filesSelected} /></span>
		
		{audioUtils.isRecording && <><Button style={{color:'black', fontWeight:'bold', float:'right', marginRight:'1em', height:'2.2em'}} onClick={audioUtils.stopRecording} variant="danger" >{props.tunebook.icons.stopsmall}</Button><Button style={{color:'black', fontWeight:'bold', float:'right', marginRight:'0.2em', height:'2.2em'}} variant="outline-danger">{recordingDuration + 1}s</Button></>}
		
		{!audioUtils.isRecording && <Button size="sm" style={{fontWeight:'bold', float:'right', marginRight:'1em', height:'2.2em'}} onClick={startRecording} variant="success" >{props.tunebook.icons.recordcircle}</Button>}
		
		{fileManager.warning && <div style={{fontSize:'1.3em', color:'red', backgroundColor:'pink', minWidth:'10em', clear:'both'}} >{fileManager.warning}</div>}
		
		<input type='search' value={fileManager.filter} onChange={function(e) {fileManager.setFilter(e.target.value)}} />
		</div>
		
		<ListGroup style={{marginTop:'1em'}} >
			{fileManager.filtered.map(function(file, fk) {
				return <ListGroup.Item key={fk} style={{width:'100%', borderTop:'1px solid black'}}>
					<div style={{width:'100%', float:'left'}} key={fk} >
						<div style={{width:'100%'}} >
							<Button variant="danger" style={{float:'right'}} onClick={function() {fileManager.deleteFile(file,fk)}} >{props.tunebook.icons.deletebin}</Button>
							
							<span style={{float:'right'}} ><FileNameEditorModal tunebook={props.tunebook} initvalue={file.name} onChange={function(v) {
								console.log(v)
								// ensure data is loaded
								fileManager.load(file.id).then(function(orig) {
									orig.name = v
									orig.updatedTimestamp = new Date()
									fileManager.save(orig) //.then(function() {props.forceRefresh()})
								})
							}}  /> </span>
							
							
							<QuickPlayButton tunebook={props.tunebook} recording={file} /> 
							
							{(file.tuneName && file.tuneId) && <Link to={"/tunes/"+file.tuneId}><span style={{marginLeft:'0.5em', fontWeight:'bold'}} >{file.tuneName}<br/></span></Link>}
							
							{(file.tuneName && !file.tuneId) && <span style={{marginLeft:'0.5em', fontWeight:'bold'}} >{file.tuneName}<br/></span>}
							
							<span style={{marginLeft:'0.5em'}} >{file.name}</span>
							
							{<Button variant="outline-primary" style={{marginLeft:'0.5em',marginBottom:'0.5em'}}>{file.type}</Button>}
							
							{file.updatedTimestamp && <Button variant="outline-primary" style={{marginLeft:'0.5em',marginBottom:'0.5em'}}>{file.updatedTimestamp.toLocaleString()}</Button>}
							
							
							
							
						</div>
					</div>
			</ListGroup.Item>
		})}
		</ListGroup>
	</div>
}




//import {useState, useEffect, useRef} from 'react'
//import {Button, ListGroup, Form, Row, Col} from 'react-bootstrap'
//import YouTube from 'react-youtube';  
//import {Link , useParams , useNavigate} from 'react-router-dom'
//import PDFPreviewViewer from './PDFPreviewViewer'
//import useGoogleDocument from '../useGoogleDocument'
//import useUtils from '../useUtils'
//import QuickPlayButton from '../components/QuickPlayButton'
////import OpenSheetMusicDisplay from './OpenSheetMusicDisplay'


//export default function RecordingsManager(props) {
    //const navigate = useNavigate()
    //const googleDocument = useGoogleDocument(props.token, props.logout)
	////console.log("DD",props.token, props.tune)
    //// TODO AUTOLOAD GOOGLE DOCUMENT (if possible) if link but no data AND cache in file.data
    //// TODO single view autoload doc
	//var utils = useUtils();
	
	



	//function moveListItemDown(itemKey) {
		//var nl = props.tune.files
		//if (itemKey + 1 < nl.length) {
			//var tmp = nl[itemKey]
			//nl[itemKey] = nl[itemKey + 1]
			//nl[itemKey + 1] = tmp
		//}

		//var tune = props.tune
		//tune.files = nl; 
		//props.tunebook.saveTune(tune); 
  //}
   
	//function moveListItemUp(itemKey) {
		//var nl = props.tune.files
		//if (itemKey > 0) {
			//var tmp = nl[itemKey]
			//nl[itemKey] = nl[itemKey - 1]
			//nl[itemKey - 1] = tmp
		//}

		//var tune = props.tune
		//tune.files = nl; 
		//props.tunebook.saveTune(tune); 
	//} 
 
	//function rotateImage(inputBase64, toward='right') {
		////console.log('ROTATE',toward,inputBase64)
		//return new Promise(function(resolve,reject) {
		  
		  //if (!inputBase64) {
			//alert('Please enter a base64 data string.');
			//return;
		  //}

		  //// Create an Image object from the base64 string
		  //const img = new Image();
		  //img.src = inputBase64; //'data:image/png;base64,' + 

		  //img.onload = function() {
			//// Create a canvas element
			//const canvas = document.createElement('canvas');
			//const context = canvas.getContext('2d');

			//// Set canvas dimensions to match the image
			//canvas.width = img.width;
			//canvas.height = img.height;

			//// Rotate the image to the right
			//context.translate(canvas.width / 2, canvas.height / 2);
			//if (toward === 'right') context.rotate((90 * Math.PI) / 180); // Rotate 90 degrees to the right
			//if (toward === 'left') context.rotate(-1 * (90 * Math.PI) / 180); // Rotate 90 degrees to the left
			//context.drawImage(img, -img.width / 2, -img.height / 2);

			//// Convert the rotated image to base64
			//const rotatedBase64 = canvas.toDataURL('image/png') //.split(',')[1];
			////console.log('ROTATED')
			//resolve(rotatedBase64)
		  //};
		//})
	//}
  
  	//function rotateLeft(itemKey) {
		////console.log('rotate left')
		//var nl = props.tune.files
		//if (nl[itemKey] && nl[itemKey].data) {
			//rotateImage(nl[itemKey].data,'left').then(function(res) {
				//nl[itemKey].data = res
				//// update online version
				//if (nl[itemKey].googleDocumentId) {
					//googleDocument.updateDocumentData(nl[itemKey].googleDocumentId, res).then(function() {
						//console.log('saved rotated image')
					//})
				//}
			//})
		//}
		//var tune = props.tune
		//tune.files = nl; 
		//props.tunebook.saveTune(tune); 
	//}
    
    //function rotateRight(itemKey) {
		////console.log('rotacte right')
		//var nl = props.tune.files
		//if (nl[itemKey] && nl[itemKey].data) {
			//rotateImage(nl[itemKey].data,'right').then(function(res) {
				//nl[itemKey].data = res
				//// update online version
				//if (nl[itemKey].googleDocumentId) {
					//googleDocument.updateDocumentData(nl[itemKey].googleDocumentId, res).then(function() {
						//console.log('saved rotated image')
					//})
				//}
			//})
		//}
		//var tune = props.tune
		//tune.files = nl; 
		//props.tunebook.saveTune(tune); 
	//}
   
   
	//function fileInputChanged(e, lk) {
		//utils.onFileSelectedToBase64(e,function(data) {
			//console.log(data,e)
			//var type = e.target.files[0].type
			//var name = e.target.files[0].name
			//console.log(type)
			//if (type.startsWith('image/')) {
				//var files = props.tune.files
				//if (!files[lk]) files[lk] = {}
				//files[lk].data = data
				//files[lk].type = "image"
				//files[lk].name = name
				
				//// TODO create google document and assign id to "data"
				//googleDocument.findTuneBookFolderInDrive().then(function(folderId) {
					//if (folderId)  googleDocument.createDocument(name,utils.dataURItoBlob(data, type),'application/vnd.google-apps.document','ABC Tune Book Image',folderId  ).then(function(res) {
						////console.log(res)
						//if (!res.error)files[lk].googleDocumentId = res
						//var tune = props.tune
						//tune.files = files; 
						//props.tunebook.saveTune(tune); 
						//setWarningRow(lk, null)
					//})
				//})
			//} else if (type === 'application/pdf') {
				//var files = props.tune.files
				//if (!files[lk]) files[lk] = {}
				//// TODO create google document and assign id to "data"
				//googleDocument.findTuneBookFolderInDrive().then(function(folderId) {
					//if (folderId) googleDocument.createDocument(name,utils.dataURItoBlob(data, type),'application/vnd.google-apps.document','ABC Tune Book PDF',folderId ).then(function(res) {
						////console.log(res)
						//files[lk].data = data
						//files[lk].type = "pdf"
						//files[lk].name = name
						//if (!res.error) files[lk].googleDocumentId = res
						//var tune = props.tune
						//tune.files = files; 
						//props.tunebook.saveTune(tune); 
						//setWarningRow(lk, null)
					//})
				//})
				
			//// unzip .mxl files and use /score.xml
			//} else if (name.endsWith('.mxl')) {
				//var files = props.tune.files
				//if (!files[lk]) files[lk] = {}
				//console.log('OCTET')
				//// TODO create google document and assign id to "data"
				////googleDocument.findTuneBookFolderInDrive().then(function(folderId) {
					//var b = utils.dataURItoBlob(data, type)
					////if (folderId) googleDocument.createDocument(name,b,'application/vnd.google-apps.document','ABC Tune Book MusicXML File',folderId ).then(function(res) {
						//////console.log(res)
						//////utils.blobToText(b)
						//utils.unzipBlob(b).then(function(entries) {
							//console.log(entries)
							//entries['score.xml'].blob('application/xml').then(function (blob) {
								//utils.blobToText(blob).then(function(text) {
									////console.log(b64)
									//files[lk].data = text
									//files[lk].type = "musicxml"
									//files[lk].name = name
									////if (!res.error) files[lk].googleDocumentId = res
									//var tune = props.tune
									//tune.files = files; 
									//props.tunebook.saveTune(tune); 
									//setWarningRow(lk, null)
								//})
							//})
						//})
					////})
				////})
			//} else {
				//setWarningRow(lk, 'You can only attach image, pdf and musicXML files, not '+type)
			//}
		//})
	//} 

	//function deleteFile(lk) {
		//// TODO warn require login
		//var w = ''
		//if (!props.token && files && files[lk] && files[lk].googleDocumentId) w = ' Login first to delete this file from google drive.'
		//if (window.confirm("Are you sure you want to delete this file?")) {
			//// TODO REMOVE GOOGLE DOC FILE 
			//var files = props.tune.files
			//var fileToDelete = (files.length > lk && files[lk].hasOwnProperty('googleDocumentId')) ? files[lk].googleDocumentId : ''
			//files.splice(lk,1)
			//console.log('DELETE',fileToDelete,files)
			//if (fileToDelete) googleDocument.deleteDocument(fileToDelete).then(function(res) {console.log(res)})
			
			//var tune = props.tune
			//tune.files = files; 
			//props.tunebook.saveTune(tune); 
		//}
	//}

  //const [warnings, setWarnings] = useState({})
  //const [fileUrls, setFileUrls] = useState({})
  //const [waiting, setWaiting] = useState(null)
  
  
  //function setWarningRow(row,message) {
      //var w = warnings
      //w[row] = message
      //setWarnings(w)
      ////props.forceRefresh()
  //}
    
	//function scrapeUrl(lk) {
		//console.log('scrape',lk,fileUrls[lk])
		//if (fileUrls[lk]) {
			//var xhr = new XMLHttpRequest();
			//xhr.responseType = 'blob';

			//xhr.onload = function (res) {
				//console.log(res)
				//var files = Array.isArray(props.tune.files) ? props.tune.files : []
                ////files[lk] = utils.blobToBase64(res.response)
                ////props.tune.files[lk].type
                //if (files.length > lk) {
					//var file =  files[lk] ? files[lk] : {}
					//file.type='image'
					//utils.blobToBase64(xhr.response).then(function(b64) {
						//file.data = b64
						//files[lk] = file
						//var tune = props.tune
						//tune.files = files; 
						//props.tunebook.saveTune(tune); 
					//})
				//}
				//setWaiting(null)
			//};
			//setWaiting(true)
			//xhr.open('GET', fileUrls[lk]);
			//xhr.send();
		//}
  //}  
    
	////const [osmdText, setOsmdText] = useState([])
	////useEffect(function() {
		////var promises = []
		////Array.isArray(props.tune.files) && props.tune.files.map(function(file,lk) {
			////if (file.data)  {
				////promises.push(utils.blobToText(utils.dataURItoBlob(file.data)))
			////}
		////})
		////Promise.all(promises).then(function(res) {
			////setOsmdText(res)
		////})
	////}, [props.tune && props.tune.files ? props.tune.files.length : 0])
    
    
    
  //return (
    //<div  >
       //<div style={{textAlign:'right'}} >
          
         
          //{<Button style={{marginLeft:'0.3em',color:'black'}} variant="success" onClick={function() {
                //var files = Array.isArray(props.tune.files) ? props.tune.files : []
                //files.unshift({data:''})
                //var tune = props.tune
                //tune.files = files; 
                //props.tunebook.saveTune(tune); 
            //}} >{props.tunebook.icons.add} New File</Button>}
        //</div>
        //<Form >
            //<div style={{clear:'both'}}>
                
            //{(props.tune && Array.isArray(props.tune.files)) && props.tune.files.map(function(file,lk) {
                ////console.log(file,lk)
                //var hasFileData = (props.tune.files.length >= lk && props.tune.files[lk].hasOwnProperty('data') && props.tune.files[lk].data > 0) 
                ////var b = hasFileData ? utils.dataURItoBlob(props.tune.files[lk].data,'text/plain') : new Blob()
                ////console.log(b)
                
                //return <div key={lk} style={{marginTop:'0.3em', backgroundColor:'lightgrey', border:'1px solid black', padding:'0.3em'}} >
                    
                    
                    //{(warnings[lk] && warnings[lk].length  > 0) && <b>{warnings[lk]}</b>}
                    
                    //<Form.Group style={{borderBottom:'2px solid black', marginBottom:'0.3em' ,width:'100%'}} >
						//<div style={{float:'right'}}>
							//<Button onClick={function() {
								//moveListItemUp(lk)
							//}} >{props.tunebook.icons.arrowup}</Button>
							//<Button onClick={function() {
								//moveListItemDown(lk)
							//}} >{props.tunebook.icons.arrowdown}</Button>
							
							//{(props.tune.files[lk] && props.tune.files[lk].type === 'image') && <div style={{ marginTop:'0.3em', marginBottom:'0.3em'}}>
							//<Button onClick={function() {
								//rotateLeft(lk)
							//}} >{props.tunebook.icons.anticlockwise}</Button>
							//<Button onClick={function() {
								//rotateRight(lk)
							//}} >{props.tunebook.icons.clockwise}</Button>
							//</div>}
						
							//<Button variant="danger" style={{marginLeft:'0.2em', float:'right'}} onClick={function() {deleteFile(lk)}} >{props.tunebook.icons.deletebin}</Button>
                        //</div>
                      
                        //{!hasFileData && <Form.Label>Select a file</Form.Label> }
                        
                        //{!hasFileData && <Form.Control  type='file'  accept="*" onChange={function(d) {
							//fileInputChanged(d,lk)
							//// image/*,application/pdf,application/octet-stream
						//}} />}
                       
                        //{!hasFileData && <Form.Label >or Download a URL</Form.Label> }
                       
                         //<Row><Col>{!hasFileData && <Form.Control  type='text'  value={fileUrls[lk]} onChange={function(e){
							 //var f = fileUrls
							 //f[lk] = e.target.value
							 ////console.log(f)
							 //setFileUrls(f)
						 //}} />}</Col>
						 
						 //<Col>{!hasFileData && <Button onClick={function() {scrapeUrl(lk)}} variant='success' >Download</Button>}</Col></Row>
                        
                          
                        //{(Array.isArray(props.tune.files) && props.tune.files.length > lk) && <div>
						   //<div onClick={function() {setTimeout(function() { props.tunebook.utils.scrollTo('scrolltofile_'+lk); },200); props.handleClose();}} > {(props.tune.files[lk] &&  props.tune.files[lk].type === 'image') ? <img src={props.tune.files[lk].data} style={{width:'200px'}} /> : ''}
                            
                        //{ (props.tune.files[lk] &&  props.tune.files[lk].type === 'pdf') ?  <PDFPreviewViewer width='150' pageNumber='1' tunebook={props.tunebook} style={{width:'100px'}} showPages='1' src={props.tune.files[lk].data} /> : null	}</div>
                        //</div>}
                        
                        
                    //</Form.Group>
                    
                //</div>
            //}) }
            //</div>
            //<br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
            
        //</Form>
    //</div>
  //);
//}

 ////{(props.tune.files[lk] &&  props.tune.files[lk].type === 'musicxml')  && <OpenSheetMusicDisplay file={props.tune.files[lk].data} />}
                       
////<OpenSheetMusicDisplay file={props.tune.files[lk].data} />
////{ (props.tune.files[lk] &&  props.tune.files[lk].type === 'pdf') ?  <object src={props.tune.files[lk].data} style={{width:'200px'}} /> : null}




////  
////<Form.Label  >Type</Form.Label>
                            ////<Form.Select aria-label="Select file type" value={file.type} onChange={function(e) {
                            ////var files = props.tune.files
                            ////if (!files[lk]) files[lk] = {}
                            //////Array.isArray(props.tune.files) && props.tune.files.length > lk ? props.tunes.
                            ////files[lk].type = e.target.value
                            ////var tune = props.tune
                            ////tune.files = files; 
                            ////props.tunebook.saveTune(tune); 
                        ////}  } >
                              ////<option value="audio">Audio</option>
                              ////<option value="image">Image</option>
                              ////<option value="other">Other</option>
                            ////</Form.Select>    
