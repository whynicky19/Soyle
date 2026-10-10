from datetime import date
from typing import Any, Literal
from pydantic import BaseModel, Field

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
    prompts_used: int = Field(default=0, ge=0, le=100)
    attempt_status: Literal["completed", "participated", "refused", "break", "technical_error"] = "completed"

class LearningSessionCreate(BaseModel):
    child_id: int
    exercise_ids: list[int] = Field(default_factory=list, min_length=1, max_length=5)
    target_minutes: Literal[3, 5, 10] = 5

class ExerciseCreate(BaseModel):
    module: ModuleName
    title: str = Field(min_length=2, max_length=100)
    instruction: str = Field(min_length=2, max_length=300)
    difficulty: int = Field(ge=1, le=3)
    target: str = Field(min_length=1, max_length=50)
    icon: str = Field(min_length=1, max_length=200)
    skill: SkillName | None = None
    is_active: bool = True

class SpecialistAssignmentCreate(BaseModel):
    specialist_id: int
    child_id: int

class AssignedExerciseCreate(BaseModel):
    child_id: int
    exercise_id: int
    note: str = Field(default="", max_length=500)

class SpecialistRecommendationCreate(BaseModel):
    child_id: int
    suggested_skill: SkillName
    exercise_id: int | None = None
    comment: str = Field(default="", max_length=1000)

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
    language: Literal["ru"] = "ru"

class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    rate: float = Field(default=0.78, ge=0.6, le=1.1)
    language: Literal["ru"] = "ru"

class AACCardCreate(BaseModel):
    child_id: int
    label: str = Field(min_length=1, max_length=40)
    speech: str = Field(min_length=1, max_length=120)
    category: Literal["help", "wants", "needs", "feelings", "yes_no", "people", "food", "play", "places", "actions"]
    image: str = Field(default="/soyle-icon.png", min_length=1, max_length=200)
    lemma: str | None = Field(default=None, max_length=80)
    grammatical_role: Literal["subject", "action", "object", "ready_message"] = "ready_message"
    language: Literal["ru"] = "ru"
    pictogram: str | None = Field(default=None, max_length=200)

class AACFavoriteUpdate(BaseModel):
    favorite: bool

class AACPhraseCreate(BaseModel):
    child_id: int
    phrase: str | None = Field(default=None, min_length=1, max_length=300)
    card_ids: list[int] = Field(min_length=1, max_length=8)

class AACComposeRequest(BaseModel):
    child_id: int
    card_ids: list[int] = Field(min_length=1, max_length=8)
    language: Literal["ru"] = "ru"

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

class ConsentUpdate(BaseModel):
    privacy_accepted: bool
    camera_processing: bool = False
    specialist_sharing: bool = False
    analytics_processing: bool = False

class ChildDeleteRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
