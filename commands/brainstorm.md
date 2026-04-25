---
description: "Generate and refine ideas based on database"
---
# /mnemosyne:brainstorm

Generate and refine research ideas based on the existing knowledge base.

## Usage
```
/mnemosyne:brainstorm "<topic>"
```

## Process

### Step 1: Retrieve Context
1. Search papers relevant to the topic (top 20 by hybrid search)
2. Search insights with related tags/papers (top 20)
3. Present retrieved context to idea-coach agent

### Step 2: Idea Generation
The `idea-coach` agent analyzes the retrieved context and generates candidate ideas.

### Step 3: Refinement Loop
Multi-turn conversation to:
- Clarify motivation
- Assess novelty (compare to retrieved papers)
- Evaluate feasibility
- Suggest experiments

### Step 4: Save Decision
At the end of the session:
- Ask user: "Save this idea as an insight?"
- **Yes**: Create insight with `source_type: "brainstorm"`, `maturity: "developing"`
- **No**: Discard and end

## Agent: idea-coach

System prompt for idea generation:
- Analyze existing papers for gaps
- Identify potential novel contributions
- Suggest concrete next steps
- Maintain realistic expectations about novelty

## Examples
```
/mnemosyne:brainstorm "self-supervised learning for medical images"
/mnemosyne:brainstorm "multi-modal foundation models"
```

## Notes
- If database is empty, will indicate no context available
- The idea-coach agent does NOT have access to external web search
- Novelty assessment is based on retrieved papers only
