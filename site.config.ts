/**
 * The one place the public address of the game is written (F058). vite.config.ts puts it into
 * index.html at build time (%SITE_URL%); moving to a custom domain is a change to this line only.
 * It must end with a slash.
 */
export const SITE_URL = 'https://slimsomania.github.io/game-flipper/';
