---
title: "Check Disk Usage in Linux: df, du, Large Files and Cleanup"
date: "2026-04-22"
updated: "2026-11-02"
excerpt: "Check disk usage in Linux with df and du, find large files, check file size, and free space safely when the disk is full: rm vs truncate, logs, Docker."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "linux"
---

A monitoring alert says `/` is at 92%, or a deploy fails with `No space left on device`. You need two answers fast: **which filesystem** is full, and **what** on it is using the space. `df` answers the first, `du` and `find` answer the second. Then you need to free the space without taking a service down.

```bash
df -h  &&  df -i                               # which filesystem? bytes or inodes?
du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -15   # biggest folders on /
sudo find / -xdev -type f -size +500M -printf '%s\t%p\n' 2>/dev/null \
  | sort -rn | head -20 | numfmt --field=1 --to=iec     # biggest files on /
sudo lsof -nP +L1                              # deleted files still holding space
```

Repeat the `du` line on the biggest folder it shows until you reach the files. **Never `rm` a log file a process is still writing to**; empty it with `truncate -s 0` instead.

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

`df -h /some/path` is the quickest way to answer "which disk is this directory actually on?". Many "the disk is full but I have 180 GB free" tickets turn out to be a full `/` while the free space is on `/data`. Write down the mount point: everything you delete must be **on that filesystem**; freeing space on `/data` does nothing for `/`.

### Why Size minus Used is not Avail

On the `ext4` line above, `50G - 43G = 7G`, but `Avail` says `4.5G`. The missing ~2.5 GB is **reserved blocks**: ext2/3/4 keep 5% of the filesystem for root by default, so system daemons and root can still write when users have filled the disk. Reserved blocks are counted in neither `Used` nor `Avail`, which is also why `Use%` can reach 100% while root can still write a little.

```bash
tune2fs -l /dev/sda1 | grep -i "reserved block count"
# Reserved block count:     655360
```

XFS and Btrfs don't use this reservation, so on those `Size - Used` is close to `Avail`. Lowering the reservation in an emergency is covered under *Disk full: free space fast* below.

### Inodes: full with free space left

Every file uses one inode, and ext4 creates a fixed number of them when the filesystem is made. Millions of tiny files (session files, mail queues, cache entries) can use them all up while gigabytes remain free. New files then fail with `No space left on device` even though `df -h` looks fine.

```bash
df -i /
```

```
Filesystem      Inodes   IUsed IFree IUse% Mounted on
/dev/sda1      3276800 3276800     0  100% /
```

If `IUse%` is 100%, deleting one big file won't help; you need to delete many small ones. Look for directories with the most files, not the biggest ones:

```bash
sudo du --inodes -x / 2>/dev/null | sort -rn | head -15
```

Typical culprits: PHP session folders (`/var/lib/php/sessions`), mail queues (`/var/spool/postfix`), application cache folders, and build artifacts in CI runners. `du --inodes` needs GNU coreutils 8.22 or newer (RHEL 7+, Ubuntu 16.04+). XFS allocates inodes dynamically, so inode exhaustion is rare there.

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
| `--apparent-size` | Report file length instead of blocks used (see *Check file size* below) |

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

To jump straight to the large files instead of walking down level by level, use `find -size` (next section).

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

## Find large files

When you suspect a few huge files rather than a folder full of small ones (a runaway log, a forgotten database dump, a VM image in someone's home directory), list the biggest **files**, sorted, with full paths:

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

### Size units and their rounding gotcha

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
find /var -xdev -type f -size +100M -size -1G    # files between two sizes
```

More name-and-size combinations are in [Find Files by Name and Size](/blog/linux-find-file-by-name-and-size).

### Variations you'll actually use

```bash
# Biggest files in one folder, no recursion (-S sorts by size)
ls -lhS /var/log | head

# Biggest files in a tree, any size: slower, but nothing slips under a cutoff
sudo find /var -xdev -type f -printf '%s\t%p\n' 2>/dev/null | sort -rn | head -20 | numfmt --field=1 --to=iec

# Large and modified in the last hour: almost always the file growing right now
sudo find / -xdev -type f -size +100M -mmin -60 -printf '%TY-%Tm-%Td %TH:%TM\t%s\t%p\n' 2>/dev/null

# Large files nobody has touched in months: storage-review candidates
sudo find /home /opt -xdev -type f -size +100M -mtime +180 -printf '%TY-%Tm-%Td\t%s\t%p\n' 2>/dev/null | sort -k2 -rn

# Large log files, including rotated ones
sudo find /var/log -type f \( -name '*.log' -o -name '*.log.*' -o -name '*.gz' \) -size +50M -exec ls -lh {} +

# Is the file still growing?
watch -n 5 'ls -l /var/log/app/debug.log'
```

Notes on those:

- `-mtime -1` gives the last 24 hours. Linux doesn't reliably expose creation time through `find`, so "recent" means recently **modified**.
- Use `-mtime` rather than `-atime`: most systems mount with `relatime`, so access times are only roughly updated. Details on age matching are in [Find Files Older Than X Days](/blog/linux-find-file-by-name-and-size).
- Use `-exec ... {} +` rather than `\;`: it passes many files to one `ls` instead of starting one `ls` per file. The parentheses group the `-o` alternatives so `-size` and `-type` apply to all of them.
- A file that keeps growing won't free space when deleted while the writer has it open. See *Delete large files safely* below.

`find` is for individual files, `du` for folders. A folder with a million 10 KB files won't show up in `find -size +100M` but will top the `du` list.

---

## Check file size: ls vs du vs stat

Sometimes you just need the size of one file: to see if a log is out of control, to check an upload arrived complete, or to make a script alert above 500 MB.

```bash
ls -lh /var/log/nginx/error.log       # human-readable: 2.3G
stat -c %s /var/log/nginx/error.log   # exact bytes for scripts: 2466250752
du -h /var/log/nginx/error.log        # space it actually uses on disk
```

Usually all three agree. When they don't, it's telling you something about the file.

### ls -lh: the quick look

```bash
ls -lh /var/log/nginx/
```

```
total 2.8G
-rw-r----- 1 www-data adm  451M Oct 28 09:15 access.log
-rw-r----- 1 www-data adm  2.3G Oct 28 09:15 error.log
-rw-r----- 1 www-data adm   89K Oct 27 23:59 error.log.1
```

The fifth column is the size. `-h` uses powers of 1024 (`K`, `M`, `G` here mean KiB, MiB, GiB). Add `--si` if you want powers of 1000, for example to compare with a cloud provider's GB figure. `ls -lhSr` sorts smallest first; `ls -l --block-size=M file` always prints MiB, handy for comparisons. The `total` line at the top is the disk space used by the listed files in blocks, not the sum of their sizes.

### stat: exact bytes and everything else

```bash
stat /var/log/nginx/error.log
```

```
  File: /var/log/nginx/error.log
  Size: 2466250752      Blocks: 4816896    IO Block: 4096   regular file
Device: 8,1     Inode: 1310782     Links: 1
...
 Birth: 2026-10-21 06:25:01.396002118 +0000
```

- `Size` is the file's length in bytes.
- `Blocks` is space allocated on disk, in **512-byte** units regardless of the filesystem block size. Here `4816896 × 512` equals `Size` exactly. When the two disagree by a lot, see the table below.
- `Links` is the number of hard links. Deleting one name of a file with `Links: 2` frees nothing.
- `Birth` (creation time) appears only with recent coreutils and filesystems that store it; older systems show `-`.

### du: space used on disk

Plain `du -h file` reports allocated blocks; `du -h --apparent-size file` reports the length, like `ls`.

### Why ls and du show different sizes

`ls` answers "how long is this file?". `du` answers "how much disk does it use?". They differ in a few situations, and each one changes what you should do.

| Situation | `ls -l` | `du` | Example |
|---|---|---|---|
| Sparse file | Large | Small | VM disk images, `fallocate`/`truncate`-created files, database files |
| Tiny file | `12` bytes | `4.0K` | Every file uses at least one block |
| Compressed filesystem (Btrfs, ZFS) | Real length | Compressed size | Logs on a compressed dataset |
| Log truncated while a non-append writer keeps going | Old size | Small | See *The O_APPEND gotcha* below |
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

### Byte counts in scripts

```bash
stat -c %s file                       # fastest, metadata only (GNU/Linux)
stat -f %z file                       # macOS/BSD (different syntax)
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

To verify a transfer completed, compare `stat -c %s` on both sides. Equal sizes don't prove equal contents, so for anything important compare `sha256sum` too.

---

## When df and du disagree

You add up `du` and get 25 GB, but `df` says 40 GB is used. Or you deleted a 20 GB log and `df` still says 100%. The usual causes, from most to least common:

**1. Deleted files that are still open.** Deleting a file removes its name, but the space is freed only when the last process closes it. A log deleted while the app is still writing to it disappears from `du` and `find` (no name to find) but still counts in `df`.

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

This throws away the content, which was already deleted anyway. For NGINX specifically, `sudo nginx -s reopen` makes it close and reopen its log files, which releases the deleted one without dropping connections.

**Deleted the wrong file?** As long as a process still has it open, you can copy it back out:

```bash
sudo cp /proc/2318/fd/41 /var/log/app/debug.log.recovered
```

Once the last process closes it, the data is gone. There's no general undelete on ext4 or XFS; backups are the recovery plan.

**2. Files hidden under a mount point.** If files were written to `/data` before a disk was mounted on `/data`, they still use space on `/` but `du` can't see them. Check with a bind mount of the root filesystem:

```bash
sudo mkdir -p /mnt/rootfs && sudo mount --bind / /mnt/rootfs
sudo du -sh /mnt/rootfs/data
sudo umount /mnt/rootfs
```

**3. Reserved blocks and metadata.** `df` counts filesystem metadata and journal space in `Used`, and ext4 reserves 5% for root. A gap of a few percent is normal.

**4. Permissions.** `du` without root silently skips folders it can't read.

---

## Disk full: free space fast

The alert fires at 3 a.m.: `/` is at 100%. The database can't write its WAL, NGINX logs `No space left on device`, and SSH logins feel sluggish. On a full disk, the order matters as much as what you delete: confirm what's full (`df -h`, `df -i`), get breathing room, check `lsof +L1`, then drill down to the culprit.

### Get breathing room safely

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

**ext4 reserved blocks (emergency only).** When a root-owned service is the one failing, you can temporarily lower the 5% root reservation:

```bash
sudo tune2fs -m 1 /dev/sda1      # reserve 1% instead of 5%, takes effect immediately
```

On a 50 GB disk this frees about 2 GB for normal users. Put it back (`tune2fs -m 5`) once the disk is cleaned up; the reservation exists so root can still log in and fix things when users fill the disk. On large data-only volumes, 1% is a reasonable permanent setting. This doesn't apply to XFS or Btrfs.

### A huge application log

```bash
sudo lsof /var/log/app/debug.log      # is something writing to it?
```

If a process has it open, **empty it in place** with `truncate -s 0` instead of deleting. The reasoning and the gotchas are in *Delete large files safely* below.

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

Don't `rm` files under `/var/lib/docker` by hand; Docker's metadata will no longer match the disk. If the space is in `/var/lib/docker/containers/*/*-json.log`, a container is logging without rotation; fix it with [Docker Log Rotation](/blog/docker-log-rotation).

### Core dumps

```bash
sudo find / -xdev -type f \( -name core -o -name 'core.[0-9]*' \) -printf '%s\t%p\n' 2>/dev/null | sort -rn | head
coredumpctl list     # systemd-coredump keeps them in /var/lib/systemd/coredump
```

The parentheses matter: without them, `-type f` only applies to the second `-name`. Read the list before adding `-delete`; some projects have source files or directories called `core`.

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

---

## Delete large files safely: rm vs truncate

You run `rm` on the 20 GB log, then `df -h`. Still 98%. Or worse: you run `rm -rf` on a path built from a variable, and the variable was empty. Deleting so the space actually comes back, without removing the wrong thing, takes about three extra checks.

```bash
sudo lsof /var/log/app/debug.log          # is a process writing to it?

# Something has it open -> empty it in place, don't rm
sudo truncate -s 0 /var/log/app/debug.log

# Nothing has it open -> rm is fine
sudo rm /var/log/app/debug.log

# Already rm'd and df didn't move -> lsof +L1 (see When df and du disagree)
```

### Why rm doesn't always free space

A file on Linux is an inode (the data and metadata) plus one or more names pointing to it. `rm` removes a **name**. The kernel frees the blocks only when:

1. no names point to the inode anymore, **and**
2. no process has it open.

```
 before rm                       after rm, java still has it open

 /var/log/app/debug.log ─┐       (no name)                 ┐
                         ├─► inode 1048602 (20 GB)          ├─► inode 1048602 (20 GB)
 java fd 41 ─────────────┘       java fd 41 ───────────────┘    still allocated
```

So `rm` on a log that a service is writing to removes it from `ls` and `du`, but `df` doesn't change, and the service keeps filling a file you can no longer see.

### Check before you delete

```bash
sudo lsof /var/log/app/debug.log
```

```
COMMAND  PID USER   FD   TYPE DEVICE    SIZE/OFF    NODE NAME
java    2318 app    41w   REG    8,1 21474836480 1048602 /var/log/app/debug.log
```

- **No output:** nothing has it open. `rm` frees the space right away.
- **A process is listed** (here `java`, fd `41`, opened for writing `w`): don't `rm` it. Empty it instead.

Two more quick checks:

```bash
stat -c '%h links, %s bytes: %n' /var/log/app/debug.log    # links > 1 = hard links elsewhere
ls -l /var/log/app.log                                     # is it a symlink?
```

If the link count is above 1, deleting this name frees nothing until the other names are gone too. If it's a symlink, `rm` removes the link, not the target.

### truncate vs `: >` vs rm

| Command | What happens | Use when |
|---|---|---|
| `rm file` | Removes the name. Space freed only when nothing has it open. | File is closed, or you're also restarting the writer |
| `truncate -s 0 file` | Same inode, length set to 0, blocks freed immediately | A process is writing to it and you can't restart |
| `: > file` | Same as truncate, using shell redirection | No `truncate` binary, or in a script |
| `cat /dev/null > file` | Same effect, an extra process | Works anywhere; no advantage over `: >` |

Truncating keeps the same inode, so the process keeps writing to the same (now empty) file and the space comes back immediately. It also throws away the content. If you might need it for an incident, keep the tail first:

```bash
sudo tail -c 1G /var/log/app/debug.log | gzip > /data/debug.log.tail.gz
sudo truncate -s 0 /var/log/app/debug.log
```

Note `sudo : > file` doesn't work, because the redirection runs in your unprivileged shell. Use `sudo truncate -s 0 file` or `sudo sh -c ': > file'`.

### The O_APPEND gotcha

After truncating, run `ls -l` and `du -h` on the file. Usually both show a small, growing file. But if the process opened the file **without** `O_APPEND`, it keeps writing at its old offset, say 21 GB in. The file then reports a length of 21 GB again (`ls -l`), while `du` shows only a few KB: it's now a sparse file, and the space really is free.

Most loggers (syslog, NGINX, Java's FileHandler, `>>` in shell scripts) use append mode. The effect is cosmetic for disk space, but tools that read the file from the start see a long run of zero bytes. Restarting the process or having it reopen its logs is the clean fix.

### Deleting many files: dry-run first, always

Bulk deletes are where real damage happens. Run the exact `find` you plan to use **without** `-delete` first, check the count and a sample, then add `-delete` as the last change:

```bash
# 1. Dry run: what would be deleted, and how much space?
find /var/log/app -type f -name '*.log.gz' -mtime +14 -print | head -20
find /var/log/app -type f -name '*.log.gz' -mtime +14 -printf '%s\n' | awk '{s+=$1} END {printf "%d files, %.1f GiB\n", NR, s/2^30}'

# 2. Same command, -delete at the end
find /var/log/app -type f -name '*.log.gz' -mtime +14 -delete
```

**`-delete` must come last.** `find` evaluates expressions left to right, and `-delete` is an action that runs on everything that reached it:

```bash
find /var/log/app -delete -name '*.gz'    # WRONG: deletes everything under /var/log/app
find /var/log/app -name '*.gz' -delete    # right
```

GNU find warns about some of these mistakes, but not all. Also note `-delete` implies `-depth`, so it can't be combined with `-prune`. Age matching (`-mtime +14` really means "at least 15 days") is explained in [Find Files Older Than X Days](/blog/linux-find-file-by-name-and-size).

### Directories with millions of files

`rm -rf dir` works, but `rm -rf dir/*` fails with `Argument list too long` because the shell expands the glob first. `find` avoids that and lets you limit I/O impact on a busy server:

```bash
sudo ionice -c3 nice -n19 find /var/lib/php/sessions -type f -mmin +1440 -delete
```

`ionice -c3` (idle class) only takes effect with the BFQ or CFQ I/O schedulers; on `mq-deadline` or `none` it does nothing, and `nice` alone won't stop disk contention. If deletion is hurting latency, delete in smaller batches during a quiet period.

### rm habits that prevent disasters

```bash
rm -rf -- "${BUILD_DIR:?BUILD_DIR is empty}/"     # aborts if the variable is unset or empty
```

- **Quote and guard variables.** `rm -rf $DIR/*` with an empty `$DIR` becomes `rm -rf /*`. `${VAR:?}` makes the shell refuse to run it.
- **`set -u`** in scripts makes unset variables an error.
- **`--`** stops filenames that start with `-` being read as options.
- **`rm -I`** prompts once before removing more than three files or recursing; less annoying than `-i`, still a safety net.
- **`ls` the glob first.** `ls -d /var/log/app/*.log.*` shows exactly what `rm` will receive.
- **GNU `rm` refuses `rm -rf /`** by default (`--preserve-root`), but that doesn't protect `/*`, `/etc`, or anything else.

---

## Stop it from happening again

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

## FAQ

**What's the difference between df and du?**
`df` reports totals per filesystem, read from the filesystem's own counters. `du` walks files and adds up their sizes. Use `df` to find which filesystem is full and `du` to find which folder is responsible.

**How do I check the size of a folder in Linux?**
`du -sh /path/to/folder`. `ls -l` on a directory shows 4.0K or so: that's the directory's list of names, not the files inside.

**How do I check file size in MB in Linux?**
`ls -l --block-size=M file` or `du -m file`. For a human-picked unit, `ls -lh` chooses K, M or G automatically.

**How do I find files larger than 1GB in Linux?**
`sudo find / -xdev -type f -size +1G -exec ls -lh {} +`. Drop `-xdev` only if you really want to include other mounted filesystems.

**Why is du so slow on large directories?**
It has to `stat` every file. On millions of files that takes minutes. Narrow the starting folder, use `-x`, or scan once with `ncdu` and browse the result.

---

## Quick checklist

1. `df -h` and `df -i`: which filesystem, bytes or inodes?
2. Free safe space first: journal vacuum, package cache.
3. `lsof +L1`: deleted files still held open? Restart or truncate via `/proc/<pid>/fd/<n>`.
4. `du -xh --max-depth=1 <mount> | sort -rh` and `find -xdev -size +500M` to the culprit.
5. `lsof <file>` before deleting: truncate live logs, don't `rm` them. Check hard links and symlinks.
6. Preview every `find -delete` and `prune` before running it.
7. Add log rotation, journal limits and an 85% alert.

*Related: [Linux Sort Command Examples](/blog/linux-find-file-by-name-and-size) for more ways to sort the output. [Linux Log Analysis Guide](/blog/linux-log-analysis-guide) for working out why a log suddenly grew. [Check Disk I/O with iostat](/blog/linux-performance-troubleshooting-guide) if the disk is slow rather than full.*
