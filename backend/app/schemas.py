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
    username: str = Field(min_length=3, max_length=40)
    password: str

class StudentLoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    pin: str = Field(min_length=4, max_length=12)

class StudentAccountCreate(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")
    pin: str = Field(min_length=4, max_length=12, pattern=r"^[0-9]+$")

class ChildCreate(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    birth_date: str
    primary_module: ModuleName = "mixed"
    avatar_color: str = "#f07d68"

class SessionCreate(BaseModel):
    child_id: int
    exercise_id: int
    module: ModuleName
    score: int = Field(ge=0, le=100)
    duration_seconds: int = Field(ge=0, le=7200)
    details: dict[str, Any] = Field(default_factory=dict)
    learning_session_id: int | None = None
    sequence_index: int | None = Field(default=None, ge=0, le=10)

class LearningSessionCreate(BaseModel):
    child_id: int
    exercise_ids: list[int] = Field(default_factory=list, min_length=3, max_length=5)

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

class AACCardCreate(BaseModel):
    child_id: int
    label: str = Field(min_length=1, max_length=40)
    speech: str = Field(min_length=1, max_length=120)
    category: Literal["help", "wants", "needs", "feelings", "yes_no", "people", "food", "play", "places", "actions"]
    image: str = Field(default="/soyle-icon.png", min_length=1, max_length=200)

class AACFavoriteUpdate(BaseModel):
    favorite: bool

class AACPhraseCreate(BaseModel):
    child_id: int
    phrase: str = Field(min_length=1, max_length=300)
    card_ids: list[int] = Field(default_factory=list, max_length=12)
