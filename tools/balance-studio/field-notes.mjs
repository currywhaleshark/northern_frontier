// 밸런스 편집기 필드 설명 — config.ts 주석이 닿지 않는 나머지를 채운다.
//
// 설명의 출처는 넷이고, 위에서부터 먼저 맞는 것을 쓴다:
//   own      config.ts 원문 주석 (parse_config_comments.mjs)     — 고유 설명
//   dict     여기 FIELD_NOTES / PATH_RULES의 경로별 설명           — 고유 설명
//   glossary 리프 이름 용어집·토큰 뜻풀이                          — 유추
//   ancestor 가장 가까운 조상 주석                                 — 유추
//
// **원칙: 추측으로 그럴듯한 문장을 짓지 않는다.** 값이 어디서 어떻게 쓰이는지 확인한 것만
// 개별 설명으로 적고, 확인하지 못한 것은 용어집 수준의 담백한 뜻풀이에 그친다.
// 편집기는 유추된 설명을 흐리게 그려 "이건 자동 뜻풀이"임을 눈에 보이게 한다.
//
// 게임의 이름표(자원·계절·날씨·직업·지형·승격 단계·가축)는 여기 베끼지 않고
// 호출부가 game/constants.ts에서 읽어 `terms`로 넘긴다 — 이름이 바뀌면 설명도 같이 바뀐다.

// ── 리프 이름 용어집 ────────────────────────────────────────────────────
// 트리 전체에서 반복되는 리프 이름. 문맥과 무관하게 같은 뜻인 것만 여기 둔다
// (문맥마다 뜻이 갈리는 이름은 아래 PATH_RULES로 내린다).
export const LEAF_NOTES = {
  // 구조·수량
  min: '하한', max: '상한', minimum: '하한', maximum: '상한',
  base: '기본값', weight: '가중치', chance: '확률', prob: '확률',
  mult: '배율', multiplier: '배율', ratio: '비율', rate: '비율',
  factor: '계수', coefficient: '계수', scale: '배율', share: '몫(비율)',
  bonus: '가산', penalty: '감산', threshold: '문턱값', cap: '상한', limit: '상한',
  radius: '반경(타일)', range: '사거리(타일)', distance: '거리(타일)',
  days: '일수', years: '연수', interval: '간격', duration: '기간',
  cost: '비용', amount: '양', value: '값', count: '개수', total: '총량',
  step: '증감 폭', extra: '추가분', reduction: '감소량', default: '기본값(해당 없을 때)',
  width: '지도 너비(타일)', height: '지도 높이(타일)',
  power: '전력', morale: '사기', speed: '속도', level: '수위',
  size: '크기', depth: '깊이', side: '한 변(타일)', maxSide: '한 변 최대 칸수',
  // [하한, 상한] 꼴 범위 배열의 자리 — config.ts에는 `[2, 4] as const`처럼 적힌다.
  0: '범위의 첫 값 (보통 하한)',
  1: '범위의 둘째 값 (보통 상한)',

  // 건물 정의
  buildDays: '공기 — 완공까지 필요한 총 건축가-일수',
  slots: '작업자 자리 수',
  winterBonus: '겨울 보온 효과 여부',
  placement: '설치 가능 지형',

  // 시간·주기
  perDay: '하루당', dailyChance: '하루 발생 확률', cooldownDays: '재발까지의 최소 간격(일)',
  graceDays: '유예 일수', gracePeriod: '유예 기간',
  subticks: '서브틱 수 (하루는 여러 서브틱으로 나뉜다)',
  ticks: '틱 수', rounds: '라운드 수', round: '라운드',
  observationDays: '판단을 미루고 지켜보는 일수',
  durationDays: '지속 일수',
  intelDays: '얻은 정보가 유효한 일수',

  // 자원·생산
  reserve: '남겨두는 재고', reserves: '남겨두는 재고',
  yield: '산출량', output: '산출량', capacity: '수용량',
  recovery: '회복량', depletion: '고갈',
  productResource: '생산하는 자원', feedResource: '먹이는 자원',
  initialHeadcount: '시작 두수',
  feedPerHeadPerDay: '사료 — 1마리 하루 소모',
  grainPerHeadPerDay: '곡물 — 1마리 하루 소모',
  breedingPerHeadPerDay: '번식 — 1마리 하루 증가분',
  grazesOutsideWinter: '겨울 외에는 방목해 사료를 아끼는가',
  productPerHeadPerHerderDay: '산물 — 목동 1명이 붙었을 때 1마리 하루 산출',
  eggPerHeadPerHerderDay: '달걀 — 목동 1명이 붙었을 때 1마리 하루 산출',
  productSeasonMult: '산물 계절 배율',
  eggSeasonMult: '달걀 계절 배율',
  shortageGraceDays: '사료가 떨어져도 버티는 일수',
  starvationLossIntervalDays: '굶는 동안 폐사가 일어나는 간격(일)',
  slaughterMeatPerHead: '도축 — 1마리당 고기',
  slaughterHidePerHead: '도축 — 1마리당 가죽',
  visibleAnimalLimit: '화면에 그리는 가축 마릿수 상한',
  tilesPerHerder: '목동 1명이 감당하는 칸수',
  tilesPerFarmer: '농부 1명이 감당하는 칸수',
  capacityPerTile: '칸당 수용량',
  recoveryPerTilePerDay: '칸당 하루 회복량',
  depletionLogCooldownDays: '고갈 알림을 다시 띄우기까지의 간격(일)',

  // 발생 가중치 (disasters)
  occurrenceBaseWeight: '발생 가중치의 기본값',
  occurrenceTemperatureCoefficient: '기온 편차가 발생 가중치를 움직이는 계수',
  occurrencePrecipitationCoefficient: '강수 편차가 발생 가중치를 움직이는 계수',
  occurrenceStorminessCoefficient: '폭풍우 편차가 발생 가중치를 움직이는 계수',
  occurrenceMinMultiplier: '발생 가중치 배율 하한',
  occurrenceMaxMultiplier: '발생 가중치 배율 상한',
  annualVarianceMinMultiplier: '연차 변덕 배율 하한',
  annualVarianceMaxMultiplier: '연차 변덕 배율 상한',

  // 사람
  residents: '주민 수', population: '인구', headcount: '두수',
  age: '나이(세)', minRank: '필요한 승격 단계', minRelation: '필요한 최소 우호도',
  reputation: '명성', suspicion: '모반 의심', relation: '우호도',
  threat: '위협도', goodwill: '호의', favor: '인정(favor)', trust: '신뢰',
  health: '체력', warmth: '체온', hunger: '포만도', skill: '숙련',

  // 전투
  defense: '방어도', damage: '피해', injury: '부상', loss: '손실',
  integrity: '내구도', integrityMax: '내구도 상한',
  pressure: '압박', exposure: '노출도', encirclement: '포위도',
  alarm: '경계', blockade: '봉쇄', prep: '준비 점수',
  raiderSplit: '습격 무리 배분 — main(본대)/looters(약탈조)/flankers(우회조)',
  groupMin: '일행 최소 인원', groupMax: '일행 최대 인원',
  siteGroupMin: '거점 출신 일행 최소 인원', siteGroupMax: '거점 출신 일행 최대 인원',
  main: '본대 몫', looters: '약탈조 몫', flankers: '우회조 몫',
  breakthrough: '돌파 — 성벽을 뚫고 중심지로', plunder: '약탈 — 곳간을 털고 빠진다', arson: '방화 — 불을 놓고 빠진다',
  front: '전열', middle: '중열', rear: '후열',
  garrison: '수비병·파수꾼', levy: '징집한 일반 주민',
  militia: '수비병', watchman: '파수꾼', watchmen: '파수꾼 수', hunter: '사냥꾼',
  healer: '의료 인원', civilian: '비전투 주민',
  sentries: '망보는 무리', trailArchers: '길목 궁수', wallSpears: '목책 창수',
  wallArchers: '목책 궁수', yardVanguard: '마당 선봉', yardSkirmishers: '마당 척후',
  leaderGuard: '두목 친위', keepArchers: '내성 궁수', leaderEscapeGroup: '두목 도주 호위',

  // 세력·계략
  nimacha: '니마차 우디캐', holaon: '홀라온 야인', bandit: '변경 마적', court: '조정',
  rearManeuver: '후방 우회', wallBreakers: '성벽 파쇄조', fireArrows: '불화살',
  feint: '양동', nightApproach: '야음 접근',
  stratagemPoints: '계략 점수', maxStratagems: '동시에 쓸 수 있는 계략 수',

  // 짐승
  wolf: '늑대', tiger: '호랑이', greatTiger: '큰 호랑이', mountainLord: '산군(가장 큰 호랑이)',
  boar: '멧돼지', pack: '무리',
  rabbit: '토끼', pheasant: '꿩', roeDeer: '노루', wildBoar: '멧돼지',

  // 지형·수역
  river: '강', lake: '호수', sea: '바다',
  shore: '연안', mid: '중간 수역', deep: '먼바다·깊은 곳',
  small: '작음', medium: '보통', large: '큼',

  // 성벽·시설
  palisade: '목책', earthFort: '토성', stoneWall: '석성', gate: '성문',
  hut: '초가집', ondol: '온돌집', tileHouse: '기와집',
  center: '마을 중심지', storehouse: '창고', cellar: '움 저장고',
  smokehouse: '훈연소', charcoalKiln: '숯가마', onggiKiln: '옹기가마',
  smithy: '대장간', nitreYard: '염초장', clinic: '의원', tannery: '가죽공방',
  stable: '축사', market: '장터', office: '관청', watchtower: '망루', beacon: '봉수대',
};

// ── 토큰 뜻풀이 ─────────────────────────────────────────────────────────
// 위 용어집에 없는 리프는 camelCase를 쪼개 토큰마다 뜻을 붙여 잇는다.
// 문장이 아니라 **뜻풀이**다 — 편집기에서 흐리게 그려 자동 생성임을 드러낸다.
export const TOKEN_NOTES = {
  // 수량·구조
  min: '하한', max: '상한', minimum: '하한', maximum: '상한', base: '기본', total: '총',
  chance: '확률', prob: '확률', weight: '가중치', mult: '배율', multiplier: '배율',
  ratio: '비율', rate: '비율', factor: '계수', coefficient: '계수', scale: '배율',
  share: '몫', bonus: '가산', penalty: '감산', threshold: '문턱값', cap: '상한', limit: '상한',
  per: '당', day: '하루', days: '일수', daily: '하루', year: '연차', years: '연수', yearly: '해마다',
  annual: '연간', season: '계절', seasonal: '계절', interval: '간격', duration: '기간',
  cooldown: '재발 간격', grace: '유예', delay: '지연', step: '폭', extra: '추가',
  count: '개수', amount: '양', value: '값', size: '크기', num: '수', points: '점수', point: '점수',
  radius: '반경', range: '사거리', distance: '거리', tile: '칸', tiles: '칸수', spacing: '간격',
  width: '너비', height: '높이', depth: '깊이', side: '변', level: '수위', capacity: '수용량',
  reduction: '감소', increase: '증가', gain: '증가', loss: '손실', decay: '감소',
  rise: '상승', drop: '하락', start: '시작', starting: '시작', initial: '초기', end: '종료',
  first: '첫', second: '둘째', pre: '사전', post: '이후', after: '이후', to: '까지',
  default: '기본', normal: '보통', low: '낮음', high: '높음', full: '완전', partial: '부분',
  no: '없음', not: '아님', has: '보유', is: '여부', enabled: '사용 여부',
  required: '요구치', reference: '기준', buffer: '여유분', reserve: '비축', reserved: '예비',
  streak: '연속', consecutive: '연속', repeat: '반복', repeated: '반복', retry: '재시도',
  minus: '-1', zero: '0', plus: '+1', one: '1', variance: '변덕폭', anomaly: '편차',
  random: '난수 폭', jitter: '흔들림', pity: '보정(연속 실패 구제)', misses: '연속 실패',

  // 자원·생산
  food: '식량', grain: '곡물', rice: '벼', meat: '고기', fish: '생선', herb: '약초', herbs: '약초',
  wood: '목재', stone: '돌', iron: '철', tools: '도구', hide: '가죽', hay: '건초', salt: '소금',
  firewood: '장작', brushwood: '땔나무', charcoal: '숯', silver: '은', powder: '화약',
  gunpowder: '화약', onggi: '옹기', cotton: '목화', wool: '양털', kimchi: '김치', jang: '장',
  beans: '콩', eggs: '달걀', egg: '달걀', milk: '젖', vegetables: '채소', vegetable: '채소',
  cured: '보존', salted: '염장', dried: '건조', clothes: '옷', clothing: '의복', footwear: '신발',
  shoe: '신', shoes: '신', straw: '짚', leather: '가죽', carts: '수레', cart: '수레',
  spear: '창', spears: '창', bow: '활', bows: '활', horn: '각', musket: '조총', muskets: '조총',
  firearm: '화기', ranged: '원사', melee: '근접', weapon: '무기', armor: '갑주', shielded: '방패',
  yield: '산출', output: '산출', product: '산물', input: '투입', byproduct: '부산물',
  feed: '사료', head: '마리', headcount: '두수', breeding: '번식', slaughter: '도축',
  harvest: '수확', growth: '성장', grow: '생육', sow: '파종', replant: '다시 심기', crop: '작물',
  farm: '밭', field: '밭', paddy: '논', irrigated: '관개', fertile: '비옥',
  mine: '채광', mining: '채광', vein: '광맥', ore: '광석', deposit: '광상',
  catch: '어획', fishing: '어로', boat: '배', hull: '선체', cargo: '적재', trip: '출항',
  carry: '적재', haul: '운반', hauler: '운반꾼', batch: '묶음', work: '작업', labor: '노동',
  build: '건설', repair: '보수', progress: '공정', durability: '내구도', wear: '마모',
  efficiency: '효율', skill: '숙련', production: '생산', processing: '가공',
  maturation: '숙성', fermentation: '발효', spoilage: '부패', preservation: '보존',

  // 사람·마을
  resident: '주민', residents: '주민', population: '인구', people: '인원', worker: '작업자',
  child: '아이', children: '아이', youth: '소년', infant: '아기', elder: '노년', adult: '성인',
  mother: '산모', couple: '부부', marriage: '혼인', birth: '출산', death: '사망', died: '사망',
  home: '집', housing: '주거', bed: '침상', homeless: '노숙', shelter: '대피',
  morale: '사기', health: '건강', warmth: '체온', warm: '온기', cold: '추위', hungry: '굶주림',
  sick: '병', epidemic: '역병', plague: '역병', isolation: '격리', quarantine: '격리',
  physician: '의원', treatment: '치료', recovery: '회복', recover: '회복', heal: '치료', relief: '완화',
  diet: '식단', meal: '끼니', monotony: '단조로움', variety: '다양성', luxury: '사치품',
  education: '교육', school: '서당', teacher: '훈장', literate: '문해', schooling: '취학',
  religion: '종교', shaman: '무당', monk: '승려', burial: '안장', funeral: '장례', grief: '슬픔',
  immigration: '이주민', immigrant: '이주민', defector: '귀순자', promotion: '승격', rank: '승격 단계',
  job: '직업', jobs: '직업', herder: '목동', smith: '대장장이', clerk: '아전', weaver: '직조공',
  hunters: '사냥꾼', militia: '수비병', watchman: '파수꾼', watchmen: '파수꾼', sentry: '망꾼',

  // 날씨·기후·재해
  weather: '날씨', clear: '맑음', rain: '비', frost: '서리', snow: '눈', heavy: '심함',
  blizzard: '눈보라', snap: '한파', thaw: '해빙', flood: '홍수', storm: '풍랑', storminess: '폭풍우',
  rough: '거친 바다', dry: '건조', drought: '가뭄', locust: '황충', fire: '화재', ignition: '발화',
  burn: '연소', intensity: '세기', spread: '번짐', suppression: '진압', bucket: '물통',
  collapse: '붕락', rescue: '구조', survival: '생존', temperature: '기온', precipitation: '강수',
  climate: '기후', outdoor: '실외', indoor: '실내', night: '밤', winter: '겨울', summer: '여름',
  spring: '봄', autumn: '가을', water: '물', well: '우물', aquifer: '수맥', canal: '수로',
  weir: '보(洑)', reservoir: '저수', drainage: '배수', coverage: '급수 범위', unserved: '급수 못 받음',
  habitat: '서식지', forest: '숲', mature: '성목', stump: '그루터기', regrow: '재생',

  // 전투·습격
  raid: '습격', raider: '습격 무리', raiders: '습격 무리', enemy: '적', attacker: '공격 측',
  defender: '수비 측', combat: '전투', battle: '전투', power: '전력', defense: '방어',
  damage: '피해', injury: '부상', wound: '부상', wounded: '부상', kill: '전사', kills: '전사',
  siege: '포위', wall: '성벽', walls: '성벽', breach: '돌파', breakthrough: '돌파',
  gate: '성문', tower: '망루', watchtower: '망루', beacon: '봉수대', garrison: '군영',
  plunder: '약탈', loot: '노획', looters: '약탈조', arson: '방화', flankers: '우회조',
  ambush: '매복', ambushed: '기습당함', encirclement: '포위도', blockade: '봉쇄', breakout: '돌파',
  escape: '도주', pursuit: '추격', routed: '패주', withdraw: '후퇴', withdrawing: '후퇴',
  surrender: '항복', defeat: '패배', victory: '승리', win: '승리', repelled: '격퇴',
  warned: '경보됨', surprise: '기습', warning: '경보', scout: '정찰', intel: '정보',
  alarm: '경계', prep: '준비', preparation: '준비', doctrine: '방침', stratagem: '계략',
  objective: '목표', formation: '진형', exposure: '노출', facing: '방향', frontal: '정면',
  screened: '엄폐', screening: '엄폐', guarded: '호위', unguarded: '무방비', exposed: '노출',
  cohort: '부대', group: '무리', groups: '무리', deployment: '배치',
  infiltration: '침투', maneuver: '기동', charge: '돌격', shock: '충격', contact: '접촉',
  reload: '재장전', shots: '사격 횟수', firing: '사격', inactive: '미가동', active: '가동',
  artillery: '화포', hwacha: '화차', medic: '의무', cannon: '불랑기포', chongtong: '총통',
  bombardment: '포격', trap: '함정', bait: '미끼', hunt: '사냥', beast: '짐승', prey: '사냥감',
  drive: '몰이', driver: '몰이꾼', drivers: '몰이꾼', sector: '구역', hole: '빈틈', rehide: '재은신',
  cornered: '궁지', counter: '되받음', countered: '상쇄됨', concentration: '화력 집중',
  focused: '집중', dense: '밀집', sparse: '성김', line: '열', flank: '측면',
  route: '경로', routes: '경로', detour: '우회', path: '경로', pathing: '경로',
  supply: '보급', supplies: '보급', inventory: '재고', storage: '저장',

  // 외교·조정
  trade: '교역', trades: '교역', offer: '제안', haggle: '흥정', margin: '마진', contract: '계약',
  relation: '우호도', relations: '우호도', goodwill: '호의', favor: '인정', trust: '신뢰',
  gift: '예물', envoy: '사절', pact: '협정', accord: '협정', claim: '생활권', tribute: '세공',
  petition: '청원', grant: '하사', reputation: '명성', rep: '명성', suspicion: '모반 의심',
  inspection: '감찰', bribe: '뇌물', censure: '견책', crackdown: '토벌', seize: '몰수',
  honest: '정직', expose: '발각', sanction: '허가', secret: '잠채', sealed: '봉인',
  pardon: '사면', exoneration: '누명 벗김', ransom: '몸값', demand: '요구', requisition: '징발',
  refuse: '거절', accept: '수락', decline: '거절', fulfill: '이행', miss: '불이행',
  break: '파기', cancel: '해지', compensation: '배상', apology: '사죄', violation: '침범',
  aid: '원군', dispatch: '파병', war: '전쟁', opposing: '반대편', hostility: '적대', grudge: '원한',
  cozy: '지나친 친분', northern: '북방', faction: '세력', site: '거점', passage: '통행로',
  lair: '산채', proximity: '근접', loiter: '머무름', origin: '출발지', travel: '이동',

  // 사건·기타
  event: '사건', events: '사건', occurrence: '발생', trigger: '발동', activation: '발동',
  scripted: '통제(연출된)', tutorial: '길잡이', goal: '목표치', legacy: '구버전 호환',
  ginseng: '산삼', gyrfalcon: '해동청', shipwreck: '표류선', pelt: '가죽', wait: '기다리기',
  early: '이른', late: '늦은', observation: '관망', failure: '실패', success: '성공',
  fail: '실패', real: '실제', suspicionDecay: '의심 감소',
  edict: '절목', ration: '배급', fuel: '연료', tight: '절약', generous: '넉넉',
  whiplash: '조령모개', slot: '슬롯', slots: '슬롯',
  artifact: '보물', telescope: '천리경', voucher: '어음', award: '하사량', practical: '실용품',
  advanced: '고급품', support: '지원', effect: '효과', effects: '효과', profile: '유형',
  candidates: '후보', cost: '비용', costs: '비용', price: '값', tax: '세', pay: '납부',
  report: '보고', log: '기록', cheer: '위안', transition: '전환', named: '이름 있는',
  exiled: '유배', scholar: '문사', jurchen: '여진', warrior: '무사', warriors: '무사', geomancer: '지관',
  interpreter: '역관', uinyeo: '의녀', hangwae: '항왜', runaway: '도망', novice: '동자승',
  mentor: '스승', succession: '후계', confined: '유폐', service: '봉직', recruit: '영입',
  desert: '이탈', kimjang: '김장', jangdokdae: '장독대', mudang: '무당',

  // 짐승·생물
  wolf: '늑대', tiger: '호랑이', great: '큰', lord: '군(君)', mountain: '산',
  boar: '멧돼지', horse: '말', livestock: '가축', predator: '맹수', pack: '무리',
  encounter: '조우', ginsengWeight: '산삼 가중치',

  // 위치·시설
  village: '마을', center: '중심지', settlement: '개척지', inland: '내륙', river: '강', deep: '깊은 곳',
  mid: '중간', shallow: '얕음', shore: '연안', tidal: '갯벌', fishery: '어살터', port: '나루',
  dock: '나루터', lodge: '막', lodging: '숙영', camp: '막(거점)', lumber: '벌목', yard: '마당',
  hut: '초가집', ondol: '온돌집', cellar: '움 저장고', clinic: '의원', smithy: '대장간',
  stable: '축사', office: '관청', workplace: '작업장', household: '한집', keep: '내성',
  trail: '길목', inner: '내부', building: '건물', nitre: '염초', kiln: '가마',

  // 전투 보강
  age: '나이', rounds: '라운드', round: '라운드', tick: '틱', ticks: '틱', exit: '이탈',
  vs: '대(對)', mounted: '기마', threat: '위협도', move: '이동', tactical: '전술',
  pressure: '압박', assault: '강습', rear: '후방', target: '표적', shift: '가감',
  military: '군세', split: '배분', hit: '명중', prepared: '대비함', levy: '징집',
  unit: '개', units: '부대',
  main: '본대', fighter: '전투원', commandable: '지휘 가능',
  breaker: '파쇄', breakers: '파쇄조', probing: '탐색', forming: '편성 중', commit: '투입',
  intent: '의도', turn: '선회', wrong: '어긋난', direction: '방향', charging: '돌격 중',
  civilian: '비전투', unarmed: '비무장', isolated: '고립', casualty: '사상',
  adjacent: '인접', same: '같은', specialist: '전문', multi: '다중', member: '인원',
  decision: '결심', fallback: '대체', moved: '이동함', open: '열림',
  intercept: '요격', projectile: '투사체', steps: '걸음', engagements: '교전',
  responders: '대응 인원', rescuer: '구조자', urgent: '신속', careful: '신중', secondary: '2차',
  block: '차단', resistance: '저항', estimated: '추정', forced: '강제', auto: '자동', deploy: '배치',
  curve: '곡선', exponent: '지수', featured: '주역', sprite: '스프라이트',
  jija: '지자총통', explosion: '폭발', arrows: '화살',

  // 상태·기타 보강
  bad: '나쁨', good: '좋음', missing: '없음', short: '부족', shortage: '부족',
  poor: '부실', natural: '자연', severe: '혹독', harsh: '궂은 날씨', quiet: '잠잠',
  crowding: '과밀', unattended: '방치', cull: '도태', alert: '경보', refresh: '갱신',
  risk: '위험', speed: '속도', resource: '자원', stock: '비축', stored: '저장',
  preferred: '선호', return: '귀환', returns: '복귀', reveal: '드러남', severity: '심각도',
  search: '수색', departure: '출항', subticks: '서브틱', regen: '회복', addition: '추가',
  safe: '안전', floor: '하한', fill: '채움', flooded: '침수', source: '발화원',
  barefoot: '맨발', evening: '저녁', with: '동반', patient: '환자', diagnosis: '진단',
  attempt: '시도', review: '재검토', change: '변경', ignore: '무시', removed: '제거',
  window: '기간', at: '시점', div: '나눗수', pop: '인구', avoid: '회피', for: '대상',
  capita: '1인당', ferment: '발효식품', below: '미만', rel: '관계', tip: '귀띔',
  negotiate: '협상', reject: '거절', strict: '엄격', greedy: '탐욕', tactician: '지략',
  lenient: '관대', expedition: '원정', silverwork: '은세공', medium: '보통', large: '큼',
  player: '플레이어', incoming: '상대 제안', premium: '웃돈', tolerance: '허용 폭',
  bandit: '마적', nimacha: '니마차', holaon: '홀라온', court: '조정', other: '그 외',
  safety: '안전', effectiveness: '효과', protected: '보호됨', hold: '버티기',
};

// ── 경로별 개별 설명 ────────────────────────────────────────────────────
// 리프 이름만으로는 뜻이 갈리거나, 한 줄 설명을 붙일 값어치가 있는 경로.
// (config.ts에 주석을 다는 편이 낫지만, 파일을 불리지 않으려는 것들이 여기 온다.)
export const FIELD_NOTES = {
  'map.width': '지도 가로 칸 수',
  'map.height': '지도 세로 칸 수',

  'minerals.stoneMin': '돌 광상 하나의 매장량 하한',
  'minerals.stoneMax': '돌 광상 하나의 매장량 상한',
  'minerals.ironMin': '철 광상 하나의 매장량 하한',
  'minerals.ironMax': '철 광상 하나의 매장량 상한',
  'minerals.legacyStone': '구버전 저장을 이어받을 때 쓰는 돌 매장량',
  'minerals.legacyIron': '구버전 저장을 이어받을 때 쓰는 철 매장량',
  'minerals.nearbyStone': '중심지 근처에 놓는 지표 돌 노두의 매장량',
  'minerals.nearbyIron': '중심지 근처에 놓는 지표 철 노두의 매장량',
  'minerals.nearbyMinDistance': '근처 노두를 놓는 중심지로부터의 최소 거리(타일)',
  'minerals.nearbyMaxDistance': '근처 노두를 놓는 중심지로부터의 최대 거리(타일)',
  'minerals.deepMinePerDay': '심광정 1곳의 하루 산출',
  'minerals.deepMineStoneByproductRatio': '심광정 산출 중 돌로 나오는 몫',

  'gatheringZones.lodgingSupplyDays': '숙영막이 들고 나가는 보급 일수',
  'gatheringZones.lodgingHomeRestDays': '숙영 뒤 집에서 쉬는 일수',

  'tidalFlats.minimumPlacementTiles': '어살터를 놓으려면 필요한 최소 갯벌 칸수',

  'fishingGrounds.shoreRadius': '연안 대의 폭(타일) — 물가에서 이 거리까지',
  'fishingGrounds.midRadius': '중간 수역 대의 폭(타일)',
  'fishingGrounds.deepRadius': '먼바다·깊은 곳 대의 폭(타일)',

  'time.msPerDay.1': '1배속 — 하루당 실시간(ms)',
  'time.msPerDay.3': '3배속 — 하루당 실시간(ms)',
  'time.msPerDay.10': '10배속 — 하루당 실시간(ms)',

  'exploration.residentRadius': '주민이 안개를 걷는 반경(타일)',
  'exploration.buildingRadius': '건물이 안개를 걷는 반경(타일)',
  'exploration.nightMult': '밤 시야 배율',

  'start.residents': '시작 개척민 수',

  'production.woodPerDay': '벌목꾼 1인 하루 목재',
  'production.gamePerDay': '사냥꾼 1인 하루 사냥감',
  'production.herbsPerDay': '약초꾼 1인 하루 약초',
  'production.toolsPerDay': '대장장이 1인 하루 도구',
  'production.fishPerDay': '어부 1인 하루 생선',
  'production.ironMinePerDay': '채광꾼 1인 하루 철',
  'production.meatPerGame': '사냥감 1마리당 고기',
  'production.hidePerGame': '사냥감 1마리당 가죽',
  'production.officeBonusPerClerk': '아전 1명당 관청 효율 가산',
  'production.officeMaxBonus': '관청 효율 가산 상한',
  'production.lumberCampBonus': '벌목장 작업영역 안에서의 산출 배율',
  'production.huntLodgeBonus': '사냥막 작업영역 안에서의 산출 배율',
  'production.herbHutBonus': '약초막 작업영역 안에서의 산출 배율',
  'production.fertileBonus': '비옥한 땅의 수확 배율',
  'production.skillGainPerDay': '하루 숙련 상승량',

  'agents.work.chop': '벌목 1회에 드는 서브틱',
  'agents.work.hunt': '사냥 1회에 드는 서브틱',
  'agents.work.herb': '약초 채집 1회에 드는 서브틱',
  'agents.work.mine': '채광 1회에 드는 서브틱',
  'agents.work.fish': '어로 1회에 드는 서브틱',
  'agents.work.herd': '가축 돌보기 1회에 드는 서브틱',
  'agents.yields.wood': '벌목 1회로 지는 목재',
  'agents.yields.game': '사냥 1회로 지는 사냥감',
  'agents.yields.herbs': '채집 1회로 지는 약초',
  'agents.yields.iron': '채광 1회로 지는 철',
  'agents.yields.stone': '채광 1회로 지는 돌',
  'agents.yields.mineStone': '철을 캘 때 함께 나오는 돌',
  'agents.yields.fish': '어로 1회로 지는 생선',
  'agents.yields.silver': '채광 1회로 지는 은',
  'agents.hunting.habitatYieldBase': '서식지 사냥 산출 배율의 기본값',
  'agents.hunting.habitatYieldPerTile': '서식지 숲 1칸당 산출 배율 가산',
  'agents.hunting.habitatYieldMax': '서식지 사냥 산출 배율 상한',

  'threat.basePerDay': '하루 기본 위협도 상승',
  'threat.wealthThreshold': '이만큼 비축하면 부유하다고 보고 위협도가 더 오른다',
  'threat.raidThreshold': '이 위협도를 넘어야 습격 판정이 시작된다',
  'threat.afterRaidThreat': '습격이 지나간 뒤 남는 위협도',
  'threat.raidCooldownDays': '습격 뒤 다음 습격까지의 최소 간격(일)',
  'threat.earlyWarnLeadDays': '조기 경보가 습격보다 며칠 앞서 뜨는가',

  'raid.basePower': '습격 무리 전력의 기본값',
  'raid.powerPerYear': '연차 1년당 전력 가산',
  'raid.powerRandom': '전력에 얹히는 난수 폭',
  'raid.wealthPowerDiv': '비축을 이 값으로 나눈 만큼 전력 가산',
  'raid.watchmanDefense': '파수꾼 1인당 방어 기여',
  'raid.militiaDefense': '수비병 1인당 방어 기여',
  'raid.warnedDefenseMult': '경보를 받았을 때의 방어 배율',

  'watchtower.escapeIntegrityRatio': '내구도가 이 비율 밑으로 떨어지면 파수꾼이 망루를 버린다',
  'watchtower.fireIntervalTicks': '사격 간격(틱)',
  'watchtower.dailyDamageCap': '하루에 줄 수 있는 피해 상한',
  'watchtower.bowDailyDamageCap': '활을 갖췄을 때의 하루 피해 상한',
  'watchtower.escapeGraceTicks': '망루를 버리기까지의 유예(틱)',

  'siege.evacuationTicks': '주민이 성 안으로 대피하는 데 걸리는 틱',
  'siege.baseEnemySupplyDays': '적이 버티는 기본 보급 일수',
  'siege.powerPerSupplyDay': '적 전력이 이만큼일 때마다 보급 일수 +1',
  'siege.dailySupplyBurn': '하루에 닳는 적 보급',

  'trade.minIntervalDays': '같은 세력이 다시 찾아오기까지의 최소 간격(일)',
  'trade.dailyChance': '교역단이 찾아올 하루 확률',
  'trade.dockOfferScale': '나루터가 있을 때의 제안 규모 배율',
  'trade.maxHaggleRounds': '흥정 가능 횟수',
  'trade.dockCapacityMult': '나루터가 있을 때의 교역량 배율',

  'difficulty.easy.startRes': '시작 물자 배율',
  'difficulty.easy.threatGain': '위협도 상승 배율',
  'difficulty.easy.raidPower': '습격 전력 배율',
  'difficulty.easy.habitatChance': '숲 덩어리마다 짐승 서식지가 자리 잡을 확률',
  'difficulty.normal.startRes': '시작 물자 배율',
  'difficulty.normal.threatGain': '위협도 상승 배율',
  'difficulty.normal.raidPower': '습격 전력 배율',
  'difficulty.normal.habitatChance': '숲 덩어리마다 짐승 서식지가 자리 잡을 확률',
  'difficulty.hard.startRes': '시작 물자 배율',
  'difficulty.hard.threatGain': '위협도 상승 배율',
  'difficulty.hard.raidPower': '습격 전력 배율',
  'difficulty.hard.habitatChance': '숲 덩어리마다 짐승 서식지가 자리 잡을 확률',

  'victory.years': '보(堡) 승격 조건 — 버텨야 하는 연수',
  'victory.population': '보(堡) 승격 조건 — 인구',
  'victory.maxWinterDeathRate': '보(堡) 승격 조건 — 허용되는 겨울 사망률 상한',
  'victory.defense': '보(堡) 승격 조건 — 방어도',
  'victory.food': '보(堡) 승격 조건 — 식량 비축',
  'victory.firewood': '보(堡) 승격 조건 — 장작 비축',

  'suspicion.hideDecay': '은닉을 택했을 때 즉시 줄어드는 의심 (suspicion.ts:205)',
  'suspicion.honestSuccessDecay': '정직하게 답해 통과했을 때 줄어드는 의심',
  'suspicion.honestFailRise': '정직하게 답했다가 걸렸을 때 오르는 의심',
  'specialResidents.exiledScholarHideSuspicionRise': '유배 문사를 숨겨줄 때 오르는 의심',

  // 생산 변환비 — "산물 1개를 만드는 데 드는 원료" 꼴이라 리프 이름만으로는 방향이 안 읽힌다.
  'production.cartWoodPerUnit': '수레 1대에 드는 목재',
  'production.cartIronPerUnit': '수레 1대에 드는 철',
  'production.cartToolsPerUnit': '수레 1대에 드는 도구',
  'production.spearIronPerUnit': '창 1자루에 드는 철',
  'production.spearWoodPerUnit': '창 1자루에 드는 목재',
  'production.hornBowWoodPerUnit': '각궁 1장에 드는 목재',
  'production.hornBowHidePerUnit': '각궁 1장에 드는 가죽',
  'production.musketIronPerUnit': '조총 1정에 드는 철',
  'production.musketWoodPerUnit': '조총 1정에 드는 목재',
  'production.musketToolsPerUnit': '조총 1정에 드는 도구',
  'production.silverworkSilverPerUnit': '귀금속 1개에 드는 은',
  'production.silverworkCharcoalPerUnit': '귀금속 1개에 드는 숯',
  'production.cottonClothesPerCotton': '목화 1당 나오는 무명옷',
  'production.brushwoodPerWood': '벌목할 때 목재 1당 함께 지고 오는 땔나무',
  'production.firewoodPerWood': '목재 1당 나오는 장작',
  'production.charcoalPerWood': '목재 1당 나오는 숯',
  'production.firewoodWoodPerDay': '장작꾼 1인 하루 목재 처리량',
  'production.weaverCottonPerDay': '직조공 1인 하루 목화 처리량',
  'production.curedMeatPerDay': '갈무리꾼 1인 하루 보존육',
  'production.saltedFishPerDay': '갈무리꾼 1인 하루 자반',
  'production.driedFishPerDay': '갈무리꾼 1인 하루 건어물',
  'production.onggiPerDay': '옹기장이 1인 하루 옹기',
  'production.saltPerDay': '염부 1인 하루 소금',
  'production.gunpowderPerDay': '염초장이 1인 하루 화약',
  'production.cartsPerDay': '대장장이 1인 하루 수레',
  'production.spearsPerDay': '대장장이 1인 하루 창',
  'production.hornBowsPerDay': '대장장이 1인 하루 각궁',
  'production.musketsPerDay': '대장장이 1인 하루 조총',
  'production.meatPerCuredMeat': '보존육 1에 드는 고기',
  'production.firewoodPerCuredMeat': '보존육 1에 드는 장작',
  'production.charcoalPerCuredMeat': '보존육 1에 드는 숯',
  'production.fishPerSaltedFish': '자반 1에 드는 생선',
  'production.saltPerSaltedFish': '자반 1에 드는 소금',
  'production.fishPerDriedFish': '건어물 1에 드는 생선',
  'production.firewoodPerOnggi': '옹기 1개에 드는 장작',
  'production.charcoalPerOnggi': '옹기 1개에 드는 숯',
  'production.firewoodPerSalt': '소금 1에 드는 장작',
  'production.gunpowderFirewoodPerPowder': '화약 1에 드는 장작',
  'production.gunpowderStonePerPowder': '화약 1에 드는 돌',
  'wearables.strawShoeHayPerUnit': '짚신 1켤레에 드는 건초',

  'specialEvents.predatorMinSettlementDistance': '맹수가 나타날 때 마을에서 떨어져 있어야 하는 최소 거리(타일)',
  'specialEvents.predatorPreferredForestTiles': '맹수가 자리 잡기 좋아하는 숲 덩어리 크기(칸)',

  // 습격 대응·교역이 세력 우호도를 얼마나 움직이는가 (raids.ts)
  'relations.tradeAccept': '교역에 응했을 때의 우호도 변화',
  'relations.tradeDecline': '교역을 거절했을 때의 우호도 변화',
  'relations.negotiateSuccess': '습격 무리와의 협상이 통했을 때의 우호도 변화',
  'relations.negotiateFail': '협상이 깨졌을 때의 우호도 변화',
  'relations.militiaLoss': '수비병으로 맞섰다가 졌을 때의 우호도 변화',
  'relations.shelter': '피신으로 대응했을 때의 우호도 변화',
  'relations.beacon': '봉수로 물렸을 때의 우호도 변화',
  'relations.lowRelThreatScale': '낮은 관계를 위협도 가산으로 옮기는 배율',

  'immigration.dailyChance': '이주민이 찾아올 하루 확률',
  'immigration.cooldownDays': '다음 유입까지의 최소 간격(일)',
  'immigration.rejectReputation': '돌려보낼 때 잃는 명성',
};

// ── 경로 규칙 ───────────────────────────────────────────────────────────
// 같은 리프 이름이 문맥마다 다른 뜻인 경우. FIELD_NOTES 다음, 용어집 앞에서 본다.
// note는 (leafLabel) => 문구. leafLabel은 게임 이름표(자원명 등)를 먼저 적용한 리프 이름이다.
export const PATH_RULES = [
  { test: /^buildings\.[^.]+\.cost\.[^.]+$/, note: leaf => `건설 자재 — ${leaf}` },
  { test: /^buildings\.[^.]+\.capacity$/, note: () => '주거 수용 인원 (0이면 주거가 아니다)' },
  { test: /^buildings\.[^.]+\.defense$/, note: () => '이 건물이 더하는 방어도' },
  { test: /^livestock\.[^.]+\.capacity$/, note: () => '축사 1동이 기르는 정원(마리)' },
  { test: /^livestock\.[^.]+\.productSeasonMult\.[^.]+$/, note: leaf => `산물 계절 배율 — ${leaf}` },
  { test: /^livestock\.[^.]+\.eggSeasonMult\.[^.]+$/, note: leaf => `달걀 계절 배율 — ${leaf}` },
  { test: /^start\.resources\.[^.]+$/, note: leaf => `시작 재고 — ${leaf}` },
  { test: /^trade\.capacityBase\.[^.]+$/, note: leaf => `기준 교역량 — ${leaf}` },
  { test: /^trade\.capacitySeasonMult\.[^.]+\.[^.]+$/, note: leaf => `계절 교역량 배율 — ${leaf}` },
  { test: /^tribute\.baseAmounts\.[^.]+$/, note: leaf => `세공 기준 요구량 — ${leaf}` },
  { test: /^agents\.carryCap\.[^.]+$/, note: leaf => `1회 적재량 — ${leaf}` },
  { test: /^production\.processingReserves\.[^.]+$/, note: leaf => `가공에 쓰지 않고 남겨두는 재고 — ${leaf}` },
  { test: /^spoilage\.dailyRate\.[^.]+$/, note: leaf => `하루 부패율 — ${leaf}` },
  { test: /^weather\.table\.[^.]+\.[^.]+$/, note: leaf => `발생 확률 — ${leaf}` },
  { test: /^seasons\.[^.]+\.[^.]+$/, note: leaf => `계절 배율 — ${leaf}` },
  { test: /^pasture\.capacityPerTile\.[^.]+$/, note: leaf => `칸당 사육 가능 두수 — ${leaf}` },
  { test: /^disasters\.fire\.(?:burnProgressMultipliers|sourceWeights)\.[^.]+$/, note: leaf => `건물별 값 — ${leaf}` },
  { test: /^ranks\.effects\.[^.]+\.[^.]+$/, note: leaf => `승격 효과 배율 — ${leaf}` },
  { test: /^edicts\.slotsByRank\.[^.]+$/, note: leaf => `동시 시행 슬롯 수 — ${leaf}` },
  { test: /^petition\.yearlyPowder\.[^.]+$/, note: leaf => `봄마다 받는 화약 — ${leaf}` },
];

// ── 해석 ────────────────────────────────────────────────────────────────

const SPLIT = /([a-z0-9])([A-Z])|([A-Z]+)([A-Z][a-z])/g;

/** camelCase·snake_case 리프를 소문자 토큰으로 쪼갠다. */
export function splitLeaf(leaf) {
  return String(leaf)
    .replace(SPLIT, (_match, a, b, c, d) => (a ? `${a} ${b}` : `${c} ${d}`))
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean);
}

/** 토큰 자리에 끼워 넣기에 짧은 말인가 — 긴 설명문이 뜻풀이 사슬에 끼면 읽기 어려워진다. */
function shortEnough(text) {
  return typeof text === 'string' && text.length > 0 && text.length <= 6 && !text.includes('—');
}

/** 토큰 하나의 뜻. 토큰 사전 → 게임 이름표 → 리프 용어집(짧은 것만) 순. */
function glossToken(token, terms) {
  if (TOKEN_NOTES[token]) return TOKEN_NOTES[token];
  if (shortEnough(terms[token])) return terms[token];
  if (shortEnough(LEAF_NOTES[token])) return LEAF_NOTES[token];
  return null;
}

/**
 * 리프 이름 → 한국어. 용어집 → 게임 이름표 → 토큰 뜻풀이 순.
 *
 * `per X`는 뒤 토큰과 묶어 "X당"으로 읽는다 — `feedPerHeadPerDay`가
 * "사료·당·마리·당·하루"가 아니라 "사료·마리당·하루당"이 되게 하는 규칙이다.
 *
 * @param {string} leaf
 * @param {Record<string, string>} terms 게임 이름표 (자원·계절·날씨·직업·가축…)
 * @returns {string | null}
 */
export function describeLeaf(leaf, terms = {}) {
  if (Object.prototype.hasOwnProperty.call(LEAF_NOTES, leaf)) return LEAF_NOTES[leaf];
  if (Object.prototype.hasOwnProperty.call(terms, leaf)) return terms[leaf];
  const tokens = splitLeaf(leaf);
  if (tokens.length === 0) return null;

  const parts = [];
  let known = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token === 'per' && next) {
      const gloss = glossToken(next, terms);
      parts.push(`${gloss ?? next}당`);
      if (gloss) known = true;
      index++;
      continue;
    }
    const gloss = glossToken(token, terms);
    if (gloss) known = true;
    parts.push(gloss ?? token);
  }
  return known ? parts.join('·') : null;
}

/** 리프 이름을 게임 이름표로 먼저 옮긴 짧은 라벨 (경로 규칙 문구에 끼워 넣는다). */
function leafLabel(leaf, terms) {
  return terms[leaf] ?? LEAF_NOTES[leaf] ?? leaf;
}

/** 가장 가까운 조상 경로의 주석. 없으면 null. */
export function ancestorNote(path, comments) {
  const segments = path.split('.');
  for (let cut = segments.length - 1; cut > 0; cut--) {
    const ancestor = segments.slice(0, cut).join('.');
    const comment = comments[ancestor];
    if (!comment) continue;
    const text = comment.above ?? comment.side;
    if (text) return { path: ancestor, text };
  }
  return null;
}

/**
 * 필드 하나의 설명. 항상 무언가를 돌려주려 애쓴다 — 편집기에 영문 키만 남는 행이 없도록.
 *
 * @param {{ path: string, leaf: string, comments: Record<string, { above?: string, side?: string }>,
 *          terms?: Record<string, string>, groupNote?: string | null }} input
 * @returns {{ text: string, source: 'own'|'dict'|'glossary'|'ancestor'|'none',
 *            context: string | null }}
 */
export function resolveFieldNote({ path, leaf, comments, terms = {}, groupNote = null }) {
  const ancestor = ancestorNote(path, comments);
  const context = groupNote ?? ancestor?.text ?? null;

  const own = comments[path];
  if (own) {
    const text = [own.side, own.above].filter(Boolean).join(' — ');
    if (text) return { text, source: 'own', context };
  }

  const dict = FIELD_NOTES[path];
  if (dict) return { text: dict, source: 'dict', context };

  for (const rule of PATH_RULES) {
    if (rule.test.test(path)) return { text: rule.note(leafLabel(leaf, terms)), source: 'dict', context };
  }

  const glossary = describeLeaf(leaf, terms);
  if (glossary) return { text: glossary, source: 'glossary', context };

  if (context) return { text: context, source: 'ancestor', context: null };
  return { text: '', source: 'none', context: null };
}
