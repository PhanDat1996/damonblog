---
title: "strace Tutorial: Trace a Running Linux Process Safely"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "Use strace to see why a process hangs, fails or is slow: attach to a PID, filter syscalls, read the output, and know what it costs a production service."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
category: "linux"
---

The application says `initialization failed` and nothing else. Or it's been "processing" the same request for ten minutes with an empty log. Or it's slow and nobody knows where the time goes. `strace` shows what the process is actually asking the kernel to do: which files it opens, which addresses it connects to, what it's waiting on. Often the answer is on the first screen.

It also slows the traced process down, sometimes dramatically. This tutorial covers both: how to get answers, and how to avoid causing a second incident while you do.

---

## TL;DR

```bash
sudo strace -f -tt -T -yy -p 4521 -o /tmp/trace.txt     # attach to a running process (all threads)
strace -f -e trace=%file -o /tmp/t.txt ./myapp           # start a program, file syscalls only
sudo strace -c -f -p 4521                                # count syscalls; Ctrl+C for the summary
grep -E "= -1 E" /tmp/trace.txt | head                   # failed calls
```

| Flag | Does |
|---|---|
| `-p PID` | Attach to a running process |
| `-f` | Follow threads and child processes (you almost always want this) |
| `-e trace=...` | Only show some syscalls: `%file`, `%network`, `%process`, `%signal`, `%memory`, `%desc`, or names like `openat,connect` |
| `-o FILE` | Write to a file; `-ff -o FILE` writes one file per PID (`FILE.4521`...) |
| `-tt` | Wall-clock time with microseconds |
| `-T` | Time spent inside each syscall |
| `-r` | Time since the **previous** syscall |
| `-y` / `-yy` | Show the path behind each FD / also socket addresses |
| `-s 256` | Print up to 256 characters of strings (default 32) |
| `-c` | Summary table instead of a trace |

---

## Reading the output

```
14:22:03.118204 openat(AT_FDCWD, "/etc/myapp/config.yml", O_RDONLY) = -1 ENOENT (No such file or directory) <0.000021>
14:22:03.118302 openat(AT_FDCWD, "/opt/myapp/config.yml", O_RDONLY) = 3</opt/myapp/config.yml> <0.000015>
14:22:03.118340 read(3</opt/myapp/config.yml>, "server:\n  port: 8080\n", 4096) = 21 <0.000009>
└─ -tt time ──┘ └syscall┘└──────────── arguments ──────────────┘   └ return value ┘        └ -T ┘
```

- **Return value:** for `openat`, the new file descriptor (`3`). `-1` plus an errno name means failure.
- **`<0.000021>`** (with `-T`): seconds spent in the call. A `read` or `poll` taking seconds is where the time goes.
- **`3</opt/...>`** (with `-y`): the path behind the FD, so you don't have to track numbers by hand.

The errno names you'll see most:

| Error | Meaning |
|---|---|
| `ENOENT` | File or directory doesn't exist |
| `EACCES` | Permission denied (file mode, directory traversal, SELinux/AppArmor) |
| `EPERM` | Operation not permitted (missing capability, immutable file) |
| `ECONNREFUSED` | Remote host answered with a reset: nothing listening on that port |
| `ETIMEDOUT` | No answer at all: host down or a firewall silently dropping |
| `EAGAIN` | "Try again": normal on non-blocking sockets, usually not an error |
| `EINPROGRESS` | Non-blocking `connect()` started; the result comes later |

Not every `-1` is a problem. Programs probe for optional files, and event loops get `EAGAIN` constantly. Look for the failure **right before** the program gives up.

With `-f` you'll also see split lines when two threads interleave:

```
[pid  4533] read(12, <unfinished ...>
[pid  4521] futex(0x7f3a2c0012a8, FUTEX_WAKE_PRIVATE, 1) = 1
[pid  4533] <... read resumed>"GET /health HTTP/1.1\r\n...", 4096) = 78
```

`<unfinished ...>` and `<... resumed>` are the same `read` call, printed in two halves.

---

## Attaching to a running process

```bash
pgrep -a myapp                 # find the PID
sudo strace -f -tt -T -p 4521
```

Notes that save time:

- **Use `-f`, even with `-p`.** Without it, strace attaches only to the thread whose ID you gave, usually the main thread, which in many servers just sits waiting while worker threads do the work.
- **Use `sudo`.** On Ubuntu and others, `kernel.yama.ptrace_scope=1` lets ordinary users trace only their own child processes. Attaching to an existing process as non-root fails with `Operation not permitted`.
- **`Ctrl+C` detaches.** The process keeps running normally. strace doesn't kill it.
- **Always `-o` to a file in production.** It's faster than printing to a terminal and you can grep it afterwards.

---

## What it costs: overhead you need to know

strace uses `ptrace`. Every syscall the process makes stops it **twice** (entry and exit), switches to strace, and back. A process making tens of thousands of syscalls per second can slow down many times over while traced. Latency-sensitive services will notice.

Two common beliefs that are wrong:

- **"`-c` is low overhead."** `-c` prints less, but the process still stops on every syscall. The cost is similar to a full trace.
- **"`-e trace=` filtering reduces the overhead."** When attaching with `-p`, strace still stops on every syscall and just doesn't print the others. Since strace 5.3, `--seccomp-bpf` can filter in the kernel so unrelated syscalls don't stop at all, but it only works for processes strace **starts** (with `-f`), not for `-p`.

Practical rules:

- Keep traces short: seconds to a minute, not "leave it running".
- Trace one worker, not the whole fleet. If there's a load balancer, take that instance out of rotation first.
- For low-overhead syscall visibility on busy production systems, use `perf trace` or eBPF tools (`bpftrace`, the bcc tools like `opensnoop` and `tcpconnect`). They use kernel tracepoints instead of stopping the process.

---

## Scenario 1: "initialization failed", no details

```bash
strace -f -e trace=%file -o /tmp/start.txt /opt/myapp/bin/myapp --config /etc/myapp/prod.yml
grep -E "= -1 E(NOENT|ACCES|PERM)" /tmp/start.txt | tail -20
```

```
openat(AT_FDCWD, "/etc/myapp/prod.yml", O_RDONLY) = 3
openat(AT_FDCWD, "/etc/myapp/certs/client.key", O_RDONLY) = -1 EACCES (Permission denied)
```

The config opened fine; the client key didn't. The last failure before exit is usually the cause. Check the file **and every parent directory**: `namei -l /etc/myapp/certs/client.key` shows permissions along the whole path.

For a service, reproduce it as the service user: `sudo -u appuser strace -f -e trace=%file ...`. See [permission denied fixes](/blog/permission-denied-linux-fix-chmod-chown) and [systemd service not starting](/blog/systemctl-service-not-starting-fix).

---

## Scenario 2: the process hangs

```bash
sudo strace -f -tt -T -yy -p 4521
```

What you see first tells you what it's waiting for:

| You see | It's waiting for |
|---|---|
| `read(7<TCP:[10.0.1.5:51234->10.0.2.15:5432]>, ` with no return | Data from that peer, here the database |
| `epoll_wait(...)`, `poll(...)`, `select(...)` repeating with timeouts | Nothing to do: an idle event loop. Normal for an idle server. |
| `futex(0x..., FUTEX_WAIT_PRIVATE, ...)` on every thread | Threads waiting on locks or condition variables |
| `wait4(...)` | A child process it started |
| `flock(...)` / `fcntl(..., F_SETLKW, ...)` | A file lock held by another process: `lsof /path` finds it |
| Nothing at all | Possibly stuck **inside** the kernel (D state). Check `ps -o stat= -p 4521`. |

About `futex`: idle thread pools sit in `futex` waits all the time, so it isn't proof of a deadlock. strace also can't tell you which thread holds the lock. For that you need a stack dump from the runtime: `jstack` (Java), `py-spy dump` (Python), or `gdb -p 4521 -batch -ex "thread apply all bt"` for native code.

For a process in **D state**, strace usually prints nothing because the process isn't returning to user space. Read the kernel stack instead: `sudo cat /proc/4521/stack`. The [process states guide](/blog/linux-process-states-guide) explains D state.

---

## Scenario 3: connection failures and slow calls

```bash
sudo strace -f -tt -T -yy -e trace=%network -p 4521 -o /tmp/net.txt
grep -E "connect|SO_ERROR" /tmp/net.txt | head
```

Blocking connect, failing fast:

```
connect(9, {sa_family=AF_INET, sin_port=htons(5432), sin_addr=inet_addr("10.0.2.15")}, 16) = -1 ECONNREFUSED (Connection refused) <0.000412>
```

The host answered and refused. Nothing is listening on 10.0.2.15:5432, or a firewall rejects with a reset. Check the service and `ss -ltn` on the database host.

Same failure on a **non-blocking** socket (most modern runtimes) looks different, because the result comes later:

```
connect(9, {sa_family=AF_INET, sin_port=htons(5432), sin_addr=inet_addr("10.0.2.15")}, 16) = -1 EINPROGRESS (Operation now in progress)
poll([{fd=9, events=POLLOUT}], 1, 5000) = 1 ([{fd=9, revents=POLLOUT|POLLERR|POLLHUP}]) <0.000390>
getsockopt(9, SOL_SOCKET, SO_ERROR, [111], [4]) = 0
```

`EINPROGRESS` isn't the error. The real result is the `SO_ERROR` value: `111` is `ECONNREFUSED`, `110` is `ETIMEDOUT` (newer strace versions print the name instead of the number). A `poll` that waits its full timeout (`<5.00...>`) before `SO_ERROR` returns 110 means packets are being dropped somewhere: host down, routing, or a firewall `DROP`. [Test TCP connections](/blog/test-tcp-connection-linux) has the next steps.

Slow DNS looks like this: a `connect` to port 53, then `poll` calls that each take seconds.

```
connect(5, {sa_family=AF_INET, sin_port=htons(53), sin_addr=inet_addr("10.0.0.2")}, 16) = 0
sendto(5, "\x8a\x1f\x01\x00...", 36, MSG_NOSIGNAL, NULL, 0) = 36
poll([{fd=5, events=POLLIN}], 1, 5000) = 0 (Timeout) <5.005117>
```

Each lookup waits 5 seconds for a dead resolver before trying the next one. See [DNS not resolving](/blog/dns-not-resolving-linux-fix).

---

## Scenario 4: where does the time go?

```bash
sudo strace -c -f -p 4521           # Ctrl+C after 10 to 30 seconds
```

```
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
 61.40    0.412337          41     10021           write
 22.18    0.148950          14     10022           read
  9.73    0.065322          65      1002       201 futex
  3.90    0.026181          26      1001           epoll_wait
...
------ ----------- ----------- --------- --------- ----------------
100.00    0.671530                 22109       201 total
```

By default, `-c` reports **CPU time spent in the kernel** for each syscall, not wall-clock time. A thread blocked for 10 seconds in `read` barely shows up. Add `-w` to summarize wall-clock latency instead, which is what you want when hunting for blocking calls:

```bash
sudo strace -c -w -f -p 4521
```

How to read it:

- **Huge `calls` for `read`/`write` with tiny sizes:** many small I/O operations, e.g. unbuffered logging, writing one line per syscall.
- **High `errors` on one syscall:** check what's failing with a filtered trace (`-e trace=futex` or whatever it is).
- **Process at 100% CPU but few syscalls:** the time is in user space (application code). strace can't help; use `perf top -p 4521` or a language profiler. See [high CPU usage](/blog/linux-high-cpu-usage-guide).

---

## Scenario 5: what does this script actually run?

```bash
strace -f -e trace=execve -s 256 -o /tmp/exec.txt ./deploy.sh
grep execve /tmp/exec.txt | grep -v ENOENT
```

```
4610  execve("/usr/bin/curl", ["curl", "-fsS", "https://artifacts.internal/app-2.4.1.tar.gz", "-o", "/tmp/app.tgz"], 0x5581... /* 24 vars */) = 0
4612  execve("/usr/bin/tar", ["tar", "xzf", "/tmp/app.tgz", "-C", "/opt/app"], 0x5581... /* 24 vars */) = 0
```

Every command with its full arguments, including those buried in sourced files. (`ENOENT` lines are the shell searching `PATH`; filter them out.)

---

## Containers

strace inside a container needs the `SYS_PTRACE` capability and a seccomp profile that allows `ptrace`, which many setups don't grant. It's usually easier to trace from the **host**, where container processes are ordinary PIDs:

```bash
PID=$(docker inspect -f '{{.State.Pid}}' mycontainer)
sudo strace -f -p "$PID"
```

Paths in the output are from the container's filesystem view.

---

## Quick checklist

1. `pgrep -a` for the PID; `sudo strace -f -tt -T -yy -p PID -o file`.
2. Keep it short; take the instance out of rotation if you can.
3. Failure? Last `= -1 E...` before the exit.
4. Hang? The syscall that doesn't return, and the FD it's on.
5. Slow? `-c -w` for wall-clock time per syscall; `-T` on the suspect.
6. Busy CPU with few syscalls? It's user space: switch to `perf`.

---

*Related: [strace, lsof and ss together](/blog/strace-lsof-ss-debugging) for a symptom-driven workflow with all three tools, and [Linux debugging tools](/blog/linux-debugging-tools-guide) for choosing the right tool for a symptom.*
