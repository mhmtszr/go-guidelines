# Go Guidelines for OpenCode

Guide for using [Go Guidelines](https://github.com/mhmtszr/go-guidelines) with [OpenCode.ai](https://opencode.ai).

## Installation

Add go-guidelines to the `plugin` array in your `opencode.json` (global or project-level):

```json
{
  "plugin": ["go-guidelines@git+https://github.com/mhmtszr/go-guidelines.git"]
}
```

Restart OpenCode. The plugin registers the skill automatically.

Verify by asking: "What Go guidelines do you follow?"

### Migrating from the old copy/symlink install

```bash
rm -rf ~/.config/opencode/skills/go-guidelines
```

Then use the plugin install above.

## Usage

```
use skill tool to list skills
use skill tool to load go-guidelines
```

## Updating

To pin a version:

```json
{
  "plugin": ["go-guidelines@git+https://github.com/mhmtszr/go-guidelines.git#v1.2.0"]
}
```

## How It Works

The plugin registers the `skills/` directory via OpenCode's `config` hook so the
`go-guidelines` skill is discovered without symlinks.

## Getting Help

- Issues: https://github.com/mhmtszr/go-guidelines/issues
- OpenCode docs: https://opencode.ai/docs/
