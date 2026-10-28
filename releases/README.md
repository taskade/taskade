# Product releases

One GitHub Release per customer moment. A moment is a product email or a changelog lead that a non-technical reader can use. Daily `v6.x` builds stay in the private app repo. The public page for every build is [taskade.com/changelog](https://www.taskade.com/changelog).

Each note here is the body of a GitHub Release. The highlight is a GIF or still that already ships on taskade.com. Do not link a newsletter web view. Those links are for the send, not for search.

## Cadence

- Tag: `update-YYYY-MM-DD` (the date of the blog post, not an app version).
- Title: what the reader can do, with no version number.
- Body: the highlight image, one sentence, then the blog post, the changelog, and [taskade.com/create](https://www.taskade.com/create).
- Create the oldest release first. Mark only the newest `--latest`.

```bash
gh release create update-YYYY-MM-DD \
  --repo taskade/taskade \
  --target main \
  --title "Title" \
  --notes-file releases/YYYY-MM-DD-slug.md \
  --latest=false
```
