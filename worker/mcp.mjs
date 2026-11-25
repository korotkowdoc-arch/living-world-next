import {nativeImageDescriptor,fetchNativeImage,transferNativeImage,privateImagePath,limitedBytes,imageMime,base64Image} from './native-visual-transfer.mjs';
import {visualRequest,visualPreferences,visualSubjects,visualReferences,visualPrompt,visualUploadHash,VISUAL_GUIDANCE} from '../public/core/visual-world.mjs';
import {WEALTH_GUIDANCE} from '../public/core/wealth-world.mjs';
import {documentIndex,DOCUMENT_GUIDANCE} from '../public/core/documents-world.mjs';
import {SOCIETY_GUIDANCE} from '../public/core/magic-society.mjs';
import {magicalAuthorSeeds} from '../public/core/magic-seeds.mjs';
import {MAGIC_GUIDANCE} from '../public/core/magic-world.mjs';
import {ADVANCED_GUIDANCE,CAPITAL_GUIDANCE} from '../public/core/advanced-world.mjs';
import {loadDurableCheckpoint,MIN_SNAPSHOT_SCENES} from '../public/core/durable-projection.mjs';
import {createProjectionCache} from '../public/core/projection-cache.mjs';
import {recordedPlayerActors} from '../public/core/social-dashboard.mjs';
import {createAncestryCache} from '../public/core/ancestry-cache.mjs';
import {planTimeAdvance} from '../public/core/life-calendar.mjs';
/**
 * First transport slice: Streamable HTTP MCP, Supabase owner-token validation.
 * Supabase Auth acts as the OAuth 2.1 authorization server; this Worker exposes
 * protected resource metadata and validates OAuth client-bound user tokens.
 * Client registration, consent URLs and end-to-end ChatGPT setup require deployment.
 */
import {buildNextContext,validateScene,replay,needsStatePreflight,validateStateAppend} from '../public/core/continuity.mjs';
import {revisionStatePreflight} from '../public/core/revisions.mjs';
import {recordedWorldAgenda} from '../public/core/world-time.mjs';
import {livingWorldView} from '../public/core/living-world.mjs';
import {annotationPassages,memoryReviewPage} from '../public/core/annotation-passages.mjs';
import {socialWorldView} from '../public/core/social-world.mjs';
import {knowledgeView} from '../public/core/knowledge.mjs';
import {relationshipHistory} from '../public/core/relationship-memory.mjs';
import {activityView} from '../public/core/activities.mjs';
import {consequenceView} from '../public/core/consequences.mjs';
import {growthView} from '../public/core/growth.mjs';
import {dynamicsView,playerChoiceView,resolvePlayerChoice} from '../public/core/world-dynamics.mjs';
import {prepareStoryTurn} from '../public/core/story-turn.mjs';
import {createAncestryReader} from '../public/core/ancestry-reader.mjs';
import {reviewSceneDraft} from '../public/core/scene-draft.mjs';
import {validateMemoryNotes,MEMORY_NOTE_POLICY,focusedMemoryNotes} from '../public/core/memory-notes.mjs';
import {economyView} from '../public/core/economy.mjs';
import {characterStateView} from '../public/core/character-state.mjs';
import {sceneFocusInput,focusedSceneContext,literalFocusHits} from '../public/core/scene-context.mjs';
import {promptForNarrator} from '../public/core/world.mjs';
import {limitedNarratorMemory,boundedMcpScene} from '../public/core/narration-budget.mjs';
import {actorMemoryEvidence} from '../public/core/actor-memory.mjs';
import {classifyDirective,extractLocks} from '../public/core/directives.mjs';

import {sceneReaderUrl} from '../public/core/scene-links.mjs';
import {menuSection,gameMenuContext,MENU_GUIDANCE,menuRecordFromInput,assertMenuAnchor,playerMenuOverview,menuActionIntent,menuPreferences,isMenuDirective,parseLegacyMenuRequest} from '../public/core/game-menu.mjs';

const version='2025-06-18';
const narratorWorkflow=VISUAL_GUIDANCE+'\n'+WEALTH_GUIDANCE+'\n'+DOCUMENT_GUIDANCE+'\n'+SOCIETY_GUIDANCE+'\n'+MAGIC_GUIDANCE+'\n'+CAPITAL_GUIDANCE+'\n'+ADVANCED_GUIDANCE+'\n'+MENU_GUIDANCE+'\n'+ 'When the user plays or continues a saved world, read get_world_context with the intended actors, place and fictional target_time before writing; use its next_turn proposal. Use prepare_story_turn for different filters or additional candidate pages. Retrieve exact source scenes or focused context when relevant memory is missing. Focused context includes bounded derived historical hints when storage is available; verify their source scenes and never confuse them with canonical knowledge. Respect the player’s character agency and each NPC’s separate knowledge, goals and relationships. Long-form play by default: aim for 1500–2500 words where appropriate, never pad, pause BEFORE a meaningful decision of the player character. Present 2–5 meaningful options plus unrestricted free text, using clickable chat controls if supported (plain numbered fallback otherwise). Save only the narrated prefix with a pending player_choice event, then wait. When the user responds, validate the saved choice with validate_player_choice and record the answered event first in the next actual scene. Never treat menu options as actions or user consent. After writing the actual scene, extract its significant canonical changes yourself as events with literal evidence; the user need not annotate. When owner autosave is enabled, use save_scene with the pinned branch, expected_head, expected_rules_version and a fresh request_id. If saving fails or is uncertain, check get_scene_receipt before retrying the same request; never claim an unsaved scene is saved. Use review_scene_draft for complex transitions. Do not save brainstorming, out-of-character discussion, or unplayed proposals. When an older story has gaps, use get_memory_review_queue to locate sources and get_annotation_passages/get_story_scene to read them. If historical note storage is available, save_memory_notes can record evidence-backed retrieval aids; do not turn them into retroactive canonical events.';
const toolsList=[
  {name:'save_chatgpt_illustration',title:'Сохранить изображение ChatGPT в мир',description:'Save an actual generated or user-selected ChatGPT Library image to an existing illustration request. Use only the real file attachment supplied by ChatGPT (not invented IDs or URLs). No paid generation API, no story advance. If no authorized file is available, ask user to select the generated image from Library and retry.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},asset_id:{type:'string',format:'uuid'},image:nativeImageDescriptor},required:['world_id','asset_id','image'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true},_meta:{'openai/fileParams':['image'],'openai/toolInvocation/invoking':'Сохраняю изображение в мир','openai/toolInvocation/invoked':'Проверка сохранённого изображения'}},
  {name:'read_world_illustration_image',title:'Открыть изображение мира',description:'Return actual private saved image pixels as MCP image content to view in chat or use as visual reference when supported. Never generates an image. Use only an active-ancestry ready asset.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},asset_id:{type:'string',format:'uuid'}},required:['world_id','asset_id'],additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false,destructiveHint:false}},
  {name:'list_world_illustrations',description:'List actual stored visual library in active ancestry. Pending requests are not generated images. No scene or choice changes.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},required:['world_id'],additionalProperties:false}},
  {name:'get_visual_profile',description:'Find existing consistent visual references and saved identity notes for a subject; use before generating another image.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},subject_kind:{type:'string'},subject_id:{type:'string',maxLength:180}},required:['world_id','subject_kind','subject_id'],additionalProperties:false}},
  {name:'request_world_illustration',description:'Prepare and persist an illustration request only after explicit user desire to create image. Returns exact generation prompt, reference metadata and link to upload generated image. Does not generate or save image bytes.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},expected_head:{type:['string','null']},expected_rules_version:{type:'integer',minimum:0},subject_kind:{type:'string'},subject_id:{type:'string',maxLength:180},kind:{type:'string'},description:{type:'string',maxLength:3500},identity_notes:{type:'string',maxLength:4000}},required:['world_id','actor','expected_head','expected_rules_version','subject_kind','subject_id','kind','description'],additionalProperties:false}},
  {name:'get_world_illustration',description:'Get metadata and authenticated app link for a visible illustration. Never pretend an image exists when pending.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},asset_id:{type:'string',format:'uuid'}},required:['world_id','asset_id'],additionalProperties:false}},
  {name:'attach_world_illustration',description:'Finalize an actual image already uploaded into its private storage slot. Fails if bytes missing. Does not upload or generate.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},asset_id:{type:'string',format:'uuid'}},required:['world_id','asset_id'],additionalProperties:false}},
  {name:'plan_game_time',description:'Preview staged fictional time advance for player actor. Never saves or consumes a choice. Check scheduled deadlines and estimated critical needs.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},target_time:{type:'string',maxLength:30}},required:['world_id','actor','target_time'],additionalProperties:false}},
  {name:'get_world_document',description:'Read exact stored chapter after established reading (or authorship); does not advance time or expose unread text. Use current menu manifest IDs. If text unavailable, propose actual reading scene.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},edition_id:{type:'string',maxLength:60},chapter_id:{type:'string',maxLength:60},expected_head:{type:['string','null']},expected_rules_version:{type:'integer',minimum:0}},required:['world_id','actor','edition_id','chapter_id','expected_head','expected_rules_version'],additionalProperties:false}},
  {name:'get_document_authoring',description:'Narrator-only exact stored text or missing marker for an explicitly selected first reading or authoring. No generation, time or progress change. For a delivered letter use letter_id. Never show unread text merely for browsing.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},edition_id:{type:'string',maxLength:60},chapter_id:{type:'string',maxLength:60},letter_id:{type:'string',maxLength:80},expected_head:{type:['string','null']},expected_rules_version:{type:'integer',minimum:0}},required:['world_id','actor','expected_head','expected_rules_version'],additionalProperties:false}},
  {name:'get_game_menu',description:'Read menu, evidence-backed own character, inventory, tasks, skills, contacts and settings. No scene or time change. Specify the exact player-controlled actor. Optional section returns only that section and the dashboard.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40},expected_head:{type:['string','null']},expected_rules_version:{type:'integer',minimum:0},section:{type:'string',enum:['illustrations','portraits','inheritance','treasury','notebooks','catalogues','medical_records','bank_records','gallery','library','documents','archives','publishing','rituals','alchemy','magical_ecology','magical_clinics','magical_science','magic','magical_medicine','investments','psychology','network','news','timeline','map','interests','goals','circles','character','health','wardrobe','relationships','work','education','memories','inventory','finances','contacts','calendar','journal','places','skills','property','letters','tasks','settings']}},required:['world_id','actor'],additionalProperties:false}},
  {name:'save_game_menu_preferences',description:'After explicit owner confirmation atomically save settings or ordered branch priorities. Reject stale menus. No fictional event or choice consumption.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},branch_id:{type:'string',format:'uuid'},expected_head:{type:['string','null'],format:'uuid'},expected_rules_version:{type:'integer',minimum:0},kind:{type:'string',enum:['settings','focus']},settings:{type:'object',properties:{pace:{enum:['slow','normal','dynamic','fast']},detail:{enum:['brief','normal','high','maximum']},agency:{enum:['low','normal','high']},events:{enum:['low','normal','high']},choices:{enum:['frequent','important','free']},visibility:{enum:['immersive','rpg','director']},hud:{type:'boolean'},skip_routine:{type:'boolean'}},required:['pace','detail','agency','events','choices','visibility','hud','skip_routine'],additionalProperties:false},priorities:{type:'array',maxItems:3,items:{type:'string',maxLength:200}}},required:['world_id','branch_id','expected_head','expected_rules_version','kind'],additionalProperties:false}},
  {name:'validate_game_menu_action',description:'Validate explicitly selected gameplay intent, not its outcome, against pinned current world and confirmed player inventory. Use ordinary validate_player_choice and save_scene afterwards. Never call merely for menu navigation.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},branch_id:{type:'string',format:'uuid'},expected_head:{type:['string','null'],format:'uuid'},expected_rules_version:{type:'integer',minimum:0},actor:{type:'string',maxLength:140},action:{type:'string',enum:['open_estate_case','review_estate_case','respond_inheritance','settle_bequest','open_treasury','invite_treasury_member','respond_treasury_invitation','propose_treasury_payment','settle_treasury_payment','remove_document_bookmark','read_document','study_document','bookmark_document','write_document_note','write_document','continue_document','publish_document','share_document','review_document','reply_letter','plan_ritual','invite_ritual_member','respond_ritual_invitation','perform_ritual_stage','study_formula','brew_potion','maintain_enchantment','study_species','visit_habitat','request_clinic','review_clinical_admission','seek_healer_credential','join_laboratory','conduct_lab_research','file_patent','negotiate_patent_license','study_magic','learn_technique','practice_magic','cast_magic','start_magic_research','continue_magic_research','create_artifact','investigate_magic','rest_magic','review_magic_law','seek_magical_healer','request_magical_diagnosis','consider_therapy','respond_magic_course','continue_magic_course','transfer_investment','offer_loan','respond_loan','repay_loan','review_loan','review_investment','buy_investment','sell_investment','issue_instrument','pay_distribution','create_motive','edit_motive','resolve_motive','seek_news','subscribe_news','cancel_subscription','publish_news','record_map_point','set_preference','set_aversion','create_habit','edit_habit','pause_habit','resume_habit','abandon_habit','start_activity','set_life_goal','start_project','edit_project','join_circle','leave_circle','change_appearance','use_item','equip_item','plan_purchase','seek_work','respond_employment','perform_work','manage_business','start_shift','finish_shift','claim_wage','choose_transport','manage_recipe','contact','plan_time','travel','practice','manage_property','set_budget','review_budget','arrange_lease','end_lease','repair_home','reserve_service','cancel_reservation','apply_education','take_assessment','review_reputation','invite_contact','respond_invitation','withdraw_invitation','seek_care','offer_estate','respond_estate_sale','settle_estate_sale','repair_estate','place_furnishing','remove_furnishing','create_household','invite_household','respond_household','leave_household','contribute_household','record_child_milestone','propose_shared_goal','invite_shared_goal','respond_shared_goal','leave_shared_goal','advance_shared_goal','finish_shared_goal','record_household_expense','propose_expense_share','respond_expense_share','pay_expense_share','plan_care','respond_care_plan','finish_care_plan','assign_household_task','respond_household_task','finish_household_task','plan_career_change','finish_career_change','plan_consequence_response','perform_consequence_response','set_job_requirements','adjust_price','issue_ticket','use_ticket','cancel_ticket','prepay_ticket','refund_ticket','attend_lesson','submit_assignment','review_program','request_qualification','propose_supply','respond_supply','settle_supply','dispute_supply','plan_journey','continue_journey','pause_journey','cancel_journey','request_service','complete_service','cancel_service','explore','continue_activity','practice_habit','send_letter','read_letter','remove_item','eat','drink','rest','wash','relax','plan_routine','create_task','edit_task','pause_task','resume_task','abandon_task','save_outfit','apply_outfit','remove_outfit','plan_appointment','change_appointment','cancel_appointment']},letter_body:{type:'string',maxLength:5000},letter_subject:{type:'string',maxLength:200},letter_recipient:{type:'string',maxLength:140},detail:{type:'string',maxLength:1500},loan_id:{type:'string',maxLength:80},case_id:{type:'string',maxLength:60},beneficiary_id:{type:'string',maxLength:60},bequest_id:{type:'string',maxLength:60},treasury_id:{type:'string',maxLength:60},treasury_member_id:{type:'string',maxLength:60},treasury_payment_id:{type:'string',maxLength:60},edition_id:{type:'string',maxLength:60},chapter_id:{type:'string',maxLength:60},ritual_id:{type:'string',maxLength:50},ritual_session_id:{type:'string',maxLength:50},ritual_member_id:{type:'string',maxLength:50},formula_id:{type:'string',maxLength:50},species_id:{type:'string',maxLength:50},habitat_id:{type:'string',maxLength:50},clinic_id:{type:'string',maxLength:50},admission_id:{type:'string',maxLength:50},lab_id:{type:'string',maxLength:50},patent_id:{type:'string',maxLength:50},technique_id:{type:'string',maxLength:70},training_id:{type:'string',maxLength:70},research_id:{type:'string',maxLength:70},diagnosis_id:{type:'string',maxLength:70},course_id:{type:'string',maxLength:70},instrument_id:{type:'string',maxLength:80},lot_id:{type:'string',maxLength:80},motive_id:{type:'string',maxLength:80},channel_id:{type:'string',maxLength:80},subscription_id:{type:'string',maxLength:80},habit_id:{type:'string',maxLength:80},project_id:{type:'string',maxLength:80},circle_id:{type:'string',maxLength:80},item_id:{type:'string',maxLength:140},task_id:{type:'string',maxLength:240},letter_id:{type:'string',maxLength:80},preset_id:{type:'string',maxLength:80},appointment_id:{type:'string',maxLength:80},journey_id:{type:'string',maxLength:80},service_id:{type:'string',maxLength:80},visit_id:{type:'string',maxLength:80},employment_id:{type:'string',maxLength:80},enterprise_id:{type:'string',maxLength:80},shift_id:{type:'string',maxLength:80},transit_id:{type:'string',maxLength:80},lease_id:{type:'string',maxLength:80},reservation_id:{type:'string',maxLength:80},assessment_id:{type:'string',maxLength:80},invitation_id:{type:'string',maxLength:80},estate_id:{type:'string',maxLength:80},sale_id:{type:'string',maxLength:80},ticket_id:{type:'string',maxLength:80},lesson_id:{type:'string',maxLength:80},assignment_id:{type:'string',maxLength:80},furnishing_id:{type:'string',maxLength:80},program_enrollment_id:{type:'string',maxLength:80},contract_id:{type:'string',maxLength:80},household_id:{type:'string',maxLength:80},member_id:{type:'string',maxLength:80},household_task_id:{type:'string',maxLength:80},career_change_id:{type:'string',maxLength:80},response_id:{type:'string',maxLength:80},consequence_id:{type:'string',maxLength:80},expense_id:{type:'string',maxLength:80},share_id:{type:'string',maxLength:80},care_plan_id:{type:'string',maxLength:80},episode_id:{type:'string',maxLength:80},goal_id:{type:'string',maxLength:80},membership_id:{type:'string',maxLength:80},step_id:{type:'string',maxLength:80},child_id:{type:'string',maxLength:80}},required:['world_id','branch_id','expected_head','expected_rules_version','actor','action','detail'],additionalProperties:false}},
  {name:'list_worlds',description:'List the authenticated owner’s worlds.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'get_world_context',description:'Read authoritative world seed, directives, active branch, structured evidence, recent scenes and a focused next-turn proposal in one ancestry read. Reports incomplete history. Supply actors/place/target_time to avoid a separate prepare_story_turn call.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actors:{type:'array',maxItems:8,items:{type:'string',maxLength:140}},place:{type:'string',maxLength:140},target_time:{type:'string',maxLength:16},scope:{type:'string',enum:['all','focus','background']}},required:['world_id']}},
  {name:'search_story_memories',description:'Search the ENTIRE active branch by exact text substring, including scenes older than 1000. Returns scene IDs and evidence excerpts, never other branches.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},query:{type:'string',minLength:2,maxLength:180},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id','query']}},
  {name:'get_story_scene',description:'Retrieve exact original text of a saved scene by ID, annotated whether it belongs to CURRENT active ancestry. Inactive alternatives are NOT canonical facts.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},scene_id:{type:'string',format:'uuid'}},required:['world_id','scene_id']}},
  {name:'get_scene_context',description:'Retrieve a focused sample for the next scene: selected characters, directed relationships, their knowledge, goals, commitments, property, relevant literal source hits and optional derived historical hints. Hints are not canonical facts; unavailable storage is reported. Search terms are clues, not facts. Use before important callbacks in long stories.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actors:{type:'array',maxItems:8,items:{type:'string',minLength:1,maxLength:140}},queries:{type:'array',maxItems:4,items:{type:'string',minLength:2,maxLength:140}}},required:['world_id'],additionalProperties:false}},
  {name:'get_character_state',description:'Read last explicit character field observations with per-field source scenes, calendar-derived age when birth date and story clock are established, directed relationships, known facts, plans and commitments. Does not infer unrecorded traits, consent, emotions or current whereabouts.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',minLength:1,maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},required:['world_id','actor']}},
  {name:'get_actor_memory',description:'Recall a character from the entire played active branch WITHOUT manual annotation: separately return proven structured events and raw literal mentions with exact source scene IDs. Text mentions are clues, not confirmed facts.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',minLength:2,maxLength:140},limit:{type:'integer',minimum:1,maximum:40},event_offset:{type:'integer',minimum:0},mention_offset:{type:'integer',minimum:0}},required:['world_id','actor']}},
  {name:'get_actor_history',description:'Read an individual character’s proven events with source scene IDs in current valid branch. Long histories can be paged; the output does not prove lack of unmarked events.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',minLength:1,maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},required:['world_id','actor']}},
  {name:'get_branch_history',description:'Read exact saved scenes of active branch, newest first, in pages, without other branches.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},required:['world_id']}},
  {name:'get_world_economy',description:'Read recorded balances, bulk stock and unique item custody in the current branch, optionally by actor. Unknown balances and ownership remain unknown. Paginated evidence with scene IDs.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},required:['world_id']}},
  {name:'get_living_world',description:'Read recorded places, access/status, NPC routine windows, last known locations and recorded offscreen events in the active branch. Schedule is not actual presence.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},place:{type:'string',maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id']}},
  {name:'get_memory_review_queue',description:'Page through active canonical scene IDs and annotation counts, pinned to expected_head. Select sources for semantic memory review; no writes and no claim of missing facts. Requires reading exact source before saving derived notes.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},expected_head:{type:['string','null']},offset:{type:'integer',minimum:0,maximum:50000},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id','expected_head']}},
  {name:'get_annotation_passages',description:'Read exact paged passages of a canonical saved scene for narrator-assisted memory extraction. Returns literal source offsets and existing event IDs, NOT extracted facts; no writes.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},scene_id:{type:'string',format:'uuid'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:8}},required:['world_id','scene_id']}},
  {name:'prepare_story_turn',description:'Read a pinned, read-only next-turn plan combining time, character ages, family duties, NPC routines, commitments, projects, conflicts, institutions and places. Candidates are NOT events. Use before a scene/time jump; write and save actual events separately. Includes evidence-backed opportunities from recorded goals and habits, not invented intentions. Scope background reveals independent NPC lines; paginate with returned next_offset, expected_head and expected_rules_version. Historical hints are optional noncanonical notes.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actors:{type:'array',maxItems:8,items:{type:'string',maxLength:140}},place:{type:'string',maxLength:140},target_time:{type:'string',maxLength:16},limit:{type:'integer',minimum:1,maximum:30},offset:{type:'integer',minimum:0,maximum:50000},scope:{type:'string',enum:['all','focus','background']},expected_head:{type:['string','null']},expected_rules_version:{type:'integer',minimum:0}},required:['world_id']}},
  {name:'get_world_dynamics',description:'Read social bonds, family milestones, recurring family duties, institutions, competing claims and developments from active ancestry. Does not simulate or transfer property.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},place:{type:'string',maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id']}},
  {name:'get_character_growth',description:'Read recorded skill development, personal projects, explicit rumor transmission and causal links from active ancestry; rumor transmission does not create belief or truth.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},topic:{type:'string',maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id']}},
  {name:'get_world_consequences',description:'Read ongoing, disputed and resolved consequences by actor or kind, based on active-branch evidence. No inferred guilt or forgiveness.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},kind:{type:'string',enum:['social','institutional','physical','material','access','reputation','other']},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id']}},
  {name:'get_relationship_history',description:'Read independent directed emotional fields and paged relationship changes/shared episodes from the active branch. No automatic trust, friendship, affection or consent.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',minLength:1,maxLength:140},other:{type:'string',maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id','actor']}},
  {name:'get_character_activities',description:'Read durable named habits and recorded shared activity states. Planned activity is not performance.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id']}},
  {name:'get_social_world',description:'Read recorded groups, individual membership, and independent narrative threads from active ancestry. Membership is not loyalty or knowledge.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},group:{type:'string',maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id']}},
  {name:'get_character_knowledge',description:'Read separate recorded beliefs, rumors, suspicions and knowledge for exact actor or topic. Never propagate them between holders.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},topic:{type:'string',maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id']}},
  {name:'save_memory_notes',description:'After reading full canonical historical source, store up to 20 narrator-derived retrieval notes with exact quotes. Requires owner autosave and migration 009. Never modifies or creates canonical scenes.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},scene_id:{type:'string',format:'uuid'},expected_head:{type:'string',format:'uuid'},notes:{type:'array',minItems:1,maxItems:20,items:{type:'object',properties:{key:{type:'string'},kind:{type:'string',enum:['action','claim','intention','belief','relationship','place','other']},summary:{type:'string'},quote:{type:'string'},actors:{type:'array',items:{type:'string'}}},required:['key','kind','summary','quote','actors']}}},required:['world_id','scene_id','expected_head','notes']}},
  {name:'get_memory_notes',description:'Read separate narrator-derived historical retrieval notes from active ancestry, optionally exact actor or scene. Interpretations, NOT canonical events. Requires migration 009.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},scene_id:{type:'string',format:'uuid'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id']}},
  {name:'get_world_agenda',description:'Read fictional time anchors, dated unresolved commitments and NPC intentions from confirmed active-branch scenes; no real-time progression or automatic offscreen actions.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'}},required:['world_id']}},
  {name:'get_npc_agency',description:'Read evidence-backed independent NPC plans and their statuses across all annotated active-branch scenes. A plan is not a completed action and there is no hidden background simulation.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140}},required:['world_id']}},
  {name:'create_world',description:'Create a world from one natural-language premise. No advance NPC forms. Returns new world ID.',inputSchema:{type:'object',properties:{description:{type:'string',minLength:8,maxLength:12000},title:{type:'string'},start_marker:{type:'string'}},required:['description']}},
  {name:'add_world_directive',description:'Save the owner’s plain-language world rule verbatim. Never rewrite it to sound more conciliatory.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},text:{type:'string'}},required:['world_id','text']}},
  {name:'validate_player_choice',description:'Read-only verification of a user-selected option or free action against the current saved player choice, branch, head and rules version. Call only after real user input. Does not save or perform an action.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},branch_id:{type:'string',format:'uuid'},expected_head:{type:'string',format:'uuid'},expected_rules_version:{type:'integer',minimum:0},choice_id:{type:'string',maxLength:80},selected_option:{type:'string',maxLength:80},action_text:{type:'string',maxLength:5000}},required:['world_id','branch_id','expected_head','expected_rules_version','choice_id','selected_option']}},
  {name:'review_scene_draft',description:'Read-only review of a proposed scene against pinned branch, rules, literal evidence and state transitions. Returns corrections and preview of changed records. Never saves.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},branch_id:{type:'string',format:'uuid'},expected_head:{type:['string','null']},expected_rules_version:{type:'integer',minimum:0},body:{type:'string'},events:{type:'array',items:{type:'object'}},world_time:{type:['string','null']}},required:['world_id','branch_id','expected_head','expected_rules_version','body']}},
  {name:'save_scene',description:'Atomically save an already narrated scene on the currently selected branch using expected_head and request_id; requires owner opt-in auto_save. Narrator extracts significant changes from the scene, including NPC and world events, with literal evidence. Never save unplayed proposals.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},branch_id:{type:'string',format:'uuid'},expected_head:{type:['string','null']},expected_rules_version:{type:'integer',minimum:0},request_id:{type:'string',format:'uuid'},body:{type:'string'},world_time:{type:['string','null']},events:{type:'array',items:{type:'object'}}},required:['world_id','branch_id','expected_head','expected_rules_version','request_id','body']}},
  {name:'fork_before_scene',description:'Create a new active alternative branch before the given scene; does not delete older history.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},scene_id:{type:'string',format:'uuid'},name:{type:'string'}},required:['world_id','scene_id']}},
  {name:'get_scene_receipt',description:'Check whether a request_id has already saved a scene, especially after a lost network response; never retry with a NEW id blindly.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},request_id:{type:'string',format:'uuid'}},required:['world_id','request_id']}},
  {name:'revise_scene',description:'Atomically replace a scene in a new branch, retaining an EXACT text prefix and its evidence-backed events. Do not re-use old ending. Old branch is preserved.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},source_scene_id:{type:'string',format:'uuid'},prefix:{type:'string'},continuation:{type:'string'},events:{type:'array',items:{type:'object'}},request_id:{type:'string',format:'uuid'},world_time:{type:['string','null']},expected_rules_version:{type:'integer',minimum:0}},required:['world_id','source_scene_id','prefix','continuation','request_id','expected_rules_version']}},
  {name:'edit_world_directive',description:'Edit an owner-authored natural-language rule in place with persistent before/after audit log and rules-version check.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},directive_id:{type:'string',format:'uuid'},text:{type:'string'},expected_rules_version:{type:'integer'}},required:['world_id','directive_id','text','expected_rules_version']}},
  {name:'toggle_world_directive',description:'Disable or enable an existing world rule with an audit log; old scenes remain unchanged.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},directive_id:{type:'string',format:'uuid'},active:{type:'boolean'},expected_rules_version:{type:'integer'}},required:['world_id','directive_id','active','expected_rules_version']}},
  {name:'switch_branch',description:'Switch active branch to an existing owner branch without copying invalid scenes.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},branch_id:{type:'string',format:'uuid'}},required:['world_id','branch_id']}}
].map(t=>({...t,securitySchemes:[{type:'oauth2',scopes:['openid','email','offline_access']}],_meta:{securitySchemes:[{type:'oauth2',scopes:['openid','email','offline_access']}]}}));

function result(value){if(value?.[VISUAL_IMAGE_RESULT])return {resultType:'complete',content:[{type:'text',text:JSON.stringify(value.metadata,null,2)},value.image],structuredContent:value.metadata,isError:false};return {resultType:'complete',content:[{type:'text',text:JSON.stringify(value,null,2)}],structuredContent:value,isError:false};}
function fail(message){return {resultType:'complete',content:[{type:'text',text:message}],isError:true};}
const error=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const done=(id,result)=>({jsonrpc:'2.0',id,result});
function mcpResource(env) {
 const url=new URL(env.MCP_PUBLIC_URL);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/mcp')
  throw Error('MCP_PUBLIC_URL must be a public https://.../mcp endpoint');
 return url.toString();
}
function authServer(env){const u=new URL(env.SUPABASE_URL);if(u.protocol!=='https:')throw Error('Invalid Supabase URL');return u.origin+'/auth/v1';}
function resourceMetadata(env){return {resource:mcpResource(env),authorization_servers:[authServer(env)],scopes_supported:['openid','email','offline_access']};}
function challenge(env){return `Bearer resource_metadata="${new URL(mcpResource(env)).origin}/.well-known/oauth-protected-resource", scope="openid email offline_access", error="invalid_token"`;}
function jwtClaims(token) {
 try {
  if(typeof token!=='string'||token.length>16000)throw Error();
  const parts=token.split('.');if(parts.length!==3)throw Error();
  const base64url=s=>atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='));
  const header=JSON.parse(base64url(parts[0]));
  if(!['RS256','ES256','HS256'].includes(header.alg))throw Error();
  return JSON.parse(base64url(parts[1]));
 }catch{throw Error('Invalid OAuth JWT');}
}
async function verifyOAuthUser(env,token){
 const claims=jwtClaims(token);const now=Math.floor(Date.now()/1000);
 if(!env.SUPABASE_OAUTH_CLIENT_ID||claims.client_id!==env.SUPABASE_OAUTH_CLIENT_ID ||
    claims.iss!==authServer(env)||claims.role!=='authenticated'||
    !Number.isInteger(claims.exp)||claims.exp<=now||!claims.sub)throw Error('OAuth issuer or client mismatch');
 const aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
 if(!aud.includes('authenticated')&&!aud.includes(mcpResource(env)))throw Error('Invalid OAuth audience');
 // Never rely on decoded JWT alone: Supabase Auth checks signature/session validity.
 const user=await supabase(env,token,'/auth/v1/user');
 if(user?.id!==claims.sub)throw Error('Invalid Supabase session owner');
 return user;
}
const isUuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
function assertUuid(x){if(!isUuid(x))throw Error('Invalid UUID');return x;}

async function supabase(env,token,path,options={}) {
 const base=new URL(env.SUPABASE_URL);
 if(base.protocol!=='https:')throw Error('SUPABASE_URL must use HTTPS');
 const key=env.SUPABASE_ANON_KEY;
 if(!key)throw Error('Missing SUPABASE_ANON_KEY');
 const response=await fetch(new URL(path,base).toString(),{
   method:options.method||'GET',
   headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json',...(options.headers||{})},
   body:options.body===undefined?undefined:JSON.stringify(options.body),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000)
 });
 const data=await response.text();let parsed;
 try{parsed=data?JSON.parse(data):null;}catch{parsed=data;}
 if(!response.ok)throw Error(parsed?.message||parsed?.error_description||parsed?.error||`Supabase HTTP ${response.status}`);
 return parsed;
}
const ep=encodeURIComponent;
const rest=(env,token,path)=>supabase(env,token,`/rest/v1/${path}`);
const rpc=(env,token,name,args)=>supabase(env,token,`/rest/v1/rpc/${name}`,{method:'POST',body:args});
async function ownerWorld(env,token,id){const rows=await rest(env,token,`nw_worlds?select=*&id=eq.${ep(assertUuid(id))}&limit=1`);if(!rows?.[0])throw Error('World not found');return rows[0];}
async function directives(env,token,id){return rest(env,token,`nw_directives?select=*&world_id=eq.${ep(id)}&order=created_at.asc`);}
async function branch(env,token,world){const rows=await rest(env,token,`nw_branches?select=*&id=eq.${ep(world.active_branch_id)}&world_id=eq.${ep(world.id)}&limit=1`);if(!rows?.[0])throw Error('Active branch not found');return rows[0];}
async function readHistory(env,token,id,limit=100,offset=0){return rpc(env,token,'nw_active_history',{p_world_id:id,p_limit:Math.min(200,limit),p_offset:offset});}
/** Stream ONLY committed structured events from all active ancestors, with a pinned head.
 * Full source text remains available through get_branch_history/get_story_scene/search.
 * Never present a capped projection as complete; a write during pagination aborts the read.
 */
const ancestryCache=createAncestryCache(),projectionCache=createProjectionCache();
async function readStructuredMemory(env,token,world,head,{maxScenes=50000}={}) {
 // ownerWorld has already authenticated this caller through RLS. Scope by
 // database, owner, world, branch and exact immutable head, never by world alone.
 const scope=world.owner_id?JSON.stringify([env.SUPABASE_URL,world.owner_id]):null;
 let result=ancestryCache.get(scope,world.id,world.active_branch_id,head,maxScenes);
 const cached=!!result;
 if(!result){
  const reader=createAncestryReader(head,{maxScenes});
  const prior=ancestryCache.recent(scope,world.id,world.active_branch_id,maxScenes);
  for(let page=reader.next();page;page=reader.next()){
   reader.accept(await rpc(env,token,'nw_active_memory_page',{p_world_id:world.id,p_expected_head:head,p_limit:page.limit,p_offset:page.offset}));
   if(prior&&reader.reusePrefix(prior.scenes))break;
  }
  result=reader.result();
 }
 if(head!=null){
  const current=await ownerWorld(env,token,world.id);
  if(current.active_branch_id!==world.active_branch_id)throw Error('Active branch changed during memory read');
  const currentBranch=await branch(env,token,current);
  if(currentBranch.head_scene_id!==head)throw Error('History changed during memory read; retry');
 }
 if(!cached)ancestryCache.put(scope,world.id,world.active_branch_id,head,maxScenes,result);
 // Only use a durable checkpoint after verified complete ancestry. The
 // Edge Function independently authenticates and derives the state.
 const attemptDurable=!!scope&&result.complete&&result.scenes.length>=MIN_SNAPSHOT_SCENES&&!projectionCache.hasReusable(scope,world.id,world.active_branch_id,result);
 const durable=attemptDurable?await loadDurableCheckpoint({url:env.SUPABASE_URL,anonKey:env.SUPABASE_ANON_KEY,token,world:world.id,branch:world.active_branch_id,head,history:result}):null;
 if(attemptDurable){const current=await ownerWorld(env,token,world.id),b=await branch(env,token,current);if(current.active_branch_id!==world.active_branch_id||b.head_scene_id!==head)throw Error('History changed during snapshot read; retry');}
 let projected;
 const load=()=>projected??=projectionCache.project(scope,world.id,world.active_branch_id,result,durable);
 return {...result,get projection(){return load().projection;},get checkpoint(){return load().checkpoint;},get projection_cache(){const p=load();return {source:p.cache_source,reused_scenes:p.reused_scenes,replayed_scenes:p.replayed_scenes};}};
}
/** Optional historical hints. Failure is visible, does not break canonical reads.
 * All queries remain scoped to the pinned owner branch. Never turn notes into knowledge. */
async function readFocusedNotes(env,token,world,head,actors){
 if(head===null)return focusedMemoryNotes([]);
 const selected=[...new Set(actors)].slice(0,8);
 const groups=await Promise.all(selected.map(async actor=>{
  try{
   const rows=await rpc(env,token,'nw_read_memory_notes',{p_world_id:world.id,p_expected_head:head,p_actor:actor,p_scene_id:null,p_limit:5,p_offset:0});
   if(!Array.isArray(rows))throw Error('Invalid note response');
   // Exact holder is also checked by the DB; reject mismatched response rather than leaking it.
   if(rows.some(r=>!r?.scene_id||!r.note_key||!Array.isArray(r.note?.actors)||!r.note.actors.includes(actor)))throw Error('Invalid note actor');
   return {actor,status:'available',rows,more:rows.length===5};
  }catch{return {actor,status:'unavailable',rows:[]};}
 }));
 return focusedMemoryNotes(groups);
}
async function visualStorageFetch(env,token,a,{method='GET',bytes,mime}={}){
 const base=new URL(env.SUPABASE_URL);if(base.protocol!=='https:')throw Error('Invalid storage configuration');
 const path='/storage/v1/object/'+(method==='GET'?'authenticated/':'')+'nw-world-visuals/'+privateImagePath(a);
 const res=await fetch(new URL(path,base),{method,headers:{apikey:env.SUPABASE_ANON_KEY,authorization:'Bearer '+token,...(method==='POST'?{'content-type':mime,'cache-control':'no-cache, no-store, max-age=0','x-upsert':'false'}:{})},body:bytes,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(25000)});
 if(method==='GET')return limitedBytes(res);
 if(!res.ok){await res.body?.cancel();throw Error('Private image upload failed');}await res.body?.cancel();
}
const VISUAL_IMAGE_RESULT=Symbol('visual image');
const VISUAL_APP='https://living-world-next.pages.dev/';
const visualLink=a=>({...a,app_url:VISUAL_APP+visualUploadHash(a.world_id,a.id)});
async function visualRows(env,token,w,limit=40,offset=0){return await rpc(env,token,'nw_list_visual_assets',{p_world_id:w.id,p_limit:limit,p_offset:offset})||[];}
async function visualPrefs(env,token,w){return visualPreferences((await rest(env,token,'nw_visual_preferences?world_id=eq.'+ep(w.id)+'&select=frequency,style'))?.[0]);}
async function findVisual(env,token,w,match){
 for(let off=0;off<10000;off+=100){const rows=await visualRows(env,token,w,100,off);const a=rows.find(match);if(a)return a;if(rows.length<100)break;}
 return null;
}
async function subjectVisuals(env,token,w,subject){
 const found=[];
 for(let off=0;off<10000&&found.length<8;off+=100){const rows=await visualRows(env,token,w,100,off);found.push(...visualReferences(rows,subject));if(rows.length<100)break;}
 return found.slice(0,8);
}
async function compactVisualContext(env,token,w){
 try{const [rows,prefs]=await Promise.all([visualRows(env,token,w,12),visualPrefs(env,token,w)]);return {available:true,preferences:prefs,recent:rows.map(a=>({id:a.id,subject_kind:a.subject_kind,subject_id:a.subject_id,title:a.title,kind:a.kind,status:a.status,app_url:VISUAL_APP+visualUploadHash(w.id,a.id)}))};}
 catch{return {available:false,reason:'Visual library storage not yet available'};}
}
async function callTool(name,args,env,token){
 switch(name){
  case 'save_chatgpt_illustration':
  case 'read_world_illustration_image':{
   const w=await ownerWorld(env,token,args.world_id),active=await branch(env,token,w);
   const a=await findVisual(env,token,w,x=>x.id===assertUuid(args.asset_id));if(!a)throw Error('Illustration not visible in current branch');
   if(name==='read_world_illustration_image'){
    if(a.status!=='ready')throw Error('Image not saved yet');
    const bytes=await visualStorageFetch(env,token,a),mime=imageMime(bytes);
    const now=await ownerWorld(env,token,w.id),after=await branch(env,token,now);
    if(now.active_branch_id!==w.active_branch_id||after.head_scene_id!==active.head_scene_id)throw Error('Branch changed; refresh illustration');
    return {[VISUAL_IMAGE_RESULT]:true,metadata:visualLink(a),image:{type:'image',data:base64Image(bytes),mimeType:mime}};
   }
   const saved=await transferNativeImage({asset:a,file:args.image,download:fetchNativeImage,read:x=>visualStorageFetch(env,token,x),upload:async(x,bytes,mime)=>{
    const now=await ownerWorld(env,token,w.id),after=await branch(env,token,now);
    if(now.active_branch_id!==w.active_branch_id||after.head_scene_id!==active.head_scene_id)throw Error('Branch changed; refresh illustration');
    return visualStorageFetch(env,token,x,{method:'POST',bytes,mime});
   },finish:async id=>{const v=await rpc(env,token,'nw_finish_visual',{p_asset_id:id});return Array.isArray(v)?v[0]:v;}});
   return {saved:true,reused:saved.reused,...visualLink(saved.asset),native_transfer:true};
  }
  case 'list_world_illustrations':
  case 'get_visual_profile':
  case 'get_world_illustration':
  case 'attach_world_illustration':
  case 'request_world_illustration':{
   const w=await ownerWorld(env,token,args.world_id),active=await branch(env,token,w);
   if(name==='list_world_illustrations'){const limit=Math.min(100,Math.max(1,args.limit??40)),offset=Math.max(0,args.offset??0),rows=await visualRows(env,token,w,limit,offset);return {preferences:await visualPrefs(env,token,w),records:rows.map(visualLink),next_offset:rows.length===limit?offset+limit:null};}
   if(name==='get_visual_profile'){const rows=await subjectVisuals(env,token,w,args);return {subject_kind:args.subject_kind,subject_id:args.subject_id,identity_notes:rows[0]?.identity_notes??null,reference_images:rows.map(visualLink)};}
   if(name==='get_world_illustration'||name==='attach_world_illustration'){
    const a=await findVisual(env,token,w,x=>x.id===args.asset_id);if(!a)throw Error('Illustration not visible in this branch');
    if(name==='get_world_illustration')return visualLink(a);
    const result=await rpc(env,token,'nw_finish_visual',{p_asset_id:a.id});return visualLink(Array.isArray(result)?result[0]:result);
   }
   if(args.expected_head!==active.head_scene_id||args.expected_rules_version!==w.directive_version)throw Error('Stale illustration request');
   const history=await readStructuredMemory(env,token,w,active.head_scene_id);
   if(!history.complete)throw Error('Complete history required for confirmed visual subject');
   const choice=playerChoiceView(history.scenes,history.projection,{worldId:w.id,branchId:w.active_branch_id,rulesVersion:w.directive_version,complete:history.complete});
   if(choice.pending?choice.pending.actor!==args.actor:!recordedPlayerActors(history.projection).includes(args.actor))throw Error('Select confirmed player actor');
   const overview=playerMenuOverview(history.projection,args.actor,null,{scenes:history.scenes,complete:true,limit:100});
   const subject=visualSubjects(overview,active.head_scene_id).find(s=>s.subject_kind===args.subject_kind&&s.subject_id===args.subject_id);if(!subject)throw Error('Subject not in confirmed player overview');
   if(typeof args.description!=='string'||!args.description.trim())throw Error('Describe requested image');
   const refs=await subjectVisuals(env,token,w,subject),prefs=await visualPrefs(env,token,w),identity=args.identity_notes??refs[0]?.identity_notes??subject.detail;
   const v=visualRequest({...subject,kind:args.kind,identity_notes:identity,prompt:visualPrompt({...subject,detail:identity},args.description,refs,prefs),reference_asset_ids:refs.map(a=>a.id)});
   const current=await ownerWorld(env,token,w.id);if(current.directive_version!==w.directive_version)throw Error('Rules changed; refresh visual request');
   const result=await rpc(env,token,'nw_prepare_visual',{p_world_id:w.id,p_branch_id:w.active_branch_id,p_expected_head:active.head_scene_id,p_subject_kind:v.subject_kind,p_subject_id:v.subject_id,p_kind:v.kind,p_title:v.title,p_prompt:v.prompt,p_identity_notes:v.identity_notes,p_references:v.reference_asset_ids});
   const a=Array.isArray(result)?result[0]:result;
   return {...visualLink(a),reference_images:refs.map(visualLink),generation_required:true,policy:'Generate using ChatGPT Images. Save the actual generated/selected Library file via save_chatgpt_illustration. If host does not supply authorized file, ask user to select it from Library or use app link. Do not claim ready until confirmed.'};
  }
  case 'list_worlds':return await rest(env,token,'nw_worlds?select=id,title,seed,start_marker,active_branch_id,auto_save,updated_at&order=updated_at.desc');
  case 'get_document_authoring':
  case 'get_world_document':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   if(args.expected_head!==active.head_scene_id||args.expected_rules_version!==world.directive_version)throw Error('Stale reader: refresh the current menu');
   const history=await readStructuredMemory(env,token,world,active.head_scene_id);
   const choice=playerChoiceView(history.scenes,history.projection,{worldId:world.id,branchId:world.active_branch_id,rulesVersion:world.directive_version,complete:history.complete});
   const players=recordedPlayerActors(history.projection);
   if(choice.pending?choice.pending.actor!==args.actor:!players.includes(args.actor))throw Error('Reader must be current player-controlled actor');
   if(!history.complete)throw Error('Complete history required');
   const docs=documentIndex(history.scenes,history.projection,{complete:history.complete});
   let chapter;
   if(name==='get_document_authoring'&&args.letter_id){
    if(args.edition_id||args.chapter_id)throw Error('Select either letter or chapter');
    const l=(history.projection.worldFacts||[]).find(e=>e.player_life_version===1&&e.life_kind==='letter'&&e.record_id===args.letter_id&&(e.sender===args.actor||e.recipient===args.actor&&['delivered','read'].includes(e.status)));
    if(!l)throw Error('Letter unavailable');
    chapter={letter_id:l.record_id,from:l.sender,to:l.recipient,subject:l.subject,message:l.message,policy:'Narrator only; actual first reading requires player choice.'};
   }else{
    if(!args.edition_id||!args.chapter_id)throw Error('Select edition and chapter');
    chapter=name==='get_document_authoring'?docs.authoring(args.actor,args.edition_id,args.chapter_id):docs.read(args.actor,args.edition_id,args.chapter_id);
   }
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id||current.directive_version!==world.directive_version)throw Error('Reader changed during read; refresh');
   return {world_id:world.id,branch_id:world.active_branch_id,expected_head:active.head_scene_id,expected_rules_version:world.directive_version,...chapter};
  }
  case 'plan_game_time':
  case 'get_game_menu':
  case 'validate_game_menu_action':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   if(name==='validate_game_menu_action')assertMenuAnchor(args,world,active);
   if(name==='get_game_menu'&&args.offset>0&&(!Object.hasOwn(args,'expected_head')||args.expected_head!==active.head_scene_id||args.expected_rules_version!==world.directive_version))throw Error('Pagination requires current pinned head and rules version');
   const [rules,history]=await Promise.all([directives(env,token,world.id),readStructuredMemory(env,token,world,active.head_scene_id)]);
   const projection=history.projection;
   const clock=recordedWorldAgenda(history.scenes,projection);
   const choice=playerChoiceView(history.scenes,projection,{worldId:world.id,branchId:world.active_branch_id,rulesVersion:world.directive_version,complete:history.complete});
   if(choice.pending&&choice.pending.actor!==args.actor)throw Error('Actor does not match the current player choice');
   const overview=playerMenuOverview(projection,args.actor,clock.anchor_is_latest_scene?clock.latest_recorded_time:null,{scenes:history.scenes,complete:history.complete,offset:args.offset??0,limit:name==='validate_game_menu_action'?50000:args.limit??24});
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id||current.directive_version!==world.directive_version)throw Error('Menu changed during read; refresh.');
   const anchor={world_id:world.id,branch_id:world.active_branch_id,expected_head:active.head_scene_id,expected_rules_version:world.directive_version};
   if(name==='plan_game_time')return {...anchor,...planTimeAdvance(history.scenes,projection,args.actor,args.target_time,{pending:choice.status==='awaiting_player',complete:history.complete&&choice.status!=='inconsistent',pace:menuPreferences(rules,world.active_branch_id).settings.pace})};
   if(name==='validate_game_menu_action'){
    if(!history.complete)throw Error('Incomplete history; use source-backed free story action.');
    return {...anchor,...menuActionIntent(args,overview),pending_choice:choice.pending??null};
   }
   if(['illustrations','portraits','gallery'].includes(args.section)||!args.section)overview.visuals={...overview.visuals,...await compactVisualContext(env,token,world)};
   return {...gameMenuContext({world,directives:rules,context:{head_scene_id:active.head_scene_id,memory_complete:history.complete,player_choice:choice,recorded_agenda:clock}}),...(args.section?{...menuSection(overview,args.section),dashboard:overview.dashboard}:{overview}),choice,auto_save:current.auto_save};
  }
  case 'save_game_menu_preferences':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   assertMenuAnchor(args,world,active);
   const rules=await directives(env,token,world.id);
   if(!menuPreferences(rules,world.active_branch_id).can_edit)throw Error('Conflicting menu records; resolve before saving.');
   const record=menuRecordFromInput(args,world.active_branch_id);
   return await rpc(env,token,'nw_save_menu_preferences',{p_world_id:world.id,p_branch_id:args.branch_id,p_expected_head:args.expected_head,p_expected_version:args.expected_rules_version,p_record:record});
  }
  case 'get_world_context':{
   const world=await ownerWorld(env,token,args.world_id);
   const [rules,active]=await Promise.all([directives(env,token,world.id),branch(env,token,world)]);
   const [history,lastScenes]=await Promise.all([
    readStructuredMemory(env,token,world,active.head_scene_id),
    readHistory(env,token,world.id,3,0)
   ]);
   if((lastScenes[0]?.id??null)!==active.head_scene_id)throw Error('Scene head changed while reading recent history; retry');
   const ctx=buildNextContext({world,directives:rules,scenes:history.scenes,evidencePrevalidated:true,historyComplete:history.complete,trustedProjection:history.projection,turnOptions:{actors:args.actors,place:args.place,target_time:args.target_time,scope:args.scope}});
   const historicalHints=await readFocusedNotes(env,token,world,active.head_scene_id,ctx.next_turn.actor_context.map(x=>x.actor));
   const finalWorld=await ownerWorld(env,token,world.id),finalBranch=await branch(env,token,finalWorld);
   if(finalWorld.active_branch_id!==world.active_branch_id||finalBranch.head_scene_id!==active.head_scene_id||finalWorld.directive_version!==world.directive_version)throw Error('Story or rules changed while preparing world context; retry.');
   const compactMemory=limitedNarratorMemory(ctx.memory,{maxChars:18000,maxEntriesPerCategory:12});
   const controlledActors=recordedPlayerActors(ctx.memory);
   const playerActor=ctx.player_choice?.pending?.actor??(controlledActors.length===1?controlledActors[0]:null);
   const menu=gameMenuContext({world,directives:rules,context:ctx});
   if(playerActor)menu.overview=playerMenuOverview(ctx.memory,playerActor,ctx.recorded_agenda?.anchor_is_latest_scene?ctx.recorded_agenda.latest_recorded_time:null,{scenes:history.scenes,complete:history.complete});
   if(menu.overview)menu.overview.visuals={...menu.overview.visuals,...await compactVisualContext(env,token,world)};
   return {...ctx,magic_worldbuilding:magicalAuthorSeeds(world,history.scenes),game_menu:menu,next_turn:{...ctx.next_turn,world_id:world.id,branch_id:world.active_branch_id,expected_head:active.head_scene_id,expected_rules_version:world.directive_version,auto_save:finalWorld.auto_save,historical_hints:historicalHints},memory:compactMemory,memory_is_sample:true,
    memory_retrieval_tools:['read_world_illustration_image','list_world_illustrations','get_visual_profile','get_world_illustration','get_document_authoring','get_world_document','get_game_menu','get_scene_context','get_character_state','get_actor_memory','get_actor_history','get_branch_history','search_story_memories','get_story_scene','get_world_agenda','get_world_economy','get_living_world','get_memory_review_queue','get_annotation_passages','get_social_world','get_character_knowledge','get_memory_notes','get_relationship_history','get_character_activities','get_world_consequences','get_character_growth','get_world_dynamics','prepare_story_turn','validate_player_choice'],
    narrator_workflow:narratorWorkflow,head_scene_id:active.head_scene_id,directive_version:world.directive_version,auto_save:finalWorld.auto_save,relationship_locks:extractLocks(rules),history_complete:history.complete,projection_cache:history.projection_cache,
    recent_scenes:lastScenes.slice().reverse().map(s=>boundedMcpScene(s)),
    narration_guidance:promptForNarrator({world,directives:rules,history:lastScenes.slice().reverse().slice(-2),projection:ctx.memory,timeContext:ctx.recorded_agenda}),
    warning:history.complete?ctx.memory_warning:'Structured memory reached the 50,000-scene safety cap; partial data cannot justify facts about earlier history.'};
  }
  case 'search_story_memories':{
   await ownerWorld(env,token,args.world_id);
   const query=String(args.query??'').trim();
   if(query.length<2||query.length>180)throw Error('Query must be 2-180 characters');
   const rows=await rpc(env,token,'nw_search_history',{p_world_id:args.world_id,p_query:query,p_limit:Math.max(1,Math.min(40,Number(args.limit)||25)),p_offset:Math.max(0,Math.floor(Number(args.offset)||0))});
   return {match_type:'literal_substring',world_id:args.world_id,active_branch_only:true,results:rows,more_may_exist:rows.length===Math.max(1,Math.min(40,Number(args.limit)||25))};
  }
  case 'get_story_scene':{
   await ownerWorld(env,token,args.world_id);
   const rows=await rest(env,token,`nw_scenes?select=id,world_id,branch_id,parent_scene_id,body,world_time,events,created_at&world_id=eq.${ep(args.world_id)}&id=eq.${ep(assertUuid(args.scene_id))}&limit=1`);
   if(!rows?.[0])throw Error('Scene not found');
   const active=await rpc(env,token,'nw_scene_in_active_branch',{p_world_id:args.world_id,p_scene_id:args.scene_id});
   return {...rows[0],read_url:sceneReaderUrl(args.world_id,args.scene_id),in_active_branch:active===true,
    memory_policy:active===true?'Confirmed scene in current ancestry':'An alternate/discarded branch: not evidence for CURRENT story'};
  }
  case 'get_scene_context':{
   const focus=sceneFocusInput(args);
   const world=await ownerWorld(env,token,args.world_id);
   const active=await branch(env,token,world);
   const [memory,hits,notes]=await Promise.all([
    readStructuredMemory(env,token,world,active.head_scene_id),
    Promise.all(focus.queries.map(query=>rpc(env,token,'nw_search_history',{p_world_id:world.id,p_query:query,p_limit:8,p_offset:0}))),
    readFocusedNotes(env,token,world,active.head_scene_id,focus.actors)
   ]);
   const projection=memory.projection;
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)
    throw Error('Story changed while building focused scene context; retry.');
   return {world_id:world.id,active_branch_id:world.active_branch_id,head_scene_id:active.head_scene_id,
    ...focusedSceneContext(projection,focus,{complete:memory.complete,maxChars:18000,worldTime:memory.scenes.at(-1)?.world_time,scenes:memory.scenes}),
    historical_hints:notes,literal_hits:focus.queries.map((query,i)=>literalFocusHits(query,hits[i]))};
  }
  case 'get_character_state':{
   const actor=String(args.actor??'').trim();
   if(!actor||actor.length>140)throw Error('Invalid character name');
   const world=await ownerWorld(env,token,args.world_id);
   const active=await branch(env,token,world);
   const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
   const projection=memory.projection;
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)
    throw Error('Story changed while reading character state; retry.');
   return {world_id:world.id,active_branch_id:world.active_branch_id,head_scene_id:active.head_scene_id,
    ...characterStateView(projection,actor,{complete:memory.complete,offset:args.offset,limit:args.limit,worldTime:memory.scenes.at(-1)?.world_time,scenes:memory.scenes})};
  }
  case 'get_actor_memory':{
   const world=await ownerWorld(env,token,args.world_id);
   const before=await branch(env,token,world);
   const actor=String(args.actor??'').trim();
   if(actor.length<2||actor.length>140)throw Error('Actor name must be 2-140 characters');
   const limit=Math.max(1,Math.min(40,Math.floor(Number(args.limit)||20)));
   const eventOffset=Math.max(0,Math.floor(Number(args.event_offset)||0));
   const mentionOffset=Math.max(0,Math.floor(Number(args.mention_offset)||0));
   const [confirmed,mentions]=await Promise.all([
    rpc(env,token,'nw_actor_history',{p_world_id:world.id,p_actor:actor,p_limit:limit,p_offset:eventOffset}),
    rpc(env,token,'nw_search_history',{p_world_id:world.id,p_query:actor,p_limit:limit,p_offset:mentionOffset})
   ]);
   const afterWorld=await ownerWorld(env,token,world.id);
   const after=await branch(env,token,afterWorld);
   if(afterWorld.active_branch_id!==world.active_branch_id||after.head_scene_id!==before.head_scene_id)
    throw Error('Active branch changed while collecting actor memory; retry');
   return {...actorMemoryEvidence({actor,confirmedEvents:confirmed,textMentions:mentions,headSceneId:before.head_scene_id}),
    next_event_offset:eventOffset+confirmed.length,next_mention_offset:mentionOffset+mentions.length,
    more_confirmed_may_exist:confirmed.length===limit,more_mentions_may_exist:mentions.length===limit,
    matches_are_literal:true,active_branch_only:true};
  }
  case 'get_actor_history':{
   await ownerWorld(env,token,args.world_id);
   const actor=String(args.actor??'').trim();
   if(actor.length<1||actor.length>140)throw Error('Invalid character name');
   const limit=Math.max(1,Math.min(100,Number(args.limit)||40));
   const rows=await rpc(env,token,'nw_actor_history',{p_world_id:args.world_id,p_actor:actor,p_limit:limit,p_offset:Math.max(0,Math.floor(Number(args.offset)||0))});
   return {actor,events:rows,more_may_exist:rows.length===limit,source:'confirmed structured events in active ancestry',unannotated_scenes:'not indexed: use search_story_memories or get_branch_history'};
  }
  case 'get_world_economy':{
   const world=await ownerWorld(env,token,args.world_id);
   const active=await branch(env,token,world);
   const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
   const projection=memory.projection;
   const current=await ownerWorld(env,token,world.id);
   const after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)
    throw Error('Story changed during economy read; retry.');
   return {world_id:world.id,active_branch_id:world.active_branch_id,head_scene_id:active.head_scene_id,
    ...economyView(projection,{actor:args.actor,offset:args.offset,limit:args.limit,complete:memory.complete})};
  }
  case 'get_living_world':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
   const projection=memory.projection;
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)
    throw Error('Story changed while reading living world; retry.');
   return {world_id:world.id,active_branch_id:world.active_branch_id,head_scene_id:active.head_scene_id,
    ...livingWorldView(memory.scenes,projection,{actor:args.actor,place:args.place,offset:args.offset,limit:args.limit,complete:memory.complete})};
  }
  case 'get_memory_review_queue':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   if(args.expected_head!==null)assertUuid(args.expected_head);
   if(active.head_scene_id!==args.expected_head)throw Error('Story changed; restart memory review.');
   const offset=args.offset??0,limit=args.limit??20;
   if(!Number.isInteger(offset)||offset<0||offset>50000||!Number.isInteger(limit)||limit<1||limit>40)throw Error('Invalid review page');
   const overlap=Number(offset>0);
   const rows=await rpc(env,token,'nw_active_memory_page',{p_world_id:world.id,p_expected_head:active.head_scene_id,p_offset:offset-overlap,p_limit:limit+1+overlap});
   const page=memoryReviewPage(rows,{head:active.head_scene_id,offset,limit});
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)throw Error('Story changed during memory review; retry.');
   return {world_id:world.id,head_scene_id:active.head_scene_id,auto_save:current.auto_save,...page};
  }
  case 'get_annotation_passages':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   const sceneId=assertUuid(args.scene_id);
   const inBranch=await rpc(env,token,'nw_scene_in_active_branch',{p_world_id:world.id,p_scene_id:sceneId});
   if(inBranch!==true)throw Error('Only current canonical scenes may be reviewed for memory.');
   const rows=await rest(env,token,`nw_scenes?select=id,parent_scene_id,body,events,world_time&world_id=eq.${ep(world.id)}&id=eq.${ep(sceneId)}&limit=1`);
   if(!rows?.[0])throw Error('Scene not found');
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)
    throw Error('Story changed while reading source passages; retry.');
   return {world_id:world.id,head_scene_id:active.head_scene_id,...annotationPassages(rows[0],{offset:args.offset,limit:args.limit})};
  }
  case 'prepare_story_turn':
  case 'get_world_dynamics':
  case 'get_character_growth':
  case 'get_world_consequences':
  case 'get_relationship_history':
  case 'get_character_activities':
  case 'get_social_world':
  case 'get_character_knowledge':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
   const p=memory.projection;
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)throw Error('Story changed; retry.');
   const options={...args,complete:memory.complete};
   if(name==='prepare_story_turn'){
    if(args.offset>0&&(!Object.hasOwn(args,'expected_head')||!Object.hasOwn(args,'expected_rules_version')))throw Error('Pagination requires pinned head and rules version');
    if(Object.hasOwn(args,'expected_head')&&args.expected_head!==active.head_scene_id)throw Error('Story changed; restart candidate pagination.');
    if(Object.hasOwn(args,'expected_rules_version')&&args.expected_rules_version!==world.directive_version)throw Error('Rules changed; restart candidate pagination.');
    const rules=await directives(env,token,world.id);
    const turn=prepareStoryTurn(memory.scenes,p,rules,{...options,branchId:world.active_branch_id});
    const hints=await readFocusedNotes(env,token,world,active.head_scene_id,turn.actor_context.map(x=>x.actor));
    const latest=await ownerWorld(env,token,world.id),latestBranch=await branch(env,token,latest);
    if(latest.active_branch_id!==world.active_branch_id||latestBranch.head_scene_id!==active.head_scene_id||latest.directive_version!==world.directive_version)throw Error('Story or rules changed; retry.');
    return {world_id:world.id,branch_id:world.active_branch_id,expected_head:active.head_scene_id,expected_rules_version:world.directive_version,auto_save:latest.auto_save,...turn,historical_hints:hints};
   }
   if(name==='get_world_dynamics')return {world_id:world.id,head_scene_id:active.head_scene_id,...dynamicsView(p,options)};
   return {world_id:world.id,head_scene_id:active.head_scene_id,...(name==='get_social_world'?socialWorldView(p,options):name==='get_relationship_history'?relationshipHistory(memory.scenes,p,options):name==='get_character_activities'?activityView(p,options):name==='get_world_consequences'?consequenceView(p,options):name==='get_character_growth'?growthView(p,options):knowledgeView(p,options))};
  }
  case 'save_memory_notes':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   if(!world.auto_save)throw Error('Owner disabled MCP autosave');
   if(active.head_scene_id!==assertUuid(args.expected_head))throw Error('Story changed; retry.');
   const sid=assertUuid(args.scene_id);
   if(await rpc(env,token,'nw_scene_in_active_branch',{p_world_id:world.id,p_scene_id:sid})!==true)throw Error('Not a canonical scene');
   const rows=await rest(env,token,`nw_scenes?select=id,body&world_id=eq.${ep(world.id)}&id=eq.${ep(sid)}&limit=1`);
   const notes=validateMemoryNotes(rows?.[0],args.notes);
   return {...await rpc(env,token,'nw_save_memory_notes',{p_world_id:world.id,p_scene_id:sid,p_expected_head:active.head_scene_id,p_notes:notes}),policy:MEMORY_NOTE_POLICY};
  }
  case 'get_memory_notes':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   const actor=typeof args.actor==='string'?args.actor.trim():null;
   if(actor&&actor.length>140)throw Error('Invalid actor');
   const limit=Math.max(1,Math.min(40,Math.floor(Number(args.limit)||20))),offset=Math.max(0,Math.floor(Number(args.offset)||0));
   const rows=await rpc(env,token,'nw_read_memory_notes',{p_world_id:world.id,p_expected_head:active.head_scene_id,p_actor:actor||null,p_scene_id:args.scene_id?assertUuid(args.scene_id):null,p_limit:limit,p_offset:offset});
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)throw Error('Story changed; retry.');
   return {world_id:world.id,head_scene_id:active.head_scene_id,notes:rows,canonical:false,next_offset:rows.length===limit?offset+limit:null,policy:MEMORY_NOTE_POLICY};
  }
  case 'get_world_agenda':{
   const world=await ownerWorld(env,token,args.world_id);
   const before=await branch(env,token,world);
   const memory=await readStructuredMemory(env,token,world,before.head_scene_id);
   const projection=memory.projection;
   const agenda=recordedWorldAgenda(memory.scenes,projection,{maxEntries:100});
   const current=await ownerWorld(env,token,world.id);
   const after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==before.head_scene_id)
    throw Error('Story changed while reading the agenda; retry.');
   return {world_id:world.id,active_branch_id:world.active_branch_id,head_scene_id:before.head_scene_id,
    memory_complete:memory.complete,...agenda,interpretation:'Recorded commitments and dates are not simulated in the background. The current fictional time may be unknown if recent scenes have no date.'};
  }
  case 'get_npc_agency':{
   const world=await ownerWorld(env,token,args.world_id);
   const active=await branch(env,token,world);
   const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
   const projection=memory.projection;
   const actor=String(args.actor||'').trim().toLocaleLowerCase('ru');
   const plans=projection.plans.filter(p=>!actor||String(p.actor).toLocaleLowerCase('ru')===actor);
   return {world_id:world.id,actor:actor||null,plans,complete:memory.complete,
    interpretation:'Plans are intentions, not facts of completion. No offscreen action runs while ChatGPT is idle.',
    warnings:projection.validation_warnings};
  }
  case 'get_branch_history':{
   await ownerWorld(env,token,args.world_id);
   return await readHistory(env,token,args.world_id,Math.max(1,Math.min(100,Number(args.limit)||25)),Math.max(0,Math.floor(Number(args.offset)||0)));
  }
  case 'create_world':{
   const {buildWorldDraft}=await import('../public/core/world.mjs');const draft=buildWorldDraft(args.description);
   const seedRule=draft.seed.length<=5000?classifyDirective(draft.seed):null;
   const rule=seedRule?.relationship_locks.length?seedRule:null;
   const id=await rpc(env,token,'nw_create_world_v2',{p_title:String(args.title||draft.title).slice(0,100),p_seed:draft.seed,p_start_marker:String(args.start_marker||draft.start_marker),
     p_rule_text:rule?.text??null,p_rule_category:rule?.category??'general',
     p_rule_metadata:rule?{relationship_lock:rule.relationship_lock,relationship_locks:rule.relationship_locks,tags:rule.tags}:{} });
   return {world_id:id,initial_description:draft.seed,initial_rule_saved_atomically:!!rule};
  }
  case 'add_world_directive':{
   const world=await ownerWorld(env,token,args.world_id);const menuRequest=parseLegacyMenuRequest(args.text?.trim(),world.id);if(menuRequest)return await callTool('save_game_menu_preferences',menuRequest,env,token);if(isMenuDirective(args.text?.trim()))throw Error('Use save_game_menu_preferences for menu settings');const directive=classifyDirective(args.text);
   const directiveId=await rpc(env,token,'nw_add_directive',{p_world_id:world.id,p_text:directive.text,p_category:directive.category,p_metadata:{tags:directive.tags,relationship_lock:directive.relationship_lock,relationship_locks:directive.relationship_locks}});
   return {directive_id:directiveId,stored_verbatim:true,classification:directive.category};
  }
  case 'validate_player_choice':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   if(world.active_branch_id!==args.branch_id||active.head_scene_id!==args.expected_head||world.directive_version!==args.expected_rules_version)throw Error('Stale choice: refresh the current scene');
   const memory=await readStructuredMemory(env,token,world,active.head_scene_id),p=memory.projection;
   const result=resolvePlayerChoice(playerChoiceView(memory.scenes,p,{worldId:world.id,branchId:world.active_branch_id,rulesVersion:world.directive_version,complete:memory.complete}),args);
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id||current.directive_version!==world.directive_version)throw Error('Choice changed during validation');
   return {...result,world_id:world.id,branch_id:world.active_branch_id,expected_head:active.head_scene_id,expected_rules_version:world.directive_version,auto_save:current.auto_save};
  }
  case 'review_scene_draft':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   if(world.active_branch_id!==args.branch_id||active.head_scene_id!==args.expected_head||world.directive_version!==args.expected_rules_version)throw Error('Story or rules changed; refresh context.');
   const [rules,memory]=await Promise.all([directives(env,token,world.id),readStructuredMemory(env,token,world,active.head_scene_id)]);
   const report=reviewSceneDraft(memory,{body:args.body,events:args.events??[],world_time:args.world_time??null,directives:rules});
   const current=await ownerWorld(env,token,world.id),currentBranch=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||currentBranch.head_scene_id!==active.head_scene_id||current.directive_version!==world.directive_version)throw Error('Story or rules changed during review; retry.');
   return {world_id:world.id,branch_id:world.active_branch_id,expected_head:active.head_scene_id,expected_rules_version:world.directive_version,auto_save:current.auto_save,...report};
  }
  case 'save_scene':{
   const world=await ownerWorld(env,token,args.world_id);
   assertUuid(args.request_id);assertUuid(args.branch_id);
   if(args.expected_head!==null)assertUuid(args.expected_head);
   const receipt=await rpc(env,token,'nw_scene_receipt',{p_world_id:world.id,p_request_id:args.request_id});
   // Previously accepted data can be retried even if active branch, rules or autosave changed.
   // NEVER trust a receipt alone: the SQL RPC verifies all original payload fields.
   if(!receipt?.saved){
    if(!world.auto_save)throw Error('Owner disabled MCP autosave for this world');
    if(world.active_branch_id!==args.branch_id)throw Error('Not the active branch');
    if(world.directive_version!==args.expected_rules_version)throw Error('Rules changed; fetch world context again');
    const rules=await directives(env,token,world.id);
    const validation=validateScene({body:args.body,events:args.events||[],directives:rules,worldTime:args.world_time??null});
    if(!validation.ok)throw Error(validation.errors.join(' '));
    if(needsStatePreflight(args.events||[])){
     const active=await branch(env,token,world);
     if(active.head_scene_id!==args.expected_head)throw Error('Head changed: refresh story before committing');
     const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
     if(!memory.complete)throw Error('State preflight requires complete structured history; retrieve and verify sources before saving.');
     const checked=validateStateAppend(memory.scenes,args.events,args.body,{checkpoint:memory.checkpoint,worldTime:args.world_time??null});
     if(!checked.ok)throw Error(checked.errors.join(' '));
    }
   }
   const sceneId=await rpc(env,token,'nw_commit_scene',{
      p_world_id:world.id,p_branch_id:args.branch_id,p_expected_head:args.expected_head,
      p_request_id:args.request_id,p_body:args.body,p_world_time:args.world_time??null,p_events:args.events||[],p_expected_rules_version:args.expected_rules_version
   });
   return {saved:true,reused:!!receipt?.saved,scene_id:sceneId,request_id:args.request_id,read_url:sceneReaderUrl(world.id,sceneId)};
  }
  case 'fork_before_scene':{
   const world=await ownerWorld(env,token,args.world_id);
   const id=await rpc(env,token,'nw_fork_before',{p_world_id:world.id,p_scene_id:assertUuid(args.scene_id),p_name:args.name||'Альтернативная линия'});
   return {new_branch_id:id,old_branch_preserved:true};
  }
  case 'get_scene_receipt':{
   await ownerWorld(env,token,args.world_id);
   return await rpc(env,token,'nw_scene_receipt',{p_world_id:args.world_id,p_request_id:assertUuid(args.request_id)});
  }
  case 'edit_world_directive':{
   await ownerWorld(env,token,args.world_id);
   if(isMenuDirective(args.text?.trim()))throw Error('Use save_game_menu_preferences for menu settings');
   const rule=classifyDirective(args.text);
   await rpc(env,token,'nw_edit_directive',{p_world_id:args.world_id,p_directive_id:assertUuid(args.directive_id),p_text:rule.text,p_category:rule.category,
    p_metadata:{tags:rule.tags,relationship_lock:rule.relationship_lock,relationship_locks:rule.relationship_locks},p_expected_version:args.expected_rules_version});
   return {updated:true,stored_verbatim:true,requires_context_refresh:true};
  }
  case 'toggle_world_directive':{
   await ownerWorld(env,token,args.world_id);
   if(typeof args.active!=='boolean')throw Error('Explicit active boolean required');
   await rpc(env,token,'nw_toggle_directive',{p_world_id:args.world_id,p_directive_id:assertUuid(args.directive_id),p_active:args.active,p_expected_version:args.expected_rules_version});
   return {active:args.active,requires_context_refresh:true};
  }
  case 'revise_scene':{
   const world=await ownerWorld(env,token,args.world_id);
   assertUuid(args.request_id);assertUuid(args.source_scene_id);
   // An already committed revision can be replayed after autosave or rule changes.
   // The SQL RPC validates original request content before returning its receipt.
   const previous=await rest(env,token,`nw_revisions?select=request_id&world_id=eq.${ep(world.id)}&request_id=eq.${ep(args.request_id)}&limit=1`);
   if(previous?.length){
    const receipt=await rpc(env,token,'nw_revise_scene',{p_world_id:world.id,p_source_scene_id:args.source_scene_id,
     p_prefix:args.prefix,p_continuation:args.continuation,p_events:args.events||[],p_request_id:args.request_id,
     p_world_time:args.world_time??null,p_expected_rules_version:args.expected_rules_version});
    return {...receipt,saved:true,old_branch_preserved:true,request_id:args.request_id};
   }
   if(!world.auto_save)throw Error('Owner disabled MCP autosave');
   if(world.directive_version!==args.expected_rules_version)throw Error('Rules changed; fetch world context again');
   const rows=await rest(env,token,`nw_scenes?select=id,parent_scene_id,body,events,world_time&world_id=eq.${ep(world.id)}&id=eq.${ep(args.source_scene_id)}&limit=1`);
   const original=rows?.[0];if(!original)throw Error('Source scene not found');
   if(typeof args.prefix!=='string'||!original.body.startsWith(args.prefix))throw Error('Prefix does not match original scene');
   if(typeof args.continuation!=='string')throw Error('Missing continuation');
   const preserved=(Array.isArray(original.events)?original.events:[]).filter(e=>e&&typeof e.evidence==='string'&&e.evidence.trim()&&args.prefix.includes(e.evidence));
   const all=[...preserved,...(args.events||[])];
   const rules=await directives(env,token,world.id);
   const checked=validateScene({body:args.prefix+args.continuation,events:all,directives:rules});
   if(!checked.ok)throw Error(checked.errors.join(' '));
   if(needsStatePreflight(all)){
    const active=await branch(env,token,world);
    const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
    const preflight=revisionStatePreflight(memory,original,{prefix:args.prefix,continuation:args.continuation,events:args.events||[],directives:rules});
    if(!preflight.ok)throw Error(preflight.errors.join(' '));
   }
   const receipt=await rpc(env,token,'nw_revise_scene',{p_world_id:world.id,p_source_scene_id:args.source_scene_id,
      p_prefix:args.prefix,p_continuation:args.continuation,p_events:args.events||[],p_request_id:args.request_id,
      p_world_time:args.world_time??null,p_expected_rules_version:args.expected_rules_version});
   return {...receipt,saved:true,old_branch_preserved:true,request_id:args.request_id};
  }
  case 'switch_branch':{
   const world=await ownerWorld(env,token,args.world_id);
   await rpc(env,token,'nw_switch_branch',{p_world_id:world.id,p_branch_id:assertUuid(args.branch_id)});
   return {active_branch_id:args.branch_id};
  }
  default:throw Error('Unknown MCP tool '+name);
 }
}
function response(body,status=200,extra={}){return new Response(body,{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health')return response(JSON.stringify({service:'LIVING WORLD NEXT MCP',running:true,
     oauth_metadata_ready:!!(env.MCP_PUBLIC_URL&&env.SUPABASE_OAUTH_CLIENT_ID&&env.SUPABASE_URL&&env.SUPABASE_ANON_KEY&&
       !env.MCP_PUBLIC_URL.includes('YOUR-')&&!env.SUPABASE_OAUTH_CLIENT_ID.includes('YOUR-')&&!env.SUPABASE_URL.includes('YOUR-')), 
     oauth_e2e_verified:false}));
  if(request.method==='GET' && (url.pathname==='/.well-known/oauth-protected-resource'||url.pathname==='/.well-known/oauth-protected-resource/mcp')){
    try{return response(JSON.stringify(resourceMetadata(env)));}catch{return response(JSON.stringify({error:'OAuth server configuration incomplete'}),503);}
  }
  if(url.pathname!=='/mcp')return response(JSON.stringify({error:'Not found'}),404);
  if(request.method!=='POST')return response(JSON.stringify({error:'Use POST'}),405,{'allow':'POST'});
  const declaredLength=Number(request.headers.get('content-length')||0);
  if(declaredLength>1000000)return response(JSON.stringify({error:'Request too large'}),413);
  let msg;try{const raw=await request.text();if(raw.length>1000000)return response(JSON.stringify({error:'Request too large'}),413);msg=JSON.parse(raw);}catch{return response(JSON.stringify(error(null,-32700,'Parse error')),400);}
  if(!msg||msg.jsonrpc!=='2.0'||typeof msg.method!=='string')return response(JSON.stringify(error(msg?.id??null,-32600,'Invalid JSON-RPC request')),400);
  // All protected MCP methods demand OAuth, including the initial handshake and tool scan.
  // Public discovery and health remain available to ChatGPT before the user signs in.
  if(msg.id===undefined||msg.method==='notifications/initialized')return new Response(null,{status:202});
  if(msg.method==='server/discover')return response(JSON.stringify(done(msg.id,{resultType:'complete',supportedVersions:['2026-07-28',version],capabilities:{tools:{}},ttlMs:0,cacheScope:'public'})));
  if(['initialize','ping','tools/list','tools/call'].includes(msg.method)){
   let token;
   try{
    const raw=request.headers.get('authorization')||'';
    if(!/^Bearer [A-Za-z0-9._~-]+$/.test(raw))throw Error('Missing token');
    token=raw.slice(7);
    await verifyOAuthUser(env,token);
   }catch{
    let hint='Bearer';try{hint=challenge(env);}catch{}
    return response(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:fail('Требуется авторизация через Supabase OAuth.')}),401,{'www-authenticate':hint});
   }
   if(msg.method==='initialize')return response(JSON.stringify(done(msg.id,{protocolVersion:msg.params?.protocolVersion||version,capabilities:{tools:{listChanged:false}},serverInfo:{name:'living-world-next',version:'0.6.0'},instructions:narratorWorkflow})));
   if(msg.method==='ping')return response(JSON.stringify(done(msg.id,{})));
   if(msg.method==='tools/list')return response(JSON.stringify(done(msg.id,{resultType:'complete',ttlMs:0,cacheScope:'public',tools:toolsList})));
   const name=msg.params?.name;
   if(typeof name!=='string')return response(JSON.stringify(error(msg.id,-32602,'Missing tool name')),400);
   try{return response(JSON.stringify(done(msg.id,result(await callTool(name,msg.params?.arguments||{},env,token)))));}
   catch(e){return response(JSON.stringify(done(msg.id,fail(e.message||'Tool failed'))));}
  }
  return response(JSON.stringify(error(msg.id,-32601,'Method not found')),404);
 }
};
