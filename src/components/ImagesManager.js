import {useState, useEffect, useRef} from 'react'
import {Button, ListGroup, Form, Row, Col} from 'react-bootstrap'
import YouTube from 'react-youtube';  
import {Link , useParams , useNavigate} from 'react-router-dom'
import PDFPreviewViewer from './PDFPreviewViewer'
import useGoogleDocument from '../useGoogleDocument'
import useUtils from '../useUtils'
import OpenSheetMusicDisplay from './OpenSheetMusicDisplay'
import {Modal} from 'react-bootstrap'
import useAudioUtils from '../useAudioUtils'
import FileNameEditorModal from './FileNameEditorModal'
import FileInputButton from './FileInputButton'
import VoiceFillInput from './VoiceFillInput'

export default function ImagesManager(props) {
    //var allowedMimeTypes = ['text/plain','image/*','application/pdf','.musicxml','.mxl'] //application/musicxml
	var fileManager = props.fileManager //useFileManager('files',props.token ? props.token : null, props.logout, props.tune, allowedMimeTypes)
	var utils = useUtils()
	var audioUtils = useAudioUtils()
	var [previewFile, setPreviewFile] = useState(null)
	var [recordingDuration, setRecordingDuration] = useState(0)
	var recordingInterval = null	
	const recordingStartedAt = useRef(0)

	function displayPreview(file) {
		if (props.previewAsLink ) {
			utils.scrollTo('fileimage-' + file.id, 70)
			props.handleClose()
		} else {
			// load file with data
			fileManager.load(file.id).then(function(loadedFile) {
				setPreviewFile(loadedFile)
			})
		}
	}
	
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
	
//(previewFile && previewFile.id) && 
	return <div id={JSON.stringify([fileManager.warning])} >
		 {<Modal show={(previewFile && fileManager.allowMime(previewFile.type))} onHide={function() { setPreviewFile(null); }} > 
			 
			<Modal.Header closeButton>
			  <Modal.Title>Preview</Modal.Title>
			</Modal.Header>
			<Modal.Body>
			 {(previewFile && previewFile.type === 'text/plain' && previewFile.data) && <pre>{previewFile.data.slice(0,500)}</pre>}
							
			{(previewFile && previewFile.type.startsWith('image/') && previewFile.data) && <div><img alt="" src={previewFile.data} style={{width:'100%'}} /></div>}
			
			{(previewFile && previewFile.type === 'application/pdf' && previewFile.data) && <div><PDFPreviewViewer tunebook={props.tunebook} width='350'  style={{width:'100%'}} src={previewFile.data} />  </div>}
			
			{(previewFile && previewFile.type === 'application/musicxml' && previewFile.data) && <div style={{textAlign:'center'}} >
				<OpenSheetMusicDisplay file={previewFile.data} />
			</div>}
			
			{(previewFile && previewFile.type.startsWith('audio/')  && previewFile.data) && <div><audio controls={true} src={previewFile.data} style={{width:'100%'}} /></div>}
			
			</Modal.Body>	 
			 
		</Modal>}
		 <div className="app-surface-panel" style={{ marginBottom: '0.5em' }} > 
		  <h3>Images</h3>
		<Button variant="outline-success" size="sm" style={{float:'right'}} onClick={fileManager.pasteFiles} > {props.tunebook.icons.paste}</Button>
		
		<FileInputButton label="Add" variant="success" size="sm" style={{float:'right', marginRight:'1em'}} multiple accept={(fileManager && Array.isArray(fileManager.allowMimeTypes)) ? fileManager.allowMimeTypes.join(",") : '*'} onChange={fileManager.filesSelected} />
		
		{fileManager.warning && <div style={{fontSize:'1.3em', color:'red', backgroundColor:'pink', minWidth:'10em', clear:'both'}} >{fileManager.warning}</div>}
		
		<VoiceFillInput
			layout="wrap"
			useFormControl={false}
			type="search"
			value={fileManager.filter}
			onChange={function(e) { fileManager.setFilter(e.target.value) }}
			setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
			token={props.token}
			fieldKind="search"
		/>
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
									//console.log('laoded for save', orig)
									orig.name = v
									orig.updatedTimestamp = new Date()
									fileManager.save(orig) //.then(function() {props.forceRefresh()})
									//.then(function(file) {
										//fileManager.refresh().then(function() {
											//props.forceRefresh(orig)
										//})
									//})
								})
							}}  /> </span>
							
								{<Button onClick={function() {displayPreview(file)}} style={{marginBottom:'0.5em'}}>{props.tunebook.icons.search}</Button>}
							
							
							{(file.tuneName && file.tuneId) && <Link to={"/tunes/"+file.tuneId}><span style={{marginLeft:'0.5em', fontWeight:'bold'}} >{file.tuneName}<br/></span></Link>}
							
							{(file.tuneName && !file.tuneId) && <span style={{marginLeft:'0.5em', fontWeight:'bold'}} >{file.tuneName}<br/></span>}
							
							
							<span style={{marginLeft:'0.5em'}} >{file.name}</span>
							
							
							{<Button variant="outline-primary" style={{float:'right',marginLeft:'0.5em',marginBottom:'0.5em', marginRight:'0.5em'}}>{file.type}</Button>}
							
							{file.updatedTimestamp && <Button variant="outline-primary" style={{float:'right',marginLeft:'0.5em',marginBottom:'0.5em'}}>{file.updatedTimestamp.toLocaleString()}</Button>}
							
						</div>
					</div>
			</ListGroup.Item>
		})}
		</ListGroup>
	</div>
}
