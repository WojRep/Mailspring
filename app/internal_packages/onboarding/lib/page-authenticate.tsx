import React from 'react';
import { PropTypes } from 'mailspring-exports';
import * as OnboardingActions from './onboarding-actions';

// WS1-E: replaces upstream Mailspring's authenticate page, which loaded
// id.getmailspring.com/onboarding in a webview before the user clicked
// "Skip" (per analysis/01-... finding T3.D — the leak that contradicted
// SECURITY.md statement #3). Actuna Mail has no Mailspring ID, so this
// page is unreachable from the normal flow (OnboardingStore now sends
// returning users to 'account-choose'). The component is retained as a
// safety net: if any code path resurrects it, it skips through with a
// {skipped: true} response and does not contact any external server.

export default class AuthenticatePage extends React.Component {
  static displayName = 'AuthenticatePage';

  static propTypes = {
    account: PropTypes.object,
  };

  componentDidMount() {
    // No external authentication needed; auto-progress.
    OnboardingActions.identityJSONReceived({ skipped: true });
  }

  render() {
    return (
      <div className="page authenticate">
        <div style={{ padding: 40, textAlign: 'center' }}>
          {/* Plain text only; no webview, no remote fetch. */}
          Skipping the legacy Mailspring ID step…
        </div>
      </div>
    );
  }
}
