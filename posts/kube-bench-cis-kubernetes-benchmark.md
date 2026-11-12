---
title: "Running the CIS Kubernetes Benchmark With kube-bench"
seoTitle: "kube-bench Tutorial: CIS Kubernetes Benchmark, Tested"
date: "2026-11-12"
updated: "2026-11-12"
excerpt: "Audit a Kubernetes cluster against the CIS Benchmark with kube-bench: run it, read PASS/FAIL/WARN, fix the failures, and what a lab cluster can't show."
tags: ["security", "kubernetes", "infrastructure", "security-ops"]
featured: false
category: "security"
lab: true
---

CIS hardening usually stops at the operating system — [RHEL](/blog/cis-rhel-level1-hardening), [Ubuntu](/blog/cis-level1-ubuntu-hardening), scanned with [OpenSCAP](/blog/openscap-cis-scanning-guide). But a Kubernetes control plane has its own CIS benchmark: API server flags, etcd file ownership, kubelet config, audit logging. None of that shows up in an OS scan. `kube-bench` is the tool that checks it.

I spun up a real cluster and ran it. This covers the setup, how to read the output, which failures actually matter, and — the part most tutorials skip — what a lab cluster genuinely can't tell you about your production one.

> **Lab environment:** a single-node **kind v0.33.0** cluster running **`kindest/node:v1.37.0`** (Kubernetes 1.37) on Docker via Colima, audited with **kube-bench v0.16.0** (the `aquasec/kube-bench` image) against the CIS Kubernetes Benchmark. Result: **63 PASS, 12 FAIL, 56 WARN**. Every number below is from that run.

---

## Spin up a target cluster

Any cluster works; [kind](https://kind.sigs.k8s.io/) gives you a throwaway one in a container in under a minute.

```bash
kind create cluster --name cis-lab --image kindest/node:v1.37.0
kubectl get nodes
```

![Terminal: kind creates the cis-lab cluster (preparing nodes, starting control-plane, installing CNI and StorageClass), then kubectl get nodes shows a single Ready control-plane node running Kubernetes v1.37.0](/images/kube-bench-01-create.jpg)

kind runs the whole control plane inside one container that is both the control-plane and the worker node, which is exactly what kube-bench needs to reach: the static pod manifests in `/etc/kubernetes/manifests`, the kubelet config, and the etcd data directory.

---

## Run kube-bench

kube-bench runs *inside* the cluster as a Job, mounted onto the node's filesystem so it can read those config files. The project ships a ready job manifest:

```bash
curl -sLO https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml
kubectl apply -f job.yaml
kubectl wait --for=condition=complete job/kube-bench --timeout=180s
kubectl logs job/kube-bench
```

![Terminal: kubectl apply creates the kube-bench job, kubectl wait reports the job condition met, and kubectl get pods shows the kube-bench pod Completed](/images/kube-bench-02-run.jpg)

The job uses `hostPID` and host mounts to inspect the node. On a real multi-node cluster you run the master checks on control-plane nodes and the node checks on workers; kube-bench auto-detects what it's running on and picks the right set.

---

## Read the output

Every check returns one of four states, and the distinction matters more than the raw count:

- **`[PASS]`** — the control is in place.
- **`[FAIL]`** — an **automated** check that failed. This is config you can see and fix.
- **`[WARN]`** — almost always a **manual** check. kube-bench can't verify it automatically (RBAC intent, network policy coverage, whether a namespace scheme exists), so it hands you the control to check yourself. A WARN is homework, not a pass.
- **`[INFO]`** — informational.

```text
[FAIL] 1.2.16 Ensure that the --audit-log-path argument is set (Automated)
[WARN] 1.2.20 Ensure that the --request-timeout argument is set (Manual)
```

![Terminal: filtered kube-bench output showing PASS lines for authorization-mode checks, FAIL lines for 1.2.15 profiling and 1.2.16/1.2.17 audit-log settings, a Manual WARN for 1.2.20, and the Remediations section explaining how to set --audit-log-path in the kube-apiserver manifest](/images/kube-bench-03-findings.jpg)

Each failure comes with a remediation block that tells you the exact file and flag — for the control plane, that's almost always editing a static pod manifest under `/etc/kubernetes/manifests/` and letting the kubelet restart the pod.

---

## The result

![Terminal: kube-bench summary by section — master 39 PASS / 10 FAIL / 11 WARN, etcd 7 PASS, controlplane 5 WARN, node 17 PASS / 2 FAIL / 6 WARN, policies 34 WARN, total 63 PASS / 12 FAIL / 56 WARN](/images/kube-bench-04-summary.jpg)

The 12 automated failures cluster into four real issues:

- **Audit logging is off** (`1.2.16`–`1.2.19`). The API server isn't writing an audit log, so there's no record of who did what. On a server you run, this is the first thing to fix — set `--audit-log-path` and the retention flags.
- **Profiling is enabled** (`1.2.15`, `1.3.2`, `1.4.1`). The API server, controller-manager and scheduler expose Go `pprof` endpoints. Set `--profiling=false` unless you're actively debugging.
- **File permissions and ownership** (`1.1.12` etcd data dir, `4.1.1` kubelet service file, `4.1.9` kubelet config). Tighten to `600` / correct owner.
- **TLS and tokens** (`1.2.5` missing `--kubelet-certificate-authority`, `1.2.30` long-lived service-account tokens).

On a self-managed (kubeadm) cluster you fix these by editing the manifests kube-bench names, then re-running the job to confirm. With a hundred-plus findings on a bigger benchmark, the same [LLM-triage approach from the OpenSCAP post](/blog/llm-triage-openscap-cis-report) applies — cluster them, order by risk, generate nothing blindly.

---

## What a kind cluster can't tell you

This is the honest caveat. The numbers above are for a **kind lab**, and they do not transfer straight to production:

- **56 WARN is mostly manual policy work.** The entire `policies` section (34 WARN) and the `controlplane` section (5 WARN) are checks kube-bench can't automate: RBAC least-privilege, Pod Security Standards, NetworkPolicy coverage, namespace segregation. A clean automated run says nothing about them. They are the checks that actually keep a cluster safe, and they're all on you.
- **kind isn't hardened like kubeadm.** kind optimises for fast local clusters, so some defaults (and therefore some failures) differ from a real `kubeadm` install. Use kind to learn the tool and the workflow, not as your production baseline.
- **Managed clusters hide the control plane.** On EKS, GKE or AKS you don't own the API server or etcd, so the master checks don't apply. kube-bench has provider-specific targets (`--benchmark eks-1.x`, `gke`, `aks`) that check only what you control — the nodes, RBAC and workloads. Running the default benchmark against a managed cluster gives you a report full of irrelevant failures.

So: run kube-bench against self-managed nodes with the matching benchmark, treat the WARNs as the real policy backlog, and never read a lab cluster's score as your production posture.

---

## FAQ

**Does kube-bench change anything?**
No. Like OpenSCAP's `oscap`, it's read-only — it reports against the CIS Kubernetes Benchmark. You apply the fixes yourself by editing manifests and config.

**What's the difference between FAIL and WARN?**
FAIL is an automated check that failed — visible, fixable config. WARN is a manual check kube-bench can't verify for you; it's a control you must confirm by hand. Don't treat WARNs as passes.

**Can I run it on EKS / GKE / AKS?**
Yes, with the provider benchmark (`kube-bench --benchmark eks-1.5.0`, etc.). The managed control plane is the provider's responsibility, so those targets skip the master checks and focus on nodes, RBAC and workloads.

**Is a kind cluster good enough to test against?**
For learning kube-bench and the node-level checks, yes. For a compliance baseline, no — test against a cluster built the way production is (kubeadm or your managed provider).

**How do I gate this in CI?**
Run the kube-bench job against an ephemeral cluster and fail the pipeline on the FAIL count (kube-bench can emit JSON with `--json` for parsing). Keep manual WARNs as tracked policy work, not a build blocker.

---

*Related: [OpenSCAP scanning guide](/blog/openscap-cis-scanning-guide) and [triaging a CIS report with an LLM](/blog/llm-triage-openscap-cis-report) for the OS-level equivalent. [CIS RHEL Level 1 hardening](/blog/cis-rhel-level1-hardening) and [CIS Level 1 Ubuntu hardening](/blog/cis-level1-ubuntu-hardening) for the nodes underneath. [Linux security hardening guide](/blog/linux-security-hardening-guide) for the rollout order.*
