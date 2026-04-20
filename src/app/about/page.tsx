import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Damon — Senior Technical Support Engineer at OPSWAT. 7+ years debugging Linux systems, NGINX, Docker, and production infrastructure across enterprise environments.',
};

const SKILLS = [
  {
    category: 'Infrastructure',
    items: ['NGINX', 'Docker', 'Kubernetes', 'Linux Administration', 'Load Balancing'],
  },
  {
    category: 'Security',
    items: ['Endpoint Security', 'Threat Analysis', 'SSL/TLS Hardening', 'Firewall Rules', 'Log Correlation'],
  },
  {
    category: 'Debugging',
    items: ['Production Incidents', 'Root Cause Analysis', 'TCP/Network Tracing', 'Performance Profiling', 'Packet Capture'],
  },
  {
    category: 'Observability',
    items: ['Log Aggregation', 'ELK Stack', 'Metrics & Alerting', 'Dashboards', 'sysctl Tuning'],
  },
];

const TIMELINE = [
  {
    year: 'Feb 2026 – now',
    role: 'Senior Technical Support Engineer',
    company: 'OPSWAT',
    detail:
      'Leading deep-dive troubleshooting on MetaDefender Core and Secure Storage for enterprise customers globally. Focus on OS performance tuning, complex deployment issues, and escalation engineering.',
  },
  {
    year: 'Apr 2022 – Feb 2026',
    role: 'Technical Support Engineer',
    company: 'OPSWAT',
    detail:
      'Level 3 technical support for OPSWAT MetaDefender Core and Secure Storage across global enterprise accounts. Advanced Linux system debugging, network configuration, Python scripting, and cross-platform deployments.',
  },
  {
    year: 'Aug 2018 – May 2022',
    role: 'System Administrator / Linux System Engineer',
    company: 'Vietnix — Anti DDoS Server',
    detail:
      'Managed Linux server infrastructure for a DDoS mitigation provider. Server fleet operations, NGINX configuration, network performance tuning, and on-call incident response under high traffic conditions.',
  },
];

const TOPICS = [
  {
    slug: 'nginx-502-under-load',
    label: 'NGINX 502 bad gateway errors and upstream failures',
  },
  {
    slug: 'linux-time-wait-explained',
    label: 'Linux connection issues — TIME_WAIT exhaustion, ephemeral port limits',
  },
  {
    slug: 'nginx-upstream-keepalive',
    label: 'Keepalive misconfiguration and connection handling problems',
  },
  {
    slug: null,
    label: 'Docker container networking and log management',
  },
  {
    slug: null,
    label: 'Debugging systems under production load',
  },
  {
    slug: null,
    label: 'Security operations in enterprise environments',
  },
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
      <section className="space-y-6">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0 h-20 w-20 rounded-xl border border-zinc-800 bg-zinc-900 flex items-center justify-center font-display text-2xl font-bold text-green-400">
            D
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white">Damon</h2>
            <p className="font-mono text-sm text-green-400">
              Senior Technical Support Engineer · OPSWAT
            </p>
            <p className="font-mono text-xs text-zinc-500 mt-1">
              Ho Chi Minh City, Vietnam
            </p>
            <div className="mt-2 flex items-center gap-1.5 font-mono text-xs text-zinc-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              <span>Available for consulting</span>
            </div>
          </div>
        </div>

        <div className="space-y-4 text-zinc-400 leading-relaxed">
          <p>
            I&apos;m a Senior Technical Support Engineer at{' '}
            <strong className="text-zinc-300">OPSWAT</strong>, with over 7 years
            of experience in Linux systems, infrastructure engineering, and
            production troubleshooting.
          </p>
          <p>
            My career started at <strong className="text-zinc-300">Vietnix</strong>,
            an Anti-DDoS hosting provider, where I managed server fleets, tuned
            NGINX configurations, and handled network-level incidents under high
            traffic conditions.
          </p>
          <p>
            At OPSWAT, I work at Level 3 technical support, focusing on
            enterprise-grade cybersecurity solutions — MetaDefender Core and
            Secure Storage. My role involves diagnosing OS-level issues, debugging
            complex network configurations, and solving production problems in
            large-scale, high-availability environments.
          </p>
        </div>
      </section>

      {/* What this blog is about */}
      <section className="space-y-5">
        <div>
          <h2 className="font-display text-xl font-bold text-white mb-1">
            What This Blog Is About
          </h2>
          <p className="text-zinc-400 text-sm">
            Infrastructure troubleshooting, Linux systems, networking behavior, and production debugging.
          </p>
        </div>

        <p className="text-zinc-400 text-sm leading-relaxed">
          The content is based on real-world scenarios — not documentation summaries,
          not toy examples. Things I have personally debugged, investigated, and resolved.
        </p>

        <ul className="space-y-2">
          {TOPICS.map(({ slug, label }) => (
            <li key={label} className="flex items-start gap-3 text-sm">
              <span className="text-green-500 font-mono mt-0.5 flex-shrink-0">▸</span>
              {slug ? (
                <Link
                  href={`/blog/${slug}`}
                  className="text-zinc-300 hover:text-green-400 transition-colors"
                >
                  {label}
                </Link>
              ) : (
                <span className="text-zinc-400">{label}</span>
              )}
            </li>
          ))}
        </ul>

        <div className="border-l-2 border-green-500/40 pl-4">
          <p className="text-sm text-zinc-400 italic">
            Not theory — real incidents, documented and explained.
          </p>
        </div>
      </section>

      {/* Why this blog exists */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-white">
          Why This Blog Exists
        </h2>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Most technical content explains <em>what</em> something is. This blog focuses on:
        </p>
        <ul className="space-y-2">
          {['why systems break', 'how to debug them', 'how to fix them in production'].map((item) => (
            <li key={item} className="flex items-center gap-3 text-sm text-zinc-300">
              <span className="text-green-500 font-mono flex-shrink-0">▸</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Every article comes from something I have personally encountered — a real
          issue, a deep investigation, or a problem that required understanding beyond
          the documentation. If it took time to figure out, it&apos;s worth documenting.
        </p>
      </section>

      {/* Who this is for */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-white">Who This Is For</h2>
        <p className="text-zinc-400 text-sm">Engineers who:</p>
        <ul className="space-y-2">
          {[
            'work with Linux systems',
            'debug production issues',
            'manage infrastructure or backend systems',
            'deal with NGINX, Docker, or Kubernetes',
            'want practical, real-world troubleshooting knowledge',
          ].map((item) => (
            <li key={item} className="flex items-center gap-3 text-sm text-zinc-400">
              <span className="text-green-500/60 font-mono flex-shrink-0">▸</span>
              {item}
            </li>
          ))}
        </ul>
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
          {TIMELINE.map(({ year, role, company, detail }, i) => (
            <div key={i} className="relative flex gap-6 pb-8 last:pb-0">
              {i < TIMELINE.length - 1 && (
                <div className="absolute left-[7rem] top-6 bottom-0 w-px bg-zinc-800" />
              )}
              <div className="w-28 flex-shrink-0 font-mono text-[10px] text-zinc-500 pt-1 leading-relaxed">
                {year}
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-white text-sm">{role}</p>
                <p className="font-mono text-xs text-green-400">{company}</p>
                <p className="text-sm text-zinc-400 leading-relaxed pt-1">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final note */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
        <p className="text-sm text-zinc-400 leading-relaxed">
          If you&apos;re dealing with NGINX errors, connection failures, container
          networking issues, or debugging production systems under load — you&apos;ll
          likely find something useful here.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-400 px-4 py-2 font-mono text-xs font-semibold text-zinc-950 hover:bg-green-300 transition-colors"
          >
            Browse all articles →
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-4 py-2 font-mono text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
          >
            Get in touch
          </Link>
        </div>
      </section>

    </div>
  );
}