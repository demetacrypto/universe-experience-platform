// Deep-knowledge layer: curated stories, "did you know" facts and scale
// comparisons for every notable object. Rendered inside the inspector card.
// All entries are standard, well-established astronomy — no speculation
// (except entries explicitly marked theoretical).

export const KNOWLEDGE = {
  // ---- star ------------------------------------------------------------
  "Sun": {
    story: "A photon born in the Sun's core takes on the order of 100,000 years to random-walk to the surface — then just 8 minutes 20 seconds to reach your eyes. Every second the Sun fuses about 600 million tonnes of hydrogen, converting 4 million tonnes of matter directly into light.",
    dyk: "The Sun contains 99.86% of all the mass in the Solar System.",
    scale: "About 1.3 million Earths would fit inside the Sun.",
  },

  // ---- planets -----------------------------------------------------------
  "Mercury": {
    story: "Mercury's solar day is longer than its year: it orbits the Sun in 88 Earth days but a single sunrise-to-sunrise takes 176. With almost no atmosphere to hold heat, the surface swings from 430 °C at noon to −180 °C at night — the most extreme temperature range of any planet.",
    dyk: "The 1,550 km Caloris basin was carved by an impact so violent it raised chaotic 'weird terrain' on the exact opposite side of the planet.",
    scale: "Only slightly larger than our Moon — Ganymede and Titan are both bigger than Mercury.",
  },
  "Venus": {
    story: "A runaway greenhouse effect makes Venus hotter than Mercury despite being twice as far from the Sun — 465 °C beneath crushing 92-bar skies of carbon dioxide and sulfuric-acid cloud. It also spins backwards, so the Sun rises in the west, and its day (243 Earth days) is longer than its year (225).",
    dyk: "Surface pressure on Venus equals the pressure 900 m under Earth's ocean — early Soviet landers survived barely an hour.",
    scale: "Almost Earth's twin in size (95% of Earth's diameter) — and utterly unlike it in every other way.",
  },
  "Earth": {
    story: "The only world known to harbour life. Oceans cover 71% of its surface, a molten-iron dynamo raises the magnetic shield that deflects the solar wind, and plate tectonics constantly recycles the crust — a combination found nowhere else in the known universe.",
    dyk: "Earth is the densest planet in the Solar System, and the only one not named after a god.",
    scale: "Light circles Earth 7.5 times in one second — yet takes 4.2 years to reach the nearest star.",
  },
  "Mars": {
    story: "Half of Mars is a story of loss: dry river deltas, lake beds and flood channels record a warmer, wetter world that faded when the planet's magnetic field died and the solar wind stripped its air away. What remains is a cold desert with 1% of Earth's atmospheric pressure.",
    dyk: "Olympus Mons rises 22 km — two and a half Everests — and Valles Marineris would stretch from New York to Los Angeles.",
    scale: "Mars's total surface area roughly equals Earth's dry land area.",
  },
  "Jupiter": {
    story: "Jupiter outweighs every other planet combined — two and a half times over. Its Great Red Spot, a storm wider than Earth, has raged for at least 190 years (and possibly 350+), while the planet spins so fast that a full day lasts just 9.9 hours, visibly flattening it at the poles.",
    dyk: "Jupiter's gravity acts as the Solar System's shield, deflecting or capturing comets — as it did Shoemaker–Levy 9 in 1994.",
    scale: "1,300 Earths fit inside Jupiter; its magnetosphere is the largest structure in the Solar System after the Sun's own heliosphere.",
  },
  "Saturn": {
    story: "Saturn's rings span 280,000 km — three-quarters of the Earth–Moon distance — yet in most places they are thinner than a football pitch is long: billions of ice fragments from snowflake-size to house-size, each on its own orbit. The planet itself is so light it would float in water.",
    dyk: "A bizarre, perfectly hexagonal jet stream — wider than two Earths — has been spinning at Saturn's north pole since at least 1981.",
    scale: "Saturn's rings are about 10–1000 m thick: to scale, thinner than a sheet of paper spanning a city.",
  },
  "Uranus": {
    story: "Something enormous knocked Uranus onto its side long ago: it rolls around the Sun with a 98° tilt, giving each pole 42 years of continuous sunlight followed by 42 years of darkness. It is also the coldest planet, dipping to −224 °C — colder even than more distant Neptune.",
    dyk: "Uranus was the first planet discovered with a telescope (William Herschel, 1781) — it doubled the known size of the Solar System overnight.",
    scale: "63 Earths would fit inside Uranus.",
  },
  "Neptune": {
    story: "Neptune was discovered with mathematics before telescopes: in 1846 Le Verrier predicted its position from irregularities in Uranus's orbit, and it was found within 1° of his prediction. Its supersonic winds reach 2,100 km/h — the fastest in the Solar System, powered by a heat source still not fully understood.",
    dyk: "Neptune has completed just one full orbit since its discovery — its year lasts 165 Earth years.",
    scale: "Neptune is 30 times farther from the Sun than Earth; sunlight there is 900× dimmer.",
  },

  // ---- dwarf planets ------------------------------------------------------
  "Pluto": {
    story: "New Horizons (2015) revealed Pluto as a world, not a dot: a 1,000-km nitrogen-ice glacier shaped like a heart (Sputnik Planitia), water-ice mountains the height of the Rockies, and a blue, layered haze. Its moon Charon is so large the two orbit a point in open space between them.",
    dyk: "Pluto is smaller than our Moon — but its heart-shaped glacier is the largest known glacier in the Solar System.",
    scale: "Sunlight takes 5.5 hours to reach Pluto; at noon it is about as bright as Earth just after sunset.",
  },
  "Ceres": {
    story: "Ceres, the largest body in the asteroid belt, holds about a third of the belt's entire mass. The Dawn spacecraft found dazzling white spots in Occator crater — salt crusts left by briny water seeping up from a possible subsurface reservoir, making Ceres a quiet candidate in the search for habitability.",
    dyk: "When discovered in 1801, Ceres was celebrated as a new planet for half a century before being reclassified.",
    scale: "Ceres is about the size of Texas — yet it is 14× more massive than the next largest asteroid.",
  },
  "Haumea": {
    story: "Haumea spins faster than any large body in the Solar System — a full rotation every 3.9 hours — so fast it has been stretched into an egg, twice as long as it is wide. A 2017 stellar occultation delivered a surprise: Haumea has a ring, the first ever found around a dwarf planet.",
    dyk: "Haumea's two moons and its ring are likely debris from an ancient shattering collision.",
    scale: "If placed on Earth's surface, Haumea's long axis would stretch from London past Moscow.",
  },
  "Makemake": {
    story: "Makemake is the second-brightest object in the Kuiper Belt after Pluto, coated in frozen methane that reddens under cosmic rays. When it passed in front of a star in 2011, its shadow revealed something stark: no global atmosphere — unlike Pluto, it stays frozen out.",
    dyk: "Makemake was discovered days after Easter 2005 and is named for the creator god of Rapa Nui (Easter Island).",
    scale: "About 60% of Pluto's diameter — roughly the width of Alaska.",
  },
  "Eris": {
    story: "Eris broke the Solar System: discovered in 2005 and found to be more massive than Pluto, it forced astronomers to decide what 'planet' means — and in 2006 both were classified as dwarf planets. It patrols the scattered disk, three times farther out than Pluto.",
    dyk: "Eris is named for the Greek goddess of discord — a nod to the debate it ignited.",
    scale: "At 96 AU, sunlight takes more than 13 hours to reach Eris.",
  },

  // ---- moons ---------------------------------------------------------------
  "Moon": {
    story: "The Moon was likely born in violence: a Mars-sized world struck the young Earth, and the debris coalesced in orbit. It has been drifting away ever since — 3.8 cm per year, measured by laser against reflectors the Apollo crews left behind — slowly lengthening Earth's day.",
    dyk: "The Moon always shows the same face because Earth's tides locked its rotation aeons ago — yet both hemispheres get equal sunlight.",
    scale: "All seven other planets would fit, side by side, in the gap between Earth and the Moon.",
  },
  "Io": {
    story: "Caught in a gravitational tug-of-war between Jupiter, Europa and Ganymede, Io is kneaded like dough — and melts. It is the most volcanically active world known, with 400+ volcanoes and lava fountains that leap hundreds of kilometres into space.",
    dyk: "Io turns itself inside out: its entire surface is repaved by eruptions roughly every million years — no impact craters survive.",
    scale: "Io's volcanoes outpower all of Earth's volcanoes combined by a factor of ~100.",
  },
  "Europa": {
    story: "Beneath a cracked shell of ice a few kilometres thick, Europa hides a salty ocean 60–150 km deep — holding perhaps twice the liquid water of all Earth's oceans. Tidal flexing keeps it liquid and may feed hydrothermal vents: chemistry, water and energy, together in one place.",
    dyk: "The reddish-brown cracks lacing Europa's ice are salts and sulfur compounds seeping up from the ocean below.",
    scale: "Europa is slightly smaller than our Moon, yet may contain more liquid water than Earth.",
  },
  "Ganymede": {
    story: "Ganymede is the largest moon in the Solar System — bigger than the planet Mercury — and the only moon that generates its own magnetic field, betraying a molten iron core. Beneath its ancient icy crust, layers of ocean and ice may stack like a planetary parfait.",
    dyk: "Ganymede's auroras, watched by Hubble, wobble in a way that proves a saltwater ocean lies below.",
    scale: "If Ganymede orbited the Sun instead of Jupiter, it would comfortably count as a planet.",
  },
  "Callisto": {
    story: "Callisto wears the most cratered surface in the Solar System — a 4-billion-year-old record of bombardment, essentially untouched by geology since. Far enough from Jupiter to escape both the radiation belts and tidal heating, it is quietly considered the safest harbour for future crewed bases in the Jovian system.",
    dyk: "Even battered Callisto probably hides a subsurface ocean, revealed by its response to Jupiter's magnetic field.",
    scale: "Nearly the size of Mercury, but with barely a third of its density — half rock, half ice.",
  },
  "Titan": {
    story: "Titan is the only moon with a thick atmosphere and the only world besides Earth with standing liquid on its surface — but its rain is methane, its rivers carve water-ice bedrock, and its seas (Kraken Mare is larger than the Caspian) are liquid natural gas at −179 °C.",
    dyk: "In Titan's low gravity and dense air, a human could strap on wings and fly.",
    scale: "Titan's atmosphere is 1.5× denser than Earth's — the Huygens probe landed there in 2005, the most distant landing ever made.",
  },
  "Enceladus": {
    story: "Tiny Enceladus — 500 km across — fires curtains of salty water hundreds of kilometres into space from four 'tiger stripe' fractures at its south pole. Cassini flew through the plumes and tasted organics, silica from hot rock, and hydrogen: the signature of hydrothermal vents on an ocean floor.",
    dyk: "The geysers of Enceladus feed Saturn's entire E-ring — the moon writes its signature around the planet.",
    scale: "Enceladus would fit inside the state of Arizona, yet it may be the most promising place to look for life beyond Earth.",
  },
  "Triton": {
    story: "Triton orbits Neptune backwards — the only large moon that does — because it isn't native: it is a captured Kuiper Belt object, a sibling of Pluto that strayed too close. Voyager 2 saw geysers of nitrogen erupting through its pink ice at −235 °C, the coldest surveyed surface in the Solar System.",
    dyk: "Triton is spiralling slowly inward; in a few billion years Neptune's tides will tear it into a new ring system.",
    scale: "Triton is 40% more massive than Pluto — the Kuiper Belt's lost king.",
  },

  // ---- exoplanet systems ----------------------------------------------------
  "TRAPPIST-1": {
    story: "Seven Earth-sized worlds circle this ultracool red dwarf in orbits tighter than Mercury's — three of them in the habitable zone. The planets are locked in a resonance chain (8:5:3:2 rhythms); translated into sound, their orbits literally play music. All seven likely show one face eternally to their star.",
    dyk: "Stand on TRAPPIST-1e and the neighbouring planets would hang in the sky larger than our full Moon.",
    scale: "The entire seven-planet system would fit six times over inside Mercury's orbit.",
  },
  "Proxima Cen": {
    story: "The closest star to the Sun — 4.24 light-years — hosts a planet whose radial-velocity signal implies a minimum mass of about 1.07 Earth masses. Its radius has not been measured. The orbit falls within a modelled habitable-zone boundary, but Proxima is a violent flare star and habitability remains unknown.",
    dyk: "Today's fastest spacecraft would need ~70,000 years to reach Proxima b.",
    scale: "Proxima b's year lasts just 11.2 Earth days — its 'habitable zone' hugs a star 600× dimmer than the Sun.",
  },
  "Kepler-90": {
    story: "Kepler-90 is the only known planetary system that matches the Solar System's count of eight planets — the eighth found by a neural network digging through Kepler data in 2017. But it is a compressed mirror: all eight orbits would fit inside Earth's.",
    dyk: "Kepler-90i, the machine-learned planet, is a scorched rock at 425 °C.",
    scale: "Eight planets packed into 1 AU — like our Solar System folded to fit inside Earth's orbit.",
  },
  "51 Peg": {
    story: "In 1995, 51 Pegasi b shattered every theory of planet formation: a Jupiter-mass world orbiting its star in 4.2 days, closer than Mercury. The first exoplanet found around a Sun-like star — and the discovery that won Mayor and Queloz the 2019 Nobel Prize in Physics.",
    dyk: "Before 51 Peg b, 'hot Jupiters' were considered impossible; now they are a whole class of worlds.",
    scale: "51 Peg b orbits 20× closer to its star than Earth does to the Sun — its sky-facing side roasts at ~1,000 °C.",
  },
  "HD 209458": {
    story: "The first exoplanet ever seen crossing its star (1999) — and the first caught evaporating: HD 209458 b trails a comet-like tail of escaping hydrogen thousands of kilometres long, boiled off by its star at a rate of ~10,000 tonnes per second.",
    dyk: "Despite losing 10,000 tonnes of atmosphere per second, the planet will survive for billions of years.",
    scale: "Its puffed-up atmosphere makes it 35% wider than Jupiter with only 70% of the mass.",
  },
  "Kepler-452": {
    story: "Kepler-452 b was announced as 'Earth's older cousin': a super-Earth in the habitable zone of a Sun-like star, receiving similar light to Earth — but 1.5 billion years further along. If it hosts life, that life has had far longer to evolve than ours.",
    dyk: "Kepler-452 b's star is 20% brighter than the Sun — a preview of the conditions Earth will face in ~1 billion years.",
    scale: "Its year is 385 days — startlingly close to our own calendar.",
  },
  "55 Cnc": {
    story: "55 Cancri e is a lava world eight times Earth's mass whose year lasts 18 hours. Its dayside glows at ~2,400 °C — hot enough that some models suggest oceans of molten rock, skies that rain sand, and, in one famous (later revised) hypothesis, a carbon-rich interior of diamond.",
    dyk: "55 Cancri is visible to the naked eye — you can point at a star and know a lava planet circles it.",
    scale: "55 Cnc e orbits 65× closer to its star than Earth to the Sun.",
  },
  "GJ 1214": {
    story: "GJ 1214 b founded a class of planet our Solar System lacks: the sub-Neptune 'water world'. Too big for rock alone, too small for a gas giant, its density suggests a deep envelope of steam or a global ocean hundreds of kilometres deep beneath an impenetrable haze.",
    dyk: "JWST finally pierced GJ 1214 b's haze in 2023, finding a metal-rich, possibly steam-dominated atmosphere.",
    scale: "Between Earth and Neptune in size — the most common type of planet in the galaxy, and we have none.",
  },
  "HR 8799": {
    story: "HR 8799 is the system we have actually watched move: four super-Jupiters directly photographed orbiting their star, frame by frame across a decade — the first family portrait of another planetary system in motion.",
    dyk: "Each of HR 8799's four planets outweighs Jupiter by 5–9 times.",
    scale: "The outermost planet orbits at ~70 AU — more than twice Neptune's distance.",
  },
  "K2-18": {
    story: "K2-18 b, a temperate sub-Neptune 124 light-years away, became the first habitable-zone planet with water vapour detected in its air (2019). JWST later found methane and CO₂ — consistent with a possible 'hycean' world: a warm ocean beneath a hydrogen sky.",
    dyk: "A tentative JWST hint of dimethyl sulfide — a gas made only by life on Earth — remains unconfirmed and fiercely debated.",
    scale: "K2-18 b is 8.6× Earth's mass; its gravity would make you feel twice as heavy.",
  },

  // ---- nebulae -----------------------------------------------------------------
  "Orion Nebula": {
    story: "The nearest massive star factory — 1,344 light-years away and visible to the naked eye as the fuzzy 'star' in Orion's sword. Inside, the four Trapezium stars flood the cloud with ultraviolet light, sculpting it from within, while over 700 infant stars condense from collapsing gas.",
    dyk: "Hubble found dozens of 'proplyds' in Orion — newborn planetary systems, photographed as silhouettes.",
    scale: "24 light-years across: if placed at Alpha Centauri's distance, it would fill our entire constellation sky.",
  },
  "Eagle Nebula": {
    story: "Home of the Pillars of Creation — towers of cold gas light-years tall, photographed by Hubble in 1995 in one of the most famous images ever made. The pillars are being simultaneously eroded and compressed by the radiation of nearby young stars: destruction and birth in the same frame.",
    dyk: "Some evidence suggests a supernova blast may already have destroyed the Pillars — but the light showing their fate won't reach us for centuries.",
    scale: "The tallest pillar is about 4 light-years high — the Sun-to-Alpha-Centauri distance, standing on end.",
  },
  "Carina Nebula": {
    story: "Four times larger than Orion, the Carina Nebula cradles some of the most massive stars known — including Eta Carinae, a 100-solar-mass monster that erupted in 1843 to become the sky's second-brightest star, and which will one day die as a supernova visible in daylight.",
    dyk: "JWST's first-release image 'Cosmic Cliffs' is a wall of Carina's gas 7 light-years tall.",
    scale: "Roughly 230 light-years across — one of the largest star-forming regions in the Milky Way.",
  },
  "Helix Nebula": {
    story: "The Helix is a preview of our own ending: a Sun-like star that gently exhaled its outer layers, leaving a white-dwarf ember lighting up the expanding shroud. Nicknamed the 'Eye of God', it is one of the closest planetary nebulae — and in ~5 billion years, the Sun will build one much like it.",
    dyk: "The 'planetary nebula' name is an 18th-century mistake — through small telescopes they resembled planets. No planets involved.",
    scale: "The glowing eye spans about 3 light-years; the white dwarf at its centre is the size of Earth.",
  },
  "Crab Nebula": {
    story: "On 4 July 1054, Chinese astronomers logged a 'guest star' bright enough to see in daylight for 23 days. Its debris is the Crab Nebula — still expanding at 1,500 km/s — and at its heart spins the crushed core: a neutron star flashing 30 times a second, a lighthouse made of nuclear matter.",
    dyk: "The Crab pulsar packs 1.4 solar masses into a city-sized sphere; a teaspoon of it would weigh a billion tonnes.",
    scale: "The nebula has grown to 11 light-years across in under a thousand years.",
  },

  // ---- galaxies -----------------------------------------------------------------
  "Milky Way": {
    story: "Our home: a barred spiral of 100–400 billion stars, 100,000+ light-years across, wrapped in a dark-matter halo ten times heavier than everything we can see. The Sun rides a spiral arm 27,000 light-years out, completing one galactic orbit every 230 million years — the last time we were here, dinosaurs were young.",
    dyk: "Andromeda is approaching, but a future Milky Way merger is model-sensitive: simulations allow a close encounter or merger in several billion years, while current motion uncertainties leave other outcomes possible.",
    scale: "If the Solar System were a coin, the Milky Way would be the width of a continent.",
  },
  "Andromeda": {
    story: "At 2.5 million light-years, Andromeda is the most distant object visible to the naked eye — the light hitting your retina left before humans existed. A trillion stars strong, it is blueshifted and approaching the Milky Way, but the timing and even outcome of a future close encounter depend on uncertain transverse motions and Local Group modelling.",
    dyk: "In 1920 astronomers still debated whether Andromeda was a nearby cloud or a separate 'island universe' — Edwin Hubble settled it in 1923 with a single star.",
    scale: "On the sky, Andromeda spans six full Moons — most of it too faint for the eye.",
  },
  "Triangulum": {
    story: "The third member of our Local Group, M33 is a flocculent spiral of 40 billion stars and the most distant object some sharp-eyed humans can glimpse unaided. It hosts NGC 604, one of the largest star-forming regions known — 40 times the size of the Orion Nebula.",
    dyk: "Triangulum may be a satellite of Andromeda — a bridge of hydrogen gas seems to link the two.",
    scale: "About half the Milky Way's diameter, with a tenth of its stars.",
  },
  "Whirlpool": {
    story: "In 1845, using a 72-inch metal mirror in the Irish countryside, Lord Rosse sketched M51's swirling arms — the first spiral structure ever seen in the heavens, decades before anyone knew what galaxies were. Its perfect spiral is powered by the small companion galaxy tugging at its disk.",
    dyk: "The Whirlpool's arms are compression waves: stars pass through them like traffic through a jam.",
    scale: "About 23 million light-years away — the light you see left during Earth's Miocene epoch.",
  },
  "Sombrero": {
    story: "A brilliant white core wrapped in a dark brim of dust, the Sombrero hides a roughly billion-solar-mass black hole — one of the heaviest in our neighbourhood — and swarms of ~2,000 globular clusters, ten times more than the Milky Way's retinue.",
    dyk: "The Sombrero is drifting away from us at over 1,000 km/s, carried by cosmic expansion.",
    scale: "Its halo suggests the Sombrero may be an elliptical galaxy wearing a spiral disguise.",
  },
  "Centaurus A": {
    story: "Centaurus A is a collision still in progress: an elliptical giant digesting a spiral galaxy, its middle slashed by the victim's dust lane. Its central black hole fires plasma jets a million light-years long — at radio wavelengths, one of the largest objects in the sky.",
    dyk: "If your eyes saw radio waves, Centaurus A's jets would appear 20× wider than the full Moon.",
    scale: "The nearest active galactic nucleus to Earth — a laboratory for black-hole physics about 13 million light-years away.",
  },
  "M87": {
    story: "The giant of the Virgo cluster: several trillion stars in a featureless golden ball, 15,000 globular clusters, and at its core the first black hole humanity ever photographed. Its jet of plasma, discovered in 1918, spears 5,000 light-years out at 99.99% the speed of light.",
    dyk: "M87's black hole weighs 6.5 billion Suns — its event horizon would swallow our Solar System whole.",
    scale: "M87 outweighs the Milky Way by an order of magnitude.",
  },

  // ---- black holes ----------------------------------------------------------------
  "Sgr A*": {
    story: "For decades astronomers tracked stars whipping around an invisible point at our galaxy's heart — one, S2, dives within 17 light-hours at 3% of light-speed. Only one object fits the maths: a 4.3-million-solar-mass black hole. In 2022 the Event Horizon Telescope finally photographed its glowing ring.",
    dyk: "Tracking the stars that orbit Sgr A* won Genzel and Ghez the 2020 Nobel Prize in Physics.",
    scale: "Sgr A*'s event horizon is 17× wider than the Sun — yet from Earth it appears as small as a doughnut on the Moon.",
  },
  "M87*": {
    story: "On 10 April 2019, humanity saw a black hole for the first time: a ring of orange light around perfect darkness, 55 million light-years away. The image took eight telescopes spanning the Earth, two years of processing, and half a tonne of hard drives flown between continents.",
    dyk: "The EHT's resolution is equivalent to reading a newspaper in New York — from a café in Paris.",
    scale: "M87*'s shadow is wider than Pluto's entire orbit.",
  },

  // ---- cosmology --------------------------------------------------------------------
  "Cosmic Microwave Background": {
    story: "For 380,000 years the universe was a glowing fog too hot for atoms. The moment it cooled enough for electrons to bind, light escaped — and it is still travelling. Stretched a thousand-fold by cosmic expansion, that first light now hums at 2.725 K from every direction: the oldest photograph in existence.",
    dyk: "About 1% of the static on an untuned analogue TV was the Big Bang's afterglow.",
    scale: "The temperature ripples you see are one part in 100,000 — the seeds that grew into every galaxy.",
  },

  // ---- theoretical ---------------------------------------------------------------------
  "Wormhole": {
    story: "Fold a sheet of paper and punch through: that is the wormhole idea. Morris and Thorne's 1988 traversable model is a hypothetical tunnel held open by exotic negative-energy matter. It is distinct from the 1935 Einstein–Rosen bridge, which is non-traversable.",
    dyk: "The wormhole visuals in the film Interstellar were computed with physicist Kip Thorne's equations — and produced publishable science.",
    scale: "Entirely theoretical: unlike everything else in this atlas, no wormhole has ever been detected.",
  },
  "Morris–Thorne traversable wormhole": {
    story: "Fold a sheet of paper and punch through: that is the wormhole idea. Morris and Thorne's 1988 traversable model is a hypothetical tunnel held open by exotic negative-energy matter. It is distinct from the 1935 Einstein–Rosen bridge, which is non-traversable.",
    dyk: "The wormhole visuals in the film Interstellar were computed with physicist Kip Thorne's equations — and produced publishable science.",
    scale: "Entirely theoretical: unlike everything else in this atlas, no wormhole has ever been detected.",
  },
};

// Fuzzy lookup: exact name → name without "(...)" → key contained in name.
export function lookupKnowledge(name) {
  if (!name) return null;
  if (KNOWLEDGE[name]) return KNOWLEDGE[name];
  const clean = name.replace(/\s*\(.*?\)\s*/g, "").trim();
  if (KNOWLEDGE[clean]) return KNOWLEDGE[clean];
  for (const k of Object.keys(KNOWLEDGE)) {
    if (clean.startsWith(k) || k.startsWith(clean)) return KNOWLEDGE[k];
    if (clean.toLowerCase().includes(k.toLowerCase()) && k.length > 3) return KNOWLEDGE[k];
  }
  return null;
}
