---
title: "Read-only File System on Linux: ext4 Errors and the Fix"
date: "2026-11-13"
updated: "2026-11-13"
excerpt: "Linux says Read-only file system? Reproduced on kernel 7.0: why mount still shows rw, why remount,rw lies, what data was lost, and the fsck fix."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
lab: true
category: "linux"
---

Writes suddenly fail with `Read-only file system`. `touch` fails, logs stop growing, the database refuses to commit. Nobody remounted anything. The kernel did it, because ext4 hit an error and was configured to protect the filesystem by refusing further writes.

This post reproduces that on a throwaway ext4 image on a lab VM, then walks through how to confirm it, what `mount -o remount,rw` really does, what happened to data written just before the error, and the fix that worked.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, util-linux 2.41.3, e2fsprogs 1.47.2, Xen VM with 4 vCPU and 7.2 GiB RAM. The filesystem under test was a 256 MiB ext4 image on a loop device, mounted with `errors=remount-ro`. The error was injected with ext4's `trigger_fs_error` sysfs knob (root). No real disk or the VM's root filesystem was touched.

---

## TL;DR

```bash
# 1. Why read-only? The kernel log says it
journalctl -k -b --no-pager | grep -E "EXT4-fs error|Remounting filesystem read-only|I/O error"

# 2. On kernel 7.0 the mount options still say rw: look for emergency_ro instead
findmnt -O emergency_ro            # lists filesystems ext4 forced read-only
findmnt -no OPTIONS /data          # rw,relatime,errors=remount-ro,emergency_ro

# 3. Fix: unmount, check, mount again (root fs: boot from rescue media)
umount /data
e2fsck -f /dev/sdX1
mount /data
```

`mount -o remount,rw` does **not** fix an ext4 filesystem that remounted itself read-only after an error. In the lab it either failed outright or reported success while staying read-only (details below).

---

## Reproduce it safely

A loop-mounted image gives a real ext4 filesystem with nothing at stake:

```bash
truncate -s 256M disk.img
mkfs.ext4 -q -L labro disk.img
LOOP=$(sudo losetup --find --show disk.img)        # /dev/loop0
sudo mkdir -p /mnt/labro
sudo mount -o errors=remount-ro $LOOP /mnt/labro
```

```
TARGET     SOURCE     FSTYPE OPTIONS
/mnt/labro /dev/loop0 ext4   rw,relatime,errors=remount-ro
```

ext4 exposes a test hook at `/sys/fs/ext4/<dev>/trigger_fs_error`. Writing a message to it makes the kernel report a filesystem error exactly as if it had found corruption:

```bash
echo hello > /mnt/labro/a.txt                       # written 7 s before the error
echo "lab test" | sudo tee /sys/fs/ext4/loop0/trigger_fs_error
```

The kernel log:

```
Nov 13 00:29:05 damon kernel: EXT4-fs error (device loop0): trigger_test_error:130: comm tee: lab test
Nov 13 00:29:05 damon kernel: Aborting journal on device loop0-8.
Nov 13 00:29:05 damon kernel: EXT4-fs (loop0): Remounting filesystem read-only
```

Reading those lines:

- `EXT4-fs error (device loop0): <function>:<line>` is the error itself. On real systems the function name points at what failed, e.g. a bad directory entry or an inode checksum. It's usually preceded by block-layer `I/O error, dev sda, sector ...` lines if the disk is failing.
- `Aborting journal` means ext4 stopped the journal, so nothing in flight gets committed from this point on.
- `Remounting filesystem read-only` is the `errors=remount-ro` policy kicking in.

And from userspace:

```
$ touch /mnt/labro/b.txt
touch: cannot touch '/mnt/labro/b.txt': Read-only file system
$ echo more >> /mnt/labro/a.txt
bash: line 1: /mnt/labro/a.txt: Read-only file system
```

That's `EROFS`. Reads still worked: `cat a.txt` printed `hello` at this point. Hold on to that; it matters later.

---

## Lab finding 1: the mount still says `rw`

The usual advice is to check whether the filesystem is mounted `ro`. On kernel 7.0 that check finds nothing:

```
$ mount | grep labro
/dev/loop0 on /mnt/labro type ext4 (rw,relatime,errors=remount-ro,emergency_ro)

$ grep labro /proc/self/mountinfo
72 47 7:0 / /mnt/labro rw,relatime shared:415 - ext4 /dev/loop0 rw,errors=remount-ro,emergency_ro
```

Both the per-mount flags and the superblock flags say `rw`. The only sign is ext4's `emergency_ro` option at the end. So:

```
$ findmnt -O ro /mnt/labro; echo "exit=$?"
exit=1
$ awk '$4 ~ /(^|,)ro(,|$)/' /proc/mounts | grep -c labro
0
$ findmnt -O emergency_ro -no TARGET
/mnt/labro
```

A monitoring check or script that greps for `ro` in `/proc/mounts` would miss this filesystem entirely. Check for `emergency_ro`, or just test a write (`touch /path/.rwtest && rm /path/.rwtest`), which works regardless of how the kernel reports it.

The superblock also records the error, which survives a reboot:

```
$ sudo tune2fs -l /dev/loop0 | grep -E "Filesystem state|FS Error count|First error"
Filesystem state:         clean with errors
FS Error count:           1
First error time:         Fri Nov 13 00:29:05 2026
First error function:     trigger_test_error
First error line #:       130
First error err:          EFSCORRUPTED
```

The same counters are in `/sys/fs/ext4/loop0/errors_count` and `first_error_func`, readable without root.

---

## Lab finding 2: `remount,rw` doesn't bring it back

The most common suggestion online is `mount -o remount,rw`. On this VM:

```
$ sudo mount -o remount,rw /mnt/labro; echo "exit=$?"
mount: /mnt/labro: mount point not mounted or bad option.
       dmesg(1) may have more information after failed mount system call.
exit=32
```

```
Nov 13 00:29:14 damon kernel: ext4: Unknown parameter 'emergency_ro'
```

`mount` re-sends the existing options for a remount, including `emergency_ro`, which ext4 doesn't accept as a mount option. Telling util-linux to ignore the existing options gets past that, and the result looks like success:

```
$ sudo mount --options-mode ignore -o remount,rw /mnt/labro; echo "remount exit=$?"
remount exit=0
```

```
Nov 13 00:30:09 damon kernel: EXT4-fs (loop0): re-mounted df8c6710-8f8a-4fb5-8e94-2225f1972381.
```

But nothing changed:

```
$ findmnt -no OPTIONS /mnt/labro
rw,relatime,errors=remount-ro,emergency_ro
$ touch /mnt/labro/c.txt
touch: cannot touch '/mnt/labro/c.txt': Read-only file system
```

Exit code 0 and a "re-mounted" kernel message, yet still read-only. With an aborted journal, the filesystem has to be unmounted and checked. That's also the right call anyway: the error means ext4 saw something inconsistent, and writing more to it before a check risks making it worse.

---

## The fix: unmount, fsck, mount

```
$ sudo umount /mnt/labro
$ sudo e2fsck -f -y /dev/loop0
labro: recovering journal
e2fsck 1.47.2 (1-Jan-2025)
Pass 1: Checking inodes, blocks, and sizes
Pass 2: Checking directory structure
Pass 3: Checking directory connectivity
Pass 4: Checking reference counts
Pass 5: Checking group summary information
Free inodes count wrong (65524, counted=65523).
Fix? yes

Feature orphan_present is set but orphan file is clean.
Clear? yes


labro: ***** FILE SYSTEM WAS MODIFIED *****
labro: 13/65536 files (0.0% non-contiguous), 8300/65536 blocks
```

`e2fsck` exited with code **1** ("errors corrected"), which is a success. `0` means nothing to fix; `4` or higher means errors were left uncorrected and you need to look closer before mounting. After the check:

```
Filesystem state:         clean
```

and the mount came back as `rw,relatime,errors=remount-ro` with writes working.

On a real disk, before running `e2fsck`:

- Look for `I/O error` lines in the kernel log and run `smartctl -a /dev/sdX`. If the disk is failing, image it first (`ddrescue`); fsck on a dying disk can make recovery harder.
- Never run `e2fsck` on a mounted filesystem.
- For the root filesystem you can't unmount, boot a rescue/live system, or reboot and let the boot-time fsck run (on systemd, `fsck.mode=force` on the kernel command line forces it).

---

## Lab finding 3: what happened to recent writes

`cat a.txt` printed `hello` while the filesystem was read-only. After `e2fsck` and remounting:

```
$ ls -la /mnt/labro
-rw-rw-r-- 1 damon damon     0 Nov 13 00:28 a.txt
$ stat -c "%n %s" /mnt/labro/a.txt
/mnt/labro/a.txt 0
```

The file existed but was **empty**. The `hello` read earlier came from the page cache; the data block was never written, because ext4 delays allocating blocks for new data and the journal was aborted before it got there.

A second round tested this directly: one file written and `sync`ed, one written without sync, then the error injected straight away:

```bash
echo synced > /mnt/labro/synced.txt; sync /mnt/labro/synced.txt
echo unsynced > /mnt/labro/unsynced.txt
echo round2 | sudo tee /sys/fs/ext4/loop0/trigger_fs_error
```

After `e2fsck`:

```
synced.txt: 7 bytes: synced
stat: cannot stat '/mnt/labro/unsynced.txt': No such file or directory (os error 2)
```

The synced file survived. The unsynced one didn't exist at all: even its creation was never committed. (The `(os error 2)` suffix is because Ubuntu 26.04 ships the Rust uutils `stat`.) `a.txt` from the first round had been created about 7 seconds before the error, longer than ext4's default 5-second journal commit interval, so its directory entry made it to disk but its contents didn't.

The practical takeaway: what an application "wrote" in the seconds before an ext4 error may be gone, even if it read back fine while the filesystem was read-only. Applications that need durability (databases, queues) call `fsync`; for anything else, check recent files after recovery.

---

## Is your root filesystem set to go read-only?

The behaviour on error comes from the `errors=` mount option, or if that's absent, from the superblock default. On this VM's root filesystem:

```
$ findmnt -no OPTIONS /
rw,relatime
$ sudo tune2fs -l /dev/mapper/ubuntu--vg-ubuntu--lv | grep -E "Errors behavior|Filesystem state"
Filesystem state:         clean
Errors behavior:          Continue
```

`/etc/fstab` mounts it with `defaults`, no `errors=` option, and the superblock says `Continue`. So on this install, an ext4 error on `/` would be logged but would **not** make it read-only: the system keeps writing to a filesystem the kernel just flagged as inconsistent. Check your own servers rather than assuming:

| Setting | On error | Set with |
|---|---|---|
| `errors=continue` | Log and keep going | `tune2fs -e continue` or mount option |
| `errors=remount-ro` | Force read-only (`emergency_ro` on kernel 7.0) | `tune2fs -e remount-ro` or mount option |
| `errors=panic` | Kernel panic (useful with HA failover) | `tune2fs -e panic` or mount option |

Whichever you choose, alert on `EXT4-fs error` in the kernel log; the [Linux log analysis guide](/blog/linux-log-analysis-guide) has a one-liner that catches it along with OOM kills and I/O errors.

---

## Other causes of "Read-only file system"

Not every `EROFS` is an ext4 error. These weren't reproduced here, but each leaves a different trace:

| Cause | How to tell |
|---|---|
| Mounted `ro` on purpose (fstab, `mount -o ro`, live media) | `findmnt` shows `ro`, no kernel error |
| systemd `ProtectSystem=strict` / `ReadOnlyPaths=` | Only the service sees it; works from your shell. See [Permission denied on Linux](/blog/permission-denied-linux-fix-chmod-chown) |
| Container with a read-only root (`docker run --read-only`) | Only inside the container |
| Disk full | Different error: `No space left on device`. See [checking disk usage with du and df](/blog/check-disk-usage-linux-du-df) |

---

## FAQ

**How do I fix "Read-only file system" in Linux?**
Read the kernel log first. If ext4 remounted itself after an error, unmount the filesystem, run `e2fsck -f` on the device, and mount it again. For the root filesystem, do the check from rescue media or at boot.

**Why does mount show rw when the filesystem is read-only?**
On kernel 7.0, ext4 marks a filesystem it forced read-only with the `emergency_ro` option while the mount flags stay `rw`. Use `findmnt -O emergency_ro` or test a write.

**Can I just run mount -o remount,rw?**
Not after an ext4 error. In the lab it failed with `Unknown parameter 'emergency_ro'`, and with `--options-mode ignore` it returned 0 but the filesystem stayed read-only.

**Will I lose data when a filesystem goes read-only?**
Possibly the last few seconds of unsynced writes. In the lab, an unsynced file vanished and another was left empty, while a file that had been `sync`ed survived.

**Why can't I write when the disk has free space?**
`Read-only file system` is a mount state, not a space problem. A full disk gives `No space left on device` instead.
