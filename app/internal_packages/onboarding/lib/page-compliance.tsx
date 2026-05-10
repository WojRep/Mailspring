import { localized, React } from 'mailspring-exports';
import * as OnboardingActions from './onboarding-actions';

// Compliance details screen — shown after the tutorial pitch ("Privacy by
// default") and before the account-choose flow. The four bullets reuse the
// exact strings already wired into mailsync-process.ts (SMTP test body), so
// translators only ever maintain one set of compliance copy across UI and
// outbound test email.
export default class CompliancePage extends React.Component<
  Record<string, unknown>,
  { appeared: boolean }
> {
  static displayName = 'CompliancePage';

  _timer: NodeJS.Timeout;

  constructor(props) {
    super(props);
    this.state = { appeared: false };
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
    OnboardingActions.moveToPreviousPage();
  };

  _onNext = () => {
    OnboardingActions.moveToPage('account-choose');
  };

  render() {
    return (
      <div className={`page tutorial appeared-${this.state.appeared}`}>
        <div className="tutorial-container">
          <div className="right" style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
            <h2>{localized('Built for the EU')}</h2>
            <p>
              {localized(
                'ActunaMail is an EU-compliant email client built on the following principles:'
              )}
            </p>
            <ul style={{ textAlign: 'left', lineHeight: 1.5, paddingLeft: 24 }}>
              <li style={{ marginBottom: 12 }}>
                {localized(
                  'GDPR (Regulation (EU) 2016/679) — your contacts, drafts, and metadata stay on your machine. ActunaMail does not contact analytics, telemetry, or any third-party identity service at startup.'
                )}
              </li>
              <li style={{ marginBottom: 12 }}>
                {localized(
                  'EU AI Act (Regulation (EU) 2024/1689) — when AI-assisted features are introduced, they run on your machine or on infrastructure under your control. No prompts, drafts, or message bodies are sent to third-party model providers.'
                )}
              </li>
              <li style={{ marginBottom: 12 }}>
                {localized(
                  'NIS2 Directive (Directive (EU) 2022/2555) — the security configuration of your mail account remains under your control. The client does not report incidents to external SIEM or SOC services without your explicit configuration.'
                )}
              </li>
              <li style={{ marginBottom: 12 }}>
                {localized(
                  "KNF Recommendations D and Z — applicable for entities of the Polish financial sector. ActunaMail's egress profile is documented in SECURITY.md and verified via runtime traffic inspection."
                )}
              </li>
            </ul>
            <p style={{ marginTop: 16, fontSize: 13, opacity: 0.75 }}>
              {localized(
                'A complete list of every external endpoint ActunaMail may contact is published in SECURITY.md and COMPLIANCE.md in the project repository.'
              )}
            </p>
          </div>
        </div>
        <div className="footer">
          <button key="prev" className="btn btn-large btn-prev" onClick={this._onBack}>
            {localized('Back')}
          </button>
          <button key="next" className="btn btn-large btn-next" onClick={this._onNext}>
            {localized('Get Started')}
          </button>
        </div>
      </div>
    );
  }
}
