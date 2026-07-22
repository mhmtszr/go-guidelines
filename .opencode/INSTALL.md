# Installing Go Guidelines for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed

## Installation

Add go-guidelines to the `plugin` array in your `opencode.json` (global or project-level):

```json
{
  "plugin": ["go-guidelines@git+https://github.com/mhmtszr/go-guidelines.git"]
}
```

Restart OpenCode. The plugin installs through OpenCode's plugin manager and
registers the Go guidelines skill.

Verify by asking: "What Go guidelines do you follow?"

OpenCode uses its own plugin install. If you also use Claude Code, Codex, or
Cursor, install Go Guidelines separately for each one.

## Migrating from the old copy/symlink install

If you previously copied the skill into `~/.config/opencode/skills/`, remove it:

```bash
rm -rf ~/.config/opencode/skills/go-guidelines
```

Then follow the installation steps above.

## Usage

Use OpenCode's native `skill` tool:

```
use skill tool to list skills
use skill tool to load go-guidelines
```

## Updating

OpenCode installs through a git-backed package spec. If updates do not appear
after a restart, clear OpenCode's package cache or reinstall the plugin.

To pin a specific version:

```json
{
  "plugin": ["go-guidelines@git+https://github.com/mhmtszr/go-guidelines.git#v1.1.0"]
}
```

## Troubleshooting

### Plugin not loading

1. Check logs: `opencode run --print-logs "hello" 2>&1 | grep -i go-guidelines`
2. Verify the plugin line in your `opencode.json`
3. Make sure you're running a recent version of OpenCode

### Skills not found

1. Use `skill` tool to list what's discovered
2. Check that the plugin is loading (see above)

## Getting Help

- Report issues: https://github.com/mhmtszr/go-guidelines/issues
- Main documentation: https://github.com/mhmtszr/go-guidelines
