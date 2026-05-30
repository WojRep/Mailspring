import React from 'react';
import { localized, Utils, DOMUtils, Account, AccountStore } from 'actunamail-exports';
import { OutlineView, ScrollRegion, Flexbox } from 'actunamail-component-kit';
import AccountSwitcher from './account-switcher';
import SidebarStore from '../sidebar-store';
import { ISidebarSection } from '../types';

interface AccountSidebarState {
  accounts: Account[];
  sidebarAccountIds: string[];
  userSections: ISidebarSection[];
  standardSection: ISidebarSection;
  attentionLayersSection: ISidebarSection;
  smartFoldersSection: ISidebarSection;
  tagsSection: ISidebarSection;
}

export default class AccountSidebar extends React.Component<
  Record<string, unknown>,
  AccountSidebarState
> {
  static displayName = 'AccountSidebar';

  static containerRequired = false;
  static containerStyles = {
    minWidth: DOMUtils.getWorkspaceCssNumberProperty('account-sidebar-min-width', 165),
    maxWidth: DOMUtils.getWorkspaceCssNumberProperty('account-sidebar-max-width', 250),
  };

  unsubscribers = [];

  constructor(props) {
    super(props);

    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this.unsubscribers.push(SidebarStore.listen(this._onStoreChange));
    return this.unsubscribers.push(AccountStore.listen(this._onStoreChange));
  }

  shouldComponentUpdate(nextProps: Record<string, unknown>, nextState: AccountSidebarState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentWillUnmount() {
    return this.unsubscribers.map((unsubscribe) => unsubscribe());
  }

  _onStoreChange = () => {
    return this.setState(this._getStateFromStores());
  };

  _getStateFromStores = () => {
    return {
      accounts: AccountStore.accounts(),
      sidebarAccountIds: SidebarStore.sidebarAccountIds(),
      userSections: SidebarStore.userSections(),
      standardSection: SidebarStore.standardSection(),
      attentionLayersSection: (SidebarStore as any).attentionLayersSection
        ? (SidebarStore as any).attentionLayersSection()
        : { title: 'Attention Layers', items: [] },
      smartFoldersSection: (SidebarStore as any).smartFoldersSection
        ? (SidebarStore as any).smartFoldersSection()
        : { title: 'Smart Folders', items: [] },
      tagsSection: (SidebarStore as any).tagsSection
        ? (SidebarStore as any).tagsSection()
        : { title: 'Tags', items: [] },
    };
  };

  _renderUserSections(sections: ISidebarSection[]) {
    return sections.map((section) => <OutlineView key={section.title} {...section} />);
  }

  render() {
    const {
      accounts,
      sidebarAccountIds,
      userSections,
      standardSection,
      attentionLayersSection,
      smartFoldersSection,
      tagsSection,
    } = this.state;

    return (
      <Flexbox direction="column" style={{ order: 0, flexShrink: 1, flex: 1 }}>
        <ScrollRegion className="account-sidebar" style={{ order: 2 }}>
          <AccountSwitcher accounts={accounts} sidebarAccountIds={sidebarAccountIds} />
          <nav className="account-sidebar-sections" aria-label={localized('Mailboxes')}>
            {/* Plan v1.0 mockup 01-app-shell.html: Attention Layers first (#23
                Attention-First manifesto). Always rendered (3 stałe items:
                Focused/Pinned/Snoozed) even gdy empty z 0 counts. */}
            <OutlineView {...attentionLayersSection} />

            <OutlineView {...standardSection} />

            {/* Smart Folders (#99) — render zawsze (empty section = section header
                + 0 items, user widzi że może je tworzyć przez Cmd+Shift+N). */}
            <OutlineView {...smartFoldersSection} />

            {/* Tags (#98) user tags only — render gdy są tagi. */}
            {tagsSection.items.length > 0 && <OutlineView {...tagsSection} />}

            {this._renderUserSections(userSections)}
          </nav>
        </ScrollRegion>
      </Flexbox>
    );
  }
}
