// Ticket 43b — UX hover discoverability: Tooltip foundation.
//
// Facade component decoupling call sites from underlying implementation.
//
// Today: @floating-ui/react@^0.20 (React 16 compatible).
//   Pinned to 0.20.x because ActunaMail slate editor requires React 16.9.
//   Upgrade path: when Slate is migrated to TipTap/Lexical (deferred ticket,
//   per Sprint 4 architectural deferral), React goes 16 → 17+, and we bump
//   @floating-ui/react to ^0.27.x — same API surface, drop-in.
//
// Future mobile day: swap to @floating-ui/react-native with identical core
// algorithms. Only the render layer changes (FloatingPortal → Modal). Call
// sites in 86+ tooltips around the codebase stay untouched thanks to this
// facade — that's why we wrap floating-ui rather than expose its hooks
// directly.

import React from 'react';
import {
  useFloating,
  useHover,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  useId,
  flip,
  shift,
  offset,
} from '@floating-ui/react';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  delay?: number;
  placement?: 'top' | 'right' | 'bottom' | 'left';
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  delay = 300,
  placement = 'top',
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const { x, y, refs, strategy, context, placement: actualPlacement } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware: [offset(8), flip(), shift({ padding: 6 })],
  });

  const hover = useHover(context, { delay: { open: delay, close: 0 } });
  const dismiss = useDismiss(context, { escapeKey: true });
  const role = useRole(context, { role: 'tooltip' });

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, dismiss, role]);

  const tooltipId = useId();

  // Inject ref + interaction props + aria-describedby onto child.
  // Avoids extra wrapper DOM nodes — keeps semantics of trigger element clean.
  const trigger = React.cloneElement(children, {
    ref: refs.setReference,
    ...getReferenceProps({
      ...(children.props as Record<string, unknown>),
      'aria-describedby': isOpen ? tooltipId : undefined,
    }),
  });

  return (
    <>
      {trigger}
      {isOpen && (
        <FloatingPortal>
          <div
            id={tooltipId}
            ref={refs.setFloating}
            className="actuna-tooltip"
            data-placement={actualPlacement}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0,
            }}
            {...getFloatingProps()}
          >
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
};

export default Tooltip;
