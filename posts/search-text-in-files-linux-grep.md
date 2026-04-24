---
title: "How to Search Text in Files Linux: grep Examples"
date: "2026-04-22"
excerpt: "Search text in files in Linux with grep — recursive search, regex patterns, context lines, count matches, and real-world log investigation examples."
tags: ["linux", "troubleshooting", "debugging", "logs", "infrastructure"]
featured: false
slug: "search-text-in-files-linux-grep-examples"
category: "linux"
---

`grep` is the tool you use more than almost anything else on Linux. Search a file, search a directory, match patterns, count occurrences, extract specific fields.

---

## TL;DR

```bash
grep "error" /var/log/app.log              # basic search
grep -r "error" /var/log/                 # recursive search
grep -i "error" /var/log/app.log          # case-insensitive
grep -n "error" /var/log/app.log          # show line numbers
grep -c "error" /var/log/app.log          # count matches
grep -v "debug" /var/log/app.log          # exclude matches
```

---

## Basic grep

```bash
# Search in a file
grep "connection refused" /var/log/nginx/error.log

# Case-insensitive
grep -i "error" /var/log/app.log

# Show line numbers
grep -n "FATAL" /var/log/app.log

# Count matching lines
grep -c "ERROR" /var/log/app.log

# Invert (show lines NOT matching)
grep -v "DEBUG" /var/log/app.log | head -20
```

---

## Recursive Search

```bash
# Search all files in a directory
grep -r "password" /etc/

# With filename shown (default for -r)
grep -r "api_key" /opt/app/

# Only show filenames that contain the match
grep -rl "DatabaseError" /opt/app/

# Exclude certain file types
grep -r --include="*.py" "import requests" /opt/app/
grep -r --exclude="*.log" "error" /var/
grep -r --exclude-dir=".git" "TODO" /opt/app/
```

---

## Context Lines

```bash
# 3 lines before and after each match
grep -B3 -A3 "FATAL" /var/log/app.log

# 5 lines after (useful for stack traces)
grep -A5 "Exception" /var/log/app.log

# 2 lines before (useful for request context before error)
grep -B2 "500 Internal Server Error" /var/log/nginx/access.log
```

---

## Multiple Patterns

```bash
# Match either pattern (OR)
grep -E "ERROR|FATAL|CRITICAL" /var/log/app.log

# Match both patterns (AND) — pipe two greps
grep "ERROR" /var/log/app.log | grep "database"

# Multiple patterns from file
grep -f /tmp/patterns.txt /var/log/app.log
```

---

## Extended Regex (-E)

```bash
# Match ERROR or WARN
grep -E "ERROR|WARN" /var/log/app.log

# Match lines starting with a timestamp
grep -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}" /var/log/app.log

# Match IP addresses
grep -E "[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}" /var/log/nginx/access.log

# Match HTTP 5xx errors in nginx access log
grep -E '" [5][0-9]{2} ' /var/log/nginx/access.log
```

---

## Real Examples

### Find all errors in log files from today

```bash
# Assuming log format starts with date
grep "$(date +%Y-%m-%d)" /var/log/app.log | grep -i "error\|fatal"
```

### Find failed SSH logins

```bash
grep "Failed password" /var/log/auth.log

# With count per IP
grep "Failed password" /var/log/auth.log \
  | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
  | sort | uniq -c | sort -rn | head -10
```

### Search nginx access log for slow responses

```bash
# Last field is response time if configured
grep " 200 " /var/log/nginx/access.log | awk '$NF > 2.0' | wc -l
# Count responses over 2 seconds
```

### Find which config file has a specific setting

```bash
grep -r "worker_processes" /etc/nginx/
# /etc/nginx/nginx.conf:worker_processes auto;
```

### Search compressed log files

```bash
# zgrep works on .gz files without decompressing
zgrep "ERROR" /var/log/app/app.log.gz

# Search current + all rotated logs
grep "ERROR" /var/log/app.log*
zgrep "ERROR" /var/log/app.log.*.gz
```

---

## Output Formatting

```bash
# Only show matching part (not whole line)
grep -o "ERROR.*" /var/log/app.log | head -10

# Highlight matches (color)
grep --color=always "ERROR" /var/log/app.log | less -R

# With filename prefix (default for multi-file search)
grep "error" /var/log/*.log

# Without filename prefix (for single file piped output)
grep -h "error" /var/log/app.log

# Show only filename
grep -l "critical" /var/log/*.log
```

---

## Common Mistakes

**Mistake 1: Not quoting patterns with spaces or special chars**
```bash
grep "connection refused" file.log    # CORRECT — quoted
grep connection refused file.log       # WRONG — "refused" is treated as filename
```

**Mistake 2: Slow recursive search on /var/log**
`grep -r "pattern" /` reads every file. Limit the scope:
```bash
grep -r "error" /var/log/app/    # specific directory
grep -r --include="*.log" "error" /var/log/    # specific extension
```

**Mistake 3: Using grep to count unique values**
```bash
grep -c "error" file    # counts LINES with "error", not unique errors
grep "error" file | sort | uniq -c    # count per unique error message
```

**Mistake 4: Forgetting `-E` for extended regex**
`grep "error|fatal"` looks for literal "error|fatal". Use `grep -E "error|fatal"` for OR.

---

## Quick Reference

```bash
grep "pattern" file              # basic search
grep -i "pattern" file           # case-insensitive
grep -r "pattern" dir/           # recursive
grep -n "pattern" file           # line numbers
grep -c "pattern" file           # count
grep -v "pattern" file           # invert (exclude)
grep -l "pattern" files          # only filenames
grep -A3 "pattern" file          # 3 lines after
grep -B3 "pattern" file          # 3 lines before
grep -E "pat1|pat2" file         # OR pattern
grep -rn --include="*.py" "func" # recursive, specific extension
zgrep "pattern" file.gz          # search compressed file
```

---

## Conclusion

`grep` with `-r` for directories, `-i` for case-insensitive, `-n` for line numbers, `-E` for regex with `|`. Combine with `sort | uniq -c | sort -rn` to count and rank unique patterns. For log analysis specifically, pipe chains like `grep "ERROR" | grep "database" | wc -l` answer specific questions quickly.

---

*Related: [Linux Log Analysis: Debug Issues Like a Senior Engineer](/blog/linux-log-analysis-debugging-guide) — grep in the context of full log investigation. [How to Monitor Real-Time Logs Linux](/blog/monitor-real-time-logs-linux-guide) — combining grep with tail -f.*
