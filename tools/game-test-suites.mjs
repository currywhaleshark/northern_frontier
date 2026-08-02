const testFiles = (...names) => names.map(name => `test_${name}.mjs`);

// PR마다 확인할 저장·경제·건축·튜토리얼·방어 핵심 계약.
const CORE_TESTS = testFiles(
  'area_expansion',
  'auto_worker_assignment',
  'building_finder',
  'building_footprints',
  'building_inventory_logistics',
  'building_work_orders',
  'combat_roster',
  'crop_paddy_milling',
  'daily_cycle',
  'education',
  'epidemic_disaster',
  'expedition',
  'expedition_engagement',
  'exploration',
  'family_integrity',
  'farm_plot_sizing',
  'farmer_work_tiles',
  'fermentation',
  'finite_minerals',
  'fire',
  'foreign_sites',
  'forest_habitats',
  'fuel_and_clothing_chains',
  'gathering_assignment_g3',
  'gathering_zones_g2',
  'hauler_priority',
  'immigration',
  'irrigation_canals',
  'land_clearing',
  'lifecycle',
  'livestock',
  'lodging_huts_g4',
  'lumber_camp_worksite',
  'manual_orders',
  'map_forest_regrowth',
  'map_region_s3',
  'map_size_s2',
  'mine_collapse',
  'mine_worksite',
  'night_auto_speed',
  'new_game_setup',
  'onggi',
  'outcrop_obstacles_s3',
  'pastures',
  'pathfinding_collision',
  'pending_disasters',
  'physician',
  'preservation',
  'processing_reserves',
  'processor_input_logistics',
  'promotion',
  'resident_housing',
  'resource_category_consumption',
  'resource_save_migration',
  'selection_actions',
  'siege_state_p3',
  'smith_miner_priority',
  'smithy_products',
  'snow_damage',
  'special_events',
  'special_residents',
  'spring_flood_weir_reservoir',
  'subsurface_layers',
  'suspicion',
  'tactical_composition_fixture',
  'tactical_deployment',
  'tool_wear',
  'trade_values',
  'trades',
  'tutorial_scenario',
  'ui_prefs',
  'wall_drag_and_gate_conversion',
  'walls_and_gate',
  'watchtower_p4',
  'water_coverage',
  'weapon_assignments',
  'wearables',
  'worker_slot_production',
  'worker_slot_save_load',
  'worker_slots',
  'youth_activity',
);

// 수치나 다중 시드 결과를 검증하므로 관련 밸런스 변경 및 릴리스 때 실행한다.
const BALANCE_TESTS = testFiles(
  'annual_climate',
  'disaster_climate',
  'economy_throughput',
  'farm_food_yield',
  'hunting_variety',
  'kimjang_balance',
  'rank_production_efficiency',
  'satisfaction',
  'silver_economy',
  'spoilage',
  'threat_balance',
  'tier_one_building_costs',
  'weather_progression',
  'weather_schedule',
);

// PNG·아틀라스·렌더 좌표·생성 레지스트리 계약.
const ASSET_TESTS = testFiles(
  'building_effect_anchors',
  'court_item_icons',
  'map_hd_zoom',
  'new_content_assets',
  'resident_animation_phase',
  'resident_approved_i2v_locomotion',
  'resident_atlas_loading',
  'resident_builder_sprites',
  'resident_common_locomotion',
  'resident_farmer_sprites',
  'resident_hauler_sprites',
  'resident_herbalist_sprites',
  'resident_hunter_sprites',
  'resident_idle_video_walk',
  'resident_jige_cargo_sprites',
  'resident_miner_sprites',
  'resident_outdoor_work_sprites',
  'resident_sprite_integrity',
  'resident_woodcutter_video_walk',
  'resident_woodcutter_video_work',
  'resident_work_layout',
  'resident_work_sprites',
  'scene_viewport',
  'sprite_studio_registries',
  'tactical_background_assets',
  'tactical_sfx',
  'tactical_sprite_poses',
  'work_anchor_layout',
  'worker_stand_slots',
);

// TSX/CSS 연결과 화면 구조를 검사하는 빠르지만 구현 형태에 민감한 계약.
const UI_TESTS = testFiles(
  'build_drawer_presentation',
  'command_popover_placement',
  'dock_window_layout',
  'job_panel_detail',
  'lazy_ui_structure',
  'management_dock_ui',
  'minimap_geometry',
  'minimap_overlay_layout_ui',
  'minimap_render_layers',
  'modal_layering',
  'quality_of_life_ui',
  'resident_list_presentation',
  'resource_display',
  'runtime_perf_timeline_structure',
  'runtime_performance_structure',
  'runtime_snapshot_boundaries',
  'runtime_ui_refresh_structure',
  'selection_context_ui',
  'sidebar_removal_ui',
  'tactical_components',
  'unified_log_ui',
);

export const GAME_TEST_SUITE_NAMES = ['core', 'slow', 'balance', 'assets', 'ui', 'full'];

export function resolveGameTestSuites(allTests) {
  const known = new Set(allTests);
  const classified = new Map();
  const declaredSuites = {
    core: CORE_TESTS,
    balance: BALANCE_TESTS,
    assets: ASSET_TESTS,
    ui: UI_TESTS,
  };

  for (const [suite, tests] of Object.entries(declaredSuites)) {
    for (const test of tests) {
      if (!known.has(test)) throw new Error(`Unknown ${suite} game test: ${test}`);
      const previous = classified.get(test);
      if (previous) throw new Error(`Game test belongs to both ${previous} and ${suite}: ${test}`);
      classified.set(test, suite);
    }
  }

  const slow = allTests.filter(test => !classified.has(test));
  return {
    core: [...CORE_TESTS].sort((a, b) => a.localeCompare(b)),
    slow,
    balance: [...BALANCE_TESTS].sort((a, b) => a.localeCompare(b)),
    assets: [...ASSET_TESTS].sort((a, b) => a.localeCompare(b)),
    ui: [...UI_TESTS].sort((a, b) => a.localeCompare(b)),
    full: [...allTests],
  };
}
