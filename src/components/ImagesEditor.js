import {useState, useEffect, useRef} from 'react'
import {Button, ListGroup, Form} from 'react-bootstrap'
import YouTube from 'react-youtube';  
import {Link , useParams , useNavigate} from 'react-router-dom'
import PDFViewer from './PDFViewer'
import useGoogleDocument from '../useGoogleDocument'
import useUtils from '../useUtils'



export default function ImagesEditor(props) {
    const navigate = useNavigate()
    const googleDocument = useGoogleDocument(props.token, props.logout)
	//console.log("DD",props.token, props.tune)
    // TODO AUTOLOAD GOOGLE DOCUMENT (if possible) if link but no data AND cache in file.data
    // TODO single view autoload doc
	var utils = useUtils();
	
	
  function fileSelected (event, callback) {
      function readFile(file){
          var reader = new FileReader();
          reader.onloadend = function(){
              //console.log("loaded",reader.result)
            if (reader.result.trim().length > 0) {
              callback(reader.result)
            }
          }
          if(file){
              reader.readAsDataURL(file);
          }
      }
      readFile(event.target.files[0])
  }

	function fileInputChanged(e, lk) {
		fileSelected(e,function(data) {
			//console.log(data,e)
			var type = e.target.files[0].type
			var name = e.target.files[0].name
			//console.log(type)
			if (type.startsWith('image/')) {
				var files = props.tune.files
				if (!files[lk]) files[lk] = {}
				// TODO create google document and assign id to "data"
				googleDocument.findTuneBookFolderInDrive().then(function(folderId) {
					if (folderId)  googleDocument.createDocument(name,utils.dataURItoBlob(data, type),'application/vnd.google-apps.document','ABC Tune Book Image',folderId  ).then(function(res) {
						//console.log(res)
						files[lk].data = data
						files[lk].type = "image"
						files[lk].name = name
						if (!res.error)files[lk].googleDocumentId = res
						var tune = props.tune
						tune.files = files; 
						props.tunebook.saveTune(tune); 
						setWarningRow(lk, null)
					})
				})
			} else if (type === 'application/pdf') {
				var files = props.tune.files
				if (!files[lk]) files[lk] = {}
				// TODO create google document and assign id to "data"
				googleDocument.findTuneBookFolderInDrive().then(function(folderId) {
					if (folderId) googleDocument.createDocument(name,utils.dataURItoBlob(data, type),'application/vnd.google-apps.document','ABC Tune Book Image',folderId ).then(function(res) {
						//console.log(res)
						files[lk].data = data
						files[lk].type = "pdf"
						files[lk].name = name
						if (!res.error) files[lk].googleDocumentId = res
						var tune = props.tune
						tune.files = files; 
						props.tunebook.saveTune(tune); 
						setWarningRow(lk, null)
					})
				})
			} else {
				setWarningRow(lk, 'You can only attach image and pdf files, not '+type)
			}
		})
	} 

	function deleteFile(lk) {
		// TODO warn require login
		var w = ''
		if (!props.token && files && files[lk] && files[lk].googleDocumentId) w = ' Login first to delete this file from google drive.'
		if (window.confirm("Are you sure you want to delete this file?")) {
			// TODO REMOVE GOOGLE DOC FILE 
			var files = props.tune.files
			var fileToDelete = (files.length > lk && files[lk].hasOwnProperty('googleDocumentId')) ? files[lk].googleDocumentId : ''
			files.splice(lk,1)
			console.log('DELETE',fileToDelete,files)
			if (fileToDelete) googleDocument.deleteDocument(fileToDelete).then(function(res) {console.log(res)})
			
			var tune = props.tune
			tune.files = files; 
			props.tunebook.saveTune(tune); 
		}
	}

  const [warnings, setWarnings] = useState({})
  
  function setWarningRow(row,message) {
      var w = warnings
      w[row] = message
      setWarnings(w)
      //props.forceRefresh()
  }
    
  return (
    <div  >
       <div style={{textAlign:'right'}} >
          
         
          {<Button style={{marginLeft:'0.3em',color:'black'}} variant="success" onClick={function() {
                var files = Array.isArray(props.tune.files) ? props.tune.files : []
                files.unshift({data:''})
                var tune = props.tune
                tune.files = files; 
                props.tunebook.saveTune(tune); 
            }} >{props.tunebook.icons.add} New Image</Button>}
        </div>
        <Form >
            <div style={{clear:'both'}}>
                
            {Array.isArray(props.tune.files) && props.tune.files.map(function(file,lk) {
                //console.log(file,lk)
                return <div key={lk} style={{marginTop:'0.3em', backgroundColor:'lightgrey', border:'1px solid black', padding:'0.3em'}} >
                    
                    
                    {(warnings[lk] && warnings[lk].length  > 0) && <b>{warnings[lk]}</b>}
                    
                    {<Form.Group  style={{clear:'both', height:'2.8em'}} >
                        <Button variant="danger" style={{float:'right'}} onClick={function() {deleteFile(lk)}} >{props.tunebook.icons.deletebin}</Button>
                    </Form.Group>}
                    
                    <Form.Group style={{borderBottom:'2px solid black', marginBottom:'0.3em' ,width:'100%'}} >
                        {(!(props.tune.files.length >= lk && props.tune.files[lk].hasOwnProperty('data') && props.tune.files[lk].data.length > 0)) && <Form.Label>Select a PDF or Image File</Form.Label> }
                        {(!(props.tune.files.length >= lk && props.tune.files[lk].hasOwnProperty('data') && props.tune.files[lk].data.length > 0) ) && <Form.Control  type='file'  accept="image/*,application/pdf" onChange={function(d) {fileInputChanged(d,lk)}} />}
                        {(Array.isArray(props.tune.files) && props.tune.files.length > lk) && <div>
                            {(props.tune.files[lk] &&  props.tune.files[lk].type === 'image') ? <img src={props.tune.files[lk].data} style={{width:'200px'}} /> : ''}
                            { (props.tune.files[lk] &&  props.tune.files[lk].type === 'pdf') ?  <PDFViewer   tunebook={props.tunebook}  showPages='1' src={props.tune.files[lk].data} /> : null	}
                        </div>}
                        
                    </Form.Group>
                    
                </div>
            }) }
            </div>
            <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
            
        </Form>
    </div>
  );
}

//{ (props.tune.files[lk] &&  props.tune.files[lk].type === 'pdf') ?  <object src={props.tune.files[lk].data} style={{width:'200px'}} /> : null}




//  
//<Form.Label  >Type</Form.Label>
                            //<Form.Select aria-label="Select file type" value={file.type} onChange={function(e) {
                            //var files = props.tune.files
                            //if (!files[lk]) files[lk] = {}
                            ////Array.isArray(props.tune.files) && props.tune.files.length > lk ? props.tunes.
                            //files[lk].type = e.target.value
                            //var tune = props.tune
                            //tune.files = files; 
                            //props.tunebook.saveTune(tune); 
                        //}  } >
                              //<option value="audio">Audio</option>
                              //<option value="image">Image</option>
                              //<option value="other">Other</option>
                            //</Form.Select>    
