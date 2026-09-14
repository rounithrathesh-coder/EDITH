---
title: >
  EDITH now has an Ollama launch handoff
slug: ollama-launch-handoff
sortOrder: -10
date: 2026-07-02
readTime: 4 min read
description: >
  A new Ollama launch handoff can configure EDITH for a local Ollama model from one terminal command. The integration is not upstream in Ollama yet, but it is available today from the esokullu/ollama branch while we work toward official integration.
excerpt: >
  EDITH can now be configured from an Ollama launch command: choose a local model, open the EDITH handoff page, confirm the browser prompt, and the extension switches to Ollama automatically. It is not in upstream Ollama yet, but you can try it from the branch today.
titleTag: >
  EDITH Ollama launch handoff announcement - EDITH Blog
ogTitle: >
  EDITH now has an Ollama launch handoff
ogDescription: >
  Try the new EDITH handoff from an Ollama fork branch while we work toward upstream Ollama integration.
twitterTitle: >
  EDITH now has an Ollama launch handoff
twitterDescription: >
  One command can hand a local Ollama model to EDITH and make it active in the browser extension.
keywords:
  - EDITH
  - Ollama
  - local LLM
  - browser agent
  - open source
  - Chrome extension
  - Firefox extension
  - Ollama launch
html: true
lede: >
  We have a first working EDITH handoff for **Ollama launch**. From a local Ollama build, you can run one command, pick a model, approve a EDITH browser prompt, and EDITH will switch its local provider to that Ollama model. This is not integrated into upstream Ollama yet. For now, you can install it from the [codex/ollama-edith-launch-handoff branch of esokullu/ollama](https://github.com/esokullu/ollama/tree/codex/ollama-edith-launch-handoff). We hope Ollama will integrate it upstream.
---

<figure>
  <img src="/assets/edith-ollama-heart.png" alt="EDITH logo, a heart, and the Ollama logo for the launch handoff announcement">
  <figcaption>EDITH can now receive local Ollama setup details from an Ollama launch command.</figcaption>
</figure>

## What the handoff does

EDITH already supports Ollama as a local OpenAI-compatible provider. The new handoff removes the settings-page friction around that setup.

Instead of opening EDITH settings, typing a local base URL, picking a model, and checking the context window by hand, Ollama can open a EDITH launch URL with the right values already attached:

- the selected Ollama model
- the local OpenAI-compatible base URL, such as `http://127.0.0.1:11434/v1`
- the detected context window
- a source marker so EDITH knows this came from Ollama

EDITH then asks for one browser confirmation before updating the local Ollama provider and making it active.

## Try it from the branch

The integration is not part of official upstream Ollama builds at the time of this post. To try it now, build from the branch:

```bash
git clone https://github.com/esokullu/ollama.git
cd ollama
git switch codex/ollama-edith-launch-handoff
cmake -S . -B build -G Ninja -DOLLAMA_MLX_BACKENDS=
cmake --build build --parallel 8
```

Start Ollama with browser-extension origins allowed. This is needed because EDITH runs from a `chrome-extension://` or `moz-extension://` origin, and Ollama protects its local HTTP API with an origin allowlist:

```bash
OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" ./ollama serve
```

Then, in another terminal:

```bash
./ollama launch edith --model qwen3.5:9b
```

You should see output like this:

```text
Opening EDITH Ollama setup:
  https://edith.one/launch/ollama?baseUrl=http%3A%2F%2F127.0.0.1%3A11434%2Fv1&contextWindow=262144&model=qwen3.5%3A9b&source=ollama

Confirm the EDITH prompt in your browser to use qwen3.5:9b via Ollama.
```

## What it looks like

The launch URL opens EDITH and asks whether to configure the extension for the selected Ollama model.

<figure>
  <img src="/assets/ollama-edith-confirm.png" alt="EDITH confirmation dialog for configuring the qwen3.5:9b Ollama model">
  <figcaption>EDITH receives the model, provider URL, and context window from the Ollama launch handoff.</figcaption>
</figure>

After confirmation, EDITH shows a success message on the page.

<figure>
  <img src="/assets/ollama-edith-configured.png" alt="EDITH configured success message after accepting the Ollama handoff">
  <figcaption>The extension confirms that the Ollama model is configured and ready.</figcaption>
</figure>

Open the EDITH panel and the active provider is now `Ollama (Local)`.

<figure>
  <img src="/assets/ollama-edith-panel-thinking.png" alt="EDITH side panel using the Ollama local provider while responding">
  <figcaption>EDITH uses the local Ollama provider from the side panel.</figcaption>
</figure>

And then the model responds from your local Ollama server.

<figure>
  <img src="/assets/ollama-edith-response.png" alt="EDITH side panel showing a response from the local qwen3.5:9b Ollama model">
  <figcaption>A local Ollama model answers inside EDITH after the handoff.</figcaption>
</figure>

## Why this matters

Local browser agents should feel local all the way down. If you already have Ollama models installed, EDITH should not make you copy provider URLs or manually match model names. The handoff makes Ollama the place where you choose the model and EDITH the place where you use it in the browser.

This is also a better open-source loop: Ollama serves the model, EDITH controls the browser, and the user keeps both pieces inspectable and self-hostable.

The current implementation lives on the [codex/ollama-edith-launch-handoff branch](https://github.com/esokullu/ollama/tree/codex/ollama-edith-launch-handoff). We hope it can make its way into Ollama proper so EDITH setup becomes a normal `ollama launch edith --model ...` path for everyone.
