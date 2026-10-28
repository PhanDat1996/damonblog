---
title: "Too Many Open Files on Linux: Why ulimit Didn't Fix It"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Raised ulimit and still getting EMFILE? Find which limit is actually being hit, fix it for systemd, Docker and NGINX, and tell an FD leak from real load."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "linux"
---

<!--
TODO(Damon): replace this comment with 2–4 sentences from a real case before publishing.
What service was it, what error did the customer/team see, what was tried first
(probably `ulimit -n`), and what the actual cause turned out to be.
No customer names needed. This paragraph is what makes the post yours.
-->

You see `Too many open files` in the log. You run `ulimit -n 65535`, restart the service, and ten minutes later the error is back. The command worked, so why didn't the fix?

Because `ulimit` changed the limit for **your shell**, not for the service. On a modern Linux box there are at least three different limits that can produce this error, and the one you raised is usually not the one being hit.

This guide is about finding the right one.

---

## TL;DR

```bash
PID=$(pgrep -o -x myapp)                       # oldest process named myapp

grep "open files" /proc/$PID/limits            # the limit THIS process actually has
ls /proc/$PID/fd | wc -l                       # how many FDs it has open right now

# systemd service? Raise it in the unit, not in limits.conf:
systemctl edit myapp                           # add: [Service] LimitNOFILE=65535
systemctl daemon-reload && systemctl restart myapp

# Can't restart yet? Raise it on the running process:
prlimit --pid $PID --nofile=65535:65535
```

If the FD count keeps climbing no matter how high the limit is, you have a **leak**. Raising the limit only moves the outage to later.

---

## First: which limit did you hit?

Read the exact error message. It tells you the layer.

| Error | errno | Layer | Where the limit lives |
|---|---|---|---|
| `Too many open files` | `EMFILE` (24) | One process hit its own limit | `RLIMIT_NOFILE`, visible in `/proc/<pid>/limits` |
| `Too many open files in system` | `ENFILE` (23) | The whole kernel ran out | `fs.file-max` |
| `ulimit: open files: cannot modify limit: Operation not permitted` | `EPERM` | You tried to go above the hard limit | hard limit, capped by `fs.nr_open` |

How it shows up in common software:

- NGINX: `accept4() failed (24: Too many open files)`
- Java: `java.io.IOException: Too many open files`
- Node.js: `Error: EMFILE: too many open files`
- Python: `OSError: [Errno 24] Too many open files`

All of these are **errno 24, a per-process limit**. In practice `ENFILE` is rare on modern kernels because `fs.file-max` is sized from RAM and is usually very large. If you see the number 24, stop looking at `sysctl`.

---

## Diagnose in 60 seconds

Never trust `ulimit -n` in your own shell. Ask the process:

```bash
PID=$(pgrep -o -x myapp)

grep "open files" /proc/$PID/limits
# Limit                     Soft Limit           Hard Limit           Units
# Max open files            1024                 524288               files

ls /proc/$PID/fd | wc -l
# 1021
```

Soft limit 1024, 1021 in use: that's your problem, confirmed.

> **Don't count with `lsof -p`.** It also lists memory-mapped libraries, the current directory and the binary itself, none of which count toward the limit. `/proc/<pid>/fd` is the real number.

For the system-wide picture:

```bash
cat /proc/sys/fs/file-nr
# 9824    0    9223372036854775807
# allocated  free  max
```

If the first number is nowhere near the third, the system limit is not your problem.

---

## Why `ulimit` and `limits.conf` didn't work

This is where most people lose an hour.

A process gets its limits **from whoever started it**, at the moment it starts.

- `ulimit -n` changes the current shell and anything you start *from that shell*. A service started by systemd never sees it.
- `/etc/security/limits.conf` is applied by `pam_limits` when a user **logs in** (SSH, `su`, console). systemd services don't log in, so this file is **ignored for them**.
- A `*` line in `limits.conf` does **not** match root. Root needs its own line.

So the fix depends entirely on **how the process is started**.

---

## Fix it where the process is started

### systemd service (most cases)

```bash
systemctl edit myapp
```

```ini
[Service]
LimitNOFILE=65535
```

```bash
systemctl daemon-reload
systemctl restart myapp

grep "open files" /proc/$(pgrep -o -x myapp)/limits    # verify, don't assume
```

`daemon-reload` without `restart` does nothing for a running process. Limits are applied only when the process starts.

On systemd 240 and later the default is soft `1024`, hard `524288`. Many applications raise their own soft limit up to the hard limit at startup, which is why some services never hit this problem and others do.

### Docker container

A container inherits its limit from the Docker daemon unless you set it:

```bash
docker run --ulimit nofile=65535:65535 myimage
```

```yaml
# docker-compose.yml
services:
  app:
    ulimits:
      nofile:
        soft: 65535
        hard: 65535
```

Check from inside: `docker exec <container> sh -c 'ulimit -n'`.

### NGINX

NGINX can raise the limit for its workers itself, because the master process runs as root:

```nginx
worker_rlimit_nofile 65535;

events {
    worker_connections 16384;
}
```

Each proxied request uses **two** FDs, one for the client and one for the upstream. So `worker_connections` × 2 must fit under `worker_rlimit_nofile`.

```bash
nginx -t && systemctl reload nginx
```

### Interactive / cron / legacy init scripts

This is the only case where `/etc/security/limits.conf`, or a file in `limits.d/`, is the right place:

```bash
# /etc/security/limits.d/90-appuser.conf
appuser  soft  nofile  65535
appuser  hard  nofile  65535
```

The user must log out and back in. An existing SSH session keeps the old limit.

---

## Emergency fix without a restart

Production is down and you can't restart right now? `prlimit` (from util-linux) changes the limit of a **running** process:

```bash
prlimit --pid $PID --nofile=65535:65535
grep "open files" /proc/$PID/limits
```

This lasts only until the process restarts. Put the permanent fix in the unit file right after.

---

## Leak or real load?

Raising the limit is the right fix only if the FD count **levels off**. Watch it:

```bash
watch -n 10 "ls /proc/$PID/fd | wc -l"
```

- **Goes up with traffic, comes back down when traffic drops:** real load. Raise the limit.
- **Only ever goes up:** leak. The new limit just sets the time of the next outage.

To find what is leaking, group open FDs by type:

```bash
ls -l /proc/$PID/fd | awk 'NR>1 {print $NF}' | sed -E 's/\[[0-9]+\]//' \
  | sort | uniq -c | sort -rn | head
#  14200 socket:
#     38 /var/log/myapp/app.log
#     12 pipe:
#      6 anon_inode:[eventpoll]
```

Mostly `socket:`? Check where the connections go and what state they are in:

```bash
ss -tanp | grep "pid=$PID," | awk '{print $1, $5}' | sort | uniq -c | sort -rn | head
```

Thousands of `CLOSE-WAIT` to the same destination is the classic pattern. The remote side closed the connection, and your application never called `close()`. That is a bug in the code (often an HTTP client or DB connection that isn't returned to the pool), not a tuning problem.

The same log file showing up many times means the app opens it again and again without closing it. That is also a bug.

---

## Quick checklist

1. Read the error: errno 24 (per-process) or 23 (system).
2. Check `/proc/<pid>/limits` and `/proc/<pid>/fd`, not your shell.
3. Fix it where the process starts: systemd unit, Docker, NGINX config, or `limits.conf` only for login sessions.
4. Restart, then verify in `/proc` again.
5. Watch the FD count for a while. If it keeps growing, find the leak.

---

*Related: [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging) for digging into what a process has open. [Linux TIME_WAIT Explained](/blog/linux-time-wait-explained) if the sockets you're seeing are on the other side of the connection.*
