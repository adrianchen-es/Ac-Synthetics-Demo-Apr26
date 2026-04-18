/**
 * Static analysis for Elastic Synthetics `journey()` monitor names.
 *
 * Kibana monitor creation can fail when names contain non-ASCII punctuation
 * (for example U+2013 EN DASH "–" instead of U+002D HYPHEN-MINUS "-").
 * This module walks journey sources and ensures names are 7-bit ASCII only.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';
import { parseTlsTargetHostsCsv } from './loadTlsTargetHosts';

export type JourneyNameViolation = {
  /** Path relative to project root */
  file: string;
  line: number;
  column: number;
  message: string;
  /** Short excerpt for debugging */
  fragment: string;
};

function firstNonAsciiIssue(s: string): string | null {
  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i)!;
    if (cp > 127) {
      const hex = cp.toString(16).toUpperCase().padStart(4, '0');
      return `non-ASCII U+${hex} (${JSON.stringify(s.slice(i, i + (cp > 0xffff ? 2 : 1)))})`;
    }
    i += cp > 0xffff ? 2 : 1;
  }
  return null;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function readTlsHosts(root: string): readonly string[] {
  const csvPath = join(root, 'journeys', 'tls-target-hosts.csv');
  const raw = readFileSync(csvPath, 'utf8');
  return parseTlsTargetHostsCsv(raw).map((r) => r.host);
}

function expandTemplateMonitorNames(
  tpl: ts.TemplateExpression,
  hostValues: readonly string[],
  sourceFile: ts.SourceFile,
  relPath: string
): JourneyNameViolation[] {
  const violations: JourneyNameViolation[] = [];
  const pos = tpl.getStart(sourceFile);
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);

  const push = (message: string, fragment: string) => {
    violations.push({
      file: relPath,
      line: line + 1,
      column: character,
      message,
      fragment,
    });
  };

  const checkStatic = (text: string, label: string) => {
    const issue = firstNonAsciiIssue(text);
    if (issue) {
      push(`Journey name template ${label} contains ${issue}`, text);
    }
  };

  checkStatic(tpl.head.text, 'prefix');

  let variants: string[] = [tpl.head.text];

  for (const span of tpl.templateSpans) {
    checkStatic(span.literal.text, 'literal segment');

    let replacements: string[];
    if (ts.isIdentifier(span.expression) && span.expression.text === 'host') {
      replacements = [...hostValues];
    } else {
      push(
        `Unsupported interpolation in journey name (only \${host} is analysed): ${span.expression.getText(sourceFile)}`,
        span.expression.getText(sourceFile)
      );
      replacements = [''];
    }

    const next: string[] = [];
    for (const prefix of variants) {
      for (const r of replacements) {
        next.push(prefix + r + span.literal.text);
      }
    }
    variants = next;
  }

  for (const resolved of variants) {
    const issue = firstNonAsciiIssue(resolved);
    if (issue) {
      push(`Resolved journey name contains ${issue}`, resolved);
    }
  }

  return violations;
}

function checkNameInitializer(
  init: ts.Expression,
  hostValues: readonly string[],
  sourceFile: ts.SourceFile,
  relPath: string
): JourneyNameViolation[] {
  const violations: JourneyNameViolation[] = [];
  const pos = init.getStart(sourceFile);
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);

  const push = (message: string, fragment: string) => {
    violations.push({
      file: relPath,
      line: line + 1,
      column: character,
      message,
      fragment,
    });
  };

  if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
    const text = init.text;
    const issue = firstNonAsciiIssue(text);
    if (issue) {
      push(`Journey name contains ${issue}`, text);
    }
    return violations;
  }

  if (ts.isTemplateExpression(init)) {
    return expandTemplateMonitorNames(init, hostValues, sourceFile, relPath);
  }

  push(
    `Journey name is not a string or template literal (cannot validate): SyntaxKind.${ts.SyntaxKind[init.kind]}`,
    init.getText(sourceFile)
  );
  return violations;
}

function visitJourneyCall(
  node: ts.CallExpression,
  hostValues: readonly string[],
  sourceFile: ts.SourceFile,
  relPath: string
): JourneyNameViolation[] {
  const violations: JourneyNameViolation[] = [];
  const arg0 = node.arguments[0];
  if (!arg0) {
    violations.push({
      file: relPath,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      column: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).character,
      message: 'journey() call has no arguments',
      fragment: node.getText(sourceFile).slice(0, 80),
    });
    return violations;
  }

  if (ts.isStringLiteral(arg0) || ts.isNoSubstitutionTemplateLiteral(arg0)) {
    return checkNameInitializer(arg0, hostValues, sourceFile, relPath);
  }

  if (ts.isObjectLiteralExpression(arg0)) {
    for (const prop of arg0.properties) {
      if (!ts.isPropertyAssignment(prop)) {
        continue;
      }
      const key = propertyNameText(prop.name);
      if (key !== 'name') {
        continue;
      }
      violations.push(...checkNameInitializer(prop.initializer, hostValues, sourceFile, relPath));
    }
    return violations;
  }

  violations.push({
    file: relPath,
    line: sourceFile.getLineAndCharacterOfPosition(arg0.getStart(sourceFile)).line + 1,
    column: sourceFile.getLineAndCharacterOfPosition(arg0.getStart(sourceFile)).character,
    message: 'journey() first argument is not a string literal or { name: ... } object',
    fragment: arg0.getText(sourceFile).slice(0, 120),
  });
  return violations;
}

function walkSourceFile(sf: ts.SourceFile, hostValues: readonly string[], relPath: string): JourneyNameViolation[] {
  const out: JourneyNameViolation[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'journey'
    ) {
      out.push(...visitJourneyCall(node, hostValues, sf, relPath));
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return out;
}

function listJourneySourcePaths(journeysDir: string): string[] {
  return readdirSync(journeysDir)
    .filter((name) => name.endsWith('.journey.ts'))
    .map((name) => join(journeysDir, name));
}

/**
 * Returns violations for any `journey()` monitor name that is not entirely
 * 7-bit ASCII, plus TLS CSV hosts when used in `name: \`...${host}...\``.
 */
export function collectJourneyNameViolations(rootDir: string = process.cwd()): JourneyNameViolation[] {
  const journeysDir = join(rootDir, 'journeys');
  const hostValues = readTlsHosts(rootDir);
  const violations: JourneyNameViolation[] = [];

  for (const host of hostValues) {
    const issue = firstNonAsciiIssue(host);
    if (issue) {
      violations.push({
        file: relative(rootDir, join(rootDir, 'journeys', 'tls-target-hosts.csv')),
        line: 0,
        column: 0,
        message: `TLS target host contains ${issue} (used in dynamic journey names)`,
        fragment: host,
      });
    }
  }

  for (const absPath of listJourneySourcePaths(journeysDir)) {
    const text = readFileSync(absPath, 'utf8');
    const sf = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const rel = relative(rootDir, absPath);
    violations.push(...walkSourceFile(sf, hostValues, rel));
  }

  return violations;
}

export function formatJourneyNameViolation(v: JourneyNameViolation): string {
  const loc = v.line > 0 ? `${v.file}:${v.line}:${v.column + 1}` : v.file;
  return `${loc}: ${v.message}`;
}
