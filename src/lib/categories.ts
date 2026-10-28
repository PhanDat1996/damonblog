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
    metaTitle: 'NGINX Configuration & Troubleshooting Guides',
    metaDescription:
      'NGINX troubleshooting notes: 502, 504 and 413 errors reproduced on a lab VM, upstream keepalive, rate limiting and TLS hardening.',
    intro: [
      'Notes on NGINX problems: 502 and 504 errors traced from the upstream side, request size limits, keepalive to upstreams, rate limiting and TLS settings.',
      'Posts marked as lab-tested were run on an Ubuntu 26.04 VM with NGINX 1.28. The log lines and status codes in them are copied from those runs.',
    ],
    primaryKeywords: [
      'nginx configuration',
      'nginx reverse proxy',
      'nginx 502',
      'nginx upstream',
      'nginx performance tuning',
      'nginx ssl hardening',
    ],
  },
  linux: {
    slug: 'linux',
    label: 'Linux',
    icon: '🐧',
    metaTitle: 'Linux Troubleshooting, Debugging & Sysadmin Guides',
    metaDescription:
      'Linux troubleshooting notes: high CPU and memory, the OOM killer, process states, file descriptor limits and systemd failures, worked from the symptom.',
    intro: [
      'Notes on Linux problems that show up on servers: high CPU or load, memory growth and the OOM killer, processes stuck in D state, file descriptor limits and services that fail to start.',
      'Most posts start from the symptom and work through the commands that narrow it down, using tools already on the box: ps, top, ss, lsof, strace and journalctl.',
    ],
    primaryKeywords: ['linux troubleshooting', 'linux commands', 'linux debug', 'systemd', 'linux performance'],
  },
  security: {
    slug: 'security',
    label: 'Security',
    icon: '🛡️',
    metaTitle: 'Linux & Web Security Hardening Guides',
    metaDescription:
      'Security notes: CIS Level 1 hardening for Ubuntu, RHEL and Windows Server, firewall rules, NGINX TLS settings, and the Kill Chain and Diamond Model.',
    intro: [
      'Hardening and analysis notes. The CIS posts cover Level 1 controls for Ubuntu, RHEL and Windows Server, and call out the controls that tend to break things.',
      'There are also posts on firewall rules with iptables and nftables, NGINX TLS settings, and how analysts use the Cyber Kill Chain and Diamond Model during an incident.',
    ],
    primaryKeywords: ['server hardening', 'nginx security', 'linux security', 'cis benchmark', 'tls hardening'],
  },
  devops: {
    slug: 'devops',
    label: 'DevOps',
    icon: '🔧',
    metaTitle: 'DevOps Guides — systemd, Docker, Logging & Monitoring',
    metaDescription:
      'DevOps notes: systemd services that fail to start or restart, Docker containers that exit, container networking, log rotation and journalctl filtering.',
    intro: [
      'Notes on systemd, Docker and logs: services that won\'t start or restart, containers that exit right away, container networking, and keeping logs from filling the disk.',
    ],
    primaryKeywords: ['devops troubleshooting', 'docker debug', 'systemd service', 'journalctl', 'docker networking'],
  },
  tooling: {
    slug: 'tooling',
    label: 'Tooling',
    icon: '🛠️',
    metaTitle: 'Engineering Tools & Scripts for DevOps and Security',
    metaDescription:
      'Free NGINX and PostgreSQL config checkers that run in the browser, plus small open-source CLI tools for port checks, system monitoring and SEO audits.',
    intro: [
      'Browser-based checkers for NGINX and PostgreSQL configs, and a few small CLI tools on GitHub. Each one started as a check that kept being done by hand.',
    ],
    primaryKeywords: ['devops tools', 'cli tools', 'linux scripts', 'nginx analyzer', 'port scanner'],
  },
};

export const VALID_CATEGORIES = Object.keys(CATEGORIES) as Category[];