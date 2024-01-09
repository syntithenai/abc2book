/**
 * @class ReactNoSleep
 */

import * as React from 'react';
import NoSleepJs from 'nosleep.js';

export type NoSleepProps = {
  enable: () => void;
  disable: () => void;
  isOn: boolean;
};

export type Props = { children: (childProps: NoSleepProps) => JSX.Element };

type States = {
  isOn: boolean;
};

export default class ReactNoSleep extends React.Component<Props, States> {
  constructor(props: Props) {
    super(props);
    this._noSleep = new NoSleepJs();
    this.state = {
      isOn: false
    };
  }

  render() {
    return this.props.children({
      isOn: this.state.isOn,
      enable: this.handleEnable,
      disable: this.handleDisable
    });
  }

  handleEnable = () => {
    this._noSleep.enable();
    this.setState({
      isOn: true
    });
  };

  handleDisable = () => {
    this._noSleep.disable();
    this.setState({
      isOn: false
    });
  };

}
