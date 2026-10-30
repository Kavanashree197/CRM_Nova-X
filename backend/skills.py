"""Skill catalog helpers: normalization, aliases, lookups.

The catalog is the single source of truth for skill names. When an Admin
adds a skill to an employee we resolve the input through `resolve_skill()`,
which canonicalizes case + common aliases (AI/Artificial Intelligence,
ML/Machine Learning). This way "AI", "ai", and "Artificial Intelligence"
all map to the same `skills` row.
"""
import database as db


# Built-in alias map: alias (lowercase) -> canonical name.
# Used at seed time AND as a fallback when an alias hasn't been seeded yet.
BUILTIN_ALIASES = {
    "ai": "Artificial Intelligence",
    "a.i.": "Artificial Intelligence",
    "artificial intelligence": "Artificial Intelligence",
    "ml": "Machine Learning",
    "machine learning": "Machine Learning",
    "cyber security": "Cybersecurity",
    "infosec": "Cybersecurity",
    "js": "JavaScript",
    "ts": "TypeScript",
    "py": "Python",
}


def _normalize_input(name: str) -> str:
    """Lowercase + trim for alias lookup."""
    return name.strip().lower()


def resolve_skill(name: str) -> int | None:
    """Return the skill_id for a given name or alias, or None.

    Resolution order:
      1. Exact match on skills.name (case-insensitive)
      2. Match against the aliases CSV on each skills row
      3. Built-in alias map (so AI/ML work even before the seed inserts them)
    """
    if not name:
        return None
    n = name.strip()
    if not n:
        return None
    # 1. Exact name (case-insensitive)
    row = db.fetch_one(
        "SELECT skill_id FROM skills WHERE LOWER(name) = LOWER(%s)", (n,))
    if row:
        return row["skill_id"]
    # 2. Aliases CSV on each row
    nl = _normalize_input(n)
    for s in db.fetch_all("SELECT skill_id, aliases FROM skills WHERE aliases IS NOT NULL"):
        if s["aliases"]:
            aliases = [a.strip().lower() for a in s["aliases"].split(",") if a.strip()]
            if nl in aliases:
                return s["skill_id"]
    # 3. Built-in alias map
    canonical = BUILTIN_ALIASES.get(nl)
    if canonical:
        row = db.fetch_one(
            "SELECT skill_id FROM skills WHERE LOWER(name) = LOWER(%s)", (canonical,))
        if row:
            return row["skill_id"]
    return None


def get_or_create_skill(name: str, aliases: str | None = None) -> int:
    """Create a skill if it doesn't exist (by canonical name or alias),
    return its skill_id. `aliases` is a CSV string of additional aliases."""
    sid = resolve_skill(name)
    if sid:
        return sid
    # create with the given name as canonical
    sid, _ = db.execute(
        "INSERT INTO skills (name, aliases) VALUES (%s, %s)",
        (name.strip(), (aliases or None).strip() if aliases else None))
    return sid


def list_skills() -> list[dict]:
    return db.fetch_all("SELECT skill_id, name, aliases FROM skills ORDER BY name")


def user_skills(user_id: int) -> list[dict]:
    return db.fetch_all(
        """SELECT s.skill_id, s.name
           FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
           WHERE us.user_id = %s ORDER BY s.name""",
        (user_id,))


def set_user_skills(user_id: int, skill_names: list[str]) -> list[str]:
    """Replace a user's skill set with the given list (resolved through the
    catalog). Returns the canonical names actually stored."""
    db.execute("DELETE FROM user_skills WHERE user_id = %s", (user_id,))
    stored = []
    for name in skill_names:
        sid = resolve_skill(name)
        if not sid:
            # auto-create the skill so Admin can add brand-new skills freely
            sid = get_or_create_skill(name)
        try:
            db.execute(
                "INSERT INTO user_skills (user_id, skill_id) VALUES (%s, %s)",
                (user_id, sid))
        except Exception:
            # Duplicate row (already exists) — safe to ignore.
            pass
        stored.append(db.fetch_one("SELECT name FROM skills WHERE skill_id=%s", (sid,))["name"])
    return stored


def add_user_skill(user_id: int, skill_name: str) -> tuple[str, bool]:
    """Add ONE skill to a user's profile (additive, does not wipe others).
    Resolves the name through the catalog (alias-aware) and auto-creates the
    skill row if it doesn't exist — so an employee can self-add a brand-new
    skill like 'Rust'. Returns (canonical_name, created_skill_bool).
    Raises ValueError on empty/invalid name."""
    name = (skill_name or "").strip()
    if not name:
        raise ValueError("Skill name is required")
    # Resolve or auto-create. get_or_create_skill returns the existing id
    # if the name or any alias already exists (no duplicates).
    pre = resolve_skill(name)
    sid = get_or_create_skill(name)
    created_skill = pre is None  # True if this skill didn't exist before
    try:
        db.execute(
            "INSERT INTO user_skills (user_id, skill_id) VALUES (%s, %s)",
            (user_id, sid))
    except Exception:
        # Already linked to this user — that's fine, treat as success.
        pass
    canonical = db.fetch_one("SELECT name FROM skills WHERE skill_id=%s", (sid,))["name"]
    return canonical, created_skill


def remove_user_skill(user_id: int, skill_name: str) -> str | None:
    """Remove ONE skill from a user's profile by canonical name or alias.
    Returns the canonical name removed, or None if the user didn't have it.
    Never deletes the skill from the catalog (other employees may have it)."""
    sid = resolve_skill(skill_name)
    if not sid:
        return None
    canonical = db.fetch_one("SELECT name FROM skills WHERE skill_id=%s", (sid,))["name"]
    db.execute(
        "DELETE FROM user_skills WHERE user_id = %s AND skill_id = %s",
        (user_id, sid))
    return canonical


def category_required_skills(category_name: str) -> list[str]:
    """The skill names a case of the given category requires."""
    return [r["name"] for r in db.fetch_all(
        """SELECT s.name FROM category_skills cs
           JOIN skills s ON s.skill_id = cs.skill_id
           JOIN categories c ON c.category_id = cs.category_id
           WHERE c.name = %s ORDER BY s.name""",
        (category_name,))]
