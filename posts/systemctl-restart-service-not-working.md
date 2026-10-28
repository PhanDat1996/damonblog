---
title: "systemctl restart Not Working? start-limit and Stop Hangs"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "systemctl restart fails with start-limit-hit, hangs for 90 seconds, or ignores your changes? What restart really does and how to fix each failure."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "devops"
---

The service was running. You changed something, ran `systemctl restart myapp`, and now one of these is happening:

- `Job for myapp.service failed` and the status says `start-limit-hit`
- the command hangs for a minute and a half before returning
- it "restarted" but your unit file change didn't take effect
- the service crashed and `Restart=on-failure` didn't bring it back

These are restart-specific problems. A service that fails on every start, even the first, is a different diagnosis (exit codes, `ExecStart`, dependencies). For that, see [systemctl service not starting](/blog/systemctl-service-not-starting-fix).

---

## TL;DR

| Symptom | Likely cause | Fix |
|---|---|---|
| `Start request repeated too quickly`, `Result: start-limit-hit` | Start rate limit | Fix the crash, then `systemctl reset-failed myapp` |
| Restart takes ~90s | Process ignores SIGTERM; systemd waits `TimeoutStopSec` | Fix signal handling or tune `TimeoutStopSec`/`KillSignal` |
| Unit file change ignored | No `daemon-reload` | `systemctl daemon-reload && systemctl restart myapp` |
| Crash not restarted | `Restart=` missing, or the exit counts as "clean" | Set `Restart=on-failure` (or `always`) |
| `Address already in use` after restart | Old process survived the stop | Find it with `ss -ltnp`, check `KillMode=` |
| `Can't open PID file` / start times out | `Type=forking` with wrong `PIDFile=` | Run in foreground with `Type=simple`/`exec`/`notify` |

---

## What `restart` actually does

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

`restart` also uses the unit definition systemd has **in memory**, which is why editing the file isn't enough (see below).

---

## start-limit-hit: "Start request repeated too quickly"

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

### Tuning the limit: put it in `[Unit]`

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

---

## Restart hangs for 90 seconds

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

---

## Unit file change ignored: `daemon-reload`

systemd keeps parsed unit files in memory. After editing a unit (or a drop-in), it warns you, and then restarts with the **old** definition anyway:

```
Warning: The unit file, source configuration file or drop-ins of myapp.service changed on disk. Run 'systemctl daemon-reload' to reload units.
```

```bash
systemctl show myapp -p NeedDaemonReload       # yes = the file on disk differs from memory
systemctl daemon-reload
systemctl restart myapp
```

Know which config you changed:

| You changed | You need |
|---|---|
| Unit file or drop-in (`ExecStart`, `Environment`, `LimitNOFILE`, ...) | `daemon-reload` **then** `restart` |
| The app's own config (`nginx.conf`, `app.yml`) | `reload` if the unit supports it, otherwise `restart` |

`daemon-reload` doesn't restart anything. Settings that apply at process start (limits, environment, user) only change after the next restart. `systemctl edit myapp` runs the reload for you when you save; editing files directly doesn't.

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

---

## The service crashed and wasn't restarted

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

---

## "Address already in use" right after restart

The new process can't bind because something still holds the port:

```bash
ss -ltnp 'sport = :8080'
# LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:* users:(("myapp",pid=3977,fd=7))
systemctl status myapp | grep "Main PID"        # is 3977 the unit's own process?
```

- **The process was started by hand** (outside systemd), so `stop` never touched it.
- **`KillMode=process`** (or `none`) is set, so only the main process is signaled on stop and its children keep running with the socket. The default `KillMode=control-group` kills everything in the cgroup; check why the unit overrides it.

Stop the stray process properly (a plain `kill <pid>` first; `kill -9` only if it doesn't exit), then start the unit. [Port already in use](/blog/port-already-in-use-linux-fix) has more on finding the holder.

---

## `Type=forking` and PID files

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

## Quick checklist

1. `journalctl -u myapp -b -n 100`: read the error **before** any `start-limit-hit` line.
2. Rate-limited? Fix the cause, `reset-failed`, start. Limits go in `[Unit]`.
3. Slow restart? Look for `stop-sigterm timed out`; fix signal handling.
4. Edited the unit? `daemon-reload` first. Check `NeedDaemonReload`.
5. Not restarting after a crash? Check `Restart=` and whether the exit was "clean".
6. Port busy after restart? Find the stray process, check `KillMode=`.
7. `Type=forking`? Match `PIDFile=`, add `RuntimeDirectory=`, or switch to foreground mode.

---

*Related: [check running services](/blog/linux-check-running-services-systemctl) to list failed units across the host, and [journalctl time filters](/blog/journalctl-filter-time-range) for pulling the exact window around a failed restart.*
