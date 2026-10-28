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
  /** Output by simulation state. 'start' is required; other states fall back to it. */
  outputs: { start: CaptureKey } & Partial<Record<string, CaptureKey>>;
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
          { id: 'port', label: 'The Service sends traffic to targetPort 8080, but nginx listens on port 80.', correct: true, feedback: 'Right. The endpoints show port 8080. Refused means something answered with a reset: nothing listens there.' },
          { id: 'netpol', label: 'A NetworkPolicy is blocking the client.', correct: false, feedback: 'A NetworkPolicy drop usually shows up as a timeout, not an immediate refusal. Look at the PORTS column of the EndpointSlice.' },
          { id: 'cache', label: 'The client cached the old, empty endpoint list.', correct: false, feedback: 'Clients connect to the ClusterIP; kube-proxy updates the rules within seconds. Look at the port the endpoints use.' },
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
          { id: 'env', label: 'The start-up script exits with code 1 because QUEUE_URL is not set.', correct: true, feedback: 'Right. The log says so, describe shows Exit Code 1 with reason Error, and the Deployment has no env.' },
          { id: 'oom', label: 'It runs out of memory and gets OOMKilled.', correct: false, feedback: 'An OOM kill shows reason OOMKilled and exit code 137. describe shows reason Error, exit code 1.' },
          { id: 'image', label: 'The image cannot be pulled.', correct: false, feedback: 'That would show ErrImagePull or ImagePullBackOff, and the container would never start. Events show it started four times.' },
          { id: 'probe', label: 'A liveness probe keeps failing.', correct: false, feedback: 'There is no probe in the Pod, and events would say "Liveness probe failed". The container exits on its own.' },
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
          { id: 'sc', label: 'The claim asks for StorageClass fast-ssd, which does not exist, so no volume is provisioned.', correct: true, feedback: 'Right. The PVC event says storageclass "fast-ssd" not found, and the Pod cannot schedule with an unbound claim.' },
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
            label: 'Delete Pod writer and PVC data, recreate the PVC with storageClassName: standard, then recreate the Pod.',
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
          { id: 'pv', label: 'Create a PersistentVolume by hand with storageClassName: fast-ssd.', correct: false, feedback: 'A matching static PV could bind, but the objective is to use a StorageClass that exists, and you would be inventing a class name with no provisioner behind it.' },
        ],
      },
    ],
    debrief: [
      'When a Pod is Pending with a volume, read the PVC events before the Pod events.',
      'With volumeBindingMode WaitForFirstConsumer, a new claim stays Pending until a Pod uses it. That is expected, not a second failure.',
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
  return [...decision.options].sort((a, b) => hash(`${decision.id}:${a.id}`) - hash(`${decision.id}:${b.id}`));
}

/** Output for a command in the current state. */
export function commandOutput(cmd: SimCommand, state: string): string {
  return CAPTURES[cmd.outputs[state] ?? cmd.outputs.start];
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
