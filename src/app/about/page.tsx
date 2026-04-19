import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About',
  description: 'Damon — security operations and infrastructure engineer. Learn about my background and what I write about.',
};

const SKILLS = [
  { category: 'Security', items: ['Threat Analysis', 'Log Correlation', 'Firewall Rules', 'SSL/TLS Hardening', 'Incident Response'] },
  { category: 'Infrastructure', items: ['NGINX', 'Docker', 'Linux Admin', 'Networking', 'Load Balancing'] },
  { category: 'Observability', items: ['Log Aggregation', 'ELK Stack', 'Metrics', 'Alerting', 'Dashboards'] },
  { category: 'Debugging', items: ['Production Incidents', 'Root Cause Analysis', 'Performance Profiling', 'Packet Capture', 'Core Dumps'] },
];

const TIMELINE = [
  { year: '2024–now', role: 'Senior Security Operations Engineer', detail: 'Incident response, threat hunting, and infrastructure hardening at scale.' },
  { year: '2021–2024', role: 'Infrastructure Engineer', detail: 'Built and maintained high-availability NGINX/Docker environments for production workloads.' },
  { year: '2019–2021', role: 'Technical Support Engineer', detail: 'Deep-dive troubleshooting for enterprise Linux systems, networking, and web servers.' },
  { year: '2017–2019', role: 'Systems Administrator', detail: 'Managed Linux server fleets, on-call rotations, and internal tooling.' },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-16">
      {/* Header */}
      <div className="space-y-4 border-b border-zinc-800 pb-10">
        <div className="font-mono text-xs text-green-400">~/about</div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-white">About Me</h1>
      </div>

      {/* Intro */}
      <section className="space-y-5">
        <div className="flex items-start gap-6">
          {/* Avatar placeholder */}
          <div className="flex-shrink-0 h-20 w-20 rounded-xl border border-zinc-800 bg-zinc-900 flex items-center justify-center font-display text-2xl font-bold text-green-400">
            D
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white">Damon</h2>
            <p className="font-mono text-sm text-green-400">Security &amp; Infrastructure Engineer</p>
            <div className="mt-2 flex items-center gap-1.5 font-mono text-xs text-zinc-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              <span>Available for consulting</span>
            </div>
          </div>
        </div>

        <div className="space-y-4 text-zinc-400 leading-relaxed">
          <p>
            I&apos;m a cybersecurity and infrastructure engineer with a background in technical support.
            That support background means I actually know how things break in the real world — not
            just how they look in architecture diagrams.
          </p>
          <p>
            This blog is my public notebook. When I solve something gnarly — a 502 that only
            appears under load, a Docker container bleeding memory at 3am, an NGINX config that
            &quot;worked on staging&quot; — I write it up. Future me (and hopefully you) will thank me.
          </p>
          <p>
            I believe in boring, reliable infrastructure. The best on-call shift is the one where
            nothing happens.
          </p>
        </div>
      </section>

      {/* Skills */}
      <section>
        <h2 className="font-display text-xl font-bold text-white mb-6">Skills &amp; Stack</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {SKILLS.map(({ category, items }) => (
            <div
              key={category}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3"
            >
              <p className="font-mono text-xs font-semibold text-green-400 uppercase tracking-widest">
                {category}
              </p>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="text-green-500/50 text-xs">▸</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section>
        <h2 className="font-display text-xl font-bold text-white mb-6">Experience</h2>
        <div className="space-y-0">
          {TIMELINE.map(({ year, role, detail }, i) => (
            <div key={i} className="relative flex gap-6 pb-8 last:pb-0">
              {/* Line */}
              {i < TIMELINE.length - 1 && (
                <div className="absolute left-[5.5rem] top-6 bottom-0 w-px bg-zinc-800" />
              )}
              <div className="w-24 flex-shrink-0 font-mono text-xs text-zinc-500 pt-0.5">{year}</div>
              <div className="space-y-1">
                <p className="font-semibold text-white text-sm">{role}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-display font-bold text-white">Want to work together?</p>
          <p className="text-sm text-zinc-400 mt-1">I&apos;m available for consulting on security and infrastructure projects.</p>
        </div>
        <Link
          href="/contact"
          className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg bg-green-400 px-5 py-2.5 font-mono text-sm font-semibold text-zinc-950 hover:bg-green-300 transition-colors"
        >
          Get in touch →
        </Link>
      </section>
    </div>
  );
}
