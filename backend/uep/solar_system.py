"""Solar System layer (L0) — scientifically grounded, provenance-tagged.

Positions come from the JPL approximate Keplerian elements (valid 1800–2050 AD;
Standish), solved with Kepler's equation in the heliocentric ecliptic J2000
frame. Physical/visual data are bundled so the premium client can render
textured planets, moons, rings, and orbits. Everything is flagged DERIVED /
INFERRED with credit to NASA/JPL — never presented as a direct measurement.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from .provenance import SourceType, ConfidenceClass, VisualisationMode

# --------------------------------------------------------------------------- #
# JPL approximate Keplerian elements (J2000), and their per-century rates.
# a [AU], angles [deg]; L = mean longitude, peri = longitude of perihelion,
# node = longitude of ascending node.   Source: NASA/JPL SSD (Standish).
# fields: a, e, I, L, peri, node  then the six rates per Julian century.
# --------------------------------------------------------------------------- #
ELEMENTS = {
    "Mercury": [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
                0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    "Venus":   [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
                0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
    "Earth":   [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
                0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    "Mars":    [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
                0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    "Jupiter": [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
                -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    "Saturn":  [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
                -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    "Uranus":  [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503,
                -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    "Neptune": [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574,
                0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
}

# Physical + visual + descriptive data. radius_km equatorial; rotation_h is the
# sidereal rotation period (negative = retrograde); tilt deg; palette drives the
# procedural client texture.
BODIES = {
    "Sun": {
        "type": "star", "radius_km": 695700, "rotation_h": 609.12, "tilt_deg": 7.25,
        "palette": {"base": "#fff4d6", "hot": "#ffd45e", "spot": "#ff9d2f"},
        "facts": {"class": "G2V main-sequence star", "mass": "1.989e30 kg",
                  "surface_temp": "5,772 K", "composition": "73% H, 25% He",
                  "note": "Contains 99.86% of the Solar System's mass."},
    },
    "Mercury": {
        "type": "terrestrial", "radius_km": 2439.7, "rotation_h": 1407.6, "tilt_deg": 0.034,
        "palette": {"base": "#8c8377", "low": "#5c554c", "high": "#b6ab98"},
        "facts": {"day_length": "176 Earth days", "year_length": "88 days",
                  "mean_temp": "167 °C", "gravity": "3.7 m/s²", "moons": 0,
                  "note": "Smallest planet; extreme temperature swings, no atmosphere."},
    },
    "Venus": {
        "type": "terrestrial", "radius_km": 6051.8, "rotation_h": -5832.5, "tilt_deg": 177.4,
        "palette": {"base": "#d9b97a", "low": "#b58e4c", "high": "#f0dcae"},
        "atmosphere": "#e8c98a",
        "facts": {"day_length": "117 Earth days", "year_length": "225 days",
                  "mean_temp": "464 °C", "gravity": "8.87 m/s²", "moons": 0,
                  "note": "Hottest planet; thick CO₂ atmosphere, retrograde spin."},
    },
    "Earth": {
        "type": "terrestrial", "radius_km": 6371.0, "rotation_h": 23.934, "tilt_deg": 23.44,
        "palette": {"ocean": "#1b4d8c", "land": "#3f7d3a", "ice": "#eef4f8", "cloud": "#ffffff"},
        "atmosphere": "#5b8fd6",
        "facts": {"day_length": "24 hours", "year_length": "365.25 days",
                  "mean_temp": "15 °C", "gravity": "9.81 m/s²", "moons": 1,
                  "note": "The only world known to harbour life."},
    },
    "Mars": {
        "type": "terrestrial", "radius_km": 3389.5, "rotation_h": 24.623, "tilt_deg": 25.19,
        "palette": {"base": "#b5532a", "low": "#7d3318", "high": "#d98a5c", "ice": "#f0ece6"},
        "atmosphere": "#c97a4a",
        "facts": {"day_length": "24.6 hours", "year_length": "687 days",
                  "mean_temp": "-65 °C", "gravity": "3.71 m/s²", "moons": 2,
                  "note": "The Red Planet; home to Olympus Mons, the tallest volcano."},
    },
    "Jupiter": {
        "type": "gas_giant", "radius_km": 69911, "rotation_h": 9.925, "tilt_deg": 3.13,
        "palette": {"base": "#d8b48a", "band1": "#b07a4a", "band2": "#e8d3b0", "spot": "#c1503a"},
        "rings": {"inner": 1.4, "outer": 1.8, "opacity": 0.10, "color": "#9c8a72"},
        "facts": {"day_length": "9.9 hours", "year_length": "11.9 years",
                  "mean_temp": "-110 °C", "gravity": "24.79 m/s²", "moons": 95,
                  "note": "Largest planet; the Great Red Spot is a centuries-old storm."},
    },
    "Saturn": {
        "type": "gas_giant", "radius_km": 58232, "rotation_h": 10.7, "tilt_deg": 26.73,
        "palette": {"base": "#e6d3a3", "band1": "#cdb27a", "band2": "#f2e6c2", "spot": "#d8b884"},
        "rings": {"inner": 1.2, "outer": 2.3, "opacity": 0.85, "color": "#d8c9a3"},
        "facts": {"day_length": "10.7 hours", "year_length": "29.4 years",
                  "mean_temp": "-140 °C", "gravity": "10.44 m/s²", "moons": 146,
                  "note": "Famous for its spectacular ring system of ice and rock."},
    },
    "Uranus": {
        "type": "ice_giant", "radius_km": 25362, "rotation_h": -17.24, "tilt_deg": 97.77,
        "palette": {"base": "#a7dbe0", "band1": "#8fcfd6", "band2": "#c4ecef", "spot": "#9bd5db"},
        "rings": {"inner": 1.6, "outer": 2.0, "opacity": 0.22, "color": "#7fa9ad"},
        "facts": {"day_length": "17.2 hours", "year_length": "84 years",
                  "mean_temp": "-195 °C", "gravity": "8.69 m/s²", "moons": 28,
                  "note": "Rolls on its side (98° tilt); coldest planetary atmosphere."},
    },
    "Neptune": {
        "type": "ice_giant", "radius_km": 24622, "rotation_h": 16.11, "tilt_deg": 28.32,
        "palette": {"base": "#3b66cc", "band1": "#2c4fa8", "band2": "#5a82e0", "spot": "#1f3a86"},
        "rings": {"inner": 1.5, "outer": 2.1, "opacity": 0.12, "color": "#6a7fae"},
        "facts": {"day_length": "16.1 hours", "year_length": "164.8 years",
                  "mean_temp": "-200 °C", "gravity": "11.15 m/s²", "moons": 16,
                  "note": "Windiest planet; gales reach 2,100 km/h."},
    },
}

# Dwarf planets — approximate orbital elements (a,e,I,L,peri,node + mean-motion
# rate dL deg/century; other rates ~0). Positions are illustrative-grade.
DWARF_ELEMENTS = {
    # a, e, I, L, peri, node, da, de, dI, dL, dperi, dnode
    "Ceres":    [2.7675, 0.0758, 10.594, 95.99, 153.90, 80.33, 0, 0, 0, 7826.0, 0, 0],
    "Pluto":    [39.482, 0.2488, 17.160, 238.93, 224.07, 110.30, 0, 0, 0, 145.20, 0, 0],
    "Haumea":   [43.130, 0.1950, 28.190, 240.00, 240.20, 121.90, 0, 0, 0, 127.10, 0, 0],
    "Makemake": [45.790, 0.1590, 28.980, 165.00, 296.00, 79.40, 0, 0, 0, 116.20, 0, 0],
    "Eris":     [67.780, 0.4410, 44.040, 204.16, 151.00, 35.95, 0, 0, 0, 64.50, 0, 0],
}
DWARF_BODIES = {
    "Ceres": {"radius_km": 469.7, "rotation_h": 9.07, "tilt_deg": 4.0,
              "palette": {"base": "#7d7468", "low": "#5a534a", "high": "#9a8f80"},
              "facts": {"type": "dwarf planet (asteroid belt)", "year_length": "4.6 years",
                        "moons": 0, "note": "Largest object in the asteroid belt; may hold subsurface brine."}},
    "Pluto": {"radius_km": 1188.3, "rotation_h": -153.3, "tilt_deg": 122.5,
              "palette": {"base": "#c9a98a", "low": "#8a6f59", "high": "#e8d6c0", "ice": "#f2ece3"},
              "facts": {"type": "dwarf planet (Kuiper belt)", "year_length": "248 years",
                        "moons": 5, "note": "Has a heart-shaped nitrogen-ice plain, Sputnik Planitia."}},
    "Haumea": {"radius_km": 816.0, "rotation_h": 3.9, "tilt_deg": 0.0,
               "palette": {"base": "#d8d2c8", "low": "#b3aaa0", "high": "#f0ece6"},
               "facts": {"type": "dwarf planet (Kuiper belt)", "year_length": "283 years",
                         "moons": 2, "note": "Spins so fast it is stretched into an ellipsoid; has a ring."}},
    "Makemake": {"radius_km": 715.0, "rotation_h": 22.5, "tilt_deg": 0.0,
                 "palette": {"base": "#b06a4a", "low": "#7d4a32", "high": "#d59070"},
                 "facts": {"type": "dwarf planet (Kuiper belt)", "year_length": "310 years",
                           "moons": 1, "note": "Reddish, methane-frost surface near the edge of the Kuiper belt."}},
    "Eris": {"radius_km": 1163.0, "rotation_h": 378.0, "tilt_deg": 78.0,
             "palette": {"base": "#cfcec9", "low": "#a6a59f", "high": "#eeede9"},
             "facts": {"type": "dwarf planet (scattered disc)", "year_length": "558 years",
                       "moons": 1, "note": "As massive as Pluto; its discovery triggered the 'planet' debate."}},
}

# Extra descriptive facts merged into each planet's card (information richness).
EXTRA_FACTS = {
    "Mercury": {"mass": "3.30×10²³ kg", "diameter": "4,879 km", "composition": "Rocky, with an oversized iron core"},
    "Venus":   {"mass": "4.87×10²⁴ kg", "diameter": "12,104 km", "atmosphere": "96% CO₂ — 90× Earth's pressure"},
    "Earth":   {"mass": "5.97×10²⁴ kg", "diameter": "12,742 km", "atmosphere": "78% N₂, 21% O₂ — liquid-water oceans"},
    "Mars":    {"mass": "6.42×10²³ kg", "diameter": "6,779 km", "composition": "Iron-oxide dust; thin CO₂ atmosphere"},
    "Jupiter": {"mass": "1.90×10²⁷ kg", "diameter": "139,820 km", "composition": "Hydrogen/helium gas giant"},
    "Saturn":  {"mass": "5.68×10²⁶ kg", "diameter": "116,460 km", "composition": "H/He gas giant — less dense than water"},
    "Uranus":  {"mass": "8.68×10²⁵ kg", "diameter": "50,724 km", "composition": "Ice giant; methane gives its blue tint"},
    "Neptune": {"mass": "1.02×10²⁶ kg", "diameter": "49,244 km", "composition": "Ice giant; 2,100 km/h supersonic winds"},
}

# Notable surface landmarks per body: name, latitude, longitude (deg), type, info.
# Positions are approximate (for labelling/education, not survey-grade).
LANDMARKS = {
    "Earth": [
        ("Mount Everest", 27.99, 86.93, "Highest mountain", "Earth's highest peak at 8,849 m, in the Himalayas."),
        ("K2", 35.88, 76.51, "2nd-highest mountain", "The 'Savage Mountain' (8,611 m) in the Karakoram — the hardest 8,000 m peak to climb."),
        ("Mariana Trench", 11.35, 142.2, "Deepest ocean point", "The deepest known point on Earth, −10,935 m."),
        ("Grand Canyon", 36.1, -112.1, "Canyon", "A 1.8 km-deep canyon carved by the Colorado River."),
        ("Mt Kilimanjaro", -3.07, 37.35, "Volcano", "Africa's highest peak, a 5,895 m free-standing volcano."),
        ("Amazon Rainforest", -3.0, -62.0, "Rainforest", "The largest tropical rainforest, home to ~10% of known species."),
        ("Sahara Desert", 23.0, 13.0, "Desert", "The largest hot desert, about the size of the USA."),
        ("Great Barrier Reef", -18.3, 147.7, "Coral reef", "The largest living structure on Earth, visible from space."),
        ("Uluru", -25.34, 131.04, "Monolith", "A vast sandstone monolith sacred to the Aṉangu people."),
    ],
    "Mars": [
        ("Olympus Mons", 18.65, -133.8, "Volcano", "The tallest volcano in the Solar System — ~22 km high, 3× Everest."),
        ("Valles Marineris", -14.0, -59.0, "Canyon system", "A canyon system 4,000 km long and up to 7 km deep."),
        ("Gale Crater", -5.4, 137.8, "Crater", "Landing site of NASA's Curiosity rover (2012)."),
        ("Jezero Crater", 18.4, 77.7, "Crater", "Landing site of the Perseverance rover — an ancient river delta."),
    ],
    "Mercury": [("Caloris Basin", 30.5, -170.0, "Impact basin", "One of the largest impact basins, ~1,550 km across.")],
    "Venus": [("Maxwell Montes", 65.0, 3.0, "Mountains", "The highest mountains on Venus, ~11 km above the mean radius.")],
    "Jupiter": [("Great Red Spot", -22.0, -1.0, "Storm", "A giant anticyclone wider than Earth, raging for centuries.")],
}
# Landmarks for major moons.
MOON_LANDMARKS = {
    "Moon": [
        ("Sea of Tranquility", 8.5, 31.4, "Mare", "Apollo 11 landing site — humanity's first steps on another world (1969)."),
        ("Tycho", -43.3, -11.4, "Crater", "A young crater with bright rays splayed across the near side."),
        ("Copernicus", 9.6, -20.1, "Crater", "A prominent 93 km impact crater with terraced walls."),
    ],
}

# Major moons: parent, semi-major axis [km], period [days], radius [km], colour.
MOONS = {
    "Moon":      ("Earth", 384400, 27.32, 1737.4, "#c9c4bd"),
    "Phobos":    ("Mars", 9376, 0.319, 11.3, "#8a7b6b"),
    "Deimos":    ("Mars", 23463, 1.263, 6.2, "#9c8e7e"),
    "Io":        ("Jupiter", 421700, 1.769, 1821.6, "#e8d24a"),
    "Europa":    ("Jupiter", 671034, 3.551, 1560.8, "#cdbfa6"),
    "Ganymede":  ("Jupiter", 1070412, 7.155, 2634.1, "#9a8f80"),
    "Callisto":  ("Jupiter", 1882709, 16.689, 2410.3, "#6b6258"),
    "Titan":     ("Saturn", 1221830, 15.945, 2574.7, "#d9a441"),
    "Enceladus": ("Saturn", 238020, 1.370, 252.1, "#eef3f5"),
    "Rhea":      ("Saturn", 527108, 4.518, 763.8, "#c4c0b8"),
    "Titania":   ("Uranus", 435910, 8.706, 788.4, "#a8a29a"),
    "Oberon":    ("Uranus", 583520, 13.463, 761.4, "#988f86"),
    "Triton":    ("Neptune", 354759, -5.877, 1353.4, "#cdd4d6"),
}

J2000_JD = 2451545.0
AU_KM = 149_597_870.7


def _deg(x):
    return x * math.pi / 180.0


def _kepler_xyz(el: list, jd: float) -> tuple[float, float, float]:
    """Heliocentric ecliptic J2000 position [AU] from a 12-element list."""
    T = (jd - J2000_JD) / 36525.0
    a = el[0] + el[6] * T
    e = el[1] + el[7] * T
    I = _deg(el[2] + el[8] * T)
    L = el[3] + el[9] * T
    peri = el[4] + el[10] * T
    node = el[5] + el[11] * T

    M = math.radians((L - peri) % 360.0)
    if M > math.pi:
        M -= 2 * math.pi
    # Solve Kepler's equation M = E - e sin E (Newton iteration).
    E = M + e * math.sin(M)
    for _ in range(8):
        dE = (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        E -= dE
        if abs(dE) < 1e-9:
            break

    xp = a * (math.cos(E) - e)
    yp = a * math.sqrt(1 - e * e) * math.sin(E)

    w = _deg(peri - node)   # argument of perihelion
    om = _deg(node)
    cw, sw = math.cos(w), math.sin(w)
    co, so = math.cos(om), math.sin(om)
    ci, si = math.cos(I), math.sin(I)

    x = (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp
    y = (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp
    z = (sw * si) * xp + (cw * si) * yp
    return x, y, z


def heliocentric_xyz(planet: str, jd: float) -> tuple[float, float, float]:
    """Heliocentric ecliptic J2000 position [AU] of a planet at Julian date jd."""
    return _kepler_xyz(ELEMENTS[planet], jd)


def now_jd() -> float:
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    # Julian Date from Unix epoch.
    return 2440587.5 + now.timestamp() / 86400.0


def build_payload(release: str) -> dict:
    jd = now_jd()
    provenance = {
        "source_type": SourceType.DERIVED.value,
        "confidence": ConfidenceClass.INFERRED.value,
        "visualisation_mode": VisualisationMode.MESH.value,
        "distance_method": "ephemeris_keplerian",
        "model": "JPL approximate Keplerian elements (Standish, valid 1800–2050)",
        "credit": "Orbital elements & body data: NASA/JPL Solar System Dynamics",
        "dataset_release": release,
    }

    def _lm(rows):
        return [{"name": n, "lat": la, "lon": lo, "type": t, "info": i} for (n, la, lo, t, i) in rows]

    def _entry(name, el, b, category):
        x, y, z = _kepler_xyz(el, jd)
        body_moons = [{"name": mn, "a_km": d[1], "period_days": d[2],
                       "radius_km": d[3], "color": d[4],
                       "landmarks": _lm(MOON_LANDMARKS.get(mn, []))}
                      for mn, d in MOONS.items() if d[0] == name]
        return {
            "name": name, "type": b["type"], "category": category,
            "elements": {
                "a": el[0], "e": el[1], "I": el[2], "L": el[3], "peri": el[4], "node": el[5],
                "da": el[6], "de": el[7], "dI": el[8], "dL": el[9], "dperi": el[10], "dnode": el[11],
            },
            "position_au": [round(x, 6), round(y, 6), round(z, 6)],
            "distance_au": round(math.sqrt(x*x + y*y + z*z), 5),
            "radius_km": b["radius_km"], "rotation_h": b["rotation_h"], "tilt_deg": b["tilt_deg"],
            "palette": b["palette"], "atmosphere": b.get("atmosphere"),
            "rings": b.get("rings"), "moons": body_moons,
            "landmarks": _lm(LANDMARKS.get(name, [])),
            "facts": {**EXTRA_FACTS.get(name, {}), **b["facts"]},
        }

    planets = [_entry(n, el, BODIES[n], "planet") for n, el in ELEMENTS.items()]
    planets += [_entry(n, DWARF_ELEMENTS[n], {**DWARF_BODIES[n], "type": "dwarf_planet"}, "dwarf")
                for n in DWARF_ELEMENTS]

    return {
        "layer": "solar_system",
        "frame": "Heliocentric ecliptic J2000 (AU)",
        "epoch_jd": jd,
        "au_km": AU_KM,
        "provenance": provenance,
        "sun": {"name": "Sun", **BODIES["Sun"], "radius_km": BODIES["Sun"]["radius_km"]},
        "planets": planets,
        "asteroid_belt": {"inner_au": 2.2, "outer_au": 3.2, "count": 1500,
                          "color": "#9c8f7a",
                          "note": "Procedural representation of the main belt between Mars and Jupiter."},
    }


def write_payload(delivery_dir: Path, release: str) -> dict:
    payload = build_payload(release)
    delivery_dir.mkdir(parents=True, exist_ok=True)
    (delivery_dir / "solar_system.json").write_text(json.dumps(payload, indent=1))
    return payload
