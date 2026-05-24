import React from 'react';
import { RetinaImg, Tooltip } from 'actunamail-component-kit';
import { localized } from 'actunamail-exports';

interface SubjectLineIconsProps {
  canCollapse: boolean;
  hasCollapsedItems: boolean;

  onPrint: () => void;
  onPopIn: () => void;
  onPopOut: () => void;
  onToggleAllExpanded: () => void;
}

export const SubjectLineIcons: React.FunctionComponent<SubjectLineIconsProps> = (props) => {
  const collapseLabel = props.hasCollapsedItems
    ? localized('Expand All')
    : localized('Collapse All');
  return (
    <div className="message-icons-wrap">
      {props.canCollapse && (
        <Tooltip content={collapseLabel}>
          <div
            role="button"
            tabIndex={0}
            aria-label={collapseLabel}
            onClick={props.onToggleAllExpanded}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.onToggleAllExpanded();
              }
            }}
          >
            <RetinaImg
              name={props.hasCollapsedItems ? 'expand.png' : 'collapse.png'}
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </div>
        </Tooltip>
      )}
      <Tooltip content={localized('Print Thread')}>
        <div
          role="button"
          tabIndex={0}
          aria-label={localized('Print Thread')}
          onClick={props.onPrint}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              props.onPrint();
            }
          }}
        >
          <RetinaImg name="print.png" mode={RetinaImg.Mode.ContentIsMask} aria-hidden="true" />
        </div>
      </Tooltip>
      {AppEnv.isThreadWindow() ? (
        <Tooltip content={localized('Pop thread in')}>
          <div
            role="button"
            tabIndex={0}
            aria-label={localized('Pop thread in')}
            onClick={props.onPopIn}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.onPopIn();
              }
            }}
          >
            <RetinaImg
              name="thread-popin.png"
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </div>
        </Tooltip>
      ) : (
        <Tooltip content={localized('Popout thread')}>
          <div
            role="button"
            tabIndex={0}
            aria-label={localized('Popout thread')}
            onClick={props.onPopOut}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.onPopOut();
              }
            }}
          >
            <RetinaImg
              name="thread-popout.png"
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </div>
        </Tooltip>
      )}
    </div>
  );
};
