import {Tabs, Tab, Modal, Button} from 'react-bootstrap'
import DiffModal from './DiffModal'
export default function MergeWarningDialog(props) {
//console.log('MW',props.sheetUpdateResults)
return <Modal.Dialog 
  backdrop="static"
  style={{minWidth:'95%'}} 
  keyboard="false"  >
      <Modal.Header closeButton>
        <Modal.Title>Update Warning</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Button variant="success"  style={{float:'right'}} onClick={function(e) { props.tunebook.downloadTuneBookAbc();}}  >
            {props.tunebook.icons.save}  Download Tune Book
          </Button>
        <p>This database is different to what is stored in Google Drive. </p>
        {props.sheetUpdateResults && <><p>To merge the changes </p>
         {Object.keys(props.sheetUpdateResults.localUpdates).length ?<div><b>{Object.keys(props.sheetUpdateResults.localUpdates).length}</b> items updated locally will be saved</div>: ''}
         {Object.keys(props.sheetUpdateResults.inserts).length ? <div><b>{Object.keys(props.sheetUpdateResults.inserts).length}</b> items will be inserted</div>: ''}
        {Object.keys(props.sheetUpdateResults.updates).length ?<div><b>{Object.keys(props.sheetUpdateResults.updates).length}</b> items will be updated</div>: ''}
        {Object.keys(props.sheetUpdateResults.deletes).length ?<div><b>{Object.keys(props.sheetUpdateResults.deletes).length}</b> items that only exist locally will be saved. These may have been deleted on another device in which case you should discard your local differences.</div>: ''}
        {Object.keys(props.sheetUpdateResults.filesToLoad).length ?<div><b>{Object.keys(props.sheetUpdateResults.filesToLoad).length}</b> missing files will be loaded.</div>: ''}
        {Object.keys(props.sheetUpdateResults.filesToSave).length ?<div><b>{Object.keys(props.sheetUpdateResults.filesToSave).length}</b> files will be saved online.</div>: ''}
        
        <div style={{marginTop:'1em', marginBottom:'1em'}} >
          
          
          <Button variant="warning" onClick={props.closeWarning} >Logout</Button>
          &nbsp;{(Object.keys(props.sheetUpdateResults.localUpdates).length > 0 || Object.keys(props.sheetUpdateResults.deletes).length) ? <Button variant="danger" onClick={function() {props.overrideTuneBook(props.sheetUpdateResults.fullSheet)}} >Discard Local Differences</Button> : null}
          &nbsp;<Button variant="success" onClick={props.acceptChanges} >Merge</Button>
          
        </div>
        <Tabs>
          <Tab eventKey="inserts" title="Inserted" >
            {Object.values(props.sheetUpdateResults.inserts).map(function(v,k) {
              return <div key={k} >{v.name}</div>
            })}
          </Tab>
          <Tab eventKey="updates" title="Updated" >
          {Object.values(props.sheetUpdateResults.updates).map(function(v,k) {
              return <div style={{marginTop:'0.3em', borderTop:'1px solid black'}} key={k} >{v[0].name}&nbsp;&nbsp;&nbsp;<DiffModal label={'Show Differences'} original={props.tunebook.abcTools.json2abc(v[0])}  modified={props.tunebook.abcTools.json2abc(v[1])} /></div>
            })}
          </Tab>
          <Tab eventKey="deletes" title="New tunes" >
          {Object.values(props.sheetUpdateResults.deletes).map(function(v,k) {
              return <div key={k} >{v.name}</div>
            })}
          </Tab>
          <Tab eventKey="local" title="Local Updates" >
          {Object.values(props.sheetUpdateResults.localUpdates).map(function(v,k) {
              return <div  style={{marginTop:'0.3em', borderTop:'1px solid black'}}  key={k} >{v[0].name}&nbsp;&nbsp;&nbsp;&nbsp;<DiffModal label={'Show Differences'} original={props.tunebook.abcTools.json2abc(v[0])}  modified={props.tunebook.abcTools.json2abc(v[1])} /></div>
            })}
          </Tab>
        </Tabs>
        </>}
      </Modal.Body>

      
    </Modal.Dialog>
}
