# 🤖 The Replit Native AI Agent Playbook

This document defines the strict workflow and constraints for building this project using the Replit AI Agent. 

## 📖 1. Core Philosophy
To prevent the AI from generating messy "god files," hallucinating, or getting confused by its own previous mistakes, we operate using **Isolated Agent Sessions**. 

Every major task must be broken down into three phases: **Product Management**, **Development**, and **Quality Assurance**. You **must** open a brand new, blank Replit Agent chat window for each phase. 

## 📂 2. Project Structure
To keep the AI organized, maintain this exact folder structure:
* `docs/` -> Holds all PRDs (Product Requirements Documents) and architecture plans.
* `.agents/skills/` -> (Hidden folder) Holds AI capability scripts or permanent rules.
* `CHANGELOG.md` -> The permanent memory file that agents use to hand off work to the next chat session.
* `RULES.md` -> (This file) The master instruction file.

---

## 🚀 3. The 3-Step Execution Workflow

When starting a new feature, follow these three phases in order. 

### Phase 1: The Product Manager (Planning)
**Action:** Open a **new** Replit Agent chat session. Do not write any code in this phase.
**Copy/Paste this Prompt to the Agent:**
> "Act as a Senior Product Manager. Before we do anything, read `RULES.md`. I want to build [INSERT FEATURE/IDEA HERE]. Do not write any code. Instead, draft a comprehensive Product Requirements Document (PRD) and save it in `docs/PRD.md`. 
> 
> The PRD must include:
> 1. Specific use cases.
> 2. Edge cases.
> 3. Strict acceptance criteria.
> 4. A step-by-step implementation plan.
> 
> Ask me clarifying questions before you finalize the document."

### Phase 2: The Developer (Implementation)
**Action:** Once `docs/PRD.md` is complete, create a new Git branch for the feature. Open a **brand new** Replit Agent chat session to clear the context.
**Copy/Paste this Prompt to the Agent:**
> "Act as a Senior Developer. Before we do anything, read `RULES.md` and `docs/PRD.md`. 
> Implement the exact features described in the PRD. 
> 
> **Strict Constraints:**
> - Enforce modular design: No file may exceed 800 lines.
> - Enforce single-responsibility: No function may exceed 80 lines.
> - Write unit tests for your code as you go.
> 
> When finished, run the code to ensure it compiles, and update `CHANGELOG.md` with what you have built."

### Phase 3: The QA Engineer (Review & Refine)
**Action:** Once the Dev Agent says the code is done, open a **brand new** Replit Agent chat session to clear the context. This isolation ensures the AI objectively critiques its own previous work.
**Copy/Paste this Prompt to the Agent:**
> "Act as a strict Quality Assurance Engineer. Before we do anything, read `RULES.md`, `CHANGELOG.md`, and `docs/PRD.md`. 
> 
> Your job is to verify the code just written against the PRD. Do not add new features.
> 1. Run the test suite.
> 2. Run the linter (e.g., Ruff, ESLint).
> 3. Check file sizes (fail any file over 800 lines, fail any function over 80 lines).
> 4. Fix any failing tests, linting errors, or deviations from the PRD. 
> 
> Do not stop until all tests pass and the code perfectly matches the acceptance criteria. Update `CHANGELOG.md` when done."

---

## 🧠 4. Context Management (Preventing Memory Loss)
Because we use new chat sessions to prevent hallucinations, the Replit Agent will start "blind" every time. We use files as the database for the AI's brain. 

**Rule for the Human:**
* Every time you open a new chat, your first sentence must ALWAYS be: *"Read `RULES.md`."*

**Rules for the AI Agent:**
* **Never assume project state:** Always read `docs/PRD.md` and `CHANGELOG.md` before writing code to understand what the previous agent did.
* **Always log work:** When finishing a task, the AI must update `CHANGELOG.md` with exact details of what files were modified, what tests were written, and what is left to do.

---

## 🛑 5. Hard Coding Constraints (The "Non-Negotiables")
If the AI Agent is reading this, it must strictly adhere to these rules at all times. Failure to do so will result in immediate rejection of the code.

1. **Size Limits:** Break large logic into smaller files. 800 lines max per file. 80 lines max per function.
2. **Linting First:** Always run the linter before calling a task complete. No code is committed with formatting errors or unused variables.
3. **No Hardcoded Secrets:** Never put API keys, passwords, or tokens in prompts, code, or PRDs. Instruct the user to use Replit's Secret Manager.
4. **Test Coverage:** Aim for at least 80% test coverage on new logic. Isolated functions are easier to test. Write the tests.
5. **No "God Objects":** Avoid creating massive utility classes. Favor pure functions and modular exports.
