import {useState, useEffect, useRef} from 'react'
import {Button, ListGroup, Form, Row, Col} from 'react-bootstrap'
import {Link , useParams , useNavigate} from 'react-router-dom'
import PDFPreviewViewer from './PDFPreviewViewer'
import useUtils from '../useUtils'
import OpenSheetMusicDisplay from './OpenSheetMusicDisplay'

function onChange(newFiles) {
	var tune = props.tune
	tune.files = newFiles; 
	props.tunebook.saveTune(tune); 
}
export default function FileManager(props) {
	return null
}

    //const navigate = useNavigate()
    //const fileManager = useFileManager('files',props.token, props.logout)
	//var utils = useUtils();
	
	//function moveListItemDown(itemKey) {
		//var nl = props.files
		//if (itemKey + 1 < nl.length) {
			//var tmp = nl[itemKey]
			//nl[itemKey] = nl[itemKey + 1]
			//nl[itemKey + 1] = tmp
		//}
		//props.onChange(nl)
  //}
   
	//function moveListItemUp(itemKey) {
		//var nl = props.files
		//if (itemKey > 0) {
			//var tmp = nl[itemKey]
			//nl[itemKey] = nl[itemKey - 1]
			//nl[itemKey - 1] = tmp
		//}
		//props.onChange(nl)
	//} 
 
   
	//function fileInputChanged(e, lk) {
		//utils.onFileSelectedToBase64(e,function(data) {
			//console.log(data,e)
			//var type = e.target.files[0].type
			//var name = e.target.files[0].name
			//console.log(type)
			//if (type.startsWith('image/')) {
				//var files = props.files
				//if (!files[lk]) files[lk] = {}
				//files[lk].data = data
				//files[lk].type = "image"
				//files[lk].name = name
				
				//// TODO create google document and assign id to "data"
				//googleDocument.findTuneBookFolderInDrive().then(function(folderId) {
					//if (folderId)  googleDocument.createDocument(name,utils.dataURItoBlob(data, type),'application/vnd.google-apps.document','ABC Tune Book Image',folderId  ).then(function(res) {
						////console.log(res)
						//if (!res.error) files[lk].googleDocumentId = res
						//props.onChange(files) 
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
						//props.onChange(files) 
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
									//props.onChange(files) 
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
			
			//props.onChange(files)  
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
						//props.onChange(files)  
					//})
				//}
				//setWaiting(null)
			//};
			//setWaiting(true)
			//xhr.open('GET', fileUrls[lk]);
			//xhr.send();
		//}
  //}  
  
  
  //function newFile() {
		//var files = Array.isArray(props.tune.files) ? props.tune.files : []
		//files.unshift({data:''})
		//props.onChange(files) 
	//}
    
  //return (
    //<div  >
       //<div style={{textAlign:'right'}} >
          
         
          //{<Button style={{marginLeft:'0.3em',color:'black'}} variant="success" onClick={newFile} >{props.tunebook.icons.add} New File</Button>}
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
                        
                        //{(props.tune.files[lk] &&  props.tune.files[lk].type === 'musicxml')  && <OpenSheetMusicDisplay file={props.tune.files[lk].data} />}
                        
                    //</Form.Group>
                    
                //</div>
            //}) }
            //</div>
            //<br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
            
        //</Form>
    //</div>
  //);
//}
