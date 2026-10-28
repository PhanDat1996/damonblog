---
title: "Search Text in Files on Linux: grep Recursive, Regex, Logs"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Find a string in a file, a directory tree or compressed logs with grep: recursive search, regex that works, context lines, and the flags people get wrong."
tags: ["linux", "troubleshooting", "debugging", "logs", "infrastructure"]
featured: false
category: "linux"
---

You need to know which config file sets `worker_processes`, which log has the `OutOfMemoryError`, or every place a hostname is hard-coded before you migrate a server. That's `grep`. The basic form takes seconds to learn. The flags that make it reliable (recursion, fixed strings, compressed files, binary files) are where people lose time.

---

## The answer

```bash
grep -rn "worker_processes" /etc/nginx/          # recursive, with line numbers
grep -rl "db01.internal" /etc /opt/app           # just the file names
grep -i "error" /var/log/myapp/app.log           # case-insensitive
grep -rnw "TODO" --include="*.py" src/           # whole word, only .py files
zgrep -h "OutOfMemory" /var/log/myapp/app.log*   # current + rotated .gz logs
```

---

## The flags you'll actually use

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
| `-E` | Extended regex (`|`, `+`, `?`, `{n}` without backslashes) | |
| `-o` | Print only the matched part | Great for extracting IPs, IDs |
| `-A n` / `-B n` / `-C n` | n lines after / before / around each match | |
| `-m n` | Stop after n matching lines | |
| `-h` / `-H` | Hide / force the filename prefix | |
| `-I` | Skip binary files | |
| `-q` | No output, only the exit code | For scripts |

---

## Search a directory tree

```bash
grep -rn "listen 443" /etc/nginx/
# /etc/nginx/sites-enabled/api.conf:4:    listen 443 ssl;
# /etc/nginx/sites-enabled/www.conf:3:    listen 443 ssl http2;

grep -rl "DatabaseError" /opt/app/                    # which files
grep -rn --include="*.yml" --include="*.yaml" "password:" /opt/app/
grep -rn --exclude-dir=".git" --exclude-dir="node_modules" "api_key" .
grep -rnI "10.0.2.15" /etc                            # -I: skip binary files
```

Scope it. `grep -r pattern /` reads every file on the system, including `/proc` and `/sys`, and can take a very long time or hang on special files. Start from the narrowest directory that could contain the answer.

If you're looking for files by **name** rather than content, that's `find`, not grep. See [find files by name and size](/blog/linux-find-file-by-name-and-size).

---

## Regex that does what you expect

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

### Searching for something that contains regex characters

A dot in a regex means "any character", so `grep "10.0.0.1"` also matches `10.0.0.12` and `10a0b0c1`. Use `-F` for literal strings, and `-w` to stop at word boundaries:

```bash
grep -Fw "10.0.0.1" /var/log/nginx/access.log
grep -F "[error]" /var/log/nginx/error.log        # brackets are literal with -F
```

Pattern starts with a dash? Mark the end of options with `--` or use `-e`:

```bash
grep -- "-Xmx" /etc/default/myapp
grep -e "--max-connections" config.txt
```

---

## Context: what happened around the match

```bash
grep -n -B 3 -A 20 "OutOfMemoryError" app.log     # stack trace after, cause before
grep -m1 -A 30 "Traceback" app.log                # just the first Python traceback
grep -C 2 "connection refused" /var/log/nginx/error.log
```

Groups of context lines are separated by `--`. If a match falls within the context of the previous one, they're merged.

---

## Logs: rotated, compressed, counted

Rotated logs end in `.1`, `.2.gz` and so on. Plain `grep` on a `.gz` file prints `Binary file ... matches` (or nothing useful). `zgrep` decompresses on the fly and also reads uncompressed files, so one command covers all of them:

```bash
zgrep -h "Failed password" /var/log/auth.log*                 # -h: no filename prefix
zgrep -c "ERROR" /var/log/myapp/app.log*                      # count per file = per day
```

Counting and ranking:

```bash
grep -c "ERROR" app.log                                # lines containing ERROR
grep -o "ERROR" app.log | wc -l                        # occurrences (a line can have several)

# Top source IPs of failed SSH logins
grep "Failed password" /var/log/auth.log | grep -oE "from [0-9.]+" | sort | uniq -c | sort -rn | head
```

```
    412 from 203.0.113.45
     87 from 198.51.100.23
      9 from 192.0.2.10
```

`sort | uniq -c | sort -rn` is the pattern for "group and rank". The [sort command guide](/blog/linux-sort-command-examples) covers its options. On RHEL the auth log is `/var/log/secure`; on systems without rsyslog, use `journalctl -u ssh` (Debian/Ubuntu) or `-u sshd` (RHEL) with `--grep`.

For deeper log work (normalizing messages, building a timeline), see the [Linux log analysis guide](/blog/linux-log-analysis-guide).

---

## grep in scripts

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

---

## Speed on big files

- `LC_ALL=C grep ...` skips multibyte locale handling and is often much faster on large ASCII logs.
- `-F` is faster than a regex when you don't need one.
- `-m` stops early once you've seen enough.
- For huge source trees, `ripgrep` (`rg`) is faster and skips `.gitignore`d files by default. That default is also a trap when you're searching for something in an ignored file.

---

## Common mistakes

- **Unquoted patterns.** `grep connection refused app.log` searches for `connection` in two files: `refused` and `app.log`. Quote anything with spaces or shell characters.
- **Expecting `|` to work without `-E`.**
- **Unescaped dots in IPs and hostnames.** Use `-F` (and `-w`).
- **`grep` on `.gz` logs.** Use `zgrep`.
- **`grep -c` for occurrences.** It counts lines. Use `grep -o ... | wc -l`.
- **`grep -r` from `/`.** Narrow the starting directory.

---

*Related: [security log analysis](/blog/log-analysis-security-windows-webserver) for grep patterns that catch attacks in access logs, and [monitor real-time logs](/blog/monitor-real-time-logs-linux) for using grep on a live stream (where `--line-buffered` matters).*
