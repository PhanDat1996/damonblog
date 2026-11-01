import type { Metadata } from 'next';
import Link from 'next/link';
import { DOMAINS, OUTLINE_META } from '@/lib/cissp/domains.ts';
import { SCENARIOS } from '@/lib/cissp/scenarios.ts';
import { CisspTrainer } from './_components/CisspTrainer';

const PAGE_URL = 'https://www.damonsec.com/cissp';
const TITLE = 'CISSP Scenario Training';
const HARD_COUNT = SCENARIOS.filter((s) => s.level === 'hard').length;
const DESCRIPTION =
  `${SCENARIOS.length} CISSP practice scenarios across all 8 domains, ${HARD_COUNT} of them in hard mode, each with a detailed explanation of why every option is right or wrong, in English and Vietnamese.`;

export const metadata: Metadata = {
  title: `${TITLE}: practice questions with explanations (EN/VI)`,
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
  '@type': 'LearningResource',
  name: TITLE,
  description: DESCRIPTION,
  url: PAGE_URL,
  inLanguage: ['en', 'vi'],
  learningResourceType: 'Practice problems',
  educationalLevel: 'Professional',
  teaches: DOMAINS.map((d) => d.name.en),
  isAccessibleForFree: true,
};

const APPROACH = [
  {
    en: 'Read the last sentence first. Words like FIRST, BEST, MOST and NEXT decide the answer; several options are often correct but only one fits the qualifier.',
    vi: 'Đọc câu hỏi ở cuối trước. Mấy chữ như TRƯỚC TIÊN, TỐT NHẤT, NHIỀU NHẤT, TIẾP THEO mới là thứ quyết định đáp án: thường có vài phương án nghe đều đúng, nhưng chỉ một cái khớp với chữ đó.',
  },
  {
    en: 'Think like a manager or adviser, not a technician. Governance, process and business impact usually come before tools.',
    vi: 'Nghĩ như manager hoặc advisor, đừng nghĩ như người ngồi gõ lệnh. Governance, quy trình và ảnh hưởng tới business thường đi trước công cụ.',
  },
  {
    en: 'Human safety always comes first. Any option that puts people at risk is wrong.',
    vi: 'An toàn con người luôn đứng đầu. Phương án nào đẩy người vào nguy hiểm thì loại ngay.',
  },
  {
    en: 'Prefer the option that fixes the root cause over one that fixes a single instance or adds a compensating control.',
    vi: 'Ưu tiên phương án sửa tận gốc, hơn là chỉ vá một trường hợp hay thêm compensating control.',
  },
  {
    en: 'Use only the facts in the question. If it does not mention a regulation, a budget or a tool, do not assume one.',
    vi: 'Chỉ dùng dữ kiện có trong đề. Đề không nhắc tới quy định, ngân sách hay công cụ nào thì đừng tự thêm vào.',
  },
  {
    en: 'When every option is true, pick the broadest one: the answer that includes or enables the others.',
    vi: 'Khi phương án nào cũng đúng, chọn cái bao quát nhất: cái bao luôn hoặc mở đường cho mấy cái còn lại.',
  },
];

const LINK = 'text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-green-400';

export default function CisspPage() {
  return (
    <div className="space-y-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="space-y-5 border-b border-zinc-800 pb-10">
        <div className="font-mono text-xs text-green-400">~/cissp</div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">{TITLE}</h1>
        <div className="max-w-2xl space-y-2 font-sans leading-relaxed">
          <p className="text-zinc-300">
            Work through realistic situations from all eight CISSP domains. Pick an answer, then read why each option is right or wrong
            and the rule to remember for similar exam questions.
          </p>
          <p lang="vi" className="text-zinc-400">
            Luyện CISSP qua các tình huống thực tế, đủ cả 8 domain. Chọn đáp án xong, bạn sẽ thấy vì sao từng phương án đúng hay sai,
            kèm một mẹo ngắn để lần sau gặp dạng tương tự trong đề là nhận ra ngay.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-zinc-400">
          <li>{SCENARIOS.length} scenarios · 8 domains · {HARD_COUNT} hard</li>
          <li>English + Tiếng Việt</li>
          <li>Answers stay in this browser</li>
        </ul>
        <p className="max-w-2xl text-xs leading-relaxed text-zinc-500">
          Scenarios are written by DamonSec for practice and are not ISC2 exam questions. Not affiliated with or endorsed by ISC2.
          CISSP is a registered mark of ISC2, Inc.
        </p>
        <p className="font-mono text-xs">
          <a href="#approach" className={LINK}>How to approach questions</a>
          <span className="text-zinc-600"> · </span>
          <a href="#all-scenarios" className={LINK}>All scenarios</a>
          <span className="text-zinc-600"> · </span>
          <a href="#domains" className={LINK}>Domains</a>
        </p>
      </header>

      <CisspTrainer />

      <section id="approach" aria-labelledby="approach-heading" className="scroll-mt-24 space-y-4">
        <h2 id="approach-heading" className="font-display text-2xl font-bold text-white">
          How to approach CISSP questions
          <span lang="vi" className="mt-1 block text-base font-normal text-zinc-400">Cách làm câu hỏi CISSP</span>
        </h2>
        <ol className="max-w-3xl list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          {APPROACH.map((a) => (
            <li key={a.en} className="text-zinc-200">
              {a.en}
              <span lang="vi" className="mt-1 block text-zinc-400">{a.vi}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="all-scenarios" aria-labelledby="all-heading" className="scroll-mt-24 space-y-6">
        <h2 id="all-heading" className="font-display text-2xl font-bold text-white">
          All scenarios
          <span lang="vi" className="mt-1 block text-base font-normal text-zinc-400">Toàn bộ tình huống</span>
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          {DOMAINS.map((d) => (
            <div key={d.id} className="space-y-2">
              <h3 className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                D{d.number} · {d.name.en}
              </h3>
              <ul className="space-y-1.5 text-sm">
                {SCENARIOS.filter((s) => s.domainId === d.id).map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-zinc-200 hover:text-green-400">
                      {s.title.en}
                    </a>
                    <span lang="vi" className="text-zinc-500"> · {s.title.vi}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="domains" aria-labelledby="domains-heading" className="scroll-mt-24 space-y-4 rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-6 md:p-8">
        <h2 id="domains-heading" className="font-display text-lg font-bold text-white">Exam domains and weights</h2>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              <th scope="col" className="py-2 pr-4 font-normal">Domain</th>
              <th scope="col" className="py-2 text-right font-normal">Weight</th>
            </tr>
          </thead>
          <tbody>
            {DOMAINS.map((d) => (
              <tr key={d.id} className="border-t border-zinc-800">
                <td className="py-2 pr-4">
                  <span className="text-zinc-200">{d.number}. {d.name.en}</span>
                  <span lang="vi" className="block text-xs text-zinc-500">{d.name.vi}</span>
                </td>
                <td className="py-2 text-right font-mono text-zinc-300">{d.weight}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-zinc-400">
          Weights from the{' '}
          <a href={OUTLINE_META.source} target="_blank" rel="noopener noreferrer" className={LINK}>
            {OUTLINE_META.outline} ↗
          </a>
          . Check ISC2 for the current outline before you book.
        </p>
        <p className="text-sm text-zinc-400">
          Also on this site: <Link href="/cka" className={LINK}>CKA Study Tracker</Link>
          <span className="text-zinc-600"> · </span>
          <Link href="/tools" className={LINK}>DamonSec tools</Link>
        </p>
      </section>
    </div>
  );
}
