---
title: "Disk Full on Linux: Free Space Fast Without Breaking Things"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Linux disk at 100% and No space left on device? Triage in the right order: inodes, deleted-but-open files, logs, journal, Docker and package caches."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "linux"
---

The alert fires at 3 a.m.: `/` is at 100%. The database can't write its WAL, NGINX logs `No space left on device`, and SSH logins feel sluggish. You delete a 20 GB log file and run `df -h` again. Still 100%.

That's the trap this page is about. On a full disk, the order you do things in matters as much as what you delete. This is the runbook: get breathing room safely, find the real cause, then stop it from coming back.

---

## TL;DR

```bash
df -h /  &&  df -i /                  # bytes full, or inodes full?
sudo lsof -nP +L1 | sort -k7 -rn | head   # deleted files still holding space
sudo journalctl --vacuum-size=200M    # safe, quick win
sudo apt clean    # or: sudo dnf clean all
```

Then find the big folder with `du` (see [Check Disk Usage in Linux](/blog/check-disk-usage-linux-du-df)) and deal with the culprit. **Never `rm` a log file a process is still writing to**; empty it with `truncate -s 0` instead.

---

## Step 1: Confirm what is actually full

```bash
df -h
```

```
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        50G   48G     0 100% /
/dev/sdb1       200G   12G  189G   7% /data
```

Write down the mount point. Everything you delete must be **on that filesystem**; freeing space on `/data` does nothing for `/`.

Then check inodes, because the error message is the same:

```bash
df -i /
```

```
Filesystem      Inodes   IUsed IFree IUse% Mounted on
/dev/sda1      3276800 3276800     0  100% /
```

If `IUse%` is 100% but `df -h` shows free space, you're out of inodes, not bytes. Deleting one big file won't help; you need to delete many small ones. Find the folder with the most files:

```bash
sudo du --inodes -x / 2>/dev/null | sort -rn | head -15
```

Typical culprits: PHP session folders (`/var/lib/php/sessions`), mail queues (`/var/spool/postfix`), application cache folders, and build artifacts in CI runners.

---

## Step 2: Get breathing room safely

When the disk is at 100%, services fail in odd ways and even your shell's tab completion can break. Get a few GB back with cleanups that can't hurt anything, before you start investigating.

**systemd journal.** Archived journal files can be removed safely:

```bash
journalctl --disk-usage
# Archived and active journals take up 3.9G in the file system.

sudo journalctl --vacuum-size=200M
```

`--vacuum-size` only deletes **archived** journal files, never the active one, so the result can stay a little above the target.

**Package manager cache.** Downloaded package files, already installed:

```bash
sudo apt clean          # Debian/Ubuntu: empties /var/cache/apt/archives
sudo dnf clean all      # Fedora/RHEL: empties /var/cache/dnf
```

**ext4 reserved blocks (emergency only).** ext4 keeps 5% of the filesystem for root. When a root-owned service is the one failing, you can temporarily lower it:

```bash
sudo tune2fs -l /dev/sda1 | grep -i "reserved block count"
sudo tune2fs -m 1 /dev/sda1      # reserve 1% instead of 5%, takes effect immediately
```

On a 50 GB disk this frees about 2 GB for normal users. Put it back (`tune2fs -m 5`) once the disk is cleaned up; the reservation exists so root can still log in and fix things when users fill the disk. On large data-only volumes, 1% is a reasonable permanent setting. This doesn't apply to XFS or Btrfs.

---

## Step 3: Check for deleted-but-open files

If you (or a cron job) already deleted something big and `df` didn't move, this is why. Removing a file only removes its name. The blocks are freed when the **last process closes it**, so a running app keeps writing to a file nobody can see.

```bash
sudo lsof -nP +L1
```

```
COMMAND   PID USER   FD   TYPE DEVICE    SIZE/OFF NLINK    NODE NAME
java     2318 app    41w   REG    8,1 21474836480     0 1048602 /var/log/app/debug.log (deleted)
nginx    1102 www    5w    REG    8,1  3221225472     0 1048711 /var/log/nginx/access.log.1 (deleted)
```

`+L1` means "link count less than 1", which is exactly the set of deleted files that are still open. Two ways to free the space:

```bash
# Option 1: restart the process (cleanest)
sudo systemctl restart myapp

# Option 2: no restart allowed, empty the file through the open descriptor
sudo truncate -s 0 /proc/2318/fd/41
```

For NGINX specifically, `sudo nginx -s reopen` makes it close and reopen its log files, which releases the deleted one without dropping connections.

This is also why `df` and `du` disagree after a cleanup: `du` can't see a file without a name, `df` still counts its blocks.

---

## Step 4: Find and fix the real culprit

Drill down on the full filesystem only:

```bash
sudo du -xh --max-depth=1 / 2>/dev/null | sort -rh | head
```

Repeat on the biggest folder. The full walkthrough, plus `ncdu` for interactive browsing, is in [Check Disk Usage in Linux](/blog/check-disk-usage-linux-du-df). To jump straight to individual big files, see [Find Large Files on Linux](/blog/find-large-files-linux).

What you'll usually find, and what to do about it:

### A huge application log

```bash
sudo lsof /var/log/app/debug.log      # is something writing to it?
```

If a process has it open, **empty it in place** instead of deleting:

```bash
sudo truncate -s 0 /var/log/app/debug.log
# equivalent:  sudo sh -c ': > /var/log/app/debug.log'
```

This keeps the same inode, so the process keeps writing to the same (now empty) file and the space comes back immediately. If you need the content, copy the last part first: `tail -c 500M debug.log > /data/debug.tail`. The reasoning behind `rm` vs `truncate` is in [Delete Large Files Safely](/blog/how-to-delete-large-files-linux-safely).

### Docker

```bash
docker system df
```

```
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          23        6         14.2GB    9.8GB (69%)
Containers      9         6         1.1GB     312MB (28%)
Local Volumes   7         4         5.4GB     1.2GB (22%)
Build Cache     41        0         3.6GB     3.6GB
```

Start with the safe prunes and preview where possible:

```bash
docker container ls -a --filter status=exited    # what would be removed
docker container prune                           # stopped containers
docker image prune                               # dangling (untagged) images
docker builder prune                             # build cache
```

`docker image prune -a` also removes every image not used by a container, which means the next deploy or rollback has to pull again. `docker system prune --volumes` deletes unused volumes, and a volume belonging to a removed or not-yet-created container is "unused" even if it holds your database. Don't run it on a production host without listing volumes first (`docker volume ls -f dangling=true`).

If the space is in `/var/lib/docker/containers/*/*-json.log`, a container is logging without rotation; fix it with [Docker Log Rotation](/blog/docker-log-rotation).

### Core dumps

```bash
sudo find / -xdev -type f \( -name core -o -name 'core.[0-9]*' \) -printf '%s\t%p\n' 2>/dev/null | sort -rn | head
coredumpctl list     # systemd-coredump keeps them in /var/lib/systemd/coredump
```

The parentheses matter: without them, `-type f` only applies to the second `-name`. Check the names before deleting; some projects have source files or directories called `core`.

### Old kernels (Ubuntu/Debian)

```bash
dpkg --list 'linux-image-*' | grep '^ii'
sudo apt autoremove --purge
```

`autoremove` keeps the running kernel and the most recent ones. Mostly matters when `/boot` is a small separate partition.

### /tmp

Don't `rm -rf /tmp/*` on a running server; sockets and lock files live there. Preview old files first, then delete:

```bash
sudo find /tmp -xdev -type f -mtime +7 -print | head -50     # dry run
sudo find /tmp -xdev -type f -mtime +7 -delete
```

More on age-based cleanup in [Find Files Older Than X Days](/blog/linux-find-files-older-than-x-days).

---

## Step 5: Stop it from happening again

**Rotate application logs.** For apps that keep their log file open and can't be told to reopen it, use `copytruncate`; otherwise rotation renames the file and the app keeps filling the renamed one:

```
# /etc/logrotate.d/myapp
/var/log/myapp/*.log {
    daily
    rotate 7
    maxsize 500M
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

Test it without changing anything: `sudo logrotate -d /etc/logrotate.d/myapp`. Note that `maxsize` is only checked when logrotate runs (daily by default), so a log that grows 50 GB in an hour will still fill the disk.

**Cap the journal** with a drop-in instead of editing the main file:

```ini
# /etc/systemd/journald.conf.d/size.conf
[Journal]
SystemMaxUse=500M
```

```bash
sudo systemctl restart systemd-journald
```

**Alert before 100%.** Alert at 80–85% and on inode usage, not only bytes. A disk going from 70% to 100% in an hour is a runaway log or core dump loop, and you want to know while there's still room to act.

---

## Quick checklist

1. `df -h` and `df -i`: which filesystem, bytes or inodes?
2. Free safe space first: journal vacuum, package cache.
3. `lsof +L1`: deleted files still held open? Restart or truncate via `/proc/<pid>/fd/<n>`.
4. `du -x` drill-down to the culprit; truncate live logs, don't `rm` them.
5. Preview every `find -delete` and `prune` before running it.
6. Add log rotation, journal limits and an 85% alert.

*Related: [Linux Log Analysis Guide](/blog/linux-log-analysis-guide) for working out why a log suddenly grew. [Check Disk I/O with iostat](/blog/linux-check-disk-io-iostat) if the disk is slow rather than full.*
