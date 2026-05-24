import React from 'react';
import { localized } from 'actunamail-exports';
import { RetinaImg, Tooltip } from 'actunamail-component-kit';

export const QuotedTextControl: React.FunctionComponent<{
  quotedTextPresent: boolean;
  quotedTextHidden: boolean;
  onUnhide: () => void;
  onRemove: () => void;
}> = (props) => {
  if (!props.quotedTextPresent || !props.quotedTextHidden) {
    return null;
  }
  return (
    <a
      className="quoted-text-control"
      onMouseDown={(e) => {
        if (e.target instanceof HTMLElement && e.target.closest('.remove-quoted-text')) return;
        e.preventDefault();
        e.stopPropagation();
        props.onUnhide();
      }}
    >
      <span className="dots">&bull;&bull;&bull;</span>
      <Tooltip content={localized('Remove quoted text')}>
        <span
          className="remove-quoted-text"
          role="button"
          aria-label={localized('Remove quoted text')}
          onMouseUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            props.onRemove();
          }}
        >
          <RetinaImg
            name="image-cancel-button.png"
            mode={RetinaImg.Mode.ContentPreserve}
            aria-hidden="true"
          />
        </span>
      </Tooltip>
    </a>
  );
};
