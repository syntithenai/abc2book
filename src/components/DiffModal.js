import {Button, ButtonGroup, Modal} from 'react-bootstrap'
import {useEffect, useState} from 'react'

import abcjs from 'abcjs'

import useAbcjsParser from '../useAbcjsParser'
import React, { PureComponent } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
 

export default function DiffModal(props) {
    const [show, setShow] = useState(false);
    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);
     
    class Diff extends PureComponent {
      render = () => {
        return (
          <ReactDiffViewer oldValue={props.original} newValue={props.modified} splitView={props.splitView ? true : false} />
        );
      };
    }

   return (
    <>
      <Button  variant="warning"  onClick={handleShow}>
        {props.label ? props.label : "Diff"}
      </Button>
 
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
