---
title: "Linux Find Files Older Than X Days: find -mtime Examples"
date: "2026-04-22"
excerpt: "Find files older than X days in Linux using find -mtime — with real examples for log cleanup, archiving old files, and safe deletion workflows."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
slug: "linux-find-files-older-than-x-days"
category: "linux"
---

Cleaning up old logs, archiving stale files, or auditing what's been sitting untouched — `find` with `-mtime` covers all of it.

---

## TL;DR

```bash
# Files older than 30 days
find /var/log -type f -mtime +30

# Files older than 7 days, larger than 10MB
find /var/log -type f -mtime +7 -size +10M

# Delete files older than 14 days (preview first)
find /var/log -name "*.log.gz" -mtime +14 -type f
find /var/log -name "*.log.gz" -mtime +14 -type f -delete
```

---

## Understanding -mtime

```bash
find / -mtime +N    # modified MORE than N days ago (older than N days)
find / -mtime -N    # modified LESS than N days ago (newer than N days)
find / -mtime  N    # modified exactly N days ago
```

The unit is **24-hour periods** from the current time, not calendar days.

```bash
# Older than 30 days
find /var/log -mtime +30

# Modified within the last 24 hours
find /var/log -mtime -1

# Modified between 7 and 14 days ago
find /var/log -mtime +7 -mtime -14
```

---

## Other Time Flags

```bash
# -atime: last accessed
find /data -atime +90    # not accessed in 90+ days

# -ctime: status change (permissions, owner)
find /etc -ctime -7      # status changed in last 7 days

# -mmin: minutes instead of days
find /tmp -mmin +60      # older than 60 minutes
find /tmp -mmin -30      # modified in last 30 minutes
```

---

## Combine With Other Filters

```bash
# Old log files specifically
find /var/log -name "*.log" -mtime +30 -type f

# Old AND large files (prime cleanup targets)
find /var/log -mtime +7 -size +100M -type f

# Old files owned by a specific user
find /home -mtime +180 -user olduser -type f

# Old empty files (cleanup noise)
find /tmp -mtime +7 -empty -type f
```

---

## Real Examples

### Find old rotated logs for cleanup

```bash
# Preview
find /var/log -name "*.gz" -mtime +30 -type f -ls

# Delete after confirming
find /var/log -name "*.gz" -mtime +30 -type f -delete
```

### Find stale temp files

```bash
# Temp files not accessed in 7+ days
find /tmp /var/tmp -atime +7 -type f 2>/dev/null

# Delete safely (skip files in use)
find /tmp -atime +7 -type f -not -newer /proc/1 -delete 2>/dev/null
```

### Find and compress old log files instead of deleting

```bash
# Compress logs older than 7 days that aren't already compressed
find /var/log/app -name "*.log" -mtime +7 -not -name "*.gz" \
  -exec gzip -9 {} \;
```

### Audit: files not touched in 90 days (cleanup candidates)

```bash
find /opt/apps -type f -atime +90 -size +1M 2>/dev/null \
  | awk '{print}' | head -20
```

### Find recently created files (incident investigation)

```bash
# Files created/modified in the last 30 minutes
find / -mmin -30 -type f ! -path "/proc/*" ! -path "/sys/*" 2>/dev/null
```

---

## Safe Delete Workflow

**Never delete without previewing first.**

```bash
# Step 1: preview what will be deleted
find /var/log -name "*.log.gz" -mtime +14 -type f -ls

# Step 2: count them
find /var/log -name "*.log.gz" -mtime +14 -type f | wc -l

# Step 3: delete (only after confirming step 1 output)
find /var/log -name "*.log.gz" -mtime +14 -type f -delete

# Step 4: verify
df -h /var/log
```

---

## Common Mistakes

**Mistake 1: Forgetting `-type f`**
Without `-type f`, `-delete` will try to delete directories too, which fails if they're not empty — but causes confusion.

**Mistake 2: Using `+30` when you mean 30+ days**
`-mtime +30` = modified more than 30 days ago = older than 30 days. Exactly as expected.

**Mistake 3: Deleting without checking for open file handles**
A log file might be actively written. Use `lsof` to check:

```bash
# Before deleting, check if the file is open
lsof /var/log/app/debug.log
# If output: truncate instead of delete
truncate -s 0 /var/log/app/debug.log
```

**Mistake 4: Not redirecting stderr**
`find /` generates permission errors on inaccessible directories. Add `2>/dev/null` to clean output.

---

## Pro Tips

```bash
# Find and delete in parallel (faster for many files)
find /var/log -name "*.gz" -mtime +30 -print0 | xargs -0 rm -f

# Show total space that would be freed
find /var/log -name "*.gz" -mtime +30 -type f \
  -exec du -ch {} + | tail -1

# Schedule cleanup with cron
# /etc/cron.daily/log-cleanup
find /var/log/app -name "*.log.gz" -mtime +30 -delete
```

---

## Conclusion

`find /path -mtime +N -type f` finds files older than N days. Always preview with `-ls` or just the list before adding `-delete`. Combine `-mtime` with `-size` for targeted cleanup of old + large files. Use `truncate -s 0` instead of `rm` on files that are actively being written to.

---

*Related: [How to Delete Large Files Linux Safely](/blog/how-to-delete-large-files-linux-safely) — safe deletion workflows. [How to Find Large Files in Linux](/blog/find-large-files-linux-guide) — find by size instead of age.*
