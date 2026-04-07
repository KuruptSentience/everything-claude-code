# Elsor Knowledge Base

## User Preferences
- Architecture style: TBD (awaiting first-session intake)
- Code style: TBD
- Decision-making style: TBD
- Communication: TBD
- Stack preferences: TBD

## Project Context
- **Repository**: everything-claude-code (ecc-universal v1.9.0)
- **Nature**: Claude Code plugin — agents, skills, hooks, commands, rules, MCP configs
- **Runtime**: Node.js >=18, CommonJS, no TypeScript
- **Test runner**: `node tests/run-all.js`
- **Lint**: ESLint (flat config) + markdownlint-cli
- **Package manager**: yarn 4.9.2
- **License**: MIT
- **Author**: Affaan Mustafa
- **Core principles**: Agent-first, test-driven, security-first, immutability, plan-before-execute

## Project Patterns
- File naming: lowercase with hyphens
- Agent format: Markdown with YAML frontmatter (name, description, tools, model)
- Skill format: Markdown with When to Use, How It Works, Examples sections
- Hook scripts routed through `scripts/hooks/run-with-flags.js` for runtime gating
- Hooks must exit 0 on non-critical errors
- Skills curated in `skills/`; generated/imported under `~/.claude/skills/`

## Past Decisions
- (none yet)

## Anti-Patterns (Things the User Dislikes)
- (awaiting intake)

## Learned Heuristics
- (awaiting intake)
