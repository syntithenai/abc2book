import {useState, useEffect, useRef} from 'react'
import {Button, ListGroup, Form} from 'react-bootstrap'
import YouTube from 'react-youtube';  
import {Link , useParams , useNavigate} from 'react-router-dom'

export default function ImagesEditor(props) {
    const navigate = useNavigate()

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

  const [warnings, setWarnings] = useState({})
  
  function setWarningRow(row,message) {
      var w = warnings
      w[row] = message
      setWarnings(w)
      props.forceRefresh()
  }
    
  return (
    <div  >
        <div style={{textAlign:'right'}} >
          
          <Button style={{marginLeft:'0.3em',color:'black'}} variant="success" onClick={function() {
                var files = Array.isArray(props.tune.files) ? props.tune.files : []
                
                files.unshift({data:''})
                var tune = props.tune
                tune.files = files; 
                props.tunebook.saveTune(tune); 
            }} >{props.tunebook.icons.add} New Image</Button>
        </div>
        <Form >
            <div style={{clear:'both'}}>
                
            {Array.isArray(props.tune.files) && props.tune.files.map(function(file,lk) {
                //console.log(file,lk)
                return <div key={lk} style={{marginTop:'0.3em', backgroundColor:'lightgrey', border:'1px solid black', padding:'0.3em'}} >
                    
                    
                    {(warnings[lk] && warnings[lk].length  > 0) && <b>{warnings[lk]}</b>}
                    
                    
                    <Form.Group  >
                        <Button variant="danger" style={{float:'right'}} onClick={function() {
                            if (window.confirm("Are you sure you want to delete this file?")) {
                                var files = props.tune.files
                                files.splice(lk,1)
                                var tune = props.tune
                                tune.files = files; 
                                props.tunebook.saveTune(tune); 
                            }
                        }} >{props.tunebook.icons.deletebin}</Button>
                    </Form.Group>
                    
                    <Form.Group style={{borderBottom:'2px solid black', marginBottom:'0.3em' ,width:'100%'}} >
                        <Form.Label></Form.Label> 
                        <Form.Control  type='file' accept="image/*" onChange={function(e) {
                            fileSelected(e,function(data) {
                                //console.log(data,e)
                                var type = e.target.files[0].type
                                if (type.startsWith('image/')) {
                                    var files = props.tune.files
                                    if (!files[lk]) files[lk] = {}
                                    files[lk].data = data
                                    files[lk].type = "image"
                                    var tune = props.tune
                                    tune.files = files; 
                                    props.tunebook.saveTune(tune); 
                                    setWarningRow(lk, null)
                                } else {
                                    setWarningRow(lk, 'You can only attach image files, not '+type)
                                }
                            })
                        }  } />
                        {(Array.isArray(props.tune.files) && props.tune.files.length > lk) && <div>
                            {props.tune.files[lk] ? <img src={props.tune.files[lk].data} style={{width:'200px'}} /> : ''}
                            
                        </div>}
                    </Form.Group>
                    
                </div>
            }) }
            </div>
        </Form>
    </div>
  );
}
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
