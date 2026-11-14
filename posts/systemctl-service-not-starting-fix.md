---
title: "systemctl Troubleshooting: Failed Start, Restart, Check Services"
date: "2026-04-22"
updated: "2026-11-02"
excerpt: "Check running and failed services with systemctl, read exit codes like 203/EXEC, and fix restarts that hit start-limit-hit, hang or ignore changes."
tags: ["linux", "troubleshooting", "infrastructure", "debugging", "monitoring"]
featured: false
category: "devops"
---

You run `systemctl start myapp` and get:

```
Job for myapp.service failed because the control process exited with error code.
See "systemctl status myapp.service" and "journalctl -xeu myapp.service" for details.
```

That message is generic. The useful information is one command away, in two places: the **result and exit status** in `systemctl status`, and the **lines just before the failure** in the journal. Together they tell you which of a handful of causes you're dealing with.

This guide covers the three questions you'll have on a systemd host (RHEL/Rocky/Alma 7+, Debian 8+, Ubuntu 15.04+): what's running and what has failed, why a service **won't start**, and why `restart` misbehaves on a service that ran before (start-limit-hit, hangs on stop, changes not taking effect).

---

## TL;DR

```bash
systemctl list-units --type=service --state=running      # running right now
systemctl --failed                                       # failed units, any type
systemctl list-unit-files --type=service --state=enabled # starts at boot
systemctl is-active --quiet nginx && echo up             # scripts

systemctl status myapp --no-pager -l           # Result, exit status, last log lines
journalctl -u myapp -b -n 50 --no-pager        # the real error is right before "Failed"
systemctl cat myapp                            # the unit file + drop-ins actually in use
systemd-analyze verify myapp.service           # unit file syntax and missing binaries
runuser -u appuser -- /opt/app/bin/myapp --config /etc/myapp/prod.yml   # reproduce by hand
```

| Restart symptom | Likely cause | Fix |
|---|---|---|
| `Start request repeated too quickly`, `Result: start-limit-hit` | Start rate limit | Fix the crash, then `systemctl reset-failed myapp` |
| Restart takes ~90s | Process ignores SIGTERM; systemd waits `TimeoutStopSec` | Fix signal handling or tune `TimeoutStopSec`/`KillSignal` |
| Unit file change ignored | No `daemon-reload` | `systemctl daemon-reload && systemctl restart myapp` |
| Crash not restarted | `Restart=` missing, or the exit counts as "clean" | Set `Restart=on-failure` (or `always`) |
| `Address already in use` after restart | Old process survived the stop | Find it with `ss -ltnp`, check `KillMode=` |
| `Can't open PID file` / start times out | `Type=forking` with wrong `PIDFile=` | Run in foreground with `Type=simple`/`exec`/`notify` |

---

## Check running services with systemctl

```bash
systemctl list-units --type=service --state=running
```

```
  UNIT                     LOAD   ACTIVE SUB     DESCRIPTION
  cron.service             loaded active running Regular background program processing daemon
  docker.service           loaded active running Docker Application Container Engine
  nginx.service            loaded active running A high performance web server and a reverse proxy server
  postgresql@16-main.service loaded active running PostgreSQL Cluster 16-main
  ssh.service              loaded active running OpenBSD Secure Shell server

Legend: LOAD   → Reflects whether the unit definition was properly loaded.
        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.
        SUB    → The low-level unit activation state, values depend on unit type.

5 loaded units listed.
```

Add `--no-legend` (or `--plain --no-legend` for scripts) to drop the header and footer.

| Column | Values you'll see | Meaning |
|---|---|---|
| `LOAD` | `loaded`, `not-found`, `bad-setting`, `masked` | Did systemd parse the unit file? |
| `ACTIVE` | `active`, `inactive`, `failed`, `activating`, `deactivating` | High-level state |
| `SUB` | `running`, `exited`, `dead`, `failed`, `auto-restart`, `start-pre` ... | Detailed state, depends on unit type |

`active` doesn't always mean a process is running. A `Type=oneshot` service with `RemainAfterExit=yes` shows `active (exited)`: it ran its command, finished, and counts as "on". That's normal for things like firewall loaders and network setup. `--state=running` hides these; `--state=active` includes them.

`activating (auto-restart)` means the service is in a crash-restart loop. See "systemctl restart not working" below.

### Everything, not just active

Plain `systemctl list-units` shows only units that are active, failed, or have a job pending. Stopped services are hidden.

```bash
systemctl list-units --type=service --all             # also inactive (loaded) units
systemctl list-units --type=service --state=inactive  # only stopped ones
systemctl list-unit-files --type=service              # every installed unit file
```

`list-units` shows units systemd has **loaded in memory**. `list-unit-files` shows unit **files on disk** and whether they're enabled. A service that's installed but has never been started appears only in `list-unit-files`.

### Failed services

```bash
systemctl --failed
```

```
  UNIT          LOAD   ACTIVE SUB    DESCRIPTION
● myapp.service loaded failed failed My Application

1 loaded units listed.
```

Then find out why with `systemctl status` and the journal (next section). Once fixed, `systemctl reset-failed` clears old failures from this list.

### Enabled at boot vs running now

```bash
systemctl list-unit-files --type=service --state=enabled
systemctl is-enabled nginx
```

Two independent questions:

|  | Running now | Not running |
|---|---|---|
| **Enabled** | Normal | Failed to start, or stopped by hand. Will try again at boot. |
| **Disabled** | Started by hand or as a dependency. Won't come back after reboot. | Off |

`is-enabled` can also return:

| Value | Meaning |
|---|---|
| `static` | No `[Install]` section; can't be enabled, only started by other units or sockets/timers |
| `masked` | Linked to `/dev/null`; can't be started at all until `systemctl unmask` |
| `indirect` | Enabled through something else (e.g., a socket or timer activates it) |
| `alias` | The name is an alias of another unit |
| `generated` | Created at boot by a generator (e.g., from `/etc/fstab`) |

Socket activation is a common source of confusion. On Ubuntu 22.10 and later, for example, `ssh.service` can show `inactive` while `ssh.socket` listens on port 22 and starts the service on the first connection. Check `systemctl list-units --type=socket` too.

### One service in detail

```bash
systemctl status nginx --no-pager
```

```
● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/usr/lib/systemd/system/nginx.service; enabled; preset: enabled)
     Active: active (running) since Mon 2026-10-26 09:15:02 UTC; 2 days ago
       Docs: man:nginx(8)
    Process: 1180 ExecStartPre=/usr/sbin/nginx -t -q -g daemon on; master_process on; (code=exited, status=0/SUCCESS)
   Main PID: 1187 (nginx)
      Tasks: 5 (limit: 9387)
     Memory: 12.4M (peak: 14.1M)
        CPU: 2.140s
     CGroup: /system.slice/nginx.service
             ├─1187 "nginx: master process /usr/sbin/nginx -g daemon on; master_process on;"
             ├─1188 "nginx: worker process"
             └─1189 "nginx: worker process"
```

- `Loaded`: path of the unit file, enabled state, and the vendor preset.
- `Active`: state and how long it's been in it. A recent "since" on a long-lived service means it restarted.
- `Main PID` and `CGroup`: every process belonging to the service.
- `Memory`/`CPU`: from cgroup accounting, for the whole service. `systemd-cgtop` shows the same live for every service.

`systemctl show nginx -p ActiveState -p SubState -p MainPID -p NRestarts` prints the same data as key=value pairs, easier to parse.

### Scripting: `is-active`, `is-enabled`, `is-failed`

```bash
systemctl is-active nginx      # prints active/inactive/failed/activating..., exit 0 only if active
systemctl is-enabled nginx     # prints enabled/disabled/static/masked..., exit 0 if enabled
systemctl is-failed nginx      # prints the state, exit 0 only if failed

if ! systemctl is-active --quiet myapp; then
  echo "myapp is down" >&2
  exit 1
fi
```

`--quiet` suppresses output so only the exit code matters. You don't need `--no-pager` when piping: systemctl only starts a pager when its output is a terminal.

### Which service owns this PID or port?

You found a process in `top` or a port in `ss`. Which unit is it?

```bash
systemctl status 4521          # systemctl accepts a PID and shows its unit
ps -o unit= -p 4521            # just the unit name
```

All listening ports with the owning service:

```bash
for pid in $(ss -Hltnp | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -un); do
  printf '%-30s %s\n' "$(ps -o unit= -p "$pid")" \
    "$(ss -Hltnp | grep "pid=$pid," | awk '{print $4}' | sort -u | tr '\n' ' ')"
done
```

```
nginx.service                  0.0.0.0:443 0.0.0.0:80
postgresql@16-main.service     127.0.0.1:5432
ssh.service                    0.0.0.0:22
```

A port owned by `session-3.scope` or `user@1000.service` belongs to something a user started by hand, not a system service. That's worth a look. See [check open ports](/blog/check-open-ports-linux) for more on `ss`.

### Audit: reduce what's running

On a new or inherited server, list enabled services and question each one:

```bash
systemctl list-unit-files --type=service --state=enabled --no-legend
systemctl list-units --type=socket --state=listening --no-legend      # socket-activated services
systemctl list-timers --all                                            # scheduled jobs
```

Timers show up here too. If you're moving scheduled jobs off cron, [systemd timer vs cron](/blog/systemd-timer-vs-cron) covers the conversion and how the two behave differently.

Before disabling anything, check what depends on it. `rpcbind`, for example, looks unnecessary until NFS stops working:

```bash
systemctl list-dependencies --reverse rpcbind.service
systemctl disable --now cups.service avahi-daemon.service
```

`disable --now` stops the service and removes it from boot in one step. The [Linux hardening guide](/blog/linux-security-hardening-guide) covers which services are usually safe to remove.

On systems without systemd (Alpine with OpenRC, old SysV init), use `rc-status` or `service --status-all` instead.

---

## Service not starting: read `systemctl status` properly

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
| `start-limit-hit` | Failed too many times in a row; systemd stopped trying (see "start-limit-hit" below) |
| `dependency` | A unit it `Requires=` failed first |

**`status=`** The exit status. Below 200 it comes from your program; 200 and above means systemd failed **before** your program ran.

### Get the full log

```bash
journalctl -u myapp -b -n 50 --no-pager
journalctl -xeu myapp            # -x adds explanations, -e jumps to the end
```

Read the lines **just above** `Main process exited`. That's where the program (or systemd) said what went wrong. If the app logs to its own file instead of stdout, check that file too. The journal may only show systemd's side.

For narrower time windows, see [journalctl time filters](/blog/monitor-real-time-logs-linux).

### systemd's own exit codes (200+): failed before your program ran

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
- **Port already in use**: `bind: Address already in use`. Find the holder with `ss -ltnp 'sport = :8080'`. See [port already in use](/blog/check-open-ports-linux).
- **Permission denied** on a log or data directory. Give the service user ownership of the directories it **writes** to, not the whole application tree:

```bash
chown -R appuser:appuser /var/lib/myapp /var/log/myapp
```

Avoid `chmod -R 777` or `chown -R` across `/opt/app` as a quick fix. It hides the actual problem and lets the service rewrite its own code. Better still, let systemd create the directories with `StateDirectory=myapp` and `LogsDirectory=myapp`. [Permission denied fixes](/blog/permission-denied-linux-fix-chmod-chown) covers the details.

### `ExecStart` isn't a shell

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

### Dependencies and ordering

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

`Result: timeout` with nothing obviously wrong usually means a `Type=` mismatch. `Type=notify` expects the program to call `sd_notify(READY=1)`, `Type=forking` expects it to fork and exit the parent. If the program doesn't do what the type promises, systemd waits until `TimeoutStartSec` and kills it. See "`Type=forking` and PID files" below.

---

## systemctl restart not working

The service was running. You changed something, ran `systemctl restart myapp`, and now it hits `start-limit-hit`, hangs for a minute and a half, ignores your unit file change, or crashed and `Restart=on-failure` didn't bring it back. These are restart-specific problems; the symptom table in the TL;DR maps each one to a fix.

### What `restart` actually does

```
systemctl restart myapp
  │
  ├─ stop:   run ExecStop= (if any)
  │          send KillSignal= (SIGTERM) to every process in the unit's cgroup
  │          wait up to TimeoutStopSec= (default 90s)
  │          still alive? SIGKILL
  │
  └─ start:  ExecStartPre= → ExecStart= → wait until "started" per Type=
             counts toward the start rate limit
```

Two consequences: a slow stop makes restart slow, and every restart is a start that counts toward the limit.

`restart` also uses the unit definition systemd has **in memory**, which is why editing the file isn't enough (see `daemon-reload` below).

### start-limit-hit: "Start request repeated too quickly"

```
myapp.service: Start request repeated too quickly.
myapp.service: Failed with result 'start-limit-hit'.
Failed to start My Application.
```

systemd allows a unit `StartLimitBurst=` starts within `StartLimitIntervalSec=`. The defaults are **5 starts in 10 seconds** (`DefaultStartLimitBurst`/`DefaultStartLimitIntervalSec` in `/etc/systemd/system.conf`). Every start counts: automatic restarts from `Restart=` **and** your manual `systemctl restart`.

How you hit it:

- The app crashes on startup and `Restart=` brings it back. With the default `RestartSec=100ms`, five attempts take well under a second.
- You (or a deploy script, or config management) run `restart` several times in quick succession.

Clearing it:

```bash
journalctl -u myapp -b -n 100 --no-pager      # read the crash BEFORE the rate-limit lines
systemctl reset-failed myapp                  # clear the failed state and the counter
systemctl start myapp
```

`reset-failed` only lets you try again. If the underlying crash isn't fixed, you'll hit the limit again within seconds. The real error is in the log lines above `Start request repeated too quickly`.

How many times has it restarted on its own?

```bash
systemctl show myapp -p NRestarts -p Result -p ActiveState     # NRestarts: systemd 235+
```

**Tuning the limit: put it in `[Unit]`.**

```ini
# systemctl edit myapp
[Unit]
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Restart=on-failure
RestartSec=10s
```

`StartLimitIntervalSec=` and `StartLimitBurst=` belong in **`[Unit]`**. Put `StartLimitIntervalSec=` in `[Service]` and systemd logs `Unknown key name 'StartLimitIntervalSec' in section 'Service', ignoring` and silently uses the defaults. (The old names `StartLimitInterval=`/`StartLimitBurst=` are still accepted in `[Service]` for compatibility, which is why old examples look like they work.)

The numbers have to fit together. With `RestartSec=10s`, at most one start fits in the default 10-second window, so the limit **never** triggers and a broken service restarts forever. That might be what you want (a worker that should always come back), but then decide it on purpose. `StartLimitIntervalSec=0` disables the limit explicitly.

systemd 254 and later can also back off: `RestartSteps=` and `RestartMaxDelaySec=` grow the delay between attempts up to a maximum.

### Restart hangs for 90 seconds

```
myapp.service: State 'stop-sigterm' timed out. Killing.
myapp.service: Killing process 4521 (myapp) with signal SIGKILL.
myapp.service: Main process exited, code=killed, status=9/KILL
```

systemd sent SIGTERM, waited `TimeoutStopSec` (default 90s), then killed it. Causes:

- **The app ignores or doesn't handle SIGTERM.** Some runtimes need a handler; some apps expect a different signal.
- **The app shuts down gracefully, but slowly** (draining connections, flushing queues).
- **`ExecStop=` itself hangs**, e.g. a stop script calling an API that doesn't answer.

```bash
systemctl show myapp -p TimeoutStopUSec -p KillSignal -p KillMode -p ExecStop
```

Fixes, in order of preference:

```ini
[Service]
# The app shuts down cleanly on SIGINT/SIGQUIT but not SIGTERM:
KillSignal=SIGINT

# Graceful shutdown legitimately takes a while:
TimeoutStopSec=30s
```

Lowering `TimeoutStopSec` just makes the SIGKILL come sooner. For a database or anything with on-disk state, SIGKILL can mean recovery on the next start. Fix the shutdown path if you can.

### Unit file change ignored: `daemon-reload`

systemd keeps parsed unit files in memory. After editing a unit (or a drop-in), it warns you, and then restarts with the **old** definition anyway:

```
Warning: The unit file, source configuration file or drop-ins of myapp.service changed on disk. Run 'systemctl daemon-reload' to reload units.
```

```bash
systemctl show myapp -p NeedDaemonReload       # yes = the file on disk differs from memory
systemctl edit myapp                           # creates a drop-in override; or edit the file directly
systemctl daemon-reload                        # make systemd re-read unit files
systemd-analyze verify myapp.service           # catch typos and bad paths
systemctl restart myapp && systemctl status myapp --no-pager
```

Know which config you changed:

| You changed | You need |
|---|---|
| Unit file or drop-in (`ExecStart`, `Environment`, `LimitNOFILE`, ...) | `daemon-reload` **then** `restart` |
| The app's own config (`nginx.conf`, `app.yml`) | `reload` if the unit supports it, otherwise `restart` |

`daemon-reload` doesn't restart anything. Settings that apply at process start (limits, environment, user) only change after the next restart. `systemctl edit myapp` runs the reload for you when you save; editing files directly doesn't.

`systemctl cat myapp` shows the unit file **and** every drop-in in `/etc/systemd/system/myapp.service.d/`. If a setting doesn't behave like the file you're editing says it should, a drop-in is often overriding it.

### `reload` vs `restart`

```bash
systemctl reload myapp
# Failed to reload myapp.service: Job type reload is not applicable for unit myapp.service.
```

`reload` only works if the unit defines `ExecReload=`. For NGINX, `reload` sends SIGHUP: the master re-reads the config and replaces workers with no dropped connections, and if the new config is invalid, the old one keeps running. `restart` with a broken config takes the site down. Test first:

```bash
nginx -t && systemctl reload nginx
```

`systemctl reload-or-restart myapp` reloads when supported, restarts otherwise.

### The service crashed and wasn't restarted

The default is `Restart=no`. Even with `Restart=` set, what counts as "failure" is precise:

| Exit reason | `no` | `always` | `on-success` | `on-failure` | `on-abnormal` | `on-abort` |
|---|---|---|---|---|---|---|
| Clean exit code (0, or listed in `SuccessExitStatus=`) | | yes | yes | | | |
| Unclean exit code (non-zero) | | yes | | yes | | |
| Unclean signal (SIGKILL, SIGSEGV, SIGABRT...) | | yes | | yes | yes | yes |
| Timeout | | yes | | yes | yes | |
| Watchdog | | yes | | yes | yes | |

Three things that surprise people:

- **SIGTERM, SIGINT, SIGHUP and SIGPIPE count as clean.** If someone runs `kill 4521`, the process dies from SIGTERM, and `Restart=on-failure` does **not** restart it. `kill -9` (unclean) would.
- **`systemctl stop` never triggers `Restart=`.** That's by design. A unit that is stopped stays stopped.
- **The start limit still applies.** A crash loop with `Restart=always` ends in `start-limit-hit` unless the timing keeps it under the limit.

For services that must stay up:

```ini
[Service]
Restart=on-failure
RestartSec=5s
```

Use `Restart=always` if a clean exit is also unexpected (a worker that should never exit). `RestartPreventExitStatus=` excludes specific exit codes, such as a "config invalid" code that will never fix itself.

### "Address already in use" right after restart

The new process can't bind because something still holds the port:

```bash
ss -ltnp 'sport = :8080'
# LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:* users:(("myapp",pid=3977,fd=7))
systemctl status myapp | grep "Main PID"        # is 3977 the unit's own process?
```

- **The process was started by hand** (outside systemd), so `stop` never touched it.
- **`KillMode=process`** (or `none`) is set, so only the main process is signaled on stop and its children keep running with the socket. The default `KillMode=control-group` kills everything in the cgroup; check why the unit overrides it.

Stop the stray process properly (a plain `kill <pid>` first; `kill -9` only if it doesn't exit), then start the unit. [Port already in use](/blog/check-open-ports-linux) has more on finding the holder.

### `Type=forking` and PID files

Old-style daemons fork into the background and write a PID file. The unit has to match:

```ini
[Service]
Type=forking
PIDFile=/run/myapp/myapp.pid
ExecStart=/opt/app/bin/myapp --daemon
```

Typical failures:

```
myapp.service: Can't open PID file /run/myapp.pid (yet?) after start: No such file or directory
myapp.service: start operation timed out. Terminating.
```

- `PIDFile=` doesn't match where the app actually writes it.
- The app can't create the file because its directory doesn't exist or isn't writable by `User=`. `/run` is a tmpfs, emptied at boot. Add `RuntimeDirectory=myapp` so systemd creates `/run/myapp` with the right owner on every start.
- The app doesn't actually fork (`--daemon` missing), so systemd waits for a parent that never exits, until `TimeoutStartSec`.
- A stale PID file from a previous crash points at an unrelated process.

The better fix is to stop daemonizing. Most daemons have a foreground mode (`nginx -g 'daemon off;'`, `--foreground`, `-D`). Run them with `Type=simple`, `Type=exec` (systemd 240+, which also reports `ExecStart` failures properly), or `Type=notify` if the app supports `sd_notify`. No PID file needed, and systemd always knows the right main PID.

---

## Common mistakes

- **Treating `list-units` as "everything".** It hides stopped units. Use `--all` or `list-unit-files`.
- **Assuming `active` = a process is running.** Oneshot services stay `active (exited)`.
- **Missing socket-activated services.** The `.service` is inactive, the `.socket` is listening.
- **Checking only `is-active` after a deploy.** A crash-looping service is `activating` most of the time. Check `NRestarts` too.
- **Forgetting user services.** Services started with `systemctl --user` don't appear in the system list. Use `systemctl --user list-units` as that user.
- **Running `reset-failed` without fixing the crash.** You'll hit `start-limit-hit` again within seconds.
- **Putting `StartLimitIntervalSec=` in `[Service]`.** It's ignored; it belongs in `[Unit]`.

---

## Quick checklist

1. `systemctl --failed` and `systemctl status <unit>`: `Loaded:` not-found, masked or bad-setting?
2. `Result:` and `status=`: 200+ means systemd setup, below 200 means your program.
3. Journal lines just before `Main process exited`, and before any `start-limit-hit` line.
4. Reproduce with `runuser -u <User> --` in the `WorkingDirectory`.
5. No shell features in `ExecStart`; small environment.
6. `Requires=` plus `After=`; `network-online.target` if it needs the network at startup.
7. Edited the unit? `daemon-reload` first. Check `NeedDaemonReload`.
8. Rate-limited? Fix the cause, `reset-failed`, start. Limits go in `[Unit]`.
9. Slow restart? Look for `stop-sigterm timed out`; fix signal handling.
10. Not restarting after a crash? Check `Restart=` and whether the exit was "clean".
11. Port busy after restart? Find the stray process, check `KillMode=`.
12. `Type=forking`? Match `PIDFile=`, add `RuntimeDirectory=`, or switch to foreground mode.

---

*Related: [journalctl time filters](/blog/monitor-real-time-logs-linux) for pulling the exact window around a failed start or restart, and [strace](/blog/strace-tutorial-linux) when the program exits without saying why.*
