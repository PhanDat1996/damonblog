---
title: "Check File Size in Linux: ls, stat, du and Why They Differ"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Check file size in Linux with ls -lh, stat and du, get exact bytes for scripts, and understand why ls and du report different sizes for the same file."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "linux"
---

You need the size of a file: to see if a log is out of control, to check an upload arrived complete, or to make a script alert above 500 MB. The quick answer:

```bash
ls -lh /var/log/nginx/error.log       # human-readable: 2.3G
stat -c %s /var/log/nginx/error.log   # exact bytes for scripts: 2466250752
du -h /var/log/nginx/error.log        # space it actually uses on disk
```

Usually all three agree. When they don't, it's telling you something about the file, and that's what most of this page is about.

---

## ls -lh: the quick look

```bash
ls -lh /var/log/nginx/
```

```
total 2.8G
-rw-r----- 1 www-data adm  451M Oct 28 09:15 access.log
-rw-r----- 1 www-data adm  2.3G Oct 28 09:15 error.log
-rw-r----- 1 www-data adm   89K Oct 27 23:59 error.log.1
```

The fifth column is the size. `-h` uses powers of 1024 (`K`, `M`, `G` here mean KiB, MiB, GiB). Add `--si` if you want powers of 1000, for example to compare with a cloud provider's GB figure.

Useful variants:

```bash
ls -lhS /var/log/nginx/     # sorted by size, largest first
ls -lhSr /var/log/nginx/    # smallest first
ls -l --block-size=M file   # always in MiB, handy for comparisons
```

The `total` line at the top is the disk space used by the listed files in blocks, not the sum of their sizes.

## stat: exact bytes and everything else

```bash
stat /var/log/nginx/error.log
```

```
  File: /var/log/nginx/error.log
  Size: 2466250752      Blocks: 4816896    IO Block: 4096   regular file
Device: 8,1     Inode: 1310782     Links: 1
Access: (0640/-rw-r-----)  Uid: (   33/www-data)   Gid: (    4/     adm)
Access: 2026-10-28 06:25:01.412311522 +0000
Modify: 2026-10-28 09:15:42.880117031 +0000
Change: 2026-10-28 09:15:42.880117031 +0000
 Birth: 2026-10-21 06:25:01.396002118 +0000
```

- `Size` is the file's length in bytes.
- `Blocks` is space allocated on disk, in **512-byte** units regardless of the filesystem block size. Here `4816896 × 512` equals `Size` exactly. When the two disagree by a lot, see the table below.
- `Links` is the number of hard links. Deleting one name of a file with `Links: 2` frees nothing.
- `Birth` (creation time) appears only with recent coreutils and filesystems that store it; older systems show `-`.

For scripts, ask for just the number:

```bash
stat -c %s file          # GNU/Linux
stat -f %z file          # macOS/BSD (different syntax)
```

## du: space used on disk

```bash
du -h /var/log/nginx/error.log
# 2.3G    /var/log/nginx/error.log

du -h --apparent-size /var/log/nginx/error.log
# 2.3G    /var/log/nginx/error.log
```

Plain `du` reports allocated blocks; `--apparent-size` reports the length, like `ls`. For a folder, `du -sh dir` adds up everything inside; see [Check Disk Usage in Linux](/blog/check-disk-usage-linux-du-df) for folder-level usage.

---

## Why ls and du show different sizes

`ls` answers "how long is this file?". `du` answers "how much disk does it use?". They differ in a few situations, and each one changes what you should do.

| Situation | `ls -l` | `du` | Example |
|---|---|---|---|
| Sparse file | Large | Small | VM disk images, `fallocate`/`truncate`-created files, database files |
| Tiny file | `12` bytes | `4.0K` | Every file uses at least one block |
| Compressed filesystem (Btrfs, ZFS) | Real length | Compressed size | Logs on a compressed dataset |
| Log truncated while a non-append writer keeps going | Old size | Small | See [Delete Large Files Safely](/blog/how-to-delete-large-files-linux-safely) |
| Preallocated file | Small | Larger | Some databases and downloaders reserve space ahead |

A sparse file is easy to create and inspect:

```bash
truncate -s 10G disk.img
ls -lh disk.img
# -rw-r--r-- 1 root root 10G Oct 28 10:02 disk.img
du -h disk.img
# 0       disk.img
```

Why it matters:

- **Freeing space:** deleting a "10 GB" sparse file may give back almost nothing. Trust `du` for "how much will I get back".
- **Copying:** `cp` handles sparse files by default on GNU coreutils, but `scp` and many upload tools write the full length. A 10 GB sparse image can become 10 GB of real data on the other side. `rsync --sparse` or `tar -S` preserve holes.
- **Quotas and billing** count allocated blocks, i.e. the `du` number.

---

## Byte counts in scripts

```bash
stat -c %s file                       # fastest, metadata only
wc -c < file                          # portable (POSIX), also fast for regular files
du -b file                            # GNU: apparent size in bytes
find file -printf '%s\n'              # GNU find
```

`wc -c < file` (with `<`) prints only the number. GNU `wc -c` gets the size of a regular file from metadata rather than reading it, so it's fast even on large files.

Alert when a log crosses a threshold:

```bash
#!/bin/bash
set -u
file=/var/log/app/debug.log
max=$((500 * 1024 * 1024))                    # 500 MiB

size=$(stat -c %s "$file" 2>/dev/null) || { echo "missing: $file"; exit 1; }
if (( size > max )); then
  echo "ALERT: $file is $(numfmt --to=iec "$size")"
fi
```

Measure growth rate:

```bash
a=$(stat -c %s app.log); sleep 60; b=$(stat -c %s app.log)
echo "$(numfmt --to=iec $((b - a))) per minute"
```

A negative number usually means the log was rotated or truncated during the minute.

Verify a transfer completed: compare `stat -c %s` on both sides. Equal sizes don't prove equal contents, so for anything important compare `sha256sum` too.

---

## FAQ

**How do I check file size in MB in Linux?**
`ls -l --block-size=M file` or `du -m file`. For a human-picked unit, `ls -lh` chooses K, M or G automatically.

**How do I check the size of a folder?**
`du -sh /path/to/folder`. `ls -l` on a directory shows the size of the directory entry itself (often 4096), not its contents.

**Why does ls show 4.0K for a directory?**
That's the space used by the directory's list of names, not the files inside. Use `du -sh` for the contents.

**How do I find all files over a certain size?**
Use `find /path -type f -size +100M`. Ready-made versions are in [Find Large Files on Linux](/blog/find-large-files-linux) and [Find Files by Name and Size](/blog/linux-find-file-by-name-and-size).
