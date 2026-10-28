---
title: "Check Running Services on Linux: systemctl Cheat Sheet"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "List running, failed and enabled services on Linux with systemctl, read what active, running and exited mean, and map a PID or port back to its service."
tags: ["linux", "infrastructure", "troubleshooting", "monitoring"]
featured: false
category: "devops"
---

You've logged into a server you don't know, or something is misbehaving, and you want to see what's running on it, what has failed, and what will start at the next boot. On any systemd distribution (RHEL/Rocky/Alma 7+, Debian 8+, Ubuntu 15.04+), that's `systemctl`.

```bash
systemctl list-units --type=service --state=running      # running right now
systemctl --failed                                       # failed units, any type
systemctl list-unit-files --type=service --state=enabled # starts at boot
systemctl status nginx                                   # one service in detail
systemctl is-active --quiet nginx && echo up             # scripts
```

---

## List running services

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

### What the columns mean

| Column | Values you'll see | Meaning |
|---|---|---|
| `LOAD` | `loaded`, `not-found`, `bad-setting`, `masked` | Did systemd parse the unit file? |
| `ACTIVE` | `active`, `inactive`, `failed`, `activating`, `deactivating` | High-level state |
| `SUB` | `running`, `exited`, `dead`, `failed`, `auto-restart`, `start-pre` ... | Detailed state, depends on unit type |

`active` doesn't always mean a process is running. A `Type=oneshot` service with `RemainAfterExit=yes` shows `active (exited)`: it ran its command, finished, and counts as "on". That's normal for things like firewall loaders and network setup. `--state=running` hides these; `--state=active` includes them.

`activating (auto-restart)` means the service is in a crash-restart loop. See [systemctl restart not working](/blog/systemctl-restart-service-not-working).

---

## Everything, not just active

Plain `systemctl list-units` shows only units that are active, failed, or have a job pending. Stopped services are hidden.

```bash
systemctl list-units --type=service --all             # also inactive (loaded) units
systemctl list-units --type=service --state=inactive  # only stopped ones
systemctl list-unit-files --type=service              # every installed unit file
```

`list-units` shows units systemd has **loaded in memory**. `list-unit-files` shows unit **files on disk** and whether they're enabled. A service that's installed but has never been started appears only in `list-unit-files`.

---

## Failed services

```bash
systemctl --failed
```

```
  UNIT          LOAD   ACTIVE SUB    DESCRIPTION
● myapp.service loaded failed failed My Application

1 loaded units listed.
```

Then find out why:

```bash
systemctl status myapp --no-pager -l
journalctl -u myapp -b -n 50 --no-pager
```

The [service not starting guide](/blog/systemctl-service-not-starting-fix) walks through reading the exit status. Once fixed, `systemctl reset-failed` clears old failures from this list.

---

## Enabled at boot vs running now

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

---

## One service in detail

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
- `Memory`/`CPU`: from cgroup accounting, for the whole service.

`systemctl show nginx -p ActiveState -p SubState -p MainPID -p NRestarts` prints the same data as key=value pairs, easier to parse.

---

## Scripting: `is-active`, `is-enabled`, `is-failed`

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

---

## Which service owns this PID or port?

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

---

## Resource use per service

```bash
systemd-cgtop                                # live CPU/memory/IO per cgroup (service)
systemctl status myapp | grep -E "Memory|CPU|Tasks"
```

---

## Audit: reduce what's running

On a new or inherited server, list enabled services and question each one:

```bash
systemctl list-unit-files --type=service --state=enabled --no-legend
systemctl list-units --type=socket --state=listening --no-legend      # socket-activated services
systemctl list-timers --all                                            # scheduled jobs
```

Before disabling anything, check what depends on it. `rpcbind`, for example, looks unnecessary until NFS stops working:

```bash
systemctl list-dependencies --reverse rpcbind.service
systemctl disable --now cups.service avahi-daemon.service
```

`disable --now` stops the service and removes it from boot in one step. The [Linux hardening guide](/blog/linux-security-hardening-guide) covers which services are usually safe to remove.

---

## Common mistakes

- **Treating `list-units` as "everything".** It hides stopped units. Use `--all` or `list-unit-files`.
- **Assuming `active` = a process is running.** Oneshot services stay `active (exited)`.
- **Missing socket-activated services.** The `.service` is inactive, the `.socket` is listening.
- **Checking only `is-active` after a deploy.** A crash-looping service is `activating` most of the time. Check `NRestarts` too.
- **Forgetting user services.** Services started with `systemctl --user` don't appear in the system list. Use `systemctl --user list-units` as that user.

On systems without systemd (Alpine with OpenRC, old SysV init), use `rc-status` or `service --status-all` instead.

---

*Related: [systemctl service not starting](/blog/systemctl-service-not-starting-fix) once you've found the failed unit, and [journalctl time filters](/blog/journalctl-filter-time-range) for reading its logs.*
