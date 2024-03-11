import { pdfjs } from 'react-pdf';
import { Document, Page, Outline , Thumbnail} from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';  
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {useState, useEffect, useRef} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import useWindowSize from '../useWindowSize'
import utilsFunctions from '../utilsFunctions' 
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString(); 


export default function PDFPreviewViewer(props) {
	var utils = utilsFunctions()
	

	function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
	}
	
	
	return <div style={props.style ? props.style : {width:'100px'}} >
		{<Document file={props.src} onLoadSuccess={onDocumentLoadSuccess}>
		
			<Page pageNumber={1} width={props.width > 0 ? props.width : 150} >
				
			</Page>
				
		</Document>}
		
	</div>
	
}
	
//
			
