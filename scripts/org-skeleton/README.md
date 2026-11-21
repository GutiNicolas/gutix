# {{name}}: org profile

A gutix org profile: the settings gutix skills use for repos that belong to this organization. gutix finds it by
comparing the repo's `origin` with `match` in `gutix-org.json`. Everything here is optional; a missing file means
gutix uses its own default for that setting.

| File | What it does | If it is missing |
| --- | --- | --- |
| `gutix-org.json` | The profile. `name` labels it. `match` lists the `origin` prefixes it applies to, such as `github.com/<owner>/` (ssh and https remotes both match). `language` is the language of generated docs. `theme` points to a CSS file. `publish` (optional) points to files that describe where documents are published. Paths are relative to this folder. | The org is ignored, and gutix uses its defaults. |
| `theme.css` | One `:root` block of color and font variables used by design docs and decks. Keep the variable names, change the values. | Design docs use gutix's built-in look. |
| `README.md` | This file. | Nothing. |

A repo can override the org: a `.design-doc-theme.css` in the repo wins over `theme.css`. The order is repo, then
org profile, then gutix defaults.

## Next steps

1. Edit `match` in `gutix-org.json` so it fits your repos.
2. Edit `theme.css`.
3. To share this profile with a team, put the folder in a git repo, then run `gutix link-org <git-url>` on each
   machine. To turn it into a plugin with its own skills, add `.claude-plugin/plugin.json` and a `skills/` folder.
