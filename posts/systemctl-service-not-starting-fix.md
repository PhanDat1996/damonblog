---
title: "systemctl Service Not Starting? Diagnose by Exit Code"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "systemctl start failed and status says exit-code, 203/EXEC or 217/USER? Read the status line, find the real error in the journal and fix ExecStart or deps."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "devops"
---

You run `systemctl start myapp` and get:

```
Job for myapp.service failed because the control process exited with error code.
See "systemctl status myapp.service" and "journalctl -xeu myapp.service" for details.
```

That message is generic. The useful information is one command away, in two places: the **result and exit status** in `systemctl status`, and the **lines just before the failure** in the journal. Together they tell you which of a handful of causes you're dealing with.

This post is about a service that **won't start**. If it ran before and now `restart` misbehaves (start-limit-hit, hangs on stop, changes not taking effect), see [systemctl restart not working](/blog/systemctl-restart-service-not-working).

---

## TL;DR

```bash
systemctl status myapp --no-pager -l           # Result, exit status, last log lines
journalctl -u myapp -b -n 50 --no-pager        # the real error is right before "Failed"
systemctl cat myapp                            # the unit file + drop-ins actually in use
systemd-analyze verify myapp.service           # unit file syntax and missing binaries
runuser -u appuser -- /opt/app/bin/myapp --config /etc/myapp/prod.yml   # reproduce by hand
```

---

## Step 1: read `systemctl status` properly

```
× myapp.service - My Application
     Loaded: loaded (/etc/systemd/system/myapp.service; enabled; preset: disabled)
     Active: failed (Result: exit-code) since Tue 2026-10-28 14:22:04 UTC; 8s ago
    Process: 4521 ExecStart=/opt/app/bin/myapp --config /etc/myapp/prod.yml (code=exited, status=203/EXEC)
   Main PID: 4521 (code=exited, status=203/EXEC)
        CPU: 4ms

Oct 28 14:22:04 web01 (myapp)[4521]: myapp.service: Failed to execute /opt/app/bin/myapp: Permission denied
Oct 28 14:22:04 web01 (myapp)[4521]: myapp.service: Failed at step EXEC spawning /opt/app/bin/myapp: Permission denied
Oct 28 14:22:04 web01 systemd[1]: myapp.service: Main process exited, code=exited, status=203/EXEC
Oct 28 14:22:04 web01 systemd[1]: myapp.service: Failed with result 'exit-code'.
```

Three lines carry the diagnosis.

**`Loaded:`** Is the unit even usable?

| Loaded shows | Meaning | Fix |
|---|---|---|
| `loaded (...)` | Unit file parsed fine | Look further down |
| `not-found` | No unit by that name | Check the name: `systemctl list-unit-files | grep -i myapp` |
| `masked` | Deliberately disabled (linked to `/dev/null`) | `systemctl unmask myapp` if that's intended |
| `bad-setting` | The unit file has an invalid setting | Journal says which; often `ExecStart` without an absolute path on older systemd |

**`Active: failed (Result: ...)`** How it failed:

| Result | Meaning |
|---|---|
| `exit-code` | The process exited with a non-zero status |
| `signal` / `core-dump` | The process was killed by a signal (SIGKILL from the OOM killer, SIGSEGV crash) |
| `timeout` | It didn't finish starting within `TimeoutStartSec` (default 90s) |
| `resources` | systemd couldn't even set it up: missing `EnvironmentFile`, can't create a directory, etc. |
| `start-limit-hit` | Failed too many times in a row; systemd stopped trying ([restart post](/blog/systemctl-restart-service-not-working)) |
| `dependency` | A unit it `Requires=` failed first |

**`status=`** The exit status. Below 200 it comes from your program; 200 and above means systemd failed **before** your program ran.

---

## Step 2: get the full log

```bash
journalctl -u myapp -b -n 50 --no-pager
journalctl -xeu myapp            # -x adds explanations, -e jumps to the end
```

Read the lines **just above** `Main process exited`. That's where the program (or systemd) said what went wrong. If the app logs to its own file instead of stdout, check that file too. The journal may only show systemd's side.

For narrower time windows, see [journalctl time filters](/blog/journalctl-filter-time-range).

---

## Step 3: fix by exit status

### systemd's own codes (200+): failed before your program ran

| Status | Name | Typical cause |
|---|---|---|
| `200/CHDIR` | Can't change into `WorkingDirectory=` | Directory missing or not accessible to `User=` |
| `203/EXEC` | Can't execute `ExecStart=` | Wrong path, not executable, bad shebang, `noexec` mount, SELinux label |
| `209/STDOUT` | Can't set up stdout | `StandardOutput=file:` path not writable |
| `216/GROUP` | `Group=` doesn't exist | Typo, or the group wasn't created |
| `217/USER` | `User=` doesn't exist | Service user not created on this host |
| `226/NAMESPACE` | Sandboxing setup failed | A path in `ReadWritePaths=`, `ReadOnlyPaths=` etc. doesn't exist |

**203/EXEC** in detail, because it's the most common:

```bash
systemctl show -p ExecStart myapp            # the exact path systemd uses
ls -l /opt/app/bin/myapp                     # exists? executable bit?
head -1 /opt/app/bin/start.sh                # scripts need a valid shebang, e.g. #!/bin/bash
file /opt/app/bin/start.sh                   # "with CRLF line terminators" = Windows line endings
findmnt -T /opt/app/bin/myapp -o TARGET,OPTIONS   # look for noexec
```

- CRLF line endings make the shebang `#!/bin/bash\r`, which doesn't exist: fix with `sed -i 's/\r$//' start.sh`.
- No shebang at all gives `Exec format error`.
- On RHEL/Fedora with SELinux enforcing, `Permission denied` on a file that's clearly executable is usually its label. Files moved (`mv`) out of a home directory keep their `user_home_t` label, which services aren't allowed to execute. Check and reset it:

```bash
ls -Z /opt/app/bin/myapp
ausearch -m avc -ts recent | tail
restorecon -Rv /opt/app        # reset labels to the policy default for that path
```

**217/USER**: create the user the unit expects, as a system account without a login shell:

```bash
systemctl show -p User myapp
useradd --system --no-create-home --shell /usr/sbin/nologin appuser
```

### Application exit codes (1 to 199): your program ran and gave up

systemd only reports the number. What it means is up to the program. `status=1/FAILURE` and `status=2/INVALIDARGUMENT` are just systemd's names for 1 and 2 (taken from the LSB conventions), not a sign that systemd itself saw a bad argument. If `ExecStart` is a shell script, `126` usually means a command inside it wasn't executable and `127` means a command wasn't found (often a `PATH` difference, see below).

The fastest way forward is to run the exact command the same way systemd does:

```bash
systemctl show -p ExecStart -p User -p WorkingDirectory -p EnvironmentFiles myapp
cd /opt/app && runuser -u appuser -- /opt/app/bin/myapp --config /etc/myapp/prod.yml
```

Typical findings:

- **Config file missing or unreadable** by `appuser` (it was readable by root, which is how you tested).
- **Port already in use**: `bind: Address already in use`. Find the holder with `ss -ltnp 'sport = :8080'`. See [port already in use](/blog/port-already-in-use-linux-fix).
- **Permission denied** on a log or data directory. Give the service user ownership of the directories it **writes** to, not the whole application tree:

```bash
chown -R appuser:appuser /var/lib/myapp /var/log/myapp
```

Avoid `chmod -R 777` or `chown -R` across `/opt/app` as a quick fix. It hides the actual problem and lets the service rewrite its own code. Better still, let systemd create the directories with `StateDirectory=myapp` and `LogsDirectory=myapp`. [Permission denied fixes](/blog/permission-denied-linux-fix-chmod-chown) covers the details.

---

## `ExecStart` isn't a shell

This catches people who copy a working command line into a unit file:

```ini
# Does NOT work the way it looks
ExecStart=/opt/app/bin/myapp > /var/log/myapp.log 2>&1
ExecStart=/opt/app/bin/myapp --home ~/data
ExecStart=cd /opt/app && ./run.sh
```

systemd doesn't run `ExecStart` through a shell. There's no redirection, no `~`, no `&&`, no pipes. `>` and `/var/log/myapp.log` are passed to your program as literal arguments. It does expand `$VAR`/`${VAR}` from `Environment=` and `EnvironmentFile=`, but **not** from your login shell.

Do it the systemd way:

```ini
[Service]
WorkingDirectory=/opt/app
Environment=APP_HOME=/var/lib/myapp
EnvironmentFile=-/etc/myapp/env
ExecStart=/opt/app/bin/myapp --home ${APP_HOME}
StandardOutput=append:/var/log/myapp/myapp.log
```

(`StandardOutput=append:` needs systemd 240 or later.)

The `-` in `EnvironmentFile=-` makes the file optional. Without it, a missing file fails the start with `Result: resources`.

The environment is also much smaller than your shell's. `PATH` is a fixed default, and nothing from `~/.bashrc` or `/etc/profile` is loaded. A script that works in your terminal and fails under systemd with `command not found` (exit 127) is usually this. Use absolute paths, or set `Environment=PATH=...`.

If you really need shell features: `ExecStart=/bin/sh -c 'exec /opt/app/run.sh >> /var/log/app.log 2>&1'`. Keep the `exec` so the shell is replaced by your process and systemd tracks the right PID.

---

## Dependencies and ordering

```
Dependency failed for My Application.
myapp.service: Job myapp.service/start failed with result 'dependency'.
```

This means a unit listed in `Requires=` (or `BindsTo=`) failed. Fix that unit first:

```bash
systemctl list-dependencies myapp
systemctl --failed
```

Two directives that are often confused:

- `Requires=` / `Wants=` say **what** must be started along with this unit. `Requires=` fails your unit if the other fails; `Wants=` doesn't.
- `After=` says **in what order**. Without it, both units start in parallel.

You usually need both: `Requires=postgresql.service` **and** `After=postgresql.service`.

The classic case is the network. `After=network.target` doesn't mean the network is up, only that network management has started. An app that binds to a specific IP or connects out at startup can fail with `Cannot assign requested address` or a DNS error right after boot, then start fine by hand. Wait for the real thing:

```ini
[Unit]
Wants=network-online.target
After=network-online.target
```

Even "up" only means what your network manager's wait-online service says it means. For remote databases, the most robust option is an app that retries on its own.

### Started then timed out

`Result: timeout` with nothing obviously wrong usually means a `Type=` mismatch. `Type=notify` expects the program to call `sd_notify(READY=1)`, `Type=forking` expects it to fork and exit the parent. If the program doesn't do what the type promises, systemd waits until `TimeoutStartSec` and kills it. The [restart post](/blog/systemctl-restart-service-not-working) covers `Type=forking` and PID files.

---

## After you edit the unit

```bash
systemctl edit myapp                  # creates a drop-in override; or edit the file directly
systemctl daemon-reload               # make systemd re-read unit files
systemd-analyze verify myapp.service  # catch typos and bad paths
systemctl start myapp && systemctl status myapp --no-pager
```

`systemctl cat myapp` shows the unit file **and** every drop-in in `/etc/systemd/system/myapp.service.d/`. If a setting doesn't behave like the file you're editing says it should, a drop-in is often overriding it.

---

## Quick checklist

1. `Loaded:` line: not-found, masked or bad-setting?
2. `Result:` and `status=`: 200+ means systemd setup, below 200 means your program.
3. Journal lines just before `Main process exited`.
4. Reproduce with `runuser -u <User> --` in the `WorkingDirectory`.
5. No shell features in `ExecStart`; small environment.
6. `Requires=` plus `After=`; `network-online.target` if it needs the network at startup.
7. `daemon-reload` after every unit change.

---

*Related: [check running services with systemctl](/blog/linux-check-running-services-systemctl) for listing failed units, and [strace](/blog/strace-tutorial-linux) when the program exits without saying why.*
