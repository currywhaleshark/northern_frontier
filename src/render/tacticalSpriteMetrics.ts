// 이 파일은 tools/game/generate_tactical_sprite_metrics.mjs가 생성한다. 직접 수정하지 말 것.
// 전술 스프라이트 셀별 표시 배율(머리 크기 기준 정규화)과 발끝 기준선 보정값.
export interface TacticalSpriteMetric {
  readonly scale: number;
  readonly dy: number;
}

export type TacticalMetricSheetKey = 'defenderRoles' | 'defenderWeapons' | 'defenderDefaultWeapons' | 'healers' | 'specialResidents' | 'raiders' | 'court';

export const TACTICAL_SPRITE_METRICS: Readonly<Record<
  TacticalMetricSheetKey,
  ReadonlyArray<ReadonlyArray<TacticalSpriteMetric>>
>> = {
  defenderRoles: [
    [
      {
        scale: 0.914,
        dy: 0
      },
      {
        scale: 0.937,
        dy: 0
      },
      {
        scale: 0.959,
        dy: 0
      },
      {
        scale: 0.972,
        dy: 0
      },
      {
        scale: 0.944,
        dy: 0
      },
      {
        scale: 1.05,
        dy: 0
      },
      {
        scale: 0.944,
        dy: 0
      },
      {
        scale: 0.905,
        dy: 0
      }
    ],
    [
      {
        scale: 0.914,
        dy: 0
      },
      {
        scale: 0.905,
        dy: 0
      },
      {
        scale: 1.009,
        dy: 0
      },
      {
        scale: 1.01,
        dy: 0
      },
      {
        scale: 0.992,
        dy: 0
      },
      {
        scale: 1.01,
        dy: 0
      },
      {
        scale: 0.914,
        dy: 0
      },
      {
        scale: 0.937,
        dy: 0
      }
    ],
    [
      {
        scale: 0.914,
        dy: 4.6
      },
      {
        scale: 0.905,
        dy: 4.5
      },
      {
        scale: 1.009,
        dy: 4
      },
      {
        scale: 0.972,
        dy: 5.8
      },
      {
        scale: 1.083,
        dy: 4.3
      },
      {
        scale: 0.991,
        dy: 5.9
      },
      {
        scale: 0.944,
        dy: 4.7
      },
      {
        scale: 0.89,
        dy: 4.4
      }
    ],
    [
      {
        scale: 0.944,
        dy: 28.3
      },
      {
        scale: 0.875,
        dy: 25.4
      },
      {
        scale: 0.959,
        dy: 27.8
      },
      {
        scale: 0.972,
        dy: 29.2
      },
      {
        scale: 0.914,
        dy: 26.5
      },
      {
        scale: 0.972,
        dy: 29.2
      },
      {
        scale: 0.914,
        dy: 26.5
      },
      {
        scale: 0.905,
        dy: 26.2
      }
    ]
  ],
  defenderWeapons: [
    [
      {
        scale: 1.33,
        dy: 0
      },
      {
        scale: 1.25,
        dy: 0
      },
      {
        scale: 1.219,
        dy: 0
      },
      {
        scale: 1.221,
        dy: 0
      },
      {
        scale: 1.219,
        dy: 0
      },
      {
        scale: 1.221,
        dy: 0
      }
    ],
    [
      {
        scale: 1.17,
        dy: 8.2
      },
      {
        scale: 1.05,
        dy: 8.4
      },
      {
        scale: 1.272,
        dy: 7.6
      },
      {
        scale: 1.141,
        dy: 6.8
      },
      {
        scale: 1.083,
        dy: 7.6
      },
      {
        scale: 1.094,
        dy: 7.7
      }
    ],
    [
      {
        scale: 1.245,
        dy: 21.2
      },
      {
        scale: 1.28,
        dy: 23
      },
      {
        scale: 1.219,
        dy: 20.7
      },
      {
        scale: 1.221,
        dy: 20.8
      },
      {
        scale: 1.125,
        dy: 19.1
      },
      {
        scale: 1.193,
        dy: 21.5
      }
    ],
    [
      {
        scale: 1.17,
        dy: 38.6
      },
      {
        scale: 1.25,
        dy: 45
      },
      {
        scale: 1.125,
        dy: 40.5
      },
      {
        scale: 1.141,
        dy: 39.9
      },
      {
        scale: 1.17,
        dy: 40.9
      },
      {
        scale: 1.094,
        dy: 38.3
      }
    ]
  ],
  healers: [
    [
      {
        scale: 1.043,
        dy: 2.1
      },
      {
        scale: 1,
        dy: 2
      }
    ],
    [
      {
        scale: 1.043,
        dy: 2.1
      },
      {
        scale: 1,
        dy: 2
      }
    ],
    [
      {
        scale: 1.091,
        dy: 2.2
      },
      {
        scale: 0.82,
        dy: 1.6
      }
    ],
    [
      {
        scale: 0.857,
        dy: 1.7
      },
      {
        scale: 0.82,
        dy: 1.6
      }
    ]
  ],
  specialResidents: [
    [
      {
        scale: 1.15,
        dy: 2.3
      },
      {
        scale: 0.82,
        dy: 1.6
      },
      {
        scale: 1.136,
        dy: 2.3
      },
      {
        scale: 1.15,
        dy: 2.3
      }
    ],
    [
      {
        scale: 0.926,
        dy: 1.9
      },
      {
        scale: 0.82,
        dy: 1.6
      },
      {
        scale: 1.15,
        dy: 2.3
      },
      {
        scale: 1.042,
        dy: 2.1
      }
    ],
    [
      {
        scale: 1.15,
        dy: 2.3
      },
      {
        scale: 1,
        dy: 2
      },
      {
        scale: 1,
        dy: 2
      },
      {
        scale: 1.15,
        dy: 2.3
      }
    ],
    [
      {
        scale: 0.926,
        dy: 1.9
      },
      {
        scale: 0.82,
        dy: 1.6
      },
      {
        scale: 0.893,
        dy: 1.8
      },
      {
        scale: 0.82,
        dy: 1.6
      }
    ]
  ],
  defenderDefaultWeapons: [
    [
      {
        scale: 0.9,
        dy: 1.8
      },
      {
        scale: 0.937,
        dy: 1.9
      },
      {
        scale: 0.9,
        dy: 1.8
      },
      {
        scale: 0.905,
        dy: 1.8
      },
      {
        scale: 0.78,
        dy: 1.6
      },
      {
        scale: 0.72,
        dy: 1.4
      }
    ],
    [
      {
        scale: 1.887,
        dy: 3.8
      },
      {
        scale: 1.694,
        dy: 3.4
      },
      {
        scale: 1.5,
        dy: 3
      },
      {
        scale: 1.458,
        dy: 2.9
      },
      {
        scale: 1.245,
        dy: 2.5
      },
      {
        scale: 1.094,
        dy: 2.2
      }
    ],
    [
      {
        scale: 1.5,
        dy: 3
      },
      {
        scale: 1.28,
        dy: 2.6
      },
      {
        scale: 1.083,
        dy: 2.2
      },
      {
        scale: 1.094,
        dy: 2.2
      },
      {
        scale: 0.886,
        dy: 1.8
      },
      {
        scale: 0.905,
        dy: 1.8
      }
    ],
    [
      {
        scale: 0.873,
        dy: 1.7
      },
      {
        scale: 0.861,
        dy: 1.7
      },
      {
        scale: 0.944,
        dy: 1.9
      },
      {
        scale: 0.784,
        dy: 1.6
      },
      {
        scale: 0.78,
        dy: 1.6
      },
      {
        scale: 0.72,
        dy: 1.4
      }
    ]
  ],
  raiders: [
    [
      {
        scale: 0.89,
        dy: 0
      },
      {
        scale: 0.967,
        dy: 0
      },
      {
        scale: 0.967,
        dy: 0
      },
      {
        scale: 0.989,
        dy: 0
      },
      {
        scale: 1.035,
        dy: 0
      },
      {
        scale: 1.06,
        dy: 0
      }
    ],
    [
      {
        scale: 0.989,
        dy: 0
      },
      {
        scale: 0.89,
        dy: 0
      },
      {
        scale: 1.06,
        dy: 0
      },
      {
        scale: 0.967,
        dy: 0
      },
      {
        scale: 1.085,
        dy: 0
      },
      {
        scale: 0.989,
        dy: 0
      }
    ],
    [
      {
        scale: 1.203,
        dy: 9.6
      },
      {
        scale: 1.06,
        dy: 8.5
      },
      {
        scale: 1.203,
        dy: 10.8
      },
      {
        scale: 1.141,
        dy: 10.3
      },
      {
        scale: 1.236,
        dy: 11.1
      },
      {
        scale: 1.435,
        dy: 12.9
      }
    ],
    [
      {
        scale: 0.927,
        dy: 21.3
      },
      {
        scale: 0.927,
        dy: 21.3
      },
      {
        scale: 1.011,
        dy: 23.3
      },
      {
        scale: 0.967,
        dy: 19.3
      },
      {
        scale: 1.011,
        dy: 23.3
      },
      {
        scale: 0.989,
        dy: 22.7
      }
    ]
  ],
  court: [
    [
      {
        scale: 0.967,
        dy: 0
      },
      {
        scale: 0.927,
        dy: 0
      },
      {
        scale: 0.989,
        dy: 0
      },
      {
        scale: 1.203,
        dy: 0
      },
      {
        scale: 0.927,
        dy: 0
      }
    ],
    [
      {
        scale: 0.927,
        dy: 0
      },
      {
        scale: 0.927,
        dy: 0
      },
      {
        scale: 1.011,
        dy: 0
      },
      {
        scale: 1.113,
        dy: 0
      },
      {
        scale: 1.06,
        dy: 0
      }
    ],
    [
      {
        scale: 1.309,
        dy: 13.1
      },
      {
        scale: 1.06,
        dy: 10.6
      },
      {
        scale: 1.06,
        dy: 11.7
      },
      {
        scale: 0.967,
        dy: 10.6
      },
      {
        scale: 1.171,
        dy: 3.5
      }
    ],
    [
      {
        scale: 0.89,
        dy: 23.1
      },
      {
        scale: 0.927,
        dy: 23.2
      },
      {
        scale: 0.89,
        dy: 22.3
      },
      {
        scale: 1.141,
        dy: 12.6
      },
      {
        scale: 1.011,
        dy: 18.2
      }
    ]
  ]
};

const FALLBACK_METRIC: TacticalSpriteMetric = { scale: 1, dy: 0 };

export function tacticalSpriteMetric(
  sheet: TacticalMetricSheetKey,
  column: number,
  row: number,
): TacticalSpriteMetric {
  return TACTICAL_SPRITE_METRICS[sheet]?.[row]?.[column] ?? FALLBACK_METRIC;
}

/** 스프라이트 요소 인라인 스타일에 얹을 CSS 변수 쌍. */
export function tacticalSpriteMetricVars(
  sheet: TacticalMetricSheetKey,
  column: number,
  row: number,
): Record<'--unit-scale' | '--unit-dy', string> {
  const metric = tacticalSpriteMetric(sheet, column, row);
  return {
    '--unit-scale': String(metric.scale),
    '--unit-dy': `${metric.dy}px`,
  };
}
