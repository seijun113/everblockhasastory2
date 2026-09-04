/* Every Block Has a Story — shared behavior
 *
 * Talks to the real backend (see the separate backend-api project) for
 * accounts, Shopify order verification, and video posting. Only the
 * account's own "who am I" pointer and session tokens are cached in
 * localStorage — everyone's actual account data, verified-purchase status,
 * and posted videos live server-side and are visible to every visitor.
 */

// EDIT THIS: your backend's real Vercel address, e.g. "https://every-block-backend.vercel.app"
const API_BASE = "https://every-block-backend.vercel.app";

// ---------- Nav toggle + page setup ----------
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
  }
  markActiveNav();
  renderAllStoryGrids();
  renderMapPins().then(initCountryZoom);
  wireCarousel();
  initShareGate();
  initShareForm();
  initShop();
  initAccountNav();
  initAccountPage();
  document.querySelectorAll(".chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => filterStories(chip.getAttribute("data-filter")));
  });
});

function markActiveNav() {
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".main-nav a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === path || (path === "" && href === "index.html")) {
      a.classList.add("active");
    }
  });
}

// ---------- Seed story content ----------
// Left empty on purpose — the placeholder/demo stories have been removed.
// Only real posts from the backend show up now. If listStories() can't
// reach the backend, this being empty means the grids just show nothing
// rather than falling back to fake content.
const STORIES = [];

// ---------- Session tokens (the account itself lives server-side; only
// these short-lived tokens are cached locally, same as any normal login) ----------
function getTokens() {
  try {
    return {
      access: localStorage.getItem("ebs_access_token"),
      refresh: localStorage.getItem("ebs_refresh_token"),
    };
  } catch (e) { return { access: null, refresh: null }; }
}
function saveTokens(session) {
  localStorage.setItem("ebs_access_token", session.access_token);
  localStorage.setItem("ebs_refresh_token", session.refresh_token);
}
function clearTokens() {
  localStorage.removeItem("ebs_access_token");
  localStorage.removeItem("ebs_refresh_token");
}

async function tryRefreshToken() {
  const { refresh } = getTokens();
  if (!refresh) return false;
  try {
    const res = await fetch(API_BASE + "/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    saveTokens(data.session);
    return true;
  } catch (e) {
    return false;
  }
}

// Fetch wrapper that attaches the access token and retries once with a
// refreshed token if the first attempt comes back unauthorized.
async function apiFetch(path, options = {}) {
  const { access } = getTokens();
  const headers = Object.assign({}, options.headers, access ? { Authorization: "Bearer " + access } : {});
  let res;
  try {
    res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
  } catch (err) {
    // Wrap raw browser/network errors (cryptic in some browsers, e.g.
    // Safari) with a clearer message that says what was actually happening.
    throw new Error(`Couldn't reach the server for ${path} (${err.message}). Check your internet connection and try again.`);
  }
  if (res.status === 401 && access) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const { access: newAccess } = getTokens();
      const headers2 = Object.assign({}, options.headers, { Authorization: "Bearer " + newAccess });
      try {
        res = await fetch(API_BASE + path, Object.assign({}, options, { headers: headers2 }));
      } catch (err) {
        throw new Error(`Couldn't reach the server for ${path} (${err.message}). Check your internet connection and try again.`);
      }
    }
  }
  return res;
}

// Turns a video record from the backend into the same shape storyCardHTML
// and story.html already expect, so real posts render exactly like the
// seed demo stories.
function videoToStoryShape(v) {
  return {
    id: "v_" + v.id,
    profileId: v.profile_id || null,
    title: v.title,
    caption: v.caption,
    body: v.caption,
    location: v.location,
    country: v.country,
    author: v.author,
    hue: Math.floor(Math.random() * 360),
    videoUrl: v.iframeUrl || null,
    thumbnailUrl: v.thumbnailUrl || null,
    lat: typeof v.lat === "number" ? v.lat : null,
    lng: typeof v.lng === "number" ? v.lng : null,
    likeCount: v.likeCount || 0,
    liked: !!v.liked,
    saved: !!v.saved,
    shareCount: v.shareCount || 0,
  };
}

// ---------- Map pin placement ----------
// Converts real-world lat/lng into a left%/top% position on the site's
// stylized worldmap-base image.
//
// The background is the world-map.min.svg mask (viewBox below), fit into
// the 6%-inset .worldmap-base box via `mask-size: contain`. That SVG's own
// aspect ratio (~1.71) is wider than the box it sits in (~1.33, inherited
// from .hero-map's 4:3 ratio), so the browser fits it to the full WIDTH and
// letterboxes empty space on the TOP and BOTTOM — meaning the horizontal
// and vertical axes need different scale/margin values, not the same one.
// Using one shared value for both (the old approach) pushed everything too
// far north vertically, e.g. New York-latitude pins landing up in Canada.
//
// The svgX/svgY formulas below were fit by pulling the actual SVG, reading
// real bounding boxes for several compact, well-placed countries (Singapore,
// Iceland, UK, Egypt, South Africa, Australia), and least-squares-fitting
// those against their known real-world lat/lng — so this reflects the
// asset's actual (slightly cropped, non-±180/±90) coordinate range rather
// than assuming a textbook equirectangular projection.
function latLngToMapPercent(lat, lng) {
  const VB = { minX: 30.767, minY: 241.591, width: 784.077, height: 458.627 };
  const svgX = 2.3272 * lng + 411.09;
  const svgY = -2.8281 * lat + 534.77;

  // Fraction across the SVG's own drawn artwork (0..1 for on-map locations;
  // can go slightly outside that range for far-Pacific/polar spots this
  // particular map doesn't draw — clamped below so a pin never renders
  // totally off the visible card).
  const fracX = (svgX - VB.minX) / VB.width;
  const fracY = (svgY - VB.minY) / VB.height;

  // Horizontal: no letterboxing (the SVG fills the box's full width).
  const left = 6 + fracX * 88;
  // Vertical: letterboxed — the rendered map only occupies the middle
  // ~68.6% of .worldmap-base's height, offset by ~15.7% from the top.
  const top = 15.68 + fracY * 68.64;

  return {
    left: Math.min(97, Math.max(3, left)),
    top: Math.min(97, Math.max(3, top)),
  };
}

// Adds a pin to the map for every real posted story that has coordinates.
// Seed demo stories already have their own hand-placed pins directly in
// map.html, so only real (v_...) stories are added here to avoid duplicates.
//
// Always clears out any pins THIS function previously added (tagged with
// data-auto-pin) before drawing the current set. Without this, calling it
// twice — e.g. once on page load and again after someone deletes a story —
// would leave the deleted story's pin behind and pile a duplicate of every
// surviving pin on top of itself.
async function renderMapPins() {
  const mapEl = document.querySelector(".hero-map");
  if (!mapEl) return;
  // On the interactive map page, pins live inside .map-zoom-layer so they
  // zoom/pan together with the landmass. Pages without that wrapper (the
  // homepage's small decorative map) fall back to the old behavior.
  const pinTarget = mapEl.querySelector(".map-zoom-layer") || mapEl;
  pinTarget.querySelectorAll(".map-pin[data-auto-pin]").forEach((el) => el.remove());

  const stories = await API.listStories();
  const withCoords = stories.filter(
    (s) => String(s.id).startsWith("v_") && typeof s.lat === "number" && typeof s.lng === "number"
  );
  const pinsHTML = withCoords
    .map((s) => {
      const { left, top } = latLngToMapPercent(s.lat, s.lng);
      const hue = s.hue || 30;
      const color = `hsl(${hue} 40% 45%)`;
      const title = `${s.location || ""} — ${s.title || "Untitled Story"}`;
      return `<a class="map-pin" data-auto-pin="1" href="story.html?id=${encodeURIComponent(s.id)}" style="--pc:${color}; left:${left.toFixed(1)}%; top:${top.toFixed(1)}%;" title="${escapeAttr(title)}"></a>`;
    })
    .join("");
  if (pinsHTML) {
    pinTarget.insertAdjacentHTML("beforeend", pinsHTML);
  }
}

// ---------- Country click-to-zoom (map.html's larger interactive map) ----------
// Clicking a country zooms to its exact shape rather than a hand-drawn
// region box. This works by pulling the same SVG the map's CSS mask uses,
// laying an invisible copy of its real country paths on top for hit
// testing, and reading each one's actual bounding box at click time — so
// the zoom always frames the real country outline, with no manually
// maintained lat/lng boxes to keep in sync.
const COUNTRY_MAP_SVG_URL = "https://raw.githubusercontent.com/cablop/simple-world-map-by-continents/master/world-map.min.svg";

// ISO 3166-1 alpha-2 -> display name, for every country/territory this
// particular map draws (generated from the map's own path ids).
const COUNTRY_NAMES = {"_somaliland":"Somaliland","ae":"United Arab Emirates","af":"Afghanistan","al":"Albania","am":"Armenia","ao":"Angola","ar":"Argentina","at":"Austria","au":"Australia","az":"Azerbaijan","ba":"Bosnia & Herzegovina","bd":"Bangladesh","be":"Belgium","bf":"Burkina Faso","bg":"Bulgaria","bi":"Burundi","bj":"Benin","bn":"Brunei","bo":"Bolivia","br":"Brazil","bs":"Bahamas","bt":"Bhutan","bw":"Botswana","by":"Belarus","bz":"Belize","ca":"Canada","cd":"DR Congo","cf":"Central African Republic","cg":"Congo","ch":"Switzerland","ci":"Côte d’Ivoire","cl":"Chile","cm":"Cameroon","cn":"China","co":"Colombia","cr":"Costa Rica","cu":"Cuba","cv":"Cape Verde","cy":"Cyprus","cz":"Czech Republic","de":"Germany","dk":"Denmark","dj":"Djibouti","dm":"Dominica","do":"Dominican Republic","dz":"Algeria","ec":"Ecuador","ee":"Estonia","eg":"Egypt","er":"Eritrea","es":"Spain","et":"Ethiopia","fi":"Finland","fk":"Falkland Islands","fr":"France","ga":"Gabon","gb":"United Kingdom","ge":"Georgia","gh":"Ghana","gl":"Greenland","gm":"Gambia","gn":"Guinea","gq":"Equatorial Guinea","gr":"Greece","gt":"Guatemala","gw":"Guinea-Bissau","gy":"Guyana","hn":"Honduras","hr":"Croatia","ht":"Haiti","hu":"Hungary","id":"Indonesia","ie":"Ireland","il":"Israel","in":"India","iq":"Iraq","ir":"Iran","is":"Iceland","it":"Italy","jm":"Jamaica","jo":"Jordan","jp":"Japan","ke":"Kenya","kg":"Kyrgyzstan","kh":"Cambodia","km":"Comoros","kp":"North Korea","kr":"South Korea","kw":"Kuwait","kz":"Kazakhstan","la":"Laos","lb":"Lebanon","lc":"St. Lucia","lk":"Sri Lanka","lr":"Liberia","ls":"Lesotho","lt":"Lithuania","lu":"Luxembourg","lv":"Latvia","ly":"Libya","ma":"Morocco","md":"Moldova","me":"Montenegro","mg":"Madagascar","mk":"North Macedonia","ml":"Mali","mm":"Myanmar (Burma)","mn":"Mongolia","mr":"Mauritania","mt":"Malta","mu":"Mauritius","mv":"Maldives","mw":"Malawi","mx":"Mexico","my":"Malaysia","mz":"Mozambique","na":"Namibia","nc":"New Caledonia","ne":"Niger","ng":"Nigeria","ni":"Nicaragua","nl":"Netherlands","no":"Norway","np":"Nepal","nz":"New Zealand","om":"Oman","pa":"Panama","pe":"Peru","pg":"Papua New Guinea","ph":"Philippines","pk":"Pakistan","pl":"Poland","pr":"Puerto Rico","pt":"Portugal","py":"Paraguay","qa":"Qatar","ro":"Romania","rs":"Serbia","ru":"Russia","rw":"Rwanda","sa":"Saudi Arabia","sb":"Solomon Islands","sc":"Seychelles","sd":"Sudan","se":"Sweden","sg":"Singapore","si":"Slovenia","sk":"Slovakia","sl":"Sierra Leone","sn":"Senegal","so":"Somalia","sr":"Suriname","ss":"South Sudan","st":"São Tomé & Príncipe","sv":"El Salvador","sy":"Syria","sz":"Eswatini","td":"Chad","tg":"Togo","th":"Thailand","tj":"Tajikistan","tm":"Turkmenistan","tn":"Tunisia","tr":"Türkiye","tt":"Trinidad & Tobago","tw":"Taiwan","tz":"Tanzania","ua":"Ukraine","ug":"Uganda","us":"United States","uy":"Uruguay","uz":"Uzbekistan","vc":"St. Vincent & Grenadines","ve":"Venezuela","vn":"Vietnam","vu":"Vanuatu","ye":"Yemen","za":"South Africa","zm":"Zambia","zw":"Zimbabwe"};

// Converts a bounding box from the map SVG's own coordinate space (the
// same space latLngToMapPercent's svgX/svgY land in) into left/top/
// width/height percentages of the .hero-map box, using the same
// contain-fit geometry as the pins (6% inset/88% width; ~15.68% offset/
// 68.64% height, from the SVG's real letterboxed aspect ratio).
function svgBoxToMapPercent(box) {
  const VB = { minX: 30.767, minY: 241.591, width: 784.077, height: 458.627 };
  const fracX0 = (box.x - VB.minX) / VB.width;
  const fracX1 = (box.x + box.width - VB.minX) / VB.width;
  const fracY0 = (box.y - VB.minY) / VB.height;
  const fracY1 = (box.y + box.height - VB.minY) / VB.height;
  const left0 = 6 + fracX0 * 88;
  const left1 = 6 + fracX1 * 88;
  const top0 = 15.68 + fracY0 * 68.64;
  const top1 = 15.68 + fracY1 * 68.64;
  return {
    left: Math.min(left0, left1),
    top: Math.min(top0, top1),
    width: Math.abs(left1 - left0),
    height: Math.abs(top1 - top0),
  };
}

// Where the per-country state/province boundaries live: a static asset in
// this same repo (not a live external API), built once from Natural
// Earth's public-domain admin-1 dataset and heavily simplified so it's a
// ~1MB fetch instead of the original 12MB. Real lng/lat, so it reuses
// latLngToMapPercent() directly — no separate calibration needed.
const WORLD_STATES_URL = "/world-states.json";

async function initCountryZoom() {
  const mapEl = document.querySelector(".hero-map-interactive");
  if (!mapEl) return; // not on map.html
  const zoomLayer = mapEl.querySelector(".map-zoom-layer");
  const resetBtn = mapEl.querySelector(".map-zoom-reset");
  if (!zoomLayer) return;

  let svgText;
  let statesData = null;
  try {
    const [countryRes, statesRes] = await Promise.all([
      fetch(COUNTRY_MAP_SVG_URL, { cache: "force-cache" }),
      fetch(WORLD_STATES_URL, { cache: "force-cache" }).catch(() => null),
    ]);
    svgText = await countryRes.text();
    if (statesRes && statesRes.ok) {
      try {
        statesData = await statesRes.json();
      } catch (e) {
        statesData = null; // states just won't be available; country zoom still works
      }
    }
  } catch (e) {
    return; // no country hit-layer if the map source can't be fetched; base map + pins still work fine
  }

  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const source = parsed.documentElement;
  if (!source || source.querySelector("parsererror")) return;

  const svgNS = "http://www.w3.org/2000/svg";
  const overlay = document.createElementNS(svgNS, "svg");
  overlay.setAttribute("viewBox", source.getAttribute("viewBox"));
  overlay.setAttribute("preserveAspectRatio", "none");
  overlay.classList.add("country-hit-layer");

  // Each top-level <path id="xx"> or <g id="xx"> (multi-part countries
  // like archipelagos are grouped) becomes one clickable unit.
  [...source.children]
    .filter((el) => el.tagName === "path" || el.tagName === "g")
    .forEach((el) => {
      const clone = document.importNode(el, true);
      clone.classList.add("country-hit");
      overlay.appendChild(clone);
    });

  zoomLayer.appendChild(overlay);

  let activeId = null;

  // Multi-part countries (bundled into a <g>) sometimes include far-flung
  // overseas territories drawn as scattered specks alongside the mainland
  // (e.g. France's Pacific/Caribbean/Indian Ocean territories bundled with
  // mainland France) — left alone, that inflates the bounding box and
  // "zooms in" on nearly the whole map instead of the country. Rendering
  // each part to a tiny offscreen canvas and checking how much of its own
  // bounding box it actually fills tells a real landmass (mostly filled)
  // apart from scattered specks (a huge box that's almost all empty), so
  // those specks can be skipped when choosing which part to frame on.
  function pathFillRatio(pathEl, bbox) {
    const d = pathEl.getAttribute("d");
    if (!d || bbox.width <= 0 || bbox.height <= 0) return 1;
    const SAMPLE = 32;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext("2d");
    let path2d;
    try {
      path2d = new Path2D(d);
    } catch (e) {
      return 1;
    }
    ctx.save();
    ctx.scale(SAMPLE / bbox.width, SAMPLE / bbox.height);
    ctx.translate(-bbox.x, -bbox.y);
    ctx.fill(path2d);
    ctx.restore();
    const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
    let filled = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) filled++;
    return filled / (SAMPLE * SAMPLE);
  }

  function boxForUnit(unit) {
    const children = unit.tagName.toLowerCase() === "g" ? [...unit.children].filter((c) => c.tagName === "path") : [];
    if (children.length < 2) return unit.getBBox();
    const parts = children.map((child) => {
      const bbox = child.getBBox();
      return { bbox, ratio: pathFillRatio(child, bbox), area: bbox.width * bbox.height };
    });
    const solid = parts.filter((p) => p.ratio >= 0.02);
    const pool = solid.length ? solid : parts;
    pool.sort((a, b) => b.area - a.area);
    return pool[0].bbox;
  }

  // Currently-shown state/province layer for whichever country is zoomed
  // in, plus which state (if any) is further zoomed into. Both reset
  // together whenever the zoom backs all the way out to the world view.
  let stateLayer = null;
  let activeStateIdx = null;

  function clearStateLayer() {
    if (stateLayer) {
      stateLayer.remove();
      stateLayer = null;
    }
    activeStateIdx = null;
  }

  function resetZoom() {
    zoomLayer.style.transform = "";
    mapEl.classList.remove("is-zoomed");
    activeId = null;
    overlay.querySelectorAll(".country-hit.active").forEach((el) => el.classList.remove("active"));
    clearStateLayer();
  }

  // Takes an absolute box already in left/top/width/height percent-of-
  // hero-map (the same space pins and country hit-shapes live in) and
  // points the zoom at it. Used for both country-level and state-level
  // zooms, so drilling further into a state is just "zoom to a smaller
  // box in that same coordinate space" — no transform composition needed.
  function zoomToBox(box) {
    const centerLeft = box.left + box.width / 2;
    const centerTop = box.top + box.height / 2;
    // Scale so the target's longer side fills roughly half the frame,
    // clamped so tiny areas don't zoom in absurdly far and huge ones
    // still move.
    const scale = Math.min(10, Math.max(1.8, 55 / Math.max(box.width, box.height, 1)));
    const ox = centerLeft / 100;
    const oy = centerTop / 100;
    // transform-origin is fixed at 0,0 (see CSS), so translate the scaled
    // center point back to the visual middle of the frame ourselves.
    const tx = (0.5 - ox * scale) * 100;
    const ty = (0.5 - oy * scale) * 100;
    zoomLayer.style.transform = `translate(${tx}%, ${ty}%) scale(${scale})`;
    mapEl.classList.add("is-zoomed");
  }

  function zoomTo(unit) {
    zoomToBox(svgBoxToMapPercent(boxForUnit(unit)));
  }

  // Turns one ring of [lng, lat] points (already simplified, real-world
  // degrees) into an SVG path's "d" data, reusing latLngToMapPercent so
  // every point lands exactly where the pins/country outlines would.
  function ringToPathData(ring) {
    return (
      "M " +
      ring
        .map(([lng, lat]) => {
          const { left, top } = latLngToMapPercent(lat, lng);
          return `${left.toFixed(2)} ${top.toFixed(2)}`;
        })
        .join(" L ") +
      " Z"
    );
  }

  function stateBoxFromRings(rings) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rings.forEach((ring) =>
      ring.forEach(([lng, lat]) => {
        const { left, top } = latLngToMapPercent(lat, lng);
        if (left < minX) minX = left;
        if (left > maxX) maxX = left;
        if (top < minY) minY = top;
        if (top > maxY) maxY = top;
      })
    );
    return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
  }

  // Draws the clicked country's states/provinces on top of it. The paths
  // use percent-of-hero-map coordinates directly (viewBox "0 0 100 100"),
  // so no letterbox math is needed the way the world-map hit-layer needs —
  // latLngToMapPercent already did that work per point.
  function showStatesFor(countryId) {
    clearStateLayer();
    const states = statesData && statesData[countryId];
    if (!states || !states.length) return;

    const layer = document.createElementNS(svgNS, "svg");
    layer.setAttribute("viewBox", "0 0 100 100");
    layer.setAttribute("preserveAspectRatio", "none");
    layer.classList.add("state-hit-layer");

    states.forEach((state, idx) => {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", state.r.map(ringToPathData).join(" "));
      path.classList.add("state-hit");
      const label = state.n || state.c || `Region ${idx + 1}`;
      path.setAttribute("role", "button");
      path.setAttribute("tabindex", "0");
      path.setAttribute("aria-label", `Zoom to ${label}`);
      const titleEl = document.createElementNS(svgNS, "title");
      titleEl.textContent = label;
      path.appendChild(titleEl);

      function toggle() {
        if (activeStateIdx === idx) {
          // Clicking the already-zoomed state again backs all the way
          // out to the world view, matching the country-level toggle.
          resetZoom();
          return;
        }
        layer.querySelectorAll(".state-hit.active").forEach((el) => el.classList.remove("active"));
        path.classList.add("active");
        activeStateIdx = idx;
        zoomToBox(stateBoxFromRings(state.r));
      }

      path.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle();
      });
      path.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });

      layer.appendChild(path);
    });

    zoomLayer.appendChild(layer);
    stateLayer = layer;
  }

  overlay.querySelectorAll(".country-hit").forEach((unit) => {
    const id = unit.getAttribute("id");
    const label = COUNTRY_NAMES[id] || id;

    unit.setAttribute("role", "button");
    unit.setAttribute("tabindex", "0");
    unit.setAttribute("aria-label", `Zoom to ${label}`);
    const titleEl = document.createElementNS(svgNS, "title");
    titleEl.textContent = label;
    unit.insertBefore(titleEl, unit.firstChild);

    function toggle() {
      if (activeId === id) {
        resetZoom();
        return;
      }
      overlay.querySelectorAll(".country-hit.active").forEach((el) => el.classList.remove("active"));
      unit.classList.add("active");
      activeId = id;
      zoomTo(unit);
      showStatesFor(id);
    }

    unit.addEventListener("click", toggle);
    unit.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });

  if (resetBtn) resetBtn.addEventListener("click", resetZoom);
}

let API_OFFLINE_WARNED = false;
function warnOffline() {
  if (API_OFFLINE_WARNED) return;
  API_OFFLINE_WARNED = true;
  console.warn("Every Block Has a Story: couldn't reach the backend at " + API_BASE + ". No stories to show right now.");
}

// ---------- API client (real backend, with graceful offline fallback) ----------
const API = {
  async listStories() {
    try {
      // apiFetch (not plain fetch) so a logged-in viewer's Authorization
      // token comes along, and the backend can return accurate liked/saved
      // flags for them on each story.
      const res = await apiFetch("/api/videos");
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      const realVideos = (data.videos || []).map(videoToStoryShape);
      return [...realVideos, ...STORIES];
    } catch (e) {
      warnOffline();
      return STORIES;
    }
  },
  async getStory(id) {
    if (String(id).startsWith("v_")) {
      const realId = String(id).slice(2);
      try {
        const res = await apiFetch("/api/videos");
        if (!res.ok) throw new Error("bad status");
        const data = await res.json();
        const v = (data.videos || []).find((x) => x.id === realId);
        return v ? videoToStoryShape(v) : null;
      } catch (e) {
        warnOffline();
        return null;
      }
    }
    return STORIES.find((s) => s.id === id) || null;
  },
};

// ---------- Story card rendering ----------
function storyCardHTML(s) {
  const initials = (s.author || "?").split(" ").map((p) => p[0]).slice(0, 2).join("");
  const media = s.thumbnailUrl
    ? `<div class="story-media-fallback" style="background-image:url('${escapeAttr(s.thumbnailUrl)}'); background-size:cover; background-position:center;"></div>`
    : `<div class="story-media-fallback" style="background: linear-gradient(135deg, hsl(${s.hue || 30} 45% 22%), var(--ink-soft));"></div>`;
  return `
  <a class="story-card" href="story.html?id=${encodeURIComponent(s.id)}" data-country="${escapeAttr(s.country || "")}">
    ${media}
    <span class="story-loc">${pinIcon()} ${escapeHtml(s.location || "")}</span>
    <span class="play-badge">${playIcon()}</span>
    <div class="story-body">
      <h3>${escapeHtml(s.title || "Untitled Story")}</h3>
      <div class="story-user">
        <span class="avatar">${escapeHtml(initials)}</span>
        <span>${escapeHtml(s.author || "Anonymous")}</span>
      </div>
    </div>
  </a>`;
}

async function renderAllStoryGrids() {
  const grids = document.querySelectorAll("[data-story-grid]");
  if (!grids.length) return;
  const stories = await API.listStories();
  grids.forEach((grid) => {
    const limit = parseInt(grid.getAttribute("data-limit") || "0", 10);
    let list = stories;
    if (limit) list = list.slice(0, limit);
    grid.innerHTML = list.map(storyCardHTML).join("");
  });
}

function filterStories(country) {
  document.querySelectorAll(".story-card").forEach((card) => {
    const show = country === "all" || card.getAttribute("data-country") === country;
    card.style.display = show ? "" : "none";
  });
  document.querySelectorAll(".chip[data-filter]").forEach((chip) => {
    chip.classList.toggle("active", chip.getAttribute("data-filter") === country);
  });
}

function wireCarousel() {
  const grid = document.querySelector("[data-story-grid][data-scrollable]");
  const next = document.querySelector("[data-carousel-next]");
  if (grid && next) {
    next.addEventListener("click", () => {
      grid.scrollBy({ left: 300, behavior: "smooth" });
    });
  }
}

// ---------- Small icon helpers (inline SVG) ----------
function pinIcon() {
  return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-7.4 8-13a8 8 0 1 0-16 0c0 5.6 8 13 8 13z"/><circle cx="12" cy="9" r="2.5"/></svg>`;
}
function playIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
}
function heartIcon(filled) {
  const fillAttr = filled ? "currentColor" : "none";
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="${fillAttr}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.6-10-9.3C.5 8.4 2 4.5 5.6 4c2-.3 3.8.6 4.9 2.2C11.6 4.6 13.4 3.7 15.4 4c3.6.5 5.1 4.4 3.6 7.7C21.5 16.4 12 21 12 21z"/></svg>`;
}
function bookmarkIcon(filled) {
  const fillAttr = filled ? "currentColor" : "none";
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="${fillAttr}" stroke="currentColor" stroke-width="2"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>`;
}
function shareIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function escapeAttr(str) { return escapeHtml(str); }

// ---------- Toast ----------
function showToast(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

// ---------- Local "who am I" cache (display only — the real account lives
// server-side; this just remembers a name/email to show in the banner) ----------
function getAccount() {
  try { return JSON.parse(localStorage.getItem("ebs_account") || "null"); }
  catch (e) { return null; }
}
function saveAccountCache(acct) { localStorage.setItem("ebs_account", JSON.stringify(acct)); }
function clearAccountCache() { localStorage.removeItem("ebs_account"); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

// ---------- Account + Shopify purchase gate for Share Your Story ----------
function initShareGate() {
  const banner = document.getElementById("member-banner");
  const memberNameEl = document.getElementById("member-name");
  const switchAccountLink = document.getElementById("switch-account");
  const accountGate = document.getElementById("account-gate");
  const unlockGate = document.getElementById("unlock-gate");
  const form = document.getElementById("share-form");
  const createAccountBtn = document.getElementById("create-account-btn");
  const acctNameInput = document.getElementById("acct-name");
  const acctEmailInput = document.getElementById("acct-email");
  const acctPasswordInput = document.getElementById("acct-password");
  const unlockBtn = document.getElementById("unlock-btn");
  const codeInput = document.getElementById("order-code"); // now holds a Shopify order number
  if (!accountGate || !unlockGate || !form || !createAccountBtn || !unlockBtn) return;

  function showStep(step) {
    accountGate.style.display = step === "account" ? "block" : "none";
    unlockGate.style.display = step === "unlock" ? "block" : "none";
    form.style.display = step === "form" ? "block" : "none";
    const successPanel = document.getElementById("post-success");
    if (successPanel && step !== "form") successPanel.style.display = "none";
    if (banner) banner.style.display = step === "form" ? "flex" : "none";
  }

  // Checks the real backend: are we logged in, and is this account
  // Shopify-verified? Both facts live server-side, not in localStorage.
  async function renderFromState() {
    const { access } = getTokens();
    if (!access) { showStep("account"); return; }

    try {
      const res = await apiFetch("/api/auth/session");
      if (!res.ok) {
        clearTokens();
        showStep("account");
        return;
      }
      const data = await res.json();
      if (memberNameEl) memberNameEl.textContent = data.profile.name || data.user.email;
      saveAccountCache({ name: data.profile.name, email: data.user.email });

      if (data.profile.shopify_verified) {
        form.dataset.verified = "true";
        showStep("form");
      } else {
        showStep("unlock");
      }
    } catch (err) {
      showToast("Couldn't reach the server — check your connection and try again.");
      showStep("account");
    }
  }

  createAccountBtn.addEventListener("click", async () => {
    const name = (acctNameInput.value || "").trim();
    const email = (acctEmailInput.value || "").trim();
    const password = (acctPasswordInput ? acctPasswordInput.value : "").trim();
    if (!name) {
      showToast("Enter your name to create an account.");
      acctNameInput.focus();
      return;
    }
    if (!isValidEmail(email)) {
      showToast("Enter a valid email to create an account.");
      acctEmailInput.focus();
      return;
    }
    if (password.length < 8) {
      showToast("Password must be at least 8 characters.");
      if (acctPasswordInput) acctPasswordInput.focus();
      return;
    }

    const originalLabel = createAccountBtn.textContent;
    createAccountBtn.disabled = true;
    createAccountBtn.textContent = "Creating…";
    try {
      // Try creating a new account first; if one already exists for this
      // email, fall back to logging in with the same email/password.
      let res = await fetch(API_BASE + "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      let data = await res.json();

      if (!res.ok) {
        res = await fetch(API_BASE + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't create or sign into that account.");
      }

      if (!data.session) {
        throw new Error("Check your email to confirm your account, then enter your password again to sign in.");
      }

      saveTokens(data.session);
      saveAccountCache({ name, email });
      showToast("Signed in — welcome, " + name + "!");
      await renderFromState();
    } catch (err) {
      showToast(err.message || "Couldn't create account.");
    } finally {
      createAccountBtn.disabled = false;
      createAccountBtn.textContent = originalLabel;
    }
  });

  unlockBtn.addEventListener("click", async () => {
    const orderNumber = (codeInput.value || "").trim();
    if (!orderNumber) {
      showToast("Enter your Shopify order number to continue.");
      codeInput.focus();
      return;
    }
    const originalLabel = unlockBtn.textContent;
    unlockBtn.disabled = true;
    unlockBtn.textContent = "Verifying…";
    try {
      const res = await apiFetch("/api/shopify/verify-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't verify your order.");
      if (!data.verified) throw new Error(data.reason || "That order couldn't be verified.");

      showToast("Order verified — tell your story below.");
      await renderFromState();
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      showToast(err.message || "Couldn't verify your order.");
    } finally {
      unlockBtn.disabled = false;
      unlockBtn.textContent = originalLabel;
    }
  });

  if (switchAccountLink) {
    switchAccountLink.addEventListener("click", (e) => {
      e.preventDefault();
      clearTokens();
      clearAccountCache();
      acctNameInput.value = "";
      acctEmailInput.value = "";
      if (acctPasswordInput) acctPasswordInput.value = "";
      codeInput.value = "";
      showStep("account");
      showToast("Signed out on this browser.");
    });
  }

  [acctNameInput, acctEmailInput, acctPasswordInput].forEach((el) => {
    if (!el) return;
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); createAccountBtn.click(); } });
  });
  if (codeInput) {
    codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); unlockBtn.click(); } });
  }

  renderFromState();
}

// ---------- Share form (real Cloudflare Stream upload) ----------
function initShareForm() {
  const form = document.getElementById("share-form");
  if (!form) return;
  const fileInput = document.getElementById("video-file");
  const dropzone = document.getElementById("dropzone");
  const preview = document.getElementById("video-preview");
  const thumbInput = document.getElementById("thumbnail-file");
  const thumbDropzone = document.getElementById("thumb-dropzone");
  const thumbPreview = document.getElementById("thumbnail-preview");
  const successPanel = document.getElementById("post-success");
  const postCountLine = document.getElementById("post-count-line");
  const postAnotherBtn = document.getElementById("post-another-btn");
  const submitBtn = form.querySelector('button[type="submit"]');

  function resetForm() {
    form.reset();
    dropzone.classList.remove("has-file");
    dropzone.querySelector(".dz-text").textContent = "Drag & drop a video, or click to browse";
    preview.style.display = "none";
    preview.removeAttribute("src");
    if (thumbDropzone) {
      thumbDropzone.classList.remove("has-file");
      thumbDropzone.querySelector(".dz-text").textContent = "Drag & drop an image, or click to browse";
    }
    if (thumbPreview) {
      thumbPreview.style.display = "none";
      thumbPreview.removeAttribute("src");
    }
  }

  if (postAnotherBtn) {
    postAnotherBtn.addEventListener("click", () => {
      resetForm();
      if (successPanel) successPanel.style.display = "none";
      form.style.display = "block";
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("has-file"); });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleFile(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  function handleFile(file) {
    dropzone.classList.add("has-file");
    dropzone.querySelector(".dz-text").textContent = `Selected: ${file.name}`;
    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      preview.src = url;
      preview.style.display = "block";
    }
  }

  if (thumbDropzone && thumbInput) {
    thumbDropzone.addEventListener("click", () => thumbInput.click());
    thumbDropzone.addEventListener("dragover", (e) => { e.preventDefault(); thumbDropzone.classList.add("has-file"); });
    thumbDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) {
        thumbInput.files = e.dataTransfer.files;
        handleThumbFile(e.dataTransfer.files[0]);
      }
    });
    thumbInput.addEventListener("change", () => {
      if (thumbInput.files.length) handleThumbFile(thumbInput.files[0]);
    });
  }

  function handleThumbFile(file) {
    thumbDropzone.classList.add("has-file");
    thumbDropzone.querySelector(".dz-text").textContent = `Selected: ${file.name}`;
    if (file.type.startsWith("image/") && thumbPreview) {
      try {
        thumbPreview.src = URL.createObjectURL(file);
        thumbPreview.style.display = "block";
      } catch (err) {
        // Preview is a nice-to-have — if it fails for any reason, the file
        // is still attached and will still upload fine on submit.
        console.warn("Couldn't generate thumbnail preview:", err);
      }
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!form.dataset.verified) {
      showToast("Please verify your Shopify order before posting.");
      return;
    }

    const title = document.getElementById("story-title").value.trim();
    const caption = document.getElementById("story-caption").value.trim();
    const location = document.getElementById("story-location").value.trim();
    const country = document.getElementById("story-country").value.trim();
    const author = document.getElementById("story-author").value.trim() || "Anonymous";
    const file = fileInput.files[0];

    if (!title || !caption || !location) {
      showToast("Please fill in a title, location, and caption.");
      return;
    }
    if (!file) {
      showToast("A video is required to post — attach one above.");
      return;
    }

    const originalLabel = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Getting upload link…"; }

    try {
      // 1. Ask our backend for a one-time Cloudflare Stream upload URL.
      const urlRes = await apiFetch("/api/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error || "Couldn't start the upload.");
      if (!urlData.uploadURL) {
        throw new Error("The server didn't return an upload address. Check the backend's Cloudflare Stream settings and try again.");
      }

      // 2. Upload the video file straight to Cloudflare — never through our own server.
      if (submitBtn) submitBtn.textContent = "Uploading video…";
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const uploadRes = await fetch(urlData.uploadURL, { method: "POST", body: uploadForm });
      if (!uploadRes.ok) throw new Error("Video upload failed — try a smaller file or a different format.");

      // 2b. If a custom thumbnail was chosen, upload it too. If not, we
      // simply don't send a thumbnailUrl — the backend defaults to a frame
      // from 2 seconds into the video automatically.
      let thumbnailUrl = null;
      const thumbFile = thumbInput && thumbInput.files[0];
      if (thumbFile) {
        if (submitBtn) submitBtn.textContent = "Uploading thumbnail…";
        const thumbForm = new FormData();
        thumbForm.append("thumbnail", thumbFile);
        const thumbRes = await apiFetch("/api/videos/thumbnail-upload", { method: "POST", body: thumbForm });
        const thumbData = await thumbRes.json();
        if (!thumbRes.ok) throw new Error(thumbData.error || "Couldn't upload thumbnail.");
        thumbnailUrl = thumbData.thumbnailUrl;
      }

      // 3. Save the story's details, linked to that uploaded video.
      if (submitBtn) submitBtn.textContent = "Posting…";
      const saveRes = await apiFetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloudflareUid: urlData.uid, title, caption, location, country, author, thumbnailUrl }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || "Couldn't save your story.");

      showToast("Your story is submitted!");
      if (postCountLine) {
        postCountLine.textContent = "Thanks for sharing — new videos are reviewed before they appear publicly, so it may take a little while to show up.";
      }

      resetForm();
      form.style.display = "none";
      if (successPanel) {
        successPanel.style.display = "block";
        successPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      renderAllStoryGrids();
    } catch (err) {
      showToast(err.message || "Couldn't post your story.");
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
    }
  });
}

// ---------- Shop / real Shopify checkout ----------
// Every Block Tee — live product on the connected Shopify store.
// Cart permalinks (https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks)
// send the buyer straight to a real Shopify checkout for the chosen variant —
// no app or backend required on this site's end.
const SHOPIFY_STORE_DOMAIN = "everybodyhasastory.myshopify.com";
const SHOPIFY_VARIANTS = {
  "S": "55093238268223",
  "M": "55093238300991",
  "L": "55093238333759",
  "XL": "55093238366527",
  "2XL": "55093238399295",
};

function initShop() {
  const swatches = document.querySelectorAll(".size-swatch");
  let selectedSize = "M";
  swatches.forEach((sw) => {
    sw.addEventListener("click", () => {
      swatches.forEach((s) => s.classList.remove("selected"));
      sw.classList.add("selected");
      selectedSize = sw.textContent.trim();
    });
  });

  const buyBtn = document.getElementById("buy-btn");
  if (buyBtn) {
    buyBtn.addEventListener("click", () => {
      const variantId = SHOPIFY_VARIANTS[selectedSize];
      if (!variantId) {
        showToast("That size isn't available right now.");
        return;
      }
      window.location.href = `https://${SHOPIFY_STORE_DOMAIN}/cart/${variantId}:1`;
    });
  }
}

// ---------- Account nav link (every page) ----------
// Shows "Log In" when signed out, or the user's name once we've confirmed
// a real session with the backend. Safe to call on every page — it no-ops
// if there's no #nav-account-link element or no stored token.
function initAccountNav() {
  const link = document.getElementById("nav-account-link");
  if (!link) return;
  const { access } = getTokens();
  if (!access) { link.textContent = "Log In"; return; }

  apiFetch("/api/auth/session")
    .then(async (res) => {
      if (!res.ok) { clearTokens(); link.textContent = "Log In"; return; }
      const data = await res.json();
      link.textContent = data.profile.name || "My Account";
    })
    .catch(() => { link.textContent = "Log In"; });
}

// ---------- My Account page ----------
function initAccountPage() {
  const loggedOutView = document.getElementById("account-logged-out");
  const loggedInView = document.getElementById("account-logged-in");
  if (!loggedOutView || !loggedInView) return; // not on account.html

  const heroTitle = document.getElementById("account-hero-title");
  const heroSub = document.getElementById("account-hero-sub");
  const nameInput = document.getElementById("acct-page-name");
  const emailInput = document.getElementById("acct-page-email");
  const passwordInput = document.getElementById("acct-page-password");
  const submitBtn = document.getElementById("acct-page-submit");

  const nameEl = document.getElementById("account-name");
  const emailEl = document.getElementById("account-email");
  const verifiedEl = document.getElementById("account-verified");
  const myStoriesGrid = document.getElementById("my-stories-grid");
  const myStoriesEmpty = document.getElementById("my-stories-empty");
  const savedStoriesGrid = document.getElementById("saved-stories-grid");
  const savedStoriesEmpty = document.getElementById("saved-stories-empty");
  const viewProfileLink = document.getElementById("view-public-profile-link");
  const logoutBtn = document.getElementById("logout-btn");

  function showLoggedOut() {
    loggedOutView.style.display = "block";
    loggedInView.style.display = "none";
    if (heroTitle) heroTitle.textContent = "Log In or Create an Account";
    if (heroSub) heroSub.textContent = "Sign in to check your verification status and see the stories you've posted.";
  }
  function showLoggedIn(name) {
    loggedOutView.style.display = "none";
    loggedInView.style.display = "block";
    if (heroTitle) heroTitle.textContent = "Welcome back" + (name ? ", " + name : "");
    if (heroSub) heroSub.textContent = "Here's your account and everything you've shared.";
  }

  async function renderState() {
    const { access } = getTokens();
    if (!access) { showLoggedOut(); return; }

    try {
      const res = await apiFetch("/api/auth/session");
      if (!res.ok) { clearTokens(); showLoggedOut(); return; }
      const data = await res.json();

      showLoggedIn(data.profile.name);
      if (nameEl) nameEl.textContent = data.profile.name || "—";
      if (emailEl) emailEl.textContent = data.user.email;
      if (verifiedEl) {
        verifiedEl.textContent = data.profile.shopify_verified
          ? "✓ Verified shirt owner"
          : "Not verified yet — verify an order on the Share Your Story page.";
        verifiedEl.style.color = data.profile.shopify_verified ? "var(--olive-light, #9db07a)" : "var(--cream-dim)";
      }
      saveAccountCache({ name: data.profile.name, email: data.user.email });

      const link = document.getElementById("nav-account-link");
      if (link) link.textContent = data.profile.name || "My Account";
      if (viewProfileLink && data.user?.id) {
        viewProfileLink.href = "profile.html?id=" + encodeURIComponent(data.user.id);
      }

      await renderMyStories();
      await renderSavedStories();
    } catch (err) {
      showToast("Couldn't reach the server — check your connection and try again.");
      showLoggedOut();
    }
  }

  async function renderMyStories() {
    if (!myStoriesGrid) return;
    myStoriesGrid.innerHTML = "";
    if (myStoriesEmpty) myStoriesEmpty.style.display = "none";
    try {
      const res = await apiFetch("/api/videos/mine");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load your stories.");
      const videos = data.videos || [];
      if (!videos.length) {
        if (myStoriesEmpty) {
          myStoriesEmpty.textContent = "You haven't posted any stories yet.";
          myStoriesEmpty.style.display = "block";
        }
        return;
      }
      myStoriesGrid.innerHTML = videos.map(myStoryCardHTML).join("");
      wireDeleteButtons();
    } catch (err) {
      if (myStoriesEmpty) {
        myStoriesEmpty.textContent = "Couldn't load your stories right now.";
        myStoriesEmpty.style.display = "block";
      }
    }
  }

  function wireDeleteButtons() {
    myStoriesGrid.querySelectorAll(".delete-story-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const title = btn.getAttribute("data-title") || "this story";
        if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;

        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Deleting…";
        try {
          const res = await apiFetch("/api/videos/" + encodeURIComponent(id), { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Couldn't delete that story.");

          showToast("Story deleted.");
          await renderMyStories();
          // Refresh anywhere else the story might have been visible.
          renderAllStoryGrids();
          renderMapPins();
        } catch (err) {
          showToast(err.message || "Couldn't delete that story.");
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      });
    });
  }

  async function renderSavedStories() {
    if (!savedStoriesGrid) return;
    savedStoriesGrid.innerHTML = "";
    if (savedStoriesEmpty) savedStoriesEmpty.style.display = "none";
    try {
      const res = await apiFetch("/api/videos/saved");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load saved stories.");
      const videos = data.videos || [];
      if (!videos.length) {
        if (savedStoriesEmpty) {
          savedStoriesEmpty.textContent = "You haven't saved any stories yet.";
          savedStoriesEmpty.style.display = "block";
        }
        return;
      }
      savedStoriesGrid.innerHTML = videos.map(savedStoryCardHTML).join("");
      wireUnsaveButtons();
    } catch (err) {
      if (savedStoriesEmpty) {
        savedStoriesEmpty.textContent = "Couldn't load saved stories right now.";
        savedStoriesEmpty.style.display = "block";
      }
    }
  }

  function wireUnsaveButtons() {
    savedStoriesGrid.querySelectorAll(".unsave-story-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        btn.disabled = true;
        const originalLabel = btn.textContent;
        btn.textContent = "Removing…";
        try {
          // /save is a toggle — since this card only shows already-saved
          // stories, calling it again removes it.
          const res = await apiFetch("/api/videos/" + encodeURIComponent(id) + "/save", { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Couldn't unsave that story.");
          await renderSavedStories();
        } catch (err) {
          showToast(err.message || "Couldn't unsave that story.");
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      });
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const name = (nameInput.value || "").trim();
      const email = (emailInput.value || "").trim();
      const password = (passwordInput.value || "").trim();

      if (!isValidEmail(email)) {
        showToast("Enter a valid email.");
        emailInput.focus();
        return;
      }
      if (password.length < 8) {
        showToast("Password must be at least 8 characters.");
        passwordInput.focus();
        return;
      }

      const originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Signing in…";
      try {
        // Same pattern as Share Your Story: try creating an account first,
        // fall back to logging in if one already exists for this email.
        let res = await fetch(API_BASE + "/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name || email.split("@")[0], email, password }),
        });
        let data = await res.json();

        if (!res.ok) {
          res = await fetch(API_BASE + "/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          data = await res.json();
          if (!res.ok) throw new Error(data.error || "Couldn't create or sign into that account.");
        }

        if (!data.session) {
          throw new Error("Check your email to confirm your account, then enter your password again to log in.");
        }

        saveTokens(data.session);
        showToast("Signed in!");
        await renderState();
      } catch (err) {
        showToast(err.message || "Couldn't sign in.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }

  [nameInput, emailInput, passwordInput].forEach((el) => {
    if (!el) return;
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submitBtn.click(); } });
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try { await apiFetch("/api/auth/logout", { method: "POST" }); } catch (e) { /* stateless — fine either way */ }
      clearTokens();
      clearAccountCache();
      const link = document.getElementById("nav-account-link");
      if (link) link.textContent = "Log In";
      showToast("Logged out.");
      showLoggedOut();
    });
  }

  renderState();
}

function myStoryCardHTML(v) {
  const labels = { pending: "Pending review", approved: "Live", rejected: "Not approved" };
  const colors = { pending: "var(--gold)", approved: "var(--olive-light, #9db07a)", rejected: "var(--orange)" };
  const statusLabel = labels[v.status] || v.status;
  const statusColor = colors[v.status] || "var(--cream-dim)";
  const media = v.thumbnailUrl
    ? `background-image:url('${escapeAttr(v.thumbnailUrl)}'); background-size:cover; background-position:center;`
    : `background: linear-gradient(135deg, #333, var(--ink-soft));`;
  const title = escapeHtml(v.title || "Untitled Story");
  const viewBtn = v.status === "approved"
    ? `<a href="story.html?id=v_${encodeURIComponent(v.id)}" class="btn btn-outline" style="flex:1; padding:8px; font-size:0.8rem; text-align:center;">View</a>`
    : "";

  // Not wrapping the whole card in an <a> here (unlike the public story
  // grids) since it also needs a Delete button — nesting a button inside
  // an anchor is invalid HTML and clicks behave unreliably across browsers.
  return `
  <div class="story-card" style="cursor:default;">
    <div class="story-media-fallback" style="${media}"></div>
    <span class="story-loc" style="background:${statusColor}; color:#14140f; font-weight:700;">${escapeHtml(statusLabel)}</span>
    <div class="story-body">
      <h3>${title}</h3>
      <div class="story-user"><span>${escapeHtml(v.location || "")}</span></div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        ${viewBtn}
        <button type="button" class="btn btn-outline delete-story-btn" data-id="${escapeAttr(v.id)}" data-title="${escapeAttr(v.title || "this story")}" style="flex:1; padding:8px; font-size:0.8rem; border-color:var(--orange); color:var(--orange);">Delete</button>
      </div>
    </div>
  </div>`;
}

function savedStoryCardHTML(v) {
  const media = v.thumbnailUrl
    ? `background-image:url('${escapeAttr(v.thumbnailUrl)}'); background-size:cover; background-position:center;`
    : `background: linear-gradient(135deg, hsl(${v.hue || 30} 45% 22%), var(--ink-soft));`;
  return `
  <div class="story-card" style="cursor:default;">
    <div class="story-media-fallback" style="${media}"></div>
    <span class="story-loc">${pinIcon()} ${escapeHtml(v.location || "")}</span>
    <div class="story-body">
      <h3>${escapeHtml(v.title || "Untitled Story")}</h3>
      <div class="story-user"><span>${escapeHtml(v.author || "Anonymous")}</span></div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <a href="story.html?id=v_${encodeURIComponent(v.id)}" class="btn btn-outline" style="flex:1; padding:8px; font-size:0.8rem; text-align:center;">View</a>
        <button type="button" class="btn btn-outline unsave-story-btn" data-id="${escapeAttr(v.id)}" style="flex:1; padding:8px; font-size:0.8rem; border-color:var(--orange); color:var(--orange);">Unsave</button>
      </div>
    </div>
  </div>`;
}

// ---------- Like / Save / Share on a story page ----------
function initStoryEngagement(realId, story) {
  const likeBtn = document.getElementById("like-btn");
  const saveBtn = document.getElementById("save-btn");
  const shareBtn = document.getElementById("share-btn");
  if (!likeBtn || !saveBtn || !shareBtn) return; // not on story.html, or markup missing

  const likeIconEl = document.getElementById("like-icon");
  const likeCountEl = document.getElementById("like-count");
  const saveIconEl = document.getElementById("save-icon");
  const shareCountEl = document.getElementById("share-count");
  const shareIconEl = document.getElementById("share-icon");
  if (shareIconEl) shareIconEl.innerHTML = shareIcon();

  let liked = !!story.liked;
  let saved = !!story.saved;
  let likeCount = story.likeCount || 0;
  let shareCount = story.shareCount || 0;

  function renderLike() {
    if (likeIconEl) likeIconEl.innerHTML = heartIcon(liked);
    if (likeCountEl) likeCountEl.textContent = likeCount;
    likeBtn.classList.toggle("engagement-active", liked);
  }
  function renderSave() {
    if (saveIconEl) saveIconEl.innerHTML = bookmarkIcon(saved);
    saveBtn.classList.toggle("engagement-active", saved);
  }
  function renderShare() {
    if (shareCountEl) shareCountEl.textContent = shareCount;
  }
  renderLike();
  renderSave();
  renderShare();

  likeBtn.addEventListener("click", async () => {
    const { access } = getTokens();
    if (!access) { showToast("Log in to like stories."); return; }
    likeBtn.disabled = true;
    try {
      const res = await apiFetch("/api/videos/" + encodeURIComponent(realId) + "/like", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update like.");
      liked = data.liked;
      likeCount = data.likeCount;
      renderLike();
    } catch (err) {
      showToast(err.message || "Couldn't update like.");
    } finally {
      likeBtn.disabled = false;
    }
  });

  saveBtn.addEventListener("click", async () => {
    const { access } = getTokens();
    if (!access) { showToast("Log in to save stories."); return; }
    saveBtn.disabled = true;
    try {
      const res = await apiFetch("/api/videos/" + encodeURIComponent(realId) + "/save", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update save.");
      saved = data.saved;
      renderSave();
      showToast(saved ? "Saved to your account." : "Removed from saved.");
    } catch (err) {
      showToast(err.message || "Couldn't update save.");
    } finally {
      saveBtn.disabled = false;
    }
  });

  shareBtn.addEventListener("click", async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: story.title || "Every Block Has a Story", url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showToast("Link copied.");
      }
    } catch (e) {
      // User cancelled the native share sheet, or clipboard was blocked —
      // not worth surfacing as an error.
    }
    try {
      const res = await fetch(API_BASE + "/api/videos/" + encodeURIComponent(realId) + "/share", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.shareCount === "number") {
        shareCount = data.shareCount;
        renderShare();
      }
    } catch (e) {
      // Non-fatal — the share itself (if it happened) already succeeded.
    }
  });
}

// ---------- Comments on a story page ----------
// "Live" in the sense of auto-refreshing — polls for new comments every
// few seconds while the page is open, no manual reload needed. Any
// logged-in account can comment; no purchase verification required (that's
// only for posting a story itself).
let __commentsPollTimer = null;

async function initStoryComments(videoId) {
  const section = document.getElementById("story-comments-section");
  if (!section || !videoId) return;
  section.style.display = "block";

  const listEl = document.getElementById("comments-list");
  const emptyEl = document.getElementById("comments-empty");
  const loggedInBox = document.getElementById("comment-form-logged-in");
  const loggedOutBox = document.getElementById("comment-form-logged-out");
  const input = document.getElementById("comment-input");
  const submitBtn = document.getElementById("comment-submit-btn");

  let currentUserId = null;

  function renderComments(comments) {
    if (!listEl) return;
    if (!comments.length) {
      listEl.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";
    listEl.innerHTML = comments.map((c) => commentHTML(c, currentUserId)).join("");
    wireCommentDeleteButtons();
  }

  function wireCommentDeleteButtons() {
    listEl.querySelectorAll(".delete-comment-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (!window.confirm("Delete this comment? This can't be undone.")) return;
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Deleting…";
        try {
          const res = await apiFetch("/api/comments/" + encodeURIComponent(id), { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Couldn't delete that comment.");
          await loadComments();
        } catch (err) {
          showToast(err.message || "Couldn't delete that comment.");
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      });
    });
  }

  async function loadComments() {
    try {
      const res = await fetch(API_BASE + "/api/videos/" + encodeURIComponent(videoId) + "/comments");
      if (!res.ok) return;
      const data = await res.json();
      renderComments(data.comments || []);
    } catch (e) {
      // Silent — a failed poll just keeps showing the last known comments.
    }
  }

  const { access } = getTokens();
  if (loggedInBox) loggedInBox.style.display = access ? "block" : "none";
  if (loggedOutBox) loggedOutBox.style.display = access ? "none" : "block";

  if (access) {
    try {
      const res = await apiFetch("/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        currentUserId = data.user.id;
      }
    } catch (e) {
      // If this fails, comments just won't show a Delete option — not fatal.
    }
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const text = (input.value || "").trim();
      if (!text) {
        showToast("Write something first.");
        return;
      }
      const originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Posting…";
      try {
        const res = await apiFetch("/api/videos/" + encodeURIComponent(videoId) + "/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't post your comment.");
        input.value = "";
        await loadComments();
      } catch (err) {
        showToast(err.message || "Couldn't post your comment.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }

  await loadComments();

  if (__commentsPollTimer) clearInterval(__commentsPollTimer);
  __commentsPollTimer = setInterval(loadComments, 6000);
}

function commentHTML(c, currentUserId) {
  const initials = (c.author || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  let when = "";
  try { when = new Date(c.created_at).toLocaleString(); } catch (e) { when = ""; }
  const isMine = currentUserId && c.profile_id === currentUserId;
  const deleteLink = isMine
    ? `<button type="button" class="delete-comment-btn" data-id="${escapeAttr(c.id)}" style="background:none; border:none; color:var(--orange); font-size:0.8rem; font-weight:600; cursor:pointer; padding:0;">Delete</button>`
    : "";
  return `
  <div style="border-bottom:1px solid var(--line); padding-bottom:14px;">
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
      <span class="avatar" style="width:30px; height:30px; font-size:0.75rem;">${escapeHtml(initials)}</span>
      <strong style="font-size:0.9rem;">${escapeHtml(c.author || "Anonymous")}</strong>
      <span style="color:var(--cream-dim); font-size:0.8rem;">${escapeHtml(when)}</span>
      ${deleteLink ? `<span style="margin-left:auto;">${deleteLink}</span>` : ""}
    </div>
    <p style="color:var(--cream-dim); margin:0; font-size:0.95rem; line-height:1.5;">${escapeHtml(c.body || "")}</p>
  </div>`;
}
