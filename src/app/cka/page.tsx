import type { Metadata } from 'next';
import Link from 'next/link';
import { CURRICULUM_META, DOMAINS, SKILLS } from '@/lib/cka/curriculum.ts';
import { formatDate } from '@/lib/cka/dates.ts';
import { RECENT_DAYS, REVIEW_INTERVAL_DAYS } from '@/lib/cka/recommend.ts';
import { SIMULATIONS } from '@/lib/cka/simulations.ts';
import { TASKS } from '@/lib/cka/tasks.ts';
import { getAllPosts } from '@/lib/posts';
import { CkaTracker } from './_components/CkaTracker';

const PAGE_URL = 'https://www.damonsec.com/cka';
const TITLE = 'CKA Study Tracker';
const DESCRIPTION =
  `Track your Certified Kubernetes Administrator prep against the official ${CURRICULUM_META.kubernetesVersion} curriculum: skill status, practice attempts, weekly minutes and hands-on lab tasks. Progress stays in your browser.`;

export const metadata: Metadata = {
  title: `${TITLE}: plan and log your Kubernetes practice`,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: `${TITLE} — damonsec.com`,
    description: DESCRIPTION,
    url: PAGE_URL,
    type: 'website',
    siteName: 'damonsec.com',
  },
  twitter: {
    card: 'summary',
    title: `${TITLE} — damonsec.com`,
    description: DESCRIPTION,
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: TITLE,
  description: DESCRIPTION,
  url: PAGE_URL,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Any (runs in browser)',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function CkaPage() {
  const wanted = new Set(SKILLS.flatMap((s) => s.relatedPosts));
  const postTitles: Record<string, string> = {};
  for (const p of getAllPosts()) if (wanted.has(p.slug)) postTitles[p.slug] = p.title;

  return (
    <div className="space-y-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="space-y-5 border-b border-zinc-800 pb-10">
        <div className="font-mono text-xs text-green-400">~/cka</div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">{TITLE}</h1>
        <p className="max-w-2xl font-sans leading-relaxed text-zinc-300">
          A study log for the Certified Kubernetes Administrator exam. Mark how well you know each of the {SKILLS.length} official
          competencies, log practice sessions, and get up to three suggestions for what to practice next.
        </p>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-zinc-400">
          <li>Curriculum: Kubernetes {CURRICULUM_META.kubernetesVersion}, checked {formatDate(CURRICULUM_META.verifiedOn)}</li>
          <li>{TASKS.length} hands-on lab tasks, {SIMULATIONS.length} simulations</li>
          <li>Progress stays in this browser</li>
        </ul>
        <p className="max-w-2xl text-xs leading-relaxed text-zinc-500">
          An independent learning tool by DamonSec. Not affiliated with or endorsed by the CNCF or the Linux Foundation.
          Tracking your progress here does not show that you are ready for the exam.
        </p>
        <p className="font-mono text-xs">
          <a href="#curriculum" className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-green-400">Jump to curriculum</a>
          <span className="text-zinc-600"> · </span>
          <a href="#simulations" className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-green-400">Simulations</a>
          <span className="text-zinc-600"> · </span>
          <a href="#practice-tasks" className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-green-400">Practice tasks</a>
          <span className="text-zinc-600"> · </span>
          <a href="#your-data" className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-green-400">Export / import</a>
        </p>
      </header>

      <CkaTracker postTitles={postTitles} />

      <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-24 space-y-4">
        <h2 id="how-heading" className="font-display text-2xl font-bold text-white">How the numbers work</h2>
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-300">
          <li><strong className="text-zinc-100">Status is yours.</strong> Each skill has four states you set by hand. Logging an attempt never changes it.</li>
          <li><strong className="text-zinc-100">Coverage</strong> is skills with any status other than Not started, divided by {SKILLS.length}.</li>
          <li><strong className="text-zinc-100">Independent</strong> is skills marked Can do independently, divided by {SKILLS.length}. Skills are not weighted by exam percentage.</li>
          <li><strong className="text-zinc-100">This week</strong> adds the minutes of attempts dated Monday to Sunday of the current week, in your device&apos;s time zone.</li>
          <li>
            <strong className="text-zinc-100">Practice today</strong> picks up to three skills, in this order: skills whose latest attempt was unsuccessful or needed hints;
            skills you are learning that have not been practiced for {RECENT_DAYS} days or more; skills not started yet, spread across domains from the heaviest exam weight down;
            and skills marked independent that are due for review after {REVIEW_INTERVAL_DAYS} days.
          </li>
          <li>There is no pass prediction. The tracker only reflects what you record.</li>
        </ul>
      </section>

      <section aria-labelledby="sources-heading" className="space-y-4 rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-6 md:p-8">
        <h2 id="sources-heading" className="font-display text-lg font-bold text-white">Curriculum source</h2>
        <p className="text-sm leading-relaxed text-zinc-300">
          Domains, weights and competency wording are copied from the official curriculum ({CURRICULUM_META.curriculumDocument}, Kubernetes {CURRICULUM_META.kubernetesVersion}),
          checked against both sources below on {formatDate(CURRICULUM_META.verifiedOn)}. Skill summaries, documentation picks and practice tasks are written by DamonSec.
        </p>
        <ul className="space-y-1.5 text-sm">
          {CURRICULUM_META.sources.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:text-green-400">
                {s.label} ↗
              </a>
            </li>
          ))}
        </ul>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-zinc-400">
          {CURRICULUM_META.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <p className="text-xs text-zinc-500">
          Domains: {DOMAINS.map((d) => `${d.name} ${d.weight}%`).join(' · ')}. Exam details change; check the Linux Foundation page before you book.
        </p>
        <p className="text-sm text-zinc-400">
          More tools: <Link href="/tools" className="text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:text-green-400">DamonSec tools</Link>
        </p>
      </section>
    </div>
  );
}
