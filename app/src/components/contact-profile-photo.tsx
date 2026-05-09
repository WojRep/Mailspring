import React from 'react';
import { Contact } from '../flux/models/contact';
import * as Utils from '../flux/models/utils';
import { RetinaImg } from './retina-img';

// WS2-B: Gravatar lookup removed.
// Upstream Mailspring 1.21.0 issued a request to
//   https://www.gravatar.com/avatar/<sha256(email)>?s=88&msw=88&msh=88&d=blank
// for every contact rendered. Each request leaks the corresponding
// contact's email (as a SHA-256 hash that is trivially looked up in
// Gravatar's own index) to a third-party processor (Automattic, USA)
// for which there is no DPA. See finding #4 in findings.md.
//
// In Actuna Mail, the "default" profile image is the contact's name
// initials over a hashed background colour. If an avatar URL is
// supplied via OAuth (Google, Microsoft) by the upstream provider,
// it is used as in upstream — we are not blocking the user's chosen
// mail provider, only Gravatar.

export class ContactProfilePhoto extends React.Component<{
  contact: Contact;
  loading: boolean;
  avatar: string;
}> {
  render() {
    const { contact, loading, avatar } = this.props;

    const hue = Utils.hueForString(contact.email);
    const bgColor = `hsl(${hue}, 50%, 45%)`;

    let content = (
      <div className="default-profile-image" style={{ backgroundColor: bgColor }}>
        <div className="layer" style={{ zIndex: 1 }}>
          {contact.nameAbbreviation()}
        </div>
      </div>
    );

    if (loading) {
      content = (
        <div className="default-profile-image">
          <RetinaImg
            className="spinner"
            style={{ width: 20, height: 20 }}
            name="inline-loading-spinner.gif"
            mode={RetinaImg.Mode.ContentDark}
          />
        </div>
      );
    }

    if (avatar) {
      content = <img alt="Profile" src={avatar} />;
    }

    return (
      <div className="contact-profile-photo">
        <div className="profile-photo">{content}</div>
      </div>
    );
  }
}
