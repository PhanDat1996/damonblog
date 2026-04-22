---
title: "Disk Full Linux: How to Clean Up and Free Space Fast"
date: "2026-04-22"
excerpt: "Fix a full disk on Linux fast — find what's taking space with df and du, clean logs, Docker, package caches, and deleted-but-open files in production."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
slug: "disk-full-linux-cleanup-guide"
---

Disk alert firing. Server at 100%. Services failing because they can't write. Here's the fastest path from full disk to recovered system.

---

## TL;DR: 2-Minute Emergency Cleanup

```bash
# Find which filesystem is full
df -h

# Find the biggest directories
du -sh /* 2>/dev/null | sort -rh | head -10

# Emergency: clean package cache
apt clean        # Ubuntu (usually 500MB–2GB)
dnf clean all    # RHEL

# Emergency: clean old journal logs
journalctl --vacuum-size=100M

# Emergency: clean Docker
docker system prune -f
```

---

## Step 1: Find What's Full

```bash
df -h
```

```
Filesystem      Size  Used Avail Use%  Mounted on
/dev/sda1        50G   50G     0  100%  /          ← this one
/dev/sdb1       200G   12G  178G    7%  /data
```

Note the mount point (`/`). All cleanup must target directories on that filesystem.

---

## Step 2: Find What's Filling It

```bash
# Top-level breakdown (takes 30 seconds on large disks)
du -sh /* 2>/dev/null | sort -rh | head -10

# Drill into the biggest one (usually /var)
du -sh /var/* 2>/dev/null | sort -rh | head -10

# Drill deeper
du -sh /var/log/* 2>/dev/null | sort -rh | head -10
```

The most common culprits:
- `/var/log` — application or system logs
- `/var/lib/docker` — Docker images, containers, volumes
- `/var/cache` — package manager cache
- `/home` — user data
- `/tmp` — temp files

---

## Fix: Log Files

```bash
# Find large log files
find /var/log -name "*.log" -size +100M -exec ls -lh {} \;

# Check if a process has the file open (can't delete if it does)
lsof | grep "deleted\|/var/log/app/debug.log"

# If process has it open: TRUNCATE, don't delete
truncate -s 0 /var/log/app/debug.log
# This frees space immediately without closing the file handle

# If no process has it open: delete
rm /var/log/app/debug.log

# Clean journal logs
journalctl --disk-usage
journalctl --vacuum-size=200M   # keep 200MB of journal
journalctl --vacuum-time=7d     # keep 7 days of journal
```

---

## Fix: Docker

Docker is one of the most common causes of unexpected disk full on servers:

```bash
# See Docker disk usage
docker system df

# Output:
# TYPE                 TOTAL    RECLAIMABLE
# Images               15       3 (stopped images)
# Containers           8        2 (stopped containers)
# Volumes              5        1 (unused volumes)
# Build Cache          ...

# Clean stopped containers, unused images, dangling volumes
docker system prune -f

# Also clean unused volumes
docker system prune -f --volumes

# Clean only stopped containers
docker container prune -f

# Clean unused images
docker image prune -a -f
```

---

## Fix: Package Manager Cache

```bash
# Ubuntu/Debian — often 1-3GB
apt clean
apt autoremove

# RHEL/CentOS/Rocky
dnf clean all
dnf autoremove

# Check how much space packages are using
dpkg-query -W --showformat='${Installed-Size}\t${Package}\n' | sort -rn | head -20
```

---

## Fix: Old Kernel Versions

```bash
# Ubuntu — list installed kernels
dpkg --list | grep linux-image

# Remove old kernels (keeps current + one previous)
apt autoremove --purge
```

---

## Fix: Deleted Files Still Held Open

This explains the gap between `df` (says 100% full) and `du` (says only 60% used):

```bash
# Find deleted files still consuming space
lsof | grep deleted | awk '{print $7, $9}' | sort -rn | head -10

# 28747832  /var/log/app/debug.log (deleted)
```

The file was deleted from the directory but a process still has it open. The space isn't freed until the process closes it.

```bash
# Option 1: truncate the file descriptor (frees space immediately)
PID=4521
FD=12    # file descriptor number from lsof output
truncate -s 0 /proc/$PID/fd/$FD

# Option 2: restart the process (it will close the file handle)
systemctl restart myapp
```

---

## Fix: /tmp and Core Dumps

```bash
# Clear /tmp (safe if nothing critical is there)
find /tmp -type f -mtime +1 -delete    # files older than 1 day
find /tmp -type f -atime +3 -delete    # not accessed in 3 days

# Find core dumps (often GBs each)
find / -name "core" -o -name "core.[0-9]*" -type f 2>/dev/null | xargs ls -lh 2>/dev/null
# Safe to delete core dumps after you've captured the stack trace
```

---

## Prevent It Coming Back

```bash
# Set up log rotation
cat > /etc/logrotate.d/myapp << EOF
/var/log/myapp/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    maxsize 100M
}
EOF

# Set journal size limit
echo "SystemMaxUse=500M" >> /etc/systemd/journald.conf
systemctl restart systemd-journald

# Monitor disk usage with cron alert
cat > /etc/cron.hourly/disk-alert << 'EOF'
#!/bin/bash
THRESHOLD=85
df -h | awk -v t=$THRESHOLD 'NR>1 {gsub(/%/,"",$5); if ($5 > t) print "ALERT: "$1" is "$5"% full"}'
EOF
chmod +x /etc/cron.hourly/disk-alert
```

---

## Common Mistakes

**Deleting log files that are still open.** Space isn't freed until the process closes the file descriptor. Truncate instead.

**Cleaning `/tmp` without checking if anything needs it.** Some services use `/tmp` for active work. Check with `lsof | grep /tmp` first.

**Not setting up log rotation after cleanup.** You cleared 30GB of logs manually — without rotation, it fills up again in the same timeframe.

**Running `docker system prune --volumes` on production.** This deletes unused volumes. If a volume is referenced by a stopped (but important) container, you lose the data.

---

## Conclusion

`df -h` → find the full filesystem. `du -sh /* | sort -rh` → find the biggest directory. Drill down level by level until you find the file or directory. Check for deleted-but-open files if `df` and `du` disagree. Set up log rotation and journal size limits before walking away.

---

*Related: [How to Find Large Files in Linux](/blog/find-large-files-linux-guide) — find exactly which files are responsible. [Docker Log Rotation](/blog/docker-log-rotation) — prevent Docker from filling your disk.*
