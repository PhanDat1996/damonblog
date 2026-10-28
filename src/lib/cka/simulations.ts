// Scripted troubleshooting simulations.
//
// A simulation replays real kubectl output (see simulation-captures.ts) for a
// fixed scenario. The learner runs investigation commands from a list, then
// answers a sequence of decisions. Nothing runs against a cluster: commands
// outside the script have no output. Each simulation mirrors a lab task so the
// learner can repeat it for real.
//
// IDs are stable keys referenced by saved practice attempts.

import { CAPTURES } from './simulation-captures.ts';
import type { CaptureKey } from './simulation-captures.ts';
import { getTask } from './tasks.ts';

export interface SimCommand {
  id: string;
  command: string;
  /**
   * Output by simulation state. A state that is not listed falls back to
   * 'start'. null (or no entry at all) means no output was recorded at that
   * point, and the simulator says so instead of inventing one.
   */
  outputs: Partial<Record<string, CaptureKey | null>>;
}

export interface SimOption {
  id: string;
  label: string;
  correct: boolean;
  feedback: string;
  /** Real output shown when this option is picked, e.g. the error a wrong fix produces. */
  shows?: { command: string; output: CaptureKey }[];
}

export interface SimDecision {
  id: string;
  prompt: string;
  options: SimOption[];
  /** Cluster state after the correct option. Changes what commands print. */
  stateAfter?: string;
}

export interface Simulation {
  id: string;
  title: string;
  /** Lab task with the same scenario, to repeat on a real cluster. */
  taskId: string;
  skillId: string;
  briefing: string;
  /** What exists in the namespace when the simulation starts. */
  given: string[];
  commands: SimCommand[];
  decisions: SimDecision[];
  debrief: string[];
  /** Estimate only. */
  estimateMinutes: number;
}

export const SIMULATIONS: Simulation[] = [
  {
    id: 'sim.svc-no-endpoints',
    title: 'Service returns connection refused',
    taskId: 'task.svc-no-endpoints',
    skillId: 'troubleshooting.services-networking',
    briefing:
      'In namespace cka-lab-svc, a Deployment called web runs nginx behind a ClusterIP Service, also called web. From the client Pod, requests to http://web fail. Find out why and fix the Service without touching the Deployment.',
    given: [
      'Deployment web (2 replicas, nginx:1.27)',
      'Service web (ClusterIP, port 80)',
      'Pod client (busybox:1.36) for testing from inside the cluster',
    ],
    commands: [
      { id: 'pods', command: 'kubectl -n cka-lab-svc get pods -o wide --show-labels', outputs: { start: 'svc-get-pods' } },
      { id: 'svc', command: 'kubectl -n cka-lab-svc get svc web -o wide', outputs: { start: 'svc-get-svc' } },
      { id: 'describe', command: 'kubectl -n cka-lab-svc describe svc web', outputs: { start: 'svc-describe-svc' } },
      {
        id: 'eps',
        command: 'kubectl -n cka-lab-svc get endpointslices -l kubernetes.io/service-name=web',
        outputs: { start: 'svc-eps-1', selectorFixed: 'svc-eps-2', fixed: 'svc-eps-3' },
      },
      {
        id: 'wget',
        command: 'kubectl -n cka-lab-svc exec client -- wget -qO- -T 5 http://web',
        outputs: { start: 'svc-wget-1', selectorFixed: 'svc-wget-2', fixed: 'svc-wget-3' },
      },
    ],
    decisions: [
      {
        id: 'cause-1',
        prompt: 'Why does the Service have no endpoints?',
        options: [
          { id: 'selector', label: 'The Service selector app=frontend matches no Pods; the Pods are labelled app=web.', correct: true, feedback: 'Right. A Service only gets endpoints from ready Pods whose labels match its selector.' },
          { id: 'notready', label: 'The web Pods are failing readiness, so they are left out of the endpoints.', correct: false, feedback: 'Both web Pods show 1/1 Running. Compare the Service SELECTOR with the Pod LABELS.' },
          { id: 'dns', label: 'Cluster DNS does not resolve the name web, so the client never reaches the Service.', correct: false, feedback: 'wget printed the ClusterIP (10.96.x.x), so the name resolved. The problem is behind the ClusterIP.' },
          { id: 'kubeproxy', label: 'kube-proxy on the client\'s node has not programmed rules for the ClusterIP yet.', correct: false, feedback: 'Possible in theory, but there is a simpler explanation in the Service itself. Check the selector first.' },
        ],
      },
      {
        id: 'fix-1',
        prompt: 'How do you fix the selector without changing the Deployment?',
        stateAfter: 'selectorFixed',
        options: [
          {
            id: 'patch',
            label: `kubectl -n cka-lab-svc patch service web --type=merge -p '{"spec":{"selector":{"app":"web"}}}'`,
            correct: true,
            feedback: 'Patched. Run the EndpointSlice and wget commands again.',
            shows: [{ command: `kubectl -n cka-lab-svc patch service web --type=merge -p '{"spec":{"selector":{"app":"web"}}}'`, output: 'svc-fix-selector' }],
          },
          {
            id: 'expose',
            label: 'kubectl -n cka-lab-svc expose deployment web --port=80',
            correct: false,
            feedback: 'A Service called web already exists, so expose fails. You would have to delete it first, and that is not fixing it.',
            shows: [{ command: 'kubectl -n cka-lab-svc expose deployment web --port=80', output: 'svc-fix-expose' }],
          },
          { id: 'relabel', label: 'kubectl -n cka-lab-svc label pods -l app=web app=frontend --overwrite', correct: false, feedback: 'The ReplicaSet selects app=web, so it would stop owning those Pods and create two new ones, leaving the Service pointing at orphans. The task also says not to touch the workload.' },
        ],
      },
      {
        id: 'cause-2',
        prompt: 'The EndpointSlice now lists both Pods, but wget still gets "Connection refused". Why?',
        options: [
          { id: 'port', label: 'targetPort is 8080, but nginx listens on port 80.', correct: true, feedback: 'Right. The endpoints show port 8080. Refused means something answered with a reset: nothing listens there.' },
          { id: 'netpol', label: 'A NetworkPolicy in the namespace is dropping traffic from the client Pod.', correct: false, feedback: 'A NetworkPolicy drop usually shows up as a timeout, not an immediate refusal. Look at the PORTS column of the EndpointSlice.' },
          { id: 'cache', label: 'kube-proxy is still using the old, empty endpoint list for the ClusterIP.', correct: false, feedback: 'Clients connect to the ClusterIP; kube-proxy updates the rules within seconds. Look at the port the endpoints use.' },
        ],
      },
      {
        id: 'fix-2',
        prompt: 'Fix the port.',
        stateAfter: 'fixed',
        options: [
          {
            id: 'targetport',
            label: `kubectl -n cka-lab-svc patch service web --type=json -p '[{"op":"replace","path":"/spec/ports/0/targetPort","value":80}]'`,
            correct: true,
            feedback: 'Patched. Run wget again to confirm.',
            shows: [{ command: `kubectl -n cka-lab-svc patch service web --type=json -p '[{"op":"replace","path":"/spec/ports/0/targetPort","value":80}]'`, output: 'svc-fix-port' }],
          },
          { id: 'port', label: 'Change the Service port from 80 to 8080.', correct: false, feedback: 'port is what clients connect to on the ClusterIP. The mismatch is between targetPort and the container, so clients would still be refused.' },
          { id: 'restart', label: 'kubectl -n cka-lab-svc rollout restart deployment web', correct: false, feedback: 'New Pods still listen on 80, and the task says not to touch the Deployment.' },
        ],
      },
    ],
    debrief: [
      'Order that works for most Service problems: selector vs labels, EndpointSlices (are there endpoints, on which port), then a request from inside the cluster.',
      '"Connection refused" from a ClusterIP with no endpoints and from a wrong targetPort looks the same. The EndpointSlice tells them apart.',
    ],
    estimateMinutes: 8,
  },
  {
    id: 'sim.crashloop-logs',
    title: 'Pod keeps restarting',
    taskId: 'task.crashloop-logs',
    skillId: 'troubleshooting.container-output',
    briefing:
      'In namespace cka-lab-logs, Deployment worker never stays up. Find out why from the container\'s output and fix it. The queue it needs is at redis://queue:6379.',
    given: ['Deployment worker (1 replica, busybox:1.36 running a start-up script)'],
    commands: [
      { id: 'pods', command: 'kubectl -n cka-lab-logs get pods', outputs: { start: 'crash-get-pods', fixed: 'crash-get-pods-3' } },
      { id: 'describe', command: 'kubectl -n cka-lab-logs describe pod worker-755ddf477f-j2xxd', outputs: { start: 'crash-describe' } },
      { id: 'logs', command: 'kubectl -n cka-lab-logs logs worker-755ddf477f-j2xxd', outputs: { start: 'crash-logs' } },
      { id: 'previous', command: 'kubectl -n cka-lab-logs logs worker-755ddf477f-j2xxd --previous', outputs: { start: 'crash-logs-prev' } },
      { id: 'env', command: `kubectl -n cka-lab-logs get deployment worker -o jsonpath='{.spec.template.spec.containers[0].env}'`, outputs: { start: 'crash-env' } },
    ],
    decisions: [
      {
        id: 'cause',
        prompt: 'Why does the container keep exiting?',
        options: [
          { id: 'env', label: 'The script exits with code 1 because QUEUE_URL is unset.', correct: true, feedback: 'Right. The log says so, describe shows Exit Code 1 with reason Error, and the Deployment has no env.' },
          { id: 'oom', label: 'It runs out of memory at start-up and the kernel OOM-kills it.', correct: false, feedback: 'An OOM kill shows reason OOMKilled and exit code 137. describe shows reason Error, exit code 1.' },
          { id: 'image', label: 'The busybox image cannot be pulled from Docker Hub onto the node.', correct: false, feedback: 'That would show ErrImagePull or ImagePullBackOff, and the container would never start. Events show it started four times.' },
          { id: 'probe', label: 'A liveness probe keeps failing, so the kubelet restarts the container.', correct: false, feedback: 'There is no probe in the Pod, and events would say "Liveness probe failed". The container exits on its own.' },
        ],
      },
      {
        id: 'fix',
        prompt: 'How do you fix it so it stays fixed?',
        stateAfter: 'fixed',
        options: [
          {
            id: 'deploy',
            label: 'kubectl -n cka-lab-logs set env deployment/worker QUEUE_URL=redis://queue:6379',
            correct: true,
            feedback: 'The Pod template changed, so the Deployment rolls out a new Pod with the variable set.',
            shows: [
              { command: 'kubectl -n cka-lab-logs set env deployment/worker QUEUE_URL=redis://queue:6379', output: 'crash-fix-env' },
              { command: 'kubectl -n cka-lab-logs rollout status deployment/worker --timeout=90s', output: 'crash-rollout' },
              { command: 'kubectl -n cka-lab-logs get pods', output: 'crash-get-pods-3' },
              { command: 'kubectl -n cka-lab-logs logs deployment/worker', output: 'crash-logs-3' },
            ],
          },
          {
            id: 'pod',
            label: 'kubectl -n cka-lab-logs set env pod/worker-755ddf477f-j2xxd QUEUE_URL=redis://queue:6379',
            correct: false,
            feedback: 'The API server rejects it: a running Pod\'s env cannot be changed. Even if it could, the next Pod from the ReplicaSet would not have it.',
            shows: [{ command: 'kubectl -n cka-lab-logs set env pod/worker-755ddf477f-j2xxd QUEUE_URL=redis://queue:6379', output: 'crash-fix-pod' }],
          },
          {
            id: 'restart',
            label: 'kubectl -n cka-lab-logs rollout restart deployment/worker',
            correct: false,
            feedback: 'A new Pod with the same spec fails the same way. Twenty seconds later it is already in Error with 2 restarts.',
            shows: [
              { command: 'kubectl -n cka-lab-logs rollout restart deployment/worker', output: 'crash-fix-restart' },
              { command: 'kubectl -n cka-lab-logs get pods', output: 'crash-get-pods-2' },
            ],
          },
        ],
      },
    ],
    debrief: [
      'Here --previous failed with "unable to retrieve container logs" while plain kubectl logs showed the error. When the current container has already exited, plain logs shows its output; --previous is most useful while a restarted container is running.',
      'stderr is included in kubectl logs, which is why the "fatal:" line shows up.',
      'Fix the template (Deployment), not the Pod. Pods are replaced; their spec is mostly immutable.',
    ],
    estimateMinutes: 6,
  },
  {
    id: 'sim.pvc-pending',
    title: 'Pod and PVC stuck in Pending',
    taskId: 'task.pvc-pending-storageclass',
    skillId: 'storage.pv-pvc',
    briefing:
      'In namespace cka-lab-pvc, Pod writer and its claim data have been Pending since they were created. Get them Running and Bound using a StorageClass that exists in this cluster.',
    given: ['PersistentVolumeClaim data (1Gi, ReadWriteOnce)', 'Pod writer that mounts data at /data'],
    commands: [
      { id: 'pod', command: 'kubectl -n cka-lab-pvc get pod writer', outputs: { start: 'pvc-get-pod', fixed: 'pvc-get-pod-2' } },
      { id: 'describe-pod', command: 'kubectl -n cka-lab-pvc describe pod writer', outputs: { start: 'pvc-describe-pod' } },
      { id: 'pvc', command: 'kubectl -n cka-lab-pvc get pvc data', outputs: { start: 'pvc-get-pvc', fixed: 'pvc-get-pvc-2' } },
      { id: 'describe-pvc', command: 'kubectl -n cka-lab-pvc describe pvc data', outputs: { start: 'pvc-describe-pvc' } },
      { id: 'sc', command: 'kubectl get storageclass', outputs: { start: 'pvc-get-sc' } },
      { id: 'cat', command: 'kubectl -n cka-lab-pvc exec writer -- cat /data/hello.txt', outputs: { start: 'pvc-cat-pending', fixed: 'pvc-cat' } },
    ],
    decisions: [
      {
        id: 'cause',
        prompt: 'What is blocking the Pod?',
        options: [
          { id: 'sc', label: 'StorageClass fast-ssd does not exist, so no volume is provisioned.', correct: true, feedback: 'Right. The PVC event says storageclass "fast-ssd" not found, and the Pod cannot schedule with an unbound claim.' },
          { id: 'node', label: 'No node has enough free CPU or memory for the Pod\'s requests, so it cannot be placed.', correct: false, feedback: 'The scheduler message would say Insufficient cpu or memory. It says the Pod has an unbound PersistentVolumeClaim.' },
          { id: 'mode', label: 'The provisioner does not support ReadWriteOnce, so the claim can never be satisfied.', correct: false, feedback: 'The provisioner never ran, so access mode was not checked. Read the PVC events.' },
        ],
      },
      {
        id: 'fix',
        prompt: 'The default class is standard. How do you switch the claim to it?',
        stateAfter: 'fixed',
        options: [
          {
            id: 'recreate',
            label: 'Delete the Pod and PVC, recreate the PVC with class standard, then the Pod.',
            correct: true,
            feedback: 'The new claim sits in Pending (WaitForFirstConsumer) until the Pod is created, then binds.',
            shows: [{ command: 'kubectl -n cka-lab-pvc get pvc data   # right after recreating the claim, before the Pod', output: 'pvc-get-pvc-wffc' }],
          },
          {
            id: 'patch',
            label: `kubectl -n cka-lab-pvc patch pvc data -p '{"spec":{"storageClassName":"standard"}}'`,
            correct: false,
            feedback: 'Rejected: a PVC\'s spec is immutable after creation, apart from resource requests and the volume attributes class.',
            shows: [{ command: `kubectl -n cka-lab-pvc patch pvc data -p '{"spec":{"storageClassName":"standard"}}'`, output: 'pvc-fix-patch' }],
          },
          { id: 'pv', label: 'Create a PersistentVolume by hand with storageClassName: fast-ssd so the claim binds.', correct: false, feedback: 'A matching static PV could bind, but the objective is to use a StorageClass that exists, and you would be inventing a class name with no provisioner behind it.' },
        ],
      },
    ],
    debrief: [
      'When a Pod is Pending with a volume, read the PVC events before the Pod events.',
      'With volumeBindingMode WaitForFirstConsumer, a new claim stays Pending until a Pod uses it. That is expected, not a second failure.',
    ],
    estimateMinutes: 6,
  },
  {
    id: 'sim.pending-node-selector',
    title: 'Pod stuck in Pending',
    taskId: 'task.pending-pod-node-selector',
    skillId: 'workloads.pod-scheduling',
    briefing:
      'In namespace cka-lab-sched, Pod report must run on a node with fast disks and has been Pending since it was created. Get it Running without changing the Pod. Exactly one worker node should end up eligible.',
    given: ['Pod report (busybox:1.36, requests 100m CPU / 64Mi)', 'Three nodes: one control plane, two workers'],
    commands: [
      { id: 'pod', command: 'kubectl -n cka-lab-sched get pod report -o wide', outputs: { start: 'sched-get-pod', fixed: 'sched-get-pod-2' } },
      { id: 'describe', command: 'kubectl -n cka-lab-sched describe pod report', outputs: { start: 'sched-describe', fixed: null } },
      { id: 'selector', command: `kubectl -n cka-lab-sched get pod report -o jsonpath='{.spec.nodeSelector}'`, outputs: { start: 'sched-selector' } },
      { id: 'nodes', command: 'kubectl get nodes -L disktype', outputs: { start: 'sched-nodes', fixed: 'sched-nodes-2' } },
    ],
    decisions: [
      {
        id: 'cause',
        prompt: 'Why can the scheduler not place the Pod?',
        options: [
          { id: 'label', label: 'No untainted node has the disktype=ssd label the nodeSelector needs.', correct: true, feedback: 'Right. The event gives a reason per group of nodes: 1 tainted, 2 not matching the selector.' },
          { id: 'resources', label: 'The Pod requests more CPU or memory than any node has free, so no node fits it.', correct: false, feedback: 'That would read "Insufficient cpu" or "Insufficient memory". The requests here are 100m and 64Mi.' },
          { id: 'scheduler', label: 'The scheduler itself is down, so no Pending Pod is being placed at the moment.', correct: false, feedback: 'The FailedScheduling event comes from default-scheduler, so it is running and has evaluated the Pod.' },
          { id: 'taint', label: 'The control-plane taint is blocking the Pod on every node in the cluster.', correct: false, feedback: 'Only 1 node had an untolerated taint. The other 2 failed the node selector.' },
        ],
      },
      {
        id: 'fix',
        prompt: 'How do you get it scheduled while keeping the ssd requirement?',
        stateAfter: 'fixed',
        options: [
          {
            id: 'label',
            label: 'kubectl label node damonsec-lab-worker disktype=ssd',
            correct: true,
            feedback: 'The scheduler retries Pending Pods, so report lands on the labelled worker without being recreated.',
            shows: [{ command: 'kubectl label node damonsec-lab-worker disktype=ssd', output: 'sched-fix-label' }],
          },
          {
            id: 'patch',
            label: `kubectl -n cka-lab-sched patch pod report --type=json -p '[{"op":"remove","path":"/spec/nodeSelector"}]'`,
            correct: false,
            feedback: 'Rejected: the scheduling fields of an existing Pod cannot change. It would also drop the ssd requirement.',
            shows: [{ command: `kubectl -n cka-lab-sched patch pod report --type=json -p '[{"op":"remove","path":"/spec/nodeSelector"}]'`, output: 'sched-fix-patch' }],
          },
          { id: 'all', label: 'kubectl label nodes --all disktype=ssd', correct: false, feedback: 'That marks every node, including the control plane, as ssd. The objective was exactly one eligible worker.' },
        ],
      },
    ],
    debrief: [
      'Read the FailedScheduling message as counts per reason: here 1 node tainted, 2 nodes not matching the selector.',
      'A Pod\'s scheduling fields are fixed once created. Change the nodes (labels, taints) or recreate the Pod.',
    ],
    estimateMinutes: 5,
  },
  {
    id: 'sim.configmap-secret-refs',
    title: 'Deployment stuck in CreateContainerConfigError',
    taskId: 'task.configmap-secret-refs',
    skillId: 'workloads.configmaps-secrets',
    briefing:
      'In namespace cka-lab-config, Deployment api reads its settings from ConfigMap api-config and a token from a Secret. Its Pod never starts. Fix the Deployment so it logs mode=production level=info. Do not change the ConfigMap or the Secret.',
    given: ['Deployment api (1 replica)', 'ConfigMap api-config', 'Secret api-secret'],
    commands: [
      { id: 'pods', command: 'kubectl -n cka-lab-config get pods', outputs: { start: 'cfg-get-pods', keyFixed: 'cfg-get-pods-2', fixed: 'cfg-get-pods-3' } },
      { id: 'events', command: 'kubectl -n cka-lab-config get events --field-selector type=Warning', outputs: { start: 'cfg-events', keyFixed: 'cfg-events-2', fixed: null } },
      { id: 'refs', command: `kubectl -n cka-lab-config get deployment api -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}{" <- "}{.valueFrom}{"\\n"}{end}'`, outputs: { start: 'cfg-refs', keyFixed: null, fixed: null } },
      { id: 'cm', command: 'kubectl -n cka-lab-config get configmap api-config -o yaml', outputs: { start: 'cfg-cm' } },
      { id: 'secrets', command: 'kubectl -n cka-lab-config get secrets', outputs: { start: 'cfg-secrets' } },
      { id: 'logs', command: 'kubectl -n cka-lab-config logs deployment/api', outputs: { fixed: 'cfg-logs' } },
    ],
    decisions: [
      {
        id: 'cause-1',
        prompt: 'What does the first error say is wrong?',
        options: [
          { id: 'key', label: 'The Deployment asks for key app_mode, but the ConfigMap\'s key is APP_MODE.', correct: true, feedback: 'Right. Keys are case-sensitive, and the event names the exact key and ConfigMap.' },
          { id: 'missing', label: 'ConfigMap api-config does not exist in the namespace, so nothing can be read.', correct: false, feedback: 'get configmap api-config returns it. The event says the key was not found, not the ConfigMap.' },
          { id: 'image', label: 'The busybox image cannot run the shell command, so the container fails at start.', correct: false, feedback: 'The container was never created. CreateContainerConfigError is about the config the kubelet must resolve first.' },
        ],
      },
      {
        id: 'fix-1',
        prompt: 'Fix the ConfigMap reference.',
        stateAfter: 'keyFixed',
        options: [
          {
            id: 'patch',
            label: `kubectl -n cka-lab-config patch deployment api --type=json -p '[{"op":"replace","path":"/spec/template/spec/containers/0/env/0/valueFrom/configMapKeyRef/key","value":"APP_MODE"}]'`,
            correct: true,
            feedback: 'Patched. The template changed, so a new ReplicaSet and Pod were created. Check the Pods and events again.',
            shows: [{ command: 'kubectl -n cka-lab-config patch deployment api --type=json -p \'[{"op":"replace","path":"/spec/template/spec/containers/0/env/0/valueFrom/configMapKeyRef/key","value":"APP_MODE"}]\'', output: 'cfg-fix-key' }],
          },
          {
            id: 'create',
            label: 'kubectl -n cka-lab-config create configmap api-config --from-literal=app_mode=production',
            correct: false,
            feedback: 'The ConfigMap already exists, and the task says not to change it. Fix the reference instead.',
            shows: [{ command: 'kubectl -n cka-lab-config create configmap api-config --from-literal=app_mode=production', output: 'cfg-fix-create' }],
          },
          { id: 'delete', label: 'kubectl -n cka-lab-config delete pod -l app=api', correct: false, feedback: 'The replacement Pod comes from the same template and fails the same way.' },
        ],
      },
      {
        id: 'cause-2',
        prompt: 'There are now two Pods, both in CreateContainerConfigError. What is going on?',
        options: [
          { id: 'secret', label: 'The new Pod references Secret api-secrets; the Secret is api-secret.', correct: true, feedback: 'Right. Match each event to its Pod: the newer Pod has a different error. The old Pod stays until the new one is Ready.' },
          { id: 'notapplied', label: 'The fix did not apply: the app_mode error is still listed in the events.', correct: false, feedback: 'That event belongs to the old Pod (api-5b65cfddcf-…), which the Deployment keeps until the new Pod is Ready.' },
          { id: 'restart', label: 'The change needs a rollout restart before the new Pod picks it up.', correct: false, feedback: 'Patching the template already started a rollout: the new Pod has a different hash (api-7784686b67-…).' },
        ],
      },
      {
        id: 'fix-2',
        prompt: 'Fix the Secret reference.',
        stateAfter: 'fixed',
        options: [
          {
            id: 'patch',
            label: `kubectl -n cka-lab-config patch deployment api --type=json -p '[{"op":"replace","path":"/spec/template/spec/containers/0/env/2/valueFrom/secretKeyRef/name","value":"api-secret"}]'`,
            correct: true,
            feedback: 'The rollout completes and the old Pods are removed.',
            shows: [
              { command: 'kubectl -n cka-lab-config patch deployment api --type=json -p \'[{"op":"replace","path":"/spec/template/spec/containers/0/env/2/valueFrom/secretKeyRef/name","value":"api-secret"}]\'', output: 'cfg-fix-secret' },
              { command: 'kubectl -n cka-lab-config rollout status deployment/api --timeout=90s', output: 'cfg-rollout' },
            ],
          },
          { id: 'copy', label: 'kubectl -n cka-lab-config create secret generic api-secrets --from-literal=API_TOKEN=lab-only-token', correct: false, feedback: 'It would start, but you now have two copies of a credential to keep in sync, and the task says not to change Secrets. Fix the reference.' },
        ],
      },
    ],
    debrief: [
      'The kubelet reports one missing reference at a time, so expect a second error after the first fix.',
      'During a failed rollout the old Pod stays around. Match events to Pod names before deciding a fix did not work.',
    ],
    estimateMinutes: 8,
  },
  {
    id: 'sim.rbac-log-reader',
    title: 'ServiceAccount cannot read Pod logs',
    taskId: 'task.rbac-log-reader',
    skillId: 'cluster.rbac',
    briefing:
      'A log shipper runs as ServiceAccount log-reader in namespace cka-lab-rbac. It needs to get, list and watch Pods and read their logs in that namespace, and nothing else.',
    given: ['Namespace cka-lab-rbac', 'ServiceAccount log-reader (no permissions yet)'],
    commands: [
      { id: 'list', command: 'kubectl auth can-i list pods -n cka-lab-rbac --as=system:serviceaccount:cka-lab-rbac:log-reader', outputs: { start: 'rbac-can-list', roleCreated: 'rbac-can-list', fixed: 'rbac-can-list-2' } },
      { id: 'log', command: 'kubectl auth can-i get pods --subresource=log -n cka-lab-rbac --as=system:serviceaccount:cka-lab-rbac:log-reader', outputs: { start: 'rbac-can-log', roleCreated: 'rbac-can-log', fixed: 'rbac-can-log-2' } },
      { id: 'secrets', command: 'kubectl auth can-i list secrets -n cka-lab-rbac --as=system:serviceaccount:cka-lab-rbac:log-reader', outputs: { start: 'rbac-can-secrets', fixed: null } },
      { id: 'default', command: 'kubectl auth can-i list pods -n default --as=system:serviceaccount:cka-lab-rbac:log-reader', outputs: { start: 'rbac-can-default', fixed: null } },
      { id: 'get', command: 'kubectl -n cka-lab-rbac get role,rolebinding', outputs: { start: 'rbac-get', roleCreated: null, fixed: 'rbac-get-2' } },
    ],
    decisions: [
      {
        id: 'scope',
        prompt: 'Which RBAC objects fit "in this namespace only"?',
        options: [
          { id: 'role', label: 'A Role and a RoleBinding, both created in namespace cka-lab-rbac.', correct: true, feedback: 'Right. A Role grants permissions inside its own namespace only.' },
          { id: 'cluster', label: 'A ClusterRole and a ClusterRoleBinding granting the same Pod verbs.', correct: false, feedback: 'A ClusterRoleBinding grants it in every namespace; the default-namespace check would then say yes.' },
          { id: 'view', label: 'A RoleBinding in cka-lab-rbac to the built-in view ClusterRole.', correct: false, feedback: 'view also covers ConfigMaps, Services and more. The task allows Pods and their logs only.' },
        ],
      },
      {
        id: 'role',
        prompt: 'Create the Role.',
        stateAfter: 'roleCreated',
        options: [
          {
            id: 'right',
            label: 'kubectl -n cka-lab-rbac create role log-reader --verb=get,list,watch --resource=pods,pods/log',
            correct: true,
            feedback: 'Created. A Role does nothing until something is bound to it, so the checks still say no.',
            shows: [{ command: 'kubectl -n cka-lab-rbac create role log-reader --verb=get,list,watch --resource=pods,pods/log', output: 'rbac-fix-role' }],
          },
          {
            id: 'podsonly',
            label: 'kubectl -n cka-lab-rbac create role log-reader --verb=get,list,watch --resource=pods',
            correct: false,
            feedback: 'Logs are a separate subresource. Even once bound, a Role with only pods leaves the log check at no.',
            shows: [{ command: 'kubectl auth can-i get pods --subresource=log -n cka-lab-rbac --as=system:serviceaccount:cka-lab-rbac:log-reader', output: 'rbac-wrong-podsonly-log' }],
          },
          { id: 'star', label: `kubectl -n cka-lab-rbac create role log-reader --verb='*' --resource='*'`, correct: false, feedback: 'That includes Secrets and delete. The task said nothing else.' },
        ],
      },
      {
        id: 'bind',
        prompt: 'Bind it to the ServiceAccount.',
        stateAfter: 'fixed',
        options: [
          {
            id: 'right',
            label: 'kubectl -n cka-lab-rbac create rolebinding log-reader --role=log-reader --serviceaccount=cka-lab-rbac:log-reader',
            correct: true,
            feedback: 'Bound. Run the can-i checks again.',
            shows: [{ command: 'kubectl -n cka-lab-rbac create rolebinding log-reader --role=log-reader --serviceaccount=cka-lab-rbac:log-reader', output: 'rbac-fix-bind' }],
          },
          {
            id: 'nons',
            label: 'kubectl -n cka-lab-rbac create rolebinding log-reader --role=log-reader --serviceaccount=log-reader',
            correct: false,
            feedback: 'kubectl needs the ServiceAccount as namespace:name.',
            shows: [{ command: 'kubectl -n cka-lab-rbac create rolebinding log-reader --role=log-reader --serviceaccount=log-reader', output: 'rbac-fix-bind-nons' }],
          },
          {
            id: 'user',
            label: 'kubectl -n cka-lab-rbac create rolebinding log-reader --role=log-reader --user=log-reader',
            correct: false,
            feedback: 'That binds a user called log-reader. The ServiceAccount authenticates as system:serviceaccount:cka-lab-rbac:log-reader, so it still gets no.',
            shows: [
              { command: 'kubectl -n cka-lab-rbac create rolebinding log-reader-user --role=log-reader --user=log-reader', output: 'rbac-fix-bind-user' },
              { command: 'kubectl auth can-i list pods -n cka-lab-rbac --as=system:serviceaccount:cka-lab-rbac:log-reader', output: 'rbac-wrong-user-list' },
            ],
          },
        ],
      },
    ],
    debrief: [
      'kubectl auth can-i --as=system:serviceaccount:<namespace>:<name> checks a ServiceAccount without needing its token.',
      'Subresources such as pods/log, pods/exec and deployments/scale need their own rules.',
    ],
    estimateMinutes: 6,
  },
  {
    id: 'sim.rollout-rollback',
    title: 'Stalled rollout after a bad image',
    taskId: 'task.rollout-rollback',
    skillId: 'workloads.deployments-rollouts',
    briefing:
      'Someone updated Deployment shop in namespace cka-lab-rollout to a new image and the rollout has stalled. Find out what happened and restore the last working version using the rollout history.',
    given: ['Deployment shop (3 replicas), first at nginx:1.27, then updated'],
    commands: [
      { id: 'status', command: 'kubectl -n cka-lab-rollout rollout status deployment/shop --timeout=10s', outputs: { start: 'ro-status', fixed: 'ro-status-2' } },
      { id: 'pods', command: 'kubectl -n cka-lab-rollout get pods', outputs: { start: 'ro-pods', fixed: 'ro-pods-2' } },
      { id: 'rs', command: 'kubectl -n cka-lab-rollout get rs', outputs: { start: 'ro-rs', fixed: 'ro-rs-2' } },
      { id: 'events', command: 'kubectl -n cka-lab-rollout get events --field-selector type=Warning', outputs: { start: 'ro-events', fixed: null } },
      { id: 'history', command: 'kubectl -n cka-lab-rollout rollout history deployment/shop', outputs: { start: 'ro-history', fixed: 'ro-history-2' } },
      { id: 'strategy', command: `kubectl -n cka-lab-rollout get deployment shop -o jsonpath='{.spec.strategy}'`, outputs: { start: 'ro-strategy' } },
    ],
    decisions: [
      {
        id: 'cause',
        prompt: 'Why is the new Pod not starting?',
        options: [
          { id: 'tag', label: 'The tag nginx:1.27-doesnotexist does not exist in the registry.', correct: true, feedback: 'Right. ErrImagePull, then ImagePullBackOff while the kubelet retries with back-off.' },
          { id: 'ratelimit', label: 'Docker Hub is rate-limiting pulls from this node, so the image cannot be fetched.', correct: false, feedback: 'A rate limit reads "toomanyrequests". This error is NotFound for that exact tag.' },
          { id: 'disk', label: 'The node has run out of disk space, so the image cannot be unpacked there.', correct: false, feedback: 'That shows up as DiskPressure or eviction events. The registry answered that the tag is not found.' },
        ],
      },
      {
        id: 'why-serving',
        prompt: 'Three old Pods are still Running. Why?',
        options: [
          { id: 'math', label: 'maxUnavailable 25% of 3 rounds down to 0, so no old Pod goes until a new one is Ready.', correct: true, feedback: 'Right. And maxSurge 25% rounds up to 1, so exactly one new Pod was tried. The default strategy kept full capacity while it failed.' },
          { id: 'auto', label: 'Kubernetes noticed the failed pull and automatically rolled back to the previous revision.', correct: false, feedback: 'There is no automatic rollback. The history still ends at revision 2, and the new ReplicaSet still wants 1 Pod.' },
          { id: 'paused', label: 'The rollout was paused by the controller as soon as the first new Pod failed.', correct: false, feedback: 'A paused Deployment would not create the new Pod at all, and rollout status would say it is paused.' },
        ],
      },
      {
        id: 'restore',
        prompt: 'Restore the last working version from the rollout history.',
        stateAfter: 'fixed',
        options: [
          {
            id: 'undo',
            label: 'kubectl -n cka-lab-rollout rollout undo deployment/shop',
            correct: true,
            feedback: 'Rolled back. The old ReplicaSet becomes current again and the broken one scales to 0.',
            shows: [
              { command: 'kubectl -n cka-lab-rollout rollout undo deployment/shop', output: 'ro-fix-undo' },
              { command: 'kubectl -n cka-lab-rollout rollout status deployment/shop --timeout=120s', output: 'ro-status-2' },
            ],
          },
          { id: 'setimage', label: 'kubectl -n cka-lab-rollout set image deployment/shop nginx=nginx:1.27', correct: false, feedback: 'That would work, but you typed the old image from memory. The task was to restore from the rollout history, which also works when you do not know the old spec.' },
          { id: 'restart', label: 'kubectl -n cka-lab-rollout rollout restart deployment/shop', correct: false, feedback: 'restart re-runs the current template, which is the broken image.' },
        ],
      },
    ],
    debrief: [
      'After undo, revision 1 became revision 3: undo reuses the old template under a new number.',
      'The three working Pods were never replaced (look at their ages). Only the broken ReplicaSet scaled to 0.',
    ],
    estimateMinutes: 6,
  },
  {
    id: 'sim.networkpolicy-allow-api',
    title: 'Lock down database access',
    taskId: 'task.networkpolicy-allow-api',
    skillId: 'networking.network-policies',
    briefing:
      'In namespace cka-lab-netpol, every Pod can reach the db Service. Only Pods labelled role=api should be able to connect to db on TCP 80. Do not change how other Pods talk to anything except db.',
    given: ['Deployment db (nginx:1.27) behind Service db', 'Pod api (role=api)', 'Pod other (role=other)', 'CNI that enforces NetworkPolicy (kindnet in this run)'],
    commands: [
      { id: 'pods', command: 'kubectl -n cka-lab-netpol get pods --show-labels', outputs: { start: 'np-pods' } },
      { id: 'policies', command: 'kubectl -n cka-lab-netpol get networkpolicy', outputs: { start: 'np-get', fixed: 'np-get-2' } },
      { id: 'api', command: `kubectl -n cka-lab-netpol exec api -- wget -qO- -T 3 http://db | grep -o '<title>.*</title>'`, outputs: { start: 'np-api', fixed: 'np-api-2' } },
      { id: 'other', command: `kubectl -n cka-lab-netpol exec other -- wget -qO- -T 3 http://db | grep -o '<title>.*</title>'`, outputs: { start: 'np-other', fixed: 'np-other-2' } },
    ],
    decisions: [
      {
        id: 'why-open',
        prompt: 'Why can other reach db right now?',
        options: [
          { id: 'none', label: 'No NetworkPolicy selects the db Pods, so they accept all traffic.', correct: true, feedback: 'Right. Pods are non-isolated until a policy selects them.' },
          { id: 'cni', label: 'The CNI plugin in this cluster does not enforce NetworkPolicy objects.', correct: false, feedback: 'You cannot tell yet: there is no policy to enforce. Test again after applying one.' },
          { id: 'sa', label: 'api and other run as the same ServiceAccount, so they get identical access.', correct: false, feedback: 'NetworkPolicy selects by Pod labels, namespaces and IP blocks, not by ServiceAccount.' },
        ],
      },
      {
        id: 'policy',
        prompt: 'Which policy meets the requirement?',
        stateAfter: 'fixed',
        options: [
          {
            id: 'ingress',
            label: 'Ingress policy selecting app=db Pods, allowing from Pods with role=api on TCP 80.',
            correct: true,
            feedback: 'Applied. The db Pods are now isolated for ingress except from role=api.',
            shows: [{ command: 'kubectl -n cka-lab-netpol apply -f db-allow-api.yaml', output: 'np-fix' }],
          },
          {
            id: 'egress',
            label: 'Egress policy selecting role=api Pods, allowing to Pods with app=db on TCP 80.',
            correct: false,
            feedback: 'It protects nothing on db, so other still connects. Worse, api is now egress-isolated and cannot reach CoreDNS, so the name db no longer resolves.',
            shows: [
              { command: `kubectl -n cka-lab-netpol exec other -- wget -qO- -T 3 http://db | grep -o '<title>.*</title>'`, output: 'np-wrong-egress-other' },
              { command: `kubectl -n cka-lab-netpol exec api -- wget -qO- -T 3 http://db | grep -o '<title>.*</title>'`, output: 'np-wrong-egress-api' },
            ],
          },
          { id: 'all', label: 'Ingress policy selecting every Pod (podSelector: {}), allowing from Pods with role=api.', correct: false, feedback: 'That also isolates api and other for ingress, changing traffic to Pods other than db.' },
        ],
      },
    ],
    debrief: [
      'Protect the destination: an ingress policy on the Pods being reached.',
      'An egress policy that does not allow DNS (UDP and TCP 53 to kube-dns) breaks name resolution for the Pods it selects. "bad address" is the symptom.',
      'A dropped connection times out ("download timed out"); it is not refused.',
    ],
    estimateMinutes: 6,
  },
  {
    id: 'sim.node-notready-kubelet',
    title: 'Worker node NotReady',
    taskId: 'task.node-notready-kubelet',
    skillId: 'troubleshooting.clusters-nodes',
    briefing:
      'After maintenance, worker damonsec-lab-worker2 shows NotReady. Bring it back and make sure the fix survives a reboot. This run used kind, so a shell on the node is docker exec <node>; on VMs you would SSH in.',
    given: ['Three-node cluster: control plane, damonsec-lab-worker, damonsec-lab-worker2'],
    commands: [
      { id: 'nodes', command: 'kubectl get nodes', outputs: { start: 'node-get', fixed: 'node-get-2' } },
      { id: 'conditions', command: `kubectl describe node damonsec-lab-worker2 | sed -n '/^Conditions:/,/^Addresses:/p'`, outputs: { start: 'node-conditions', fixed: null } },
      { id: 'taints', command: `kubectl describe node damonsec-lab-worker2 | grep -A2 '^Taints:'`, outputs: { start: 'node-taints', fixed: null } },
      { id: 'status', command: 'docker exec damonsec-lab-worker2 systemctl status kubelet --no-pager', outputs: { start: 'node-status', fixed: null } },
      { id: 'journal', command: 'docker exec damonsec-lab-worker2 journalctl -u kubelet -n 4 --no-pager -o cat', outputs: { start: 'node-journal', fixed: null } },
      { id: 'runtime', command: 'docker exec damonsec-lab-worker2 systemctl is-active containerd', outputs: { start: 'node-runtime' } },
      { id: 'active', command: 'docker exec damonsec-lab-worker2 systemctl is-active kubelet', outputs: { start: null, fixed: 'node-active-2' } },
      { id: 'enabled', command: 'docker exec damonsec-lab-worker2 systemctl is-enabled kubelet', outputs: { start: null, fixed: 'node-enabled-2' } },
    ],
    decisions: [
      {
        id: 'cause',
        prompt: 'Why is the node NotReady?',
        options: [
          { id: 'kubelet', label: 'kubelet on the node is stopped, so nothing reports the node\'s status.', correct: true, feedback: 'Right. Conditions are Unknown with "Kubelet stopped posting node status", and systemctl shows kubelet inactive (dead).' },
          { id: 'runtime', label: 'containerd on the node is down, so the kubelet reports the runtime as not ready.', correct: false, feedback: 'is-active containerd says active. A runtime problem would also show in Ready\'s message, not "stopped posting".' },
          { id: 'cordon', label: 'The node was cordoned during maintenance and nobody uncordoned it afterwards.', correct: false, feedback: 'Unschedulable is false. A cordoned node is still Ready; the taints here are the automatic unreachable ones.' },
          { id: 'network', label: 'A network partition is stopping the node from reaching the API server.', correct: false, feedback: 'That gives the same symptom from the API side, but on the node kubelet is not running at all. Check the node first.' },
        ],
      },
      {
        id: 'fix',
        prompt: 'Fix it so it survives a reboot.',
        stateAfter: 'fixed',
        options: [
          {
            id: 'enable',
            label: 'docker exec damonsec-lab-worker2 systemctl enable --now kubelet',
            correct: true,
            feedback: 'Enabled and started. The node goes Ready within seconds.',
            shows: [{ command: 'docker exec damonsec-lab-worker2 systemctl enable --now kubelet', output: 'node-fix-enable' }],
          },
          {
            id: 'start',
            label: 'docker exec damonsec-lab-worker2 systemctl start kubelet',
            correct: false,
            feedback: 'The node comes back for now, but kubelet is still disabled, so the next reboot brings the problem back.',
            shows: [
              { command: 'docker exec damonsec-lab-worker2 systemctl start kubelet', output: 'node-fix-start' },
              { command: 'docker exec damonsec-lab-worker2 systemctl is-enabled kubelet', output: 'node-enabled-after-start' },
            ],
          },
          {
            id: 'uncordon',
            label: 'kubectl uncordon damonsec-lab-worker2',
            correct: false,
            feedback: 'The node was never cordoned. Scheduling is not the problem; status reporting is.',
            shows: [{ command: 'kubectl uncordon damonsec-lab-worker2', output: 'node-fix-uncordon' }],
          },
        ],
      },
    ],
    debrief: [
      'In this run the node went NotReady roughly 50 seconds after kubelet stopped. Pods on it get evicted after the 300-second unreachable toleration.',
      '"Running now" and "starts at boot" are separate: check systemctl is-enabled as well as is-active.',
    ],
    estimateMinutes: 6,
  },
];

export function getSimulation(id: string): Simulation | undefined {
  return SIMULATIONS.find((s) => s.id === id);
}

/** Display name for an attempt's task or simulation ID. */
export function practiceItemTitle(id: string): string | null {
  const task = getTask(id);
  if (task) return task.title;
  const sim = getSimulation(id);
  return sim ? `Simulation: ${sim.title}` : null;
}

export function simulationsForSkill(skillId: string): Simulation[] {
  return SIMULATIONS.filter((s) => s.skillId === skillId);
}

/**
 * Options in display order. Data lists the correct option first for
 * readability; this mixes them with a fixed hash so the order is the same on
 * server and client and between visits, without giving the answer away.
 */
export function orderedOptions(decision: SimDecision): SimOption[] {
  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  const wrong = decision.options
    .filter((o) => !o.correct)
    .sort((a, b) => hash(`${decision.id}:${a.id}`) - hash(`${decision.id}:${b.id}`));
  const correct = decision.options.find((o) => o.correct);
  if (!correct) return wrong;
  // Index derived from the scenario and step so answers spread across positions.
  wrong.splice(hash(`${decision.id}:${correct.id}:${decision.options.length}`) % decision.options.length, 0, correct);
  return wrong;
}

export const NOT_RECORDED =
  '(No output was recorded for this command at this point in the scenario. Run it on your lab cluster to see it.)';

/** Whether real output was recorded for this command in this state. */
export function isRecorded(cmd: SimCommand, state: string): boolean {
  return Boolean(state in cmd.outputs ? cmd.outputs[state] : cmd.outputs.start);
}

/** Output for a command in the current state. */
export function commandOutput(cmd: SimCommand, state: string): string {
  const key = state in cmd.outputs ? cmd.outputs[state] : cmd.outputs.start;
  return key ? CAPTURES[key] : NOT_RECORDED;
}

/** Matches typed input to a scripted command: ignores extra spaces, a leading "$", and accepts "k" for kubectl. */
export function matchCommand(sim: Simulation, input: string): SimCommand | null {
  const norm = (s: string) =>
    s.trim().replace(/^\$\s*/, '').replace(/^k\s/, 'kubectl ').replace(/\s+/g, ' ').replace(/"/g, "'");
  const wanted = norm(input);
  if (!wanted) return null;
  return sim.commands.find((c) => norm(c.command) === wanted) ?? null;
}

export type SimOutcome = { mistakes: number; suggested: 'independent' | 'hints' };

export function suggestOutcome(mistakes: number): SimOutcome {
  return { mistakes, suggested: mistakes === 0 ? 'independent' : 'hints' };
}
