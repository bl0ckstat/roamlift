# RoamLift 🏋️

A self-hosted gym workout tracker built for **hotel gyms** — where you never know
what equipment you'll find until you get there.

Tell RoamLift what's available (or build a profile per gym you revisit) and it
suggests exercises that actually work with the equipment on hand, shows a demo of
the movement, and recommends a weight based on your history.

## Features

- **Free sessions** — pick a focus (one body part or *full body*) and RoamLift
  suggests exercise after exercise, rotating body parts on full-body days.
- **Workout templates** — build named workouts as ordered exercise lists with
  target sets × reps, then follow them in the gym.
- **Equipment-aware** — create a profile per gym (e.g. "Hilton KL: dumbbells +
  cables only"); suggestions never require equipment the gym doesn't have.
  Bodyweight movements are always in play.
- **Three skips** on every suggestion:
  - *Skip — same body part*: substitute movement for the same muscles
  - *Skip — different body part*: move on
  - *Equipment busy — try again later*: deferred and re-offered later in the session
- **Weight suggestions** — repeats your last weight, and nudges it up
  (+2.5 kg, +2 kg for dumbbells/kettlebells) when you hit all your targets last time.
- **Demos** — every exercise shows an animated two-frame demonstration and
  step-by-step instructions, served locally (fine on hotel Wi-Fi over a VPN).
- **Favorites** — star exercises you like and they'll come up more often.
- **Multiple profiles** — a simple name picker, no passwords. Intended to run on
  a private network (e.g. behind [Tailscale](https://tailscale.com)); it has no
  authentication of its own — **do not expose it to the open internet**.
- **PWA** — add it to your phone's home screen and it feels like an app.

Exercise data and images come from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (~870 exercises,
public domain).

## Quick start

```bash
git clone https://github.com/bl0ckstat/roamlift
cd roamlift
./scripts/fetch-exercises.sh         # downloads the exercise DB + images (~100 MB)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8484
```

Open `http://<host>:8484` on your phone. All state lives in a single SQLite file
at `data/roamlift.db` — back that up and you've backed up everything.

## Run as a service (systemd)

```bash
sudo cp deploy/roamlift.service /etc/systemd/system/
# edit User= and paths if your checkout isn't /home/you/roamlift
sudo systemctl daemon-reload
sudo systemctl enable --now roamlift
```

## How suggestions work

Candidates are strength-category exercises for the target body part whose
equipment the gym has. They're scored: favorites +6, exercises you've done
before +4 (so weight suggestions kick in), compound movements +2, minus a small
penalty for advanced difficulty, plus a random jitter for variety. Deferred
("equipment busy") exercises are re-offered after a couple of other exercises.

## Stack

FastAPI + SQLite (stdlib `sqlite3`), vanilla-JS single-page frontend, no build
step. Python 3.11+.

## License

MIT (see [LICENSE](LICENSE)). Exercise content is from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db), dedicated to
the public domain under the Unlicense; its license is downloaded alongside the
data as `data/EXERCISE-DB-LICENSE.md`.
