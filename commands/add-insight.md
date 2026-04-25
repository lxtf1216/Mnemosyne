---
description: "Add insights manually or from brainstorms"
---
# /mnemosyne:add-insight

Add a new insight to the knowledge base.

## Usage
```
/mnemosyne:add-insight "<content>"
  --tags      <tag1,tag2>           # Optional tags
  --papers    <paper_id,...>        # Related paper IDs
  --maturity  raw|developing|solid  # Default: raw
```

## Interactive Mode
When called without content, enters interactive填写模式:
```
/mnemosyne:add-insight
> Enter insight content: <user types>
> Enter tags (comma-separated, optional): <user types>
> Enter related paper IDs (comma-separated, optional): <user types>
> Maturity (raw/developing/solid, default: raw): <user types>
```

## Maturity Levels
- **raw**: Initial idea, unverified
- **developing**: Being refined, has some backing
- **solid**: Well-supported, ready for use

## Source Type
Always set to `manual` for manually added insights.

## Examples
```
/mnemosyne:add-insight "Consider using contrastive learning for this task"
/mnemosyne:add-insight "Interesting approach" --tags important,novel --papers uuid1,uuid2 --maturity developing
```

## Auto-generated Fields
- insight_id: UUID v4
- created_at: Current datetime
- updated_at: Current datetime
- embedding: Generated from content
- embedding_status: "done" on success
- deleted: false
