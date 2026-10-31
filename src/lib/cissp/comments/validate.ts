// Input rules for anonymous CISSP comments. Everything is plain text: the UI renders
// comments as React text nodes, so nothing here is ever interpreted as HTML.

import { SCENARIOS } from '../scenarios.ts';

export const NAME_MAX = 40;
export const BODY_MIN = 3;
export const BODY_MAX = 1000;
export const MAX_LINKS = 2;
export const ANONYMOUS = 'Ẩn danh';

export interface CommentInput {
  scenarioId: string;
  name: string;
  body: string;
}

export type ValidationResult =
  | { ok: true; value: CommentInput }
  | { ok: false; error: string; status: number; silent?: boolean };

// C0/C1 control characters except tab and newline, plus bidi overrides and zero-width
// characters that can be used to disguise text.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;

export function cleanText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isScenarioId(id: unknown): id is string {
  return typeof id === 'string' && SCENARIOS.some((s) => s.id === id);
}

/** Validates a raw JSON body from the comment form. */
export function validateComment(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid request', status: 400 };
  const r = raw as Record<string, unknown>;

  // Honeypot: a field real users never see. Bots that fill it get a fake success.
  if (typeof r.website === 'string' && r.website.trim() !== '') {
    return { ok: false, error: 'ok', status: 200, silent: true };
  }
  if (!isScenarioId(r.scenarioId)) return { ok: false, error: 'Unknown scenario', status: 400 };
  if (typeof r.body !== 'string' || (r.name !== undefined && typeof r.name !== 'string')) {
    return { ok: false, error: 'Invalid request', status: 400 };
  }

  const name = cleanText((r.name as string | undefined) ?? '').replace(/\s+/g, ' ');
  const body = cleanText(r.body);

  if (name.length > NAME_MAX) return { ok: false, error: `Name is longer than ${NAME_MAX} characters`, status: 400 };
  if (body.length < BODY_MIN) return { ok: false, error: 'Comment is too short', status: 400 };
  if (body.length > BODY_MAX) return { ok: false, error: `Comment is longer than ${BODY_MAX} characters`, status: 400 };
  const links = body.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links > MAX_LINKS) return { ok: false, error: 'Too many links', status: 400 };

  return { ok: true, value: { scenarioId: r.scenarioId, name: name || ANONYMOUS, body } };
}
