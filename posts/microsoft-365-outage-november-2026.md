---
title: "The Microsoft 365 Outage of November 12–13, 2026: What Broke and What Admins Should Check"
seoTitle: "Microsoft 365 Outage Nov 2026: Timeline, Cause, Admin Checklist"
date: "2026-11-14"
updated: "2026-11-14"
excerpt: "Exchange Online, Outlook, Teams scheduling and Copilot were down for most of a day. Here's the timeline, what Microsoft says caused it, and the post-incident checks worth running on your tenant."
tags: ["security", "security-ops", "incident", "infrastructure", "monitoring"]
featured: false
category: "security"
---

On Thursday, November 12, 2026, Exchange Online started refusing mailbox connections in the Americas. By early afternoon Eastern time, Downdetector had roughly 130,000 Outlook reports, and the problem had spread to Teams scheduling, Copilot, Planner, To Do, Defender XDR and the admin tooling. It took Microsoft close to 24 hours to get most tenants back.

Microsoft says it was not an attack: a fault introduced during an earlier network capacity upgrade, which pulled servers out of service until the remaining ones collapsed under the load. This post pieces together the timeline from Microsoft's status updates (as quoted by the press), explains the failure pattern, and lists what I'd check on a tenant now that it's over.

> **Sources and caveats:** I did not have tenant-level access to Microsoft's incident record. The timeline below comes from Microsoft 365 Status posts as quoted by [CyberSecurityNews](https://cybersecuritynews.com/massive-microsoft-365-outage/), [Petri](https://petri.com/microsoft-deploys-patch-stabilize-microsoft-365-outage/), [MacRumors/AP](https://www.macrumors.com/2026/11/13/major-microsoft-365-outage-continues/) and others. Where outlets disagree on a time or a number, I say so. Microsoft has promised a post-incident report; when it lands, it overrides anything here.

---

## The short version

| | |
|---|---|
| **Incident IDs** | `EX1550543` (Exchange Online mailbox access), `MO1550821` (wider M365 advisory) |
| **Started** | ~16:17–16:20 UTC, Thu Nov 12 (internal); public reports spiked ~17:40 UTC |
| **Broad recovery** | Fri Nov 13, early-to-mid afternoon UTC; incident still open at 17:50 UTC |
| **Worst hit** | Exchange Online / Outlook (web, desktop, mobile, and Exchange accounts in other clients) |
| **Also affected** | Teams (scheduling, invites, calendar), Copilot, Planner, To Do, Defender XDR, admin centers, some SharePoint functions |
| **Cause (Microsoft)** | A technical issue introduced during an earlier network capacity upgrade |
| **Cyberattack?** | No — Microsoft said it was "not related to cyber or AI / agents" |

## What users actually saw

The core failure was mailbox access. Outlook on every platform either couldn't connect or sat in "Trying to connect…", and anything that talks to Exchange Online — Apple Mail with an Exchange account, mobile clients, the Graph-backed bits of other apps — failed with it.

Teams was the confusing one. Chat, calls and most meetings kept working, so people assumed Teams was fine, but **anything that touched the calendar** — scheduling a meeting, sending an invite, editing an event — failed, because Teams calendar is Exchange underneath. Copilot chats, Planner and To Do (also Exchange-backed) broke the same way.

SharePoint was only partly affected. Files stored directly in SharePoint stayed reachable, which is why some teams fell back to sharing links instead of attachments.

For admins, the painful part was that the **tools you'd use to investigate were degraded too**: the Microsoft 365 admin center, Defender XDR and parts of Intune and Purview were listed among impacted services by [Petri](https://petri.com/microsoft-deploys-patch-stabilize-microsoft-365-outage/).

## Timeline (UTC)

All times are UTC. Eastern time on Nov 12–13 is UTC−5. Status text is paraphrased from Microsoft posts as reported by the press; a few timestamps differ by 10–25 minutes between outlets.

**Thursday, Nov 12**

- **16:17–16:20** — Incident begins; `EX1550543` opened for Exchange Online mailbox access.
- **~17:40** — Outlook reports start climbing on Downdetector.
- **17:54** — First public status post: users in the Americas can't reach Exchange Online mailboxes.
- **~18:10** — Downdetector peaks at roughly 130,000 Outlook reports (AP's figure; one outlet cites up to ~140,000 at 18:30).
- **18:35** — Microsoft points to elevated load on part of its infrastructure across several regions.
- **19:12** — All deployments paused; traffic moved off affected systems; servers restarted.
- **19:31** — Microsoft says this is *not* a traffic surge — servers are unexpectedly unavailable.
- **19:50** — Servers are failing automated health checks and being pulled from rotation.
- **20:19** — No recent change lines up with the start time; the health-check component is suspected.
- **21:00** — An alternative health-check method brings some servers back; rolled out more widely.
- **22:09** — A core process on the remaining servers is overwhelmed.
- **23:56** — Microsoft tells reporters there is no indication of a cyberattack.

**Friday, Nov 13**

- **00:06** — Restored servers fall over again once traffic hits them; traffic limited in some locations.
- **01:59** — Restarting parts of the infrastructure in isolation shows positive results.
- **03:13** — Latest changes "not working as planned."
- **04:36–05:01** — Partial recovery in some regions doesn't hold; some machines are stuck in a faulty state and won't accept changes.
- **~07:00** — Extra VMs added for capacity. Downdetector still shows tens of thousands of reports across 72 countries.
- **07:25** — A patch to part of the infrastructure improves stability; extended to all regions in use.
- **09:24** — Early stabilization. **Email timeout window extended to 48 hours** so queued mail isn't bounced.
- **10:28–11:11** — Recovery "moving in phases"; mailbox access and delayed mail improving.
- **12:09–13:32** — Europe recovers first, North America follows, early signs in Asia-Pacific.
- **14:17** — Mail queues approaching normal levels.
- **~17:00–18:10** — Microsoft apologizes and names the cause (outlets differ on the exact time).
- **17:50** — Broad recovery reported; underlying issue fixed; incident not yet closed.

## What caused it

Microsoft's own explanation, as quoted by Petri, is short: a technical issue introduced by a problem during an **earlier network capacity upgrade**, not related to cyber activity or AI agents, and the underlying issue has been addressed.

The status updates in between describe the failure pattern, and it's a classic one:

1. Something in the network path changed (the capacity upgrade).
2. Servers started **failing automated health checks** and the load balancers pulled them out of service.
3. The servers still in rotation picked up their traffic. A **core process on those servers was overwhelmed**.
4. Overloaded servers failed health checks too, and were pulled. Repeat.

That's a cascading failure driven by the health-check loop itself. It also explains the frustrating middle of the timeline: every time Microsoft restored a batch of servers, the full weight of queued traffic landed on them at once and they failed again (00:06 UTC Friday). Recovery only stuck once Microsoft **limited incoming traffic**, **added capacity**, patched the faulty component, and brought regions back **in phases** rather than all at once.

Two details worth noting:

- Microsoft initially said **no recent change matched the start time**. The final cause points to an *earlier* upgrade — a latent fault that surfaced later. That's why "what did we deploy in the last hour?" didn't find it.
- Some reporting (The Verge, citing sources) tied it to Azure Virtual Network configuration changes, and Petri describes the fix as a patch to an "upstream authentication and routing component." Microsoft hasn't confirmed either detail publicly. Wait for the post-incident report before quoting them as fact.

## Was it a cyberattack?

No, by every statement available. A Microsoft spokesperson said Thursday evening there was no indication of a cyberattack; overnight status posts said Microsoft was not aware of malicious activity; and Friday's root-cause statement explicitly ruled out cyber and AI/agent causes. Australia's home affairs minister said the same after a government briefing.

That doesn't mean there's no security angle. A day-long M365 outage is exactly the moment attackers send **"your mailbox has been suspended — click to restore"** emails, and exactly the moment stressed admins and users cut corners. That's what the checklist below is for.

## Post-incident checklist for M365 admins

**1. Read the incident on your own tenant.** Go to **Microsoft 365 admin center → Health → Service health** and open `EX1550543` and `MO1550821`. The public timeline above is global; the tenant view tells you which regions and features hit *you*. If the admin center itself is flaky, [status.cloud.microsoft](https://status.cloud.microsoft) is the fallback. Watch for the post-incident report (PIR) there — save it, you'll want it for the SLA conversation.

**2. Check mail flow, not just mailbox access.** Microsoft held messages for up to 48 hours instead of bouncing them, so a lot of mail arrived late in a burst on Friday.

```powershell
Connect-ExchangeOnline

# Inbound/outbound mail during the outage window — look for Pending/Deferred/Failed
Get-MessageTraceV2 -StartDate "2026-11-12 16:00" -EndDate "2026-11-14 00:00" `
  -Status Failed -ResultSize 5000 |
  Select Received, SenderAddress, RecipientAddress, Subject, Status |
  Sort Received
```

Run it again with `-Status Pending` and `-Status Deferred`. Anything still failing after Friday afternoon is worth chasing — it either bounced back to the sender (they may not have resent) or is stuck in a connector you own (hybrid, third-party filtering, relay).

**3. Look at what *your* security stack missed.** Defender XDR and Defender for Office 365 were degraded. Alerts, detonations and ZAP actions may have been delayed. Once things are stable:

- Review the Defender XDR incident queue for the window **Nov 12 16:00 UTC → Nov 13 18:00 UTC**, and sort by first activity time, not alert time.
- Check **Threat Explorer / Real-time detections** for mail delivered during the recovery burst on Friday morning — late-delivered mail may have skipped checks that normally run in-line.
- Confirm Intune policy and compliance syncs caught up; devices that couldn't check in may show stale compliance.

**4. Hunt for "outage recovery" phishing.** Search for lures that ride the news:

```kql
EmailEvents
| where Timestamp between (datetime(2026-11-12 16:00) .. datetime(2026-11-15))
| where Subject has_any ("mailbox", "suspended", "restore", "reactivate", "outage", "service interruption", "verify your account")
| where DeliveryAction == "Delivered"
| project Timestamp, SenderFromAddress, RecipientEmailAddress, Subject, UrlCount, ThreatTypes
| order by Timestamp desc
```

Then tell users plainly: Microsoft does not send emails asking them to "restore" or "re-verify" their mailbox after an outage.

**5. Undo the workarounds.** During the outage people did things to keep working. Find and reverse them:

- **Conditional Access / MFA:** did anyone add a temporary exclusion or relax a policy to "fix" sign-in errors that were actually Exchange errors? Check Entra **Audit logs** for policy changes in the window.
- **Personal accounts:** files sent from Gmail or personal Outlook.com, auto-forwarding rules users created to keep receiving mail, Teams chats moved to WhatsApp. Check for new forwarding rules:

```powershell
Get-Mailbox -ResultSize Unlimited | Get-InboxRule |
  Where-Object { $_.ForwardTo -or $_.ForwardAsAttachmentTo -or $_.RedirectTo } |
  Select MailboxOwnerId, Name, ForwardTo, RedirectTo, Enabled
```

- **Local fixes that don't apply:** rebuilt Outlook profiles, cached-mode toggles, DNS overrides, hosts-file entries. None of them helped — the fault was on Microsoft's side — and some will cause their own tickets later.

**6. Write down what the outage cost you.** Hours without mail, missed meetings, delayed alerts. If your tenant falls below the monthly uptime commitment in the [Microsoft Online Services SLA](https://www.microsoft.com/licensing/docs/view/Service-Level-Agreements-SLA-for-Online-Services), credits are not automatic — your admin or partner has to file a claim with the incident IDs and impact.

## What to take from it

- **Health checks can take you down.** An aggressive health check that removes servers under load turns a partial failure into a total one. If you run anything behind a load balancer, know what happens when *half* your backends fail checks at once — does the rest of the pool survive the shift, or does it cascade?
- **Recover with a throttle.** Microsoft's restored servers failed again the moment full traffic returned. Phased, rate-limited recovery is slower on paper and faster in practice.
- **Latent changes hide.** "No recent change matches" was true and misleading. When you correlate an incident with deployments, widen the window past the last hour.
- **Have an out-of-band channel.** If your incident response, on-call paging and user comms all live in Exchange and Teams, an M365 outage blinds you exactly when you need to talk. Keep a phone tree, an SMS tool, or a status page that doesn't depend on the thing that's down.
- **Outages are a security event even when they aren't an attack.** Delayed detections, relaxed controls and opportunistic phishing all cluster around them. Treat the week after as a review period, not "back to normal."

I'll update this post when Microsoft publishes the post-incident report.
