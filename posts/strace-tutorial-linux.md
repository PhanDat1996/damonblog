---
title: "strace Tutorial: Trace a Running Linux Process Safely"
date: "2026-04-21"
updated: "2026-11-26"
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

The lab below puts numbers on both: a filtered `-p` attach that printed nothing cut a process's throughput to under 3% of normal.

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

`EINPROGRESS` isn't the error. The real result is the `SO_ERROR` value: `111` is `ECONNREFUSED`, `110` is `ETIMEDOUT` (newer strace versions print the name instead of the number; 6.8 prints `[ECONNREFUSED]`).

When packets are dropped (host down, routing, a firewall `DROP`), what you see depends on whose timeout runs out first. If the application's own timeout is shorter than the kernel's, the `poll` returns `0 (Timeout)` after the full wait and `SO_ERROR` is still `0`: the connect hasn't failed yet, the application just stopped waiting and reports its own "timed out". `110` only appears when the kernel gives up on its SYN retries, which with the default `tcp_syn_retries=6` takes over two minutes (134 s in the lab below). Either way, a `poll` that sits for its whole timeout on a fresh connect means the SYN got no answer. [Test TCP connections](/blog/cannot-connect-to-server-linux-troubleshooting) has the next steps.

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

## Lab: overhead and connect failures, measured

> **Lab environment:** Ubuntu 24.04.5 LTS test box `lab01` (aarch64, 2 vCPUs), strace 6.8, Python 3.12, `kernel.yama.ptrace_scope=1`. Captured 26 Nov 2026. Output is copied from the terminal without edits. On aarch64 there is no `poll` syscall, so the traces show `ppoll`; on x86_64 the same Python code shows `poll`.

### What a filtered attach costs

`dd` copying one byte per syscall, its read rate taken from `/proc/<pid>/io` over 5 seconds (`rate` is a three-line helper that does exactly that). Then the same while strace is attached with `-e trace=openat`, a syscall `dd` doesn't make at that point, so the trace prints nothing:

```
root@lab01:~# dd if=/dev/zero of=/dev/null bs=1 status=none & echo $! > /tmp/dd.pid
root@lab01:~# rate $(cat /tmp/dd.pid) 5
3288253 bytes/s
root@lab01:~# strace -f -e trace=openat -p $(cat /tmp/dd.pid) -o /dev/null & sleep 1; rate $(cat /tmp/dd.pid) 5; kill -INT %1; wait
strace: Process 2194 attached
91167 bytes/s
strace: Process 2194 detached
root@lab01:~# rate $(cat /tmp/dd.pid) 5
3351370 bytes/s
```

From 3.29 MB/s to 91 KB/s, about 36 times slower, with an empty trace. It recovered as soon as strace detached. Starting the process under strace instead, 500,000 one-byte copies took:

| Command | real |
|---|---|
| `dd` alone | 0.154 s |
| `strace -o /dev/null dd ...` (full trace) | 28.360 s |
| `strace -c -o /dev/null dd ...` | 22.408 s |
| `strace -e trace=openat -o /dev/null dd ...` | 21.659 s |
| `strace --seccomp-bpf -e trace=openat ...` (no `-f`) | 22.523 s |
| `strace -f --seccomp-bpf -e trace=openat ...` | 0.178 s |

`-c` and `-e trace=` saved little. `--seccomp-bpf` was the only thing that helped, and only with `-f`: without it strace 6.8 printed `--seccomp-bpf cannot be used without -f/--follow-forks, disabling`. On an attached process it is refused outright:

```
root@lab01:~# time strace -f --seccomp-bpf -e trace=openat -o /dev/null dd if=/dev/zero of=/dev/null bs=1 count=500000 status=none

real	0m0.178s
user	0m0.050s
sys	0m0.121s
root@lab01:~# dd if=/dev/zero of=/dev/null bs=1 count=50000000 status=none & sleep 1; timeout -s INT 5 strace -f --seccomp-bpf -e trace=openat -p $! -o /dev/null; kill $!
strace: --seccomp-bpf is not enabled for processes attached with -p
strace: Process 2176 attached
strace: Process 2176 detached
```

![Terminal on lab01: dd reads 3288253 bytes/s, drops to 91167 bytes/s while strace -p with -e trace=openat is attached, and recovers after detach; strace -f --seccomp-bpf runs the same dd in 0.178 s, and with -p strace says seccomp-bpf is not enabled for attached processes](/images/lab-strace-attach-overhead.jpg)

### A refused connect and a dropped one

A small Python client doing a non-blocking connect the way event loops do, then `poll` and `SO_ERROR`. First a closed local port, then an address where an `iptables -A OUTPUT ... -j DROP` rule eats the SYN, with a 5-second and a 300-second application timeout:

```
root@lab01:~# strace -T -e trace=connect,ppoll,poll,getsockopt python3 /root/nbconnect.py 127.0.0.1 9999
connect(3, {sa_family=AF_INET, sin_port=htons(9999), sin_addr=inet_addr("127.0.0.1")}, 16) = -1 EINPROGRESS (Operation now in progress) <0.000070>
ppoll([{fd=3, events=POLLOUT}], 1, {tv_sec=3, tv_nsec=0}, NULL, 0) = 1 ([{fd=3, revents=POLLOUT|POLLERR|POLLHUP}], left {tv_sec=2, tv_nsec=999999666}) <0.000002>
getsockopt(3, SOL_SOCKET, SO_ERROR, [ECONNREFUSED], [4]) = 0 <0.000003>
SO_ERROR = 111
root@lab01:~# strace -o /tmp/nb.txt -T -e trace=connect,ppoll,getsockopt python3 /root/nbconnect.py 172.30.0.20 9999 5000; cat /tmp/nb.txt
SO_ERROR = 0
connect(3, {sa_family=AF_INET, sin_port=htons(9999), sin_addr=inet_addr("172.30.0.20")}, 16) = -1 EINPROGRESS (Operation now in progress) <0.000045>
ppoll([{fd=3, events=POLLOUT}], 1, {tv_sec=5, tv_nsec=0}, NULL, 0) = 0 (Timeout) <5.004164>
getsockopt(3, SOL_SOCKET, SO_ERROR, [0], [4]) = 0 <0.000025>
+++ exited with 0 +++
root@lab01:~# strace -o /tmp/nb.txt -T -e trace=connect,ppoll,getsockopt python3 /root/nbconnect.py 172.30.0.20 9999 300000; cat /tmp/nb.txt
SO_ERROR = 110
connect(3, {sa_family=AF_INET, sin_port=htons(9999), sin_addr=inet_addr("172.30.0.20")}, 16) = -1 EINPROGRESS (Operation now in progress) <0.000044>
ppoll([{fd=3, events=POLLOUT}], 1, {tv_sec=300, tv_nsec=0}, NULL, 0) = 1 ([{fd=3, revents=POLLOUT|POLLERR|POLLHUP}], left {tv_sec=165, tv_nsec=587634581}) <134.412414>
getsockopt(3, SOL_SOCKET, SO_ERROR, [ETIMEDOUT], [4]) = 0 <0.000030>
+++ exited with 0 +++
```

![Terminal on lab01: strace of a non-blocking connect; a closed port gives SO_ERROR ECONNREFUSED immediately, a dropped SYN with a 5 s timeout gives ppoll Timeout and SO_ERROR 0, and with a 300 s timeout the kernel gives up after 134 s with ETIMEDOUT](/images/lab-strace-nonblocking-connect.jpg)

The refused connect was over in microseconds. The dropped one with a 5-second timeout never produced an error code at all. The last two runs wrote the trace to a file with `-o`, which keeps the program's own output from mixing into strace's lines.

### -c against -c -w

Three one-second sleeps, counted both ways:

```
root@lab01:~# strace -f -c -e trace=clock_nanosleep,write bash -c 'for i in 1 2 3; do sleep 1; echo tick >/dev/null; done' 2>&1 | head -6
strace: Process 2398 attached
strace: Process 2399 attached
strace: Process 2400 attached
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
 70.24    0.000059          19         3           clock_nanosleep
root@lab01:~# strace -f -c -w -e trace=clock_nanosleep,write bash -c 'for i in 1 2 3; do sleep 1; echo tick >/dev/null; done' 2>&1 | head -6
strace: Process 2412 attached
strace: Process 2413 attached
strace: Process 2414 attached
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
100.00    3.001365     1000454         3           clock_nanosleep
```

Three seconds of sleeping show up as 59 microseconds with plain `-c`.

### Attaching as a normal user

With `ptrace_scope=1`, a user can't attach to their own process unless it's a descendant of the tracer:

```
root@lab01:~# cat /proc/sys/kernel/yama/ptrace_scope; su - damon -c 'sleep 60 & sleep 0.2; strace -p $! -e trace=none 2>&1 | head -2; kill %1'
1
strace: attach: ptrace(PTRACE_SEIZE, 2424): Operation not permitted
```

The `sleep` belonged to `damon` and was started by the same shell, but it was a sibling of `strace`, not its child.

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
