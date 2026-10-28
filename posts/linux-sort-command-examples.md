---
title: "Linux sort Command: Examples for Columns, Sizes and Logs"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Practical Linux sort examples: one column, numbers, du sizes, dates and frequency counts, plus why -k2 sorts past column 2 and how locale changes order."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
category: "linux"
---

You pipe `du -sh *` into `sort -rn` and 900K lands above 2G. Or you sort a CSV by its second column and the rows come out in an order that makes no sense. `sort` has a few defaults that surprise almost everyone at least once. Here are the examples you'll actually use, with the traps explained.

```bash
sort -n nums.txt                          # numeric, smallest first
sort -rn nums.txt                         # numeric, largest first
du -sh /var/* | sort -rh                  # human sizes (K, M, G), largest first
sort -t, -k2,2n data.csv                  # CSV, by column 2 only, numerically
sort | uniq -c | sort -rn                 # frequency count, most common first
sort -u ips.txt                           # unique lines
```

---

## Numbers: `-n`, `-g`, `-h`, `-V`

By default `sort` compares text character by character, so `10` comes before `2`:

```bash
printf '10\n2\n100\n5\n' | sort       # 10 100 2 5
printf '10\n2\n100\n5\n' | sort -n    # 2 5 10 100
```

| Flag | Compares as | Use for |
|---|---|---|
| `-n` | Integers and decimals | Counts, PIDs, percentages |
| `-g` | General numbers, including `1e3` | Scientific notation (slower) |
| `-h` | Numbers with K/M/G/T suffixes | `du -h`, `df -h`, `ls -lh` output |
| `-V` | Version strings | `1.9.2` vs `1.10.0`, kernel versions |
| `-M` | Month names (`Jan`..`Dec`) | Syslog-style dates |

The `du` trap:

```bash
du -sh /var/* 2>/dev/null | sort -rn   # wrong: compares 900 vs 2, ignores K/G
du -sh /var/* 2>/dev/null | sort -rh   # right
```

```
4.1G	/var/log
1.2G	/var/lib
312M	/var/cache
900K	/var/backups
```

See [Check Disk Usage with du and df](/blog/check-disk-usage-linux-du-df) and [Find Large Files in Linux](/blog/find-large-files-linux) for more of this.

---

## Columns: why `-k2` isn't "column 2"

`-k2` means "the key starts at field 2 **and runs to the end of the line**." When field 2 is equal, the rest of the line decides the order, which is rarely what you meant. Always give an end field:

```bash
sort -k2,2 file          # field 2 only
sort -k2,2n file         # field 2 only, numeric
sort -k3,3nr -k1,1 file  # field 3 numeric descending, then field 1 as tie-breaker
```

Putting the type letter on the key (`-k2,2n`) applies it to that key alone. A global `-n` or `-r` applies to every key without its own letters.

### Field separators

By default fields are separated by the transition from non-blank to blank, and **leading blanks belong to the field**. With aligned output like `ps` or `ls -l`, that can shift comparisons. Add `-b` to ignore leading blanks, or set a delimiter:

```bash
sort -t: -k3,3n /etc/passwd             # by UID
sort -t, -k2,2 data.csv                 # by second CSV column
```

`-t,` splits on every comma, including commas inside quoted CSV fields. For real CSV, use a CSV-aware tool (`mlr`, `csvsort`, Python).

### Part of a field

```bash
sort -k2.1,2.4 file      # characters 1-4 of field 2
```

---

## Locale changes the order

`sort` follows your locale. In `en_US.UTF-8`, case and punctuation are mostly ignored on the first pass, so `apple`, `Banana`, `cherry` sort together naturally. In the `C` locale, it's plain byte order: uppercase before lowercase, `Banana` before `apple`.

```bash
LC_ALL=C sort file      # bytewise: predictable across machines, and much faster
sort -f file            # fold case: treat upper and lower case alike
```

Set `LC_ALL=C` in scripts so output is identical on every server, and for big files, where it's noticeably faster. It also matters for `comm` and `join`, which require their inputs sorted with the same rules.

---

## Unique lines: `-u` vs `uniq`

```bash
sort -u ips.txt                          # unique lines
sort ips.txt | uniq -c | sort -rn        # unique lines with counts
sort ips.txt | uniq -d                   # only lines that appear more than once
```

`uniq` only collapses **adjacent** duplicates, so it needs sorted input.

With a key, `sort -u` keeps one line per **key**, not per line:

```bash
sort -t, -k1,1 -u users.csv              # one row per value of column 1
```

Which row survives for each key isn't something to rely on. If you need "first occurrence wins" without sorting, use `awk '!seen[$0]++'`.

---

## Log examples

### Top client IPs in an access log

```bash
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head
```

```
  48211 10.0.1.50
   9120 203.0.113.17
    880 198.51.100.4
```

The top address is often your own load balancer or health checker. If so, the client IP is in `X-Forwarded-For`, which needs to be in your log format.

### Status codes and top URLs

```bash
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn
awk '$9 >= 500 {print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head
```

Field numbers assume NGINX's default `combined` log format. Check one line of your log before trusting `$7` and `$9`.

### Most frequent error messages

```bash
grep -h ERROR /var/log/myapp/*.log \
  | sed -E 's/^[0-9T:. -]+//; s/[0-9]+/N/g' \
  | sort | uniq -c | sort -rn | head -20
```

The `sed` strips the leading timestamp and replaces numbers with `N`, so `timeout after 3012ms` and `timeout after 2988ms` count as the same message. Adapt the first expression to your timestamp format.

### SSH logins per user

```bash
grep 'Accepted ' /var/log/auth.log \
  | awk '{for (i=1; i<NF; i++) if ($i == "for") {print $(i+1); break}}' \
  | sort | uniq -c | sort -rn
```

Finding the word after `for` works whether your syslog uses classic (`Oct 28 09:15:02`) or ISO timestamps, which shift the field numbers. On RHEL the file is `/var/log/secure`; on journald-only systems use `journalctl -u ssh` (Debian/Ubuntu) or `-u sshd` (RHEL). See [Check Last Login Users](/blog/linux-check-last-login-users).

### Sort by timestamp

ISO timestamps (`2026-10-28T09:15:02`) sort correctly as plain text. Classic syslog dates need month-aware sorting:

```bash
sort -k1,1M -k2,2n -k3,3 merged.log
```

Classic syslog lines don't include the year, so this breaks across a year boundary.

---

## Big files and in-place sorting

```bash
sort -o file.txt file.txt                # safe in-place sort
sort file.txt > file.txt                 # WRONG: the shell empties the file before sort reads it
```

> **Warning:** `sort file > file` destroys the file. Use `-o`, or write to a new file and `mv` it over.

For files larger than memory, `sort` writes temporary chunks to `$TMPDIR` (default `/tmp`). A multi-gigabyte sort can fill a small `/tmp`. Point it somewhere with space and give it more buffer:

```bash
LC_ALL=C sort -S 2G -T /var/tmp --parallel=4 big.log -o big.sorted
```

Check whether something is already sorted without sorting it:

```bash
sort -c -k2,2n file && echo sorted
```

---

## Flag reference

| Flag | Meaning |
|---|---|
| `-n` / `-g` / `-h` / `-V` / `-M` | Numeric / general numeric / human sizes / version / month |
| `-r` | Reverse |
| `-k F1[,F2]` | Key from field F1 to F2 (always give F2) |
| `-t X` | Field delimiter |
| `-b` | Ignore leading blanks |
| `-f` | Fold lowercase to uppercase |
| `-u` | One line per key (or per line, with no key) |
| `-s` | Stable: keep input order for equal keys |
| `-o FILE` | Write to FILE (safe for in-place) |
| `-c` | Check whether input is sorted |
| `-S`, `-T`, `--parallel` | Buffer size, temp directory, threads |

For sorting processes, `ps` has its own `--sort` option (`ps -eo pid,rss,comm --sort=-rss`), which avoids parsing its columns; see [ps Command in Linux](/blog/ps-command-linux-troubleshooting).

---

*Related: [Search Text in Files with grep](/blog/search-text-in-files-linux-grep) to find the lines before you count them. [Linux Log Analysis](/blog/linux-log-analysis-guide) for full log workflows.*
