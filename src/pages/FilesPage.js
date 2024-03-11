//import {Link} from 'react-router-dom'
//import {ListGroup, Button, Modal} from 'react-bootstrap'
//import useFileManager from '../useFileManager'
import {useState, useEffect, useRef} from 'react'
//import useUtils from '../useUtils'
//import OpenSheetMusicDisplay from '../components/OpenSheetMusicDisplay'
//import PDFPreviewViewer from '../components/PDFPreviewViewer'
//import useAudioUtils from '../useAudioUtils'
import ImagesManager from '../components/ImagesManager'
//import useFileManager from '../useFileManager'

export default function FilesPage(props) {
	var allowedImageMimeTypes = ['text/plain','image/*','application/pdf','.musicxml','.mxl'] //application/musicxml
	var filterByTuneId = false
	//var fileManager = useFileManager('files',props.token ? props.token : null, props.logout, null, allowedImageMimeTypes, false, filterByTuneId)
	
	useEffect(function() {
		props.fileManager.refresh()
	},[])
	
	var extendedProps = Object.assign({},props,{fileManager: props.fileManager})
	return <ImagesManager	{...extendedProps} />
}
	//var allowedMimeTypes = ['text/plain','image/*','application/pdf','.musicxml','.mxl'] //application/musicxml
	//var fileManager = useFileManager('files',props.token ? props.token : null, props.logout, null, allowedMimeTypes)
	//var utils = useUtils()
	//var audioUtils = useAudioUtils()
	//var [previewFile, setPreviewFile] = useState(null)
	//var [recordingDuration, setRecordingDuration] = useState(0)
	//var recordingInterval = null	
	//const recordingStartedAt = useRef(0)

	//function displayPreview(file) {
		//// load file with data
		//fileManager.load(file.id).then(function(loadedFile) {
			//setPreviewFile(loadedFile)
		//})
	//}
	
	//function startRecording() {
		//recordingStartedAt.current = new Date().getTime()
		//setRecordingDuration(0)
		//recordingInterval = setInterval(function() {
			////console.log( recordingStartedAt, new Date().getTime())
			//setRecordingDuration(parseInt((new Date().getTime() - recordingStartedAt.current)/1000))
		//},1000)
		//audioUtils.startRecording().then(function(data) {
			//clearInterval(recordingInterval)
			//console.log('captured', data)
			//utils.blobToBase64(data).then(function(b64) {
				//fileManager.save({id: utils.generateObjectId(), name:'Recording '+new Date().toLocaleString(), data: b64, createdTimestamp : new Date(), updatedTimestamp : new Date(),  type:'audio/wav'}).then(function(file) {
					//fileManager.addFiles([file])
				//})
			//})
		//})
	//}
	
////(previewFile && previewFile.id) && 
	//return <div>
		 //{<Modal show={(previewFile && fileManager.allowMime(previewFile.type))} onHide={function() { setPreviewFile(null)}} > 
			 
			//<Modal.Header closeButton>
			  //<Modal.Title>Preview</Modal.Title>
			//</Modal.Header>
			//<Modal.Body>
			 //{(previewFile && previewFile.type === 'text/plain' && previewFile.data) && <pre>{previewFile.data.slice(0,500)}</pre>}
							
			//{(previewFile && previewFile.type.startsWith('image/') && previewFile.data) && <div><img src={previewFile.data} style={{width:'100%'}} /></div>}
			
			//{(previewFile && previewFile.type === 'application/pdf' && previewFile.data) && <div><PDFPreviewViewer tunebook={props.tunebook} width='350'  style={{width:'100%'}} src={previewFile.data} />  </div>}
			
			//{(previewFile && previewFile.type === 'application/musicxml' && previewFile.data) && <div style={{textAlign:'center'}} >
				//<OpenSheetMusicDisplay file={previewFile.data} />
			//</div>}
			
			//{(previewFile && previewFile.type.startsWith('audio/')  && previewFile.data) && <div><audio controls={true} src={previewFile.data} style={{width:'100%'}} /></div>}
			
			//</Modal.Body>	 
			 
		//</Modal>}
		 //<div style={{backgroundColor:'#1900ff1a', padding:'0.5em', border:'1px solid black'}} > 
		  //<h3>Images</h3>
		//<Button variant="outline-success" size="sm" style={{float:'right'}} onClick={fileManager.pasteFiles} >{props.tunebook.icons.paste}</Button>
		
		//<span style={{marginRight:'1em', width:'4em', overflow:'hidden', float:'right'}} ><input multiple={true} type='file'  className='custom-file-input-button' accept={Array.isArray(allowedMimeTypes) ? allowedMimeTypes.join(",") : '*'}  onChange={fileManager.filesSelected} /></span>
		
		
		//{fileManager.warning && <div style={{fontSize:'1.3em', color:'red', backgroundColor:'pink', width:'10em', float:'right', clear:'both'}} >{fileManager.warning}</div>}
		
		//<input type='search' value={fileManager.filter} onChange={function(e) {fileManager.setFilter(e.target.value)}} />
		//</div>
		//<ListGroup style={{marginTop:'1em'}} >
			//{fileManager.filtered.map(function(file, fk) {
				//return <ListGroup.Item key={fk} style={{width:'100%', borderTop:'1px solid black'}}>
					//<div style={{width:'100%', float:'left'}} key={fk} >
						//<div style={{width:'100%'}} >
							//<Button variant="danger" style={{float:'right'}} onClick={function() {fileManager.deleteFile(file,fk)}} >{props.tunebook.icons.deletebin}</Button>
							
							//{<Button onClick={function() {displayPreview(file)}} style={{marginBottom:'0.5em'}}>{props.tunebook.icons.search}</Button>}
							
							//{(props.tune && props.tune.name) && <span style={{marginLeft:'0.5em', fontWeight:'bold'}} >{props.tune.name}</span>}
							
							//<span style={{marginLeft:'0.5em'}} >{file.name}</span>
							
							
							//{<Button variant="outline-primary" style={{marginLeft:'0.5em',marginBottom:'0.5em'}}>{file.type}</Button>}
							
							//{file.updatedTimestamp && <Button variant="outline-primary" style={{marginLeft:'0.5em',marginBottom:'0.5em'}}>{file.updatedTimestamp.toLocaleString()}</Button>}
							
						//</div>
					//</div>
			//</ListGroup.Item>
		//})}
		//</ListGroup>
	//</div>
//}

////{audioUtils.isRecording && <><Button style={{color:'black', fontWeight:'bold', float:'right', marginRight:'1em', height:'2.2em'}} onClick={audioUtils.stopRecording} variant="danger" >{props.tunebook.icons.stopsmall}</Button><Button style={{color:'black', fontWeight:'bold', float:'right', marginRight:'0.2em', height:'2.2em'}} variant="outline-danger">{recordingDuration + 1}s</Button></>}
		
		////{!audioUtils.isRecording && <Button size="sm" style={{fontWeight:'bold', float:'right', marginRight:'1em', height:'2.2em'}} onClick={startRecording} variant="success" >{props.tunebook.icons.recordcircle}</Button>}
		


	////<span style={{marginRight:'0.3em', clear:'both', float:'left'}} >
								////{file.type === 'pdf' && <PDFPreviewViewer width='150' pageNumber='1' tunebook={props.tunebook} style={{width:'100px'}} showPages='1' src={file.data} />  }
								////{file.type === 'image' && <img  style={{width:'150px'}} src={file.data} />  }
							////</span>

	////{JSON.stringify(files)}
		
	////return "Files"
////}s


////import PDFPreviewViewer from '../components/PDFPreviewViewer'
////import useGoogleDocument from '../useGoogleDocument'
////export default function FilesPage(props) {
   
    ////const googleDocument = useGoogleDocument(props.token, props.logout)

   	////function deleteFile(tune, lk) {
		////// TODO warn require login
		////var w = ''
		////if (!props.token && files && files[lk] && files[lk].googleDocumentId) w = ' Login first to delete this file from google drive.'
		////if (window.confirm("Are you sure you want to delete this file?" + w)) {
			////// TODO REMOVE GOOGLE DOC FILE 
			////var files = tune.files
			////var fileToDelete = (files.length > lk && files[lk].hasOwnProperty('googleDocumentId')) ? files[lk].googleDocumentId : ''
			////files.splice(lk,1)
			////console.log('DELETE',fileToDelete,files)
			////if (fileToDelete) googleDocument.deleteDocument(fileToDelete).then(function(res) {console.log(res)})
			
			////tune.files = files; 
			////props.tunebook.saveTune(tune); 
		////}
	////}
   
  ////return (
    ////<div style={{marginLeft:'1em'}} >
		////<h1>Image/PDF Files</h1>
		////<div>Search <input type='text' /></div>
		////<ListGroup>
		////{Object.values(props.tunes).filter(function(tune) {
			////return (Array.isArray(tune.files) && tune.files.length > 0) ? true : false
		////}).map(function(tune) {
			////return <ListGroup.Item style={{width:'100%', borderTop:'1px solid black'}}>
				////<div style={{float:'right', width:'100%'	}}>
				////{tune.files.map(function(file, fk) {
					////return <div style={{width:'100%', float:'left'}} key={fk} >
						////<div style={{width:'100%'}} >
							////<Button variant="danger" style={{float:'right'}} onClick={function() {deleteFile(tune, fk)}} >{props.tunebook.icons.deletebin}</Button>
							////<Link style={{float:'left'}} to={"/tunes/"+tune.id} ><Button style={{marginBottom:'0.5em'}}>{tune.name}</Button></Link>
							////<span style={{marginRight:'0.3em', clear:'both', float:'left'}} >
								////{file.type === 'pdf' && <PDFPreviewViewer width='150' pageNumber='1' tunebook={props.tunebook} style={{width:'100px'}} showPages='1' src={file.data} />  }
								////{file.type === 'image' && <img  style={{width:'150px'}} src={file.data} />  }
							////</span>
						////</div>
					////</div>
				////})}
				////</div>
			////</ListGroup.Item>
		////})}
		////</ListGroup>
    ////</div>
  ////);
////}
 

	////function fileInputChanged(e, lk) {
		////utils.onFileSelectedToBase64(e,function(data) {
			////console.log(data,e)
			////var type = e.target.files[0].type
			////var name = e.target.files[0].name
			////console.log(type)
			////if (type.startsWith('image/')) {
				////var files = props.tune.files
				////if (!files[lk]) files[lk] = {}
				////files[lk].data = data
				////files[lk].type = "image"
				////files[lk].name = name
				
				////// TODO create google document and assign id to "data"
				////googleDocument.findTuneBookFolderInDrive().then(function(folderId) {
					////if (folderId)  googleDocument.createDocument(name,utils.dataURItoBlob(data, type),'application/vnd.google-apps.document','ABC Tune Book Image',folderId  ).then(function(res) {
						//////console.log(res)
						////if (!res.error)files[lk].googleDocumentId = res
						////var tune = props.tune
						////tune.files = files; 
						////props.tunebook.saveTune(tune); 
						////setWarningRow(lk, null)
					////})
				////})
			////} else if (type === 'application/pdf') {
				////var files = props.tune.files
				////if (!files[lk]) files[lk] = {}
				////// TODO create google document and assign id to "data"
				////googleDocument.findTuneBookFolderInDrive().then(function(folderId) {
					////if (folderId) googleDocument.createDocument(name,utils.dataURItoBlob(data, type),'application/vnd.google-apps.document','ABC Tune Book PDF',folderId ).then(function(res) {
						//////console.log(res)
						////files[lk].data = data
						////files[lk].type = "pdf"
						////files[lk].name = name
						////if (!res.error) files[lk].googleDocumentId = res
						////var tune = props.tune
						////tune.files = files; 
						////props.tunebook.saveTune(tune); 
						////setWarningRow(lk, null)
					////})
				////})
				
			////// unzip .mxl files and use /score.xml
			////} else if (name.endsWith('.mxl')) {
				////var files = props.tune.files
				////if (!files[lk]) files[lk] = {}
				////console.log('OCTET')
				////// TODO create google document and assign id to "data"
				//////googleDocument.findTuneBookFolderInDrive().then(function(folderId) {
					////var b = utils.dataURItoBlob(data, type)
					//////if (folderId) googleDocument.createDocument(name,b,'application/vnd.google-apps.document','ABC Tune Book MusicXML File',folderId ).then(function(res) {
						////////console.log(res)
						////////utils.blobToText(b)
						////utils.unzipBlob(b).then(function(entries) {
							////console.log(entries)
							////entries['score.xml'].blob('application/xml').then(function (blob) {
								////utils.blobToText(blob).then(function(text) {
									//////console.log(b64)
									////files[lk].data = text
									////files[lk].type = "musicxml"
									////files[lk].name = name
									//////if (!res.error) files[lk].googleDocumentId = res
									////var tune = props.tune
									////tune.files = files; 
									////props.tunebook.saveTune(tune); 
									////setWarningRow(lk, null)
								////})
							////})
						////})
					//////})
				//////})
			////} else {
				////setWarningRow(lk, 'You can only attach image, pdf and musicXML files, not '+type)
			////}
		////})
	////} 
	
	
	
