import React from 'react';
import { localized, Actions } from 'actunamail-exports';
import { RetinaImg, Tooltip } from 'actunamail-component-kit';

export default class ComposeButton extends React.Component {
  static displayName = 'ComposeButton';

  _onNewCompose = () => {
    Actions.composeNewBlankDraft();
  };

  render() {
    return (
      <Tooltip content={localized('Compose new message')}>
        <button
          className="btn btn-toolbar item-compose"
          aria-label={localized('Compose new message')}
          onClick={this._onNewCompose}
        >
          <RetinaImg
            name="toolbar-compose.png"
            mode={RetinaImg.Mode.ContentIsMask}
            aria-hidden="true"
          />
        </button>
      </Tooltip>
    );
  }
}
