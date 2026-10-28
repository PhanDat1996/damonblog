// CKA curriculum content.
//
// Domains, weights and competency wording are copied from the official
// sources listed in CURRICULUM_META. Everything else in this file (summaries,
// doc picks, related DamonSec posts) is DamonSec-authored.
//
// IDs are stable keys for saved progress. When the curriculum changes:
//   - keep an ID if the competency is the same skill with new wording,
//   - add a new ID for a genuinely new competency,
//   - never reuse a removed ID for a different skill.
// Progress saved under an ID that no longer exists is kept in storage but
// ignored by the calculations.

export type DomainId =
  | 'storage'
  | 'troubleshooting'
  | 'workloads-scheduling'
  | 'cluster-architecture'
  | 'services-networking';

export interface DocLink {
  label: string;
  href: string;
}

export interface Skill {
  id: string;
  domainId: DomainId;
  /** Official competency text, verbatim from the curriculum. */
  competency: string;
  /** Short DamonSec-authored description of what to be able to do. */
  focus: string;
  docs: DocLink[];
  /** Slugs of existing posts under /blog. Checked by tests. */
  relatedPosts: string[];
}

export interface Domain {
  id: DomainId;
  name: string;
  /** Exam weight in percent. */
  weight: number;
}

export const CURRICULUM_META = {
  exam: 'Certified Kubernetes Administrator (CKA)',
  kubernetesVersion: 'v1.37',
  curriculumDocument: 'CKA_Curriculum_v1.37.pdf',
  verifiedOn: '2026-10-28',
  sources: [
    {
      label: 'CNCF curriculum repository (CKA_Curriculum_v1.37.pdf)',
      href: 'https://github.com/cncf/curriculum',
    },
    {
      label: 'Linux Foundation CKA exam page',
      href: 'https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/',
    },
  ] satisfies DocLink[],
  notes: [
    'Domains, weights and all 27 competencies matched between the CNCF PDF and the Linux Foundation page on the verification date.',
    'The Linux Foundation page states the exam is based on Kubernetes v1.37. The PDF\'s internal timestamp is from December 2024, so the competency wording has not changed since then; only the version label has.',
    'The PDF titles the networking domain "Servicing and Networking"; the Linux Foundation page uses "Services & Networking", which is used here.',
  ],
} as const;

export const DOMAINS: Domain[] = [
  { id: 'storage', name: 'Storage', weight: 10 },
  { id: 'troubleshooting', name: 'Troubleshooting', weight: 30 },
  { id: 'workloads-scheduling', name: 'Workloads & Scheduling', weight: 15 },
  { id: 'cluster-architecture', name: 'Cluster Architecture, Installation & Configuration', weight: 25 },
  { id: 'services-networking', name: 'Services & Networking', weight: 20 },
];

const K8S = 'https://kubernetes.io/docs';

export const SKILLS: Skill[] = [
  // ── Storage ────────────────────────────────────────────────────────────────
  {
    id: 'storage.storage-classes',
    domainId: 'storage',
    competency: 'Implement storage classes and dynamic volume provisioning',
    focus: 'Create a StorageClass, set or change the default class, and get a PVC provisioned dynamically. Know what volumeBindingMode WaitForFirstConsumer does.',
    docs: [
      { label: 'Storage Classes', href: `${K8S}/concepts/storage/storage-classes/` },
      { label: 'Dynamic Volume Provisioning', href: `${K8S}/concepts/storage/dynamic-provisioning/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'storage.volume-types',
    domainId: 'storage',
    competency: 'Configure volume types, access modes and reclaim policies',
    focus: 'Mount emptyDir, hostPath, ConfigMap and PVC volumes. Pick access modes (RWO, ROX, RWX, RWOP) and explain Retain vs Delete.',
    docs: [
      { label: 'Volumes', href: `${K8S}/concepts/storage/volumes/` },
      { label: 'Persistent Volumes: access modes and reclaim policy', href: `${K8S}/concepts/storage/persistent-volumes/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'storage.pv-pvc',
    domainId: 'storage',
    competency: 'Manage persistent volumes and persistent volume claims',
    focus: 'Create a static PV and a PVC that binds to it, mount the claim in a Pod, and debug a claim stuck in Pending.',
    docs: [
      { label: 'Persistent Volumes', href: `${K8S}/concepts/storage/persistent-volumes/` },
      { label: 'Configure a Pod to use a PersistentVolume', href: `${K8S}/tutorials/configuration/configure-persistent-volume-storage/` },
    ],
    relatedPosts: [],
  },

  // ── Troubleshooting ────────────────────────────────────────────────────────
  {
    id: 'troubleshooting.clusters-nodes',
    domainId: 'troubleshooting',
    competency: 'Troubleshoot clusters and nodes',
    focus: 'Find why a node is NotReady: read node conditions, then check kubelet and the container runtime on the node with systemctl and journalctl.',
    docs: [
      { label: 'Troubleshooting Clusters', href: `${K8S}/tasks/debug/debug-cluster/` },
      { label: 'Nodes: node status', href: `${K8S}/concepts/architecture/nodes/` },
    ],
    relatedPosts: ['systemctl-service-not-starting-fix', 'journalctl-filter-time-range'],
  },
  {
    id: 'troubleshooting.cluster-components',
    domainId: 'troubleshooting',
    competency: 'Troubleshoot cluster components',
    focus: 'Debug the API server, scheduler, controller manager and etcd when they run as static Pods: manifests in /etc/kubernetes/manifests, container logs via crictl.',
    docs: [
      { label: 'Cluster components', href: `${K8S}/concepts/overview/components/` },
      { label: 'Debugging Kubernetes nodes with crictl', href: `${K8S}/tasks/debug/debug-cluster/crictl/` },
      { label: 'Create static Pods', href: `${K8S}/tasks/configure-pod-container/static-pod/` },
    ],
    relatedPosts: ['linux-check-running-services-systemctl'],
  },
  {
    id: 'troubleshooting.resource-usage',
    domainId: 'troubleshooting',
    competency: 'Monitor cluster and application resource usage',
    focus: 'Use kubectl top for nodes and Pods (needs metrics-server), compare usage with requests and limits, and recognise OOMKilled containers.',
    docs: [
      { label: 'Tools for Monitoring Resources', href: `${K8S}/tasks/debug/debug-cluster/resource-usage-monitoring/` },
      { label: 'Resource metrics pipeline', href: `${K8S}/tasks/debug/debug-cluster/resource-metrics-pipeline/` },
    ],
    relatedPosts: ['linux-oom-killer-explained', 'check-cpu-usage-linux', 'top-command-linux-guide'],
  },
  {
    id: 'troubleshooting.container-output',
    domainId: 'troubleshooting',
    competency: 'Manage and evaluate container output streams',
    focus: 'Read logs for a specific container, the previous instance (--previous), all Pods behind a label, and know where node-level logs live.',
    docs: [
      { label: 'Logging Architecture', href: `${K8S}/concepts/cluster-administration/logging/` },
      { label: 'kubectl logs', href: `${K8S}/reference/kubectl/generated/kubectl_logs/` },
    ],
    relatedPosts: ['docker-container-not-starting-fix', 'docker-log-rotation', 'linux-log-analysis-guide'],
  },
  {
    id: 'troubleshooting.services-networking',
    domainId: 'troubleshooting',
    competency: 'Troubleshoot services and networking',
    focus: 'Work through a Service that does not answer: selector vs Pod labels, EndpointSlices, targetPort, DNS name, then NetworkPolicy.',
    docs: [
      { label: 'Debug Services', href: `${K8S}/tasks/debug/debug-application/debug-service/` },
      { label: 'Debugging DNS Resolution', href: `${K8S}/tasks/administer-cluster/dns-debugging-resolution/` },
    ],
    relatedPosts: ['cannot-connect-to-server-linux-troubleshooting', 'test-tcp-connection-linux', 'dns-not-resolving-linux-fix'],
  },

  // ── Workloads & Scheduling ─────────────────────────────────────────────────
  {
    id: 'workloads.deployments-rollouts',
    domainId: 'workloads-scheduling',
    competency: 'Understand application deployments and how to perform rolling update and rollbacks',
    focus: 'Update an image, watch the rollout, read rollout history and undo to a previous revision. Know what maxSurge and maxUnavailable control.',
    docs: [
      { label: 'Deployments', href: `${K8S}/concepts/workloads/controllers/deployment/` },
      { label: 'Performing a Rolling Update', href: `${K8S}/tutorials/kubernetes-basics/update/update-intro/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'workloads.configmaps-secrets',
    domainId: 'workloads-scheduling',
    competency: 'Use ConfigMaps and Secrets to configure applications',
    focus: 'Create ConfigMaps and Secrets from literals and files, consume them as env vars and mounted files, and debug CreateContainerConfigError.',
    docs: [
      { label: 'ConfigMaps', href: `${K8S}/concepts/configuration/configmap/` },
      { label: 'Secrets', href: `${K8S}/concepts/configuration/secret/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'workloads.autoscaling',
    domainId: 'workloads-scheduling',
    competency: 'Configure workload autoscaling',
    focus: 'Create a HorizontalPodAutoscaler (autoscaling/v2) for a Deployment with CPU requests set, and read its status and events.',
    docs: [
      { label: 'Autoscaling Workloads', href: `${K8S}/concepts/workloads/autoscaling/` },
      { label: 'Horizontal Pod Autoscaling', href: `${K8S}/tasks/run-application/horizontal-pod-autoscale/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'workloads.self-healing',
    domainId: 'workloads-scheduling',
    competency: 'Understand the primitives used to create robust, self-healing, application deployments',
    focus: 'Use ReplicaSets via Deployments, liveness, readiness and startup probes, restart policies and PodDisruptionBudgets.',
    docs: [
      { label: 'Liveness, Readiness, and Startup Probes', href: `${K8S}/concepts/configuration/liveness-readiness-startup-probes/` },
      { label: 'ReplicaSet', href: `${K8S}/concepts/workloads/controllers/replicaset/` },
      { label: 'Pod disruption budgets', href: `${K8S}/tasks/run-application/configure-pdb/` },
    ],
    relatedPosts: ['docker-container-not-starting-fix'],
  },
  {
    id: 'workloads.pod-scheduling',
    domainId: 'workloads-scheduling',
    competency: 'Configure Pod admission and scheduling (limits, node affinity, etc.)',
    focus: 'Set requests and limits, LimitRange and ResourceQuota, nodeSelector, node affinity, taints and tolerations; explain why a Pod is Pending.',
    docs: [
      { label: 'Assigning Pods to Nodes', href: `${K8S}/concepts/scheduling-eviction/assign-pod-node/` },
      { label: 'Taints and Tolerations', href: `${K8S}/concepts/scheduling-eviction/taint-and-toleration/` },
      { label: 'Resource Management for Pods and Containers', href: `${K8S}/concepts/configuration/manage-resources-containers/` },
    ],
    relatedPosts: [],
  },

  // ── Cluster Architecture, Installation & Configuration ─────────────────────
  {
    id: 'cluster.rbac',
    domainId: 'cluster-architecture',
    competency: 'Manage role based access control (RBAC)',
    focus: 'Create Roles, ClusterRoles and bindings for users and ServiceAccounts, and check the result with kubectl auth can-i --as.',
    docs: [
      { label: 'Using RBAC Authorization', href: `${K8S}/reference/access-authn-authz/rbac/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'cluster.prepare-infrastructure',
    domainId: 'cluster-architecture',
    competency: 'Prepare underlying infrastructure for installing a Kubernetes cluster',
    focus: 'Install a container runtime, set the required kernel modules and sysctls, open the required ports, and install kubeadm, kubelet and kubectl.',
    docs: [
      { label: 'Installing kubeadm', href: `${K8S}/setup/production-environment/tools/kubeadm/install-kubeadm/` },
      { label: 'Container Runtimes', href: `${K8S}/setup/production-environment/container-runtimes/` },
      { label: 'Ports and Protocols', href: `${K8S}/reference/networking/ports-and-protocols/` },
    ],
    relatedPosts: ['check-open-ports-linux', 'check-firewall-status-linux'],
  },
  {
    id: 'cluster.kubeadm-create',
    domainId: 'cluster-architecture',
    competency: 'Create and manage Kubernetes clusters using kubeadm',
    focus: 'Run kubeadm init, install a CNI, join worker nodes with a fresh token, and know where kubeadm writes certificates and manifests.',
    docs: [
      { label: 'Creating a cluster with kubeadm', href: `${K8S}/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/` },
      { label: 'kubeadm token', href: `${K8S}/reference/setup-tools/kubeadm/kubeadm-token/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'cluster.lifecycle',
    domainId: 'cluster-architecture',
    competency: 'Manage the lifecycle of Kubernetes clusters',
    focus: 'Upgrade a kubeadm cluster one minor version, drain and uncordon nodes, and back up and restore etcd.',
    docs: [
      { label: 'Upgrading kubeadm clusters', href: `${K8S}/tasks/administer-cluster/kubeadm/kubeadm-upgrade/` },
      { label: 'Operating etcd clusters for Kubernetes', href: `${K8S}/tasks/administer-cluster/configure-upgrade-etcd/` },
      { label: 'Safely Drain a Node', href: `${K8S}/tasks/administer-cluster/safely-drain-node/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'cluster.ha-control-plane',
    domainId: 'cluster-architecture',
    competency: 'Implement and configure a highly-available control plane',
    focus: 'Explain stacked vs external etcd, the role of the load balancer in front of the API servers, and join an extra control-plane node.',
    docs: [
      { label: 'Options for Highly Available Topology', href: `${K8S}/setup/production-environment/tools/kubeadm/ha-topology/` },
      { label: 'Creating Highly Available Clusters with kubeadm', href: `${K8S}/setup/production-environment/tools/kubeadm/high-availability/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'cluster.helm-kustomize',
    domainId: 'cluster-architecture',
    competency: 'Use Helm and Kustomize to install cluster components',
    focus: 'Add a Helm repo, install, upgrade and roll back a release with custom values; build and apply a Kustomize overlay with kubectl apply -k.',
    docs: [
      { label: 'Helm documentation', href: 'https://helm.sh/docs/' },
      { label: 'Declarative Management using Kustomize', href: `${K8S}/tasks/manage-kubernetes-objects/kustomization/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'cluster.extension-interfaces',
    domainId: 'cluster-architecture',
    competency: 'Understand extension interfaces (CNI, CSI, CRI, etc.)',
    focus: 'Know what CNI, CSI and CRI plugins do, where their configuration lives on a node, and how to tell which ones a cluster uses.',
    docs: [
      { label: 'Extending Kubernetes', href: `${K8S}/concepts/extend-kubernetes/` },
      { label: 'Network Plugins', href: `${K8S}/concepts/extend-kubernetes/compute-storage-net/network-plugins/` },
      { label: 'Container Runtime Interface (CRI)', href: `${K8S}/concepts/architecture/cri/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'cluster.crds-operators',
    domainId: 'cluster-architecture',
    competency: 'Understand CRDs, install and configure operators',
    focus: 'List and inspect CustomResourceDefinitions, create a custom resource, and install an operator and confirm it reconciles.',
    docs: [
      { label: 'Custom Resources', href: `${K8S}/concepts/extend-kubernetes/api-extension/custom-resources/` },
      { label: 'Operator pattern', href: `${K8S}/concepts/extend-kubernetes/operator/` },
    ],
    relatedPosts: [],
  },

  // ── Services & Networking ──────────────────────────────────────────────────
  {
    id: 'networking.pod-connectivity',
    domainId: 'services-networking',
    competency: 'Understand connectivity between Pods',
    focus: 'Explain the Kubernetes network model (every Pod gets an IP, Pods reach each other without NAT) and test Pod-to-Pod traffic across nodes.',
    docs: [
      { label: 'Cluster Networking', href: `${K8S}/concepts/cluster-administration/networking/` },
      { label: 'Services, Load Balancing, and Networking', href: `${K8S}/concepts/services-networking/` },
    ],
    relatedPosts: ['docker-networking-guide', 'ping-vs-curl-vs-telnet'],
  },
  {
    id: 'networking.network-policies',
    domainId: 'services-networking',
    competency: 'Define and enforce Network Policies',
    focus: 'Write default-deny and allow policies with podSelector, namespaceSelector and ports, for ingress and egress, and test them from client Pods.',
    docs: [
      { label: 'Network Policies', href: `${K8S}/concepts/services-networking/network-policies/` },
    ],
    relatedPosts: [],
  },
  {
    id: 'networking.service-types',
    domainId: 'services-networking',
    competency: 'Use ClusterIP, NodePort, LoadBalancer service types and endpoints',
    focus: 'Expose a Deployment with each Service type, read its EndpointSlices, and reach it from inside and outside the cluster.',
    docs: [
      { label: 'Service', href: `${K8S}/concepts/services-networking/service/` },
      { label: 'EndpointSlices', href: `${K8S}/concepts/services-networking/endpoint-slices/` },
    ],
    relatedPosts: ['check-open-ports-linux'],
  },
  {
    id: 'networking.gateway-api',
    domainId: 'services-networking',
    competency: 'Use the Gateway API to manage Ingress traffic',
    focus: 'Create a Gateway and HTTPRoute that route by host and path to backend Services, and read their status conditions.',
    docs: [
      { label: 'Gateway API (Kubernetes docs)', href: `${K8S}/concepts/services-networking/gateway/` },
      { label: 'Gateway API project site', href: 'https://gateway-api.sigs.k8s.io/' },
    ],
    relatedPosts: [],
  },
  {
    id: 'networking.ingress',
    domainId: 'services-networking',
    competency: 'Know how to use Ingress controllers and Ingress resources',
    focus: 'Create Ingress resources with host and path rules and an ingressClassName, and debug a 404 or 503 from the controller.',
    docs: [
      { label: 'Ingress', href: `${K8S}/concepts/services-networking/ingress/` },
      { label: 'Ingress Controllers', href: `${K8S}/concepts/services-networking/ingress-controllers/` },
    ],
    relatedPosts: ['nginx-troubleshooting-guide', 'nginx-502-bad-gateway-fix-linux'],
  },
  {
    id: 'networking.coredns',
    domainId: 'services-networking',
    competency: 'Understand and use CoreDNS',
    focus: 'Resolve Service and Pod DNS names, read the CoreDNS Corefile ConfigMap, and debug failed lookups from a Pod.',
    docs: [
      { label: 'DNS for Services and Pods', href: `${K8S}/concepts/services-networking/dns-pod-service/` },
      { label: 'Customizing DNS Service', href: `${K8S}/tasks/administer-cluster/dns-custom-nameservers/` },
    ],
    relatedPosts: ['dns-not-resolving-linux-fix'],
  },
];

export const SKILL_IDS: ReadonlySet<string> = new Set(SKILLS.map((s) => s.id));

export function getDomain(id: DomainId): Domain {
  const d = DOMAINS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown domain ${id}`);
  return d;
}

export function skillsInDomain(id: DomainId): Skill[] {
  return SKILLS.filter((s) => s.domainId === id);
}
