import React, { Component } from 'react';
import { OpenSheetMusicDisplay as OSMD } from 'opensheetmusicdisplay';

class OpenSheetMusicDisplay extends Component {
    constructor(props) {
      super(props);
      this.state = { dataReady: false };
      this.osmd = undefined;
      this.divRef = React.createRef();
    }
  
    setupOsmd() {
		//console.log(this.props	)
      //var config = typeof this.props.config === 'object' ? this.props.config : {}
      //console.log(config)
      var options = {}
      options = Object.assign(options,{
        autoResize: this.props.autoResize !== undefined ? this.props.autoResize : true,
        drawTitle: this.props.drawTitle !== undefined ? this.props.drawTitle : true,
      })
      //options = Object.assign(options,config)
      //if (this.divRef.current && this.props.width && this.props.width.trim().length > 0) this.divRef.current.style.width = this.props.width
      //console.log(this.divRef.current.style.width)
      this.osmd = new OSMD(this.divRef.current, options);
      //this.osmd.load(this.props.file).then(() => this.osmd.render());
    }
  
    resize() {
      if (this.forceUpdate) this.forceUpdate();
    }
  
    componentWillUnmount() {
      window.removeEventListener('resize', this.resize)
    }
  
    componentDidUpdate(prevProps) {
      if (this.props.drawTitle !== prevProps.drawTitle) {
        this.setupOsmd();
      } else {
        this.osmd.load(this.props.file).then(() => this.osmd.render());
      }
      window.addEventListener('resize', this.resize)
    }
  
    // Called after render
    componentDidMount() {
      this.setupOsmd();
    }
  
    render() {
      return (<div ref={this.divRef} />);
    }
  }

  export default OpenSheetMusicDisplay;
