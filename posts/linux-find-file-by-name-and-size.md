---
title: "Find Files in Linux: Name, Size, Age, grep Text and sort"
date: "2026-04-22"
updated: "2026-11-02"
excerpt: "Find files by name, size and age with Linux find, search text inside them with grep, and rank results with sort, without the traps that give wrong output."
tags: ["linux", "troubleshooting", "debugging", "infrastructure", "logs"]
featured: false
category: "linux"
---

You need "every `.log` file under `/var` bigger than 50 MB", "where is that `config.yml` on this box", "rotated logs older than 30 days", or "which config file sets `worker_processes`". `find` answers the first three, `grep` the last, and `sort | uniq -c` turns the results into a ranking. Each has a few rules that quietly give you wrong results: unquoted patterns, `-o` without parentheses, size rounding, `-mtime` arithmetic, regex dots, and `sort -k2`. Get those right and the rest is easy.

```bash
find /var -type f -name '*.log' -size +50M                    # name AND size
find / -xdev -type f -iname 'config.yml' 2>/dev/null          # by name, case-insensitive
find /var/log -type f \( -name '*.log' -o -name '*.gz' \) -size +10M   # either name, plus size
find /var/log/app -type f -name '*.gz' -mtime +30             # older than 30 days (really 31)
grep -rn "worker_processes" /etc/nginx/                       # text inside files, recursive
du -sh /var/* | sort -rh                                      # human sizes, largest first
```

---

## Matching by name

| Test | Matches against | Example |
|---|---|---|
| `-name 'pat'` | The file name only (last path part), case-sensitive glob | `-name '*.conf'` |
| `-iname 'pat'` | Same, case-insensitive | `-iname 'readme*'` |
| `-path 'pat'` | The whole path as find prints it | `-path '*/nginx/*.conf'` |
| `-regex 'pat'` | The whole path, as a regular expression | `-regex '.*/app-[0-9]+\.log'` |

### Always quote the pattern

```bash
find /var/log -name *.log      # WRONG
find /var/log -name '*.log'    # right
```

Without quotes, the shell expands `*.log` **before** `find` runs, using files in your current directory. If your current directory has one `.log` file, `find` searches for that exact name. If it has two, you get `find: paths must precede expression`. If it has none, it happens to work, which is why this bug survives in scripts.

### -name doesn't see slashes

`-name` only looks at the last part of the path, so `-name 'nginx/*.conf'` never matches anything. Use `-path`:

```bash
find /etc -path '*/nginx/*' -name '*.conf'
```

### -regex matches the whole path

```bash
find /var/log -regextype posix-extended -regex '.*/app-[0-9]{4}-[0-9]{2}-[0-9]{2}\.log'
```

The expression must match the full path, so start with `.*/`. GNU find's default regex flavor is Emacs-style, where `{4}` intervals and `|` alternation need backslashes; `-regextype posix-extended` gives you the syntax you know from `grep -E`.

---

## Matching by size

| Suffix | Unit |
|---|---|
| `c` | bytes |
| `k` | KiB (1024 bytes) |
| `M` | MiB (1024 KiB) |
| `G` | GiB |
| none | 512-byte blocks |

`+N` means larger than, `-N` smaller than, plain `N` "exactly" (after rounding).

**The rounding trap:** find rounds each file's size **up** to the unit before comparing.

```bash
find /tmp -type f -size -1k      # matches only EMPTY files (1 byte rounds up to 1k)
find /tmp -type f -size -1024c   # files smaller than 1 KiB, what you meant
find /tmp -type f -empty         # if empty files are what you want, say so
```

`-size 512k` means "rounds up to 512 KiB", i.e. anything from just over 511 KiB to 512 KiB, not exactly 524288 bytes. For an exact byte size use `-size 524288c`.

A range:

```bash
find /var -xdev -type f -size +10M -size -100M
```

For a sorted "biggest files first" list, see [Find Large Files on Linux](/blog/check-disk-usage-linux-du-df).

---

## Find files older than X days

You want to clean up rotated logs older than 30 days, or list backups nobody has touched in six months. `-mtime +30` doesn't mean what most people think, and a cleanup job built on a wrong assumption either deletes too much or never deletes anything.

### How -mtime counts days

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

### mtime, atime, ctime: which one?

| Test | Timestamp | Changes when | Use it for |
|---|---|---|---|
| `-mtime` / `-mmin` | Modification | File content is written | Almost everything: logs, backups, uploads |
| `-atime` / `-amin` | Access | File is read | Rarely reliable, see below |
| `-ctime` / `-cmin` | Change (inode) | Content **or** permissions, owner, rename | Auditing what changed recently |

`-atime` is tempting for "files nobody uses", but most Linux systems mount filesystems with `relatime`, which updates access time only if it's older than the modification time or more than 24 hours old. Some are mounted `noatime` and never update it. Treat `-atime` results as a hint, not proof.

`ctime` is **not** creation time. Linux doesn't expose creation (birth) time through `find`'s classic tests; `stat` shows it as `Birth` on newer systems.

**Timestamps can lie.** `cp -p`, `rsync -a`, `tar x` and `unzip` keep the original modification times, so a backup restored today can look two years old. Check with `stat` before relying on age for something important.

Note also that a **directory's** mtime changes when entries are added or removed inside it, not when files inside it are modified. An old-looking directory can contain fresh files.

---

## Combining tests: AND, OR, NOT

Tests next to each other are joined with AND. `-o` is OR, `!` (or `-not`) is NOT. AND binds tighter than OR, which is the source of a classic bug:

```bash
# WRONG: -type f and -size only apply to *.gz
find / -name core -o -name '*.gz' -type f -size +100M

# right: group the OR with escaped parentheses
find / -xdev -type f \( -name core -o -name '*.gz' \) -size +100M
```

The parentheses need a backslash (or quotes) so the shell passes them to `find`, and spaces around them.

More combinations:

```bash
find /var/log -type f -name '*.log' ! -name '*debug*'          # .log files except debug ones
find /opt/app -type f ! -user app                              # files not owned by app
find /var/log -type f -name '*.log' -mtime +7 -size +100M      # old AND big
find /home -type f -user olduser -mtime +180                   # stale files of one user
find /tmp -type f -empty -mtime +7                             # old empty files
find /data/exports -mindepth 1 -maxdepth 1 -type d -mtime +90  # old top-level folders only
```

---

## Skipping folders: -xdev and -prune

Searching `/` walks `/proc`, `/sys`, network mounts and container layers unless you stop it.

```bash
find / -xdev -type f -name 'config.yml' 2>/dev/null
```

`-xdev` stays on the starting filesystem. To skip specific folders inside it, use `-prune`, which stops find from descending at all (unlike `! -path`, which still walks the whole tree and only hides the results):

```bash
find /srv \( -path /srv/backups -o -name node_modules -o -name .git \) -prune \
     -o -type f -name '*.yml' -print
```

Read it as: "if it's one of these folders, prune it; **otherwise** if it's a `.yml` file, print it". The explicit `-print` at the end matters; without it, find also prints the pruned folder names.

---

## Doing something with the results

```bash
find /var/log -type f -name '*.log' -size +100M -ls                  # details (size in bytes, 7th column)
find /var/log -type f -name '*.log' -size +100M -exec ls -lh {} +    # human-readable sizes
find /etc -type f -name '*.conf' -exec grep -l 'listen 443' {} +      # which configs contain a string
```

`-exec cmd {} +` runs the command once with many files; `-exec cmd {} \;` runs it once per file, much slower on big result sets. If you pipe to `xargs`, use `-print0 | xargs -0` so names with spaces don't break:

```bash
find /var/log -type f -name '*.log' -mtime +7 -print0 | xargs -0 gzip
```

### Safe delete workflow

Every age- or pattern-based delete should be run as a dry run first, with the exact same expression.

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
- **Don't delete live logs.** A `*.log` older than 30 days is probably not being written, but check with `lsof` if unsure; for files a process holds open, see [Delete Large Files Safely](/blog/check-disk-usage-linux-du-df).

`-delete` is faster than `-exec rm {} +` or `xargs rm` because find removes files itself without starting `rm` processes. If you need `rm` (for example to log each deletion), use `-print0 | xargs -0 rm -v --`.

Removing empty folders afterward, or compressing instead of deleting:

```bash
find /srv/uploads -mindepth 1 -type d -empty -print     # dry run
find /srv/uploads -mindepth 1 -type d -empty -delete    # -mindepth 1 protects the top folder

find /var/log/app -type f -name '*.log' -mtime +7 -print                       # dry run
find /var/log/app -type f -name '*.log' -mtime +7 -exec gzip {} +
```

`gzip` skips names already ending in `.gz`, and `-name '*.log'` excludes them anyway.

### Running it on a schedule

A daily cleanup in cron:

```bash
# /etc/cron.d/app-log-cleanup
30 3 * * * root /usr/bin/find /var/log/app -type f -name '*.log.gz' -mtime +30 -delete
```

Before adding your own cron jobs, check whether a built-in tool already does it:

- **logrotate** handles rotation and retention of log files (`rotate 30` + `daily`).
- **systemd-tmpfiles** cleans `/tmp`, `/var/tmp` and folders you configure by age, e.g. `d /var/cache/myapp 0755 app app 14d` in `/etc/tmpfiles.d/myapp.conf`.

Both are less likely to surprise you than a hand-written `find -delete`. If you're doing this because the disk is already full, start with [Disk Full on Linux](/blog/check-disk-usage-linux-du-df) instead; age-based cleanup is rarely the fastest way back.

### Useful one-offs

```bash
find / -xdev -xtype l 2>/dev/null                  # broken symlinks (GNU find)
find / -xdev -type f -perm -4000 2>/dev/null       # setuid binaries (security audit)
find / -xdev -type f -perm -0002 2>/dev/null       # world-writable files
find /opt/app -type f -name '*.*' | sed 's/.*\.//' | sort | uniq -c | sort -rn | head   # count by extension
find /home -maxdepth 3 -type f -iname '*.pem'      # limit depth when you know it's shallow
```

### find vs locate

`locate` (from `mlocate` or `plocate`) searches a prebuilt database, so it answers in milliseconds:

```bash
locate -i config.yml
```

The database is usually updated once a day, so new files are missing and deleted ones still show up. It also can't filter by size. Use `locate` to find where something lives, `find` when results must be current or you need size, age or permission filters.

---

## Search text in files with grep

`find` matches files by name; to search **inside** files, use `grep`: which config file sets `worker_processes`, which log has the `OutOfMemoryError`, every place a hostname is hard-coded before you migrate a server.

```bash
grep -rn "worker_processes" /etc/nginx/          # recursive, with line numbers
grep -rl "db01.internal" /etc /opt/app           # just the file names
grep -i "error" /var/log/myapp/app.log           # case-insensitive
grep -rnw "TODO" --include="*.py" src/           # whole word, only .py files
zgrep -h "OutOfMemory" /var/log/myapp/app.log*   # current + rotated .gz logs
```

| Flag | Does | Note |
|---|---|---|
| `-r` | Search a directory recursively | `-R` also follows symlinks |
| `-n` | Show line numbers | |
| `-i` | Case-insensitive | |
| `-l` / `-L` | Print only names of files that match / don't match | |
| `-c` | Count **matching lines** per file | Not the number of matches |
| `-v` | Invert: lines that **don't** match | |
| `-w` | Whole word: `-w port` won't match `transport` | |
| `-x` | Whole line must match | |
| `-F` | Fixed string, no regex | Use for IPs, paths, anything with `.` `*` `[` |
| `-E` | Extended regex (`\|`, `+`, `?`, `{n}` without backslashes) | |
| `-o` | Print only the matched part | Great for extracting IPs, IDs |
| `-A n` / `-B n` / `-C n` | n lines after / before / around each match | |
| `-m n` | Stop after n matching lines | |
| `-h` / `-H` | Hide / force the filename prefix | |
| `-I` | Skip binary files | |
| `-q` | No output, only the exit code | For scripts |

### Search a directory tree

```bash
grep -rn "listen 443" /etc/nginx/
# /etc/nginx/sites-enabled/api.conf:4:    listen 443 ssl;
# /etc/nginx/sites-enabled/www.conf:3:    listen 443 ssl http2;

grep -rn --include="*.yml" --include="*.yaml" "password:" /opt/app/
grep -rn --exclude-dir=".git" --exclude-dir="node_modules" "api_key" .
grep -rnI "10.0.2.15" /etc                            # -I: skip binary files
```

Scope it. `grep -r pattern /` reads every file on the system, including `/proc` and `/sys`, and can take a very long time or hang on special files. Start from the narrowest directory that could contain the answer.

### Regex that does what you expect

grep's default is **basic** regex (BRE), where `|`, `+`, `?`, `{` and `(` are literal characters unless backslashed. That's why this finds nothing:

```bash
grep "error|fatal" app.log        # looks for the literal text "error|fatal"
grep -E "error|fatal" app.log     # either word
```

Common patterns:

```bash
grep -E "^2026-10-28 14:2[0-9]" app.log             # lines starting in a time window
grep -E '" 5[0-9]{2} ' /var/log/nginx/access.log     # HTTP 5xx in combined log format
grep -oE "([0-9]{1,3}\.){3}[0-9]{1,3}" access.log    # extract IPv4-looking strings
grep -P "user_id=\d+" app.log                        # Perl regex (GNU grep only)
```

The IPv4 regex also matches `999.1.1.1`. That's fine for extracting addresses from logs, not for validating input.

A dot in a regex means "any character", so `grep "10.0.0.1"` also matches `10.0.0.12` and `10a0b0c1`. Use `-F` for literal strings, and `-w` to stop at word boundaries:

```bash
grep -Fw "10.0.0.1" /var/log/nginx/access.log
grep -F "[error]" /var/log/nginx/error.log        # brackets are literal with -F
grep -- "-Xmx" /etc/default/myapp                 # pattern starts with a dash: use -- or -e
```

### Context: what happened around the match

```bash
grep -n -B 3 -A 20 "OutOfMemoryError" app.log     # stack trace after, cause before
grep -m1 -A 30 "Traceback" app.log                # just the first Python traceback
grep -C 2 "connection refused" /var/log/nginx/error.log
```

Groups of context lines are separated by `--`. If a match falls within the context of the previous one, they're merged.

### Rotated and compressed logs

Rotated logs end in `.1`, `.2.gz` and so on. Plain `grep` on a `.gz` file prints `Binary file ... matches` (or nothing useful). `zgrep` decompresses on the fly and also reads uncompressed files, so one command covers all of them:

```bash
zgrep -h "Failed password" /var/log/auth.log*                 # -h: no filename prefix
zgrep -c "ERROR" /var/log/myapp/app.log*                      # count per file = per day
grep -o "ERROR" app.log | wc -l                               # occurrences (a line can have several)
```

On RHEL the auth log is `/var/log/secure`; on systems without rsyslog, use `journalctl -u ssh` (Debian/Ubuntu) or `-u sshd` (RHEL) with `--grep`.

### grep in scripts

grep's exit code is the useful output:

| Exit code | Meaning |
|---|---|
| `0` | At least one match |
| `1` | No match |
| `2` | Error (file not found, permission denied) |

```bash
if grep -q "^PermitRootLogin no" /etc/ssh/sshd_config; then
  echo "root login disabled"
fi
```

With `set -e`, a grep that finds nothing (exit 1) stops your script. Use `grep ... || true` where "no match" is a normal outcome.

### Speed and common mistakes

- `LC_ALL=C grep ...` skips multibyte locale handling and is often much faster on large ASCII logs. `-F` is faster than a regex when you don't need one, and `-m` stops early.
- For huge source trees, `ripgrep` (`rg`) is faster and skips `.gitignore`d files by default. That default is also a trap when you're searching for something in an ignored file.
- **Unquoted patterns.** `grep connection refused app.log` searches for `connection` in two files: `refused` and `app.log`. Quote anything with spaces or shell characters.
- **`grep -c` for occurrences.** It counts lines. Use `grep -o ... | wc -l`.

---

## Sort the results: sort command examples

You pipe `du -sh *` into `sort -rn` and 900K lands above 2G. Or you sort a CSV by its second column and the rows come out in an order that makes no sense. `sort` has a few defaults that surprise almost everyone at least once.

```bash
sort -n nums.txt                          # numeric, smallest first
sort -rn nums.txt                         # numeric, largest first
du -sh /var/* | sort -rh                  # human sizes (K, M, G), largest first
sort -t, -k2,2n data.csv                  # CSV, by column 2 only, numerically
sort | uniq -c | sort -rn                 # frequency count, most common first
sort -u ips.txt                           # unique lines
```

### Numbers: -n, -g, -h, -V

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

See [Check Disk Usage with du and df](/blog/check-disk-usage-linux-du-df) for more of this.

### Columns: why -k2 isn't "column 2"

`-k2` means "the key starts at field 2 **and runs to the end of the line**." When field 2 is equal, the rest of the line decides the order, which is rarely what you meant. Always give an end field:

```bash
sort -k2,2 file          # field 2 only
sort -k2,2n file         # field 2 only, numeric
sort -k3,3nr -k1,1 file  # field 3 numeric descending, then field 1 as tie-breaker
sort -k2.1,2.4 file      # characters 1-4 of field 2
```

Putting the type letter on the key (`-k2,2n`) applies it to that key alone. A global `-n` or `-r` applies to every key without its own letters.

By default fields are separated by the transition from non-blank to blank, and **leading blanks belong to the field**. With aligned output like `ps` or `ls -l`, that can shift comparisons. Add `-b` to ignore leading blanks, or set a delimiter:

```bash
sort -t: -k3,3n /etc/passwd             # by UID
sort -t, -k2,2 data.csv                 # by second CSV column
```

`-t,` splits on every comma, including commas inside quoted CSV fields. For real CSV, use a CSV-aware tool (`mlr`, `csvsort`, Python).

### Locale changes the order

`sort` follows your locale. In `en_US.UTF-8`, case and punctuation are mostly ignored on the first pass, so `apple`, `Banana`, `cherry` sort together naturally. In the `C` locale, it's plain byte order: uppercase before lowercase, `Banana` before `apple`.

```bash
LC_ALL=C sort file      # bytewise: predictable across machines, and much faster
sort -f file            # fold case: treat upper and lower case alike
```

Set `LC_ALL=C` in scripts so output is identical on every server, and for big files, where it's noticeably faster. It also matters for `comm` and `join`, which require their inputs sorted with the same rules.

### Unique lines: -u vs uniq

```bash
sort -u ips.txt                          # unique lines
sort ips.txt | uniq -c | sort -rn        # unique lines with counts
sort ips.txt | uniq -d                   # only lines that appear more than once
sort -t, -k1,1 -u users.csv              # one row per value of column 1
```

`uniq` only collapses **adjacent** duplicates, so it needs sorted input. With a key, `sort -u` keeps one line per **key**, not per line, and which row survives isn't something to rely on. If you need "first occurrence wins" without sorting, use `awk '!seen[$0]++'`.

### Big files and in-place sorting

```bash
sort -o file.txt file.txt                # safe in-place sort
sort file.txt > file.txt                 # WRONG: the shell empties the file before sort reads it
```

> **Warning:** `sort file > file` destroys the file. Use `-o`, or write to a new file and `mv` it over.

For files larger than memory, `sort` writes temporary chunks to `$TMPDIR` (default `/tmp`). A multi-gigabyte sort can fill a small `/tmp`. Point it somewhere with space and give it more buffer:

```bash
LC_ALL=C sort -S 2G -T /var/tmp --parallel=4 big.log -o big.sorted
sort -c -k2,2n file && echo sorted       # check whether input is already sorted
```

For sorting processes, `ps` has its own `--sort` option (`ps -eo pid,rss,comm --sort=-rss`), which avoids parsing its columns; see [ps Command in Linux](/blog/ps-command-linux-troubleshooting).

---

## Putting it together: count and rank log lines

`grep` finds the lines, `sort | uniq -c | sort -rn` is the pattern for "group and rank".

### Top source IPs of failed SSH logins

```bash
grep "Failed password" /var/log/auth.log | grep -oE "from [0-9.]+" | sort | uniq -c | sort -rn | head
```

```
    412 from 203.0.113.45
     87 from 198.51.100.23
      9 from 192.0.2.10
```

### SSH logins per user

```bash
grep 'Accepted ' /var/log/auth.log \
  | awk '{for (i=1; i<NF; i++) if ($i == "for") {print $(i+1); break}}' \
  | sort | uniq -c | sort -rn
```

Finding the word after `for` works whether your syslog uses classic (`Oct 28 09:15:02`) or ISO timestamps, which shift the field numbers. See [Check Last Login Users](/blog/linux-log-analysis-guide).

### Top client IPs, status codes and URLs in an access log

```bash
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn
awk '$9 >= 500 {print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head
```

The top address is often your own load balancer or health checker. If so, the client IP is in `X-Forwarded-For`, which needs to be in your log format. Field numbers assume NGINX's default `combined` log format. Check one line of your log before trusting `$7` and `$9`.

### Most frequent error messages

```bash
grep -h ERROR /var/log/myapp/*.log \
  | sed -E 's/^[0-9T:. -]+//; s/[0-9]+/N/g' \
  | sort | uniq -c | sort -rn | head -20
```

The `sed` strips the leading timestamp and replaces numbers with `N`, so `timeout after 3012ms` and `timeout after 2988ms` count as the same message. Adapt the first expression to your timestamp format.

### Sort by timestamp

ISO timestamps (`2026-10-28T09:15:02`) sort correctly as plain text. Classic syslog dates need month-aware sorting:

```bash
sort -k1,1M -k2,2n -k3,3 merged.log
```

Classic syslog lines don't include the year, so this breaks across a year boundary.

---

## FAQ

**How do I find a file by name in Linux?**
`find / -xdev -type f -name 'filename' 2>/dev/null`. Use `-iname` for case-insensitive matching and quote the name if it contains wildcards.

**How do I find files larger than 100MB with a certain extension?**
`find /path -type f -name '*.ext' -size +100M`. Add `-exec ls -lh {} +` to see sizes.

**Why does find -size -1M only return empty files?**
find rounds sizes up to the unit, so any non-empty file is at least "1M". Use a smaller unit: `-size -1024k` or `-size -1048576c`.

**Why does find say "paths must precede expression"?**
Usually an unquoted wildcard: the shell expanded `*.log` into several file names. Quote it: `-name '*.log'`.

**How do I find files older than 7 days in Linux?**
`find /path -type f -mtime +7`. Strictly, that matches files 8 or more full days old; use `-mtime +6` or `-mmin +10080` if you need "older than 7 × 24 hours".

**How do I find files modified in the last 24 hours?**
`find /path -type f -mtime -1` (or `-mtime 0`). For the last hour, `-mmin -60`.

**Does find -mtime use creation date?**
No. It uses modification time. Linux `find` has no portable creation-time test, and `ctime` means inode change time.

**How do I search for text in all files in a directory?**
`grep -rn "text" /path`. Add `-l` for just the file names, `-F` if the text contains dots or brackets.

*Related: [Linux Log Analysis Guide](/blog/linux-log-analysis-guide) for full log workflows. [Security log analysis](/blog/log-analysis-security-windows-webserver) for grep patterns that catch attacks in access logs, and [monitor real-time logs](/blog/monitor-real-time-logs-linux) for using grep on a live stream (where `--line-buffered` matters).*
