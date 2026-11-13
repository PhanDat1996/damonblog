---
title: "Cron Job Not Running? 7 Causes Reproduced on Ubuntu"
date: "2026-11-13"
updated: "2026-11-13"
excerpt: "Cron job not running? 7 causes reproduced on Ubuntu 26.04: PATH, % signs, missing newline, exec bit, env vars and /etc/cron.d rules, with the log lines."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
lab: true
category: "linux"
---

The script works when you run it by hand. In the crontab it does nothing: no output file, no error, no email. `crontab -l` shows the line, the schedule looks right, and the job still never seems to happen.

Almost every case comes down to one of a handful of differences between your shell and the environment cron gives a job. This post reproduces seven of them on a lab VM, with the exact error or log line each one leaves behind, and the fix that made the job run.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, `cron 3.0pl1-200ubuntu1` (the Debian/Ubuntu Vixie cron), systemd 259, rsyslog installed, no mail transfer agent. User crontabs were installed as an unprivileged user; the `/etc/cron.d` tests used `sudo`. Every job ran every minute (`* * * * *`) and the results below were read after it fired.

---

## TL;DR: the checklist

```bash
# 1. Did cron start the job at all? (Ubuntu/Debian unit is "cron", RHEL is "crond")
journalctl -u cron --since "10 min ago" --no-pager

# 2. Capture the job's own errors: always redirect stderr while debugging
* * * * * /full/path/job.sh >> /tmp/job.log 2>&1

# 3. Compare cron's environment with yours
* * * * * env > /tmp/cron-env.txt
```

| Symptom in the lab | Cause | Fix |
|---|---|---|
| `new crontab file is missing newline before EOF, can't install.` | Last line has no newline | End the file with a newline |
| `/bin/sh: 1: mytool: not found` | Command is only on *your* `PATH` | Full path, or `PATH=` line in the crontab |
| Log shows `CMD (echo "stamp $(date +)` and nothing else | Unescaped `%` | Write `\%` |
| `/bin/sh: 1: /path/job.sh: Permission denied` | No execute bit | `chmod +x`, or `bash /path/job.sh` |
| Script runs, variable empty | Variables from `.bashrc`/`.profile` aren't loaded | Set them in the crontab or the script |
| `INSECURE MODE`, `WRONG FILE OWNER`, `bad username` | `/etc/cron.d` file rules | `root:root`, `644`, a user field |
| Nothing in the log at all | `/etc/cron.d` filename contains a dot | Rename to letters, digits, `-`, `_` |
| `(CRON) info (No MTA installed, discarding output)` | Output went to mail that doesn't exist | Redirect output to a file |

---

## Where cron logs on Ubuntu

Start here, because it tells you whether the problem is "cron never started it" or "it started and failed".

```bash
journalctl -u cron --since "00:28" --no-pager | grep -v pam_unix
```

Real lines from the lab:

```
Nov 13 00:29:01 damon CRON[244423]: (damon) CMD (sysctl -n kernel.ostype >> /home/damon/labs/linux-cron-job-not-running/path.log 2>&1)
Nov 13 00:29:01 damon CRON[244406]: (CRON) info (No MTA installed, discarding output)
Nov 13 00:30:01 damon cron[161821]: (damon) RELOAD (crontabs/damon)
```

- `(damon) CMD (...)` means cron **did** start the command as user `damon`. If you see this, cron is fine and the problem is inside the job.
- `RELOAD (crontabs/damon)` means cron noticed an edited crontab. There's no need to restart cron after `crontab -e`.
- `No MTA installed, discarding output` means the job wrote something to stdout/stderr and cron tried to mail it to you. With no mail system, that output, often the only error message, is thrown away.

Each run also logs a `pam_unix(cron:session): session opened for user ...` pair, which is noise here; filter it out with `grep -v pam_unix`. The same lines also land in `/var/log/syslog` when rsyslog is installed (it was on this VM), readable by the `adm` group. For reading the journal efficiently, see the [Linux log analysis guide](/blog/linux-log-analysis-guide).

---

## 1. Missing newline at the end of the crontab

Installing a crontab file whose last line doesn't end in a newline:

```bash
printf "* * * * * $L/ok.sh >> $L/ok.log 2>&1" > nonewline.txt   # no \n at the end
crontab nonewline.txt
```

```
new crontab file is missing newline before EOF, can't install.
```

Exit code 1, and `crontab -l` afterwards still said `no crontab for damon`. If you deploy crontabs with a config-management tool or `echo -n`, check the return code: the old crontab (or none) stays in place.

**Fix:** make sure the file ends with a newline.

---

## 2. Command not found: PATH

The classic advice says cron's `PATH` is only `/usr/bin:/bin`, so anything in `/usr/sbin` fails. **On this Ubuntu 26.04 VM that wasn't true.** A job calling `sysctl` (which lives in `/usr/sbin`) without a path worked:

```
$ cat path.log
Linux
```

The environment cron gave the job explains why:

```
$ cat cron-env.txt
HOME=/home/damon
LOGNAME=damon
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin
LANG=en_US.UTF-8
SHELL=/bin/sh
PWD=/home/damon
```

That `PATH` comes from `/etc/environment`, which Ubuntu's `/etc/pam.d/cron` loads with `session required pam_env.so`. So system directories are covered. What still breaks is anything you add to `PATH` yourself in `.bashrc`, `.profile`, nvm, pyenv, a venv or `~/.local/bin`, because cron never reads those files.

To reproduce, a small `mytool` script was put in `~/labs/.../bin` and that directory was added to the shell's `PATH`:

```
$ export PATH=$L/bin:$PATH
$ mytool
mytool ok
```

The same command in the crontab, with `2>&1` so the error is kept:

```
* * * * * mytool >> /home/damon/labs/linux-cron-job-not-running/path2.log 2>&1
```

```
$ cat path2.log
/bin/sh: 1: mytool: not found
```

Note the `/bin/sh`: cron runs commands with `SHELL=/bin/sh` (dash on Ubuntu), not bash, so bash-only syntax like `[[ ]]` or `source` in the crontab line itself also fails.

**Fix:** use the full path (`/home/damon/labs/.../bin/mytool` produced `mytool ok` in the next run), or put a `PATH=...` line at the top of the crontab. Don't rely on what your interactive `PATH` happens to be.

---

## 3. The `%` sign

In a crontab, an unescaped `%` ends the command. Everything after the first `%` is fed to the command as standard input. This line looks harmless:

```
* * * * * echo "stamp $(date +%F)" >> /home/damon/labs/linux-cron-job-not-running/percent.log 2>&1
```

The cron log shows what was actually run:

```
Nov 13 00:29:01 damon CRON[244419]: (damon) CMD (echo "stamp $(date +)
```

The command is cut at `%`. The redirect `>> percent.log 2>&1` was after the `%`, so it never applied: `percent.log` was **not created at all**, and the shell's error went to cron's mail, which on this VM ended as one more `No MTA installed, discarding output` line. That's why `%` bugs look like "the job never ran".

Running the truncated command by hand shows the error that was discarded:

```
$ printf '%s\n' 'F)" >> /dev/null 2>&1' | /bin/sh -c 'echo "stamp $(date +'
/bin/sh: 1: Syntax error: end of file unexpected (expecting ")")
```

**Fix:** escape it as `\%`:

```
* * * * * echo "stamp $(date +\%F)" >> /home/damon/labs/linux-cron-job-not-running/percent.log 2>&1
```

```
$ cat percent.log
stamp 2026-11-13
```

Or move the command into a script, where `%` needs no escaping. That's the cleaner option for anything longer than one `date` call.

---

## 4. Script isn't executable

`backup.sh` had mode `644`. Because the line redirected stderr, the error was captured:

```
$ cat backup.log
/bin/sh: 1: /home/damon/labs/linux-cron-job-not-running/backup.sh: Permission denied
```

Without `2>&1` this would have been another silent `No MTA installed` line.

A related trap is a script saved with Windows (CRLF) line endings. Run from bash it fails clearly, but cron starts commands through `/bin/sh`, and there the message is misleading. A two-line CRLF script, run both ways by hand on the VM:

```
$ ./crlf.sh
bash: ./crlf.sh: /bin/bash^M: bad interpreter: No such file or directory
$ /bin/sh -c ./crlf.sh
/bin/sh: 1: ./crlf.sh: not found
```

The file exists; `not found` refers to the interpreter `/bin/bash\r`. Fix with `sed -i 's/\r$//' script.sh` (or `dos2unix`). More causes of `Permission denied` (directory permissions, `noexec` mounts) are in [the chmod/chown guide](/blog/permission-denied-linux-fix-chmod-chown).

**Fix:** `chmod 755 backup.sh`, or call it as `/bin/bash /path/backup.sh`.

---

## 5. Environment variables from your shell aren't there

After `chmod`, `backup.sh` ran, but it reads `API_URL`, which in a real setup would be exported from `.bashrc` or `.profile`. Cron doesn't load those:

```
backup ran at 00:30:01 as damon, API_URL=<empty>
```

Vixie cron accepts `NAME=value` lines in the crontab. They apply to the entries **below** them. The lab crontab ran the script once above and once below such a line:

```
* * * * * /home/damon/labs/linux-cron-job-not-running/backup.sh >> /home/damon/labs/linux-cron-job-not-running/backup.log 2>&1
API_URL=https://api.lab.internal
* * * * * /home/damon/labs/linux-cron-job-not-running/backup.sh >> /home/damon/labs/linux-cron-job-not-running/backup-env.log 2>&1
```

Same minute, two results:

```
backup.log:     backup ran at 00:30:01 as damon, API_URL=<empty>
backup-env.log: backup ran at 00:30:01 as damon, API_URL=https://api.lab.internal
```

Crontab variable lines are literal: no `$HOME` expansion, no `export`. For anything secret or long, source a dedicated env file at the top of the script instead (`set -a; . /etc/myjob.env; set +a`), with tight permissions.

To see exactly what a job gets, use the `env > /tmp/cron-env.txt` trick from the TL;DR and diff it against `env` in your shell.

---

## 6. `/etc/cron.d` files that cron refuses

System crontabs in `/etc/cron.d` have stricter rules than user crontabs. Four files were dropped in at once, each with one problem, next to a correct one:

| File | Problem | Result |
|---|---|---|
| `lab-good` | none: `root:root`, `644`, user field | Ran |
| `lab-badmode` | `chmod 664` (group-writable) | Refused |
| `lab-owner` | owned by `damon:damon` | Refused |
| `lab-nouser` | no user field (user-crontab syntax) | Refused |
| `lab.dotted` | dot in the filename | Ignored, **no log line** |

The cron log, one minute later:

```
Nov 13 00:29:01 damon cron[161821]: (*system*lab-badmode) INSECURE MODE (group/other writable) (/etc/cron.d/lab-badmode)
Nov 13 00:29:01 damon cron[161821]: Error: bad username; while reading /etc/cron.d/lab-nouser
Nov 13 00:29:01 damon cron[161821]: (*system*lab-nouser) ERROR (Syntax error, this crontab file will be ignored)
Nov 13 00:29:01 damon cron[161821]: (*system*lab-owner) WRONG FILE OWNER (/etc/cron.d/lab-owner)
Nov 13 00:29:01 damon CRON[244416]: (damon) CMD (echo good >> /home/damon/labs/linux-cron-job-not-running/crond-good.log)
```

- `bad username` is what you get when you paste a user-crontab line (`* * * * * command`) into `/etc/cron.d`: cron reads the first word of the command as the user name. Files there need a sixth field: `* * * * * damon command`.
- `lab.dotted` produced nothing: no error, no `CMD`, no output file. Debian's cron skips `/etc/cron.d` files whose names contain anything other than letters, digits, `_` and `-`, so names like `backup.cron` or `myjob.sh` are silently ignored. The same naming rule applies to scripts in `/etc/cron.daily` and friends (run by `run-parts`).

**Fix:** `chown root:root`, `chmod 644`, add the user field, and use a dot-free name.

---

## 7. Output disappears: no mail

Any job that writes to stdout or stderr without a redirect triggers a mail to the crontab owner. On a VM without Postfix or another MTA, like this one, cron logs:

```
Nov 13 00:29:01 damon CRON[244406]: (CRON) info (No MTA installed, discarding output)
```

In the lab, this line appeared for a perfectly healthy `ok.sh` that just printed a line, **and** for the broken `%` job. You can't tell from the log which is which, so while debugging, redirect every job to a file with `>> /path/log 2>&1`. Set `MAILTO=""` in the crontab if you want cron to stop trying to mail at all.

---

## What wasn't tested

- Timezone surprises (`CRON_TZ`, a server in UTC while you think in local time). The VM runs in UTC; check `timedatectl` if a job fires hours off.
- `anacron` and laptops that are off at the scheduled time. `/etc/crontab` on this VM skips `cron.daily` when `/usr/sbin/anacron` exists.
- cronie on RHEL/Fedora: the unit is `crond` and some messages differ.

If the job is a long-running service rather than a periodic task, it belongs in systemd instead; [systemctl service not starting](/blog/systemctl-service-not-starting-fix) covers debugging that side.

---

## FAQ

**Do I need to restart cron after editing a crontab?**
No. In the lab, cron logged `RELOAD (crontabs/damon)` and picked up the change at the next minute without a restart.

**Why does my cron job work manually but not in cron?**
Cron runs `/bin/sh` with a minimal environment: no `.bashrc`, no `.profile`, a fixed `PATH`. Commands you added to `PATH` and variables you exported in your shell aren't there.

**Where is the cron log on Ubuntu?**
`journalctl -u cron`, and `/var/log/syslog` (lines tagged `CRON`) when rsyslog is installed. This Ubuntu 26.04 VM had no separate `/var/log/cron` file.

**Why does a `%` break my cron job?**
Cron turns the first unescaped `%` into the end of the command and sends the rest as stdin. Escape it as `\%` or move the command into a script.

**Why is my /etc/cron.d file ignored?**
It must be owned by root, not group- or world-writable, include a user field, and have a filename without dots. Only the dot case leaves no log line.
