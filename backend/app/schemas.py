from datetime import date, datetime
from typing import Any, Literal
from pydantic import BaseModel, Field, model_validator

Role = Literal["admin", "parent", "specialist"]
ModuleName = Literal["motor", "sensory", "mixed"]
SkillName = Literal["articulation", "vocabulary", "speech_comprehension", "word_repetition", "phrase_building", "communication"]

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=100)

class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=1, max_length=128)

class StudentLoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")
    pin: str = Field(min_length=4, max_length=12, pattern=r"^[0-9]+$")

class StudentAccountCreate(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")
    pin: str = Field(min_length=4, max_length=12, pattern=r"^[0-9]+$")

class ChildCreate(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    birth_date: date
    primary_module: ModuleName = "mixed"
    avatar_color: str = Field(default="#f07d68", pattern=r"^#[0-9a-fA-F]{6}$")

class SessionCreate(BaseModel):
    event_id: str | None = Field(default=None, min_length=8, max_length=80)
    child_id: int
    exercise_id: int
    module: ModuleName
    score: int = Field(ge=0, le=100)
    duration_seconds: int = Field(ge=0, le=7200)
    details: dict[str, Any] = Field(default_factory=dict)
    learning_session_id: int | None = None
    sequence_index: int | None = Field(default=None, ge=0, le=20)
    independence: int | None = Field(default=None, ge=0, le=100)
    prompt_level: Literal["independent", "minimal", "full", "refused"] | None = None
    response_ms: int | None = Field(default=None, ge=0, le=300000)
    communication_initiatives: int = Field(default=0, ge=0, le=100)
    attempts_count: int | None = Field(default=None, ge=0, le=100)
    correct_answers: int | None = Field(default=None, ge=0, le=100)
    prompts_used: int = Field(default=0, ge=0, le=1000)
    gameplay_choices: int = Field(default=0, ge=0, le=2000)
    independent_completions: int = Field(default=0, ge=0, le=100)
    prompted_completions: int = Field(default=0, ge=0, le=100)
    attempt_status: Literal["completed", "participated", "refused", "break", "technical_error"] = "completed"
    actor_role: Literal["parent", "student"]
    response_owner: Literal["child", "adult", "unknown"]
    support_context: Literal["independent", "caregiver_supported", "caregiver_modelled", "adult_preview", "unknown"]

class LearningSessionCreate(BaseModel):
    child_id: int
    exercise_ids: list[int] = Field(default_factory=list, min_length=1, max_length=5)
    target_minutes: Literal[3, 5, 10] = 5
    adaptive_plan_id: int | None = None

class LearningSessionPauseRequest(BaseModel):
    paused: bool = True


class ExerciseCreate(BaseModel):
    module: ModuleName
    title: str = Field(min_length=2, max_length=100)
    instruction: str = Field(min_length=2, max_length=300)
    difficulty: int = Field(ge=1, le=3)
    target: str = Field(min_length=1, max_length=50)
    icon: str = Field(min_length=1, max_length=200)
    skill: SkillName | None = None
    is_active: bool = True

class ExerciseStimulusCreate(BaseModel):
    key: str = Field(min_length=2, max_length=50, pattern=r"^[a-z0-9][a-z0-9-]+$")
    label: str = Field(min_length=1, max_length=80)
    speech: str = Field(min_length=1, max_length=120)
    hint: str = Field(default="", max_length=200)
    media_ref: str | None = Field(default=None, max_length=240)
    visual_token: str | None = Field(default=None, max_length=50)
    exemplars: list[str] | None = Field(default=None, min_length=1, max_length=5)
    word_concept_id: str | None = Field(default=None, min_length=2, max_length=80, pattern=r"^[a-z0-9][a-z0-9-]+$")
    distractor_keys: list[str] | None = Field(default=None, min_length=3, max_length=63)

class ExerciseDifficultyLevel(BaseModel):
    level: Literal[1, 2, 3]
    option_count: Literal[2, 3, 4]
    rounds: int = Field(ge=1, le=60)
    max_attempts: int = Field(ge=1, le=4)

class InstructionObjectCreate(BaseModel):
    key: str = Field(min_length=2, max_length=50, pattern=r"^[a-z0-9][a-z0-9-]+$")
    label: str = Field(min_length=1, max_length=80)
    role: Literal["movable", "target"]
    media_ref: str = Field(min_length=2, max_length=240, pattern=r"^/")

class InstructionSuccessCreate(BaseModel):
    object_key: str = Field(min_length=2, max_length=50)
    target_key: str = Field(min_length=2, max_length=50)

class InstructionResultCreate(BaseModel):
    media_ref: str | None = Field(default=None, max_length=500)
    relation: Literal["give", "in", "on"]
    speech: str = Field(min_length=2, max_length=160)

class InstructionScenarioCreate(BaseModel):
    key: str = Field(min_length=2, max_length=50, pattern=r"^[a-z0-9][a-z0-9-]+$")
    instruction: str = Field(min_length=2, max_length=160)
    speech: str = Field(min_length=2, max_length=160)
    objects: list[InstructionObjectCreate] = Field(min_length=2, max_length=6)
    success: InstructionSuccessCreate
    result: InstructionResultCreate | None = None

class ExerciseAssetCreate(BaseModel):
    media_ref: str = Field(min_length=2, max_length=240, pattern=r"^/")
    origin: str = Field(min_length=2, max_length=500)
    license: str = Field(min_length=2, max_length=500)
    license_status: Literal["documented", "pending"]

class LearningPictureCreate(BaseModel):
    key: str = Field(min_length=2, max_length=50, pattern=r"^[a-z0-9][a-z0-9-]+$")
    label: str = Field(min_length=1, max_length=80)
    media_ref: str = Field(min_length=2, max_length=240, pattern=r"^/[^/]")

class SortItemCreate(LearningPictureCreate):
    category_key: str = Field(min_length=2, max_length=50)

class LearningPairCreate(BaseModel):
    object_key: str = Field(min_length=2, max_length=50)
    target_key: str = Field(min_length=2, max_length=50)

class LearningTaskCreate(BaseModel):
    key: str = Field(min_length=2, max_length=50)
    instruction: str = Field(min_length=2, max_length=500)
    cards: list[LearningPictureCreate] = Field(min_length=2, max_length=6)
    targets: list[LearningPictureCreate] = Field(default_factory=list, max_length=6)
    correct_order: list[str] = Field(default_factory=list, max_length=4)
    pairs: list[LearningPairCreate] = Field(default_factory=list, max_length=6)

class ObservationSceneCreate(BaseModel):
    key: str = Field(min_length=2, max_length=80)
    theme: str = Field(min_length=2, max_length=80)
    media_ref: str = Field(min_length=5, max_length=300)
    parts: list[str] = Field(min_length=3, max_length=3)
    options: list[list[str]] = Field(min_length=3, max_length=3)
    detail_question: str = Field(min_length=2, max_length=100)


class ExplorationImage(BaseModel):
    media_ref: str = Field(min_length=5, max_length=240)
    version: str = Field(min_length=1, max_length=80)
    width: int = Field(ge=1, le=8192)
    height: int = Field(ge=1, le=8192)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")

class ExplorationObject(BaseModel):
    related_surfaces: list[str] = Field(default_factory=list,max_length=5)
    part_feedback: str = Field(default="",max_length=160)
    id: str = Field(min_length=2, max_length=80)
    concept_id: str = Field(min_length=2, max_length=80)
    label: str = Field(min_length=1, max_length=100)
    instructions: dict[str, str]
    hit_point: tuple[float, float]
    hit_polygons: list[list[tuple[float, float]]] = Field(min_length=1, max_length=12)
    hint_regions: list[tuple[float, float, float, float]] = Field(min_length=2, max_length=2)
    beginner: bool = False

class ExplorationLocation(BaseModel):
    key: str = Field(min_length=2, max_length=80)
    title: str = Field(min_length=2, max_length=100)
    image: ExplorationImage
    objects: list[ExplorationObject] = Field(min_length=10, max_length=12)

class ExplorationStart(BaseModel):
    exercise_id: int
    level: Literal[1, 2, 3] = 1
    rounds: Literal[4, 8, 12] = 4
    accessible_labels: bool = False
    learning_session_id: int | None = None

class ExplorationPreviewStart(BaseModel):
    level: Literal[1, 2, 3] = 1
    rounds: Literal[4, 8, 12] = 4
    accessible_labels: bool = False

class ExplorationEvent(BaseModel):
    event_id: str = Field(min_length=8, max_length=80)
    expected_revision: int = Field(ge=0)
    action: Literal['audio', 'repeat', 'hint', 'select', 'outside', 'next', 'pause', 'resume', 'refuse', 'technical_error']
    point: tuple[float, float] | None = None
    object_id: str | None = Field(default=None, max_length=80)
    keyboard: bool = False
    audio_success: bool | None = None
    reason: str = Field(default='', max_length=160)

class VocabularyPolicyUpdate(BaseModel):
    min_observations: int = Field(default=3, ge=3, le=8)
    difficulty_observations: int = Field(default=2, ge=2, le=8)
    recovery_independent: int = Field(default=3, ge=2, le=8)
    recent_window: int = Field(default=6, ge=3, le=12)
    cooldown_hours: int = Field(default=24, ge=1, le=168)

class ExerciseDraftContent(BaseModel):
    exploration: ExplorationLocation | None = None
    presentation: Literal['picture_description'] | None = None
    scenes: list[ObservationSceneCreate] = Field(default_factory=list, max_length=60)
    scenario_key: str | None = Field(default=None, max_length=80)
    title: str | None = Field(default=None, max_length=100)
    instruction: str | None = Field(default=None, max_length=500)
    labels: list[str] = Field(default_factory=list, max_length=64)
    steps: list[str] = Field(default_factory=list, max_length=10)
    criterion: str | None = Field(default=None, max_length=500)
    empty_hint: str | None = Field(default=None, max_length=500)
    incomplete_hint: str | None = Field(default=None, max_length=500)
    success_hint: str | None = Field(default=None, max_length=500)
    action_label: str | None = Field(default=None, max_length=100)
    completion: dict[str, Any] | None = None
    accepted_sequences: list[list[str]] | None = Field(default=None, max_length=256)
    categories: list[LearningPictureCreate] = Field(default_factory=list, max_length=4)
    sort_items: list[SortItemCreate] = Field(default_factory=list, max_length=60)
    tasks: list[LearningTaskCreate] = Field(default_factory=list, max_length=60)
    stimuli: list[ExerciseStimulusCreate] = Field(default_factory=list, max_length=64)
    difficulty_levels: list[ExerciseDifficultyLevel] = Field(default_factory=list, max_length=3)
    scenarios: list[InstructionScenarioCreate] = Field(default_factory=list, max_length=100)
    bank_key: str | None = Field(default=None, max_length=80)
    round_choices: list[int] = Field(default_factory=list, max_length=6)
    default_rounds: int | None = Field(default=None, ge=1, le=60)
    max_rounds: int | None = Field(default=None, ge=1, le=60)
    exemplar_policy: Literal["matched_set"] | None = None
    revision: str | None = Field(default=None, max_length=100)
    asset_registry: list[ExerciseAssetCreate] = Field(default_factory=list, max_length=256)

class ExerciseMethodCard(BaseModel):
    target_skill: str = Field(min_length=5, max_length=300)
    skill_group: list[str] = Field(min_length=1, max_length=8)
    intended_for: list[str] = Field(min_length=1, max_length=8)
    diagnosis_boundary: str = Field(min_length=5, max_length=500)
    prerequisites: list[str] = Field(min_length=1, max_length=12)
    stimuli_and_responses: str = Field(min_length=5, max_length=1000)
    child_instruction: str = Field(min_length=2, max_length=300)
    adult_guidance: list[str] = Field(min_length=1, max_length=12)
    accepted_responses: list[str] = Field(min_length=1, max_length=12)
    difficulty_levels: list[str] = Field(min_length=1, max_length=8)
    prompts: list[str] = Field(min_length=1, max_length=12)
    ambiguities: list[str] = Field(min_length=1, max_length=12)
    stop_conditions: list[str] = Field(min_length=1, max_length=12)
    result_registration: list[str] = Field(min_length=1, max_length=12)
    real_life_transfer: list[str] = Field(min_length=1, max_length=12)
    sources: list[str | dict[str, str]] = Field(default_factory=list, max_length=20)
    evidence_note: str = Field(min_length=5, max_length=1000)
    methodology_review_status: Literal["pending"] = "pending"

class ExerciseDraftCreate(BaseModel):
    module: Literal["sensory", "mixed"]
    mechanic: Literal["auditory_choice", "action_choice", "tap_instruction", "guided_aac", "category_sort", "action_sequence", "object_match", "scene_search"]
    title: str = Field(min_length=2, max_length=100)
    objective: str = Field(min_length=5, max_length=300)
    instruction: str = Field(min_length=2, max_length=300)
    difficulty: int = Field(ge=1, le=3)
    skill: SkillName
    language: Literal["ru"] = "ru"
    response_mode: Literal["single_tap", "tap_sequence", "aac_card_sequence"]
    prompt_policy: dict[str, Any]
    completion_rule: dict[str, Any]
    content: ExerciseDraftContent
    method_card: ExerciseMethodCard

class ContentPublishCreate(BaseModel):
    comment: str = Field(default="", max_length=2000)


class ContentReviewCreate(BaseModel):
    stage: Literal["admin"]
    decision: Literal["passed", "approved", "changes_requested"]
    comment: str = Field(min_length=5, max_length=2000)

class SpecialistAssignmentCreate(BaseModel):
    specialist_id: int
    child_id: int

class AssignedExerciseCreate(BaseModel):
    child_id: int
    exercise_id: int
    note: str = Field(default="", max_length=500)

class SpecialistRecommendationCreate(BaseModel):
    child_id: int
    goal_id: int | None = None
    suggested_skill: SkillName
    exercise_id: int | None = None
    comment: str = Field(default="", max_length=1000)

class FamilyRecommendationDecision(BaseModel):
    decision: Literal["accepted", "declined", "needs_help"]
    goal_id: int | None = None
    note: str = Field(default="", max_length=1000)

class RecommendationReview(BaseModel):
    status: Literal["approved", "rejected", "edited"]
    comment: str = Field(default="", max_length=1000)

class RoleUpdate(BaseModel):
    role: Role

class ActiveUpdate(BaseModel):
    is_active: bool

class UserSettingsUpdate(BaseModel):
    camera_enabled: bool
    sound_enabled: bool
    calm_mode: bool
    theme: Literal["peach", "ocean", "lavender", "contrast"]
    language: Literal["ru", "kk"] = "ru"

class TTSRequest(BaseModel):
    profile: Literal["exercise", "pet"] = "exercise"
    text: str = Field(min_length=1, max_length=300)
    rate: float = Field(default=0.78, ge=0.6, le=1.1)
    language: Literal["ru", "kk"] = "ru"
    mode: Literal["normal", "slow"] | None = None
    version_id: int | None = Field(default=None, ge=1)

class AACCardCreate(BaseModel):
    child_id: int
    label: str = Field(min_length=1, max_length=40)
    speech: str = Field(min_length=1, max_length=120)
    category: Literal["help", "wants", "needs", "feelings", "yes_no", "people", "food", "play", "places", "actions", "household"]
    image: str = Field(default="/soyle-icon.png", min_length=1, max_length=1_050_000)
    lemma: str | None = Field(default=None, max_length=80)
    grammatical_role: Literal["subject", "action", "object", "ready_message"] = "ready_message"
    language: Literal["ru", "kk"] = "ru"
    pictogram: str | None = Field(default=None, max_length=200)

class WorldPhotoRename(BaseModel):
    name: str = Field(min_length=1, max_length=60)

class WorldPhotoCreate(WorldPhotoRename):
    category: Literal["people", "toys", "food", "places"]
    image_data: str = Field(min_length=40, max_length=1_050_000)

class StoryAnswer(BaseModel):
    scene_index: int = Field(ge=0, le=20)
    answer_key: str = Field(min_length=1, max_length=40)

class AACFavoriteUpdate(BaseModel):
    favorite: bool

class AACPhraseCreate(BaseModel):
    mode: Literal["guided", "free"] = "guided"
    child_id: int
    phrase: str | None = Field(default=None, min_length=1, max_length=300)
    card_ids: list[int] = Field(min_length=1, max_length=8)

class AACComposeRequest(BaseModel):
    preview_translations: bool = False
    mode: Literal["guided", "free"] = "guided"
    child_id: int
    card_ids: list[int] = Field(min_length=1, max_length=8)
    language: Literal["ru", "kk"] = "ru"

class ChildGoalCreate(BaseModel):
    child_id: int
    title: str = Field(min_length=2, max_length=120)
    target_skill: SkillName
    due_date: str | None = None
    success_criterion: str = Field(min_length=2, max_length=300)
    difficulty: int = Field(default=1, ge=1, le=3)
    exercise_ids: list[int] = Field(default_factory=list, max_length=12)
    position: int = Field(default=0, ge=0, le=1000)

class GoalStatusUpdate(BaseModel):
    status: Literal["active", "paused", "completed"]

class HomeworkCreate(BaseModel):
    child_id: int
    title: str = Field(min_length=2, max_length=160)
    instruction: str = Field(min_length=2, max_length=500)
    goal_id: int | None = None
    due_date: str | None = None

class HomeworkResultUpdate(BaseModel):
    result: Literal["independent", "minimal_prompt", "full_prompt", "failed", "refused"]
    parent_note: str = Field(default="", max_length=500)

class SkillObservationUpdate(BaseModel):
    status: Literal["not_observed", "not_yet", "with_help", "independent", "needs_review"]
    note: str = Field(default="", max_length=500)
    observed_at: datetime | None = None

class HomeActivityObservationCreate(BaseModel):
    activity_id: int
    outcome: Literal["not_observed", "independent", "with_help", "refused", "stopped"]
    prompt_level: Literal["independent", "minimal", "full"] | None = None
    note: str = Field(default="", max_length=500)
    observed_at: datetime | None = None

class PracticeGoalCreate(BaseModel):
    child_id: int
    template_key: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9][a-z0-9-]+$")
    baseline: str = Field(min_length=2, max_length=600)
    help_level: Literal["independent", "minimal", "full"]

class PracticeGoalUpdate(BaseModel):
    child_id: int
    expected_version: int = Field(ge=1)
    baseline: str | None = Field(default=None, min_length=2, max_length=600)
    target_outcome: str | None = Field(default=None, min_length=2, max_length=600)
    help_level: Literal["independent", "minimal", "full"] | None = None
    status: Literal["active", "paused", "completed"] | None = None

class PracticeGoalObservationCreate(BaseModel):
    child_id: int
    result_type: Literal["not_observed", "independent", "with_help", "refused", "break", "technical_error"]
    prompt_level: Literal["independent", "minimal", "full"] | None = None
    note: str = Field(default="", max_length=600)
    observed_at: datetime | None = None

class PracticePreferencesUpdate(BaseModel):
    preferred_exercise_ids: list[int] = Field(default_factory=list, max_length=30)
    avoided_exercise_ids: list[int] = Field(default_factory=list, max_length=30)
    note: str = Field(default="", max_length=600)

class AdaptivePlanRequest(BaseModel):
    target_minutes: Literal[3, 5, 10] = 5

class ConsentUpdate(BaseModel):
    privacy_accepted: bool
    specialist_sharing: bool = False
    camera_processing: bool = False
    ai_processing: bool = False
    analytics_processing: bool = False

class AIPlanRequest(BaseModel):
    target_minutes: Literal[3, 5, 10] = 5

class AIAskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=600)

class ChildDeleteRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class StorybookEvent(BaseModel):
    version: int = Field(ge=1)
    expected_revision: int = Field(ge=0)
    scene_id: str = Field(min_length=1, max_length=50)
    event_id: str = Field(min_length=8, max_length=80)
    action: str = Field(min_length=1, max_length=40)


class CinematicStorybookEvent(BaseModel):
    version: int = Field(ge=1)
    expected_revision: int = Field(ge=0)
    phase: str = Field(min_length=1, max_length=30)
    event_id: str = Field(min_length=8, max_length=80)
    action: str = Field(min_length=1, max_length=40)


class SpecialistAccessCreate(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")


class SpecialistObservationCreate(BaseModel):
    result_type: Literal["independent", "with_help", "not_observed", "refused", "break", "technical_error"]
    prompt_level: Literal["independent", "minimal", "full"]
    context: str = Field(min_length=3, max_length=300)
    note: str = Field(min_length=3, max_length=1000)
    goal_id: int | None = None

    @model_validator(mode="after")
    def consistent_support(self):
        if self.result_type == "independent" and self.prompt_level != "independent":
            raise ValueError("Самостоятельный ответ не может включать подсказку")
        if self.result_type == "with_help" and self.prompt_level == "independent":
            raise ValueError("Укажите уровень помощи для ответа с подсказкой")
        return self


class ChildPetSettingsUpdate(BaseModel):
    visible: bool = True
    voice: bool = False
    motion: Literal["full", "reduced", "off"] = "full"


class AudioCandidateCreate(BaseModel):
    source: Literal["azure", "manual", "bundled"]
    audio_base64: str | None = Field(default=None, max_length=2_666_668)
    expected_digest: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")

    @model_validator(mode="after")
    def validate_manual(self):
        if self.source == "manual" and not self.audio_base64:
            raise ValueError("Manual audio is required")
        return self


class AudioDecisionCreate(BaseModel):
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    action: Literal["listened", "approved"]
