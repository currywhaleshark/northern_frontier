# Historical Pixel Style Board Review

## Goal

Choose the visual direction for the first custom Northern Frontier pixel-art atlas pass.

## Options

### A. Frontier Muted

![Frontier Muted](style-board-a-frontier-muted.png)

Best if the project should feel restrained, grounded, and survival-focused.

### B. Folk Warm

![Folk Warm](style-board-b-folk-warm.png)

Best if the project should feel more visibly Korean and hand-crafted while staying readable.

### C. Cold Border

![Cold Border](style-board-c-cold-border.png)

Best if the project should emphasize harsh northern climate, defense, and winter readability.

## Review Criteria

- Reads clearly as late-Joseon northern frontier, not generic fantasy.
- Shows all four seasons clearly.
- Terrain categories remain distinguishable.
- Buildings have stable silhouettes suitable for future atlas extraction.
- Characters read as roles at small scale.
- The direction can work with the existing square-tile camera and `SpriteAPI` renderer.

## Review Result

Selected direction: **B. Folk Warm**.

Carry forward:

- Warmer Korean folk-painting influenced color mood.
- Hand-crafted late-Joseon frontier feeling.
- Practical settlement materials: timber, earth, straw thatch, dark roof accents, palisade wood, and beacon structures.
- Four-season terrain treatment with distinct spring, summer, autumn, and winter palettes.

Borrow selectively from C:

- Stronger silhouette separation where B becomes too decorative or soft.
- Winter readability for snowfield, frozen river, and snow-loaded forest.

Avoid:

- Decorative clutter that makes 28px tiles unreadable.
- Generic fantasy buildings, European castle forms, or heroic RPG character proportions.
- Large concept-art compositions that cannot be decomposed into tiles and sprites.
