import {Button, ButtonGroup, Modal} from 'react-bootstrap'
import {useEffect, useState} from 'react'

import abcjs from 'abcjs'

import useAbcjsParser from '../useAbcjsParser'
import React, { PureComponent } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
 

export default function ParserProblemsDiff(props) {
    var [newValue, setNewValue] = useState(props.abc)
    const [show, setShow] = useState(false);
    const {parse,render} = useAbcjsParser({tunebook: props.tunebook})
    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);
     
    class Diff extends PureComponent {
      render = () => {
        return (
          <ReactDiffViewer oldValue={props.tunebook.abcTools.justNotes(props.abc.trim())} newValue={newValue} splitView={false} />
        );
      };
    }

    function init() {
        var abcParsed = parse(props.abc)
        var t = abcParsed[0]
        var beatLength = t.getBeatLength()
        var rerendered = render(abcParsed,props.abc)
        setNewValue(rerendered)
    }

    useEffect(function() {
          init()
    },[props.abc])
    
    useEffect(function() {
          init()
    },[])

   return (
    <>
      {(props.tunebook.abcTools.justNotes(props.abc.trim()).replaceAll(' ','') !== newValue.replaceAll(' ','')) && <Button  variant="warning"  onClick={handleShow}>
        Merge Warning
      </Button>}
 
      <Modal contentClassName="parser-problems-diff-modal" show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Differences</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Diff/>
        </Modal.Body>
       
      </Modal>
    </>
  );   
    
   
}



