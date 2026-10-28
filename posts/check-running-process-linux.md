---
title: "How to Check Running Processes in Linux (and Is It Up?)"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "See what's running on a Linux server and check whether a specific service is actually up: ps, pgrep, systemctl and ss, and what the output tells you."
tags: ["linux", "troubleshooting", "debugging", "monitoring"]
featured: false
category: "linux"
---

Something stopped working and the first question is simple: is the process even running? Or you've landed on an unfamiliar box and want to know what's on it.

Here are the commands, by question.

```bash
ps aux                         # everything running, with CPU and memory
ps -ef --forest                # everything, as a parent/child tree
pgrep -a nginx                 # is nginx running? PIDs + command lines
systemctl status nginx         # is the *service* up, and since when?
ss -tlnp                       # which processes are listening on which ports
top                            # live view, busiest first
```

---

## "Is my service running?"

There are three different answers, and you usually want all three.

**1. Does systemd think it's running?**

```bash
systemctl status nginx
```

```
● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; preset: enabled)
     Active: active (running) since Mon 2026-10-27 09:15:02 UTC; 1 day 3h ago
   Main PID: 1102 (nginx)
      Tasks: 5 (limit: 9434)
     Memory: 12.4M
     CGroup: /system.slice/nginx.service
             ├─1102 "nginx: master process /usr/sbin/nginx -g daemon on; master_process on;"
             ├─1103 "nginx: worker process"
             ...
```

`active (running)` plus a recent "since" time after you didn't restart it means it crashed and was restarted. `activating (auto-restart)` or `failed` means it isn't up. Read the log lines at the bottom, or `journalctl -u nginx -n 50`. If it won't start at all, see [systemctl Service Not Starting](/blog/systemctl-service-not-starting-fix).

**2. Does the process exist?**

```bash
pgrep -a nginx
# 1102 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;
# 1103 nginx: worker process
```

No output (exit code 1) means nothing by that name. This catches things systemd doesn't manage: containers, cron jobs, apps started by hand. Matching rules have a few traps (15-character names, `-f` vs `-x`); they're covered in [Find a Process by Name](/blog/linux-find-process-by-name).

**3. Is it actually listening?**

```bash
ss -tlnp | grep nginx
# LISTEN 0  511  0.0.0.0:80   0.0.0.0:*  users:(("nginx",pid=1103,fd=6),("nginx",pid=1102,fd=6))
```

A process can be running and still not serving: stuck on startup, bound to `127.0.0.1` only, or listening on the wrong port. Run `ss` with `sudo` to see processes owned by other users. More in [Check Open Ports in Linux](/blog/check-open-ports-linux).

A running, listening process that still doesn't respond is often stuck. Check its state:

```bash
ps -o pid,stat,etime,wchan:32,args -p 1102
```

`D` in `STAT` means it's blocked in the kernel, usually on disk or NFS, and won't respond to anything (including `kill -9`) until that I/O completes. `T` means it was stopped (`SIGSTOP`, `Ctrl+Z`). [Linux Process States](/blog/linux-process-states-guide) explains each state.

---

## "What's running on this box?"

### Snapshot

```bash
ps aux
```

```
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root           1  0.0  0.1 168940 13120 ?        Ss   Oct20   0:21 /sbin/init
root        1102  0.0  0.0  55220  1540 ?        Ss   Oct20   0:00 nginx: master process /usr/sbin/nginx
www-data    1103  0.4  0.1  56840  9216 ?        S    Oct20  46:12 nginx: worker process
app         8823 41.7 13.1 6843120 2097460 ?     Ssl  09:02 132:40 java -Xmx4g -jar /opt/app/service.jar
```

Kernel threads appear in square brackets (`[kworker/0:2]`); you can usually ignore them. To hide them:

```bash
ps --ppid 2 -p 2 -N -o pid,user,stat,etime,args
```

(PID 2 is `kthreadd`, the parent of all kernel threads; `-N` inverts the selection.)

### As a tree

```bash
ps -ef --forest
pstree -p              # more compact, from the psmisc package
```

A tree answers "what started this?" without looking up PPIDs by hand. Useful when an unknown process shows up and you want to know whether it came from cron, a shell, a container runtime or a service.

### Live

```bash
top          # always installed
htop         # nicer, if installed
```

Both sort by current CPU usage. Note that `%CPU` in `ps` is averaged over the process's whole lifetime, so the busiest process **right now** is better found with `top`. See [top Command in Linux](/blog/top-command-linux-guide), and [htop vs top](/blog/htop-vs-top-linux) for which to use.

### By service, not by process

```bash
systemctl list-units --type=service --state=running
systemd-cgls                     # every service with its processes
```

`systemd-cgls` is the clearest view on a systemd machine: each service and the PIDs it owns, including helper processes you wouldn't think to search for. See [Check Running Services with systemctl](/blog/linux-check-running-services-systemctl).

### In containers

```bash
docker ps                        # running containers
docker top <container>           # processes inside one container
```

Container processes are also visible from the host in `ps aux` (they're regular processes in their own namespaces), often with surprising user names because UIDs map to whatever exists on the host.

---

## Filter what you see

| You want | Command |
|---|---|
| One user's processes | `ps -u www-data -o pid,stat,etime,args` |
| By exact command name | `ps -C nginx -o pid,ppid,stat,args` |
| By part of the command line | `pgrep -af "service.jar"` |
| Biggest memory users | `ps -eo pid,user,rss,comm --sort=-rss \| head` |
| Long-term CPU users | `ps -eo pid,user,%cpu,comm --sort=-%cpu \| head` |
| Stuck or zombie tasks | `ps -eo stat,pid,ppid,comm \| awk '$1 ~ /^[DZ]/'` |
| What owns port 8080 | `sudo ss -tlnp 'sport = :8080'` |

If you grep `ps` output, use `grep '[n]ginx'` rather than `grep nginx` so the grep doesn't match itself, or just use `pgrep`.

---

**How do I check if a process is running in a shell script?**
Use the exit code of `pgrep`: `if pgrep -x nginx >/dev/null; then ...`. For a systemd service, `systemctl is-active --quiet nginx` is more meaningful, because it reflects the service state rather than whether some process with that name exists.

**How do I see how long a process has been running?**
`ps -o pid,etime,lstart,args -p <PID>`. `etime` is elapsed time; `lstart` is the exact start timestamp.

**Why does `ps aux` show processes I can't find in `systemctl`?**
Not everything is a systemd service. Processes can come from cron, login sessions, containers or be started by hand. `ps -ef --forest` shows who started them.

---

*Related: [ps Command in Linux](/blog/ps-command-linux-troubleshooting) for every column and STAT code. [Kill a Process by Port](/blog/linux-kill-process-by-port) when the port is what you know.*
