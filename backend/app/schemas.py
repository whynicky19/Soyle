from typing import Any, Literal
from pydantic import BaseModel, Field

Role = Literal["admin", "parent", "specialist"]
ModuleName = Literal["motor", "sensory", "mixed"]

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

class ExerciseCreate(BaseModel):
    module: ModuleName
    title: str = Field(min_length=2, max_length=100)
    instruction: str = Field(min_length=2, max_length=300)
    difficulty: int = Field(ge=1, le=3)
    target: str = Field(min_length=1, max_length=50)
    icon: str = Field(min_length=1, max_length=200)
    is_active: bool = True

class RoleUpdate(BaseModel):
    role: Role

class ActiveUpdate(BaseModel):
    is_active: bool

class UserSettingsUpdate(BaseModel):
    camera_enabled: bool
    sound_enabled: bool
    calm_mode: bool
    theme: Literal["peach", "ocean", "lavender", "contrast"]
