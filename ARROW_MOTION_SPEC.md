# 🎯 3D Red Pointer Arrow Placement & Motion Specification

This specification codifies the user's architectural rules for the 3D Red Pointer Arrow in celebrity video reels and automated graphics.

---

## 📌 Core Rules

1. **Non-Overlapping Boundary:**
   The arrow must **never** be placed directly on top of or overlap the character cutout / asset image. It must always reside strictly in the open space surrounding the asset.

2. **Always Point Inward:**
   At all points along its motion path and in its resting settled state, the arrow tip must point directly towards the character asset (target focus: head, upper chest, or key prop like Frank Reynolds' cash stack).

3. **Curved Orbital Motion:**
   The arrow should move along a smooth, curved arc orbiting around the asset rather than moving in a straight linear cut.

---

## 🧭 The 4 Directional Scenarios (User Blueprint Reference)

Refer to:
- [`assets/guidelines/arrow_direction_center_arc.jpg`](file:///c:/Users/prata/OneDrive/Desktop/Facebook-Automations/1-born-today-hollywood/assets/guidelines/arrow_direction_center_arc.jpg)
- [`assets/guidelines/arrow_direction_4_scenarios.jpg`](file:///c:/Users/prata/OneDrive/Desktop/Facebook-Automations/1-born-today-hollywood/assets/guidelines/arrow_direction_4_scenarios.jpg)

### Scenario 1: Asset on LEFT (e.g., Frank Reynolds / Danny DeVito)
- **Position of Asset:** Bottom-Left (`x: 25, y: 1010`)
- **Arrow Orbit:** Outer Right Arc
- **Motion Path:**
  1. Starts at top-right of the asset (`x ≈ 580, y ≈ 1100`), pointing **down-left** at the character (`~135°`).
  2. Curves smoothly downward along the right side of the character (`x ≈ 640, y ≈ 1280`), pointing **left** (`~160°`).
  3. Settles at the resting position (`x ≈ 540, y ≈ 1260` to `1380`), pointing **inward** towards the upper torso.
  4. Continues with an active rhythmic pulse nudge ($20\text{px}$) along its pointing axis.

### Scenario 2: Asset on RIGHT
- **Position of Asset:** Bottom-Right
- **Arrow Orbit:** Outer Left Arc
- **Motion Path:**
  1. Starts at top-left of the asset, pointing **down-right** (`~45°`).
  2. Curves smoothly downward along the left side of the asset.
  3. Settles on the left of the character, pointing **up-right / inward**.

### Scenario 3: Asset in CENTER
- **Position of Asset:** Bottom-Center
- **Arrow Orbit:** Top Crest Arc
- **Motion Path:**
  1. Starts above the asset on the left, pointing **down-right** towards the asset.
  2. Sweeps across the top in an overhead arc to the right.
  3. Ends on the right, pointing **down-left** towards the asset.

### Scenario 4: Upward Sweep (Alternative Orbit)
- **Arrow Orbit:** Sweeps from the lower side upward along the perimeter of the character, pointing inward throughout.

---

## 🛠️ Implementation Summary in `build_reel_studio.js`
- **Dynamic Angle Calculation:** `Math.atan2(ty - ay, tx - ax) * 180 / Math.PI`
- **Bézier Trajectory:** Smooth quadratic Bézier interpolation `(1-u)^2 * P0 + 2*(1-u)*u * P1 + u^2 * P2`
- **Rhythmic Pulse Nudge:** `sin(π * mod(t, period) / period)^2 * nudgeAmp` along the pointing unit vector `(cos θ, sin θ)`.
