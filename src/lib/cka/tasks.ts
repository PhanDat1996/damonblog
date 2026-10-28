// DamonSec-authored practice tasks.
//
// These are original exercises written for this tracker. They are not exam
// questions and are not taken from the exam. Every task changes cluster state,
// so run them in a disposable lab cluster (kind, minikube or kubeadm VMs),
// never in a cluster you care about. Nothing here runs on damonsec.com.
//
// Task IDs are stable keys referenced by saved practice attempts.

export interface CodeStep {
  /** Explanation shown above the command, if any. */
  text?: string;
  /** Shell commands, copied as-is. */
  code?: string;
}

export interface PracticeTask {
  id: string;
  title: string;
  /** Skill (official competency) this task practises. */
  skillId: string;
  kind: 'troubleshooting' | 'build';
  scenario: string;
  objective: string;
  environment: string;
  prerequisites: string[];
  /** Estimate only; actual time varies. */
  estimateMinutes: number;
  setup: CodeStep[];
  successCriteria: string[];
  verify: CodeStep[];
  /** Ordered from gentle nudge to near-answer. */
  hints: string[];
  solution: CodeStep[];
  cleanup: CodeStep[];
  /** How this task was checked by DamonSec, if it was. */
  testedOn?: string;
}

const ANY_CLUSTER =
  'A disposable cluster you can break: kind, minikube or kubeadm VMs. kubectl configured with cluster-admin access.';

export const TASKS: PracticeTask[] = [
  {
    id: 'task.svc-no-endpoints',
    title: 'Service with no endpoints',
    skillId: 'troubleshooting.services-networking',
    kind: 'troubleshooting',
    scenario:
      'A team deployed nginx behind a ClusterIP Service called web. The Pods are Running, but requests to http://web time out or are refused.',
    objective:
      'Make http://web in namespace cka-lab-svc return the nginx welcome page from inside the cluster. Fix the Service; do not recreate or relabel the Deployment.',
    environment: ANY_CLUSTER,
    prerequisites: ['Nodes can pull nginx:1.27 and busybox:1.36 from Docker Hub.'],
    estimateMinutes: 15,
    testedOn: 'Run end to end by DamonSec on 2026-10-28: kind v0.33 cluster, Kubernetes v1.37.0, default kindnet CNI.',
    setup: [
      {
        code: `kubectl create namespace cka-lab-svc
kubectl -n cka-lab-svc create deployment web --image=nginx:1.27 --replicas=2
kubectl -n cka-lab-svc apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: frontend
  ports:
  - port: 80
    targetPort: 8080
EOF`,
      },
    ],
    successCriteria: [
      'The EndpointSlice for Service web lists two ready endpoints on port 80.',
      'A request to http://web from a Pod in the namespace returns the nginx welcome page.',
      'The Deployment web is unchanged.',
    ],
    verify: [
      {
        code: `kubectl -n cka-lab-svc get endpointslices -l kubernetes.io/service-name=web
kubectl -n cka-lab-svc run probe --image=busybox:1.36 --restart=Never --rm -i -- \\
  wget -qO- -T 5 http://web | grep -o '<title>.*</title>'`,
      },
      { text: 'Expected output of the last command: <title>Welcome to nginx!</title>' },
    ],
    hints: [
      'Compare the SELECTOR column of kubectl get svc web -o wide with the labels from kubectl get pods --show-labels.',
      'An EndpointSlice with no endpoints means the selector matches no ready Pods. Once endpoints appear, check which port they point to.',
      'There are two separate problems. nginx in this image listens on port 80.',
    ],
    solution: [
      {
        text: 'Point the selector at the label kubectl create deployment set (app=web):',
        code: `kubectl -n cka-lab-svc patch service web --type=merge -p '{"spec":{"selector":{"app":"web"}}}'`,
      },
      {
        text: 'Endpoints now exist but on port 8080, where nothing listens. Fix targetPort:',
        code: `kubectl -n cka-lab-svc patch service web --type=json \\
  -p '[{"op":"replace","path":"/spec/ports/0/targetPort","value":80}]'`,
      },
    ],
    cleanup: [{ code: 'kubectl delete namespace cka-lab-svc' }],
  },
  {
    id: 'task.pending-pod-node-selector',
    title: 'Pending Pod with a node selector',
    skillId: 'workloads.pod-scheduling',
    kind: 'troubleshooting',
    scenario:
      'A reporting Pod must run on a node with fast disks. It has been Pending since it was created.',
    objective:
      'Get Pod report in namespace cka-lab-sched Running without changing the Pod spec. Exactly one worker node should end up eligible.',
    environment: `${ANY_CLUSTER} At least one worker node (not control plane).`,
    prerequisites: ['Nodes can pull busybox:1.36.'],
    estimateMinutes: 10,
    testedOn: 'Run end to end by DamonSec on 2026-10-28: kind v0.33 cluster, Kubernetes v1.37.0, default kindnet CNI.',
    setup: [
      {
        code: `kubectl create namespace cka-lab-sched
kubectl -n cka-lab-sched apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: report
spec:
  nodeSelector:
    disktype: ssd
  containers:
  - name: app
    image: busybox:1.36
    command: ["sh", "-c", "sleep 3600"]
    resources:
      requests:
        cpu: 100m
        memory: 64Mi
EOF`,
      },
    ],
    successCriteria: [
      'Pod report is Running.',
      'kubectl get nodes -l disktype=ssd returns exactly one node, and it is the node the Pod runs on.',
      'The Pod was not deleted or recreated (its AGE keeps counting from setup).',
    ],
    verify: [
      {
        code: `kubectl -n cka-lab-sched get pod report -o wide
kubectl get nodes -l disktype=ssd`,
      },
    ],
    hints: [
      'Read the Events section of kubectl describe pod report. The FailedScheduling message says which check failed.',
      'nodeSelector is matched against node labels. List them with kubectl get nodes --show-labels.',
      'The scheduler keeps retrying Pending Pods. Once a node matches, you do not need to touch the Pod.',
    ],
    solution: [
      {
        text: 'Pick a worker node and label it:',
        code: `NODE=$(kubectl get nodes -l '!node-role.kubernetes.io/control-plane' -o jsonpath='{.items[0].metadata.name}')
kubectl label node "$NODE" disktype=ssd
kubectl -n cka-lab-sched wait --for=condition=Ready pod/report --timeout=60s
kubectl -n cka-lab-sched get pod report -o wide`,
      },
    ],
    cleanup: [
      {
        code: `kubectl delete namespace cka-lab-sched
kubectl label nodes -l disktype=ssd disktype-`,
      },
    ],
  },
  {
    id: 'task.configmap-secret-refs',
    title: 'Deployment stuck in CreateContainerConfigError',
    skillId: 'workloads.configmaps-secrets',
    kind: 'troubleshooting',
    scenario:
      'An API Deployment reads its mode and log level from a ConfigMap and a token from a Secret. After a manifest change, its Pod never starts.',
    objective:
      'Fix Deployment api in namespace cka-lab-config so the Pod runs and logs mode=production level=info. Do not change the ConfigMap or the Secret.',
    environment: ANY_CLUSTER,
    prerequisites: ['Nodes can pull busybox:1.36.'],
    estimateMinutes: 15,
    testedOn: 'Run end to end by DamonSec on 2026-10-28: kind v0.33 cluster, Kubernetes v1.37.0, default kindnet CNI.',
    setup: [
      {
        code: `kubectl create namespace cka-lab-config
kubectl -n cka-lab-config create configmap api-config \\
  --from-literal=APP_MODE=production --from-literal=LOG_LEVEL=info
kubectl -n cka-lab-config create secret generic api-secret --from-literal=API_TOKEN=lab-only-token
kubectl -n cka-lab-config apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: busybox:1.36
        command: ["sh", "-c", "echo mode=$APP_MODE level=$LOG_LEVEL; sleep 3600"]
        env:
        - name: APP_MODE
          valueFrom:
            configMapKeyRef:
              name: api-config
              key: app_mode
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: api-config
              key: LOG_LEVEL
        - name: API_TOKEN
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: API_TOKEN
EOF`,
      },
    ],
    successCriteria: [
      'The Deployment rollout completes and one Pod is Running.',
      'The Pod logs show mode=production level=info.',
      'API_TOKEN is set inside the container.',
    ],
    verify: [
      {
        code: `kubectl -n cka-lab-config rollout status deployment/api --timeout=90s
kubectl -n cka-lab-config logs deployment/api
kubectl -n cka-lab-config exec deployment/api -- sh -c 'test -n "$API_TOKEN" && echo token-present'`,
      },
    ],
    hints: [
      'kubectl get pods shows the status. kubectl describe pod shows the reason in Events.',
      'The kubelet reports one missing reference at a time. After fixing one, check the events of the new Pod again.',
      'ConfigMap keys and object names are case-sensitive. Compare with kubectl get configmap api-config -o yaml and kubectl get secrets.',
    ],
    solution: [
      {
        text: 'The ConfigMap key is APP_MODE, not app_mode, and the Secret is api-secret, not api-secrets. Patch both references (env index 0 and 2):',
        code: `kubectl -n cka-lab-config patch deployment api --type=json -p '[
  {"op":"replace","path":"/spec/template/spec/containers/0/env/0/valueFrom/configMapKeyRef/key","value":"APP_MODE"},
  {"op":"replace","path":"/spec/template/spec/containers/0/env/2/valueFrom/secretKeyRef/name","value":"api-secret"}
]'`,
      },
      { text: 'kubectl edit deployment api works just as well in the exam environment.' },
    ],
    cleanup: [{ code: 'kubectl delete namespace cka-lab-config' }],
  },
  {
    id: 'task.pvc-pending-storageclass',
    title: 'PVC stuck in Pending',
    skillId: 'storage.pv-pvc',
    kind: 'troubleshooting',
    scenario:
      'A Pod that writes to a PersistentVolumeClaim is Pending, and so is its claim. The manifest was copied from another cluster.',
    objective:
      'Get PVC data Bound and Pod writer Running in namespace cka-lab-pvc, using a StorageClass that exists in your cluster.',
    environment: `${ANY_CLUSTER} The cluster needs a default StorageClass with a dynamic provisioner (kind and minikube ship one named standard).`,
    prerequisites: [
      'kubectl get storageclass shows one class marked (default).',
      'Nodes can pull busybox:1.36.',
    ],
    estimateMinutes: 20,
    testedOn: 'Run end to end by DamonSec on 2026-10-28: kind v0.33 cluster, Kubernetes v1.37.0, default kindnet CNI.',
    setup: [
      {
        code: `kubectl create namespace cka-lab-pvc
kubectl -n cka-lab-pvc apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: writer
spec:
  containers:
  - name: app
    image: busybox:1.36
    command: ["sh", "-c", "echo hello > /data/hello.txt && sleep 3600"]
    volumeMounts:
    - name: data
      mountPath: /data
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: data
EOF`,
      },
    ],
    successCriteria: [
      'PVC data is Bound to a dynamically provisioned PV.',
      'Pod writer is Running and /data/hello.txt contains hello.',
    ],
    verify: [
      {
        code: `kubectl -n cka-lab-pvc get pvc data
kubectl -n cka-lab-pvc exec writer -- cat /data/hello.txt`,
      },
    ],
    hints: [
      'Start with kubectl describe pvc data, not the Pod. The Pod is Pending because its claim is.',
      'Compare the claim\'s storageClassName with kubectl get storageclass.',
      'storageClassName cannot be changed on an existing claim. You have to recreate it, and the Pod that uses it.',
      'If the new claim shows "waiting for first consumer", check the class\'s VOLUMEBINDINGMODE. That state is expected until a Pod uses the claim.',
    ],
    solution: [
      {
        text: 'Find the default class, then recreate the claim and the Pod with it:',
        code: `SC=$(kubectl get storageclass -o jsonpath='{.items[?(@.metadata.annotations.storageclass\\.kubernetes\\.io/is-default-class=="true")].metadata.name}')
echo "default class: $SC"
kubectl -n cka-lab-pvc delete pod writer
kubectl -n cka-lab-pvc delete pvc data
kubectl -n cka-lab-pvc apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: $SC
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: writer
spec:
  containers:
  - name: app
    image: busybox:1.36
    command: ["sh", "-c", "echo hello > /data/hello.txt && sleep 3600"]
    volumeMounts:
    - name: data
      mountPath: /data
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: data
EOF
kubectl -n cka-lab-pvc wait --for=condition=Ready pod/writer --timeout=120s`,
      },
      { text: 'Leaving storageClassName out entirely also works: the claim then gets the default class.' },
    ],
    cleanup: [
      {
        text: 'Deleting the namespace deletes the claim; with reclaimPolicy Delete the provisioner removes the PV too. Check with kubectl get pv.',
        code: 'kubectl delete namespace cka-lab-pvc',
      },
    ],
  },
  {
    id: 'task.rbac-log-reader',
    title: 'Read-only access for a ServiceAccount',
    skillId: 'cluster.rbac',
    kind: 'build',
    scenario:
      'A log shipper running as ServiceAccount log-reader needs to list Pods and read their logs in one namespace, and nothing else.',
    objective:
      'Allow ServiceAccount log-reader in namespace cka-lab-rbac to get, list and watch Pods and read Pod logs in that namespace only.',
    environment: ANY_CLUSTER,
    prerequisites: [],
    estimateMinutes: 15,
    testedOn: 'Run end to end by DamonSec on 2026-10-28: kind v0.33 cluster, Kubernetes v1.37.0, default kindnet CNI.',
    setup: [
      {
        code: `kubectl create namespace cka-lab-rbac
kubectl -n cka-lab-rbac create serviceaccount log-reader`,
      },
    ],
    successCriteria: [
      'The first two checks below print yes.',
      'The last three print no.',
    ],
    verify: [
      {
        code: `SA=system:serviceaccount:cka-lab-rbac:log-reader
kubectl auth can-i list pods -n cka-lab-rbac --as=$SA
kubectl auth can-i get pods --subresource=log -n cka-lab-rbac --as=$SA
kubectl auth can-i delete pods -n cka-lab-rbac --as=$SA
kubectl auth can-i list secrets -n cka-lab-rbac --as=$SA
kubectl auth can-i list pods -n default --as=$SA`,
      },
    ],
    hints: [
      'Access limited to one namespace means a Role and a RoleBinding, not cluster-scoped objects.',
      'Logs are a subresource: pods/log.',
      'kubectl create role and kubectl create rolebinding --serviceaccount=<namespace>:<name> are faster than writing YAML.',
    ],
    solution: [
      {
        code: `kubectl -n cka-lab-rbac create role log-reader --verb=get,list,watch --resource=pods,pods/log
kubectl -n cka-lab-rbac create rolebinding log-reader --role=log-reader \\
  --serviceaccount=cka-lab-rbac:log-reader`,
      },
    ],
    cleanup: [{ code: 'kubectl delete namespace cka-lab-rbac' }],
  },
  {
    id: 'task.rollout-rollback',
    title: 'Roll back a broken rollout',
    skillId: 'workloads.deployments-rollouts',
    kind: 'troubleshooting',
    scenario:
      'Someone updated Deployment shop to an image tag that does not exist. The rollout has stalled.',
    objective:
      'Restore the last working revision with rollout history (not by typing the old image), then roll out nginx:1.28 with a change-cause recorded.',
    environment: ANY_CLUSTER,
    prerequisites: ['Nodes can pull nginx:1.27 and nginx:1.28.'],
    estimateMinutes: 15,
    testedOn: 'Run end to end by DamonSec on 2026-10-28: kind v0.33 cluster, Kubernetes v1.37.0, default kindnet CNI.',
    setup: [
      {
        code: `kubectl create namespace cka-lab-rollout
kubectl -n cka-lab-rollout create deployment shop --image=nginx:1.27 --replicas=3
kubectl -n cka-lab-rollout rollout status deployment/shop --timeout=120s
kubectl -n cka-lab-rollout set image deployment/shop nginx=nginx:1.27-doesnotexist`,
      },
    ],
    successCriteria: [
      'Deployment shop runs image nginx:1.28 with 3 ready replicas.',
      'kubectl rollout history shows the change-cause on the latest revision.',
      'At no point did fewer than 3 Pods serve traffic (the default strategy guarantees this here; know why).',
    ],
    verify: [
      {
        code: `kubectl -n cka-lab-rollout rollout status deployment/shop --timeout=120s
kubectl -n cka-lab-rollout get deployment shop -o jsonpath='{.spec.template.spec.containers[0].image}{"\\n"}'
kubectl -n cka-lab-rollout rollout history deployment/shop`,
      },
    ],
    hints: [
      'kubectl get rs shows the old and new ReplicaSets side by side. Count how many old Pods are still running.',
      'With 3 replicas, the default 25% maxUnavailable rounds down to 0 and 25% maxSurge rounds up to 1. That is why only one new Pod was attempted.',
      'kubectl rollout undo goes back one revision. kubernetes.io/change-cause is the annotation rollout history displays.',
    ],
    solution: [
      {
        code: `kubectl -n cka-lab-rollout rollout history deployment/shop
kubectl -n cka-lab-rollout rollout undo deployment/shop
kubectl -n cka-lab-rollout rollout status deployment/shop --timeout=120s
kubectl -n cka-lab-rollout set image deployment/shop nginx=nginx:1.28
kubectl -n cka-lab-rollout annotate deployment/shop kubernetes.io/change-cause="update to nginx 1.28" --overwrite
kubectl -n cka-lab-rollout rollout status deployment/shop --timeout=120s
kubectl -n cka-lab-rollout rollout history deployment/shop`,
      },
      { text: 'rollout undo does not create a new revision number for the old template: the restored ReplicaSet moves to the newest revision, and revision 1 disappears from the history. The Deployment\'s change-cause annotation is copied to its current ReplicaSet, so annotate after set image if you only want the new revision to carry it.' },
    ],
    cleanup: [{ code: 'kubectl delete namespace cka-lab-rollout' }],
  },
  {
    id: 'task.networkpolicy-allow-api',
    title: 'Restrict database access with a NetworkPolicy',
    skillId: 'networking.network-policies',
    kind: 'build',
    scenario:
      'Any Pod in the namespace can reach the db Service. Only the api Pod should.',
    objective:
      'In namespace cka-lab-netpol, allow ingress to the db Pods on TCP 80 only from Pods labelled role=api. Block all other ingress to db.',
    environment: `${ANY_CLUSTER} The CNI plugin must enforce NetworkPolicy (for example Calico, Cilium, or kindnet in recent kind releases). Some CNIs accept policies without enforcing them.`,
    prerequisites: ['Nodes can pull nginx:1.27 and busybox:1.36.'],
    estimateMinutes: 20,
    testedOn: 'Run end to end by DamonSec on 2026-10-28: kind v0.33 cluster, Kubernetes v1.37.0, default kindnet CNI.',
    setup: [
      {
        code: `kubectl create namespace cka-lab-netpol
kubectl -n cka-lab-netpol create deployment db --image=nginx:1.27
kubectl -n cka-lab-netpol expose deployment db --port=80
kubectl -n cka-lab-netpol run api --image=busybox:1.36 --labels=role=api -- sleep 3600
kubectl -n cka-lab-netpol run other --image=busybox:1.36 --labels=role=other -- sleep 3600
kubectl -n cka-lab-netpol wait --for=condition=Ready pod --all --timeout=120s`,
      },
      {
        text: 'Before writing a policy, confirm both clients can connect. If they cannot, fix that first.',
        code: `kubectl -n cka-lab-netpol exec api -- wget -qO- -T 3 http://db >/dev/null && echo api: allowed
kubectl -n cka-lab-netpol exec other -- wget -qO- -T 3 http://db >/dev/null && echo other: allowed`,
      },
    ],
    successCriteria: [
      'From Pod api, the request to http://db succeeds.',
      'From Pod other, the request times out.',
      'If other still connects after your policy is applied, your CNI is not enforcing NetworkPolicy.',
    ],
    verify: [
      {
        code: `kubectl -n cka-lab-netpol exec api -- wget -qO- -T 3 http://db >/dev/null && echo api: allowed || echo api: blocked
kubectl -n cka-lab-netpol exec other -- wget -qO- -T 3 http://db >/dev/null && echo other: allowed || echo other: blocked`,
      },
      { text: 'Expected: api: allowed, other: blocked.' },
    ],
    hints: [
      'A Pod becomes isolated for ingress as soon as any NetworkPolicy with policyTypes Ingress selects it.',
      'spec.podSelector picks the Pods being protected. ingress.from.podSelector picks the allowed clients.',
      'kubectl create deployment db labels its Pods app=db. kubectl get pods --show-labels confirms it.',
    ],
    solution: [
      {
        code: `kubectl -n cka-lab-netpol apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-allow-api
spec:
  podSelector:
    matchLabels:
      app: db
  policyTypes: ["Ingress"]
  ingress:
  - from:
    - podSelector:
        matchLabels:
          role: api
    ports:
    - protocol: TCP
      port: 80
EOF`,
      },
    ],
    cleanup: [{ code: 'kubectl delete namespace cka-lab-netpol' }],
  },
  {
    id: 'task.node-notready-kubelet',
    title: 'Worker node NotReady',
    skillId: 'troubleshooting.clusters-nodes',
    kind: 'troubleshooting',
    scenario:
      'After maintenance on a worker node, the node shows NotReady and new Pods are not scheduled on it.',
    objective:
      'Bring the node back to Ready and make sure the fix survives a reboot.',
    environment:
      'A disposable kubeadm cluster on VMs with SSH and sudo on a worker node. (On kind, replace ssh with docker exec into the node container.)',
    prerequisites: ['SSH access with sudo to one worker node.', 'Do not use a node that runs workloads you need.'],
    estimateMinutes: 20,
    testedOn: 'Checked by DamonSec on 2026-10-28 on a kind worker node (Kubernetes v1.37.0), using docker exec in place of SSH. Not yet run on kubeadm VMs.',
    setup: [
      {
        text: 'Pick a worker and break it. Run the second command on that worker.',
        code: `kubectl get nodes
# on the worker node:
sudo systemctl disable --now kubelet`,
      },
      { text: 'Wait about a minute, until kubectl get nodes shows the node NotReady. Then pretend you did not do the setup.' },
    ],
    successCriteria: [
      'The node is Ready.',
      'kubelet is active and enabled on the node.',
    ],
    verify: [
      {
        code: `kubectl get nodes
# on the worker node:
systemctl is-active kubelet
systemctl is-enabled kubelet`,
      },
    ],
    hints: [
      'kubectl describe node <name>: look at the Conditions table and its messages. Who is supposed to update them?',
      'On the node, check the service that reports node status: systemctl status kubelet, then journalctl -u kubelet.',
      'A running service is not the whole fix. Check whether it starts at boot.',
    ],
    solution: [
      {
        code: `# on the worker node:
sudo systemctl enable --now kubelet
systemctl status kubelet --no-pager
# back on your workstation (Ctrl-C to stop watching):
kubectl get nodes --watch`,
      },
    ],
    cleanup: [
      { text: 'Nothing to remove. If the node stayed NotReady for more than about 5 minutes, Pods on it may have been evicted and rescheduled elsewhere; check with kubectl get pods -A -o wide.' },
    ],
  },
  {
    id: 'task.crashloop-logs',
    title: 'CrashLoopBackOff from a missing setting',
    skillId: 'troubleshooting.container-output',
    kind: 'troubleshooting',
    scenario:
      'A worker Deployment restarts constantly. By the time you run kubectl logs, the container has often just restarted and shows little.',
    objective:
      'Use the container\'s output to find why it exits, then fix Deployment worker in namespace cka-lab-logs. The queue URL is redis://queue:6379.',
    environment: ANY_CLUSTER,
    prerequisites: ['Nodes can pull busybox:1.36.'],
    estimateMinutes: 10,
    testedOn: 'Run end to end by DamonSec on 2026-10-28: kind v0.33 cluster, Kubernetes v1.37.0, default kindnet CNI.',
    setup: [
      {
        code: `kubectl create namespace cka-lab-logs
kubectl -n cka-lab-logs apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
spec:
  replicas: 1
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
    spec:
      containers:
      - name: worker
        image: busybox:1.36
        command:
        - sh
        - -c
        - |
          echo "starting worker"
          if [ -z "$QUEUE_URL" ]; then
            echo "fatal: QUEUE_URL is not set" >&2
            exit 1
          fi
          echo "connected to $QUEUE_URL"
          sleep 3600
EOF`,
      },
    ],
    successCriteria: [
      'The Deployment rollout completes and the new Pod has 0 restarts.',
      'The Pod logs contain connected to redis://queue:6379.',
    ],
    verify: [
      {
        code: `kubectl -n cka-lab-logs rollout status deployment/worker --timeout=90s
kubectl -n cka-lab-logs get pods -l app=worker
kubectl -n cka-lab-logs logs deployment/worker`,
      },
    ],
    hints: [
      'kubectl get pods shows the RESTARTS count. kubectl describe pod shows the last state and exit code.',
      'kubectl logs <pod> shows the current container, or its output if it has already exited. kubectl logs <pod> --previous shows the instance before that, while it is still kept. stderr is included in both.',
      'kubectl rollout status can report success for a crashing Pod that has no readiness probe, because the container is briefly Running. Trust RESTARTS, not the rollout message.',
      'kubectl set env changes the Pod template and triggers a new rollout.',
    ],
    solution: [
      {
        code: `POD=$(kubectl -n cka-lab-logs get pod -l app=worker -o jsonpath='{.items[0].metadata.name}')
kubectl -n cka-lab-logs logs "$POD"
kubectl -n cka-lab-logs logs "$POD" --previous   # may fail if that instance is already gone
kubectl -n cka-lab-logs set env deployment/worker QUEUE_URL=redis://queue:6379
kubectl -n cka-lab-logs rollout status deployment/worker --timeout=90s`,
      },
    ],
    cleanup: [{ code: 'kubectl delete namespace cka-lab-logs' }],
  },
];

export function tasksForSkill(skillId: string): PracticeTask[] {
  return TASKS.filter((t) => t.skillId === skillId);
}

export function getTask(id: string): PracticeTask | undefined {
  return TASKS.find((t) => t.id === id);
}
