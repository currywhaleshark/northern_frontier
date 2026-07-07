# Agent Loiter And Farming Design

## Goal

Residents without immediate work should look alive around the settlement instead of standing on the center, and farmers should remain engaged with fields outside the explicit growth/harvest moments.

## Behavior

- Idle or no-work residents loiter within a small radius of the village center.
- If a resident drifts too far from the loiter anchor, they path back toward it.
- Loitering uses existing passability rules, so solid building footprints remain blocked.
- Farmers with fields keep field-oriented behavior in spring, summer, and autumn.
- Mature spring/summer fields receive a non-producing field tending task instead of sending farmers back to the center.
- Autumn fields with no remaining harvest keep farmers near the fields for harvest cleanup.
- Winter farmers do not work fields; they loiter around the village center with winter-prep text.

## Scope

Only resident agent behavior changes. Asset rendering, building placement, resource formulas, and seasonal balance constants are unchanged.

## Testing

Add a focused simulation test that verifies:

- a builder with no construction work moves around near the center,
- a summer farmer with a mature field remains near the field and reports field work.
