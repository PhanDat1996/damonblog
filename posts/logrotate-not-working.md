---
title: "Logrotate Not Working? 7 Causes Reproduced on Ubuntu"
date: "2026-11-14"
updated: "2026-11-14"
excerpt: "Logs not rotating or the app still writing to app.log.1? Seven logrotate failures reproduced on Ubuntu 26.04, with the exact error line and fix for each."
tags: ["linux", "troubleshooting", "logs", "infrastructure"]
featured: false
lab: true
category: "linux"
---

The log file keeps growing past its size limit, or it rotated but the application is still writing to `app.log.1` while `app.log` sits at zero bytes. Running `logrotate` by hand prints nothing useful, or prints `log does not need rotating` and exits.

Every cause below was reproduced on a lab VM with a throwaway config and state file, so each error line is real output.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, logrotate 3.22.0 (`3.22.0-1build1`), systemd 259. logrotate ran as root (`sudo`) against test configs in a lab directory and logs in `/var/log/labrot/`, with a private state file (`-s ./state`) so the system's own rotation state wasn't touched. The test writer process ran as a normal user. Everything was removed afterwards.

---

## Quick answer: debug any logrotate config

```bash
# 1. Dry run: what would happen and why (changes nothing)
sudo logrotate -d /etc/logrotate.d/myapp

# 2. Real run with reasons, ignoring the time check
sudo logrotate -v -f /etc/logrotate.d/myapp

# 3. When did logrotate last rotate it?
sudo grep myapp /var/lib/logrotate/status

# 4. Did the daily run itself fail?
systemctl list-timers logrotate.timer
journalctl -u logrotate.service -n 20
```

`-d` only prints; it never rotates. `-f` forces rotation even when the schedule says it isn't due, but (as Cause 3 shows) it does not override every rule.

| Message from `logrotate -d` / `-v` | Cause |
|---|---|
| `Ignoring X because it is writable by group or others` | Cause 1: config file mode |
| `Ignoring X because the file owner is wrong` | Cause 1: config file owner |
| `log does not need rotating (log has already been rotated)` | Cause 2: state file says it's not due |
| `log does not need rotating (log is empty)` | Cause 3: `notifempty` |
| `parent directory has insecure permissions` | Cause 4: log directory writable by a non-root group |
| `keyword 'rotate' not properly separated` | Cause 5: syntax error |
| No error, but the old file keeps growing | Cause 6: app never reopens its log |
| No error, but the new file starts with NUL bytes | Cause 7: `copytruncate` without `O_APPEND` |

---

## Cause 1: the config file is ignored (mode or owner)

The test config was written by a normal user in a home directory. With Ubuntu's default `umask 0002` it came out as `0664`:

```
$ sudo logrotate -d -s ./state labrot.conf
warning: logrotate in debug mode does nothing except printing debug messages!  Consider using verbose mode (-v) instead if this is not what you want.

warning: Potentially dangerous mode on labrot.conf: 0664
error: Ignoring labrot.conf because it is writable by group or others.
...
Handling 0 logs
```

`Handling 0 logs` is the tell: the config was never read. After `chmod 644`, the next check fired:

```
error: Ignoring labrot.conf because the file owner is wrong (should be root or user with uid 0).
...
Handling 0 logs
```

When logrotate runs as root, the config must be owned by root and not writable by group or others. A config copied into `/etc/logrotate.d/` with `cp -p` from a user's directory, or created by a deployment tool with a loose umask, hits exactly this. The daily run doesn't fail loudly for it either.

**Fix:**

```bash
sudo chown root:root /etc/logrotate.d/myapp
sudo chmod 644 /etc/logrotate.d/myapp
```

---

## Cause 2: "log does not need rotating" on a new config

With the mode fixed and a 2,000-line log in place, the first run still did nothing:

```
considering log /var/log/labrot/app.log
Creating new state
  Now: 2026-11-14 04:18
  Last rotated at 2026-11-14 04:00
  log does not need rotating (log has already been rotated)
```

This was the first time logrotate had seen this file, yet it reported it as `already been rotated`. On first sight logrotate records the current time in the state file and treats that as the last rotation:

```
$ sudo cat state
logrotate state -- version 2
"/var/log/labrot/app.log" 2026-11-14-4:0:0
```

So a new `daily` config does nothing on its first run, and a `weekly` one waits a week. Backdating the entry to 2026-11-12 made the next run rotate:

```
considering log /var/log/labrot/app.log
  Now: 2026-11-14 04:19
  Last rotated at 2026-11-12 04:00
  log needs rotating
rotating log /var/log/labrot/app.log, log->rotateCount is 3
...
renaming /var/log/labrot/app.log to /var/log/labrot/app.log.1
compressing log with: /bin/gzip
```

**Fix:** if you need it rotated now, run `logrotate -f` once. Otherwise it's working as designed. The system state file is `/var/lib/logrotate/status`; on this VM it had 40 lines, for example `"/var/log/nginx/error.log" 2026-11-11-0:21:21`.

One more thing from this run: after rotation there was no new `app.log`. The test config didn't have `create`. On Ubuntu, `create` (and `su root adm`, `weekly`, `rotate 4`) come from `/etc/logrotate.conf`. A config run on its own, as in `logrotate myapp.conf`, doesn't inherit them.

---

## Cause 3: empty log and `notifempty`, even with -f

An empty `app.log` with `notifempty` in the config:

```
considering log /var/log/labrot/app.log
  Now: 2026-11-14 04:19
  Last rotated at 2026-11-12 04:00
  log does not need rotating (log is empty)
```

Same command with `-f`:

```
considering log /var/log/labrot/app.log
  Now: 2026-11-14 04:19
  Last rotated at 2026-11-12 04:00
  log does not need rotating (log is empty)
```

`-f` overrides the time check, not `notifempty`. If `-f` "doesn't work", check whether the file is actually empty, for example because the application is writing somewhere else (see Cause 6).

---

## Cause 4: "parent directory has insecure permissions"

The log directory was handed to the application user with group write:

```
$ ls -ld /var/log/labrot
drwxrwxr-x 2 damon damon 4096 Nov 14 04:19 /var/log/labrot
$ sudo logrotate -f -v -s ./state labrot.conf
considering log /var/log/labrot/app.log
error: skipping "/var/log/labrot/app.log" because parent directory has insecure permissions (It's world writable or writable by group which is not "root") Set "su" directive in config file to tell logrotate which user/group should be used for rotation.
```

Exit code was `1`. This guard exists because a user who can write to the directory could swap files and get root to write somewhere else during rotation.

What the check actually looks at, from the lab:

| Directory | Result |
|---|---|
| `drwxrwxr-x damon damon` (group-writable, non-root group) | skipped, error above |
| `drwxr-xr-x damon damon` (owned by a normal user, no group write) | rotated, exit `0` |

So a non-root owner on its own is fine; group or world write is what triggers it.

**Fix A:** remove group write (`chmod 755` or `750`) if the application doesn't need it.

**Fix B:** keep the permissions and tell logrotate to rotate as that user:

```
/var/log/labrot/app.log {
    daily
    rotate 3
    compress
    missingok
    notifempty
    su damon damon
}
```

```
renaming /var/log/labrot/app.log to /var/log/labrot/app.log.1
compressing log with: /bin/gzip
switching uid to 1000 and gid to 1000 permanently (pid 253738)
switching euid from 1000 to 0 and egid from 1000 to 0 (pid 253737)
```

The new `app.log.1.gz` was owned by `damon damon`, while older rotations made before the `su` line were `root root`. Mixed ownership in the same directory is a hint that `su` was added later. For general ownership troubleshooting see [permission denied on Linux](/blog/permission-denied-linux-fix-chmod-chown).

---

## Cause 5: a syntax error skips the whole block

A missing space, `rotate3` instead of `rotate 3`:

```
$ sudo logrotate -f -s ./state4 typo.conf
error: typo.conf:3 keyword 'rotate' not properly separated, found 0x33
error: found error in /var/log/labrot/app.log, skipping
```

Exit code `1`, and the log was not rotated. `0x33` is the character `3`. logrotate reports the file and line, so `logrotate -d` after every edit catches this before the nightly run does.

---

## Cause 6: the app keeps writing to app.log.1

This is the most common "rotation works but the log is still huge" case. A small writer process opened `app.log` once and appended a line every 100 ms. The config used `create`, the default style, which renames the file and creates a new empty one:

```
/var/log/labrot/app.log {
    rotate 3
    create 0644 damon damon
    missingok
}
```

Three seconds after a forced rotation:

```
$ ls -l /var/log/labrot
-rw-r--r-- 1 damon damon    0 Nov 14 04:20 app.log
-rw-rw-r-- 1 damon damon 2440 Nov 14 04:20 app.log.1
$ ls -l /proc/$PID/fd | grep labrot
l-wx------ 1 damon damon 64 Nov 14 04:20 3 -> /var/log/labrot/app.log.1
```

A rename doesn't change the open file descriptor. The process kept writing to the same inode, now named `app.log.1`, and the new `app.log` stayed at 0 bytes. Later rotations rename that same open file again and finally delete it, while the process keeps writing into it.

**Fix:** tell the application to reopen its log after rotation. The test writer reopens on `SIGHUP`:

```
/var/log/labrot/app.log {
    rotate 3
    create 0644 damon damon
    missingok
    sharedscripts
    postrotate
        kill -HUP $(cat /home/damon/labs/logrotate-not-working/writer.pid)
    endscript
}
```

```
renaming /var/log/labrot/app.log to /var/log/labrot/app.log.1
creating new /var/log/labrot/app.log mode = 0644 uid = 1000 gid = 1000
running postrotate script
...
l-wx------ 1 damon damon 64 Nov 14 04:20 3 -> /var/log/labrot/app.log
```

The file descriptor now pointed at the new `app.log`, which was growing. Each daemon has its own reopen signal: NGINX reopens logs on `USR1` (`nginx -s reopen`), many others on `HUP`, and some have a dedicated command. Check the package's own file in `/etc/logrotate.d/` for the right one.

---

## Cause 7: copytruncate and a file full of NUL bytes

`copytruncate` is the workaround when the application can't be signaled: logrotate copies the file, then truncates the original in place, so the open file descriptor stays valid. Whether that works depends on how the application opened the file.

The same writer, run twice, once with `open(path, "a")` (`O_APPEND`) and once with `open(path, "w")` (no `O_APPEND`), each time forced through:

```
/var/log/labrot/app.log {
    rotate 3
    copytruncate
    missingok
}
```

With `O_APPEND`:

```
4 -rw-rw-r-- 1 damon damon  400 Nov 14 04:21 app.log
4 -rw-rw-r-- 1 damon damon 1240 Nov 14 04:20 app.log.1
first bytes of app.log after truncate:
0000000   l   i   n   e       0   0   0   0   0   0   3   2       x   x
```

`app.log.1` ended at line 31 and the new `app.log` started at line 32: nothing lost in this run, and the file started at byte 0.

Without `O_APPEND`:

```
4 -rw-rw-r-- 1 damon damon 1640 Nov 14 04:21 app.log
4 -rw-rw-r-- 1 damon damon 1240 Nov 14 04:21 app.log.1
first bytes of app.log after truncate:
0000000  \0  \0  \0  \0  \0  \0  \0  \0  \0  \0  \0  \0  \0  \0  \0  \0
*
0000060
```

The writer kept its old file offset (1,240 bytes). After the truncate it wrote at that offset, and the start of the file became a hole that reads back as NUL bytes. `ls` reports 1,640 bytes while the file uses only 4 KiB of disk, and tools that read it see a run of NUL bytes before the first real line. This is why a log sometimes looks like it "didn't shrink" after `copytruncate`. See [checking disk usage with du and df](/blog/check-disk-usage-linux-du-df) for why apparent size and real usage differ.

**Fix:** use `copytruncate` only for applications that open their log with `O_APPEND`. Shell redirection with `>>` does; `>` doesn't. There is also a small window between copy and truncate where lines can be lost; it wasn't hit in this run, but it's the reason to prefer `create` + a reopen signal when the application supports it. Docker container logs have their own rotation and shouldn't go through logrotate at all; see [Docker log rotation](/blog/docker-log-rotation).

---

## Is the daily logrotate job running at all?

On Ubuntu 26.04 logrotate is started by a systemd timer, not cron:

```
$ systemctl list-timers logrotate.timer
NEXT                             LEFT LAST                               PASSED UNIT                           ACTIVATES
Sun 2026-11-15 00:39:26 UTC       19h Sat 2026-11-14 00:07:21 UTC   4h 9min ago logrotate.timer                logrotate.service

$ systemctl show logrotate.service -p Result -p ExecMainStatus
Result=success
ExecMainStatus=0
```

The service runs `/usr/sbin/logrotate /etc/logrotate.conf` and has `ConditionACPower=true`. On a laptop running on battery the daily run is skipped; on a server or VM without a battery the condition is always true.

In the lab, Causes 1, 4 and 5 each made logrotate exit with code `1`, and a non-zero exit marks the oneshot `logrotate.service` as failed. Other logs in the same run still rotate, so a failed result doesn't tell you which config is broken. `journalctl -u logrotate.service` shows the `error:` lines with the file name.

---

## FAQ

**How do I test a logrotate config without rotating anything?**
`sudo logrotate -d /etc/logrotate.d/myapp`. Debug mode prints every decision and reason, and never touches the files.

**Why does logrotate say "log does not need rotating"?**
The reason is in brackets after it: `log has already been rotated` means the state file says it's not due (a new config records "now" on its first run), `log is empty` means `notifempty` applies, and `-f` does not override the empty check.

**Why is the application still writing to the rotated file?**
It holds an open file descriptor to the old inode. Send the application its reopen signal in `postrotate`, or use `copytruncate` if it opens the log with `O_APPEND`.

**How do I fix "parent directory has insecure permissions" in logrotate?**
Remove group and world write from the log directory, or add `su <user> <group>` to that log's block so logrotate rotates as the directory's owner.

**Where does logrotate store when a log was last rotated?**
In `/var/lib/logrotate/status` on Ubuntu and Debian. Each line is the log path and the last rotation time.
