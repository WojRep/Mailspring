// WS2-B: crypto + url imports dropped — Gravatar/logo.getmailspring URL
// construction removed.
import { localized } from 'actunamail-exports';
import ReactDOMServer from 'react-dom/server';
import Templates from './templates';

export const DataShape = [
  {
    key: 'name',
    label: localized('Name'),
  },
  {
    key: 'title',
    label: localized('Title'),
  },
  {
    key: 'phone',
    label: localized('Phone'),
  },
  {
    key: 'email',
    label: localized('Email Address'),
  },
  {
    key: 'fax',
    label: localized('Fax'),
  },
  {
    key: 'address',
    label: localized('Address'),
  },
  {
    key: 'websiteURL',
    label: localized('Website'),
  },
  {
    key: 'facebookURL',
    label: localized('Facebook URL'),
  },
  {
    key: 'linkedinURL',
    label: localized('LinkedIn URL'),
  },
  {
    key: 'mediumURL',
    label: localized('Medium Handle'),
  },
  {
    key: 'githubURL',
    label: localized('GitHub Username'),
  },
  {
    key: 'youtubeURL',
    label: localized('YouTube'),
  },
  {
    key: 'twitterHandle',
    label: localized('Twitter Handle'),
  },
  {
    key: 'instagramURL',
    label: localized('Instagram URL'),
  },
  {
    key: 'tintColor',
    label: localized('Theme Color'),
    placeholder: 'ex: #419bf9, purple',
  },
];

export const ResolveSignatureData = (data) => {
  data = { ...data };

  ['websiteURL', 'facebookURL', 'youtubeURL'].forEach((key) => {
    if (data[key] && !data[key].includes(':')) {
      data[key] = `http://${data[key]}`;
    }
  });

  // sanitize linkedin handle
  if (data.linkedinURL) {
    if (!data.linkedinURL.includes('linkedin.com')) {
      data.linkedinURL = `https://www.linkedin.com/in/${data.linkedinURL}`;
    }
  }

  // sanitize medium handle
  if (data.mediumURL) {
    if (!data.mediumURL.includes('medium.com')) {
      if (!data.mediumURL.startsWith('@')) {
        data.mediumURL = `@${data.mediumURL}`;
      }
      data.mediumURL = `https://www.medium.com/${data.mediumURL}`;
    }
  }

  // sanitize github username
  if (data.githubURL) {
    if (!data.githubURL.includes('github.com')) {
      data.githubURL = `https://www.github.com/${data.githubURL}`;
    }
  }
  // sanitize twitter handle
  if (data.twitterHandle) {
    if (data.twitterHandle.includes('/')) {
      // a url was likely entered, lets grab the user (last portion).
      const split = data.twitterHandle.split('/');
      data.twitterHandle = split[split.length - 1];
    }
    if (data.twitterHandle[0] === '@') {
      // an at symbol was added, lets remove it.
      data.twitterHandle = data.twitterHandle.slice(1);
    }
  }

  // WS2-B: signature 'gravatar' option removed. Upstream Mailspring
  // emitted a Gravatar URL for every signature with photoURL='gravatar';
  // every recipient who renders the signature triggers a Gravatar lookup,
  // leaking the sender's email hash to Automattic. See finding #4.
  if (data.photoURL === 'gravatar') {
    data.photoURL = '';
  }

  // WS2-B: signature 'company' option removed. Upstream Mailspring
  // resolved a logo via logo.getmailspring.com/company-logo/<domain>,
  // which leaked the sender's email domain to Foundry on every signature
  // render. See README.md and COMPLIANCE.md.
  if (data.photoURL === 'company') {
    data.photoURL = '';
  }

  if (data.photoURL === 'custom') {
    data.photoURL = '';
  }

  if (data.instagramURL) {
    if (!data.instagramURL.includes('instagram.com')) {
      data.instagramURL = `https://www.instagram.com/${data.instagramURL}`;
    }
  }

  return data;
};

export function RenderSignatureData(data) {
  const template = Templates.find((t) => t.name === data.templateName) || Templates[0];
  return ReactDOMServer.renderToStaticMarkup(template(ResolveSignatureData(data)));
}
