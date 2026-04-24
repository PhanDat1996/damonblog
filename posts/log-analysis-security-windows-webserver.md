---
title: "Log Analysis for Security Investigations: Windows Event Logs and Web Server Access Logs"
date: "2026-04-24"
excerpt: "A practical guide to log analysis for security investigations — Windows Event Viewer, critical Event IDs, Apache access log parsing, and the Linux command-line tools that make manual log analysis fast and effective."
tags: ["security", "linux", "logs", "incident", "troubleshooting", "debugging"]
featured: false
category: "security"
---

Attackers are careful. They move quietly, minimize their footprint, and avoid triggering obvious alerts. But no matter how careful they are, they leave traces — and those traces end up in logs.

Logs are the foundation of every security investigation. They're how you reconstruct what happened, in what order, and from where. Without them, incident response is guesswork. With them, you can trace an attacker's path through a system and, in many cases, identify who was behind it.

This guide covers practical log analysis for two of the most important log sources you'll encounter: **Windows Event Logs** and **web server access logs**.

---

## TL;DR

```
Windows Event Logs   → use Event Viewer + filter by Event ID
Web server logs      → use cat, grep, less for manual analysis
Key Event IDs        → 4624 (login), 4625 (failed login), 4720 (account created)
Apache access log    → /var/log/apache2/access.log
```

---

## What Logs Actually Are

Every activity on a system leaves a digital trace. A user authenticates — logged. A service crashes — logged. A web request hits your server — logged. Logs are the automated record of these events, written continuously in the background whether anything is wrong or not.

The challenge isn't that logs don't exist — it's that there are too many of them. A busy production system generates thousands of log entries per hour. Finding the relevant ones requires knowing where to look and how to filter.

Logs serve several distinct purposes in a security context:

| Use Case | What You're Looking For |
|---|---|
| **Security Monitoring** | Anomalous behavior in real time — logins at unusual hours, access from unexpected IPs |
| **Incident Investigation** | Root cause analysis after something goes wrong — what happened, when, from where |
| **Troubleshooting** | Application errors, failed service starts, driver issues |
| **Performance Monitoring** | Latency spikes, resource exhaustion, error rate increases |
| **Auditing & Compliance** | User activity trails for regulatory requirements (PCI-DSS, HIPAA, SOC 2) |

---

## Types of Logs

Before you can analyze logs, you need to know which log file contains the information you're after. Logs are categorized by what they record:

| Log Type | What It Contains | When to Use It |
|---|---|---|
| **System Logs** | OS activity: startup/shutdown, driver loading, hardware events | Service failures, boot issues |
| **Security Logs** | Authentication, authorization, account changes, policy changes | Login investigations, privilege escalation |
| **Application Logs** | App-specific events: errors, updates, user interactions | App crashes, unexpected behavior |
| **Audit Logs** | Data access, system changes, user activity | Compliance, change tracking |
| **Network Logs** | Inbound/outbound traffic, firewall events | Lateral movement, C2 communication |
| **Access Logs** | Web server, database, API access | Web attacks, scraping, unauthorized access |

Knowing this upfront saves time. If you're investigating a failed login attempt, go straight to Security Logs — not System, not Application.

---

## Windows Event Log Analysis

Windows logs security-relevant events in several segregated log files. The three most important:

- **Security** — authentication, account changes, policy changes. The primary log for security investigations.
- **System** — OS operations, driver issues, service starts/stops. Useful for understanding system state during an incident.
- **Application** — events from applications running on the OS. Useful for application-layer issues.

### Event Viewer

Windows ships with **Event Viewer** (`eventvwr.msc`) — a GUI for browsing and filtering event logs. Open it from Start, navigate to **Windows Logs**, and select the log category you need.

Each event contains four key fields:

- **Event ID** — a unique numeric identifier for the specific activity type
- **Description** — detailed information about what happened
- **Logged** — exact timestamp of the event
- **Log Name** — which log file it came from

### Critical Event IDs

You don't need to memorize all Event IDs — there are thousands. But these are the ones that appear in nearly every security investigation:

| Event ID | Event | Why It Matters |
|---|---|---|
| **4624** | Successful login | Baseline for normal access; anomalies indicate unauthorized access or lateral movement |
| **4625** | Failed login | Brute-force attempts show up as repeated 4625s from the same source |
| **4634** | Successful logoff | Used with 4624 to establish session duration |
| **4720** | User account created | Attackers create accounts for persistence |
| **4722** | User account enabled | Re-enabling a disabled account is a common persistence technique |
| **4724** | Password reset attempt | May indicate account takeover |
| **4725** | User account disabled | Could be legitimate or an attacker disrupting access |
| **4726** | User account deleted | Clean-up activity post-compromise |

### Filtering by Event ID

Event Viewer's **Filter Current Log** feature lets you narrow down to specific Event IDs. In the filter dialog, enter the Event ID you want (e.g., `4624`) and click OK. The view will show only events matching that ID.

For investigating a specific incident:

1. Navigate to **Security** log
2. Click **Filter Current Log** in the right panel
3. Enter the relevant Event ID (e.g., `4625` for failed logins)
4. Sort by timestamp to establish chronology
5. Cross-reference with `4624` entries to see if failed attempts preceded a successful one

---

## Web Server Access Log Analysis

Every HTTP request to a web server is recorded in its access log. For Apache, this is typically at:

```bash
/var/log/apache2/access.log
```

Each line represents one request. A standard Apache access log entry looks like:

```
172.16.0.1 - - [06/Jun/2024:13:58:44] "GET /products HTTP/1.1" 404 "-" "Mozilla/5.0 ..."
```

Breaking that down:

| Field | Example | What It Tells You |
|---|---|---|
| **IP Address** | `172.16.0.1` | Where the request originated |
| **Timestamp** | `[06/Jun/2024:13:58:44]` | When the request was made |
| **HTTP Method** | `GET` | What action was requested |
| **URL** | `/products` | Which resource was accessed |
| **Status Code** | `404` | How the server responded |
| **User-Agent** | `Mozilla/5.0 ...` | Client OS, browser, and sometimes tooling |

Status codes are particularly useful for triage:

- `200` — successful request
- `404` — resource not found (could indicate scanning or path traversal attempts)
- `500` — server error (application-level failures)
- `403` — forbidden (access control working, or misconfigured)
- `401` — unauthorized (authentication required)

---

## Linux Command-Line Tools for Log Analysis

For manual analysis of web server logs (or any text-based log), three tools do most of the work.

### cat — view and combine logs

Display a log file:

```bash
cat /var/log/apache2/access.log
```

Combine multiple log files (useful when logs have been rotated):

```bash
cat access.log access.log.1 > combined.log
```

### grep — search for specific patterns

Find all requests from a specific IP:

```bash
grep "192.168.1.1" access.log
```

Find all 404 responses:

```bash
grep " 404 " access.log
```

Find POST requests (common in web attacks — form submissions, file uploads, SQL injection attempts):

```bash
grep "POST" access.log
```

Combine filters — all 404s from a specific IP:

```bash
grep "192.168.1.1" access.log | grep " 404 "
```

Count occurrences of a pattern:

```bash
grep -c "192.168.1.1" access.log
```

### less — navigate large files

When a log file is too large to scroll through with `cat`:

```bash
less access.log
```

Navigation:
- `Space` — next page
- `b` — previous page
- `/pattern` — search forward for a pattern
- `n` — next match
- `N` — previous match
- `q` — quit

For an active investigation, start with `grep` to filter down to relevant lines, then pipe to `less` if the output is still large:

```bash
grep "192.168.1.1" access.log | less
```

---

## Investigation Workflow: Putting It Together

**Scenario:** You suspect an attacker scanned your web server and then successfully authenticated.

```bash
# Step 1: Find IPs generating a high volume of 404s (scanning behavior)
grep " 404 " access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -20

# Step 2: Investigate a specific suspicious IP
grep "203.0.113.45" access.log | less

# Step 3: Check if that IP later made successful requests
grep "203.0.113.45" access.log | grep " 200 "

# Step 4: Look for POST requests from that IP (login attempts, form submissions)
grep "203.0.113.45" access.log | grep "POST"

# Step 5: Cross-reference with Windows Security log for Event ID 4625 (failed logins)
# in Event Viewer, filter Security log for 4625 during the same timeframe
```

On the Windows side, correlate the timestamps from the access log with Event Viewer entries. If the web requests precede a 4624 (successful login) with an unusual source IP, you have a likely attack chain.

---

## Common Mistakes

**Looking at the wrong log file.** Security events are in the Security log, not System. Access patterns are in the web server access log, not the application log. Know which file contains what before you start.

**No timestamp correlation.** Logs from different sources use different timezone settings. Verify that your timestamps are comparable before drawing conclusions about sequence of events.

**Ignoring log rotation.** Most systems rotate logs daily or weekly. If you're investigating an incident from three days ago, the relevant log may be in `access.log.3.gz`, not `access.log`. Check `/var/log/apache2/` for rotated files.

**Trusting User-Agent strings.** User-Agent is client-supplied and trivially spoofed. Useful as a signal but not reliable as evidence on its own.

**Missing the relationship between events.** A single 4625 (failed login) is noise. Two hundred 4625s from the same IP in five minutes followed by a 4624 is an incident. Log analysis is about patterns, not individual entries.

---

## Related

- [Log Analysis in Production: Incident Triage Workflow](/blog/log-analysis-incident-triage)
- [journalctl Filter by Time Range](/blog/journalctl-filter-time-range)
- [How to Search Text in Files with grep](/blog/search-text-in-files-linux-grep)
- [Linux Log Analysis Guide](/blog/linux-log-analysis-guide)
- [Monitor Real-Time Logs in Linux](/blog/monitor-real-time-logs-linux)