const TAG_COLORS: Record<string, string> = {
  nginx: 'bg-green-900/40 text-green-400 border-green-800/60',
  docker: 'bg-blue-900/40 text-blue-400 border-blue-800/60',
  security: 'bg-red-900/40 text-red-400 border-red-800/60',
  logs: 'bg-yellow-900/40 text-yellow-400 border-yellow-800/60',
  infrastructure: 'bg-cyan-900/40 text-cyan-400 border-cyan-800/60',
  troubleshooting: 'bg-orange-900/40 text-orange-400 border-orange-800/60',
  debugging: 'bg-purple-900/40 text-purple-400 border-purple-800/60',
  linux: 'bg-green-900/40 text-green-400 border-green-800/60',
  networking: 'bg-blue-900/40 text-blue-400 border-blue-800/60',
  'security-ops': 'bg-red-900/40 text-red-400 border-red-800/60',
  production: 'bg-rose-900/40 text-rose-400 border-rose-800/60',
  monitoring: 'bg-teal-900/40 text-teal-400 border-teal-800/60',
  ssl: 'bg-emerald-900/40 text-emerald-400 border-emerald-800/60',
  firewall: 'bg-red-900/40 text-red-400 border-red-800/60',
  incident: 'bg-orange-900/40 text-orange-400 border-orange-800/60',
};

const FALLBACK = 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60';

export function getTagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] ?? FALLBACK;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
