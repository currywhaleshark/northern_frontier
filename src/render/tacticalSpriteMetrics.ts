// 이 파일은 tools/game/generate_tactical_sprite_metrics.mjs가 생성한다. 직접 수정하지 말 것.
// 전술 스프라이트 셀별 표시 배율(머리 크기 기준 정규화)과 발끝 기준선 보정값.
export interface TacticalSpriteMetric {
  readonly scale: number;
  readonly dy: number;
}

export type TacticalMetricSheetKey = 'defenderRoles' | 'defenderWeapons' | 'defenderDefaultWeapons' | 'raiders' | 'court';

export const TACTICAL_SPRITE_METRICS: Readonly<Record<
  TacticalMetricSheetKey,
  ReadonlyArray<ReadonlyArray<TacticalSpriteMetric>>
>> = {
  defenderRoles: [
    [
      {
        scale: 1,
        dy: 0
      },
      {
        scale: 1.045,
        dy: 0
      },
      {
        scale: 1.095,
        dy: 0
      },
      {
        scale: 1.045,
        dy: 0
      },
      {
        scale: 1.045,
        dy: 0
      },
      {
        scale: 1,
        dy: 0
      },
      {
        scale: 1,
        dy: 0
      },
      {
        scale: 0.92,
        dy: 0
      }
    ],
    [
      {
        scale: 1,
        dy: 0
      },
      {
        scale: 1.045,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.045,
        dy: 0
      },
      {
        scale: 1.045,
        dy: 0
      },
      {
        scale: 1,
        dy: 0
      },
      {
        scale: 0.92,
        dy: 0
      },
      {
        scale: 0.92,
        dy: 0
      }
    ],
    [
      {
        scale: 1,
        dy: 5
      },
      {
        scale: 1,
        dy: 5
      },
      {
        scale: 1.095,
        dy: 4.4
      },
      {
        scale: 1,
        dy: 6
      },
      {
        scale: 1.045,
        dy: 4.2
      },
      {
        scale: 0.92,
        dy: 5.5
      },
      {
        scale: 0.958,
        dy: 4.8
      },
      {
        scale: 0.92,
        dy: 4.6
      }
    ],
    [
      {
        scale: 0.958,
        dy: 28.8
      },
      {
        scale: 0.958,
        dy: 27.8
      },
      {
        scale: 0.958,
        dy: 27.8
      },
      {
        scale: 0.958,
        dy: 28.8
      },
      {
        scale: 0.958,
        dy: 27.8
      },
      {
        scale: 0.885,
        dy: 26.5
      },
      {
        scale: 0.885,
        dy: 25.7
      },
      {
        scale: 0.885,
        dy: 25.7
      }
    ]
  ],
  defenderWeapons: [
    [
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      }
    ],
    [
      {
        scale: 1.15,
        dy: 8
      },
      {
        scale: 1.15,
        dy: 9.2
      },
      {
        scale: 1.15,
        dy: 6.9
      },
      {
        scale: 1.15,
        dy: 6.9
      },
      {
        scale: 1.15,
        dy: 8
      },
      {
        scale: 1.15,
        dy: 8
      }
    ],
    [
      {
        scale: 1.045,
        dy: 17.8
      },
      {
        scale: 1.15,
        dy: 20.7
      },
      {
        scale: 1.095,
        dy: 18.6
      },
      {
        scale: 1.15,
        dy: 19.5
      },
      {
        scale: 1.095,
        dy: 18.6
      },
      {
        scale: 1.15,
        dy: 20.7
      }
    ],
    [
      {
        scale: 1.045,
        dy: 34.5
      },
      {
        scale: 1.095,
        dy: 39.4
      },
      {
        scale: 0.852,
        dy: 30.7
      },
      {
        scale: 1.15,
        dy: 40.3
      },
      {
        scale: 1,
        dy: 35
      },
      {
        scale: 1,
        dy: 35
      }
    ]
  ],
  defenderDefaultWeapons: [
    [
      {
        scale: 0.885,
        dy: 1.8
      },
      {
        scale: 0.885,
        dy: 1.8
      },
      {
        scale: 0.885,
        dy: 1.8
      },
      {
        scale: 0.958,
        dy: 1.9
      },
      {
        scale: 0.852,
        dy: 1.7
      },
      {
        scale: 0.852,
        dy: 1.7
      }
    ],
    [
      {
        scale: 1.15,
        dy: 2.3
      },
      {
        scale: 1.15,
        dy: 2.3
      },
      {
        scale: 1.15,
        dy: 2.3
      },
      {
        scale: 1.15,
        dy: 2.3
      },
      {
        scale: 1,
        dy: 2
      },
      {
        scale: 1.045,
        dy: 2.1
      }
    ],
    [
      {
        scale: 1.095,
        dy: 2.2
      },
      {
        scale: 1.045,
        dy: 2.1
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
        scale: 0.821,
        dy: 1.6
      },
      {
        scale: 0.92,
        dy: 1.8
      }
    ],
    [
      {
        scale: 0.82,
        dy: 1.6
      },
      {
        scale: 0.82,
        dy: 1.6
      },
      {
        scale: 0.821,
        dy: 1.6
      },
      {
        scale: 1.045,
        dy: 2.1
      },
      {
        scale: 0.821,
        dy: 1.6
      },
      {
        scale: 0.821,
        dy: 1.6
      }
    ]
  ],
  raiders: [
    [
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.048,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.1,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 0.957,
        dy: 0
      }
    ],
    [
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.048,
        dy: 0
      },
      {
        scale: 1.048,
        dy: 0
      },
      {
        scale: 1.048,
        dy: 0
      },
      {
        scale: 1.048,
        dy: 0
      },
      {
        scale: 0.957,
        dy: 0
      }
    ],
    [
      {
        scale: 0.917,
        dy: 7.3
      },
      {
        scale: 1.048,
        dy: 8.4
      },
      {
        scale: 0.957,
        dy: 8.6
      },
      {
        scale: 1.1,
        dy: 9.9
      },
      {
        scale: 0.957,
        dy: 8.6
      },
      {
        scale: 0.88,
        dy: 7.9
      }
    ],
    [
      {
        scale: 0.88,
        dy: 20.2
      },
      {
        scale: 0.917,
        dy: 21.1
      },
      {
        scale: 0.846,
        dy: 19.5
      },
      {
        scale: 0.846,
        dy: 16.9
      },
      {
        scale: 0.846,
        dy: 19.5
      },
      {
        scale: 0.82,
        dy: 18.9
      }
    ]
  ],
  court: [
    [
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 0.82,
        dy: 0
      }
    ],
    [
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 1.15,
        dy: 0
      },
      {
        scale: 0.957,
        dy: 0
      },
      {
        scale: 0.846,
        dy: 0
      },
      {
        scale: 1.048,
        dy: 0
      }
    ],
    [
      {
        scale: 0.846,
        dy: 8.5
      },
      {
        scale: 0.957,
        dy: 9.6
      },
      {
        scale: 1.048,
        dy: 11.5
      },
      {
        scale: 0.82,
        dy: 9
      },
      {
        scale: 0.917,
        dy: 2.8
      }
    ],
    [
      {
        scale: 1.048,
        dy: 27.2
      },
      {
        scale: 0.82,
        dy: 20.5
      },
      {
        scale: 1.1,
        dy: 27.5
      },
      {
        scale: 0.82,
        dy: 9
      },
      {
        scale: 0.957,
        dy: 17.2
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
