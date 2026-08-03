// field-notes.mjs의 타입 선언 — 편집기 앱(TS)이 같은 파일을 import하기 위한 것.
export type FieldNoteSource = 'own' | 'dict' | 'glossary' | 'ancestor' | 'none';

export interface KeyCommentLike {
  above?: string;
  side?: string;
}

export interface FieldNoteInput {
  path: string;
  leaf: string;
  comments: Record<string, KeyCommentLike>;
  /** 게임 이름표 (자원·계절·날씨·직업·지형·승격 단계·가축). 리프 이름과 열쇠가 같다. */
  terms?: Record<string, string>;
  /** 묶음 머리가 이미 보여주는 문맥 (건물 설명 등). 있으면 조상 주석보다 우선한다. */
  groupNote?: string | null;
}

export interface FieldNote {
  text: string;
  source: FieldNoteSource;
  /** 리프 설명과 별개로 곁들이는 조상 문맥. 없으면 null. */
  context: string | null;
}

export declare const LEAF_NOTES: Readonly<Record<string, string>>;
export declare const TOKEN_NOTES: Readonly<Record<string, string>>;
export declare const FIELD_NOTES: Readonly<Record<string, string>>;
export declare const PATH_RULES: readonly { readonly test: RegExp; readonly note: (leaf: string) => string }[];

export declare function splitLeaf(leaf: string): string[];
export declare function describeLeaf(leaf: string, terms?: Record<string, string>): string | null;
export declare function ancestorNote(
  path: string,
  comments: Record<string, KeyCommentLike>,
): { path: string; text: string } | null;
export declare function resolveFieldNote(input: FieldNoteInput): FieldNote;
