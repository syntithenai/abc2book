import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ReviewNotationMergePanel from './ReviewNotationMergePanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('./Abc', function() {
  const React = require('react');
  return function Abc(props) {
    return React.createElement('div', {
      'data-testid': 'abc-preview',
      'data-scale': props.scale,
    }, props.abc);
  };
});

jest.mock('react-bootstrap', function() {
  const React = require('react');
  function Tabs(props) {
    return React.createElement('div', { 'data-testid': 'tabs' },
      React.Children.map(props.children, function(child) {
        if (!child) return null;
        return React.createElement('button', {
          type: 'button',
          'data-testid': 'tab-' + child.props.eventKey,
          'data-active': props.activeKey === child.props.eventKey ? 'true' : 'false',
          onClick: function() {
            if (typeof props.onSelect === 'function') props.onSelect(child.props.eventKey);
          },
        }, child.props.title);
      }),
      props.children
    );
  }
  function Tab() { return null; }
  function FormControl(props) {
    if (props.as === 'textarea') {
      return React.createElement('textarea', props);
    }
    return React.createElement('input', props);
  }
  const Form = { Label: function(p) { return React.createElement('label', p); }, Control: FormControl };
  function Alert(props) {
    return React.createElement('div', props, props.children);
  }
  return { Tabs: Tabs, Tab: Tab, Form: Form, Alert: Alert };
});

describe('ReviewNotationMergePanel', function() {
  test('tab labels are Use current / Use import and selecting applies value', async function() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onChange = jest.fn();

    await act(async function() {
      root.render(React.createElement(ReviewNotationMergePanel, {
        currentText: 'C D E |',
        importedText: 'G A B |',
        metadata: { meter: '4/4', key: 'C' },
        tunebook: {},
        onChange: onChange,
      }));
    });

    expect(container.textContent).toContain('Use current');
    expect(container.textContent).toContain('Use import');
    expect(container.querySelectorAll('[data-testid="review-notation-merge-abc"]').length).toBe(1);
    expect(container.querySelector('[data-testid="review-notation-merge-abc"]').rows).toBe(5);
    expect(container.querySelector('[data-testid="abc-preview"]').getAttribute('data-scale')).toBe('0.5');

    await act(async function() {
      container.querySelector('[data-testid="tab-import"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });
    expect(onChange).toHaveBeenCalledWith('G A B |');

    await act(async function() {
      root.unmount();
    });
    container.remove();
  });
});
