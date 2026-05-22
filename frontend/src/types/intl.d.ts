import messages from '../../messages/en.json';

// Augment next-intl so that t() calls return typed strings (required with React 19 strict ReactNode)
declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages;
  }
}
