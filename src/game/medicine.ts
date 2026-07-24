import { CONFIG } from './config';
import { WORK_SUBTICKS } from './dayCycle';
import type { GameState, Resident } from './types';

export type PhysicianTreatmentStatus = 'treated' | 'recovered' | 'no-patient' | 'no-herbs';

export interface PhysicianTreatmentResult {
  status: PhysicianTreatmentStatus;
  patient: Resident | null;
  herbsUsed: number;
  healthRestored: number;
}

export function activePhysicianCount(state: GameState): number {
  const clinics = new Set(state.buildings
    .filter(building => building.type === 'clinic' && building.built)
    .map(building => building.id));
  if (clinics.size === 0) return 0;
  return state.residents.filter(resident =>
    resident.alive && resident.job === 'physician' && resident.assignedBuildingId != null &&
    clinics.has(resident.assignedBuildingId) && !resident.sick && resident.health >= 20 &&
    state.day >= (resident.quarantinedUntil ?? 0)).length;
}

export function hasActivePhysician(state: GameState): boolean {
  return activePhysicianCount(state) > 0;
}

export function physicianPatient(state: GameState, physicianId: number): Resident | null {
  return state.residents
    .filter(resident => resident.id !== physicianId && resident.alive && (
      resident.sick || resident.health < CONFIG.medicine.patientHealthThreshold
    ))
    .sort((a, b) => Number(b.sick) - Number(a.sick) || a.health - b.health || a.id - b.id)[0] ?? null;
}

function isIncidentPatient(state: GameState, residentId: number): boolean {
  return state.incidents.plagueCase?.residentId === residentId ||
    state.incidents.epidemic?.infectedIds.includes(residentId) === true;
}

export function performPhysicianTreatment(
  state: GameState,
  physician: Resident,
  efficiency: number,
  rng: () => number,
): PhysicianTreatmentResult {
  const patient = physicianPatient(state, physician.id);
  if (!patient) return { status: 'no-patient', patient: null, herbsUsed: 0, healthRestored: 0 };
  // 의녀 단심 '금침' — 본인의 치료 효율이 오른다
  if (physician.special === 'uinyeo') efficiency *= CONFIG.specialResidents.uinyeoTreatmentMult;

  const herbs = CONFIG.medicine.herbsPerPhysicianPerDay / WORK_SUBTICKS;
  if (state.resources.herbs + 1e-9 < herbs) {
    return { status: 'no-herbs', patient, herbsUsed: 0, healthRestored: 0 };
  }
  state.resources.herbs = Math.max(0, state.resources.herbs - herbs);

  const beforeHealth = patient.health;
  const healing = (CONFIG.medicine.treatmentHealthPerDay / WORK_SUBTICKS) * Math.max(0, efficiency);
  patient.health = Math.min(100, patient.health + healing);
  let status: PhysicianTreatmentStatus = 'treated';
  if (patient.sick && !isIncidentPatient(state, patient.id)) {
    const recoveryChance = Math.min(
      0.95,
      (CONFIG.medicine.normalSickRecoveryBonusPerDay / WORK_SUBTICKS) * Math.max(0, efficiency),
    );
    if (rng() < recoveryChance) {
      patient.sick = false;
      status = 'recovered';
    }
  }
  return {
    status,
    patient,
    herbsUsed: herbs,
    healthRestored: patient.health - beforeHealth,
  };
}
