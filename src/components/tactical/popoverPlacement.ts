export interface PopoverPlacement {
  x: number;
  y: number;
  placement: 'above' | 'below';
  caretShift: number;
  maxHeight: number;
}

const WIDTH = 232;
const EDGE = 8;
const GAP = 10;
const MIN_HEIGHT = 120;
const CARET_MARGIN = 20;

export function computeCommandPopoverPlacement(
  unit: { left: number; top: number; width: number; height: number },
  shell: { width: number; height: number },
): PopoverPlacement {
  const half = WIDTH / 2;
  const unitCenterX = unit.left + unit.width / 2;
  const x = Math.min(shell.width - half - EDGE, Math.max(half + EDGE, unitCenterX));
  const caretShift = Math.max(-(half - CARET_MARGIN), Math.min(half - CARET_MARGIN, unitCenterX - x));
  const spaceAbove = unit.top - GAP - EDGE;
  const spaceBelow = shell.height - (unit.top + unit.height) - GAP - EDGE;
  const placement: 'above' | 'below' =
    spaceAbove >= MIN_HEIGHT || spaceAbove >= spaceBelow ? 'above' : 'below';
  return placement === 'above'
    ? { x, y: unit.top - GAP, placement, caretShift, maxHeight: Math.max(0, spaceAbove) }
    : {
      x,
      y: unit.top + unit.height + GAP,
      placement,
      caretShift,
      maxHeight: Math.max(0, spaceBelow),
    };
}
