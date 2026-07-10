import { expect, test } from "@playwright/test";

async function enterAtlas(page, { navigate = true } = {}) {
  if (navigate) await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.getByRole("heading", { name: /Enter the observable universe/i })).toBeVisible();
  await page.getByRole("button", { name: "Begin free exploration" }).click();
  await expect(page.locator("body")).not.toHaveClass(/intro-active/);
}

async function waitForRenderedFrame(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

test("renders a full-screen viewport beneath a clear desktop information hierarchy", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();

  const canvas = page.locator("#scene");
  await expect(canvas).toBeVisible();
  await expect(page.locator("#renderInfo")).toContainText(/WebGL|WebGPU ready/);
  await expect(page.locator("#layers")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Enter the observable universe/i })).toBeVisible();
  await expect(page.locator("#layers")).toHaveAttribute("inert", "");
  await expect(page.locator("#enterBtn")).toBeFocused();

  // Resizing while the intro modal is active must not reactivate background
  // drawers, even when the resulting viewport uses the desktop shell.
  await page.setViewportSize({ width: 1360, height: 860 });
  await expect(page.locator("#hud")).toHaveAttribute("inert", "");
  await expect(page.locator("#controlDeck")).toHaveAttribute("inert", "");

  await enterAtlas(page, { navigate: false });
  await expect(page.locator("#layers")).not.toHaveAttribute("inert", "");
  await expect(page.getByRole("navigation", { name: "Universe scale navigator" })).toBeVisible();
  await waitForRenderedFrame(page);
  await expect(page.locator(".layer-btn")).toHaveCount(9);
  await expect(page.getByRole("complementary", { name: "Current layer field notes" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Layer controls" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Experience tools" })).toBeVisible();
  await expect(page.locator("#scaleReadout")).not.toHaveText("—");
  await expect(page.locator("#labels .label3d.planet", { hasText: "Earth" })).toBeVisible();

  const startup = await page.evaluate(() => ({
    coldStartMs: performance.getEntriesByName("uep:cold-start")[0]?.duration,
    readyState: document.documentElement.dataset.uepReady,
    sceneMarks: Object.fromEntries(
      ["solar", "exo", "stars", "cosmic", "bh", "nebula", "galaxies", "cmb", "wh"]
        .map((key) => [key, performance.getEntriesByName(`uep:scene:${key}-ready`).length]),
    ),
  }));
  expect(startup.coldStartMs).toBeGreaterThan(0);
  expect(startup.coldStartMs).toBeLessThan(3_500);
  expect(startup.readyState).toBe("painted");
  expect(startup.sceneMarks).toEqual({
    solar: 1,
    exo: 0,
    stars: 0,
    cosmic: 0,
    bh: 0,
    nebula: 0,
    galaxies: 0,
    cmb: 0,
    wh: 0,
  });

  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const scene = document.querySelector("#scene");
    const gl = scene.getContext("webgl2") || scene.getContext("webgl");
    return {
      viewport: { width: innerWidth, height: innerHeight },
      canvas: rect("#scene"),
      header: rect("#observatoryHeader"),
      heading: rect(".view-heading"),
      hud: rect("#hud"),
      controls: rect("#controlDeck"),
      webgl: Boolean(gl && !gl.isContextLost() && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0),
    };
  });

  expect(layout.webgl).toBe(true);
  expect(layout.canvas).toMatchObject({ left: 0, top: 0 });
  expect(layout.canvas.width).toBeGreaterThanOrEqual(layout.viewport.width);
  expect(layout.canvas.height).toBeGreaterThanOrEqual(layout.viewport.height);
  expect(Math.abs((layout.heading.left + layout.heading.right) / 2 - layout.viewport.width / 2)).toBeLessThan(4);
  expect(layout.hud.top).toBeGreaterThan(layout.header.bottom);
  expect(layout.controls.top).toBeGreaterThan(layout.header.bottom);
  expect(layout.hud.right).toBeLessThan(layout.controls.left);
  expect(layout.hud.bottom).toBeLessThanOrEqual(layout.viewport.height);
  expect(layout.controls.bottom).toBeLessThanOrEqual(layout.viewport.height);
});

test("explores layers with truthful provenance and keyboard-operable tools", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await enterAtlas(page);
  await expect(page.getByText("Solar System", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /02 Exoplanets/ }).click();
  await expect(page.locator("#headerLayerName")).toHaveText("Exoplanet Systems");
  await expect(page.locator("#evidenceStatus")).toContainText("Mixed evidence");

  const search = page.getByRole("searchbox", { name: "Search the universe" });
  await search.fill("Saturn");
  await expect(page.getByRole("option", { name: /Saturn/ })).toBeVisible();
  await page.getByRole("option", { name: /Saturn/ }).click();
  await expect(page.locator("#objName")).toHaveText("Saturn");
  await expect(page.locator("#objCredit")).toContainText("NASA/JPL");

  await page.getByRole("button", { name: "Show sources and acknowledgements" }).click();
  await expect(page.getByRole("dialog", { name: /Sources & acknowledgements/ })).toBeVisible();
  await expect(page.locator("#creditsBody")).toContainText("Cosmic microwave background");
  await page.getByRole("button", { name: "Close sources" }).click();

  const sourcesButton = page.getByRole("button", { name: "Show sources and acknowledgements" });
  await sourcesButton.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog", { name: /Sources & acknowledgements/ })).toBeVisible();
  await page.getByRole("button", { name: "Close sources" }).click();
  await expect(sourcesButton).toBeFocused();

  expect(pageErrors).toEqual([]);
});

test("responsive breakpoint boundaries expose only intentional mobile drawers", async ({ page }) => {
  for (const viewport of [
    { width: 850, height: 844 },
    { width: 1000, height: 450 },
  ]) {
    await page.setViewportSize(viewport);
    await enterAtlas(page);

    await expect(page.getByRole("button", { name: "Controls" })).toBeVisible();
    await expect(page.locator("#controlDeck")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#controlDeck")).toHaveAttribute("inert", "");
    await expect(page.locator("#controlDeck")).toHaveCSS("pointer-events", "none");

    await page.getByRole("button", { name: "Controls" }).click();
    await expect(page.locator("#controlDeck")).not.toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("button", { name: "Pause time" })).toBeVisible();
    await page.getByRole("button", { name: "Close layer controls" }).click();
  }
});

test("modal panels contain focus, inert the atlas, and restore their trigger", async ({ page }) => {
  await enterAtlas(page);
  const helpButton = page.getByRole("button", { name: "Open keyboard shortcuts and accessibility" });
  await helpButton.click();

  const help = page.getByRole("dialog", { name: /Keyboard controls/ });
  const close = page.getByRole("button", { name: "Close keyboard shortcuts" });
  const reduceMotion = page.getByRole("checkbox", { name: /Reduce camera/ });
  await expect(help).toBeVisible();
  await expect(close).toBeFocused();
  await expect(page.locator("#scene")).toHaveAttribute("inert", "");
  await expect(page.locator("#search")).toHaveAttribute("inert", "");

  await page.keyboard.press("Shift+Tab");
  await expect(reduceMotion).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(page.locator("#scene")).not.toHaveAttribute("inert", "");
  await expect(helpButton).toBeFocused();
});

test("defers the procedural first-light texture until that layer is requested", async ({ page }) => {
  await enterAtlas(page);
  expect(await page.evaluate(() => performance.getEntriesByName("uep:scene:cmb-ready").length)).toBe(0);

  await page.getByRole("button", { name: /07 First light/ }).click();
  await expect(page.locator("#headerLayerName")).toHaveText("First Light");
  await waitForRenderedFrame(page);
  expect(await page.evaluate(() => performance.getEntriesByName("uep:scene:cmb-ready").length)).toBe(1);
  const activationMs = await page.evaluate(() =>
    performance.getEntriesByName("uep:layer:cmb-activation-to-painted")[0]?.duration);
  expect(activationMs).toBeGreaterThan(0);
  expect(activationMs).toBeLessThan(1_000);

  await page.getByRole("button", { name: /01 Solar System/ }).click();
  await page.getByRole("button", { name: /07 First light/ }).click();
  expect(await page.evaluate(() => performance.getEntriesByName("uep:scene:cmb-ready").length)).toBe(1);
});

test("mobile shell keeps the viewport clear and exposes intentional drawers", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterAtlas(page);

  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(noOverflow).toBe(true);
  await expect(page.locator("#controlDeck")).toHaveAttribute("aria-hidden", "true");

  await page.getByRole("button", { name: "Controls" }).click();
  await expect(page.locator("#controlDeck")).not.toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button", { name: "Pause time" })).toBeVisible();
  await page.getByRole("button", { name: "Close layer controls" }).click();
  await expect(page.locator("#controlDeck")).toHaveAttribute("aria-hidden", "true");

  await page.getByRole("button", { name: "Field notes" }).click();
  await expect(page.getByRole("complementary", { name: "Current layer field notes" })).toBeVisible();
  await expect(page.locator("#evidenceStatus")).toContainText("Derived");
});

test("reduced motion suppresses camera-route animation", async ({ page }) => {
  await enterAtlas(page);
  await page.getByRole("button", { name: "Open keyboard shortcuts and accessibility" }).click();
  await page.getByRole("checkbox", { name: /Reduce camera/ }).check();
  await expect(page.locator("body")).toHaveClass(/reduce-motion/);
  await page.getByRole("button", { name: "Close keyboard shortcuts" }).click();

  await page.getByRole("button", { name: /04 Nebulae/ }).click();
  await expect(page.locator("#headerLayerName")).toHaveText("Nebulae");
  await expect(page.locator("#routeOverlay")).not.toHaveClass(/active/);
});

test("all nine scientific layers remain reachable", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await enterAtlas(page);
  const layers = [
    [/01 Solar System/, "Solar System"],
    [/02 Exoplanets/, "Exoplanet Systems"],
    [/03 Stellar field/, "Stellar Field"],
    [/04 Nebulae/, "Nebulae"],
    [/05 Galaxies/, "Resolved Galaxies"],
    [/06 Cosmic web/, "Cosmic Web"],
    [/07 First light/, "First Light"],
    [/08 Black holes/, "Black-Hole Horizons"],
    [/09 Wormhole/, "Wormhole Model"],
  ];

  for (const [buttonName, title] of layers) {
    const button = page.getByRole("button", { name: buttonName });
    await button.click();
    await expect(page.locator("#headerLayerName")).toHaveText(title);
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await waitForRenderedFrame(page);
    const rendering = await page.locator("#scene").evaluate((canvas) => {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      return Boolean(gl && !gl.isContextLost() && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0);
    });
    expect(rendering, `${title} should retain a live WebGL surface`).toBe(true);
  }

  expect(pageErrors).toEqual([]);
});

test("scientific inspectors keep modelled and upper-limit evidence explicit", async ({ page }) => {
  await page.route("**/data/delivery/exoplanets.json", async (route) => {
    const response = await route.fetch();
    const sourcePayload = await response.json();
    const payload = {
      ...sourcePayload,
      systems: sourcePayload.systems.map((system) => system.hostname !== "Proxima Cen" ? system : {
        ...system,
        planets: system.planets.map((item) => item.name !== "Proxima Cen b" ? item : {
          ...item,
          radius_earth: null,
          mass_earth: 1.07,
          mass_provenance: "Msini",
          eq_temp_provenance: "modelled",
          in_hz: null,
        }),
      }),
    };
    await route.fulfill({ response, json: payload });
  });

  await enterAtlas(page);
  const search = page.getByRole("searchbox", { name: "Search the universe" });
  await search.fill("Proxima Cen b");
  await page.getByRole("option", { name: /^Proxima Cen b/ }).click();
  await expect(page.locator("#objName")).toHaveText("Proxima Cen b");
  await expect(page.locator("#objTable")).toContainText("RadiusUnknown");
  await expect(page.locator("#objTable")).toContainText("Minimum mass1.07 M⊕");
  await expect(page.locator("#objTable")).toContainText(/Equilibrium temp\d+ K MODELLED/);
  await expect(page.locator("#objTable")).toContainText("In habitable zoneUnknown");

  await search.fill("M33");
  await page.getByRole("option", { name: /Triangulum.*M33/ }).click();
  await expect(page.locator("#objName")).toContainText("Triangulum");
  await expect(page.locator("#objTable")).toContainText("Central objectNON-DETECTION");
  await expect(page.locator("#objTable")).toContainText("Mass upper limit");
});
