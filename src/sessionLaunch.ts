import type { BattleSimulationOptions } from './game/battleSimulation';
import type { Difficulty, GameState } from './game/types';

export type GameSessionLaunch =
  | { kind: 'new'; difficulty: Difficulty; settlementName: string }
  | { kind: 'tutorial' }
  | { kind: 'loaded'; state: GameState }
  | { kind: 'battleSimulation'; options: BattleSimulationOptions };

export type GameSessionReturnTarget = 'main' | 'battleSim';
