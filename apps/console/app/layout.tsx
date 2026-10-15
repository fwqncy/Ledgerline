import '@ledgerline/core/styles.css';
import { htmlThemeProps, isDarkTheme, parsePrefs, PREFS_COOKIE, themeColorFor } from '@ledgerline/core/theme';
import type { Metadata, Viewport } from 'next';
import { Anton, Courier_Prime, Newsreader, Playfair_Display } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

const display = Anton({ subsets: ['latin'], weight: '400', variable: '--font-display-face' });
const serif = Playfair_Display({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-serif-face' });
const text = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], axes: ['opsz'], variable: '--font-text-face' });
const mono = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-mono-face' });

export const metadata: Metadata = {
  title: { default: 'The Ledgerline', template: '%s · The Ledgerline' },
  description: 'Modular payments console. Risk, payouts and support ship on their own schedule.',
};

async function prefs() {
  return parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
}

export async function generateViewport(): Promise<Viewport> {
  const p = await prefs();
  return { themeColor: themeColorFor(p), colorScheme: isDarkTheme(p) ? 'dark' : 'light', viewportFit: 'cover' };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The theme comes from a cookie, so the very first paint is already in the viewer's colours.
  const { style, ...attributes } = htmlThemeProps(await prefs());
  return (
    <html
      lang="en"
      className={`${display.variable} ${serif.variable} ${text.variable} ${mono.variable}`}
      style={style}
      {...attributes}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
