import {useState, useEffect, useRef} from 'react'
import {Button, ListGroup, Form, Row, Col} from 'react-bootstrap'
import YouTube from 'react-youtube';  
import {Link , useParams , useNavigate} from 'react-router-dom'
import PDFViewer from './PDFViewer'
import useGoogleDocument from '../useGoogleDocument'
import useUtils from '../useUtils'
import OpenSheetMusicDisplay from './OpenSheetMusicDisplay'
import {Modal} from 'react-bootstrap'
import useAudioUtils from '../useAudioUtils'
import FileNameEditorModal from './FileNameEditorModal'

export default function FileRenderer(props) {
	var utils = useUtils()

	return props.file ? <div id={'fileimage-'+props.file.id} >
		{(props.file && props.file.type === 'text/plain' && props.file.data) && <pre>{props.file.data.slice(0,500)}</pre>}
							
			{(props.file && props.file.type.startsWith('image/') && props.file.data) && <div><img src={props.file.data} style={{width:'100%'}} /></div>}
			
			{(props.file && props.file.type === 'application/pdf' && props.file.data) && <div><PDFViewer tunebook={props.tunebook}   showPages={99} style={{width:'100%'}} src={props.file.data} />  </div>}
			
			{(props.file && props.file.type === 'application/musicxml' && props.file.data) && <div style={{textAlign:'center'}} >
				<OpenSheetMusicDisplay file={props.file.data} />
			</div>}
			
			{(props.file && props.file.type.startsWith('audio/')  && props.file.data) && <div><audio controls={true} src={props.file.data} style={{width:'100%'}} /></div>}
			
		
	</div>
	: null
}
