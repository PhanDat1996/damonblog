---
title: "Find a Process by Name in Linux: pgrep, pidof, ps -C"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "pgrep found nothing, but the process is running? How pgrep, pidof and ps -C match names, the 15-character limit, -f vs -x, and safe use in scripts."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
category: "linux"
---

You run `pgrep -x elasticsearch-server` and get nothing. `ps aux` clearly shows it running. Or `pkill java` takes down three services instead of one. Both come from the same thing: each tool matches against a **different** name, and the rules aren't obvious.

```bash
pgrep -a nginx                  # PIDs + command lines matching "nginx" in the process name
pgrep -x nginx                  # exact process name only
pgrep -af "service-prod.jar"    # match anywhere in the full command line
pidof nginx                     # PIDs of the program named nginx
ps -C nginx -o pid,ppid,stat,args
```

---

## What "the name" actually is

Every process has two names the kernel reports:

| Name | Where it lives | Example | Used by |
|---|---|---|---|
| **comm** | `/proc/<PID>/comm` | `java` | `pgrep`, `pkill`, `ps -C`, `top` |
| **command line** | `/proc/<PID>/cmdline` | `java -Xmx4g -jar /opt/app/service-prod.jar` | `pgrep -f`, `ps ... args` |

Two consequences:

1. **comm is truncated to 15 characters.** A program called `elasticsearch-server` has comm `elasticsearch-s`. `pgrep -x elasticsearch-server` never matches. Use `pgrep -f` or match the truncated name.
2. **For interpreted programs, comm is the interpreter** (or whatever the program set). A Python app shows up as `python3`, a Node app as `node`, a JAR as `java`. To find *your* app, match the command line with `-f`.

Programs can also rename themselves. NGINX workers show `nginx: worker process` in `args`, PostgreSQL backends show `postgres: app mydb 10.0.0.5(51234) idle`.

---

## pgrep

```bash
pgrep nginx              # pattern (regex) anywhere in comm: also matches "nginx-exporter"
pgrep -x nginx           # comm must equal "nginx" exactly
pgrep -f "worker.py"     # pattern anywhere in the full command line
pgrep -a nginx           # also print the command line
pgrep -l nginx           # also print the name
pgrep -u www-data nginx  # only this user's processes
pgrep -c nginx           # count instead of list
pgrep -o -x nginx        # oldest match (usually the master/parent)
pgrep -n -x nginx        # newest match
pgrep -P 1102            # children of PID 1102
pgrep -d, -x nginx       # comma-separated, handy for top -p
```

The pattern is an extended regular expression, so `pgrep 'php-fpm|nginx'` works and `.` matches any character.

Exit codes are script-friendly: **0** if something matched, **1** if nothing did, **2** for a syntax error. `pgrep` never matches itself.

### The `-f` self-match trap

`pgrep` excludes itself, but not its parent shell. This in a script:

```bash
ssh host "pgrep -f worker.py"
```

can match the remote `bash -c "pgrep -f worker.py"` process, because that shell's command line contains `worker.py`. The same happens in cron jobs and `watch`. Make the pattern something the wrapper won't contain, e.g. `pgrep -f '[w]orker.py'` (the regex still matches `worker.py`, but the literal text `[w]orker.py` in the wrapper's command line doesn't).

---

## pidof

```bash
pidof nginx
# 1103 1102
pidof -s nginx           # just one PID
pidof -x backup.sh       # also match shell scripts by script name
```

`pidof` matches the program name (from the executable or `argv[0]`), not a pattern. `pidof ngin` returns nothing. It doesn't truncate at 15 characters the way comm does, so it can find long names that `pgrep -x` misses.

It doesn't filter by user and doesn't do regexes. On Debian/Ubuntu it comes from `sysvinit-utils`; on RHEL 8 and later from `procps-ng`. Behavior is close but not identical, so prefer `pgrep` in portable scripts.

---

## ps -C and ps | grep

```bash
ps -C nginx -o pid,ppid,user,stat,etime,args
```

`-C` selects by exact comm (same 15-character limit) and lets you choose columns, which is the best combination when you want details rather than just PIDs.

If you grep `ps` output, avoid matching the grep itself:

```bash
ps aux | grep '[n]ginx'
```

The regex `[n]ginx` matches "nginx", but grep's own command line contains `[n]ginx`, which doesn't. Fine for a quick look; in scripts, `pgrep` is cleaner.

---

## Common lookups

### Is it running? (in a script)

```bash
if pgrep -x nginx >/dev/null; then
  echo "nginx running ($(pgrep -cx nginx) processes)"
else
  echo "nginx not running" >&2
  exit 1
fi
```

For systemd-managed services, `systemctl is-active --quiet nginx` is a better check: it tells you whether the **service** is up, not just whether some process named nginx exists. See [How to Check Running Processes](/blog/check-running-process-linux).

### Which of several Java apps is which?

```bash
pgrep -af java
# 8823 java -Xmx4g -jar /opt/app/service-prod.jar
# 9011 java -Xmx2g -jar /opt/app/worker.jar
```

```bash
PID=$(pgrep -f 'service-prod\.jar')
```

Escape the dot or it matches any character.

### Details for every match

```bash
ps -o pid,ppid,stat,etime,%cpu,rss,args -p "$(pgrep -d, -x nginx)"
top -p "$(pgrep -d, -x nginx)"
```

Both fail with an error if `pgrep` returns nothing, so check first in scripts. Column meanings are in [ps Command in Linux](/blog/ps-command-linux-troubleshooting).

### What's using a port

Name unknown, port known? Go from the port:

```bash
sudo ss -tlnp 'sport = :8080'
```

Then [Kill a Process by Port](/blog/linux-kill-process-by-port) if that's the goal.

---

## Killing by name, safely

`pkill` uses exactly the same matching as `pgrep`, so **run `pgrep` with the same arguments first** and look at what it selects:

```bash
pgrep -a -x -u app myworker      # preview
pkill    -x -u app myworker      # same match, sends SIGTERM
```

- Without `-x`, `pkill nginx` also signals `nginx-exporter` or anything else containing "nginx".
- `pkill -f java` kills every Java process on the box. Match the JAR or main class instead.
- For services managed by systemd, use `systemctl stop|restart`. A unit with `Restart=always` will simply start a pkill'd process again.
- Default signal is SIGTERM. Use `-9` (SIGKILL) only if the process ignores SIGTERM, since it gets no chance to flush data or remove lock files.

`killall` exists too (psmisc). On Linux it kills by name; on some other Unix systems `killall` kills **everything**, so don't build that habit if you work across platforms.

---

**Why does pgrep not find a process with a long name?**
`pgrep` matches the 15-character comm by default. Use `pgrep -f` to match the full command line, or `pidof`, which uses the full program name.

**How do I find a process by name and get only one PID?**
`pgrep -o -x name` for the oldest (typically the parent), `pgrep -n -x name` for the newest, or `pidof -s name`.

**Is pgrep case-sensitive?**
Yes. Add `-i` for case-insensitive matching.

---

*Related: [Linux Process States](/blog/linux-process-states-guide) for reading the `STAT` of what you found.*
