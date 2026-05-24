import React from 'react';
import PropTypes from 'prop-types';
import { localized } from 'actunamail-exports';
import { ConfigLike } from '../types';

/**
 * Ticket #88 — Tier B follow-up po #47.
 *
 * Custom React komponent dla `core.attachments.favoriteFolders` (array).
 * `ConfigSchemaItem` auto-renderuje tylko boolean + enum; array stringów
 * potrzebuje folder picker + lista add/remove.
 *
 * Zarządza wpisami za pomocą `AppEnv.showOpenDialog({ properties:
 * ['openDirectory'] })` dla dodawania i prostym przyciskiem usuwania
 * na pozycję.
 */

interface FavoriteFoldersSectionProps {
  config: ConfigLike;
}

interface FavoriteFoldersSectionState {
  folders: string[];
}

class FavoriteFoldersSection extends React.Component<
  FavoriteFoldersSectionProps,
  FavoriteFoldersSectionState
> {
  static displayName = 'FavoriteFoldersSection';

  static propTypes = {
    config: PropTypes.object,
  };

  _disposable: { dispose: () => void } | null = null;

  constructor(props: FavoriteFoldersSectionProps) {
    super(props);
    this.state = { folders: this._read() };
  }

  componentDidMount() {
    // ConfigLike is a narrow interface (get/set/toggle only). Subscribe
    // via the full AppEnv.config which exposes onDidChange.
    this._disposable = (AppEnv as any).config.onDidChange(
      'core.attachments.favoriteFolders',
      () => {
        this.setState({ folders: this._read() });
      }
    );
  }

  componentWillUnmount() {
    if (this._disposable) this._disposable.dispose();
  }

  _read(): string[] {
    const value = this.props.config.get('core.attachments.favoriteFolders');
    return Array.isArray(value) ? (value as string[]).filter((s) => typeof s === 'string') : [];
  }

  _write(next: string[]) {
    this.props.config.set('core.attachments.favoriteFolders', next);
  }

  _onAdd = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const remote = require('@electron/remote');
    const result = remote.dialog.showOpenDialogSync({
      title: localized('Add folder…'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!result || result.length === 0) return;
    const picked = result[0];
    const current = this._read();
    if (current.includes(picked)) return;
    this._write([...current, picked]);
  };

  _onRemove = (idx: number) => {
    const current = this._read();
    if (idx < 0 || idx >= current.length) return;
    this._write(current.filter((_, i) => i !== idx));
  };

  render() {
    const { folders } = this.state;
    return (
      <section className="favorite-folders-section">
        <h6>{localized('Favorite folders')}</h6>
        {folders.length === 0 && (
          <div className="favorite-folders-empty" style={{ opacity: 0.7 }}>
            {localized('No favorite folders yet.')}
          </div>
        )}
        {folders.length > 0 && (
          <ul
            className="favorite-folders-list"
            style={{ listStyle: 'none', padding: 0, margin: '6px 0' }}
          >
            {folders.map((folder, idx) => (
              <li
                key={folder}
                className="favorite-folders-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 0',
                }}
              >
                <span
                  className="favorite-folders-path"
                  title={folder}
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    marginRight: 8,
                  }}
                >
                  {folder}
                </span>
                <button
                  className="btn btn-small favorite-folders-remove"
                  aria-label={localized('Remove')}
                  onClick={() => this._onRemove(idx)}
                  style={{ minWidth: 70 }}
                >
                  {localized('Remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          className="btn btn-small favorite-folders-add"
          onClick={this._onAdd}
          style={{ marginTop: 4 }}
        >
          {localized('Add folder…')}
        </button>
      </section>
    );
  }
}

export default FavoriteFoldersSection;
