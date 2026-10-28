---
title: "Delete Large Files in Linux Safely: rm vs truncate"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Deleted a huge file and df didn't change? When to use rm, truncate or : >, how to free space held by open files, and how to bulk-delete with a dry run."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "linux"
---

You found the 20 GB log that's filling the disk. You run `rm`, then `df -h`. Still 98%. Or worse: you run `rm -rf` on a path built from a variable, and the variable was empty.

Deleting a file on Linux is easy. Deleting it so the space actually comes back, without taking a service down or removing the wrong thing, takes about three extra checks. This page covers them.

---

## TL;DR

```bash
sudo lsof /var/log/app/debug.log          # is a process writing to it?

# Something has it open -> empty it in place, don't rm
sudo truncate -s 0 /var/log/app/debug.log

# Nothing has it open -> rm is fine
sudo rm /var/log/app/debug.log

# Already rm'd and df didn't move -> find the still-open deleted file
sudo lsof -nP +L1
sudo truncate -s 0 /proc/<PID>/fd/<FD>    # or restart the process
```

---

## Why rm doesn't always free space

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

## Check before you delete

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

---

## truncate vs `: >` vs rm

| Command | What happens | Use when |
|---|---|---|
| `rm file` | Removes the name. Space freed only when nothing has it open. | File is closed, or you're also restarting the writer |
| `truncate -s 0 file` | Same inode, length set to 0, blocks freed immediately | A process is writing to it and you can't restart |
| `: > file` | Same as truncate, using shell redirection | No `truncate` binary, or in a script |
| `cat /dev/null > file` | Same effect, an extra process | Works anywhere; no advantage over `: >` |

`truncate` and `: >` throw away the content. If you might need it for an incident, keep the tail first:

```bash
sudo tail -c 1G /var/log/app/debug.log | gzip > /data/debug.log.tail.gz
sudo truncate -s 0 /var/log/app/debug.log
```

Note `sudo : > file` doesn't work, because the redirection runs in your unprivileged shell. Use `sudo truncate -s 0 file` or `sudo sh -c ': > file'`.

### The O_APPEND gotcha

After truncating, run `ls -l` and `du -h` on the file. Usually both show a small, growing file. But if the process opened the file **without** `O_APPEND`, it keeps writing at its old offset, say 21 GB in. The file then reports a length of 21 GB again (`ls -l`), while `du` shows only a few KB: it's now a sparse file, and the space really is free.

Most loggers (syslog, NGINX, Java's FileHandler, `>>` in shell scripts) use append mode. If you see this effect, it's cosmetic for disk space, but tools that read the file from the start will see a long run of zero bytes. Restarting the process or having it reopen its logs is the clean fix.

---

## Already deleted, and df didn't move

```bash
sudo lsof -nP +L1
```

```
COMMAND  PID USER   FD   TYPE DEVICE    SIZE/OFF NLINK    NODE NAME
java    2318 app    41w   REG    8,1 21474836480     0 1048602 /var/log/app/debug.log (deleted)
```

`+L1` lists open files whose link count is below 1, i.e. deleted. Then either:

```bash
sudo systemctl restart myapp              # cleanest: the process closes the file
sudo truncate -s 0 /proc/2318/fd/41       # no restart: empty it through the descriptor
```

**Deleted the wrong file?** As long as a process still has it open, you can copy it back out:

```bash
sudo cp /proc/2318/fd/41 /var/log/app/debug.log.recovered
```

Once the last process closes it, the data is gone. There's no general undelete on ext4 or XFS; backups are the recovery plan.

---

## Deleting many files: dry-run first, always

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

GNU find warns about some of these mistakes, but not all. Also note `-delete` implies `-depth`, so it can't be combined with `-prune`.

Age matching (`-mtime +14` really means "at least 15 days") is explained in [Find Files Older Than X Days](/blog/linux-find-files-older-than-x-days).

### Directories with millions of files

`rm -rf dir` works, but `rm -rf dir/*` fails with `Argument list too long` because the shell expands the glob first. `find` avoids that and lets you limit I/O impact on a busy server:

```bash
sudo ionice -c3 nice -n19 find /var/lib/php/sessions -type f -mmin +1440 -delete
```

`ionice -c3` (idle class) only takes effect with the BFQ or CFQ I/O schedulers; on `mq-deadline` or `none` it does nothing, and `nice` alone won't stop disk contention. If deletion is hurting latency, delete in smaller batches during a quiet period.

---

## rm habits that prevent disasters

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

## Big Docker and core dump files

Don't `rm` files under `/var/lib/docker` by hand; Docker's metadata will no longer match the disk. Use `docker system df` and the prune commands, with their warnings, in [Disk Full on Linux](/blog/disk-full-linux-cleanup).

For core dumps, list first and keep the parentheses so `-type f` applies to both names:

```bash
sudo find / -xdev -type f \( -name core -o -name 'core.[0-9]*' \) -ls 2>/dev/null
```

Read the list before adding `-delete`; source trees sometimes contain files named `core`.

---

## Quick checklist

1. `lsof <file>`: open? Then `truncate -s 0`, not `rm`.
2. Check hard links (`stat -c %h`) and symlinks (`ls -l`).
3. Need the content? Save the tail first.
4. Bulk delete: run `find` without `-delete`, read the list, then put `-delete` last.
5. After deleting, `df -h`. No change? `lsof +L1`.

*Related: [Find Large Files on Linux](/blog/find-large-files-linux) to find what to delete. [Check File Size in Linux](/blog/linux-check-file-size-command) for why `ls` and `du` can disagree after a truncate.*
