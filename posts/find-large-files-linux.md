---
title: "Find Large Files on Linux: find -size Commands That Work"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Find the largest files on a Linux server with find -size and a sorted top-20 list, without crossing into other mounts or tripping over /proc and spaces."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "linux"
---

You know the disk is filling up, and you suspect a few huge files rather than a folder full of small ones: a runaway log, a forgotten database dump, a VM image in someone's home directory. You want a list of the biggest **files**, sorted, with full paths.

```bash
sudo find / -xdev -type f -size +500M -printf '%s\t%p\n' 2>/dev/null \
  | sort -rn | head -20 | numfmt --field=1 --to=iec
```

```
22G     /var/log/app/debug.log
8.4G    /home/deploy/backup-2026-09-30.sql
4.1G    /var/lib/libvirt/images/test-vm.qcow2
1.2G    /opt/app/releases/2026.10.1/app.tar
612M    /var/cache/apt/archives/linux-firmware_20240318.git3b128b60-0ubuntu2_amd64.deb
```

That's the whole answer for most cases. The rest of this page explains each piece so you can adapt it. If you don't yet know which filesystem or folder is the problem, start with `df` and `du` in [Check Disk Usage in Linux](/blog/check-disk-usage-linux-du-df).

---

## How the command works

| Part | Why it's there |
|---|---|
| `-xdev` | Don't descend into other filesystems. Searching `/` otherwise also walks `/proc`, `/sys`, `/data`, NFS mounts and container overlays, which is slow and gives files that aren't on the full disk. |
| `-type f` | Regular files only, not directories or device files |
| `-size +500M` | Larger than 500 MiB. Filtering inside `find` is far faster than printing every file and sorting millions of lines. |
| `-printf '%s\t%p\n'` | Size in bytes, a tab, the full path (GNU find). One process, no `ls` per file, and paths with spaces stay intact. |
| `2>/dev/null` | Hides `Permission denied` noise. Use `sudo` so you don't miss files. |
| `sort -rn` | Largest first. Sort the raw byte counts, then convert. |
| `numfmt --to=iec` | Turns bytes into `22G`, `612M` (GNU coreutils). |

To search a different filesystem, pass its mount point: `find /data -xdev ...`. To search everything except pseudo-filesystems, list the real mounts:

```bash
findmnt -rn -t ext4,xfs,btrfs -o TARGET
```

---

## Size units and their rounding gotcha

| Suffix | Unit |
|---|---|
| `c` | bytes |
| `k` | KiB (1024 bytes) |
| `M` | MiB |
| `G` | GiB |
| (none) | 512-byte blocks, rarely what you want |

`+` means "greater than", `-` means "less than". `find` rounds each file's size **up** to the unit before comparing, which matters for `-`:

```bash
find . -size -1M     # only matches EMPTY files: anything with 1+ bytes rounds up to 1M
find . -size -1024k  # files under 1 MiB, which is what you meant
```

For `+`, rounding barely matters at the sizes you care about. Files between two sizes:

```bash
find /var -xdev -type f -size +100M -size -1G
```

More name-and-size combinations are in [Find Files by Name and Size](/blog/linux-find-file-by-name-and-size).

---

## Variations you'll actually use

### Biggest files in one folder (no recursion)

```bash
ls -lhS /var/log | head
```

`-S` sorts by size, largest first. Fast, but only one level deep.

### Biggest files in a tree, any size

When you don't know a good threshold, list everything and keep the top 20. Slower on big trees, but nothing slips under the cutoff:

```bash
sudo find /var -xdev -type f -printf '%s\t%p\n' 2>/dev/null | sort -rn | head -20 | numfmt --field=1 --to=iec
```

### Large files that changed recently

```bash
sudo find / -xdev -type f -size +100M -mmin -60 -printf '%TY-%Tm-%Td %TH:%TM\t%s\t%p\n' 2>/dev/null
```

Large and modified in the last hour: almost always the file that's growing right now. `-mtime -1` gives the last 24 hours. Linux doesn't reliably expose creation time through `find`, so "recent" means recently **modified**.

### Large files nobody has touched in months

```bash
sudo find /home /opt -xdev -type f -size +100M -mtime +180 -printf '%TY-%Tm-%Td\t%s\t%p\n' 2>/dev/null | sort -k2 -rn
```

Good cleanup candidates for a storage review. Use `-mtime` rather than `-atime`: most systems mount with `relatime`, so access times are only roughly updated. Details on age matching are in [Find Files Older Than X Days](/blog/linux-find-files-older-than-x-days).

### Large log files, including rotated ones

```bash
sudo find /var/log -type f \( -name '*.log' -o -name '*.log.*' -o -name '*.gz' \) -size +50M -exec ls -lh {} +
```

Use `-exec ... {} +` rather than `\;`: it passes many files to one `ls` instead of starting one `ls` per file. The parentheses group the `-o` alternatives so `-size` and `-type` apply to all of them.

### Is the file still growing?

```bash
watch -n 5 'ls -l /var/log/app/debug.log'
```

If the size keeps increasing, deleting it will not free the space while the writer has it open. See the next section.

---

## Why the file size you see may not be the space used

`find -printf '%s'` and `ls -l` show a file's **length**. The space it actually takes on disk can differ:

- **Sparse files** (VM images, some database files) can report a length of 100 GB while using 3 GB of blocks.
- **Hard links** point to the same data; deleting one name frees nothing.

To print allocated space instead, use `%b` (512-byte blocks):

```bash
sudo find / -xdev -type f -size +1G -printf '%s\t%b\t%p\n' 2>/dev/null \
  | awk -F'\t' '{printf "%s\tlength=%.1fG\tondisk=%.1fG\n", $3, $1/2^30, $2*512/2^30}'
```

If the two numbers differ a lot, `du` is the right tool for "how much will I get back". More in [Check File Size in Linux](/blog/linux-check-file-size-command).

Also: a file that's already deleted but still open won't show up in `find` at all. If `df` says the disk is full and `find` can't account for it, run `sudo lsof -nP +L1`. That case is covered in [Disk Full on Linux](/blog/disk-full-linux-cleanup).

---

## Before you delete what you found

- Check whether a process has it open: `sudo lsof /path/to/file`. For live logs, `truncate -s 0` frees the space; `rm` doesn't.
- Check whether it's a hard link: `stat -c '%h %n' file`. A count above 1 means other names point to the same data.
- If you're deleting by pattern, run the `find` without `-delete` first and read the list.

The safe way to remove large files and huge directories is in [Delete Large Files Safely](/blog/how-to-delete-large-files-linux-safely).

---

## FAQ

**How do I find the largest files in a directory?**
For one level, `ls -lhS /path | head`. For the whole tree, `find /path -xdev -type f -printf '%s\t%p\n' | sort -rn | head -20`.

**How do I find files larger than 1GB in Linux?**
`sudo find / -xdev -type f -size +1G -exec ls -lh {} +`. Drop `-xdev` only if you really want to include other mounted filesystems.

**Why does find -size -1M return only empty files?**
`find` rounds sizes up to the unit before comparing, so any non-empty file counts as at least 1M. Use `-size -1024k` or a byte count like `-size -1048576c`.

**Should I use find or du to find large files?**
`find` for individual files, `du` for folders. A folder with a million 10 KB files won't show up in `find -size +100M` but will top the `du` list.

*Related: [Linux Sort Command Examples](/blog/linux-sort-command-examples) for more ways to sort the output.*
