import React from 'react';
import { RetinaImg, Tooltip } from 'actunamail-component-kit';
import { localized, PropTypes, Actions } from 'actunamail-exports';

export class DraftDeleteButton extends React.Component<{ selection: any }> {
  static displayName = 'DraftDeleteButton';
  static containerRequired = false;

  static propTypes = {
    selection: PropTypes.object.isRequired,
  };

  render() {
    return (
      <Tooltip content={localized('Delete')}>
        <button
          style={{ order: -100 }}
          className="btn btn-toolbar"
          aria-label={localized('Delete')}
          onClick={this._onDestroySelected}
        >
          <RetinaImg
            name="icon-composer-trash.png"
            mode={RetinaImg.Mode.ContentIsMask}
            aria-hidden="true"
          />
        </button>
      </Tooltip>
    );
  }

  _onDestroySelected = () => {
    for (const item of this.props.selection.items()) {
      Actions.destroyDraft(item);
    }
    this.props.selection.clear();
    return;
  };
}
