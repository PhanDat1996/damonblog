---
title: "How to Find Process by Name in Linux: pgrep, ps, pidof"
date: "2026-04-22"
excerpt: "Find a Linux process by name using pgrep, ps, pidof, and top — with real examples for scripting, killing, and monitoring processes in production."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
slug: "linux-find-process-by-name-guide"
---

You know what the process is called. You need its PID, its state, its parent, or just to know if it's running. Here's every reliable way to find a process by name.

---

## TL;DR

```bash
pgrep nginx           # PID(s) — best for scripting
pgrep -a nginx        # PID + full command
ps aux | grep '[n]ginx'    # with details, no self-match
pidof nginx           # PID only, exact binary name
```

---

## pgrep: Cleanest for Scripting

`pgrep` searches the process table by name and returns matching PIDs:

```bash
# Basic — returns PID(s)
pgrep nginx

# Show full command line
pgrep -a nginx

# Case-insensitive
pgrep -i NGINX

# Match exact name only
pgrep -x nginx       # won't match "nginx-debug"

# By user
pgrep -u www-data nginx

# Count matching processes
pgrep -c nginx

# Return 0 if found, 1 if not — good for conditionals
pgrep -x nginx > /dev/null && echo "running" || echo "not running"
```

---

## ps: Find with Full Details

`ps` shows processes with resource usage, state, and parent PID:

```bash
# Find all nginx processes
ps aux | grep nginx

# Avoid matching grep itself (important in scripts)
ps aux | grep '[n]ginx'
# The character class [n] doesn't match the string "grep [n]ginx"

# Find by command pattern (full command line)
ps aux | grep "java.*service.jar"

# Show specific columns
ps -eo pid,ppid,user,stat,%cpu,%mem,comm | grep nginx
```

### The self-match problem

```bash
# BAD — the grep process shows up in results
ps aux | grep nginx
# nginx   1234  ... nginx: master process
# root    9901  ... grep nginx       ← this is the grep itself

# GOOD — character class trick
ps aux | grep '[n]ginx'
# nginx   1234  ... nginx: master process
```

---

## pidof: Exact Binary Name

`pidof` matches the exact executable name:

```bash
pidof nginx
# 1234 1235 1236   ← master + workers

pidof sshd
# 1023

# Multiple processes
pidof nginx sshd postgres
```

Unlike `pgrep`, `pidof` matches the exact binary name only. `pidof ngin` returns nothing even though `nginx` is running.

---

## Finding by Full Command Line

When multiple processes have the same name but different arguments:

```bash
# pgrep with full command match
pgrep -f "java.*service-prod.jar"

# ps with grep
ps aux | grep "service-prod.jar" | grep -v grep

# Find all java processes with different configs
ps -eo pid,cmd | grep java | grep -v grep
```

`pgrep -f` matches against the full command line including arguments — essential when you have multiple instances of the same binary with different configs.

---

## Real Examples

### Check if a service is running

```bash
pgrep -x nginx > /dev/null && echo "nginx is running" || echo "nginx is NOT running"

# In a script
if pgrep -x nginx > /dev/null 2>&1; then
  echo "OK: nginx running ($(pgrep -c nginx) processes)"
else
  echo "ALERT: nginx not found"
  exit 1
fi
```

### Find all instances of an app

```bash
# List all java processes with their args
ps -eo pid,user,cmd | grep '[j]ava'
# 8823 app  java -Xmx4g -jar service-prod.jar
# 9011 app  java -Xmx2g -jar worker.jar
```

### Find a process and check its state

```bash
PID=$(pgrep -x myapp)
if [ -n "$PID" ]; then
  ps -p $PID -o pid,stat,etime,%cpu,%mem,comm
fi
```

### Find and monitor a process's resources

```bash
# Watch CPU and memory for nginx
watch -n 2 'ps -eo pid,user,%cpu,%mem,stat,comm | grep [n]ginx'

# Or use top filtered to PID
top -p $(pgrep -d, nginx)
```

### Find zombie processes by name

```bash
ps -eo pid,stat,comm | awk '$2 ~ /Z/ && $3 ~ /myapp/'
```

---

## Output Explanation

```bash
ps aux | grep '[n]ginx'
```

```
USER   PID  %CPU %MEM    VSZ   RSS TTY   STAT START   TIME COMMAND
www    1234   0.0  0.1  45312  4096 ?     Ss   09:15   0:00 nginx: master process /usr/sbin/nginx
www    1235   2.1  0.3  45312  8192 ?     S    09:15   1:23 nginx: worker process
www    1236   1.8  0.3  45312  8064 ?     S    09:15   1:19 nginx: worker process
```

- `Ss` — sleeping, session leader (master process)
- `S` — sleeping (worker processes)
- `TIME` — cumulative CPU time consumed, not wall time

---

## Common Mistakes

**Mistake 1: Using `ps aux | grep name | awk '{print $2}' | xargs kill`**
Race condition — PID may change between `ps` and `kill`. Use `pkill` instead:

```bash
pkill -TERM nginx
kill $(pgrep -x nginx)   # explicit but controlled
```

**Mistake 2: `pidof` returning nothing for interpreted scripts**
`pidof python` may not find `python3 /opt/app/server.py`. Use `pgrep -f "server.py"` instead.

**Mistake 3: Not accounting for multiple instances**
`pgrep nginx` returns multiple PIDs. When you only expect one, check:

```bash
pgrep -c nginx   # count
# If > 1, investigate why
```

---

## Pro Tips

```bash
# Find process and immediately show its open files
lsof -p $(pgrep -x nginx | head -1)

# Find process and trace it
strace -p $(pgrep -x myapp)

# Find processes started in the last 5 minutes
ps -eo pid,lstart,cmd | awk -v d="$(date -d '5 minutes ago' '+%s')" '
  NR>1 && mktime($2" "$3" "$4" "$5" "$6) > d {print}'

# Find by port (combine ss + pgrep)
PID=$(ss -tlnp | awk -F'pid=' '/8080/{print $2}' | cut -d, -f1)
pgrep -a -P $PID    # show children of that PID
```

---

## Conclusion

`pgrep` is the right tool for scripting — returns clean PIDs, supports exact matching, works with full command line via `-f`. `ps aux | grep '[name]'` is for interactive investigation where you want context. `pidof` is fast when you know the exact binary name. Never use `ps | grep | awk | kill` pipelines in scripts — use `pkill` or `kill $(pgrep ...)` instead.

---

*Related: [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide) — full ps usage for production investigation. [Linux Kill Process by Port](/blog/linux-kill-process-by-port) — when you need to find and kill by port instead of name.*
