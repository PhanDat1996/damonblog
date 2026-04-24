import type { Category } from '@/types/post';

export interface CategoryConfig {
  slug: Category;
  label: string;
  icon: string;
  metaTitle: string;
  metaDescription: string;
  intro: string[];
  primaryKeywords: string[];
}

export const CATEGORIES: Record<Category, CategoryConfig> = {
  nginx: {
    slug: 'nginx',
    label: 'NGINX',
    icon: '⚙️',
    metaTitle: 'NGINX Configuration, Security & Reverse Proxy Guides — damonsec.com',
    metaDescription:
      'Practical NGINX guides from a Senior L3 engineer — reverse proxy setup, SSL/TLS hardening, rate limiting, upstream configuration, and debugging 502/504 errors in production.',
    intro: [
      'NGINX is the outermost layer of most production web stacks. It terminates TLS, routes traffic, proxies to upstream services, and absorbs the abuse that never reaches your application. When it\'s misconfigured, the failures are often silent: a 413 that appears only when users upload large files, a fraud detection system that stops working because X-Forwarded-For was stripped, an audit finding because server_tokens was never disabled.',
      'These guides cover real failure modes: why your 502s appear under load but not in staging, how to tune proxy timeouts based on actual upstream latency, why missing HSTS is consistently the easiest finding on any external pentest.',
      'If you\'re running NGINX as a reverse proxy in front of Node.js, Django, Rails, or a microservice gateway — the patterns here are built for that context.',
    ],
    primaryKeywords: ['nginx config', 'nginx reverse proxy', 'nginx ssl', 'nginx 502', 'nginx hardening'],
  },
  linux: {
    slug: 'linux',
    label: 'Linux',
    icon: '🐧',
    metaTitle: 'Linux Troubleshooting, Debugging & Sysadmin Guides — damonsec.com',
    metaDescription:
      'Real-world Linux troubleshooting guides from a Senior L3 engineer — debug high CPU, memory leaks, file descriptor exhaustion, systemd failures, and production incidents. No theory.',
    intro: [
      'Production Linux incidents rarely look like the textbook. High CPU with no obvious culprit, memory that grows without a clear leak, a systemd service that fails on start but works fine when you run the binary manually.',
      'These guides are written for engineers already in an incident. They skip the basics and get to the diagnostic workflow: which tool to run first, what the output actually means, and what to change to fix it.',
      'The focus is on tools you already have — strace, ss, lsof, top, ps, systemd journal — and how to use them effectively when something is wrong and you need an answer fast.',
    ],
    primaryKeywords: ['linux troubleshooting', 'linux commands', 'linux debug', 'systemd', 'linux performance'],
  },
  security: {
    slug: 'security',
    label: 'Security',
    icon: '🛡️',
    metaTitle: 'Linux & Web Security Hardening Guides — damonsec.com',
    metaDescription:
      'Technical security guides for engineers — server hardening, CIS benchmarks, threat analysis frameworks, NGINX security headers, and practical defenses against real attack patterns.',
    intro: [
      'Security documentation tends to fall into two failure modes: written for security professionals who already know what they\'re doing, or written for beginners who need everything explained. Both are useless if you\'re a DevOps engineer who needs to harden a server before a deadline.',
      'These guides target the middle ground: practical hardening based on CIS benchmarks, what headers to add and why, what TLS settings fail compliance, and how frameworks like the Cyber Kill Chain apply to real defense decisions.',
      'The goal is to make you a harder target without requiring a security certification — just careful, deliberate configuration backed by understanding what the attacker is actually doing.',
    ],
    primaryKeywords: ['server hardening', 'nginx security', 'linux security', 'cis benchmark', 'tls hardening'],
  },
  devops: {
    slug: 'devops',
    label: 'DevOps',
    icon: '🔧',
    metaTitle: 'DevOps Guides — systemd, Docker, Logging & Monitoring — damonsec.com',
    metaDescription:
      'Practical DevOps guides from a Senior L3 engineer — systemd service management, Docker networking, log rotation, journalctl, and production incident response.',
    intro: [
      'DevOps in practice is mostly debugging things that worked in staging and broke in production, and writing the automation that prevents you from having to debug them twice.',
      'These guides are operational, not aspirational. They start from the point where you have a broken systemd service, a Docker container that exits with code 1, or a monitoring alert that fired and you need to understand what it\'s telling you.',
      'The scope covers systemd, Docker, log management, and common monitoring patterns — with emphasis on understanding what went wrong and fixing it fast.',
    ],
    primaryKeywords: ['devops troubleshooting', 'docker debug', 'systemd service', 'journalctl', 'docker networking'],
  },
  tooling: {
    slug: 'tooling',
    label: 'Tooling',
    icon: '🛠️',
    metaTitle: 'Engineering Tools & Scripts for DevOps and Security — damonsec.com',
    metaDescription:
      'Open-source CLI tools and browser-based utilities for infrastructure engineers — port scanners, NGINX config analyzer, system monitors, and SEO auditors built for technical users.',
    intro: [
      'These are tools built to solve specific problems that kept taking too long to solve manually — not designed with a product roadmap, but by running into the same problem three times and deciding to automate it.',
      'Ranges from CLI scripts you can drop on a server and run immediately, to browser-based utilities for tasks you\'d normally need to install something for.',
    ],
    primaryKeywords: ['devops tools', 'cli tools', 'linux scripts', 'nginx analyzer', 'port scanner'],
  },
};

export const VALID_CATEGORIES = Object.keys(CATEGORIES) as Category[];
