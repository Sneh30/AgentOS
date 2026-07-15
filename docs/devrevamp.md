I actually wouldn't design `/dev` as a **tool editor**.

I would make it an **AI Software Engineer for the AgentOS**.

The developer shouldn't write tools. The AI should.

AI writes the tools, auto registers them and uses them.

---

# Core Philosophy

> **/agent** = Use agents.
>
> **/dev** = Build the operating system.

The entire page revolves around one idea:

> **"Describe a capability. Anymind builds it."**

Not code.

Capabilities.

---

For example

```
Build me a YouTube uploader.
```

Gemma should:

1. Think about requirements.
2. Search existing installed tools.
3. Decide if one already exists.
4. If not...
5. Generate Python code.
6. Generate tests.
7. Generate manifest.
8. Generate permissions.
9. Install dependencies.
10. Register the tool.
11. Hot reload runtime.

The user never opens a code editor.

---

# Example

Prompt

```
Build a Windows System Cleaner.

Features

• Empty recycle bin
• Delete temp files
• Remove duplicate downloads
• Clear browser cache
```

---

Gemma begins...

```
Thinking...

Need filesystem access.

Need OS permissions.

Need duplicate detector.

Need recycle bin support.

Need logging.

Need rollback.

Writing tool...
```

Then you literally watch

```
system_cleaner/

├── cleaner.py
├── duplicate.py
├── recycle_bin.py
├── cache.py
├── manifest.json
├── tests.py
├── README.md
└── icon.svg
```

Then

```
✓ Installing dependencies

✓ Running tests

✓ Passed

✓ Registering tool

✓ Reloading runtime
```

Now

```
Installed Tools

✓ Browser

✓ Gmail

✓ GitHub

✓ Windows Cleaner
```

Done.

---

# Another example

```
Build a YouTube Fetcher.
```

Gemma creates

```
youtube_fetcher/

fetch.py

manifest.json

oauth.py

thumbnail.py

captions.py

tests.py
```

Registers

↓

Immediately callable.

---

# Even crazier

```
Build me an agent that researches YC startups.
```

Gemma builds

```
yc_research_agent/

agent.py

prompt.md

memory.json

permissions.json

manifest.json

tools.json
```

Registers it.

Now

```
Installed Agents

✓ YC Research Agent
```

---

# The UI

Forget Monaco.

Forget VSCode.

Think

```
-------------------------------------------------

AI Software Engineer

What do you want to build?

__________________________________________

Build a Windows Cleaner...

                 [ Build ]

-------------------------------------------------

Live Build

Thinking...

Planning architecture...

Generating code...

Writing tests...

Installing...

Running...

Registering...

Done.

-------------------------------------------------

Artifacts

system_cleaner/

manifest.json

cleaner.py

tests.py

README

-------------------------------------------------

Installed

✓ Windows Cleaner

-------------------------------------------------
```

---

# What Gemma actually generates

Every generated capability contains

```
Tool

├── Python implementation
├── Manifest
├── JSON schema
├── Permission model
├── Tests
├── README
├── Examples
├── Dependencies
└── Metadata
```

---

# Runtime

Runtime watches

```
tools/
```

When a folder appears

```
↓

Validate

↓

Load

↓

Import

↓

Register

↓

Notify Gemma

↓

Available
```

No restart.

---

# Registry

Every tool gets

```
Name

Description

Input Schema

Output Schema

Permissions

Version

Author

Dependencies

Health

Last Used
```

---

# Tool lifecycle

```
Idea

↓

Gemma designs

↓

Gemma writes code

↓

Gemma writes tests

↓

Gemma executes tests

↓

Fixes failures

↓

Registers

↓

Available
```

---

# Why this is different

Most AI IDEs help you **write code**.

This helps you **teach your AgentOS a new skill**.

You're not asking:

> "Write Python."

You're asking:

> "Teach yourself how to clean Windows."

or

> "Teach yourself how to fetch YouTube videos."

or

> "Teach yourself how to use Linear."

That is a fundamentally different interaction.

---

## I'd even rename `/dev`

Instead of **Developer Environment**, I'd call it something like:

* **Capability Studio**
* **Agent Foundry**
* **Skill Forge**
* **Capability Builder**
* **OS Builder**

because what you're really building isn't code—it's **new capabilities** for your AgentOS. Each capability becomes a first-class citizen that the runtime discovers, validates, registers, and exposes to every agent automatically. That's a much more compelling product than a browser IDE, and it's a feature that very few agent platforms currently provide.
