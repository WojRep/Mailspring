import { localized, React } from 'mailspring-exports';
import * as OnboardingActions from './onboarding-actions';

// v0.2.d: single tutorial slide combining the privacy and EU
// compliance message under "Privacy by default". Upstream Mailspring's
// tutorial originally had three Pro-feature slides (participant-profile,
// activity / open-tracking / link-tracking, thread-snooze / send-later);
// all three plugins were removed in WS1-A. The replacement copy first
// shipped as two slides ("Privacy by default" + "Built for the EU"),
// and was consolidated to one on user direction so the first-run
// wizard stays short and the message lands in a single read.
const Steps = [
  {
    seen: false,
    id: 'privacy',
    title: localized('Privacy by default'),
    image: 'lock@2x.png',
    description: localized(
      'Actuna Mail does not contact Sentry, Gravatar, or any analytics service when it starts. ' +
        'Your contacts, your drafts, and your error reports stay on your machine. ' +
        'No identity poll, no tracking pixels, no auto-subscribed newsletter. ' +
        'Compliance posture mapped article-by-article to GDPR, the AI Act, KNF Recommendation D and Z, and NIS2 — ' +
        'every external endpoint Actuna Mail may reach is listed in SECURITY.md.'
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
          {/* v0.2.b: single centred panel with illustrative image +
              title + description. The upstream "screenshot with
              hotspot overlays" left panel pointed at features that
              were removed in WS1-A, so it is gone. The right panel
              becomes the primary canvas, capped at 720px wide. */}
          <div className="right" style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
            {current.image && (
              <img
                src={`mailspring://onboarding/assets/${current.image}`}
                style={{ zoom: 0.5, margin: 'auto', display: 'block' }}
                alt=""
              />
            )}
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
