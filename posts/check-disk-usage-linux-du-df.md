---
title: "Check Disk Usage in Linux: df, du and Usage by Folder"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Check disk usage in Linux with df and du: see how full each filesystem is, which folder is using the space, and why df and du report different numbers."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "linux"
---

A monitoring alert says `/` is at 92%, or a deploy fails with `No space left on device`. You need two answers fast: **which filesystem** is full, and **which folder** on it is using the space. `df` answers the first, `du` answers the second.

```bash
df -h                                          # how full is each filesystem?
du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -15   # biggest folders on /
```

Run the second command again on the biggest folder it shows (`/var`, then `/var/log`, and so on) until you reach the files. The rest of this page explains the flags, how to read the output, and what it means when the two tools disagree.

---

## df: how full is each filesystem?

`df` asks the kernel for each mounted filesystem's totals. It's instant, because it doesn't walk any files.

```bash
df -hT -x tmpfs -x devtmpfs -x squashfs
```

```
Filesystem     Type  Size  Used Avail Use% Mounted on
/dev/sda1      ext4   50G   43G  4.5G  91% /
/dev/sda15     vfat  105M  6.1M   99M   6% /boot/efi
/dev/sdb1      xfs   200G   12G  189G   6% /data
```

| Column | Meaning |
|---|---|
| `Size` | Total size of the filesystem |
| `Used` | Blocks allocated to files, directories and metadata |
| `Avail` | Space a **normal (non-root) user** can still write |
| `Use%` | `Used / (Used + Avail)`, rounded up |
| `Mounted on` | The directory the filesystem is attached to |

Useful variations:

```bash
df -h /var/log        # only the filesystem that holds this path
df -i                 # inodes instead of bytes (see below)
df -hT                # include the filesystem type
```

`df -h /some/path` is the quickest way to answer "which disk is this directory actually on?". Many "the disk is full but I have 180 GB free" tickets turn out to be a full `/` while the free space is on `/data`.

### Why Size minus Used is not Avail

On the `ext4` line above, `50G - 43G = 7G`, but `Avail` says `4.5G`. The missing ~2.5 GB is **reserved blocks**: ext2/3/4 keep 5% of the filesystem for root by default, so system daemons and root can still write when users have filled the disk. Reserved blocks are counted in neither `Used` nor `Avail`, which is also why `Use%` can reach 100% while root can still write a little.

```bash
tune2fs -l /dev/sda1 | grep -i "reserved block count"
# Reserved block count:     655360
```

XFS and Btrfs don't use this reservation, so on those `Size - Used` is close to `Avail`. Lowering the reservation on a large ext4 data volume is covered in [Disk Full on Linux](/blog/disk-full-linux-cleanup).

### Inodes: full with free space left

Every file uses one inode, and ext4 creates a fixed number of them when the filesystem is made. Millions of tiny files (session files, mail queues, cache entries) can use them all up while gigabytes remain free. New files then fail with `No space left on device` even though `df -h` looks fine.

```bash
df -i /
```

```
Filesystem      Inodes   IUsed IFree IUse% Mounted on
/dev/sda1      3276800 3276800     0  100% /
```

If `IUse%` is 100%, look for directories with the most files, not the biggest ones:

```bash
du --inodes -x / 2>/dev/null | sort -rn | head -15
```

`du --inodes` needs GNU coreutils 8.22 or newer (RHEL 7+, Ubuntu 16.04+). XFS allocates inodes dynamically, so inode exhaustion is rare there.

---

## du: disk usage by folder

`du` walks a directory tree and adds up the blocks each file uses. It's slower than `df` because it touches every file, but it tells you *where* the space is.

```bash
du -sh /var/log          # total for one folder
# 2.3G    /var/log

du -sh /var/log/*        # one line per item inside it
# 1.2G    /var/log/app
# 512M    /var/log/journal
# 412M    /var/log/nginx
# 89M     /var/log/syslog
```

| Flag | What it does |
|---|---|
| `-s` | Print only the total for each argument (it still walks everything underneath) |
| `-h` | Human-readable sizes (K, M, G) |
| `-x` | Stay on one filesystem; don't descend into other mounts |
| `-a` | Include individual files, not just directories |
| `-c` | Add a grand total line |
| `--max-depth=N` (`-d N`) | Show subtotals only N levels deep |
| `--apparent-size` | Report file length instead of blocks used (see [checking file size](/blog/linux-check-file-size-command)) |

### Sort folders by size

```bash
du -xh --max-depth=1 /var 2>/dev/null | sort -rh | head -15
```

```
38G     /var
31G     /var/log
4.2G    /var/lib
1.1G    /var/cache
512M    /var/tmp
```

Why each piece is there:

- `-x` keeps `du` on the filesystem you're investigating. Without it, `du /` also counts `/data`, NFS mounts and `/proc`, and the numbers no longer explain why `/` is full. It also avoids hanging on a dead network mount.
- `2>/dev/null` hides `Permission denied` noise. Run as root (`sudo`) if you need the real totals; folders you can't read are silently undercounted.
- `sort -rh` sorts human-readable sizes correctly. `sort -rn` doesn't understand units and would put `512M` above `1.2G`.
- The first line is the folder itself (the total). Each line already includes everything below it, so `/var` contains `/var/log`.

`--max-depth=1` is better than `du -sh /var/*` because the glob skips hidden directories like `/var/.cache` or `/root/.local`.

### The drill-down workflow

```bash
df -h                                                    # 1. / is 91% full
du -xh --max-depth=1 / 2>/dev/null | sort -rh | head     # 2. /var: 38G
du -xh --max-depth=1 /var 2>/dev/null | sort -rh | head  # 3. /var/log: 31G
du -xh --max-depth=1 /var/log 2>/dev/null | sort -rh | head  # 4. /var/log/app: 28G
ls -lhS /var/log/app | head                              # 5. the actual files
```

To jump straight to the large files instead of walking down level by level, use `find -size`, covered in [Find Large Files on Linux](/blog/find-large-files-linux).

### Compare a few folders at once

```bash
sudo du -shc /var/log /var/lib/docker /home /opt 2>/dev/null | sort -rh
# 52G     total
# 38G     /var/lib/docker
# 9.8G    /home
# 2.3G    /var/log
# 1.9G    /opt
```

For Docker, `docker system df` gives a more useful breakdown (images, containers, volumes, build cache) than `du` on `/var/lib/docker/overlay2`, whose numbers are hard to map back to images.

### ncdu: interactive browsing

When you expect to drill down several levels, `ncdu` scans once and lets you browse the result:

```bash
sudo apt install ncdu        # Debian/Ubuntu
sudo dnf install ncdu        # Fedora/RHEL (EPEL on RHEL)

sudo ncdu -x /
```

Arrow keys move, Enter opens a folder, `q` quits. `ncdu` lists items sorted by size and shows hidden folders. It can also delete with `d`, which asks for confirmation; on a production box it's safer to browse with `ncdu` and delete deliberately from the shell.

---

## When df and du disagree

You add up `du` and get 25 GB, but `df` says 40 GB is used. The usual causes, from most to least common:

**1. Deleted files that are still open.** Deleting a file removes its name, but the space is freed only when the last process closes it. A log deleted while the app is still writing to it disappears from `du` (no name to find) but still counts in `df`.

```bash
sudo lsof -nP +L1
```

```
COMMAND  PID USER   FD   TYPE DEVICE    SIZE/OFF NLINK    NODE NAME
java    2318 app    41w   REG    8,1 15032385536     0 1048602 /var/log/app/debug.log (deleted)
```

`+L1` lists open files with a link count below 1, meaning deleted. Restart the process, or empty the file through its descriptor (`41` above) without restarting:

```bash
sudo truncate -s 0 /proc/2318/fd/41
```

This throws away the content, which was already deleted anyway. How to avoid getting here is covered in [Delete Large Files Safely](/blog/how-to-delete-large-files-linux-safely).

**2. Files hidden under a mount point.** If files were written to `/data` before a disk was mounted on `/data`, they still use space on `/` but `du` can't see them. Check with a bind mount of the root filesystem:

```bash
sudo mkdir -p /mnt/rootfs && sudo mount --bind / /mnt/rootfs
sudo du -sh /mnt/rootfs/data
sudo umount /mnt/rootfs
```

**3. Reserved blocks and metadata.** `df` counts filesystem metadata and journal space in `Used`, and ext4 reserves 5% for root. A gap of a few percent is normal.

**4. Permissions.** `du` without root silently skips folders it can't read.

---

## FAQ

**What's the difference between df and du?**
`df` reports totals per filesystem, read from the filesystem's own counters. `du` walks files and adds up their sizes. Use `df` to find which filesystem is full and `du` to find which folder is responsible.

**How do I check the size of a folder in Linux?**
`du -sh /path/to/folder`. Add `--apparent-size` if you want the sum of file lengths instead of the disk blocks they use, for example before copying to another system.

**Why does du show a different size than ls?**
`ls -l` shows a file's length; `du` shows the blocks allocated on disk. Sparse files (VM images, some databases) can be much larger in `ls` than in `du`, and small files use at least one 4 KB block in `du`.

**Why is du so slow on large directories?**
It has to `stat` every file. On millions of files that takes minutes. Narrow the starting folder, use `-x`, or scan once with `ncdu` and browse the result.

---

## What to check next

1. `df -h`: which filesystem is full? `df -i`: is it inodes instead?
2. `du -xh --max-depth=1 <mount> | sort -rh`: drill down on that filesystem only.
3. `df` and `du` disagree? Run `lsof +L1` for deleted-but-open files.
4. Found the culprit? Clean up with the steps in [Disk Full on Linux](/blog/disk-full-linux-cleanup).

*Related: [Find Large Files on Linux](/blog/find-large-files-linux) to locate individual files by size. [Docker Log Rotation](/blog/docker-log-rotation) when `/var/lib/docker` is the folder at the top.*
