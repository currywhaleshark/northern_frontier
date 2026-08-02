import type { BattleSimulationOptions } from './game/battleSimulation';
import type { GameState, NewGameOptions } from './game/types';

export type GameSessionLaunch =
  | { kind: 'new'; options: NewGameOptions }
  | { kind: 'tutorial' }
  | { kind: 'loaded'; state: GameState }
  | { kind: 'battleSimulation'; options: BattleSimulationOptions };

export type GameSessionReturnTarget = 'main' | 'newGameSetup' | 'battleSim';
