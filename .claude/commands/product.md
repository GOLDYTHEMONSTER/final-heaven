---
description: Hand products to the Product Worker (runs in the background; the main session keeps developing)
argument-hint: <what the owner sent, e.g. the 1688 title and link, prices, notes>
---

Hand this to the Product Worker and keep working on whatever you were doing.

1. Gather what the owner sent: their message below, the 1688 link, any prices, and the full paths of every image attached in this conversation for these products (the saved paths under the uploads folder, as listed with the images).
2. Start the `final-heaven-product-worker` agent in the background. If that agent type isn't listed yet (it loads when Claude Code starts), use `general-purpose`, and begin its prompt with "Read .claude/agents/final-heaven-product-worker.md and brand/catalog/WORKER.md, and follow them as your brief." Give it the owner's words, the image paths and what's being asked: prepare and save as drafts, unless the owner said to publish.
3. Tell the owner in one line that the worker has it, then go back to the development task.
4. When the worker reports:
   - put its `QUESTION` lines to the owner with AskUserQuestion (recommended option first);
   - send the answers back to the worker (SendMessage) so it finishes;
   - show the owner the contact sheets and the one-line status per product.
5. Publish only what the owner approves by name. The worker does it with `product-queue.mjs approve` and `publish`.

Owner's message: $ARGUMENTS
