import type { GameState, Resident } from './types';

function snapshotName(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function familyReferenceName(
  state: Pick<GameState, 'residents'>,
  residentId: number | null | undefined,
  savedName: string | undefined,
): string {
  if (residentId != null) {
    const current = state.residents.find(resident => resident.id === residentId);
    if (current) return current.name;
  }
  return snapshotName(savedName) ?? '미상';
}

// 배열에서 제거되는 이탈 전용. 사망 주민에는 호출하지 않아 역사적 ID 참조를 유지한다.
export function detachDepartingResidentFromFamily(
  state: Pick<GameState, 'residents'>,
  resident: Resident,
): void {
  if (resident.spouseId != null) {
    const spouse = state.residents.find(candidate => candidate.id === resident.spouseId);
    if (spouse?.spouseId === resident.id) spouse.spouseId = null;
    resident.spouseId = null;
  }

  for (const child of state.residents) {
    if (child.motherId === resident.id) {
      child.motherName ??= resident.name;
      delete child.motherId;
    }
    if (child.fatherId === resident.id) {
      child.fatherName ??= resident.name;
      delete child.fatherId;
    }
  }
}

// 로드 경계 정규화. 배열에 남은 사망 주민도 유효한 참조 대상이다.
export function normalizeResidentFamilyReferences(
  state: Pick<GameState, 'residents'>,
): void {
  const byId = new Map(state.residents.map(resident => [resident.id, resident]));
  for (const resident of state.residents) {
    if (resident.spouseId != null && !byId.has(resident.spouseId)) resident.spouseId = null;

    if (resident.motherId != null) {
      const mother = byId.get(resident.motherId);
      if (mother) resident.motherName = snapshotName(resident.motherName) ?? mother.name;
      else delete resident.motherId;
    }
    if (resident.fatherId != null) {
      const father = byId.get(resident.fatherId);
      if (father) resident.fatherName = snapshotName(resident.fatherName) ?? father.name;
      else delete resident.fatherId;
    }
    if (resident.motherName != null) resident.motherName = snapshotName(resident.motherName);
    if (resident.fatherName != null) resident.fatherName = snapshotName(resident.fatherName);
  }
}
