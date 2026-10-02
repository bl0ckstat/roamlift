"""RoamLift — hotel-gym-friendly workout tracker.

Single FastAPI service: JSON API + mobile web UI + bundled exercise DB
(free-exercise-db, see data/EXERCISE-DB-LICENSE.md).
"""
import json
import os
import random
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DB_PATH = Path(os.environ.get("ROAMLIFT_DB", DATA_DIR / "roamlift.db"))

# ---------------------------------------------------------------- exercises

# Muscles from the dataset grouped into user-facing body parts.
BODY_PARTS = {
    "Chest": ["chest"],
    "Back": ["lats", "middle back", "lower back", "traps"],
    "Shoulders": ["shoulders", "neck"],
    "Arms": ["biceps", "triceps", "forearms"],
    "Legs": ["quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors"],
    "Core": ["abdominals"],
}
MUSCLE_TO_PART = {m: part for part, ms in BODY_PARTS.items() for m in ms}
# Rotation order for full-body sessions: big groups first.
FULL_BODY_ORDER = ["Legs", "Chest", "Back", "Shoulders", "Arms", "Core"]

# Gym-relevant categories (no stretching/cardio/plyometrics).
GYM_CATEGORIES = {"strength", "powerlifting", "olympic weightlifting"}

# Equipment that needs no gym provision.
ALWAYS_AVAILABLE = {None, "body only"}

EQUIPMENT_OPTIONS = [
    "barbell", "dumbbell", "machine", "cable", "kettlebells",
    "e-z curl bar", "bands", "exercise ball", "medicine ball", "other",
]

# Weight increment when the user completed all target sets/reps last time.
def increment_for(equipment: Optional[str]) -> float:
    return 2.0 if equipment in ("dumbbell", "kettlebells") else 2.5


def load_exercises() -> dict:
    raw = json.loads((DATA_DIR / "exercises.json").read_text())
    out = {}
    for e in raw:
        primaries = e.get("primaryMuscles") or []
        part = MUSCLE_TO_PART.get(primaries[0]) if primaries else None
        out[e["id"]] = {
            "id": e["id"],
            "name": e["name"],
            "equipment": e.get("equipment"),
            "category": e.get("category"),
            "level": e.get("level"),
            "mechanic": e.get("mechanic"),
            "primaryMuscles": primaries,
            "secondaryMuscles": e.get("secondaryMuscles") or [],
            "instructions": e.get("instructions") or [],
            "images": e.get("images") or [],
            "bodyPart": part,
        }
    return out

EXERCISES = load_exercises()


def exercise_available(ex: dict, gym_equipment: set) -> bool:
    return ex["equipment"] in ALWAYS_AVAILABLE or ex["equipment"] in gym_equipment


def public_exercise(ex: dict) -> dict:
    return {**ex, "images": [f"/img/{p}" for p in ex["images"]]}

# ---------------------------------------------------------------- database

def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles(
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS gyms(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, equipment TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS templates(
  id INTEGER PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS template_items(
  id INTEGER PRIMARY KEY, template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, exercise_id TEXT NOT NULL,
  target_sets INTEGER NOT NULL DEFAULT 3, target_reps INTEGER NOT NULL DEFAULT 8,
  superset_with_next INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(
  id INTEGER PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gym_id INTEGER REFERENCES gyms(id) ON DELETE SET NULL,
  mode TEXT NOT NULL, template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  focus TEXT, current_part TEXT, note TEXT,
  started_at TEXT NOT NULL, finished_at TEXT);
CREATE TABLE IF NOT EXISTS session_exercises(
  id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL, position INTEGER NOT NULL,
  target_sets INTEGER NOT NULL DEFAULT 3, target_reps INTEGER NOT NULL DEFAULT 8,
  status TEXT NOT NULL, -- active | done | skipped | deferred
  body_part TEXT, template_item_id INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS favorites(
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  PRIMARY KEY (profile_id, exercise_id));
CREATE TABLE IF NOT EXISTS sets(
  id INTEGER PRIMARY KEY,
  session_exercise_id INTEGER NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL, weight_kg REAL NOT NULL, reps INTEGER NOT NULL,
  is_warmup INTEGER NOT NULL DEFAULT 0, to_failure INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL);
"""

# Column additions for databases created before these features existed.
MIGRATIONS = [
    "ALTER TABLE sets ADD COLUMN is_warmup INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE sets ADD COLUMN to_failure INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE session_exercises ADD COLUMN note TEXT",
    "ALTER TABLE sessions ADD COLUMN note TEXT",
    "ALTER TABLE template_items ADD COLUMN superset_with_next INTEGER NOT NULL DEFAULT 0",
]

with db() as conn:
    conn.executescript(SCHEMA)
    for mig in MIGRATIONS:
        try:
            conn.execute(mig)
        except sqlite3.OperationalError:
            pass  # column already exists

# ---------------------------------------------------------------- app

app = FastAPI(title="RoamLift")
app.mount("/img", StaticFiles(directory=DATA_DIR / "exercise-images"), name="img")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/manifest.json")
def manifest():
    return FileResponse(ROOT / "static" / "manifest.json")


@app.get("/sw.js")
def service_worker():
    return FileResponse(ROOT / "static" / "sw.js", media_type="application/javascript")

# ----- reference data

@app.get("/api/meta")
def meta():
    return {"bodyParts": list(BODY_PARTS.keys()), "equipment": EQUIPMENT_OPTIONS}


@app.get("/api/exercises")
def list_exercises(q: str = "", body_part: str = "", equipment: str = "", limit: int = 50):
    ql = q.lower()
    out = []
    for ex in EXERCISES.values():
        if ex["category"] not in GYM_CATEGORIES:
            continue
        if ql and ql not in ex["name"].lower():
            continue
        if body_part and ex["bodyPart"] != body_part:
            continue
        if equipment and (ex["equipment"] or "body only") != equipment:
            continue
        out.append(ex)
    out.sort(key=lambda e: e["name"])
    return [public_exercise(e) for e in out[:limit]]


@app.get("/api/exercises/{exercise_id}")
def get_exercise(exercise_id: str):
    ex = EXERCISES.get(exercise_id)
    if not ex:
        raise HTTPException(404, "exercise not found")
    return public_exercise(ex)

# ----- profiles

class ProfileIn(BaseModel):
    name: str


@app.get("/api/profiles")
def list_profiles():
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM profiles ORDER BY name")]


@app.post("/api/profiles")
def create_profile(p: ProfileIn):
    name = p.name.strip()
    if not name:
        raise HTTPException(400, "name required")
    with db() as conn:
        try:
            cur = conn.execute("INSERT INTO profiles(name) VALUES(?)", (name,))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "profile exists")
        return {"id": cur.lastrowid, "name": name}

# ----- gyms

class GymIn(BaseModel):
    name: str
    equipment: list[str]


@app.get("/api/gyms")
def list_gyms():
    with db() as conn:
        return [
            {"id": r["id"], "name": r["name"], "equipment": json.loads(r["equipment"])}
            for r in conn.execute("SELECT * FROM gyms ORDER BY name")
        ]


@app.post("/api/gyms")
def create_gym(g: GymIn):
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO gyms(name, equipment) VALUES(?,?)",
            (g.name.strip(), json.dumps(g.equipment)),
        )
        return {"id": cur.lastrowid}


@app.put("/api/gyms/{gym_id}")
def update_gym(gym_id: int, g: GymIn):
    with db() as conn:
        conn.execute(
            "UPDATE gyms SET name=?, equipment=? WHERE id=?",
            (g.name.strip(), json.dumps(g.equipment), gym_id),
        )
    return {"ok": True}


@app.delete("/api/gyms/{gym_id}")
def delete_gym(gym_id: int):
    with db() as conn:
        conn.execute("DELETE FROM gyms WHERE id=?", (gym_id,))
    return {"ok": True}

# ----- templates

class TemplateItemIn(BaseModel):
    exercise_id: str
    target_sets: int = 3
    target_reps: int = 8
    superset_with_next: bool = False


class TemplateIn(BaseModel):
    profile_id: int
    name: str
    items: list[TemplateItemIn]


def template_out(conn, row) -> dict:
    items = []
    for it in conn.execute(
        "SELECT * FROM template_items WHERE template_id=? ORDER BY position", (row["id"],)
    ):
        ex = EXERCISES.get(it["exercise_id"])
        items.append({
            "exercise_id": it["exercise_id"],
            "name": ex["name"] if ex else it["exercise_id"],
            "equipment": ex["equipment"] if ex else None,
            "bodyPart": ex["bodyPart"] if ex else None,
            "target_sets": it["target_sets"],
            "target_reps": it["target_reps"],
            "superset_with_next": bool(it["superset_with_next"]),
        })
    return {"id": row["id"], "name": row["name"], "profile_id": row["profile_id"], "items": items}


@app.get("/api/templates")
def list_templates(profile_id: int):
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM templates WHERE profile_id=? ORDER BY name", (profile_id,)
        ).fetchall()
        return [template_out(conn, r) for r in rows]


def write_template_items(conn, template_id: int, items: list[TemplateItemIn]):
    conn.execute("DELETE FROM template_items WHERE template_id=?", (template_id,))
    for i, it in enumerate(items):
        if it.exercise_id not in EXERCISES:
            raise HTTPException(400, f"unknown exercise {it.exercise_id}")
        conn.execute(
            "INSERT INTO template_items(template_id, position, exercise_id, target_sets,"
            " target_reps, superset_with_next) VALUES(?,?,?,?,?,?)",
            (template_id, i, it.exercise_id, it.target_sets, it.target_reps,
             int(it.superset_with_next)),
        )


@app.post("/api/templates")
def create_template(t: TemplateIn):
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO templates(profile_id, name) VALUES(?,?)", (t.profile_id, t.name.strip())
        )
        write_template_items(conn, cur.lastrowid, t.items)
        return {"id": cur.lastrowid}


@app.put("/api/templates/{template_id}")
def update_template(template_id: int, t: TemplateIn):
    with db() as conn:
        conn.execute("UPDATE templates SET name=? WHERE id=?", (t.name.strip(), template_id))
        write_template_items(conn, template_id, t.items)
    return {"ok": True}


@app.delete("/api/templates/{template_id}")
def delete_template(template_id: int):
    with db() as conn:
        conn.execute("DELETE FROM templates WHERE id=?", (template_id,))
    return {"ok": True}

# ----- favorites

class FavoriteIn(BaseModel):
    profile_id: int
    exercise_id: str


def favorite_ids(conn, profile_id: int) -> set:
    return {
        r["exercise_id"]
        for r in conn.execute("SELECT exercise_id FROM favorites WHERE profile_id=?", (profile_id,))
    }


@app.get("/api/favorites")
def list_favorites(profile_id: int):
    with db() as conn:
        return sorted(favorite_ids(conn, profile_id))


@app.post("/api/favorites/toggle")
def toggle_favorite(f: FavoriteIn):
    if f.exercise_id not in EXERCISES:
        raise HTTPException(404, "exercise not found")
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM favorites WHERE profile_id=? AND exercise_id=?",
            (f.profile_id, f.exercise_id),
        )
        if cur.rowcount == 0:
            conn.execute(
                "INSERT INTO favorites(profile_id, exercise_id) VALUES(?,?)",
                (f.profile_id, f.exercise_id),
            )
            return {"favorite": True}
        return {"favorite": False}

# ----- weight suggestion

def best_stats(conn, profile_id: int, exercise_id: str) -> Optional[dict]:
    """All-time bests over working (non-warm-up) sets: heaviest weight with the
    reps achieved at it, and the highest rep count with the weight it was at."""
    rows = conn.execute(
        """SELECT st.weight_kg w, st.reps r FROM sets st
           JOIN session_exercises se ON se.id = st.session_exercise_id
           JOIN sessions s ON s.id = se.session_id
           WHERE s.profile_id=? AND se.exercise_id=? AND st.is_warmup=0""",
        (profile_id, exercise_id),
    ).fetchall()
    if not rows:
        return None
    top_w = max(rows, key=lambda x: (x["w"], x["r"]))
    top_r = max(rows, key=lambda x: (x["r"], x["w"]))
    return {
        "top_weight": {"weight_kg": top_w["w"], "reps": top_w["r"]},
        "top_reps": {"reps": top_r["r"], "weight_kg": top_r["w"]},
    }


def suggest_weight(conn, profile_id: int, exercise_id: str) -> dict:
    """Last weight used, nudged up if every target was hit last time.
    Warm-up sets are ignored throughout."""
    ex = EXERCISES[exercise_id]
    bodyweight = ex["equipment"] in ALWAYS_AVAILABLE
    best = best_stats(conn, profile_id, exercise_id)
    row = conn.execute(
        """SELECT se.id, se.target_sets, se.target_reps, se.note, s.started_at
           FROM session_exercises se JOIN sessions s ON s.id = se.session_id
           WHERE s.profile_id=? AND se.exercise_id=? AND se.status='done'
             AND EXISTS (SELECT 1 FROM sets
                         WHERE session_exercise_id = se.id AND is_warmup=0)
           ORDER BY s.started_at DESC, se.id DESC LIMIT 1""",
        (profile_id, exercise_id),
    ).fetchone()
    if not row:
        return {"suggested_weight": None, "bodyweight": bodyweight, "last": None, "best": best}
    sets = conn.execute(
        "SELECT weight_kg, reps FROM sets WHERE session_exercise_id=? AND is_warmup=0"
        " ORDER BY set_number",
        (row["id"],),
    ).fetchall()
    top = max(s["weight_kg"] for s in sets)
    hit_all = len(sets) >= row["target_sets"] and all(s["reps"] >= row["target_reps"] for s in sets)
    # Bodyweight: repeat last added weight, no auto-increment.
    suggested = top + increment_for(ex["equipment"]) if (hit_all and not bodyweight) else top
    return {
        "suggested_weight": round(suggested, 1),
        "bodyweight": bodyweight,
        "last": {
            "date": row["started_at"][:10],
            "sets": [{"weight_kg": s["weight_kg"], "reps": s["reps"]} for s in sets],
            "progressed": hit_all,
            "note": row["note"],
        },
        "best": best,
    }

# ----- sessions

class SessionIn(BaseModel):
    profile_id: int
    gym_id: Optional[int] = None
    mode: str  # free | template
    template_id: Optional[int] = None
    focus: Optional[str] = None  # body part or "full body" (free mode)


class SkipIn(BaseModel):
    exercise_id: str
    reason: str  # same | different | later (equipment busy — retry later this session)
    template_item_id: Optional[int] = None
    retry_se_id: Optional[int] = None  # set when skipping a re-offered deferred exercise


class AcceptIn(BaseModel):
    exercise_id: str
    template_item_id: Optional[int] = None
    retry_se_id: Optional[int] = None
    target_sets: int = 3
    target_reps: int = 8


class SetIn(BaseModel):
    weight_kg: float
    reps: int
    is_warmup: bool = False
    to_failure: bool = False


class NoteIn(BaseModel):
    note: str


def gym_equipment_set(conn, gym_id: Optional[int]) -> set:
    if gym_id is None:
        return set(EQUIPMENT_OPTIONS)  # no gym profile: assume everything
    row = conn.execute("SELECT equipment FROM gyms WHERE id=?", (gym_id,)).fetchone()
    if not row:
        raise HTTPException(404, "gym not found")
    return set(json.loads(row["equipment"]))


def session_row(conn, session_id: int):
    row = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
    if not row:
        raise HTTPException(404, "session not found")
    return row


def used_exercise_ids(conn, session_id: int) -> set:
    return {
        r["exercise_id"]
        for r in conn.execute(
            "SELECT exercise_id FROM session_exercises WHERE session_id=?", (session_id,)
        )
    }


def parts_done_count(conn, session_id: int) -> dict:
    counts = {p: 0 for p in FULL_BODY_ORDER}
    for r in conn.execute(
        "SELECT body_part, COUNT(*) n FROM session_exercises"
        " WHERE session_id=? AND status='done' GROUP BY body_part",
        (session_id,),
    ):
        if r["body_part"] in counts:
            counts[r["body_part"]] = r["n"]
    return counts


def history_exercise_ids(conn, profile_id: int) -> set:
    return {
        r["exercise_id"]
        for r in conn.execute(
            """SELECT DISTINCT se.exercise_id FROM session_exercises se
               JOIN sessions s ON s.id=se.session_id
               WHERE s.profile_id=? AND se.status='done'""",
            (profile_id,),
        )
    }


LEVEL_RANK = {"beginner": 0, "intermediate": 1, "expert": 2}


def pick_exercise(conn, sess, part: str, exclude: set) -> Optional[dict]:
    """Choose an exercise for the given body part at this session's gym."""
    equipment = gym_equipment_set(conn, sess["gym_id"])
    familiar = history_exercise_ids(conn, sess["profile_id"])
    favorites = favorite_ids(conn, sess["profile_id"])
    candidates = [
        ex for ex in EXERCISES.values()
        if ex["category"] in GYM_CATEGORIES
        and ex["bodyPart"] == part
        and ex["id"] not in exclude
        and exercise_available(ex, equipment)
    ]
    if not candidates:
        return None

    def score(ex):
        s = 0.0
        if ex["id"] in favorites:
            s += 6           # favorites come up most often
        if ex["id"] in familiar:
            s += 4           # prefer exercises with history (weight suggestions work)
        if ex["mechanic"] == "compound":
            s += 2
        s -= LEVEL_RANK.get(ex["level"], 1) * 0.5
        s += random.random() * 2  # variety
        return s

    return max(candidates, key=score)


def next_part(sess, counts: dict, current: Optional[str], move_on: bool) -> str:
    focus = sess["focus"]
    if focus and focus != "full body":
        if move_on:  # "skip – different body part" on a focused session
            others = [p for p in FULL_BODY_ORDER if p != focus]
            return random.choice(others)
        return focus
    order = FULL_BODY_ORDER
    if current in order and move_on:
        idx = (order.index(current) + 1) % len(order)
        return order[idx]
    if current and not move_on:
        return current
    # fresh pick: least-trained part so far
    return min(order, key=lambda p: (counts.get(p, 0), order.index(p)))


def max_position(conn, session_id: int) -> int:
    return conn.execute(
        "SELECT COALESCE(MAX(position),0) p FROM session_exercises WHERE session_id=?",
        (session_id,),
    ).fetchone()["p"]


def deferred_rows(conn, session_id: int) -> list:
    return conn.execute(
        "SELECT * FROM session_exercises WHERE session_id=? AND status='deferred'"
        " ORDER BY position",
        (session_id,),
    ).fetchall()


def is_favorite(conn, profile_id: int, exercise_id: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM favorites WHERE profile_id=? AND exercise_id=?",
        (profile_id, exercise_id),
    ).fetchone() is not None


def retry_suggestion(conn, sess, row) -> dict:
    """Re-offer an exercise that was deferred because its equipment was busy."""
    ex = EXERCISES.get(row["exercise_id"])
    sug = suggest_weight(conn, sess["profile_id"], ex["id"])
    out = {
        "done": False,
        "exercise": public_exercise(ex),
        "retry": True,
        "retry_se_id": row["id"],
        "favorite": is_favorite(conn, sess["profile_id"], ex["id"]),
        "body_part": row["body_part"],
        "target_sets": row["target_sets"],
        "target_reps": row["target_reps"],
        **sug,
    }
    if row["template_item_id"]:
        out["template_item_id"] = row["template_item_id"]
    return out


def build_suggestion(conn, sess) -> dict:
    """Next suggestion for a session (free or template mode)."""
    session_id = sess["id"]
    if sess["mode"] == "template":
        item = conn.execute(
            """SELECT ti.* FROM template_items ti
               WHERE ti.template_id=? AND ti.id NOT IN
                 (SELECT template_item_id FROM session_exercises
                  WHERE session_id=? AND template_item_id IS NOT NULL)
               ORDER BY ti.position LIMIT 1""",
            (sess["template_id"], session_id),
        ).fetchone()
        if not item:
            deferred = deferred_rows(conn, session_id)
            if deferred:
                return retry_suggestion(conn, sess, deferred[0])
            return {"done": True}
        ex = EXERCISES.get(item["exercise_id"])
        sug = suggest_weight(conn, sess["profile_id"], ex["id"])
        out = {
            "done": False,
            "exercise": public_exercise(ex),
            "favorite": is_favorite(conn, sess["profile_id"], ex["id"]),
            "template_item_id": item["id"],
            "target_sets": item["target_sets"],
            "target_reps": item["target_reps"],
            **sug,
        }
        if item["superset_with_next"]:
            partner = conn.execute(
                """SELECT * FROM template_items WHERE template_id=? AND position=?
                   AND id NOT IN (SELECT template_item_id FROM session_exercises
                                  WHERE session_id=? AND template_item_id IS NOT NULL)""",
                (sess["template_id"], item["position"] + 1, session_id),
            ).fetchone()
            if partner and partner["exercise_id"] in EXERCISES:
                pex = EXERCISES[partner["exercise_id"]]
                out["superset_next"] = {
                    "exercise": public_exercise(pex),
                    "favorite": is_favorite(conn, sess["profile_id"], pex["id"]),
                    "template_item_id": partner["id"],
                    "target_sets": partner["target_sets"],
                    "target_reps": partner["target_reps"],
                    **suggest_weight(conn, sess["profile_id"], pex["id"]),
                }
        return out
    # free mode
    part = sess["current_part"] or next_part(sess, parts_done_count(conn, session_id), None, False)
    # Re-offer a deferred (equipment was busy) exercise for this part once at
    # least two other exercises have been logged since it was put off.
    maxpos = max_position(conn, session_id)
    deferred = deferred_rows(conn, session_id)
    ready = [d for d in deferred if maxpos - d["position"] >= 2]
    match = next((d for d in ready if d["body_part"] == part), None)
    if match:
        return retry_suggestion(conn, sess, match)
    exclude = used_exercise_ids(conn, session_id)
    ex = pick_exercise(conn, sess, part, exclude)
    tried = {part}
    while ex is None and len(tried) < len(FULL_BODY_ORDER):
        # nothing left for this part at this gym — roll to the next part
        part = next_part(sess, parts_done_count(conn, session_id), part, True)
        if part in tried:
            part = next((p for p in FULL_BODY_ORDER if p not in tried), None)
        if part is None:
            break
        tried.add(part)
        ex = pick_exercise(conn, sess, part, exclude)
    if ex is None:
        if deferred:
            return retry_suggestion(conn, sess, deferred[0])
        return {"done": True, "reason": "no exercises left for this gym"}
    conn.execute("UPDATE sessions SET current_part=? WHERE id=?", (part, session_id))
    sug = suggest_weight(conn, sess["profile_id"], ex["id"])
    return {
        "done": False,
        "exercise": public_exercise(ex),
        "favorite": is_favorite(conn, sess["profile_id"], ex["id"]),
        "body_part": part,
        "target_sets": 3,
        "target_reps": 8,
        **sug,
    }


@app.post("/api/sessions")
def create_session(s: SessionIn):
    if s.mode not in ("free", "template"):
        raise HTTPException(400, "mode must be free or template")
    if s.mode == "template" and not s.template_id:
        raise HTTPException(400, "template_id required")
    if s.mode == "free":
        if not s.focus:
            raise HTTPException(400, "focus required for free session")
        if s.focus != "full body" and s.focus not in BODY_PARTS:
            raise HTTPException(400, "unknown body part")
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO sessions(profile_id, gym_id, mode, template_id, focus, started_at)"
            " VALUES(?,?,?,?,?,?)",
            (s.profile_id, s.gym_id, s.mode, s.template_id, s.focus, now()),
        )
        session_id = cur.lastrowid
        sess = session_row(conn, session_id)
        suggestion = build_suggestion(conn, sess)
    return {"id": session_id, "suggestion": suggestion}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: int):
    with db() as conn:
        sess = session_row(conn, session_id)
        suggestion = build_suggestion(conn, sess) if not sess["finished_at"] else None
        return {**session_detail(conn, sess), "suggestion": suggestion}


@app.post("/api/sessions/{session_id}/skip")
def skip_exercise(session_id: int, body: SkipIn):
    if body.reason not in ("same", "different", "later"):
        raise HTTPException(400, "reason must be same, different or later")
    with db() as conn:
        sess = session_row(conn, session_id)
        pos = max_position(conn, session_id) + 1
        ex = EXERCISES.get(body.exercise_id)
        if body.retry_se_id:
            # Acting on a re-offered deferred exercise: update its row in place.
            if body.reason == "later":
                conn.execute(
                    "UPDATE session_exercises SET position=? WHERE id=?",
                    (pos, body.retry_se_id),
                )
            else:
                # Clear the template link on a "same" skip so the substitute
                # can claim the template item.
                conn.execute(
                    "UPDATE session_exercises SET status='skipped', template_item_id=?"
                    " WHERE id=?",
                    (body.template_item_id if body.reason == "different" else None,
                     body.retry_se_id),
                )
        else:
            # "later" keeps the exercise in play (status deferred); in template
            # mode it holds the item so it isn't re-offered immediately.
            # "same" substitutes (item stays open); "different" closes the item.
            if body.reason == "later":
                status = "deferred"
                link = body.template_item_id if sess["mode"] == "template" else None
            else:
                status = "skipped"
                link = body.template_item_id if (
                    sess["mode"] == "template" and body.reason == "different"
                ) else None
            conn.execute(
                "INSERT INTO session_exercises(session_id, exercise_id, position, status,"
                " body_part, template_item_id) VALUES(?,?,?,?,?,?)",
                (session_id, body.exercise_id, pos, status,
                 ex["bodyPart"] if ex else None, link),
            )
        if body.reason == "later":
            sess = session_row(conn, session_id)
            return {"suggestion": build_suggestion(conn, sess)}
        if sess["mode"] == "free":
            counts = parts_done_count(conn, session_id)
            part = next_part(sess, counts, sess["current_part"], body.reason == "different")
            conn.execute("UPDATE sessions SET current_part=? WHERE id=?", (part, session_id))
            sess = session_row(conn, session_id)
            return {"suggestion": build_suggestion(conn, sess)}
        # template mode
        if body.reason == "same":
            item = conn.execute(
                "SELECT * FROM template_items WHERE id=?", (body.template_item_id,)
            ).fetchone()
            orig = EXERCISES.get(item["exercise_id"]) if item else None
            part = orig["bodyPart"] if orig else (ex["bodyPart"] if ex else None)
            sub = pick_exercise(conn, sess, part, used_exercise_ids(conn, session_id)) if part else None
            if sub:
                sug = suggest_weight(conn, sess["profile_id"], sub["id"])
                return {"suggestion": {
                    "done": False,
                    "exercise": public_exercise(sub),
                    "favorite": is_favorite(conn, sess["profile_id"], sub["id"]),
                    "template_item_id": item["id"] if item else None,
                    "target_sets": item["target_sets"] if item else 3,
                    "target_reps": item["target_reps"] if item else 8,
                    "substitute": True,
                    **sug,
                }}
            # no substitute available: close the item and move on
            if body.template_item_id:
                conn.execute(
                    "UPDATE session_exercises SET template_item_id=? WHERE session_id=? AND position=?",
                    (body.template_item_id, session_id, pos),
                )
        return {"suggestion": build_suggestion(conn, sess)}


@app.post("/api/sessions/{session_id}/accept")
def accept_exercise(session_id: int, body: AcceptIn):
    if body.exercise_id not in EXERCISES:
        raise HTTPException(404, "exercise not found")
    with db() as conn:
        sess = session_row(conn, session_id)
        extra = {
            "favorite": is_favorite(conn, sess["profile_id"], body.exercise_id),
            **suggest_weight(conn, sess["profile_id"], body.exercise_id),
        }
        if body.retry_se_id:
            conn.execute(
                "UPDATE session_exercises SET status='active', target_sets=?, target_reps=?"
                " WHERE id=? AND session_id=?",
                (body.target_sets, body.target_reps, body.retry_se_id, session_id),
            )
            return {"session_exercise_id": body.retry_se_id, **extra}
        pos = max_position(conn, session_id) + 1
        ex = EXERCISES[body.exercise_id]
        cur = conn.execute(
            "INSERT INTO session_exercises(session_id, exercise_id, position, target_sets,"
            " target_reps, status, body_part, template_item_id) VALUES(?,?,?,?,?,?,?,?)",
            (session_id, body.exercise_id, pos, body.target_sets, body.target_reps,
             "active", ex["bodyPart"], body.template_item_id),
        )
        return {"session_exercise_id": cur.lastrowid, **extra}


@app.post("/api/session_exercises/{se_id}/sets")
def log_set(se_id: int, body: SetIn):
    with db() as conn:
        se = conn.execute("SELECT * FROM session_exercises WHERE id=?", (se_id,)).fetchone()
        if not se:
            raise HTTPException(404, "not found")
        n = conn.execute(
            "SELECT COALESCE(MAX(set_number),0)+1 n FROM sets WHERE session_exercise_id=?",
            (se_id,),
        ).fetchone()["n"]
        # PR detection against all prior working sets for this exercise.
        pr_weight = pr_reps = False
        if not body.is_warmup:
            profile_id = conn.execute(
                "SELECT profile_id FROM sessions WHERE id=?", (se["session_id"],)
            ).fetchone()["profile_id"]
            hist = conn.execute(
                """SELECT st.weight_kg w, st.reps r FROM sets st
                   JOIN session_exercises se2 ON se2.id = st.session_exercise_id
                   JOIN sessions s ON s.id = se2.session_id
                   WHERE s.profile_id=? AND se2.exercise_id=? AND st.is_warmup=0""",
                (profile_id, se["exercise_id"]),
            ).fetchall()
            if hist:
                pr_weight = body.weight_kg > max(h["w"] for h in hist)
                at_weight = [h["r"] for h in hist if h["w"] >= body.weight_kg]
                pr_reps = bool(at_weight) and body.reps > max(at_weight)
        conn.execute(
            "INSERT INTO sets(session_exercise_id, set_number, weight_kg, reps,"
            " is_warmup, to_failure, created_at) VALUES(?,?,?,?,?,?,?)",
            (se_id, n, body.weight_kg, body.reps,
             int(body.is_warmup), int(body.to_failure), now()),
        )
        return {"set_number": n, "pr_weight": pr_weight, "pr_reps": pr_reps}


@app.post("/api/session_exercises/{se_id}/finish")
def finish_exercise(se_id: int):
    with db() as conn:
        se = conn.execute("SELECT * FROM session_exercises WHERE id=?", (se_id,)).fetchone()
        if not se:
            raise HTTPException(404, "not found")
        has_sets = conn.execute(
            "SELECT COUNT(*) c FROM sets WHERE session_exercise_id=? AND is_warmup=0", (se_id,)
        ).fetchone()["c"]
        conn.execute(
            "UPDATE session_exercises SET status=? WHERE id=?",
            ("done" if has_sets else "skipped", se_id),
        )
        sess = session_row(conn, se["session_id"])
        return {"suggestion": build_suggestion(conn, sess)}


@app.post("/api/sessions/{session_id}/finish")
def finish_session(session_id: int):
    with db() as conn:
        session_row(conn, session_id)
        conn.execute("UPDATE sessions SET finished_at=? WHERE id=?", (now(), session_id))
        conn.execute(
            "UPDATE session_exercises SET status='skipped'"
            " WHERE session_id=? AND status IN ('active','deferred') AND id NOT IN"
            " (SELECT DISTINCT session_exercise_id FROM sets)",
            (session_id,),
        )
        conn.execute(
            "UPDATE session_exercises SET status='done'"
            " WHERE session_id=? AND status='active'",
            (session_id,),
        )
        # A session with nothing completed isn't worth keeping.
        done = conn.execute(
            "SELECT COUNT(*) c FROM session_exercises WHERE session_id=? AND status='done'",
            (session_id,),
        ).fetchone()["c"]
        if done == 0:
            conn.execute("DELETE FROM sessions WHERE id=?", (session_id,))
            return {"ok": True, "deleted": True}
    return {"ok": True, "deleted": False}


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: int):
    with db() as conn:
        session_row(conn, session_id)
        conn.execute("DELETE FROM sessions WHERE id=?", (session_id,))
    return {"ok": True}

# ----- notes

@app.put("/api/session_exercises/{se_id}/note")
def set_exercise_note(se_id: int, body: NoteIn):
    with db() as conn:
        cur = conn.execute(
            "UPDATE session_exercises SET note=? WHERE id=?", (body.note.strip() or None, se_id)
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "not found")
    return {"ok": True}


@app.put("/api/sessions/{session_id}/note")
def set_session_note(session_id: int, body: NoteIn):
    with db() as conn:
        session_row(conn, session_id)
        conn.execute(
            "UPDATE sessions SET note=? WHERE id=?", (body.note.strip() or None, session_id)
        )
    return {"ok": True}

# ----- save a finished session as a reusable workout

class SaveTemplateIn(BaseModel):
    name: str


@app.post("/api/sessions/{session_id}/save_template")
def save_session_as_template(session_id: int, body: SaveTemplateIn):
    with db() as conn:
        sess = session_row(conn, session_id)
        rows = conn.execute(
            "SELECT * FROM session_exercises WHERE session_id=? AND status='done'"
            " ORDER BY position",
            (session_id,),
        ).fetchall()
        if not rows:
            raise HTTPException(400, "session has no completed exercises")
        cur = conn.execute(
            "INSERT INTO templates(profile_id, name) VALUES(?,?)",
            (sess["profile_id"], body.name.strip() or "Saved session"),
        )
        template_id = cur.lastrowid
        for i, se in enumerate(rows):
            work = conn.execute(
                "SELECT reps, COUNT(*) c FROM sets WHERE session_exercise_id=? AND is_warmup=0"
                " GROUP BY reps ORDER BY c DESC, reps DESC LIMIT 1",
                (se["id"],),
            ).fetchone()
            n_sets = conn.execute(
                "SELECT COUNT(*) c FROM sets WHERE session_exercise_id=? AND is_warmup=0",
                (se["id"],),
            ).fetchone()["c"]
            conn.execute(
                "INSERT INTO template_items(template_id, position, exercise_id, target_sets,"
                " target_reps, superset_with_next) VALUES(?,?,?,?,?,0)",
                (template_id, i, se["exercise_id"],
                 n_sets or se["target_sets"],
                 work["reps"] if work else se["target_reps"]),
            )
        return {"id": template_id}

# ----- progress

@app.get("/api/progress")
def progress(profile_id: int):
    """Exercises with history, most recently trained first."""
    with db() as conn:
        rows = conn.execute(
            """SELECT se.exercise_id, MAX(s.started_at) last_date,
                      COUNT(DISTINCT se.id) n, MAX(st.weight_kg) top_w
               FROM session_exercises se
               JOIN sessions s ON s.id = se.session_id
               JOIN sets st ON st.session_exercise_id = se.id AND st.is_warmup=0
               WHERE s.profile_id=? AND se.status='done'
               GROUP BY se.exercise_id ORDER BY last_date DESC""",
            (profile_id,),
        ).fetchall()
    out = []
    for r in rows:
        ex = EXERCISES.get(r["exercise_id"])
        if not ex:
            continue
        out.append({
            "exercise_id": r["exercise_id"],
            "name": ex["name"],
            "bodyPart": ex["bodyPart"],
            "equipment": ex["equipment"],
            "last_date": r["last_date"][:10],
            "sessions": r["n"],
            "top_weight": r["top_w"],
        })
    return out

# ----- history

def session_detail(conn, sess) -> dict:
    gym = None
    if sess["gym_id"]:
        g = conn.execute("SELECT name FROM gyms WHERE id=?", (sess["gym_id"],)).fetchone()
        gym = g["name"] if g else None
    exercises = []
    for se in conn.execute(
        "SELECT * FROM session_exercises WHERE session_id=? ORDER BY position", (sess["id"],)
    ):
        ex = EXERCISES.get(se["exercise_id"])
        sets = [
            {"weight_kg": r["weight_kg"], "reps": r["reps"],
             "is_warmup": bool(r["is_warmup"]), "to_failure": bool(r["to_failure"])}
            for r in conn.execute(
                "SELECT * FROM sets WHERE session_exercise_id=? ORDER BY set_number", (se["id"],)
            )
        ]
        exercises.append({
            "id": se["id"],
            "exercise_id": se["exercise_id"],
            "name": ex["name"] if ex else se["exercise_id"],
            "status": se["status"],
            "body_part": se["body_part"],
            "target_sets": se["target_sets"],
            "target_reps": se["target_reps"],
            "template_item_id": se["template_item_id"],
            "note": se["note"],
            "sets": sets,
        })
    return {
        "id": sess["id"], "mode": sess["mode"], "focus": sess["focus"], "gym": gym,
        "started_at": sess["started_at"], "finished_at": sess["finished_at"],
        "note": sess["note"], "exercises": exercises,
    }


@app.get("/api/sessions")
def list_sessions(profile_id: int, limit: int = 30):
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions WHERE profile_id=? ORDER BY started_at DESC LIMIT ?",
            (profile_id, limit),
        ).fetchall()
        return [session_detail(conn, r) for r in rows]


@app.get("/api/history/{exercise_id}")
def exercise_history(exercise_id: str, profile_id: int):
    with db() as conn:
        rows = conn.execute(
            """SELECT se.id, s.started_at FROM session_exercises se
               JOIN sessions s ON s.id=se.session_id
               WHERE s.profile_id=? AND se.exercise_id=? AND se.status='done'
               ORDER BY s.started_at DESC LIMIT 40""",
            (profile_id, exercise_id),
        ).fetchall()
        out = []
        for r in rows:
            sets = conn.execute(
                "SELECT weight_kg, reps, is_warmup, to_failure FROM sets"
                " WHERE session_exercise_id=? ORDER BY set_number",
                (r["id"],),
            ).fetchall()
            out.append({
                "date": r["started_at"][:10],
                "sets": [{"weight_kg": x["weight_kg"], "reps": x["reps"],
                          "is_warmup": bool(x["is_warmup"]), "to_failure": bool(x["to_failure"])}
                         for x in sets],
            })
        return out
