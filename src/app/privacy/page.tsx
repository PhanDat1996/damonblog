import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy policy for damonsec.com — what data is collected, how cookies and advertising (Google AdSense) are used, and how to opt out.',
  alternates: { canonical: '/privacy' },
};

const LAST_UPDATED = '2026-10-31';

const SECTIONS = [
  {
    heading: 'Overview',
    body: [
      'damonsec.com ("this site") is a personal technical blog run by Damon. This policy explains what information is collected when you visit the site and how it is used.',
      'The site does not require an account and does not ask you to submit personal information.',
    ],
  },
  {
    heading: 'Information collected automatically',
    body: [
      'Like most websites, the hosting provider (Vercel) may log standard request data such as IP address, browser type, referring page, and time of visit. These logs are used for security, debugging, and aggregate traffic statistics.',
    ],
  },
  {
    heading: 'Online tools',
    body: [
      'The tools under /tools (for example the NGINX config analyzer and hardening checkers) process the configuration you paste directly in your browser. That content is not stored on this site.',
    ],
  },
  {
    heading: 'CISSP practice and comments',
    body: [
      'Your answers and language choice on /cissp are saved in your browser (localStorage) and are not sent to this site.',
      'You can leave a comment under a CISSP scenario without an account. We store the name you type (or "Ẩn danh"), the comment text and the time, on Upstash Redis through Vercel. Comments are public as soon as they are posted and may be removed by the site owner. Please do not post personal information.',
      'To limit spam and allow one vote per person, your IP address is turned into a keyed hash and only that hash is stored; rate-limit counters expire within minutes. To have a comment removed, use the contact details below.',
    ],
  },
  {
    heading: 'Cookies and advertising',
    body: [
      'This site may display ads served by Google AdSense. Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this website or other websites.',
      "Google's use of advertising cookies enables it and its partners to serve ads to you based on your visits to this site and/or other sites on the Internet.",
      'You can opt out of personalized advertising by visiting Google Ads Settings (https://adssettings.google.com). You can also opt out of some third-party vendors’ use of cookies for personalized advertising at https://www.aboutads.info/choices.',
      'For more detail, see how Google uses information from sites that use its services: https://policies.google.com/technologies/partner-sites.',
    ],
  },
  {
    heading: 'Your choices',
    body: [
      'You can block or delete cookies in your browser settings. Visitors in the EEA, UK, and Switzerland will be asked for consent before personalized ads are shown.',
    ],
  },
  {
    heading: 'Third-party links',
    body: [
      'Articles link to external documentation and websites. Their privacy practices are governed by their own policies.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'This policy may be updated from time to time. The date at the top of the page shows the latest revision.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-3">
        <h1 className="font-display text-4xl font-bold tracking-tight text-white">Privacy Policy</h1>
        <p className="font-mono text-xs text-zinc-500">Last updated: {LAST_UPDATED}</p>
      </header>

      {SECTIONS.map(({ heading, body }) => (
        <section key={heading} className="space-y-3">
          <h2 className="font-display text-xl font-bold text-white">{heading}</h2>
          {body.map((p) => (
            <p key={p} className="text-zinc-400 leading-relaxed">{p}</p>
          ))}
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-white">Contact</h2>
        <p className="text-zinc-400 leading-relaxed">
          Questions about this policy? Reach out via the{' '}
          <Link href="/contact" className="text-green-400 hover:underline">contact page</Link>.
        </p>
      </section>
    </div>
  );
}
