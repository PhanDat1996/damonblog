---
title: "Linux sort Command: Real Usage Examples"
date: "2026-04-22"
excerpt: "Use the Linux sort command effectively — sort by column, numerically, by size, reverse order, deduplicate, and combine with other commands for real log and data analysis."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
slug: "linux-sort-command-real-usage-examples"
category: "linux"
---

`sort` by itself isn't particularly useful. Combined with `grep`, `awk`, `uniq`, and pipes — it's one of the most powerful tools in a sysadmin's toolkit for log analysis, reporting, and finding patterns in data.

---

## TL;DR

```bash
sort file.txt                   # alphabetical sort
sort -n file.txt                # numeric sort
sort -rn file.txt               # reverse numeric (largest first)
sort -k2 file.txt               # sort by column 2
sort -u file.txt                # sort and deduplicate
sort -h file.txt                # human-readable sizes (1K, 5M, 2G)
```

---

## Basic Sorting

```bash
# Alphabetical (default)
sort /etc/hosts

# Reverse alphabetical
sort -r /etc/hosts

# Numeric sort (-n matters for numbers)
echo -e "10\n2\n100\n5" | sort     # wrong: 10, 100, 2, 5
echo -e "10\n2\n100\n5" | sort -n  # correct: 2, 5, 10, 100

# Reverse numeric (largest first)
echo -e "10\n2\n100\n5" | sort -rn  # 100, 10, 5, 2
```

---

## Sort by Column

```bash
# Sort by the second whitespace-separated column
sort -k2 file.txt

# Sort by column 3 numerically
sort -k3 -n file.txt

# Sort by column 2, then by column 1 as tiebreaker
sort -k2,2 -k1,1 file.txt

# Sort by specific character positions in a column
sort -k2.3,2.5 file.txt   # characters 3-5 of column 2
```

---

## Sort Human-Readable Sizes

```bash
# -h: understands K, M, G (crucial for du output)
du -sh /var/log/* | sort -rh | head -10

# -h is wrong order without -r? Add -r to get largest first
du -sh /* 2>/dev/null | sort -rh | head
```

---

## Deduplicate with -u and uniq

```bash
# Remove duplicate lines
sort -u file.txt

# Sort then count occurrences (uniq -c)
sort file.txt | uniq -c | sort -rn
# Output: count followed by unique value, sorted by frequency
```

---

## Real Examples

### Top 10 IPs hitting a web server

```bash
awk '{print $1}' /var/log/nginx/access.log \
  | sort | uniq -c | sort -rn | head -10
```

```
   4521 10.0.1.50      ← load balancer (expected)
    342 1.2.3.4        ← investigate this
     89 5.6.7.8
```

### Most common error messages

```bash
grep "ERROR" /var/log/app.log \
  | awk '{$1=$2=$3=""; print $0}' \
  | sed 's/^[[:space:]]*//' \
  | sort | uniq -c | sort -rn | head -20
```

### Sort processes by memory usage

```bash
ps aux --sort=-%mem | head -10
# Or with awk for cleaner output:
ps aux | awk 'NR>1 {print $4, $11}' | sort -rn | head -10
```

### Find most requested URLs

```bash
awk '{print $7}' /var/log/nginx/access.log \
  | sort | uniq -c | sort -rn | head -20
```

### Sort disk usage output

```bash
du -sh /var/* 2>/dev/null | sort -rh
# 38G  /var/log
# 4.2G /var/lib
# 512M /var/cache
```

### Find top SSH users by login count

```bash
grep "Accepted" /var/log/auth.log \
  | awk '{print $9}' \
  | sort | uniq -c | sort -rn
```

### Sort log file by timestamp (if not already ordered)

```bash
sort -k1,2 /var/log/app.log   # sort by first 2 columns (date + time)
```

### Remove duplicate IPs from a blocklist

```bash
sort -u /tmp/blocked-ips.txt > /tmp/blocked-ips-clean.txt
```

---

## Combine sort + uniq Patterns

This combination is extremely powerful for any counted analysis:

```bash
# Basic pattern: extract field → sort → count → sort by count
command | awk '{print $FIELD}' | sort | uniq -c | sort -rn | head

# Examples:
# HTTP status codes
awk '{print $9}' access.log | sort | uniq -c | sort -rn

# Error types
grep ERROR app.log | awk '{print $5}' | sort | uniq -c | sort -rn

# Unique values count
grep pattern file | sort -u | wc -l
```

---

## Sort Options Reference

| Flag | Meaning |
|---|---|
| `-n` | Numeric sort (needed for any numbers) |
| `-r` | Reverse (descending) |
| `-h` | Human-readable numbers (K/M/G) |
| `-k N` | Sort by column N |
| `-u` | Unique (remove duplicates) |
| `-t ','` | Use comma as delimiter (for CSV) |
| `-f` | Case-insensitive |
| `-s` | Stable sort (preserve order of equal lines) |

---

## Common Mistakes

**Mistake 1: Not using `-n` for numbers**
```bash
echo -e "10\n2\n100" | sort     # "10", "100", "2" (lexicographic wrong)
echo -e "10\n2\n100" | sort -n  # "2", "10", "100" (correct)
```

**Mistake 2: Using `sort -n` on human sizes**
```bash
du -sh * | sort -rn   # WRONG: 5M > 1G because 5 > 1
du -sh * | sort -rh   # CORRECT: -h understands K/M/G units
```

**Mistake 3: Piping `sort | uniq -c` without the sort first**
`uniq -c` only collapses adjacent duplicates. Without sorting first, non-adjacent duplicates aren't counted together:
```bash
# WRONG: only counts consecutive duplicates
uniq -c file.txt

# CORRECT: sort brings duplicates together
sort file.txt | uniq -c | sort -rn
```

---

## Quick Reference

```bash
sort file                     # alphabetical
sort -n file                  # numeric
sort -rn file                 # reverse numeric (largest first)
sort -h file                  # human sizes (K/M/G)
sort -rh file                 # reverse human sizes
sort -k2 file                 # by column 2
sort -k2 -n file              # column 2, numeric
sort -u file                  # deduplicate
sort file | uniq -c | sort -rn  # frequency count
du -sh * | sort -rh            # disk usage sorted
```

---

## Conclusion

`sort` alone is basic. `sort | uniq -c | sort -rn` is the pattern that makes it powerful — it turns any field extraction into a frequency ranking. Use `-n` for numbers, `-h` for human-readable sizes, `-k` to sort by a specific column. Combined with `awk` to extract fields from logs, this trio handles most log analysis needs without a dedicated analytics tool.

---

*Related: [How to Search Text in Files Linux: grep Examples](/blog/search-text-in-files-linux-grep-examples) — grep for finding, sort for counting. [Linux Log Analysis: Debug Issues Like a Senior Engineer](/blog/linux-log-analysis-debugging-guide) — sort in the context of full log workflows.*
