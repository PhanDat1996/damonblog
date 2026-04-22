---
title: "How to Delete Large Files in Linux Safely"
date: "2026-04-22"
excerpt: "Delete large files in Linux safely — handle open file handles, free disk space immediately with truncate, use rm correctly, and recover from accidental deletion."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
slug: "how-to-delete-large-files-linux-safely"
---

Disk is full. You found a 20GB log file. You want to delete it. Sounds simple — but if a process has that file open, `rm` doesn't actually free the space. Here's how to do it right.

---

## TL;DR

```bash
# Find the file
find /var/log -size +1G -type f -ls

# Check if anything has it open
lsof /var/log/app/debug.log

# If open by a running process: truncate (frees space, file stays)
truncate -s 0 /var/log/app/debug.log

# If nothing has it open: safe to delete
rm /var/log/app/debug.log
```

---

## The Critical Check: Is the File Open?

```bash
lsof /var/log/app/debug.log
```

```
COMMAND  PID   USER  FD  TYPE  NODE SIZE/OFF NAME
java    4521  app    12w REG   8,1  21GB     /var/log/app/debug.log
```

**If output is empty:** Nothing has it open → safe to `rm`.
**If output shows a process:** The file is in use. `rm` will unlink it from the directory, but the space stays allocated until the process closes its file descriptor.

---

## When File Is Open: Use truncate

```bash
# Frees space immediately without closing the file handle
truncate -s 0 /var/log/app/debug.log

# Verify
ls -lh /var/log/app/debug.log
# -rw-r--r-- 1 app app 0 Apr 22 09:15 debug.log  ← 0 bytes
df -h /var/log
```

The process continues writing to the same file handle. It just starts from byte 0 again. No restart needed.

**Alternative — redirect to /dev/null:**

```bash
cat /dev/null > /var/log/app/debug.log
# Same effect as truncate -s 0
```

---

## When File Is Closed: rm

```bash
# Standard delete
rm /var/log/app/debug.log

# Delete with confirmation prompt
rm -i /var/log/app/debug.log

# Delete multiple matching files
rm /var/log/app/debug.log.*
find /var/log/app -name "*.log.gz" -mtime +30 -delete
```

---

## The Deleted-But-Open Problem

You ran `rm` but disk usage didn't change:

```bash
df -h /
# Still at 98% after rm

# Find deleted files still held open
lsof | grep deleted | sort -k7 -rn | head -10
```

```
java  4521 app  12w  REG  21GB  /var/log/app/debug.log (deleted)
```

The file was deleted from the directory listing but the inode is still allocated. Space won't free until the process releases the FD.

**Options:**

```bash
# Option 1: restart the process (cleanest)
systemctl restart myapp

# Option 2: truncate via the /proc fd (no restart needed)
# From lsof output: PID=4521, FD=12
truncate -s 0 /proc/4521/fd/12

# Verify space freed
df -h
```

---

## Real Examples

### 20GB nginx access log eating disk

```bash
# Check if nginx has it open
lsof /var/log/nginx/access.log

# nginx has it open via FD 6
# Truncate safely
truncate -s 0 /var/log/nginx/access.log

# Better long-term: configure log rotation
# /etc/logrotate.d/nginx already exists — ensure it's configured
```

### Delete old Docker layers safely

```bash
# Check Docker disk usage first
docker system df

# Remove unused images, containers, build cache
docker system prune -af

# Check what was freed
df -h /var/lib/docker
```

### Clean up core dump files

```bash
# Find core dumps
find / -name "core" -o -name "core.[0-9]*" 2>/dev/null | xargs ls -lh 2>/dev/null

# Safe to delete — no process holds these open
find / -name "core.[0-9]*" -type f -delete 2>/dev/null
```

### Bulk delete old compressed logs

```bash
# Preview
find /var/log -name "*.gz" -mtime +14 -exec ls -lh {} \;

# Get total size
find /var/log -name "*.gz" -mtime +14 -exec du -ch {} + | tail -1

# Delete
find /var/log -name "*.gz" -mtime +14 -delete

# Confirm disk freed
df -h /var/log
```

---

## Common Mistakes

**Mistake 1: `rm` a file that's actively written and wondering why disk isn't freed**
`rm` only removes the directory entry. The inode stays allocated until all FDs are closed. Always check with `lsof` first.

**Mistake 2: `rm -rf` on a directory without checking contents**
```bash
# Check before deleting a directory
du -sh /var/log/oldapp/
ls /var/log/oldapp/

# Then delete
rm -rf /var/log/oldapp/
```

**Mistake 3: Deleting without checking for symlinks**
```bash
ls -la /var/log/app.log
# /var/log/app.log -> /data/logs/app.log  ← symlink!
# rm /var/log/app.log  removes the symlink, not the actual file
```

**Mistake 4: Not confirming disk freed after deletion**
Always `df -h` after a large deletion. If space didn't free, check for deleted-but-open FDs.

---

## Quick Reference

```bash
# Find large files
find /var/log -size +1G -type f -ls

# Check if file is open
lsof /path/to/file

# Free space without closing file handle
truncate -s 0 /path/to/file

# Free space if nothing holds it
rm /path/to/file

# Find deleted-but-open files (eating space)
lsof | grep deleted | sort -k7 -rn | head

# Truncate via /proc fd (if process can't restart)
truncate -s 0 /proc/<pid>/fd/<fd>
```

---

## Conclusion

Check `lsof` before deleting any large log file. If a process has it open, `truncate -s 0` frees the space immediately without needing a restart. If `rm` didn't free space, the file is deleted-but-open — find it with `lsof | grep deleted` and truncate via `/proc/<pid>/fd/<fd>`.

---

*Related: [Linux Find Files Older Than X Days](/blog/linux-find-files-older-than-x-days) — find what to delete. [Disk Full Linux: How to Clean Up Fast](/blog/disk-full-linux-cleanup-guide) — full disk cleanup workflow.*
