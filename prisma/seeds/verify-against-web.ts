/* eslint-disable no-console */
// Cross-check the seeded SiteContent + structured tables against the live
// msk-web HTML. Prints mismatches only — silent rows are OK.

import * as fs from 'fs';
import * as path from 'path';

import {
  EXPANSION_CITIES_SEED,
  HOUSE_RULES_SEED,
  JOB_POSTINGS_SEED,
  SITE_CONTENT_SEED,
} from '../../src/modules/site-content/cms-seed-data';

const ROUTE_FILES: Record<string, string> = {
  '/':        'd:/tmp/web-home.html',
  '/about':   'd:/tmp/web-about.html',
  '/careers': 'd:/tmp/web-careers.html',
  '/rules':   'd:/tmp/web-rules.html',
};

// Which routes a given content group is expected to appear on.
const GROUP_ROUTES: Record<string, string[]> = {
  'site':            ['/', '/about', '/careers', '/rules'],
  'topbar':          ['/', '/about', '/careers', '/rules'],
  'hero':            ['/'],
  'discover':        ['/'],
  'why-choose-us':   ['/'],
  'expansion':       ['/'],
  'book-now':        ['/', '/about', '/careers', '/rules'],
  'about':           ['/about'],
  'newsletter-modal':['/about'],
  'partner-modal':   ['/about'],
  'careers':         ['/careers'],
  'rules':           ['/rules'],
  'footer':          ['/', '/about', '/careers', '/rules'],
  'auth':            [],   // login routes not in our HTML dump
};

function htmlText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function fileExists(p: string) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

const cache = new Map<string, string>();
function load(route: string): string {
  if (cache.has(route)) return cache.get(route)!;
  const p = ROUTE_FILES[route];
  if (!p || !fileExists(p)) return '';
  const raw = fs.readFileSync(p, 'utf8');
  const text = htmlText(raw);
  cache.set(route, text);
  return text;
}

const mismatches: string[] = [];
const skipped: string[] = [];
let checked = 0;

// ── SiteContent ──────────────────────────────────────────────────────────
for (const entry of SITE_CONTENT_SEED) {
  // Skip image URLs and empty values — not user-visible plain text.
  if (entry.type === 'IMAGE_URL' || entry.type === 'URL') continue;
  if (entry.value.trim() === '') continue;
  // Skip site-name (matches too many things) and topbar contains a span split.
  if (entry.key === 'site.name' || entry.key === 'site.description') continue;

  const routes = GROUP_ROUTES[entry.group];
  if (!routes || routes.length === 0) { skipped.push(`${entry.key} (no route mapping)`); continue; }

  // For values containing newlines, check each non-empty line independently.
  const needles = entry.value.split('\n').map((s) => normalize(s)).filter(Boolean);

  let found = false;
  for (const route of routes) {
    const haystack = load(route);
    if (!haystack) continue;
    if (needles.every((n) => haystack.includes(n))) { found = true; break; }
  }
  checked += 1;
  if (!found) {
    mismatches.push(`MISSING [${entry.key}] in ${routes.join('|')}: ${JSON.stringify(entry.value).slice(0, 140)}`);
  }
}

// ── HouseRule ────────────────────────────────────────────────────────────
const rulesHtml = load('/rules');
for (const r of HOUSE_RULES_SEED) {
  checked += 1;
  if (!rulesHtml.includes(normalize(r.title))) mismatches.push(`MISSING HouseRule title: ${r.title}`);
  if (!rulesHtml.includes(normalize(r.description))) mismatches.push(`MISSING HouseRule description for "${r.title}"`);
}

// ── ExpansionCity ────────────────────────────────────────────────────────
const homeHtml = load('/');
for (const c of EXPANSION_CITIES_SEED) {
  checked += 1;
  if (!homeHtml.includes(normalize(c.description))) mismatches.push(`MISSING ExpansionCity description for ${c.city}: ${c.description.slice(0, 120)}…`);
}

// ── JobPosting ───────────────────────────────────────────────────────────
const careersHtml = load('/careers');
for (const j of JOB_POSTINGS_SEED) {
  checked += 1;
  if (!careersHtml.includes(normalize(j.title))) mismatches.push(`MISSING Job title: ${j.title}`);
  if (!careersHtml.includes(normalize(j.description))) mismatches.push(`MISSING Job description for "${j.title}"`);
}

console.log(`Checked ${checked} strings across ${Object.keys(ROUTE_FILES).length} routes.`);
console.log(`Skipped: ${skipped.length}`);
console.log(`Mismatches: ${mismatches.length}`);
if (mismatches.length > 0) {
  console.log('');
  console.log('────── MISMATCHES ──────');
  for (const m of mismatches) console.log(m);
}

process.exit(mismatches.length > 0 ? 1 : 0);
