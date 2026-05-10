import { localized, React } from 'mailspring-exports';
import * as OnboardingActions from './onboarding-actions';

// v0.2: tutorial steps rewritten for Actuna Mail.
// Upstream Mailspring's tutorial advertised three Pro features (people
// profiles via participant-profile, open/click tracking via activity +
// open-tracking + link-tracking, snooze via thread-snooze + send-later).
// All of those plugins were removed in WS1-A and the messaging
// contradicted Actuna's compliance posture. The new steps describe
// what Actuna Mail actually does and why.
const Steps = [
  {
    seen: false,
    id: 'privacy',
    title: localized('Privacy by default'),
    description: localized(
      'Actuna Mail does not contact Sentry, Gravatar, Foundry, or any analytics service when it starts. ' +
        'Your contacts, your drafts, and your error reports stay on your machine. ' +
        'No identity poll, no tracking pixels, no auto-subscribed newsletter.'
    ),
  },
  {
    seen: false,
    id: 'compliance',
    title: localized('Built for the EU'),
    description: localized(
      'Compliance posture mapped article-by-article to GDPR, the AI Act, KNF Recommendation D and Z, and NIS2. ' +
        'Every external endpoint that Actuna Mail v0.1 may reach is listed in SECURITY.md — there are no surprises in tcpdump.'
    ),
  },
  {
    seen: false,
    id: 'open-source',
    title: localized('Open source, audit-driven'),
    description: localized(
      'Actuna Mail is GPL-3.0 and forked from Foundry376/Mailspring 1.21.0. ' +
        'Each removal of an upstream telemetry channel is an atomic commit on the compliance/v0.1 branch you can review. ' +
        'Independent verification at tech@actuna.pl.'
    ),
  },
];

export default class TutorialPage extends React.Component<
  Record<string, unknown>,
  { appeared: boolean; seen: any[]; current: any }
> {
  static displayName = 'TutorialPage';

  _timer: NodeJS.Timeout;

  constructor(props) {
    super(props);

    this.state = {
      appeared: false,
      seen: [],
      current: Steps[0],
    };
  }

  componentDidMount() {
    this._timer = setTimeout(() => {
      this.setState({ appeared: true });
    }, 200);
  }

  componentWillUnmount() {
    clearTimeout(this._timer);
  }

  _onBack = () => {
    const nextItem = this.state.seen.pop();
    if (!nextItem) {
      OnboardingActions.moveToPreviousPage();
    } else {
      this.setState({ current: nextItem });
    }
  };

  _onNextUnseen = () => {
    const nextSeen = [...this.state.seen, this.state.current];
    const nextItem = Steps.find((s) => !nextSeen.includes(s));
    if (nextItem) {
      this.setState({ current: nextItem, seen: nextSeen });
    } else {
      // v0.2: skip the legacy 'authenticate' page entirely. WS1-E
      // already replaced it with a stub but going there still flashes
      // a "Skipping the legacy Mailspring ID step…" placeholder. Send
      // the user straight to account-choose, which is the next real
      // step in the flow.
      OnboardingActions.moveToPage('account-choose');
    }
  };

  render() {
    const { current, seen, appeared } = this.state;

    return (
      <div className={`page tutorial appeared-${appeared}`}>
        <div className="tutorial-container">
          {/* v0.2: removed the left-hand "screenshot with overlays" panel.
              The overlays pointed at features the tutorial used to
              advertise (people profiles, activity tracking, snooze in
              the sidebar). Those features were removed in WS1-A and the
              overlays no longer correspond to anything in the UI. */}
          <div className="right" style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
            <h2>{current.title}</h2>
            <p>{current.description}</p>
          </div>
        </div>
        <div className="footer">
          <button key="prev" className="btn btn-large btn-prev" onClick={this._onBack}>
            {localized('Back')}
          </button>
          <button key="next" className="btn btn-large btn-next" onClick={this._onNextUnseen}>
            {seen.length < Steps.length - 1 ? localized('Next') : localized('Get Started')}
          </button>
        </div>
      </div>
    );
  }
}
