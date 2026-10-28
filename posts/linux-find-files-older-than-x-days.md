---
title: "Find Files Older Than X Days in Linux (find -mtime)"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Find files older than X days with find -mtime, why +30 really means 31 days, exact date ranges with -newermt, and a safe dry-run before -delete."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "linux"
---

You want to clean up rotated logs older than 30 days, or list backups nobody has touched in six months. The command is short:

```bash
find /var/log/app -type f -name '*.gz' -mtime +30
```

But `-mtime +30` doesn't mean what most people think, and a cleanup job built on a wrong assumption either deletes too much or never deletes anything. Here's how the age tests really work, then a safe delete workflow.

---

## How -mtime counts days

`find` takes the file's age, divides by 24 hours, and **throws away the fraction**. Then it compares that whole number:

| Expression | Matches files whose age is | In plain terms |
|---|---|---|
| `-mtime +30` | 31 days or more | "more than 30 full days" |
| `-mtime 30` | 30 days to just under 31 | exactly 30 full days |
| `-mtime -30` | less than 30 days | "within the last 30 days" |
| `-mtime 0` | less than 24 hours | modified in the last day |
| `-mtime -1` | less than 24 hours | same as `-mtime 0` |
| `-mtime +0` | 24 hours or more | older than one day |

```
age in days:   0 ... 29.9 | 30.0 ... 30.9 | 31.0 ...
-mtime -30     ███████████|               |
-mtime 30                 |███████████████|
-mtime +30                |               |█████████
```

So a file that is 30 days and 20 hours old is **not** matched by `-mtime +30`. For a retention policy of "keep 30 days", `-mtime +29` is often closer to what you mean. Ages are measured from the moment you run `find`, not from midnight; add `-daystart` to measure from the start of today instead.

### Minutes, and exact dates

```bash
find /tmp -type f -mmin +120           # older than 120 minutes
find /var/log -type f -mmin -15        # modified in the last 15 minutes
```

`-mmin` uses the same rounding logic, just with minutes, so it's precise enough for most jobs.

For a calendar range, `-newermt` (GNU find) is clearer than doing day arithmetic:

```bash
# modified on or after Oct 1 and before Oct 15
find /srv/uploads -type f -newermt '2026-10-01' ! -newermt '2026-10-15'

# older than a specific timestamp
find /var/backups -type f ! -newermt '2026-07-01 00:00'
```

`-newermt` accepts anything `date -d` understands, including `'7 days ago'`.

---

## mtime, atime, ctime: which one?

| Test | Timestamp | Changes when | Use it for |
|---|---|---|---|
| `-mtime` / `-mmin` | Modification | File content is written | Almost everything: logs, backups, uploads |
| `-atime` / `-amin` | Access | File is read | Rarely reliable, see below |
| `-ctime` / `-cmin` | Change (inode) | Content **or** permissions, owner, rename | Auditing what changed recently |

`-atime` is tempting for "files nobody uses", but most Linux systems mount filesystems with `relatime`, which updates access time only if it's older than the modification time or more than 24 hours old. Some are mounted `noatime` and never update it. Treat `-atime` results as a hint, not proof.

`ctime` is **not** creation time. Linux doesn't expose creation (birth) time through `find`'s classic tests; `stat` shows it as `Birth` on newer systems.

**Timestamps can lie.** `cp -p`, `rsync -a`, `tar x` and `unzip` keep the original modification times, so a backup restored today can look two years old. Check with `stat` before relying on age for something important.

---

## Combining age with other tests

```bash
find /var/log -type f -name '*.log' -mtime +7 -size +100M     # old AND big
find /home -type f -user olduser -mtime +180                  # stale files of one user
find /tmp -type f -empty -mtime +7                            # old empty files
find /data/exports -mindepth 1 -maxdepth 1 -type d -mtime +90 # old top-level folders only
```

Note that a **directory's** mtime changes when entries are added or removed inside it, not when files inside it are modified. An old-looking directory can contain fresh files.

---

## Safe delete workflow

Every age-based delete should be run as a dry run first, with the exact same expression.

```bash
# 1. Dry run: list and count
find /var/log/app -type f -name '*.log.gz' -mtime +30 -printf '%TY-%Tm-%Td  %10s  %p\n' | sort | head -20
find /var/log/app -type f -name '*.log.gz' -mtime +30 -printf '%s\n' \
  | awk '{n++; s+=$1} END {printf "%d files, %.1f GiB\n", n, s/2^30}'

# 2. Same expression, -delete appended at the end
find /var/log/app -type f -name '*.log.gz' -mtime +30 -delete
```

Rules that keep this safe:

- **`-delete` goes last.** find evaluates left to right; `find /var/log/app -delete -mtime +30` deletes everything under `/var/log/app` before the age test runs.
- **Keep `-type f`** unless you mean to remove folders. With it, folders are left alone; without it, `-delete` also removes empty directories that match.
- **Use an absolute path** in scripts and cron jobs. A relative path plus an unexpected working directory is how the wrong tree gets cleaned.
- **Don't delete live logs.** A `*.log` older than 30 days is probably not being written, but check with `lsof` if unsure; for files a process holds open, see [Delete Large Files Safely](/blog/how-to-delete-large-files-linux-safely).

`-delete` is faster than `-exec rm {} +` or `xargs rm` because find removes files itself without starting `rm` processes. If you need `rm` (for example to log each deletion), use `-print0 | xargs -0 rm -v --`.

### Removing empty folders afterward

```bash
find /srv/uploads -mindepth 1 -type d -empty -print     # dry run
find /srv/uploads -mindepth 1 -type d -empty -delete
```

`-mindepth 1` protects the top folder itself.

### Compress instead of delete

```bash
find /var/log/app -type f -name '*.log' -mtime +7 -print                       # dry run
find /var/log/app -type f -name '*.log' -mtime +7 -exec gzip {} +
```

`gzip` skips names already ending in `.gz`, and `-name '*.log'` excludes them anyway.

---

## Running it on a schedule

A daily cleanup in cron:

```bash
# /etc/cron.d/app-log-cleanup
30 3 * * * root /usr/bin/find /var/log/app -type f -name '*.log.gz' -mtime +30 -delete
```

Before adding your own cron jobs, check whether a built-in tool already does it:

- **logrotate** handles rotation and retention of log files (`rotate 30` + `daily`).
- **systemd-tmpfiles** cleans `/tmp`, `/var/tmp` and folders you configure by age, e.g. `d /var/cache/myapp 0755 app app 14d` in `/etc/tmpfiles.d/myapp.conf`.

Both are less likely to surprise you than a hand-written `find -delete`.

If you're doing this because the disk is already full, start with [Disk Full on Linux](/blog/disk-full-linux-cleanup) instead; age-based cleanup is rarely the fastest way back.

---

## FAQ

**How do I find files older than 7 days in Linux?**
`find /path -type f -mtime +7`. Strictly, that matches files 8 or more full days old; use `-mtime +6` or `-mmin +10080` if you need "older than 7 × 24 hours".

**How do I find files modified in the last 24 hours?**
`find /path -type f -mtime -1` (or `-mtime 0`). For the last hour, `-mmin -60`.

**How do I find files between two dates?**
`find /path -type f -newermt '2026-10-01' ! -newermt '2026-10-15'` with GNU find.

**Does find -mtime use creation date?**
No. It uses modification time. Linux `find` has no portable creation-time test, and `ctime` means inode change time.

*Related: [Find Files by Name and Size](/blog/linux-find-file-by-name-and-size) for name patterns and `-o` grouping. [Find Large Files on Linux](/blog/find-large-files-linux) to filter by size instead of age.*
