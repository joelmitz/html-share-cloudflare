import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2).map((value) => path.resolve(value));
if (!roots.length) roots.push(path.resolve('skills/mobile'), path.resolve('skills/create-html'), path.resolve('skills/inbox'));

const failures = [];

for (const root of roots) {
  const name = path.basename(root);
  const skillFile = path.join(root, 'SKILL.md');
  const agentFile = path.join(root, 'agents', 'openai.yaml');

  if (!existsSync(skillFile)) {
    failures.push(`${name}: SKILL.md is missing`);
    continue;
  }

  const skill = readFileSync(skillFile, 'utf8');
  const match = skill.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    failures.push(`${name}: SKILL.md must start with YAML frontmatter`);
    continue;
  }

  const keys = [...match[1].matchAll(/^([a-z_]+):/gm)].map((item) => item[1]);
  if (keys.join(',') !== 'name,description') failures.push(`${name}: frontmatter must contain only name and description`);
  if (!new RegExp(`^name: ${name}$`, 'm').test(match[1])) failures.push(`${name}: skill name must match its directory`);
  const description = match[1].match(/^description:\s*(.+)$/m)?.[1] ?? '';
  if (description.length < 40) failures.push(`${name}: description must explain what the skill does and when to use it`);

  if (!existsSync(agentFile)) {
    failures.push(`${name}: agents/openai.yaml is missing`);
  } else {
    const agent = readFileSync(agentFile, 'utf8');
    if (!agent.includes(`$${name}`)) failures.push(`${name}: default_prompt must mention $${name}`);
  }

  if (name === 'mobile') {
    if (!description.includes('/mobile') || !description.includes('$mobile')) {
      failures.push('mobile: description must state the explicit /mobile and $mobile triggers');
    }
    if (!skill.includes('html-share review watch')) failures.push('mobile: skill must include the review watcher');
    if (!skill.includes('Do not include secrets')) failures.push('mobile: skill must include the secret-handling boundary');
  }

  if (name === 'inbox') {
    if (!description.includes('/inbox') || !description.includes('$inbox')) {
      failures.push('inbox: description must state the explicit /inbox and $inbox triggers');
    }
    if (!skill.includes('html-share review inbox')) failures.push('inbox: skill must read requests with the CLI');
    if (!skill.includes('html-share review complete')) failures.push('inbox: skill must close finished requests with the CLI');
  }

  if (name === 'create-html') {
    const templateFile = path.join(root, 'assets', 'brief-template.html');
    if (!existsSync(templateFile)) {
      failures.push('create-html: assets/brief-template.html is missing');
    } else {
      const template = readFileSync(templateFile, 'utf8');
      for (const token of ['<!doctype html>', 'viewport-fit=cover', 'noindex, nofollow', '--blue-grad', '.hero, .hero *']) {
        if (!template.includes(token)) failures.push(`create-html: template must include ${token}`);
      }
    }
    if (!existsSync(path.join(root, 'scripts', 'check-html.mjs'))) failures.push('create-html: scripts/check-html.mjs is missing');
    if (!skill.includes('check-html.mjs')) failures.push('create-html: skill must run the static checker');
    if (!skill.includes('Do not invent facts')) failures.push('create-html: skill must protect source accuracy');
    if (!skill.includes('real IP allowlists')) failures.push('create-html: skill must include the public-safety boundary');
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`${roots.length} skill(s) are valid`);
