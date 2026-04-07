# Workout Tracker PWA

Lightweight strength-training tracker. Log exercises, sets, reps, and weight; view per-exercise history and a simple progress chart. Installable PWA, hostable on GitHub Pages with a Firebase backend.

## Features (v1)
- Google sign-in (Firebase Auth)
- Workouts with per-exercise sets (reps × weight)
- Seeded library of 40 common exercises + custom exercises
- Per-exercise history table and progress chart (top-set weight over time)
- Offline-first: Firestore persistent cache + service worker app shell
- Installable on mobile/desktop

## Setup

### 1. Create a Firebase project
1. Go to <https://console.firebase.google.com> and create a new project.
2. **Authentication → Sign-in method → Google** → enable.
3. **Firestore Database → Create database** (production mode).
4. **Project settings → Your apps → Add web app** → copy the config.

### 2. Configure the app
Edit `js/firebase-config.js` and paste your Firebase web config.

### 3. Deploy Firestore rules
Copy the contents of `firestore.rules` into **Firestore → Rules** and publish, or deploy via the Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

### 4. Host on GitHub Pages
1. Push this branch (`claude/workout-tracker-pwa-up4YR`) to GitHub.
2. Repo **Settings → Pages → Build from branch** → pick this branch, root folder.
3. Add your Pages URL to **Firebase Auth → Settings → Authorized domains**.
4. Visit the Pages URL and sign in.

### Local development
```bash
python3 -m http.server 8000
# open http://localhost:8000
```
Add `localhost` to Firebase Auth authorized domains (it's there by default).

## Data model (Firestore)
```
users/{uid}
users/{uid}/exercises/{exerciseId}   { name, muscleGroup, isCustom }
users/{uid}/workouts/{workoutId}     { date, notes, exerciseCount, setCount }
users/{uid}/workouts/{workoutId}/sets/{setId}
                                     { exerciseId, exerciseName, reps, weightKg, order }
```

## Roadmap (not in v1)
Cardio, body metrics, routines/templates, social features, wearable sync.
