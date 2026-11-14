---
title: "systemd Timer vs Cron: Convert a Job and What Changes"
date: "2026-11-14"
updated: "2026-11-14"
excerpt: "Convert a cron job to a systemd timer, check OnCalendar with systemd-analyze, and see what changed in the lab: overlap, missed runs, PATH and lost errors."
tags: ["linux", "troubleshooting", "infrastructure", "monitoring"]
featured: false
lab: true
category: "linux"
---

A cron job that takes longer than its interval quietly piles up copies of itself. When it fails, its stderr goes to a mail system most servers don't have, and the only trace is a `No MTA installed, discarding output` line. systemd timers fix both of those, but they come with their own syntax and two settings (`Persistent=`, `AccuracySec=`) that decide whether a job runs when you think it does.

This post converts one cron job to a timer and runs both side by side on a lab VM, so each difference below is something that was observed, not taken from a feature list.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, systemd 259 (`259.5-0ubuntu3.4`), cron `3.0pl1-200ubuntu1`, 4 vCPU / 7.2 GiB Xen VM, timezone UTC. Units and the cron entry were installed as root (`sudo`); `systemd-analyze calendar` was run as a normal user. Everything was removed afterwards.

---

## TL;DR: cron line to timer

Cron entry in `/etc/cron.d/backup`:

```
30 2 * * * root /usr/local/bin/backup.sh
```

Same job as a timer, two files:

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Nightly backup

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
```

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Run backup.service daily at 02:30

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemd-analyze calendar "*-*-* 02:30:00"     # check the expression first
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer      # enable the .timer, not the .service
systemctl list-timers backup.timer            # NEXT / LAST
journalctl -u backup.service                  # output and exit status of every run
```

Then delete the cron line, or both will run.

---

## What actually differs (lab results)

| | cron | systemd timer |
|---|---|---|
| Job still running when the next run is due | Starts another copy: 3 copies of a 150 s job ran in parallel | Never in parallel: the next run starts the moment the previous one finishes |
| Machine off / timer stopped at the scheduled time | No catch-up run: cron keeps no record of missed runs | `Persistent=true`: runs once on start. `Persistent=false`: skipped |
| Where stderr goes | Mail; with no MTA it is discarded | The journal, with the exit status |
| `PATH` in the job | `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin` | `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin` |
| Validate the schedule | No built-in tool | `systemd-analyze calendar` |
| Resource limits, sandboxing | No | Any `[Service]` setting (`MemoryMax=`, `User=`, `ProtectSystem=`...) |

The sections below show the output behind each row.

---

## OnCalendar syntax, checked with systemd-analyze

`OnCalendar=` is not cron syntax. The format is `DayOfWeek Year-Month-Day Hour:Minute:Second`, and any part can be left out. `systemd-analyze calendar` normalizes an expression and prints the next run times, so there's no reason to guess:

```
$ systemd-analyze calendar --iterations=2 "Mon..Fri 09:00"
  Original form: Mon..Fri 09:00
Normalized form: Mon..Fri *-*-* 09:00:00
    Next elapse: Mon 2026-11-16 09:00:00 UTC
       From now: 2 days left
   Iteration #2: Tue 2026-11-17 09:00:00 UTC
       From now: 3 days left
```

Cron syntax is rejected outright, which is the first mistake people make when converting:

```
$ systemd-analyze calendar "0 2 * * *"
Failed to parse calendar specification '0 2 * * *': Invalid argument
$ systemd-analyze calendar "*/15"
Failed to parse calendar specification '*/15': Invalid argument
```

Common cron schedules and the expressions that tested correctly on this VM:

| cron | OnCalendar | Normalized form (from systemd-analyze) |
|---|---|---|
| `30 2 * * *` | `*-*-* 02:30:00` | `*-*-* 02:30:00` |
| `*/15 * * * *` | `*:0/15` | `*-*-* *:00/15:00` |
| `0 * * * *` | `hourly` | `*-*-* *:00:00` |
| `0 0 * * *` | `daily` | `*-*-* 00:00:00` |
| `0 0 * * 1` | `weekly` | `Mon *-*-* 00:00:00` |
| `0 9 * * 1-5` | `Mon..Fri 09:00` (`Mon-Fri 09:00` also parsed) | `Mon..Fri *-*-* 09:00:00` |
| `0 4 1 * *` | `*-*-01 04:00` | `*-*-01 04:00:00` |
| no cron equivalent | `*-*~01 23:00` (last day of month) | next: `Mon 2026-11-30 23:00:00 UTC` |
| no cron equivalent | `Fri *-*-1..7 18:00` (first Friday) | next: `Fri 2026-12-04 18:00:00 UTC` |

Two details from the output:

- `weekly` means **Monday** 00:00, not Sunday.
- A timezone can be appended. On this UTC machine, `Sat,Sun 03:00 Europe/Berlin` showed `Next elapse: Sun 2026-11-15 02:00:00 UTC`, so the job follows Berlin time regardless of the server's zone.

An impossible time fails the same way as cron syntax: `*-*-* 25:00` gave `Failed to parse calendar specification '*-*-* 25:00': Invalid argument`.

---

## Lab 1: a job that runs longer than its interval

Both schedulers got the same job, every minute: a script that logs a start line, sleeps 150 seconds, then logs an end line.

```
# /etc/cron.d/labtimer-demo
* * * * * root /usr/local/bin/labtimer-job.sh 150 cron
```

```ini
# labtimer-demo.timer
[Timer]
OnCalendar=*:*:00
AccuracySec=1s
```

The job's own log after a few minutes (the `user=` and `PATH=` fields are cut from the start lines here; they're shown in full further down):

```
04:21:01 [cron] start pid=255268
04:21:30 [timer] start pid=255601
04:22:01 [cron] start pid=255994
04:23:01 [cron] start pid=256528
04:23:31 [cron] end   pid=255268
04:24:00 [timer] end   pid=255601
04:24:00 [timer] start pid=256964
04:24:01 [cron] start pid=256986
04:24:31 [cron] end   pid=255994
```

And a process snapshot at 04:27:23:

```
 257361 Sat Nov 14 04:25:01 2026 /bin/bash /usr/local/bin/labtimer-job.sh 150 cron
 257433 Sat Nov 14 04:26:01 2026 /bin/bash /usr/local/bin/labtimer-job.sh 150 cron
 257518 Sat Nov 14 04:26:29 2026 /bin/bash /usr/local/bin/labtimer-job.sh 150 timer
 257784 Sat Nov 14 04:27:01 2026 /bin/bash /usr/local/bin/labtimer-job.sh 150 cron
```

Cron started a new copy every minute no matter what, so three ran at once. With a backup or a sync job, that means three processes writing to the same target.

The timer never ran two copies. While the oneshot service is still `activating`, a timer elapse doesn't start a second instance. `systemctl list-timers` showed `NEXT` as `-` during that time. Once the run finished, the next one started immediately:

```
Nov 14 04:24:00.270689 damon systemd[1]: labtimer-demo.service: Deactivated successfully.
Nov 14 04:24:00.272036 damon systemd[1]: Finished labtimer-demo.service - Lab timer demo job.
Nov 14 04:24:00.279834 damon systemd[1]: Starting labtimer-demo.service - Lab timer demo job...
Nov 14 04:26:30.335562 damon systemd[1]: labtimer-demo.service: Deactivated successfully.
Nov 14 04:26:30.337413 damon systemd[1]: Finished labtimer-demo.service - Lab timer demo job.
Nov 14 04:26:30.344726 damon systemd[1]: Starting labtimer-demo.service - Lab timer demo job...
```

So a slow job under a timer runs back to back rather than in parallel. That's safer, but it isn't "skip if busy": if the job is permanently slower than the interval, it runs continuously. With cron, the usual fix is `flock -n /run/job.lock` in the command; with a timer you get the no-overlap part for free.

---

## Lab 2: lost errors

The first version of the lab script wrote to a log file in `/var/tmp` that had been created by the normal user. Root couldn't append to it (Ubuntu sets `fs.protected_regular = 2`, which blocks root from opening another user's file in a sticky world-writable directory). Both the cron copy and the timer copy failed. They reported it very differently.

The timer's service, in the journal:

```
Nov 14 04:19:00 damon labtimer-job.sh[253379]: /usr/local/bin/labtimer-job.sh: line 3: /var/tmp/labtimer.log: Permission denied
Nov 14 04:21:30 damon systemd[1]: labtimer-demo.service: Main process exited, code=exited, status=1/FAILURE
Nov 14 04:21:30 damon systemd[1]: labtimer-demo.service: Failed with result 'exit-code'.
Nov 14 04:21:30 damon systemd[1]: Failed to start labtimer-demo.service - Lab timer demo job.
```

Cron, for the same failure:

```
Nov 14 04:19:01 damon CRON[253406]: (root) CMD (/usr/local/bin/labtimer-job.sh 150 cron)
Nov 14 04:21:31 damon CRON[253404]: (CRON) info (No MTA installed, discarding output)
```

The error text is gone. The cron log only says that the command ran and that some output was thrown away. A failed timer job also shows up in `systemctl --failed` and can trigger an alert through `OnFailure=` in the `[Unit]` section. If cron jobs fail silently today, [systemctl service not starting](/blog/systemctl-service-not-starting-fix) covers how to read a failed unit, and [Linux log analysis](/blog/linux-log-analysis-guide) covers searching the journal.

---

## Lab 3: Persistent= and missed runs

cron has no memory: if the machine is off at 02:30, the 02:30 run doesn't happen. A timer with `Persistent=true` stores the last trigger time on disk and catches up once at start.

The test timer fired every minute at `:30`. It ran once, was stopped across a `:30` boundary, then started again.

**`Persistent=true`**: fired at 04:22:30 and wrote its stamp file, stopped at 04:22:50, started again at 04:24:00:

```
-rw-r--r-- 1 root root 0 04:22:30 /var/lib/systemd/timers/stamp-labtimer-persist.timer
...
NEXT                        LEFT LAST                        PASSED UNIT                   ACTIVATES
Sat 2026-11-14 04:24:30 UTC  24s Sat 2026-11-14 04:24:00 UTC 5s ago labtimer-persist.timer labtimer-persist.service
```

`LAST` is 04:24:00, the moment of the restart: the missed 04:23:30 run was made up immediately. The job log confirms it with a run at `04:24:00` and the regular one at `04:24:30`.

**`Persistent=false`**: stopped at 04:25:11, started again at 04:26:21:

```
NEXT                        LEFT LAST PASSED UNIT                   ACTIVATES
Sat 2026-11-14 04:26:30 UTC   3s -         - labtimer-persist.timer labtimer-persist.service
```

No catch-up run. The missed 04:25:30 run was simply skipped, same as cron.

The catch-up is a single run, not one per missed slot. For a daily backup on a laptop or a VM that is sometimes shut down, `Persistent=true` is what you want. For a job that only makes sense at a specific moment, leave it off.

The stamp files live in `/var/lib/systemd/timers/` (system timers). Deleting a stamp file resets what systemd thinks the last run was.

---

## AccuracySec: why a timer fires late

By default `AccuracySec=` is one minute: systemd may delay the trigger by up to a minute so it can wake the CPU once for several timers. For a daily job that doesn't matter. For a timer that should fire at exactly `:00` (as in the lab above), set `AccuracySec=1s`. The lab timers used `AccuracySec=1s`, and their journal timestamps landed within a few hundred milliseconds of the scheduled second:

```
Nov 14 04:22:30.237733 damon systemd[1]: Starting labtimer-persist.service - Lab persistent timer job...
Nov 14 04:24:30.486014 damon systemd[1]: Starting labtimer-persist.service - Lab persistent timer job...
```

`RandomizedDelaySec=` does the opposite on purpose: it spreads runs so a fleet of servers doesn't hit the same backend at 02:30:00. Ubuntu's own `apt-daily.timer` is an example: on this VM its next run was at `16:26:12`, not on the hour.

---

## Environment and PATH

Both jobs logged their `PATH`:

```
04:21:01 [cron] start pid=255268 user=root PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin
04:21:30 [timer] start pid=255601 user=root PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin
```

On Ubuntu 26.04 `/bin` and `/sbin` are symlinks into `/usr`, so in practice both find the same binaries. Cron's full `PATH` here comes from `/etc/environment` through PAM, which is a Debian/Ubuntu detail. The general rule holds for both: don't rely on the login shell's environment. Use absolute paths, or set `Environment=` / `EnvironmentFile=` in the service.

---

## One-off and quick timers with systemd-run

For a quick scheduled command without writing unit files, `systemd-run` creates a transient timer:

```
$ sudo systemd-run --on-calendar="*:*:50" --unit=labtimer-oneoff /usr/local/bin/labtimer-job.sh 0 transient
Running timer as unit: labtimer-oneoff.timer
Will run service as unit: labtimer-oneoff.service
```

It showed up in `list-timers` with `NEXT` at `04:27:50` and ran on time. Transient units disappear on reboot or when stopped, so this is for one-off jobs (`--on-active=10m` runs once, ten minutes from now), not a cron replacement.

---

## Should you migrate?

Keep cron when the job is a simple command on a box where cron is already the convention and output is collected some other way. Move to a timer when any of these apply:

- the job can run longer than its interval
- the machine is not always on at the scheduled time
- you need the error output and exit status after the fact
- the job needs limits (`MemoryMax=`, `CPUQuota=`) or should run as a dedicated user with a sandbox

For a job that is already misbehaving under cron, the [permission denied guide](/blog/permission-denied-linux-fix-chmod-chown) covers the ownership side of the `/var/tmp` failure above, and [monitoring logs in real time](/blog/monitor-real-time-logs-linux) shows how to follow `journalctl -u` while a timer fires.

---

## FAQ

**How do I list all systemd timers?**
`systemctl list-timers --all`. It shows `NEXT`, `LEFT`, `LAST` and `PASSED` for each timer and which service it activates. Without `--all`, inactive timers are hidden.

**Why doesn't my systemd timer run after I created it?**
The `.timer` unit has to be enabled and started (`systemctl enable --now name.timer`), not the `.service`. Run `systemctl daemon-reload` after editing either file, and check the expression with `systemd-analyze calendar`.

**Does a systemd timer run missed jobs after a reboot?**
Only with `Persistent=true`. In the lab, a persistent timer ran once as soon as it was started again; with `Persistent=false` the missed run was skipped.

**Can a systemd timer run two copies of the same job?**
Not for the same service. In the lab, a 150-second job on a one-minute timer ran back to back, never in parallel, while cron ran three copies at once.

**What is the systemd timer equivalent of */15 in cron?**
`OnCalendar=*:0/15`, which normalizes to `*-*-* *:00/15:00` (every 15 minutes, on the quarter hour). `OnUnitActiveSec=15min` is the alternative if you want 15 minutes after the last run instead.
