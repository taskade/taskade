# Contributing to Taskade

Thank you for being here. This repository is the public home for the Taskade docs,
guides, comparisons, and a list of [clone-ready App Kits](docs/genesis/app-kits.md).
You do not need to be a developer to contribute. Most of the best contributions are
plain English.

## Ways to contribute

| I want to… | Do this |
|---|---|
| 🐞 Report something that is broken in Taskade (the app, a Taskade Genesis app, an agent, an automation) | [Open a bug report](https://github.com/taskade/taskade/issues/new?template=product_bug.yml) |
| 💡 Ask for a feature | [Ask for a feature](https://github.com/taskade/taskade/issues/new?template=feature_request.yml) |
| 🧩 Ask for an App Kit | [Ask for an App Kit](https://github.com/taskade/taskade/issues/new?template=app_kit_request.yml) |
| 📄 Report a wrong fact, a broken link, or a missing page in the docs | [Report a docs problem](https://github.com/taskade/taskade/issues/new?template=docs_problem.yml) |
| 🚀 Submit an app you built with Taskade Genesis | [Submit an App Kit](https://github.com/taskade/taskade/issues/new?template=submit_app_kit.yml) |
| 💬 Ask a question or share an idea | [Start a Discussion](https://github.com/taskade/taskade/discussions) |
| 🆘 Get help with your account or your bill | [Contact us privately](https://www.taskade.com/contact) |
| 🔒 Report a security problem | [Report it privately](https://github.com/taskade/taskade/security/advisories/new). See [SECURITY.md](SECURITY.md) |
| ✍️ Improve the docs | Open a pull request (see below) |

## Report a problem

Pick a form on the [new issue page](https://github.com/taskade/taskade/issues/new/choose).
Each form takes about 2 minutes. You answer a few short questions, and you do not
need to know any technical words.

### Keep private data out of your issue

Every issue in this repository is public. Anyone can read it, and search engines can
find it. Before you post, remove:

- Passwords, API keys and tokens
- Email addresses and phone numbers
- Links to a private workspace or project (links with `/spaces/`, `/p/`, `/d/`, `/e/` or `/v/`)
- Names or data of your customers

A link to a published app that anyone can open without signing in is fine. A screenshot
is welcome only if it shows no private data.

A privacy guard reads each new issue and comment. When it finds text that looks like
private data, it replaces that text with `[removed: looked like ...]` and posts a short
comment. GitHub sends notification emails before the guard runs, so the guard is a
second check, not the first. The first check is you.

## Submit your app as an App Kit

Built something with [Taskade Genesis](https://www.taskade.com/ai/apps)? We
feature community apps in our list of [clone-ready App Kits](docs/genesis/app-kits.md). Open
the **[Submit an App Kit](https://github.com/taskade/taskade/issues/new?template=submit_app_kit.yml)**
issue with:

- Your app's public `https://www.taskade.com/share/apps/...` link
- A one-line description of what it does (outcome-first)
- A category (sales, support, marketing, ops, personal, other)
- Optionally, a screenshot or your creator handle so we can credit you

Accepted apps are added to the list with a link back to you.

## Editing docs (pull requests)

1. Fork the repo and create a branch.
2. Make your change. Keep it **additive** where possible. Do not remove existing
   sections.
3. Open a pull request describing what changed and why.

### Style guide

- **Audience:** non-technical, outcome-first. Lead with the benefit, then the how.
- **Product name:** write **Taskade Genesis** in full on first mention in a page.
- **Honesty:** no fabricated statistics, no invented quotes, and comparisons must
  fairly credit competitors' strengths.
- **Links:** use relative links between docs (e.g. `../genesis/app-kits.md`) and
  verify they resolve.
- **Images:** reference local files in `media/` (relative paths); add descriptive
  alt text.
- **One H1 per page**, then `##`/`###` sections — ideally phrased as questions so
  search and AI answer engines can quote them.

## For maintainers

### What `privacy-hold` means

The privacy guard (`.github/workflows/privacy-guard.yml`) removed text that looked like
private data from an issue, a comment or a title. The text is gone from the page, but
the old version is still in the edit history until a maintainer deletes it. The label
stays until you finish the steps below.

The guard does not read text from bots or from people with write access, so you can quote
a pattern in a discussion. It also does not undo your edit of the text of someone else.

### Remove an old revision from the edit history

1. Open the issue, and find the text that shows `[removed: looked like ...]`.
2. In the header of that text, click **edited** to open the edit history.
3. Select a revision that holds the private data.
4. Click the options menu in the revision window, then **Delete revision from history**.
5. Do steps 3 and 4 again for each revision that holds the data.
6. Make sure that no revision shows the data, then remove the `privacy-hold` label.

If the guard removed text by mistake, edit the text to put it back, and remove the label.

### When to revoke a token

Treat a token or a key as exposed when it was posted, even if the guard removed it in
seconds. The notification emails can still hold it.

- If the token belongs to the reporter, the guard comment tells them how to revoke it.
  If they do not confirm in a day, ask them again in a comment.
- If the token belongs to you, to Taskade or to a Taskade service, revoke it at once,
  then delete the revisions.

### Labels

`.github/labels.yml` lists the labels that the forms and the workflows use. To create
the labels that are not in the repository yet, run:

<details>
<summary>Label commands</summary>

```bash
R=taskade/taskade
gh label create app-kit-request    -R "$R" --color f9a8c0 --description "A request for a new App Kit"
gh label create "area:genesis-apps" -R "$R" --color c5def5 --description "Taskade Genesis apps"
gh label create "area:agents"       -R "$R" --color c5def5 --description "AI agents"
gh label create "area:automations"  -R "$R" --color c5def5 --description "Automations and integrations"
gh label create "area:projects"     -R "$R" --color c5def5 --description "Projects and views"
gh label create "area:sharing"      -R "$R" --color c5def5 --description "Sharing and publishing"
gh label create "area:billing-page" -R "$R" --color c5def5 --description "How the billing page shows plans and prices"
gh label create "area:mobile"       -R "$R" --color c5def5 --description "The iOS and Android apps"
gh label create "area:desktop"      -R "$R" --color c5def5 --description "The Mac and Windows apps"
gh label create "area:mcp"          -R "$R" --color c5def5 --description "The MCP server and AI clients"
gh label create needs-info          -R "$R" --color fbca04 --description "We need more details from the author. Closes after 14 days with no reply."
gh label create privacy-hold        -R "$R" --color b60205 --description "The privacy guard removed private data. A maintainer must clear the edit history."
```

</details>

### Ask for more details

Add the `needs-info` label and a comment that says what you need. When the author
replies, the label goes away. If the author does not reply for 14 days, the issue
closes with a kind comment. A reply after that opens it again. No other issue closes
on its own, and no issue is locked.

## Code of Conduct

By participating, you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).
